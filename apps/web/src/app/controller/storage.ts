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

type StoreKind = "localStorage" | "sessionStorage";

function readStore(kind: StoreKind, key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind]?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStore(kind: StoreKind, key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window[kind]?.setItem(key, value);
  } catch {
    // Ignore storage errors (private browsing / quota)
  }
}

function removeStore(kind: StoreKind, key: string): void {
  if (typeof window === "undefined") return;
  try {
    window[kind]?.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function readTrimmed(kind: StoreKind, key: string): string | null {
  const raw = readStore(kind, key)?.trim();
  return raw ? raw : null;
}

export function loadDeviceGuestsFromStorage(): GuestSession[] {
  const raw = readStore("localStorage", DEVICE_GUESTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (g): g is GuestSession =>
            Boolean(g && typeof g.id === "string" && typeof g.name === "string")
        )
      : [];
  } catch {
    return [];
  }
}

export function saveDeviceGuestsToStorage(
  deviceGuests: readonly GuestSession[]
): void {
  writeStore("localStorage", DEVICE_GUESTS_STORAGE_KEY, JSON.stringify(deviceGuests));
}

export const loadLastActiveGuestIdFromStorage = (): string | null =>
  readTrimmed("localStorage", LAST_ACTIVE_GUEST_STORAGE_KEY);

export function saveLastActiveGuestIdToStorage(guestId: string): void {
  const trimmed = guestId?.trim();
  if (trimmed) writeStore("localStorage", LAST_ACTIVE_GUEST_STORAGE_KEY, trimmed);
}

export const clearLastActiveGuestIdFromStorage = (): void =>
  removeStore("localStorage", LAST_ACTIVE_GUEST_STORAGE_KEY);

export function loadSavedGuestSessionFromStorage(): GuestSession | null {
  const raw = readStore("sessionStorage", GUEST_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestSession;
    return parsed?.id && parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGuestSessionToStorage(session: GuestSession): void {
  writeStore("sessionStorage", GUEST_STORAGE_KEY, JSON.stringify(session));
  saveLastActiveGuestIdToStorage(session.id);
}

export const clearGuestSessionFromStorage = (): void =>
  removeStore("sessionStorage", GUEST_STORAGE_KEY);

export const loadActiveRoomIdFromStorage = (): string | null =>
  readTrimmed("sessionStorage", ACTIVE_ROOM_STORAGE_KEY);

export function saveActiveRoomIdToStorage(roomId: string): void {
  if (roomId) writeStore("sessionStorage", ACTIVE_ROOM_STORAGE_KEY, roomId);
}

export const clearActiveRoomIdFromStorage = (): void =>
  removeStore("sessionStorage", ACTIVE_ROOM_STORAGE_KEY);

export function loadShowBotMovesFromStorage(): boolean | null {
  const raw = readStore("localStorage", BOT_FEED_VISIBLE_STORAGE_KEY);
  return raw === "true" ? true : raw === "false" ? false : null;
}

export const saveShowBotMovesToStorage = (enabled: boolean): void =>
  writeStore("localStorage", BOT_FEED_VISIBLE_STORAGE_KEY, String(enabled));

export function loadBotMoveThrottleMsFromStorage(): number | null {
  const raw = readStore("localStorage", BOT_MOVE_THROTTLE_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampBotMoveThrottleMsPure(parsed) : null;
}

export const saveBotMoveThrottleMsToStorage = (delayMs: number): void =>
  writeStore(
    "localStorage",
    BOT_MOVE_THROTTLE_STORAGE_KEY,
    String(clampBotMoveThrottleMsPure(delayMs))
  );

export const loadSavedLocaleFromStorage = (): SupportedLocale | null =>
  normalizeLocale(readStore("localStorage", LOCALE_STORAGE_KEY));

export const saveLocaleToStorage = (locale: SupportedLocale): void =>
  writeStore("localStorage", LOCALE_STORAGE_KEY, locale);
