import {
  AZUL_COLORS,
  AZUL_TILES_PER_COLOR,
  AZUL_WALL_PATTERN,
} from "../config.ts";
import { getWallColumnForColor, scoreWallPlacement } from "../rules.ts";
import type { AzulState } from "../types.ts";
import {
  computeEndgameFromSimWall,
  computeTotalFloorPenalty,
  projectRoundWallPlacements,
  withWallTile,
} from "./evaluate.ts";
import { type PublicTileTracker, emptyColorCounts } from "./tracker.ts";

/**
 * Evaluates all players' projected post-round strength vectors using public bag scarcity.
 */
export function evaluateIntraRoundBoardVector(
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
          const availInWorld =
            AZUL_TILES_PER_COLOR - rootTracker.onWalls[missingColor];
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
      const availInWorld = AZUL_TILES_PER_COLOR - rootTracker.onWalls[color];
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

export function computeRelativeUtility(
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
