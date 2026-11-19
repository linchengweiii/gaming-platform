import http from "node:http";
import {
  ABANDONED_ROOM_SWEEP_INTERVAL_MS,
  DEFAULT_SERVER_HOST,
  PUBLIC_DIR,
} from "../config.ts";
import {
  type PlatformRoomManager,
  createPlatformRoomManager,
} from "../room-manager.ts";
import { handleApiRequest } from "./http-routes.ts";
import { createRealtimeHub } from "./realtime-hub.ts";
import { sendJson, tryServeStaticFile } from "./viewer-and-static.ts";

export function createPlatformServer(): {
  server: http.Server;
  roomManager: PlatformRoomManager;
  sweepAbandonedRooms: (nowMs?: number, maxIdleMs?: number) => string[];
  checkWsHeartbeats: (nowMs?: number, timeoutMs?: number) => string[];
} {
  const roomManager = createPlatformRoomManager();
  const hub = createRealtimeHub(roomManager);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 200, { ok: true });
        return;
      }

      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? DEFAULT_SERVER_HOST}`
      );

      const handled = await handleApiRequest(req, res, url, roomManager, hub);
      if (handled) {
        return;
      }

      // Serve static files from apps/web/public
      if (tryServeStaticFile(res, PUBLIC_DIR, url.pathname)) {
        return;
      }

      sendJson(res, 404, { error: `Not found: ${url.pathname}` });
    } catch (err: any) {
      sendJson(res, 400, { error: err?.message ?? String(err) });
    }
  });

  // RFC 6455 WebSocket upgrade handler (zero external runtime dependency)
  server.on("upgrade", (req, socket) => {
    hub.handleUpgrade(req, socket);
  });

  const sweepTimer = setInterval(() => {
    hub.sweepAbandonedRooms();
  }, ABANDONED_ROOM_SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  server.on("close", () => {
    clearInterval(sweepTimer);
    hub.shutdown();
  });

  return {
    server,
    roomManager,
    sweepAbandonedRooms: hub.sweepAbandonedRooms,
    checkWsHeartbeats: hub.checkHeartbeats,
  };
}
