import type { BotDifficulty } from "@gaming-platform/core";
import { NUMBER_TOKEN_PIPS } from "./costs-and-limits.ts";

/**
 * Tunable strategic weight vector for Catan AI difficulty tiers and evolutionary self-play optimization.
 */
export interface CatanBotWeights {
  setupPipWeight: number;
  setupScarcityWeight: number;
  setupDiversityBonus: number;
  setupNumberSpreadBonus: number;
  setupPairSynergyBonus: number;
  setupHarborBonus: number;
  setupExpansionSpaceWeight: number;
  setupSecondStartHandWeight: number;
  cityPriority: number;
  settlementPriority: number;
  devCardPriority: number;
  roadToSpotPriority: number;
  longestRoadContestBonus: number;
  harbormasterContestBonus: number;
  cityWallPriority: number;
  robberLeaderVpWeight: number;
  robberPipsWeight: number;
  tradeAcceptThreshold: number;
  tradeFairnessRatio: number;
  leaderEmbargoMargin: number;
  maxDomesticOffersPerTurn: number;
  sevenDiscardRiskWeight: number;
}

export const CATAN_BOT_WEIGHTS: Record<BotDifficulty, CatanBotWeights> = {
  easy: {
    setupPipWeight: 2.1,
    setupScarcityWeight: 0.0,
    setupDiversityBonus: 0.4,
    setupNumberSpreadBonus: 0.0,
    setupPairSynergyBonus: 0.0,
    setupHarborBonus: 0.3,
    setupExpansionSpaceWeight: 0.0,
    setupSecondStartHandWeight: 0.0,
    cityPriority: 14,
    settlementPriority: 17,
    devCardPriority: 7,
    roadToSpotPriority: 9,
    longestRoadContestBonus: 1.5,
    harbormasterContestBonus: 1,
    cityWallPriority: 3,
    robberLeaderVpWeight: 0.3,
    robberPipsWeight: 0.8,
    tradeAcceptThreshold: -0.3,
    tradeFairnessRatio: 0.0,
    leaderEmbargoMargin: 0,
    maxDomesticOffersPerTurn: 0,
    sevenDiscardRiskWeight: 0.05,
  },
  normal: {
    setupPipWeight: 2.85,
    setupScarcityWeight: 0.25,
    setupDiversityBonus: 2.4,
    setupNumberSpreadBonus: 0.45,
    setupPairSynergyBonus: 1.4,
    setupHarborBonus: 1.8,
    setupExpansionSpaceWeight: 0.3,
    setupSecondStartHandWeight: 0.6,
    cityPriority: 23,
    settlementPriority: 24,
    devCardPriority: 11,
    roadToSpotPriority: 9.0,
    longestRoadContestBonus: 4.5,
    harbormasterContestBonus: 4,
    cityWallPriority: 4.5,
    robberLeaderVpWeight: 1.8,
    robberPipsWeight: 1.25,
    tradeAcceptThreshold: 0.58,
    tradeFairnessRatio: 0.65,
    leaderEmbargoMargin: 1,
    maxDomesticOffersPerTurn: 1,
    sevenDiscardRiskWeight: 0.3,
  },
  smart: {
    setupPipWeight: 3.35,
    setupScarcityWeight: 1.45,
    setupDiversityBonus: 4.6,
    setupNumberSpreadBonus: 1.65,
    setupPairSynergyBonus: 3.6,
    setupHarborBonus: 3.5,
    setupExpansionSpaceWeight: 1.55,
    setupSecondStartHandWeight: 2.4,
    cityPriority: 33,
    settlementPriority: 33.5,
    devCardPriority: 14.5,
    roadToSpotPriority: 11.5,
    longestRoadContestBonus: 11.5,
    harbormasterContestBonus: 9.5,
    cityWallPriority: 7,
    robberLeaderVpWeight: 3.9,
    robberPipsWeight: 1.95,
    tradeAcceptThreshold: 0.48,
    tradeFairnessRatio: 0.72,
    leaderEmbargoMargin: 2,
    maxDomesticOffersPerTurn: 1,
    sevenDiscardRiskWeight: 0.85,
  },
  master: {
    setupPipWeight: 3.92,
    setupScarcityWeight: 2.68,
    setupDiversityBonus: 5.15,
    setupNumberSpreadBonus: 2.98,
    setupPairSynergyBonus: 4.95,
    setupHarborBonus: 3.68,
    setupExpansionSpaceWeight: 1.62,
    setupSecondStartHandWeight: 2.95,
    cityPriority: 39.5,
    settlementPriority: 42.0,
    devCardPriority: 20.5,
    roadToSpotPriority: 13.5,
    longestRoadContestBonus: 31.5,
    harbormasterContestBonus: 10.5,
    cityWallPriority: 8.3,
    robberLeaderVpWeight: 8.2,
    robberPipsWeight: 2.95,
    tradeAcceptThreshold: 0.52,
    tradeFairnessRatio: 0.72,
    leaderEmbargoMargin: 3,
    maxDomesticOffersPerTurn: 2,
    sevenDiscardRiskWeight: 1.22,
  },
};

export const BOT_DICE_PIPS = NUMBER_TOKEN_PIPS;

export function setMasterCatanBotWeights(
  overrides: Partial<CatanBotWeights>
): void {
  CATAN_BOT_WEIGHTS.master = {
    ...CATAN_BOT_WEIGHTS.master,
    ...overrides,
  };
}
