import type { VertexId } from "@gaming-platform/core";
import {
  DISCIPLINE_TO_COMMODITY,
  MEDICINE_CITY_COST,
} from "../config/cities-knights-config.ts";
import {
  BUILDING_COSTS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import {
  type CommodityType,
  type ImprovementDiscipline,
   type ResourceMap,
  TRADE_GOODS,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

export function getPlayerCitiesOnBoard(
  state: CatanState,
  playerId: string
): VertexId[] {
  return Object.entries(state.buildings)
    .filter(([, b]) => b.ownerId === playerId && b.type === "city")
    .map(([vId]) => vId);
}

export function getPlayerVulnerableCities(
  state: CatanState,
  playerId: string
): VertexId[] {
  return Object.entries(state.buildings)
    .filter(
      ([, b]) => b.ownerId === playerId && b.type === "city" && !b.metropolis
    )
    .map(([vId]) => vId);
}

export function getEffectiveCityCost(player: CatanPlayerState): ResourceMap {
  if (player.activeTurnDiscounts.medicine) {
    return MEDICINE_CITY_COST;
  }
  return BUILDING_COSTS.city;
}

export function getCityImprovementCommodityCost(
  player: CatanPlayerState,
  discipline: ImprovementDiscipline
): { commodity: CommodityType; amount: number; nextLevel: number } {
  const nextLevel = player.cityImprovements[discipline] + 1;
  const discount = player.activeTurnDiscounts.crane ? 1 : 0;
  return {
    commodity: DISCIPLINE_TO_COMMODITY[discipline],
    amount: Math.max(0, nextLevel - discount),
    nextLevel,
  };
}

export function willUpgradeClaimMetropolis(
  state: CatanState,
  playerId: string,
  discipline: ImprovementDiscipline,
  nextLevel: number
): boolean {
  const metro = state.metropolises[discipline];
  if (nextLevel === 4 && metro.ownerId === null) {
    return true;
  }
  if (nextLevel === 5 && metro.ownerId !== playerId && metro.level < 5) {
    return true;
  }
  return false;
}

export function canPlayerUpgradeDiscipline(
  state: CatanState,
  player: CatanPlayerState,
  discipline: ImprovementDiscipline
): {
  allowed: boolean;
  claimsMetropolis: boolean;
  eligibleMetropolisVertices: VertexId[];
  costCommodity: CommodityType;
  costAmount: number;
  nextLevel: number;
} {
  const currentLevel = player.cityImprovements[discipline];
  const { commodity, amount, nextLevel } = getCityImprovementCommodityCost(
    player,
    discipline
  );

  if (!state.config.enableCitiesAndKnights || currentLevel >= 5) {
    return {
      allowed: false,
      claimsMetropolis: false,
      eligibleMetropolisVertices: [],
      costCommodity: commodity,
      costAmount: amount,
      nextLevel,
    };
  }

  const cities = getPlayerCitiesOnBoard(state, player.id);
  if (cities.length === 0) {
    return {
      allowed: false,
      claimsMetropolis: false,
      eligibleMetropolisVertices: [],
      costCommodity: commodity,
      costAmount: amount,
      nextLevel,
    };
  }

  if (player.commodities[commodity] < amount) {
    return {
      allowed: false,
      claimsMetropolis: false,
      eligibleMetropolisVertices: [],
      costCommodity: commodity,
      costAmount: amount,
      nextLevel,
    };
  }

  const claimsMetropolis = willUpgradeClaimMetropolis(
    state,
    player.id,
    discipline,
    nextLevel
  );
  const eligibleMetropolisVertices = getPlayerVulnerableCities(state, player.id);

  if (claimsMetropolis && eligibleMetropolisVertices.length === 0) {
    return {
      allowed: false,
      claimsMetropolis: true,
      eligibleMetropolisVertices: [],
      costCommodity: commodity,
      costAmount: amount,
      nextLevel,
    };
  }

  return {
    allowed: true,
    claimsMetropolis,
    eligibleMetropolisVertices,
    costCommodity: commodity,
    costAmount: amount,
    nextLevel,
  };
}

/**
 * Returns trade ratios (4, 3, or 2) across all 8 trade goods (5 resources + 3 commodities).
 */
export function getPlayerGoodTradeRatios(
  state: CatanState,
  playerId: string
): Record<TradeGoodType, number> {
  const player = state.players.find((p) => p.id === playerId);
  const baseRatios: Record<TradeGoodType, number> = {
    brick: 4,
    lumber: 4,
    wool: 4,
    grain: 4,
    ore: 4,
    paper: 4,
    cloth: 4,
    coin: 4,
  };

  const withHarbors = state.harbors.reduce<Record<TradeGoodType, number>>(
    (ratios, harbor) => {
      const ownsHarbor = harbor.vertexIds.some(
        (vId) => state.buildings[vId]?.ownerId === playerId
      );
      if (!ownsHarbor) return ratios;
      if (harbor.type === "generic") {
        return TRADE_GOODS.reduce<Record<TradeGoodType, number>>(
          (acc, g) => ({ ...acc, [g]: Math.min(ratios[g], 3) }),
          { ...ratios }
        );
      }
      return {
        ...ratios,
        [harbor.type]: 2,
      };
    },
    baseRatios
  );

  // Trading House (Trade Level 3+): 2:1 on all commodities
  const withTradingHouse =
    player && player.cityImprovements.trade >= 3
      ? {
          ...withHarbors,
          paper: 2,
          cloth: 2,
          coin: 2,
        }
      : withHarbors;

  // Merchant control: 2:1 on the Merchant hex's resource
  const merchantRes =
    state.merchantOwnerId === playerId && state.merchantHexId
      ? TERRAIN_TO_RESOURCE[state.hexes[state.merchantHexId]?.terrain ?? "desert"]
      : null;
  const withMerchant = merchantRes
    ? { ...withTradingHouse, [merchantRes]: 2 }
    : withTradingHouse;

  // Merchant Fleet Progress Card: 2:1 on chosen good for the rest of this turn
  const fleetGood = player?.activeTurnDiscounts.merchantFleetGood ?? null;
  return fleetGood ? { ...withMerchant, [fleetGood]: 2 } : withMerchant;
}
