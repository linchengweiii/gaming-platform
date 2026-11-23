import { SEVEN_WONDERS_MASTER_BOT_WEIGHTS } from "../config/bot-config.ts";
import {
  SEVEN_WONDERS_COINS_PER_TREASURY_VP,
  SEVEN_WONDERS_DISCARD_COINS,
  SEVEN_WONDERS_TURNS_PER_AGE,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  canPlayerBuildViaChain,
  getLeftNeighborIndex,
  getRightNeighborIndex,
  getSevenWondersLegalActions,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "../rules.ts";
import type { SevenWondersAction, SevenWondersState } from "../types.ts";
import { evaluateMasterCardUtility } from "./card-eval.ts";
import type { WheelIntel } from "./science-eval.ts";
import {
  evaluateCoinFlowUtility,
  evaluateMasterWonderStage,
} from "./wonder-coin-eval.ts";

export function chooseHalikarnassusMasterAction(
  state: SevenWondersState,
  legal: readonly SevenWondersAction[],
  pIdx: number,
  wheel: WheelIntel
): SevenWondersAction {
  const me = state.players[pIdx]!;
  let bestAct = legal[0]!;
  let bestScore = -1e9;
  for (const act of legal) {
    if (act.type === "SKIP_DISCARD_BUILD") {
      if (SEVEN_WONDERS_MASTER_BOT_WEIGHTS.halikarnassusSkipScore > bestScore) {
        bestScore = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.halikarnassusSkipScore;
        bestAct = act;
      }
    } else if (act.type === "BUILD_FROM_DISCARD") {
      const card = state.discardPile.find((c) => c.id === act.cardId);
      if (!card) continue;
      const u = evaluateMasterCardUtility(state, pIdx, card, wheel);
      const coinBonus =
        state.age === 3 && state.draftRound === SEVEN_WONDERS_TURNS_PER_AGE
          ? Math.floor(
              (me.coins + u.immediateCoinsGained) /
                SEVEN_WONDERS_COINS_PER_TREASURY_VP
            ) -
            Math.floor(me.coins / SEVEN_WONDERS_COINS_PER_TREASURY_VP) +
            u.immediateCoinsGained * 0.025
          : u.immediateCoinsGained * (state.age === 1 ? 0.45 : 0.37);
      const total = u.nonCoinUtility + coinBonus;
      if (total > bestScore) {
        bestScore = total;
        bestAct = act;
      }
    }
  }
  return bestAct;
}

export function chooseBabylonSeventhCardLookahead(
  state: SevenWondersState,
  playerId: string,
  legal: readonly SevenWondersAction[],
  pIdx: number,
  wheel: WheelIntel
): SevenWondersAction | null {
  const me = state.players[pIdx]!;
  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  const nextStageGrantsSeventh =
    me.builtWonderStages < board.stages.length &&
    board.stages[me.builtWonderStages]!.effects.some(
      (e) => e.kind === "play_seventh_card"
    );
  const alreadyHasSeventh = hasWonderStageEffect(me, "play_seventh_card");

  if (
    state.phase !== "AGE_DRAFT" ||
    state.draftRound !==
      SEVEN_WONDERS_MASTER_BOT_WEIGHTS.babylonLookaheadDraftRound ||
    me.hand.length !==
      SEVEN_WONDERS_MASTER_BOT_WEIGHTS.babylonLookaheadHandSize ||
    (!alreadyHasSeventh && !nextStageGrantsSeventh)
  ) {
    return null;
  }

  const evaluateDraftStep = (
    st: SevenWondersState,
    act: Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }>,
    card: (typeof me.hand)[number]
  ) => {
    const pay = act.payment ?? { leftCoins: 0, rightCoins: 0 };
    const stepEval =
      act.kind === "build"
        ? evaluateMasterCardUtility(st, pIdx, card, wheel)
        : act.kind === "wonder"
          ? evaluateMasterWonderStage(st, pIdx, wheel)
          : {
              nonCoinUtility: 0,
              immediateCoinsGained: SEVEN_WONDERS_DISCARD_COINS,
            };
    const viaChain =
      act.kind === "build" && canPlayerBuildViaChain(st.players[pIdx]!, card);
    const spent =
      act.kind === "build"
        ? viaChain || act.useFreeBuild
          ? 0
          : card.coinCost + pay.leftCoins + pay.rightCoins
        : act.kind === "wonder"
          ? pay.leftCoins + pay.rightCoins
          : 0;
    return { pay, stepEval, spent };
  };

  let bestComboAct: SevenWondersAction | null = null;
  let bestComboScore = -1e9;

  for (const act1 of legal) {
    if (act1.type !== "SELECT_DRAFT_ACTION") continue;
    const unlocksSeventh =
      alreadyHasSeventh || (act1.kind === "wonder" && nextStageGrantsSeventh);

    const card1 = me.hand.find((c) => c.id === act1.cardId)!;
    const card2 = me.hand.find((c) => c.id !== act1.cardId)!;
    const { pay: pay1, stepEval: step1Eval, spent: spent1 } = evaluateDraftStep(
      state,
      act1,
      card1
    );

    let bestStep2Score = 0;
    if (unlocksSeventh) {
      const n = state.players.length;
      const lIdx = getLeftNeighborIndex(pIdx, n);
      const rIdx = getRightNeighborIndex(pIdx, n);
      const simPlayersStep2 = state.players.map((p, idx) => {
        if (idx === pIdx) {
          return {
            ...p,
            coins: p.coins - spent1 + step1Eval.immediateCoinsGained,
            tableau: act1.kind === "build" ? [...p.tableau, card1] : p.tableau,
            builtWonderStages:
              act1.kind === "wonder"
                ? p.builtWonderStages + 1
                : p.builtWonderStages,
            usedFreeBuildInAge: act1.useFreeBuild
              ? { ...p.usedFreeBuildInAge, [state.age]: true }
              : p.usedFreeBuildInAge,
            hand: [card2],
          };
        }
        if (idx === lIdx && pay1.leftCoins > 0) {
          return { ...p, coins: p.coins + pay1.leftCoins };
        }
        if (idx === rIdx && pay1.rightCoins > 0) {
          return { ...p, coins: p.coins + pay1.rightCoins };
        }
        return p;
      });

      const simState2: SevenWondersState = {
        ...state,
        phase: "SEVENTH_CARD_PLAY",
        seventhCardQueue: [playerId],
        players: simPlayersStep2,
      };
      const legal2 = getSevenWondersLegalActions(simState2, playerId);
      bestStep2Score = -1e9;
      for (const act2 of legal2) {
        if (act2.type !== "SELECT_DRAFT_ACTION") continue;
        const {
          pay: pay2,
          stepEval: step2Eval,
          spent: spent2,
        } = evaluateDraftStep(simState2, act2, card2);
        const coinUtil2 = evaluateCoinFlowUtility(
          simState2,
          pIdx,
          spent2,
          step2Eval.immediateCoinsGained,
          pay2
        );
        bestStep2Score = Math.max(
          bestStep2Score,
          step2Eval.nonCoinUtility + coinUtil2
        );
      }
    }

    const coinUtil1 = evaluateCoinFlowUtility(
      state,
      pIdx,
      spent1,
      step1Eval.immediateCoinsGained,
      pay1
    );
    let leak1 = 0;
    if (act1.kind !== "build" && !hasDuplicateCardName(me, card1.name)) {
      const ownC1 = evaluateMasterCardUtility(state, pIdx, card1, wheel);
      leak1 =
        Math.max(
          0,
          ownC1.nonCoinUtility +
            ownC1.immediateCoinsGained *
              SEVEN_WONDERS_MASTER_BOT_WEIGHTS.ownOpportunityLeakCoinWeight
        ) * SEVEN_WONDERS_MASTER_BOT_WEIGHTS.ownOpportunityLeakScale;
    }

    const comboTotal =
      step1Eval.nonCoinUtility + coinUtil1 - leak1 + bestStep2Score;
    if (comboTotal > bestComboScore) {
      bestComboScore = comboTotal;
      bestComboAct = act1;
    }
  }

  return bestComboAct;
}
