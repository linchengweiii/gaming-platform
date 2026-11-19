import { HTTP_FETCH_TIMEOUT_MS } from "../../config/app-config.ts";

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
