import type { BotDifficulty } from "@gaming-platform/core";
import {
  getAzulLegalActions,
  getFactoryCount,
  getWallColumnForColor,
  scoreWallPlacement,
} from "./rules.ts";
import {
  AZUL_COLORS,
  AZUL_WALL_PATTERN,
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
  placedTileWeight: 2.65,
  floorPenaltyWeight: 2.5,
  firstMarkerCleanBonus: 1.5,
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
  opponentDenialBonus: 1.96,
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

interface PublicTileTracker {
  unseenBag: Record<AzulTileColor, number>;
  totalUnseenBag: number;
  inOffer: Record<AzulTileColor, number>;
  inLid: Record<AzulTileColor, number>;
  onWalls: Record<AzulTileColor, number>;
  expectedNextOffer: Record<AzulTileColor, number>;
  guaranteedNextOfferMin: Record<AzulTileColor, number>;
  guaranteedNextOfferMax: Record<AzulTileColor, number>;
}

function emptyColorCounts(): Record<AzulTileColor, number> {
  return { blue: 0, yellow: 0, red: 0, black: 0, teal: 0 };
}

/**
 * 100% fair public tile conservation tracker:
 * Azul has 20 tiles of each of the 5 colors. By counting public walls, pattern lines,
 * floor lines, current offer, and open box lid, we know the exact unseen bag composition
 * and hypergeometric bounds for next round's factory draw without ever reading `state.bag`.
 */
function computePublicTileTracker(state: AzulState): PublicTileTracker {
  const onWalls = emptyColorCounts();
  const onLines = emptyColorCounts();
  const onFloors = emptyColorCounts();
  const inOffer = emptyColorCounts();
  const inLid = emptyColorCounts();
  const roundEndDiscardsEst = emptyColorCounts();

  for (const f of state.factories) {
    for (const c of f) inOffer[c]++;
  }
  for (const c of state.centerPool) inOffer[c]++;
  for (const c of state.discardLid) inLid[c]++;

  for (const p of state.players) {
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 5; col++) {
        const wc = p.wall[r]![col];
        if (wc) onWalls[wc]++;
      }
      const l = p.patternLines[r]!;
      if (l.color && l.count > 0) {
        onLines[l.color] += l.count;
        if (l.count === l.capacity) {
          roundEndDiscardsEst[l.color] += l.capacity - 1;
        }
      }
    }
    for (const ft of p.floorLine) {
      if (ft !== "first_player") {
        onFloors[ft]++;
        roundEndDiscardsEst[ft]++;
      }
    }
  }

  const unseenBag = emptyColorCounts();
  let totalUnseenBag = 0;
  for (const c of AZUL_COLORS) {
    const u = Math.max(
      0,
      20 - onWalls[c] - onLines[c] - onFloors[c] - inOffer[c] - inLid[c]
    );
    unseenBag[c] = u;
    totalUnseenBag += u;
  }

  const nextDrawTotal = getFactoryCount(state.players.length) * 4;
  const expectedNextOffer = emptyColorCounts();
  const guaranteedNextOfferMin = emptyColorCounts();
  const guaranteedNextOfferMax = emptyColorCounts();

  if (totalUnseenBag >= nextDrawTotal) {
    const nonDraws = totalUnseenBag - nextDrawTotal;
    for (const c of AZUL_COLORS) {
      expectedNextOffer[c] =
        totalUnseenBag > 0 ? (nextDrawTotal * unseenBag[c]) / totalUnseenBag : 0;
      guaranteedNextOfferMin[c] = Math.max(0, unseenBag[c] - nonDraws);
      guaranteedNextOfferMax[c] = Math.min(nextDrawTotal, unseenBag[c]);
    }
  } else {
    const neededFromLid = nextDrawTotal - totalUnseenBag;
    let totalLidPool = 0;
    const lidPool = emptyColorCounts();
    for (const c of AZUL_COLORS) {
      lidPool[c] =
        inLid[c] + roundEndDiscardsEst[c] + Math.floor(inOffer[c] * 0.5);
      totalLidPool += lidPool[c];
    }
    const nonLidDraws = Math.max(0, totalLidPool - neededFromLid);
    for (const c of AZUL_COLORS) {
      const fromLidExp =
        totalLidPool > 0
          ? Math.min(lidPool[c], (neededFromLid * lidPool[c]) / totalLidPool)
          : 0;
      expectedNextOffer[c] = unseenBag[c] + fromLidExp;
      guaranteedNextOfferMin[c] =
        unseenBag[c] + Math.max(0, lidPool[c] - nonLidDraws);
      guaranteedNextOfferMax[c] =
        unseenBag[c] + Math.min(neededFromLid, lidPool[c]);
    }
  }

  return {
    unseenBag,
    totalUnseenBag,
    inOffer,
    inLid,
    onWalls,
    expectedNextOffer,
    guaranteedNextOfferMin,
    guaranteedNextOfferMax,
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

function computeTotalFloorPenalty(floorLen: number): number {
  let s = 0;
  const cap = floorLen < FLOOR_PENALTIES.length ? floorLen : FLOOR_PENALTIES.length;
  for (let i = 0; i < cap; i++) s += -FLOOR_PENALTIES[i]!;
  return s;
}

function computeMarginalFloorPenalty(
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

function projectRoundWallPlacements(
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

function computeEndgameFromSimWall(
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
    total: base + completedRows * 2 + completedCols * 7 + completedColors * 10,
    completedRows,
  };
}

function canPlayerTriggerRowEndThisRound(
  p: AzulPlayerState,
  inOffer: Record<AzulTileColor, number>
): boolean {
  for (let r = 0; r < 5; r++) {
    let filled = 0;
    let missingCol = -1;
    for (let c = 0; c < 5; c++) {
      if (p.wall[r]![c] !== null) filled++;
      else missingCol = c;
    }
    if (filled === 5) return true;
    if (filled === 4 && missingCol >= 0) {
      const neededColor = AZUL_WALL_PATTERN[r]![missingCol]!;
      const line = p.patternLines[r]!;
      if (line.color !== null && line.color !== neededColor) continue;
      const need = line.capacity - line.count;
      if (need === 0 || inOffer[neededColor] >= need) return true;
    }
  }
  return false;
}

function countRemainingColorInOffer(
  state: AzulState,
  color: AzulTileColor,
  excludeAction?: AzulAction
): number {
  let total = 0;
  for (let fIdx = 0; fIdx < state.factories.length; fIdx++) {
    if (
      excludeAction?.source.kind === "factory" &&
      excludeAction.source.factoryIndex === fIdx
    ) {
      continue;
    }
    for (const c of state.factories[fIdx]!) {
      if (c === color) total++;
    }
  }
  if (excludeAction?.source.kind !== "center") {
    for (const c of state.centerPool) {
      if (c === color) total++;
    }
  }
  return total;
}

function evaluateDraftAction(
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
      -exactPen * (difficulty === "master" ? 2.6 : 2.55) +
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
      placed * 2.45 -
      exactFloorPenalty * 2.5 +
      (completesLine
        ? 6.6 + marginalGain * 2.35 + (filledInCol === 5 ? 14 : 0)
        : isStranded
          ? futureWallScore * 0.35 - stillNeeded * 1.45
          : futureWallScore * 1.1) +
      (col >= 1 && col <= 3 ? 0.75 : 0)
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

/**
 * Pure deterministic intra-round draft step (never touches `bag` or `rngState`, 100% fair public info).
 */
function stepIntraRoundDraftPure(
  state: AzulState,
  action: AzulAction
): { state: AzulState; roundEnded: boolean } {
  const actorIdx = state.activePlayerIndex;
  const actor = state.players[actorIdx]!;
  let pickedCount = 0;
  let nextFactories = state.factories;
  let nextCenter = state.centerPool;
  let tookMarker = false;
  let nextCenterHasMarker = state.centerHasFirstPlayerMarker;
  let nextRoundStarter = state.nextRoundStartPlayerIndex;

  if (action.source.kind === "factory") {
    const fIdx = action.source.factoryIndex;
    const f = state.factories[fIdx]!;
    const leftovers: AzulTileColor[] = [];
    for (const c of f) {
      if (c === action.color) pickedCount++;
      else leftovers.push(c);
    }
    nextFactories = state.factories.map((fac, i) => (i === fIdx ? [] : fac));
    nextCenter =
      leftovers.length > 0
        ? [...state.centerPool, ...leftovers]
        : state.centerPool;
  } else {
    const leftovers: AzulTileColor[] = [];
    for (const c of state.centerPool) {
      if (c === action.color) pickedCount++;
      else leftovers.push(c);
    }
    nextCenter = leftovers;
    if (state.centerHasFirstPlayerMarker) {
      tookMarker = true;
      nextCenterHasMarker = false;
      nextRoundStarter = actorIdx;
    }
  }

  let updatedPlayer: AzulPlayerState;
  if (action.targetLine === "floor") {
    const nextFloor = [...actor.floorLine];
    if (tookMarker && nextFloor.length < 7) nextFloor.push("first_player");
    for (let i = 0; i < pickedCount && nextFloor.length < 7; i++) {
      nextFloor.push(action.color);
    }
    updatedPlayer = { ...actor, floorLine: nextFloor };
  } else {
    const r = action.targetLine;
    const line = actor.patternLines[r]!;
    const placed = Math.min(line.capacity - line.count, pickedCount);
    const overflow = pickedCount - placed;
    const nextFloor = [...actor.floorLine];
    if (tookMarker && nextFloor.length < 7) nextFloor.push("first_player");
    for (let i = 0; i < overflow && nextFloor.length < 7; i++) {
      nextFloor.push(action.color);
    }
    const nextLines = actor.patternLines.map((l, idx) =>
      idx === r
        ? { capacity: l.capacity, color: action.color, count: l.count + placed }
        : l
    ) as AzulPlayerState["patternLines"];
    updatedPlayer = { ...actor, patternLines: nextLines, floorLine: nextFloor };
  }

  const nextPlayers = state.players.map((p, idx) =>
    idx === actorIdx ? updatedPlayer : p
  );
  let roundEnded = nextCenter.length === 0;
  if (roundEnded) {
    for (const f of nextFactories) {
      if (f.length > 0) {
        roundEnded = false;
        break;
      }
    }
  }

  return {
    state: {
      ...state,
      players: nextPlayers,
      factories: nextFactories,
      centerPool: nextCenter,
      centerHasFirstPlayerMarker: nextCenterHasMarker,
      nextRoundStartPlayerIndex: nextRoundStarter,
      activePlayerIndex: (actorIdx + 1) % state.players.length,
    },
    roundEnded,
  };
}

/**
 * Evaluates all players' projected post-round strength vectors using public bag scarcity.
 */
function evaluateIntraRoundBoardVector(
  state: AzulState,
  rootTracker: PublicTileTracker
): number[] {
  const nPlayers = state.players.length;
  const remOffer = emptyColorCounts();
  for (const f of state.factories) for (const c of f) remOffer[c]++;
  for (const c of state.centerPool) remOffer[c]++;

  const summaries = state.players.map((p) => {
    const proj = projectRoundWallPlacements(p);
    const endSummary = computeEndgameFromSimWall(
      p,
      proj.wall,
      proj.roundPts,
      proj.completedRows
    );
    return { p, proj, endSummary };
  });

  const gameEndsThisRound =
    summaries.some((s) => s.proj.completedRows >= 1) ||
    state.round >= state.config.maxRounds;

  if (gameEndsThisRound) {
    return summaries.map((me, idx) => {
      let maxOtherTotal = -1;
      let maxOtherRowsForTie = -1;
      for (let j = 0; j < nPlayers; j++) {
        if (j === idx) continue;
        const ot = summaries[j]!.endSummary.total;
        const orows = summaries[j]!.endSummary.completedRows;
        if (
          ot > maxOtherTotal ||
          (ot === maxOtherTotal && orows > maxOtherRowsForTie)
        ) {
          maxOtherTotal = ot;
          maxOtherRowsForTie = orows;
        }
      }
      const myTot = me.endSummary.total;
      const myRows = me.endSummary.completedRows;
      const winsAll =
        myTot > maxOtherTotal ||
        (myTot === maxOtherTotal && myRows > maxOtherRowsForTie);
      const tiesAll =
        myTot === maxOtherTotal && myRows === maxOtherRowsForTie;

      return (
        myTot * 2.8 +
        myRows * 0.15 +
        (winsAll ? 85 : tiesAll ? 20 : -55) +
        (myTot - maxOtherTotal) * 2.2
      );
    });
  }

  const nearEndgameRace = summaries.some((s) =>
    s.proj.wall.some((r) => r.filter((c) => c !== null).length >= 4)
  );

  return summaries.map(({ p, proj }, idx) => {
    const floorPen = computeTotalFloorPenalty(p.floorLine.length);
    const postRoundScore = Math.max(0, p.score + proj.roundPts - floorPen);

    let carryOverValue = 0;
    for (let r = 0; r < 5; r++) {
      const l = p.patternLines[r]!;
      if (!l.color || l.count === 0 || l.count >= l.capacity) continue;
      const col = getWallColumnForColor(r, l.color);
      const hypoWall = withWallTile(proj.wall, r, col, l.color);
      const futureWall = scoreWallPlacement(hypoWall, r, col);
      const remThisRound = remOffer[l.color];
      const stillNeeded = l.capacity - l.count;
      const fillRatio = l.count / l.capacity;
      const centerBonus = col >= 1 && col <= 3 ? 0.5 : 0;

      if (remThisRound >= stillNeeded) {
        carryOverValue +=
          l.count * 1.28 + futureWall * 0.72 * fillRatio + centerBonus;
      } else {
        const expNext = rootTracker.expectedNextOffer[l.color];
        const maxNext = rootTracker.guaranteedNextOfferMax[l.color];
        if (maxNext < stillNeeded) {
          carryOverValue += l.count * 0.15 - stillNeeded * 1.65;
        } else if (expNext < stillNeeded * 0.95) {
          carryOverValue +=
            l.count * 0.45 +
            futureWall * 0.2 * fillRatio -
            stillNeeded * 0.95;
        } else {
          carryOverValue +=
            l.count * 0.85 +
            futureWall * 0.42 * fillRatio +
            centerBonus * 0.5 -
            stillNeeded * 0.32;
        }
      }
    }

    let colProgress = 0;
    for (let c = 0; c < 5; c++) {
      let filled = 0;
      let blocked = false;
      for (let r = 0; r < 5; r++) {
        if (proj.wall[r]![c] !== null) {
          filled++;
        } else {
          const missingColor = AZUL_WALL_PATTERN[r]![c]!;
          const availInWorld = 20 - rootTracker.onWalls[missingColor];
          if (availInWorld < r + 1) blocked = true;
        }
      }
      if (filled === 5) colProgress += 7.5;
      else if (!blocked) {
        if (filled === 4) colProgress += nearEndgameRace ? 3.9 : 3.65;
        else if (filled === 3) colProgress += 1.3;
        else if (filled === 2) colProgress += 0.3;
      }
    }

    let colorProgress = 0;
    for (const color of AZUL_COLORS) {
      let cnt = 0;
      let neededTilesSum = 0;
      for (let r = 0; r < 5; r++) {
        const c = getWallColumnForColor(r, color);
        if (proj.wall[r]![c] !== null) {
          cnt++;
        } else {
          const line = p.patternLines[r]!;
          neededTilesSum +=
            line.color === color ? line.capacity - line.count : r + 1;
        }
      }
      const availInWorld = 20 - rootTracker.onWalls[color];
      if (cnt === 5) {
        colorProgress += 10.5;
      } else if (availInWorld >= neededTilesSum) {
        if (cnt === 4) colorProgress += nearEndgameRace ? 4.4 : 3.95;
        else if (cnt === 3) colorProgress += 1.15;
      }
    }

    let clusterScore = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (proj.wall[r]![c] !== null) {
          if (c >= 1 && c <= 3) clusterScore += 0.38;
          if (r >= 1 && r <= 3) clusterScore += 0.22;
          if (r + 1 < 5 && proj.wall[r + 1]![c] !== null) clusterScore += 0.28;
          if (c + 1 < 5 && proj.wall[r]![c + 1] !== null) clusterScore += 0.28;
        }
      }
    }

    const starterVal = nPlayers === 2 ? 1.55 : nPlayers === 3 ? 2.1 : 2.35;
    const nextStarterBonus =
      state.nextRoundStartPlayerIndex === idx ? starterVal : 0;

    return (
      postRoundScore * 2.25 +
      carryOverValue +
      colProgress * 2.1 +
      colorProgress * 2.1 +
      clusterScore +
      nextStarterBonus
    );
  });
}

function computeRelativeUtility(
  vec: readonly number[],
  actorIdx: number
): number {
  const myVal = vec[actorIdx]!;
  const n = vec.length;
  if (n === 2) {
    return myVal - vec[1 - actorIdx]!;
  }
  let maxOther = -Infinity;
  let sumOther = 0;
  for (let i = 0; i < n; i++) {
    if (i === actorIdx) continue;
    const v = vec[i]!;
    if (v > maxOther) maxOther = v;
    sumOther += v;
  }
  const avgOther = sumOther / (n - 1);
  if (n === 3) {
    return myVal - (maxOther * 0.38 + avgOther * 0.08);
  }
  return myVal - (maxOther * 0.28 + avgOther * 0.04);
}

function dedupeFactoryActions(
  state: AzulState,
  actions: readonly AzulAction[]
): AzulAction[] {
  const result: AzulAction[] = [];
  const seenFactorySig: Record<string, true> = {};
  for (const act of actions) {
    if (act.source.kind === "factory") {
      const fTiles = [...state.factories[act.source.factoryIndex]!]
        .sort()
        .join(",");
      const sig = `${fTiles}|${act.color}|${act.targetLine}`;
      if (seenFactorySig[sig]) continue;
      seenFactorySig[sig] = true;
    }
    result.push(act);
  }
  return result;
}

function chooseMasterAzulAction(
  state: AzulState,
  playerId: string,
  legal: readonly AzulAction[]
): AzulAction {
  const meIdx = state.players.findIndex((p) => p.id === playerId);
  const me = state.players[meIdx]!;
  const nPlayers = state.players.length;
  const tracker = computePublicTileTracker(state);

  const tilesRemaining =
    state.centerPool.length +
    state.factories.reduce((s, f) => s + f.length, 0);

  const oppThreatensEndgame = state.players.some(
    (p, idx) =>
      idx !== meIdx && canPlayerTriggerRowEndThisRound(p, tracker.inOffer)
  );

  const dedupedLegal = dedupeFactoryActions(state, legal);

  // 2P: Zero-Sum Alpha-Beta Negamax (solves exact round end when <= 16 tiles remain)
  if (nPlayers === 2) {
    const maxDepth = tilesRemaining <= 16 ? 8 : 4;
    const rootBeam = tilesRemaining <= 16 ? 12 : 10;
    const innerBeam = tilesRemaining <= 12 ? 7 : 5;

    const searchAB = (
      curState: AzulState,
      depth: number,
      alpha: number,
      beta: number
    ): number => {
      const actorIdx = curState.activePlayerIndex;
      const actor = curState.players[actorIdx]!;
      const acts = getAzulLegalActions(curState, actor.id);
      if (acts.length === 0 || depth <= 0) {
        const vec = evaluateIntraRoundBoardVector(curState, tracker);
        return vec[meIdx]! - vec[1 - meIdx]!;
      }

      const uniq = dedupeFactoryActions(curState, acts)
        .map((a) => ({
          act: a,
          h: evaluateDraftAction(
            curState,
            actor,
            a,
            "master",
            tracker,
            oppThreatensEndgame
          ),
        }))
        .sort((a, b) => b.h - a.h);
      const limit = Math.min(uniq.length, innerBeam);

      if (actorIdx === meIdx) {
        let best = -Infinity;
        let curAlpha = alpha;
        for (let i = 0; i < limit; i++) {
          const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
          const val = stepped.roundEnded
            ? (() => {
                const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
                return v[meIdx]! - v[1 - meIdx]!;
              })()
            : searchAB(stepped.state, depth - 1, curAlpha, beta);
          if (val > best) best = val;
          if (best > curAlpha) curAlpha = best;
          if (curAlpha >= beta) break;
        }
        return best;
      } else {
        let best = Infinity;
        let curBeta = beta;
        for (let i = 0; i < limit; i++) {
          const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
          const val = stepped.roundEnded
            ? (() => {
                const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
                return v[meIdx]! - v[1 - meIdx]!;
              })()
            : searchAB(stepped.state, depth - 1, alpha, curBeta);
          if (val < best) best = val;
          if (best < curBeta) curBeta = best;
          if (alpha >= curBeta) break;
        }
        return best;
      }
    };

    const rootOrdered = dedupedLegal
      .map((act) => ({
        act,
        h: evaluateDraftAction(
          state,
          me,
          act,
          "master",
          tracker,
          oppThreatensEndgame
        ),
      }))
      .sort((a, b) => b.h - a.h)
      .slice(0, rootBeam);

    let bestAct = rootOrdered[0]!.act;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    for (const cand of rootOrdered) {
      const stepped = stepIntraRoundDraftPure(state, cand.act);
      const val = stepped.roundEnded
        ? (() => {
            const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
            return v[meIdx]! - v[1 - meIdx]!;
          })()
        : searchAB(stepped.state, maxDepth - 1, alpha - 2, Infinity);
      const total = val + cand.h * 0.04;
      if (total > bestScore) {
        bestScore = total;
        bestAct = cand.act;
      }
      if (val > alpha) alpha = val;
    }
    return bestAct;
  }

  // 3P & 4P: Full-Orbit Multiplayer MaxN (every opponent acts once + me acts a 2nd time)
  const maxDepth = tilesRemaining <= 14 ? 6 : nPlayers + 1;
  const rootBeam = tilesRemaining <= 14 ? 9 : 8;

  const searchMaxN = (curState: AzulState, depth: number): number[] => {
    const actorIdx = curState.activePlayerIndex;
    const actor = curState.players[actorIdx]!;
    const acts = getAzulLegalActions(curState, actor.id);
    if (acts.length === 0 || depth <= 0) {
      return evaluateIntraRoundBoardVector(curState, tracker);
    }

    const uniq = dedupeFactoryActions(curState, acts)
      .map((a) => ({
        act: a,
        h: evaluateDraftAction(
          curState,
          actor,
          a,
          "master",
          tracker,
          oppThreatensEndgame
        ),
      }))
      .sort((a, b) => b.h - a.h);

    const beam =
      actorIdx === meIdx ? 4 : tilesRemaining <= 12 ? 3 : 2;
    const limit = Math.min(uniq.length, beam);

    let bestRel = -Infinity;
    let bestVec: number[] = [];
    for (let i = 0; i < limit; i++) {
      const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
      const vec =
        stepped.roundEnded || depth === 1
          ? evaluateIntraRoundBoardVector(stepped.state, tracker)
          : searchMaxN(stepped.state, depth - 1);
      const rel = computeRelativeUtility(vec, actorIdx) + uniq[i]!.h * 0.06;
      if (rel > bestRel) {
        bestRel = rel;
        bestVec = vec;
      }
    }
    return bestVec;
  };

  const rootOrdered = dedupedLegal
    .map((act) => ({
      act,
      h: evaluateDraftAction(
        state,
        me,
        act,
        "master",
        tracker,
        oppThreatensEndgame
      ),
    }))
    .sort((a, b) => b.h - a.h)
    .slice(0, rootBeam);

  let bestAct = rootOrdered[0]!.act;
  let bestScore = -Infinity;
  for (const cand of rootOrdered) {
    const stepped = stepIntraRoundDraftPure(state, cand.act);
    const vec = stepped.roundEnded
      ? evaluateIntraRoundBoardVector(stepped.state, tracker)
      : searchMaxN(stepped.state, maxDepth - 1);
    const rel = computeRelativeUtility(vec, meIdx) + cand.h * 0.08;
    if (rel > bestScore) {
      bestScore = rel;
      bestAct = cand.act;
    }
  }
  return bestAct;
}

export function chooseAzulBotAction(
  rawState: AzulState,
  playerId: string
): AzulAction | null {
  // Scrub hidden draw order & PRNG state so bot search operates on 100% fair public information
  const state: AzulState = { ...rawState, bag: [], rngState: 0 };
  const legal = getAzulLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  if (difficulty === "master") {
    return chooseMasterAzulAction(state, playerId, legal);
  }

  return legal.reduce<{ act: AzulAction; score: number } | null>(
    (best, act) => {
      const score = evaluateDraftAction(state, player, act, difficulty);
      return best === null || score > best.score ? { act, score } : best;
    },
    null
  )!.act;
}
