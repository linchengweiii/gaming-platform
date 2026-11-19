import fs from "node:fs";
import type http from "node:http";
import path from "node:path";
import { MAX_HTTP_BODY_BYTES } from "../config.ts";
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

const REVALIDATE_EXTENSIONS = new Set([".html", ".css", ".js", ".mjs"]);

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
  const offerProposerId = gameState?.activeTradeOffer?.fromPlayerId;
  if (typeof offerProposerId === "string" && offerProposerId) {
    const proposer = room.players.find((p) => p.id === offerProposerId);
    if (proposer?.id === viewerId || proposer?.controllerId === viewerId) {
      return offerProposerId;
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
  const rootResolved = path.resolve(publicDir);
  const relativePath =
    pathname === "/" ? "index.html" : pathname.replace(/^[/\\]+/, "");
  const resolved = path.resolve(rootResolved, relativePath);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    return "";
  }
  return resolved;
}

export function tryServeStaticFile(
  res: http.ServerResponse,
  publicDir: string,
  pathname: string
): boolean {
  const filePath = resolveSafeStaticPathPure(publicDir, pathname);
  if (!filePath) return false;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const headers: Record<string, string> = {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    };
    if (REVALIDATE_EXTENSIONS.has(ext)) {
      headers["Cache-Control"] = "no-cache";
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });
    stream.pipe(res);
    return true;
  }
  return false;
}

export async function readJsonBody(
  req: http.IncomingMessage,
  maxBytes: number = MAX_HTTP_BODY_BYTES
): Promise<any> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new Error("Request body exceeds maximum size limit");
    }
    chunks.push(buf);
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
    "Access-Control-Allow-Headers": "Content-Type, X-Guest-Token, Authorization",
  });
  res.end(JSON.stringify(data));
}
