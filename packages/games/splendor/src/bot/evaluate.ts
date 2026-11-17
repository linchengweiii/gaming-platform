import type { BotDifficulty } from "@gaming-platform/core";
import {
  GEM_COLORS,
  SPLENDOR_BOT_TUNING,
  SPLENDOR_HAND_TOKEN_LIMIT,
  SPLENDOR_MASTER_WEIGHTS,
} from "../config.ts";
import {
  computeCardPurchasePayment,
  emptyGemMap,
  totalTokens,
} from "../rules.ts";
import type {
  GemMap,
  SplendorAction,
  SplendorCard,
  SplendorPlayerState,
  SplendorState,
} from "../types.ts";
import { estimateTurnsToAfford, getUnlockedNoblePoints } from "./helpers.ts";

/**
 * Pure strategic card utility evaluator across difficulty tiers (`easy` -> `master`).
 */
export function evaluateCardUtility(
  state: SplendorState,
  player: SplendorPlayerState,
  card: SplendorCard,
  difficulty: BotDifficulty
): number {
  if (card.redacted) return 0;
  if (difficulty === "easy") {
    const ew = SPLENDOR_BOT_TUNING.easy;
    return card.points * ew.cardPointWeight + ew.cardBaseBonus;
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
    const nw = SPLENDOR_BOT_TUNING.normal;
    return (
      card.points * nw.cardPointWeight +
      nobleImmediatePts * nw.nobleWeight +
      (player.purchasedCards.length < 8
        ? nw.earlyEngineBonus
        : nw.lateEngineBonus)
    );
  }

  const mw = SPLENDOR_MASTER_WEIGHTS;
  const sw = SPLENDOR_BOT_TUNING.smart;
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
        : sw.cardPointWeight) +
    nobleImmediatePts *
      (difficulty === "master"
        ? mw.nobleImmediateWeight
        : sw.nobleImmediateWeight);

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
    const weight =
      difficulty === "master"
        ? mw.nobleProgressWeight
        : sw.nobleProgressWeight;
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

export function computeGemNeedWeights(
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
      const util = Math.max(
        1,
        evaluateCardUtility(state, player, card, "master")
      );
      const dist = Math.max(1, minTurns * 1.8 + netMissing * 0.45);
      const w =
        (util * (isRes ? mw.reserveBoost : 1.0)) /
        Math.pow(dist, mw.distanceExponent);

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
    const exp =
      difficulty === "normal"
        ? SPLENDOR_BOT_TUNING.normal.distanceExponent
        : SPLENDOR_BOT_TUNING.smart.distanceExponent;
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

export function scoreTakeGemsHeuristic(
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

  const overflow = Math.max(
    0,
    curTokens + draftedCount - SPLENDOR_HAND_TOKEN_LIMIT
  );
  if (difficulty === "normal") {
    return baseNeedScore - overflow * SPLENDOR_BOT_TUNING.normal.overflowPenalty;
  }
  if (difficulty === "smart") {
    return (
      baseNeedScore +
      draftedCount * SPLENDOR_BOT_TUNING.smart.draftedCountBonus -
      overflow * SPLENDOR_BOT_TUNING.smart.overflowPenalty
    );
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
