import type { BotDifficulty } from "@gaming-platform/core";
import {
  GEM_COLORS,
  SPLENDOR_BOT_TUNING,
  SPLENDOR_HAND_TOKEN_LIMIT,
} from "../config.ts";
import {
  emptyGemMap,
  getInitialGemBankCount,
  totalTokens,
} from "../rules/helpers.ts";
import type {
  GemMap,
  SplendorAction,
  SplendorCard,
  SplendorNoble,
  SplendorPlayerState,
  SplendorState,
} from "../types.ts";
import { playerStillActsIfFinalRoundTriggeredNow } from "./board-eval.ts";
import {
  computeGemNeedWeights,
  evaluateCardUtility,
  scoreTakeGemsHeuristic,
} from "./evaluate.ts";
import {
  estimateTurnsToAfford,
  findCardInPublicState,
  getUnlockedNoblePoints,
  maxBy,
} from "./helpers.ts";

export function chooseBestNobleAction(
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

export function chooseBestReturnTokensAction(
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

  const excess = Math.max(
    1,
    totalTokens(player.tokens) - SPLENDOR_HAND_TOKEN_LIMIT
  );
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
 * Fast 1-ply policy for `easy`, `normal`, and `smart`.
 */
export function chooseOnePlySplendorAction(
  state: SplendorState,
  player: SplendorPlayerState,
  legal: readonly SplendorAction[],
  difficulty: BotDifficulty
): SplendorAction {
  const purchaseActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );

  if (difficulty === "easy") {
    if (
      purchaseActions.length > 0 &&
      (state.round % 2 === 1 ||
        totalTokens(player.tokens) >= SPLENDOR_BOT_TUNING.easy.buyTokenThreshold)
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
      player.points >= SPLENDOR_BOT_TUNING.smart.sprintHoldPointsThreshold &&
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

  const reserveActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
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
    const draftedCount = totalTokens(bestTake.gems);
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
  return reserveActions[0] ?? legal[0]!;
}

export function scoreStrategicReserveCandidate(
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

  const maxBankStack = getInitialGemBankCount(state.players.length);
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
