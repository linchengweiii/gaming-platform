import type { BotDifficulty } from "@gaming-platform/core";
import {
  AZUL_BONUS_POINTS,
  AZUL_BOT_TUNING,
  AZUL_COLORS,
  AZUL_MASTER_WEIGHTS,
  FLOOR_PENALTIES,
} from "../config.ts";
import { getWallColumnForColor, scoreWallPlacement } from "../rules.ts";
import type {
  AzulAction,
  AzulPlayerState,
  AzulState,
  AzulTileColor,
} from "../types.ts";
import {
  type PublicTileTracker,
  computePublicTileTracker,
  countRemainingColorInOffer,
} from "./tracker.ts";

export function withWallTile(
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

export function computeTotalFloorPenalty(floorLen: number): number {
  let s = 0;
  const cap =
    floorLen < FLOOR_PENALTIES.length ? floorLen : FLOOR_PENALTIES.length;
  for (let i = 0; i < cap; i++) s += -FLOOR_PENALTIES[i]!;
  return s;
}

export function computeMarginalFloorPenalty(
  currentFloorLen: number,
  addedFloorItems: number
): number {
  let s = 0;
  const end =
    currentFloorLen + addedFloorItems < FLOOR_PENALTIES.length
      ? currentFloorLen + addedFloorItems
      : FLOOR_PENALTIES.length;
  for (let i = currentFloorLen; i < end; i++) s += -FLOOR_PENALTIES[i]!;
  return s;
}

export function projectRoundWallPlacements(
  player: AzulPlayerState,
  overrideRow = -1,
  overrideColor: AzulTileColor | null = null,
  overrideComplete = false
): {
  wall: (AzulTileColor | null)[][];
  roundPts: number;
  completedRows: number;
} {
  const simWall = player.wall.map((r) => [...r]);
  let roundPts = 0;
  for (let r = 0; r < 5; r++) {
    const l = player.patternLines[r]!;
    const color = r === overrideRow ? overrideColor : l.color;
    const done =
      r === overrideRow
        ? overrideComplete
        : Boolean(l.color && l.count === l.capacity);
    if (!color || !done) continue;
    const col = getWallColumnForColor(r, color);
    simWall[r]![col] = color;
    roundPts += scoreWallPlacement(simWall, r, col);
  }
  let completedRows = 0;
  for (let r = 0; r < 5; r++) {
    if (simWall[r]!.every((c) => c !== null)) completedRows++;
  }
  return { wall: simWall, roundPts, completedRows };
}

export function computeEndgameFromSimWall(
  p: AzulPlayerState,
  simWall: (AzulTileColor | null)[][],
  roundPts: number,
  completedRows: number,
  extraFloor = 0
): { total: number; completedRows: number } {
  const floorPen = computeTotalFloorPenalty(p.floorLine.length + extraFloor);
  let completedCols = 0;
  for (let c = 0; c < 5; c++) {
    let ok = true;
    for (let r = 0; r < 5; r++) {
      if (simWall[r]![c] === null) {
        ok = false;
        break;
      }
    }
    if (ok) completedCols++;
  }
  let completedColors = 0;
  for (const color of AZUL_COLORS) {
    let cnt = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (simWall[r]![c] === color) cnt++;
      }
    }
    if (cnt === 5) completedColors++;
  }
  const base = Math.max(0, p.score + roundPts - floorPen);
  return {
    total:
      base +
      completedRows * AZUL_BONUS_POINTS.row +
      completedCols * AZUL_BONUS_POINTS.col +
      completedColors * AZUL_BONUS_POINTS.color,
    completedRows,
  };
}

export function evaluateDraftAction(
  state: AzulState,
  player: AzulPlayerState,
  action: AzulAction,
  difficulty: BotDifficulty,
  tracker?: PublicTileTracker,
  oppThreatensEndgame = false
): number {
  const sourceTiles =
    action.source.kind === "factory"
      ? state.factories[action.source.factoryIndex]!
      : state.centerPool;
  let count = 0;
  for (const c of sourceTiles) {
    if (c === action.color) count++;
  }

  const takesFirstMarker =
    action.source.kind === "center" && state.centerHasFirstPlayerMarker;

  if (difficulty === "easy") {
    const ew = AZUL_BOT_TUNING.easy;
    if (action.targetLine === "floor") return -count * ew.floorDirectPenalty;
    const line = player.patternLines[action.targetLine];
    const placed = Math.min(line.capacity - line.count, count);
    const overflow = count - placed;
    return placed * ew.placedWeight - overflow * ew.overflowPenalty;
  }

  if (difficulty === "normal") {
    const nw = AZUL_BOT_TUNING.normal;
    if (action.targetLine === "floor") {
      return -(count + (takesFirstMarker ? 1 : 0)) * nw.floorDirectPenalty;
    }
    const row = action.targetLine;
    const line = player.patternLines[row];
    const space = line.capacity - line.count;
    const placed = Math.min(space, count);
    const overflow = count - placed + (takesFirstMarker ? 1 : 0);
    const completes = line.count + placed === line.capacity;
    return (
      placed * nw.placedWeight +
      (completes ? nw.completeLineBonus : 0) -
      overflow * nw.overflowPenalty
    );
  }

  const mw = AZUL_MASTER_WEIGHTS;
  const sw = AZUL_BOT_TUNING.smart;
  const curFloorLen = player.floorLine.length;

  if (action.targetLine === "floor") {
    const floorItems = count + (takesFirstMarker ? 1 : 0);
    const exactPen = computeMarginalFloorPenalty(curFloorLen, floorItems);
    return (
      -exactPen * (difficulty === "master" ? 2.6 : sw.floorDirectMult) +
      (takesFirstMarker && !oppThreatensEndgame && curFloorLen === 0 ? 0.8 : 0)
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
    const { wall: afterSmartWall, roundPts: afterSmartPts } =
      projectRoundWallPlacements(player, row, action.color, completesLine);
    const { roundPts: baseSmartPts } = projectRoundWallPlacements(player);
    const marginalGain = afterSmartPts - baseSmartPts;
    const stillNeeded = space - placed;
    const remColor = completesLine
      ? 0
      : countRemainingColorInOffer(state, action.color, action);
    const isStranded = !completesLine && stillNeeded > remColor;
    const hypoWall = withWallTile(afterSmartWall, row, col, action.color);
    const futureWallScore = scoreWallPlacement(hypoWall, row, col);
    const filledInCol = (completesLine ? afterSmartWall : hypoWall).filter(
      (r) => r[col] !== null
    ).length;

    return (
      placed * sw.placedWeight -
      exactFloorPenalty * sw.floorPenaltyMult +
      (completesLine
        ? sw.completeLineBonus +
          marginalGain * sw.marginalGainMult +
          (filledInCol === 5 ? sw.colFiveBonus : 0)
        : isStranded
          ? futureWallScore * sw.strandedFutureMult -
            stillNeeded * sw.strandedNeededPenalty
          : futureWallScore * sw.reachableFutureMult) +
      (col >= 1 && col <= 3 ? sw.centerColBonus : 0)
    );
  }

  // Master fast move-order & immediate tactical evaluator
  const baseProj = projectRoundWallPlacements(player);
  const afterProj = projectRoundWallPlacements(
    player,
    row,
    action.color,
    completesLine
  );
  const marginalWallGain = afterProj.roundPts - baseProj.roundPts;
  const col = getWallColumnForColor(row, action.color);
  const activeTracker = tracker ?? computePublicTileTracker(state);

  const gameEnds =
    afterProj.completedRows >= 1 ||
    oppThreatensEndgame ||
    state.round >= state.config.maxRounds;

  let score =
    placed * mw.placedTileWeight -
    exactFloorPenalty * mw.floorPenaltyWeight +
    (takesFirstMarker && !gameEnds && curFloorLen === 0
      ? state.players.length >= 3
        ? 2.0
        : 1.4
      : 0);

  if (completesLine) {
    score +=
      mw.completeLineBaseBonus + marginalWallGain * mw.marginalWallGainWeight;
    const filledCol = afterProj.wall.filter((r) => r[col] !== null).length;
    let colorCnt = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (afterProj.wall[r]![c] === action.color) colorCnt++;
      }
    }
    if (filledCol === 5) score += mw.colFiveBonus;
    else if (filledCol === 4) score += mw.colFourBonus;
    if (colorCnt === 5) score += mw.colorFiveBonus;
    else if (colorCnt === 4) score += mw.colorFourBonus;

    const filledRow = afterProj.wall[row]!.filter((c) => c !== null).length;
    if (filledRow === 5) {
      if (oppThreatensEndgame) {
        score += 5.5;
      } else {
        const myEnd = computeEndgameFromSimWall(
          player,
          afterProj.wall,
          afterProj.roundPts,
          afterProj.completedRows,
          floorItems
        );
        let winsAll = true;
        let maxOpp = 0;
        for (const o of state.players) {
          if (o.id === player.id) continue;
          const op = projectRoundWallPlacements(o);
          const oe = computeEndgameFromSimWall(
            o,
            op.wall,
            op.roundPts,
            op.completedRows
          );
          if (oe.total > maxOpp) maxOpp = oe.total;
          if (
            oe.total > myEnd.total ||
            (oe.total === myEnd.total && oe.completedRows > myEnd.completedRows)
          ) {
            winsAll = false;
          }
        }
        score += winsAll
          ? mw.rowEndgameWinBonus + (myEnd.total - maxOpp) * 1.2
          : -mw.rowEndgameBehindPenalty -
              Math.max(0, maxOpp - myEnd.total) * 2.0;
      }
    }
  } else {
    const remColor = countRemainingColorInOffer(state, action.color, action);
    const stillNeeded = space - placed;
    const hypoWall = withWallTile(afterProj.wall, row, col, action.color);
    const futPts = scoreWallPlacement(hypoWall, row, col);

    if (remColor >= stillNeeded) {
      score += futPts * mw.reachableFutureWallWeight;
    } else if (oppThreatensEndgame) {
      score -= stillNeeded * 2.4;
    } else if (activeTracker.guaranteedNextOfferMax[action.color] < stillNeeded) {
      score -= stillNeeded * 2.8;
    } else {
      score +=
        futPts * mw.strandedFutureWallWeight -
        stillNeeded * mw.strandedStillNeededPenalty;
    }
  }

  if (col >= 1 && col <= 3) score += mw.centerColSynergyBonus;
  if (row >= 1 && row <= 3) score += 0.35;

  // Leader-only denial (avoids 3P/4P multi-opponent policing tax)
  let leaderOpp: AzulPlayerState | null = null;
  let leaderScore = -Infinity;
  for (const o of state.players) {
    if (o.id === player.id) continue;
    if (o.score > leaderScore) {
      leaderScore = o.score;
      leaderOpp = o;
    }
  }

  if (leaderOpp) {
    for (const ol of leaderOpp.patternLines) {
      if (
        ol.color === action.color &&
        ol.count > 0 &&
        ol.capacity - ol.count === count
      ) {
        score += state.players.length === 2 ? 2.1 : 1.15;
      }
    }
  }

  if (action.source.kind === "factory") {
    const fac = state.factories[action.source.factoryIndex]!;
    const nextIdx =
      (state.players.findIndex((p) => p.id === player.id) + 1) %
      state.players.length;
    const nextOpp = state.players[nextIdx]!;
    for (const c of AZUL_COLORS) {
      if (c === action.color) continue;
      let dumpCnt = 0;
      for (const fc of fac) if (fc === c) dumpCnt++;
      if (dumpCnt === 0) continue;
      let centerCnt = dumpCnt;
      for (const cc of state.centerPool) if (cc === c) centerCnt++;
      if (centerCnt >= 3) {
        for (let r = 2; r < 5; r++) {
          const nl = nextOpp.patternLines[r]!;
          const wc = getWallColumnForColor(r, c);
          if (nextOpp.wall[r]![wc] !== null) continue;
          if (nl.color !== null && nl.color !== c) continue;
          const need = nl.capacity - nl.count;
          if (Math.abs(need - centerCnt) <= 1) {
            score -= centerCnt * (state.players.length === 2 ? 1.25 : 0.85);
            break;
          }
        }
      }
    }
  }

  return score;
}
