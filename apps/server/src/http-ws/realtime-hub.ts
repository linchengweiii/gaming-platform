import type http from "node:http";
import type { Duplex } from "node:stream";
import {
  ABANDONED_ROOM_IDLE_MS,
  SEVEN_WONDERS_SECRET_LOCK_MAX_DELAY_MS,
  WS_DEAD_PEER_TIMEOUT_MS,
  WS_HEARTBEAT_INTERVAL_MS,
  clampServerBotStepDelayMsPure,
} from "../config.ts";
import {
  type PlatformRoomManager,
  type RoomInstance,
  type RoomSummary,
  getRoomActingPlayerId,
} from "../room-manager.ts";
import type { GuestSessionStore } from "./guest-sessions.ts";
import { resolveEffectiveViewerIdPure } from "./viewer-and-static.ts";
import { handleClientJsonMessage } from "./ws-client-messages.ts";
import {
  type RealtimeHub,
  type WsClient,
  type WsTransport,
  attachDuplexWsUpgrade,
  createPresenceTracker,
} from "./ws-hub-types-and-presence.ts";

export function createRealtimeHub(
  roomManager: PlatformRoomManager,
  guestSessions: GuestSessionStore
): RealtimeHub {
  let wsClients: Readonly<Record<string, WsClient>> = {};
  const roomBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const presence = createPresenceTracker(roomManager);

  const enrichSummaryWithPresence = (summary: RoomSummary): RoomSummary =>
    presence.enrichSummaryWithPresence(wsClients, summary);

  const refreshRoomDisconnectClock = (
    roomId: string,
    nowMs = Date.now()
  ): void => presence.refreshRoomDisconnectClock(wsClients, roomId, nowMs);

  function upsertWsClient(client: WsClient): void {
    wsClients = { ...wsClients, [client.id]: client };
  }

  function clearRoomBotTimer(roomId: string): void {
    const prev = roomBotTimers.get(roomId);
    if (prev) {
      clearTimeout(prev);
      roomBotTimers.delete(roomId);
    }
  }

  function notifyRoomClosed(roomId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.roomId === roomId) {
        client.transport.sendJson({ type: "ROOM_CLOSED", roomId });
        upsertWsClient({ ...client, roomId: null });
      }
    });
    clearRoomBotTimer(roomId);
    presence.clearRoomPresenceMeta(roomId);
  }

  function signOutGuestConnections(playerId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.playerId === playerId) {
        client.transport.sendJson({
          type: "GUEST_SIGNED_OUT",
          playerId,
        });
        upsertWsClient({ ...client, roomId: null, playerId: null });
      }
    });
    presence.removePlayerEverywhere(playerId);
  }

  function sendLobbySnapshotToClient(client: WsClient): void {
    const rooms = roomManager
      .listRooms(undefined, client.playerId)
      .map(enrichSummaryWithPresence);
    client.transport.sendJson({ type: "LOBBY_ROOMS", rooms });
  }

  function broadcastLobbyRooms(): void {
    Object.values(wsClients).forEach(sendLobbySnapshotToClient);
  }

  function broadcastRoomState(rawRoomId: string): void {
    let room: RoomInstance;
    try {
      room = roomManager.getRoom(rawRoomId);
    } catch {
      return;
    }
    const roomId = room.roomId;
    const engine = roomManager.registry.get(room.gameId);
    const state = room.session?.getState() ?? null;
    const actingId = state ? getRoomActingPlayerId(room.gameId, state) : null;

    Object.values(wsClients)
      .filter((client) => client.roomId === roomId)
      .forEach((client) => {
        const effectiveViewerId = resolveEffectiveViewerIdPure(
          room,
          client.playerId,
          actingId,
          state
        );
        const summary = enrichSummaryWithPresence(
          roomManager.toRoomSummary(room, client.playerId)
        );
        const view = state
          ? engine.getPlayerView(state, effectiveViewerId)
          : null;
        const legalActions =
          state && actingId && effectiveViewerId
            ? engine.getLegalActions(state, effectiveViewerId)
            : [];
        client.transport.sendJson({
          type: "ROOM_STATE",
          roomId,
          room: summary,
          state: view,
          actingPlayerId: actingId,
          legalActions,
        });
      });
  }

  function removeWsClient(clientId: string, nowMs = Date.now()): void {
    const prev = wsClients[clientId];
    if (!prev) return;
    wsClients = Object.fromEntries(
      Object.entries(wsClients).filter(([id]) => id !== clientId)
    );
    const affectedRooms = new Set<string>();
    if (prev.roomId) affectedRooms.add(prev.roomId);
    if (prev.playerId) {
      presence.seenConnectedPlayersByRoom.forEach((seen, roomId) => {
        if (seen.has(prev.playerId!)) affectedRooms.add(roomId);
      });
    }
    if (affectedRooms.size > 0) {
      affectedRooms.forEach((rid) => {
        refreshRoomDisconnectClock(rid, nowMs);
        broadcastRoomState(rid);
      });
      broadcastLobbyRooms();
    }
  }

  function checkHeartbeats(
    nowMs = Date.now(),
    timeoutMs = WS_DEAD_PEER_TIMEOUT_MS
  ): string[] {
    const evictedIds: string[] = [];
    Object.values(wsClients).forEach((client) => {
      if (
        client.transport.isClosed() ||
        nowMs - client.lastSeenMs > timeoutMs
      ) {
        evictedIds.push(client.id);
        removeWsClient(client.id, nowMs);
        client.transport.close();
        return;
      }
      if (client.transport.sendPing()) {
        client.transport.sendJson({
          type: "SERVER_HEARTBEAT",
          ts: nowMs,
        });
      }
    });
    return evictedIds;
  }

  const heartbeatTimer = setInterval(() => {
    checkHeartbeats();
  }, WS_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  function evictPlayerFromRoom(roomId: string, targetPlayerId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.playerId === targetPlayerId && client.roomId === roomId) {
        upsertWsClient({ ...client, roomId: null });
        client.transport.sendJson({
          type: "ROOM_REMOVED",
          roomId,
          reason: "You were removed from the room by the host.",
        });
      }
    });
    presence.removePlayerRoomPresence(roomId, targetPlayerId);
    refreshRoomDisconnectClock(roomId);
  }

  function sweepAbandonedRooms(
    nowMs = Date.now(),
    maxIdleMs = ABANDONED_ROOM_IDLE_MS
  ): string[] {
    const swept: string[] = [];
    const candidateRoomIds = new Set<string>([
      ...presence.roomAllDisconnectedSince.keys(),
      ...Object.keys(roomManager.getStateSnapshot().rooms),
    ]);
    for (const roomId of candidateRoomIds) {
      refreshRoomDisconnectClock(roomId, nowMs);
      const refreshedSince = presence.roomAllDisconnectedSince.get(roomId);
      const lastActivity = presence.roomLastActivityMs.get(roomId) ?? 0;
      const idleSince =
        refreshedSince !== undefined
          ? Math.max(refreshedSince, lastActivity)
          : undefined;
      if (idleSince !== undefined && nowMs - idleSince >= maxIdleMs) {
        if (roomManager.closeRoom(roomId)) {
          notifyRoomClosed(roomId);
          swept.push(roomId);
        }
      }
    }
    if (swept.length > 0) {
      broadcastLobbyRooms();
    }
    return swept;
  }

  function scheduleRoomBotTurn(rawRoomId: string): void {
    let room: RoomInstance;
    try {
      room = roomManager.getRoom(rawRoomId);
    } catch {
      clearRoomBotTimer(rawRoomId);
      return;
    }
    const roomId = room.roomId;
    clearRoomBotTimer(roomId);
    if (!room.autoStepBots || room.status !== "in_progress" || !room.session) {
      return;
    }
    const state = room.session.getState();
    if (!state || state.phase === "GAME_OVER") return;
    const actingId = getRoomActingPlayerId(room.gameId, state);
    if (!actingId) return;
    const actor = state.players.find((p: any) => p.id === actingId);
    if (!actor || !actor.isBot) return;

    const baseDelayMs = clampServerBotStepDelayMsPure(room.botStepDelayMs);
    const isHiddenSwSecretLock =
      room.gameId === "seven_wonders" &&
      state.phase === "AGE_DRAFT" &&
      Array.isArray(state.lockedPlayerIds) &&
      state.lockedPlayerIds.length + 1 < state.players.length;
    const stepDelayMs = isHiddenSwSecretLock
      ? Math.min(baseDelayMs, SEVEN_WONDERS_SECRET_LOCK_MAX_DELAY_MS)
      : baseDelayMs;

    const timer = setTimeout(() => {
      roomBotTimers.delete(roomId);
      try {
        const current = roomManager.getRoom(roomId);
        if (!current.autoStepBots || current.status !== "in_progress") return;
        const prevStatus = current.status;
        const res = roomManager.stepBot(roomId, { onlyBots: true });
        if (res.actedPlayerId) {
          broadcastRoomState(roomId);
          if (current.status !== prevStatus) {
            broadcastLobbyRooms();
          }
          scheduleRoomBotTurn(roomId);
        }
      } catch {
        // Ignore stopped or replaced match errors
      }
    }, stepDelayMs);
    roomBotTimers.set(roomId, timer);
  }

  const messageDeps = {
    roomManager,
    guestSessions,
    presence,
    getClient: (clientId: string) => wsClients[clientId],
    upsertWsClient,
    hasRoomBotTimer: (roomId: string) => roomBotTimers.has(roomId),
    refreshRoomDisconnectClock,
    sendLobbySnapshotToClient,
    broadcastLobbyRooms,
    broadcastRoomState,
    scheduleRoomBotTurn,
  };

  function resolveInitialPlayerId(rawUrl: string): string | null {
    try {
      const u = new URL(rawUrl || "/", "http://localhost");
      const token = u.searchParams.get("token")?.trim() || null;
      const verified = guestSessions.verifyToken(token);
      if (!verified) return null;
      const claimed = u.searchParams.get("playerId")?.trim() || null;
      if (claimed && claimed !== verified) return null;
      return verified;
    } catch {
      return null;
    }
  }

  function attachNativeWsClient(
    rawUrl: string,
    transport: WsTransport
  ): string {
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialPlayerId = resolveInitialPlayerId(rawUrl);
    const initialClient: WsClient = {
      id: clientId,
      transport,
      roomId: null,
      playerId: initialPlayerId,
      lastSeenMs: Date.now(),
    };
    upsertWsClient(initialClient);
    if (initialPlayerId) {
      presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
        if (seen.has(initialPlayerId)) {
          refreshRoomDisconnectClock(rid);
          broadcastRoomState(rid);
        }
      });
    }
    sendLobbySnapshotToClient(initialClient);
    return clientId;
  }

  function touchNativeWsClient(clientId: string): void {
    const liveClient = wsClients[clientId];
    if (liveClient) {
      upsertWsClient({ ...liveClient, lastSeenMs: Date.now() });
    }
  }

  function handleNativeWsMessage(clientId: string, text: string): void {
    touchNativeWsClient(clientId);
    const liveClient = wsClients[clientId];
    if (!liveClient) return;
    try {
      const msg = JSON.parse(text);
      handleClientJsonMessage(messageDeps, clientId, msg);
    } catch (msgErr: any) {
      liveClient.transport.sendJson({
        type: "ERROR",
        error: msgErr?.message ?? String(msgErr),
      });
    }
  }

  const detachNativeWsClient = (clientId: string): void => {
    removeWsClient(clientId);
  };

  function handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head?: Buffer
  ): void {
    attachDuplexWsUpgrade(req, socket, head, {
      onAttach: attachNativeWsClient,
      onTouch: touchNativeWsClient,
      onMessage: handleNativeWsMessage,
      onDetach: detachNativeWsClient,
    });
  }

  function shutdown(): void {
    clearInterval(heartbeatTimer);
    roomBotTimers.forEach((timer) => clearTimeout(timer));
    roomBotTimers.clear();
    Object.values(wsClients).forEach((client) => client.transport.close());
    wsClients = {};
  }

  return {
    enrichSummaryWithPresence,
    touchRoomActivity: presence.touchRoomActivity,
    refreshRoomDisconnectClock,
    removePlayerRoomPresence: presence.removePlayerRoomPresence,
    evictPlayerFromRoom,
    signOutGuestConnections,
    notifyRoomClosed,
    checkHeartbeats,
    sweepAbandonedRooms,
    broadcastLobbyRooms,
    broadcastRoomState,
    clearRoomBotTimer,
    scheduleRoomBotTurn,
    getConnectedPlayerIds: () => presence.getConnectedPlayerIds(wsClients),
    attachNativeWsClient,
    handleNativeWsMessage,
    touchNativeWsClient,
    detachNativeWsClient,
    handleUpgrade,
    shutdown,
  };
}
