import type http from "node:http";
import { DEFAULT_SERVER_HOST } from "../config.ts";
import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import {
  type GuestSessionStore,
  createHttpError,
} from "./guest-sessions.ts";
import {
  assertMatchesAuthPlayer,
  buildRedactedStatePayload,
  handleRoomMatchSubRoute,
} from "./http-match-routes.ts";
import {
  isViewerSeatedOrOwnerPure,
  readJsonBody,
  sendJson,
} from "./viewer-and-static.ts";
import type { RealtimeHub } from "./ws-hub-types-and-presence.ts";

export async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub,
  guestSessions: GuestSessionStore,
  serveStatic: (pathname: string) => boolean
): Promise<void> {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 200, { ok: true });
      return;
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? DEFAULT_SERVER_HOST}`
    );

    const handled = await handleApiRequest(
      req,
      res,
      url,
      roomManager,
      hub,
      guestSessions
    );
    if (handled || serveStatic(url.pathname)) return;

    sendJson(res, 404, { error: `Not found: ${url.pathname}` });
  } catch (err: any) {
    const status =
      typeof err?.statusCode === "number" && err.statusCode >= 400
        ? err.statusCode
        : 400;
    sendJson(res, status, { error: err?.message ?? String(err) });
  }
}

async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  roomManager: PlatformRoomManager,
  hub: RealtimeHub,
  guestSessions: GuestSessionStore
): Promise<boolean> {
  const pathname = url.pathname;
  const enrichRoom = (room: RoomInstance, viewerId: string | null) =>
    hub.enrichSummaryWithPresence(roomManager.toRoomSummary(room, viewerId));

  const readAuthedPost = async (fieldName: string) => {
    const authPlayerId = guestSessions.requireAuthPlayerId(req);
    const body = await readJsonBody(req);
    assertMatchesAuthPlayer(body[fieldName], authPlayerId, fieldName);
    return { authPlayerId, body };
  };

  if (pathname === "/api/games" && req.method === "GET") {
    sendJson(res, 200, { games: roomManager.registry.list() });
    return true;
  }

  if (pathname === "/api/guests/session" && req.method === "POST") {
    const body = await readJsonBody(req);
    const isIdReserved = (candidateId: string): boolean =>
      Object.values(roomManager.getStateSnapshot().rooms).some(
        (r) =>
          r.ownerId === candidateId ||
          r.humanPlayers.some((p) => p.id === candidateId) ||
          r.players.some((p) => p.id === candidateId)
      );
    const session = guestSessions.issueSession(
      typeof body.playerId === "string" ? body.playerId : null,
      guestSessions.extractTokenFromReq(req),
      isIdReserved
    );
    const cleanName =
      typeof body.playerName === "string" ? body.playerName.trim() : "";
    sendJson(res, 200, {
      playerId: session.playerId,
      token: session.token,
      ...(cleanName ? { playerName: cleanName } : {}),
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
    const { authPlayerId } = await readAuthedPost("playerId");
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
    sendJson(res, 200, { ok: true, ...result });
    return true;
  }

  if (pathname === "/api/guests/rename" && req.method === "POST") {
    const { authPlayerId, body } = await readAuthedPost("playerId");
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
    const { authPlayerId, body } = await readAuthedPost("ownerId");
    const room = roomManager.createRoom({ ...body, ownerId: authPlayerId });
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      room.session?.getState() ?? null,
      authPlayerId
    );
    hub.touchRoomActivity(room.roomId);
    hub.refreshRoomDisconnectClock(room.roomId);
    hub.broadcastLobbyRooms();
    if (room.status === "in_progress") hub.scheduleRoomBotTurn(room.roomId);
    sendJson(res, 201, {
      room: enrichRoom(room, authPlayerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
  if (!roomMatch) return false;

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
    const viewerId = guestSessions.verifyToken(
      guestSessions.extractTokenFromReq(req)
    );
    if (viewerId && isViewerSeatedOrOwnerPure(targetRoom, viewerId)) {
      hub.touchRoomActivity(roomId);
    }
    const { actingId: actingPlayerId, view } = buildRedactedStatePayload(
      roomManager,
      targetRoom,
      targetRoom.session?.getState() ?? null,
      viewerId
    );
    sendJson(res, 200, {
      room: enrichRoom(targetRoom, viewerId),
      state: view,
      actingPlayerId,
    });
    return true;
  }

  const broadcastRoomAndLobby = (): void => {
    hub.touchRoomActivity(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
  };

  if (subRoute === "setup" && req.method === "POST") {
    const { authPlayerId, body } = await readAuthedPost("requesterId");
    const prevHumanIds = targetRoom.humanPlayers.map((p) => p.id);
    const updated = roomManager.updateRoomSetup(roomId, authPlayerId, body);
    const nextHumanIds = new Set(updated.humanPlayers.map((p) => p.id));
    for (const prevId of prevHumanIds) {
      if (!nextHumanIds.has(prevId)) hub.evictPlayerFromRoom(roomId, prevId);
    }
    broadcastRoomAndLobby();
    sendJson(res, 200, { room: enrichRoom(updated, authPlayerId) });
    return true;
  }

  if (subRoute === "local-players" && req.method === "POST") {
    const { authPlayerId, body } = await readAuthedPost("requesterId");
    const player = roomManager.addLocalPlayer(
      roomId,
      authPlayerId,
      body.playerName ?? ""
    );
    broadcastRoomAndLobby();
    sendJson(res, 200, {
      player,
      room: enrichRoom(targetRoom, authPlayerId),
    });
    return true;
  }

  if (subRoute === "remove-player" && req.method === "POST") {
    const { authPlayerId, body } = await readAuthedPost("requesterId");
    const targetId =
      typeof body.targetPlayerId === "string" ? body.targetPlayerId.trim() : "";
    const wasSeated = targetRoom.humanPlayers.some((p) => p.id === targetId);
    const room = roomManager.removeLocalPlayer(roomId, authPlayerId, targetId);
    if (
      targetId &&
      wasSeated &&
      !room.humanPlayers.some((p) => p.id === targetId)
    ) {
      hub.evictPlayerFromRoom(roomId, targetId);
    }
    broadcastRoomAndLobby();
    sendJson(res, 200, { room: enrichRoom(room, authPlayerId) });
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
    const viewerId = isBot ? authPlayerId : player.id;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      targetRoom,
      targetRoom.session?.getState() ?? null,
      viewerId
    );
    hub.refreshRoomDisconnectClock(roomId);
    broadcastRoomAndLobby();
    sendJson(res, 200, {
      player,
      room: enrichRoom(targetRoom, viewerId),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "leave" && req.method === "POST") {
    const { authPlayerId } = await readAuthedPost("playerId");
    const room = roomManager.leaveRoom(roomId, authPlayerId);
    if (!room) {
      hub.notifyRoomClosed(roomId);
      hub.broadcastLobbyRooms();
      sendJson(res, 200, { closed: true, room: null });
      return true;
    }
    if (!room.humanPlayers.some((p) => p.id === authPlayerId)) {
      hub.removePlayerRoomPresence(roomId, authPlayerId);
    }
    hub.refreshRoomDisconnectClock(roomId);
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, { closed: false, room: enrichRoom(room, authPlayerId) });
    return true;
  }

  return handleRoomMatchSubRoute(
    req,
    res,
    targetRoom,
    subRoute,
    roomManager,
    hub,
    guestSessions
  );
}
