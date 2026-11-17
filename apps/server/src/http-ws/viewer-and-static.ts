import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import type { RoomInstance } from "../room-manager.ts";

export const MIME_TYPES: Readonly<Record<string, string>> = {
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

export function resolveEffectiveViewerIdPure(
  room: Pick<RoomInstance, "players"> & Partial<Pick<RoomInstance, "gameId">>,
  viewerId: string | null,
  actingId: string | null,
  gameState?: any
): string | null {
  if (!viewerId) return null;
  if (actingId) {
    const actingPlayer = room.players.find((p) => p.id === actingId);
    if (actingPlayer?.controllerId === viewerId) {
      return actingId;
    }
  }
  if (
    room.gameId === "seven_wonders" &&
    gameState?.phase === "AGE_DRAFT" &&
    Array.isArray(gameState.lockedPlayerIds) &&
    gameState.lockedPlayerIds.includes(viewerId)
  ) {
    const unlockedLocal = room.players.find(
      (p) =>
        !p.isBot &&
        p.controllerId === viewerId &&
        !gameState.lockedPlayerIds.includes(p.id)
    );
    if (unlockedLocal) {
      return unlockedLocal.id;
    }
  }
  return viewerId;
}

export function resolveSafeStaticPathPure(
  publicDir: string,
  pathname: string
): string {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, "");
  return path.join(publicDir, safePath);
}

export function tryServeStaticFile(
  res: http.ServerResponse,
  publicDir: string,
  pathname: string
): boolean {
  const filePath = resolveSafeStaticPathPure(publicDir, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

export async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(
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
