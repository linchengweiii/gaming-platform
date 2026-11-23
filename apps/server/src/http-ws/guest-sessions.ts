import crypto from "node:crypto";
import type http from "node:http";

interface HttpStatusError extends Error {
  readonly statusCode: number;
}

export function createHttpError(
  statusCode: number,
  message: string
): HttpStatusError {
  return Object.assign(new Error(message), { statusCode });
}

const RESERVED_SEAT_ID_PATTERN = /^(?:local-|bot-|p\d+$)/i;
const DEFAULT_SESSION_IDLE_MS = 6 * 60 * 60 * 1000;

export interface GuestSessionStore {
  issueSession(
    requestedPlayerId?: string | null,
    presentedToken?: string | null,
    isIdReserved?: (playerId: string) => boolean
  ): { playerId: string; token: string };
  issueTokenForPlayer(playerId: string): string;
  verifyToken(token?: string | null): string | null;
  extractTokenFromReq(req: http.IncomingMessage): string | null;
  requireAuthPlayerId(req: http.IncomingMessage): string;
  revokePlayer(playerId: string): void;
  pruneIdleSessions(
    activePlayerIds: ReadonlySet<string>,
    nowMs?: number,
    maxIdleMs?: number
  ): number;
}

export function createGuestSessionStore(): GuestSessionStore {
  const tokenToSession = new Map<
    string,
    { playerId: string; lastSeenMs: number }
  >();
  const playerIdToTokens = new Map<string, Set<string>>();

  function mintTokenForPlayer(playerId: string, nowMs = Date.now()): string {
    const token = crypto.randomBytes(24).toString("hex");
    tokenToSession.set(token, { playerId, lastSeenMs: nowMs });
    let set = playerIdToTokens.get(playerId);
    if (!set) {
      set = new Set<string>();
      playerIdToTokens.set(playerId, set);
    }
    set.add(token);
    return token;
  }

  function verifyToken(token?: string | null): string | null {
    if (!token || typeof token !== "string") return null;
    const trimmed = token.trim();
    if (!trimmed) return null;
    const entry = tokenToSession.get(trimmed);
    if (!entry) return null;
    entry.lastSeenMs = Date.now();
    return entry.playerId;
  }

  function issueSession(
    requestedPlayerId?: string | null,
    presentedToken?: string | null,
    isIdReserved?: (playerId: string) => boolean
  ): { playerId: string; token: string } {
    const cleanRequested =
      typeof requestedPlayerId === "string" && requestedPlayerId.trim()
        ? requestedPlayerId.trim()
        : null;
    const verifiedId = verifyToken(presentedToken);
    if (verifiedId && presentedToken) {
      if (cleanRequested && cleanRequested !== verifiedId) {
        throw createHttpError(
          403,
          "Session token does not match requested guest identity"
        );
      }
      return { playerId: verifiedId, token: presentedToken.trim() };
    }

    if (cleanRequested && RESERVED_SEAT_ID_PATTERN.test(cleanRequested)) {
      throw createHttpError(
        403,
        "Cannot claim a reserved seat or bot player identity"
      );
    }

    const assignedId =
      cleanRequested ?? `guest-${crypto.randomBytes(6).toString("hex")}`;
    if (playerIdToTokens.has(assignedId) || isIdReserved?.(assignedId)) {
      throw createHttpError(
        401,
        "Authentication token required for existing guest identity"
      );
    }
    return { playerId: assignedId, token: mintTokenForPlayer(assignedId) };
  }

  function issueTokenForPlayer(playerId: string): string {
    const cleanId = playerId.trim();
    if (!cleanId) {
      throw createHttpError(400, "Missing playerId");
    }
    return mintTokenForPlayer(cleanId);
  }

  function extractTokenFromReq(req: http.IncomingMessage): string | null {
    const headerToken = req.headers["x-guest-token"];
    if (typeof headerToken === "string" && headerToken.trim()) {
      return headerToken.trim();
    }
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string") {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (m && m[1]?.trim()) {
        return m[1].trim();
      }
    }
    return null;
  }

  function requireAuthPlayerId(req: http.IncomingMessage): string {
    const token = extractTokenFromReq(req);
    const verified = verifyToken(token);
    if (!verified) {
      throw createHttpError(401, "Valid guest session token required");
    }
    return verified;
  }

  function revokePlayer(playerId: string): void {
    const tokens = playerIdToTokens.get(playerId);
    if (!tokens) return;
    for (const t of tokens) {
      tokenToSession.delete(t);
    }
    playerIdToTokens.delete(playerId);
  }

  function pruneIdleSessions(
    activePlayerIds: ReadonlySet<string>,
    nowMs = Date.now(),
    maxIdleMs = DEFAULT_SESSION_IDLE_MS
  ): number {
    let pruned = 0;
    for (const [token, entry] of tokenToSession.entries()) {
      if (
        !activePlayerIds.has(entry.playerId) &&
        nowMs - entry.lastSeenMs >= maxIdleMs
      ) {
        tokenToSession.delete(token);
        const set = playerIdToTokens.get(entry.playerId);
        if (set) {
          set.delete(token);
          if (set.size === 0) {
            playerIdToTokens.delete(entry.playerId);
          }
        }
        pruned += 1;
      }
    }
    return pruned;
  }

  return {
    issueSession,
    issueTokenForPlayer,
    verifyToken,
    extractTokenFromReq,
    requireAuthPlayerId,
    revokePlayer,
    pruneIdleSessions,
  };
}
