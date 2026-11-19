import type http from "node:http";
import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import {
  type GuestSessionStore,
  createHttpError,
} from "./guest-sessions.ts";
import {
  buildRedactedStatePayload,
  handleRoomMatchSubRoute,
} from "./http-match-routes.ts";
import type { RealtimeHub } from "./realtime-hub.ts";
import { readJsonBody, sendJson } from "./viewer-and-static.ts";

function assertMatchesAuthPlayer(
  claimed: unknown,
  authPlayerId: string,
  fieldName = "playerId"
): void {
  if (typeof claimed === "string" && claimed.trim() && claimed.trim() !== authPlayerId) {
    throw createHttpError(
      403,
      `Authenticated guest does not match ${fieldName}`
    );
  }
}

export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub,
  guestSessions: GuestSessionStore
): Promise<boolean> {
  const pathname = url.pathname;

  if (pathname === "/api/games" && req.method === "GET") {
    sendJson(res, 200, { games: roomManager.registry.list() });
    return true;
  }

  if (pathname === "/api/guests/session" && req.method === "POST") {
    const body = await readJsonBody(req);
    const session = guestSessions.issueSession(
      typeof body.playerId === "string" ? body.playerId : null,
      guestSessions.extractTokenFromReq(req)
    );
    sendJson(res, 200, {
      playerId: session.playerId,
      token: session.token,
      ...(typeof body.playerName === "string" && body.playerName.trim()
        ? { playerName: body.playerName.trim() }
        : {}),
    });
    return true;
  }

  if (pathname === "/api/rooms" && req.method === "GET") {
    const gameFilter = url.searchParams.get("gameId") ?? undefined;
    const viewerId = guestSessions.verifyToken(
      guestSessions.extractTokenFromReq(req)
    );
    sendJson(res, 200, {
      rooms: roomManager
        .listRooms(gameFilter, viewerId)
        .map(hub.enrichSummaryWithPresence),
    });
    return true;
  }

  if (pathname === "/api/guests/signout" && req.method === "POST") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.playerId, authPlayerId, "playerId");

    guestSessions.revokePlayer(authPlayerId);
    hub.signOutGuestConnections(authPlayerId);

    const result = roomManager.signOutGuest(authPlayerId);
    result.closedRoomIds.forEach((id) => hub.notifyRoomClosed(id));
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
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.playerId, authPlayerId, "playerId");
    const rawName = typeof body.newName === "string" ? body.newName : "";
    const renamed = roomManager.renameGuest(authPlayerId, rawName);
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
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.ownerId, authPlayerId, "ownerId");
    const room = roomManager.createRoom({ ...body, ownerId: authPlayerId });
    const rawState = room.session?.getState() ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      authPlayerId
    );
    hub.refreshRoomDisconnectClock(room.roomId);
    hub.broadcastLobbyRooms();
    if (room.status === "in_progress") {
      hub.scheduleRoomBotTurn(room.roomId);
    }
    sendJson(res, 201, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
  if (!roomMatch) {
    return false;
  }

  const rawRoomId = decodeURIComponent(roomMatch[1]!);
  let targetRoom: RoomInstance;
  try {
    targetRoom = roomManager.getRoom(rawRoomId);
  } catch (err: any) {
    sendJson(res, 404, {
      error: err?.message ?? `Room "${rawRoomId}" not found`,
      code: "ROOM_NOT_FOUND",
    });
    return true;
  }
  const roomId = targetRoom.roomId;
  const subRoute = roomMatch[2] ?? "";

  if (!subRoute && req.method === "GET") {
    const room = roomManager.getRoom(roomId);
    const viewerId = guestSessions.verifyToken(
      guestSessions.extractTokenFromReq(req)
    );
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
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.requesterId, authPlayerId, "requesterId");
    const updated = roomManager.updateRoomSetup(roomId, authPlayerId, body);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(updated, authPlayerId)
      ),
    });
    return true;
  }

  if (subRoute === "local-players" && req.method === "POST") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.requesterId, authPlayerId, "requesterId");
    const player = roomManager.addLocalPlayer(
      roomId,
      authPlayerId,
      body.playerName ?? ""
    );
    const room = roomManager.getRoom(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      player,
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
    });
    return true;
  }

  if (subRoute === "remove-player" && req.method === "POST") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.requesterId, authPlayerId, "requesterId");
    const room = roomManager.removeLocalPlayer(
      roomId,
      authPlayerId,
      body.targetPlayerId
    );
    if (typeof body.targetPlayerId === "string" && body.targetPlayerId.trim()) {
      hub.evictPlayerFromRoom(roomId, body.targetPlayerId.trim());
    }
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
    });
    return true;
  }

  if (subRoute === "join" && req.method === "POST") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    const isBot = Boolean(body.isBot);
    if (isBot) {
      if (targetRoom.ownerId && targetRoom.ownerId !== authPlayerId) {
        throw createHttpError(403, "Only the room owner can add bots");
      }
    } else {
      assertMatchesAuthPlayer(body.playerId, authPlayerId, "playerId");
    }
    const player = roomManager.joinRoom(
      roomId,
      body.playerName ?? "Guest",
      isBot,
      isBot ? undefined : authPlayerId
    );
    const room = roomManager.getRoom(roomId);
    const rawState = room.session?.getState() ?? null;
    const viewerId = isBot ? authPlayerId : player.id;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      viewerId
    );
    hub.refreshRoomDisconnectClock(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      player,
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, viewerId)
      ),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "leave" && req.method === "POST") {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body.playerId, authPlayerId, "playerId");
    const room = roomManager.leaveRoom(roomId, authPlayerId);
    if (!room) {
      hub.notifyRoomClosed(roomId);
      hub.broadcastLobbyRooms();
      sendJson(res, 200, { closed: true, room: null });
      return true;
    }
    const stillSeated = room.humanPlayers.some((p) => p.id === authPlayerId);
    if (!stillSeated) {
      hub.removePlayerRoomPresence(roomId, authPlayerId);
    }
    hub.refreshRoomDisconnectClock(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      closed: false,
      room: hub.enrichSummaryWithPresence(
        roomManager.toRoomSummary(room, authPlayerId)
      ),
    });
    return true;
  }

  return handleRoomMatchSubRoute(
    req,
    res,
    roomId,
    subRoute,
    roomManager,
    hub,
    guestSessions
  );
}
