import {
  SEVEN_WONDERS_BOT_TIER_PROFILES,
  SEVEN_WONDERS_MASTER_BOT_WEIGHTS,
  SEVEN_WONDERS_NORMAL_BOT_WEIGHTS,
  SEVEN_WONDERS_SMART_BOT_WEIGHTS,
} from "../config/bot-config.ts";
import {
  SEVEN_WONDERS_DISCARD_COINS,
  SEVEN_WONDERS_TURNS_PER_AGE,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  canPlayerBuildViaChain,
  computeAffordablePaymentsPure,
  getLeftNeighborIndex,
  getRightNeighborIndex,
  getSevenWondersLegalActions,
  getSevenWondersPlayerView,
  hasDuplicateCardName,
} from "../rules.ts";
import type { SevenWondersAction, SevenWondersState } from "../types.ts";
import {
  evaluateCasualNormalCardUtility,
  evaluateMasterCardUtility,
} from "./card-eval.ts";
import {
  computeDraftDenialBonus,
  computeHalikarnassusDiscardFeedPenalty,
  doesAnyOpponentHaveActiveHalikarnassus,
  estimateOpponentBestUseOfCard,
} from "./deny-eval.ts";
import {
  chooseBabylonSeventhCardLookahead,
  chooseHalikarnassusMasterAction,
} from "./lookahead.ts";
import { getWheelIntelForPlayer } from "./science-eval.ts";
import {
  evaluateCoinFlowUtility,
  evaluateMasterWonderStage,
} from "./wonder-coin-eval.ts";

export function chooseMasterSevenWondersAction(
  state: SevenWondersState,
  playerId: string,
  legal: readonly SevenWondersAction[],
  pIdx: number
): SevenWondersAction {
  const mw = SEVEN_WONDERS_MASTER_BOT_WEIGHTS;
  const me = state.players[pIdx]!;
  const wheel = getWheelIntelForPlayer(state, pIdx);

  if (state.phase === "HALIKARNASSUS_PICK") {
    return chooseHalikarnassusMasterAction(state, legal, pIdx, wheel);
  }

  const babylonPick = chooseBabylonSeventhCardLookahead(
    state,
    playerId,
    legal,
    pIdx,
    wheel
  );
  if (babylonPick) {
    return babylonPick;
  }

  const nPlayers = state.players.length;
  const leftIdx = getLeftNeighborIndex(pIdx, nPlayers);
  const rightIdx = getRightNeighborIndex(pIdx, nPlayers);
  const nextReceiverIdx =
    state.draftRound < SEVEN_WONDERS_TURNS_PER_AGE &&
    state.phase === "AGE_DRAFT"
      ? state.passDirection === "clockwise"
        ? leftIdx
        : rightIdx
      : -1;

  const opponentHasActiveHalikarnassus = doesAnyOpponentHaveActiveHalikarnassus(
    state,
    pIdx
  );

  const receiverValById: Record<string, number> = {};
  let receiverValCount = 0;
  let maxReceiverBefore = 0;
  if (nextReceiverIdx >= 0 && me.hand.length >= 2) {
    for (const c of me.hand) {
      const v = estimateOpponentBestUseOfCard(state, nextReceiverIdx, c);
      receiverValById[c.id] = v;
      receiverValCount++;
      if (v > maxReceiverBefore) maxReceiverBefore = v;
    }
  }

  const secondReceiverIdx =
    nPlayers === 3 && nextReceiverIdx >= 0 && me.hand.length >= 3
      ? 3 - pIdx - nextReceiverIdx
      : -1;
  const secondReceiverValById: Record<string, number> = {};
  if (secondReceiverIdx >= 0) {
    for (const c of me.hand) {
      secondReceiverValById[c.id] = estimateOpponentBestUseOfCard(
        state,
        secondReceiverIdx,
        c
      );
    }
  }

  const wonderEval = evaluateMasterWonderStage(state, pIdx, wheel);

  let bestAct = legal[0]!;
  let bestScore = -1e9;

  for (const act of legal) {
    if (act.type !== "SELECT_DRAFT_ACTION") continue;
    const card = me.hand.find((c) => c.id === act.cardId);
    if (!card) continue;

    const pay = act.payment ?? { leftCoins: 0, rightCoins: 0 };
    const ownCardEval = hasDuplicateCardName(me, card.name)
      ? { nonCoinUtility: 0, immediateCoinsGained: 0 }
      : evaluateMasterCardUtility(state, pIdx, card, wheel);
    const ownOpportunityLeak =
      Math.max(
        0,
        ownCardEval.nonCoinUtility +
          ownCardEval.immediateCoinsGained * mw.ownOpportunityLeakCoinWeight
      ) * mw.ownOpportunityLeakScale;

    let actionScore: number;
    if (act.kind === "build") {
      const viaChain = canPlayerBuildViaChain(me, card);
      const coinsSpent =
        viaChain || act.useFreeBuild
          ? 0
          : card.coinCost + pay.leftCoins + pay.rightCoins;
      const coinUtil = evaluateCoinFlowUtility(
        state,
        pIdx,
        coinsSpent,
        ownCardEval.immediateCoinsGained,
        pay
      );

      let zeusOpportunityCost = 0;
      if (act.useFreeBuild) {
        const roundsLeft = SEVEN_WONDERS_TURNS_PER_AGE - state.draftRound;
        const normalPays = computeAffordablePaymentsPure(
          state.players,
          pIdx,
          card.resourceCost,
          card.coinCost
        );
        const minNormalCoins =
          normalPays.length > 0
            ? Math.min(
                ...normalPays.map(
                  (p) => card.coinCost + p.leftCoins + p.rightCoins
                )
              )
            : 8;
        if (
          roundsLeft >= mw.zeusEarlyRoundThreshold &&
          minNormalCoins <= mw.zeusLowNormalCoinThreshold
        ) {
          zeusOpportunityCost = mw.zeusEarlyOpportunityCost;
        } else {
          zeusOpportunityCost = roundsLeft * mw.zeusPerRoundOpportunityCost;
        }
      }

      actionScore = ownCardEval.nonCoinUtility + coinUtil - zeusOpportunityCost;
    } else if (act.kind === "wonder") {
      const coinsSpent = pay.leftCoins + pay.rightCoins;
      const coinUtil = evaluateCoinFlowUtility(
        state,
        pIdx,
        coinsSpent,
        wonderEval.immediateCoinsGained,
        pay
      );
      actionScore = wonderEval.nonCoinUtility + coinUtil - ownOpportunityLeak;
    } else {
      const coinUtil = evaluateCoinFlowUtility(
        state,
        pIdx,
        0,
        SEVEN_WONDERS_DISCARD_COINS,
        {
          leftCoins: 0,
          rightCoins: 0,
        }
      );
      const halikarnassusFeedPenalty = opponentHasActiveHalikarnassus
        ? computeHalikarnassusDiscardFeedPenalty(state, pIdx, card)
        : 0;
      actionScore = coinUtil - ownOpportunityLeak - halikarnassusFeedPenalty;
    }

    const denialBonus = computeDraftDenialBonus(
      state,
      pIdx,
      card,
      act.kind,
      nextReceiverIdx,
      receiverValById,
      receiverValCount,
      maxReceiverBefore,
      secondReceiverIdx,
      secondReceiverValById
    );

    const total = actionScore + denialBonus;
    if (total > bestScore) {
      bestScore = total;
      bestAct = act;
    }
  }

  return bestAct;
}

export function chooseIntermediateSevenWondersAction(
  state: SevenWondersState,
  legal: readonly SevenWondersAction[],
  pIdx: number,
  tier: "normal" | "smart"
): SevenWondersAction {
  const player = state.players[pIdx]!;
  const profile = SEVEN_WONDERS_BOT_TIER_PROFILES[tier];
  const nw = SEVEN_WONDERS_NORMAL_BOT_WEIGHTS;
  const sw = SEVEN_WONDERS_SMART_BOT_WEIGHTS;

  if (state.phase === "HALIKARNASSUS_PICK") {
    const skipScore =
      tier === "normal" ? nw.halikarnassusSkipScore : sw.halikarnassusSkipScore;
    return legal.reduce<{ bestAct: SevenWondersAction; bestScore: number }>(
      (best, act) => {
        if (act.type === "SKIP_DISCARD_BUILD") {
          return skipScore > best.bestScore
            ? { bestAct: act, bestScore: skipScore }
            : best;
        }
        if (act.type === "BUILD_FROM_DISCARD") {
          const card = state.discardPile.find((c) => c.id === act.cardId);
          if (!card) return best;
          const score =
            tier === "normal"
              ? evaluateCasualNormalCardUtility(state, player, card)
              : evaluateMasterCardUtility(state, pIdx, card).nonCoinUtility;
          return score > best.bestScore
            ? { bestAct: act, bestScore: score }
            : best;
        }
        return best;
      },
      { bestAct: legal[0]!, bestScore: -1e9 }
    ).bestAct;
  }

  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const wonderVal =
    player.builtWonderStages >= board.stages.length
      ? SEVEN_WONDERS_MASTER_BOT_WEIGHTS.duplicateCardPenalty
      : tier === "normal"
        ? board.stages[player.builtWonderStages]!.effects.reduce<number>(
            (s, ef) => {
              if (ef.kind === "vp") return s + ef.points;
              if (ef.kind === "coins") {
                return s + ef.coins * nw.coinImmediateWeight;
              }
              if (ef.kind === "shields") {
                return s + ef.shields * nw.wonderShieldWeight;
              }
              return s + nw.wonderSpecialEffectBonus;
            },
            nw.wonderBaseBias
          )
        : evaluateMasterWonderStage(state, pIdx).nonCoinUtility *
          profile.wonderStageUtilityScale;

  return legal.reduce<{ bestAct: SevenWondersAction; bestScore: number }>(
    (best, act) => {
      if (act.type !== "SELECT_DRAFT_ACTION") return best;
      const card = player.hand.find((c) => c.id === act.cardId);
      if (!card) return best;

      const pay = act.payment ?? { leftCoins: 0, rightCoins: 0 };
      const totalNeighborCoins = pay.leftCoins + pay.rightCoins;

      const score =
        act.kind === "build"
          ? (() => {
              const baseUtil =
                tier === "normal"
                  ? evaluateCasualNormalCardUtility(state, player, card)
                  : (() => {
                      const u = evaluateMasterCardUtility(state, pIdx, card);
                      return (
                        u.nonCoinUtility +
                        u.immediateCoinsGained * sw.immediateCoinsBuildWeight
                      );
                    })();
              const viaChain = canPlayerBuildViaChain(player, card);
              const spent =
                viaChain || act.useFreeBuild
                  ? 0
                  : card.coinCost + totalNeighborCoins;
              return (
                baseUtil -
                spent * profile.spendCoinPenaltyWeight -
                totalNeighborCoins * profile.neighborCoinFeedPenaltyWeight
              );
            })()
          : act.kind === "wonder"
            ? wonderVal -
              totalNeighborCoins *
                (tier === "normal"
                  ? nw.wonderNeighborCoinPenalty
                  : sw.wonderNeighborCoinPenalty)
            : player.coins === 0 && state.age < 3
              ? profile.discardZeroCoinAge12Score
              : profile.discardDefaultScore;

      return score > best.bestScore
        ? { bestAct: act, bestScore: score }
        : best;
    },
    { bestAct: legal[0]!, bestScore: -1e9 }
  ).bestAct;
}

export function chooseSevenWondersBotAction(
  rawState: SevenWondersState,
  playerId: string
): SevenWondersAction | null {
  const state = getSevenWondersPlayerView(rawState, playerId);
  const legal = getSevenWondersLegalActions(state, playerId);
  if (legal.length === 0) return null;

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0) return legal[0]!;
  const player = state.players[pIdx]!;
  const difficulty = player.botDifficulty ?? "smart";

  if (difficulty === "easy") {
    if (state.phase === "HALIKARNASSUS_PICK") {
      return legal[0]!;
    }
    const buildActions = legal.filter(
      (a): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" && a.kind === "build"
    );
    if (buildActions.length > 0) {
      const idx = (state.turn + pIdx) % buildActions.length;
      return buildActions[idx]!;
    }
    const wonderActions = legal.filter(
      (a): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder"
    );
    if (wonderActions.length > 0) return wonderActions[0]!;
    return legal[0]!;
  }

  if (difficulty === "master") {
    return chooseMasterSevenWondersAction(state, playerId, legal, pIdx);
  }

  return chooseIntermediateSevenWondersAction(
    state,
    legal,
    pIdx,
    difficulty === "smart" ? "smart" : "normal"
  );
}
