import {
  type EdgeId,
  type GameEvent,
  type VertexId,
  pickPure,
} from "@gaming-platform/core";
import { TERRAIN_TO_RESOURCE } from "../config/costs-and-limits.ts";
import { RESOURCES } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import {
  type StateWithEvents,
  addResourcesPure,
  appendCatanEvent,
  omitRecordKey,
  updatePlayerById,
} from "./helpers.ts";

/**
 * Returns all valid vertices where `playerId` can build a Settlement (or 2nd-setup City in Cities & Knights).
 */
export function getLegalSettlementVertices(
  state: CatanState,
  playerId: string,
  isSetup: boolean
): VertexId[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const placingSetupCity =
    isSetup &&
    state.config.enableCitiesAndKnights &&
    state.phase === "SETUP_SETTLEMENT_2";
  if (placingSetupCity) {
    if (player.citiesRemaining <= 0) return [];
  } else if (player.settlementsRemaining <= 0) {
    return [];
  }

  return state.topology.vertexOrder.filter((vId) => {
    if (state.buildings[vId] || state.knights[vId]) return false;
    const vNode = state.topology.vertices[vId]!;

    // Distance rule: no adjacent vertex can have a building
    const hasAdjacentBuilding = vNode.adjacentVertexIds.some((adjId) =>
      Boolean(state.buildings[adjId])
    );
    if (hasAdjacentBuilding) return false;

    // Must touch at least one land hex
    const adjTiles = vNode.adjacentHexIds
      .map((hId) => state.hexes[hId]!)
      .filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) return false;

    if (isSetup) {
      return adjTiles.some(
        (t) =>
          t.allowSetupSettlement && t.terrain !== "sea" && t.terrain !== "fog"
      );
    }

    // Must connect to at least one road or ship owned by playerId
    return vNode.incidentEdgeIds.some(
      (eId) => state.edges[eId]?.ownerId === playerId
    );
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
    const adjTiles = eNode.adjacentHexIds
      .map((hId) => state.hexes[hId]!)
      .filter(Boolean);
    const touchesLand = adjTiles.some(
      (t) => t.terrain !== "sea" && t.terrain !== "fog"
    );
    if (!touchesLand) return false;

    if (setupAnchorVertexId) {
      return (
        eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId
      );
    }

    // Normal play: check if v1 or v2 connects to player's network without being blocked
    return [eNode.v1, eNode.v2].some((vId) => {
      const building = state.buildings[vId];
      if (building) {
        return building.ownerId === playerId;
      }
      const knight = state.knights[vId];
      if (knight && knight.ownerId !== playerId) {
        return false;
      }
      const vNode = state.topology.vertices[vId]!;
      return vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return Boolean(
          route && route.ownerId === playerId && route.type === "road"
        );
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
    const adjTiles = eNode.adjacentHexIds
      .map((hId) => state.hexes[hId]!)
      .filter(Boolean);
    const touchesSea = adjTiles.some((t) => t.terrain === "sea");
    if (!touchesSea) return false;

    if (setupAnchorVertexId) {
      return (
        eNode.v1 === setupAnchorVertexId || eNode.v2 === setupAnchorVertexId
      );
    }

    return [eNode.v1, eNode.v2].some((vId) => {
      const building = state.buildings[vId];
      if (building) {
        return building.ownerId === playerId;
      }
      const knight = state.knights[vId];
      if (knight && knight.ownerId !== playerId) {
        return false;
      }
      const vNode = state.topology.vertices[vId]!;
      return vNode.incidentEdgeIds.some((incId) => {
        const route = state.edges[incId];
        return Boolean(
          route && route.ownerId === playerId && route.type === "ship"
        );
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
        const otherOwnShips = vNode.incidentEdgeIds.filter(
          (incId) =>
            incId !== eId &&
            state.edges[incId]?.ownerId === playerId &&
            state.edges[incId]?.type === "ship"
        );
        return otherOwnShips.length === 0;
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
 * Purely reveals any unexplored `fog` hexes adjacent to a newly placed/moved edge (Seafarers: Fog Islands).
 */
export function revealAdjacentFogHexesPure(
  state: CatanState,
  edgeId: EdgeId,
  playerId: string,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const eNode = state.topology.edges[edgeId];
  if (!eNode) {
    return { state, emitted: emitted.slice() };
  }

  const candidateHexIds = Array.from(
    new Set([
      ...eNode.adjacentHexIds,
      ...(state.topology.vertices[eNode.v1]?.adjacentHexIds ?? []),
      ...(state.topology.vertices[eNode.v2]?.adjacentHexIds ?? []),
    ])
  );

  return candidateHexIds.reduce<StateWithEvents>(
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
export function recordIslandSettlementPure(
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
        acc.state.config.enableSeafarers &&
        !player.homeIslandIds.includes(islandId);
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
