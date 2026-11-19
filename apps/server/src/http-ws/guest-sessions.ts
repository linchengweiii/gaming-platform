import crypto from "node:crypto";
import type http from "node:http";

export interface HttpStatusError extends Error {
  readonly statusCode: number;
}

export function createHttpError(
  statusCode: number,
  message: string
): HttpStatusError {
  const err = Object.assign(new Error(message), { statusCode });
  return err;
}

export interface GuestSessionStore {
  issueSession(
    requestedPlayerId?: string | null,
    presentedToken?: string | null
  ): { playerId: string; token: string };
  issueTokenForPlayer(playerId: string): string;
  verifyToken(token?: string | null): string | null;
  extractTokenFromReq(req: http.IncomingMessage): string | null;
  requireAuthPlayerId(req: http.IncomingMessage): string;
  revokePlayer(playerId: string): void;
}

export function createGuestSessionStore(): GuestSessionStore {
  const tokenToPlayerId = new Map<string, string>();
  const playerIdToTokens = new Map<string, Set<string>>();

  function mintTokenForPlayer(playerId: string): string {
    const token = crypto.randomBytes(24).toString("hex");
    tokenToPlayerId.set(token, playerId);
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
    return tokenToPlayerId.get(trimmed) ?? null;
  }

  function issueSession(
    requestedPlayerId?: string | null,
    presentedToken?: string | null
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

    const assignedId =
      cleanRequested ?? `guest-${crypto.randomBytes(6).toString("hex")}`;
    if (playerIdToTokens.has(assignedId)) {
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
      tokenToPlayerId.delete(t);
    }
    playerIdToTokens.delete(playerId);
  }

  return {
    issueSession,
    issueTokenForPlayer,
    verifyToken,
    extractTokenFromReq,
    requireAuthPlayerId,
    revokePlayer,
  };
}
