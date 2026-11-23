import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import type { GuestSessionStore } from "./guest-sessions.ts";
import { isViewerSeatedOrOwnerPure } from "./viewer-and-static.ts";
import type {
  WsClient,
  createPresenceTracker,
} from "./ws-hub-types-and-presence.ts";

interface WsMessageHandlerDeps {
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

const nonEmptyTrimmed = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function syncAffectedRooms(
  deps: WsMessageHandlerDeps,
  prevRoomId: string | null,
  prevPlayerId: string | null,
  nextPlayerId: string | null,
  nextRoomId: string | null,
  skipRoomId?: string | null
): Set<string> {
  const affected = new Set<string>();
  if (prevRoomId && prevRoomId !== nextRoomId) affected.add(prevRoomId);
  if (prevPlayerId && prevPlayerId !== nextPlayerId) {
    if (prevRoomId) affected.add(prevRoomId);
    deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
      if (seen.has(prevPlayerId)) affected.add(rid);
    });
  }
  if (nextPlayerId && nextPlayerId !== prevPlayerId) {
    deps.presence.seenConnectedPlayersByRoom.forEach((seen, rid) => {
      if (seen.has(nextPlayerId)) affected.add(rid);
    });
  }
  affected.forEach((rid) => {
    if (rid !== skipRoomId) {
      deps.refreshRoomDisconnectClock(rid);
      deps.broadcastRoomState(rid);
    }
  });
  return affected;
}

function finishRoomAction(
  deps: WsMessageHandlerDeps,
  room: RoomInstance,
  prevStatus: RoomInstance["status"]
): void {
  const roomId = room.roomId;
  deps.presence.touchRoomActivity(roomId);
  deps.broadcastRoomState(roomId);
  if (room.status !== prevStatus) {
    deps.broadcastLobbyRooms();
  }
  deps.scheduleRoomBotTurn(roomId);
}

export function handleClientJsonMessage(
  deps: WsMessageHandlerDeps,
  clientId: string,
  msg: any
): void {
  const curClient = deps.getClient(clientId);
  if (!curClient || !msg || typeof msg.type !== "string") return;

  if (msg.type === "PING") {
    curClient.transport.sendJson({ type: "PONG", ts: Date.now() });
    return;
  }

  if (msg.type === "IDENTIFY_PLAYER") {
    const claimedPlayerId = nonEmptyTrimmed(msg.playerId);
    const rawToken = nonEmptyTrimmed(msg.token);
    const prevPlayerId = curClient.playerId;
    const prevRoomId = curClient.roomId;

    let nextPlayerId: string | null = null;
    if (claimedPlayerId || rawToken) {
      const verifiedId = deps.guestSessions.verifyToken(rawToken);
      if (!verifiedId || (claimedPlayerId && verifiedId !== claimedPlayerId)) {
        deps.upsertWsClient({ ...curClient, playerId: null, roomId: null });
        syncAffectedRooms(deps, prevRoomId, prevPlayerId, null, null);
        curClient.transport.sendJson({
          type: "ERROR",
          code: "INVALID_GUEST_TOKEN",
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

    const affectedRooms = syncAffectedRooms(
      deps,
      prevRoomId,
      prevPlayerId,
      nextPlayerId,
      nextRoomId
    );

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
    const claimedPlayerId = nonEmptyTrimmed(msg.playerId);
    const rawToken = nonEmptyTrimmed(msg.token);
    let nextPlayerId = curClient.playerId;
    if (rawToken) {
      const verifiedId = deps.guestSessions.verifyToken(rawToken);
      if (!verifiedId || (claimedPlayerId && verifiedId !== claimedPlayerId)) {
        curClient.transport.sendJson({
          type: "ERROR",
          code: "INVALID_GUEST_TOKEN",
          error: "Invalid guest session token",
        });
        return;
      }
      nextPlayerId = verifiedId;
    } else if (claimedPlayerId && claimedPlayerId !== curClient.playerId) {
      curClient.transport.sendJson({
        type: "ERROR",
        code: "INVALID_GUEST_TOKEN",
        error: "Valid guest session token required to switch identity",
      });
      return;
    }

    const requestedRoomId = nonEmptyTrimmed(msg.roomId) ?? "";
    let targetRoom: RoomInstance | null = null;
    if (requestedRoomId) {
      try {
        targetRoom = deps.roomManager.getRoom(requestedRoomId);
      } catch {
        targetRoom = null;
      }
    }
    if (!targetRoom) {
      deps.upsertWsClient({ ...curClient, roomId: null, playerId: nextPlayerId });
      syncAffectedRooms(deps, prevRoomId, prevPlayerId, nextPlayerId, null, null);
      if (prevRoomId || prevPlayerId !== nextPlayerId) {
        deps.broadcastLobbyRooms();
      }
      if (requestedRoomId) {
        curClient.transport.sendJson({
          type: "ROOM_CLOSED",
          roomId: requestedRoomId,
        });
      }
      return;
    }

    const canonicalId = targetRoom.roomId;
    deps.upsertWsClient({
      ...curClient,
      roomId: canonicalId,
      playerId: nextPlayerId,
    });
    syncAffectedRooms(
      deps,
      prevRoomId,
      prevPlayerId,
      nextPlayerId,
      canonicalId,
      canonicalId
    );
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
    finishRoomAction(deps, room, prevStatus);
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
    finishRoomAction(deps, room, prevStatus);
  }
}
