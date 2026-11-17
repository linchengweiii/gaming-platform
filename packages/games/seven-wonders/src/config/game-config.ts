import type { PassDirection, SevenWondersAge } from "../types.ts";

export const SEVEN_WONDERS_MIN_PLAYERS = 3;
export const SEVEN_WONDERS_MAX_PLAYERS = 7;

export const SEVEN_WONDERS_HAND_SIZE = 7;
export const SEVEN_WONDERS_TURNS_PER_AGE = 6;

export const SEVEN_WONDERS_STARTING_COINS = 3;
export const SEVEN_WONDERS_DISCARD_COINS = 3;
export const SEVEN_WONDERS_COINS_PER_TREASURY_VP = 3;

export const SEVEN_WONDERS_EXTRA_GUILDS_OVER_PLAYER_COUNT = 2;

export const SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST = 2 as const;
export const SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST = 1 as const;

export const SEVEN_WONDERS_MILITARY_VICTORY_POINTS_BY_AGE: Readonly<
  Record<SevenWondersAge, 1 | 3 | 5>
> = {
  1: 1,
  2: 3,
  3: 5,
};

export const SEVEN_WONDERS_MILITARY_DEFEAT_POINTS = -1 as const;

export const SEVEN_WONDERS_SCIENCE_SET_BONUS_VP = 7;

export const SEVEN_WONDERS_PASS_DIRECTION_BY_AGE: Readonly<
  Record<SevenWondersAge, PassDirection>
> = {
  1: "clockwise",
  2: "counter_clockwise",
  3: "clockwise",
};

export const SEVEN_WONDERS_DEFAULT_SEED = "seven-wonders-default-seed";

export const DEFAULT_SEVEN_WONDERS_COLORS = [
  "#e63946",
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
] as const;
