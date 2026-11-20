import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import type { GuestSessionStore } from "./guest-sessions.ts";
import {
  type WsClient,
  type createPresenceTracker,
  sendWsFrameSafe,
} from "./ws-hub-types-and-presence.ts";

export interface WsMessageHandlerDeps {
  readonly roomManager: PlatformRoomManager;
  readonly guestSessions: GuestSessionStore;
  readonly presence: ReturnType<typeof createPresenceTracker>;
  readonly getClient: (clientId: string) => WsClient | undefined;
  readonly upsertWsClient: (client: WsClient) => void;
  readonly hasRoomBotTimer: (roomId: string) => boolean;
  readonly refreshRoomDisconnectClock: (roomId: string) => void;
  readonly sendLobbySnapshotToClient: (client: WsClient) => void;
  readonly broadcastLobbyRooms: () => void;
  readonly broadcastRoomState: (roomId: string) => void;
  readonly scheduleRoomBotTurn: (roomId: string) => void;
}

function isViewerSeatedOrOwnerPure(
  room: RoomInstance,
  viewerId: string
): boolean {
  return (
    room.ownerId === viewerId ||
    room.humanPlayers.some(
      (p) => p.id === viewerId || p.controllerId === viewerId
    )
  );
}

export function handleClientJsonMessage(
  deps: WsMessageHandlerDeps,
  clientId: string,
  msg: any
): void {
  const curClient = deps.getClient(clientId);
  if (!curClient || !msg || typeof msg.type !== "string") return;

  if (msg.type === "PING") {
    sendWsFrameSafe(curClient.socket, { type: "PONG", ts: Date.now() });
    return;
  }

  if (msg.type === "IDENTIFY_PLAYER") {
    const claimedPlayerId =
      typeof msg.playerId === "string" && msg.playerId.trim()
        ? msg.playerId.trim()
        : null;
    const rawToken =
      typeof msg.token === "string" && msg.token.trim()
        ? msg.token.trim()
        : null;
    const prevPlayerId = curClient.playerId;
    const prevRoomId = curClient.roomId;

    let nextPlayerId: string | null = null;
    if (claimedPlayerId || rawToken) {
      const verifiedId = deps.guestSessions.verifyToken(rawToken);
      if (!verifiedId || (claimedPlayerId && verifiedId !== claimedPlayerId)) {
        deps.upsertWsClient({
          ...curClient,
          playerId: null,
          roomId: null,
        });
        const affected = new Set<string>();
        if (prevRoomId) affected.add(prevRoomId);
        if (prevPlayerId) {
          deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
            if (seen.has(prevPlayerId)) affected.add(rid);
          });
        }
        affected.forEach((rid) => {
          deps.refreshRoomDisconnectClock(rid);
          deps.broadcastRoomState(rid);
        });
        sendWsFrameSafe(curClient.socket, {
          type: "ERROR",
          error: "Invalid guest session token",
        });
        if (prevPlayerId !== null) deps.broadcastLobbyRooms();
        return;
      }
      nextPlayerId = verifiedId;
    }

    const nextRoomId = nextPlayerId ? curClient.roomId : null;
    deps.upsertWsClient({
      ...curClient,
      playerId: nextPlayerId,
      roomId: nextRoomId,
    });

    const affectedRooms = new Set<string>();
    if (prevRoomId && !nextRoomId) affectedRooms.add(prevRoomId);
    if (prevPlayerId && prevPlayerId !== nextPlayerId) {
      if (prevRoomId) affectedRooms.add(prevRoomId);
      deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
        if (seen.has(prevPlayerId)) affectedRooms.add(rid);
      });
    }
    if (nextPlayerId && nextPlayerId !== prevPlayerId) {
      const targetNextId = nextPlayerId;
      deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
        if (seen.has(targetNextId)) affectedRooms.add(rid);
      });
    }
    affectedRooms.forEach((rid) => {
      deps.refreshRoomDisconnectClock(rid);
      deps.broadcastRoomState(rid);
    });

    if (nextRoomId && nextPlayerId) {
      deps.presence.recordPlayerRoomPresence(nextRoomId, nextPlayerId);
      if (!affectedRooms.has(nextRoomId)) {
        deps.broadcastRoomState(nextRoomId);
      }
    }
    if (prevPlayerId !== nextPlayerId) {
      deps.broadcastLobbyRooms();
    } else {
      const refreshed = deps.getClient(clientId);
      if (refreshed) deps.sendLobbySnapshotToClient(refreshed);
    }
    return;
  }

  if (msg.type === "SUBSCRIBE_ROOM") {
    const prevRoomId = curClient.roomId;
    const prevPlayerId = curClient.playerId;
    const claimedPlayerId =
      typeof msg.playerId === "string" && msg.playerId.trim()
        ? msg.playerId.trim()
        : null;
    const rawToken =
      typeof msg.token === "string" && msg.token.trim()
        ? msg.token.trim()
        : null;
    let nextPlayerId = curClient.playerId;
    if (rawToken) {
      const verifiedId = deps.guestSessions.verifyToken(rawToken);
      if (!verifiedId || (claimedPlayerId && verifiedId !== claimedPlayerId)) {
        sendWsFrameSafe(curClient.socket, {
          type: "ERROR",
          error: "Invalid guest session token",
        });
        return;
      }
      nextPlayerId = verifiedId;
    } else if (claimedPlayerId && claimedPlayerId !== curClient.playerId) {
      sendWsFrameSafe(curClient.socket, {
        type: "ERROR",
        error: "Valid guest session token required to switch identity",
      });
      return;
    }

    const syncPreviousPresence = (newRoomId: string | null): void => {
      const affected = new Set<string>();
      if (prevRoomId && prevRoomId !== newRoomId) affected.add(prevRoomId);
      if (prevPlayerId && prevPlayerId !== nextPlayerId) {
        if (prevRoomId) affected.add(prevRoomId);
        deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
          if (seen.has(prevPlayerId)) affected.add(rid);
        });
      }
      if (nextPlayerId && nextPlayerId !== prevPlayerId) {
        const targetNextId = nextPlayerId;
        deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
          if (seen.has(targetNextId)) affected.add(rid);
        });
      }
      affected.forEach((rid) => {
        if (rid !== newRoomId) {
          deps.refreshRoomDisconnectClock(rid);
          deps.broadcastRoomState(rid);
        }
      });
    };

    const requestedRoomId =
      typeof msg.roomId === "string" ? msg.roomId.trim() : "";
    if (!requestedRoomId) {
      deps.upsertWsClient({
        ...curClient,
        roomId: null,
        playerId: nextPlayerId,
      });
      syncPreviousPresence(null);
      if (prevRoomId || prevPlayerId !== nextPlayerId) {
        deps.broadcastLobbyRooms();
      }
      return;
    }
    let targetRoom: RoomInstance | null = null;
    try {
      targetRoom = deps.roomManager.getRoom(requestedRoomId);
    } catch {
      targetRoom = null;
    }
    if (!targetRoom) {
      deps.upsertWsClient({
        ...curClient,
        roomId: null,
        playerId: nextPlayerId,
      });
      syncPreviousPresence(null);
      if (prevRoomId || prevPlayerId !== nextPlayerId) {
        deps.broadcastLobbyRooms();
      }
      sendWsFrameSafe(curClient.socket, {
        type: "ROOM_CLOSED",
        roomId: requestedRoomId,
      });
      return;
    }
    const canonicalId = targetRoom.roomId;
    deps.upsertWsClient({
      ...curClient,
      roomId: canonicalId,
      playerId: nextPlayerId,
    });
    syncPreviousPresence(canonicalId);
    deps.presence.recordPlayerRoomPresence(canonicalId, nextPlayerId);
    deps.broadcastRoomState(canonicalId);
    deps.broadcastLobbyRooms();
    if (!deps.hasRoomBotTimer(canonicalId)) {
      deps.scheduleRoomBotTurn(canonicalId);
    }
    return;
  }

  if (msg.type === "UNSUBSCRIBE_ROOM") {
    const prevRoomId = curClient.roomId;
    deps.upsertWsClient({ ...curClient, roomId: null });
    if (prevRoomId) {
      deps.refreshRoomDisconnectClock(prevRoomId);
      deps.broadcastLobbyRooms();
    }
    return;
  }

  if (msg.type === "DISPATCH_ACTION" && curClient.roomId) {
    if (!curClient.playerId) {
      throw new Error("Authentication required to dispatch actions");
    }
    const room = deps.roomManager.getRoom(curClient.roomId);
    if (
      !deps.roomManager.canViewerControlActor(
        room,
        curClient.playerId,
        msg.playerId
      )
    ) {
      throw new Error("You cannot act on behalf of another player");
    }
    const prevStatus = room.status;
    deps.roomManager.dispatchAction(curClient.roomId, msg.playerId, msg.action);
    deps.broadcastRoomState(curClient.roomId);
    if (room.status !== prevStatus) {
      deps.broadcastLobbyRooms();
    }
    deps.scheduleRoomBotTurn(curClient.roomId);
    return;
  }

  if (msg.type === "STEP_BOT" && curClient.roomId) {
    if (!curClient.playerId) {
      throw new Error("Authentication required to step bots");
    }
    const room = deps.roomManager.getRoom(curClient.roomId);
    if (!isViewerSeatedOrOwnerPure(room, curClient.playerId)) {
      throw new Error("Only seated players or room host can step bots");
    }
    const prevStatus = room.status;
    deps.roomManager.stepBot(curClient.roomId, { onlyBots: true });
    deps.broadcastRoomState(curClient.roomId);
    if (room.status !== prevStatus) {
      deps.broadcastLobbyRooms();
    }
    deps.scheduleRoomBotTurn(curClient.roomId);
  }
}
