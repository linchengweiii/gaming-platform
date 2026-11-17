import type { BotDifficulty } from "@gaming-platform/core";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BANK_LIMITS, BUILDING_COSTS } from "../config/costs-and-limits.ts";
import {
  getPlayerTradeRatios,
  hasResources,
  isExpanded56State,
  totalResourceCount,
} from "../rules/helpers.ts";
import {
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
} from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceMap, ResourceType } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { scoreExpansionEdge } from "./edge-eval.ts";
import { checkHandPortConvertibleToCost } from "./lethal-targets.ts";
import { evaluateHandStrategicValue } from "./trade-eval.ts";

/**
 * Play Development Cards: Master evaluates ALL playable Dev Cards on a unified EV scale
 * (since Catan allows at most 1 Dev Card play per turn!).
 */
export function chooseMainPhaseDevCardAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction | null {
  const playRoadBuild = legalActions.find(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  const yopActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_YEAR_OF_PLENTY" }> =>
      a.type === "PLAY_YEAR_OF_PLENTY"
  );
  const monoActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_MONOPOLY" }> =>
      a.type === "PLAY_MONOPOLY"
  );
  const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");

  if (difficulty === "master") {
    let bestDevPlay: CatanAction | null = null;
    let bestDevScore = 0;

    const baseValNow = evaluateHandStrategicValue(
      state,
      player,
      player.resources,
      weights,
      scarcity,
      myProd,
      true
    );
    const ratiosNow = getPlayerTradeRatios(state, playerId);
    const hasSettleToUpgrade =
      player.citiesRemaining > 0 &&
      Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "settlement"
      );
    const hasOpenSettleNow =
      player.settlementsRemaining > 0 &&
      getLegalSettlementVertices(state, playerId, false).length > 0;

    // 1) Score Monopoly using 100% public bank deduction
    if (monoActions.length > 0) {
      const isExpanded = isExpanded56State(state);
      const totalSupplyPerRes = isExpanded
        ? BANK_LIMITS.expandedPerResource
        : BANK_LIMITS.standardPerResource;
      for (const act of monoActions) {
        const inOpponentHands = Math.max(
          0,
          totalSupplyPerRes -
            state.bank[act.resource] -
            player.resources[act.resource]
        );
        if (inOpponentHands <= 0) continue;
        const simHand: ResourceMap = {
          ...player.resources,
          [act.resource]: player.resources[act.resource] + inOpponentHands,
        };
        const unlocksCityNow =
          hasSettleToUpgrade &&
          checkHandPortConvertibleToCost(state, ratiosNow, simHand, {
            brick: 0,
            lumber: 0,
            wool: 0,
            grain: 2,
            ore: 3,
          }).reachable;
        const unlocksSettleNow =
          hasOpenSettleNow &&
          checkHandPortConvertibleToCost(state, ratiosNow, simHand, {
            brick: 1,
            lumber: 1,
            wool: 1,
            grain: 1,
            ore: 0,
          }).reachable;
        if (inOpponentHands < 3 && !unlocksCityNow && !unlocksSettleNow) {
          continue;
        }
        const handDelta =
          evaluateHandStrategicValue(
            state,
            player,
            simHand,
            weights,
            scarcity,
            myProd,
            true
          ) - baseValNow;
        const score =
          handDelta +
          inOpponentHands * 2.5 * scarcity[act.resource] +
          (unlocksCityNow ? 22 : unlocksSettleNow ? 20 : 0);
        if (score > bestDevScore) {
          bestDevScore = score;
          bestDevPlay = act;
        }
      }
    }

    // 2) Score Year of Plenty (only fire when it unlocks an immediate build/buy this turn — never convert unstealable YoP into stealable hand cards prematurely!)
    if (yopActions.length > 0) {
      for (const act of yopActions) {
        const simHand: ResourceMap = { ...player.resources };
        simHand[act.resource1] += 1;
        simHand[act.resource2] += 1;
        let unlockBonus = 0;
        if (
          hasSettleToUpgrade &&
          checkHandPortConvertibleToCost(state, ratiosNow, simHand, {
            brick: 0,
            lumber: 0,
            wool: 0,
            grain: 2,
            ore: 3,
          }).reachable
        ) {
          unlockBonus = 28;
        } else if (
          hasOpenSettleNow &&
          checkHandPortConvertibleToCost(state, ratiosNow, simHand, {
            brick: 1,
            lumber: 1,
            wool: 1,
            grain: 1,
            ore: 0,
          }).reachable
        ) {
          unlockBonus = 26;
        } else if (
          player.settlementsRemaining > 0 &&
          player.roadsRemaining > 0 &&
          !hasOpenSettleNow &&
          checkHandPortConvertibleToCost(state, ratiosNow, simHand, {
            brick: 2,
            lumber: 2,
            wool: 1,
            grain: 1,
            ore: 0,
          }).reachable
        ) {
          unlockBonus = 22;
        } else if (
          state.longestRoadOwnerId !== playerId &&
          player.longestRoadLength >= 4 &&
          player.roadsRemaining > 0 &&
          hasResources(simHand, BUILDING_COSTS.road)
        ) {
          unlockBonus = 16;
        } else if (
          state.devCardDeck.length > 0 &&
          totalResourceCount(player.resources) <= 4 &&
          hasResources(simHand, BUILDING_COSTS.devCard)
        ) {
          unlockBonus = 9;
        }
        if (unlockBonus <= 0) continue;

        const handDelta =
          evaluateHandStrategicValue(
            state,
            player,
            simHand,
            weights,
            scarcity,
            myProd,
            true
          ) - baseValNow;
        const score = handDelta + unlockBonus;
        if (score > bestDevScore) {
          bestDevScore = score;
          bestDevPlay = act;
        }
      }
    }

    // 3) Score Road Building Dev Card
    if (playRoadBuild) {
      const candRoads =
        player.roadsRemaining > 0 ? getLegalRoadEdges(state, playerId, null) : [];
      const candShips =
        state.config.enableSeafarers && player.shipsRemaining > 0
          ? getLegalShipEdges(state, playerId, null)
          : [];
      let topE = 0;
      for (const eId of candRoads) {
        topE = Math.max(
          topE,
          scoreExpansionEdge(state, eId, playerId, "road", weights, scarcity)
        );
      }
      for (const eId of candShips) {
        topE = Math.max(
          topE,
          scoreExpansionEdge(state, eId, playerId, "ship", weights, scarcity)
        );
      }
      if (topE >= 10) {
        const rbScore = 10 + topE * 0.72;
        if (rbScore > bestDevScore) {
          bestDevScore = rbScore;
          bestDevPlay = playRoadBuild;
        }
      }
    }

    // 4) Score Knight in Main Phase
    if (playKnight) {
      const claimsArmyNow =
        state.largestArmyOwnerId !== playerId &&
        player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
      const knightScore =
        16 + (claimsArmyNow ? 34 : player.knightsPlayed >= 1 ? 7 : 0);
      if (knightScore > bestDevScore) {
        bestDevScore = knightScore;
        bestDevPlay = playKnight;
      }
    }

    return bestDevPlay;
  }

  if (playRoadBuild) return playRoadBuild;

  if (yopActions.length > 0) {
    let bestYop = yopActions[0]!;
    let bestYopVal = -Infinity;
    for (const act of yopActions) {
      const simHand: ResourceMap = { ...player.resources };
      simHand[act.resource1] += 1;
      simHand[act.resource2] += 1;
      let unlockBonus = 0;
      if (
        player.citiesRemaining > 0 &&
        Object.values(state.buildings).some(
          (b) => b.ownerId === playerId && b.type === "settlement"
        ) &&
        hasResources(simHand, BUILDING_COSTS.city)
      ) {
        unlockBonus += 16;
      } else if (
        player.settlementsRemaining > 0 &&
        getLegalSettlementVertices(state, playerId, false).length > 0 &&
        hasResources(simHand, BUILDING_COSTS.settlement)
      ) {
        unlockBonus += 15;
      }
      const val =
        evaluateHandStrategicValue(
          state,
          player,
          simHand,
          weights,
          scarcity,
          myProd,
          true
        ) + unlockBonus;
      if (val > bestYopVal) {
        bestYopVal = val;
        bestYop = act;
      }
    }
    return bestYop;
  }

  if (monoActions.length > 0) {
    if (difficulty === "easy" || difficulty === "normal") {
      const sorted = [...monoActions].sort(
        (a, b) => scarcity[b.resource] - scarcity[a.resource]
      );
      return sorted[0]!;
    }

    const isExpanded = isExpanded56State(state);
    const totalSupplyPerRes = isExpanded
      ? BANK_LIMITS.expandedPerResource
      : BANK_LIMITS.standardPerResource;

    let bestMono: CatanAction | null = null;
    let bestClaimScore = -Infinity;
    for (const act of monoActions) {
      const inOpponentHands = Math.max(
        0,
        totalSupplyPerRes -
          state.bank[act.resource] -
          player.resources[act.resource]
      );
      if (inOpponentHands <= 0) continue;
      const simHand: ResourceMap = {
        ...player.resources,
        [act.resource]: player.resources[act.resource] + inOpponentHands,
      };
      const gain =
        evaluateHandStrategicValue(
          state,
          player,
          simHand,
          weights,
          scarcity,
          myProd,
          true
        ) +
        inOpponentHands * 1.9 * scarcity[act.resource];
      const unlocksMajor =
        (hasResources(simHand, BUILDING_COSTS.city) &&
          !hasResources(player.resources, BUILDING_COSTS.city)) ||
        (hasResources(simHand, BUILDING_COSTS.settlement) &&
          !hasResources(player.resources, BUILDING_COSTS.settlement));
      if ((inOpponentHands >= 3 || unlocksMajor) && gain > bestClaimScore) {
        bestClaimScore = gain;
        bestMono = act;
      }
    }
    if (bestMono) return bestMono;
  }

  if (playKnight) return playKnight;
  return null;
}
