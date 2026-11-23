import type { BotDifficulty } from "@gaming-platform/core";
import { isResourceType } from "../cities-and-knights/helpers.ts";
import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import { getPlayerTradeRatios, hasResources } from "../rules/helpers.ts";
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
import {
  analyzeExpansionNetwork,
  simulateRouteLengthWithEdge,
} from "./route-eval.ts";
import { evaluateHandStrategicValue } from "./trade-eval.ts";

type ResourceMaritimeTradeAction = Extract<
  CatanAction,
  { type: "MARITIME_TRADE" }
> & {
  give: ResourceType;
  receive: ResourceType;
};

export function filterResourceMaritimeTrades(
  legalActions: CatanAction[]
): ResourceMaritimeTradeAction[] {
  return legalActions.filter(
    (a): a is ResourceMaritimeTradeAction =>
      a.type === "MARITIME_TRADE" &&
      isResourceType(a.give) &&
      isResourceType(a.receive)
  );
}

/**
 * Smart Maritime / Port Trade (runs BEFORE non-urgent Knight recruitment/promotion so 1-port-trade Cities/Settlements are never cannibalized!).
 */
export function chooseMainMaritimeTradeAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  maritimeTrades: ResourceMaritimeTradeAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction | null {
  if (maritimeTrades.length === 0) return null;

  if (difficulty === "easy") {
    const simpleTrade = maritimeTrades.find(
      (t) =>
        player.resources[t.give] >= 5 && player.resources[t.receive] === 0
    );
    if (simpleTrade) return simpleTrade;
    return null;
  }

  if (difficulty === "normal") {
    const normalTrade = maritimeTrades.find(
      (t) =>
        player.resources[t.give] >= t.giveAmount + 1 &&
        player.resources[t.receive] === 0
    );
    if (normalTrade) return normalTrade;
    return null;
  }

  // Master multi-step port combo solver
  if (difficulty === "master") {
    const ratios = getPlayerTradeRatios(state, playerId);
    const hasOwnSettle = Object.values(state.buildings).some(
      (b) => b.ownerId === playerId && b.type === "settlement"
    );
    const openSpotsNow = getLegalSettlementVertices(state, playerId, false);
    const comboTargets: Partial<ResourceMap>[] = [];

    const ckVulnerable =
      state.config.enableCitiesAndKnights &&
      getPlayerVulnerableCities(state, playerId).length > 0 &&
      getTotalActiveKnightStrength(state) < getBarbarianStrength(state);

    // Urgent C&K Knight defense BEFORE barbarian raid pillages our city!
    if (ckVulnerable && state.barbarianPosition >= 4) {
      const hasInact = Object.values(state.knights).some(
        (k) => k.ownerId === playerId && !k.active
      );
      if (hasInact) comboTargets.push({ grain: 1 });
      comboTargets.push({ wool: 1, ore: 1, grain: 1 });
      comboTargets.push({ wool: 1, ore: 1 });
    }
    if (player.citiesRemaining > 0 && hasOwnSettle) {
      comboTargets.push(BUILDING_COSTS.city);
    }
    if (player.settlementsRemaining > 0 && openSpotsNow.length > 0) {
      comboTargets.push(BUILDING_COSTS.settlement);
    }
    if (ckVulnerable && state.barbarianPosition < 4) {
      const hasInact = Object.values(state.knights).some(
        (k) => k.ownerId === playerId && !k.active
      );
      if (hasInact) comboTargets.push({ grain: 1 });
      comboTargets.push({ wool: 1, ore: 1, grain: 1 });
      comboTargets.push({ wool: 1, ore: 1 });
    }
    // Claiming Longest Road (+2 VP) via 1 maritime trade
    const neededAwardLen = Math.max(5, state.longestRoadLength + 1);
    if (
      state.longestRoadOwnerId !== playerId &&
      player.longestRoadLength + 1 >= neededAwardLen
    ) {
      if (
        player.roadsRemaining > 0 &&
        getLegalRoadEdges(state, playerId, null).some(
          (eId) =>
            simulateRouteLengthWithEdge(state, playerId, eId, "road") >=
            neededAwardLen
        )
      ) {
        comboTargets.push(BUILDING_COSTS.road);
      } else if (
        state.config.enableSeafarers &&
        player.shipsRemaining > 0 &&
        getLegalShipEdges(state, playerId, null).some(
          (eId) =>
            simulateRouteLengthWithEdge(state, playerId, eId, "ship") >=
            neededAwardLen
        )
      ) {
        comboTargets.push(BUILDING_COSTS.ship);
      }
    }
    if (
      player.settlementsRemaining > 0 &&
      player.roadsRemaining > 0 &&
      openSpotsNow.length === 0
    ) {
      const net = analyzeExpansionNetwork(state, playerId, weights, scarcity);
      if (net.bestOneHopVertexScore >= 14) {
        comboTargets.push({ brick: 2, lumber: 2, wool: 1, grain: 1 });
      }
    }
    // Seafarers: port-trade into high-value ship toward fog or unsettled foreign island!
    if (state.config.enableSeafarers && player.shipsRemaining > 0) {
      const legalS = getLegalShipEdges(state, playerId, null);
      const hasHighValueShip = legalS.some(
        (eId) =>
          scoreExpansionEdge(
            state,
            eId,
            playerId,
            "ship",
            weights,
            scarcity
          ) >= 24
      );
      if (hasHighValueShip) {
        comboTargets.push(BUILDING_COSTS.ship);
      }
    }
    if (state.devCardDeck.length > 0) {
      comboTargets.push(BUILDING_COSTS.devCard);
    }

    // Evaluate strictly in strategic build-value order (City > Open Settlement > Longest-Road Edge > Road+Settlement > Dev Card)!
    for (const cost of comboTargets) {
      const conv = checkHandPortConvertibleToCost(
        state,
        ratios,
        player.resources,
        cost
      );
      if (
        conv.reachable &&
        conv.missingCount > 0 &&
        conv.firstGive &&
        conv.firstReceive
      ) {
        const matchTrade = maritimeTrades.find(
          (t) => t.give === conv.firstGive && t.receive === conv.firstReceive
        );
        if (matchTrade) return matchTrade;
      }
    }
  }

  const currentVal = evaluateHandStrategicValue(
    state,
    player,
    player.resources,
    weights,
    scarcity,
    myProd,
    true
  );
  let bestTrade: CatanAction | null = null;
  let bestGain = 0.55;

  for (const t of maritimeTrades) {
    const simHand: ResourceMap = {
      ...player.resources,
      [t.give]: player.resources[t.give] - t.giveAmount,
      [t.receive]: player.resources[t.receive] + 1,
    };
    const afterVal = evaluateHandStrategicValue(
      state,
      player,
      simHand,
      weights,
      scarcity,
      myProd,
      true
    );
    let immediateUnlock = 0;
    if (
      player.citiesRemaining > 0 &&
      Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "settlement"
      ) &&
      hasResources(simHand, BUILDING_COSTS.city)
    ) {
      immediateUnlock += 13;
    } else if (
      player.settlementsRemaining > 0 &&
      getLegalSettlementVertices(state, playerId, false).length > 0 &&
      hasResources(simHand, BUILDING_COSTS.settlement)
    ) {
      immediateUnlock += 12;
    } else if (
      state.devCardDeck.length > 0 &&
      hasResources(simHand, BUILDING_COSTS.devCard)
    ) {
      immediateUnlock += 5.5;
    }

    const gain = afterVal - currentVal + immediateUnlock;
    if (gain > bestGain) {
      bestGain = gain;
      bestTrade = t;
    }
  }
  return bestTrade;
}

/**
 * Master End-of-Turn 7-Discard Shielding!
 * Before passing with > safeLimit cards (51.8% chance of a 7 across 4 rolls!),
 * compress bloated surplus stacks via Maritime trade into scarce City/Settlement cards!
 */
export function chooseEndOfTurnSevenShieldTradeAction(
  state: CatanState,
  player: CatanPlayerState,
  maritimeTrades: ResourceMaritimeTradeAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction | null {
  const offTurnBefore = evaluateHandStrategicValue(
    state,
    player,
    player.resources,
    weights,
    scarcity,
    myProd,
    false
  );
  let bestShieldTrade: CatanAction | null = null;
  let bestShieldScore = -Infinity;
  for (const t of maritimeTrades) {
    // Only shield if the trade brings us closer to safeLimit without destroying a near-complete City
    const simHand: ResourceMap = {
      ...player.resources,
      [t.give]: player.resources[t.give] - t.giveAmount,
      [t.receive]: player.resources[t.receive] + 1,
    };
    // Evaluate using `isOwnActiveTurn = false` (off-turn survival value!)
    const offTurnAfter = evaluateHandStrategicValue(
      state,
      player,
      simHand,
      weights,
      scarcity,
      myProd,
      false
    );
    const net = offTurnAfter - offTurnBefore;
    if (net > 0.1 && net > bestShieldScore) {
      bestShieldScore = net;
      bestShieldTrade = t;
    }
  }
  return bestShieldTrade;
}
