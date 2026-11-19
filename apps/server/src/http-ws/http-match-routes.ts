import type http from "node:http";
import {
  type PlatformRoomManager,
  type RoomInstance,
  getRoomActingPlayerId,
} from "../room-manager.ts";
import type { RealtimeHub } from "./realtime-hub.ts";
import {
  readJsonBody,
  resolveEffectiveViewerIdPure,
  sendJson,
} from "./viewer-and-static.ts";

export function buildRedactedStatePayload(
  roomManager: PlatformRoomManager,
  room: RoomInstance,
  rawState: any,
  viewerId: string | null
): { actingId: string | null; view: any } {
  const engine = roomManager.registry.get(room.gameId);
  const actingId = rawState
    ? getRoomActingPlayerId(room.gameId, rawState)
    : null;
  const effectiveViewerId = resolveEffectiveViewerIdPure(
    room,
    viewerId,
    actingId,
    rawState
  );
  const view = rawState
    ? engine.getPlayerView(rawState, effectiveViewerId)
    : null;
  return { actingId, view };
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

export async function handleRoomMatchSubRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  roomId: string,
  subRoute: string,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub
): Promise<boolean> {
  if (req.method !== "POST") return false;

  if (subRoute === "start") {
    const body = await readJsonBody(req);
    const rawState = roomManager.startGame(roomId, body.requesterId);
    const room = roomManager.getRoom(roomId);
    const viewerId = body.requesterId ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "action") {
    const body = await readJsonBody(req);
    const room = roomManager.getRoom(roomId);
    if (
      body.requesterId &&
      !roomManager.canViewerControlActor(room, body.requesterId, body.playerId)
    ) {
      throw new Error("You cannot act on behalf of another player");
    }
    const prevStatus = room.status;
    const nextState = roomManager.dispatchAction(
      roomId,
      body.playerId,
      body.action
    );
    const viewerId = body.requesterId ?? body.playerId ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "bot-step") {
    const body = await readJsonBody(req);
    const room = roomManager.getRoom(roomId);
    const rawState = room.session?.getState() ?? null;
    const currentActingId = rawState
      ? getRoomActingPlayerId(room.gameId, rawState)
      : null;
    const requesterId =
      typeof body.requesterId === "string" && body.requesterId.trim()
        ? body.requesterId.trim()
        : null;
    if (body.onlyBots === false && requesterId && !room.allBots) {
      const canControlHuman =
        room.ownerId === requesterId ||
        Boolean(
          currentActingId &&
            roomManager.canViewerControlActor(
              room,
              requesterId,
              currentActingId
            )
        );
      if (!canControlHuman) {
        throw new Error(
          "Only the room host or active seat controller can step a human turn"
        );
      }
    }
    const prevStatus = room.status;
    const result = roomManager.stepBot(roomId, {
      onlyBots: body.onlyBots !== false,
    });
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      result.state,
      requesterId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      ...result,
      state: view,
      room: roomManager.toRoomSummary(room, requesterId),
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "auto-bots") {
    const body = await readJsonBody(req);
    const requesterId =
      typeof body.requesterId === "string" && body.requesterId.trim()
        ? body.requesterId.trim()
        : null;
    const currentRoom = roomManager.getRoom(roomId);
    if (
      requesterId &&
      !currentRoom.allBots &&
      !isViewerSeatedOrOwnerPure(currentRoom, requesterId)
    ) {
      throw new Error("Only seated players can toggle auto-bots");
    }
    const room = roomManager.setRoomAutoStepBots(roomId, Boolean(body.enabled));
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots) {
      hub.scheduleRoomBotTurn(roomId);
    } else {
      hub.clearRoomBotTimer(roomId);
    }
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, requesterId),
    });
    return true;
  }

  if (subRoute === "finish-setup") {
    const body = await readJsonBody(req);
    const requesterId =
      typeof body.requesterId === "string" && body.requesterId.trim()
        ? body.requesterId.trim()
        : null;
    const currentRoom = roomManager.getRoom(roomId);
    if (
      requesterId &&
      !currentRoom.allBots &&
      !isViewerSeatedOrOwnerPure(currentRoom, requesterId)
    ) {
      throw new Error("Only seated players can auto-place setup");
    }
    const prevStatus = currentRoom.status;
    const nextState = roomManager.finishCatanSetupWithBots(roomId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      requesterId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, requesterId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "undo") {
    const body = await readJsonBody(req);
    const viewerId = body.requesterId ?? null;
    const nextState = roomManager.undoAction(roomId, viewerId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "redo") {
    const body = await readJsonBody(req);
    const viewerId = body.requesterId ?? null;
    const nextState = roomManager.redoAction(roomId, viewerId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  return false;
}
