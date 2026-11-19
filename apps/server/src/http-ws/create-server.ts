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
import {
  type GuestSessionStore,
  createGuestSessionStore,
} from "./guest-sessions.ts";
import { handleApiRequest } from "./http-routes.ts";
import { createRealtimeHub } from "./realtime-hub.ts";
import { sendJson, tryServeStaticFile } from "./viewer-and-static.ts";

export function createPlatformServer(): {
  server: http.Server;
  roomManager: PlatformRoomManager;
  guestSessions: GuestSessionStore;
  sweepAbandonedRooms: (nowMs?: number, maxIdleMs?: number) => string[];
  checkWsHeartbeats: (nowMs?: number, timeoutMs?: number) => string[];
} {
  const roomManager = createPlatformRoomManager();
  const guestSessions = createGuestSessionStore();
  const hub = createRealtimeHub(roomManager, guestSessions);

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

      const handled = await handleApiRequest(
        req,
        res,
        url,
        roomManager,
        hub,
        guestSessions
      );
      if (handled) {
        return;
      }

      // Serve static files from apps/web/public
      if (tryServeStaticFile(res, PUBLIC_DIR, url.pathname)) {
        return;
      }

      sendJson(res, 404, { error: `Not found: ${url.pathname}` });
    } catch (err: any) {
      const status =
        typeof err?.statusCode === "number" && err.statusCode >= 400
          ? err.statusCode
          : 400;
      sendJson(res, status, { error: err?.message ?? String(err) });
    }
  });

  // RFC 6455 WebSocket upgrade handler (zero external runtime dependency)
  server.on("upgrade", (req, socket, head) => {
    hub.handleUpgrade(req, socket, head);
  });

  const sweepTimer = setInterval(() => {
    hub.sweepAbandonedRooms();
    const activePlayerIds = new Set<string>(hub.getConnectedPlayerIds());
    for (const r of Object.values(roomManager.getStateSnapshot().rooms)) {
      if (r.ownerId) activePlayerIds.add(r.ownerId);
      for (const p of r.humanPlayers) {
        activePlayerIds.add(p.id);
        if (p.controllerId) activePlayerIds.add(p.controllerId);
      }
    }
    guestSessions.pruneIdleSessions(activePlayerIds);
  }, ABANDONED_ROOM_SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();

  server.on("close", () => {
    clearInterval(sweepTimer);
    hub.shutdown();
  });

  return {
    server,
    roomManager,
    guestSessions,
    sweepAbandonedRooms: hub.sweepAbandonedRooms,
    checkWsHeartbeats: hub.checkHeartbeats,
  };
}
