/**
 * Splendor Game & Bot Configuration Constants.
 */

export const GEM_COLORS = [
  "emerald",
  "diamond",
  "sapphire",
  "onyx",
  "ruby",
] as const;

export type GemColor = (typeof GEM_COLORS)[number];
export type TokenColor = GemColor | "gold";

export const ALL_TOKEN_COLORS: readonly TokenColor[] = [
  ...GEM_COLORS,
  "gold",
];

export const SPLENDOR_CARD_TIERS = [1, 2, 3] as const;

export const SPLENDOR_GEM_COUNTS_BY_PLAYER: Readonly<Record<number, number>> = {
  2: 4,
  3: 5,
  4: 7,
};

export const SPLENDOR_GOLD_COUNT = 5;
export const SPLENDOR_HAND_TOKEN_LIMIT = 10;
export const SPLENDOR_MAX_RESERVED_CARDS = 3;
export const SPLENDOR_DOUBLE_GEM_MIN_BANK = 4;
export const SPLENDOR_MAX_DISTINCT_GEMS = 3;
export const SPLENDOR_MARKET_SIZE_PER_TIER = 4;
export const SPLENDOR_TARGET_PRESTIGE_POINTS = 15;
export const SPLENDOR_DEFAULT_MAX_TURNS = 300;

export interface SplendorMasterWeights {
  basePointWeight: number;
  sprintPointWeight: number;
  nobleImmediateWeight: number;
  nobleProgressWeight: number;
  earlyDiscountWeight: number;
  midDiscountWeight: number;
  costEfficiencyPenalty: number;
  sprintZeroPointPenalty: number;
  reserveBoost: number;
  distanceExponent: number;
  draftedCountBonus: number;
  overflowPenalty: number;
  unlockOneTurnWeight: number;
  unlockTwoTurnWeight: number;
}

export let SPLENDOR_MASTER_WEIGHTS: SplendorMasterWeights = {
  basePointWeight: 6.7,
  sprintPointWeight: 10.2,
  nobleImmediateWeight: 8.8,
  nobleProgressWeight: 7.2,
  earlyDiscountWeight: 1.45,
  midDiscountWeight: 0.85,
  costEfficiencyPenalty: 0.36,
  sprintZeroPointPenalty: 0.92,
  reserveBoost: 1.75,
  distanceExponent: 2.05,
  draftedCountBonus: 1.45,
  overflowPenalty: 7.8,
  unlockOneTurnWeight: 1.15,
  unlockTwoTurnWeight: 0.32,
};

export function setMasterSplendorBotWeights(
  overrides: Partial<SplendorMasterWeights>
): void {
  SPLENDOR_MASTER_WEIGHTS = {
    ...SPLENDOR_MASTER_WEIGHTS,
    ...overrides,
  };
}

export const SPLENDOR_BOT_TUNING = {
  easy: {
    buyTokenThreshold: 8,
  },
  normal: {
    cardPointWeight: 4.6,
    nobleWeight: 5,
    earlyEngineBonus: 2.5,
    lateEngineBonus: 0.8,
    distanceExponent: 1.15,
    overflowPenalty: 1.5,
  },
  smart: {
    cardPointWeight: 5.8,
    nobleImmediateWeight: 8.5,
    nobleProgressWeight: 3.4,
    distanceExponent: 1.85,
    draftedCountBonus: 0.85,
    overflowPenalty: 5.2,
    sprintHoldPointsThreshold: 10,
  },
  masterSearch: {
    rootMaxPurchases: 5,
    rootMaxTakes: 6,
    rootTopTakesPool: 7,
    rootMaxReserves: 2,
    t2MaxPurchases: 3,
    t2MaxTakes: 2,
    twoPlayerTurn3Weight: 0.65,
    twoPlayerTurn2Weight: 0.35,
    midTrajectoryWeight: 0.15,
    deepTrajectoryWeight: 0.85,
  },
} as const;
