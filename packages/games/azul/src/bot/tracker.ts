import {
  AZUL_COLORS,
  AZUL_TILES_PER_COLOR,
  AZUL_TILES_PER_FACTORY,
  AZUL_WALL_PATTERN,
} from "../config.ts";
import { getFactoryCount } from "../rules.ts";
import type {
  AzulAction,
  AzulPlayerState,
  AzulState,
  AzulTileColor,
} from "../types.ts";

export interface PublicTileTracker {
  unseenBag: Record<AzulTileColor, number>;
  totalUnseenBag: number;
  inOffer: Record<AzulTileColor, number>;
  inLid: Record<AzulTileColor, number>;
  onWalls: Record<AzulTileColor, number>;
  expectedNextOffer: Record<AzulTileColor, number>;
  guaranteedNextOfferMin: Record<AzulTileColor, number>;
  guaranteedNextOfferMax: Record<AzulTileColor, number>;
}

export function emptyColorCounts(): Record<AzulTileColor, number> {
  return { blue: 0, yellow: 0, red: 0, black: 0, teal: 0 };
}

/**
 * 100% fair public tile conservation tracker:
 * Azul has 20 tiles of each of the 5 colors. By counting public walls, pattern lines,
 * floor lines, current offer, and open box lid, we know the exact unseen bag composition
 * and hypergeometric bounds for next round's factory draw without ever reading `state.bag`.
 */
export function computePublicTileTracker(state: AzulState): PublicTileTracker {
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
      AZUL_TILES_PER_COLOR -
        onWalls[c] -
        onLines[c] -
        onFloors[c] -
        inOffer[c] -
        inLid[c]
    );
    unseenBag[c] = u;
    totalUnseenBag += u;
  }

  const nextDrawTotal =
    getFactoryCount(state.players.length) * AZUL_TILES_PER_FACTORY;
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

export function canPlayerTriggerRowEndThisRound(
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

export function countRemainingColorInOffer(
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
