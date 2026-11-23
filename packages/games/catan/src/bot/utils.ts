import { TERRAIN_TO_COMMODITY } from "../config/cities-knights-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getCatanPlayerViewPure } from "../rules/redaction.ts";
import {
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

/**
 * Computes relative board-wide scarcity multipliers (>= 0.75, <= 2.35) for each resource.
 */
export function computeBoardScarcity(
  state: CatanState
): Record<ResourceType, number> {
  const totalPips = Object.values(state.hexes).reduce<
    Record<ResourceType, number>
  >(
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
export function computePlayerProductionPips(
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
export function estimatePublicPlayerThreatVp(
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

  if (state.config.enableCitiesAndKnights) {
    const progressCount = getOpponentProgressCardCountFair(p);
    const metroRaceBonus = IMPROVEMENT_DISCIPLINES.some(
      (d) => p.cityImprovements[d] === 3 && state.metropolises[d].ownerId === null
    )
      ? 0.9
      : 0;
    return visible + progressCount * 0.25 + awardThreat + metroRaceBonus;
  }

  return visible + unplayedCount * 0.34 + awardThreat;
}

/**
 * Checks whether building a settlement on `vertexId` awards +2 Foreign Island Bonus VP in Seafarers.
 */
export function grantsNewIslandBonusVp(
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
 * Redacts hidden deck order, fog pool, RNG seed, and opponent hands so direct calls
 * to `chooseCatanBotAction` are 100% fair even if the caller passes an unredacted state.
 */
export function redactStateForBotPlayerPure(
  state: CatanState,
  viewerPlayerId: string
): CatanState {
  return getCatanPlayerViewPure(state, viewerPlayerId);
}

export function getOpponentProgressCardCountFair(
  opp: CatanPlayerState
): number {
  return typeof opp.hiddenProgressCardCount === "number"
    ? opp.hiddenProgressCardCount
    : opp.progressCards.length;
}

export function getVertexResourcePipScore(
  state: CatanState,
  vertexId: string,
  isCity: boolean
): number {
  const vNode = state.topology.vertices[vertexId];
  if (!vNode) return 0;
  let score = 0;
  for (const hId of vNode.adjacentHexIds) {
    const h = state.hexes[hId];
    if (!h || !h.numberToken) continue;
    const pips = NUMBER_TOKEN_PIPS[h.numberToken] ?? 0;
    const res = TERRAIN_TO_RESOURCE[h.terrain];
    const comm = TERRAIN_TO_COMMODITY[h.terrain];
    if (h.terrain === "gold") {
      score += pips * (isCity ? 3.2 : 1.7);
    } else if (res) {
      const mult = res === "ore" || res === "grain" ? 1.24 : 1.0;
      score += pips * mult * (isCity ? 2.0 : 1.0);
    }
    if (state.config.enableCitiesAndKnights && isCity && comm) {
      if (comm === "paper") score += pips * 1.42;
      else if (comm === "coin") score += pips * 1.12;
      else if (comm === "cloth") score += pips * 1.08;
    }
  }
  return score;
}

export function countResourceDeficit(
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
