import {
  type EdgeId,
  type GameEvent,
  type HexId,
  type RngState,
  type VertexId,
  nextIntPure,
  pickPure,
  shufflePure,
} from "@gaming-platform/core";
import {
  type ActiveTurnDiscounts,
  BARBARIAN_TRACK_STEPS,
  BUILDING_COSTS,
  COMMODITIES,
  type CatanAction,
  type CatanPlayerState,
  type CatanState,
  type CityImprovementMap,
  type CommodityMap,
  type CommodityType,
  DISCIPLINE_TO_COMMODITY,
  type EventDieFace,
  IMPROVEMENT_DISCIPLINES,
  type ImprovementDiscipline,
  type KnightLevel,
  type KnightPiece,
  type MetropolisState,
  NUMBER_TOKEN_PIPS,
  type ProgressCardInstance,
  type ProgressCardPlayParams,
  type ProgressCardType,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  TERRAIN_TO_COMMODITY,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  type TradeGoodMap,
  type TradeGoodType,
} from "./types.ts";

export interface ProgressCardMetadata {
  readonly type: ProgressCardType;
  readonly discipline: ImprovementDiscipline;
  readonly title: string;
  readonly copies: number;
  readonly phase: "PRE_ROLL" | "MAIN_PHASE" | "IMMEDIATE_VP";
  readonly description: string;
}

export const PROGRESS_CARD_CATALOG: Readonly<
  Record<ProgressCardType, ProgressCardMetadata>
> = {
  // Science (18)
  printer: {
    type: "printer",
    discipline: "science",
    title: "Printer",
    copies: 1,
    phase: "IMMEDIATE_VP",
    description: "+1 Victory Point! Revealed immediately upon draw.",
  },
  engineer: {
    type: "engineer",
    discipline: "science",
    title: "Engineer",
    copies: 1,
    phase: "MAIN_PHASE",
    description: "Build 1 City Wall on one of your unwalled cities for free.",
  },
  alchemist: {
    type: "alchemist",
    discipline: "science",
    title: "Alchemist",
    copies: 2,
    phase: "PRE_ROLL",
    description:
      "Play before rolling: choose the exact white and red number dice values.",
  },
  crane: {
    type: "crane",
    discipline: "science",
    title: "Crane",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Your next City Improvement this turn costs 1 fewer commodity.",
  },
  inventor: {
    type: "inventor",
    discipline: "science",
    title: "Inventor",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Swap the number tokens of any two land hexes (except 2, 6, 8, and 12).",
  },
  irrigation: {
    type: "irrigation",
    discipline: "science",
    title: "Irrigation",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Collect 2 Grain for each Fields hex adjacent to at least one of your buildings.",
  },
  medicine: {
    type: "medicine",
    discipline: "science",
    title: "Medicine",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Your next City upgrade this turn costs 2 Ore and 1 Grain (1 Ore + 1 Grain discount).",
  },
  mining: {
    type: "mining",
    discipline: "science",
    title: "Mining",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Collect 2 Ore for each Mountains hex adjacent to at least one of your buildings.",
  },
  road_building: {
    type: "road_building",
    discipline: "science",
    title: "Road Building",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Build up to 2 Roads or Ships immediately for free.",
  },
  smith: {
    type: "smith",
    discipline: "science",
    title: "Smith",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Promote up to 2 of your Knights by 1 level each for free.",
  },

  // Politics (18)
  constitution: {
    type: "constitution",
    discipline: "politics",
    title: "Constitution",
    copies: 1,
    phase: "IMMEDIATE_VP",
    description: "+1 Victory Point! Revealed immediately upon draw.",
  },
  bishop: {
    type: "bishop",
    discipline: "politics",
    title: "Bishop",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Move the Robber and draw 1 random card from every opponent adjacent to that hex.",
  },
  deserter: {
    type: "deserter",
    discipline: "politics",
    title: "Deserter",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "An opponent's Knight deserts; place one of your Knights of up to that level.",
  },
  diplomat: {
    type: "diplomat",
    discipline: "politics",
    title: "Diplomat",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Remove any open-ended road; if it was yours, you may place it elsewhere for free.",
  },
  intrigue: {
    type: "intrigue",
    discipline: "politics",
    title: "Intrigue",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Displace an opponent's Knight touching one of your roads or ships.",
  },
  saboteur: {
    type: "saboteur",
    discipline: "politics",
    title: "Saboteur",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Every opponent with at least as many VP as you discards half their hand.",
  },
  spy: {
    type: "spy",
    discipline: "politics",
    title: "Spy",
    copies: 3,
    phase: "MAIN_PHASE",
    description: "Steal 1 random Progress Card from an opponent.",
  },
  warlord: {
    type: "warlord",
    discipline: "politics",
    title: "Warlord",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Activate all of your Knights on the board for free.",
  },
  wedding: {
    type: "wedding",
    discipline: "politics",
    title: "Wedding",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Each opponent with more VP than you gives you up to 2 cards from their hand.",
  },

  // Trade (18)
  merchant: {
    type: "merchant",
    discipline: "trade",
    title: "Merchant",
    copies: 6,
    phase: "MAIN_PHASE",
    description:
      "Place the Merchant adjacent to your building: +1 VP and 2:1 bank trade for that hex's resource.",
  },
  resource_monopoly: {
    type: "resource_monopoly",
    discipline: "trade",
    title: "Resource Monopoly",
    copies: 4,
    phase: "MAIN_PHASE",
    description:
      "Name 1 resource; each opponent gives you up to 2 of that resource.",
  },
  trade_monopoly: {
    type: "trade_monopoly",
    discipline: "trade",
    title: "Trade Monopoly",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Name 1 commodity; each opponent gives you up to 1 of that commodity.",
  },
  merchant_fleet: {
    type: "merchant_fleet",
    discipline: "trade",
    title: "Merchant Fleet",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Trade 1 chosen resource or commodity at 2:1 with the bank for the rest of this turn.",
  },
  master_merchant: {
    type: "master_merchant",
    discipline: "trade",
    title: "Master Merchant",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Choose an opponent with more VP than you and draw 2 cards from their hand.",
  },
  commercial_harbor: {
    type: "commercial_harbor",
    discipline: "trade",
    title: "Commercial Harbor",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Exchange 1 resource from your hand for 1 commodity from each opponent holding commodities.",
  },
};

export function isCommodityType(good: string): good is CommodityType {
  return (COMMODITIES as readonly string[]).includes(good);
}

export function isResourceType(good: string): good is ResourceType {
  return (RESOURCES as readonly string[]).includes(good);
}

export function emptyCommodities(): CommodityMap {
  return { paper: 0, cloth: 0, coin: 0 };
}

export function emptyCityImprovements(): CityImprovementMap {
  return { trade: 0, politics: 0, science: 0 };
}

export function emptyTurnDiscounts(): ActiveTurnDiscounts {
  return { crane: false, medicine: false, merchantFleetGood: null };
}

export function emptyMetropolises(): Record<
  ImprovementDiscipline,
  MetropolisState
> {
  return {
    trade: { ownerId: null, vertexId: null, level: 0 },
    politics: { ownerId: null, vertexId: null, level: 0 },
    science: { ownerId: null, vertexId: null, level: 0 },
  };
}

export function emptyTradeGoodMap(): TradeGoodMap {
  return {
    brick: 0,
    lumber: 0,
    wool: 0,
    grain: 0,
    ore: 0,
    paper: 0,
    cloth: 0,
    coin: 0,
  };
}

export function totalCommodityCount(comm: Partial<CommodityMap> | undefined): number {
  if (!comm) return 0;
  return COMMODITIES.reduce<number>((sum, c) => sum + (comm[c] ?? 0), 0);
}

export function hasCommodities(
  hand: CommodityMap,
  cost: Partial<CommodityMap> | undefined
): boolean {
  if (!cost) return true;
  return COMMODITIES.every((c) => (hand[c] ?? 0) >= (cost[c] ?? 0));
}

export function addCommoditiesPure(
  target: CommodityMap,
  delta: Partial<CommodityMap> | undefined
): CommodityMap {
  if (!delta) return { ...target };
  return {
    paper: target.paper + (delta.paper ?? 0),
    cloth: target.cloth + (delta.cloth ?? 0),
    coin: target.coin + (delta.coin ?? 0),
  };
}

export function subtractCommoditiesPure(
  target: CommodityMap,
  delta: Partial<CommodityMap> | undefined
): CommodityMap {
  if (!delta) return { ...target };
  return {
    paper: target.paper - (delta.paper ?? 0),
    cloth: target.cloth - (delta.cloth ?? 0),
    coin: target.coin - (delta.coin ?? 0),
  };
}

export function getPlayerGoodCount(
  player: Pick<CatanPlayerState, "resources" | "commodities">,
  good: TradeGoodType
): number {
  return isCommodityType(good) ? player.commodities[good] : player.resources[good];
}

export function getBankGoodCount(
  state: Pick<CatanState, "bank" | "commodityBank">,
  good: TradeGoodType
): number {
  return isCommodityType(good)
    ? state.commodityBank[good]
    : state.bank[good];
}

export function createProgressDecksPure(
  rngState: RngState
): readonly [Record<ImprovementDiscipline, ProgressCardType[]>, RngState] {
  const buildUnshuffled = (discipline: ImprovementDiscipline): ProgressCardType[] =>
    (Object.values(PROGRESS_CARD_CATALOG) as ProgressCardMetadata[])
      .filter((meta) => meta.discipline === discipline)
      .flatMap((meta) =>
        Array.from({ length: meta.copies }, () => meta.type)
      );

  const [trade, rng1] = shufflePure(rngState, buildUnshuffled("trade"));
  const [politics, rng2] = shufflePure(rng1, buildUnshuffled("politics"));
  const [science, rng3] = shufflePure(rng2, buildUnshuffled("science"));

  return [{ trade, politics, science }, rng3];
}

const EVENT_DIE_FACES: readonly EventDieFace[] = [
  "barbarian",
  "barbarian",
  "barbarian",
  "trade",
  "politics",
  "science",
];

export function rollEventDiePure(
  rngState: RngState
): readonly [EventDieFace, RngState] {
  const [idx, nextRng] = nextIntPure(rngState, 0, 5);
  return [EVENT_DIE_FACES[idx]!, nextRng];
}

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

export function getBarbarianStrength(state: CatanState): number {
  return Object.values(state.buildings).filter((b) => b.type === "city").length;
}

export function getPlayerActiveKnightStrength(
  state: CatanState,
  playerId: string
): number {
  return Object.values(state.knights).reduce<number>(
    (sum, k) => (k.ownerId === playerId && k.active ? sum + k.level : sum),
    0
  );
}

export function getTotalActiveKnightStrength(state: CatanState): number {
  return Object.values(state.knights).reduce<number>(
    (sum, k) => (k.active ? sum + k.level : sum),
    0
  );
}

export function getEffectiveCityCost(player: CatanPlayerState): ResourceMap {
  if (player.activeTurnDiscounts.medicine) {
    return { brick: 0, lumber: 0, wool: 0, grain: 1, ore: 2 };
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

/**
 * Returns valid empty vertices connected to `playerId`'s roads/ships for `BUILD_KNIGHT`.
 */
export function getLegalBuildKnightVertices(
  state: CatanState,
  playerId: string
): VertexId[] {
  if (!state.config.enableCitiesAndKnights) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.basicKnightsRemaining <= 0) return [];

  return state.topology.vertexOrder.filter((vId) => {
    if (state.buildings[vId] || state.knights[vId]) return false;
    const vNode = state.topology.vertices[vId]!;
    const touchesLandOrSeaRoute = vNode.incidentEdgeIds.some(
      (eId) => state.edges[eId]?.ownerId === playerId
    );
    return touchesLandOrSeaRoute;
  });
}

export function canPromoteKnightAtVertex(
  state: CatanState,
  player: CatanPlayerState,
  vertexId: VertexId,
  ignorePromotedThisTurn = false
): boolean {
  const knight = state.knights[vertexId];
  if (!knight || knight.ownerId !== player.id) return false;
  if (!ignorePromotedThisTurn && knight.promotedThisTurn) return false;
  if (knight.level === 1) {
    return player.strongKnightsRemaining > 0;
  }
  if (knight.level === 2) {
    return (
      player.mightyKnightsRemaining > 0 &&
      player.cityImprovements.politics >= 3
    );
  }
  return false;
}

export function getLegalPromoteKnightVertices(
  state: CatanState,
  playerId: string,
  ignorePromotedThisTurn = false
): VertexId[] {
  if (!state.config.enableCitiesAndKnights) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  return Object.keys(state.knights).filter((vId) =>
    canPromoteKnightAtVertex(state, player, vId, ignorePromotedThisTurn)
  );
}

export function getLegalActivateKnightVertices(
  state: CatanState,
  playerId: string
): VertexId[] {
  if (!state.config.enableCitiesAndKnights) return [];
  return Object.entries(state.knights)
    .filter(([, k]) => k.ownerId === playerId && !k.active)
    .map(([vId]) => vId);
}

/**
 * Pure BFS along `playerId`'s own roads/ships from `startVertexId`, stopping at vertices
 * blocked by an opponent's building or knight.
 */
export function getReachableKnightVertices(
  state: CatanState,
  playerId: string,
  startVertexId: VertexId,
  movingKnightLevel: KnightLevel,
  allowDisplacement: boolean
): VertexId[] {
  const visited = new Set<VertexId>([startVertexId]);
  const queue: VertexId[] = [startVertexId];
  const validTargets: VertexId[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const vNode = state.topology.vertices[current];
    if (!vNode) continue;

    for (const edgeId of vNode.incidentEdgeIds) {
      const route = state.edges[edgeId];
      if (!route || route.ownerId !== playerId) continue;
      const eNode = state.topology.edges[edgeId];
      if (!eNode) continue;
      const neighbor = eNode.v1 === current ? eNode.v2 : eNode.v1;
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const b = state.buildings[neighbor];
      const k = state.knights[neighbor];

      if (b && b.ownerId !== playerId) {
        // Opponent building blocks further traversal and cannot be occupied
        continue;
      }

      if (k && k.ownerId !== playerId) {
        // Opponent knight blocks further traversal; can only land here if strictly weaker
        if (allowDisplacement && !b && k.level < movingKnightLevel) {
          validTargets.push(neighbor);
        }
        continue;
      }

      if (!b && !k) {
        validTargets.push(neighbor);
      }

      // Can continue traversing through empty vertices or own buildings/knights
      queue.push(neighbor);
    }
  }

  return state.topology.vertexOrder.filter((vId) => validTargets.includes(vId));
}

export function getLegalMoveKnightActions(
  state: CatanState,
  playerId: string
): Array<{ type: "MOVE_KNIGHT"; fromVertexId: VertexId; toVertexId: VertexId }> {
  if (!state.config.enableCitiesAndKnights) return [];
  return Object.entries(state.knights)
    .filter(
      ([, k]) =>
        k.ownerId === playerId &&
        k.active &&
        !k.activatedThisTurn &&
        !k.actedThisTurn
    )
    .flatMap(([fromVertexId, k]) =>
      getReachableKnightVertices(
        state,
        playerId,
        fromVertexId,
        k.level,
        true
      ).map((toVertexId) => ({
        type: "MOVE_KNIGHT" as const,
        fromVertexId,
        toVertexId,
      }))
    );
}

export function getLegalChaseRobberActions(
  state: CatanState,
  playerId: string,
  legalRobberHexes: readonly HexId[],
  legalPirateHexes: readonly HexId[]
): Array<{
  type: "CHASE_ROBBER_WITH_KNIGHT";
  vertexId: VertexId;
  hexId: HexId;
  targetKind: "robber" | "pirate";
}> {
  if (
    !state.config.enableCitiesAndKnights ||
    state.barbarianAttacksCount < 1
  ) {
    return [];
  }

  return Object.entries(state.knights)
    .filter(
      ([, k]) =>
        k.ownerId === playerId &&
        k.active &&
        !k.activatedThisTurn &&
        !k.actedThisTurn
    )
    .flatMap(([vertexId]) => {
      const vNode = state.topology.vertices[vertexId];
      if (!vNode) return [];

      const touchesRobber = vNode.adjacentHexIds.includes(state.robberHexId);
      const touchesPirate = Boolean(
        state.pirateHexId && vNode.adjacentHexIds.includes(state.pirateHexId)
      );

      const robberMoves = touchesRobber
        ? legalRobberHexes.map((hexId) => ({
            type: "CHASE_ROBBER_WITH_KNIGHT" as const,
            vertexId,
            hexId,
            targetKind: "robber" as const,
          }))
        : [];

      const pirateMoves = touchesPirate
        ? legalPirateHexes.map((hexId) => ({
            type: "CHASE_ROBBER_WITH_KNIGHT" as const,
            vertexId,
            hexId,
            targetKind: "pirate" as const,
          }))
        : [];

      return [...robberMoves, ...pirateMoves];
    });
}

export function returnKnightToSupplyPure(
  player: CatanPlayerState,
  level: KnightLevel
): CatanPlayerState {
  if (level === 1) {
    return { ...player, basicKnightsRemaining: player.basicKnightsRemaining + 1 };
  }
  if (level === 2) {
    return {
      ...player,
      strongKnightsRemaining: player.strongKnightsRemaining + 1,
    };
  }
  return { ...player, mightyKnightsRemaining: player.mightyKnightsRemaining + 1 };
}

export function takeKnightFromSupplyPure(
  player: CatanPlayerState,
  level: KnightLevel
): CatanPlayerState {
  if (level === 1) {
    return { ...player, basicKnightsRemaining: player.basicKnightsRemaining - 1 };
  }
  if (level === 2) {
    return {
      ...player,
      strongKnightsRemaining: player.strongKnightsRemaining - 1,
    };
  }
  return { ...player, mightyKnightsRemaining: player.mightyKnightsRemaining - 1 };
}

/**
 * Relocates a displaced opponent knight at `displacedVertexId` to the highest-pip connected
 * empty vertex on its owner's road/ship network, or returns it to supply if none exists.
 */
export function displaceKnightAtVertexPure(
  state: CatanState,
  displacedVertexId: VertexId
): {
  knights: Record<VertexId, KnightPiece>;
  players: CatanPlayerState[];
  relocatedTo: VertexId | null;
} {
  const displaced = state.knights[displacedVertexId];
  if (!displaced) {
    return {
      knights: state.knights,
      players: state.players,
      relocatedTo: null,
    };
  }

  const reachableEmpty = getReachableKnightVertices(
    state,
    displaced.ownerId,
    displacedVertexId,
    displaced.level,
    false
  );

  const withoutOld = Object.fromEntries(
    Object.entries(state.knights).filter(([vId]) => vId !== displacedVertexId)
  );

  if (reachableEmpty.length === 0) {
    return {
      knights: withoutOld,
      players: state.players.map((p) =>
        p.id === displaced.ownerId
          ? returnKnightToSupplyPure(p, displaced.level)
          : p
      ),
      relocatedTo: null,
    };
  }

  const scoreVertex = (vId: VertexId): number => {
    const vNode = state.topology.vertices[vId];
    if (!vNode) return 0;
    return vNode.adjacentHexIds.reduce<number>((sum, hId) => {
      const tile = state.hexes[hId];
      const pips = tile?.numberToken ? NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0 : 0;
      return sum + pips;
    }, 0);
  };

  const bestTarget = [...reachableEmpty].sort(
    (a, b) => scoreVertex(b) - scoreVertex(a)
  )[0]!;

  return {
    knights: {
      ...withoutOld,
      [bestTarget]: displaced,
    },
    players: state.players,
    relocatedTo: bestTarget,
  };
}

/**
 * Purely downgrades a vulnerable city at `vertexId` to a settlement after a Barbarian victory.
 * Handles physical piece conservation when `settlementsRemaining === 0` via `borrowedCityPiece`.
 */
export function downgradePillagedCityPure(
  state: CatanState,
  vertexId: VertexId
): CatanState {
  const b = state.buildings[vertexId];
  if (!b || b.type !== "city" || b.metropolis) {
    return state;
  }

  const owner = state.players.find((p) => p.id === b.ownerId);
  if (!owner) return state;

  const hadWall = Boolean(b.hasWall);
  const useRegularSettlement = owner.settlementsRemaining > 0;

  const nextBuildings: CatanState["buildings"] = {
    ...state.buildings,
    [vertexId]: {
      ownerId: b.ownerId,
      type: "settlement",
      ...(useRegularSettlement ? {} : { borrowedCityPiece: true }),
    },
  };

  const nextPlayers = state.players.map((p) => {
    if (p.id !== b.ownerId) return p;
    return {
      ...p,
      settlementsRemaining: useRegularSettlement
        ? p.settlementsRemaining - 1
        : p.settlementsRemaining,
      citiesRemaining: useRegularSettlement
        ? p.citiesRemaining + 1
        : p.citiesRemaining,
      cityWallsRemaining: hadWall
        ? p.cityWallsRemaining + 1
        : p.cityWallsRemaining,
    };
  });

  return {
    ...state,
    buildings: nextBuildings,
    players: nextPlayers,
  };
}

type StateEventsPair = {
  readonly state: CatanState;
  readonly emitted: GameEvent[];
};

function pushEvent(
  state: CatanState,
  emitted: readonly GameEvent[],
  type: string,
  message: string,
  playerId?: string,
  payload?: unknown
): StateEventsPair {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
    payload,
  };
  return {
    state: {
      ...state,
      eventLog: [...state.eventLog, evt],
    },
    emitted: [...emitted, evt],
  };
}

/**
 * Draws the top card of `discipline` for `playerId`.
 * Revealed VP cards (`printer`, `constitution`) score immediately; normal cards enter `progressCards`
 * and queue `pendingProgressDiscards` if the player exceeds the 4-card hand limit.
 */
export function drawProgressCardForPlayerPure(
  state: CatanState,
  playerId: string,
  discipline: ImprovementDiscipline,
  emitted: readonly GameEvent[]
): StateEventsPair {
  const deck = state.progressDecks[discipline];
  if (deck.length === 0) {
    return { state, emitted: emitted.slice() };
  }

  const [drawnType, ...restDeck] = deck;
  if (!drawnType) {
    return { state, emitted: emitted.slice() };
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return { state, emitted: emitted.slice() };
  }

  const nextDecks = {
    ...state.progressDecks,
    [discipline]: restDeck,
  };

  if (drawnType === "printer" || drawnType === "constitution") {
    const title = PROGRESS_CARD_CATALOG[drawnType].title;
    const nextState: CatanState = {
      ...state,
      progressDecks: nextDecks,
      players: state.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              publicProgressVpCards: [...p.publicProgressVpCards, drawnType],
            }
          : p
      ),
    };
    return pushEvent(
      nextState,
      emitted,
      "PROGRESS_VP_REVEALED",
      `${player.name} drew ${title} (${discipline}) and gained +1 Victory Point!`,
      playerId,
      { discipline, cardType: drawnType }
    );
  }

  const cardInstance: ProgressCardInstance = {
    id: `prog-${state.turn}-${state.eventLog.length}-${playerId}-${player.progressCards.length}`,
    type: drawnType,
    discipline,
  };

  const nextPlayerCards = [...player.progressCards, cardInstance];
  const exceedsHandLimit = nextPlayerCards.length > 4;
  const nextPendingDiscards =
    exceedsHandLimit && !state.pendingProgressDiscards.includes(playerId)
      ? [...state.pendingProgressDiscards, playerId]
      : state.pendingProgressDiscards;

  const nextState: CatanState = {
    ...state,
    progressDecks: nextDecks,
    pendingProgressDiscards: nextPendingDiscards,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, progressCards: nextPlayerCards } : p
    ),
  };

  return pushEvent(
    nextState,
    emitted,
    "PROGRESS_CARD_DRAWN",
    `${player.name} drew 1 ${discipline} Progress Card.`,
    playerId,
    { discipline }
  );
}

/**
 * Resolves the Event Die (`barbarian` vs `trade` / `politics` / `science`) prior to 2d6 production.
 */
export function resolveEventDieRollPure(
  state: CatanState,
  eventFace: EventDieFace,
  redDie: number,
  emitted: readonly GameEvent[]
): StateEventsPair {
  if (eventFace !== "barbarian") {
    const n = state.players.length;
    const startIdx = state.activePlayerIndex;
    const orderedPlayers = Array.from(
      { length: n },
      (_, offset) => state.players[(startIdx + offset) % n]!
    );

    return orderedPlayers.reduce<StateEventsPair>(
      (acc, p) => {
        const level = p.cityImprovements[eventFace];
        // Official C&K flip-chart caliper numbers: Level 1 -> [1,2], ..., Level 5 -> [1..6]
        if (level >= 1 && redDie <= level + 1) {
          return drawProgressCardForPlayerPure(
            acc.state,
            p.id,
            eventFace,
            acc.emitted
          );
        }
        return acc;
      },
      { state, emitted: emitted.slice() }
    );
  }

  const nextPos = state.barbarianPosition + 1;
  if (nextPos < BARBARIAN_TRACK_STEPS) {
    const advancedState: CatanState = {
      ...state,
      barbarianPosition: nextPos,
    };
    return pushEvent(
      advancedState,
      emitted,
      "BARBARIAN_ADVANCED",
      `Barbarian fleet advanced to ${nextPos}/${BARBARIAN_TRACK_STEPS}.`
    );
  }

  // Barbarian Attack!
  const barbarianStrength = getBarbarianStrength(state);
  const contributions = state.players.map((p) => ({
    player: p,
    strength: getPlayerActiveKnightStrength(state, p.id),
    vulnerableCities: getPlayerVulnerableCities(state, p.id),
  }));
  const defenderStrength = contributions.reduce<number>(
    (s, c) => s + c.strength,
    0
  );

  // All knights deactivate after the battle
  const deactivatedKnights = Object.fromEntries(
    Object.entries(state.knights).map(([vId, k]) => [
      vId,
      { ...k, active: false },
    ])
  );

  const basePostBattle: CatanState = {
    ...state,
    barbarianPosition: 0,
    barbarianAttacksCount: state.barbarianAttacksCount + 1,
    knights: deactivatedKnights,
  };

  if (barbarianStrength === 0 || defenderStrength >= barbarianStrength) {
    const maxContribution = Math.max(0, ...contributions.map((c) => c.strength));
    const topContributors =
      maxContribution > 0
        ? contributions.filter((c) => c.strength === maxContribution)
        : [];

    if (topContributors.length === 1) {
      const hero = topContributors[0]!.player;
      const summary = `Catan defeated the Barbarians (${defenderStrength} vs ${barbarianStrength})! ${hero.name} earned Defender of Catan (+1 VP).`;
      const heroState: CatanState = {
        ...basePostBattle,
        lastBarbarianAttackResult: {
          turn: state.turn,
          barbarianStrength,
          defenderStrength,
          outcome: "defenders_won",
          summary,
        },
        players: basePostBattle.players.map((p) =>
          p.id === hero.id ? { ...p, defenderPoints: p.defenderPoints + 1 } : p
        ),
      };
      return pushEvent(
        heroState,
        emitted,
        "BARBARIAN_DEFEATED",
        summary,
        hero.id,
        { barbarianStrength, defenderStrength, defenderId: hero.id }
      );
    }

    if (topContributors.length > 1) {
      const hasAnyDeck = IMPROVEMENT_DISCIPLINES.some(
        (d) => basePostBattle.progressDecks[d].length > 0
      );
      const tiedIds = hasAnyDeck
        ? topContributors.map((c) => c.player.id)
        : [];
      const names = topContributors.map((c) => c.player.name).join(", ");
      const summary = `Catan defeated the Barbarians (${defenderStrength} vs ${barbarianStrength})! Top defenders (${names}) each draw 1 Progress Card.`;
      const tiedState: CatanState = {
        ...basePostBattle,
        pendingDefenderDeckPicks: tiedIds,
        lastBarbarianAttackResult: {
          turn: state.turn,
          barbarianStrength,
          defenderStrength,
          outcome: "defenders_won",
          summary,
        },
      };
      return pushEvent(tiedState, emitted, "BARBARIAN_DEFEATED", summary, undefined, {
        barbarianStrength,
        defenderStrength,
        tiedIds,
      });
    }

    const summary = `The Barbarian fleet landed (${defenderStrength} vs ${barbarianStrength}), finding no cities to plunder.`;
    const peacefulState: CatanState = {
      ...basePostBattle,
      lastBarbarianAttackResult: {
        turn: state.turn,
        barbarianStrength,
        defenderStrength,
        outcome: "defenders_won",
        summary,
      },
    };
    return pushEvent(peacefulState, emitted, "BARBARIAN_DEFEATED", summary);
  }

  // Barbarians Win! Players with >= 1 vulnerable city who contributed the LEAST lose 1 city.
  const vulnerableEntries = contributions.filter(
    (c) => c.vulnerableCities.length > 0
  );

  if (vulnerableEntries.length === 0) {
    const summary = `Barbarians overpowered Catan (${barbarianStrength} vs ${defenderStrength}), but all cities are protected by Metropolises!`;
    const immuneState: CatanState = {
      ...basePostBattle,
      lastBarbarianAttackResult: {
        turn: state.turn,
        barbarianStrength,
        defenderStrength,
        outcome: "barbarians_won",
        summary,
      },
    };
    return pushEvent(immuneState, emitted, "BARBARIAN_VICTORY", summary);
  }

  const minStrength = Math.min(...vulnerableEntries.map((c) => c.strength));
  const losers = vulnerableEntries.filter((c) => c.strength === minStrength);

  const pillageResolved = losers.reduce<{
    state: CatanState;
    pendingSelections: string[];
    pillagedNames: string[];
  }>(
    (acc, entry) => {
      if (entry.vulnerableCities.length === 1) {
        return {
          state: downgradePillagedCityPure(acc.state, entry.vulnerableCities[0]!),
          pendingSelections: acc.pendingSelections,
          pillagedNames: [...acc.pillagedNames, entry.player.name],
        };
      }
      return {
        state: acc.state,
        pendingSelections: [...acc.pendingSelections, entry.player.id],
        pillagedNames: [...acc.pillagedNames, entry.player.name],
      };
    },
    { state: basePostBattle, pendingSelections: [], pillagedNames: [] }
  );

  const summary = `Barbarians pillaged Catan (${barbarianStrength} vs ${defenderStrength})! ${pillageResolved.pillagedNames.join(", ")} lost a City.`;
  const finalBarbState: CatanState = {
    ...pillageResolved.state,
    pendingPillageSelections: pillageResolved.pendingSelections,
    lastBarbarianAttackResult: {
      turn: state.turn,
      barbarianStrength,
      defenderStrength,
      outcome: "barbarians_won",
      summary,
    },
  };

  return pushEvent(finalBarbState, emitted, "BARBARIAN_VICTORY", summary, undefined, {
    barbarianStrength,
    defenderStrength,
  });
}

/**
 * Returns open-ended roads eligible for `diplomat` removal.
 * A road is open-ended if at least one of its endpoints has no other road/ship of that owner,
 * no building of that owner, and no knight of that owner.
 */
export function getDiplomatRemovableRoadEdges(state: CatanState): EdgeId[] {
  return Object.entries(state.edges)
    .filter(([eId, route]) => {
      if (route.type !== "road") return false;
      const eNode = state.topology.edges[eId];
      if (!eNode) return false;

      const isOpenEndpoint = (vId: VertexId): boolean => {
        if (state.buildings[vId]?.ownerId === route.ownerId) return false;
        if (state.knights[vId]?.ownerId === route.ownerId) return false;
        const vNode = state.topology.vertices[vId]!;
        const otherOwnRoutes = vNode.incidentEdgeIds.filter(
          (incId) => incId !== eId && state.edges[incId]?.ownerId === route.ownerId
        );
        return otherOwnRoutes.length === 0;
      };

      return isOpenEndpoint(eNode.v1) || isOpenEndpoint(eNode.v2);
    })
    .map(([eId]) => eId);
}

/**
 * Generates legal `PLAY_PROGRESS_CARD` actions for `player` in `PRE_ROLL` or `MAIN_PHASE`.
 */
export function getLegalProgressCardActions(
  state: CatanState,
  player: CatanPlayerState,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalShipEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
): CatanAction[] {
  if (!state.config.enableCitiesAndKnights || player.progressCards.length === 0) {
    return [];
  }

  if (state.phase === "PRE_ROLL") {
    const alchemistCards = player.progressCards.filter(
      (c) => c.type === "alchemist"
    );
    if (alchemistCards.length === 0) return [];
    const firstCard = alchemistCards[0]!;
    // Canonical die1 + die2 pairs covering all totals 2..12 and red-die thresholds
    const dicePairs: Array<[number, number]> = [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 4],
      [4, 5],
      [5, 5],
      [5, 6],
      [6, 6],
      [6, 1],
      [5, 1],
      [4, 2],
      [5, 3],
    ];
    return dicePairs.map(([die1, die2]) => ({
      type: "PLAY_PROGRESS_CARD" as const,
      cardId: firstCard.id,
      params: { die1, die2 },
    }));
  }

  if (state.phase !== "MAIN_PHASE") {
    return [];
  }

  const myVp = computeVpFn(state, player.id, true);
  const seenTypes = new Set<ProgressCardType>();

  return player.progressCards.flatMap((card): CatanAction[] => {
    if (seenTypes.has(card.type)) return [];
    seenTypes.add(card.type);

    switch (card.type) {
      case "mining":
      case "irrigation":
      case "saboteur":
      case "wedding":
        return [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "crane":
        return player.activeTurnDiscounts.crane
          ? []
          : [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "medicine":
        return player.activeTurnDiscounts.medicine
          ? []
          : [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "road_building": {
        const hasSpots =
          getLegalRoadEdgesFn(state, player.id).length > 0 ||
          getLegalShipEdgesFn(state, player.id).length > 0;
        return hasSpots
          ? [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }]
          : [];
      }

      case "warlord": {
        const inactive = getLegalActivateKnightVertices(state, player.id);
        return inactive.length > 0
          ? [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }]
          : [];
      }

      case "engineer": {
        if (player.cityWallsRemaining <= 0) return [];
        return Object.entries(state.buildings)
          .filter(
            ([, b]) => b.ownerId === player.id && b.type === "city" && !b.hasWall
          )
          .map(([vertexId]) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { vertexId },
          }));
      }

      case "smith": {
        const promotable = getLegalPromoteKnightVertices(
          state,
          player.id,
          true
        );
        if (promotable.length === 0) return [];
        if (promotable.length === 1) {
          return [
            {
              type: "PLAY_PROGRESS_CARD",
              cardId: card.id,
              params: { vertexIds: [promotable[0]!] },
            },
          ];
        }
        const pairs = promotable.flatMap((v1, idx) =>
          promotable.slice(idx + 1).flatMap((v2) => {
            const k1 = state.knights[v1]!;
            const k2 = state.knights[v2]!;
            if (
              k1.level === 1 &&
              k2.level === 1 &&
              player.strongKnightsRemaining < 2
            ) {
              return [];
            }
            if (
              k1.level === 2 &&
              k2.level === 2 &&
              player.mightyKnightsRemaining < 2
            ) {
              return [];
            }
            return [
              {
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { vertexIds: [v1, v2] },
              },
            ];
          })
        );
        const singles = promotable.map((v1) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { vertexIds: [v1] },
        }));
        return pairs.length > 0 ? [...pairs, ...singles] : singles;
      }

      case "inventor": {
        const swappableHexes = state.topology.hexOrder.filter((hId) => {
          const t = state.hexes[hId]!;
          return (
            t.numberToken !== null &&
            t.numberToken !== 2 &&
            t.numberToken !== 6 &&
            t.numberToken !== 8 &&
            t.numberToken !== 12 &&
            t.terrain !== "sea" &&
            t.terrain !== "fog"
          );
        });
        if (swappableHexes.length < 2) return [];
        return swappableHexes.flatMap((h1, idx) =>
          swappableHexes.slice(idx + 1).map((h2) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { hexId1: h1, hexId2: h2 },
          }))
        );
      }

      case "bishop": {
        if (state.barbarianAttacksCount < 1) return [];
        return getLegalRobberHexesFn(state, player.id).map((hexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { hexId },
        }));
      }

      case "intrigue": {
        const targetKnights = Object.entries(state.knights)
          .filter(([vId, k]) => {
            if (k.ownerId === player.id) return false;
            const vNode = state.topology.vertices[vId];
            return Boolean(
              vNode?.incidentEdgeIds.some(
                (eId) => state.edges[eId]?.ownerId === player.id
              )
            );
          })
          .map(([vId]) => vId);
        return targetKnights.map((vertexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { vertexId },
        }));
      }

      case "deserter": {
        const opponentsWithKnights = state.players.filter(
          (opp) =>
            opp.id !== player.id &&
            Object.values(state.knights).some((k) => k.ownerId === opp.id)
        );
        if (opponentsWithKnights.length === 0) return [];
        const ownSpots = state.topology.vertexOrder.filter((vId) => {
          if (state.buildings[vId] || state.knights[vId]) return false;
          const vNode = state.topology.vertices[vId]!;
          return vNode.incidentEdgeIds.some(
            (eId) => state.edges[eId]?.ownerId === player.id
          );
        });
        return opponentsWithKnights.flatMap((opp) =>
          ownSpots.length > 0
            ? ownSpots.map((placeVertexId) => ({
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { targetPlayerId: opp.id, placeVertexId },
              }))
            : [
                {
                  type: "PLAY_PROGRESS_CARD" as const,
                  cardId: card.id,
                  params: { targetPlayerId: opp.id },
                },
              ]
        );
      }

      case "diplomat": {
        const openEdges = getDiplomatRemovableRoadEdges(state);
        if (openEdges.length === 0) return [];
        const ownRebuilds = getLegalRoadEdgesFn(state, player.id);
        return openEdges.flatMap((edgeId) => {
          const isOwn = state.edges[edgeId]?.ownerId === player.id;
          if (isOwn && ownRebuilds.length > 0) {
            return [
              {
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { edgeId },
              },
              ...ownRebuilds
                .filter((rId) => rId !== edgeId)
                .map((rebuildEdgeId) => ({
                  type: "PLAY_PROGRESS_CARD" as const,
                  cardId: card.id,
                  params: { edgeId, rebuildEdgeId },
                })),
            ];
          }
          return [
            {
              type: "PLAY_PROGRESS_CARD" as const,
              cardId: card.id,
              params: { edgeId },
            },
          ];
        });
      }

      case "spy": {
        return state.players
          .filter((opp) => {
            if (opp.id === player.id) return false;
            const count = opp.handRedacted
              ? opp.hiddenProgressCardCount ?? 0
              : opp.progressCards.length;
            return count > 0;
          })
          .map((opp) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { targetPlayerId: opp.id },
          }));
      }

      case "merchant": {
        const adjacentResourceHexes = state.topology.hexOrder.filter((hId) => {
          const tile = state.hexes[hId]!;
          if (!TERRAIN_TO_RESOURCE[tile.terrain]) return false;
          const hNode = state.topology.hexes[hId]!;
          return hNode.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === player.id
          );
        });
        return adjacentResourceHexes.map((hexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { hexId },
        }));
      }

      case "resource_monopoly": {
        return RESOURCES.map((resource) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { resource },
        }));
      }

      case "trade_monopoly": {
        return COMMODITIES.map((commodity) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { commodity },
        }));
      }

      case "merchant_fleet": {
        return TRADE_GOODS.map((good) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { good },
        }));
      }

      case "master_merchant": {
        const leadersWithCards = state.players.filter((opp) => {
          if (opp.id === player.id) return false;
          if (computeVpFn(state, opp.id, true) <= myVp) return false;
          const handCount = opp.handRedacted
            ? opp.hiddenResourceCount ?? 0
            : RESOURCES.reduce<number>((s, r) => s + opp.resources[r], 0) +
              totalCommodityCount(opp.commodities);
          return handCount > 0;
        });
        return leadersWithCards.map((opp) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { targetPlayerId: opp.id },
        }));
      }

      case "commercial_harbor": {
        const myAvailResources = RESOURCES.filter(
          (r) => player.resources[r] > 0
        );
        if (myAvailResources.length === 0) return [];
        return myAvailResources.map((resource) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { resource },
        }));
      }

      default:
        return [];
    }
  });
}

function drawOneRandomHandGoodPure(
  rngState: RngState,
  victim: CatanPlayerState
): readonly [TradeGoodType | null, RngState] {
  const pool: TradeGoodType[] = [
    ...RESOURCES.flatMap((r) =>
      Array.from({ length: victim.resources[r] }, (): TradeGoodType => r)
    ),
    ...COMMODITIES.flatMap((c) =>
      Array.from({ length: victim.commodities[c] }, (): TradeGoodType => c)
    ),
  ];
  if (pool.length === 0) {
    return [null, rngState];
  }
  return pickPure(rngState, pool);
}

export function transferGoodBetweenPlayersPure(
  players: readonly CatanPlayerState[],
  fromId: string,
  toId: string,
  good: TradeGoodType,
  amount = 1
): CatanPlayerState[] {
  return players.map((p) => {
    if (p.id === fromId) {
      return isCommodityType(good)
        ? {
            ...p,
            commodities: subtractCommoditiesPure(p.commodities, {
              [good]: amount,
            }),
          }
        : {
            ...p,
            resources: {
              ...p.resources,
              [good]: p.resources[good] - amount,
            },
          };
    }
    if (p.id === toId) {
      return isCommodityType(good)
        ? {
            ...p,
            commodities: addCommoditiesPure(p.commodities, { [good]: amount }),
          }
        : {
            ...p,
            resources: {
              ...p.resources,
              [good]: p.resources[good] + amount,
            },
          };
    }
    return p;
  });
}

/**
 * Removes `cardId` from `playerId`'s `progressCards` and returns `card.type` to the bottom
 * of `state.progressDecks[card.discipline]` (preserving total 54-card deck conservation).
 */
export function consumePlayerProgressCardPure(
  state: CatanState,
  playerId: string,
  cardId: string
): { state: CatanState; card: ProgressCardInstance } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}"`);
  }
  const card = player.progressCards.find((c) => c.id === cardId);
  if (!card) {
    throw new Error("Progress card not found in hand");
  }

  return {
    card,
    state: {
      ...state,
      progressDecks: {
        ...state.progressDecks,
        [card.discipline]: [...state.progressDecks[card.discipline], card.type],
      },
      players: state.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              progressCards: p.progressCards.filter((c) => c.id !== cardId),
            }
          : p
      ),
    },
  };
}

/**
 * Purely executes any non-Alchemist `MAIN_PHASE` Progress Card.
 */
export function applyMainPhaseProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
): StateEventsPair {
  const actor = stateAfterConsume.players.find((p) => p.id === playerId)!;
  const cardTitle = PROGRESS_CARD_CATALOG[card.type].title;

  switch (card.type) {
    case "mining":
    case "irrigation": {
      const targetTerrain = card.type === "mining" ? "mountains" : "fields";
      const targetRes: ResourceType = card.type === "mining" ? "ore" : "grain";
      const matchingHexCount = stateAfterConsume.topology.hexOrder.filter(
        (hId) => {
          const tile = stateAfterConsume.hexes[hId]!;
          if (tile.terrain !== targetTerrain) return false;
          const hNode = stateAfterConsume.topology.hexes[hId]!;
          return hNode.cornerVertexIds.some(
            (vId) => stateAfterConsume.buildings[vId]?.ownerId === playerId
          );
        }
      ).length;
      const gained = Math.min(
        stateAfterConsume.bank[targetRes],
        matchingHexCount * 2
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        bank: {
          ...stateAfterConsume.bank,
          [targetRes]: stateAfterConsume.bank[targetRes] - gained,
        },
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  [targetRes]: p.resources[targetRes] + gained,
                },
              }
            : p
        ),
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played ${cardTitle} and collected ${gained} ${targetRes}.`,
        playerId,
        { cardType: card.type, gained }
      );
    }

    case "crane": {
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                activeTurnDiscounts: { ...p.activeTurnDiscounts, crane: true },
              }
            : p
        ),
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Crane (-1 commodity on next City Improvement this turn).`,
        playerId,
        { cardType: card.type }
      );
    }

    case "medicine": {
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                activeTurnDiscounts: {
                  ...p.activeTurnDiscounts,
                  medicine: true,
                },
              }
            : p
        ),
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Medicine (next City costs 2 Ore + 1 Grain this turn).`,
        playerId,
        { cardType: card.type }
      );
    }

    case "engineer": {
      const vId = params?.vertexId;
      const b = vId ? stateAfterConsume.buildings[vId] : undefined;
      if (
        !vId ||
        !b ||
        b.ownerId !== playerId ||
        b.type !== "city" ||
        b.hasWall ||
        actor.cityWallsRemaining <= 0
      ) {
        throw new Error("Invalid Engineer target city");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        buildings: {
          ...stateAfterConsume.buildings,
          [vId]: { ...b, hasWall: true },
        },
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? { ...p, cityWallsRemaining: p.cityWallsRemaining - 1 }
            : p
        ),
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Engineer and built a free City Wall.`,
        playerId,
        { cardType: card.type, vertexId: vId }
      );
    }

    case "road_building": {
      const nextState: CatanState = {
        ...stateAfterConsume,
        freeRoadsRemaining: 2,
        phase: "ROAD_BUILDING_DEV",
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Road Building (2 free roads/ships).`,
        playerId,
        { cardType: card.type }
      );
    }

    case "smith": {
      const targets = (params?.vertexIds ?? []).slice(0, 2);
      if (targets.length === 0) {
        throw new Error("Smith requires at least 1 promotable knight");
      }
      const uniqueTargets = Array.from(new Set(targets));
      const promoted = uniqueTargets.reduce<CatanState>((acc, vId) => {
        const curPlayer = acc.players.find((p) => p.id === playerId)!;
        if (!canPromoteKnightAtVertex(acc, curPlayer, vId, true)) {
          return acc;
        }
        const k = acc.knights[vId]!;
        const nextLevel = (k.level + 1) as KnightLevel;
        return {
          ...acc,
          knights: {
            ...acc.knights,
            [vId]: { ...k, level: nextLevel, promotedThisTurn: true },
          },
          players: acc.players.map((p) =>
            p.id === playerId
              ? takeKnightFromSupplyPure(
                  returnKnightToSupplyPure(p, k.level),
                  nextLevel
                )
              : p
          ),
        };
      }, stateAfterConsume);

      return pushEvent(
        promoted,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Smith and promoted ${uniqueTargets.length} Knight(s) for free.`,
        playerId,
        { cardType: card.type, vertexIds: uniqueTargets }
      );
    }

    case "inventor": {
      const h1 = params?.hexId1;
      const h2 = params?.hexId2;
      const t1 = h1 ? stateAfterConsume.hexes[h1] : undefined;
      const t2 = h2 ? stateAfterConsume.hexes[h2] : undefined;
      const forbidden = new Set([2, 6, 8, 12]);
      if (
        !h1 ||
        !h2 ||
        h1 === h2 ||
        !t1 ||
        !t2 ||
        t1.numberToken === null ||
        t2.numberToken === null ||
        forbidden.has(t1.numberToken) ||
        forbidden.has(t2.numberToken)
      ) {
        throw new Error("Invalid Inventor hex pair");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        hexes: {
          ...stateAfterConsume.hexes,
          [h1]: { ...t1, numberToken: t2.numberToken },
          [h2]: { ...t2, numberToken: t1.numberToken },
        },
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Inventor and swapped number tokens #${t1.numberToken} and #${t2.numberToken}.`,
        playerId,
        { cardType: card.type, hexId1: h1, hexId2: h2 }
      );
    }

    case "warlord": {
      const nextKnights = Object.fromEntries(
        Object.entries(stateAfterConsume.knights).map(([vId, k]) => [
          vId,
          k.ownerId === playerId && !k.active
            ? { ...k, active: true, activatedThisTurn: true }
            : k,
        ])
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: nextKnights,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Warlord and activated all of their Knights!`,
        playerId,
        { cardType: card.type }
      );
    }

    case "bishop": {
      if (stateAfterConsume.barbarianAttacksCount < 1) {
        throw new Error(
          "Cannot play Bishop before the first Barbarian attack"
        );
      }
      const hexId = params?.hexId;
      const legal = getLegalRobberHexesFn(stateAfterConsume, playerId);
      if (!hexId || !legal.includes(hexId)) {
        throw new Error("Illegal Bishop robber hex");
      }
      const hNode = stateAfterConsume.topology.hexes[hexId]!;
      const victimIds = Array.from(
        new Set(
          hNode.cornerVertexIds
            .map((vId) => stateAfterConsume.buildings[vId]?.ownerId)
            .filter((oid): oid is string => Boolean(oid && oid !== playerId))
        )
      );

      const bishopStolen = victimIds.reduce<{
        rngState: RngState;
        players: CatanPlayerState[];
        count: number;
      }>(
        (acc, vid) => {
          const victim = acc.players.find((p) => p.id === vid)!;
          const [drawn, nextRng] = drawOneRandomHandGoodPure(
            acc.rngState,
            victim
          );
          if (!drawn) return { ...acc, rngState: nextRng };
          return {
            rngState: nextRng,
            players: transferGoodBetweenPlayersPure(
              acc.players,
              vid,
              playerId,
              drawn,
              1
            ),
            count: acc.count + 1,
          };
        },
        {
          rngState: stateAfterConsume.rngState,
          players: stateAfterConsume.players,
          count: 0,
        }
      );

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: bishopStolen.rngState,
        robberHexId: hexId,
        players: bishopStolen.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Bishop, moved the Robber, and drew ${bishopStolen.count} card(s).`,
        playerId,
        { cardType: card.type, hexId, stolenCount: bishopStolen.count }
      );
    }

    case "intrigue": {
      const vId = params?.vertexId;
      const targetKnight = vId ? stateAfterConsume.knights[vId] : undefined;
      const vNode = vId ? stateAfterConsume.topology.vertices[vId] : undefined;
      if (
        !vId ||
        !targetKnight ||
        targetKnight.ownerId === playerId ||
        !vNode?.incidentEdgeIds.some(
          (eId) => stateAfterConsume.edges[eId]?.ownerId === playerId
        )
      ) {
        throw new Error("Invalid Intrigue target knight");
      }
      const displaced = displaceKnightAtVertexPure(stateAfterConsume, vId);
      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: displaced.knights,
        players: displaced.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Intrigue and displaced an opposing Knight.`,
        playerId,
        { cardType: card.type, vertexId: vId }
      );
    }

    case "deserter": {
      const targetPid = params?.targetPlayerId;
      if (!targetPid || targetPid === playerId) {
        throw new Error("Invalid Deserter target player");
      }
      const oppKnights = Object.entries(stateAfterConsume.knights).filter(
        ([, k]) => k.ownerId === targetPid
      );
      if (oppKnights.length === 0) {
        throw new Error("Target opponent has no knights on the board");
      }
      // Opponent loses their lowest-level (preferring inactive) knight
      const [desertVertexId, desertKnight] = [...oppKnights].sort(([, a], [, b]) =>
        a.level !== b.level
          ? a.level - b.level
          : Number(a.active) - Number(b.active)
      )[0]!;

      const withoutDeserted = Object.fromEntries(
        Object.entries(stateAfterConsume.knights).filter(
          ([vId]) => vId !== desertVertexId
        )
      );
      const withReturnedSupply = stateAfterConsume.players.map((p) =>
        p.id === targetPid
          ? returnKnightToSupplyPure(p, desertKnight.level)
          : p
      );

      const actorUpdated = withReturnedSupply.find((p) => p.id === playerId)!;
      const chosenLevel: KnightLevel | null = (() => {
        const candidates: KnightLevel[] =
          desertKnight.level === 3
            ? [3, 2, 1]
            : desertKnight.level === 2
              ? [2, 1]
              : [1];
        for (const lvl of candidates) {
          if (lvl === 3 && actorUpdated.mightyKnightsRemaining > 0 && actorUpdated.cityImprovements.politics >= 3) {
            return 3;
          }
          if (lvl === 2 && actorUpdated.strongKnightsRemaining > 0) {
            return 2;
          }
          if (lvl === 1 && actorUpdated.basicKnightsRemaining > 0) {
            return 1;
          }
        }
        return null;
      })();

      const placeVId = params?.placeVertexId;
      const canPlaceAtSpot = Boolean(
        chosenLevel &&
          placeVId &&
          !stateAfterConsume.buildings[placeVId] &&
          !withoutDeserted[placeVId] &&
          stateAfterConsume.topology.vertices[placeVId]?.incidentEdgeIds.some(
            (eId) => stateAfterConsume.edges[eId]?.ownerId === playerId
          )
      );

      const nextKnights =
        canPlaceAtSpot && placeVId && chosenLevel
          ? {
              ...withoutDeserted,
              [placeVId]: {
                ownerId: playerId,
                level: chosenLevel,
                active: desertKnight.active,
                activatedThisTurn: desertKnight.active,
                actedThisTurn: false,
                promotedThisTurn: false,
              },
            }
          : withoutDeserted;

      const finalPlayers =
        canPlaceAtSpot && chosenLevel
          ? withReturnedSupply.map((p) =>
              p.id === playerId ? takeKnightFromSupplyPure(p, chosenLevel) : p
            )
          : withReturnedSupply;

      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: nextKnights,
        players: finalPlayers,
      };
      const targetName =
        stateAfterConsume.players.find((p) => p.id === targetPid)?.name ??
        "an opponent";
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Deserter against ${targetName}!`,
        playerId,
        { cardType: card.type, targetPlayerId: targetPid }
      );
    }

    case "diplomat": {
      const edgeId = params?.edgeId;
      const removable = getDiplomatRemovableRoadEdges(stateAfterConsume);
      if (!edgeId || !removable.includes(edgeId)) {
        throw new Error("Invalid Diplomat road edge");
      }
      const removedRoute = stateAfterConsume.edges[edgeId]!;
      const withoutEdge = Object.fromEntries(
        Object.entries(stateAfterConsume.edges).filter(([k]) => k !== edgeId)
      );
      const afterRemove: CatanState = {
        ...stateAfterConsume,
        edges: withoutEdge,
        players: stateAfterConsume.players.map((p) =>
          p.id === removedRoute.ownerId
            ? { ...p, roadsRemaining: p.roadsRemaining + 1 }
            : p
        ),
      };

      const rebuildId = params?.rebuildEdgeId;
      const canRebuild =
        removedRoute.ownerId === playerId &&
        rebuildId &&
        getLegalRoadEdgesFn(afterRemove, playerId).includes(rebuildId);

      const finalState: CatanState =
        canRebuild && rebuildId
          ? {
              ...afterRemove,
              edges: {
                ...afterRemove.edges,
                [rebuildId]: {
                  ownerId: playerId,
                  type: "road",
                  builtOnTurn: afterRemove.turn,
                },
              },
              players: afterRemove.players.map((p) =>
                p.id === playerId
                  ? { ...p, roadsRemaining: p.roadsRemaining - 1 }
                  : p
              ),
            }
          : afterRemove;

      return pushEvent(
        finalState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Diplomat.`,
        playerId,
        { cardType: card.type, edgeId, rebuildEdgeId: rebuildId }
      );
    }

    case "saboteur": {
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const pendingDiscards = stateAfterConsume.players.reduce<
        Record<string, number>
      >((acc, opp) => {
        if (opp.id === playerId) return acc;
        if (computeVpFn(stateAfterConsume, opp.id, true) < myVp) return acc;
        const handTotal =
          RESOURCES.reduce<number>((s, r) => s + opp.resources[r], 0) +
          totalCommodityCount(opp.commodities);
        const drop = Math.floor(handTotal / 2);
        return drop > 0 ? { ...acc, [opp.id]: drop } : acc;
      }, {});

      const nextState: CatanState = {
        ...stateAfterConsume,
        pendingDiscards,
        phaseAfterDiscard: "MAIN_PHASE",
        phase:
          Object.keys(pendingDiscards).length > 0
            ? "DISCARD_ON_SEVEN"
            : "MAIN_PHASE",
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Saboteur!`,
        playerId,
        { cardType: card.type }
      );
    }

    case "spy": {
      const targetPid = params?.targetPlayerId;
      const victim = stateAfterConsume.players.find((p) => p.id === targetPid);
      if (!victim || victim.id === playerId || victim.progressCards.length === 0) {
        throw new Error("Invalid Spy target player");
      }
      const [stolenCard, nextRng] = pickPure(
        stateAfterConsume.rngState,
        victim.progressCards
      );
      const nextPlayers = stateAfterConsume.players.map((p) => {
        if (p.id === victim.id) {
          return {
            ...p,
            progressCards: p.progressCards.filter((c) => c.id !== stolenCard.id),
          };
        }
        if (p.id === playerId) {
          return {
            ...p,
            progressCards: [...p.progressCards, stolenCard],
          };
        }
        return p;
      });
      const updatedActor = nextPlayers.find((p) => p.id === playerId)!;
      const nextPendingDiscards =
        updatedActor.progressCards.length > 4 &&
        !stateAfterConsume.pendingProgressDiscards.includes(playerId)
          ? [...stateAfterConsume.pendingProgressDiscards, playerId]
          : stateAfterConsume.pendingProgressDiscards;

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: nextRng,
        players: nextPlayers,
        pendingProgressDiscards: nextPendingDiscards,
        phase:
          nextPendingDiscards.length > 0
            ? "PROGRESS_CARD_SELECTION"
            : stateAfterConsume.phase,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Spy and stole 1 Progress Card from ${victim.name}.`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id }
      );
    }

    case "wedding": {
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const leaders = stateAfterConsume.players.filter(
        (opp) =>
          opp.id !== playerId &&
          computeVpFn(stateAfterConsume, opp.id, true) > myVp
      );

      const gifted = leaders.reduce<{
        rngState: RngState;
        players: CatanPlayerState[];
        totalGained: number;
      }>(
        (acc, leader) => {
          const step1 = (() => {
            const curLeader = acc.players.find((p) => p.id === leader.id)!;
            const [g1, r1] = drawOneRandomHandGoodPure(acc.rngState, curLeader);
            if (!g1) return { rng: r1, players: acc.players, gained: 0 };
            return {
              rng: r1,
              players: transferGoodBetweenPlayersPure(
                acc.players,
                leader.id,
                playerId,
                g1,
                1
              ),
              gained: 1,
            };
          })();
          const curLeader2 = step1.players.find((p) => p.id === leader.id)!;
          const [g2, r2] = drawOneRandomHandGoodPure(step1.rng, curLeader2);
          if (!g2) {
            return {
              rngState: r2,
              players: step1.players,
              totalGained: acc.totalGained + step1.gained,
            };
          }
          return {
            rngState: r2,
            players: transferGoodBetweenPlayersPure(
              step1.players,
              leader.id,
              playerId,
              g2,
              1
            ),
            totalGained: acc.totalGained + step1.gained + 1,
          };
        },
        {
          rngState: stateAfterConsume.rngState,
          players: stateAfterConsume.players,
          totalGained: 0,
        }
      );

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: gifted.rngState,
        players: gifted.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Wedding and received ${gifted.totalGained} gift card(s).`,
        playerId,
        { cardType: card.type, totalGained: gifted.totalGained }
      );
    }

    case "merchant": {
      const hexId = params?.hexId;
      const tile = hexId ? stateAfterConsume.hexes[hexId] : undefined;
      const hNode = hexId ? stateAfterConsume.topology.hexes[hexId] : undefined;
      if (
        !hexId ||
        !tile ||
        !hNode ||
        !TERRAIN_TO_RESOURCE[tile.terrain] ||
        !hNode.cornerVertexIds.some(
          (vId) => stateAfterConsume.buildings[vId]?.ownerId === playerId
        )
      ) {
        throw new Error("Invalid Merchant hex");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        merchantHexId: hexId,
        merchantOwnerId: playerId,
      };
      const res = TERRAIN_TO_RESOURCE[tile.terrain]!;
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} placed the Merchant on ${tile.terrain} (+1 VP and 2:1 ${res} trade).`,
        playerId,
        { cardType: card.type, hexId }
      );
    }

    case "resource_monopoly": {
      const res = params?.resource;
      if (!res || !isResourceType(res)) {
        throw new Error("Invalid Resource Monopoly resource");
      }
      const taken = stateAfterConsume.players.reduce<{
        players: CatanPlayerState[];
        total: number;
      }>(
        (acc, opp) => {
          if (opp.id === playerId) return acc;
          const amt = Math.min(2, opp.resources[res]);
          if (amt <= 0) return acc;
          return {
            players: transferGoodBetweenPlayersPure(
              acc.players,
              opp.id,
              playerId,
              res,
              amt
            ),
            total: acc.total + amt,
          };
        },
        { players: stateAfterConsume.players, total: 0 }
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: taken.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Resource Monopoly on ${res} and collected ${taken.total} card(s).`,
        playerId,
        { cardType: card.type, resource: res, total: taken.total }
      );
    }

    case "trade_monopoly": {
      const comm = params?.commodity;
      if (!comm || !isCommodityType(comm)) {
        throw new Error("Invalid Trade Monopoly commodity");
      }
      const taken = stateAfterConsume.players.reduce<{
        players: CatanPlayerState[];
        total: number;
      }>(
        (acc, opp) => {
          if (opp.id === playerId) return acc;
          const amt = Math.min(1, opp.commodities[comm]);
          if (amt <= 0) return acc;
          return {
            players: transferGoodBetweenPlayersPure(
              acc.players,
              opp.id,
              playerId,
              comm,
              amt
            ),
            total: acc.total + amt,
          };
        },
        { players: stateAfterConsume.players, total: 0 }
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: taken.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Trade Monopoly on ${comm} and collected ${taken.total} card(s).`,
        playerId,
        { cardType: card.type, commodity: comm, total: taken.total }
      );
    }

    case "merchant_fleet": {
      const good = params?.good;
      if (!good || !(TRADE_GOODS as readonly string[]).includes(good)) {
        throw new Error("Invalid Merchant Fleet good");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                activeTurnDiscounts: {
                  ...p.activeTurnDiscounts,
                  merchantFleetGood: good,
                },
              }
            : p
        ),
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Merchant Fleet (2:1 bank trade on ${good} this turn).`,
        playerId,
        { cardType: card.type, good }
      );
    }

    case "master_merchant": {
      const targetPid = params?.targetPlayerId;
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const victim = stateAfterConsume.players.find((p) => p.id === targetPid);
      if (
        !victim ||
        victim.id === playerId ||
        computeVpFn(stateAfterConsume, victim.id, true) <= myVp
      ) {
        throw new Error("Invalid Master Merchant target");
      }
      const [g1, r1] = drawOneRandomHandGoodPure(
        stateAfterConsume.rngState,
        victim
      );
      const players1 = g1
        ? transferGoodBetweenPlayersPure(
            stateAfterConsume.players,
            victim.id,
            playerId,
            g1,
            1
          )
        : stateAfterConsume.players;
      const victimAfter1 = players1.find((p) => p.id === victim.id)!;
      const [g2, r2] = drawOneRandomHandGoodPure(r1, victimAfter1);
      const players2 = g2
        ? transferGoodBetweenPlayersPure(players1, victim.id, playerId, g2, 1)
        : players1;
      const count = (g1 ? 1 : 0) + (g2 ? 1 : 0);

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: r2,
        players: players2,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Master Merchant and took ${count} card(s) from ${victim.name}.`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id, count }
      );
    }

    case "commercial_harbor": {
      const res = params?.resource;
      if (!res || !isResourceType(res) || actor.resources[res] <= 0) {
        throw new Error("Invalid Commercial Harbor resource");
      }
      const opponents = stateAfterConsume.players.filter(
        (opp) => opp.id !== playerId && totalCommodityCount(opp.commodities) > 0
      );

      const traded = opponents.reduce<{
        rngState: RngState;
        players: CatanPlayerState[];
        swaps: number;
      }>(
        (acc, opp) => {
          const curActor = acc.players.find((p) => p.id === playerId)!;
          const giveRes =
            curActor.resources[res] > 0
              ? res
              : RESOURCES.find((r) => curActor.resources[r] > 0);
          if (!giveRes) return acc;

          const curOpp = acc.players.find((p) => p.id === opp.id)!;
          const commPool = COMMODITIES.flatMap((c) =>
            Array.from({ length: curOpp.commodities[c] }, () => c)
          );
          if (commPool.length === 0) return acc;

          const [chosenComm, nextRng] = pickPure(acc.rngState, commPool);
          const pAfterGive = transferGoodBetweenPlayersPure(
            acc.players,
            playerId,
            opp.id,
            giveRes,
            1
          );
          const pAfterRecv = transferGoodBetweenPlayersPure(
            pAfterGive,
            opp.id,
            playerId,
            chosenComm,
            1
          );
          return {
            rngState: nextRng,
            players: pAfterRecv,
            swaps: acc.swaps + 1,
          };
        },
        {
          rngState: stateAfterConsume.rngState,
          players: stateAfterConsume.players,
          swaps: 0,
        }
      );

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: traded.rngState,
        players: traded.players,
      };
      return pushEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Commercial Harbor and completed ${traded.swaps} commodity exchange(s).`,
        playerId,
        { cardType: card.type, swaps: traded.swaps }
      );
    }

    default:
      throw new Error(`Unsupported Progress Card in MAIN_PHASE: ${card.type}`);
  }
}
