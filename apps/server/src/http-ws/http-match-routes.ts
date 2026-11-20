import type http from "node:http";
import {
  type PlatformRoomManager,
  type RoomInstance,
  getRoomActingPlayerId,
} from "../room-manager.ts";
import {
  type GuestSessionStore,
  createHttpError,
} from "./guest-sessions.ts";
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

function assertRequesterMatchesAuth(
  claimed: unknown,
  authPlayerId: string
): void {
  if (typeof claimed === "string" && claimed.trim() && claimed.trim() !== authPlayerId) {
    throw createHttpError(403, "Authenticated guest does not match requesterId");
  }
}

export async function handleRoomMatchSubRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  roomId: string,
  subRoute: string,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub,
  guestSessions: GuestSessionStore
): Promise<boolean> {
  if (req.method !== "POST") return false;

  if (subRoute === "start") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const rawState = roomManager.startGame(roomId, authPlayerId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "action") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const room = roomManager.getRoom(roomId);
    if (!roomManager.canViewerControlActor(room, authPlayerId, body.playerId)) {
      throw createHttpError(403, "You cannot act on behalf of another player");
    }
    const prevStatus = room.status;
    const nextState = roomManager.dispatchAction(
      roomId,
      body.playerId,
      body.action
    );
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "bot-step") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const room = roomManager.getRoom(roomId);
    const rawState = room.session?.getState() ?? null;
    const currentActingId = rawState
      ? getRoomActingPlayerId(room.gameId, rawState)
      : null;
    if (body.onlyBots === false) {
      const canControlHuman =
        room.ownerId === authPlayerId ||
        Boolean(
          currentActingId &&
            roomManager.canViewerControlActor(
              room,
              authPlayerId,
              currentActingId
            )
        );
      if (!canControlHuman) {
        throw createHttpError(
          403,
          "Only the room host or active seat controller can step a human turn"
        );
      }
    } else if (!isViewerSeatedOrOwnerPure(room, authPlayerId)) {
      throw createHttpError(
        403,
        "Only seated players or room host can step bots"
      );
    }
    const prevStatus = room.status;
    const result = roomManager.stepBot(roomId, {
      onlyBots: body.onlyBots !== false,
    });
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      result.state,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      actedPlayerId: result.actedPlayerId,
      action: result.action ? { type: result.action.type } : null,
      state: view,
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "auto-bots") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const currentRoom = roomManager.getRoom(roomId);
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can toggle auto-bots");
    }
    const room = roomManager.setRoomAutoStepBots(roomId, Boolean(body.enabled));
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots) {
      hub.scheduleRoomBotTurn(roomId);
    } else {
      hub.clearRoomBotTimer(roomId);
    }
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
    });
    return true;
  }

  if (subRoute === "bot-speed") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const currentRoom = roomManager.getRoom(roomId);
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can change bot move pace");
    }
    const rawDelay = Number(body.botStepDelayMs);
    if (!Number.isFinite(rawDelay)) {
      throw createHttpError(400, "botStepDelayMs must be a finite number");
    }
    const room = roomManager.setRoomBotStepDelay(roomId, rawDelay);
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots && room.status === "in_progress") {
      hub.scheduleRoomBotTurn(roomId);
    }
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
    });
    return true;
  }

  if (subRoute === "finish-setup") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const currentRoom = roomManager.getRoom(roomId);
    if (
      currentRoom.ownerId !== authPlayerId &&
      !isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)
    ) {
      throw createHttpError(403, "Only seated players can auto-place setup");
    }
    if (currentRoom.ownerId && currentRoom.ownerId !== authPlayerId) {
      throw createHttpError(403, "Only the room host can auto-place setup");
    }
    const prevStatus = currentRoom.status;
    const nextState = roomManager.finishCatanSetupWithBots(roomId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "undo") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const currentRoom = roomManager.getRoom(roomId);
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can undo");
    }
    const nextState = roomManager.undoAction(roomId, authPlayerId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "redo") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertRequesterMatchesAuth(body.requesterId, authPlayerId);
    const currentRoom = roomManager.getRoom(roomId);
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can redo");
    }
    const nextState = roomManager.redoAction(roomId, authPlayerId);
    const room = roomManager.getRoom(roomId);
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      authPlayerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  return false;
}
