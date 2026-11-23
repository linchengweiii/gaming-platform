import type { CatanBotWeights } from "../config/bot-config.ts";
import { TERRAIN_TO_COMMODITY } from "../config/cities-knights-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import {
  emptyResources,
  getPlayerTradeRatios,
  totalResourceCount,
} from "../rules/helpers.ts";
import { RESOURCES, type ResourceType } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import {
  computePlayerProductionPips,
  grantsNewIslandBonusVp,
} from "./utils.ts";

/**
 * Scores a candidate settlement vertex during Setup or Main Phase.
 */
export function evaluateVertexScore(
  state: CatanState,
  vertexId: string,
  playerId: string,
  weights: CatanBotWeights,
  boardScarcity: Record<ResourceType, number>
): number {
  const vNode = state.topology.vertices[vertexId];
  if (!vNode) return -999;

  const player = state.players.find((p) => p.id === playerId);
  const isMaster = player?.botDifficulty === "master";
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
              : state.config.enableCitiesAndKnights
                ? 1.08
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
  if (
    state.config.enableSeafarers &&
    state.phase.startsWith("SETUP_") &&
    touchesSea
  ) {
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
    if (
      !hasBrick &&
      !hasLumber &&
      !(state.config.enableSeafarers && hasWool && hasLumber)
    ) {
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

  // Cities & Knights: 2nd setup building is a City! Weight commodity production (Forest->Paper, Mountains->Coin, Pasture->Cloth) heavily!
  if (
    state.config.enableCitiesAndKnights &&
    state.phase === "SETUP_SETTLEMENT_2"
  ) {
    for (const hId of vNode.adjacentHexIds) {
      const tile = state.hexes[hId];
      if (!tile?.numberToken) continue;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      const comm = TERRAIN_TO_COMMODITY[tile.terrain];
      if (comm === "paper") {
        // Science -> Aqueduct (Lv 3) is the strongest C&K engine!
        score += pips * 2.25;
      } else if (comm === "coin") {
        score += pips * 1.95;
      } else if (comm === "cloth") {
        score += pips * 1.75;
      }
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
