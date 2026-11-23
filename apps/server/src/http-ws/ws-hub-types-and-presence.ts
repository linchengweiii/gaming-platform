import type http from "node:http";
import type { Duplex } from "node:stream";
import {
  MAX_WS_PAYLOAD_BYTES,
  MAX_WS_WRITE_BACKPRESSURE_BYTES,
  WS_TCP_KEEPALIVE_MS,
} from "../config.ts";
import type {
  PlatformRoomManager,
  RoomInstance,
  RoomSummary,
} from "../room-manager.ts";
import {
  computeWsAcceptKeyPure,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
} from "./ws-protocol.ts";

export interface WsTransport {
  readonly isClosed: () => boolean;
  readonly sendJson: (payload: unknown) => boolean;
  readonly sendPing: () => boolean;
  readonly close: () => void;
}

export interface WsClient {
  readonly id: string;
  readonly transport: WsTransport;
  readonly roomId: string | null;
  readonly playerId: string | null;
  readonly lastSeenMs: number;
}

export interface RealtimeHub {
  enrichSummaryWithPresence(summary: RoomSummary): RoomSummary;
  touchRoomActivity(roomId: string, nowMs?: number): void;
  refreshRoomDisconnectClock(roomId: string, nowMs?: number): void;
  removePlayerRoomPresence(roomId: string, playerId: string): void;
  evictPlayerFromRoom(roomId: string, targetPlayerId: string): void;
  signOutGuestConnections(playerId: string): void;
  notifyRoomClosed(roomId: string): void;
  checkHeartbeats(nowMs?: number, timeoutMs?: number): string[];
  sweepAbandonedRooms(nowMs?: number, maxIdleMs?: number): string[];
  broadcastLobbyRooms(): void;
  broadcastRoomState(roomId: string): void;
  clearRoomBotTimer(roomId: string): void;
  scheduleRoomBotTurn(roomId: string): void;
  getConnectedPlayerIds(): ReadonlySet<string>;
  attachNativeWsClient(rawUrl: string, transport: WsTransport): string;
  handleNativeWsMessage(clientId: string, text: string): void;
  touchNativeWsClient(clientId: string): void;
  detachNativeWsClient(clientId: string): void;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head?: Buffer): void;
  shutdown(): void;
}

function sendWsFrameSafe(socket: Duplex, payload: unknown): boolean {
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

function createDuplexWsTransport(socket: Duplex): WsTransport {
  const pingFrame = encodeWsControlFramePure(0x09);
  return {
    isClosed: () => socket.destroyed,
    sendJson: (payload) => sendWsFrameSafe(socket, payload),
    sendPing: () => {
      if (socket.destroyed || !socket.writable) return false;
      try {
        socket.write(pingFrame);
        return true;
      } catch {
        socket.destroy();
        return false;
      }
    },
    close: () => {
      socket.destroy();
    },
  };
}

export function attachDuplexWsUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer | undefined,
  callbacks: {
    readonly onAttach: (rawUrl: string, transport: WsTransport) => string;
    readonly onTouch: (clientId: string) => void;
    readonly onMessage: (clientId: string, text: string) => void;
    readonly onDetach: (clientId: string) => void;
  }
): void {
  let clientId: string | null = null;
  const detachOnce = (): void => {
    if (clientId) {
      const id = clientId;
      clientId = null;
      callbacks.onDetach(id);
    }
  };
  socket.on("close", detachOnce);
  socket.on("error", () => {
    detachOnce();
    socket.destroy();
  });
  (socket as any).setKeepAlive?.(true, WS_TCP_KEEPALIVE_MS);

  const key = req.headers["sec-websocket-key"];
  if (!key || typeof key !== "string") {
    socket.destroy();
    return;
  }

  const accept = computeWsAcceptKeyPure(key);
  try {
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n",
      ].join("\r\n")
    );
  } catch {
    socket.destroy();
    return;
  }

  clientId = callbacks.onAttach(req.url ?? "/", createDuplexWsTransport(socket));

  let readBuffer: Buffer = Buffer.alloc(0);
  let pendingFragments: readonly Buffer[] = [];

  const processChunk = (chunk: Buffer): void => {
    if (!clientId) return;
    callbacks.onTouch(clientId);
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
          detachOnce();
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
        if (frame.opcode === 0x0a) continue;
        if (frame.opcode === 0x01 && frame.text !== undefined && clientId) {
          callbacks.onMessage(clientId, frame.text);
        }
      }
    } catch {
      detachOnce();
      socket.destroy();
    }
  };

  socket.on("data", processChunk);
  if (head && head.length > 0) {
    processChunk(head);
  }
}

export function createPresenceTracker(roomManager: PlatformRoomManager) {
  const seenConnectedPlayersByRoom = new Map<string, Set<string>>();
  const roomAllDisconnectedSince = new Map<string, number>();
  const roomLastActivityMs = new Map<string, number>();

  function getConnectedPlayerIds(
    wsClients: Readonly<Record<string, WsClient>>
  ): Set<string> {
    const set = new Set<string>();
    Object.values(wsClients).forEach((c) => {
      if (c.playerId) set.add(c.playerId);
    });
    return set;
  }

  function touchRoomActivity(roomId: string, nowMs = Date.now()): void {
    if (!roomId) return;
    const prev = roomLastActivityMs.get(roomId) ?? 0;
    if (nowMs > prev) {
      roomLastActivityMs.set(roomId, nowMs);
    }
    const prevDisconnected = roomAllDisconnectedSince.get(roomId);
    if (prevDisconnected !== undefined && nowMs > prevDisconnected) {
      roomAllDisconnectedSince.set(roomId, nowMs);
    }
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
      clearRoomPresenceMeta(roomId);
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
      const lastAct = roomLastActivityMs.get(roomId) ?? 0;
      roomAllDisconnectedSince.set(roomId, Math.max(nowMs, lastAct));
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
    roomLastActivityMs.delete(roomId);
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
    roomLastActivityMs,
    getConnectedPlayerIds,
    touchRoomActivity,
    recordPlayerRoomPresence,
    refreshRoomDisconnectClock,
    enrichSummaryWithPresence,
    clearRoomPresenceMeta,
    removePlayerRoomPresence,
    removePlayerEverywhere,
  };
}
