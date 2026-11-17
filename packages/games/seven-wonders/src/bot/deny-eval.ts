import { SEVEN_WONDERS_MASTER_BOT_WEIGHTS } from "../config/bot-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  canPlayerBuildViaChain,
  canPlayerUseOlympiaFreeBuild,
  computeAffordablePaymentsPure,
  hasDuplicateCardName,
} from "../rules.ts";
import type {
  DraftMoveKind,
  SevenWondersCard,
  SevenWondersState,
} from "../types.ts";
import { evaluateMasterCardUtility } from "./card-eval.ts";
import { computeOpponentContenderWeight } from "./military-resource-eval.ts";

export function estimateOpponentBestUseOfCard(
  fairView: SevenWondersState,
  oppIdx: number,
  card: SevenWondersCard
): number {
  const denCfg = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.denial;
  const coinW = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.ownOpportunityLeakCoinWeight;
  const opp = fairView.players[oppIdx]!;
  if (hasDuplicateCardName(opp, card.name)) {
    return denCfg.duplicateOpponentFallback;
  }

  if (canPlayerBuildViaChain(opp, card)) {
    const u = evaluateMasterCardUtility(fairView, oppIdx, card);
    return u.nonCoinUtility + u.immediateCoinsGained * coinW;
  }

  const payments = computeAffordablePaymentsPure(
    fairView.players,
    oppIdx,
    card.resourceCost,
    card.coinCost
  );
  const canZeus = canPlayerUseOlympiaFreeBuild(opp, fairView.age);
  if (payments.length === 0 && !canZeus) {
    return denCfg.unaffordableOpponentFallback;
  }

  const u = evaluateMasterCardUtility(fairView, oppIdx, card);
  const gross = u.nonCoinUtility + u.immediateCoinsGained * coinW;
  if (payments.length === 0 && canZeus) {
    return Math.max(
      denCfg.unaffordableOpponentFallback,
      gross - denCfg.zeusOnlyCostPenalty
    );
  }
  const minCost = Math.min(
    ...payments.map((p) => card.coinCost + p.leftCoins + p.rightCoins)
  );
  return Math.max(
    denCfg.unaffordableOpponentFallback,
    gross - minCost * denCfg.minCostPenaltySlope
  );
}

export function doesAnyOpponentHaveActiveHalikarnassus(
  state: SevenWondersState,
  myIdx: number
): boolean {
  return state.players.some((p, idx) => {
    if (idx === myIdx) return false;
    const b = getWonderBoardDefinition(p.wonderId, p.wonderSide);
    return b.stages
      .slice(p.builtWonderStages)
      .some((st) => st.effects.some((e) => e.kind === "build_from_discard"));
  });
}

export function computeHalikarnassusDiscardFeedPenalty(
  state: SevenWondersState,
  myIdx: number,
  card: SevenWondersCard
): number {
  const denCfg = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.denial;
  const coinW = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.ownOpportunityLeakCoinWeight;
  let penalty = 0;
  for (let idx = 0; idx < state.players.length; idx++) {
    if (idx === myIdx) continue;
    const p = state.players[idx]!;
    const b = getWonderBoardDefinition(p.wonderId, p.wonderSide);
    const hasDiscardPower = b.stages
      .slice(p.builtWonderStages)
      .some((st) => st.effects.some((e) => e.kind === "build_from_discard"));
    if (hasDiscardPower && !hasDuplicateCardName(p, card.name)) {
      const valForHal = evaluateMasterCardUtility(state, idx, card);
      const grossHal =
        valForHal.nonCoinUtility + valForHal.immediateCoinsGained * coinW;
      if (grossHal >= denCfg.halikarnassusGrossThreshold) {
        const w = computeOpponentContenderWeight(state, myIdx, idx);
        penalty +=
          (grossHal - denCfg.halikarnassusGrossOffset) *
          w *
          denCfg.halikarnassusPenaltyMult;
      }
    }
  }
  return penalty;
}

export function computeDraftDenialBonus(
  state: SevenWondersState,
  pIdx: number,
  card: SevenWondersCard,
  moveKind: DraftMoveKind,
  nextReceiverIdx: number,
  receiverValById: Readonly<Record<string, number>>,
  receiverValCount: number,
  maxReceiverBefore: number,
  secondReceiverIdx: number,
  secondReceiverValById: Readonly<Record<string, number>>
): number {
  const denCfg = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.denial;
  const me = state.players[pIdx]!;
  let denialBonus = 0;

  if (nextReceiverIdx >= 0 && receiverValCount >= 2) {
    let maxRem = 0;
    for (const other of me.hand) {
      if (other.id !== card.id) {
        maxRem = Math.max(maxRem, receiverValById[other.id] ?? 0);
      }
    }
    const marginalDrop = Math.max(0, maxReceiverBefore - maxRem);
    if (marginalDrop > denCfg.nextReceiverMinDrop) {
      const oppW = computeOpponentContenderWeight(state, pIdx, nextReceiverIdx);
      const mult =
        moveKind === "discard"
          ? oppW * denCfg.nextReceiverDiscardMult
          : oppW * denCfg.nextReceiverPlayMult;
      denialBonus += marginalDrop * mult;
    }
  }

  if (secondReceiverIdx >= 0) {
    const valNext = receiverValById[card.id] ?? 0;
    const valSecond = secondReceiverValById[card.id] ?? 0;
    if (
      valSecond >= denCfg.secondReceiverMinVal &&
      valNext < maxReceiverBefore - denCfg.secondReceiverGapFromBest
    ) {
      let maxOtherForSecond = 0;
      for (const other of me.hand) {
        if (other.id !== card.id) {
          maxOtherForSecond = Math.max(
            maxOtherForSecond,
            secondReceiverValById[other.id] ?? 0
          );
        }
      }
      const drop2 = Math.max(0, valSecond - maxOtherForSecond);
      if (drop2 > denCfg.secondReceiverMinDrop) {
        const oppW2 = computeOpponentContenderWeight(
          state,
          pIdx,
          secondReceiverIdx
        );
        denialBonus += drop2 * oppW2 * denCfg.secondReceiverMult;
      }
    }
  }

  return denialBonus;
}
