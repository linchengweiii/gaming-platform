import type http from "node:http";
import type { Duplex } from "node:stream";
import {
  ABANDONED_ROOM_IDLE_MS,
  BOT_STEP_DELAY_MS,
  MAX_WS_PAYLOAD_BYTES,
  WS_DEAD_PEER_TIMEOUT_MS,
  WS_HEARTBEAT_INTERVAL_MS,
  WS_TCP_KEEPALIVE_MS,
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
  createPresenceTracker,
  sendWsFrameSafe,
} from "./ws-hub-types-and-presence.ts";
import {
  computeWsAcceptKeyPure,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
} from "./ws-protocol.ts";

export type { RealtimeHub } from "./ws-hub-types-and-presence.ts";

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

  function cleanupDeletedRoomMeta(roomId: string): void {
    clearRoomBotTimer(roomId);
    presence.clearRoomPresenceMeta(roomId);
  }

  function notifyRoomClosed(roomId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.roomId === roomId) {
        sendWsFrameSafe(client.socket, { type: "ROOM_CLOSED", roomId });
        upsertWsClient({ ...client, roomId: null });
      }
    });
    cleanupDeletedRoomMeta(roomId);
  }

  function signOutGuestConnections(playerId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.playerId === playerId) {
        sendWsFrameSafe(client.socket, {
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
    sendWsFrameSafe(client.socket, { type: "LOBBY_ROOMS", rooms });
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
        sendWsFrameSafe(client.socket, {
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
    const pingFrame = encodeWsControlFramePure(0x09);
    Object.values(wsClients).forEach((client) => {
      if (client.socket.destroyed || nowMs - client.lastSeenMs > timeoutMs) {
        evictedIds.push(client.id);
        removeWsClient(client.id, nowMs);
        client.socket.destroy();
        return;
      }
      if (client.socket.writable) {
        try {
          client.socket.write(pingFrame);
        } catch {
          client.socket.destroy();
          return;
        }
        sendWsFrameSafe(client.socket, {
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
        sendWsFrameSafe(client.socket, {
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
      if (refreshedSince !== undefined && nowMs - refreshedSince >= maxIdleMs) {
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
    }, BOT_STEP_DELAY_MS);
    roomBotTimers.set(roomId, timer);
  }

  const messageDeps = {
    roomManager,
    guestSessions,
    presence,
    getClient: (clientId: string) => wsClients[clientId],
    upsertWsClient,
    hasRoomBotTimer: (roomId: string) => roomBotTimers.has(roomId),
    refreshRoomDisconnectClock: (roomId: string) =>
      refreshRoomDisconnectClock(roomId),
    sendLobbySnapshotToClient,
    broadcastLobbyRooms,
    broadcastRoomState,
    scheduleRoomBotTurn,
  };

  function handleUpgrade(req: http.IncomingMessage, socket: Duplex): void {
    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    socket.on("close", () => removeWsClient(clientId));
    socket.on("error", () => {
      removeWsClient(clientId);
      socket.destroy();
    });
    (socket as any).setKeepAlive?.(true, WS_TCP_KEEPALIVE_MS);

    const key = req.headers["sec-websocket-key"];
    if (!key || typeof key !== "string") {
      socket.destroy();
      return;
    }

    const accept = computeWsAcceptKeyPure(key);
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n",
      ].join("\r\n")
    );

    const initialPlayerId = (() => {
      try {
        const u = new URL(req.url ?? "/", "http://localhost");
        const token = u.searchParams.get("token")?.trim() || null;
        const verified = guestSessions.verifyToken(token);
        if (!verified) return null;
        const claimed = u.searchParams.get("playerId")?.trim() || null;
        if (claimed && claimed !== verified) return null;
        return verified;
      } catch {
        return null;
      }
    })();

    const initialClient: WsClient = {
      id: clientId,
      socket,
      roomId: null,
      playerId: initialPlayerId,
      lastSeenMs: Date.now(),
    };
    upsertWsClient(initialClient);
    sendLobbySnapshotToClient(initialClient);

    let readBuffer: Buffer = Buffer.alloc(0);
    let pendingFragments: readonly Buffer[] = [];

    socket.on("data", (chunk: Buffer) => {
      const liveClient = wsClients[clientId];
      if (liveClient) {
        upsertWsClient({ ...liveClient, lastSeenMs: Date.now() });
      }
      try {
        readBuffer =
          readBuffer.length > 0 ? Buffer.concat([readBuffer, chunk]) : chunk;
        if (readBuffer.length > MAX_WS_PAYLOAD_BYTES * 2) {
          throw new Error("WebSocket receive buffer exceeded limit");
        }
        const decoded = decodeWsFramesStreamPure(
          readBuffer,
          MAX_WS_PAYLOAD_BYTES,
          pendingFragments
        );
        readBuffer = decoded.remainder;
        pendingFragments = decoded.pendingFragments;

        for (const frame of decoded.frames) {
          if (frame.opcode === 0x08) {
            removeWsClient(clientId);
            if (!socket.destroyed && socket.writable) {
              socket.write(encodeWsControlFramePure(0x08));
            }
            socket.destroy();
            return;
          }
          if (frame.opcode === 0x09) {
            if (!socket.destroyed && socket.writable) {
              socket.write(encodeWsControlFramePure(0x0a, frame.payload));
            }
            continue;
          }
          if (frame.opcode === 0x0a) {
            continue;
          }
          if (frame.opcode === 0x01 && frame.text !== undefined) {
            try {
              const msg = JSON.parse(frame.text);
              handleClientJsonMessage(messageDeps, clientId, msg);
            } catch (msgErr: any) {
              sendWsFrameSafe(socket, {
                type: "ERROR",
                error: msgErr?.message ?? String(msgErr),
              });
            }
          }
        }
      } catch {
        removeWsClient(clientId);
        socket.destroy();
      }
    });
  }

  function shutdown(): void {
    clearInterval(heartbeatTimer);
    roomBotTimers.forEach((timer) => clearTimeout(timer));
    roomBotTimers.clear();
    Object.values(wsClients).forEach((client) => client.socket.destroy());
    wsClients = {};
  }

  return {
    enrichSummaryWithPresence,
    refreshRoomDisconnectClock,
    removePlayerRoomPresence: presence.removePlayerRoomPresence,
    evictPlayerFromRoom,
    signOutGuestConnections,
    cleanupDeletedRoomMeta,
    notifyRoomClosed,
    checkHeartbeats,
    sweepAbandonedRooms,
    broadcastLobbyRooms,
    broadcastRoomState,
    clearRoomBotTimer,
    scheduleRoomBotTurn,
    handleUpgrade,
    shutdown,
  };
}
