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
  isViewerSeatedOrOwnerPure,
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

export function assertMatchesAuthPlayer(
  claimed: unknown,
  authPlayerId: string,
  fieldName = "requesterId"
): void {
  if (
    typeof claimed === "string" &&
    claimed.trim() &&
    claimed.trim() !== authPlayerId
  ) {
    throw createHttpError(
      403,
      `Authenticated guest does not match ${fieldName}`
    );
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

  const MATCH_ROUTES = new Set([
    "start",
    "action",
    "bot-step",
    "auto-bots",
    "bot-speed",
    "finish-setup",
    "undo",
    "redo",
  ]);
  if (!MATCH_ROUTES.has(subRoute)) return false;

  const authPlayerId = guestSessions.requireAuthPlayerId(req);
  const body = await readJsonBody(req);
  assertMatchesAuthPlayer(body.requesterId, authPlayerId, "requesterId");

  const enrichRoom = (room: RoomInstance) =>
    hub.enrichSummaryWithPresence(roomManager.toRoomSummary(room, authPlayerId));

  const replyMatchState = (
    room: RoomInstance,
    nextState: any,
    opts: { broadcastLobby: boolean; extra?: Record<string, unknown> }
  ): true => {
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      authPlayerId
    );
    hub.touchRoomActivity(roomId);
    hub.broadcastRoomState(roomId);
    if (opts.broadcastLobby) hub.broadcastLobbyRooms();
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      ...opts.extra,
      room: enrichRoom(room),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  };

  if (subRoute === "start") {
    const rawState = roomManager.startGame(roomId, authPlayerId);
    return replyMatchState(roomManager.getRoom(roomId), rawState, {
      broadcastLobby: true,
    });
  }

  const currentRoom = roomManager.getRoom(roomId);
  const prevStatus = currentRoom.status;

  if (subRoute === "action") {
    if (
      !roomManager.canViewerControlActor(
        currentRoom,
        authPlayerId,
        body.playerId
      )
    ) {
      throw createHttpError(403, "You cannot act on behalf of another player");
    }
    const nextState = roomManager.dispatchAction(
      roomId,
      body.playerId,
      body.action
    );
    return replyMatchState(currentRoom, nextState, {
      broadcastLobby: currentRoom.status !== prevStatus,
    });
  }

  if (subRoute === "bot-step") {
    const rawState = currentRoom.session?.getState() ?? null;
    const currentActingId = rawState
      ? getRoomActingPlayerId(currentRoom.gameId, rawState)
      : null;
    if (body.onlyBots === false) {
      const canControlHuman =
        currentRoom.ownerId === authPlayerId ||
        Boolean(
          currentActingId &&
            roomManager.canViewerControlActor(
              currentRoom,
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
    } else if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(
        403,
        "Only seated players or room host can step bots"
      );
    }
    const result = roomManager.stepBot(roomId, {
      onlyBots: body.onlyBots !== false,
    });
    return replyMatchState(currentRoom, result.state, {
      broadcastLobby: currentRoom.status !== prevStatus,
      extra: {
        actedPlayerId: result.actedPlayerId,
        action: result.action ? { type: result.action.type } : null,
      },
    });
  }

  if (subRoute === "auto-bots") {
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can toggle auto-bots");
    }
    const room = roomManager.setRoomAutoStepBots(roomId, Boolean(body.enabled));
    hub.touchRoomActivity(roomId);
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots) hub.scheduleRoomBotTurn(roomId);
    else hub.clearRoomBotTimer(roomId);
    sendJson(res, 200, { room: enrichRoom(room) });
    return true;
  }

  if (subRoute === "bot-speed") {
    if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
      throw createHttpError(403, "Only seated players can change bot move pace");
    }
    const rawDelay = Number(body.botStepDelayMs);
    if (!Number.isFinite(rawDelay)) {
      throw createHttpError(400, "botStepDelayMs must be a finite number");
    }
    const room = roomManager.setRoomBotStepDelay(roomId, rawDelay);
    hub.touchRoomActivity(roomId);
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots && room.status === "in_progress") {
      hub.scheduleRoomBotTurn(roomId);
    }
    sendJson(res, 200, { room: enrichRoom(room) });
    return true;
  }

  if (subRoute === "finish-setup") {
    if (
      currentRoom.ownerId !== authPlayerId &&
      !isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)
    ) {
      throw createHttpError(403, "Only seated players can auto-place setup");
    }
    if (currentRoom.ownerId && currentRoom.ownerId !== authPlayerId) {
      throw createHttpError(403, "Only the room host can auto-place setup");
    }
    const nextState = roomManager.finishCatanSetupWithBots(roomId);
    const room = roomManager.getRoom(roomId);
    return replyMatchState(room, nextState, {
      broadcastLobby: room.status !== prevStatus,
    });
  }

  if (!isViewerSeatedOrOwnerPure(currentRoom, authPlayerId)) {
    throw createHttpError(403, `Only seated players can ${subRoute}`);
  }
  const nextState =
    subRoute === "undo"
      ? roomManager.undoAction(roomId, authPlayerId)
      : roomManager.redoAction(roomId, authPlayerId);
  return replyMatchState(roomManager.getRoom(roomId), nextState, {
    broadcastLobby: true,
  });
}
