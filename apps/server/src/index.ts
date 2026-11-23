import http from "node:http";
import {
  ABANDONED_ROOM_SWEEP_INTERVAL_MS,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  PUBLIC_DIR,
} from "./config.ts";
import { attachBunNativeTransport } from "./http-ws/bun-http-bridge.ts";
import {
  type GuestSessionStore,
  createGuestSessionStore,
} from "./http-ws/guest-sessions.ts";
import { handleHttpRequest } from "./http-ws/http-routes.ts";
import { createRealtimeHub } from "./http-ws/realtime-hub.ts";
import { tryServeStaticFile } from "./http-ws/viewer-and-static.ts";
import {
  type PlatformRoomManager,
  createPlatformRoomManager,
} from "./room-manager.ts";

export {
  decodeWsFramesPure,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
} from "./http-ws/ws-protocol.ts";
export { resolveEffectiveViewerIdPure } from "./http-ws/viewer-and-static.ts";

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
    await handleHttpRequest(
      req,
      res,
      roomManager,
      hub,
      guestSessions,
      (pathname) => tryServeStaticFile(res, PUBLIC_DIR, pathname)
    );
  });

  // RFC 6455 WebSocket upgrade handler (Node.js raw socket + synthetic test upgrades)
  server.on("upgrade", (req, socket, head) => {
    hub.handleUpgrade(req, socket, head);
  });

  // Under Bun, node:http upgrade passes a no-op socket; use Bun.serve native HTTP + WebSockets
  attachBunNativeTransport(server, roomManager, hub, guestSessions);

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

export type PlatformServerHandle = ReturnType<typeof createPlatformServer>;

// Start HTTP server if executed directly
const isMain =
  Boolean((import.meta as ImportMeta & { main?: boolean }).main) ||
  import.meta.url === `file://${process.argv[1]}` ||
  Boolean(process.argv[1]?.endsWith("apps/server/src/index.ts"));

if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const { server } = createPlatformServer();
  server.listen(port, () => {
    console.log(
      `🎲 Gaming Platform Server listening on http://${DEFAULT_SERVER_HOST}:${port}`
    );
  });
}
