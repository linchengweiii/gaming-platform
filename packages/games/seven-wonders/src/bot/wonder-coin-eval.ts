import { SEVEN_WONDERS_MASTER_BOT_WEIGHTS } from "../config/bot-config.ts";
import {
  SEVEN_WONDERS_COINS_PER_TREASURY_VP,
  SEVEN_WONDERS_TURNS_PER_AGE,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  computeSevenWondersScoreBreakdown,
  getLeftNeighborIndex,
  getOwnResourceProfile,
  getRightNeighborIndex,
  hasWonderStageEffect,
} from "../rules.ts";
import {
  type NeighborPayment,
  type SevenWondersPlayerState,
  type SevenWondersState,
  WONDER_RESOURCES,
} from "../types.ts";
import {
  computeOpponentContenderWeight,
  evaluateMasterMilitarySwing,
} from "./military-resource-eval.ts";
import type { WheelIntel } from "./science-eval.ts";

export function evaluateMasterWonderStage(
  fairView: SevenWondersState,
  pIdx: number,
  wheel?: WheelIntel
): { readonly nonCoinUtility: number; readonly immediateCoinsGained: number } {
  const me = fairView.players[pIdx]!;
  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  if (me.builtWonderStages >= board.stages.length) {
    return {
      nonCoinUtility: SEVEN_WONDERS_MASTER_BOT_WEIGHTS.duplicateCardPenalty,
      immediateCoinsGained: 0,
    };
  }

  const st = board.stages[me.builtWonderStages]!;
  const leftIdx = getLeftNeighborIndex(pIdx, fairView.players.length);
  const rightIdx = getRightNeighborIndex(pIdx, fairView.players.length);
  const left = fairView.players[leftIdx]!;
  const right = fairView.players[rightIdx]!;

  let coinsGained = 0;
  let val = 0;

  for (const ef of st.effects) {
    if (ef.kind === "vp") {
      val += ef.points;
    } else if (ef.kind === "coins") {
      coinsGained += ef.coins;
    } else if (ef.kind === "shields") {
      const circ =
        wheel?.circulatingShieldCards ??
        Math.max(0, SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound);
      val +=
        evaluateMasterMilitarySwing(fairView, pIdx, leftIdx, ef.shields, circ) +
        evaluateMasterMilitarySwing(fairView, pIdx, rightIdx, ef.shields, circ);
    } else if (ef.kind === "wildcard_resource") {
      const isMfg = ef.options.includes("glass");
      val +=
        fairView.age === 1
          ? isMfg
            ? 5.6
            : 5.3
          : fairView.age === 2
            ? isMfg
              ? 4.1
              : 3.5
            : 0.7;
    } else if (ef.kind === "wildcard_science") {
      const before = computeSevenWondersScoreBreakdown(fairView.players, pIdx);
      const simMe: SevenWondersPlayerState = {
        ...me,
        builtWonderStages: me.builtWonderStages + 1,
      };
      const after = computeSevenWondersScoreBreakdown(
        fairView.players.map((p, i) => (i === pIdx ? simMe : p)),
        pIdx
      );
      const exactGain = after.scientificVp - before.scientificVp;
      const greenCnt = me.tableau.filter((c) => c.color === "green").length;
      val +=
        fairView.age === 3
          ? Math.max(exactGain, fairView.draftRound <= 3 ? 4.5 : exactGain)
          : Math.max(exactGain, 4.0 + Math.min(3, greenCnt) * 0.9);
    } else if (ef.kind === "play_seventh_card") {
      const ownRes = getOwnResourceProfile(me);
      const resRichness = Math.min(
        4,
        WONDER_RESOURCES.reduce((s, r) => s + ownRes.fixed[r], 0) +
          ownRes.choices.length
      );
      const perAgeVal = 3.05 + resRichness * 0.25;
      const agesRemainingIncludingThis = 4 - fairView.age;
      val += agesRemainingIncludingThis * perAgeVal;
    } else if (ef.kind === "free_build_per_age") {
      const curUsable = fairView.draftRound <= 5 ? 0.85 : 0.1;
      const futAges = 3 - fairView.age;
      val += (curUsable + futAges) * 4.2;
    } else if (ef.kind === "build_from_discard") {
      const discardCount =
        fairView.hiddenDiscardCount ?? fairView.discardPile.length;
      const remainingDiscardStagesAfterThis = board.stages
        .slice(me.builtWonderStages + 1)
        .filter((s) =>
          s.effects.some((e) => e.kind === "build_from_discard")
        ).length;

      if (fairView.draftRound === SEVEN_WONDERS_TURNS_PER_AGE) {
        val += fairView.age === 3 ? 8.8 : fairView.age === 2 ? 7.2 : 5.2;
      } else if (discardCount === 0) {
        val += 0.6;
      } else if (fairView.age === 3) {
        val +=
          remainingDiscardStagesAfterThis >= 1
            ? 6.4
            : fairView.draftRound >= 4
              ? 6.8
              : 4.1;
      } else if (fairView.age === 2) {
        val +=
          remainingDiscardStagesAfterThis >= 1
            ? fairView.draftRound >= 4
              ? 5.8
              : 4.4
            : 3.1;
      } else {
        val += remainingDiscardStagesAfterThis >= 2 ? 4.0 : 2.2;
      }
    } else if (ef.kind === "raw_trade_both_discount") {
      const nbBrowns =
        left.tableau.filter((c) => c.color === "brown").length +
        right.tableau.filter((c) => c.color === "brown").length +
        2;
      val +=
        fairView.age === 1
          ? 3.8 + Math.min(2.0, nbBrowns * 0.45)
          : fairView.age === 2
            ? 2.2
            : 0.3;
    } else if (ef.kind === "copy_neighbor_guild") {
      const baseVp = computeSevenWondersScoreBreakdown(
        fairView.players,
        pIdx
      ).totalVp;
      const simMe3: SevenWondersPlayerState = {
        ...me,
        builtWonderStages: me.builtWonderStages + 1,
      };
      const exactCopiedGain =
        computeSevenWondersScoreBreakdown(
          fairView.players.map((p, i) => (i === pIdx ? simMe3 : p)),
          pIdx
        ).totalVp -
        baseVp -
        st.effects.reduce((s, e) => (e.kind === "vp" ? s + e.points : s), 0);
      const rLeft = SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound;
      val +=
        fairView.age === 3
          ? Math.max(exactCopiedGain, rLeft >= 2 ? 6.2 : rLeft === 1 ? 4.5 : 0)
          : 6.4;
    }
  }

  if (me.tableau.some((c) => c.name === "Arena")) val += 1.0;
  if (me.tableau.some((c) => c.name === "Builders Guild")) val += 1.0;

  if (me.builtWonderStages + 1 < board.stages.length) {
    const nextSt = board.stages[me.builtWonderStages + 1]!;
    if (nextSt.effects.some((e) => e.kind === "play_seventh_card")) {
      val += fairView.age === 1 ? 2.75 : fairView.age === 2 ? 2.45 : 0.8;
    } else if (nextSt.effects.some((e) => e.kind === "copy_neighbor_guild")) {
      val += fairView.age <= 2 ? 2.1 : 1.6;
    } else if (nextSt.effects.some((e) => e.kind === "free_build_per_age")) {
      val += fairView.age === 1 ? 2.4 : 1.2;
    } else if (
      nextSt.effects.some(
        (e) =>
          (e.kind === "vp" && e.points >= 7) ||
          e.kind === "wildcard_science" ||
          e.kind === "build_from_discard"
      )
    ) {
      val += 1.45;
    } else {
      val += 0.85;
    }
  }

  return { nonCoinUtility: val, immediateCoinsGained: coinsGained };
}

function concaveCoinPotential(coins: number, age: 1 | 2 | 3): number {
  if (coins <= 0) return age < 3 ? -0.28 : 0;
  const tier1 = Math.min(4, coins);
  const tier2 = Math.max(0, Math.min(8, coins) - 4);
  const tier3 = Math.max(0, coins - 8);
  if (age === 1) return tier1 * 0.45 + tier2 * 0.4 + tier3 * 0.345;
  if (age === 2) return tier1 * 0.4 + tier2 * 0.375 + tier3 * 0.34;
  return tier1 * 0.36 + tier2 * 0.345 + tier3 * 0.335;
}

export function evaluateCoinFlowUtility(
  fairView: SevenWondersState,
  pIdx: number,
  coinsSpent: number,
  coinsGained: number,
  payment: NeighborPayment
): number {
  const me = fairView.players[pIdx]!;
  const netCoins = coinsGained - coinsSpent;
  const endingCoins = me.coins + netCoins;

  const isFinalTurnOfGame =
    fairView.age === 3 &&
    (fairView.phase === "SEVENTH_CARD_PLAY" ||
      (fairView.draftRound === SEVEN_WONDERS_TURNS_PER_AGE &&
        !hasWonderStageEffect(me, "play_seventh_card")));

  let ownCoinUtil: number;
  if (isFinalTurnOfGame) {
    const treasuryDelta =
      Math.floor(endingCoins / SEVEN_WONDERS_COINS_PER_TREASURY_VP) -
      Math.floor(me.coins / SEVEN_WONDERS_COINS_PER_TREASURY_VP);
    ownCoinUtil = treasuryDelta + netCoins * 0.025;
  } else if (fairView.age === 3 && fairView.draftRound === 5) {
    const treasuryDelta =
      Math.floor(endingCoins / SEVEN_WONDERS_COINS_PER_TREASURY_VP) -
      Math.floor(me.coins / SEVEN_WONDERS_COINS_PER_TREASURY_VP);
    ownCoinUtil =
      0.62 * treasuryDelta +
      0.38 *
        (concaveCoinPotential(endingCoins, 3) -
          concaveCoinPotential(me.coins, 3));
  } else {
    ownCoinUtil =
      concaveCoinPotential(endingCoins, fairView.age) -
      concaveCoinPotential(me.coins, fairView.age);
  }

  const n = fairView.players.length;
  const leftIdx = getLeftNeighborIndex(pIdx, n);
  const rightIdx = getRightNeighborIndex(pIdx, n);

  const calcFeedCost = (oppIdx: number, paid: number): number => {
    if (paid <= 0) return 0;
    const opp = fairView.players[oppIdx]!;
    const w = computeOpponentContenderWeight(fairView, pIdx, oppIdx);
    if (
      fairView.age === 3 &&
      fairView.draftRound === SEVEN_WONDERS_TURNS_PER_AGE
    ) {
      const oppTreasuryJump =
        Math.floor((opp.coins + paid) / SEVEN_WONDERS_COINS_PER_TREASURY_VP) -
        Math.floor(opp.coins / SEVEN_WONDERS_COINS_PER_TREASURY_VP);
      return w * (0.72 * oppTreasuryJump + 0.28 * (paid * 0.34));
    }
    const oppCoinVal =
      fairView.age === 1 ? 0.42 : fairView.age === 2 ? 0.37 : 0.34;
    return paid * oppCoinVal * w;
  };

  return (
    ownCoinUtil -
    calcFeedCost(leftIdx, payment.leftCoins) -
    calcFeedCost(rightIdx, payment.rightCoins)
  );
}
