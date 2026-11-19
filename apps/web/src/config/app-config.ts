import type { BotDifficulty } from "@gaming-platform/core";
import {
  type CommodityMap,
  type ResourceMap,
  SCENARIO_CATALOG,
  SELECTABLE_SCENARIO_IDS,
  emptyCommodities,
  emptyResources,
} from "@gaming-platform/catan";
import type {
  CreateLocalRoomOptions,
  DropdownOption,
  SupportedGameId,
} from "../app/types.ts";

export const GUEST_STORAGE_KEY = "ga_guest_session";
export const DEVICE_GUESTS_STORAGE_KEY = "ga_device_guests";
export const LAST_ACTIVE_GUEST_STORAGE_KEY = "ga_last_active_guest_id";
export const ACTIVE_ROOM_STORAGE_KEY = "ga_active_room_id";

export const DEFAULT_AUTOPLAY_SPEED_MS = 150;
export const BOT_RESPONSE_DELAY_MS = 140;
export const BOT_SEVEN_WONDERS_DRAFT_DELAY_MS = 380;
export const SPECIAL_BUILD_AUTO_END_DELAY_MS = 160;
export const WS_RECONNECT_DELAY_MS = 1500;
export const WS_RECONNECT_BASE_DELAY_MS = 500;
export const WS_RECONNECT_MAX_DELAY_MS = 10_000;
export const WS_CLIENT_PING_INTERVAL_MS = 20_000;
export const WS_CLIENT_STALE_TIMEOUT_MS = 45_000;
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

export const SETUP_GAME_DROPDOWN_OPTIONS: readonly DropdownOption[] = [
  {
    value: "catan",
    label: "Settlers of Catan",
    meta: "2–6P",
  },
  { value: "splendor", label: "Splendor", meta: "2–4P" },
  { value: "azul", label: "Azul", meta: "2–4P" },
  {
    value: "seven_wonders",
    label: "7 Wonders",
    meta: "3–7P",
  },
];

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
  readonly roleHint: string;
}> = [
  { id: "p1", name: "Player 1 (You)", roleHint: "Host seat" },
  { id: "guest-2", name: "Guest 2", roleHint: "Guest seat" },
  { id: "guest-3", name: "Guest 3", roleHint: "Guest seat" },
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

export function createEmptyTradeResources(): ResourceMap {
  return emptyResources();
}

export function createEmptyTradeCommodities(): CommodityMap {
  return emptyCommodities();
}

export function getCatanScenarioDropdownOptions(): DropdownOption[] {
  return SELECTABLE_SCENARIO_IDS.map((id) => {
    const sc = SCENARIO_CATALOG[id];
    return {
      value: sc.id,
      label: sc.name,
      meta: `${sc.minPlayers}–${sc.maxPlayers}P`,
    };
  });
}
