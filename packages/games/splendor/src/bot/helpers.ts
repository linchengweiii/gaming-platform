import {
  GEM_COLORS,
  SPLENDOR_DOUBLE_GEM_MIN_BANK,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import { emptyGemMap } from "../rules.ts";
import type {
  GemColor,
  GemMap,
  SplendorCard,
  SplendorPlayerState,
  SplendorState,
} from "../types.ts";

export function maxBy<T>(
  items: readonly T[],
  scoreFn: (item: T) => number
): T | null {
  return (
    items.reduce<{ item: T; score: number } | null>((best, item) => {
      const score = scoreFn(item);
      return best === null || score > best.score ? { item, score } : best;
    }, null)?.item ?? null
  );
}

export function getUnlockedNoblePoints(
  state: SplendorState,
  player: SplendorPlayerState,
  bonusColor: GemColor
): number {
  return state.nobles.reduce((bestNoblePts, noble) => {
    const qualifies = GEM_COLORS.every((c) => {
      const req = noble.requirements[c] ?? 0;
      const after = player.bonuses[c] + (c === bonusColor ? 1 : 0);
      return after >= req;
    });
    return qualifies && noble.points > bestNoblePts
      ? noble.points
      : bestNoblePts;
  }, 0);
}

/**
 * Computes bank-aware minimum gem-draft turns needed for `p` to afford `card`.
 * Accounts for permanent bonuses, current tokens, Gold jokers, bank scarcity,
 * and single-color stack bottlenecks (`bank[c] >= 4` required for double-gem take).
 */
export function estimateTurnsToAfford(
  state: SplendorState,
  p: SplendorPlayerState,
  card: SplendorCard
): { minTurns: number; netMissing: number; starved: boolean } {
  let totalMissing = 0;
  let unbankedDeficit = 0;
  const colorMissing: GemMap = emptyGemMap();

  for (const c of GEM_COLORS) {
    const need = Math.max(0, card.cost[c] - p.bonuses[c]);
    const miss = Math.max(0, need - p.tokens[c]);
    colorMissing[c] = miss;
    totalMissing += miss;
    if (miss > state.bank[c]) {
      unbankedDeficit += miss - state.bank[c];
    }
  }

  if (totalMissing <= p.tokens.gold) {
    return { minTurns: 0, netMissing: 0, starved: false };
  }

  const netMissing = totalMissing - p.tokens.gold;
  const remainingGoldAfterStarved = p.tokens.gold - unbankedDeficit;
  const futureGoldPossible =
    state.bank.gold > 0 && p.reservedCards.length < SPLENDOR_MAX_RESERVED_CARDS
      ? 1
      : 0;
  const starved = remainingGoldAfterStarved + futureGoldPossible < 0;

  const sortedMiss = GEM_COLORS.map((c) => ({
    c,
    miss: colorMissing[c],
    bank: state.bank[c],
  })).sort((a, b) => b.miss - a.miss);

  let goldLeft = p.tokens.gold;
  for (const entry of sortedMiss) {
    if (entry.miss > entry.bank && goldLeft > 0) {
      const use = Math.min(goldLeft, entry.miss - entry.bank);
      entry.miss -= use;
      goldLeft -= use;
    }
  }
  while (goldLeft > 0 && sortedMiss[0]!.miss > 0) {
    sortedMiss.sort((a, b) => b.miss - a.miss);
    sortedMiss[0]!.miss -= 1;
    goldLeft -= 1;
  }

  let maxSingleColorTurns = 0;
  for (const entry of sortedMiss) {
    if (entry.miss <= 0) continue;
    const turnsForC =
      entry.miss === 2 && entry.bank >= SPLENDOR_DOUBLE_GEM_MIN_BANK
        ? 1
        : entry.miss > entry.bank
          ? entry.miss + 2
          : entry.miss;
    if (turnsForC > maxSingleColorTurns) maxSingleColorTurns = turnsForC;
  }

  const distinctTurns = Math.ceil(netMissing / 3);
  const reserveTurnsNeeded =
    remainingGoldAfterStarved < 0 ? -remainingGoldAfterStarved : 0;
  const minTurns = Math.max(
    distinctTurns,
    maxSingleColorTurns,
    reserveTurnsNeeded
  );
  return { minTurns, netMissing, starved };
}

export function computeBonusColorDemand(
  state: SplendorState,
  p: SplendorPlayerState
): GemMap {
  const demand: GemMap = {
    emerald: 1.0,
    diamond: 1.0,
    sapphire: 1.0,
    onyx: 1.0,
    ruby: 1.0,
  };
  for (const noble of state.nobles) {
    const reqColors = GEM_COLORS.filter(
      (c) => (noble.requirements[c] ?? 0) > 0
    );
    const totalMiss = reqColors.reduce(
      (s, c) => s + Math.max(0, (noble.requirements[c] ?? 0) - p.bonuses[c]),
      0
    );
    const proximityMult = 3.2 / Math.max(1.5, totalMiss);
    for (const c of reqColors) {
      if (p.bonuses[c] < (noble.requirements[c] ?? 0)) {
        demand[c] += proximityMult;
      }
    }
  }

  const highCards = [
    ...p.reservedCards.filter((c) => !c.redacted),
    ...state.market[2],
    ...state.market[3],
  ];
  for (const card of highCards) {
    const isRes = p.reservedCards.some((r) => r.id === card.id);
    const w =
      (card.points >= 3 ? 0.55 : card.points >= 1 ? 0.35 : 0.15) *
      (isRes ? 1.8 : 1.0);
    for (const c of GEM_COLORS) {
      if (card.cost[c] > p.bonuses[c]) {
        demand[c] += w;
      }
    }
  }
  return demand;
}

export function findCardInPublicState(
  state: SplendorState,
  player: SplendorPlayerState,
  cardId: string | undefined
): SplendorCard | undefined {
  if (!cardId) return undefined;
  return (
    player.reservedCards.find((c) => c.id === cardId && !c.redacted) ??
    state.market[3].find((c) => c.id === cardId) ??
    state.market[2].find((c) => c.id === cardId) ??
    state.market[1].find((c) => c.id === cardId)
  );
}
