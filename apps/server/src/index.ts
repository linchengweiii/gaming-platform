import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  PlatformRoomManager,
  getRoomActingPlayerId,
} from "./room-manager.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../../web/public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

interface WsClient {
  id: string;
  socket: Duplex;
  roomId: string | null;
  playerId: string | null;
}

export function createPlatformServer() {
  const roomManager = new PlatformRoomManager();
  const wsClients = new Set<WsClient>();
  const roomBotTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function resolveEffectiveViewerId(
    room: ReturnType<PlatformRoomManager["getRoom"]>,
    viewerId: string | null,
    actingId: string | null
  ): string | null {
    if (!viewerId) return null;
    if (actingId) {
      const actingPlayer = room.players.find((p) => p.id === actingId);
      if (actingPlayer?.controllerId === viewerId) {
        return actingId;
      }
    }
    return viewerId;
  }

  function sendWsFrame(socket: Duplex, payload: unknown): void {
    if (socket.destroyed || !socket.writable) return;
    const json = Buffer.from(JSON.stringify(payload), "utf8");
    const len = json.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text frame
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, json]));
  }

  function broadcastLobbyRooms(): void {
    const rooms = roomManager.listRooms();
    for (const client of wsClients) {
      sendWsFrame(client.socket, {
        type: "LOBBY_ROOMS",
        rooms,
      });
    }
  }

  function broadcastRoomState(roomId: string): void {
    let room;
    try {
      room = roomManager.getRoom(roomId);
    } catch {
      return;
    }
    const engine = roomManager.registry.get(room.gameId);
    const state = room.session?.getState() ?? null;
    const actingId = state ? getRoomActingPlayerId(room.gameId, state) : null;
    for (const client of wsClients) {
      if (client.roomId === roomId) {
        const effectiveViewerId = resolveEffectiveViewerId(
          room,
          client.playerId,
          actingId
        );
        const summary = roomManager.toRoomSummary(room, client.playerId);
        const view = state
          ? engine.getPlayerView(state, effectiveViewerId)
          : null;
        const legalActions =
          state && actingId
            ? engine.getLegalActions(state, effectiveViewerId ?? actingId)
            : [];
        sendWsFrame(client.socket, {
          type: "ROOM_STATE",
          roomId,
          room: summary,
          state: view,
          actingPlayerId: actingId,
          legalActions,
        });
      }
    }
  }

  function clearRoomBotTimer(roomId: string): void {
    const prev = roomBotTimers.get(roomId);
    if (prev) {
      clearTimeout(prev);
      roomBotTimers.delete(roomId);
    }
  }

  function scheduleRoomBotTurn(roomId: string): void {
    clearRoomBotTimer(roomId);
    let room;
    try {
      room = roomManager.getRoom(roomId);
    } catch {
      return;
    }
    if (!room.autoStepBots || room.status !== "in_progress" || !room.session) {
      return;
    }
    const state = room.session.getState();
    if (!state || state.phase === "GAME_OVER") return;
    const actingId = getRoomActingPlayerId(room.gameId, state);
    if (!actingId) return;
    const actor = state.players.find((p: any) => p.id === actingId);
    if (!actor || !actor.isBot) return;

    const timer = setTimeout(() => {
      roomBotTimers.delete(roomId);
      try {
        const current = roomManager.getRoom(roomId);
        if (!current.autoStepBots || current.status !== "in_progress") return;
        const prevStatus = current.status;
        const res = roomManager.stepBot(roomId);
        if (res.actedPlayerId) {
          broadcastRoomState(roomId);
          if (current.status !== prevStatus) {
            broadcastLobbyRooms();
          }
          scheduleRoomBotTurn(roomId);
        }
      } catch {
        // Ignore stopped or replaced match errors
      }
    }, 150);
    roomBotTimers.set(roomId, timer);
  }

  async function readJsonBody(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }

  function sendJson(
    res: http.ServerResponse,
    status: number,
    data: unknown
  ): void {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
  }

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 200, { ok: true });
        return;
      }

      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`
      );
      const pathname = url.pathname;

      // API routes
      if (pathname === "/api/games" && req.method === "GET") {
        sendJson(res, 200, { games: roomManager.registry.list() });
        return;
      }

      if (pathname === "/api/rooms" && req.method === "GET") {
        const gameFilter = url.searchParams.get("gameId") ?? undefined;
        sendJson(res, 200, { rooms: roomManager.listRooms(gameFilter) });
        return;
      }

      if (pathname === "/api/rooms" && req.method === "POST") {
        const body = await readJsonBody(req);
        const room = roomManager.createRoom(body);
        const engine = roomManager.registry.get(room.gameId);
        const rawState = room.session?.getState() ?? null;
        const view = rawState
          ? engine.getPlayerView(rawState, body.ownerId ?? null)
          : null;
        broadcastLobbyRooms();
        if (room.status === "in_progress") {
          scheduleRoomBotTurn(room.roomId);
        }
        sendJson(res, 201, {
          room: roomManager.toRoomSummary(room),
          state: view,
          actingPlayerId: rawState
            ? getRoomActingPlayerId(room.gameId, rawState)
            : null,
        });
        return;
      }

      const roomMatch = pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
      if (roomMatch) {
        const roomId = roomMatch[1]!;
        const subRoute = roomMatch[2] ?? "";

        if (!subRoute && req.method === "GET") {
          const room = roomManager.getRoom(roomId);
          const engine = roomManager.registry.get(room.gameId);
          const viewerId = url.searchParams.get("playerId");
          const state = room.session?.getState() ?? null;
          const actingPlayerId = state
            ? getRoomActingPlayerId(room.gameId, state)
            : null;
          const effectiveViewerId = resolveEffectiveViewerId(
            room,
            viewerId,
            actingPlayerId
          );
          const view = state
            ? engine.getPlayerView(state, effectiveViewerId)
            : null;
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(room, viewerId),
            state: view,
            actingPlayerId,
          });
          return;
        }

        if (subRoute === "setup" && req.method === "POST") {
          const body = await readJsonBody(req);
          const updated = roomManager.updateRoomSetup(
            roomId,
            body.requesterId,
            body
          );
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, { room: roomManager.toRoomSummary(updated) });
          return;
        }

        if (subRoute === "local-players" && req.method === "POST") {
          const body = await readJsonBody(req);
          const player = roomManager.addLocalPlayer(
            roomId,
            body.requesterId,
            body.playerName ?? ""
          );
          const room = roomManager.getRoom(roomId);
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, {
            player,
            room: roomManager.toRoomSummary(room),
          });
          return;
        }

        if (subRoute === "remove-player" && req.method === "POST") {
          const body = await readJsonBody(req);
          const room = roomManager.removeLocalPlayer(
            roomId,
            body.requesterId,
            body.targetPlayerId
          );
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, { room: roomManager.toRoomSummary(room) });
          return;
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
          const view = rawState
            ? engine.getPlayerView(rawState, player.id)
            : null;
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, {
            player,
            room: roomManager.toRoomSummary(room),
            state: view,
            actingPlayerId: rawState
              ? getRoomActingPlayerId(room.gameId, rawState)
              : null,
          });
          return;
        }

        if (subRoute === "leave" && req.method === "POST") {
          const body = await readJsonBody(req);
          const room = roomManager.leaveRoom(roomId, body.playerId);
          if (!room) {
            clearRoomBotTimer(roomId);
            broadcastLobbyRooms();
            sendJson(res, 200, { closed: true, room: null });
            return;
          }
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, {
            closed: false,
            room: roomManager.toRoomSummary(room),
          });
          return;
        }

        if (subRoute === "start" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const rawState = roomManager.startGame(roomId, body.requesterId);
          const room = roomManager.getRoom(roomId);
          const engine = roomManager.registry.get(room.gameId);
          const view = engine.getPlayerView(
            rawState,
            body.requesterId ?? null
          );
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          scheduleRoomBotTurn(roomId);
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(room),
            state: view,
            actingPlayerId: getRoomActingPlayerId(room.gameId, rawState),
          });
          return;
        }

        if (subRoute === "action" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const room = roomManager.getRoom(roomId);
          if (
            body.requesterId &&
            !roomManager.canViewerControlActor(
              room,
              body.requesterId,
              body.playerId
            )
          ) {
            throw new Error("You cannot act on behalf of another player");
          }
          const prevStatus = room.status;
          const nextState = roomManager.dispatchAction(
            roomId,
            body.playerId,
            body.action
          );
          const engine = roomManager.registry.get(room.gameId);
          const actingId = getRoomActingPlayerId(room.gameId, nextState);
          const effectiveViewerId = resolveEffectiveViewerId(
            room,
            body.requesterId ?? body.playerId ?? null,
            actingId
          );
          const view = engine.getPlayerView(nextState, effectiveViewerId);
          broadcastRoomState(roomId);
          if (room.status !== prevStatus) {
            broadcastLobbyRooms();
          }
          scheduleRoomBotTurn(roomId);
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(
              room,
              body.requesterId ?? body.playerId ?? null
            ),
            state: view,
            actingPlayerId: actingId,
          });
          return;
        }

        if (subRoute === "bot-step" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const room = roomManager.getRoom(roomId);
          const prevStatus = room.status;
          const result = roomManager.stepBot(roomId);
          const engine = roomManager.registry.get(room.gameId);
          const actingId = result.state
            ? getRoomActingPlayerId(room.gameId, result.state)
            : null;
          const effectiveViewerId = resolveEffectiveViewerId(
            room,
            body.requesterId ?? null,
            actingId
          );
          broadcastRoomState(roomId);
          if (room.status !== prevStatus) {
            broadcastLobbyRooms();
          }
          sendJson(res, 200, {
            ...result,
            state: result.state
              ? engine.getPlayerView(result.state, effectiveViewerId)
              : null,
            room: roomManager.toRoomSummary(room, body.requesterId ?? null),
            actingPlayerId: actingId,
          });
          return;
        }

        if (subRoute === "auto-bots" && req.method === "POST") {
          const body = await readJsonBody(req);
          const room = roomManager.getRoom(roomId);
          room.autoStepBots = Boolean(body.enabled);
          broadcastRoomState(roomId);
          if (room.autoStepBots) {
            scheduleRoomBotTurn(roomId);
          } else {
            clearRoomBotTimer(roomId);
          }
          sendJson(res, 200, { room: roomManager.toRoomSummary(room) });
          return;
        }

        if (subRoute === "finish-setup" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const nextState = roomManager.finishCatanSetupWithBots(roomId);
          const room = roomManager.getRoom(roomId);
          const engine = roomManager.registry.get(room.gameId);
          const view = engine.getPlayerView(
            nextState,
            body.requesterId ?? null
          );
          broadcastRoomState(roomId);
          scheduleRoomBotTurn(roomId);
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(room),
            state: view,
            actingPlayerId: getRoomActingPlayerId(room.gameId, nextState),
          });
          return;
        }

        if (subRoute === "undo" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const room = roomManager.getRoom(roomId);
          const nextState = roomManager.undoAction(
            roomId,
            body.requesterId ?? null
          );
          room.autoStepBots = false;
          const engine = roomManager.registry.get(room.gameId);
          const actingId = getRoomActingPlayerId(room.gameId, nextState);
          const effectiveViewerId = resolveEffectiveViewerId(
            room,
            body.requesterId ?? null,
            actingId
          );
          const view = engine.getPlayerView(nextState, effectiveViewerId);
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(room, body.requesterId ?? null),
            state: view,
            actingPlayerId: actingId,
          });
          return;
        }

        if (subRoute === "redo" && req.method === "POST") {
          const body = await readJsonBody(req);
          clearRoomBotTimer(roomId);
          const room = roomManager.getRoom(roomId);
          const nextState = roomManager.redoAction(
            roomId,
            body.requesterId ?? null
          );
          const engine = roomManager.registry.get(room.gameId);
          const actingId = getRoomActingPlayerId(room.gameId, nextState);
          const effectiveViewerId = resolveEffectiveViewerId(
            room,
            body.requesterId ?? null,
            actingId
          );
          const view = engine.getPlayerView(nextState, effectiveViewerId);
          broadcastRoomState(roomId);
          broadcastLobbyRooms();
          sendJson(res, 200, {
            room: roomManager.toRoomSummary(room, body.requesterId ?? null),
            state: view,
            actingPlayerId: actingId,
          });
          return;
        }
      }

      // Serve static files from apps/web/public
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const safePath = path
        .normalize(relativePath)
        .replace(/^(\.\.(\/|\\|$))+/, "");
      const filePath = path.join(PUBLIC_DIR, safePath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.writeHead(200, {
          "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      sendJson(res, 404, { error: `Not found: ${pathname}` });
    } catch (err: any) {
      sendJson(res, 400, { error: err?.message ?? String(err) });
    }
  });

  server.on("close", () => {
    for (const timer of roomBotTimers.values()) {
      clearTimeout(timer);
    }
    roomBotTimers.clear();
    for (const client of wsClients) {
      client.socket.destroy();
    }
    wsClients.clear();
  });

  // RFC 6455 WebSocket upgrade handler (zero external runtime dependency)
  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key || typeof key !== "string") {
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash("sha1")
      .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "\r\n",
      ].join("\r\n")
    );

    const client: WsClient = {
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      socket,
      roomId: null,
      playerId: null,
    };
    wsClients.add(client);

    // Send initial lobby rooms snapshot immediately on WS connect
    sendWsFrame(socket, {
      type: "LOBBY_ROOMS",
      rooms: roomManager.listRooms(),
    });

    socket.on("data", (buffer: Buffer) => {
      try {
        let cursor = 0;
        while (cursor + 2 <= buffer.length) {
          const opcode = buffer[cursor]! & 0x0f;
          if (opcode === 0x08) {
            wsClients.delete(client);
            socket.end();
            return;
          }

          const isMasked = Boolean(buffer[cursor + 1]! & 0x80);
          let payloadLen = buffer[cursor + 1]! & 0x7f;
          let offset = cursor + 2;
          if (payloadLen === 126) {
            if (offset + 2 > buffer.length) break;
            payloadLen = buffer.readUInt16BE(offset);
            offset += 2;
          } else if (payloadLen === 127) {
            if (offset + 8 > buffer.length) break;
            payloadLen = Number(buffer.readBigUInt64BE(offset));
            offset += 8;
          }

          const totalNeeded = offset + (isMasked ? 4 : 0) + payloadLen;
          if (totalNeeded > buffer.length) break;

          if (opcode === 0x01) {
            const payload = Buffer.alloc(payloadLen);
            if (isMasked) {
              const mask = buffer.subarray(offset, offset + 4);
              const dataStart = offset + 4;
              for (let i = 0; i < payloadLen; i++) {
                payload[i] = buffer[dataStart + i]! ^ mask[i % 4]!;
              }
            } else {
              buffer.copy(payload, 0, offset, offset + payloadLen);
            }

            const msg = JSON.parse(payload.toString("utf8"));
            if (msg.type === "SUBSCRIBE_ROOM") {
              client.roomId = msg.roomId ?? null;
              client.playerId = msg.playerId ?? null;
              if (client.roomId) {
                broadcastRoomState(client.roomId);
              }
            } else if (msg.type === "UNSUBSCRIBE_ROOM") {
              client.roomId = null;
            } else if (msg.type === "DISPATCH_ACTION" && client.roomId) {
              clearRoomBotTimer(client.roomId);
              roomManager.dispatchAction(
                client.roomId,
                msg.playerId,
                msg.action
              );
              broadcastRoomState(client.roomId);
              scheduleRoomBotTurn(client.roomId);
            } else if (msg.type === "STEP_BOT" && client.roomId) {
              clearRoomBotTimer(client.roomId);
              roomManager.stepBot(client.roomId);
              broadcastRoomState(client.roomId);
            }
          }
          cursor = totalNeeded;
        }
      } catch (err: any) {
        sendWsFrame(socket, {
          type: "ERROR",
          error: err?.message ?? String(err),
        });
      }
    });

    socket.on("close", () => wsClients.delete(client));
    socket.on("error", () => wsClients.delete(client));
  });

  return { server, roomManager };
}

// Start HTTP server if executed directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("apps/server/src/index.ts");

if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const { server } = createPlatformServer();
  server.listen(port, () => {
    console.log(
      `🎲 Gaming Platform Server listening on http://localhost:${port}`
    );
  });
}
