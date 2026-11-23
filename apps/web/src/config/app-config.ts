import type { BotDifficulty } from "@gaming-platform/core";
import type {
  CreateLocalRoomOptions,
  SupportedGameId,
} from "../app/types.ts";

export const GUEST_STORAGE_KEY = "ga_guest_session";
export const DEVICE_GUESTS_STORAGE_KEY = "ga_device_guests";
export const LAST_ACTIVE_GUEST_STORAGE_KEY = "ga_last_active_guest_id";
export const ACTIVE_ROOM_STORAGE_KEY = "ga_active_room_id";
export const BOT_FEED_VISIBLE_STORAGE_KEY = "ga_bot_move_feed_enabled";
export const BOT_MOVE_THROTTLE_STORAGE_KEY = "ga_bot_move_throttle_ms";
export const LOCALE_STORAGE_KEY = "ga_locale";

export const DEFAULT_AUTOPLAY_SPEED_MS = 150;
export const BOT_SEVEN_WONDERS_DRAFT_DELAY_MS = 380;
export const SPECIAL_BUILD_AUTO_END_DELAY_MS = 160;

export const DEFAULT_SHOW_BOT_MOVES = true;
export const DEFAULT_BOT_MOVE_THROTTLE_MS = 1200;
const MIN_BOT_MOVE_THROTTLE_MS = 150;
const MAX_BOT_MOVE_THROTTLE_MS = 5000;

interface BotMoveThrottlePreset {
  readonly id: "fast" | "normal" | "slow";
  readonly shortLabel: string;
  readonly delayMs: number;
}

export const BOT_MOVE_THROTTLE_PRESETS: readonly BotMoveThrottlePreset[] = [
  { id: "fast", shortLabel: "0.35s", delayMs: 350 },
  { id: "normal", shortLabel: "1.2s", delayMs: 1200 },
  { id: "slow", shortLabel: "2.2s", delayMs: 2200 },
];

export function clampBotMoveThrottleMsPure(rawMs: unknown): number {
  if (typeof rawMs !== "number" || !Number.isFinite(rawMs)) {
    return DEFAULT_BOT_MOVE_THROTTLE_MS;
  }
  return Math.max(
    MIN_BOT_MOVE_THROTTLE_MS,
    Math.min(MAX_BOT_MOVE_THROTTLE_MS, Math.round(rawMs))
  );
}

export function getBotMoveThrottlePresetPure(
  delayMs: number
): BotMoveThrottlePreset {
  const clamped = clampBotMoveThrottleMsPure(delayMs);
  return BOT_MOVE_THROTTLE_PRESETS.reduce((best, preset) =>
    Math.abs(preset.delayMs - clamped) < Math.abs(best.delayMs - clamped)
      ? preset
      : best
  );
}

export function getNextBotMoveThrottlePresetPure(
  currentDelayMs: number
): BotMoveThrottlePreset {
  const current = getBotMoveThrottlePresetPure(currentDelayMs);
  const idx = BOT_MOVE_THROTTLE_PRESETS.findIndex((p) => p.id === current.id);
  const nextIdx = (idx + 1) % BOT_MOVE_THROTTLE_PRESETS.length;
  return BOT_MOVE_THROTTLE_PRESETS[nextIdx]!;
}

export function formatBotThrottleShortPure(delayMs: number): string {
  const clamped = clampBotMoveThrottleMsPure(delayMs);
  const exact = BOT_MOVE_THROTTLE_PRESETS.find((p) => p.delayMs === clamped);
  if (exact) return exact.shortLabel;
  const seconds = clamped / 1000;
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(2))}s`;
}
const WS_RECONNECT_BASE_DELAY_MS = 500;
const WS_RECONNECT_MAX_DELAY_MS = 10_000;
export const WS_CLIENT_PING_INTERVAL_MS = 20_000;
export const WS_CLIENT_STALE_TIMEOUT_MS = 45_000;
export const WS_DISCONNECTED_FALLBACK_SYNC_MS = 2_500;
export const HTTP_FETCH_TIMEOUT_MS = 8_000;
export const ONLINE_BOT_WATCHDOG_MS = 1200;
export const COPY_LINK_RESET_DELAY_MS = 2000;

export const CATAN_MAP_VIEWPORT_CONFIG = {
  minZoom: 1,
  maxZoom: 3,
  zoomStep: 0.25,
  panOverflowRatio: 0.2,
  maxPanCenterRatio: 0.5,
  dragThresholdPx: 5,
  touchDragThresholdPx: 10,
  wheelZoomSensitivity: 0.0022,
  pinchWheelSensitivity: 0.01,
  maxWheelDelta: 240,
} as const;

export function computeWsReconnectDelayPure(
  attempt: number,
  randomUnit = 0.5
): number {
  const clampedAttempt = Math.max(0, Math.min(8, attempt));
  const exp = Math.min(
    WS_RECONNECT_MAX_DELAY_MS,
    WS_RECONNECT_BASE_DELAY_MS * Math.pow(2, clampedAttempt)
  );
  const clampedRand = Math.max(0, Math.min(1, randomUnit));
  const jitter = 0.9 + clampedRand * 0.2;
  return Math.round(exp * jitter);
}

export const DEFAULT_TWO_TO_FOUR_PLAYER_BOUNDS = {
  minPlayers: 2,
  maxPlayers: 4,
} as const;

export const SEVEN_WONDERS_PLAYER_BOUNDS = {
  minPlayers: 3,
  maxPlayers: 7,
} as const;

export const GAME_TITLE_BY_ID: Readonly<Record<SupportedGameId, string>> = {
  catan: "Settlers of Catan",
  splendor: "Splendor",
  azul: "Azul",
  seven_wonders: "7 Wonders",
};

export const TUTORIAL_GAME_SHORT_TITLE_BY_ID: Readonly<
  Record<SupportedGameId, string>
> = {
  catan: "Catan",
  splendor: "Splendor",
  azul: "Azul",
  seven_wonders: "7 Wonders",
};

export const BOT_DIFFICULTY_META: Record<
  BotDifficulty,
  { label: string; badge: string; desc: string }
> = {
  easy: {
    label: "Casual",
    badge: "Easy",
    desc: "Relaxed decisions and generous domestic trading.",
  },
  normal: {
    label: "Balanced",
    badge: "Normal",
    desc: "Steady resource production and standard port play.",
  },
  smart: {
    label: "Tactical",
    badge: "Smart",
    desc: "Scarcity tracking, harbor synergies, and counter-robber.",
  },
  master: {
    label: "Grandmaster",
    badge: "Master",
    desc: "Evolved weights, leader embargo trading, and multi-port combos.",
  },
};

export const USER_PROFILES: ReadonlyArray<{
  readonly id: string;
  readonly name: string;
}> = [
  { id: "p1", name: "Player 1 (You)" },
  { id: "guest-2", name: "Guest 2" },
  { id: "guest-3", name: "Guest 3" },
];

export const INITIAL_LOBBY_ROOM_SEEDS: readonly CreateLocalRoomOptions[] = [
  {
    customRoomId: "room-1",
    gameId: "catan",
    ownerId: "p1",
    ownerName: "Player 1 (You)",
    botCount: 3,
    startingPlayerMode: "first",
    scenarioId: "standard",
    autoStart: false,
  },
  {
    customRoomId: "room-2",
    gameId: "catan",
    ownerId: "host-nemo",
    ownerName: "Captain Nemo",
    botCount: 3,
    scenarioId: "seafarers_four_islands",
    enableHarbormaster: true,
    autoStart: false,
  },
  {
    customRoomId: "room-3",
    gameId: "splendor",
    ownerId: "host-lorenzo",
    ownerName: "Lorenzo",
    botCount: 3,
    autoStart: false,
  },
  {
    customRoomId: "room-4",
    gameId: "azul",
    ownerId: "host-manuel",
    ownerName: "Manuel",
    botCount: 3,
    autoStart: false,
  },
  {
    customRoomId: "room-5",
    gameId: "seven_wonders",
    ownerId: "host-hypatia",
    ownerName: "Hypatia",
    botCount: 3,
    autoStart: false,
  },
];
