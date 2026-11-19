import { HTTP_FETCH_TIMEOUT_MS } from "../../config/app-config.ts";
import { upsertDeviceGuestListPure } from "../helpers/room-queries.ts";
import type { GuestSession } from "../types.ts";
import {
  type AppRuntimeContext,
  saveDeviceGuestsToStorage,
  saveGuestSessionToStorage,
} from "./context.ts";

export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = HTTP_FETCH_TIMEOUT_MS
): Promise<Response> {
  if (typeof AbortController === "undefined" || init?.signal) {
    return fetch(input, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  (timer as any).unref?.();
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isLikelyStaticHostResponsePure(
  status: number,
  contentType: string,
  hasEverReachedServer: boolean
): boolean {
  if (hasEverReachedServer) {
    return false;
  }
  if (status === 404 || status === 405) {
    return true;
  }
  if (status >= 200 && status < 300 && !contentType.includes("application/json")) {
    return true;
  }
  return false;
}

function withGuestTokenHeaderPure(
  headers: HeadersInit | undefined,
  token: string | null
): HeadersInit | undefined {
  if (!token) return headers;
  if (headers && typeof (headers as Headers).forEach === "function") {
    const out: Record<string, string> = {};
    (headers as Headers).forEach((v, k) => {
      out[k] = v;
    });
    out["X-Guest-Token"] = token;
    return out;
  }
  if (Array.isArray(headers)) {
    return [...headers, ["X-Guest-Token", token]];
  }
  return {
    ...(headers as Record<string, string> | undefined),
    "X-Guest-Token": token,
  };
}

export function attachGuestTokenAndFetchHelpers(ctx: AppRuntimeContext): void {
  const getGuestToken = (guestId?: string | null): string | null => {
    const targetId = guestId ?? ctx.model.currentUserId;
    if (!targetId) return null;
    const found = ctx.model.deviceGuests.find((g) => g.id === targetId);
    return found?.token && found.token.trim() ? found.token.trim() : null;
  };

  const clearGuestToken = (guestId: string): void => {
    if (!guestId) return;
    const found = ctx.model.deviceGuests.find((g) => g.id === guestId);
    if (!found || !found.token) return;
    const stripped: GuestSession = {
      id: found.id,
      name: found.name,
      mode: "guest",
    };
    ctx.model = {
      ...ctx.model,
      deviceGuests: ctx.model.deviceGuests.map((g) =>
        g.id === guestId ? stripped : g
      ),
    };
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);
    if (ctx.model.currentUserId === guestId) {
      saveGuestSessionToStorage(stripped);
    }
  };

  const ensureGuestToken = async (
    guestId?: string | null
  ): Promise<string | null> => {
    const targetId =
      guestId ?? (ctx.model.isAuthenticated ? ctx.model.currentUserId : null);
    if (!targetId || !ctx.model.useServerBackend || ctx.model.staticHostOnly) {
      return null;
    }
    const existing = getGuestToken(targetId);
    if (existing) return existing;

    const inFlight = ctx.tokenPromises.get(targetId);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<string | null> => {
      try {
        const guest = ctx.model.deviceGuests.find((g) => g.id === targetId);
        const res = await fetchWithTimeout("/api/guests/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: targetId,
            playerName: guest?.name ?? ctx.model.currentUserName,
          }),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (
          isLikelyStaticHostResponsePure(
            res.status,
            ct,
            ctx.model.hasEverReachedServer
          ) ||
          !res.ok ||
          !ct.includes("application/json")
        ) {
          return null;
        }
        const data = await res.json();
        const issuedToken =
          typeof data?.token === "string" && data.token.trim()
            ? data.token.trim()
            : null;
        if (!issuedToken) return null;

        const latestGuest = ctx.model.deviceGuests.find(
          (g) => g.id === targetId
        );
        const updatedSession: GuestSession = {
          id: targetId,
          name:
            latestGuest?.name ??
            (ctx.model.currentUserId === targetId
              ? ctx.model.currentUserName
              : targetId),
          mode: "guest",
          token: issuedToken,
        };
        if (latestGuest || ctx.model.currentUserId === targetId) {
          ctx.model = {
            ...ctx.model,
            deviceGuests: upsertDeviceGuestListPure(
              ctx.model.deviceGuests,
              updatedSession
            ),
          };
          saveDeviceGuestsToStorage(ctx.model.deviceGuests);
          if (ctx.model.currentUserId === targetId) {
            saveGuestSessionToStorage(updatedSession);
          }
        }
        return issuedToken;
      } catch {
        return null;
      } finally {
        ctx.tokenPromises.delete(targetId);
      }
    })();

    ctx.tokenPromises.set(targetId, promise);
    return promise;
  };

  const fetchApi = async (
    input: string,
    init?: RequestInit,
    opts?: {
      readonly guestId?: string | null;
      readonly explicitToken?: string | null;
    }
  ): Promise<Response> => {
    if (opts?.explicitToken !== undefined) {
      return fetchWithTimeout(input, {
        ...init,
        headers: withGuestTokenHeaderPure(init?.headers, opts.explicitToken),
      });
    }
    const targetGuestId =
      opts?.guestId !== undefined
        ? opts.guestId
        : ctx.model.isAuthenticated
          ? ctx.model.currentUserId
          : null;
    const token =
      targetGuestId && ctx.model.useServerBackend && !ctx.model.staticHostOnly
        ? (getGuestToken(targetGuestId) ??
          (await ensureGuestToken(targetGuestId)))
        : null;
    const res = await fetchWithTimeout(input, {
      ...init,
      headers: withGuestTokenHeaderPure(init?.headers, token),
    });
    if (
      res.status === 401 &&
      targetGuestId &&
      ctx.model.useServerBackend &&
      !ctx.model.staticHostOnly
    ) {
      clearGuestToken(targetGuestId);
      const refreshed = await ensureGuestToken(targetGuestId);
      if (refreshed && refreshed !== token) {
        return fetchWithTimeout(input, {
          ...init,
          headers: withGuestTokenHeaderPure(init?.headers, refreshed),
        });
      }
    }
    return res;
  };

  ctx.getGuestToken = getGuestToken;
  ctx.clearGuestToken = clearGuestToken;
  ctx.ensureGuestToken = ensureGuestToken;
  ctx.fetchApi = fetchApi;
}
