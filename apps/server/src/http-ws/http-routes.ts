import type http from "node:http";
import type { PlatformRoomManager, RoomInstance } from "../room-manager.ts";
import {
  buildRedactedStatePayload,
  handleRoomMatchSubRoute,
} from "./http-match-routes.ts";
import type { RealtimeHub } from "./realtime-hub.ts";
import { readJsonBody, sendJson } from "./viewer-and-static.ts";

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
    const rawState = room.session?.getState() ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      body.ownerId ?? null
    );
    hub.broadcastLobbyRooms();
    if (room.status === "in_progress") {
      hub.scheduleRoomBotTurn(room.roomId);
    }
    sendJson(res, 201, {
      room: roomManager.toRoomSummary(room, body.ownerId ?? null),
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
    const rawState = room.session?.getState() ?? null;
    const { actingId, view } = buildRedactedStatePayload(
      roomManager,
      room,
      rawState,
      player.id
    );
    hub.broadcastRoomState(roomId);
    hub.broadcastLobbyRooms();
    sendJson(res, 200, {
      player,
      room: roomManager.toRoomSummary(room, player.id),
      state: view,
      actingPlayerId: actingId,
    });
    return true;
  }

  if (subRoute === "leave" && req.method === "POST") {
    const body = await readJsonBody(req);
    const room = roomManager.leaveRoom(roomId, body.playerId);
    if (!room) {
      hub.notifyRoomClosed(roomId);
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

  return handleRoomMatchSubRoute(req, res, roomId, subRoute, roomManager, hub);
}
