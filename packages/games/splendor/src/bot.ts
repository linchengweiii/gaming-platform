import type { BotDifficulty } from "@gaming-platform/core";
import {
  applySplendorAction,
  computeCardPurchasePayment,
  emptyGemMap,
  getSplendorLegalActions,
  getSplendorPlayerView,
  totalTokens,
} from "./rules.ts";
import {
  GEM_COLORS,
  type GemColor,
  type GemMap,
  type SplendorAction,
  type SplendorCard,
  type SplendorNoble,
  type SplendorPlayerState,
  type SplendorState,
} from "./types.ts";

export interface SplendorMasterWeights {
  basePointWeight: number;
  sprintPointWeight: number;
  nobleImmediateWeight: number;
  nobleProgressWeight: number;
  earlyDiscountWeight: number;
  midDiscountWeight: number;
  costEfficiencyPenalty: number;
  sprintZeroPointPenalty: number;
  reserveBoost: number;
  distanceExponent: number;
  singleColorBottleneckMult: number;
  draftedCountBonus: number;
  overflowPenalty: number;
  unlockOneTurnWeight: number;
  unlockTwoTurnWeight: number;
}

export const DEFAULT_SPLENDOR_MASTER_WEIGHTS: Readonly<SplendorMasterWeights> =
  {
    basePointWeight: 6.7,
    sprintPointWeight: 10.2,
    nobleImmediateWeight: 8.8,
    nobleProgressWeight: 7.2,
    earlyDiscountWeight: 1.45,
    midDiscountWeight: 0.85,
    costEfficiencyPenalty: 0.36,
    sprintZeroPointPenalty: 0.92,
    reserveBoost: 1.75,
    distanceExponent: 2.05,
    singleColorBottleneckMult: 1.32,
    draftedCountBonus: 1.45,
    overflowPenalty: 7.8,
    unlockOneTurnWeight: 1.15,
    unlockTwoTurnWeight: 0.32,
  };

export let SPLENDOR_MASTER_WEIGHTS: SplendorMasterWeights = {
  ...DEFAULT_SPLENDOR_MASTER_WEIGHTS,
};

export function setMasterSplendorBotWeights(
  overrides: Partial<SplendorMasterWeights>
): void {
  SPLENDOR_MASTER_WEIGHTS = {
    ...SPLENDOR_MASTER_WEIGHTS,
    ...overrides,
  };
}

function maxBy<T>(
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

function getUnlockedNoblePoints(
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
function estimateTurnsToAfford(
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
    state.bank.gold > 0 && p.reservedCards.length < 3 ? 1 : 0;
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
      entry.miss === 2 && entry.bank >= 4
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

function computeBonusColorDemand(
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

function chooseBestNobleAction(
  state: SplendorState,
  player: SplendorPlayerState,
  legal: readonly SplendorAction[],
  difficulty: BotDifficulty
): SplendorAction {
  const nobleActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "SELECT_NOBLE" }> =>
      a.type === "SELECT_NOBLE"
  );
  if (
    nobleActions.length <= 1 ||
    difficulty === "easy" ||
    difficulty === "normal"
  ) {
    return nobleActions[0] ?? legal[0]!;
  }

  const opponents = state.players.filter((p) => p.id !== player.id);
  const scoreNoble = (noble: SplendorNoble): number => {
    if (opponents.length === 0) return noble.points;
    const minOppMissing = opponents.reduce((best, opp) => {
      const miss = GEM_COLORS.reduce(
        (sum, c) =>
          sum + Math.max(0, (noble.requirements[c] ?? 0) - opp.bonuses[c]),
        0
      );
      return Math.min(best, miss);
    }, 99);
    return noble.points * 10 - minOppMissing;
  };

  const best = maxBy(nobleActions, (act) => {
    const noble = state.nobles.find((n) => n.id === act.nobleId);
    return noble ? scoreNoble(noble) : 0;
  });
  return best ?? nobleActions[0] ?? legal[0]!;
}

function chooseBestReturnTokensAction(
  state: SplendorState,
  player: SplendorPlayerState,
  legal: readonly SplendorAction[],
  difficulty: BotDifficulty
): SplendorAction {
  const retActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RETURN_TOKENS" }> =>
      a.type === "RETURN_TOKENS"
  );
  if (retActions.length === 0) return legal[0]!;
  if (difficulty === "easy") {
    return retActions[0]!;
  }

  const excess = Math.max(1, totalTokens(player.tokens) - 10);
  const fullReturns = retActions.filter((a) => totalTokens(a.tokens) === excess);
  const pool = fullReturns.length > 0 ? fullReturns : retActions;

  if (difficulty === "normal") {
    const nonGold = pool.find((a) => (a.tokens.gold ?? 0) === 0);
    return nonGold ?? pool[0]!;
  }

  const cards = [
    ...player.reservedCards.filter((c) => !c.redacted),
    ...state.market[3],
    ...state.market[2],
    ...state.market[1],
  ];
  const colorPrio: GemMap = emptyGemMap();
  for (const card of cards) {
    const isRes = player.reservedCards.some((r) => r.id === card.id);
    const { minTurns } = estimateTurnsToAfford(state, player, card);
    const w =
      ((card.points * 2.5 + 1) * (isRes ? 1.8 : 1.0)) /
      Math.pow(1 + minTurns, 1.8);
    for (const c of GEM_COLORS) {
      const need = Math.max(0, card.cost[c] - player.bonuses[c]);
      if (need > 0 && player.tokens[c] <= need) {
        colorPrio[c] += need * w;
      } else if (need > 0) {
        colorPrio[c] += 0.25 * w;
      }
    }
  }

  const best = maxBy(pool, (a) => {
    const goldPen = (a.tokens.gold ?? 0) * 600;
    let colorPen = 0;
    for (const c of GEM_COLORS) {
      const retAmt = a.tokens[c] ?? 0;
      if (retAmt > 0) colorPen += retAmt * (colorPrio[c] + 0.1);
    }
    return -(goldPen + colorPen);
  });
  return best ?? pool[0]!;
}

/**
 * Pure strategic card utility evaluator across difficulty tiers (`easy` -> `master`).
 */
function evaluateCardUtility(
  state: SplendorState,
  player: SplendorPlayerState,
  card: SplendorCard,
  difficulty: BotDifficulty
): number {
  if (card.redacted) return 0;
  if (difficulty === "easy") {
    return card.points * 3 + 1;
  }

  const targetPts = state.config.targetPoints;
  const nobleImmediatePts = getUnlockedNoblePoints(state, player, card.bonus);

  if (player.points + card.points + nobleImmediatePts >= targetPts) {
    return (
      1000 +
      (player.points + card.points + nobleImmediatePts) * 14 -
      player.purchasedCards.length * 0.5
    );
  }

  if (difficulty === "normal") {
    return (
      card.points * 4.6 +
      nobleImmediatePts * 5 +
      (player.purchasedCards.length < 8 ? 2.5 : 0.8)
    );
  }

  const mw = SPLENDOR_MASTER_WEIGHTS;
  const engineSize = player.purchasedCards.length;
  const maxOppPts = Math.max(
    0,
    ...state.players.filter((p) => p.id !== player.id).map((p) => p.points)
  );
  const inSprintPhase =
    player.points >= 7 || maxOppPts >= 9 || engineSize >= 8;

  const baseScore =
    card.points *
      (difficulty === "master"
        ? inSprintPhase
          ? mw.sprintPointWeight
          : mw.basePointWeight
        : 5.8) +
    nobleImmediatePts *
      (difficulty === "master" ? mw.nobleImmediateWeight : 8.5);

  const nobleProgressBonus = state.nobles.reduce((sum, noble) => {
    const req = noble.requirements[card.bonus] ?? 0;
    if (req <= 0 || player.bonuses[card.bonus] >= req) {
      return sum;
    }
    const totalMissingForNoble = GEM_COLORS.reduce(
      (mAcc, c) =>
        mAcc + Math.max(0, (noble.requirements[c] ?? 0) - player.bonuses[c]),
      0
    );
    const weight = difficulty === "master" ? mw.nobleProgressWeight : 3.4;
    return sum + weight / Math.max(1, totalMissingForNoble);
  }, 0);

  const futureTargets = [
    ...player.reservedCards.filter((c) => !c.redacted),
    ...state.market[2],
    ...state.market[3],
  ];
  const demandForBonus = futureTargets.reduce((sum, future) => {
    if (future.id === card.id) return sum;
    if ((future.cost[card.bonus] ?? 0) <= player.bonuses[card.bonus]) {
      return sum;
    }
    const isMyRes =
      difficulty === "master" &&
      player.reservedCards.some((r) => r.id === future.id);
    return (
      sum +
      (future.points >= 3 ? 1.9 : future.points >= 1 ? 1.15 : 0.5) *
        (isMyRes ? 1.35 : 1.0)
    );
  }, 0);

  const discountWeight =
    engineSize < 4
      ? difficulty === "master"
        ? mw.earlyDiscountWeight
        : 1.45
      : engineSize < 8
        ? difficulty === "master"
          ? mw.midDiscountWeight
          : 0.95
        : inSprintPhase
          ? 0.14
          : 0.42;

  const engineBonus = (1.9 + Math.min(7.0, demandForBonus)) * discountWeight;

  const payment = computeCardPurchasePayment(player, card);
  const coloredSpent = GEM_COLORS.reduce(
    (acc, c) => acc + (payment.payment[c] ?? 0),
    0
  );
  const rawNetCost = GEM_COLORS.reduce(
    (acc, c) => acc + Math.max(0, card.cost[c] - player.bonuses[c]),
    0
  );
  const goldUsed = payment.payment.gold ?? 0;
  const effectiveCost =
    (payment.affordable ? coloredSpent : rawNetCost) +
    (payment.affordable ? goldUsed * 1.38 : 0);

  const efficiencyPenalty =
    difficulty === "master"
      ? effectiveCost *
        (card.points === 0 && inSprintPhase
          ? mw.sprintZeroPointPenalty
          : mw.costEfficiencyPenalty)
      : effectiveCost * (card.points === 0 && inSprintPhase ? 0.5 : 0.18);

  return baseScore + nobleProgressBonus + engineBonus - efficiencyPenalty;
}

function findCardInPublicState(
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

function computeGemNeedWeights(
  state: SplendorState,
  player: SplendorPlayerState,
  difficulty: BotDifficulty
): { gemNeedWeights: GemMap; candidateCards: SplendorCard[] } {
  const mw = SPLENDOR_MASTER_WEIGHTS;
  const candidateCards = (
    difficulty === "normal"
      ? [...state.market[1], ...state.market[2], ...player.reservedCards]
      : [
          ...player.reservedCards,
          ...state.market[1],
          ...state.market[2],
          ...state.market[3],
        ]
  ).filter((c) => !c.redacted);

  const weights: GemMap = {
    emerald: 0.3,
    diamond: 0.3,
    sapphire: 0.3,
    onyx: 0.3,
    ruby: 0.3,
  };

  if (difficulty === "master") {
    for (const card of candidateCards) {
      const isRes = player.reservedCards.some((r) => r.id === card.id);
      const { minTurns, netMissing, starved } = estimateTurnsToAfford(
        state,
        player,
        card
      );
      if (starved && !isRes) continue;
      const util = Math.max(1, evaluateCardUtility(state, player, card, "master"));
      const dist = Math.max(1, minTurns * 1.8 + netMissing * 0.45);
      const w = (util * (isRes ? mw.reserveBoost : 1.0)) / Math.pow(dist, mw.distanceExponent);

      for (const c of GEM_COLORS) {
        const miss = Math.max(
          0,
          card.cost[c] - player.bonuses[c] - player.tokens[c]
        );
        if (miss > 0) {
          const scarcityMult =
            state.bank[c] === 1 ? 1.28 : state.bank[c] === 2 ? 1.12 : 1.0;
          weights[c] += miss * w * scarcityMult;
        }
      }
    }

    if (state.players.length === 2) {
      const opp = state.players.find((o) => o.id !== player.id);
      if (opp) {
        for (const rc of opp.reservedCards) {
          if (rc.redacted || rc.points < 2) continue;
          for (const c of GEM_COLORS) {
            const oppMiss = Math.max(
              0,
              rc.cost[c] - opp.bonuses[c] - opp.tokens[c]
            );
            if (oppMiss > 0 && state.bank[c] > 0 && state.bank[c] <= oppMiss) {
              weights[c] += 1.6;
            }
          }
        }
      }
    }

    return { gemNeedWeights: weights, candidateCards };
  }

  for (const card of candidateCards) {
    const isReservedByMe = player.reservedCards.some((r) => r.id === card.id);
    let totalMissing = 0;
    for (const c of GEM_COLORS) {
      totalMissing += Math.max(
        0,
        card.cost[c] - player.bonuses[c] - player.tokens[c]
      );
    }
    const netTotalMissing = Math.max(1, totalMissing - player.tokens.gold);
    const util = Math.max(
      1,
      evaluateCardUtility(state, player, card, difficulty)
    );
    const reserveBoost = isReservedByMe ? 1.55 : 1.0;
    const exp = difficulty === "normal" ? 1.15 : 1.85;
    const weight = (util * reserveBoost) / Math.pow(netTotalMissing, exp);

    for (const color of GEM_COLORS) {
      const missing = Math.max(
        0,
        card.cost[color] - player.bonuses[color] - player.tokens[color]
      );
      if (missing > 0) {
        weights[color] += missing * weight;
      }
    }
  }

  return { gemNeedWeights: weights, candidateCards };
}

function scoreTakeGemsHeuristic(
  state: SplendorState,
  player: SplendorPlayerState,
  act: Extract<SplendorAction, { type: "TAKE_GEMS" }>,
  gemNeedWeights: GemMap,
  candidateCards: readonly SplendorCard[],
  difficulty: BotDifficulty
): number {
  const mw = SPLENDOR_MASTER_WEIGHTS;
  const curTokens = totalTokens(player.tokens);
  let draftedCount = 0;
  let baseNeedScore = 0;
  for (const color of GEM_COLORS) {
    const count = act.gems[color] ?? 0;
    draftedCount += count;
    baseNeedScore += count * gemNeedWeights[color];
  }

  const overflow = Math.max(0, curTokens + draftedCount - 10);
  if (difficulty === "normal") {
    return baseNeedScore - overflow * 1.5;
  }
  if (difficulty === "smart") {
    return baseNeedScore + draftedCount * 0.85 - overflow * 5.2;
  }

  const simTokens: GemMap = emptyGemMap();
  for (const c of GEM_COLORS) {
    simTokens[c] = player.tokens[c] + (act.gems[c] ?? 0);
  }
  for (let k = 0; k < overflow; k++) {
    const drop =
      GEM_COLORS.filter((c) => simTokens[c] > 0).sort(
        (a, b) => gemNeedWeights[a] - gemNeedWeights[b]
      )[0] ?? null;
    if (drop) simTokens[drop] -= 1;
  }

  let maxUnlockedUtil = 0;
  let maxTwoTurnUtil = 0;
  for (const card of candidateCards) {
    let rem = 0;
    let maxColRem = 0;
    for (const c of GEM_COLORS) {
      const have = player.bonuses[c] + simTokens[c];
      if (have < card.cost[c]) {
        const d = card.cost[c] - have;
        rem += d;
        if (d > maxColRem) maxColRem = d;
      }
    }
    if (rem <= player.tokens.gold) {
      const u = evaluateCardUtility(state, player, card, "master");
      if (u > maxUnlockedUtil) maxUnlockedUtil = u;
    } else if (
      rem - player.tokens.gold <= 3 &&
      maxColRem - player.tokens.gold <= 1
    ) {
      const u2 = evaluateCardUtility(state, player, card, "master");
      if (u2 > maxTwoTurnUtil) maxTwoTurnUtil = u2;
    }
  }

  return (
    baseNeedScore +
    (draftedCount - overflow) * mw.draftedCountBonus -
    overflow * mw.overflowPenalty +
    maxUnlockedUtil * mw.unlockOneTurnWeight +
    maxTwoTurnUtil * mw.unlockTwoTurnWeight
  );
}

/**
 * Fast 1-ply policy for `easy`, `normal`, and `smart`.
 */
function chooseOnePlySplendorAction(
  state: SplendorState,
  playerId: string,
  difficulty: BotDifficulty
): SplendorAction {
  const legal = getSplendorLegalActions(state, playerId);
  if (legal.length <= 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId)!;
  if (state.phase === "SELECT_NOBLE") {
    return chooseBestNobleAction(state, player, legal, difficulty);
  }
  if (state.phase === "RETURN_TOKENS") {
    return chooseBestReturnTokensAction(state, player, legal, difficulty);
  }

  const purchaseActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );

  if (difficulty === "easy") {
    if (
      purchaseActions.length > 0 &&
      (state.round % 2 === 1 || totalTokens(player.tokens) >= 8)
    ) {
      return purchaseActions[0]!;
    }
    const takes = legal.filter((a) => a.type === "TAKE_GEMS");
    return takes[takes.length - 1] ?? purchaseActions[0] ?? legal[0]!;
  }

  const scoredPurchases = purchaseActions.flatMap((act) => {
    const card = findCardInPublicState(state, player, act.cardId);
    return card
      ? [{ act, card, score: evaluateCardUtility(state, player, card, difficulty) }]
      : [];
  });

  const bestPurchaseEntry = maxBy(scoredPurchases, (e) => e.score);
  if (bestPurchaseEntry && bestPurchaseEntry.score >= 900) {
    return bestPurchaseEntry.act;
  }

  if (bestPurchaseEntry) {
    const holdInSmartSprint =
      difficulty === "smart" &&
      player.points >= 10 &&
      bestPurchaseEntry.card.points === 0 &&
      getUnlockedNoblePoints(state, player, bestPurchaseEntry.card.bonus) === 0 &&
      [...player.reservedCards, ...state.market[3], ...state.market[2]].some(
        (bomb) => {
          if (bomb.redacted || bomb.points < 3) return false;
          const miss = GEM_COLORS.reduce(
            (s, c) =>
              s + Math.max(0, bomb.cost[c] - player.bonuses[c] - player.tokens[c]),
            0
          );
          return miss - player.tokens.gold <= 2;
        }
      );
    if (!holdInSmartSprint) {
      return bestPurchaseEntry.act;
    }
  }

  const { gemNeedWeights, candidateCards } = computeGemNeedWeights(
    state,
    player,
    difficulty
  );

  const takeGemsActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
      a.type === "TAKE_GEMS"
  );
  if (takeGemsActions.length > 0) {
    const bestTake = maxBy(takeGemsActions, (act) =>
      scoreTakeGemsHeuristic(
        state,
        player,
        act,
        gemNeedWeights,
        candidateCards,
        difficulty
      )
    )!;
    const draftedCount = GEM_COLORS.reduce(
      (s, c) => s + (bestTake.gems[c] ?? 0),
      0
    );
    const reserveActions = legal.filter(
      (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
        a.type === "RESERVE_CARD" && Boolean(a.cardId)
    );
    if (
      difficulty === "smart" &&
      draftedCount <= 1 &&
      state.bank.gold > 0 &&
      reserveActions.length > 0 &&
      totalTokens(player.tokens) <= 8
    ) {
      const bestRes = maxBy(reserveActions, (rAct) => {
        const c = findCardInPublicState(state, player, rAct.cardId);
        return c ? evaluateCardUtility(state, player, c, "smart") : -99;
      });
      if (bestRes) return bestRes;
    }
    return bestTake;
  }

  if (bestPurchaseEntry) return bestPurchaseEntry.act;
  const reserveActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
  );
  return reserveActions[0] ?? legal[0]!;
}

function playerStillActsIfFinalRoundTriggeredNow(
  state: SplendorState,
  oppIndex: number
): boolean {
  if (state.phase === "GAME_OVER") return false;
  const n = state.players.length;
  const startIdx = state.startingPlayerIndex ?? 0;
  if (!state.finalRoundTriggered) {
    return true;
  }
  let cur = state.activePlayerIndex;
  for (let steps = 0; steps < n; steps++) {
    if (cur === oppIndex) return true;
    const next = (cur + 1) % n;
    if (next === startIdx) break;
    cur = next;
  }
  return false;
}

function countOpponentWinningThreats(
  state: SplendorState,
  opp: SplendorPlayerState,
  oppIdx: number
): { immediateWins: number; oneTurnWins: number } {
  if (!playerStillActsIfFinalRoundTriggeredNow(state, oppIdx)) {
    return { immediateWins: 0, oneTurnWins: 0 };
  }
  const targetPts = state.config.targetPoints;
  const scoreToBeat = state.finalRoundTriggered
    ? Math.max(targetPts, ...state.players.map((p) => p.points))
    : targetPts;

  let immediateWins = 0;
  let oneTurnWins = 0;

  const cards = [
    ...opp.reservedCards,
    ...state.market[3],
    ...state.market[2],
    ...state.market[1],
  ];
  for (const c of cards) {
    if (c.redacted) {
      const bonusSum = GEM_COLORS.reduce((s, col) => s + opp.bonuses[col], 0);
      if (
        c.tier === 3 &&
        opp.points + 4 >= scoreToBeat &&
        bonusSum + totalTokens(opp.tokens) >= 10
      ) {
        oneTurnWins += 1;
      }
      continue;
    }
    const noblePts = getUnlockedNoblePoints(state, opp, c.bonus);
    if (opp.points + c.points + noblePts < scoreToBeat) continue;
    const { minTurns, starved } = estimateTurnsToAfford(state, opp, c);
    if (minTurns === 0) immediateWins++;
    else if (minTurns === 1 && !starved) oneTurnWins++;
  }

  return { immediateWins, oneTurnWins };
}

function evaluateSinglePlayerBoardStrength(
  state: SplendorState,
  p: SplendorPlayerState
): number {
  const nPlayers = state.players.length;
  const targetPts = state.config.targetPoints;
  const maxOppPts = Math.max(
    0,
    ...state.players.filter((o) => o.id !== p.id).map((o) => o.points)
  );
  const inSprint = p.points >= 8 || maxOppPts >= 10;

  const pointsVal = p.points * (inSprint ? 14.4 : 10.6);

  const colorDemand = computeBonusColorDemand(state, p);
  const bonusCount = GEM_COLORS.reduce((s, c) => s + p.bonuses[c], 0);
  const perBonusWeight = inSprint ? 1.85 : bonusCount < 5 ? 3.6 : 3.15;
  let bonusVal = 0;
  for (const c of GEM_COLORS) {
    const b = Math.min(5, p.bonuses[c]);
    const synergyMult = 0.88 + Math.min(0.42, (colorDemand[c] - 1.0) * 0.14);
    bonusVal += b * perBonusWeight * synergyMult;
  }
  bonusVal -= Math.max(0, bonusCount - 10) * 0.5;

  let nobleVal = 0;
  for (const noble of state.nobles) {
    const miss = GEM_COLORS.reduce(
      (m, c) => m + Math.max(0, (noble.requirements[c] ?? 0) - p.bonuses[c]),
      0
    );
    if (miss === 0) nobleVal += 27;
    else if (miss === 1) nobleVal += 10.5;
    else if (miss === 2) nobleVal += 4.4;
    else if (miss === 3) nobleVal += 1.9;
    else if (miss === 4) nobleVal += 0.85;
    else if (miss === 5) nobleVal += 0.35;
  }

  const coloredTokens = GEM_COLORS.reduce((s, c) => s + p.tokens[c], 0);
  const tokenVal = coloredTokens * 1.22 + p.tokens.gold * 2.18;

  const targets = [
    ...p.reservedCards.filter((c) => !c.redacted),
    ...state.market[3],
    ...state.market[2],
    ...state.market[1].filter((c) => c.points > 0 || bonusCount < 6),
  ];

  let best1 = 0;
  let best2 = 0;
  for (const card of targets) {
    const isReserved = p.reservedCards.some((r) => r.id === card.id);
    const { minTurns, netMissing, starved } = estimateTurnsToAfford(
      state,
      p,
      card
    );
    const noblePts = getUnlockedNoblePoints(state, p, card.bonus);
    const winsIfBought = p.points + card.points + noblePts >= targetPts;
    const rawWorth = winsIfBought
      ? 49
      : (card.points + noblePts) * (nPlayers >= 3 ? 4.55 : 4.35) +
        (card.points === 0 ? (inSprint ? 0.45 : 1.55) : 0);

    const effDist = Math.max(netMissing, minTurns * 1.55);
    const reachFactor =
      minTurns === 0
        ? 0.65
        : effDist <= 2.2
          ? 0.44
          : effDist <= 3.5
            ? 0.27
            : effDist <= 5.2
              ? 0.12
              : 0.03;
    const starveMult = starved ? 0.28 : 1.0;
    const resMult = isReserved ? (nPlayers >= 3 ? 1.18 : 1.1) : 1.0;
    const pot = rawWorth * reachFactor * starveMult * resMult;
    if (pot > best1) {
      best2 = best1;
      best1 = pot;
    } else if (pot > best2) {
      best2 = pot;
    }
  }

  let blindReserveVal = 0;
  for (const rc of p.reservedCards) {
    if (rc.redacted) {
      blindReserveVal += rc.tier === 3 ? 3.4 : rc.tier === 2 ? 2.2 : 1.0;
    }
  }

  const cardTiebreakTerm =
    -p.purchasedCards.length * 0.14 -
    p.reservedCards.length * (nPlayers >= 3 ? 0.55 : 0.95);

  return (
    pointsVal +
    bonusVal +
    nobleVal +
    tokenVal +
    best1 +
    best2 * 0.18 +
    blindReserveVal +
    cardTiebreakTerm
  );
}

function evaluateMasterPublicState(
  state: SplendorState,
  meId: string
): number {
  const me = state.players.find((p) => p.id === meId)!;
  if (state.phase === "GAME_OVER") {
    if (state.winnerId === meId) {
      return 12000 + me.points * 25 - me.purchasedCards.length;
    }
    const maxOpp = Math.max(
      0,
      ...state.players.filter((p) => p.id !== meId).map((p) => p.points)
    );
    return -12000 + (me.points - maxOpp) * 25;
  }

  const myStrength = evaluateSinglePlayerBoardStrength(state, me);

  let starvationBonus = 0;
  if (state.players.length <= 3) {
    for (const opp of state.players) {
      if (opp.id === meId) continue;
      for (const rc of opp.reservedCards) {
        if (rc.redacted || rc.points < 2) continue;
        for (const c of GEM_COLORS) {
          const oppNeed = Math.max(0, rc.cost[c] - opp.bonuses[c]);
          const oppMiss = Math.max(0, oppNeed - opp.tokens[c]);
          if (oppMiss > state.bank[c] && me.tokens[c] > 0) {
            starvationBonus +=
              state.players.length === 2
                ? 2.4 * Math.min(2, me.tokens[c])
                : 1.1;
          }
        }
      }
    }
  }

  const myIdx = state.players.findIndex((p) => p.id === meId);
  const nPlayers = state.players.length;
  const oppScores: number[] = [];
  state.players.forEach((opp, idx) => {
    if (opp.id === meId) return;
    const base = evaluateSinglePlayerBoardStrength(state, opp);
    const threats = countOpponentWinningThreats(state, opp, idx);
    const isNextOpp = myIdx >= 0 && (myIdx + 1) % nPlayers === idx;
    const threatPen =
      nPlayers === 2
        ? (threats.immediateWins > 0 ? 520 + threats.immediateWins * 40 : 0) +
          (threats.oneTurnWins > 0 ? 55 * Math.min(2, threats.oneTurnWins) : 0)
        : isNextOpp && threats.immediateWins > 0
          ? 480 + threats.immediateWins * 30
          : threats.immediateWins >= 2
            ? 260
            : 0;
    oppScores.push(base + threatPen);
  });

  if (oppScores.length === 0) return myStrength;
  const maxOpp = Math.max(...oppScores);
  const avgOpp = oppScores.reduce((a, b) => a + b, 0) / oppScores.length;
  const maxOppRawPts = Math.max(
    0,
    ...state.players.filter((p) => p.id !== meId).map((p) => p.points)
  );
  const leaderWeight =
    nPlayers === 2 ? 1.0 : maxOppRawPts >= 12 ? 0.85 : 0.52;

  return (
    myStrength +
    starvationBonus -
    (maxOpp * leaderWeight + avgOpp * (1 - leaderWeight)) *
      (nPlayers === 2 ? 1.0 : 0.78)
  );
}

function scoreStrategicReserveCandidate(
  state: SplendorState,
  player: SplendorPlayerState,
  card: SplendorCard
): number {
  if (card.redacted) return -999;
  const baseUtil = evaluateCardUtility(state, player, card, "master");
  const { minTurns, netMissing, starved } = estimateTurnsToAfford(
    state,
    player,
    card
  );

  const withGoldUnlock =
    state.bank.gold > 0 && netMissing <= 1
      ? 7.5
      : state.bank.gold > 0 && netMissing <= 3 && minTurns <= 2
        ? 4.0
        : 0;

  const maxBankStack =
    state.players.length === 2 ? 4 : state.players.length === 3 ? 5 : 7;
  let maxNeed = 0;
  let starvedColorCount = 0;
  for (const c of GEM_COLORS) {
    const need = Math.max(0, card.cost[c] - player.bonuses[c]);
    const miss = Math.max(0, need - player.tokens[c]);
    if (need > maxNeed) maxNeed = need;
    if (miss > 0 && state.bank[c] === 0) starvedColorCount++;
  }

  const bottleneckBonus =
    state.bank.gold > 0 && maxNeed > maxBankStack ? 8.0 : 0;
  const starvedGoldBridge =
    state.bank.gold > 0 && starvedColorCount > 0 && netMissing <= 3 ? 8.5 : 0;

  const myIdx = state.players.findIndex((p) => p.id === player.id);
  const nPlayers = state.players.length;
  let oppDenial = 0;
  state.players.forEach((opp, oppIdx) => {
    if (opp.id === player.id) return;
    if (!playerStillActsIfFinalRoundTriggeredNow(state, oppIdx)) return;
    const oppTurns = estimateTurnsToAfford(state, opp, card);
    const oppNoble = getUnlockedNoblePoints(state, opp, card.bonus);
    const oppWins =
      opp.points + card.points + oppNoble >= state.config.targetPoints;
    if (nPlayers === 2) {
      if (oppWins && oppTurns.minTurns === 0) oppDenial = Math.max(oppDenial, 42);
      else if (oppWins && oppTurns.minTurns === 1)
        oppDenial = Math.max(oppDenial, 26);
      else if (card.points >= 3 && oppTurns.minTurns === 0)
        oppDenial = Math.max(oppDenial, 12.5);
      else if (card.points >= 2 && oppTurns.minTurns <= 1 && minTurns <= 2)
        oppDenial = Math.max(oppDenial, 6.5);
    } else {
      const isImmediateNext = myIdx >= 0 && (myIdx + 1) % nPlayers === oppIdx;
      if (oppWins && oppTurns.minTurns === 0 && isImmediateNext) {
        oppDenial = Math.max(oppDenial, 38);
      }
    }
  });

  const goldVal = state.bank.gold > 0 ? 4.8 : -7.5;
  const distPen =
    (starved && oppDenial < 25 ? 14 : 0) + Math.max(0, minTurns - 1) * 4.2;

  return (
    baseUtil +
    goldVal +
    withGoldUnlock +
    bottleneckBonus +
    starvedGoldBridge +
    oppDenial -
    distPen
  );
}

/**
 * Fast tactical 1-ply opponent model for lookahead (models opponent wins, single-threat reserve blocks, and optimal gem drafting).
 */
function chooseFastTacticalOpponentAction(
  state: SplendorState,
  actorId: string
): SplendorAction {
  const legal = getSplendorLegalActions(state, actorId);
  if (legal.length <= 1) return legal[0]!;
  const player = state.players.find((p) => p.id === actorId)!;
  if (state.phase === "SELECT_NOBLE") {
    return chooseBestNobleAction(state, player, legal, "master");
  }
  if (state.phase === "RETURN_TOKENS") {
    return chooseBestReturnTokensAction(state, player, legal, "master");
  }

  const purchases = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );
  let bestBuy: { act: SplendorAction; card: SplendorCard; s: number } | null =
    null;
  for (const act of purchases) {
    const c = findCardInPublicState(state, player, act.cardId);
    if (!c) continue;
    const s = evaluateCardUtility(state, player, c, "master");
    if (!bestBuy || s > bestBuy.s) bestBuy = { act, card: c, s };
  }
  if (bestBuy && bestBuy.s >= 900) return bestBuy.act;

  const reserves = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
  );
  if (reserves.length > 0) {
    for (let i = 0; i < state.players.length; i++) {
      const other = state.players[i]!;
      if (other.id === actorId || other.points < state.config.targetPoints - 7)
        continue;
      const marketCards = [
        ...state.market[3],
        ...state.market[2],
        ...state.market[1],
      ];
      const winIds = marketCards
        .filter(
          (c) =>
            other.points +
              c.points +
              getUnlockedNoblePoints(state, other, c.bonus) >=
              state.config.targetPoints &&
            computeCardPurchasePayment(other, c).affordable
        )
        .map((c) => c.id);
      if (winIds.length === 1) {
        const blk = reserves.find((r) => r.cardId === winIds[0]);
        if (blk) return blk;
      }
    }
  }

  if (bestBuy) {
    const skipZeroInSprint =
      player.points >= 10 &&
      bestBuy.card.points === 0 &&
      getUnlockedNoblePoints(state, player, bestBuy.card.bonus) === 0;
    if (!skipZeroInSprint) return bestBuy.act;
  }

  const takes = legal.filter(
    (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
      a.type === "TAKE_GEMS"
  );
  if (takes.length > 0) {
    const { gemNeedWeights, candidateCards } = computeGemNeedWeights(
      state,
      player,
      "master"
    );
    const bestTake = maxBy(takes, (t) =>
      scoreTakeGemsHeuristic(
        state,
        player,
        t,
        gemNeedWeights,
        candidateCards,
        "master"
      )
    )!;
    const cnt = GEM_COLORS.reduce((s, c) => s + (bestTake.gems[c] ?? 0), 0);
    if (cnt <= 1 && state.bank.gold > 0 && reserves.length > 0) {
      const bestRes = maxBy(reserves, (r) => {
        const c = findCardInPublicState(state, player, r.cardId);
        return c ? scoreStrategicReserveCandidate(state, player, c) : -999;
      });
      if (bestRes) return bestRes;
    }
    return bestTake;
  }

  return bestBuy?.act ?? reserves[0] ?? legal[0]!;
}

function stepPublicTurn(
  publicState: SplendorState,
  actorId: string,
  action: SplendorAction
): SplendorState {
  let cur = applySplendorAction(publicState, actorId, action).state;
  for (let i = 0; i < 4; i++) {
    if (cur.phase === "GAME_OVER") break;
    const active = cur.players[cur.activePlayerIndex];
    if (!active || active.id !== actorId) break;
    if (cur.phase !== "RETURN_TOKENS" && cur.phase !== "SELECT_NOBLE") break;
    const subLegal = getSplendorLegalActions(cur, actorId);
    if (subLegal.length === 0) break;
    const subAct =
      cur.phase === "SELECT_NOBLE"
        ? chooseBestNobleAction(cur, active, subLegal, "master")
        : chooseBestReturnTokensAction(cur, active, subLegal, "master");
    cur = applySplendorAction(cur, actorId, subAct).state;
  }
  return cur;
}

export function chooseSplendorBotAction(
  rawState: SplendorState,
  playerId: string
): SplendorAction | null {
  // Enforce 100% fair player view (redacting face-down decks & opponents' blind deck reserves)
  const state = getSplendorPlayerView(rawState, playerId);
  const legal = getSplendorLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  if (state.phase === "SELECT_NOBLE") {
    return chooseBestNobleAction(state, player, legal, difficulty);
  }
  if (state.phase === "RETURN_TOKENS") {
    return chooseBestReturnTokensAction(state, player, legal, difficulty);
  }

  if (difficulty !== "master") {
    return chooseOnePlySplendorAction(state, playerId, difficulty);
  }

  // === MASTER TIER: Multi-Turn Public Trajectory Search (Evaluates Final-Round Counter-Wins!) ===
  const purchaseActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );
  const scoredPurchases = purchaseActions
    .flatMap((act) => {
      const card = findCardInPublicState(state, player, act.cardId);
      return card
        ? [
            {
              act,
              card,
              score: evaluateCardUtility(state, player, card, "master"),
            },
          ]
        : [];
    })
    .sort((a, b) => b.score - a.score);

  const marketReserves = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
  );
  const deckReserveT3 = legal.find(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && a.deckTier === 3
  );

  const { gemNeedWeights, candidateCards } = computeGemNeedWeights(
    state,
    player,
    "master"
  );
  const takeActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
      a.type === "TAKE_GEMS"
  );
  const topTakes = [...takeActions]
    .map((act) => ({
      act,
      s: scoreTakeGemsHeuristic(
        state,
        player,
        act,
        gemNeedWeights,
        candidateCards,
        "master"
      ),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 7)
    .map((x) => x.act);

  const bestTakeCount =
    topTakes.length > 0
      ? GEM_COLORS.reduce((s, c) => s + (topTakes[0]!.gems[c] ?? 0), 0)
      : 0;

  const scoredReserves =
    player.reservedCards.length < 3
      ? marketReserves
          .flatMap((act) => {
            const c = findCardInPublicState(state, player, act.cardId);
            if (!c) return [];
            const rScore = scoreStrategicReserveCandidate(state, player, c);
            if (bestTakeCount >= 3 && rScore < 28.5) return [];
            if (c.tier === 1 && c.points === 0 && state.bank.gold === 0)
              return [];
            return [{ act, rScore }];
          })
          .sort((a, b) => b.rScore - a.rScore)
          .slice(0, 2)
      : [];

  const totalBonuses = GEM_COLORS.reduce((s, c) => s + player.bonuses[c], 0);
  const considerBlindT3 =
    Boolean(deckReserveT3) &&
    state.bank.gold > 0 &&
    player.reservedCards.length === 0 &&
    bestTakeCount <= 1 &&
    totalBonuses >= 7 &&
    player.points >= 9 &&
    (scoredReserves[0]?.rScore ?? 0) < 20;

  const rootCandidates: SplendorAction[] = [
    ...scoredPurchases.slice(0, 5).map((x) => x.act),
    ...topTakes.slice(0, 6),
    ...scoredReserves.map((x) => x.act),
    ...(considerBlindT3 && deckReserveT3 ? [deckReserveT3] : []),
  ];

  if (rootCandidates.length === 0) return legal[0]!;
  if (rootCandidates.length === 1) return rootCandidates[0]!;

  const decklessRoot: SplendorState = {
    ...state,
    decks: {
      1: [],
      2: [],
      3: considerBlindT3
        ? [
            {
              id: "blind-ev-t3",
              tier: 3,
              bonus: "onyx",
              points: 0,
              cost: emptyGemMap(),
              reservedFromDeck: true,
              redacted: true,
            },
          ]
        : [],
    },
  };

  const maxOppSteps = Math.max(1, state.players.length - 1);

  const evalRoot = (rootAct: SplendorAction): number => {
    const tieBias =
      rootAct.type === "PURCHASE_CARD"
        ? (() => {
            const c = findCardInPublicState(state, player, rootAct.cardId);
            return c
              ? evaluateCardUtility(state, player, c, "master") * 0.22
              : 0;
          })()
        : rootAct.type === "RESERVE_CARD"
          ? (() => {
              if (rootAct.deckTier) return -0.5;
              const c = findCardInPublicState(state, player, rootAct.cardId);
              if (!c) return -8;
              const rs = scoreStrategicReserveCandidate(state, player, c);
              return (
                (rs >= 33 ? 1.8 : 0) -
                (bestTakeCount >= 3 ? 2.3 : 0.4) -
                player.reservedCards.length * 1.6
              );
            })()
          : 0.85;

    const afterMyT1 = stepPublicTurn(decklessRoot, playerId, rootAct);
    if (afterMyT1.phase === "GAME_OVER") {
      return evaluateMasterPublicState(afterMyT1, playerId) + tieBias;
    }

    let beforeMyT2 = afterMyT1;
    for (let step = 0; step < maxOppSteps; step++) {
      if (beforeMyT2.phase === "GAME_OVER") break;
      const active = beforeMyT2.players[beforeMyT2.activePlayerIndex];
      if (!active || active.id === playerId) break;
      const oppMove = chooseFastTacticalOpponentAction(beforeMyT2, active.id);
      beforeMyT2 = stepPublicTurn(beforeMyT2, active.id, oppMove);
    }

    if (
      beforeMyT2.phase === "GAME_OVER" ||
      beforeMyT2.players[beforeMyT2.activePlayerIndex]?.id !== playerId
    ) {
      return evaluateMasterPublicState(beforeMyT2, playerId) + tieBias;
    }

    const t2Legal = getSplendorLegalActions(beforeMyT2, playerId);
    const meT2 = beforeMyT2.players.find((p) => p.id === playerId)!;

    const t2Purchases = t2Legal
      .filter(
        (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
          a.type === "PURCHASE_CARD"
      )
      .flatMap((act) => {
        const c = findCardInPublicState(beforeMyT2, meT2, act.cardId);
        return c
          ? [{ act, s: evaluateCardUtility(beforeMyT2, meT2, c, "master") }]
          : [];
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.act);

    const { gemNeedWeights: w2, candidateCards: c2 } = computeGemNeedWeights(
      beforeMyT2,
      meT2,
      "master"
    );
    const t2Takes = t2Legal
      .filter(
        (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
          a.type === "TAKE_GEMS"
      )
      .map((act) => ({
        act,
        s: scoreTakeGemsHeuristic(beforeMyT2, meT2, act, w2, c2, "master"),
      }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => x.act);

    const t2Cands: SplendorAction[] = [...t2Purchases, ...t2Takes];
    if (t2Cands.length === 0) {
      return evaluateMasterPublicState(beforeMyT2, playerId) + tieBias;
    }

    let bestT23Val = -Infinity;
    for (const t2Act of t2Cands) {
      const afterT2 = stepPublicTurn(beforeMyT2, playerId, t2Act);
      if (afterT2.phase === "GAME_OVER") {
        const v = evaluateMasterPublicState(afterT2, playerId);
        if (v > bestT23Val) bestT23Val = v;
        continue;
      }

      if (state.players.length >= 3) {
        let endT2 = afterT2;
        if (endT2.finalRoundTriggered && endT2.phase !== "GAME_OVER") {
          for (let k = 0; k < maxOppSteps; k++) {
            if (endT2.phase === "GAME_OVER") break;
            const actOpp = endT2.players[endT2.activePlayerIndex];
            if (!actOpp || actOpp.id === playerId) break;
            const om = chooseFastTacticalOpponentAction(endT2, actOpp.id);
            endT2 = stepPublicTurn(endT2, actOpp.id, om);
          }
        }
        const v2 = evaluateMasterPublicState(endT2, playerId);
        if (v2 > bestT23Val) bestT23Val = v2;
        continue;
      }

      // 2P: roll out opponent's Turn 2 response + our Turn 3 follow-up
      let beforeMyT3 = afterT2;
      for (let k = 0; k < maxOppSteps; k++) {
        if (beforeMyT3.phase === "GAME_OVER") break;
        const actOpp = beforeMyT3.players[beforeMyT3.activePlayerIndex];
        if (!actOpp || actOpp.id === playerId) break;
        const om = chooseFastTacticalOpponentAction(beforeMyT3, actOpp.id);
        beforeMyT3 = stepPublicTurn(beforeMyT3, actOpp.id, om);
      }

      let t3Val: number;
      if (
        beforeMyT3.phase === "GAME_OVER" ||
        beforeMyT3.players[beforeMyT3.activePlayerIndex]?.id !== playerId
      ) {
        t3Val = evaluateMasterPublicState(beforeMyT3, playerId);
      } else {
        const myT3Move = chooseFastTacticalOpponentAction(beforeMyT3, playerId);
        let afterT3 = stepPublicTurn(beforeMyT3, playerId, myT3Move);
        if (afterT3.finalRoundTriggered && afterT3.phase !== "GAME_OVER") {
          for (let k = 0; k < maxOppSteps; k++) {
            if (afterT3.phase === "GAME_OVER") break;
            const actOpp = afterT3.players[afterT3.activePlayerIndex];
            if (!actOpp || actOpp.id === playerId) break;
            const om = chooseFastTacticalOpponentAction(afterT3, actOpp.id);
            afterT3 = stepPublicTurn(afterT3, actOpp.id, om);
          }
        }
        t3Val = evaluateMasterPublicState(afterT3, playerId);
      }

      const blended23 =
        evaluateMasterPublicState(afterT2, playerId) * 0.35 + t3Val * 0.65;
      if (blended23 > bestT23Val) bestT23Val = blended23;
    }

    const midVal = evaluateMasterPublicState(beforeMyT2, playerId);
    return midVal * 0.15 + bestT23Val * 0.85 + tieBias;
  };

  return maxBy(rootCandidates, evalRoot) ?? rootCandidates[0]!;
}
