import {
  type EdgeId,
  type GameEvent,
  type HexId,
  type InvariantCheckResult,
  type PlayerDescriptor,
  type VertexId,
  computeLongestSimpleEdgePath,
  createRngState,
  nextIntPure,
  pickPure,
  roll2d6Pure,
} from "@gaming-platform/core";
import {
  SCENARIO_CATALOG,
  createDevCardDeckPure,
  generateCatanBoardPure,
} from "./board.ts";
import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanConfig,
  type CatanPlayerState,
  type CatanState,
  type DevCardInstance,
  type DevCardType,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  TERRAIN_TO_RESOURCE,
} from "./types.ts";

export const PLAYER_COLORS = [
  "#e63946", // Red
  "#2563eb", // Blue
  "#f59e0b", // Orange
  "#10b981", // Green (or White/Emerald for visibility)
  "#8b5cf6", // Purple / Brown-5P
  "#ec4899", // Rose / 6P
];

export function emptyResources(): ResourceMap {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}

export function totalResourceCount(res: Partial<ResourceMap>): number {
  return RESOURCES.reduce<number>((sum, r) => sum + (res[r] ?? 0), 0);
}

export function getPlayerResourceCount(
  player: Pick<CatanPlayerState, "resources" | "hiddenResourceCount">
): number {
  if (typeof player.hiddenResourceCount === "number") {
    return player.hiddenResourceCount;
  }
  return totalResourceCount(player.resources);
}

export function hasResources(hand: ResourceMap, cost: Partial<ResourceMap>): boolean {
  return RESOURCES.every((r) => (hand[r] ?? 0) >= (cost[r] ?? 0));
}

export function addResourcesPure(
  target: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  return {
    brick: target.brick + (delta.brick ?? 0),
    lumber: target.lumber + (delta.lumber ?? 0),
    wool: target.wool + (delta.wool ?? 0),
    grain: target.grain + (delta.grain ?? 0),
    ore: target.ore + (delta.ore ?? 0),
  };
}

export function subtractResourcesPure(
  target: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  return {
    brick: target.brick - (delta.brick ?? 0),
    lumber: target.lumber - (delta.lumber ?? 0),
    wool: target.wool - (delta.wool ?? 0),
    grain: target.grain - (delta.grain ?? 0),
    ore: target.ore - (delta.ore ?? 0),
  };
}

export function addResources(target: ResourceMap, delta: Partial<ResourceMap>): ResourceMap {
  const next = addResourcesPure(target, delta);
  Object.assign(target, next);
  return next;
}

export function subtractResources(
  target: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  const next = subtractResourcesPure(target, delta);
  Object.assign(target, next);
  return next;
}

function omitRecordKey<V>(
  record: Readonly<Record<string, V>>,
  keyToOmit: string
): Record<string, V> {
  return Object.fromEntries(
    Object.entries(record).filter(([k]) => k !== keyToOmit)
  );
}

function updatePlayerById(
  players: readonly CatanPlayerState[],
  playerId: string,
  updater: (player: CatanPlayerState) => CatanPlayerState
): CatanPlayerState[] {
  return players.map((p) => (p.id === playerId ? updater(p) : p));
}

function markFirstPlayableDevCardUsed(
  devCards: readonly DevCardInstance[],
  type: DevCardType,
  currentTurn: number
): DevCardInstance[] {
  const targetIdx = devCards.findIndex(
    (c) => !c.played && c.type === type && c.boughtOnTurn < currentTurn
  );
  if (targetIdx < 0) {
    return devCards.slice();
  }
  return devCards.map((c, idx) => (idx === targetIdx ? { ...c, played: true } : c));
}

export function resolveDefaultConfig(
  playerCount: number,
  partial?: Partial<CatanConfig>
): CatanConfig {
  const defaultScenario =
    partial?.scenarioId ?? (playerCount >= 5 ? "big_island_5_6" : "standard");
  const descriptor = SCENARIO_CATALOG[defaultScenario] ?? SCENARIO_CATALOG.standard;

  const targetVp =
    partial?.targetVictoryPoints ??
    descriptor.defaultTargetVp + (partial?.enableHarbormaster ? 1 : 0);

  return {
    scenarioId: defaultScenario,
    targetVictoryPoints: targetVp,
    balancedNumbers: partial?.balancedNumbers ?? true,
    enableSpecialBuildingPhase:
      partial?.enableSpecialBuildingPhase ??
      (playerCount >= 5 || descriptor.enableSpecialBuildingPhase),
    enableSeafarers: partial?.enableSeafarers ?? descriptor.enableSeafarers,
    enableHarbormaster: partial?.enableHarbormaster ?? false,
    enableCityWalls: partial?.enableCityWalls ?? false,
    enableFriendlyRobber: partial?.enableFriendlyRobber ?? false,
    startingPlayerIndex: partial?.startingPlayerIndex,
    randomizeStartingPlayer: partial?.randomizeStartingPlayer,
    maxTurns: partial?.maxTurns ?? 400,
  };
}

/**
 * Computes a player's Victory Points.
 * When `visibleOnly` is true, hidden Victory Point development cards are excluded.
 */
export function computePlayerVictoryPoints(
  state: CatanState,
  playerId: string,
  visibleOnly = false
): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const buildingVp = Object.values(state.buildings).reduce<number>(
    (sum, b) => (b.ownerId === playerId ? sum + (b.type === "city" ? 2 : 1) : sum),
    0
  );
  const longestRoadVp = state.longestRoadOwnerId === playerId ? 2 : 0;
  const largestArmyVp = state.largestArmyOwnerId === playerId ? 2 : 0;
  const harbormasterVp =
    state.config.enableHarbormaster && state.harbormasterOwnerId === playerId ? 2 : 0;
  const hiddenCardVp = visibleOnly
    ? 0
    : player.devCards.reduce<number>(
        (sum, card) => (card.type === "victory_point" ? sum + 1 : sum),
        0
      );

  return (
    player.bonusVictoryPoints +
    buildingVp +
    longestRoadVp +
    largestArmyVp +
    harbormasterVp +
    hiddenCardVp
  );
}

/**
 * Computes each resource's maritime trade ratio (4, 3, or 2) for `playerId` based on harbors.
 */
export function getPlayerTradeRatios(
  state: CatanState,
  playerId: string
): Record<ResourceType, number> {
  return state.harbors.reduce<Record<ResourceType, number>>(
    (ratios, harbor) => {
      const ownsHarbor = harbor.vertexIds.some(
        (vId) => state.buildings[vId]?.ownerId === playerId
      );
      if (!ownsHarbor) return ratios;
      if (harbor.type === "generic") {
        return {
          brick: Math.min(ratios.brick, 3),
          lumber: Math.min(ratios.lumber, 3),
          wool: Math.min(ratios.wool, 3),
          grain: Math.min(ratios.grain, 3),
          ore: Math.min(ratios.ore, 3),
        };
      }
      return {
        ...ratios,
        [harbor.type]: 2,
      };
    },
    { brick: 4, lumber: 4, wool: 4, grain: 4, ore: 4 }
  );
}

/**
 * Returns the maximum cards `playerId` can hold when a 7 is rolled without discarding.
 * Base is 7; each City Wall adds +2 cards.
 */
export function getPlayerSafeHandLimit(state: CatanState, playerId: string): number {
  if (!state.config.enableCityWalls) return 7;
  const wallBonus = Object.values(state.buildings).reduce<number>(
    (bonus, b) =>
      b.ownerId === playerId && b.type === "city" && b.hasWall ? bonus + 2 : bonus,
    0
  );
  return 7 + wallBonus;
}

/**
 * Purely recalculates Longest Road / Longest Trade Route, Largest Army, and Harbormaster awards.
 */
export function recalculateAwardsPure(state: CatanState): CatanState {
  const harborVertexIds = Array.from(
    new Set(state.harbors.flatMap((h) => [h.vertexIds[0], h.vertexIds[1]]))
  );

  const nextPlayers = state.players.map((player) => {
    const playerEdges = Object.entries(state.edges)
      .filter(([, e]) => e.ownerId === player.id)
      .map(([eId]) => eId);

    const blockedVertices = new Set<VertexId>(
      Object.entries(state.buildings)
        .filter(([, b]) => b.ownerId !== player.id)
        .map(([vId]) => vId)
    );

    const roadResult = computeLongestSimpleEdgePath(
      state.topology,
      playerEdges,
      blockedVertices,
      (prevEdgeId, nextEdgeId, sharedVertexId) => {
        const e1 = state.edges[prevEdgeId];
        const e2 = state.edges[nextEdgeId];
        if (!e1 || !e2) return false;
        if (e1.type !== e2.type) {
          // Road <-> Ship transition requires a player-owned building at sharedVertexId
          return state.buildings[sharedVertexId]?.ownerId === player.id;
        }
        return true;
      }
    );

    const harborPoints = harborVertexIds.reduce<number>((pts, vId) => {
      const b = state.buildings[vId];
      if (b && b.ownerId === player.id) {
        return pts + (b.type === "city" ? 2 : 1);
      }
      return pts;
    }, 0);

    return {
      ...player,
      longestRoadLength: roadResult.length,
      harborPoints,
    };
  });

  // 1. Longest Road / Trade Route
  const maxRoad = Math.max(0, ...nextPlayers.map((p) => p.longestRoadLength));
  const nextRoadAward = (() => {
    if (maxRoad < 5) {
      return { ownerId: null as string | null, length: 0 };
    }
    const leaders = nextPlayers.filter((p) => p.longestRoadLength === maxRoad);
    if (
      state.longestRoadOwnerId &&
      leaders.some((p) => p.id === state.longestRoadOwnerId)
    ) {
      return { ownerId: state.longestRoadOwnerId, length: maxRoad };
    }
    if (leaders.length === 1) {
      return { ownerId: leaders[0]!.id, length: maxRoad };
    }
    return { ownerId: null as string | null, length: 0 };
  })();

  // 2. Largest Army (>= 3 knights played)
  const nextArmyAward = nextPlayers.reduce(
    (acc, player) =>
      player.knightsPlayed >= 3 && player.knightsPlayed > acc.size
        ? { ownerId: player.id as string | null, size: player.knightsPlayed }
        : acc,
    { ownerId: state.largestArmyOwnerId, size: state.largestArmySize }
  );

  // 3. Harbormaster (>= 3 harbor points)
  const nextHarborAward = state.config.enableHarbormaster
    ? nextPlayers.reduce(
        (acc, player) =>
          player.harborPoints >= 3 && player.harborPoints > acc.points
            ? { ownerId: player.id as string | null, points: player.harborPoints }
            : acc,
        { ownerId: state.harbormasterOwnerId, points: state.harbormasterPoints }
      )
    : { ownerId: state.harbormasterOwnerId, points: state.harbormasterPoints };

  return {
    ...state,
    players: nextPlayers,
    longestRoadOwnerId: nextRoadAward.ownerId,
    longestRoadLength: nextRoadAward.length,
    largestArmyOwnerId: nextArmyAward.ownerId,
    largestArmySize: nextArmyAward.size,
    harbormasterOwnerId: nextHarborAward.ownerId,
    harbormasterPoints: nextHarborAward.points,
  };
}

/**
 * Backwards-compatible wrapper around `recalculateAwardsPure`.
 */
export function recalculateAwards(state: CatanState): CatanState {
  const next = recalculateAwardsPure(state);
  Object.assign(state, next);
  return next;
}

/**
 * Purely checks whether `actingPlayerId` has reached the target Victory Points.
 */
export function checkAndAssignWinnerPure(
  state: CatanState,
  actingPlayerId: string
): { state: CatanState; won: boolean } {
  const awarded = recalculateAwardsPure(state);
  const vp = computePlayerVictoryPoints(awarded, actingPlayerId, false);
  if (vp >= awarded.config.targetVictoryPoints) {
    return {
      state: {
        ...awarded,
        winnerId: actingPlayerId,
        phase: "GAME_OVER",
      },
      won: true,
    };
  }
  return { state: awarded, won: false };
}

/**
 * Backwards-compatible wrapper around `checkAndAssignWinnerPure`.
 */
export function checkAndAssignWinner(state: CatanState, actingPlayerId: string): boolean {
  const result = checkAndAssignWinnerPure(state, actingPlayerId);
  Object.assign(state, result.state);
  return result.won;
}

/**
 * Initializes a new Catan game state purely from `playerDescriptors`, `partialConfig`, and `seed`.
 */
export function initCatanGame(
  playerDescriptors: readonly PlayerDescriptor[],
  partialConfig?: Partial<CatanConfig>,
  seed: number | string = Date.now()
): CatanState {
  if (playerDescriptors.length < 2 || playerDescriptors.length > 6) {
    throw new Error("Catan requires between 2 and 6 players");
  }

  const config = resolveDefaultConfig(playerDescriptors.length, partialConfig);
  const rng0 = createRngState(seed);
  const [board, rng1] = generateCatanBoardPure(config, rng0);
  const isExpanded = playerDescriptors.length >= 5 || config.scenarioId === "big_island_5_6";
  const bankPerResource = isExpanded ? 24 : 19;

  const players: CatanPlayerState[] = playerDescriptors.map((p, idx) => ({
    id: p.id,
    name: p.name,
    color: p.color || PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: Boolean(p.isBot),
    botDifficulty: p.botDifficulty ?? "smart",
    resources: emptyResources(),
    devCards: [],
    knightsPlayed: 0,
    roadsRemaining: 15,
    shipsRemaining: config.enableSeafarers ? 15 : 0,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    cityWallsRemaining: config.enableCityWalls ? 3 : 0,
    longestRoadLength: 0,
    harborPoints: 0,
    bonusVictoryPoints: 0,
    settledIslandIds: [],
    homeIslandIds: [],
    hasPlayedDevCardThisTurn: false,
    hasMovedShipThisTurn: false,
  }));

  const [devCardDeck, rng2] = createDevCardDeckPure(isExpanded, rng1);
  const [startingPlayerIndex, rng3] =
    typeof config.startingPlayerIndex === "number" &&
    Number.isFinite(config.startingPlayerIndex)
      ? [
          ((Math.trunc(config.startingPlayerIndex) % players.length) +
            players.length) %
            players.length,
          rng2,
        ]
      : config.randomizeStartingPlayer
        ? nextIntPure(rng2, 0, players.length - 1)
        : [0, rng2];

  return {
    gameId: "catan",
    config,
    rngState: rng3,
    turn: 1,
    phase: "SETUP_SETTLEMENT_1",
    phaseAfterRobber: "MAIN_PHASE",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    specialBuildPlayerIndex: null,
    lastSetupSettlementVertexId: null,
    players,
    bank: {
      brick: bankPerResource,
      lumber: bankPerResource,
      wool: bankPerResource,
      grain: bankPerResource,
      ore: bankPerResource,
    },
    devCardDeck,
    topology: board.topology,
    hexes: board.hexes,
    harbors: board.harbors,
    buildings: {},
    edges: {},
    robberHexId: board.robberHexId,
    pirateHexId: board.pirateHexId,
    fogPool: board.fogPool,
    lastRoll: null,
    pendingDiscards: {},
    pendingGoldPicks: {},
    stealCandidates: [],
    freeRoadsRemaining: 0,
    activeTradeOffer: null,
    longestRoadOwnerId: null,
    longestRoadLength: 0,
    largestArmyOwnerId: null,
    largestArmySize: 0,
    harbormasterOwnerId: null,
    harbormasterPoints: 0,
    winnerId: null,
    eventLog: [
      {
        id: "evt-0",
        timestamp: 0,
        turn: 1,
        type: "GAME_STARTED",
        message: `Started ${SCENARIO_CATALOG[config.scenarioId].name} with ${players.length} players (${players[startingPlayerIndex]!.name} goes first · Target: ${config.targetVictoryPoints} VP).`,
      },
    ],
  };
}

/**
 * Returns all valid vertices where `playerId` can build a Settlement.
 */
export function getLegalSettlementVertices(
  state: CatanState,
  playerId: string,
  isSetup: boolean
): VertexId[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.settlementsRemaining <= 0) return [];

  return state.topology.vertexOrder.filter((vId) => {
    if (state.buildings[vId]) return false;
    const vNode = state.topology.vertices[vId]!;

    // Distance rule: no adjacent vertex can have a building
    const hasAdjacentBuilding = vNode.adjacentVertexIds.some((adjId) =>
      Boolean(state.buildings[adjId])
    );
    if (hasAdjacentBuilding) return false;

    // Must touch at least one land hex
    const adjTiles = vNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) return false;

    if (isSetup) {
      return adjTiles.some(
        (t) => t.allowSetupSettlement && t.terrain !== "sea" && t.terrain !== "fog"
      );
    }

    // Must connect to at least one road or ship owned by playerId
    return vNode.incidentEdgeIds.some((eId) => state.edges[eId]?.ownerId === playerId);
  });
}

/**
 * Returns all valid edges where `playerId` can build a Road.
 */
export function getLegalRoadEdges(
  state: CatanState,
  playerId: string,
  setupAnchorVertexId: VertexId | null = null
): EdgeId[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.roadsRemaining <= 0) return [];

  return state.topology.edgeOrder.filter((eId) => {
    if (state.edges[eId]) return false;
    const eNode = state.topology.edges[eId]!;

    // Road must border at least one land hex
    const adjTiles = eNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) return false;

    if (setupAnchorVertexId) {
      return eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId;
    }

    // Normal play: check if v1 or v2 connects to player's network without being blocked
    return [eNode.v1, eNode.v2].some((vId) => {
      const building = state.buildings[vId];
      if (building) {
        return building.ownerId === playerId;
      }
      const vNode = state.topology.vertices[vId]!;
      return vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return Boolean(route && route.ownerId === playerId && route.type === "road");
      });
    });
  });
}

/**
 * Returns all valid edges where `playerId` can build a Ship (Seafarers).
 */
export function getLegalShipEdges(
  state: CatanState,
  playerId: string,
  setupAnchorVertexId: VertexId | null = null
): EdgeId[] {
  if (!state.config.enableSeafarers) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.shipsRemaining <= 0) return [];

  return state.topology.edgeOrder.filter((eId) => {
    if (state.edges[eId]) return false;
    const eNode = state.topology.edges[eId]!;

    // Cannot build ship adjacent to the Pirate Fleet
    if (state.pirateHexId && eNode.adjacentHexIds.includes(state.pirateHexId)) {
      return false;
    }

    // Ship must border at least one sea hex
    const adjTiles = eNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesSea = adjTiles.some((t) => t.terrain === "sea");
    if (!touchesSea) return false;

    if (setupAnchorVertexId) {
      return eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId;
    }

    return [eNode.v1, eNode.v2].some((vId) => {
      const building = state.buildings[vId];
      if (building) {
        return building.ownerId === playerId;
      }
      const vNode = state.topology.vertices[vId]!;
      return vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return Boolean(route && route.ownerId === playerId && route.type === "ship");
      });
    });
  });
}

/**
 * Returns movable open ships and their target edges for Seafarers `MOVE_SHIP` without mutating `state`.
 */
export function getLegalMoveShipActions(
  state: CatanState,
  playerId: string
): Array<{ type: "MOVE_SHIP"; fromEdgeId: EdgeId; toEdgeId: EdgeId }> {
  if (!state.config.enableSeafarers) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasMovedShipThisTurn) return [];

  const movableFromEdges = Object.entries(state.edges)
    .filter(([eId, route]) => {
      if (route.ownerId !== playerId || route.type !== "ship") return false;
      if (route.builtOnTurn >= state.turn) return false; // Cannot move a ship built this turn

      const eNode = state.topology.edges[eId]!;
      if (state.pirateHexId && eNode.adjacentHexIds.includes(state.pirateHexId)) {
        return false; // Pinned by Pirate
      }

      const isEndpointOpen = (vId: VertexId): boolean => {
        if (state.buildings[vId]?.ownerId === playerId) return false;
        const vNode = state.topology.vertices[vId]!;
        const otherOwnEdges = vNode.incidentEdgeIds.filter(
          (incId) => incId !== eId && state.edges[incId]?.ownerId === playerId
        );
        return otherOwnEdges.length === 0;
      };

      return isEndpointOpen(eNode.v1) || isEndpointOpen(eNode.v2);
    })
    .map(([eId]) => eId);

  if (movableFromEdges.length === 0) return [];

  return movableFromEdges.flatMap((fromEdgeId) => {
    const candidateState: CatanState = {
      ...state,
      edges: omitRecordKey(state.edges, fromEdgeId),
      players: updatePlayerById(state.players, playerId, (p) => ({
        ...p,
        shipsRemaining: p.shipsRemaining + 1,
      })),
    };

    return getLegalShipEdges(candidateState, playerId, null)
      .filter((toEdgeId) => toEdgeId !== fromEdgeId)
      .map((toEdgeId) => ({
        type: "MOVE_SHIP" as const,
        fromEdgeId,
        toEdgeId,
      }));
  });
}

/**
 * Returns valid land hexes where `playerId` can move the Robber.
 * Respects `enableFriendlyRobber` if configured.
 */
export function getLegalRobberHexes(state: CatanState, playerId: string): HexId[] {
  const allLandHexes = state.topology.hexOrder.filter((hId) => {
    const t = state.hexes[hId]!;
    return (
      hId !== state.robberHexId &&
      t.terrain !== "sea" &&
      t.terrain !== "fog"
    );
  });

  if (!state.config.enableFriendlyRobber) {
    return allLandHexes;
  }

  const friendlyFiltered = allLandHexes.filter((hId) => {
    const hNode = state.topology.hexes[hId]!;
    return hNode.cornerVertexIds.every((vId) => {
      const b = state.buildings[vId];
      if (!b || b.ownerId === playerId) return true;
      return computePlayerVictoryPoints(state, b.ownerId, true) > 2;
    });
  });

  return friendlyFiltered.length > 0 ? friendlyFiltered : allLandHexes;
}

/**
 * Returns valid sea hexes where `playerId` can move the Pirate Fleet (Seafarers).
 */
export function getLegalPirateHexes(state: CatanState): HexId[] {
  if (!state.config.enableSeafarers) return [];
  return state.topology.hexOrder.filter((hId) => {
    const t = state.hexes[hId]!;
    return hId !== state.pirateHexId && t.terrain === "sea";
  });
}

/**
 * Generates deterministic discard options for a player who needs to discard `count` cards.
 * Also allows arbitrary valid combinations in `applyAction`.
 */
function buildGreedyDiscardOption(
  hand: ResourceMap,
  orderedResources: readonly ResourceType[],
  discardCount: number
): { option: Partial<ResourceMap>; remaining: number } {
  return orderedResources.reduce<{ option: Partial<ResourceMap>; remaining: number }>(
    (acc, r) => {
      const take = Math.min(hand[r], acc.remaining);
      if (take <= 0) return acc;
      return {
        option: { ...acc.option, [r]: take },
        remaining: acc.remaining - take,
      };
    },
    { option: {}, remaining: discardCount }
  );
}

function generateDiscardActions(
  hand: ResourceMap,
  discardCount: number
): Array<{ type: "DISCARD_CARDS"; resources: Partial<ResourceMap> }> {
  const byAbundance = [...RESOURCES].sort((a, b) => hand[b] - hand[a]);
  const first = buildGreedyDiscardOption(hand, byAbundance, discardCount);
  const lowPriority: readonly ResourceType[] = [
    "wool",
    "lumber",
    "brick",
    "grain",
    "ore",
  ];
  const second = buildGreedyDiscardOption(hand, lowPriority, discardCount);

  return [
    ...(first.remaining === 0
      ? [{ type: "DISCARD_CARDS" as const, resources: first.option }]
      : []),
    ...(second.remaining === 0 &&
    JSON.stringify(second.option) !== JSON.stringify(first.option)
      ? [{ type: "DISCARD_CARDS" as const, resources: second.option }]
      : []),
  ];
}

function canPlayDevCard(
  state: CatanState,
  player: CatanPlayerState,
  type: DevCardType
): boolean {
  if (player.hasPlayedDevCardThisTurn) return false;
  return player.devCards.some(
    (c) => !c.played && c.type === type && c.boughtOnTurn < state.turn
  );
}

function getBuildActionsPure(
  state: CatanState,
  player: CatanPlayerState
): CatanAction[] {
  const settlementActions: CatanAction[] =
    player.settlementsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.settlement)
      ? getLegalSettlementVertices(state, player.id, false).map((vertexId) => ({
          type: "BUILD_SETTLEMENT",
          vertexId,
        }))
      : [];

  const cityActions: CatanAction[] =
    player.citiesRemaining > 0 && hasResources(player.resources, BUILDING_COSTS.city)
      ? Object.entries(state.buildings)
          .filter(([, b]) => b.ownerId === player.id && b.type === "settlement")
          .map(([vertexId]) => ({ type: "BUILD_CITY", vertexId }))
      : [];

  const cityWallActions: CatanAction[] =
    state.config.enableCityWalls &&
    player.cityWallsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.cityWall)
      ? Object.entries(state.buildings)
          .filter(
            ([, b]) => b.ownerId === player.id && b.type === "city" && !b.hasWall
          )
          .map(([vertexId]) => ({ type: "BUILD_CITY_WALL", vertexId }))
      : [];

  const devCardActions: CatanAction[] =
    state.devCardDeck.length > 0 &&
    hasResources(player.resources, BUILDING_COSTS.devCard)
      ? [{ type: "BUY_DEV_CARD" }]
      : [];

  const roadActions: CatanAction[] =
    player.roadsRemaining > 0 && hasResources(player.resources, BUILDING_COSTS.road)
      ? getLegalRoadEdges(state, player.id, null).map((edgeId) => ({
          type: "BUILD_ROAD",
          edgeId,
        }))
      : [];

  const shipActions: CatanAction[] =
    state.config.enableSeafarers &&
    player.shipsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.ship)
      ? getLegalShipEdges(state, player.id, null).map((edgeId) => ({
          type: "BUILD_SHIP",
          edgeId,
        }))
      : [];

  return [
    ...settlementActions,
    ...cityActions,
    ...cityWallActions,
    ...devCardActions,
    ...roadActions,
    ...shipActions,
  ];
}

/**
 * Returns all legal actions for `playerId` in the current `state`.
 */
export function getCatanLegalActions(state: CatanState, playerId: string): CatanAction[] {
  if (state.phase === "GAME_OVER") return [];

  const activePlayer = state.players[state.activePlayerIndex]!;

  // Multi-player asynchronous phases (Discard on 7, Gold Resource Selection, Domestic Trade response)
  if (state.phase === "DISCARD_ON_SEVEN") {
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed <= 0) return [];
    const player = state.players.find((p) => p.id === playerId)!;
    return generateDiscardActions(player.resources, needed);
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    const needed = state.pendingGoldPicks[playerId] ?? 0;
    if (needed <= 0) return [];
    const available = RESOURCES.filter((r) => state.bank[r] > 0);
    if (available.length === 0) {
      return [{ type: "SELECT_GOLD_RESOURCE", resource: "grain" }];
    }
    return available.map((r) => ({ type: "SELECT_GOLD_RESOURCE", resource: r }));
  }

  // If there is an active domestic trade offer and a non-active player is responding
  if (state.phase === "MAIN_PHASE" && state.activeTradeOffer && playerId !== activePlayer.id) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    if (
      (offer.toPlayerId === null || offer.toPlayerId === playerId) &&
      !offer.declinedBy.includes(playerId) &&
      !accepted.includes(playerId)
    ) {
      const responder = state.players.find((p) => p.id === playerId);
      if (!responder) return [];
      const canAccept = hasResources(responder.resources, offer.want);
      return canAccept
        ? [
            { type: "ACCEPT_DOMESTIC_TRADE", offerId: offer.id },
            { type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id },
          ]
        : [{ type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id }];
    }
    return [];
  }

  // Special Building Phase (5-6 Player Extension)
  if (state.phase === "SPECIAL_BUILDING") {
    if (state.specialBuildPlayerIndex === null) return [];
    const sbPlayer = state.players[state.specialBuildPlayerIndex]!;
    if (sbPlayer.id !== playerId) return [];

    return [
      ...getBuildActionsPure(state, sbPlayer),
      { type: "END_SPECIAL_BUILD" },
    ];
  }

  // All remaining phases require `playerId === activePlayer.id`
  if (activePlayer.id !== playerId) {
    return [];
  }

  switch (state.phase) {
    case "SETUP_SETTLEMENT_1":
    case "SETUP_SETTLEMENT_2": {
      return getLegalSettlementVertices(state, playerId, true).map((vertexId) => ({
        type: "PLACE_SETUP_SETTLEMENT",
        vertexId,
      }));
    }

    case "SETUP_ROAD_1":
    case "SETUP_ROAD_2": {
      const anchor = state.lastSetupSettlementVertexId;
      const roadActions: CatanAction[] = getLegalRoadEdges(state, playerId, anchor).map(
        (edgeId) => ({
          type: "PLACE_SETUP_EDGE",
          edgeId,
          edgeKind: "road",
        })
      );
      const shipActions: CatanAction[] = getLegalShipEdges(state, playerId, anchor).map(
        (edgeId) => ({
          type: "PLACE_SETUP_EDGE",
          edgeId,
          edgeKind: "ship",
        })
      );
      return [...roadActions, ...shipActions];
    }

    case "PRE_ROLL": {
      return canPlayDevCard(state, activePlayer, "knight")
        ? [{ type: "ROLL_DICE" }, { type: "PLAY_KNIGHT" }]
        : [{ type: "ROLL_DICE" }];
    }

    case "MOVE_ROBBER_OR_PIRATE": {
      const robberActions: CatanAction[] = getLegalRobberHexes(state, playerId).map(
        (hexId) => ({ type: "MOVE_ROBBER", hexId })
      );
      const pirateActions: CatanAction[] = getLegalPirateHexes(state).map((hexId) => ({
        type: "MOVE_PIRATE",
        hexId,
      }));
      return [...robberActions, ...pirateActions];
    }

    case "STEAL_RESOURCE": {
      return state.stealCandidates.map((victimId) => ({
        type: "STEAL_FROM_PLAYER",
        victimId,
      }));
    }

    case "ROAD_BUILDING_DEV": {
      const roads: CatanAction[] = getLegalRoadEdges(state, playerId, null).map(
        (edgeId) => ({ type: "BUILD_ROAD", edgeId })
      );
      const ships: CatanAction[] = getLegalShipEdges(state, playerId, null).map(
        (edgeId) => ({ type: "BUILD_SHIP", edgeId })
      );
      return [...roads, ...ships];
    }

    case "MAIN_PHASE": {
      if (state.activeTradeOffer) {
        const offer = state.activeTradeOffer;
        const wantTotalCount = totalResourceCount(offer.want);
        const confirmActions: CatanAction[] = (offer.acceptedBy ?? [])
          .filter((pid) => {
            const partner = state.players.find((p) => p.id === pid);
            if (!partner || !hasResources(activePlayer.resources, offer.give)) {
              return false;
            }
            return partner.handRedacted
              ? getPlayerResourceCount(partner) >= wantTotalCount
              : hasResources(partner.resources, offer.want);
          })
          .map((partnerId) => ({
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: offer.id,
            partnerId,
          }));
        return [...confirmActions, { type: "CANCEL_DOMESTIC_TRADE" }];
      }

      const buildActions = getBuildActionsPure(state, activePlayer);
      const moveShipActions = getLegalMoveShipActions(state, playerId);

      const knightActions: CatanAction[] = canPlayDevCard(state, activePlayer, "knight")
        ? [{ type: "PLAY_KNIGHT" }]
        : [];

      const roadBuildingActions: CatanAction[] =
        canPlayDevCard(state, activePlayer, "road_building") &&
        (getLegalRoadEdges(state, playerId, null).length > 0 ||
          getLegalShipEdges(state, playerId, null).length > 0)
          ? [{ type: "PLAY_ROAD_BUILDING" }]
          : [];

      const yearOfPlentyActions: CatanAction[] = canPlayDevCard(
        state,
        activePlayer,
        "year_of_plenty"
      )
        ? (() => {
            const avail = RESOURCES.filter((r) => state.bank[r] > 0);
            return avail.flatMap((r1, i) =>
              avail
                .slice(i)
                .filter((r2) => !(r1 === r2 && state.bank[r1] < 2))
                .map((r2) => ({
                  type: "PLAY_YEAR_OF_PLENTY" as const,
                  resource1: r1,
                  resource2: r2,
                }))
            );
          })()
        : [];

      const monopolyActions: CatanAction[] = canPlayDevCard(
        state,
        activePlayer,
        "monopoly"
      )
        ? RESOURCES.map((resource) => ({ type: "PLAY_MONOPOLY", resource }))
        : [];

      const ratios = getPlayerTradeRatios(state, playerId);
      const maritimeActions: CatanAction[] = RESOURCES.flatMap((give) => {
        const ratio = ratios[give];
        if (activePlayer.resources[give] < ratio) return [];
        return RESOURCES.filter(
          (receive) => receive !== give && state.bank[receive] > 0
        ).map((receive) => ({
          type: "MARITIME_TRADE" as const,
          give,
          giveAmount: ratio,
          receive,
        }));
      });

      return [
        ...buildActions,
        ...moveShipActions,
        ...knightActions,
        ...roadBuildingActions,
        ...yearOfPlentyActions,
        ...monopolyActions,
        ...maritimeActions,
        { type: "END_TURN" },
      ];
    }

    default:
      return [];
  }
}

type StateWithEvents = {
  readonly state: CatanState;
  readonly emitted: GameEvent[];
};

/**
 * Pure helper to append an event into `state.eventLog` and `emitted`.
 */
function appendCatanEvent(
  state: CatanState,
  emitted: readonly GameEvent[],
  type: string,
  message: string,
  playerId?: string,
  payload?: unknown
): StateWithEvents {
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
 * Purely reveals any unexplored `fog` hexes adjacent to a newly placed/moved edge (Seafarers: Fog Islands).
 */
function revealAdjacentFogHexesPure(
  state: CatanState,
  edgeId: EdgeId,
  playerId: string,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const eNode = state.topology.edges[edgeId];
  if (!eNode) {
    return { state, emitted: emitted.slice() };
  }

  return eNode.adjacentHexIds.reduce<StateWithEvents>(
    (acc, hId) => {
      const tile = acc.state.hexes[hId];
      if (!tile || tile.terrain !== "fog") return acc;

      const fogLen = acc.state.fogPool.length;
      const revealed =
        fogLen > 0
          ? acc.state.fogPool[fogLen - 1]!
          : { terrain: "forest" as const, numberToken: 6 };
      const nextFogPool =
        fogLen > 0 ? acc.state.fogPool.slice(0, -1) : acc.state.fogPool;

      const nextTile = {
        ...tile,
        terrain: revealed.terrain,
        numberToken: revealed.numberToken,
      };

      const [prodRes, nextRngState] =
        revealed.terrain === "gold"
          ? pickPure(acc.state.rngState, RESOURCES)
          : [TERRAIN_TO_RESOURCE[revealed.terrain], acc.state.rngState];

      const grantResource = Boolean(prodRes && acc.state.bank[prodRes] > 0);
      const nextBank =
        grantResource && prodRes
          ? { ...acc.state.bank, [prodRes]: acc.state.bank[prodRes] - 1 }
          : acc.state.bank;
      const nextPlayers =
        grantResource && prodRes
          ? updatePlayerById(acc.state.players, playerId, (p) => ({
              ...p,
              resources: addResourcesPure(p.resources, { [prodRes]: 1 }),
            }))
          : acc.state.players;
      const bonusMsg =
        grantResource && prodRes ? ` and discovered 1 ${prodRes}!` : "";

      const actor = nextPlayers.find((p) => p.id === playerId)!;
      const updatedState: CatanState = {
        ...acc.state,
        rngState: nextRngState,
        fogPool: nextFogPool,
        bank: nextBank,
        players: nextPlayers,
        hexes: {
          ...acc.state.hexes,
          [hId]: nextTile,
        },
      };

      return appendCatanEvent(
        updatedState,
        acc.emitted,
        "FOG_HEX_REVEALED",
        `${actor.name} explored fog hex (${nextTile.q},${nextTile.r}), revealing ${nextTile.terrain.toUpperCase()}${nextTile.numberToken ? ` (#${nextTile.numberToken})` : ""}${bonusMsg}`,
        actor.id,
        { hexId: hId, terrain: nextTile.terrain, numberToken: nextTile.numberToken }
      );
    },
    { state, emitted: emitted.slice() }
  );
}

/**
 * Purely registers islands touched by a newly built settlement and awards +2 Bonus VP
 * in Seafarers when settling on a foreign island for the first time.
 */
function recordIslandSettlementPure(
  state: CatanState,
  vertexId: VertexId,
  playerId: string,
  isSetup: boolean,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const vNode = state.topology.vertices[vertexId]!;
  const islandIds = Array.from(
    new Set(
      vNode.adjacentHexIds
        .map((hId) => state.hexes[hId])
        .filter((t): t is NonNullable<typeof t> => Boolean(t && t.islandId > 0))
        .map((t) => t.islandId)
    )
  );

  return islandIds.reduce<StateWithEvents>(
    (acc, islandId) => {
      const player = acc.state.players.find((p) => p.id === playerId)!;
      if (isSetup) {
        const nextHome = player.homeIslandIds.includes(islandId)
          ? player.homeIslandIds
          : [...player.homeIslandIds, islandId];
        const nextSettled = player.settledIslandIds.includes(islandId)
          ? player.settledIslandIds
          : [...player.settledIslandIds, islandId];
        return {
          state: {
            ...acc.state,
            players: updatePlayerById(acc.state.players, playerId, (p) => ({
              ...p,
              homeIslandIds: nextHome,
              settledIslandIds: nextSettled,
            })),
          },
          emitted: acc.emitted,
        };
      }

      if (player.settledIslandIds.includes(islandId)) {
        return acc;
      }

      const earnsForeignBonus =
        acc.state.config.enableSeafarers && !player.homeIslandIds.includes(islandId);
      const nextState: CatanState = {
        ...acc.state,
        players: updatePlayerById(acc.state.players, playerId, (p) => ({
          ...p,
          settledIslandIds: [...p.settledIslandIds, islandId],
          bonusVictoryPoints: p.bonusVictoryPoints + (earnsForeignBonus ? 2 : 0),
        })),
      };

      if (!earnsForeignBonus) {
        return { state: nextState, emitted: acc.emitted };
      }

      return appendCatanEvent(
        nextState,
        acc.emitted,
        "NEW_ISLAND_BONUS",
        `${player.name} colonized Island #${islandId} for the first time and earned +2 Bonus Victory Points!`,
        player.id,
        { islandId, bonusVp: 2 }
      );
    },
    { state, emitted: emitted.slice() }
  );
}

function assertCanBuildInCurrentPhase(state: CatanState, playerId: string): void {
  if (state.phase === "MAIN_PHASE") {
    const active = state.players[state.activePlayerIndex]!;
    if (active.id !== playerId) {
      throw new Error("Not your turn");
    }
    return;
  }
  if (state.phase === "SPECIAL_BUILDING") {
    if (
      state.specialBuildPlayerIndex === null ||
      state.players[state.specialBuildPlayerIndex]?.id !== playerId
    ) {
      throw new Error("Not your Special Building turn");
    }
    return;
  }
  throw new Error(`Cannot build in phase ${state.phase}`);
}

function advanceToNextPlayerTurnPure(
  state: CatanState,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const nextActivePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  const nextTurn = state.turn + 1;
  const resetPlayers = state.players.map((p) => ({
    ...p,
    hasPlayedDevCardThisTurn: false,
    hasMovedShipThisTurn: false,
  }));

  const advancedState: CatanState = {
    ...state,
    activePlayerIndex: nextActivePlayerIndex,
    turn: nextTurn,
    players: resetPlayers,
  };

  if (nextTurn > advancedState.config.maxTurns) {
    const awarded = recalculateAwardsPure(advancedState);
    const best = awarded.players.reduce<{ player: CatanPlayerState; vp: number }>(
      (acc, p) => {
        const vp = computePlayerVictoryPoints(awarded, p.id, false);
        return vp > acc.vp ? { player: p, vp } : acc;
      },
      { player: awarded.players[0]!, vp: -1 }
    );
    const endedState: CatanState = {
      ...awarded,
      winnerId: best.player.id,
      phase: "GAME_OVER",
    };
    return appendCatanEvent(
      endedState,
      emitted,
      "GAME_OVER_MAX_TURNS",
      `Max turns reached. ${best.player.name} wins with ${best.vp} VP!`,
      best.player.id
    );
  }

  const nextPlayer = advancedState.players[nextActivePlayerIndex]!;
  const preRollState: CatanState = {
    ...advancedState,
    phase: "PRE_ROLL",
  };
  const logged = appendCatanEvent(
    preRollState,
    emitted,
    "TURN_STARTED",
    `Turn ${nextTurn}: ${nextPlayer.name}'s turn.`,
    nextPlayer.id
  );
  const checked = checkAndAssignWinnerPure(logged.state, nextPlayer.id);
  return { state: checked.state, emitted: logged.emitted };
}

/**
 * Purely distributes resources on a non-7 dice roll, respecting the Catan bank shortage rule.
 */
function distributeRollResourcesPure(
  state: CatanState,
  rollTotal: number,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const demands = state.topology.hexOrder.reduce<{
    owedByResource: Record<ResourceType, Record<string, number>>;
    goldOwed: Record<string, number>;
  }>(
    (acc, hId) => {
      if (hId === state.robberHexId) return acc;
      const tile = state.hexes[hId]!;
      if (tile.numberToken !== rollTotal) return acc;

      const hNode = state.topology.hexes[hId]!;
      return hNode.cornerVertexIds.reduce((inner, vId) => {
        const b = state.buildings[vId];
        if (!b) return inner;
        const amount = b.type === "city" ? 2 : 1;

        if (tile.terrain === "gold") {
          return {
            ...inner,
            goldOwed: {
              ...inner.goldOwed,
              [b.ownerId]: (inner.goldOwed[b.ownerId] ?? 0) + amount,
            },
          };
        }

        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        if (!res) return inner;
        return {
          ...inner,
          owedByResource: {
            ...inner.owedByResource,
            [res]: {
              ...inner.owedByResource[res],
              [b.ownerId]: (inner.owedByResource[res][b.ownerId] ?? 0) + amount,
            },
          },
        };
      }, acc);
    },
    {
      owedByResource: { brick: {}, lumber: {}, wool: {}, grain: {}, ore: {} },
      goldOwed: {},
    }
  );

  const resourceDistribution = RESOURCES.reduce<{
    bank: ResourceMap;
    players: CatanPlayerState[];
    summaryParts: string[];
  }>(
    (acc, res) => {
      const playerDemands = demands.owedByResource[res];
      const demandingPlayerIds = Object.keys(playerDemands);
      if (demandingPlayerIds.length === 0) return acc;

      const totalDemand = Object.values(playerDemands).reduce<number>(
        (a, b) => a + b,
        0
      );
      if (acc.bank[res] >= totalDemand) {
        return Object.entries(playerDemands).reduce(
          (inner, [pId, amt]) => {
            const p = inner.players.find((pl) => pl.id === pId)!;
            return {
              bank: { ...inner.bank, [res]: inner.bank[res] - amt },
              players: updatePlayerById(inner.players, pId, (pl) => ({
                ...pl,
                resources: addResourcesPure(pl.resources, { [res]: amt }),
              })),
              summaryParts: [...inner.summaryParts, `${p.name} +${amt} ${res}`],
            };
          },
          acc
        );
      }

      if (demandingPlayerIds.length === 1 && acc.bank[res] > 0) {
        const pId = demandingPlayerIds[0]!;
        const p = acc.players.find((pl) => pl.id === pId)!;
        const amt = acc.bank[res];
        return {
          bank: { ...acc.bank, [res]: 0 },
          players: updatePlayerById(acc.players, pId, (pl) => ({
            ...pl,
            resources: addResourcesPure(pl.resources, { [res]: amt }),
          })),
          summaryParts: [
            ...acc.summaryParts,
            `${p.name} +${amt} ${res} (partial bank)`,
          ],
        };
      }

      return acc;
    },
    {
      bank: state.bank,
      players: state.players,
      summaryParts: [],
    }
  );

  const totalBankRemaining = totalResourceCount(resourceDistribution.bank);
  const goldDistribution =
    totalBankRemaining > 0
      ? Object.entries(demands.goldOwed).reduce<{
          pendingGoldPicks: Record<string, number>;
          summaryParts: string[];
        }>(
          (acc, [pId, count]) => {
            if (count <= 0) return acc;
            const p = resourceDistribution.players.find((pl) => pl.id === pId)!;
            return {
              pendingGoldPicks: { ...acc.pendingGoldPicks, [pId]: count },
              summaryParts: [
                ...acc.summaryParts,
                `${p.name} +${count} Gold pick(s)`,
              ],
            };
          },
          {
            pendingGoldPicks: state.pendingGoldPicks,
            summaryParts: resourceDistribution.summaryParts,
          }
        )
      : {
          pendingGoldPicks: state.pendingGoldPicks,
          summaryParts: resourceDistribution.summaryParts,
        };

  const nextState: CatanState = {
    ...state,
    bank: resourceDistribution.bank,
    players: resourceDistribution.players,
    pendingGoldPicks: goldDistribution.pendingGoldPicks,
  };

  if (goldDistribution.summaryParts.length === 0) {
    return { state: nextState, emitted: emitted.slice() };
  }

  return appendCatanEvent(
    nextState,
    emitted,
    "RESOURCES_PRODUCED",
    `Production: ${goldDistribution.summaryParts.join(", ")}.`
  );
}

function stealOneRandomCardPure(
  state: CatanState,
  thiefId: string,
  victimId: string,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const thief = state.players.find((p) => p.id === thiefId)!;
  const victim = state.players.find((p) => p.id === victimId)!;
  const pool = RESOURCES.flatMap((r) =>
    Array.from({ length: victim.resources[r] }, () => r)
  );
  if (pool.length === 0) {
    return { state, emitted: emitted.slice() };
  }

  const [stolen, nextRngState] = pickPure(state.rngState, pool);
  const nextPlayers = state.players.map((p) => {
    if (p.id === victimId) {
      return {
        ...p,
        resources: subtractResourcesPure(p.resources, { [stolen]: 1 }),
      };
    }
    if (p.id === thiefId) {
      return {
        ...p,
        resources: addResourcesPure(p.resources, { [stolen]: 1 }),
      };
    }
    return p;
  });

  const updatedState: CatanState = {
    ...state,
    rngState: nextRngState,
    players: nextPlayers,
  };

  return appendCatanEvent(
    updatedState,
    emitted,
    "RESOURCE_STOLEN",
    `${thief.name} stole 1 resource card from ${victim.name}.`,
    thief.id,
    { victimId: victim.id }
  );
}

function resolvePostRobberOrPirateStealPure(
  state: CatanState,
  thiefId: string,
  candidates: string[],
  emitted: readonly GameEvent[]
): StateWithEvents {
  if (candidates.length === 0) {
    const transitioned: CatanState = {
      ...state,
      stealCandidates: [],
      phase: state.phaseAfterRobber,
    };
    const checked = checkAndAssignWinnerPure(transitioned, thiefId);
    return { state: checked.state, emitted: emitted.slice() };
  }

  if (candidates.length === 1) {
    const stolen = stealOneRandomCardPure(state, thiefId, candidates[0]!, emitted);
    const transitioned: CatanState = {
      ...stolen.state,
      stealCandidates: [],
      phase: stolen.state.phaseAfterRobber,
    };
    const checked = checkAndAssignWinnerPure(transitioned, thiefId);
    return { state: checked.state, emitted: stolen.emitted };
  }

  return {
    state: {
      ...state,
      stealCandidates: candidates,
      phase: "STEAL_RESOURCE",
    },
    emitted: emitted.slice(),
  };
}

/**
 * Purely applies `action` by `playerId` to `currentState`, returning a new state and emitted events.
 */
export function applyCatanAction(
  currentState: CatanState,
  playerId: string,
  action: CatanAction
): { state: CatanState; events: GameEvent[] } {
  const player = currentState.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}"`);
  }

  const activePlayer = currentState.players[currentState.activePlayerIndex]!;

  switch (action.type) {
    case "PLACE_SETUP_SETTLEMENT": {
      if (
        (currentState.phase !== "SETUP_SETTLEMENT_1" &&
          currentState.phase !== "SETUP_SETTLEMENT_2") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Not your turn to place a setup settlement");
      }
      const legal = getLegalSettlementVertices(currentState, playerId, true);
      if (!legal.includes(action.vertexId)) {
        throw new Error(`Illegal setup settlement vertex ${action.vertexId}`);
      }

      const placedState: CatanState = {
        ...currentState,
        buildings: {
          ...currentState.buildings,
          [action.vertexId]: {
            ownerId: playerId,
            type: "settlement",
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          settlementsRemaining: p.settlementsRemaining - 1,
        })),
        lastSetupSettlementVertexId: action.vertexId,
      };

      const islandRecorded = recordIslandSettlementPure(
        placedState,
        action.vertexId,
        playerId,
        true,
        []
      );

      if (currentState.phase === "SETUP_SETTLEMENT_2") {
        const vNode = islandRecorded.state.topology.vertices[action.vertexId]!;
        const startingGain = vNode.adjacentHexIds.reduce<{
          bank: ResourceMap;
          gained: ResourceType[];
        }>(
          (acc, hId) => {
            const tile = islandRecorded.state.hexes[hId]!;
            const res = TERRAIN_TO_RESOURCE[tile.terrain];
            if (res && acc.bank[res] > 0) {
              return {
                bank: { ...acc.bank, [res]: acc.bank[res] - 1 },
                gained: [...acc.gained, res],
              };
            }
            return acc;
          },
          { bank: islandRecorded.state.bank, gained: [] }
        );

        const gainedDelta = startingGain.gained.reduce<Partial<ResourceMap>>(
          (acc, res) => ({ ...acc, [res]: (acc[res] ?? 0) + 1 }),
          {}
        );

        const withResources: CatanState = {
          ...islandRecorded.state,
          bank: startingGain.bank,
          players: updatePlayerById(islandRecorded.state.players, playerId, (p) => ({
            ...p,
            resources: addResourcesPure(p.resources, gainedDelta),
          })),
        };

        const logged = appendCatanEvent(
          withResources,
          islandRecorded.emitted,
          "SETUP_SETTLEMENT",
          `${player.name} placed their 2nd settlement${startingGain.gained.length > 0 ? ` and received starting resources (${startingGain.gained.join(", ")})` : ""}.`,
          playerId,
          { vertexId: action.vertexId, gained: startingGain.gained }
        );

        return {
          state: recalculateAwardsPure({ ...logged.state, phase: "SETUP_ROAD_2" }),
          events: logged.emitted,
        };
      }

      const logged = appendCatanEvent(
        islandRecorded.state,
        islandRecorded.emitted,
        "SETUP_SETTLEMENT",
        `${player.name} placed their 1st settlement.`,
        playerId,
        { vertexId: action.vertexId }
      );

      return {
        state: recalculateAwardsPure({ ...logged.state, phase: "SETUP_ROAD_1" }),
        events: logged.emitted,
      };
    }

    case "PLACE_SETUP_EDGE": {
      if (
        (currentState.phase !== "SETUP_ROAD_1" &&
          currentState.phase !== "SETUP_ROAD_2") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Not your turn to place a setup road/ship");
      }
      const anchor = currentState.lastSetupSettlementVertexId;
      if (!anchor) {
        throw new Error("Missing setup settlement anchor");
      }

      const placedEdgeState: CatanState = (() => {
        if (action.edgeKind === "ship") {
          const legalShips = getLegalShipEdges(currentState, playerId, anchor);
          if (!legalShips.includes(action.edgeId)) {
            throw new Error(`Illegal setup ship edge ${action.edgeId}`);
          }
          return {
            ...currentState,
            edges: {
              ...currentState.edges,
              [action.edgeId]: {
                ownerId: playerId,
                type: "ship",
                builtOnTurn: 0,
              },
            },
            players: updatePlayerById(currentState.players, playerId, (p) => ({
              ...p,
              shipsRemaining: p.shipsRemaining - 1,
            })),
          };
        }

        const legalRoads = getLegalRoadEdges(currentState, playerId, anchor);
        if (!legalRoads.includes(action.edgeId)) {
          throw new Error(`Illegal setup road edge ${action.edgeId}`);
        }
        return {
          ...currentState,
          edges: {
            ...currentState.edges,
            [action.edgeId]: {
              ownerId: playerId,
              type: "road",
              builtOnTurn: 0,
            },
          },
          players: updatePlayerById(currentState.players, playerId, (p) => ({
            ...p,
            roadsRemaining: p.roadsRemaining - 1,
          })),
        };
      })();

      const fogRevealed = revealAdjacentFogHexesPure(
        placedEdgeState,
        action.edgeId,
        playerId,
        []
      );
      const clearedAnchor: CatanState = {
        ...fogRevealed.state,
        lastSetupSettlementVertexId: null,
      };
      const logged = appendCatanEvent(
        clearedAnchor,
        fogRevealed.emitted,
        "SETUP_EDGE",
        `${player.name} placed a starting ${action.edgeKind}.`,
        playerId,
        { edgeId: action.edgeId, edgeKind: action.edgeKind }
      );

      // Advance snake draft order relative to `startingPlayerIndex`
      const n = logged.state.players.length;
      const startIdx = logged.state.startingPlayerIndex ?? 0;
      const nextDraft = (() => {
        if (logged.state.phase === "SETUP_ROAD_1") {
          const nextIdx = (logged.state.activePlayerIndex + 1) % n;
          if (nextIdx !== startIdx) {
            return {
              activePlayerIndex: nextIdx,
              phase: "SETUP_SETTLEMENT_1" as const,
            };
          }
          return {
            activePlayerIndex: logged.state.activePlayerIndex,
            phase: "SETUP_SETTLEMENT_2" as const,
          };
        }

        if (logged.state.activePlayerIndex !== startIdx) {
          return {
            activePlayerIndex: (logged.state.activePlayerIndex - 1 + n) % n,
            phase: "SETUP_SETTLEMENT_2" as const,
          };
        }
        return {
          activePlayerIndex: logged.state.activePlayerIndex,
          phase: "PRE_ROLL" as const,
        };
      })();

      return {
        state: recalculateAwardsPure({
          ...logged.state,
          activePlayerIndex: nextDraft.activePlayerIndex,
          phase: nextDraft.phase,
        }),
        events: logged.emitted,
      };
    }

    case "ROLL_DICE": {
      if (currentState.phase !== "PRE_ROLL" || activePlayer.id !== playerId) {
        throw new Error("Cannot roll dice now");
      }
      const [roll, nextRngState] = roll2d6Pure(currentState.rngState);
      const rolledState: CatanState = {
        ...currentState,
        rngState: nextRngState,
        lastRoll: roll,
      };

      const logged = appendCatanEvent(
        rolledState,
        [],
        "DICE_ROLLED",
        `${player.name} rolled ${roll.total} (${roll.die1} + ${roll.die2}).`,
        playerId,
        roll
      );

      if (roll.total === 7) {
        const pendingDiscards = logged.state.players.reduce<Record<string, number>>(
          (acc, p) => {
            const count = totalResourceCount(p.resources);
            const safeLimit = getPlayerSafeHandLimit(logged.state, p.id);
            return count > safeLimit
              ? { ...acc, [p.id]: Math.floor(count / 2) }
              : acc;
          },
          {}
        );

        return {
          state: {
            ...logged.state,
            pendingDiscards,
            phaseAfterRobber: "MAIN_PHASE",
            phase:
              Object.keys(pendingDiscards).length > 0
                ? "DISCARD_ON_SEVEN"
                : "MOVE_ROBBER_OR_PIRATE",
          },
          events: logged.emitted,
        };
      }

      const distributed = distributeRollResourcesPure(
        logged.state,
        roll.total,
        logged.emitted
      );
      return {
        state: {
          ...distributed.state,
          phase:
            Object.keys(distributed.state.pendingGoldPicks).length > 0
              ? "GOLD_RESOURCE_SELECTION"
              : "MAIN_PHASE",
        },
        events: distributed.emitted,
      };
    }

    case "SELECT_GOLD_RESOURCE": {
      if (currentState.phase !== "GOLD_RESOURCE_SELECTION") {
        throw new Error("Not in gold resource selection phase");
      }
      const remaining = currentState.pendingGoldPicks[playerId] ?? 0;
      if (remaining <= 0) {
        throw new Error("Player has no pending gold resource picks");
      }

      const picked =
        currentState.bank[action.resource] > 0
          ? (() => {
              const withPick: CatanState = {
                ...currentState,
                bank: {
                  ...currentState.bank,
                  [action.resource]: currentState.bank[action.resource] - 1,
                },
                players: updatePlayerById(currentState.players, playerId, (p) => ({
                  ...p,
                  resources: addResourcesPure(p.resources, {
                    [action.resource]: 1,
                  }),
                })),
              };
              return appendCatanEvent(
                withPick,
                [],
                "GOLD_RESOURCE_PICKED",
                `${player.name} chose 1 ${action.resource} from the Gold River.`,
                playerId,
                { resource: action.resource }
              );
            })()
          : { state: currentState, emitted: [] as GameEvent[] };

      const nextPendingGoldPicks =
        remaining - 1 <= 0
          ? omitRecordKey(picked.state.pendingGoldPicks, playerId)
          : { ...picked.state.pendingGoldPicks, [playerId]: remaining - 1 };

      return {
        state: {
          ...picked.state,
          pendingGoldPicks: nextPendingGoldPicks,
          phase:
            Object.keys(nextPendingGoldPicks).length === 0
              ? "MAIN_PHASE"
              : picked.state.phase,
        },
        events: picked.emitted,
      };
    }

    case "DISCARD_CARDS": {
      if (currentState.phase !== "DISCARD_ON_SEVEN") {
        throw new Error("Not in discard phase");
      }
      const required = currentState.pendingDiscards[playerId] ?? 0;
      if (required <= 0) {
        throw new Error("You do not need to discard");
      }
      const discardSum = totalResourceCount(action.resources);
      if (discardSum !== required) {
        throw new Error(`Must discard exactly ${required} cards (got ${discardSum})`);
      }
      if (!hasResources(player.resources, action.resources)) {
        throw new Error("Cannot discard resources you do not have");
      }

      const nextPendingDiscards = omitRecordKey(
        currentState.pendingDiscards,
        playerId
      );
      const discardedState: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, action.resources),
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, action.resources),
        })),
        pendingDiscards: nextPendingDiscards,
      };

      const logged = appendCatanEvent(
        discardedState,
        [],
        "CARDS_DISCARDED",
        `${player.name} discarded ${required} resource cards.`,
        playerId,
        { resources: action.resources }
      );

      return {
        state: {
          ...logged.state,
          phase:
            Object.keys(nextPendingDiscards).length === 0
              ? "MOVE_ROBBER_OR_PIRATE"
              : logged.state.phase,
        },
        events: logged.emitted,
      };
    }

    case "MOVE_ROBBER": {
      if (
        currentState.phase !== "MOVE_ROBBER_OR_PIRATE" ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Cannot move robber right now");
      }
      const legalHexes = getLegalRobberHexes(currentState, playerId);
      if (!legalHexes.includes(action.hexId)) {
        throw new Error(`Illegal robber destination ${action.hexId}`);
      }

      const hNode = currentState.topology.hexes[action.hexId]!;
      const candidates = Array.from(
        new Set(
          hNode.cornerVertexIds
            .map((vId) => currentState.buildings[vId])
            .filter(
              (b): b is NonNullable<typeof b> =>
                Boolean(b && b.ownerId !== playerId)
            )
            .map((b) => currentState.players.find((p) => p.id === b.ownerId)!)
            .filter((victim) => totalResourceCount(victim.resources) > 0)
            .map((victim) => victim.id)
        )
      );

      const movedState: CatanState = {
        ...currentState,
        robberHexId: action.hexId,
      };
      const logged = appendCatanEvent(
        movedState,
        [],
        "ROBBER_MOVED",
        `${player.name} moved the Robber to (${hNode.q},${hNode.r}).`,
        playerId,
        { hexId: action.hexId }
      );
      const resolved = resolvePostRobberOrPirateStealPure(
        logged.state,
        playerId,
        candidates,
        logged.emitted
      );
      return { state: resolved.state, events: resolved.emitted };
    }

    case "MOVE_PIRATE": {
      if (
        currentState.phase !== "MOVE_ROBBER_OR_PIRATE" ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Cannot move pirate right now");
      }
      const legalPirate = getLegalPirateHexes(currentState);
      if (!legalPirate.includes(action.hexId)) {
        throw new Error(`Illegal pirate destination ${action.hexId}`);
      }

      const hNode = currentState.topology.hexes[action.hexId]!;
      const candidates = Array.from(
        new Set(
          hNode.sideEdgeIds
            .map((eId) => currentState.edges[eId])
            .filter(
              (route): route is NonNullable<typeof route> =>
                Boolean(
                  route && route.type === "ship" && route.ownerId !== playerId
                )
            )
            .map((route) => currentState.players.find((p) => p.id === route.ownerId)!)
            .filter((victim) => totalResourceCount(victim.resources) > 0)
            .map((victim) => victim.id)
        )
      );

      const movedState: CatanState = {
        ...currentState,
        pirateHexId: action.hexId,
      };
      const logged = appendCatanEvent(
        movedState,
        [],
        "PIRATE_MOVED",
        `${player.name} sailed the Pirate Fleet to sea hex (${hNode.q},${hNode.r}).`,
        playerId,
        { hexId: action.hexId }
      );
      const resolved = resolvePostRobberOrPirateStealPure(
        logged.state,
        playerId,
        candidates,
        logged.emitted
      );
      return { state: resolved.state, events: resolved.emitted };
    }

    case "STEAL_FROM_PLAYER": {
      if (currentState.phase !== "STEAL_RESOURCE" || activePlayer.id !== playerId) {
        throw new Error("Not in steal phase");
      }
      if (!currentState.stealCandidates.includes(action.victimId)) {
        throw new Error(`Cannot steal from ${action.victimId}`);
      }

      const stolen = stealOneRandomCardPure(
        currentState,
        playerId,
        action.victimId,
        []
      );
      const transitioned: CatanState = {
        ...stolen.state,
        stealCandidates: [],
        phase: stolen.state.phaseAfterRobber,
      };
      const checked = checkAndAssignWinnerPure(transitioned, playerId);
      return { state: checked.state, events: stolen.emitted };
    }

    case "BUILD_ROAD": {
      if (currentState.phase === "ROAD_BUILDING_DEV") {
        if (activePlayer.id !== playerId) {
          throw new Error("Not your turn");
        }
        const legal = getLegalRoadEdges(currentState, playerId, null);
        if (!legal.includes(action.edgeId)) {
          throw new Error(`Illegal road edge ${action.edgeId}`);
        }

        const builtFree: CatanState = {
          ...currentState,
          edges: {
            ...currentState.edges,
            [action.edgeId]: {
              ownerId: playerId,
              type: "road",
              builtOnTurn: currentState.turn,
            },
          },
          players: updatePlayerById(currentState.players, playerId, (p) => ({
            ...p,
            roadsRemaining: p.roadsRemaining - 1,
          })),
          freeRoadsRemaining: currentState.freeRoadsRemaining - 1,
        };

        const fogRevealed = revealAdjacentFogHexesPure(
          builtFree,
          action.edgeId,
          playerId,
          []
        );
        const logged = appendCatanEvent(
          fogRevealed.state,
          fogRevealed.emitted,
          "ROAD_BUILT",
          `${player.name} built a free road (Road Building).`,
          playerId,
          { edgeId: action.edgeId }
        );

        const moreMoves =
          getLegalRoadEdges(logged.state, playerId, null).length +
          getLegalShipEdges(logged.state, playerId, null).length;
        const phaseAdjusted: CatanState =
          logged.state.freeRoadsRemaining <= 0 || moreMoves === 0
            ? { ...logged.state, freeRoadsRemaining: 0, phase: "MAIN_PHASE" }
            : logged.state;
        const checked = checkAndAssignWinnerPure(phaseAdjusted, playerId);
        return { state: checked.state, events: logged.emitted };
      }

      assertCanBuildInCurrentPhase(currentState, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.road)) {
        throw new Error("Insufficient resources for road");
      }
      const legal = getLegalRoadEdges(currentState, playerId, null);
      if (!legal.includes(action.edgeId)) {
        throw new Error(`Illegal road edge ${action.edgeId}`);
      }

      const builtPaid: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.road),
        edges: {
          ...currentState.edges,
          [action.edgeId]: {
            ownerId: playerId,
            type: "road",
            builtOnTurn: currentState.turn,
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.road),
          roadsRemaining: p.roadsRemaining - 1,
        })),
      };

      const fogRevealed = revealAdjacentFogHexesPure(
        builtPaid,
        action.edgeId,
        playerId,
        []
      );
      const logged = appendCatanEvent(
        fogRevealed.state,
        fogRevealed.emitted,
        "ROAD_BUILT",
        `${player.name} built a road.`,
        playerId,
        { edgeId: action.edgeId }
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "BUILD_SHIP": {
      if (currentState.phase === "ROAD_BUILDING_DEV") {
        if (activePlayer.id !== playerId) {
          throw new Error("Not your turn");
        }
        const legal = getLegalShipEdges(currentState, playerId, null);
        if (!legal.includes(action.edgeId)) {
          throw new Error(`Illegal ship edge ${action.edgeId}`);
        }

        const builtFree: CatanState = {
          ...currentState,
          edges: {
            ...currentState.edges,
            [action.edgeId]: {
              ownerId: playerId,
              type: "ship",
              builtOnTurn: currentState.turn,
            },
          },
          players: updatePlayerById(currentState.players, playerId, (p) => ({
            ...p,
            shipsRemaining: p.shipsRemaining - 1,
          })),
          freeRoadsRemaining: currentState.freeRoadsRemaining - 1,
        };

        const fogRevealed = revealAdjacentFogHexesPure(
          builtFree,
          action.edgeId,
          playerId,
          []
        );
        const logged = appendCatanEvent(
          fogRevealed.state,
          fogRevealed.emitted,
          "SHIP_BUILT",
          `${player.name} built a free ship (Road Building).`,
          playerId,
          { edgeId: action.edgeId }
        );

        const moreMoves =
          getLegalRoadEdges(logged.state, playerId, null).length +
          getLegalShipEdges(logged.state, playerId, null).length;
        const phaseAdjusted: CatanState =
          logged.state.freeRoadsRemaining <= 0 || moreMoves === 0
            ? { ...logged.state, freeRoadsRemaining: 0, phase: "MAIN_PHASE" }
            : logged.state;
        const checked = checkAndAssignWinnerPure(phaseAdjusted, playerId);
        return { state: checked.state, events: logged.emitted };
      }

      assertCanBuildInCurrentPhase(currentState, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.ship)) {
        throw new Error("Insufficient resources for ship");
      }
      const legal = getLegalShipEdges(currentState, playerId, null);
      if (!legal.includes(action.edgeId)) {
        throw new Error(`Illegal ship edge ${action.edgeId}`);
      }

      const builtPaid: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.ship),
        edges: {
          ...currentState.edges,
          [action.edgeId]: {
            ownerId: playerId,
            type: "ship",
            builtOnTurn: currentState.turn,
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.ship),
          shipsRemaining: p.shipsRemaining - 1,
        })),
      };

      const fogRevealed = revealAdjacentFogHexesPure(
        builtPaid,
        action.edgeId,
        playerId,
        []
      );
      const logged = appendCatanEvent(
        fogRevealed.state,
        fogRevealed.emitted,
        "SHIP_BUILT",
        `${player.name} built a ship.`,
        playerId,
        { edgeId: action.edgeId }
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "MOVE_SHIP": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only move a ship during your main phase");
      }
      const legalMoves = getLegalMoveShipActions(currentState, playerId);
      const isLegal = legalMoves.some(
        (m) => m.fromEdgeId === action.fromEdgeId && m.toEdgeId === action.toEdgeId
      );
      if (!isLegal) {
        throw new Error(
          `Illegal ship move from ${action.fromEdgeId} to ${action.toEdgeId}`
        );
      }

      const withoutOldEdge = omitRecordKey(currentState.edges, action.fromEdgeId);
      const movedState: CatanState = {
        ...currentState,
        edges: {
          ...withoutOldEdge,
          [action.toEdgeId]: {
            ownerId: playerId,
            type: "ship",
            builtOnTurn: currentState.turn,
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          hasMovedShipThisTurn: true,
        })),
      };

      const fogRevealed = revealAdjacentFogHexesPure(
        movedState,
        action.toEdgeId,
        playerId,
        []
      );
      const logged = appendCatanEvent(
        fogRevealed.state,
        fogRevealed.emitted,
        "SHIP_MOVED",
        `${player.name} repositioned an open ship.`,
        playerId,
        { fromEdgeId: action.fromEdgeId, toEdgeId: action.toEdgeId }
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "BUILD_SETTLEMENT": {
      assertCanBuildInCurrentPhase(currentState, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.settlement)) {
        throw new Error("Insufficient resources for settlement");
      }
      const legal = getLegalSettlementVertices(currentState, playerId, false);
      if (!legal.includes(action.vertexId)) {
        throw new Error(`Illegal settlement vertex ${action.vertexId}`);
      }

      const builtState: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.settlement),
        buildings: {
          ...currentState.buildings,
          [action.vertexId]: {
            ownerId: playerId,
            type: "settlement",
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.settlement),
          settlementsRemaining: p.settlementsRemaining - 1,
        })),
      };

      const islandRecorded = recordIslandSettlementPure(
        builtState,
        action.vertexId,
        playerId,
        false,
        []
      );
      const logged = appendCatanEvent(
        islandRecorded.state,
        islandRecorded.emitted,
        "SETTLEMENT_BUILT",
        `${player.name} built a settlement.`,
        playerId,
        { vertexId: action.vertexId }
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "BUILD_CITY": {
      assertCanBuildInCurrentPhase(currentState, playerId);
      if (player.citiesRemaining <= 0) {
        throw new Error("No cities remaining");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.city)) {
        throw new Error("Insufficient resources for city");
      }
      const existing = currentState.buildings[action.vertexId];
      if (!existing || existing.ownerId !== playerId || existing.type !== "settlement") {
        throw new Error("Can only upgrade your own settlement to a city");
      }

      const upgradedState: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.city),
        buildings: {
          ...currentState.buildings,
          [action.vertexId]: {
            ...existing,
            type: "city",
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.city),
          citiesRemaining: p.citiesRemaining - 1,
          settlementsRemaining: p.settlementsRemaining + 1, // Settlement piece returned to supply
        })),
      };

      const logged = appendCatanEvent(
        upgradedState,
        [],
        "CITY_BUILT",
        `${player.name} upgraded a settlement to a city!`,
        playerId,
        { vertexId: action.vertexId }
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "BUILD_CITY_WALL": {
      assertCanBuildInCurrentPhase(currentState, playerId);
      if (!currentState.config.enableCityWalls || player.cityWallsRemaining <= 0) {
        throw new Error("City walls unavailable");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.cityWall)) {
        throw new Error("Insufficient resources for city wall");
      }
      const existing = currentState.buildings[action.vertexId];
      if (
        !existing ||
        existing.ownerId !== playerId ||
        existing.type !== "city" ||
        existing.hasWall
      ) {
        throw new Error("Must build a city wall under an unwalled city you own");
      }

      const walledState: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.cityWall),
        buildings: {
          ...currentState.buildings,
          [action.vertexId]: {
            ...existing,
            hasWall: true,
          },
        },
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.cityWall),
          cityWallsRemaining: p.cityWallsRemaining - 1,
        })),
      };

      const logged = appendCatanEvent(
        walledState,
        [],
        "CITY_WALL_BUILT",
        `${player.name} fortified a city with City Walls (+2 safe hand limit).`,
        playerId,
        { vertexId: action.vertexId }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "BUY_DEV_CARD": {
      assertCanBuildInCurrentPhase(currentState, playerId);
      if (currentState.devCardDeck.length === 0) {
        throw new Error("Development card deck is empty");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.devCard)) {
        throw new Error("Insufficient resources for development card");
      }

      const cardType = currentState.devCardDeck[currentState.devCardDeck.length - 1]!;
      const nextDeck = currentState.devCardDeck.slice(0, -1);
      const newCard: DevCardInstance = {
        id: `dev-${currentState.turn}-${player.devCards.length}-${nextDeck.length}`,
        type: cardType,
        boughtOnTurn: currentState.turn,
        played: false,
      };

      const boughtState: CatanState = {
        ...currentState,
        bank: addResourcesPure(currentState.bank, BUILDING_COSTS.devCard),
        devCardDeck: nextDeck,
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.devCard),
          devCards: [...p.devCards, newCard],
        })),
      };

      const logged = appendCatanEvent(
        boughtState,
        [],
        "DEV_CARD_BOUGHT",
        `${player.name} bought a Development Card.`,
        playerId
      );
      const checked = checkAndAssignWinnerPure(logged.state, playerId);
      return { state: checked.state, events: logged.emitted };
    }

    case "PLAY_KNIGHT": {
      if (
        (currentState.phase !== "PRE_ROLL" &&
          currentState.phase !== "MAIN_PHASE") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Cannot play Knight right now");
      }
      if (!canPlayDevCard(currentState, player, "knight")) {
        throw new Error("No playable Knight card");
      }

      const nextKnightsCount = player.knightsPlayed + 1;
      const playedState: CatanState = {
        ...currentState,
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          devCards: markFirstPlayableDevCardUsed(
            p.devCards,
            "knight",
            currentState.turn
          ),
          hasPlayedDevCardThisTurn: true,
          knightsPlayed: nextKnightsCount,
        })),
      };

      const logged = appendCatanEvent(
        playedState,
        [],
        "KNIGHT_PLAYED",
        `${player.name} played a Knight (${nextKnightsCount} total).`,
        playerId
      );
      const returnPhase: "PRE_ROLL" | "MAIN_PHASE" =
        currentState.phase === "PRE_ROLL" ? "PRE_ROLL" : "MAIN_PHASE";
      const awarded = recalculateAwardsPure(logged.state);
      return {
        state: {
          ...awarded,
          phaseAfterRobber: returnPhase,
          phase: "MOVE_ROBBER_OR_PIRATE",
        },
        events: logged.emitted,
      };
    }

    case "PLAY_ROAD_BUILDING": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Road Building right now");
      }
      if (!canPlayDevCard(currentState, player, "road_building")) {
        throw new Error("No playable Road Building card");
      }

      const availablePieces = player.roadsRemaining + player.shipsRemaining;
      const availableSpots =
        getLegalRoadEdges(currentState, playerId, null).length +
        getLegalShipEdges(currentState, playerId, null).length;
      const freeRoadsRemaining = Math.min(2, availablePieces, availableSpots);

      const playedState: CatanState = {
        ...currentState,
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          devCards: markFirstPlayableDevCardUsed(
            p.devCards,
            "road_building",
            currentState.turn
          ),
          hasPlayedDevCardThisTurn: true,
        })),
        freeRoadsRemaining,
        phase: freeRoadsRemaining > 0 ? "ROAD_BUILDING_DEV" : currentState.phase,
      };

      const logged = appendCatanEvent(
        playedState,
        [],
        "ROAD_BUILDING_PLAYED",
        `${player.name} played Road Building!`,
        playerId
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "PLAY_YEAR_OF_PLENTY": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Year of Plenty right now");
      }
      if (!canPlayDevCard(currentState, player, "year_of_plenty")) {
        throw new Error("No playable Year of Plenty card");
      }
      if (action.resource1 === action.resource2) {
        if (currentState.bank[action.resource1] < 2) {
          throw new Error(`Bank does not have 2 ${action.resource1}`);
        }
      } else {
        if (
          currentState.bank[action.resource1] < 1 ||
          currentState.bank[action.resource2] < 1
        ) {
          throw new Error("Bank does not have requested resources");
        }
      }

      const delta: Partial<ResourceMap> =
        action.resource1 === action.resource2
          ? { [action.resource1]: 2 }
          : { [action.resource1]: 1, [action.resource2]: 1 };

      const playedState: CatanState = {
        ...currentState,
        bank: subtractResourcesPure(currentState.bank, delta),
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          devCards: markFirstPlayableDevCardUsed(
            p.devCards,
            "year_of_plenty",
            currentState.turn
          ),
          hasPlayedDevCardThisTurn: true,
          resources: addResourcesPure(p.resources, delta),
        })),
      };

      const logged = appendCatanEvent(
        playedState,
        [],
        "YEAR_OF_PLENTY_PLAYED",
        `${player.name} played Year of Plenty and took ${action.resource1} + ${action.resource2}.`,
        playerId,
        { resource1: action.resource1, resource2: action.resource2 }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "PLAY_MONOPOLY": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Monopoly right now");
      }
      if (!canPlayDevCard(currentState, player, "monopoly")) {
        throw new Error("No playable Monopoly card");
      }

      const totalClaimed = currentState.players.reduce<number>(
        (sum, other) =>
          other.id === playerId ? sum : sum + other.resources[action.resource],
        0
      );

      const nextPlayers = currentState.players.map((other) => {
        if (other.id === playerId) {
          return {
            ...other,
            devCards: markFirstPlayableDevCardUsed(
              other.devCards,
              "monopoly",
              currentState.turn
            ),
            hasPlayedDevCardThisTurn: true,
            resources: addResourcesPure(other.resources, {
              [action.resource]: totalClaimed,
            }),
          };
        }
        if (other.resources[action.resource] === 0) {
          return other;
        }
        return {
          ...other,
          resources: {
            ...other.resources,
            [action.resource]: 0,
          },
        };
      });

      const playedState: CatanState = {
        ...currentState,
        players: nextPlayers,
      };
      const logged = appendCatanEvent(
        playedState,
        [],
        "MONOPOLY_PLAYED",
        `${player.name} played Monopoly on ${action.resource.toUpperCase()} and collected ${totalClaimed} cards!`,
        playerId,
        { resource: action.resource, totalClaimed }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "MARITIME_TRADE": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only trade during your main phase");
      }
      const ratios = getPlayerTradeRatios(currentState, playerId);

      const { giveBundle, receiveBundle } = (() => {
        if (action.giveMap || action.receiveMap) {
          const srcGive = action.giveMap ?? { [action.give]: action.giveAmount };
          const srcRecv = action.receiveMap ?? {
            [action.receive]: action.receiveAmount ?? 1,
          };
          return RESOURCES.reduce<{
            giveBundle: ResourceMap;
            receiveBundle: ResourceMap;
          }>(
            (acc, r) => {
              const g = srcGive[r] ?? 0;
              const w = srcRecv[r] ?? 0;
              if (
                !Number.isInteger(g) ||
                g < 0 ||
                !Number.isInteger(w) ||
                w < 0
              ) {
                throw new Error(
                  "Maritime trade quantities must be non-negative integers"
                );
              }
              return {
                giveBundle: { ...acc.giveBundle, [r]: g },
                receiveBundle: { ...acc.receiveBundle, [r]: w },
              };
            },
            { giveBundle: emptyResources(), receiveBundle: emptyResources() }
          );
        }

        const recvAmt = action.receiveAmount ?? 1;
        if (
          !Number.isInteger(action.giveAmount) ||
          action.giveAmount <= 0 ||
          !Number.isInteger(recvAmt) ||
          recvAmt <= 0
        ) {
          throw new Error("Maritime trade quantities must be positive integers");
        }
        return {
          giveBundle: { ...emptyResources(), [action.give]: action.giveAmount },
          receiveBundle: { ...emptyResources(), [action.receive]: recvAmt },
        };
      })();

      const validated = RESOURCES.reduce<{
        totalCredits: number;
        totalReceive: number;
        giveParts: string[];
        recvParts: string[];
      }>(
        (acc, r) => {
          const g = giveBundle[r];
          const w = receiveBundle[r];
          if (g > 0 && w > 0) {
            throw new Error("Cannot trade a resource for itself");
          }
          const nextGive = (() => {
            if (g <= 0) {
              return { credits: acc.totalCredits, parts: acc.giveParts };
            }
            const expectedRatio = ratios[r];
            if (g % expectedRatio !== 0) {
              throw new Error(
                `Expected ${r} trade amount to be a multiple of ${expectedRatio} (${expectedRatio}:1)`
              );
            }
            if (player.resources[r] < g) {
              throw new Error(`Not enough ${r} for maritime trade`);
            }
            return {
              credits: acc.totalCredits + g / expectedRatio,
              parts: [...acc.giveParts, `${g} ${r}`],
            };
          })();

          const nextRecv = (() => {
            if (w <= 0) {
              return { recv: acc.totalReceive, parts: acc.recvParts };
            }
            if (currentState.bank[r] < w) {
              throw new Error(`Bank does not have ${w} ${r}`);
            }
            return {
              recv: acc.totalReceive + w,
              parts: [...acc.recvParts, `${w} ${r}`],
            };
          })();

          return {
            totalCredits: nextGive.credits,
            totalReceive: nextRecv.recv,
            giveParts: nextGive.parts,
            recvParts: nextRecv.parts,
          };
        },
        { totalCredits: 0, totalReceive: 0, giveParts: [], recvParts: [] }
      );

      if (
        validated.totalCredits <= 0 ||
        validated.totalCredits !== validated.totalReceive
      ) {
        throw new Error(
          `Maritime trade mismatch: ${validated.totalCredits} port trade(s) offered for ${validated.totalReceive} bank card(s)`
        );
      }

      const tradedState: CatanState = {
        ...currentState,
        bank: subtractResourcesPure(
          addResourcesPure(currentState.bank, giveBundle),
          receiveBundle
        ),
        players: updatePlayerById(currentState.players, playerId, (p) => ({
          ...p,
          resources: addResourcesPure(
            subtractResourcesPure(p.resources, giveBundle),
            receiveBundle
          ),
        })),
      };

      const singleGiveRes = RESOURCES.filter((r) => giveBundle[r] > 0);
      const rateSuffix =
        singleGiveRes.length === 1
          ? ` (${ratios[singleGiveRes[0]!]}:1)`
          : "";

      const logged = appendCatanEvent(
        tradedState,
        [],
        "MARITIME_TRADE",
        `${player.name} traded ${validated.giveParts.join(" + ")} for ${validated.recvParts.join(" + ")}${rateSuffix}.`,
        playerId,
        action
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "OFFER_DOMESTIC_TRADE": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only offer domestic trade on your main phase");
      }
      if (
        totalResourceCount(action.give) <= 0 ||
        totalResourceCount(action.want) <= 0
      ) {
        throw new Error("Domestic trade must give and want at least 1 resource");
      }
      if (!hasResources(player.resources, action.give)) {
        throw new Error("You do not have the offered resources");
      }

      const offerId = `offer-${currentState.turn}-${currentState.eventLog.length}`;
      const baseOffer = {
        id: offerId,
        fromPlayerId: playerId,
        toPlayerId: action.toPlayerId,
        give: action.give,
        want: action.want,
        acceptedBy: [] as string[],
        declinedBy: [] as string[],
      };

      const loggedOffer = appendCatanEvent(
        currentState,
        [],
        "DOMESTIC_TRADE_OFFERED",
        `${player.name} offered a trade to ${action.toPlayerId ? currentState.players.find((p) => p.id === action.toPlayerId)?.name : "all players"}.`,
        playerId,
        baseOffer
      );

      // Automatically decline for any targeted player who does not hold the requested resources
      const otherPlayers = loggedOffer.state.players.filter(
        (p) => p.id !== playerId
      );
      const targetedPlayers =
        action.toPlayerId !== null
          ? otherPlayers.filter((p) => p.id === action.toPlayerId)
          : otherPlayers;
      const autoDeclinedBy = targetedPlayers
        .filter((p) => !hasResources(p.resources, action.want))
        .map((p) => p.id);

      const allDeclined =
        targetedPlayers.length === 0 ||
        targetedPlayers.every((p) => autoDeclinedBy.includes(p.id));

      if (allDeclined) {
        const clearedOfferState: CatanState = {
          ...loggedOffer.state,
          activeTradeOffer: null,
        };
        const loggedDeclined = appendCatanEvent(
          clearedOfferState,
          loggedOffer.emitted,
          "DOMESTIC_TRADE_DECLINED",
          "Trade offer declined.",
          playerId
        );
        return { state: loggedDeclined.state, events: loggedDeclined.emitted };
      }

      return {
        state: {
          ...loggedOffer.state,
          activeTradeOffer: {
            ...baseOffer,
            declinedBy: autoDeclinedBy,
          },
        },
        events: loggedOffer.emitted,
      };
    }

    case "ACCEPT_DOMESTIC_TRADE": {
      if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
        throw new Error("No active domestic trade offer");
      }
      const offer = currentState.activeTradeOffer;
      if (offer.id !== action.offerId) {
        throw new Error("Mismatched trade offer ID");
      }
      if (offer.fromPlayerId === playerId) {
        throw new Error("Cannot accept your own trade offer");
      }
      if (offer.toPlayerId !== null && offer.toPlayerId !== playerId) {
        throw new Error("This trade offer is for another player");
      }

      const proposer = currentState.players.find(
        (p) => p.id === offer.fromPlayerId
      )!;
      if (!hasResources(proposer.resources, offer.give)) {
        throw new Error("Proposer no longer has offered resources");
      }
      if (!hasResources(player.resources, offer.want)) {
        throw new Error("You do not have the requested resources");
      }

      const prevAccepted = offer.acceptedBy ?? [];
      const nextAccepted = prevAccepted.includes(playerId)
        ? prevAccepted
        : [...prevAccepted, playerId];
      const nextDeclined = offer.declinedBy.filter((id) => id !== playerId);

      const acceptedState: CatanState = {
        ...currentState,
        activeTradeOffer: {
          ...offer,
          acceptedBy: nextAccepted,
          declinedBy: nextDeclined,
        },
      };

      const logged = appendCatanEvent(
        acceptedState,
        [],
        "DOMESTIC_TRADE_ACCEPTED",
        `${player.name} accepted ${proposer.name}'s trade offer.`,
        playerId,
        { offerId: offer.id, acceptorId: playerId }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "DECLINE_DOMESTIC_TRADE": {
      if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
        throw new Error("No active trade offer");
      }
      const offer = currentState.activeTradeOffer;
      const accepted = offer.acceptedBy ?? [];
      const nextDeclined =
        !offer.declinedBy.includes(playerId) && !accepted.includes(playerId)
          ? [...offer.declinedBy, playerId]
          : offer.declinedBy;

      const otherPlayers = currentState.players.filter(
        (p) => p.id !== offer.fromPlayerId
      );
      const targetedPlayers =
        offer.toPlayerId !== null
          ? otherPlayers.filter((p) => p.id === offer.toPlayerId)
          : otherPlayers;
      const everyoneResponded = targetedPlayers.every(
        (p) => nextDeclined.includes(p.id) || accepted.includes(p.id)
      );

      const declinedState: CatanState = {
        ...currentState,
        activeTradeOffer:
          everyoneResponded && accepted.length === 0
            ? null
            : {
                ...offer,
                declinedBy: nextDeclined,
              },
      };

      const logged = appendCatanEvent(
        declinedState,
        [],
        "DOMESTIC_TRADE_DECLINED",
        `${player.name} declined the trade offer.`,
        playerId
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "CONFIRM_DOMESTIC_TRADE": {
      if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
        throw new Error("No active domestic trade offer");
      }
      const offer = currentState.activeTradeOffer;
      if (offer.id !== action.offerId) {
        throw new Error("Mismatched trade offer ID");
      }
      if (offer.fromPlayerId !== playerId) {
        throw new Error(
          "Only the player who offered the trade can select the trade partner"
        );
      }
      const accepted = offer.acceptedBy ?? [];
      if (!accepted.includes(action.partnerId)) {
        throw new Error("Selected player has not accepted this trade offer");
      }

      const partner = currentState.players.find((p) => p.id === action.partnerId);
      if (!partner) {
        throw new Error("Selected trade partner not found");
      }
      if (!hasResources(player.resources, offer.give)) {
        throw new Error("You no longer have the offered resources");
      }
      if (!hasResources(partner.resources, offer.want)) {
        throw new Error("Selected partner no longer has the requested resources");
      }

      const nextPlayers = currentState.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            resources: addResourcesPure(
              subtractResourcesPure(p.resources, offer.give),
              offer.want
            ),
          };
        }
        if (p.id === partner.id) {
          return {
            ...p,
            resources: subtractResourcesPure(
              addResourcesPure(p.resources, offer.give),
              offer.want
            ),
          };
        }
        return p;
      });

      const confirmedState: CatanState = {
        ...currentState,
        players: nextPlayers,
        activeTradeOffer: null,
      };

      const logged = appendCatanEvent(
        confirmedState,
        [],
        "DOMESTIC_TRADE_COMPLETED",
        `${player.name} traded with ${partner.name}.`,
        playerId,
        { ...offer, partnerId: partner.id }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "CANCEL_DOMESTIC_TRADE": {
      if (
        !currentState.activeTradeOffer ||
        currentState.activeTradeOffer.fromPlayerId !== playerId
      ) {
        throw new Error("No trade offer to cancel");
      }
      const cancelledState: CatanState = {
        ...currentState,
        activeTradeOffer: null,
      };
      const logged = appendCatanEvent(
        cancelledState,
        [],
        "DOMESTIC_TRADE_CANCELLED",
        `${player.name} cancelled their trade offer.`,
        playerId
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "END_TURN": {
      if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot end turn now");
      }
      const clearedOffer: CatanState = {
        ...currentState,
        activeTradeOffer: null,
      };

      const checked = checkAndAssignWinnerPure(clearedOffer, playerId);
      if (checked.won) {
        return { state: checked.state, events: [] };
      }

      if (
        checked.state.config.enableSpecialBuildingPhase &&
        checked.state.players.length >= 3
      ) {
        const sbState: CatanState = {
          ...checked.state,
          phase: "SPECIAL_BUILDING",
          specialBuildPlayerIndex:
            (checked.state.activePlayerIndex + 1) % checked.state.players.length,
        };
        const logged = appendCatanEvent(
          sbState,
          [],
          "SPECIAL_BUILDING_STARTED",
          `${player.name} ended their turn. Special Building Phase started.`,
          playerId
        );
        return { state: logged.state, events: logged.emitted };
      }

      const advanced = advanceToNextPlayerTurnPure(checked.state, []);
      return { state: advanced.state, events: advanced.emitted };
    }

    case "END_SPECIAL_BUILD": {
      if (
        currentState.phase !== "SPECIAL_BUILDING" ||
        currentState.specialBuildPlayerIndex === null ||
        currentState.players[currentState.specialBuildPlayerIndex]?.id !== playerId
      ) {
        throw new Error("Not your Special Building turn");
      }

      const checked = checkAndAssignWinnerPure(currentState, playerId);
      if (checked.won) {
        return { state: checked.state, events: [] };
      }

      const nextSbIndex =
        ((checked.state.specialBuildPlayerIndex ?? 0) + 1) %
        checked.state.players.length;
      if (nextSbIndex === checked.state.activePlayerIndex) {
        const advanced = advanceToNextPlayerTurnPure(
          { ...checked.state, specialBuildPlayerIndex: null },
          []
        );
        return { state: advanced.state, events: advanced.emitted };
      }

      return {
        state: {
          ...checked.state,
          specialBuildPlayerIndex: nextSbIndex,
        },
        events: [],
      };
    }

    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }
}

const IRREVERSIBLE_CATAN_ACTIONS = new Set<CatanAction["type"]>([
  "ROLL_DICE",
  "BUY_DEV_CARD",
  "STEAL_FROM_PLAYER",
  "PLAY_MONOPOLY",
  "OFFER_DOMESTIC_TRADE",
  "ACCEPT_DOMESTIC_TRADE",
  "DECLINE_DOMESTIC_TRADE",
  "CONFIRM_DOMESTIC_TRADE",
  "CANCEL_DOMESTIC_TRADE",
  "END_TURN",
  "END_SPECIAL_BUILD",
]);

/**
 * Returns whether `action` can be fairly undone by the acting player within their own turn.
 * Disallows undoing dice rolls, dev-card draws, random steals, fog reveals, Monopoly hand reveals,
 * or interpersonal trade steps.
 */
export function isCatanActionUndoable(
  prevState: CatanState,
  action: CatanAction,
  nextState: CatanState
): boolean {
  if (
    nextState.phase === "GAME_OVER" ||
    prevState.turn !== nextState.turn ||
    prevState.phase.startsWith("SETUP_") !== nextState.phase.startsWith("SETUP_")
  ) {
    return false;
  }
  if (IRREVERSIBLE_CATAN_ACTIONS.has(action.type)) {
    return false;
  }
  if (
    prevState.rngState !== nextState.rngState ||
    prevState.devCardDeck.length !== nextState.devCardDeck.length ||
    prevState.fogPool.length !== nextState.fogPool.length
  ) {
    return false;
  }
  return true;
}

/**
 * Verifies domain invariants on `state` to catch any state corruption or rule bug immediately.
 */
export function checkCatanInvariants(state: CatanState): InvariantCheckResult {
  const isExpanded =
    state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
  const expectedTotalPerResource = isExpanded ? 24 : 19;
  const hasRedactedHands = state.players.some((p) => p.handRedacted);

  // 1. Non-negative bank & player resources + total conservation per resource
  const resourceViolations: string[] = hasRedactedHands
    ? (() => {
        const bankNegViolations = RESOURCES.filter((r) => state.bank[r] < 0).map(
          (r) => `Bank has negative ${r}: ${state.bank[r]}`
        );
        const bankSum = RESOURCES.reduce<number>((s, r) => s + state.bank[r], 0);
        const playerNegViolations = state.players
          .map((p) => ({ id: p.id, count: getPlayerResourceCount(p) }))
          .filter((x) => x.count < 0)
          .map((x) => `Player ${x.id} has negative card count: ${x.count}`);
        const playerCardSum = state.players.reduce<number>(
          (s, p) => s + getPlayerResourceCount(p),
          0
        );
        const expectedGrandTotal = expectedTotalPerResource * RESOURCES.length;
        const conservationViolations =
          bankSum + playerCardSum !== expectedGrandTotal
            ? [
                `Aggregate resource conservation violated: bank(${bankSum}) + players(${playerCardSum}) !== ${expectedGrandTotal}`,
              ]
            : [];
        return [
          ...bankNegViolations,
          ...playerNegViolations,
          ...conservationViolations,
        ];
      })()
    : RESOURCES.flatMap((r) => {
        const bankNeg =
          state.bank[r] < 0 ? [`Bank has negative ${r}: ${state.bank[r]}`] : [];
        const playerNeg = state.players
          .filter((p) => p.resources[r] < 0)
          .map((p) => `Player ${p.id} has negative ${r}: ${p.resources[r]}`);
        const playerSum = state.players.reduce<number>(
          (s, p) => s + p.resources[r],
          0
        );
        const conservation =
          state.bank[r] + playerSum !== expectedTotalPerResource
            ? [
                `Resource conservation violated for ${r}: bank(${state.bank[r]}) + players(${playerSum}) !== ${expectedTotalPerResource}`,
              ]
            : [];
        return [...bankNeg, ...playerNeg, ...conservation];
      });

  // 2. Distance Rule on all buildings
  const distanceViolations: string[] = Object.entries(state.buildings).flatMap(
    ([vId, b]) => {
      const vNode = state.topology.vertices[vId];
      if (!vNode) {
        return [`Building placed on non-existent vertex ${vId}`];
      }
      return vNode.adjacentVertexIds
        .filter((adjVId) => Boolean(state.buildings[adjVId]))
        .map(
          (adjVId) =>
            `Distance rule violated: adjacent buildings at ${vId} (${b.ownerId}) and ${adjVId} (${state.buildings[adjVId]!.ownerId})`
        );
    }
  );

  // 3. Piece supply counts match board pieces
  const pieceViolations: string[] = state.players.flatMap((p) => {
    const settlementsOnBoard = Object.values(state.buildings).filter(
      (b) => b.ownerId === p.id && b.type === "settlement"
    ).length;
    const citiesOnBoard = Object.values(state.buildings).filter(
      (b) => b.ownerId === p.id && b.type === "city"
    ).length;
    const roadsOnBoard = Object.values(state.edges).filter(
      (e) => e.ownerId === p.id && e.type === "road"
    ).length;
    const shipsOnBoard = Object.values(state.edges).filter(
      (e) => e.ownerId === p.id && e.type === "ship"
    ).length;

    return [
      ...(settlementsOnBoard + p.settlementsRemaining !== 5
        ? [
            `Player ${p.id} settlement count mismatch: ${settlementsOnBoard} + ${p.settlementsRemaining} !== 5`,
          ]
        : []),
      ...(citiesOnBoard + p.citiesRemaining !== 4
        ? [
            `Player ${p.id} city count mismatch: ${citiesOnBoard} + ${p.citiesRemaining} !== 4`,
          ]
        : []),
      ...(roadsOnBoard + p.roadsRemaining !== 15
        ? [
            `Player ${p.id} road count mismatch: ${roadsOnBoard} + ${p.roadsRemaining} !== 15`,
          ]
        : []),
      ...(state.config.enableSeafarers && shipsOnBoard + p.shipsRemaining !== 15
        ? [
            `Player ${p.id} ship count mismatch: ${shipsOnBoard} + ${p.shipsRemaining} !== 15`,
          ]
        : []),
    ];
  });

  const violations = [
    ...resourceViolations,
    ...distanceViolations,
    ...pieceViolations,
  ];

  return {
    valid: violations.length === 0,
    violations,
  };
}
