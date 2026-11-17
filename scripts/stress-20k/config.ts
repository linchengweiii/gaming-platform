import type { PlayerDescriptor } from "@gaming-platform/core";
import { PLAYER_COLORS, type ScenarioId } from "@gaming-platform/catan";

export interface StressReport {
  mode: "robot" | "human_mimic";
  targetIterations: number;
  completedIterations: number;
  matchesStarted: number;
  matchesCompleted: number;
  catanRoadsVerified: number;
  verticalERoadsVerified: number;
  svgRendersVerified: number;
  domesticTradesTested: number;
  undoRedoCyclesVerified: number;
  readonlyRoomChecksVerified: number;
  invariantViolations: number;
  elapsedMs: number;
}

export const CATAN_SCENARIOS: readonly ScenarioId[] = [
  "standard",
  "big_island_5_6",
  "seafarers_new_shores",
  "seafarers_four_islands",
  "seafarers_fog_islands",
];

export const STRESS_GAME_CYCLE: ReadonlyArray<"catan" | "splendor" | "azul"> = [
  "catan",
  "catan",
  "splendor",
  "azul",
];

export const STRESS_DEFAULTS = {
  defaultTargetIterations: 10000,
  humanMimicSeed: "human-mimic-10000-seed",
  robotCatanMaxSteps: 600,
  robotOtherMaxSteps: 300,
  humanMimicMaxSteps: 550,
  robotSvgCheckInterval: 250,
  humanSvgCheckInterval: 200,
  humanUndoCheckInterval: 50,
} as const;

export function makePlayers(
  count: number,
  allBots: boolean
): PlayerDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: allBots ? `Robot ${i + 1}` : `HumanMimic ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    isBot: allBots,
    botDifficulty: "smart",
  }));
}
