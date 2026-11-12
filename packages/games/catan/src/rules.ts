import {
  type EdgeId,
  type GameEvent,
  type HexId,
  type InvariantCheckResult,
  type PlayerDescriptor,
  SeededRNG,
  type VertexId,
  computeLongestSimpleEdgePath,
} from "@gaming-platform/core";
import {
  SCENARIO_CATALOG,
  createDevCardDeck,
  generateCatanBoard,
} from "./board.ts";
import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanConfig,
  type CatanPlayerState,
  type CatanState,
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
  let sum = 0;
  for (const r of RESOURCES) {
    sum += res[r] ?? 0;
  }
  return sum;
}

export function hasResources(hand: ResourceMap, cost: Partial<ResourceMap>): boolean {
  for (const r of RESOURCES) {
    if ((hand[r] ?? 0) < (cost[r] ?? 0)) {
      return false;
    }
  }
  return true;
}

export function addResources(target: ResourceMap, delta: Partial<ResourceMap>): void {
  for (const r of RESOURCES) {
    target[r] += delta[r] ?? 0;
  }
}

export function subtractResources(target: ResourceMap, delta: Partial<ResourceMap>): void {
  for (const r of RESOURCES) {
    target[r] -= delta[r] ?? 0;
  }
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

  let vp = player.bonusVictoryPoints;

  for (const b of Object.values(state.buildings)) {
    if (b.ownerId === playerId) {
      vp += b.type === "city" ? 2 : 1;
    }
  }

  if (state.longestRoadOwnerId === playerId) {
    vp += 2;
  }
  if (state.largestArmyOwnerId === playerId) {
    vp += 2;
  }
  if (state.config.enableHarbormaster && state.harbormasterOwnerId === playerId) {
    vp += 2;
  }

  if (!visibleOnly) {
    for (const card of player.devCards) {
      if (card.type === "victory_point") {
        vp += 1;
      }
    }
  }

  return vp;
}

/**
 * Computes each resource's maritime trade ratio (4, 3, or 2) for `playerId` based on harbors.
 */
export function getPlayerTradeRatios(
  state: CatanState,
  playerId: string
): Record<ResourceType, number> {
  const ratios: Record<ResourceType, number> = {
    brick: 4,
    lumber: 4,
    wool: 4,
    grain: 4,
    ore: 4,
  };

  for (const harbor of state.harbors) {
    const ownsHarbor = harbor.vertexIds.some(
      (vId) => state.buildings[vId]?.ownerId === playerId
    );
    if (!ownsHarbor) continue;

    if (harbor.type === "generic") {
      for (const r of RESOURCES) {
        ratios[r] = Math.min(ratios[r], 3);
      }
    } else {
      ratios[harbor.type] = 2;
    }
  }

  return ratios;
}

/**
 * Returns the maximum cards `playerId` can hold when a 7 is rolled without discarding.
 * Base is 7; each City Wall adds +2 cards.
 */
export function getPlayerSafeHandLimit(state: CatanState, playerId: string): number {
  let limit = 7;
  if (state.config.enableCityWalls) {
    for (const b of Object.values(state.buildings)) {
      if (b.ownerId === playerId && b.type === "city" && b.hasWall) {
        limit += 2;
      }
    }
  }
  return limit;
}

/**
 * Recalculates Longest Road / Longest Trade Route, Largest Army, and Harbormaster awards.
 */
export function recalculateAwards(state: CatanState): void {
  // 1. Longest Road / Trade Route
  for (const player of state.players) {
    const playerEdges = Object.entries(state.edges)
      .filter(([, e]) => e.ownerId === player.id)
      .map(([eId]) => eId);

    const blockedVertices = new Set<VertexId>();
    for (const [vId, b] of Object.entries(state.buildings)) {
      if (b.ownerId !== player.id) {
        blockedVertices.add(vId);
      }
    }

    const result = computeLongestSimpleEdgePath(
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
    player.longestRoadLength = result.length;
  }

  const maxRoad = Math.max(0, ...state.players.map((p) => p.longestRoadLength));
  if (maxRoad < 5) {
    state.longestRoadOwnerId = null;
    state.longestRoadLength = 0;
  } else {
    const leaders = state.players.filter((p) => p.longestRoadLength === maxRoad);
    if (
      state.longestRoadOwnerId &&
      leaders.some((p) => p.id === state.longestRoadOwnerId)
    ) {
      // Current owner retains on tie at maxRoad
      state.longestRoadLength = maxRoad;
    } else if (leaders.length === 1) {
      state.longestRoadOwnerId = leaders[0]!.id;
      state.longestRoadLength = maxRoad;
    } else {
      // Tie after previous owner lost Longest Road -> nobody holds it
      state.longestRoadOwnerId = null;
      state.longestRoadLength = 0;
    }
  }

  // 2. Largest Army (>= 3 knights played)
  for (const player of state.players) {
    if (player.knightsPlayed >= 3 && player.knightsPlayed > state.largestArmySize) {
      state.largestArmyOwnerId = player.id;
      state.largestArmySize = player.knightsPlayed;
    }
  }

  // 3. Harbormaster (>= 3 harbor points)
  const harborVertexSet = new Set<VertexId>();
  for (const h of state.harbors) {
    harborVertexSet.add(h.vertexIds[0]);
    harborVertexSet.add(h.vertexIds[1]);
  }

  for (const player of state.players) {
    let pts = 0;
    for (const vId of harborVertexSet) {
      const b = state.buildings[vId];
      if (b && b.ownerId === player.id) {
        pts += b.type === "city" ? 2 : 1;
      }
    }
    player.harborPoints = pts;
  }

  if (state.config.enableHarbormaster) {
    for (const player of state.players) {
      if (player.harborPoints >= 3 && player.harborPoints > state.harbormasterPoints) {
        state.harbormasterOwnerId = player.id;
        state.harbormasterPoints = player.harborPoints;
      }
    }
  }
}

/**
 * Checks whether any player (specifically the current active or special-building player) has won.
 */
export function checkAndAssignWinner(state: CatanState, actingPlayerId: string): boolean {
  recalculateAwards(state);
  const vp = computePlayerVictoryPoints(state, actingPlayerId, false);
  if (vp >= state.config.targetVictoryPoints) {
    state.winnerId = actingPlayerId;
    state.phase = "GAME_OVER";
    return true;
  }
  return false;
}

/**
 * Initializes a new Catan game state.
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
  const rng = new SeededRNG(seed);
  const board = generateCatanBoard(config, rng);
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

  const devCardDeck = createDevCardDeck(isExpanded, rng);
  const startingPlayerIndex =
    typeof config.startingPlayerIndex === "number" &&
    Number.isFinite(config.startingPlayerIndex)
      ? ((Math.trunc(config.startingPlayerIndex) % players.length) +
          players.length) %
        players.length
      : config.randomizeStartingPlayer
        ? rng.nextInt(0, players.length - 1)
        : 0;

  const state: CatanState = {
    gameId: "catan",
    config,
    rngState: rng.getState(),
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

  return state;
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

  const valid: VertexId[] = [];

  for (const vId of state.topology.vertexOrder) {
    if (state.buildings[vId]) continue;
    const vNode = state.topology.vertices[vId]!;

    // Distance rule: no adjacent vertex can have a building
    const hasAdjacentBuilding = vNode.adjacentVertexIds.some(
      (adjId) => Boolean(state.buildings[adjId])
    );
    if (hasAdjacentBuilding) continue;

    // Must touch at least one land hex
    const adjTiles = vNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) continue;

    if (isSetup) {
      const touchesSetupLand = adjTiles.some(
        (t) => t.allowSetupSettlement && t.terrain !== "sea" && t.terrain !== "fog"
      );
      if (!touchesSetupLand) continue;
      valid.push(vId);
    } else {
      // Must connect to at least one road or ship owned by playerId
      const connectsToOwnRoute = vNode.incidentEdgeIds.some(
        (eId) => state.edges[eId]?.ownerId === playerId
      );
      if (connectsToOwnRoute) {
        valid.push(vId);
      }
    }
  }

  return valid;
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

  const valid: EdgeId[] = [];

  for (const eId of state.topology.edgeOrder) {
    if (state.edges[eId]) continue;
    const eNode = state.topology.edges[eId]!;

    // Road must border at least one land hex
    const adjTiles = eNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) continue;

    if (setupAnchorVertexId) {
      if (eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId) {
        valid.push(eId);
      }
      continue;
    }

    // Normal play: check if v1 or v2 connects to player's network without being blocked
    const endpoints = [eNode.v1, eNode.v2];
    let connected = false;
    for (const vId of endpoints) {
      const building = state.buildings[vId];
      if (building) {
        if (building.ownerId === playerId) {
          connected = true;
          break;
        }
        // Opponent building blocks road continuation through this vertex
        continue;
      }
      const vNode = state.topology.vertices[vId]!;
      const hasIncidentRoad = vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return route && route.ownerId === playerId && route.type === "road";
      });
      if (hasIncidentRoad) {
        connected = true;
        break;
      }
    }

    if (connected) {
      valid.push(eId);
    }
  }

  return valid;
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

  const valid: EdgeId[] = [];

  for (const eId of state.topology.edgeOrder) {
    if (state.edges[eId]) continue;
    const eNode = state.topology.edges[eId]!;

    // Cannot build ship adjacent to the Pirate Fleet
    if (state.pirateHexId && eNode.adjacentHexIds.includes(state.pirateHexId)) {
      continue;
    }

    // Ship must border at least one sea hex
    const adjTiles = eNode.adjacentHexIds.map((hId) => state.hexes[hId]!).filter(Boolean);
    const touchesSea = adjTiles.some((t) => t.terrain === "sea");
    if (!touchesSea) continue;

    if (setupAnchorVertexId) {
      if (eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId) {
        valid.push(eId);
      }
      continue;
    }

    const endpoints = [eNode.v1, eNode.v2];
    let connected = false;
    for (const vId of endpoints) {
      const building = state.buildings[vId];
      if (building) {
        if (building.ownerId === playerId) {
          connected = true;
          break;
        }
        continue;
      }
      const vNode = state.topology.vertices[vId]!;
      const hasIncidentShip = vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return route && route.ownerId === playerId && route.type === "ship";
      });
      if (hasIncidentShip) {
        connected = true;
        break;
      }
    }

    if (connected) {
      valid.push(eId);
    }
  }

  return valid;
}

/**
 * Returns movable open ships and their target edges for Seafarers `MOVE_SHIP`.
 */
export function getLegalMoveShipActions(
  state: CatanState,
  playerId: string
): Array<{ type: "MOVE_SHIP"; fromEdgeId: EdgeId; toEdgeId: EdgeId }> {
  if (!state.config.enableSeafarers) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasMovedShipThisTurn) return [];

  const movableFromEdges: EdgeId[] = [];

  for (const [eId, route] of Object.entries(state.edges)) {
    if (route.ownerId !== playerId || route.type !== "ship") continue;
    if (route.builtOnTurn >= state.turn) continue; // Cannot move a ship built this turn

    const eNode = state.topology.edges[eId]!;
    if (state.pirateHexId && eNode.adjacentHexIds.includes(state.pirateHexId)) {
      continue; // Pinned by Pirate
    }

    // Check if the ship is "open" (at least one endpoint has no other own ship/road and no own building)
    const isEndpointOpen = (vId: VertexId): boolean => {
      if (state.buildings[vId]?.ownerId === playerId) return false;
      const vNode = state.topology.vertices[vId]!;
      const otherOwnEdges = vNode.incidentEdgeIds.filter(
        (incId) => incId !== eId && state.edges[incId]?.ownerId === playerId
      );
      return otherOwnEdges.length === 0;
    };

    if (isEndpointOpen(eNode.v1) || isEndpointOpen(eNode.v2)) {
      movableFromEdges.push(eId);
    }
  }

  if (movableFromEdges.length === 0) return [];

  const actions: Array<{ type: "MOVE_SHIP"; fromEdgeId: EdgeId; toEdgeId: EdgeId }> = [];

  for (const fromEdgeId of movableFromEdges) {
    const savedRoute = state.edges[fromEdgeId]!;
    delete state.edges[fromEdgeId];
    player.shipsRemaining++;

    const targets = getLegalShipEdges(state, playerId, null);
    for (const toEdgeId of targets) {
      if (toEdgeId !== fromEdgeId) {
        actions.push({ type: "MOVE_SHIP", fromEdgeId, toEdgeId });
      }
    }

    player.shipsRemaining--;
    state.edges[fromEdgeId] = savedRoute;
  }

  return actions;
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
    for (const vId of hNode.cornerVertexIds) {
      const b = state.buildings[vId];
      if (b && b.ownerId !== playerId) {
        const victimVisibleVp = computePlayerVictoryPoints(state, b.ownerId, true);
        if (victimVisibleVp <= 2) {
          return false;
        }
      }
    }
    return true;
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
function generateDiscardActions(
  hand: ResourceMap,
  discardCount: number
): Array<{ type: "DISCARD_CARDS"; resources: Partial<ResourceMap> }> {
  const results: Array<{ type: "DISCARD_CARDS"; resources: Partial<ResourceMap> }> = [];

  // Greedy strategy 1: discard most abundant resources first
  const byAbundance = [...RESOURCES].sort((a, b) => hand[b] - hand[a]);
  const option1: Partial<ResourceMap> = {};
  let rem1 = discardCount;
  for (const r of byAbundance) {
    const take = Math.min(hand[r], rem1);
    if (take > 0) {
      option1[r] = take;
      rem1 -= take;
    }
  }
  if (rem1 === 0) {
    results.push({ type: "DISCARD_CARDS", resources: option1 });
  }

  // Strategy 2: discard lowest-priority resources first (wool, lumber, brick, grain, ore)
  const lowPriority: ResourceType[] = ["wool", "lumber", "brick", "grain", "ore"];
  const option2: Partial<ResourceMap> = {};
  let rem2 = discardCount;
  for (const r of lowPriority) {
    const take = Math.min(hand[r], rem2);
    if (take > 0) {
      option2[r] = take;
      rem2 -= take;
    }
  }
  if (
    rem2 === 0 &&
    JSON.stringify(option2) !== JSON.stringify(option1)
  ) {
    results.push({ type: "DISCARD_CARDS", resources: option2 });
  }

  return results;
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
    if (
      (offer.toPlayerId === null || offer.toPlayerId === playerId) &&
      !offer.declinedBy.includes(playerId)
    ) {
      const responder = state.players.find((p) => p.id === playerId);
      if (!responder) return [];
      const actions: CatanAction[] = [
        { type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id },
      ];
      if (hasResources(responder.resources, offer.want)) {
        actions.unshift({ type: "ACCEPT_DOMESTIC_TRADE", offerId: offer.id });
      }
      return actions;
    }
    return [];
  }

  // Special Building Phase (5-6 Player Extension)
  if (state.phase === "SPECIAL_BUILDING") {
    if (state.specialBuildPlayerIndex === null) return [];
    const sbPlayer = state.players[state.specialBuildPlayerIndex]!;
    if (sbPlayer.id !== playerId) return [];

    const actions: CatanAction[] = [];
    appendBuildActions(state, sbPlayer, actions);
    actions.push({ type: "END_SPECIAL_BUILD" });
    return actions;
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
      const actions: CatanAction[] = [{ type: "ROLL_DICE" }];
      if (canPlayDevCard(state, activePlayer, "knight")) {
        actions.push({ type: "PLAY_KNIGHT" });
      }
      return actions;
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
      const actions: CatanAction[] = [];

      if (state.activeTradeOffer) {
        actions.push({ type: "CANCEL_DOMESTIC_TRADE" });
      }

      // Building actions
      appendBuildActions(state, activePlayer, actions);

      // Seafarers: Move open ship once per turn
      actions.push(...getLegalMoveShipActions(state, playerId));

      // Development cards
      if (canPlayDevCard(state, activePlayer, "knight")) {
        actions.push({ type: "PLAY_KNIGHT" });
      }
      if (canPlayDevCard(state, activePlayer, "road_building")) {
        const hasSpots =
          getLegalRoadEdges(state, playerId, null).length > 0 ||
          getLegalShipEdges(state, playerId, null).length > 0;
        if (hasSpots) {
          actions.push({ type: "PLAY_ROAD_BUILDING" });
        }
      }
      if (canPlayDevCard(state, activePlayer, "year_of_plenty")) {
        const avail = RESOURCES.filter((r) => state.bank[r] > 0);
        for (let i = 0; i < avail.length; i++) {
          for (let j = i; j < avail.length; j++) {
            const r1 = avail[i]!;
            const r2 = avail[j]!;
            if (r1 === r2 && state.bank[r1] < 2) continue;
            actions.push({
              type: "PLAY_YEAR_OF_PLENTY",
              resource1: r1,
              resource2: r2,
            });
          }
        }
      }
      if (canPlayDevCard(state, activePlayer, "monopoly")) {
        for (const r of RESOURCES) {
          actions.push({ type: "PLAY_MONOPOLY", resource: r });
        }
      }

      // Maritime / Harbor trades
      const ratios = getPlayerTradeRatios(state, playerId);
      for (const give of RESOURCES) {
        const ratio = ratios[give];
        if (activePlayer.resources[give] >= ratio) {
          for (const receive of RESOURCES) {
            if (receive !== give && state.bank[receive] > 0) {
              actions.push({
                type: "MARITIME_TRADE",
                give,
                giveAmount: ratio,
                receive,
              });
            }
          }
        }
      }

      actions.push({ type: "END_TURN" });
      return actions;
    }

    default:
      return [];
  }
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

function appendBuildActions(
  state: CatanState,
  player: CatanPlayerState,
  actions: CatanAction[]
): void {
  // Settlements
  if (
    player.settlementsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.settlement)
  ) {
    for (const vertexId of getLegalSettlementVertices(state, player.id, false)) {
      actions.push({ type: "BUILD_SETTLEMENT", vertexId });
    }
  }

  // Cities
  if (
    player.citiesRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.city)
  ) {
    for (const [vId, b] of Object.entries(state.buildings)) {
      if (b.ownerId === player.id && b.type === "settlement") {
        actions.push({ type: "BUILD_CITY", vertexId: vId });
      }
    }
  }

  // City Walls (Cities & Knights mechanic)
  if (
    state.config.enableCityWalls &&
    player.cityWallsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.cityWall)
  ) {
    for (const [vId, b] of Object.entries(state.buildings)) {
      if (b.ownerId === player.id && b.type === "city" && !b.hasWall) {
        actions.push({ type: "BUILD_CITY_WALL", vertexId: vId });
      }
    }
  }

  // Development Card
  if (
    state.devCardDeck.length > 0 &&
    hasResources(player.resources, BUILDING_COSTS.devCard)
  ) {
    actions.push({ type: "BUY_DEV_CARD" });
  }

  // Roads
  if (
    player.roadsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.road)
  ) {
    for (const edgeId of getLegalRoadEdges(state, player.id, null)) {
      actions.push({ type: "BUILD_ROAD", edgeId });
    }
  }

  // Ships (Seafarers)
  if (
    state.config.enableSeafarers &&
    player.shipsRemaining > 0 &&
    hasResources(player.resources, BUILDING_COSTS.ship)
  ) {
    for (const edgeId of getLegalShipEdges(state, player.id, null)) {
      actions.push({ type: "BUILD_SHIP", edgeId });
    }
  }
}

/**
 * Helper to record an event into `state.eventLog` and `emittedEvents`.
 */
function pushEvent(
  state: CatanState,
  emitted: GameEvent[],
  type: string,
  message: string,
  playerId?: string,
  payload?: unknown
): void {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
    payload,
  };
  state.eventLog.push(evt);
  emitted.push(evt);
}

/**
 * Reveals any unexplored `fog` hexes adjacent to a newly placed/moved edge (Seafarers: Fog Islands).
 */
function revealAdjacentFogHexes(
  state: CatanState,
  edgeId: EdgeId,
  player: CatanPlayerState,
  rng: SeededRNG,
  emitted: GameEvent[]
): void {
  const eNode = state.topology.edges[edgeId];
  if (!eNode) return;

  for (const hId of eNode.adjacentHexIds) {
    const tile = state.hexes[hId];
    if (!tile || tile.terrain !== "fog") continue;

    const revealed = state.fogPool.pop() ?? {
      terrain: "forest" as const,
      numberToken: 6,
    };
    tile.terrain = revealed.terrain;
    tile.numberToken = revealed.numberToken;

    let bonusMsg = "";
    const prodRes =
      revealed.terrain === "gold"
        ? rng.pick(RESOURCES)
        : TERRAIN_TO_RESOURCE[revealed.terrain];
    if (prodRes && state.bank[prodRes] > 0) {
      state.bank[prodRes]--;
      player.resources[prodRes]++;
      bonusMsg = ` and discovered 1 ${prodRes}!`;
    }

    pushEvent(
      state,
      emitted,
      "FOG_HEX_REVEALED",
      `${player.name} explored fog hex (${tile.q},${tile.r}), revealing ${tile.terrain.toUpperCase()}${tile.numberToken ? ` (#${tile.numberToken})` : ""}${bonusMsg}`,
      player.id,
      { hexId: hId, terrain: tile.terrain, numberToken: tile.numberToken }
    );
  }
}

/**
 * Registers islands touched by a newly built settlement and awards +2 Bonus VP
 * in Seafarers when settling on a foreign island for the first time!
 */
function recordIslandSettlement(
  state: CatanState,
  vertexId: VertexId,
  player: CatanPlayerState,
  isSetup: boolean,
  emitted: GameEvent[]
): void {
  const vNode = state.topology.vertices[vertexId]!;
  const islandIds = new Set<number>();
  for (const hId of vNode.adjacentHexIds) {
    const t = state.hexes[hId];
    if (t && t.islandId > 0) {
      islandIds.add(t.islandId);
    }
  }

  for (const islandId of islandIds) {
    if (isSetup) {
      if (!player.homeIslandIds.includes(islandId)) {
        player.homeIslandIds.push(islandId);
      }
      if (!player.settledIslandIds.includes(islandId)) {
        player.settledIslandIds.push(islandId);
      }
    } else {
      if (!player.settledIslandIds.includes(islandId)) {
        player.settledIslandIds.push(islandId);
        if (state.config.enableSeafarers && !player.homeIslandIds.includes(islandId)) {
          player.bonusVictoryPoints += 2;
          pushEvent(
            state,
            emitted,
            "NEW_ISLAND_BONUS",
            `${player.name} colonized Island #${islandId} for the first time and earned +2 Bonus Victory Points!`,
            player.id,
            { islandId, bonusVp: 2 }
          );
        }
      }
    }
  }
}

/**
 * Applies `action` by `playerId` to `currentState`, returning a new state and emitted events.
 */
export function applyCatanAction(
  currentState: CatanState,
  playerId: string,
  action: CatanAction
): { state: CatanState; events: GameEvent[] } {
  const { topology, harbors, config, eventLog, ...mutableRest } = currentState;
  const state: CatanState = {
    ...structuredClone(mutableRest),
    topology,
    harbors,
    config,
    eventLog: eventLog.slice(),
  };
  const emitted: GameEvent[] = [];
  const rng = SeededRNG.fromState(state.rngState);

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}"`);
  }

  const activePlayer = state.players[state.activePlayerIndex]!;

  switch (action.type) {
    case "PLACE_SETUP_SETTLEMENT": {
      if (
        (state.phase !== "SETUP_SETTLEMENT_1" && state.phase !== "SETUP_SETTLEMENT_2") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Not your turn to place a setup settlement");
      }
      const legal = getLegalSettlementVertices(state, playerId, true);
      if (!legal.includes(action.vertexId)) {
        throw new Error(`Illegal setup settlement vertex ${action.vertexId}`);
      }

      state.buildings[action.vertexId] = {
        ownerId: playerId,
        type: "settlement",
      };
      player.settlementsRemaining--;
      state.lastSetupSettlementVertexId = action.vertexId;
      recordIslandSettlement(state, action.vertexId, player, true, emitted);

      // In Setup Round 2, grant starting resources for adjacent terrain hexes
      if (state.phase === "SETUP_SETTLEMENT_2") {
        const vNode = state.topology.vertices[action.vertexId]!;
        const gained: ResourceType[] = [];
        for (const hId of vNode.adjacentHexIds) {
          const tile = state.hexes[hId]!;
          const res = TERRAIN_TO_RESOURCE[tile.terrain];
          if (res && state.bank[res] > 0) {
            state.bank[res]--;
            player.resources[res]++;
            gained.push(res);
          }
        }
        pushEvent(
          state,
          emitted,
          "SETUP_SETTLEMENT",
          `${player.name} placed their 2nd settlement${gained.length > 0 ? ` and received starting resources (${gained.join(", ")})` : ""}.`,
          playerId,
          { vertexId: action.vertexId, gained }
        );
        state.phase = "SETUP_ROAD_2";
      } else {
        pushEvent(
          state,
          emitted,
          "SETUP_SETTLEMENT",
          `${player.name} placed their 1st settlement.`,
          playerId,
          { vertexId: action.vertexId }
        );
        state.phase = "SETUP_ROAD_1";
      }

      recalculateAwards(state);
      break;
    }

    case "PLACE_SETUP_EDGE": {
      if (
        (state.phase !== "SETUP_ROAD_1" && state.phase !== "SETUP_ROAD_2") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Not your turn to place a setup road/ship");
      }
      const anchor = state.lastSetupSettlementVertexId;
      if (!anchor) {
        throw new Error("Missing setup settlement anchor");
      }

      if (action.edgeKind === "ship") {
        const legalShips = getLegalShipEdges(state, playerId, anchor);
        if (!legalShips.includes(action.edgeId)) {
          throw new Error(`Illegal setup ship edge ${action.edgeId}`);
        }
        state.edges[action.edgeId] = {
          ownerId: playerId,
          type: "ship",
          builtOnTurn: 0,
        };
        player.shipsRemaining--;
      } else {
        const legalRoads = getLegalRoadEdges(state, playerId, anchor);
        if (!legalRoads.includes(action.edgeId)) {
          throw new Error(`Illegal setup road edge ${action.edgeId}`);
        }
        state.edges[action.edgeId] = {
          ownerId: playerId,
          type: "road",
          builtOnTurn: 0,
        };
        player.roadsRemaining--;
      }

      revealAdjacentFogHexes(state, action.edgeId, player, rng, emitted);
      state.lastSetupSettlementVertexId = null;

      pushEvent(
        state,
        emitted,
        "SETUP_EDGE",
        `${player.name} placed a starting ${action.edgeKind}.`,
        playerId,
        { edgeId: action.edgeId, edgeKind: action.edgeKind }
      );

      // Advance snake draft order relative to `startingPlayerIndex`
      const n = state.players.length;
      const startIdx = state.startingPlayerIndex ?? 0;
      if (state.phase === "SETUP_ROAD_1") {
        const nextIdx = (state.activePlayerIndex + 1) % n;
        if (nextIdx !== startIdx) {
          state.activePlayerIndex = nextIdx;
          state.phase = "SETUP_SETTLEMENT_1";
        } else {
          // Last player in clockwise order places 2nd settlement immediately (snake draft turn-around)
          state.phase = "SETUP_SETTLEMENT_2";
        }
      } else {
        if (state.activePlayerIndex !== startIdx) {
          state.activePlayerIndex = (state.activePlayerIndex - 1 + n) % n;
          state.phase = "SETUP_SETTLEMENT_2";
        } else {
          // Setup complete! Starting player begins Turn 1 PRE_ROLL
          state.phase = "PRE_ROLL";
        }
      }

      recalculateAwards(state);
      break;
    }

    case "ROLL_DICE": {
      if (state.phase !== "PRE_ROLL" || activePlayer.id !== playerId) {
        throw new Error("Cannot roll dice now");
      }
      const roll = rng.roll2d6();
      state.lastRoll = roll;

      pushEvent(
        state,
        emitted,
        "DICE_ROLLED",
        `${player.name} rolled ${roll.total} (${roll.die1} + ${roll.die2}).`,
        playerId,
        roll
      );

      if (roll.total === 7) {
        // Check which players exceed their safe hand limit
        const pendingDiscards: Record<string, number> = {};
        for (const p of state.players) {
          const count = totalResourceCount(p.resources);
          const safeLimit = getPlayerSafeHandLimit(state, p.id);
          if (count > safeLimit) {
            pendingDiscards[p.id] = Math.floor(count / 2);
          }
        }
        state.pendingDiscards = pendingDiscards;
        state.phaseAfterRobber = "MAIN_PHASE";

        if (Object.keys(pendingDiscards).length > 0) {
          state.phase = "DISCARD_ON_SEVEN";
        } else {
          state.phase = "MOVE_ROBBER_OR_PIRATE";
        }
      } else {
        distributeRollResources(state, roll.total, emitted);
        if (Object.keys(state.pendingGoldPicks).length > 0) {
          state.phase = "GOLD_RESOURCE_SELECTION";
        } else {
          state.phase = "MAIN_PHASE";
        }
      }
      break;
    }

    case "SELECT_GOLD_RESOURCE": {
      if (state.phase !== "GOLD_RESOURCE_SELECTION") {
        throw new Error("Not in gold resource selection phase");
      }
      const remaining = state.pendingGoldPicks[playerId] ?? 0;
      if (remaining <= 0) {
        throw new Error("Player has no pending gold resource picks");
      }

      if (state.bank[action.resource] > 0) {
        state.bank[action.resource]--;
        player.resources[action.resource]++;
        pushEvent(
          state,
          emitted,
          "GOLD_RESOURCE_PICKED",
          `${player.name} chose 1 ${action.resource} from the Gold River.`,
          playerId,
          { resource: action.resource }
        );
      }

      if (remaining - 1 <= 0) {
        delete state.pendingGoldPicks[playerId];
      } else {
        state.pendingGoldPicks[playerId] = remaining - 1;
      }

      if (Object.keys(state.pendingGoldPicks).length === 0) {
        state.phase = "MAIN_PHASE";
      }
      break;
    }

    case "DISCARD_CARDS": {
      if (state.phase !== "DISCARD_ON_SEVEN") {
        throw new Error("Not in discard phase");
      }
      const required = state.pendingDiscards[playerId] ?? 0;
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

      subtractResources(player.resources, action.resources);
      addResources(state.bank, action.resources);
      delete state.pendingDiscards[playerId];

      pushEvent(
        state,
        emitted,
        "CARDS_DISCARDED",
        `${player.name} discarded ${required} resource cards.`,
        playerId,
        { resources: action.resources }
      );

      if (Object.keys(state.pendingDiscards).length === 0) {
        state.phase = "MOVE_ROBBER_OR_PIRATE";
      }
      break;
    }

    case "MOVE_ROBBER": {
      if (state.phase !== "MOVE_ROBBER_OR_PIRATE" || activePlayer.id !== playerId) {
        throw new Error("Cannot move robber right now");
      }
      const legalHexes = getLegalRobberHexes(state, playerId);
      if (!legalHexes.includes(action.hexId)) {
        throw new Error(`Illegal robber destination ${action.hexId}`);
      }

      state.robberHexId = action.hexId;
      const hNode = state.topology.hexes[action.hexId]!;
      const victimSet = new Set<string>();
      for (const vId of hNode.cornerVertexIds) {
        const b = state.buildings[vId];
        if (b && b.ownerId !== playerId) {
          const victim = state.players.find((p) => p.id === b.ownerId)!;
          if (totalResourceCount(victim.resources) > 0) {
            victimSet.add(victim.id);
          }
        }
      }

      const candidates = Array.from(victimSet);
      pushEvent(
        state,
        emitted,
        "ROBBER_MOVED",
        `${player.name} moved the Robber to (${hNode.q},${hNode.r}).`,
        playerId,
        { hexId: action.hexId }
      );

      resolvePostRobberOrPirateSteal(state, player, candidates, rng, emitted);
      break;
    }

    case "MOVE_PIRATE": {
      if (state.phase !== "MOVE_ROBBER_OR_PIRATE" || activePlayer.id !== playerId) {
        throw new Error("Cannot move pirate right now");
      }
      const legalPirate = getLegalPirateHexes(state);
      if (!legalPirate.includes(action.hexId)) {
        throw new Error(`Illegal pirate destination ${action.hexId}`);
      }

      state.pirateHexId = action.hexId;
      const hNode = state.topology.hexes[action.hexId]!;
      const victimSet = new Set<string>();
      for (const eId of hNode.sideEdgeIds) {
        const route = state.edges[eId];
        if (route && route.type === "ship" && route.ownerId !== playerId) {
          const victim = state.players.find((p) => p.id === route.ownerId)!;
          if (totalResourceCount(victim.resources) > 0) {
            victimSet.add(victim.id);
          }
        }
      }

      const candidates = Array.from(victimSet);
      pushEvent(
        state,
        emitted,
        "PIRATE_MOVED",
        `${player.name} sailed the Pirate Fleet to sea hex (${hNode.q},${hNode.r}).`,
        playerId,
        { hexId: action.hexId }
      );

      resolvePostRobberOrPirateSteal(state, player, candidates, rng, emitted);
      break;
    }

    case "STEAL_FROM_PLAYER": {
      if (state.phase !== "STEAL_RESOURCE" || activePlayer.id !== playerId) {
        throw new Error("Not in steal phase");
      }
      if (!state.stealCandidates.includes(action.victimId)) {
        throw new Error(`Cannot steal from ${action.victimId}`);
      }
      const victim = state.players.find((p) => p.id === action.victimId)!;
      stealOneRandomCard(state, player, victim, rng, emitted);
      state.stealCandidates = [];
      state.phase = state.phaseAfterRobber;
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "BUILD_ROAD": {
      if (state.phase === "ROAD_BUILDING_DEV") {
        if (activePlayer.id !== playerId) {
          throw new Error("Not your turn");
        }
        const legal = getLegalRoadEdges(state, playerId, null);
        if (!legal.includes(action.edgeId)) {
          throw new Error(`Illegal road edge ${action.edgeId}`);
        }
        state.edges[action.edgeId] = {
          ownerId: playerId,
          type: "road",
          builtOnTurn: state.turn,
        };
        player.roadsRemaining--;
        state.freeRoadsRemaining--;
        revealAdjacentFogHexes(state, action.edgeId, player, rng, emitted);

        pushEvent(
          state,
          emitted,
          "ROAD_BUILT",
          `${player.name} built a free road (Road Building).`,
          playerId,
          { edgeId: action.edgeId }
        );

        const moreMoves =
          getLegalRoadEdges(state, playerId, null).length +
          getLegalShipEdges(state, playerId, null).length;
        if (state.freeRoadsRemaining <= 0 || moreMoves === 0) {
          state.freeRoadsRemaining = 0;
          state.phase = "MAIN_PHASE";
        }
        checkAndAssignWinner(state, playerId);
        break;
      }

      assertCanBuildInCurrentPhase(state, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.road)) {
        throw new Error("Insufficient resources for road");
      }
      const legal = getLegalRoadEdges(state, playerId, null);
      if (!legal.includes(action.edgeId)) {
        throw new Error(`Illegal road edge ${action.edgeId}`);
      }

      subtractResources(player.resources, BUILDING_COSTS.road);
      addResources(state.bank, BUILDING_COSTS.road);
      state.edges[action.edgeId] = {
        ownerId: playerId,
        type: "road",
        builtOnTurn: state.turn,
      };
      player.roadsRemaining--;
      revealAdjacentFogHexes(state, action.edgeId, player, rng, emitted);

      pushEvent(
        state,
        emitted,
        "ROAD_BUILT",
        `${player.name} built a road.`,
        playerId,
        { edgeId: action.edgeId }
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "BUILD_SHIP": {
      if (state.phase === "ROAD_BUILDING_DEV") {
        if (activePlayer.id !== playerId) {
          throw new Error("Not your turn");
        }
        const legal = getLegalShipEdges(state, playerId, null);
        if (!legal.includes(action.edgeId)) {
          throw new Error(`Illegal ship edge ${action.edgeId}`);
        }
        state.edges[action.edgeId] = {
          ownerId: playerId,
          type: "ship",
          builtOnTurn: state.turn,
        };
        player.shipsRemaining--;
        state.freeRoadsRemaining--;
        revealAdjacentFogHexes(state, action.edgeId, player, rng, emitted);

        pushEvent(
          state,
          emitted,
          "SHIP_BUILT",
          `${player.name} built a free ship (Road Building).`,
          playerId,
          { edgeId: action.edgeId }
        );

        const moreMoves =
          getLegalRoadEdges(state, playerId, null).length +
          getLegalShipEdges(state, playerId, null).length;
        if (state.freeRoadsRemaining <= 0 || moreMoves === 0) {
          state.freeRoadsRemaining = 0;
          state.phase = "MAIN_PHASE";
        }
        checkAndAssignWinner(state, playerId);
        break;
      }

      assertCanBuildInCurrentPhase(state, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.ship)) {
        throw new Error("Insufficient resources for ship");
      }
      const legal = getLegalShipEdges(state, playerId, null);
      if (!legal.includes(action.edgeId)) {
        throw new Error(`Illegal ship edge ${action.edgeId}`);
      }

      subtractResources(player.resources, BUILDING_COSTS.ship);
      addResources(state.bank, BUILDING_COSTS.ship);
      state.edges[action.edgeId] = {
        ownerId: playerId,
        type: "ship",
        builtOnTurn: state.turn,
      };
      player.shipsRemaining--;
      revealAdjacentFogHexes(state, action.edgeId, player, rng, emitted);

      pushEvent(
        state,
        emitted,
        "SHIP_BUILT",
        `${player.name} built a ship.`,
        playerId,
        { edgeId: action.edgeId }
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "MOVE_SHIP": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only move a ship during your main phase");
      }
      const legalMoves = getLegalMoveShipActions(state, playerId);
      const isLegal = legalMoves.some(
        (m) => m.fromEdgeId === action.fromEdgeId && m.toEdgeId === action.toEdgeId
      );
      if (!isLegal) {
        throw new Error(`Illegal ship move from ${action.fromEdgeId} to ${action.toEdgeId}`);
      }

      delete state.edges[action.fromEdgeId];
      state.edges[action.toEdgeId] = {
        ownerId: playerId,
        type: "ship",
        builtOnTurn: state.turn,
      };
      player.hasMovedShipThisTurn = true;
      revealAdjacentFogHexes(state, action.toEdgeId, player, rng, emitted);

      pushEvent(
        state,
        emitted,
        "SHIP_MOVED",
        `${player.name} repositioned an open ship.`,
        playerId,
        { fromEdgeId: action.fromEdgeId, toEdgeId: action.toEdgeId }
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "BUILD_SETTLEMENT": {
      assertCanBuildInCurrentPhase(state, playerId);
      if (!hasResources(player.resources, BUILDING_COSTS.settlement)) {
        throw new Error("Insufficient resources for settlement");
      }
      const legal = getLegalSettlementVertices(state, playerId, false);
      if (!legal.includes(action.vertexId)) {
        throw new Error(`Illegal settlement vertex ${action.vertexId}`);
      }

      subtractResources(player.resources, BUILDING_COSTS.settlement);
      addResources(state.bank, BUILDING_COSTS.settlement);
      state.buildings[action.vertexId] = {
        ownerId: playerId,
        type: "settlement",
      };
      player.settlementsRemaining--;
      recordIslandSettlement(state, action.vertexId, player, false, emitted);

      pushEvent(
        state,
        emitted,
        "SETTLEMENT_BUILT",
        `${player.name} built a settlement.`,
        playerId,
        { vertexId: action.vertexId }
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "BUILD_CITY": {
      assertCanBuildInCurrentPhase(state, playerId);
      if (player.citiesRemaining <= 0) {
        throw new Error("No cities remaining");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.city)) {
        throw new Error("Insufficient resources for city");
      }
      const existing = state.buildings[action.vertexId];
      if (!existing || existing.ownerId !== playerId || existing.type !== "settlement") {
        throw new Error("Can only upgrade your own settlement to a city");
      }

      subtractResources(player.resources, BUILDING_COSTS.city);
      addResources(state.bank, BUILDING_COSTS.city);
      existing.type = "city";
      player.citiesRemaining--;
      player.settlementsRemaining++; // Settlement piece returned to player's supply

      pushEvent(
        state,
        emitted,
        "CITY_BUILT",
        `${player.name} upgraded a settlement to a city!`,
        playerId,
        { vertexId: action.vertexId }
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "BUILD_CITY_WALL": {
      assertCanBuildInCurrentPhase(state, playerId);
      if (!state.config.enableCityWalls || player.cityWallsRemaining <= 0) {
        throw new Error("City walls unavailable");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.cityWall)) {
        throw new Error("Insufficient resources for city wall");
      }
      const existing = state.buildings[action.vertexId];
      if (!existing || existing.ownerId !== playerId || existing.type !== "city" || existing.hasWall) {
        throw new Error("Must build a city wall under an unwalled city you own");
      }

      subtractResources(player.resources, BUILDING_COSTS.cityWall);
      addResources(state.bank, BUILDING_COSTS.cityWall);
      existing.hasWall = true;
      player.cityWallsRemaining--;

      pushEvent(
        state,
        emitted,
        "CITY_WALL_BUILT",
        `${player.name} fortified a city with City Walls (+2 safe hand limit).`,
        playerId,
        { vertexId: action.vertexId }
      );
      break;
    }

    case "BUY_DEV_CARD": {
      assertCanBuildInCurrentPhase(state, playerId);
      if (state.devCardDeck.length === 0) {
        throw new Error("Development card deck is empty");
      }
      if (!hasResources(player.resources, BUILDING_COSTS.devCard)) {
        throw new Error("Insufficient resources for development card");
      }

      subtractResources(player.resources, BUILDING_COSTS.devCard);
      addResources(state.bank, BUILDING_COSTS.devCard);
      const cardType = state.devCardDeck.pop()!;
      player.devCards.push({
        id: `dev-${state.turn}-${player.devCards.length}-${state.devCardDeck.length}`,
        type: cardType,
        boughtOnTurn: state.turn,
        played: false,
      });

      pushEvent(
        state,
        emitted,
        "DEV_CARD_BOUGHT",
        `${player.name} bought a Development Card.`,
        playerId
      );
      checkAndAssignWinner(state, playerId);
      break;
    }

    case "PLAY_KNIGHT": {
      if (
        (state.phase !== "PRE_ROLL" && state.phase !== "MAIN_PHASE") ||
        activePlayer.id !== playerId
      ) {
        throw new Error("Cannot play Knight right now");
      }
      if (!canPlayDevCard(state, player, "knight")) {
        throw new Error("No playable Knight card");
      }

      const card = player.devCards.find(
        (c) => !c.played && c.type === "knight" && c.boughtOnTurn < state.turn
      )!;
      card.played = true;
      player.hasPlayedDevCardThisTurn = true;
      player.knightsPlayed++;

      pushEvent(
        state,
        emitted,
        "KNIGHT_PLAYED",
        `${player.name} played a Knight (${player.knightsPlayed} total).`,
        playerId
      );

      recalculateAwards(state);
      state.phaseAfterRobber = state.phase;
      state.phase = "MOVE_ROBBER_OR_PIRATE";
      break;
    }

    case "PLAY_ROAD_BUILDING": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Road Building right now");
      }
      if (!canPlayDevCard(state, player, "road_building")) {
        throw new Error("No playable Road Building card");
      }

      const card = player.devCards.find(
        (c) => !c.played && c.type === "road_building" && c.boughtOnTurn < state.turn
      )!;
      card.played = true;
      player.hasPlayedDevCardThisTurn = true;

      const availablePieces = player.roadsRemaining + player.shipsRemaining;
      const availableSpots =
        getLegalRoadEdges(state, playerId, null).length +
        getLegalShipEdges(state, playerId, null).length;

      state.freeRoadsRemaining = Math.min(2, availablePieces, availableSpots);
      if (state.freeRoadsRemaining > 0) {
        state.phase = "ROAD_BUILDING_DEV";
      }

      pushEvent(
        state,
        emitted,
        "ROAD_BUILDING_PLAYED",
        `${player.name} played Road Building!`,
        playerId
      );
      break;
    }

    case "PLAY_YEAR_OF_PLENTY": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Year of Plenty right now");
      }
      if (!canPlayDevCard(state, player, "year_of_plenty")) {
        throw new Error("No playable Year of Plenty card");
      }
      if (action.resource1 === action.resource2) {
        if (state.bank[action.resource1] < 2) {
          throw new Error(`Bank does not have 2 ${action.resource1}`);
        }
      } else {
        if (state.bank[action.resource1] < 1 || state.bank[action.resource2] < 1) {
          throw new Error("Bank does not have requested resources");
        }
      }

      const card = player.devCards.find(
        (c) => !c.played && c.type === "year_of_plenty" && c.boughtOnTurn < state.turn
      )!;
      card.played = true;
      player.hasPlayedDevCardThisTurn = true;

      state.bank[action.resource1]--;
      state.bank[action.resource2]--;
      player.resources[action.resource1]++;
      player.resources[action.resource2]++;

      pushEvent(
        state,
        emitted,
        "YEAR_OF_PLENTY_PLAYED",
        `${player.name} played Year of Plenty and took ${action.resource1} + ${action.resource2}.`,
        playerId,
        { resource1: action.resource1, resource2: action.resource2 }
      );
      break;
    }

    case "PLAY_MONOPOLY": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot play Monopoly right now");
      }
      if (!canPlayDevCard(state, player, "monopoly")) {
        throw new Error("No playable Monopoly card");
      }

      const card = player.devCards.find(
        (c) => !c.played && c.type === "monopoly" && c.boughtOnTurn < state.turn
      )!;
      card.played = true;
      player.hasPlayedDevCardThisTurn = true;

      let totalClaimed = 0;
      for (const other of state.players) {
        if (other.id === playerId) continue;
        const count = other.resources[action.resource];
        if (count > 0) {
          other.resources[action.resource] = 0;
          player.resources[action.resource] += count;
          totalClaimed += count;
        }
      }

      pushEvent(
        state,
        emitted,
        "MONOPOLY_PLAYED",
        `${player.name} played Monopoly on ${action.resource.toUpperCase()} and collected ${totalClaimed} cards!`,
        playerId,
        { resource: action.resource, totalClaimed }
      );
      break;
    }

    case "MARITIME_TRADE": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only trade during your main phase");
      }
      if (action.give === action.receive) {
        throw new Error("Cannot trade a resource for itself");
      }
      const ratios = getPlayerTradeRatios(state, playerId);
      const expectedRatio = ratios[action.give];
      if (action.giveAmount !== expectedRatio) {
        throw new Error(`Expected trade ratio ${expectedRatio}:1 for ${action.give}`);
      }
      if (player.resources[action.give] < expectedRatio) {
        throw new Error(`Not enough ${action.give} for maritime trade`);
      }
      if (state.bank[action.receive] < 1) {
        throw new Error(`Bank is out of ${action.receive}`);
      }

      player.resources[action.give] -= expectedRatio;
      state.bank[action.give] += expectedRatio;
      state.bank[action.receive] -= 1;
      player.resources[action.receive] += 1;

      pushEvent(
        state,
        emitted,
        "MARITIME_TRADE",
        `${player.name} traded ${expectedRatio} ${action.give} for 1 ${action.receive} (${expectedRatio}:1).`,
        playerId,
        action
      );
      break;
    }

    case "OFFER_DOMESTIC_TRADE": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Can only offer domestic trade on your main phase");
      }
      if (totalResourceCount(action.give) <= 0 || totalResourceCount(action.want) <= 0) {
        throw new Error("Domestic trade must give and want at least 1 resource");
      }
      if (!hasResources(player.resources, action.give)) {
        throw new Error("You do not have the offered resources");
      }

      state.activeTradeOffer = {
        id: `offer-${state.turn}-${ state.eventLog.length}`,
        fromPlayerId: playerId,
        toPlayerId: action.toPlayerId,
        give: action.give,
        want: action.want,
        declinedBy: [],
      };

      pushEvent(
        state,
        emitted,
        "DOMESTIC_TRADE_OFFERED",
        `${player.name} offered a trade to ${action.toPlayerId ? state.players.find((p) => p.id === action.toPlayerId)?.name : "all players"}.`,
        playerId,
        state.activeTradeOffer
      );
      break;
    }

    case "ACCEPT_DOMESTIC_TRADE": {
      if (state.phase !== "MAIN_PHASE" || !state.activeTradeOffer) {
        throw new Error("No active domestic trade offer");
      }
      const offer = state.activeTradeOffer;
      if (offer.id !== action.offerId) {
        throw new Error("Mismatched trade offer ID");
      }
      if (offer.fromPlayerId === playerId) {
        throw new Error("Cannot accept your own trade offer");
      }
      if (offer.toPlayerId !== null && offer.toPlayerId !== playerId) {
        throw new Error("This trade offer is for another player");
      }

      const proposer = state.players.find((p) => p.id === offer.fromPlayerId)!;
      if (!hasResources(proposer.resources, offer.give)) {
        throw new Error("Proposer no longer has offered resources");
      }
      if (!hasResources(player.resources, offer.want)) {
        throw new Error("You do not have the requested resources");
      }

      subtractResources(proposer.resources, offer.give);
      addResources(player.resources, offer.give);
      subtractResources(player.resources, offer.want);
      addResources(proposer.resources, offer.want);
      state.activeTradeOffer = null;

      pushEvent(
        state,
        emitted,
        "DOMESTIC_TRADE_COMPLETED",
        `${player.name} accepted ${proposer.name}'s trade offer!`,
        playerId,
        offer
      );
      break;
    }

    case "DECLINE_DOMESTIC_TRADE": {
      if (state.phase !== "MAIN_PHASE" || !state.activeTradeOffer) {
        throw new Error("No active trade offer");
      }
      const offer = state.activeTradeOffer;
      if (!offer.declinedBy.includes(playerId)) {
        offer.declinedBy.push(playerId);
      }
      const otherPlayers = state.players.filter((p) => p.id !== offer.fromPlayerId);
      const allDeclined =
        (offer.toPlayerId !== null && offer.declinedBy.includes(offer.toPlayerId)) ||
        otherPlayers.every((p) => offer.declinedBy.includes(p.id));
      if (allDeclined) {
        state.activeTradeOffer = null;
      }
      pushEvent(
        state,
        emitted,
        "DOMESTIC_TRADE_DECLINED",
        `${player.name} declined the trade offer.`,
        playerId
      );
      break;
    }

    case "CANCEL_DOMESTIC_TRADE": {
      if (!state.activeTradeOffer || state.activeTradeOffer.fromPlayerId !== playerId) {
        throw new Error("No trade offer to cancel");
      }
      state.activeTradeOffer = null;
      pushEvent(
        state,
        emitted,
        "DOMESTIC_TRADE_CANCELLED",
        `${player.name} cancelled their trade offer.`,
        playerId
      );
      break;
    }

    case "END_TURN": {
      if (state.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
        throw new Error("Cannot end turn now");
      }
      state.activeTradeOffer = null;

      if (checkAndAssignWinner(state, playerId)) {
        break;
      }

      if (state.config.enableSpecialBuildingPhase && state.players.length >= 3) {
        state.phase = "SPECIAL_BUILDING";
        state.specialBuildPlayerIndex =
          (state.activePlayerIndex + 1) % state.players.length;
        pushEvent(
          state,
          emitted,
          "SPECIAL_BUILDING_STARTED",
          `${player.name} ended their turn. Special Building Phase started.`,
          playerId
        );
      } else {
        advanceToNextPlayerTurn(state, emitted);
      }
      break;
    }

    case "END_SPECIAL_BUILD": {
      if (
        state.phase !== "SPECIAL_BUILDING" ||
        state.specialBuildPlayerIndex === null ||
        state.players[state.specialBuildPlayerIndex]?.id !== playerId
      ) {
        throw new Error("Not your Special Building turn");
      }

      if (checkAndAssignWinner(state, playerId)) {
        break;
      }

      const nextSbIndex = (state.specialBuildPlayerIndex + 1) % state.players.length;
      if (nextSbIndex === state.activePlayerIndex) {
        state.specialBuildPlayerIndex = null;
        advanceToNextPlayerTurn(state, emitted);
      } else {
        state.specialBuildPlayerIndex = nextSbIndex;
      }
      break;
    }

    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }

  state.rngState = rng.getState();
  return { state, events: emitted };
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

function advanceToNextPlayerTurn(state: CatanState, emitted: GameEvent[]): void {
  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  state.turn++;
  for (const p of state.players) {
    p.hasPlayedDevCardThisTurn = false;
    p.hasMovedShipThisTurn = false;
  }

  if (state.turn > state.config.maxTurns) {
    // Declare player with highest VP the winner if maxTurns cap reached
    recalculateAwards(state);
    let bestPlayer = state.players[0]!;
    let bestVp = -1;
    for (const p of state.players) {
      const vp = computePlayerVictoryPoints(state, p.id, false);
      if (vp > bestVp) {
        bestVp = vp;
        bestPlayer = p;
      }
    }
    state.winnerId = bestPlayer.id;
    state.phase = "GAME_OVER";
    pushEvent(
      state,
      emitted,
      "GAME_OVER_MAX_TURNS",
      `Max turns reached. ${bestPlayer.name} wins with ${bestVp} VP!`,
      bestPlayer.id
    );
    return;
  }

  state.phase = "PRE_ROLL";
  const nextPlayer = state.players[state.activePlayerIndex]!;
  pushEvent(
    state,
    emitted,
    "TURN_STARTED",
    `Turn ${state.turn}: ${nextPlayer.name}'s turn.`,
    nextPlayer.id
  );
  checkAndAssignWinner(state, nextPlayer.id);
}

/**
 * Distributes resources on a non-7 dice roll, respecting the Catan bank shortage rule:
 * If the bank does not have enough of a resource to fulfill all players' production for that
 * resource on this roll, NO player receives that resource (unless only 1 player is owed that resource,
 * in which case they receive whatever remains in the bank).
 */
function distributeRollResources(
  state: CatanState,
  rollTotal: number,
  emitted: GameEvent[]
): void {
  const owedByResource: Record<ResourceType, Record<string, number>> = {
    brick: {},
    lumber: {},
    wool: {},
    grain: {},
    ore: {},
  };
  const goldOwed: Record<string, number> = {};

  for (const hId of state.topology.hexOrder) {
    if (hId === state.robberHexId) continue; // Blocked by Robber
    const tile = state.hexes[hId]!;
    if (tile.numberToken !== rollTotal) continue;

    const hNode = state.topology.hexes[hId]!;
    for (const vId of hNode.cornerVertexIds) {
      const b = state.buildings[vId];
      if (!b) continue;
      const amount = b.type === "city" ? 2 : 1;

      if (tile.terrain === "gold") {
        goldOwed[b.ownerId] = (goldOwed[b.ownerId] ?? 0) + amount;
      } else {
        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        if (res) {
          owedByResource[res][b.ownerId] =
            (owedByResource[res][b.ownerId] ?? 0) + amount;
        }
      }
    }
  }

  const summaryParts: string[] = [];

  for (const res of RESOURCES) {
    const playerDemands = owedByResource[res];
    const demandingPlayerIds = Object.keys(playerDemands);
    if (demandingPlayerIds.length === 0) continue;

    const totalDemand = Object.values(playerDemands).reduce((a, b) => a + b, 0);
    if (state.bank[res] >= totalDemand) {
      for (const [pId, amt] of Object.entries(playerDemands)) {
        const p = state.players.find((pl) => pl.id === pId)!;
        state.bank[res] -= amt;
        p.resources[res] += amt;
        summaryParts.push(`${p.name} +${amt} ${res}`);
      }
    } else if (demandingPlayerIds.length === 1 && state.bank[res] > 0) {
      const pId = demandingPlayerIds[0]!;
      const p = state.players.find((pl) => pl.id === pId)!;
      const amt = state.bank[res];
      state.bank[res] = 0;
      p.resources[res] += amt;
      summaryParts.push(`${p.name} +${amt} ${res} (partial bank)`);
    }
  }

  const totalBankRemaining = totalResourceCount(state.bank);
  if (totalBankRemaining > 0) {
    for (const [pId, count] of Object.entries(goldOwed)) {
      if (count > 0) {
        state.pendingGoldPicks[pId] = count;
        const p = state.players.find((pl) => pl.id === pId)!;
        summaryParts.push(`${p.name} +${count} Gold pick(s)`);
      }
    }
  }

  if (summaryParts.length > 0) {
    pushEvent(
      state,
      emitted,
      "RESOURCES_PRODUCED",
      `Production: ${summaryParts.join(", ")}.`
    );
  }
}

function resolvePostRobberOrPirateSteal(
  state: CatanState,
  thief: CatanPlayerState,
  candidates: string[],
  rng: SeededRNG,
  emitted: GameEvent[]
): void {
  if (candidates.length === 0) {
    state.stealCandidates = [];
    state.phase = state.phaseAfterRobber;
    checkAndAssignWinner(state, thief.id);
  } else if (candidates.length === 1) {
    const victim = state.players.find((p) => p.id === candidates[0])!;
    stealOneRandomCard(state, thief, victim, rng, emitted);
    state.stealCandidates = [];
    state.phase = state.phaseAfterRobber;
    checkAndAssignWinner(state, thief.id);
  } else {
    state.stealCandidates = candidates;
    state.phase = "STEAL_RESOURCE";
  }
}

function stealOneRandomCard(
  state: CatanState,
  thief: CatanPlayerState,
  victim: CatanPlayerState,
  rng: SeededRNG,
  emitted: GameEvent[]
): void {
  const pool: ResourceType[] = [];
  for (const r of RESOURCES) {
    for (let i = 0; i < victim.resources[r]; i++) {
      pool.push(r);
    }
  }
  if (pool.length === 0) return;

  const stolen = rng.pick(pool);
  victim.resources[stolen]--;
  thief.resources[stolen]++;

  pushEvent(
    state,
    emitted,
    "RESOURCE_STOLEN",
    `${thief.name} stole 1 resource card from ${victim.name}.`,
    thief.id,
    { victimId: victim.id }
  );
}

/**
 * Verifies domain invariants on `state` to catch any state corruption or rule bug immediately.
 */
export function checkCatanInvariants(state: CatanState): InvariantCheckResult {
  const violations: string[] = [];

  // 1. Non-negative bank & player resources + total conservation per resource
  const isExpanded =
    state.players.length >= 5 || state.config.scenarioId === "big_island_5_6";
  const expectedTotalPerResource = isExpanded ? 24 : 19;

  for (const r of RESOURCES) {
    if (state.bank[r] < 0) {
      violations.push(`Bank has negative ${r}: ${state.bank[r]}`);
    }
    let playerSum = 0;
    for (const p of state.players) {
      if (p.resources[r] < 0) {
        violations.push(`Player ${p.id} has negative ${r}: ${p.resources[r]}`);
      }
      playerSum += p.resources[r];
    }
    if (state.bank[r] + playerSum !== expectedTotalPerResource) {
      violations.push(
        `Resource conservation violated for ${r}: bank(${state.bank[r]}) + players(${playerSum}) !== ${expectedTotalPerResource}`
      );
    }
  }

  // 2. Distance Rule on all buildings
  for (const [vId, b] of Object.entries(state.buildings)) {
    const vNode = state.topology.vertices[vId];
    if (!vNode) {
      violations.push(`Building placed on non-existent vertex ${vId}`);
      continue;
    }
    for (const adjVId of vNode.adjacentVertexIds) {
      if (state.buildings[adjVId]) {
        violations.push(
          `Distance rule violated: adjacent buildings at ${vId} (${b.ownerId}) and ${adjVId} (${state.buildings[adjVId]!.ownerId})`
        );
      }
    }
  }

  // 3. Piece supply counts match board pieces
  for (const p of state.players) {
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

    if (settlementsOnBoard + p.settlementsRemaining !== 5) {
      violations.push(
        `Player ${p.id} settlement count mismatch: ${settlementsOnBoard} + ${p.settlementsRemaining} !== 5`
      );
    }
    if (citiesOnBoard + p.citiesRemaining !== 4) {
      violations.push(
        `Player ${p.id} city count mismatch: ${citiesOnBoard} + ${p.citiesRemaining} !== 4`
      );
    }
    if (roadsOnBoard + p.roadsRemaining !== 15) {
      violations.push(
        `Player ${p.id} road count mismatch: ${roadsOnBoard} + ${p.roadsRemaining} !== 15`
      );
    }
    if (state.config.enableSeafarers && shipsOnBoard + p.shipsRemaining !== 15) {
      violations.push(
        `Player ${p.id} ship count mismatch: ${shipsOnBoard} + ${p.shipsRemaining} !== 15`
      );
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
