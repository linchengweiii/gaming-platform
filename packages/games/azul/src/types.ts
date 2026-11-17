import type { BotDifficulty, GameEvent } from "@gaming-platform/core";
import {
  AZUL_COLORS,
  AZUL_WALL_PATTERN,
  FLOOR_PENALTIES,
} from "./config.ts";

export { AZUL_COLORS, AZUL_WALL_PATTERN, FLOOR_PENALTIES };
export type AzulTileColor = (typeof AZUL_COLORS)[number];
export type FloorToken = AzulTileColor | "first_player";

export interface PatternLineState {
  capacity: number; // 1..5 for rows 0..4
  color: AzulTileColor | null;
  count: number;
}

export interface AzulPlayerState {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  score: number;
  patternLines: [
    PatternLineState,
    PatternLineState,
    PatternLineState,
    PatternLineState,
    PatternLineState,
  ];
  /** 5x5 wall grid: null if empty, or the placed AzulTileColor */
  wall: (AzulTileColor | null)[][];
  /** Up to 7 floor penalty slots */
  floorLine: FloorToken[];
  completedRows: number;
  completedCols: number;
  completedColorSets: number;
}

export interface AzulConfig {
  maxRounds: number;
  startingPlayerIndex?: number;
  randomizeStartingPlayer?: boolean;
}

export type AzulPhase = "FACTORY_OFFER" | "GAME_OVER";

export interface AzulState {
  gameId: "azul";
  config: AzulConfig;
  rngState: number;
  turn: number;
  round: number;
  phase: AzulPhase;
  startingPlayerIndex: number;
  activePlayerIndex: number;
  nextRoundStartPlayerIndex: number;
  players: AzulPlayerState[];
  factories: AzulTileColor[][];
  centerPool: AzulTileColor[];
  centerHasFirstPlayerMarker: boolean;
  bag: AzulTileColor[];
  discardLid: AzulTileColor[];
  winnerId: string | null;
  eventLog: GameEvent[];
}

export type AzulDraftSource =
  | { kind: "factory"; factoryIndex: number }
  | { kind: "center" };

export type AzulTargetLine = 0 | 1 | 2 | 3 | 4 | "floor";

export type AzulAction = {
  type: "DRAFT_TILES";
  source: AzulDraftSource;
  color: AzulTileColor;
  targetLine: AzulTargetLine;
};
