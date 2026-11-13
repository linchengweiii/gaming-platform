import type { BotDifficulty } from "@gaming-platform/core";
import {
  getAzulLegalActions,
  getWallColumnForColor,
  scoreWallPlacement,
} from "./rules.ts";
import {
  AZUL_COLORS,
  type AzulAction,
  type AzulPlayerState,
  type AzulState,
  type AzulTileColor,
  FLOOR_PENALTIES,
} from "./types.ts";

const FIVE_INDICES = [0, 1, 2, 3, 4] as const;

export interface AzulMasterWeights {
  placedTileWeight: number;
  floorPenaltyWeight: number;
  firstMarkerCleanBonus: number;
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
  opponentDenialBonus: number;
}

export const DEFAULT_AZUL_MASTER_WEIGHTS: Readonly<AzulMasterWeights> = {
  placedTileWeight: 2.631,
  floorPenaltyWeight: 2.433,
  firstMarkerCleanBonus: 1.476,
  completeLineBaseBonus: 7.22,
  marginalWallGainWeight: 2.406,
  reachableFutureWallWeight: 1.28,
  strandedFutureWallWeight: 0.49,
  strandedStillNeededPenalty: 1.4,
  colFiveBonus: 21.664,
  colFourBonus: 4.261,
  colorFiveBonus: 21.373,
  colorFourBonus: 4.078,
  rowEndgameWinBonus: 17.107,
  rowEndgameBehindPenalty: 8.5,
  centerColSynergyBonus: 1.058,
  opponentDenialBonus: 1.958,
};

export let AZUL_MASTER_WEIGHTS: AzulMasterWeights = {
  ...DEFAULT_AZUL_MASTER_WEIGHTS,
};

export function setMasterAzulBotWeights(
  overrides: Partial<AzulMasterWeights>
): void {
  AZUL_MASTER_WEIGHTS = {
    ...AZUL_MASTER_WEIGHTS,
    ...overrides,
  };
}

function withWallTile(
  wall: readonly (readonly (AzulTileColor | null)[])[],
  row: number,
  col: number,
  color: AzulTileColor
): (AzulTileColor | null)[][] {
  return wall.map((rCells, rIdx) =>
    rIdx === row
      ? rCells.map((cell, cIdx) => (cIdx === col ? color : cell))
      : [...rCells]
  );
}

function computeMarginalFloorPenalty(
  currentFloorLen: number,
  addedFloorItems: number
): number {
  return Array.from({ length: addedFloorItems }, (_, i) => currentFloorLen + i)
    .filter((slot) => slot < FLOOR_PENALTIES.length)
    .reduce((sum, slot) => sum + Math.abs(FLOOR_PENALTIES[slot]!), 0);
}

function projectRoundWallPlacements(
  player: AzulPlayerState,
  overrideRow?: number,
  overrideColor?: AzulTileColor,
  overrideComplete?: boolean
): { wall: (AzulTileColor | null)[][]; roundPts: number } {
  return FIVE_INDICES.reduce<{
    wall: (AzulTileColor | null)[][];
    roundPts: number;
  }>(
    (acc, r) => {
      const l = player.patternLines[r];
      const color = r === overrideRow ? (overrideColor ?? null) : l.color;
      const isComplete =
        r === overrideRow
          ? Boolean(overrideComplete)
          : Boolean(l.color && l.count === l.capacity);
      if (!color || !isComplete) {
        return acc;
      }
      const cIdx = getWallColumnForColor(r, color);
      const nextWall = withWallTile(acc.wall, r, cIdx, color);
      return {
        wall: nextWall,
        roundPts: acc.roundPts + scoreWallPlacement(nextWall, r, cIdx),
      };
    },
    { wall: player.wall.map((r) => [...r]), roundPts: 0 }
  );
}

function computeProjectedEndgameTotal(
  p: AzulPlayerState,
  overrideRow?: number,
  overrideColor?: AzulAction["color"],
  overrideComplete?: boolean,
  extraFloorItems = 0
): number {
  const { wall: simWall, roundPts } = projectRoundWallPlacements(
    p,
    overrideRow,
    overrideColor,
    overrideComplete
  );
  const floorLen = Math.min(
    p.floorLine.length + extraFloorItems,
    FLOOR_PENALTIES.length
  );
  const floorPen = FLOOR_PENALTIES.slice(0, floorLen).reduce(
    (sum, pen) => sum + Math.abs(pen),
    0
  );

  const rowBonus =
    FIVE_INDICES.filter((r) => simWall[r]!.every((c) => c !== null)).length * 2;
  const colBonus =
    FIVE_INDICES.filter((c) => simWall.every((row) => row[c] !== null)).length *
    7;
  const colorBonus =
    AZUL_COLORS.filter(
      (color) =>
        FIVE_INDICES.reduce<number>(
          (sum, r) =>
            sum +
            FIVE_INDICES.filter((c) => simWall[r]![c] === color).length,
          0
        ) === 5
    ).length * 10;

  return (
    Math.max(0, p.score + roundPts - floorPen) +
    rowBonus +
    colBonus +
    colorBonus
  );
}

function evaluateDraftAction(
  state: AzulState,
  player: AzulPlayerState,
  action: AzulAction,
  difficulty: BotDifficulty
): number {
  const sourceTiles =
    action.source.kind === "factory"
      ? state.factories[action.source.factoryIndex]!
      : state.centerPool;
  const count = sourceTiles.filter((c) => c === action.color).length;

  const takesFirstMarker =
    action.source.kind === "center" && state.centerHasFirstPlayerMarker;

  if (difficulty === "easy") {
    if (action.targetLine === "floor") return -count * 2.2;
    const line = player.patternLines[action.targetLine];
    const placed = Math.min(line.capacity - line.count, count);
    const overflow = count - placed;
    return placed * 1.6 - overflow * 1.4;
  }

  if (difficulty === "normal") {
    if (action.targetLine === "floor") {
      return -(count + (takesFirstMarker ? 1 : 0)) * 2.2;
    }
    const row = action.targetLine;
    const line = player.patternLines[row];
    const space = line.capacity - line.count;
    const placed = Math.min(space, count);
    const overflow = count - placed + (takesFirstMarker ? 1 : 0);
    const completes = line.count + placed === line.capacity;
    return placed * 2.1 + (completes ? 5.5 : 0) - overflow * 2.2;
  }

  const mw = AZUL_MASTER_WEIGHTS;
  const curFloorLen = player.floorLine.length;

  if (action.targetLine === "floor") {
    const floorItems = count + (takesFirstMarker ? 1 : 0);
    const exactPen = computeMarginalFloorPenalty(curFloorLen, floorItems);
    return (
      -exactPen * (difficulty === "master" ? mw.floorPenaltyWeight : 2.55) +
      (takesFirstMarker ? 0.5 : 0)
    );
  }

  const row = action.targetLine;
  const line = player.patternLines[row];
  const space = line.capacity - line.count;
  const placed = Math.min(space, count);
  const overflow = count - placed;
  const completesLine = line.count + placed === line.capacity;

  const floorItems = overflow + (takesFirstMarker ? 1 : 0);
  const exactFloorPenalty = computeMarginalFloorPenalty(
    curFloorLen,
    floorItems
  );

  if (difficulty === "smart") {
    const col = getWallColumnForColor(row, action.color);
    const simWall = withWallTile(player.wall, row, col, action.color);
    const wallScore = scoreWallPlacement(simWall, row, col);
    const filledInRow = simWall[row]!.filter((c) => c !== null).length;
    return (
      placed * 2.35 -
      exactFloorPenalty * 2.5 +
      (completesLine ? 6.0 + wallScore * 2.3 : wallScore * 0.9) +
      filledInRow * 0.9
    );
  }

  const { wall: projectedWall, roundPts: baseRoundWallPts } =
    projectRoundWallPlacements(player);
  const { wall: afterWall, roundPts: afterRoundWallPts } =
    projectRoundWallPlacements(player, row, action.color, completesLine);

  const col = getWallColumnForColor(row, action.color);
  const marginalWallGain = afterRoundWallPts - baseRoundWallPts;

  const basePlacementScore =
    placed * mw.placedTileWeight -
    exactFloorPenalty * mw.floorPenaltyWeight +
    (takesFirstMarker && curFloorLen === 0 ? mw.firstMarkerCleanBonus : 0);

  const completionOrFutureBonus = completesLine
    ? mw.completeLineBaseBonus + marginalWallGain * mw.marginalWallGainWeight
    : (() => {
        const remainingFromFactories = state.factories.reduce(
          (sum, factory, fIdx) =>
            action.source.kind === "factory" &&
            action.source.factoryIndex === fIdx
              ? sum
              : sum + factory.filter((c) => c === action.color).length,
          0
        );
        const remainingFromCenter =
          action.source.kind !== "center"
            ? state.centerPool.filter((c) => c === action.color).length
            : 0;
        const remainingSameColor = remainingFromFactories + remainingFromCenter;

        const stillNeeded = space - placed;
        const hypoWall = withWallTile(afterWall, row, col, action.color);
        const futureWallScore = scoreWallPlacement(hypoWall, row, col);

        return stillNeeded > remainingSameColor
          ? futureWallScore * mw.strandedFutureWallWeight -
              stillNeeded * mw.strandedStillNeededPenalty
          : futureWallScore * mw.reachableFutureWallWeight;
      })();

  const targetWall = completesLine ? afterWall : projectedWall;
  const filledInRow = targetWall[row]!.filter((c) => c !== null).length;
  const filledInCol = targetWall.filter((r) => r[col] !== null).length;
  const colorCountOnWall = FIVE_INDICES.reduce<number>(
    (sum, r) =>
      sum +
      FIVE_INDICES.filter((c) => targetWall[r]![c] === action.color).length,
    0
  );

  const endgameSetBonus = completesLine
    ? (filledInCol === 5
        ? mw.colFiveBonus
        : filledInCol === 4
          ? mw.colFourBonus
          : 0) +
      (colorCountOnWall === 5
        ? mw.colorFiveBonus
        : colorCountOnWall === 4
          ? mw.colorFourBonus
          : 0) +
      (filledInRow === 5
        ? (() => {
            const myFinal = computeProjectedEndgameTotal(
              player,
              row,
              action.color,
              true,
              floorItems
            );
            const maxOppFinal = Math.max(
              0,
              ...state.players
                .filter((p) => p.id !== player.id)
                .map((p) => computeProjectedEndgameTotal(p))
            );
            return myFinal >= maxOppFinal
              ? mw.rowEndgameWinBonus
              : -mw.rowEndgameBehindPenalty;
          })()
        : 0)
    : 0;

  const centerColBonus =
    col >= 1 && col <= 3 ? mw.centerColSynergyBonus : 0;

  const denialBonus = state.players
    .filter((opp) => opp.id !== player.id)
    .reduce(
      (sum, opp) =>
        sum +
        opp.patternLines.filter(
          (oppLine) =>
            oppLine.color === action.color &&
            oppLine.count > 0 &&
            oppLine.capacity - oppLine.count === count
        ).length *
          mw.opponentDenialBonus,
      0
    );

  return (
    basePlacementScore +
    completionOrFutureBonus +
    endgameSetBonus +
    centerColBonus +
    denialBonus
  );
}

export function chooseAzulBotAction(
  state: AzulState,
  playerId: string
): AzulAction | null {
  const legal = getAzulLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId)!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  return legal.reduce<{ act: AzulAction; score: number } | null>(
    (best, act) => {
      const score = evaluateDraftAction(state, player, act, difficulty);
      return best === null || score > best.score ? { act, score } : best;
    },
    null
  )!.act;
}
