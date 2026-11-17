import {
  GEM_COLORS,
  SPLENDOR_BOT_TUNING,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import {
  applySplendorAction,
  computeCardPurchasePayment,
  emptyGemMap,
  getSplendorLegalActions,
} from "../rules.ts";
import type {
  SplendorAction,
  SplendorCard,
  SplendorPlayerState,
  SplendorState,
} from "../types.ts";
import { evaluateMasterPublicState } from "./board-eval.ts";
import {
  chooseBestNobleAction,
  chooseBestReturnTokensAction,
  scoreStrategicReserveCandidate,
} from "./candidates.ts";
import {
  computeGemNeedWeights,
  evaluateCardUtility,
  scoreTakeGemsHeuristic,
} from "./evaluate.ts";
import {
  findCardInPublicState,
  getUnlockedNoblePoints,
  maxBy,
} from "./helpers.ts";

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

export function chooseMasterSplendorAction(
  state: SplendorState,
  player: SplendorPlayerState,
  playerId: string,
  legal: readonly SplendorAction[]
): SplendorAction {
  const sc = SPLENDOR_BOT_TUNING.masterSearch;
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
    .slice(0, sc.rootTopTakesPool)
    .map((x) => x.act);

  const bestTakeCount =
    topTakes.length > 0
      ? GEM_COLORS.reduce((s, c) => s + (topTakes[0]!.gems[c] ?? 0), 0)
      : 0;

  const scoredReserves =
    player.reservedCards.length < SPLENDOR_MAX_RESERVED_CARDS
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
          .slice(0, sc.rootMaxReserves)
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
    ...scoredPurchases.slice(0, sc.rootMaxPurchases).map((x) => x.act),
    ...topTakes.slice(0, sc.rootMaxTakes),
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
      .slice(0, sc.t2MaxPurchases)
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
      .slice(0, sc.t2MaxTakes)
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
        evaluateMasterPublicState(afterT2, playerId) * sc.twoPlayerTurn2Weight +
        t3Val * sc.twoPlayerTurn3Weight;
      if (blended23 > bestT23Val) bestT23Val = blended23;
    }

    const midVal = evaluateMasterPublicState(beforeMyT2, playerId);
    return (
      midVal * sc.midTrajectoryWeight +
      bestT23Val * sc.deepTrajectoryWeight +
      tieBias
    );
  };

  return maxBy(rootCandidates, evalRoot) ?? rootCandidates[0]!;
}
