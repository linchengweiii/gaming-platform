import {
  ACTIVE_ROOM_STORAGE_KEY,
  BOT_FEED_VISIBLE_STORAGE_KEY,
  BOT_MOVE_THROTTLE_STORAGE_KEY,
  DEVICE_GUESTS_STORAGE_KEY,
  GUEST_STORAGE_KEY,
  LAST_ACTIVE_GUEST_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  clampBotMoveThrottleMsPure,
} from "../../config/app-config.ts";
import { type SupportedLocale, normalizeLocale } from "../../i18n/index.ts";
import type { GuestSession } from "../types.ts";

export function loadDeviceGuestsFromStorage(): GuestSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage?.getItem(DEVICE_GUESTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (g): g is GuestSession =>
          Boolean(g && typeof g.id === "string" && typeof g.name === "string")
      );
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function saveDeviceGuestsToStorage(
  deviceGuests: readonly GuestSession[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      DEVICE_GUESTS_STORAGE_KEY,
      JSON.stringify(deviceGuests)
    );
  } catch {
    // Ignore storage errors
  }
}

export function loadLastActiveGuestIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(LAST_ACTIVE_GUEST_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function saveLastActiveGuestIdToStorage(guestId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (guestId && guestId.trim()) {
      window.localStorage?.setItem(LAST_ACTIVE_GUEST_STORAGE_KEY, guestId.trim());
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearLastActiveGuestIdFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(LAST_ACTIVE_GUEST_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function loadSavedGuestSessionFromStorage(): GuestSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestSession;
    if (parsed && parsed.id && parsed.name) {
      return parsed;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveGuestSessionToStorage(session: GuestSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(GUEST_STORAGE_KEY, JSON.stringify(session));
    saveLastActiveGuestIdToStorage(session.id);
  } catch {
    // Ignore storage errors
  }
}

export function clearGuestSessionFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function loadActiveRoomIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage?.getItem(ACTIVE_ROOM_STORAGE_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function saveActiveRoomIdToStorage(roomId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (roomId) {
      window.sessionStorage?.setItem(ACTIVE_ROOM_STORAGE_KEY, roomId);
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearActiveRoomIdFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.removeItem(ACTIVE_ROOM_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function loadShowBotMovesFromStorage(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(BOT_FEED_VISIBLE_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveShowBotMovesToStorage(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      BOT_FEED_VISIBLE_STORAGE_KEY,
      enabled ? "true" : "false"
    );
  } catch {
    // Ignore storage errors
  }
}

export function loadBotMoveThrottleMsFromStorage(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(BOT_MOVE_THROTTLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return clampBotMoveThrottleMsPure(parsed);
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveBotMoveThrottleMsToStorage(delayMs: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(
      BOT_MOVE_THROTTLE_STORAGE_KEY,
      String(clampBotMoveThrottleMsPure(delayMs))
    );
  } catch {
    // Ignore storage errors
  }
}

export function loadSavedLocaleFromStorage(): SupportedLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return normalizeLocale(raw);
  } catch {
    return null;
  }
}

export function saveLocaleToStorage(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors
  }
}
