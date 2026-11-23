import type { BotDifficulty } from "@gaming-platform/core";
import type { CatanBotWeights, ScenarioId } from "@gaming-platform/catan";

export const TIERS: readonly BotDifficulty[] = [
  "easy",
  "normal",
  "smart",
  "master",
];

export interface TournamentSummary {
  game: string;
  matchesPlayed: number;
  winsByTier: Record<BotDifficulty, number>;
  winRatePct: Record<BotDifficulty, number>;
  domesticTradesOffered?: number;
  domesticTradesCompleted?: number;
  avgTurns?: number;
  invariantViolations: number;
  elapsedMs: number;
}

export const DEFAULT_CATAN_MIXED_SCENARIOS: ScenarioId[] = [
  "standard",
  "seafarers_new_shores",
  "seafarers_four_islands",
  "seafarers_fog_islands",
];

export const DEFAULT_CATAN_DUEL_SCENARIOS: ScenarioId[] = [
  "standard",
  "standard",
  "seafarers_new_shores",
  "seafarers_four_islands",
  "seafarers_fog_islands",
  "big_island_5_6",
];

export const TUNABLE_CATAN_WEIGHT_KEYS: Array<keyof CatanBotWeights> = [
  "setupPipWeight",
  "setupScarcityWeight",
  "setupDiversityBonus",
  "setupNumberSpreadBonus",
  "setupPairSynergyBonus",
  "setupHarborBonus",
  "setupExpansionSpaceWeight",
  "setupSecondStartHandWeight",
  "cityPriority",
  "settlementPriority",
  "devCardPriority",
  "roadToSpotPriority",
  "longestRoadContestBonus",
  "harbormasterContestBonus",
  "robberLeaderVpWeight",
  "robberPipsWeight",
  "tradeAcceptThreshold",
  "tradeFairnessRatio",
  "sevenDiscardRiskWeight",
];

export const OPTIMIZE_BOTS_DEFAULTS = {
  catanStepCap4P: 1800,
  catanStepCap6P: 2400,
  splendorStepCap: 600,
  azulStepCap: 600,
  duelFitnessWeight: 0.55,
  mixedFitnessWeight: 0.45,
  mixedFitnessScale: 1.35,
} as const;
