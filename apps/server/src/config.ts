import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BotDifficulty } from "@gaming-platform/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SERVER_PORT = 3000;
export const DEFAULT_SERVER_HOST = "localhost";
export const PUBLIC_DIR = path.resolve(__dirname, "../../web/public");

export const DEFAULT_BOT_STEP_DELAY_MS = 1200;
export const MIN_BOT_STEP_DELAY_MS = 150;
export const MAX_BOT_STEP_DELAY_MS = 5000;
export const SEVEN_WONDERS_SECRET_LOCK_MAX_DELAY_MS = 380;

export function clampServerBotStepDelayMsPure(rawMs: unknown): number {
  if (typeof rawMs !== "number" || !Number.isFinite(rawMs)) {
    return DEFAULT_BOT_STEP_DELAY_MS;
  }
  return Math.max(
    MIN_BOT_STEP_DELAY_MS,
    Math.min(MAX_BOT_STEP_DELAY_MS, Math.round(rawMs))
  );
}
export const WS_HEARTBEAT_INTERVAL_MS = 25_000;
export const WS_DEAD_PEER_TIMEOUT_MS = 2 * WS_HEARTBEAT_INTERVAL_MS;
export const WS_TCP_KEEPALIVE_MS = 15_000;
export const MAX_WS_PAYLOAD_BYTES = 256 * 1024;
export const MAX_WS_WRITE_BACKPRESSURE_BYTES = 2 * 1024 * 1024;
export const MAX_HTTP_BODY_BYTES = 256 * 1024;
export const ABANDONED_ROOM_IDLE_MS = 15 * 60 * 1000;
export const ABANDONED_ROOM_SWEEP_INTERVAL_MS = 60_000;

export const DEFAULT_ROOM_HASH_SALT = "";
export const ROOM_HASH_HEX_LENGTH = 6;
export const MAX_ROOM_HASH_ATTEMPTS = 64;

export const DEFAULT_CATAN_SETUP_STEP_GUARD = 40;
export const MAX_GUEST_DISPLAY_NAME_LENGTH = 28;

export type SupportedGameId = "catan" | "splendor" | "azul" | "seven_wonders";

export const DEFAULT_GAME_ID: SupportedGameId = "catan";
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = "master";
export const DEFAULT_STARTING_PLAYER_MODE = "random";

export const ROOM_PLAYER_BOUNDS_BY_GAME: Readonly<
  Record<SupportedGameId, { readonly minPlayers: number; readonly maxPlayers: number }>
> = {
  catan: { minPlayers: 3, maxPlayers: 4 },
  splendor: { minPlayers: 2, maxPlayers: 4 },
  azul: { minPlayers: 2, maxPlayers: 4 },
  seven_wonders: { minPlayers: 3, maxPlayers: 7 },
};

export const DEFAULT_CATAN_ROOM_PRESET = {
  scenarioId: "standard",
  enableHarbormaster: false,
  enableCityWalls: false,
  enableFriendlyRobber: false,
} as const;
