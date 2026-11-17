import type http from "node:http";
import type { Duplex } from "node:stream";
import {
  ABANDONED_ROOM_IDLE_MS,
  BOT_STEP_DELAY_MS,
  WS_HEARTBEAT_INTERVAL_MS,
} from "../config.ts";
import {
  type PlatformRoomManager,
  type RoomInstance,
  type RoomSummary,
  getRoomActingPlayerId,
} from "../room-manager.ts";
import { resolveEffectiveViewerIdPure } from "./viewer-and-static.ts";
import {
  computeWsAcceptKeyPure,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
} from "./ws-protocol.ts";

interface WsClient {
  readonly id: string;
  readonly socket: Duplex;
  readonly roomId: string | null;
  readonly playerId: string | null;
}

export interface RealtimeHub {
  enrichSummaryWithPresence(summary: RoomSummary): RoomSummary;
  refreshRoomDisconnectClock(roomId: string, nowMs?: number): void;
  removePlayerRoomPresence(roomId: string, playerId: string): void;
  signOutGuestConnections(playerId: string): void;
  cleanupDeletedRoomMeta(roomId: string): void;
  sweepAbandonedRooms(nowMs?: number, maxIdleMs?: number): string[];
  broadcastLobbyRooms(): void;
  broadcastRoomState(roomId: string): void;
  clearRoomBotTimer(roomId: string): void;
  scheduleRoomBotTurn(roomId: string): void;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex): void;
  shutdown(): void;
}

export function createRealtimeHub(
  roomManager: PlatformRoomManager
): RealtimeHub {
  let wsClients: Readonly<Record<string, WsClient>> = {};
  const roomBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const seenConnectedPlayersByRoom = new Map<string, Set<string>>();
  const roomAllDisconnectedSince = new Map<string, number>();

  const resolveCanonicalRoomId = (rawRoomId: string): string => {
    try {
      return roomManager.getRoom(rawRoomId).roomId;
    } catch {
      return rawRoomId;
    }
  };

  const heartbeatTimer = setInterval(() => {
    const pingFrame = encodeWsControlFramePure(0x09);
    Object.values(wsClients).forEach((client) => {
      if (!client.socket.destroyed && client.socket.writable) {
        client.socket.write(pingFrame);
      }
    });
  }, WS_HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  function getConnectedPlayerIds(): Set<string> {
    const set = new Set<string>();
    Object.values(wsClients).forEach((c) => {
      if (c.playerId) set.add(c.playerId);
    });
    return set;
  }

  function recordPlayerRoomPresence(
    roomId: string | null,
    playerId: string | null
  ): void {
    if (!roomId || !playerId) return;
    let seen = seenConnectedPlayersByRoom.get(roomId);
    if (!seen) {
      seen = new Set<string>();
      seenConnectedPlayersByRoom.set(roomId, seen);
    }
    seen.add(playerId);
    roomAllDisconnectedSince.delete(roomId);
  }

  function refreshRoomDisconnectClock(roomId: string, nowMs = Date.now()): void {
    let room: RoomInstance;
    try {
      room = roomManager.getRoom(roomId);
    } catch {
      seenConnectedPlayersByRoom.delete(roomId);
      roomAllDisconnectedSince.delete(roomId);
      return;
    }
    if (room.humanPlayers.length === 0) {
      roomAllDisconnectedSince.delete(roomId);
      return;
    }
    const connectedIds = getConnectedPlayerIds();
    const anyHumanConnected = room.humanPlayers.some((p) =>
      connectedIds.has(p.controllerId ?? p.id)
    );
    if (anyHumanConnected) {
      roomAllDisconnectedSince.delete(roomId);
    } else if (!roomAllDisconnectedSince.has(roomId)) {
      roomAllDisconnectedSince.set(roomId, nowMs);
    }
  }

  function enrichSummaryWithPresence(summary: RoomSummary): RoomSummary {
    const seen = seenConnectedPlayersByRoom.get(summary.roomId);
    if (!seen || seen.size === 0) return summary;
    const connectedIds = getConnectedPlayerIds();
    const offlineIds = summary.players
      .filter((p) => {
        if (p.isBot) return false;
        const ownerKey = p.controllerId ?? p.id;
        return seen.has(ownerKey) && !connectedIds.has(ownerKey);
      })
      .map((p) => p.id);
    return offlineIds.length > 0
      ? { ...summary, offlinePlayerIds: offlineIds }
      : summary;
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
    seenConnectedPlayersByRoom.delete(roomId);
    roomAllDisconnectedSince.delete(roomId);
  }

  function removePlayerRoomPresence(roomId: string, playerId: string): void {
    seenConnectedPlayersByRoom.get(roomId)?.delete(playerId);
  }

  function upsertWsClient(client: WsClient): void {
    wsClients = {
      ...wsClients,
      [client.id]: client,
    };
  }

  function signOutGuestConnections(playerId: string): void {
    Object.values(wsClients).forEach((client) => {
      if (client.playerId === playerId) {
        upsertWsClient({ ...client, roomId: null, playerId: null });
      }
    });
    seenConnectedPlayersByRoom.forEach((seen) => seen.delete(playerId));
  }

  function sendWsFrame(socket: Duplex, payload: unknown): void {
    if (socket.destroyed || !socket.writable) return;
    socket.write(encodeWsTextFramePure(payload));
  }

  function broadcastLobbyRooms(): void {
    Object.values(wsClients).forEach((client) => {
      const rooms = roomManager
        .listRooms(undefined, client.playerId)
        .map(enrichSummaryWithPresence);
      sendWsFrame(client.socket, {
        type: "LOBBY_ROOMS",
        rooms,
      });
    });
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
          state && actingId
            ? engine.getLegalActions(state, effectiveViewerId ?? actingId)
            : [];
        sendWsFrame(client.socket, {
          type: "ROOM_STATE",
          roomId,
          room: summary,
          state: view,
          actingPlayerId: actingId,
          legalActions,
        });
      });
  }

  function removeWsClient(clientId: string): void {
    const prev = wsClients[clientId];
    wsClients = Object.fromEntries(
      Object.entries(wsClients).filter(([id]) => id !== clientId)
    );
    if (prev?.roomId) {
      refreshRoomDisconnectClock(prev.roomId);
      broadcastRoomState(prev.roomId);
      broadcastLobbyRooms();
    }
  }

  function sweepAbandonedRooms(
    nowMs = Date.now(),
    maxIdleMs = ABANDONED_ROOM_IDLE_MS
  ): string[] {
    const swept: string[] = [];
    for (const [roomId] of Array.from(roomAllDisconnectedSince.entries())) {
      refreshRoomDisconnectClock(roomId, nowMs);
      const refreshedSince = roomAllDisconnectedSince.get(roomId);
      if (refreshedSince !== undefined && nowMs - refreshedSince >= maxIdleMs) {
        if (roomManager.closeRoom(roomId)) {
          cleanupDeletedRoomMeta(roomId);
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

  function handleUpgrade(req: http.IncomingMessage, socket: Duplex): void {
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
        return u.searchParams.get("playerId")?.trim() || null;
      } catch {
        return null;
      }
    })();

    const clientId = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    upsertWsClient({
      id: clientId,
      socket,
      roomId: null,
      playerId: initialPlayerId,
    });

    // Send initial lobby rooms snapshot immediately on WS connect
    sendWsFrame(socket, {
      type: "LOBBY_ROOMS",
      rooms: roomManager
        .listRooms(undefined, initialPlayerId)
        .map(enrichSummaryWithPresence),
    });

    let readBuffer: Buffer = Buffer.alloc(0);

    socket.on("data", (chunk: Buffer) => {
      try {
        readBuffer =
          readBuffer.length > 0 ? Buffer.concat([readBuffer, chunk]) : chunk;
        const decoded = decodeWsFramesStreamPure(readBuffer);
        readBuffer = decoded.remainder;
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
          if (frame.opcode === 0x01 && frame.text !== undefined) {
            const msg = JSON.parse(frame.text);
            const curClient = wsClients[clientId];
            if (!curClient) return;

            if (msg.type === "SUBSCRIBE_ROOM") {
              const nextRoomId = msg.roomId
                ? resolveCanonicalRoomId(String(msg.roomId))
                : null;
              const nextPlayerId = msg.playerId ?? curClient.playerId ?? null;
              upsertWsClient({
                ...curClient,
                roomId: nextRoomId,
                playerId: nextPlayerId,
              });
              recordPlayerRoomPresence(nextRoomId, nextPlayerId);
              if (nextRoomId) {
                broadcastRoomState(nextRoomId);
                broadcastLobbyRooms();
                if (!roomBotTimers.has(nextRoomId)) {
                  scheduleRoomBotTurn(nextRoomId);
                }
              }
            } else if (msg.type === "UNSUBSCRIBE_ROOM") {
              const prevRoomId = curClient.roomId;
              upsertWsClient({
                ...curClient,
                roomId: null,
              });
              if (prevRoomId) {
                refreshRoomDisconnectClock(prevRoomId);
              }
            } else if (msg.type === "DISPATCH_ACTION" && curClient.roomId) {
              clearRoomBotTimer(curClient.roomId);
              const room = roomManager.getRoom(curClient.roomId);
              if (
                curClient.playerId &&
                !roomManager.canViewerControlActor(
                  room,
                  curClient.playerId,
                  msg.playerId
                )
              ) {
                throw new Error("You cannot act on behalf of another player");
              }
              const prevStatus = room.status;
              roomManager.dispatchAction(
                curClient.roomId,
                msg.playerId,
                msg.action
              );
              broadcastRoomState(curClient.roomId);
              if (room.status !== prevStatus) {
                broadcastLobbyRooms();
              }
              scheduleRoomBotTurn(curClient.roomId);
            } else if (msg.type === "STEP_BOT" && curClient.roomId) {
              clearRoomBotTimer(curClient.roomId);
              const room = roomManager.getRoom(curClient.roomId);
              const prevStatus = room.status;
              roomManager.stepBot(curClient.roomId, { onlyBots: true });
              broadcastRoomState(curClient.roomId);
              if (room.status !== prevStatus) {
                broadcastLobbyRooms();
              }
              scheduleRoomBotTurn(curClient.roomId);
            }
          }
        }
      } catch (err: any) {
        sendWsFrame(socket, {
          type: "ERROR",
          error: err?.message ?? String(err),
        });
      }
    });

    socket.on("close", () => removeWsClient(clientId));
    socket.on("error", () => removeWsClient(clientId));
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
    removePlayerRoomPresence,
    signOutGuestConnections,
    cleanupDeletedRoomMeta,
    sweepAbandonedRooms,
    broadcastLobbyRooms,
    broadcastRoomState,
    clearRoomBotTimer,
    scheduleRoomBotTurn,
    handleUpgrade,
    shutdown,
  };
}
