import type { BotDifficulty } from "@gaming-platform/core";
import {
  hasCommodities,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import {
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  hasResources,
  totalResourceCount,
} from "../rules/helpers.ts";
import { getLegalSettlementVertices } from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import { RESOURCES, type ResourceMap } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { canHandWinThisTurnDeterministically } from "./lethal-targets.ts";
import {
  evaluateHandStrategicValue,
  isOpponentEmbargoedForTrade,
} from "./trade-eval.ts";
import {
  computeBoardScarcity,
  computePlayerProductionPips,
  countResourceDeficit,
  estimatePublicPlayerThreatVp,
} from "./utils.ts";

/**
 * Evaluates whether responder `responder` should accept an active domestic trade offer.
 * Uses strictly 100% public information (never reading `proposer.resources` or hidden VP cards):
 * - Ironclad embargo against players near victory, with burst-VP threat, or leading the table.
 * - Strict off-turn build-deficit & scarcity discipline for Master so humans cannot extract cheap Ore/Grain/Brick.
 */
function shouldBotAcceptDomesticTrade(
  state: CatanState,
  responder: CatanPlayerState,
  weights: CatanBotWeights
): boolean {
  const offer = state.activeTradeOffer;
  if (!offer) return false;
  if (
    !hasResources(responder.resources, offer.want) ||
    !hasCommodities(responder.commodities, offer.wantCommodities)
  ) {
    return false;
  }
  if (
    state.config.enableCitiesAndKnights &&
    totalCommodityCount(offer.wantCommodities) > 0
  ) {
    // Never trade away scarce commodities off-turn unless easy difficulty
    if ((responder.botDifficulty ?? "smart") !== "easy") {
      return false;
    }
  }

  const proposer = state.players.find((p) => p.id === offer.fromPlayerId);
  if (!proposer) return false;

  const diff = responder.botDifficulty ?? "smart";
  const targetVp = state.config.targetVictoryPoints;

  // 1. Strict Near-Victory & Burst-Threat Embargo (never help someone close to victory on their turn!)
  if (isOpponentEmbargoedForTrade(state, responder, proposer.id, weights)) {
    return false;
  }

  const scarcity = computeBoardScarcity(state);
  const myProd = computePlayerProductionPips(state, responder.id);
  const propProd = computePlayerProductionPips(state, proposer.id);
  const safeLimit = getPlayerSafeHandLimit(state, responder.id);

  const myAfterHand: ResourceMap = { ...responder.resources };
  let giveTotalReceivedByMe = 0;
  let wantTotalGivenByMe = 0;
  for (const r of RESOURCES) {
    const rec = offer.give[r] ?? 0;
    const giv = offer.want[r] ?? 0;
    giveTotalReceivedByMe += rec;
    wantTotalGivenByMe += giv;
    myAfterHand[r] = myAfterHand[r] - giv + rec;
  }

  const afterTotalCards = totalResourceCount(myAfterHand);

  // 2. Master/Smart Off-Turn Discipline: protect near-complete Cities/Settlements & avoid 7-discard bloat
  if (diff === "master" || diff === "smart") {
    if (
      afterTotalCards > safeLimit &&
      giveTotalReceivedByMe > wantTotalGivenByMe
    ) {
      return false;
    }

    const hasSettlementOnBoard = Object.values(state.buildings).some(
      (b) => b.ownerId === responder.id && b.type === "settlement"
    );
    if (hasSettlementOnBoard && responder.citiesRemaining > 0) {
      const cityBefore = countResourceDeficit(
        responder.resources,
        BUILDING_COSTS.city
      );
      const cityAfter = countResourceDeficit(myAfterHand, BUILDING_COSTS.city);
      if (cityBefore <= 1 && cityAfter > cityBefore) {
        return false;
      }
    }

    const openSettleNow = getLegalSettlementVertices(state, responder.id, false);
    if (responder.settlementsRemaining > 0 && openSettleNow.length > 0) {
      const setBefore = countResourceDeficit(
        responder.resources,
        BUILDING_COSTS.settlement
      );
      const setAfter = countResourceDeficit(
        myAfterHand,
        BUILDING_COSTS.settlement
      );
      if (setBefore === 0 && setAfter > 0) {
        return false;
      }
    }

    if (state.config.enableCitiesAndKnights) {
      const vulnCities = getPlayerVulnerableCities(state, responder.id).length;
      if (
        vulnCities > 0 &&
        getTotalActiveKnightStrength(state) < getBarbarianStrength(state)
      ) {
        const knightGoal: Partial<ResourceMap> = {
          wool: 1,
          ore: 1,
          grain: 1,
        };
        const defBefore = countResourceDeficit(responder.resources, knightGoal);
        const defAfter = countResourceDeficit(myAfterHand, knightGoal);
        if (defBefore <= 1 && defAfter > defBefore) {
          return false;
        }
      }
    }

    if (diff === "master" && giveTotalReceivedByMe <= wantTotalGivenByMe) {
      // On 1:1 (or worse) off-turn swaps, proposer gets immediate active-turn tempo;
      // Master only accepts if the received card concretely reduces deficit on a real build or completes a 2:1 port pair!
      const ratios = getPlayerTradeRatios(state, responder.id);
      const activeGoals: Partial<ResourceMap>[] = [];
      if (hasSettlementOnBoard && responder.citiesRemaining > 0) {
        activeGoals.push(BUILDING_COSTS.city);
      }
      if (responder.settlementsRemaining > 0) {
        activeGoals.push(BUILDING_COSTS.settlement);
      }
      if (state.devCardDeck.length > 0) {
        activeGoals.push(BUILDING_COSTS.devCard);
      }
      if (state.config.enableCitiesAndKnights) {
        activeGoals.push({ wool: 1, ore: 1, grain: 1 });
      }
      if (openSettleNow.length === 0 && responder.roadsRemaining > 0) {
        activeGoals.push(BUILDING_COSTS.road);
      }
      if (state.config.enableSeafarers && responder.shipsRemaining > 0) {
        activeGoals.push(BUILDING_COSTS.ship);
      }

      const advancesAnyGoal = activeGoals.some(
        (cost) =>
          countResourceDeficit(myAfterHand, cost) <
          countResourceDeficit(responder.resources, cost)
      );
      const completesTwoForOnePort = RESOURCES.some(
        (r) =>
          ratios[r] === 2 &&
          responder.resources[r] === 1 &&
          myAfterHand[r] >= 2
      );
      if (!advancesAnyGoal && !completesTwoForOnePort) {
        return false;
      }

      // Never give away scarce Ore/Grain 1:1 off-turn for common Lumber/Wool unless it completes a build or spends surplus>=3 for a 0-pip need
      const givesOreOrGrain =
        (offer.want.ore ?? 0) > 0 || (offer.want.grain ?? 0) > 0;
      const receivesOreOrGrain =
        (offer.give.ore ?? 0) > 0 || (offer.give.grain ?? 0) > 0;
      if (givesOreOrGrain && !receivesOreOrGrain) {
        const completesImmediateSet = activeGoals.some(
          (cost) =>
            countResourceDeficit(myAfterHand, cost) === 0 &&
            countResourceDeficit(responder.resources, cost) > 0
        );
        const hasHeavySurplusAndZeroProd = RESOURCES.some(
          (g) =>
            (offer.want[g] ?? 0) > 0 &&
            responder.resources[g] >= 3 &&
            RESOURCES.some(
              (rec) => (offer.give[rec] ?? 0) > 0 && myProd[rec] === 0
            )
        );
        if (!completesImmediateSet && !hasHeavySurplusAndZeroProd) {
          return false;
        }
      }
    }
  }

  const myBefore = evaluateHandStrategicValue(
    state,
    responder,
    responder.resources,
    weights,
    scarcity,
    myProd,
    false
  );
  const myAfter = evaluateHandStrategicValue(
    state,
    responder,
    myAfterHand,
    weights,
    scarcity,
    myProd,
    false
  );
  const myGain = myAfter - myBefore;

  const proposerThreatVp = estimatePublicPlayerThreatVp(state, proposer.id);
  let effectiveThreshold = weights.tradeAcceptThreshold;
  let effectiveFairness = weights.tradeFairnessRatio;
  if (diff === "master") {
    const maxOtherRivalVp = Math.max(
      0,
      ...state.players
        .filter((p) => p.id !== responder.id && p.id !== proposer.id)
        .map((p) => estimatePublicPlayerThreatVp(state, p.id))
    );
    if (
      proposerThreatVp <= targetVp - 6 &&
      proposerThreatVp + 1 < maxOtherRivalVp
    ) {
      effectiveThreshold = Math.max(0.28, effectiveThreshold * 0.65);
      effectiveFairness = Math.max(0.42, effectiveFairness * 0.65);
    }
  }

  if (myGain < effectiveThreshold) {
    return false;
  }

  if (effectiveFairness <= 0) {
    return true;
  }

  // Public-only Bayesian estimate of proposer's active-turn build-unlock utility (never peeks at proposer.resources!)
  let publicPropGain = 0;
  for (const r of RESOURCES) {
    const w = offer.want[r] ?? 0;
    if (w > 0) {
      const lackMult = propProd[r] === 0 ? 1.35 : 1 + 1.5 / (propProd[r] + 3);
      publicPropGain += w * 1.65 * scarcity[r] * lackMult;
    }
    const g = offer.give[r] ?? 0;
    if (g > 0) {
      publicPropGain -= g * 0.72 * scarcity[r];
    }
  }

  if (diff === "master") {
    const propTotalCards = getPlayerResourceCount(proposer);
    const propAfterCards =
      propTotalCards - giveTotalReceivedByMe + wantTotalGivenByMe;
    const propHasSettlement = Object.values(state.buildings).some(
      (b) => b.ownerId === proposer.id && b.type === "settlement"
    );
    const propHasOpenSpot =
      proposer.settlementsRemaining > 0 &&
      getLegalSettlementVertices(state, proposer.id, false).length > 0;
    const wantsCityRes =
      (offer.want.ore ?? 0) > 0 || (offer.want.grain ?? 0) > 0;
    const wantsSettleRes =
      (offer.want.brick ?? 0) > 0 ||
      (offer.want.lumber ?? 0) > 0 ||
      (offer.want.wool ?? 0) > 0 ||
      (offer.want.grain ?? 0) > 0;
    const wantsDevRes = wantsCityRes || (offer.want.wool ?? 0) > 0;

    // Rational active-turn proposers ask for the exact bottleneck card that completes a City/Settlement/Dev Card right now!
    let inferredBuildUnlock = 0;
    if (propHasSettlement && proposer.citiesRemaining > 0 && wantsCityRes) {
      if (propAfterCards >= 5)
        inferredBuildUnlock = Math.max(inferredBuildUnlock, 6.8);
      else if (propAfterCards === 4)
        inferredBuildUnlock = Math.max(inferredBuildUnlock, 3.4);
    }
    if (propHasOpenSpot && wantsSettleRes) {
      if (propAfterCards >= 4)
        inferredBuildUnlock = Math.max(inferredBuildUnlock, 5.8);
      else if (propAfterCards === 3)
        inferredBuildUnlock = Math.max(inferredBuildUnlock, 2.8);
    }
    if (state.devCardDeck.length > 0 && propAfterCards >= 3 && wantsDevRes) {
      inferredBuildUnlock = Math.max(inferredBuildUnlock, 2.5);
    }
    const sbpMult = state.config.enableSpecialBuildingPhase ? 0.55 : 1.0;
    publicPropGain += inferredBuildUnlock * sbpMult;
  }

  publicPropGain = Math.max(0.4, publicPropGain);

  return myGain >= publicPropGain * effectiveFairness * 0.42;
}

export function chooseDomesticTradeResponseAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  weights: CatanBotWeights
): CatanAction {
  const canAccept = legalActions.find(
    (a) => a.type === "ACCEPT_DOMESTIC_TRADE"
  );
  if (canAccept && shouldBotAcceptDomesticTrade(state, player, weights)) {
    return canAccept;
  }
  return (
    legalActions.find((a) => a.type === "DECLINE_DOMESTIC_TRADE") ??
    legalActions[0]!
  );
}

export function chooseDomesticTradeConfirmAction(
  state: CatanState,
  player: CatanPlayerState,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights
): CatanAction {
  const confirmActs = legalActions.filter(
    (
      a
    ): a is Extract<CatanAction, { type: "CONFIRM_DOMESTIC_TRADE" }> =>
      a.type === "CONFIRM_DOMESTIC_TRADE"
  );
  if (confirmActs.length > 0) {
    if (difficulty === "easy") {
      return confirmActs[0]!;
    }

    const offer = state.activeTradeOffer!;
    const postTradeHand: ResourceMap = { ...player.resources };
    for (const r of RESOURCES) {
      postTradeHand[r] =
        postTradeHand[r] - (offer.give[r] ?? 0) + (offer.want[r] ?? 0);
    }
    const isImmediatelyLethalForMe =
      difficulty === "master" &&
      canHandWinThisTurnDeterministically(state, player, postTradeHand);

    // Strictly filter out embargoed near-victory opponents UNLESS completing this trade wins the game on this turn!
    const allowedConfirms = isImmediatelyLethalForMe
      ? confirmActs
      : confirmActs.filter(
          (act) =>
            !isOpponentEmbargoedForTrade(state, player, act.partnerId, weights)
        );

    if (allowedConfirms.length === 0) {
      return { type: "CANCEL_DOMESTIC_TRADE" };
    }

    let bestConfirm = allowedConfirms[0]!;
    let bestPartnerThreat = Infinity;
    for (const act of allowedConfirms) {
      const threat = estimatePublicPlayerThreatVp(state, act.partnerId);
      if (threat < bestPartnerThreat) {
        bestPartnerThreat = threat;
        bestConfirm = act;
      }
    }
    return bestConfirm;
  }
  return { type: "CANCEL_DOMESTIC_TRADE" };
}
