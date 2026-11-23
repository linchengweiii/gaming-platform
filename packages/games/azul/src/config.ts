/**
 * Azul Game & Bot Configuration Constants.
 */

export const AZUL_COLORS = ["blue", "yellow", "red", "black", "teal"] as const;
export type AzulTileColor = (typeof AZUL_COLORS)[number];

export const AZUL_TILES_PER_COLOR = 20;
export const AZUL_TILES_PER_FACTORY = 4;
export const AZUL_WALL_SIZE = 5;
export const AZUL_FLOOR_CAPACITY = 7;
export const AZUL_DEFAULT_MAX_ROUNDS = 15;

export const AZUL_FACTORY_COUNTS_BY_PLAYER: Readonly<Record<number, number>> = {
  2: 5,
  3: 7,
  4: 9,
};

export const FLOOR_PENALTIES = [-1, -1, -2, -2, -2, -3, -3] as const;

/**
 * Standard 5x5 Portuguese Azulejo Wall color pattern.
 * Each row shifts the color cycle right by 1 so no row or column repeats a color.
 */
export const AZUL_WALL_PATTERN: readonly (readonly AzulTileColor[])[] = [
  ["blue", "yellow", "red", "black", "teal"],
  ["teal", "blue", "yellow", "red", "black"],
  ["black", "teal", "blue", "yellow", "red"],
  ["red", "black", "teal", "blue", "yellow"],
  ["yellow", "red", "black", "teal", "blue"],
];

export const AZUL_BONUS_POINTS = {
  row: 2,
  col: 7,
  color: 10,
} as const;

export interface AzulMasterWeights {
  placedTileWeight: number;
  floorPenaltyWeight: number;
  completeLineBaseBonus: number;
  marginalWallGainWeight: number;
  reachableFutureWallWeight: number;
  strandedFutureWallWeight: number;
  strandedStillNeededPenalty: number;
  colFiveBonus: number;
  colFourBonus: number;
  colorFiveBonus: number;
  colorFourBonus: number;
  rowEndgameWinBonus: number;
  rowEndgameBehindPenalty: number;
  centerColSynergyBonus: number;
}

export let AZUL_MASTER_WEIGHTS: AzulMasterWeights = {
  placedTileWeight: 2.65,
  floorPenaltyWeight: 2.5,
  completeLineBaseBonus: 7.3,
  marginalWallGainWeight: 2.48,
  reachableFutureWallWeight: 1.32,
  strandedFutureWallWeight: 0.5,
  strandedStillNeededPenalty: 1.25,
  colFiveBonus: 21.5,
  colFourBonus: 4.8,
  colorFiveBonus: 21.5,
  colorFourBonus: 4.5,
  rowEndgameWinBonus: 28.0,
  rowEndgameBehindPenalty: 46.0,
  centerColSynergyBonus: 1.05,
};

export function setMasterAzulBotWeights(
  overrides: Partial<AzulMasterWeights>
): void {
  AZUL_MASTER_WEIGHTS = {
    ...AZUL_MASTER_WEIGHTS,
    ...overrides,
  };
}

export const AZUL_BOT_TUNING = {
  easy: {
    placedWeight: 1.6,
    overflowPenalty: 1.4,
    floorDirectPenalty: 2.2,
  },
  normal: {
    placedWeight: 2.1,
    completeLineBonus: 5.5,
    overflowPenalty: 2.2,
    floorDirectPenalty: 2.2,
  },
  smart: {
    placedWeight: 2.45,
    floorPenaltyMult: 2.5,
    floorDirectMult: 2.55,
    completeLineBonus: 6.6,
    marginalGainMult: 2.35,
    colFiveBonus: 14,
    strandedFutureMult: 0.35,
    strandedNeededPenalty: 1.45,
    reachableFutureMult: 1.1,
    centerColBonus: 0.75,
  },
  masterSearch: {
    twoPlayerEndgameTilesThreshold: 16,
    twoPlayerInnerTightThreshold: 12,
    twoPlayerEndgameDepth: 8,
    twoPlayerMidgameDepth: 4,
    twoPlayerEndgameRootBeam: 12,
    twoPlayerMidgameRootBeam: 10,
    twoPlayerEndgameInnerBeam: 7,
    twoPlayerMidgameInnerBeam: 5,
    multiplayerEndgameTilesThreshold: 14,
    multiplayerEndgameDepth: 6,
    multiplayerEndgameRootBeam: 9,
    multiplayerMidgameRootBeam: 8,
    multiplayerSelfBeam: 4,
    multiplayerOppTightThreshold: 12,
    multiplayerOppEndgameBeam: 3,
    multiplayerOppMidgameBeam: 2,
  },
} as const;
