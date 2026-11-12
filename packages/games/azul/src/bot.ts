import type { BotDifficulty } from "@gaming-platform/core";
import {
  getAzulLegalActions,
  getWallColumnForColor,
  scoreWallPlacement,
} from "./rules.ts";
import {
  type AzulAction,
  type AzulPlayerState,
  type AzulState,
  FLOOR_PENALTIES,
} from "./types.ts";

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

export let AZUL_MASTER_WEIGHTS: AzulMasterWeights = {
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

export function setMasterAzulBotWeights(
  overrides: Partial<AzulMasterWeights>
): void {
  AZUL_MASTER_WEIGHTS = {
    ...AZUL_MASTER_WEIGHTS,
    ...overrides,
  };
}

function computeMarginalFloorPenalty(
  currentFloorLen: number,
  addedFloorItems: number
): number {
  let penalty = 0;
  for (let i = 0; i < addedFloorItems; i++) {
    const slot = currentFloorLen + i;
    if (slot < FLOOR_PENALTIES.length) {
      penalty += Math.abs(FLOOR_PENALTIES[slot]!);
    }
  }
  return penalty;
}

function computeProjectedEndgameTotal(
  p: AzulPlayerState,
  overrideRow?: number,
  overrideColor?: AzulAction["color"],
  overrideComplete?: boolean,
  extraFloorItems = 0
): number {
  const simWall = p.wall.map((r) => [...r]);
  let roundPts = 0;
  for (let r = 0; r < 5; r++) {
    const l = p.patternLines[r]!;
    const color = r === overrideRow ? overrideColor ?? null : l.color;
    const isComplete =
      r === overrideRow
        ? Boolean(overrideComplete)
        : Boolean(l.color && l.count === l.capacity);
    if (color && isComplete) {
      const cIdx = getWallColumnForColor(r, color);
      simWall[r]![cIdx] = color;
      roundPts += scoreWallPlacement(simWall, r, cIdx);
    }
  }
  const floorLen = p.floorLine.length + extraFloorItems;
  let floorPen = 0;
  for (let i = 0; i < Math.min(floorLen, FLOOR_PENALTIES.length); i++) {
    floorPen += Math.abs(FLOOR_PENALTIES[i]!);
  }
  let bonus = 0;
  for (let r = 0; r < 5; r++) {
    if (simWall[r]!.every((c) => c !== null)) bonus += 2;
  }
  for (let c = 0; c < 5; c++) {
    if (simWall.every((row) => row[c] !== null)) bonus += 7;
  }
  const colorCounts = new Map<string, number>();
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = simWall[r]![c];
      if (cell) colorCounts.set(cell, (colorCounts.get(cell) ?? 0) + 1);
    }
  }
  for (const cnt of colorCounts.values()) {
    if (cnt === 5) bonus += 10;
  }
  return Math.max(0, p.score + roundPts - floorPen) + bonus;
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
    const simWall = player.wall.map((r) => [...r]);
    const col = getWallColumnForColor(row, action.color);
    simWall[row]![col] = action.color;
    const wallScore = scoreWallPlacement(simWall, row, col);
    const filledInRow = simWall[row]!.filter((c) => c !== null).length;
    return (
      placed * 2.35 -
      exactFloorPenalty * 2.5 +
      (completesLine ? 6.0 + wallScore * 2.3 : wallScore * 0.9) +
      filledInRow * 0.9
    );
  }

  const projectedWall = player.wall.map((r) => [...r]);
  let baseRoundWallPts = 0;
  for (let r = 0; r < 5; r++) {
    const l = player.patternLines[r]!;
    if (l.color && l.count === l.capacity) {
      const cIdx = getWallColumnForColor(r, l.color);
      projectedWall[r]![cIdx] = l.color;
      baseRoundWallPts += scoreWallPlacement(projectedWall, r, cIdx);
    }
  }

  const afterWall = player.wall.map((r) => [...r]);
  let afterRoundWallPts = 0;
  for (let r = 0; r < 5; r++) {
    const l = player.patternLines[r]!;
    const color = r === row ? action.color : l.color;
    const isComplete =
      r === row ? completesLine : Boolean(l.color && l.count === l.capacity);
    if (color && isComplete) {
      const cIdx = getWallColumnForColor(r, color);
      afterWall[r]![cIdx] = color;
      afterRoundWallPts += scoreWallPlacement(afterWall, r, cIdx);
    }
  }

  const col = getWallColumnForColor(row, action.color);
  const marginalWallGain = afterRoundWallPts - baseRoundWallPts;

  let score =
    placed * mw.placedTileWeight - exactFloorPenalty * mw.floorPenaltyWeight;

  if (takesFirstMarker && curFloorLen === 0) {
    score += mw.firstMarkerCleanBonus;
  }

  if (completesLine) {
    score += mw.completeLineBaseBonus + marginalWallGain * mw.marginalWallGainWeight;
  } else {
    let remainingSameColor = 0;
    for (let f = 0; f < state.factories.length; f++) {
      if (action.source.kind === "factory" && action.source.factoryIndex === f) {
        continue;
      }
      remainingSameColor += state.factories[f]!.filter(
        (c) => c === action.color
      ).length;
    }
    if (action.source.kind !== "center") {
      remainingSameColor += state.centerPool.filter(
        (c) => c === action.color
      ).length;
    }

    const stillNeeded = space - placed;
    const hypoWall = afterWall.map((r) => [...r]);
    hypoWall[row]![col] = action.color;
    const futureWallScore = scoreWallPlacement(hypoWall, row, col);

    if (stillNeeded > remainingSameColor) {
      score +=
        futureWallScore * mw.strandedFutureWallWeight -
        stillNeeded * mw.strandedStillNeededPenalty;
    } else {
      score += futureWallScore * mw.reachableFutureWallWeight;
    }
  }

  const targetWall = completesLine ? afterWall : projectedWall;
  const filledInRow = targetWall[row]!.filter((c) => c !== null).length;
  const filledInCol = targetWall.filter((r) => r[col] !== null).length;
  let colorCountOnWall = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (targetWall[r]![c] === action.color) colorCountOnWall++;
    }
  }

  if (completesLine) {
    if (filledInCol === 5) score += mw.colFiveBonus;
    else if (filledInCol === 4) score += mw.colFourBonus;

    if (colorCountOnWall === 5) score += mw.colorFiveBonus;
    else if (colorCountOnWall === 4) score += mw.colorFourBonus;

    if (filledInRow === 5) {
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
      if (myFinal >= maxOppFinal) {
        score += mw.rowEndgameWinBonus;
      } else {
        score -= mw.rowEndgameBehindPenalty;
      }
    }
  }

  if (col >= 1 && col <= 3) score += mw.centerColSynergyBonus;

  for (const opp of state.players) {
    if (opp.id === player.id) continue;
    for (const oppLine of opp.patternLines) {
      if (
        oppLine.color === action.color &&
        oppLine.count > 0 &&
        oppLine.capacity - oppLine.count === count
      ) {
        score += mw.opponentDenialBonus;
      }
    }
  }

  return score;
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

  let bestAction = legal[0]!;
  let bestScore = -Infinity;

  for (const act of legal) {
    const s = evaluateDraftAction(state, player, act, difficulty);
    if (s > bestScore) {
      bestScore = s;
      bestAction = act;
    }
  }

  return bestAction;
}
