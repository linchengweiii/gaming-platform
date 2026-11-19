import type http from "node:http";
import type { Duplex } from "node:stream";
import { MAX_WS_WRITE_BACKPRESSURE_BYTES } from "../config.ts";
import type {
  PlatformRoomManager,
  RoomInstance,
  RoomSummary,
} from "../room-manager.ts";
import { encodeWsTextFramePure } from "./ws-protocol.ts";

export interface WsClient {
  readonly id: string;
  readonly socket: Duplex;
  readonly roomId: string | null;
  readonly playerId: string | null;
  readonly lastSeenMs: number;
}

export interface RealtimeHub {
  enrichSummaryWithPresence(summary: RoomSummary): RoomSummary;
  refreshRoomDisconnectClock(roomId: string, nowMs?: number): void;
  removePlayerRoomPresence(roomId: string, playerId: string): void;
  evictPlayerFromRoom(roomId: string, targetPlayerId: string): void;
  signOutGuestConnections(playerId: string): void;
  cleanupDeletedRoomMeta(roomId: string): void;
  notifyRoomClosed(roomId: string): void;
  checkHeartbeats(nowMs?: number, timeoutMs?: number): string[];
  sweepAbandonedRooms(nowMs?: number, maxIdleMs?: number): string[];
  broadcastLobbyRooms(): void;
  broadcastRoomState(roomId: string): void;
  clearRoomBotTimer(roomId: string): void;
  scheduleRoomBotTurn(roomId: string): void;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex): void;
  shutdown(): void;
}

export function sendWsFrameSafe(socket: Duplex, payload: unknown): boolean {
  if (socket.destroyed || !socket.writable) return false;
  const writableLen = (socket as any).writableLength;
  if (
    typeof writableLen === "number" &&
    writableLen > MAX_WS_WRITE_BACKPRESSURE_BYTES
  ) {
    socket.destroy();
    return false;
  }
  try {
    socket.write(encodeWsTextFramePure(payload));
    return true;
  } catch {
    socket.destroy();
    return false;
  }
}

export function createPresenceTracker(roomManager: PlatformRoomManager) {
  const seenConnectedPlayersByRoom = new Map<string, Set<string>>();
  const roomAllDisconnectedSince = new Map<string, number>();

  function getConnectedPlayerIds(
    wsClients: Readonly<Record<string, WsClient>>
  ): Set<string> {
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
    try {
      const room = roomManager.getRoom(roomId);
      const isParticipant =
        room.humanPlayers.length > 0
          ? room.humanPlayers.some((p) => (p.controllerId ?? p.id) === playerId)
          : room.ownerId === playerId;
      if (isParticipant) {
        roomAllDisconnectedSince.delete(roomId);
      }
    } catch {
      // Ignore deleted room
    }
  }

  function refreshRoomDisconnectClock(
    wsClients: Readonly<Record<string, WsClient>>,
    roomId: string,
    nowMs = Date.now()
  ): void {
    let room: RoomInstance;
    try {
      room = roomManager.getRoom(roomId);
    } catch {
      seenConnectedPlayersByRoom.delete(roomId);
      roomAllDisconnectedSince.delete(roomId);
      return;
    }
    const connectedIds = getConnectedPlayerIds(wsClients);
    const anyHumanConnected =
      room.humanPlayers.length > 0
        ? room.humanPlayers.some((p) =>
            connectedIds.has(p.controllerId ?? p.id)
          )
        : Boolean(
            (room.ownerId && connectedIds.has(room.ownerId)) ||
              Object.values(wsClients).some((c) => c.roomId === roomId)
          );
    if (anyHumanConnected) {
      roomAllDisconnectedSince.delete(roomId);
    } else if (!roomAllDisconnectedSince.has(roomId)) {
      roomAllDisconnectedSince.set(roomId, nowMs);
    }
  }

  function enrichSummaryWithPresence(
    wsClients: Readonly<Record<string, WsClient>>,
    summary: RoomSummary
  ): RoomSummary {
    const seen = seenConnectedPlayersByRoom.get(summary.roomId);
    if (!seen || seen.size === 0) return summary;
    const connectedIds = getConnectedPlayerIds(wsClients);
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

  function clearRoomPresenceMeta(roomId: string): void {
    seenConnectedPlayersByRoom.delete(roomId);
    roomAllDisconnectedSince.delete(roomId);
  }

  function removePlayerRoomPresence(roomId: string, playerId: string): void {
    seenConnectedPlayersByRoom.get(roomId)?.delete(playerId);
  }

  function removePlayerEverywhere(playerId: string): void {
    seenConnectedPlayersByRoom.forEach((seen) => seen.delete(playerId));
  }

  return {
    seenConnectedPlayersByRoom,
    roomAllDisconnectedSince,
    recordPlayerRoomPresence,
    refreshRoomDisconnectClock,
    enrichSummaryWithPresence,
    clearRoomPresenceMeta,
    removePlayerRoomPresence,
    removePlayerEverywhere,
  };
}
