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

function buildRedactedStatePayload(
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

export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub
): Promise<boolean> {
  const pathname = url.pathname;

  if (pathname === "/api/games" && req.method === "GET") {
    sendJson(res, 200, { games: roomManager.registry.list() });
    return true;
  }

  if (pathname === "/api/rooms" && req.method === "GET") {
    const gameFilter = url.searchParams.get("gameId") ?? undefined;
    const viewerId = url.searchParams.get("playerId");
    sendJson(res, 200, {
      rooms: roomManager
        .listRooms(gameFilter, viewerId)
        .map(hub.enrichSummaryWithPresence),
    });
    return true;
  }

  if (pathname === "/api/guests/signout" && req.method === "POST") {
    const body = await readJsonBody(req);
    const playerId =
      typeof body.playerId === "string" ? body.playerId.trim() : "";
    if (!playerId) {
      sendJson(res, 400, { error: "Missing playerId" });
      return true;
    }
    hub.signOutGuestConnections(playerId);

    const result = roomManager.signOutGuest(playerId);
    result.closedRoomIds.forEach((id) => hub.cleanupDeletedRoomMeta(id));
    result.updatedRoomIds.forEach((id) => {
      hub.refreshRoomDisconnectClock(id);
      hub.broadcastRoomState(id);
      hub.scheduleRoomBotTurn(id);
    });
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      ok: true,
      closedRoomIds: result.closedRoomIds,
      updatedRoomIds: result.updatedRoomIds,
    });
    return true;
  }

  if (pathname === "/api/guests/rename" && req.method === "POST") {
    const body = await readJsonBody(req);
    const playerId =
      typeof body.playerId === "string" ? body.playerId.trim() : "";
    const rawName = typeof body.newName === "string" ? body.newName : "";
    if (!playerId) {
      sendJson(res, 400, { error: "Missing playerId" });
      return true;
    }
    const renamed = roomManager.renameGuest(playerId, rawName);
    renamed.updatedRoomIds.forEach((id) => hub.broadcastRoomState(id));
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      ok: true,
      name: renamed.cleanName,
      updatedRoomIds: renamed.updatedRoomIds,
    });
    return true;
  }

  if (pathname === "/api/rooms" && req.method === "POST") {
    const body = await readJsonBody(req);
    const room = roomManager.createRoom(body);
    const engine = roomManager.registry.get(room.gameId);
    const rawState = room.session?.getState() ?? null;
    const view = rawState
      ? engine.getPlayerView(rawState, body.ownerId ?? null)
      : null;
    hub.broadcastLobbyRooms();
    if (room.status === "in_progress") {
      hub.scheduleRoomBotTurn(room.roomId);
    }
    sendJson(res, 201, {
      room: roomManager.toRoomSummary(room, body.ownerId ?? null),
      state: view,
      actingPlayerId: rawState
        ? getRoomActingPlayerId(room.gameId, rawState)
        : null,
    });
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
  if (!roomMatch) {
    return false;
  }

  const rawRoomId = decodeURIComponent(roomMatch[1]!);
  const roomId = roomManager.getRoom(rawRoomId).roomId;
  const subRoute = roomMatch[2] ?? "";

  if (!subRoute && req.method === "GET") {
    const room = roomManager.getRoom(roomId);
    const viewerId = url.searchParams.get("playerId");
    const state = room.session?.getState() ?? null;
    const { actingId: actingPlayerId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      state,
      viewerId
    );
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, viewerId)
      ),
      state: view,
      actingPlayerId,
    });
    return true;
  }

  if (subRoute === "setup" && req.method === "POST") {
    const body = await readJsonBody(req);
    const updated = roomManager.updateRoomSetup(roomId, body.requesterId, body);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(updated, body.requesterId ?? null),
    });
    return true;
  }

  if (subRoute === "local-players" && req.method === "POST") {
    const body = await readJsonBody(req);
    const player = roomManager.addLocalPlayer(
      roomId,
      body.requesterId,
      body.playerName ?? ""
    );
    const room = roomManager.getRoom(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      player,
      room: roomManager.toRoomSummary(room, body.requesterId ?? null),
    });
    return true;
  }

  if (subRoute === "remove-player" && req.method === "POST") {
    const body = await readJsonBody(req);
    const room = roomManager.removeLocalPlayer(
      roomId,
      body.requesterId,
      body.targetPlayerId
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, body.requesterId ?? null),
    });
    return true;
  }

  if (subRoute === "join" && req.method === "POST") {
    const body = await readJsonBody(req);
    const player = roomManager.joinRoom(
      roomId,
      body.playerName ?? "Guest",
      Boolean(body.isBot),
      body.playerId
    );
    const room = roomManager.getRoom(roomId);
    const engine = roomManager.registry.get(room.gameId);
    const rawState = room.session?.getState() ?? null;
    const view = rawState ? engine.getPlayerView(rawState, player.id) : null;
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      player,
      room: roomManager.toRoomSummary(room, player.id),
      state: view,
      actingPlayerId: rawState
        ? getRoomActingPlayerId(room.gameId, rawState)
        : null,
    });
    return true;
  }

  if (subRoute === "leave" && req.method === "POST") {
    const body = await readJsonBody(req);
    const room = roomManager.leaveRoom(roomId, body.playerId);
    if (!room) {
      hub.cleanupDeletedRoomMeta(roomId);
      hub.broadcastLobbyRooms();
      sendJson(res, 200, { closed: true, room: null });
      return true;
    }
    hub.removePlayerRoomPresence(roomId, body.playerId);
    hub.refreshRoomDisconnectClock(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      closed: false,
      room: roomManager.toRoomSummary(room, body.playerId ?? null),
    });
    return true;
  }

  if (subRoute === "start" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
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

  if (subRoute === "action" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
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

  if (subRoute === "bot-step" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
    const room = roomManager.getRoom(roomId);
    const prevStatus = room.status;
    const result = roomManager.stepBot(roomId, {
      onlyBots: body.onlyBots !== false,
    });
    const viewerId = body.requesterId ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      result.state,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    if (room.status !== prevStatus) {
      hub.broadcastLobbyRooms();
    }
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      ...result,
      state: view,
      room: roomManager.toRoomSummary(room, viewerId),
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "auto-bots" && req.method === "POST") {
    const body = await readJsonBody(req);
    const room = roomManager.setRoomAutoStepBots(roomId, Boolean(body.enabled));
    hub.broadcastRoomState(roomId);
    if (room.autoStepBots) {
      hub.scheduleRoomBotTurn(roomId);
    } else {
      hub.clearRoomBotTimer(roomId);
    }
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, body.requesterId ?? null),
    });
    return true;
  }

  if (subRoute === "finish-setup" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
    const nextState = roomManager.finishCatanSetupWithBots(roomId);
    const room = roomManager.getRoom(roomId);
    const viewerId = body.requesterId ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      nextState,
      viewerId
    );
    hub.broadcastRoomState(roomId);
    hub.scheduleRoomBotTurn(roomId);
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "undo" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
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
    sendJson(res, 200, {
      room: roomManager.toRoomSummary(room, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "redo" && req.method === "POST") {
    const body = await readJsonBody(req);
    hub.clearRoomBotTimer(roomId);
    const viewerId = body.requesterId ?? null;
    const room = roomManager.getRoom(roomId);
    const nextState = roomManager.redoAction(roomId, viewerId);
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
