import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import {
  type WsClient,
  type createPresenceTracker,
  sendWsFrameSafe,
} from "./ws-hub-types-and-presence.ts";

export interface WsMessageHandlerDeps {
  readonly roomManager: PlatformRoomManager;
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
    const nextPlayerId =
      typeof msg.playerId === "string" && msg.playerId.trim()
        ? msg.playerId.trim()
        : null;
    const prevPlayerId = curClient.playerId;
    const prevRoomId = curClient.roomId;
    const nextRoomId = nextPlayerId ? curClient.roomId : null;
    deps.upsertWsClient({
      ...curClient,
      playerId: nextPlayerId,
      roomId: nextRoomId,
    });
    if (prevRoomId && !nextRoomId) {
      deps.refreshRoomDisconnectClock(prevRoomId);
    }
    if (nextRoomId && nextPlayerId) {
      deps.presence.recordPlayerRoomPresence(nextRoomId, nextPlayerId);
      deps.broadcastRoomState(nextRoomId);
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
    const nextPlayerId =
      typeof msg.playerId === "string" && msg.playerId.trim()
        ? msg.playerId.trim()
        : curClient.playerId;
    const requestedRoomId =
      typeof msg.roomId === "string" ? msg.roomId.trim() : "";
    if (!requestedRoomId) {
      deps.upsertWsClient({
        ...curClient,
        roomId: null,
        playerId: nextPlayerId,
      });
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
    const room = deps.roomManager.getRoom(curClient.roomId);
    if (
      curClient.playerId &&
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
    const room = deps.roomManager.getRoom(curClient.roomId);
    const prevStatus = room.status;
    deps.roomManager.stepBot(curClient.roomId, { onlyBots: true });
    deps.broadcastRoomState(curClient.roomId);
    if (room.status !== prevStatus) {
      deps.broadcastLobbyRooms();
    }
    deps.scheduleRoomBotTurn(curClient.roomId);
  }
}
