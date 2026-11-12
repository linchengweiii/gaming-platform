import {
  type BotDifficulty,
  computeLongestSimpleEdgePath,
} from "@gaming-platform/core";
import {
  computePlayerVictoryPoints,
  emptyResources,
  getCatanLegalActions,
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  hasResources,
  totalResourceCount,
} from "./rules.ts";
import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanPlayerState,
  type CatanState,
  NUMBER_TOKEN_PIPS,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  TERRAIN_TO_RESOURCE,
} from "./types.ts";

/**
 * Tunable strategic weight vector for Catan AI difficulty tiers and evolutionary self-play optimization.
 */
export interface CatanBotWeights {
  setupPipWeight: number;
  setupScarcityWeight: number;
  setupDiversityBonus: number;
  setupNumberSpreadBonus: number;
  setupPairSynergyBonus: number;
  setupHarborBonus: number;
  setupExpansionSpaceWeight: number;
  setupSecondStartHandWeight: number;
  cityPriority: number;
  settlementPriority: number;
  devCardPriority: number;
  roadToSpotPriority: number;
  longestRoadContestBonus: number;
  harbormasterContestBonus: number;
  cityWallPriority: number;
  robberLeaderVpWeight: number;
  robberPipsWeight: number;
  tradeAcceptThreshold: number;
  tradeFairnessRatio: number;
  leaderEmbargoMargin: number;
  maxDomesticOffersPerTurn: number;
  sevenDiscardRiskWeight: number;
}

export const CATAN_BOT_WEIGHTS: Record<BotDifficulty, CatanBotWeights> = {
  easy: {
    setupPipWeight: 2.1,
    setupScarcityWeight: 0.0,
    setupDiversityBonus: 0.4,
    setupNumberSpreadBonus: 0.0,
    setupPairSynergyBonus: 0.0,
    setupHarborBonus: 0.3,
    setupExpansionSpaceWeight: 0.0,
    setupSecondStartHandWeight: 0.0,
    cityPriority: 14,
    settlementPriority: 17,
    devCardPriority: 7,
    roadToSpotPriority: 9,
    longestRoadContestBonus: 1.5,
    harbormasterContestBonus: 1,
    cityWallPriority: 3,
    robberLeaderVpWeight: 0.3,
    robberPipsWeight: 0.8,
    tradeAcceptThreshold: -0.3,
    tradeFairnessRatio: 0.0,
    leaderEmbargoMargin: 0,
    maxDomesticOffersPerTurn: 0,
    sevenDiscardRiskWeight: 0.05,
  },
  normal: {
    setupPipWeight: 2.85,
    setupScarcityWeight: 0.25,
    setupDiversityBonus: 2.4,
    setupNumberSpreadBonus: 0.45,
    setupPairSynergyBonus: 1.4,
    setupHarborBonus: 1.8,
    setupExpansionSpaceWeight: 0.3,
    setupSecondStartHandWeight: 0.6,
    cityPriority: 23,
    settlementPriority: 24,
    devCardPriority: 11,
    roadToSpotPriority: 9.0,
    longestRoadContestBonus: 4.5,
    harbormasterContestBonus: 4,
    cityWallPriority: 4.5,
    robberLeaderVpWeight: 1.8,
    robberPipsWeight: 1.25,
    tradeAcceptThreshold: 0.58,
    tradeFairnessRatio: 0.65,
    leaderEmbargoMargin: 1,
    maxDomesticOffersPerTurn: 1,
    sevenDiscardRiskWeight: 0.3,
  },
  smart: {
    setupPipWeight: 3.35,
    setupScarcityWeight: 1.45,
    setupDiversityBonus: 4.6,
    setupNumberSpreadBonus: 1.65,
    setupPairSynergyBonus: 3.6,
    setupHarborBonus: 3.5,
    setupExpansionSpaceWeight: 1.55,
    setupSecondStartHandWeight: 2.4,
    cityPriority: 33,
    settlementPriority: 33.5,
    devCardPriority: 14.5,
    roadToSpotPriority: 11.5,
    longestRoadContestBonus: 11.5,
    harbormasterContestBonus: 9.5,
    cityWallPriority: 7,
    robberLeaderVpWeight: 3.9,
    robberPipsWeight: 1.95,
    tradeAcceptThreshold: 0.48,
    tradeFairnessRatio: 0.72,
    leaderEmbargoMargin: 2,
    maxDomesticOffersPerTurn: 1,
    sevenDiscardRiskWeight: 0.85,
  },
  master: {
    setupPipWeight: 3.876,
    setupScarcityWeight: 2.626,
    setupDiversityBonus: 5.096,
    setupNumberSpreadBonus: 2.974,
    setupPairSynergyBonus: 4.818,
    setupHarborBonus: 3.64,
    setupExpansionSpaceWeight: 1.601,
    setupSecondStartHandWeight: 2.92,
    cityPriority: 23.033,
    settlementPriority: 42,
    devCardPriority: 21.573,
    roadToSpotPriority: 13.294,
    longestRoadContestBonus: 31.009,
    harbormasterContestBonus: 10.074,
    cityWallPriority: 8.275,
    robberLeaderVpWeight: 6.998,
    robberPipsWeight: 2.886,
    tradeAcceptThreshold: 0.442,
    tradeFairnessRatio: 0.66,
    leaderEmbargoMargin: 2,
    maxDomesticOffersPerTurn: 2,
    sevenDiscardRiskWeight: 1.166,
  },
};

export function setMasterCatanBotWeights(
  overrides: Partial<CatanBotWeights>
): void {
  CATAN_BOT_WEIGHTS.master = {
    ...CATAN_BOT_WEIGHTS.master,
    ...overrides,
  };
}

/**
 * Computes relative board-wide scarcity multipliers (>= 0.75, <= 2.35) for each resource.
 */
function computeBoardScarcity(state: CatanState): Record<ResourceType, number> {
  const totalPips: Record<ResourceType, number> = {
    brick: 0,
    lumber: 0,
    wool: 0,
    grain: 0,
    ore: 0,
  };

  for (const h of Object.values(state.hexes)) {
    const res = TERRAIN_TO_RESOURCE[h.terrain];
    if (res && h.numberToken) {
      totalPips[res] += NUMBER_TOKEN_PIPS[h.numberToken] ?? 0;
    }
  }

  const avg =
    (totalPips.brick +
      totalPips.lumber +
      totalPips.wool +
      totalPips.grain +
      totalPips.ore) /
      5 || 10;

  const scarcity: Record<ResourceType, number> = {
    brick: 1,
    lumber: 1,
    wool: 1,
    grain: 1,
    ore: 1,
  };
  for (const r of RESOURCES) {
    const ratio = avg / Math.max(2.5, totalPips[r]);
    scarcity[r] = Math.max(0.75, Math.min(2.35, ratio));
  }
  return scarcity;
}

/**
 * Computes expected resource production pips (out of 36 rolls) for `playerId`.
 */
function computePlayerProductionPips(
  state: CatanState,
  playerId: string,
  ignoreRobber = false
): Record<ResourceType, number> {
  const prod: Record<ResourceType, number> = {
    brick: 0,
    lumber: 0,
    wool: 0,
    grain: 0,
    ore: 0,
  };

  for (const [vId, b] of Object.entries(state.buildings)) {
    if (b.ownerId !== playerId) continue;
    const mult = b.type === "city" ? 2 : 1;
    const vNode = state.topology.vertices[vId];
    if (!vNode) continue;
    for (const hId of vNode.adjacentHexIds) {
      if (!ignoreRobber && hId === state.robberHexId) continue;
      const tile = state.hexes[hId];
      if (!tile || !tile.numberToken) continue;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      if (res) {
        prod[res] += pips * mult;
      } else if (tile.terrain === "gold") {
        for (const r of RESOURCES) {
          prod[r] += (pips * mult) / 5;
        }
      }
    }
  }
  return prod;
}

/**
 * Estimates an opponent's true threat VP without peeking at hidden VP card identities.
 */
function estimatePublicPlayerThreatVp(
  state: CatanState,
  playerId: string
): number {
  const visible = computePlayerVictoryPoints(state, playerId, true);
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return visible;
  const unplayedCount = p.devCards.filter((c) => !c.played).length;
  return visible + unplayedCount * 0.28;
}

/**
 * Checks whether building a settlement on `vertexId` awards +2 Foreign Island Bonus VP in Seafarers.
 */
function grantsNewIslandBonusVp(
  state: CatanState,
  player: CatanPlayerState,
  vertexId: string
): boolean {
  if (!state.config.enableSeafarers) return false;
  const vNode = state.topology.vertices[vertexId];
  if (!vNode) return false;
  for (const hId of vNode.adjacentHexIds) {
    const t = state.hexes[hId];
    if (
      t &&
      t.islandId > 0 &&
      !player.homeIslandIds.includes(t.islandId) &&
      !player.settledIslandIds.includes(t.islandId)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Computes `playerId`'s Longest Road / Trade Route if `addedEdge` is placed (and optional `removedEdgeId` removed).
 */
function simulateRouteLengthWithEdge(
  state: CatanState,
  playerId: string,
  addedEdgeId: string,
  addedKind: "road" | "ship",
  removedEdgeId?: string
): number {
  const playerEdges: string[] = [];
  for (const [eId, e] of Object.entries(state.edges)) {
    if (e.ownerId === playerId && eId !== removedEdgeId) {
      playerEdges.push(eId);
    }
  }
  if (!playerEdges.includes(addedEdgeId)) {
    playerEdges.push(addedEdgeId);
  }

  const blockedVertices = new Set<string>();
  for (const [vId, b] of Object.entries(state.buildings)) {
    if (b.ownerId !== playerId) {
      blockedVertices.add(vId);
    }
  }

  const getType = (eId: string): "road" | "ship" | null => {
    if (eId === addedEdgeId) return addedKind;
    return state.edges[eId]?.type ?? null;
  };

  return computeLongestSimpleEdgePath(
    state.topology,
    playerEdges,
    blockedVertices,
    (prevEdgeId, nextEdgeId, sharedVertexId) => {
      const t1 = getType(prevEdgeId);
      const t2 = getType(nextEdgeId);
      if (!t1 || !t2) return false;
      if (t1 !== t2) {
        return state.buildings[sharedVertexId]?.ownerId === playerId;
      }
      return true;
    }
  ).length;
}

/**
 * Scores a candidate settlement vertex during Setup or Main Phase.
 */
export function evaluateVertexScore(
  state: CatanState,
  vertexId: string,
  playerId: string,
  weights: CatanBotWeights = CATAN_BOT_WEIGHTS.smart,
  scarcity?: Record<ResourceType, number>
): number {
  const vNode = state.topology.vertices[vertexId];
  if (!vNode) return -999;

  const player = state.players.find((p) => p.id === playerId);
  const isMaster = player?.botDifficulty === "master";
  const boardScarcity = scarcity ?? computeBoardScarcity(state);
  const existingProd = computePlayerProductionPips(state, playerId, true);
  const existingNumbers = new Set<number>();
  for (const [vId, b] of Object.entries(state.buildings)) {
    if (b.ownerId !== playerId) continue;
    for (const hId of state.topology.vertices[vId]?.adjacentHexIds ?? []) {
      const num = state.hexes[hId]?.numberToken;
      if (num) existingNumbers.add(num);
    }
  }

  let score = 0;
  const vertexResources = new Set<ResourceType>();
  const newEmpireResources = new Map<ResourceType, number>();
  const vertexNumbers = new Set<number>();
  const startResources = emptyResources();
  const vertexPipsByRes = emptyResources();
  let touchesSea = false;

  for (const hId of vNode.adjacentHexIds) {
    const tile = state.hexes[hId];
    if (!tile) continue;

    if (tile.terrain === "sea") {
      touchesSea = true;
      continue;
    }
    if (tile.terrain === "fog") {
      score += 5.0;
      continue;
    }

    const pips = tile.numberToken
      ? (NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0)
      : 0;
    const res = TERRAIN_TO_RESOURCE[tile.terrain];

    if (tile.terrain === "gold") {
      score += pips * (weights.setupPipWeight + 1.35);
    } else if (res) {
      const intrinsicBias =
        res === "ore"
          ? 1.16
          : res === "grain"
            ? 1.17
            : res === "brick" || res === "lumber"
              ? 1.05
              : 0.94;
      const scarcityBoost =
        1 + (boardScarcity[res] - 1) * (weights.setupScarcityWeight * 0.4);

      score += pips * weights.setupPipWeight * intrinsicBias * scarcityBoost;
      vertexResources.add(res);
      startResources[res] += 1;
      vertexPipsByRes[res] += pips;

      if (existingProd[res] === 0) {
        const prevBest = newEmpireResources.get(res) ?? 0;
        if (pips > prevBest) {
          newEmpireResources.set(res, pips);
        }
      }
    }

    if (tile.numberToken) {
      if (
        !existingNumbers.has(tile.numberToken) &&
        !vertexNumbers.has(tile.numberToken)
      ) {
        score += weights.setupNumberSpreadBonus * (pips / 3.4);
      }
      vertexNumbers.add(tile.numberToken);
    }
  }

  // Award new-resource empire diversity ONCE per distinct missing resource (avoids triple-counting monoculture hexes!)
  for (const [, bestPips] of newEmpireResources) {
    score += weights.setupDiversityBonus * (bestPips / 3.2);
  }

  // Resource diversity on the vertex itself
  score += vertexResources.size * (weights.setupDiversityBonus * 0.45);

  // Foreign Island +2 Bonus VP check during Main Phase
  if (
    !state.phase.startsWith("SETUP_") &&
    player &&
    grantsNewIslandBonusVp(state, player, vertexId)
  ) {
    score += isMaster ? 26 : 18;
  }

  // Coastal launchpad bonus in Seafarers during Setup so player can sail to +2 VP foreign/fog islands!
  if (state.config.enableSeafarers && state.phase.startsWith("SETUP_") && touchesSea) {
    const alreadyHasCoast = Object.entries(state.buildings).some(
      ([vId, b]) =>
        b.ownerId === playerId &&
        (state.topology.vertices[vId]?.adjacentHexIds ?? []).some(
          (hId) => state.hexes[hId]?.terrain === "sea"
        )
    );
    if (!alreadyHasCoast) {
      score += isMaster ? 5.5 : 3.2;
    }
  }

  // Complementary engine pairs across player's total empire (after placing here)
  const hasBrick = existingProd.brick > 0 || vertexResources.has("brick");
  const hasLumber = existingProd.lumber > 0 || vertexResources.has("lumber");
  const hasGrain = existingProd.grain > 0 || vertexResources.has("grain");
  const hasOre = existingProd.ore > 0 || vertexResources.has("ore");
  const hasWool = existingProd.wool > 0 || vertexResources.has("wool");

  if (hasBrick && hasLumber) score += weights.setupPairSynergyBonus;
  if (hasGrain && hasOre) score += weights.setupPairSynergyBonus * 1.28;
  if (hasBrick && hasLumber && hasWool && hasGrain) {
    score += weights.setupPairSynergyBonus * 0.95;
  }

  // Master empire-completion checks on 2nd Setup Settlement: avoid fatal 0-Grain or immobile starts!
  if (isMaster && state.phase === "SETUP_SETTLEMENT_2") {
    if (!hasGrain) {
      // Zero grain cripples Settlements, Cities, AND Dev Cards!
      score -= 8.5;
    }
    if (!hasBrick && !hasLumber && !(state.config.enableSeafarers && hasWool && hasLumber)) {
      score -= 5.0;
    }
  }

  // Second setup settlement grants immediate starting hand cards!
  if (
    state.phase === "SETUP_SETTLEMENT_2" &&
    weights.setupSecondStartHandWeight > 0
  ) {
    const startCards = totalResourceCount(startResources);
    score += startCards * (weights.setupSecondStartHandWeight * 0.55);
    if (startResources.brick >= 1 && startResources.lumber >= 1) {
      score += weights.setupSecondStartHandWeight * 1.45;
    }
    if (
      state.config.enableSeafarers &&
      touchesSea &&
      startResources.wool >= 1 &&
      startResources.lumber >= 1
    ) {
      score += weights.setupSecondStartHandWeight * 1.5;
    }
    if (
      startResources.wool >= 1 &&
      startResources.grain >= 1 &&
      startResources.ore >= 1
    ) {
      score += weights.setupSecondStartHandWeight * 1.1;
    }
  }

  // Harbor value + synergy with heavy production of that specific 2:1 resource
  for (const harbor of state.harbors) {
    if (harbor.vertexIds.includes(vertexId)) {
      if (harbor.type === "generic") {
        score += weights.setupHarborBonus;
      } else {
        const matchingPips =
          existingProd[harbor.type] + vertexPipsByRes[harbor.type];
        score += weights.setupHarborBonus * 0.78 + matchingPips * 0.95;
      }
      if (state.config.enableHarbormaster) {
        score += 5.0;
      }
    }
  }

  // Check if an existing owned 2:1 harbor matches heavy production on THIS candidate vertex!
  if (isMaster || player?.botDifficulty === "smart") {
    const currentRatios = getPlayerTradeRatios(state, playerId);
    for (const r of RESOURCES) {
      if (currentRatios[r] === 2 && vertexPipsByRes[r] > 0) {
        score += vertexPipsByRes[r] * 0.85;
      }
    }
  }

  // Expansion corridor potential: count unblocked distance-2 land/coastal vertices
  if (weights.setupExpansionSpaceWeight > 0) {
    let openTwoHopSpots = 0;
    for (const adjV of vNode.adjacentVertexIds) {
      if (state.buildings[adjV]) continue;
      for (const hop2V of state.topology.vertices[adjV]?.adjacentVertexIds ??
        []) {
        if (hop2V === vertexId || state.buildings[hop2V]) continue;
        const hop2Blocked = (
          state.topology.vertices[hop2V]?.adjacentVertexIds ?? []
        ).some((nb) => Boolean(state.buildings[nb]));
        if (!hop2Blocked) {
          const touchesLand = (
            state.topology.vertices[hop2V]?.adjacentHexIds ?? []
          ).some((hId) => state.hexes[hId]?.terrain !== "sea");
          if (touchesLand) openTwoHopSpots++;
        }
      }
    }
    score += Math.min(5, openTwoHopSpots) * weights.setupExpansionSpaceWeight;
  }

  return score;
}

/**
 * Shortest unblocked edge distance from player's current road/ship network to any open legal settlement spot.
 */
function analyzeExpansionNetwork(
  state: CatanState,
  playerId: string,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): {
  immediateVertices: string[];
  bestOneHopVertexScore: number;
  bestTwoHopVertexScore: number;
  hasReachableSpot: boolean;
} {
  const immediateVertices = getLegalSettlementVertices(state, playerId, false);
  let bestOneHopVertexScore = 0;
  let bestTwoHopVertexScore = 0;
  let hasReachableSpot = immediateVertices.length > 0;

  const myVertices = new Set<string>();
  for (const [eId, route] of Object.entries(state.edges)) {
    if (route.ownerId === playerId) {
      const eNode = state.topology.edges[eId];
      if (eNode) {
        myVertices.add(eNode.v1);
        myVertices.add(eNode.v2);
      }
    }
  }

  for (const vId of myVertices) {
    const b = state.buildings[vId];
    if (b && b.ownerId !== playerId) continue;
    const vNode = state.topology.vertices[vId];
    if (!vNode) continue;
    for (const nextV of vNode.adjacentVertexIds) {
      if (state.buildings[nextV]) continue;
      const distOk = (
        state.topology.vertices[nextV]?.adjacentVertexIds ?? []
      ).every((nb) => !state.buildings[nb]);
      const touchesLand = (
        state.topology.vertices[nextV]?.adjacentHexIds ?? []
      ).some((hId) => state.hexes[hId]?.terrain !== "sea");
      if (distOk && touchesLand) {
        hasReachableSpot = true;
        const sc = evaluateVertexScore(
          state,
          nextV,
          playerId,
          weights,
          scarcity
        );
        if (sc > bestOneHopVertexScore) bestOneHopVertexScore = sc;
        if (sc > bestTwoHopVertexScore) bestTwoHopVertexScore = sc;
      }
      for (const hop2 of state.topology.vertices[nextV]?.adjacentVertexIds ??
        []) {
        if (hop2 === vId || state.buildings[hop2]) continue;
        const dist2Ok = (
          state.topology.vertices[hop2]?.adjacentVertexIds ?? []
        ).every((nb) => !state.buildings[nb]);
        const touchesLand2 = (
          state.topology.vertices[hop2]?.adjacentHexIds ?? []
        ).some((hId) => state.hexes[hId]?.terrain !== "sea");
        if (dist2Ok && touchesLand2) {
          hasReachableSpot = true;
          const sc2 =
            evaluateVertexScore(state, hop2, playerId, weights, scarcity) *
            0.72;
          if (sc2 > bestTwoHopVertexScore) bestTwoHopVertexScore = sc2;
        }
      }
    }
  }

  return {
    immediateVertices,
    bestOneHopVertexScore,
    bestTwoHopVertexScore,
    hasReachableSpot,
  };
}

function countResourceDeficit(
  hand: ResourceMap,
  cost: Partial<ResourceMap>
): number {
  let deficit = 0;
  for (const r of RESOURCES) {
    const req = cost[r] ?? 0;
    if (hand[r] < req) {
      deficit += req - hand[r];
    }
  }
  return deficit;
}

/**
 * Evaluates the strategic potential of holding `hand` for `player` right now.
 */
function evaluateHandStrategicValue(
  state: CatanState,
  player: CatanPlayerState,
  hand: ResourceMap,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  prod: Record<ResourceType, number>,
  isOwnActiveTurn: boolean
): number {
  const ratios = getPlayerTradeRatios(state, player.id);
  const safeLimit = getPlayerSafeHandLimit(state, player.id);
  const totalCards = totalResourceCount(hand);

  const hasSettlementOnBoard = Object.values(state.buildings).some(
    (b) => b.ownerId === player.id && b.type === "settlement"
  );
  const legalSettleNow = getLegalSettlementVertices(state, player.id, false);

  let val = 0;

  for (const r of RESOURCES) {
    const count = hand[r];
    if (count <= 0) continue;
    const lackFactor = prod[r] === 0 ? 1.58 : 1 + 2.25 / (prod[r] + 3);
    const portUtility = ratios[r] === 2 ? 1.28 : ratios[r] === 3 ? 1.09 : 1.0;
    const effectiveUnits =
      count <= 3 ? count : 3 + (count - 3) * (ratios[r] === 2 ? 0.85 : 0.46);
    val += effectiveUnits * 1.15 * scarcity[r] * lackFactor * portUtility;

    if (count >= ratios[r]) {
      val += ratios[r] === 2 ? 1.9 : 1.4;
    }
  }

  // Evaluate mutually-exclusive Grain/Ore consumers (City vs Dev Card) without double-counting the same cards!
  const effectiveCityVal = weights.cityPriority + 24;
  let cityOnlyScore = 0;
  if (hasSettlementOnBoard && player.citiesRemaining > 0) {
    const cityDef = countResourceDeficit(hand, BUILDING_COSTS.city);
    if (cityDef === 0) {
      cityOnlyScore = effectiveCityVal * 0.44;
      if (state.devCardDeck.length > 0) {
        const remAfterCity: ResourceMap = {
          ...hand,
          grain: hand.grain - 2,
          ore: hand.ore - 3,
        };
        if (countResourceDeficit(remAfterCity, BUILDING_COSTS.devCard) === 0) {
          cityOnlyScore += weights.devCardPriority * 0.4;
        }
      }
    } else if (cityDef === 1) {
      cityOnlyScore = effectiveCityVal * 0.17;
    } else if (cityDef === 2) {
      cityOnlyScore = effectiveCityVal * 0.06;
    }
  }

  let devFirstScore = 0;
  if (state.devCardDeck.length > 0) {
    const devDef = countResourceDeficit(hand, BUILDING_COSTS.devCard);
    if (devDef === 0) {
      devFirstScore = weights.devCardPriority * 0.4;
      if (hasSettlementOnBoard && player.citiesRemaining > 0) {
        const remAfterDev: ResourceMap = {
          ...hand,
          wool: hand.wool - 1,
          grain: hand.grain - 1,
          ore: hand.ore - 1,
        };
        const remCityDef = countResourceDeficit(remAfterDev, BUILDING_COSTS.city);
        if (remCityDef === 0) devFirstScore += effectiveCityVal * 0.44;
        else if (remCityDef === 1) devFirstScore += effectiveCityVal * 0.17;
        else if (remCityDef === 2) devFirstScore += effectiveCityVal * 0.06;
      }
    } else if (devDef === 1) {
      devFirstScore = weights.devCardPriority * 0.11;
    }
  }
  val += Math.max(cityOnlyScore, devFirstScore);

  if (player.settlementsRemaining > 0) {
    const setDef = countResourceDeficit(hand, BUILDING_COSTS.settlement);
    const spotMult = legalSettleNow.length > 0 ? 1.05 : 0.55;
    if (setDef === 0) val += weights.settlementPriority * 0.44 * spotMult;
    else if (setDef === 1) val += weights.settlementPriority * 0.16 * spotMult;
    else if (setDef === 2) val += weights.settlementPriority * 0.05 * spotMult;
  }

  const roadDef = countResourceDeficit(hand, BUILDING_COSTS.road);
  if (roadDef === 0 && player.roadsRemaining > 0 && legalSettleNow.length === 0) {
    val += weights.roadToSpotPriority * 0.26;
  }
  if (state.config.enableSeafarers && player.shipsRemaining > 0) {
    const shipDef = countResourceDeficit(hand, BUILDING_COSTS.ship);
    if (shipDef === 0) val += weights.roadToSpotPriority * 0.3;
  }

  const specialBuildRiskMult = state.config.enableSpecialBuildingPhase
    ? 0.45
    : 1.0;
  if (!isOwnActiveTurn && totalCards > safeLimit) {
    const discardLoss = Math.floor(totalCards / 2);
    val -=
      discardLoss *
      weights.sevenDiscardRiskWeight *
      0.9 *
      specialBuildRiskMult;
  } else if (isOwnActiveTurn && totalCards > safeLimit + 2) {
    val -=
      (totalCards - safeLimit) *
      weights.sevenDiscardRiskWeight *
      0.25 *
      specialBuildRiskMult;
  }

  return val;
}

/**
 * Computes the discard combination when a 7 is rolled.
 * - `easy`: first legal discard
 * - `normal`: fast greedy discard from largest resource stacks
 * - `smart` / `master`: exact DFS hand-preservation solver maximizing post-discard build potential!
 */
function chooseOptimalDiscardAction(
  state: CatanState,
  player: CatanPlayerState,
  needed: number,
  weights: CatanBotWeights,
  fallbackLegal: CatanAction[]
): CatanAction {
  const diff = player.botDifficulty ?? "smart";
  if (diff === "easy") {
    return fallbackLegal[0]!;
  }

  if (diff === "normal") {
    const remHand: ResourceMap = { ...player.resources };
    const discard: Partial<ResourceMap> = {};
    let left = needed;
    while (left > 0) {
      let bestRes: ResourceType = "wool";
      let bestCnt = -1;
      for (const r of RESOURCES) {
        if (remHand[r] > bestCnt) {
          bestCnt = remHand[r];
          bestRes = r;
        }
      }
      if (bestCnt <= 0) break;
      remHand[bestRes]--;
      discard[bestRes] = (discard[bestRes] ?? 0) + 1;
      left--;
    }
    return { type: "DISCARD_CARDS", resources: discard };
  }

  const scarcity = computeBoardScarcity(state);
  const prod = computePlayerProductionPips(state, player.id);

  let bestKeepScore = -Infinity;
  let bestDiscard: Partial<ResourceMap> | null = null;

  const currentDiscard: ResourceMap = emptyResources();
  const resList = RESOURCES;

  function dfs(idx: number, rem: number): void {
    if (idx === 4) {
      const rLast = resList[4]!;
      if (rem <= player.resources[rLast]) {
        currentDiscard[rLast] = rem;
        const kept: ResourceMap = {
          brick: player.resources.brick - currentDiscard.brick,
          lumber: player.resources.lumber - currentDiscard.lumber,
          wool: player.resources.wool - currentDiscard.wool,
          grain: player.resources.grain - currentDiscard.grain,
          ore: player.resources.ore - currentDiscard.ore,
        };
        const score = evaluateHandStrategicValue(
          state,
          player,
          kept,
          weights,
          scarcity,
          prod,
          false
        );
        if (score > bestKeepScore) {
          bestKeepScore = score;
          bestDiscard = { ...currentDiscard };
        }
      }
      return;
    }

    const r = resList[idx]!;
    const maxTake = Math.min(rem, player.resources[r]);
    const minTake = Math.max(
      0,
      rem -
        resList
          .slice(idx + 1)
          .reduce((acc, rk) => acc + player.resources[rk], 0)
    );
    for (let take = minTake; take <= maxTake; take++) {
      currentDiscard[r] = take;
      dfs(idx + 1, rem - take);
    }
    currentDiscard[r] = 0;
  }

  dfs(0, needed);

  if (bestDiscard) {
    const cleaned: Partial<ResourceMap> = {};
    for (const r of RESOURCES) {
      if ((bestDiscard[r] ?? 0) > 0) {
        cleaned[r] = bestDiscard[r];
      }
    }
    return { type: "DISCARD_CARDS", resources: cleaned };
  }

  return fallbackLegal[0]!;
}

/**
 * Evaluates whether responder `responder` should accept an active domestic trade offer.
 * Implements Grandmaster 4P table politics:
 * - Strict embargo against players near victory or solo table leaders.
 * - Eager acceptance of mutually beneficial trades with far-trailing players so both outpace the 2nd-place rival!
 */
function shouldBotAcceptDomesticTrade(
  state: CatanState,
  responder: CatanPlayerState,
  weights: CatanBotWeights
): boolean {
  const offer = state.activeTradeOffer;
  if (!offer) return false;
  if (!hasResources(responder.resources, offer.want)) return false;

  const proposer = state.players.find((p) => p.id === offer.fromPlayerId);
  if (!proposer) return false;

  const diff = responder.botDifficulty ?? "smart";
  const targetVp = state.config.targetVictoryPoints;
  const proposerThreatVp = estimatePublicPlayerThreatVp(state, proposer.id);
  const myVp = computePlayerVictoryPoints(state, responder.id, false);

  // 1. Hard Leader Embargo near victory
  if (
    weights.leaderEmbargoMargin > 0 &&
    proposerThreatVp >= targetVp - weights.leaderEmbargoMargin
  ) {
    return false;
  }

  // Smart/Master also embargoes clear solo leaders in the second half of the game
  if (
    (diff === "smart" || diff === "master") &&
    proposerThreatVp >= targetVp - 3 &&
    proposerThreatVp >= myVp + 2
  ) {
    return false;
  }

  // Master Public Multi-VP Lethal Swing Embargo: check if proposer sits on an immediate +3 VP Foreign Island / Harbormaster spot!
  if (diff === "master" && proposerThreatVp >= targetVp - 3) {
    const propOpenSettle = getLegalSettlementVertices(state, proposer.id, false);
    const hasThreeVpSpot = propOpenSettle.some(
      (vId) =>
        grantsNewIslandBonusVp(state, proposer, vId) ||
        (state.config.enableHarbormaster &&
          state.harbormasterOwnerId !== proposer.id &&
          state.harbors.some((h) => h.vertexIds.includes(vId)) &&
          proposer.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1))
    );
    const nearLongestAward =
      state.longestRoadOwnerId !== proposer.id &&
      proposer.longestRoadLength + 1 >= Math.max(5, state.longestRoadLength + 1);
    if (hasThreeVpSpot || (nearLongestAward && propOpenSettle.length > 0)) {
      return false;
    }
  }

  const scarcity = computeBoardScarcity(state);
  const myProd = computePlayerProductionPips(state, responder.id);
  const propProd = computePlayerProductionPips(state, proposer.id);

  const myBefore = evaluateHandStrategicValue(
    state,
    responder,
    responder.resources,
    weights,
    scarcity,
    myProd,
    false
  );

  const myAfterHand: ResourceMap = { ...responder.resources };
  for (const r of RESOURCES) {
    myAfterHand[r] =
      myAfterHand[r] - (offer.want[r] ?? 0) + (offer.give[r] ?? 0);
  }
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

  // Master table-politics adjustment: lower threshold when trading with a harmless trailing player!
  let effectiveThreshold = weights.tradeAcceptThreshold;
  let effectiveFairness = weights.tradeFairnessRatio;
  if (diff === "master") {
    const maxOtherRivalVp = Math.max(
      0,
      ...state.players
        .filter((p) => p.id !== responder.id && p.id !== proposer.id)
        .map((p) => estimatePublicPlayerThreatVp(state, p.id))
    );
    if (proposerThreatVp <= targetVp - 5 && proposerThreatVp < maxOtherRivalVp) {
      effectiveThreshold = 0.18;
      effectiveFairness = 0.35;
    }
  }

  if (myGain < effectiveThreshold) {
    return false;
  }

  if (effectiveFairness <= 0) {
    return true;
  }

  const propBefore = evaluateHandStrategicValue(
    state,
    proposer,
    proposer.resources,
    weights,
    scarcity,
    propProd,
    true
  );
  const propAfterHand: ResourceMap = { ...proposer.resources };
  for (const r of RESOURCES) {
    propAfterHand[r] =
      propAfterHand[r] - (offer.give[r] ?? 0) + (offer.want[r] ?? 0);
  }
  const propAfter = evaluateHandStrategicValue(
    state,
    proposer,
    propAfterHand,
    weights,
    scarcity,
    propProd,
    true
  );
  const propGain = Math.max(0, propAfter - propBefore);

  return myGain >= propGain * effectiveFairness * 0.4;
}

function getTurnDomesticTradeHistory(
  state: CatanState,
  playerId: string
): { count: number; seenSignatures: Set<string> } {
  let count = 0;
  const seenSignatures = new Set<string>();
  for (let i = state.eventLog.length - 1; i >= 0; i--) {
    const evt = state.eventLog[i]!;
    if (evt.turn < state.turn) break;
    if (evt.playerId === playerId && evt.type === "DOMESTIC_TRADE_OFFERED") {
      count++;
      const p = evt.payload as
        | { give?: Partial<ResourceMap>; want?: Partial<ResourceMap> }
        | undefined;
      if (p?.give && p?.want) {
        seenSignatures.add(makeOfferSignature(p.give, p.want));
      }
    }
  }
  return { count, seenSignatures };
}

function makeOfferSignature(
  give: Partial<ResourceMap>,
  want: Partial<ResourceMap>
): string {
  return `${RESOURCES.map((r) => give[r] ?? 0).join(",")}->${RESOURCES.map((r) => want[r] ?? 0).join(",")}`;
}

/**
 * Proposes high-EV Domestic Trades:
 * - `normal`: simple 1:1 trade when 1 card short of a City or Settlement.
 * - `smart`: scarcity-aware 1:1 trade for City, Settlement, or Dev Card.
 * - `master`:
 *   1) Combo Domestic + Maritime lookahead (finds 1-card domestic swaps that combine with in-hand port trades to build immediately!),
 *   2) Opponent-lack ranking (offers the surplus resource that non-threatening opponents lack in production so acceptance jumps!),
 *   3) Rival-aware partner targeting (`toPlayerId` excludes contenders near winning or ahead of us),
 *   4) 2-for-1 surplus sweetener when 1-for-1 is declined and port rate is >= 3:1!
 */
function findStrategicDomesticTradeOffer(
  state: CatanState,
  player: CatanPlayerState,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  prod: Record<ResourceType, number>
): CatanAction | null {
  if (weights.maxDomesticOffersPerTurn <= 0) return null;
  if (state.activeTradeOffer) return null;

  const diff = player.botDifficulty ?? "smart";
  const history = getTurnDomesticTradeHistory(state, player.id);
  if (history.count >= weights.maxDomesticOffersPerTurn) return null;

  const targetVp = state.config.targetVictoryPoints;
  const myVp = computePlayerVictoryPoints(state, player.id, false);
  const eligibleOpponents = state.players.filter((p) => {
    if (p.id === player.id || totalResourceCount(p.resources) <= 0) return false;
    const oppThreat = estimatePublicPlayerThreatVp(state, p.id);
    if (oppThreat >= targetVp - Math.max(1, weights.leaderEmbargoMargin)) {
      return false;
    }
    if (diff === "master" && oppThreat >= targetVp - 3 && oppThreat > myVp + 1) {
      return false;
    }
    return true;
  });
  if (eligibleOpponents.length === 0) return null;

  const candidateTargets: Array<{
    cost: Partial<ResourceMap>;
    priority: number;
  }> = [];

  const hasSettlement = Object.values(state.buildings).some(
    (b) => b.ownerId === player.id && b.type === "settlement"
  );
  if (hasSettlement && player.citiesRemaining > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.city,
      priority: weights.cityPriority,
    });
  }
  const openSettlementSpots = getLegalSettlementVertices(state, player.id, false);
  if (player.settlementsRemaining > 0 && openSettlementSpots.length > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.settlement,
      priority: weights.settlementPriority,
    });
  }
  if (diff !== "normal" && state.devCardDeck.length > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.devCard,
      priority: weights.devCardPriority,
    });
  }
  if (
    diff === "master" &&
    player.settlementsRemaining > 0 &&
    openSettlementSpots.length === 0 &&
    player.roadsRemaining > 0 &&
    getLegalRoadEdges(state, player.id, null).length > 0
  ) {
    candidateTargets.push({
      cost: BUILDING_COSTS.road,
      priority: weights.roadToSpotPriority + 3,
    });
  }
  if (
    diff === "master" &&
    state.config.enableSeafarers &&
    player.shipsRemaining > 0 &&
    getLegalShipEdges(state, player.id, null).length > 0
  ) {
    candidateTargets.push({
      cost: BUILDING_COSTS.ship,
      priority: weights.roadToSpotPriority + 4,
    });
  }

  const ratios = getPlayerTradeRatios(state, player.id);

  // Public bank-deduction supply held across all opponents (`19 - bank[r] - myHand[r]`)
  const isExpandedSupply =
    state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
  const maxSupplyPerRes = isExpandedSupply ? 24 : 19;
  const oppPublicSupply: Record<ResourceType, number> = emptyResources();
  for (const r of RESOURCES) {
    oppPublicSupply[r] = Math.max(
      0,
      maxSupplyPerRes - state.bank[r] - player.resources[r]
    );
  }

  // Precompute opponent lack scores for Master so we offer surplus cards opponents actually crave!
  const oppLackDesire: Record<ResourceType, number> = emptyResources();
  if (diff === "master") {
    for (const opp of eligibleOpponents) {
      const oProd = computePlayerProductionPips(state, opp.id);
      for (const r of RESOURCES) {
        oppLackDesire[r] += oProd[r] === 0 ? 2.0 : 2.5 / (oProd[r] + 2);
      }
    }
  }

  const cardHoldingOpponents = state.players.filter(
    (p) => p.id !== player.id && totalResourceCount(p.resources) > 0
  );
  const anyExcludedOpponent =
    eligibleOpponents.length < cardHoldingOpponents.length;

  for (const target of candidateTargets.sort((a, b) => b.priority - a.priority)) {
    const rawDeficit = countResourceDeficit(player.resources, target.cost);
    if (rawDeficit === 0) continue;

    // Allow `rawDeficit === 1`, OR for `master`, `rawDeficit === 2` when 1 guaranteed port bundle covers the other missing card!
    if (rawDeficit > 2 || (rawDeficit === 2 && diff !== "master")) continue;

    let wantRes: ResourceType | null = null;
    const reservedForPort: ResourceMap = emptyResources();

    if (rawDeficit === 1) {
      wantRes =
        RESOURCES.find(
          (r) => player.resources[r] < (target.cost[r] ?? 0)
        ) ?? null;
    } else {
      // Master 2-deficit hybrid check: reserve 1 maritime port trade from a surplus stack, then ask domestically for the remaining 1!
      const missingList: ResourceType[] = [];
      for (const r of RESOURCES) {
        const miss = (target.cost[r] ?? 0) - player.resources[r];
        for (let k = 0; k < miss; k++) missingList.push(r);
      }
      const portSource = RESOURCES.find((r) => {
        const spare = player.resources[r] - (target.cost[r] ?? 0);
        return spare >= ratios[r];
      });
      if (portSource && missingList.length === 2) {
        const bankCoverable = missingList.find((m) => state.bank[m] > 0);
        if (bankCoverable) {
          reservedForPort[portSource] = ratios[portSource];
          wantRes =
            missingList[0] === bankCoverable ? missingList[1]! : missingList[0]!;
        }
      }
    }

    if (!wantRes) continue;

    // Master Public Bank-Deduction & Port-Arbitrage Redirect:
    // If ZERO copies of `wantRes` exist in opponents' hands (`oppPublicSupply[wantRes] === 0`),
    // never waste an offer asking for `wantRes`! Instead, if `state.bank[wantRes] > 0` and we are 1 card
    // short of a 2:1 or 3:1 port bundle (`portRes`) that opponents DO hold, ask for `portRes` to arbitrage the bank!
    if (diff === "master" && oppPublicSupply[wantRes] <= 0) {
      if (state.bank[wantRes] <= 0) continue;
      const arbPortRes = RESOURCES.find((r) => {
        if (r === wantRes || ratios[r] > 3 || oppPublicSupply[r] <= 0) {
          return false;
        }
        const freeCards =
          player.resources[r] - (target.cost[r] ?? 0) - reservedForPort[r];
        return freeCards === ratios[r] - 1;
      });
      if (!arbPortRes) continue;
      reservedForPort[arbPortRes] += ratios[arbPortRes] - 1;
      wantRes = arbPortRes;
    }

    // If we already own a 2:1 harbor with spare cards and no opponent lacks our spare, still prefer 1:1 first (saves 1 card!)
    const spareResources = RESOURCES.filter(
      (r) =>
        r !== wantRes &&
        player.resources[r] - (target.cost[r] ?? 0) - reservedForPort[r] >= 1
    ).sort((a, b) => {
      const spareA =
        player.resources[a] - (target.cost[a] ?? 0) - reservedForPort[a];
      const spareB =
        player.resources[b] - (target.cost[b] ?? 0) - reservedForPort[b];
      if (diff === "master") {
        // Balance excess quantity + how badly opponents want `a` vs `b` - own scarcity cost
        const scoreA = spareA * 1.1 + oppLackDesire[a] * 0.9 - scarcity[a] * 1.2;
        const scoreB = spareB * 1.1 + oppLackDesire[b] * 0.9 - scarcity[b] * 1.2;
        return scoreB - scoreA;
      }
      if (spareB !== spareA) return spareB - spareA;
      return scarcity[a] - scarcity[b];
    });

    if (spareResources.length === 0) continue;

    // Pick safe partner if any opponent on the board is embargoed; Master targets the safe opponent
    // whose public hex production + hand size makes them most likely to hold `wantRes`!
    const safePartnerId = anyExcludedOpponent
      ? [...eligibleOpponents].sort((a, b) => {
          if (diff === "master") {
            const aProd = computePlayerProductionPips(state, a.id)[wantRes!];
            const bProd = computePlayerProductionPips(state, b.id)[wantRes!];
            const aUtility =
              aProd * 1.4 +
              Math.min(5, totalResourceCount(a.resources)) * 0.7 -
              estimatePublicPlayerThreatVp(state, a.id) * 0.85;
            const bUtility =
              bProd * 1.4 +
              Math.min(5, totalResourceCount(b.resources)) * 0.7 -
              estimatePublicPlayerThreatVp(state, b.id) * 0.85;
            return bUtility - aUtility;
          }
          return (
            estimatePublicPlayerThreatVp(state, a.id) -
            estimatePublicPlayerThreatVp(state, b.id)
          );
        })[0]!.id
      : null;

    for (const giveRes of spareResources) {
      const spareAmt =
        player.resources[giveRes] -
        (target.cost[giveRes] ?? 0) -
        reservedForPort[giveRes];

      // 1-for-1 offer
      const give1: Partial<ResourceMap> = { [giveRes]: 1 };
      const want1: Partial<ResourceMap> = { [wantRes]: 1 };
      const sig1 = makeOfferSignature(give1, want1);
      if (!history.seenSignatures.has(sig1)) {
        return {
          type: "OFFER_DOMESTIC_TRADE",
          toPlayerId: safePartnerId,
          give: give1,
          want: want1,
        };
      }

      // Master 2-for-1 sweetener when 1-for-1 was declined and bank rate is >= 3:1 (still saves 1-2 cards vs bank!)
      if (diff === "master" && spareAmt >= 2 && ratios[giveRes] >= 3) {
        const give2: Partial<ResourceMap> = { [giveRes]: 2 };
        const want2: Partial<ResourceMap> = { [wantRes]: 1 };
        const sig2 = makeOfferSignature(give2, want2);
        if (!history.seenSignatures.has(sig2)) {
          return {
            type: "OFFER_DOMESTIC_TRADE",
            toPlayerId: safePartnerId,
            give: give2,
            want: want2,
          };
        }
      }
    }
  }

  return null;
}

/**
 * Scores candidate edges for road or ship expansion.
 */
function scoreExpansionEdge(
  state: CatanState,
  edgeId: string,
  playerId: string,
  kind: "road" | "ship",
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): number {
  const eNode = state.topology.edges[edgeId];
  if (!eNode) return -999;

  const player = state.players.find((p) => p.id === playerId)!;
  const diff = player.botDifficulty ?? "smart";
  let score = 0;

  for (const vId of [eNode.v1, eNode.v2]) {
    const existingBuilding = state.buildings[vId];
    if (!existingBuilding) {
      const distRuleOk = state.topology.vertices[vId]!.adjacentVertexIds.every(
        (adjV) => !state.buildings[adjV]
      );
      if (distRuleOk) {
        const touchesLand = state.topology.vertices[vId]!.adjacentHexIds.some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (touchesLand) {
          score +=
            12.5 +
            evaluateVertexScore(state, vId, playerId, weights, scarcity) * 0.58;
        }
      } else if (diff === "smart" || diff === "master") {
        // 2-hop lookahead only for Smart and Master!
        for (const hopV of state.topology.vertices[vId]!.adjacentVertexIds) {
          if (state.buildings[hopV]) continue;
          const hopDistOk = (
            state.topology.vertices[hopV]?.adjacentVertexIds ?? []
          ).every((nb) => !state.buildings[nb]);
          const hopLand = (
            state.topology.vertices[hopV]?.adjacentHexIds ?? []
          ).some((hId) => state.hexes[hId]?.terrain !== "sea");
          if (hopDistOk && hopLand) {
            score +=
              4.2 +
              evaluateVertexScore(state, hopV, playerId, weights, scarcity) *
                0.3;
          }
        }
      }
    }
  }

  // Longest Route (+2 VP) extension & exact path check for Master
  if (diff === "master" && player.longestRoadLength >= 3) {
    const newLen = simulateRouteLengthWithEdge(state, playerId, edgeId, kind);
    if (newLen > player.longestRoadLength) {
      const needForAward = Math.max(5, state.longestRoadLength + 1);
      if (state.longestRoadOwnerId !== playerId && newLen >= needForAward) {
        score += weights.longestRoadContestBonus * 1.9;
      } else if (
        state.longestRoadOwnerId !== playerId &&
        newLen === needForAward - 1
      ) {
        score += weights.longestRoadContestBonus * 1.1;
      } else if (state.longestRoadOwnerId === playerId) {
        const runnerUp = Math.max(
          0,
          ...state.players
            .filter((p) => p.id !== playerId)
            .map((p) => p.longestRoadLength)
        );
        if (runnerUp >= player.longestRoadLength - 1) {
          score += weights.longestRoadContestBonus * 0.85;
        }
      }
    }
  } else {
    const touchesOwnRoute = [eNode.v1, eNode.v2].some((vId) => {
      const b = state.buildings[vId];
      if (b && b.ownerId !== playerId) return false;
      return (state.topology.vertices[vId]?.incidentEdgeIds ?? []).some(
        (incE) => incE !== edgeId && state.edges[incE]?.ownerId === playerId
      );
    });
    if (touchesOwnRoute && player.longestRoadLength >= 3) {
      const needForAward = Math.max(5, state.longestRoadLength + 1);
      if (
        state.longestRoadOwnerId !== playerId &&
        player.longestRoadLength >= needForAward - 2
      ) {
        score += weights.longestRoadContestBonus;
      }
    }
  }

  if (kind === "ship") {
    for (const hId of eNode.adjacentHexIds) {
      const tile = state.hexes[hId];
      if (!tile) continue;
      if (tile.terrain === "fog") score += diff === "master" ? 24 : 16;
      if (
        tile.islandId > 0 &&
        !player.homeIslandIds.includes(tile.islandId) &&
        !player.settledIslandIds.includes(tile.islandId)
      ) {
        score += diff === "master" ? 20 : 12;
      }
    }
  }

  return score;
}

/**
 * Checks if `player` has an immediate 1-action lethal win on the board right now!
 */
function findImmediateWinningAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  currentVp: number,
  targetVp: number
): CatanAction | null {
  // 1. Settlement (+1 VP, +2 if new foreign island, +2 if claims Harbormaster)
  for (const act of legalActions) {
    if (act.type === "BUILD_SETTLEMENT") {
      let gain = 1;
      if (grantsNewIslandBonusVp(state, player, act.vertexId)) {
        gain += 2;
      }
      if (
        state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== player.id &&
        state.harbors.some((h) => h.vertexIds.includes(act.vertexId)) &&
        player.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1)
      ) {
        gain += 2;
      }
      if (currentVp + gain >= targetVp) return act;
    } else if (act.type === "BUILD_CITY") {
      let gain = 1;
      if (
        state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== player.id &&
        state.harbors.some((h) => h.vertexIds.includes(act.vertexId)) &&
        player.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1)
      ) {
        gain += 2;
      }
      if (currentVp + gain >= targetVp) return act;
    }
  }

  // 2. Largest Army lethal (+2 VP) via PLAY_KNIGHT
  if (
    currentVp + 2 >= targetVp &&
    state.largestArmyOwnerId !== player.id &&
    player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1)
  ) {
    const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
    if (playKnight) return playKnight;
  }

  // 3. Longest Road / Trade Route lethal (+2 VP) via BUILD_ROAD, BUILD_SHIP, or 0-cost MOVE_SHIP!
  if (currentVp + 2 >= targetVp && state.longestRoadOwnerId !== player.id) {
    const neededLen = Math.max(5, state.longestRoadLength + 1);
    if (player.longestRoadLength + 1 >= neededLen) {
      for (const act of legalActions) {
        if (act.type === "MOVE_SHIP") {
          const newLen = simulateRouteLengthWithEdge(
            state,
            player.id,
            act.toEdgeId,
            "ship",
            act.fromEdgeId
          );
          if (newLen >= neededLen) return act;
        } else if (act.type === "BUILD_ROAD" || act.type === "BUILD_SHIP") {
          const newLen = simulateRouteLengthWithEdge(
            state,
            player.id,
            act.edgeId,
            act.type === "BUILD_SHIP" ? "ship" : "road"
          );
          if (newLen >= neededLen) return act;
        }
      }
    }
  }

  return null;
}

/**
 * Full Snake-Draft Rollout Search for Master's 1st Settlement (`SETUP_SETTLEMENT_1`).
 * Simulates subsequent opponents' snake-draft picks (`i+1..N-1`, `N-1..i+1`) to evaluate the
 * exact surviving 2nd-settlement pair `(v1, v2)` rather than choosing `v1` myopically!
 */
function chooseMasterFirstSettlementWithSnakeRollout(
  state: CatanState,
  playerId: string,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction {
  const setupActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLACE_SETUP_SETTLEMENT" }> =>
      a.type === "PLACE_SETUP_SETTLEMENT"
  );
  if (setupActs.length <= 1) return legalActions[0]!;

  const scored = setupActs
    .map((act) => ({
      act,
      s1: evaluateVertexScore(state, act.vertexId, playerId, weights, scarcity),
    }))
    .sort((a, b) => b.s1 - a.s1);

  const legalPool = scored.map((x) => x.act.vertexId);
  const topCandidates = scored.slice(0, Math.min(8, scored.length));

  const myIdx = state.players.findIndex((p) => p.id === playerId);
  const n = state.players.length;
  const startIdx = state.startingPlayerIndex ?? 0;
  const snakeSteps: Array<{ oppId: string; phase: CatanState["phase"] }> = [];
  if (myIdx >= 0) {
    const myOrder = (myIdx - startIdx + n) % n;
    for (let ord = myOrder + 1; ord < n; ord++) {
      snakeSteps.push({
        oppId: state.players[(startIdx + ord) % n]!.id,
        phase: "SETUP_SETTLEMENT_1",
      });
    }
    for (let ord = n - 1; ord > myOrder; ord--) {
      snakeSteps.push({
        oppId: state.players[(startIdx + ord) % n]!.id,
        phase: "SETUP_SETTLEMENT_2",
      });
    }
  }

  let bestAct = topCandidates[0]!.act;
  let bestCombined = -Infinity;

  for (const cand of topCandidates) {
    const simBuildings: CatanState["buildings"] = {
      ...state.buildings,
      [cand.act.vertexId]: { ownerId: playerId, type: "settlement" },
    };
    const simState: CatanState = {
      ...state,
      buildings: simBuildings,
      phase: "SETUP_SETTLEMENT_1",
    };

    const isStillOpen = (vId: string): boolean =>
      !simBuildings[vId] &&
      state.topology.vertices[vId]!.adjacentVertexIds.every(
        (nb) => !simBuildings[nb]
      );

    for (const step of snakeSteps) {
      simState.phase = step.phase;
      let oppBestV: string | null = null;
      let oppBestS = -Infinity;
      for (const vId of legalPool) {
        if (!isStillOpen(vId)) continue;
        const os = evaluateVertexScore(
          simState,
          vId,
          step.oppId,
          CATAN_BOT_WEIGHTS.smart,
          scarcity
        );
        if (os > oppBestS) {
          oppBestS = os;
          oppBestV = vId;
        }
      }
      if (oppBestV) {
        simBuildings[oppBestV] = { ownerId: step.oppId, type: "settlement" };
      }
    }

    simState.phase = "SETUP_SETTLEMENT_2";
    let bestS2 = -20;
    for (const vId of legalPool) {
      if (!isStillOpen(vId)) continue;
      const s2 = evaluateVertexScore(
        simState,
        vId,
        playerId,
        weights,
        scarcity
      );
      if (s2 > bestS2) bestS2 = s2;
    }

    const combined = cand.s1 * 0.56 + bestS2 * 0.58;
    if (combined > bestCombined) {
      bestCombined = combined;
      bestAct = cand.act;
    }
  }

  return bestAct;
}

/**
 * Heuristic & Tactical Lookahead AI bot supporting 4 distinct strength tiers:
 * `"easy"` | `"normal"` | `"smart"` | `"master"`.
 */
export function chooseCatanBotAction(
  state: CatanState,
  playerId: string
): CatanAction | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;

  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";
  const weights = CATAN_BOT_WEIGHTS[difficulty] ?? CATAN_BOT_WEIGHTS.smart;
  const legalActions = getCatanLegalActions(state, playerId);

  if (legalActions.length === 0) return null;

  // 0. Responding to another player's Domestic Trade offer
  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    state.activeTradeOffer.fromPlayerId !== playerId
  ) {
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

  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    state.activeTradeOffer.fromPlayerId === playerId
  ) {
    return { type: "CANCEL_DOMESTIC_TRADE" };
  }

  const scarcity = computeBoardScarcity(state);
  const myProd = computePlayerProductionPips(state, playerId);

  // 1. Setup Settlement Placement
  if (
    state.phase === "SETUP_SETTLEMENT_1" ||
    state.phase === "SETUP_SETTLEMENT_2"
  ) {
    if (difficulty === "master" && state.phase === "SETUP_SETTLEMENT_1") {
      return chooseMasterFirstSettlementWithSnakeRollout(
        state,
        playerId,
        legalActions,
        weights,
        scarcity
      );
    }
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    for (const act of legalActions) {
      if (act.type === "PLACE_SETUP_SETTLEMENT") {
        const s = evaluateVertexScore(
          state,
          act.vertexId,
          playerId,
          weights,
          scarcity
        );
        if (s > bestScore) {
          bestScore = s;
          bestAction = act;
        }
      }
    }
    return bestAction;
  }

  // 2. Setup Road / Ship Placement
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    if (difficulty === "easy") {
      return legalActions[0]!;
    }
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    for (const act of legalActions) {
      if (act.type === "PLACE_SETUP_EDGE") {
        const s = scoreExpansionEdge(
          state,
          act.edgeId,
          playerId,
          act.edgeKind,
          weights,
          scarcity
        );
        if (s > bestScore) {
          bestScore = s;
          bestAction = act;
        }
      }
    }
    return bestAction;
  }

  // 3. Discard on 7
  if (state.phase === "DISCARD_ON_SEVEN") {
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed > 0) {
      return chooseOptimalDiscardAction(
        state,
        player,
        needed,
        weights,
        legalActions
      );
    }
    return legalActions[0]!;
  }

  // 4. Gold River Resource Selection
  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    if (difficulty === "easy") {
      return legalActions[0]!;
    }
    let bestPick = legalActions[0]!;
    let bestVal = -Infinity;
    for (const act of legalActions) {
      if (act.type === "SELECT_GOLD_RESOURCE") {
        const nextHand: ResourceMap = {
          ...player.resources,
          [act.resource]: player.resources[act.resource] + 1,
        };
        const v = evaluateHandStrategicValue(
          state,
          player,
          nextHand,
          weights,
          scarcity,
          myProd,
          state.players[state.activePlayerIndex]?.id === playerId
        );
        if (v > bestVal) {
          bestVal = v;
          bestPick = act;
        }
      }
    }
    return bestPick;
  }

  // 5. Pre-Roll: Play Knight BEFORE rolling if our hex/ship is blocked OR to immediately claim Largest Army!
  if (state.phase === "PRE_ROLL") {
    const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
    if (playKnight && difficulty !== "easy") {
      const robberHNode = state.topology.hexes[state.robberHexId];
      const touchesMyPiece = robberHNode?.cornerVertexIds.some(
        (vId) => state.buildings[vId]?.ownerId === playerId
      );
      const pirateHNode = state.pirateHexId
        ? state.topology.hexes[state.pirateHexId]
        : null;
      const pirateBlocksShip = pirateHNode?.sideEdgeIds.some(
        (eId) => state.edges[eId]?.ownerId === playerId
      );
      const claimsArmyNow =
        state.largestArmyOwnerId !== playerId &&
        player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
      const armyRace =
        difficulty === "master" || difficulty === "smart"
          ? claimsArmyNow || player.knightsPlayed >= 2
          : false;

      if (touchesMyPiece || pirateBlocksShip || armyRace) {
        return playKnight;
      }
    }
    return legalActions.find((a) => a.type === "ROLL_DICE") ?? legalActions[0]!;
  }

  // 6. Move Robber or Pirate: target leading opponent, paralyze sole-source bottlenecks, & maximize steal EV!
  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    if (difficulty === "easy") {
      for (const act of legalActions) {
        if (act.type === "MOVE_ROBBER") {
          const hNode = state.topology.hexes[act.hexId]!;
          const selfHit = hNode.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === playerId
          );
          if (!selfHit) return act;
        }
      }
      return legalActions[0]!;
    }

    const oppProdCache = new Map<string, Record<ResourceType, number>>();
    if (difficulty === "master") {
      for (const p of state.players) {
        if (p.id !== playerId) {
          oppProdCache.set(p.id, computePlayerProductionPips(state, p.id, true));
        }
      }
    }

    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;

    for (const act of legalActions) {
      if (act.type === "MOVE_ROBBER") {
        const hNode = state.topology.hexes[act.hexId]!;
        const tile = state.hexes[act.hexId]!;
        const pips = tile.numberToken
          ? (NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0)
          : 0;
        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        const scMult = res ? scarcity[res] : tile.terrain === "gold" ? 1.55 : 1;
        let hexScore = pips * weights.robberPipsWeight * scMult;
        let hitsSelf = false;
        let bestVictimBonus = 0;

        for (const vId of hNode.cornerVertexIds) {
          const b = state.buildings[vId];
          if (!b) continue;
          const mult = b.type === "city" ? 2 : 1;
          if (b.ownerId === playerId) {
            hitsSelf = true;
            hexScore -= 65 * mult;
          } else {
            const oppThreat = estimatePublicPlayerThreatVp(state, b.ownerId);
            const oppCards = totalResourceCount(
              state.players.find((p) => p.id === b.ownerId)!.resources
            );
            hexScore +=
              (oppThreat * weights.robberLeaderVpWeight + pips * 1.4) * mult;

            // Master bottleneck check: paralyzing an opponent's ONLY source of Ore/Grain/Brick!
            if (difficulty === "master" && res && pips > 0) {
              const oProd = oppProdCache.get(b.ownerId);
              if (oProd && oProd[res] <= pips * mult) {
                hexScore += 9.5 * scMult * mult;
              }
            }

            if (oppCards > 0) {
              bestVictimBonus = Math.max(
                bestVictimBonus,
                7 + Math.min(6, oppCards) + oppThreat * 0.9
              );
            }
          }
        }
        hexScore += bestVictimBonus;
        if (hitsSelf) hexScore -= 130;

        if (hexScore > bestScore) {
          bestScore = hexScore;
          bestAction = act;
        }
      } else if (act.type === "MOVE_PIRATE") {
        const hNode = state.topology.hexes[act.hexId]!;
        let pirateScore = 2;
        for (const eId of hNode.sideEdgeIds) {
          const r = state.edges[eId];
          if (!r || r.type !== "ship") continue;
          if (r.ownerId === playerId) {
            pirateScore -= 75;
          } else {
            const oppThreat = estimatePublicPlayerThreatVp(state, r.ownerId);
            pirateScore += 10 + oppThreat * weights.robberLeaderVpWeight * 0.85;
          }
        }
        if (pirateScore > bestScore) {
          bestScore = pirateScore;
          bestAction = act;
        }
      }
    }
    return bestAction;
  }

  // 7. Steal Resource: target highest-threat victim (+ expected stolen resource synergy for Master!)
  if (state.phase === "STEAL_RESOURCE") {
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    for (const act of legalActions) {
      if (act.type === "STEAL_FROM_PLAYER") {
        const victim = state.players.find((p) => p.id === act.victimId)!;
        const threat = estimatePublicPlayerThreatVp(state, victim.id);
        let s =
          threat * weights.robberLeaderVpWeight +
          Math.min(5, totalResourceCount(victim.resources));
        if (difficulty === "master") {
          const vProd = computePlayerProductionPips(state, victim.id, true);
          const vTotal =
            RESOURCES.reduce((acc, r) => acc + vProd[r], 0) || 1;
          for (const r of RESOURCES) {
            const prob = vProd[r] / vTotal;
            if (myProd[r] === 0) s += prob * 6.5 * scarcity[r];
            else s += prob * 2.2 * scarcity[r];
          }
        }
        if (s > bestScore) {
          bestScore = s;
          bestAction = act;
        }
      }
    }
    return bestAction;
  }

  // 8. Free Road Building Development Card Phase
  if (state.phase === "ROAD_BUILDING_DEV") {
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    for (const act of legalActions) {
      if (act.type === "BUILD_ROAD" || act.type === "BUILD_SHIP") {
        const s = scoreExpansionEdge(
          state,
          act.edgeId,
          playerId,
          act.type === "BUILD_SHIP" ? "ship" : "road",
          weights,
          scarcity
        );
        if (s > bestScore) {
          bestScore = s;
          bestAction = act;
        }
      }
    }
    return bestAction;
  }

  // 9. MAIN_PHASE and SPECIAL_BUILDING
  const currentVp = computePlayerVictoryPoints(state, playerId, false);
  const targetVp = state.config.targetVictoryPoints;

  // 9a. Immediate Lethal Scanner (Master & Smart check ALL multi-VP swings!)
  if (difficulty === "master" || difficulty === "smart") {
    const winNow = findImmediateWinningAction(
      state,
      player,
      legalActions,
      currentVp,
      targetVp
    );
    if (winNow) return winNow;
  }

  // 9a-2. Master Pre-Action Free Fog Harvester via 0-cost `MOVE_SHIP`!
  //Revealing a fog hex grants +1 FREE resource immediately before deciding builds/trades!
  if (difficulty === "master" && state.phase === "MAIN_PHASE") {
    const fogShipMove = legalActions.find(
      (a): a is Extract<CatanAction, { type: "MOVE_SHIP" }> =>
        a.type === "MOVE_SHIP" &&
        (state.topology.edges[a.toEdgeId]?.adjacentHexIds ?? []).some(
          (hId) => state.hexes[hId]?.terrain === "fog"
        )
    );
    if (fogShipMove) return fogShipMove;
  }

  const buildSettlements = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_SETTLEMENT" }> =>
      a.type === "BUILD_SETTLEMENT"
  );
  const buildCities = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_CITY" }> =>
      a.type === "BUILD_CITY"
  );

  // 9b. Score Settlements vs Cities carefully (including Foreign Island +2 VP, Harbormaster +2 VP, and Road-Break!)
  let bestBuildAction: CatanAction | null = null;
  let bestBuildScore = -Infinity;

  for (const act of buildSettlements) {
    const vScore = evaluateVertexScore(
      state,
      act.vertexId,
      playerId,
      weights,
      scarcity
    );
    const vNode = state.topology.vertices[act.vertexId]!;
    const contested = vNode.incidentEdgeIds.some((eId) => {
      const e = state.edges[eId];
      return e && e.ownerId !== playerId;
    });
    const newIslandBonus =
      difficulty !== "easy" && grantsNewIslandBonusVp(state, player, act.vertexId)
        ? 36
        : 0;
    const harborBonus =
      state.config.enableHarbormaster &&
      state.harbors.some((h) => h.vertexIds.includes(act.vertexId))
        ? weights.harbormasterContestBonus
        : 0;

    // Check if settling here splits an opponent's contiguous road/ship network!
    let roadBreakBonus = 0;
    if (difficulty === "master" || difficulty === "smart") {
      const oppCounts = new Map<string, number>();
      for (const eId of vNode.incidentEdgeIds) {
        const owner = state.edges[eId]?.ownerId;
        if (owner && owner !== playerId) {
          oppCounts.set(owner, (oppCounts.get(owner) ?? 0) + 1);
        }
      }
      for (const [oppId, cnt] of oppCounts) {
        if (cnt >= 2) {
          roadBreakBonus +=
            state.longestRoadOwnerId === oppId ? 30 : 14;
        }
      }
    }

    const totalS =
      weights.settlementPriority +
      vScore * 1.15 +
      (contested ? 12 : 0) +
      newIslandBonus +
      harborBonus +
      roadBreakBonus;
    if (totalS > bestBuildScore) {
      bestBuildScore = totalS;
      bestBuildAction = act;
    }
  }

  for (const act of buildCities) {
    const vNode = state.topology.vertices[act.vertexId]!;
    let prodGain = 0;
    for (const hId of vNode.adjacentHexIds) {
      if (hId === state.robberHexId) continue;
      const tile = state.hexes[hId];
      if (!tile?.numberToken) continue;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      const sc = res ? scarcity[res] : 1.45;
      const cityBias = res === "ore" || res === "grain" ? 1.28 : 1.0;
      prodGain += pips * 2.85 * sc * cityBias;
    }
    const harborBonus =
      state.config.enableHarbormaster &&
      state.harbors.some((h) => h.vertexIds.includes(act.vertexId))
        ? weights.harbormasterContestBonus * 0.95
        : 0;
    const freePieceBonus = player.settlementsRemaining === 0 ? 15 : 0;
    const totalC =
      weights.cityPriority + prodGain + harborBonus + freePieceBonus;
    if (totalC > bestBuildScore) {
      bestBuildScore = totalC;
      bestBuildAction = act;
    }
  }

  if (bestBuildAction) {
    return bestBuildAction;
  }

  // 9c. Play high-impact Development Cards BEFORE spending on roads or ending turn
  const playRoadBuild = legalActions.find(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  if (playRoadBuild) return playRoadBuild;

  const yopActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_YEAR_OF_PLENTY" }> =>
      a.type === "PLAY_YEAR_OF_PLENTY"
  );
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

  const monoActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_MONOPOLY" }> =>
      a.type === "PLAY_MONOPOLY"
  );
  if (monoActions.length > 0) {
    if (difficulty === "easy" || difficulty === "normal") {
      // Easy/Normal guesses based on most scarce resource it lacks
      const sorted = [...monoActions].sort(
        (a, b) => scarcity[b.resource] - scarcity[a.resource]
      );
      return sorted[0]!;
    }

    const isExpanded =
      state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
    const totalSupplyPerRes = isExpanded ? 24 : 19;

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
      const minCardsToTrigger = difficulty === "master" ? 4 : 3;
      const unlocksMajor =
        (hasResources(simHand, BUILDING_COSTS.city) &&
          !hasResources(player.resources, BUILDING_COSTS.city)) ||
        (hasResources(simHand, BUILDING_COSTS.settlement) &&
          !hasResources(player.resources, BUILDING_COSTS.settlement));
      if (
        (inOpponentHands >= minCardsToTrigger || unlocksMajor) &&
        gain > bestClaimScore
      ) {
        bestClaimScore = gain;
        bestMono = act;
      }
    }
    if (bestMono) return bestMono;
  }

  const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
  if (playKnight) return playKnight;

  // 9d. Propose Strategic Domestic Trade BEFORE paying Maritime 3:1 / 4:1 bank rates!
  if (state.phase === "MAIN_PHASE") {
    const domesticOffer = findStrategicDomesticTradeOffer(
      state,
      player,
      weights,
      scarcity,
      myProd
    );
    if (domesticOffer) {
      return domesticOffer;
    }
  }

  // 9e. Smart Maritime / Port Trade
  const maritimeTrades = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
      a.type === "MARITIME_TRADE"
  );
  if (maritimeTrades.length > 0) {
    if (difficulty === "easy") {
      const simpleTrade = maritimeTrades.find(
        (t) =>
          player.resources[t.give] >= 5 && player.resources[t.receive] === 0
      );
      if (simpleTrade) return simpleTrade;
    } else if (difficulty === "normal") {
      // Normal trades 1-step when missing a resource it has 0 of
      const normalTrade = maritimeTrades.find(
        (t) =>
          player.resources[t.give] >= t.giveAmount + 1 &&
          player.resources[t.receive] === 0
      );
      if (normalTrade) return normalTrade;
    } else {
      // Master multi-step port combo solver
      if (difficulty === "master") {
        const ratios = getPlayerTradeRatios(state, playerId);
        const hasOwnSettle = Object.values(state.buildings).some(
          (b) => b.ownerId === playerId && b.type === "settlement"
        );
        const openSpotsNow = getLegalSettlementVertices(state, playerId, false);
        const comboTargets: Partial<ResourceMap>[] = [];

        if (player.citiesRemaining > 0 && hasOwnSettle) {
          comboTargets.push(BUILDING_COSTS.city);
        }
        if (player.settlementsRemaining > 0 && openSpotsNow.length > 0) {
          comboTargets.push(BUILDING_COSTS.settlement);
        }
        if (
          player.settlementsRemaining > 0 &&
          player.roadsRemaining > 0 &&
          openSpotsNow.length === 0
        ) {
          const net = analyzeExpansionNetwork(
            state,
            playerId,
            weights,
            scarcity
          );
          if (net.bestOneHopVertexScore >= 14) {
            comboTargets.push({ brick: 2, lumber: 2, wool: 1, grain: 1 });
          }
        }
        if (state.devCardDeck.length > 0) {
          comboTargets.push(BUILDING_COSTS.devCard);
        }

        for (const cost of comboTargets) {
          let totalMissing = 0;
          let firstMissing: ResourceType | null = null;
          let bankCanSupply = true;
          let totalConvertibleTrades = 0;
          let bestGiveRes: ResourceType | null = null;
          let bestGiveRatio = 99;

          for (const r of RESOURCES) {
            const req = cost[r] ?? 0;
            if (player.resources[r] < req) {
              const need = req - player.resources[r];
              if (state.bank[r] < need) {
                bankCanSupply = false;
                break;
              }
              totalMissing += need;
              if (!firstMissing) firstMissing = r;
            } else if (player.resources[r] > req) {
              const spare = player.resources[r] - req;
              const tradesHere = Math.floor(spare / ratios[r]);
              if (tradesHere > 0) {
                totalConvertibleTrades += tradesHere;
                if (ratios[r] < bestGiveRatio) {
                  bestGiveRatio = ratios[r];
                  bestGiveRes = r;
                }
              }
            }
          }

          if (
            bankCanSupply &&
            totalMissing > 0 &&
            totalConvertibleTrades >= totalMissing &&
            firstMissing &&
            bestGiveRes
          ) {
            const matchTrade = maritimeTrades.find(
              (t) => t.give === bestGiveRes && t.receive === firstMissing
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
      if (bestTrade) return bestTrade;
    }
  }

  // 9f. Compare Expansion Road/Ship vs Development Card vs City Wall!
  const expansionInfo = analyzeExpansionNetwork(
    state,
    playerId,
    weights,
    scarcity
  );
  const buyDev = legalActions.find((a) => a.type === "BUY_DEV_CARD");
  const buildWalls = legalActions.filter((a) => a.type === "BUILD_CITY_WALL");
  const roadAndShipBuilds = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_ROAD" | "BUILD_SHIP" }> =>
      a.type === "BUILD_ROAD" || a.type === "BUILD_SHIP"
  );

  let bestEdgeAct: Extract<CatanAction, { type: "BUILD_ROAD" | "BUILD_SHIP" }> | null =
    null;
  let bestEdgeScore = -Infinity;
  for (const act of roadAndShipBuilds) {
    const s = scoreExpansionEdge(
      state,
      act.edgeId,
      playerId,
      act.type === "BUILD_SHIP" ? "ship" : "road",
      weights,
      scarcity
    );
    if (s > bestEdgeScore) {
      bestEdgeScore = s;
      bestEdgeAct = act;
    }
  }

  const safeLimit = getPlayerSafeHandLimit(state, playerId);
  const overSafeLimit = totalResourceCount(player.resources) > safeLimit;

  // Master priority: if a high-EV Ship opens a Foreign Island (+2 VP), Fog hex (+1 free card),
  // or claims Longest Trade Route (+2 VP), build THAT before burning Wool on a random Dev Card!
  if (
    difficulty === "master" &&
    bestEdgeAct &&
    bestEdgeAct.type === "BUILD_SHIP" &&
    bestEdgeScore >= 33
  ) {
    return bestEdgeAct;
  }

  if (buyDev) {
    const hasSettlementToUpgrade =
      player.citiesRemaining > 0 &&
      Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "settlement"
      );
    const savingForCity =
      (difficulty === "master" || difficulty === "smart") &&
      hasSettlementToUpgrade &&
      countResourceDeficit(player.resources, BUILDING_COSTS.city) === 1 &&
      !overSafeLimit;

    // Master also protects an imminent 1-away Settlement on an ALREADY-OPEN spot early in the game!
    const myBuildingCount = Object.values(state.buildings).filter(
      (b) => b.ownerId === playerId
    ).length;
    const savingForOpenSettlement =
      difficulty === "master" &&
      myBuildingCount <= 3 &&
      expansionInfo.immediateVertices.length > 0 &&
      countResourceDeficit(player.resources, BUILDING_COSTS.settlement) === 1 &&
      !overSafeLimit;

    if (!savingForCity && !savingForOpenSettlement) {
      return buyDev;
    }
  }

  if (bestEdgeAct) {
    const needSpot =
      expansionInfo.immediateVertices.length === 0 &&
      player.settlementsRemaining > 0 &&
      expansionInfo.hasReachableSpot;
    const contestingLongest =
      player.longestRoadLength >= 4 &&
      (state.longestRoadOwnerId !== playerId ||
        player.longestRoadLength <= state.longestRoadLength);

    if (
      difficulty === "easy" ||
      needSpot ||
      contestingLongest ||
      overSafeLimit ||
      bestEdgeScore >= 19
    ) {
      return bestEdgeAct;
    }
  }

  if (buildWalls.length > 0) {
    return buildWalls[0]!;
  }

  if (buyDev && overSafeLimit) {
    return buyDev;
  }

  // Seafarers: Move an open ship if it strictly improves frontier reach or explores Fog!
  const moveShipActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MOVE_SHIP" }> =>
      a.type === "MOVE_SHIP"
  );
  if (moveShipActions.length > 0 && difficulty !== "easy") {
    for (const act of moveShipActions) {
      const fromScore = scoreExpansionEdge(
        state,
        act.fromEdgeId,
        playerId,
        "ship",
        weights,
        scarcity
      );
      const toScore = scoreExpansionEdge(
        state,
        act.toEdgeId,
        playerId,
        "ship",
        weights,
        scarcity
      );
      if (toScore > fromScore + 5) {
        return act;
      }
    }
  }

  // 9g. Master End-of-Turn 7-Discard Shielding!
  // Before passing with > safeLimit cards (51.8% chance of a 7 across 4 rolls!),
  // compress bloated surplus stacks via Maritime trade into scarce City/Settlement cards!
  if (
    difficulty === "master" &&
    overSafeLimit &&
    maritimeTrades.length > 0
  ) {
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
      const offTurnBefore = evaluateHandStrategicValue(
        state,
        player,
        player.resources,
        weights,
        scarcity,
        myProd,
        false
      );
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
    if (bestShieldTrade) return bestShieldTrade;
  }

  // End Turn or End Special Build
  return (
    legalActions.find(
      (a) => a.type === "END_TURN" || a.type === "END_SPECIAL_BUILD"
    ) ?? legalActions[0]!
  );
}
