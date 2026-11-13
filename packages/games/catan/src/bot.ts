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
  getPlayerResourceCount,
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
    setupPipWeight: 3.92,
    setupScarcityWeight: 2.68,
    setupDiversityBonus: 5.15,
    setupNumberSpreadBonus: 2.98,
    setupPairSynergyBonus: 4.95,
    setupHarborBonus: 3.68,
    setupExpansionSpaceWeight: 1.62,
    setupSecondStartHandWeight: 2.95,
    cityPriority: 39.5,
    settlementPriority: 42.0,
    devCardPriority: 20.5,
    roadToSpotPriority: 13.5,
    longestRoadContestBonus: 31.5,
    harbormasterContestBonus: 10.5,
    cityWallPriority: 8.3,
    robberLeaderVpWeight: 8.2,
    robberPipsWeight: 2.95,
    tradeAcceptThreshold: 0.52,
    tradeFairnessRatio: 0.72,
    leaderEmbargoMargin: 3,
    maxDomesticOffersPerTurn: 2,
    sevenDiscardRiskWeight: 1.22,
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
  const totalPips = Object.values(state.hexes).reduce<Record<ResourceType, number>>(
    (acc, h) => {
      const res = TERRAIN_TO_RESOURCE[h.terrain];
      if (!res || !h.numberToken) return acc;
      return {
        ...acc,
        [res]: acc[res] + (NUMBER_TOKEN_PIPS[h.numberToken] ?? 0),
      };
    },
    { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 }
  );

  const avg =
    (totalPips.brick +
      totalPips.lumber +
      totalPips.wool +
      totalPips.grain +
      totalPips.ore) /
      5 || 10;

  return RESOURCES.reduce<Record<ResourceType, number>>(
    (acc, r) => {
      const ratio = avg / Math.max(2.5, totalPips[r]);
      return {
        ...acc,
        [r]: Math.max(0.75, Math.min(2.35, ratio)),
      };
    },
    { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 1 }
  );
}

/**
 * Computes expected resource production pips (out of 36 rolls) for `playerId`.
 */
function computePlayerProductionPips(
  state: CatanState,
  playerId: string,
  ignoreRobber = false
): Record<ResourceType, number> {
  return Object.entries(state.buildings).reduce<Record<ResourceType, number>>(
    (prod, [vId, b]) => {
      if (b.ownerId !== playerId) return prod;
      const mult = b.type === "city" ? 2 : 1;
      const vNode = state.topology.vertices[vId];
      if (!vNode) return prod;
      return vNode.adjacentHexIds.reduce<Record<ResourceType, number>>(
        (inner, hId) => {
          if (!ignoreRobber && hId === state.robberHexId) return inner;
          const tile = state.hexes[hId];
          if (!tile || !tile.numberToken) return inner;
          const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
          const res = TERRAIN_TO_RESOURCE[tile.terrain];
          if (res) {
            return { ...inner, [res]: inner[res] + pips * mult };
          }
          if (tile.terrain === "gold") {
            const goldShare = (pips * mult) / 5;
            return {
              brick: inner.brick + goldShare,
              lumber: inner.lumber + goldShare,
              wool: inner.wool + goldShare,
              grain: inner.grain + goldShare,
              ore: inner.ore + goldShare,
            };
          }
          return inner;
        },
        prod
      );
    },
    { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 }
  );
}

/**
 * Estimates an opponent's true threat VP using strictly public information
 * (visible VP, count of unplayed dev cards, and proximity to Largest Army / Longest Road).
 */
function estimatePublicPlayerThreatVp(
  state: CatanState,
  playerId: string
): number {
  const visible = computePlayerVictoryPoints(state, playerId, true);
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) return visible;
  const unplayedCount = p.devCards.filter((c) => !c.played).length;

  let awardThreat = 0;
  if (
    state.largestArmyOwnerId !== playerId &&
    unplayedCount >= 1 &&
    p.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1)
  ) {
    awardThreat += 0.85;
  }
  if (
    state.longestRoadOwnerId !== playerId &&
    (p.roadsRemaining > 0 || p.shipsRemaining > 0) &&
    p.longestRoadLength + 1 >= Math.max(5, state.longestRoadLength + 1)
  ) {
    awardThreat += 0.7;
  }

  return visible + unplayedCount * 0.34 + awardThreat;
}

/**
 * Determines whether `oppId` must be strictly embargoed from Domestic Trading by `me`.
 * Uses 100% public information (visible VP, unplayed dev card count, and imminent +2/+3 VP awards).
 */
function isOpponentEmbargoedForTrade(
  state: CatanState,
  me: CatanPlayerState,
  oppId: string,
  weights: CatanBotWeights
): boolean {
  if (weights.leaderEmbargoMargin <= 0) return false;
  const opp = state.players.find((p) => p.id === oppId);
  if (!opp) return true;

  const diff = me.botDifficulty ?? "smart";
  const targetVp = state.config.targetVictoryPoints;
  const oppVisibleVp = computePlayerVictoryPoints(state, oppId, true);
  const oppThreatVp = estimatePublicPlayerThreatVp(state, oppId);
  const myVp = computePlayerVictoryPoints(state, me.id, false);

  // 1. Hard visible-VP & threat-VP ceiling near victory (e.g. >= 7 visible VP for Master in 10-VP Catan)
  if (
    oppVisibleVp >= targetVp - weights.leaderEmbargoMargin ||
    oppThreatVp >= targetVp - weights.leaderEmbargoMargin + 0.25
  ) {
    return true;
  }

  if (diff === "easy" || diff === "normal") {
    return false;
  }

  // 2. Smart & Master: embargo solo/clear table leaders in the second half of the game
  if (oppThreatVp >= targetVp - 3.5 && oppThreatVp >= myVp + 1.5) {
    return true;
  }

  if (diff !== "master") {
    return false;
  }

  // 3. Master Public Burst-VP Threat Embargo:
  // Never feed an opponent whose visible VP + unplayed dev cards + 1-step award swing can hit lethal!
  const unplayedDevs = opp.devCards.filter((c) => !c.played).length;
  const canFlipArmyWithOneKnight =
    state.largestArmyOwnerId !== oppId &&
    unplayedDevs >= 1 &&
    opp.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
  const nearLongestAward =
    state.longestRoadOwnerId !== oppId &&
    (opp.roadsRemaining > 0 || opp.shipsRemaining > 0) &&
    opp.longestRoadLength + 1 >= Math.max(5, state.longestRoadLength + 1);
  const oppOpenSettle = getLegalSettlementVertices(state, oppId, false);
  const hasThreeVpSpot = oppOpenSettle.some(
    (vId) =>
      grantsNewIslandBonusVp(state, opp, vId) ||
      (state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== oppId &&
        state.harbors.some((h) => h.vertexIds.includes(vId)) &&
        opp.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1))
  );

  const potentialDevAndArmyVp =
    oppVisibleVp +
    Math.min(4, unplayedDevs) +
    (canFlipArmyWithOneKnight ? 1 : 0);
  if (potentialDevAndArmyVp >= targetVp - 2) {
    return true;
  }

  if (
    oppVisibleVp >= targetVp - 4 &&
    (nearLongestAward || hasThreeVpSpot || canFlipArmyWithOneKnight)
  ) {
    return true;
  }

  // 4. Master Off-Turn Table-Leader Embargo: never help a 6+ threat-VP table leader on THEIR active turn!
  const oppIsActiveTurnPlayer =
    state.players[state.activePlayerIndex]?.id === oppId;
  const maxTableThreat = Math.max(
    0,
    ...state.players
      .filter((p) => p.id !== me.id)
      .map((p) => estimatePublicPlayerThreatVp(state, p.id))
  );
  if (
    oppIsActiveTurnPlayer &&
    oppThreatVp >= targetVp - 4 &&
    oppThreatVp >= maxTableThreat - 0.1 &&
    oppThreatVp > myVp + 0.5
  ) {
    return true;
  }

  return false;
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
 * Computes `oppId`'s remaining Longest Road / Trade Route if an opponent settles on `blockedVertexId`.
 */
function simulateOpponentRouteLengthAfterBlock(
  state: CatanState,
  oppId: string,
  blockedVertexId: string
): number {
  const oppEdges: string[] = [];
  for (const [eId, e] of Object.entries(state.edges)) {
    if (e.ownerId === oppId) {
      oppEdges.push(eId);
    }
  }
  if (oppEdges.length === 0) return 0;

  const blockedVertices = new Set<string>([blockedVertexId]);
  for (const [vId, b] of Object.entries(state.buildings)) {
    if (b.ownerId !== oppId) {
      blockedVertices.add(vId);
    }
  }

  return computeLongestSimpleEdgePath(
    state.topology,
    oppEdges,
    blockedVertices,
    (prevEdgeId, nextEdgeId, sharedVertexId) => {
      const t1 = state.edges[prevEdgeId]?.type ?? null;
      const t2 = state.edges[nextEdgeId]?.type ?? null;
      if (!t1 || !t2) return false;
      if (t1 !== t2) {
        return (
          sharedVertexId !== blockedVertexId &&
          state.buildings[sharedVertexId]?.ownerId === oppId
        );
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
    const greedyResult = Array.from({ length: needed }).reduce<{
      remHand: ResourceMap;
      discard: Partial<ResourceMap>;
    }>(
      (acc) => {
        const best = RESOURCES.reduce<{ res: ResourceType; cnt: number }>(
          (b, r) =>
            acc.remHand[r] > b.cnt ? { res: r, cnt: acc.remHand[r] } : b,
          { res: "wool", cnt: -1 }
        );
        if (best.cnt <= 0) return acc;
        return {
          remHand: {
            ...acc.remHand,
            [best.res]: acc.remHand[best.res] - 1,
          },
          discard: {
            ...acc.discard,
            [best.res]: (acc.discard[best.res] ?? 0) + 1,
          },
        };
      },
      { remHand: { ...player.resources }, discard: {} }
    );
    return { type: "DISCARD_CARDS", resources: greedyResult.discard };
  }

  const scarcity = computeBoardScarcity(state);
  const prod = computePlayerProductionPips(state, player.id);
  const resList = RESOURCES;

  function searchBestDiscard(
    idx: number,
    rem: number,
    partialDiscard: ResourceMap
  ): { bestScore: number; bestDiscard: ResourceMap | null } {
    if (idx === 4) {
      const rLast = resList[4]!;
      if (rem > player.resources[rLast]) {
        return { bestScore: -Infinity, bestDiscard: null };
      }
      const fullDiscard: ResourceMap = { ...partialDiscard, [rLast]: rem };
      const kept: ResourceMap = {
        brick: player.resources.brick - fullDiscard.brick,
        lumber: player.resources.lumber - fullDiscard.lumber,
        wool: player.resources.wool - fullDiscard.wool,
        grain: player.resources.grain - fullDiscard.grain,
        ore: player.resources.ore - fullDiscard.ore,
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
      return { bestScore: score, bestDiscard: fullDiscard };
    }

    const r = resList[idx]!;
    const maxTake = Math.min(rem, player.resources[r]);
    const minTake = Math.max(
      0,
      rem -
        resList
          .slice(idx + 1)
          .reduce<number>((acc, rk) => acc + player.resources[rk], 0)
    );

    return Array.from(
      { length: Math.max(0, maxTake - minTake + 1) },
      (_, offset) => minTake + offset
    ).reduce<{ bestScore: number; bestDiscard: ResourceMap | null }>(
      (acc, take) => {
        const sub = searchBestDiscard(idx + 1, rem - take, {
          ...partialDiscard,
          [r]: take,
        });
        return sub.bestScore > acc.bestScore ? sub : acc;
      },
      { bestScore: -Infinity, bestDiscard: null }
    );
  }

  const solved = searchBestDiscard(0, needed, emptyResources());
  if (solved.bestDiscard) {
    const cleaned = Object.fromEntries(
      RESOURCES.filter((r) => solved.bestDiscard![r] > 0).map((r) => [
        r,
        solved.bestDiscard![r],
      ])
    ) as Partial<ResourceMap>;
    return { type: "DISCARD_CARDS", resources: cleaned };
  }

  return fallbackLegal[0]!;
}

/**
 * Computes all deterministic lethal resource targets reachable on `player`'s current board this turn,
 * including 1-build and 2-build combos (Settlement, City, Longest Road, Foreign Island, Harbormaster, Road+Settlement).
 */
interface LethalResourceTarget {
  cost: ResourceMap;
  directFirstAction?: CatanAction;
}

function buildBoardLethalResourceTargets(
  state: CatanState,
  player: CatanPlayerState,
  currentVp: number,
  targetVp: number
): LethalResourceTarget[] {
  const targets: LethalResourceTarget[] = [];
  const vpNeeded = targetVp - currentVp;
  if (vpNeeded <= 0) return targets;

  const claimsHarbormasterAt = (vId: string): boolean =>
    Boolean(
      state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== player.id &&
        state.harbors.some((h) => h.vertexIds.includes(vId)) &&
        player.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1)
    );

  const neededRoadLen = Math.max(5, state.longestRoadLength + 1);
  const canClaimLongest = state.longestRoadOwnerId !== player.id;

  const openSettlementSpots =
    player.settlementsRemaining > 0
      ? getLegalSettlementVertices(state, player.id, false)
      : [];

  // 1. Single Settlement (+1, +3, or +5 VP)
  for (const vId of openSettlementSpots) {
    let gain = 1;
    if (grantsNewIslandBonusVp(state, player, vId)) gain += 2;
    if (claimsHarbormasterAt(vId)) gain += 2;
    if (gain >= vpNeeded) {
      targets.push({
        cost: { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 },
        directFirstAction: { type: "BUILD_SETTLEMENT", vertexId: vId },
      });
      break;
    }
  }

  // 2. Single City (+1 or +3 VP)
  const mySettlementVertices = Object.entries(state.buildings)
    .filter(([, b]) => b.ownerId === player.id && b.type === "settlement")
    .map(([vId]) => vId);
  if (player.citiesRemaining > 0) {
    for (const vId of mySettlementVertices) {
      const gain = 1 + (claimsHarbormasterAt(vId) ? 2 : 0);
      if (gain >= vpNeeded) {
        targets.push({
          cost: { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 },
          directFirstAction: { type: "BUILD_CITY", vertexId: vId },
        });
        break;
      }
    }
  }

  // 3. Single Road or Ship claiming Longest Road (+2 VP)
  const legalRoads =
    player.roadsRemaining > 0 ? getLegalRoadEdges(state, player.id, null) : [];
  const legalShips =
    state.config.enableSeafarers && player.shipsRemaining > 0
      ? getLegalShipEdges(state, player.id, null)
      : [];

  if (canClaimLongest && vpNeeded <= 2 && player.longestRoadLength + 1 >= neededRoadLen) {
    for (const eId of legalRoads) {
      if (simulateRouteLengthWithEdge(state, player.id, eId, "road") >= neededRoadLen) {
        targets.push({
          cost: { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 },
          directFirstAction: { type: "BUILD_ROAD", edgeId: eId },
        });
        break;
      }
    }
    for (const eId of legalShips) {
      if (simulateRouteLengthWithEdge(state, player.id, eId, "ship") >= neededRoadLen) {
        targets.push({
          cost: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 },
          directFirstAction: { type: "BUILD_SHIP", edgeId: eId },
        });
        break;
      }
    }
  }

  // 4. 1-Hop Road + Settlement (+1 to +5 VP, e.g. Road claims Longest Road +2 AND opens Settlement +1 = +3 VP!)
  if (player.settlementsRemaining > 0 && legalRoads.length > 0 && vpNeeded <= 5) {
    for (const eId of legalRoads) {
      const eNode = state.topology.edges[eId];
      if (!eNode) continue;
      const roadClaimsLongest =
        canClaimLongest &&
        player.longestRoadLength + 1 >= neededRoadLen &&
        simulateRouteLengthWithEdge(state, player.id, eId, "road") >= neededRoadLen;
      for (const vId of [eNode.v1, eNode.v2]) {
        if (state.buildings[vId]) continue;
        const distOk = (state.topology.vertices[vId]?.adjacentVertexIds ?? []).every(
          (nb) => !state.buildings[nb]
        );
        if (!distOk) continue;
        const touchesLand = (state.topology.vertices[vId]?.adjacentHexIds ?? []).some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (!touchesLand) continue;
        let gain = 1 + (roadClaimsLongest ? 2 : 0);
        if (grantsNewIslandBonusVp(state, player, vId)) gain += 2;
        if (claimsHarbormasterAt(vId)) gain += 2;
        if (gain >= vpNeeded) {
          targets.push({
            cost: { brick: 2, lumber: 2, wool: 1, grain: 1, ore: 0 },
            directFirstAction: { type: "BUILD_ROAD", edgeId: eId },
          });
          break;
        }
      }
    }
  }

  // 5. 1-Hop Ship + Settlement in Seafarers (+1 to +5 VP)
  if (player.settlementsRemaining > 0 && legalShips.length > 0 && vpNeeded <= 5) {
    for (const eId of legalShips) {
      const eNode = state.topology.edges[eId];
      if (!eNode) continue;
      const shipClaimsLongest =
        canClaimLongest &&
        player.longestRoadLength + 1 >= neededRoadLen &&
        simulateRouteLengthWithEdge(state, player.id, eId, "ship") >= neededRoadLen;
      for (const vId of [eNode.v1, eNode.v2]) {
        if (state.buildings[vId]) continue;
        const distOk = (state.topology.vertices[vId]?.adjacentVertexIds ?? []).every(
          (nb) => !state.buildings[nb]
        );
        if (!distOk) continue;
        const touchesLand = (state.topology.vertices[vId]?.adjacentHexIds ?? []).some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (!touchesLand) continue;
        let gain = 1 + (shipClaimsLongest ? 2 : 0);
        if (grantsNewIslandBonusVp(state, player, vId)) gain += 2;
        if (claimsHarbormasterAt(vId)) gain += 2;
        if (gain >= vpNeeded) {
          targets.push({
            cost: { brick: 1, lumber: 2, wool: 2, grain: 1, ore: 0 },
            directFirstAction: { type: "BUILD_SHIP", edgeId: eId },
          });
          break;
        }
      }
    }
  }

  // 6. Double City or Settlement + City (+2 VP)
  if (vpNeeded <= 2) {
    if (player.citiesRemaining >= 2 && mySettlementVertices.length >= 2) {
      targets.push({
        cost: { brick: 0, lumber: 0, wool: 0, grain: 4, ore: 6 },
        directFirstAction: {
          type: "BUILD_CITY",
          vertexId: mySettlementVertices[0]!,
        },
      });
    }
    if (
      player.settlementsRemaining >= 1 &&
      player.citiesRemaining >= 1 &&
      openSettlementSpots.length >= 1
    ) {
      targets.push({
        cost: { brick: 1, lumber: 1, wool: 1, grain: 3, ore: 3 },
        directFirstAction: {
          type: "BUILD_SETTLEMENT",
          vertexId: openSettlementSpots[0]!,
        },
      });
    }
  }

  return targets;
}

/**
 * Checks whether `hand` can deterministically afford `cost` right now via 0+ legal Maritime/Port trades,
 * returning `{ reachable, firstPortTrade }` in O(5) time.
 */
function checkHandPortConvertibleToCost(
  state: CatanState,
  ratios: Record<ResourceType, number>,
  hand: ResourceMap,
  cost: ResourceMap
): {
  reachable: boolean;
  missingCount: number;
  firstGive?: ResourceType;
  firstReceive?: ResourceType;
} {
  let missingCount = 0;
  let convertibleTrades = 0;
  let firstReceive: ResourceType | undefined;
  let firstGive: ResourceType | undefined;
  let bestGiveRatio = 99;

  for (const r of RESOURCES) {
    const req = cost[r];
    if (hand[r] < req) {
      const need = req - hand[r];
      if (state.bank[r] < need) {
        return { reachable: false, missingCount: 99 };
      }
      missingCount += need;
      if (!firstReceive) firstReceive = r;
    } else if (hand[r] > req) {
      const spare = hand[r] - req;
      const bundles = Math.floor(spare / ratios[r]);
      if (bundles > 0) {
        convertibleTrades += bundles;
        if (ratios[r] < bestGiveRatio) {
          bestGiveRatio = ratios[r];
          firstGive = r;
        }
      }
    }
  }

  return {
    reachable: convertibleTrades >= missingCount,
    missingCount,
    firstGive,
    firstReceive,
  };
}

function canHandWinThisTurnDeterministically(
  state: CatanState,
  player: CatanPlayerState,
  hand: ResourceMap
): boolean {
  const currentVp = computePlayerVictoryPoints(state, player.id, false);
  const targetVp = state.config.targetVictoryPoints;
  if (currentVp >= targetVp) return true;
  if (currentVp < targetVp - 5) return false;

  const ratios = getPlayerTradeRatios(state, player.id);
  const targets = buildBoardLethalResourceTargets(
    state,
    player,
    currentVp,
    targetVp
  );
  for (const t of targets) {
    if (checkHandPortConvertibleToCost(state, ratios, hand, t.cost).reachable) {
      return true;
    }
  }
  return false;
}

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
  if (!hasResources(responder.resources, offer.want)) return false;

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
    if (afterTotalCards > safeLimit && giveTotalReceivedByMe > wantTotalGivenByMe) {
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
    const wantsDevRes =
      wantsCityRes || (offer.want.wool ?? 0) > 0;

    // Rational active-turn proposers ask for the exact bottleneck card that completes a City/Settlement/Dev Card right now!
    let inferredBuildUnlock = 0;
    if (propHasSettlement && proposer.citiesRemaining > 0 && wantsCityRes) {
      if (propAfterCards >= 5) inferredBuildUnlock = Math.max(inferredBuildUnlock, 6.8);
      else if (propAfterCards === 4) inferredBuildUnlock = Math.max(inferredBuildUnlock, 3.4);
    }
    if (propHasOpenSpot && wantsSettleRes) {
      if (propAfterCards >= 4) inferredBuildUnlock = Math.max(inferredBuildUnlock, 5.8);
      else if (propAfterCards === 3) inferredBuildUnlock = Math.max(inferredBuildUnlock, 2.8);
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
 *   3) Strict near-victory embargo (`isOpponentEmbargoedForTrade`), only allowing an embargoed trade if it deterministically wins on this turn!
 *   4) 2-for-1 surplus sweetener when 1-for-1 is declined and port rate is >= 3:1!
 */
function findStrategicDomesticTradeOffer(
  state: CatanState,
  player: CatanPlayerState,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  _prod: Record<ResourceType, number>
): CatanAction | null {
  if (weights.maxDomesticOffersPerTurn <= 0) return null;
  if (state.activeTradeOffer) return null;

  const diff = player.botDifficulty ?? "smart";
  const history = getTurnDomesticTradeHistory(state, player.id);
  if (history.count >= weights.maxDomesticOffersPerTurn) return null;

  const cardHoldingOpponents = state.players.filter(
    (p) => p.id !== player.id && getPlayerResourceCount(p) > 0
  );
  if (cardHoldingOpponents.length === 0) return null;

  const eligibleOpponents = cardHoldingOpponents.filter(
    (p) => !isOpponentEmbargoedForTrade(state, player, p.id, weights)
  );
  const onlyLethalTradesAllowed = eligibleOpponents.length === 0;
  if (onlyLethalTradesAllowed && diff !== "master") {
    return null;
  }

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
      priority: weights.cityPriority + 4,
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

  const desirePool =
    eligibleOpponents.length > 0 ? eligibleOpponents : cardHoldingOpponents;
  const oppLackDesire: Record<ResourceType, number> = emptyResources();
  if (diff === "master") {
    for (const opp of desirePool) {
      const oProd = computePlayerProductionPips(state, opp.id);
      for (const r of RESOURCES) {
        oppLackDesire[r] += oProd[r] === 0 ? 2.0 : 2.5 / (oProd[r] + 2);
      }
    }
  }

  const anyExcludedOpponent =
    eligibleOpponents.length > 0 &&
    eligibleOpponents.length < cardHoldingOpponents.length;

  for (const target of candidateTargets.sort((a, b) => b.priority - a.priority)) {
    const rawDeficit = countResourceDeficit(player.resources, target.cost);
    if (rawDeficit === 0) continue;

    if (rawDeficit > 2 || (rawDeficit === 2 && diff !== "master")) continue;

    let wantRes: ResourceType | null = null;
    const reservedForPort: ResourceMap = emptyResources();

    if (rawDeficit === 1) {
      wantRes =
        RESOURCES.find(
          (r) => player.resources[r] < (target.cost[r] ?? 0)
        ) ?? null;
    } else {
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
        const scoreA = spareA * 1.1 + oppLackDesire[a] * 0.9 - scarcity[a] * 1.2;
        const scoreB = spareB * 1.1 + oppLackDesire[b] * 0.9 - scarcity[b] * 1.2;
        return scoreB - scoreA;
      }
      if (spareB !== spareA) return spareB - spareA;
      return scarcity[a] - scarcity[b];
    });

    if (spareResources.length === 0) continue;

    // When only 1 non-embargoed opponent holds cards, target them directly; when >=2 safe opponents exist,
    // broadcast `null` so all safe opponents can accept and `CONFIRM_DOMESTIC_TRADE` enforces the embargo!
    const safePartnerId =
      anyExcludedOpponent && eligibleOpponents.length === 1
        ? eligibleOpponents[0]!.id
        : null;

    for (const giveRes of spareResources) {
      const spareAmt =
        player.resources[giveRes] -
        (target.cost[giveRes] ?? 0) -
        reservedForPort[giveRes];

      const give1: Partial<ResourceMap> = { [giveRes]: 1 };
      const want1: Partial<ResourceMap> = { [wantRes]: 1 };
      const sig1 = makeOfferSignature(give1, want1);
      if (!history.seenSignatures.has(sig1)) {
        const simAfter1: ResourceMap = {
          ...player.resources,
          [giveRes]: player.resources[giveRes] - 1,
          [wantRes]: player.resources[wantRes] + 1,
        };
        if (
          !onlyLethalTradesAllowed ||
          canHandWinThisTurnDeterministically(state, player, simAfter1)
        ) {
          return {
            type: "OFFER_DOMESTIC_TRADE",
            toPlayerId: safePartnerId,
            give: give1,
            want: want1,
          };
        }
      }

      if (diff === "master" && spareAmt >= 2 && ratios[giveRes] >= 3) {
        const give2: Partial<ResourceMap> = { [giveRes]: 2 };
        const want2: Partial<ResourceMap> = { [wantRes]: 1 };
        const sig2 = makeOfferSignature(give2, want2);
        if (!history.seenSignatures.has(sig2)) {
          const simAfter2: ResourceMap = {
            ...player.resources,
            [giveRes]: player.resources[giveRes] - 2,
            [wantRes]: player.resources[wantRes] + 1,
          };
          if (
            !onlyLethalTradesAllowed ||
            canHandWinThisTurnDeterministically(state, player, simAfter2)
          ) {
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
  }

  return null;
}

/**
 * Scores candidate edges for road or ship expansion, including road-race urgency and exact Longest Route swings.
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
      const vNode = state.topology.vertices[vId]!;
      const distRuleOk = vNode.adjacentVertexIds.every(
        (adjV) => !state.buildings[adjV]
      );
      if (distRuleOk) {
        const touchesLand = vNode.adjacentHexIds.some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (touchesLand) {
          const vScore = evaluateVertexScore(
            state,
            vId,
            playerId,
            weights,
            scarcity
          );
          score += 12.5 + vScore * 0.58;

          // Master Road-Race Detection: prioritize claiming contested high-value vertices before an opponent plows us!
          if (diff === "master" && !state.phase.startsWith("SETUP_") && vScore >= 16) {
            const oppTouchesDirectly = vNode.incidentEdgeIds.some((incE) => {
              const owner = state.edges[incE]?.ownerId;
              return owner && owner !== playerId;
            });
            const oppOneHopAway =
              !oppTouchesDirectly &&
              vNode.adjacentVertexIds.some((adjV) =>
                (state.topology.vertices[adjV]?.incidentEdgeIds ?? []).some(
                  (incE) => {
                    const owner = state.edges[incE]?.ownerId;
                    return owner && owner !== playerId;
                  }
                )
              );
            if (oppTouchesDirectly) {
              const setDef = countResourceDeficit(
                player.resources,
                BUILDING_COSTS.settlement
              );
              score += setDef <= 1 ? 13 : setDef === 2 ? 5 : 0;
            } else if (oppOneHopAway) {
              score += 9.5;
            }
          }
        }
      } else if (diff === "smart" || diff === "master") {
        for (const hopV of vNode.adjacentVertexIds) {
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
        score += weights.longestRoadContestBonus * 2.05;
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
          score += weights.longestRoadContestBonus * 0.95;
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
 * Checks if `player` has a 1-step OR multi-step deterministic lethal win on the current turn!
 * Covers direct builds, Largest Army, Longest Road, Maritime/Port Trade -> Lethal,
 * Year of Plenty -> Lethal, Monopoly (public bank deduction) -> Lethal, and Road Building -> Lethal.
 */
function findImmediateWinningAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  currentVp: number,
  targetVp: number
): CatanAction | null {
  // 1. Direct 1-action Settlement or City win
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
  const neededLen = Math.max(5, state.longestRoadLength + 1);
  if (currentVp + 2 >= targetVp && state.longestRoadOwnerId !== player.id) {
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

  // 4. Master Multi-Step Deterministic Turn Lethal Solver
  if ((player.botDifficulty ?? "smart") !== "master" || currentVp < targetVp - 5) {
    return null;
  }

  const ratios = getPlayerTradeRatios(state, player.id);
  const lethalTargets = buildBoardLethalResourceTargets(
    state,
    player,
    currentVp,
    targetVp
  );
  const maritimeTrades = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
      a.type === "MARITIME_TRADE"
  );

  // 4a. Already holding (or port-convertible to) a multi-step lethal target (e.g. Road + Settlement or Port Trade -> City)
  for (const lt of lethalTargets) {
    const conv = checkHandPortConvertibleToCost(
      state,
      ratios,
      player.resources,
      lt.cost
    );
    if (!conv.reachable) continue;
    if (conv.missingCount === 0 && lt.directFirstAction) {
      const isLegalNow = legalActions.some(
        (a) =>
          a.type === lt.directFirstAction!.type &&
          JSON.stringify(a) === JSON.stringify(lt.directFirstAction)
      );
      if (isLegalNow) return lt.directFirstAction;
    } else if (conv.missingCount > 0 && conv.firstGive && conv.firstReceive) {
      const mTrade = maritimeTrades.find(
        (t) => t.give === conv.firstGive && t.receive === conv.firstReceive
      );
      if (mTrade) return mTrade;
    }
  }

  if (state.phase !== "MAIN_PHASE") return null;

  // 4b. Year of Plenty -> (+ optional Port Trade) -> Lethal Build!
  const yopActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_YEAR_OF_PLENTY" }> =>
      a.type === "PLAY_YEAR_OF_PLENTY"
  );
  for (const act of yopActions) {
    const simHand: ResourceMap = { ...player.resources };
    simHand[act.resource1] += 1;
    simHand[act.resource2] += 1;
    for (const lt of lethalTargets) {
      if (checkHandPortConvertibleToCost(state, ratios, simHand, lt.cost).reachable) {
        return act;
      }
    }
  }

  // 4c. Monopoly (using 100% public bank supply deduction) -> (+ optional Port Trade) -> Lethal Build!
  const monoActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_MONOPOLY" }> =>
      a.type === "PLAY_MONOPOLY"
  );
  if (monoActions.length > 0) {
    const isExpanded =
      state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
    const totalSupplyPerRes = isExpanded ? 24 : 19;
    for (const act of monoActions) {
      const oppCount = Math.max(
        0,
        totalSupplyPerRes -
          state.bank[act.resource] -
          player.resources[act.resource]
      );
      if (oppCount <= 0) continue;
      const simHand: ResourceMap = {
        ...player.resources,
        [act.resource]: player.resources[act.resource] + oppCount,
      };
      for (const lt of lethalTargets) {
        if (checkHandPortConvertibleToCost(state, ratios, simHand, lt.cost).reachable) {
          return act;
        }
      }
    }
  }

  // 4d. Road Building Dev Card -> 2 free roads/ships claiming Longest Road (+2 VP) or reaching Settlement spot!
  const playRoadBuild = legalActions.find(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  if (playRoadBuild) {
    if (
      currentVp + 2 >= targetVp &&
      state.longestRoadOwnerId !== player.id &&
      player.longestRoadLength + 2 >= neededLen
    ) {
      const legalR =
        player.roadsRemaining > 0 ? getLegalRoadEdges(state, player.id, null) : [];
      for (const e1 of legalR) {
        const len1 = simulateRouteLengthWithEdge(state, player.id, e1, "road");
        if (len1 >= neededLen) return playRoadBuild;
        if (player.roadsRemaining >= 2 && len1 >= neededLen - 1) {
          const eNode1 = state.topology.edges[e1];
          if (!eNode1) continue;
          for (const vId of [eNode1.v1, eNode1.v2]) {
            if (state.buildings[vId] && state.buildings[vId]!.ownerId !== player.id) {
              continue;
            }
            for (const e2 of state.topology.vertices[vId]?.incidentEdgeIds ?? []) {
              if (e2 === e1 || state.edges[e2]) continue;
              const touchesSeaOnly = (
                state.topology.edges[e2]?.adjacentHexIds ?? []
              ).every((hId) => state.hexes[hId]?.terrain === "sea");
              if (!touchesSeaOnly) return playRoadBuild;
            }
          }
        }
      }
    }
    if (
      player.settlementsRemaining > 0 &&
      checkHandPortConvertibleToCost(
        state,
        ratios,
        player.resources,
        { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 }
      ).reachable
    ) {
      const legalR =
        player.roadsRemaining > 0 ? getLegalRoadEdges(state, player.id, null) : [];
      for (const e1 of legalR) {
        const eNode = state.topology.edges[e1];
        if (!eNode) continue;
        for (const vId of [eNode.v1, eNode.v2]) {
          if (state.buildings[vId]) continue;
          const distOk = (
            state.topology.vertices[vId]?.adjacentVertexIds ?? []
          ).every((nb) => !state.buildings[nb]);
          const touchesLand = (
            state.topology.vertices[vId]?.adjacentHexIds ?? []
          ).some((hId) => state.hexes[hId]?.terrain !== "sea");
          if (!distOk || !touchesLand) continue;
          const gain = 1 + (grantsNewIslandBonusVp(state, player, vId) ? 2 : 0);
          if (currentVp + gain >= targetVp) return playRoadBuild;
        }
      }
    }
  }

  return null;
}

/**
 * Full Snake-Draft Rollout Search for Master's 1st Settlement (`SETUP_SETTLEMENT_1`).
 * Simulates subsequent opponents' snake-draft picks (`i+1..N-1`, `N-1..i+1`) to evaluate the
 * exact surviving 2nd-settlement pair `(v1, v2)` + full empire OWS/Road-Settlement coherence!
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
  const topCandidates = scored.slice(0, Math.min(10, scored.length));

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

  return topCandidates.reduce<{ act: CatanAction; bestCombined: number }>(
    (best, cand) => {
      const initialBuildings: CatanState["buildings"] = {
        ...state.buildings,
        [cand.act.vertexId]: { ownerId: playerId, type: "settlement" },
      };

      const isOpenIn = (
        buildings: CatanState["buildings"],
        vId: string
      ): boolean =>
        !buildings[vId] &&
        state.topology.vertices[vId]!.adjacentVertexIds.every(
          (nb) => !buildings[nb]
        );

      const postSnakeBuildings = snakeSteps.reduce<CatanState["buildings"]>(
        (curBuildings, step) => {
          const stepState: CatanState = {
            ...state,
            buildings: curBuildings,
            phase: step.phase,
          };
          const oppPick = legalPool.reduce<{
            vId: string | null;
            score: number;
          }>(
            (oppBest, vId) => {
              if (!isOpenIn(curBuildings, vId)) return oppBest;
              const os = evaluateVertexScore(
                stepState,
                vId,
                step.oppId,
                CATAN_BOT_WEIGHTS.smart,
                scarcity
              );
              return os > oppBest.score ? { vId, score: os } : oppBest;
            },
            { vId: null, score: -Infinity }
          );
          return oppPick.vId
            ? {
                ...curBuildings,
                [oppPick.vId]: { ownerId: step.oppId, type: "settlement" },
              }
            : curBuildings;
        },
        initialBuildings
      );

      const secondRoundState: CatanState = {
        ...state,
        buildings: postSnakeBuildings,
        phase: "SETUP_SETTLEMENT_2",
      };

      const secondPick = legalPool.reduce<{ vId: string | null; score: number }>(
        (myBest, vId) => {
          if (!isOpenIn(postSnakeBuildings, vId)) return myBest;
          const s2 = evaluateVertexScore(
            secondRoundState,
            vId,
            playerId,
            weights,
            scarcity
          );
          return s2 > myBest.score ? { vId, score: s2 } : myBest;
        },
        { vId: null, score: -20 }
      );

      const empireSynergy = secondPick.vId
        ? (() => {
            const pairPips = [cand.act.vertexId, secondPick.vId].reduce<ResourceMap>(
              (pipsAcc, sv) =>
                (state.topology.vertices[sv]?.adjacentHexIds ?? []).reduce<ResourceMap>(
                  (inner, hId) => {
                    const tile = state.hexes[hId];
                    const res = tile ? TERRAIN_TO_RESOURCE[tile.terrain] : null;
                    if (!res || !tile?.numberToken) return inner;
                    return {
                      ...inner,
                      [res]:
                        inner[res] + (NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0),
                    };
                  },
                  pipsAcc
                ),
              emptyResources()
            );
            return (
              (pairPips.ore >= 4 && pairPips.grain >= 4 ? 3.2 : 0) +
              (pairPips.brick >= 4 && pairPips.lumber >= 4 && pairPips.grain >= 3
                ? 2.2
                : 0) -
              (pairPips.ore >= 4 && pairPips.grain === 0 ? 4.0 : 0)
            );
          })()
        : 0;

      const combined = cand.s1 * 0.56 + secondPick.score * 0.58 + empireSynergy;
      return combined > best.bestCombined
        ? { act: cand.act, bestCombined: combined }
        : best;
    },
    { act: topCandidates[0]!.act, bestCombined: -Infinity }
  ).act;
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

  // 0b. Selecting partner (or cancelling) after players respond to our own Domestic Trade offer
  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    state.activeTradeOffer.fromPlayerId === playerId
  ) {
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

      const offer = state.activeTradeOffer;
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

  // 5. Pre-Roll: Play Knight BEFORE rolling ONLY if our producing hex/ship is blocked OR claiming Largest Army wins immediately!
  // Rolling first when unblocked is strictly superior: avoids stealing into 8+ cards before a 7-roll, and preserves Knights if a 7 is rolled!
  if (state.phase === "PRE_ROLL") {
    const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
    if (playKnight && difficulty !== "easy") {
      const robberHNode = state.topology.hexes[state.robberHexId];
      const robberTile = state.hexes[state.robberHexId];
      const touchesMyPiece = Boolean(
        robberTile?.numberToken &&
          robberHNode?.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === playerId
          )
      );
      const pirateHNode = state.pirateHexId
        ? state.topology.hexes[state.pirateHexId]
        : null;
      const pirateBlocksShip = Boolean(
        pirateHNode?.sideEdgeIds.some(
          (eId) => state.edges[eId]?.ownerId === playerId
        )
      );
      const claimsArmyNow =
        state.largestArmyOwnerId !== playerId &&
        player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
      const myVpNow = computePlayerVictoryPoints(state, playerId, false);
      const claimsArmyLethalNow =
        claimsArmyNow && myVpNow + 2 >= state.config.targetVictoryPoints;

      if (difficulty === "master") {
        const myCardCount = totalResourceCount(player.resources);
        const mySafe = getPlayerSafeHandLimit(state, playerId);
        const blockedPips = robberTile?.numberToken
          ? (NUMBER_TOKEN_PIPS[robberTile.numberToken] ?? 0)
          : 0;
        // Avoid turning exactly `safeLimit` (7) cards into 8 right before rolling unless unblocking a high-pip hex!
        const safeToStealPreRoll = myCardCount !== mySafe || blockedPips >= 4;
        if (
          claimsArmyLethalNow ||
          pirateBlocksShip ||
          (touchesMyPiece && safeToStealPreRoll)
        ) {
          return playKnight;
        }
      } else {
        const armyRace =
          difficulty === "smart"
            ? claimsArmyNow || player.knightsPlayed >= 2
            : false;
        if (touchesMyPiece || pirateBlocksShip || armyRace) {
          return playKnight;
        }
      }
    }
    return legalActions.find((a) => a.type === "ROLL_DICE") ?? legalActions[0]!;
  }

  // 6. Move Robber or Pirate: steep endgame leader lockdown, sole-source bottleneck paralysis, & steal EV!
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

    const targetVpRob = state.config.targetVictoryPoints;
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
            const oppPlayer = state.players.find((p) => p.id === b.ownerId)!;
            const oppVisibleVp = computePlayerVictoryPoints(state, b.ownerId, true);
            const oppThreat = estimatePublicPlayerThreatVp(state, b.ownerId);
            const oppCards = getPlayerResourceCount(oppPlayer);

            // Steep endgame multiplier when an opponent is close to victory!
            let endgameUrgency = 1.0;
            if (difficulty === "master") {
              if (oppVisibleVp >= targetVpRob - 1 || oppThreat >= targetVpRob - 0.8) {
                endgameUrgency = 2.6;
              } else if (
                oppVisibleVp >= targetVpRob - 2 ||
                oppThreat >= targetVpRob - 1.8
              ) {
                endgameUrgency = 1.95;
              } else if (
                oppVisibleVp >= targetVpRob - 3 ||
                oppThreat >= targetVpRob - 2.8
              ) {
                endgameUrgency = 1.45;
              } else if (oppVisibleVp <= 3 && state.turn >= 16) {
                endgameUrgency = 0.65;
              }
            }

            hexScore +=
              (oppThreat * weights.robberLeaderVpWeight * endgameUrgency +
                pips * 1.4) *
              mult;

            // Master bottleneck check: paralyzing an opponent's ONLY source of Ore/Grain/Brick!
            if (difficulty === "master" && res && pips > 0) {
              const oProd = oppProdCache.get(b.ownerId);
              if (oProd && oProd[res] <= pips * mult) {
                hexScore += 10.0 * scMult * mult * Math.min(1.6, endgameUrgency);
              }
            }

            if (oppCards > 0) {
              bestVictimBonus = Math.max(
                bestVictimBonus,
                7 + Math.min(6, oppCards) + oppThreat * 1.15 * endgameUrgency
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

  // 7. Steal Resource: target highest-threat victim + expected build-completing card value!
  if (state.phase === "STEAL_RESOURCE") {
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    const baseHandVal =
      difficulty === "master"
        ? evaluateHandStrategicValue(
            state,
            player,
            player.resources,
            weights,
            scarcity,
            myProd,
            true
          )
        : 0;

    for (const act of legalActions) {
      if (act.type === "STEAL_FROM_PLAYER") {
        const victim = state.players.find((p) => p.id === act.victimId)!;
        const victimVisVp = computePlayerVictoryPoints(state, victim.id, true);
        const threat = estimatePublicPlayerThreatVp(state, victim.id);
        const endgameMult =
          difficulty === "master" &&
          victimVisVp >= state.config.targetVictoryPoints - 3
            ? 1.55
            : 1.0;
        let s =
          threat * weights.robberLeaderVpWeight * endgameMult +
          Math.min(5, getPlayerResourceCount(victim));
        if (difficulty === "master") {
          const vProd = computePlayerProductionPips(state, victim.id, true);
          const vTotal =
            RESOURCES.reduce((acc, r) => acc + vProd[r], 0) || 1;
          for (const r of RESOURCES) {
            const prob = vProd[r] / vTotal;
            if (prob <= 0) continue;
            const hypoHand: ResourceMap = {
              ...player.resources,
              [r]: player.resources[r] + 1,
            };
            const handDelta = Math.max(
              0,
              evaluateHandStrategicValue(
                state,
                player,
                hypoHand,
                weights,
                scarcity,
                myProd,
                true
              ) - baseHandVal
            );
            s += prob * (handDelta * 1.4 + (myProd[r] === 0 ? 4.5 * scarcity[r] : 1.5 * scarcity[r]));
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

  // 9a. Immediate & Multi-Step Deterministic Turn Lethal Scanner
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
  const myCitiesCount = Object.values(state.buildings).filter(
    (b) => b.ownerId === playerId && b.type === "city"
  ).length;

  // 9b. Score Settlements vs Cities (including Foreign Island +2 VP, Harbormaster +2 VP, Exact Road-Break, & Early City Engine!)
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
          if (difficulty === "master") {
            const oppPlayer = state.players.find((p) => p.id === oppId)!;
            const afterLen = simulateOpponentRouteLengthAfterBlock(
              state,
              oppId,
              act.vertexId
            );
            const drop = Math.max(0, oppPlayer.longestRoadLength - afterLen);
            const stripsAward =
              state.longestRoadOwnerId === oppId && afterLen < 5;
            roadBreakBonus +=
              (stripsAward ? 42 : state.longestRoadOwnerId === oppId ? 30 : 12) +
              drop * 3.5;
          } else {
            roadBreakBonus += state.longestRoadOwnerId === oppId ? 30 : 14;
          }
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
    let totalVertexPips = 0;
    let hasOreOrGrainOnVertex = false;
    for (const hId of vNode.adjacentHexIds) {
      if (hId === state.robberHexId) continue;
      const tile = state.hexes[hId];
      if (!tile?.numberToken) continue;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      totalVertexPips += pips;
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      if (res === "ore" || res === "grain") hasOreOrGrainOnVertex = true;
      const sc = res ? scarcity[res] : 1.45;
      const cityBias = res === "ore" || res === "grain" ? 1.32 : 1.0;
      prodGain += pips * 2.9 * sc * cityBias;
    }
    const harborBonus =
      state.config.enableHarbormaster &&
      state.harbors.some((h) => h.vertexIds.includes(act.vertexId))
        ? weights.harbormasterContestBonus * 0.95
        : 0;
    const freePieceBonus = player.settlementsRemaining === 0 ? 15 : 0;
    // Early City Snowball: 1st/2nd City on a strong Ore/Grain vertex supercharges velocity for the rest of the game!
    const earlyEngineBonus =
      difficulty === "master" &&
      myCitiesCount < 2 &&
      hasOreOrGrainOnVertex &&
      totalVertexPips >= 8
        ? 9.5
        : 0;
    const totalC =
      weights.cityPriority +
      prodGain +
      harborBonus +
      freePieceBonus +
      earlyEngineBonus;
    if (totalC > bestBuildScore) {
      bestBuildScore = totalC;
      bestBuildAction = act;
    }
  }

  if (bestBuildAction) {
    return bestBuildAction;
  }

  // 9c. Play Development Cards: Master evaluates ALL playable Dev Cards on a unified EV scale
  // (since Catan allows at most 1 Dev Card play per turn!)
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
      const isExpanded =
        state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
      const totalSupplyPerRes = isExpanded ? 24 : 19;
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
          checkHandPortConvertibleToCost(
            state,
            ratiosNow,
            simHand,
            { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 }
          ).reachable;
        const unlocksSettleNow =
          hasOpenSettleNow &&
          checkHandPortConvertibleToCost(
            state,
            ratiosNow,
            simHand,
            { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 }
          ).reachable;
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
          checkHandPortConvertibleToCost(
            state,
            ratiosNow,
            simHand,
            { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 }
          ).reachable
        ) {
          unlockBonus = 28;
        } else if (
          hasOpenSettleNow &&
          checkHandPortConvertibleToCost(
            state,
            ratiosNow,
            simHand,
            { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 }
          ).reachable
        ) {
          unlockBonus = 26;
        } else if (
          player.settlementsRemaining > 0 &&
          player.roadsRemaining > 0 &&
          !hasOpenSettleNow &&
          checkHandPortConvertibleToCost(
            state,
            ratiosNow,
            simHand,
            { brick: 2, lumber: 2, wool: 1, grain: 1, ore: 0 }
          ).reachable
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
        16 +
        (claimsArmyNow ? 34 : player.knightsPlayed >= 1 ? 7 : 0);
      if (knightScore > bestDevScore) {
        bestDevScore = knightScore;
        bestDevPlay = playKnight;
      }
    }

    if (bestDevPlay) return bestDevPlay;
  } else {
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
  }

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

        // Evaluate strictly in strategic build-value order (City > Open Settlement > Longest-Road Edge > Road+Settlement > Dev Card)!
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
  const myTotalCards = totalResourceCount(player.resources);
  const overSafeLimit = myTotalCards > safeLimit;

  // Master priority: if a high-EV Road/Ship claims Longest Route (+2 VP), opens a Foreign Island (+2 VP),
  // reveals Fog (+1 free card), or wins an urgent road race (`bestEdgeScore >= 32`), take it BEFORE buying a Dev Card!
  if (difficulty === "master" && bestEdgeAct && bestEdgeScore >= 32) {
    return bestEdgeAct;
  }

  if (buyDev) {
    const hasSettlementToUpgrade =
      player.citiesRemaining > 0 &&
      Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "settlement"
      );
    const cityDeficit = countResourceDeficit(
      player.resources,
      BUILDING_COSTS.city
    );
    const savingForImminentCity =
      (difficulty === "master" || difficulty === "smart") &&
      hasSettlementToUpgrade &&
      cityDeficit === 1 &&
      !overSafeLimit;

    // Master First-City Engine Protection: don't burn `2 Ore + 1 Grain` (or `2 Grain + 1 Ore`) on a premature Dev Card
    // when we have 0 Cities yet, good Ore/Grain income, and low 7-discard risk!
    const savingForFirstCityEngine =
      difficulty === "master" &&
      hasSettlementToUpgrade &&
      myCitiesCount === 0 &&
      cityDeficit === 2 &&
      (player.resources.ore >= 2 || player.resources.grain >= 2) &&
      myProd.ore + myProd.grain >= 5 &&
      myTotalCards <= safeLimit - 2;

    const myBuildingCount = Object.values(state.buildings).filter(
      (b) => b.ownerId === playerId
    ).length;
    const savingForOpenSettlement =
      difficulty === "master" &&
      myBuildingCount <= 3 &&
      expansionInfo.immediateVertices.length > 0 &&
      countResourceDeficit(player.resources, BUILDING_COSTS.settlement) === 1 &&
      !overSafeLimit;

    if (
      !savingForImminentCity &&
      !savingForFirstCityEngine &&
      !savingForOpenSettlement
    ) {
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
