import type { BotDifficulty } from "@gaming-platform/core";
import {
  computeCardPurchasePayment,
  getSplendorLegalActions,
} from "./rules.ts";
import {
  GEM_COLORS,
  type GemColor,
  type SplendorAction,
  type SplendorCard,
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

export let SPLENDOR_MASTER_WEIGHTS: SplendorMasterWeights = {
  basePointWeight: 5.969,
  sprintPointWeight: 9.328,
  nobleImmediateWeight: 7.935,
  nobleProgressWeight: 7.5,
  earlyDiscountWeight: 1.55,
  midDiscountWeight: 0.826,
  costEfficiencyPenalty: 0.259,
  sprintZeroPointPenalty: 0.595,
  reserveBoost: 1.46,
  distanceExponent: 2.15,
  singleColorBottleneckMult: 1.294,
  draftedCountBonus: 1.4,
  overflowPenalty: 7.715,
  unlockOneTurnWeight: 0.889,
  unlockTwoTurnWeight: 0.202,
};

export function setMasterSplendorBotWeights(
  overrides: Partial<SplendorMasterWeights>
): void {
  SPLENDOR_MASTER_WEIGHTS = {
    ...SPLENDOR_MASTER_WEIGHTS,
    ...overrides,
  };
}

function totalPlayerTokens(player: SplendorPlayerState): number {
  return (
    player.tokens.emerald +
    player.tokens.diamond +
    player.tokens.sapphire +
    player.tokens.onyx +
    player.tokens.ruby +
    player.tokens.gold
  );
}

function getUnlockedNoblePoints(
  state: SplendorState,
  player: SplendorPlayerState,
  bonusColor: GemColor
): number {
  let bestNoblePts = 0;
  for (const noble of state.nobles) {
    let qualifies = true;
    for (const c of GEM_COLORS) {
      const req = noble.requirements[c] ?? 0;
      const after = player.bonuses[c] + (c === bonusColor ? 1 : 0);
      if (after < req) {
        qualifies = false;
        break;
      }
    }
    if (qualifies && noble.points > bestNoblePts) {
      bestNoblePts = noble.points;
    }
  }
  return bestNoblePts;
}

/**
 * Evaluates a Splendor card's strategic utility across difficulty levels (`easy` -> `master`).
 */
function evaluateCardUtility(
  state: SplendorState,
  player: SplendorPlayerState,
  card: SplendorCard,
  difficulty: BotDifficulty
): number {
  if (difficulty === "easy") {
    return card.points * 3 + 1;
  }

  const targetPts = state.config.targetPoints;
  const nobleImmediatePts = getUnlockedNoblePoints(state, player, card.bonus);

  if (player.points + card.points + nobleImmediatePts >= targetPts) {
    return 1000 + (player.points + card.points + nobleImmediatePts) * 10;
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
    player.points >= 8 || maxOppPts >= 10 || engineSize >= 9;

  let score =
    card.points *
      (difficulty === "master"
        ? inSprintPhase
          ? mw.sprintPointWeight
          : mw.basePointWeight
        : 5.4) +
    nobleImmediatePts *
      (difficulty === "master" ? mw.nobleImmediateWeight : 8.5);

  for (const noble of state.nobles) {
    const req = noble.requirements[card.bonus] ?? 0;
    if (req > 0 && player.bonuses[card.bonus] < req) {
      let totalMissingForNoble = 0;
      for (const c of GEM_COLORS) {
        totalMissingForNoble += Math.max(
          0,
          (noble.requirements[c] ?? 0) - player.bonuses[c]
        );
      }
      score +=
        difficulty === "master"
          ? mw.nobleProgressWeight / Math.max(1, totalMissingForNoble)
          : 3.0 / Math.max(1, totalMissingForNoble);
    }
  }

  const futureTargets = [
    ...player.reservedCards,
    ...state.market[2],
    ...state.market[3],
  ];
  let demandForBonus = 0;
  for (const future of futureTargets) {
    if (future.id === card.id) continue;
    if ((future.cost[card.bonus] ?? 0) > player.bonuses[card.bonus]) {
      demandForBonus += future.points >= 2 ? 1.5 : 0.75;
    }
  }
  const discountWeight =
    engineSize < 5
      ? difficulty === "master"
        ? mw.earlyDiscountWeight
        : 1.5
      : engineSize < 8
        ? difficulty === "master"
          ? mw.midDiscountWeight
          : 1.0
        : inSprintPhase
          ? 0.2
          : 0.55;
  score += (2.4 + Math.min(7.5, demandForBonus)) * discountWeight;

  if (difficulty === "master") {
    const payment = computeCardPurchasePayment(player, card);
    const coloredSpent = GEM_COLORS.reduce(
      (acc, c) => acc + (payment.payment[c] ?? 0),
      0
    );
    const effectiveCost = coloredSpent + payment.goldShortfall * 1.35;
    score -=
      effectiveCost *
      (card.points === 0 && inSprintPhase
        ? mw.sprintZeroPointPenalty
        : mw.costEfficiencyPenalty);
  }

  return score;
}

export function chooseSplendorBotAction(
  state: SplendorState,
  playerId: string
): SplendorAction | null {
  const legal = getSplendorLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId)!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";
  const mw = SPLENDOR_MASTER_WEIGHTS;

  if (state.phase === "SELECT_NOBLE") {
    return legal[0]!;
  }

  if (state.phase === "RETURN_TOKENS") {
    const retActions = legal.filter(
      (a): a is Extract<SplendorAction, { type: "RETURN_TOKENS" }> =>
        a.type === "RETURN_TOKENS"
    );
    if (difficulty === "easy" || difficulty === "normal") {
      return retActions[0] ?? legal[0]!;
    }

    const colorPriority: Record<GemColor, number> = {
      emerald: 0,
      diamond: 0,
      sapphire: 0,
      onyx: 0,
      ruby: 0,
    };
    for (const card of [
      ...player.reservedCards,
      ...state.market[3],
      ...state.market[2],
      ...state.market[1],
    ]) {
      for (const c of GEM_COLORS) {
        const need = Math.max(0, card.cost[c] - player.bonuses[c]);
        colorPriority[c] += need * (card.points + 1);
      }
    }

    retActions.sort((a, b) => {
      const penaltyA =
        (a.tokens.gold ?? 0) * 100 +
        GEM_COLORS.reduce(
          (acc, c) => acc + (a.tokens[c] ?? 0) * colorPriority[c],
          0
        );
      const penaltyB =
        (b.tokens.gold ?? 0) * 100 +
        GEM_COLORS.reduce(
          (acc, c) => acc + (b.tokens[c] ?? 0) * colorPriority[c],
          0
        );
      return penaltyA - penaltyB;
    });
    return retActions[0] ?? legal[0]!;
  }

  const allAvailableCards = [
    ...state.market[1],
    ...state.market[2],
    ...state.market[3],
    ...player.reservedCards,
  ];

  const purchaseActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );

  if (difficulty === "easy") {
    if (
      purchaseActions.length > 0 &&
      (state.round % 2 === 1 || totalPlayerTokens(player) >= 8)
    ) {
      return purchaseActions[0]!;
    }
    const takes = legal.filter((a) => a.type === "TAKE_GEMS");
    return takes[takes.length - 1] ?? purchaseActions[0] ?? legal[0]!;
  }

  let bestPurchase: Extract<SplendorAction, { type: "PURCHASE_CARD" }> | null =
    null;
  let bestPurchaseCard: SplendorCard | null = null;
  let bestPurchaseScore = -Infinity;
  for (const act of purchaseActions) {
    const card = allAvailableCards.find((c) => c.id === act.cardId);
    if (!card) continue;
    const s = evaluateCardUtility(state, player, card, difficulty);
    if (s > bestPurchaseScore) {
      bestPurchaseScore = s;
      bestPurchase = act;
      bestPurchaseCard = card;
    }
  }

  if (bestPurchase && bestPurchaseScore >= 900) {
    return bestPurchase;
  }

  // Master Defensive Block against an opponent's immediate lethal purchase
  const reserveActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
  );
  if (difficulty === "master" && reserveActions.length > 0) {
    const marketCards = [
      ...state.market[3],
      ...state.market[2],
      ...state.market[1],
    ];
    for (const opp of state.players) {
      if (opp.id === player.id) continue;
      if (opp.points < state.config.targetPoints - 6) continue;
      for (const mCard of marketCards) {
        const oppNoble = getUnlockedNoblePoints(state, opp, mCard.bonus);
        if (opp.points + mCard.points + oppNoble < state.config.targetPoints) {
          continue;
        }
        const oppPay = computeCardPurchasePayment(opp, mCard);
        if (oppPay.affordable) {
          const blockAct = reserveActions.find((r) => r.cardId === mCard.id);
          if (blockAct) return blockAct;
        }
      }
    }
  }

  if (bestPurchase && bestPurchaseCard) {
    let holdTokensForBomb = false;
    if (
      difficulty === "master" &&
      player.points >= 9 &&
      bestPurchaseCard.points === 0 &&
      getUnlockedNoblePoints(state, player, bestPurchaseCard.bonus) === 0
    ) {
      for (const bomb of [
        ...player.reservedCards,
        ...state.market[3],
        ...state.market[2],
      ]) {
        if (bomb.points < 3) continue;
        let miss = 0;
        for (const c of GEM_COLORS) {
          miss += Math.max(
            0,
            bomb.cost[c] - player.bonuses[c] - player.tokens[c]
          );
        }
        if (miss - player.tokens.gold <= 2) {
          holdTokensForBomb = true;
          break;
        }
      }
    }
    if (!holdTokensForBomb) {
      return bestPurchase;
    }
  }

  if (
    difficulty === "master" &&
    player.reservedCards.length < 2 &&
    state.bank.gold > 0 &&
    totalPlayerTokens(player) <= 9
  ) {
    for (const act of reserveActions) {
      const card = [...state.market[3], ...state.market[2]].find(
        (c) => c.id === act.cardId
      );
      if (!card || card.points < 3) continue;
      let totalMiss = 0;
      let bankStarvedMiss = false;
      for (const c of GEM_COLORS) {
        const miss = Math.max(
          0,
          card.cost[c] - player.bonuses[c] - player.tokens[c]
        );
        totalMiss += miss;
        if (miss > 0 && state.bank[c] === 0) {
          bankStarvedMiss = true;
        }
      }
      if (bankStarvedMiss && totalMiss <= player.tokens.gold + 1) {
        return act;
      }
    }
  }

  const candidateCards =
    difficulty === "normal"
      ? [...state.market[1], ...state.market[2], ...player.reservedCards]
      : [
          ...player.reservedCards,
          ...state.market[1],
          ...state.market[2],
          ...state.market[3],
        ];

  const gemNeedWeights: Record<GemColor, number> = {
    emerald: 0.4,
    diamond: 0.4,
    sapphire: 0.4,
    onyx: 0.4,
    ruby: 0.4,
  };

  for (const card of candidateCards) {
    const isReservedByMe = player.reservedCards.some((r) => r.id === card.id);
    let totalMissing = 0;
    let maxSingleColorMissing = 0;
    for (const c of GEM_COLORS) {
      const m = Math.max(
        0,
        card.cost[c] - player.bonuses[c] - player.tokens[c]
      );
      totalMissing += m;
      if (m > maxSingleColorMissing) {
        const effectiveColorTurns = m === 2 && state.bank[c] >= 4 ? 1 : m;
        if (effectiveColorTurns > maxSingleColorMissing) {
          maxSingleColorMissing = effectiveColorTurns;
        }
      }
    }
    const netTotalMissing = Math.max(1, totalMissing - player.tokens.gold);
    const effectiveDistance =
      difficulty === "master"
        ? Math.max(
            netTotalMissing,
            Math.max(1, maxSingleColorMissing - player.tokens.gold) *
              mw.singleColorBottleneckMult
          )
        : netTotalMissing;
    const util = Math.max(
      1,
      evaluateCardUtility(state, player, card, difficulty)
    );
    const reserveBoost =
      isReservedByMe ? (difficulty === "master" ? mw.reserveBoost : 1.55) : 1.0;
    const exp =
      difficulty === "normal"
        ? 1.15
        : difficulty === "smart"
          ? 1.75
          : mw.distanceExponent;
    const weight = (util * reserveBoost) / Math.pow(effectiveDistance, exp);

    for (const color of GEM_COLORS) {
      const missing = Math.max(
        0,
        card.cost[color] - player.bonuses[color] - player.tokens[color]
      );
      if (missing > 0) {
        gemNeedWeights[color] += missing * weight;
      }
    }
  }

  const takeGemsActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
      a.type === "TAKE_GEMS"
  );
  if (takeGemsActions.length > 0) {
    const curTokens = totalPlayerTokens(player);
    let bestTake = takeGemsActions[0]!;
    let bestScore = -Infinity;

    for (const act of takeGemsActions) {
      let draftedCount = 0;
      let s = 0;
      for (const color of GEM_COLORS) {
        const count = act.gems[color] ?? 0;
        draftedCount += count;
        s += count * gemNeedWeights[color];
      }

      if (difficulty === "master") {
        s += draftedCount * mw.draftedCountBonus;
        const overflow = Math.max(0, curTokens + draftedCount - 10);
        s -= overflow * mw.overflowPenalty;

        let maxUnlockedUtil = 0;
        let maxTwoTurnUtil = 0;
        for (const card of candidateCards) {
          let remShortfall = 0;
          let maxColorRem = 0;
          for (const c of GEM_COLORS) {
            const haveAfter =
              player.bonuses[c] + player.tokens[c] + (act.gems[c] ?? 0);
            if (haveAfter < card.cost[c]) {
              const cm = card.cost[c] - haveAfter;
              remShortfall += cm;
              if (cm > maxColorRem) maxColorRem = cm;
            }
          }
          if (remShortfall <= player.tokens.gold) {
            const u = evaluateCardUtility(state, player, card, difficulty);
            if (u > maxUnlockedUtil) maxUnlockedUtil = u;
          } else if (
            remShortfall - player.tokens.gold <= 3 &&
            maxColorRem - player.tokens.gold <= 1
          ) {
            const u2 = evaluateCardUtility(state, player, card, difficulty);
            if (u2 > maxTwoTurnUtil) maxTwoTurnUtil = u2;
          }
        }
        s +=
          maxUnlockedUtil * mw.unlockOneTurnWeight +
          maxTwoTurnUtil * mw.unlockTwoTurnWeight;
      } else if (difficulty === "smart") {
        const overflow = Math.max(0, curTokens + draftedCount - 10);
        s -= overflow * 4.5;
      }

      if (s > bestScore) {
        bestScore = s;
        bestTake = act;
      }
    }

    const bestDraftedCount = GEM_COLORS.reduce(
      (acc, c) => acc + (bestTake.gems[c] ?? 0),
      0
    );
    if (
      difficulty === "master" &&
      bestDraftedCount <= 1 &&
      state.bank.gold > 0 &&
      reserveActions.length > 0 &&
      curTokens <= 8
    ) {
      let bestRes = reserveActions[0]!;
      let bestResUtil = -Infinity;
      for (const rAct of reserveActions) {
        const c = allAvailableCards.find((x) => x.id === rAct.cardId);
        if (!c) continue;
        const u = evaluateCardUtility(state, player, c, difficulty);
        if (u > bestResUtil) {
          bestResUtil = u;
          bestRes = rAct;
        }
      }
      return bestRes;
    }

    return bestTake;
  }

  if (bestPurchase) return bestPurchase;
  if (reserveActions.length > 0) return reserveActions[0]!;
  return legal[0]!;
}
