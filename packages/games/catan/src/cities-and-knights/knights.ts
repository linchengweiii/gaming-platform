import type { EdgeId, HexId, VertexId } from "@gaming-platform/core";
import { NUMBER_TOKEN_PIPS } from "../config/costs-and-limits.ts";
import type { KnightLevel, KnightPiece } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

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

/**
 * Returns true iff `vertexId` borders at least one land hex (non-sea, non-fog).
 * Official Seafarers + C&K rule: Knights may only stand on land intersections.
 */
export function isLandVertexPure(state: CatanState, vertexId: VertexId): boolean {
  const vNode = state.topology.vertices[vertexId];
  if (!vNode) return false;
  return vNode.adjacentHexIds.some((hId) => {
    const t = state.hexes[hId]?.terrain;
    return Boolean(t && t !== "sea" && t !== "fog");
  });
}

/**
 * Returns valid empty land vertices connected to `playerId`'s own roads (ignoring knight supply).
 */
export function getLegalKnightPlacementVerticesPure(
  state: CatanState,
  playerId: string
): VertexId[] {
  if (!state.config.enableCitiesAndKnights) return [];
  return state.topology.vertexOrder.filter((vId) => {
    if (state.buildings[vId] || state.knights[vId]) return false;
    if (!isLandVertexPure(state, vId)) return false;
    const vNode = state.topology.vertices[vId]!;
    return vNode.incidentEdgeIds.some(
      (eId) =>
        state.edges[eId]?.ownerId === playerId &&
        state.edges[eId]?.type === "road"
    );
  });
}

/**
 * Returns valid empty land vertices connected to `playerId`'s roads for `BUILD_KNIGHT`.
 */
export function getLegalBuildKnightVertices(
  state: CatanState,
  playerId: string
): VertexId[] {
  if (!state.config.enableCitiesAndKnights) return [];
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.basicKnightsRemaining <= 0) return [];
  return getLegalKnightPlacementVerticesPure(state, playerId);
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
 * Pure BFS along `playerId`'s own roads (land intersections only) from `startVertexId`,
 * stopping at vertices blocked by an opponent's building or knight.
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
      if (!route || route.ownerId !== playerId || route.type !== "road") continue;
      const eNode = state.topology.edges[edgeId];
      if (!eNode) continue;
      const neighbor = eNode.v1 === current ? eNode.v2 : eNode.v1;
      if (visited.has(neighbor) || !isLandVertexPure(state, neighbor)) continue;
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
 * Prepares displacement of `displacedKnight` from `fromVertexId` on `stateAfterDisplacerPlaced`
 * (where `fromVertexId` is already occupied by an attacking knight or vacated by Intrigue).
 * Returns legal retreat vertices along the victim's own road network.
 */
export function prepareDisplaceKnightPure(
  stateAfterDisplacerPlaced: CatanState,
  displacedKnight: KnightPiece,
  fromVertexId: VertexId
): {
  candidateVertexIds: VertexId[];
  playersIfRemoved: CatanPlayerState[];
} {
  const candidateVertexIds = getReachableKnightVertices(
    stateAfterDisplacerPlaced,
    displacedKnight.ownerId,
    fromVertexId,
    displacedKnight.level,
    false
  );
  const playersIfRemoved = stateAfterDisplacerPlaced.players.map((p) =>
    p.id === displacedKnight.ownerId
      ? returnKnightToSupplyPure(p, displacedKnight.level)
      : p
  );
  return { candidateVertexIds, playersIfRemoved };
}

/**
 * Relocates a displaced opponent knight at `displacedVertexId` to the highest-pip connected
 * empty vertex on its owner's road network, or returns it to supply if none exists.
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
 * Returns open-ended roads eligible for `diplomat` removal.
 * A road is open-ended if at least one of its endpoints has no other road of that owner,
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
        const otherOwnRoads = vNode.incidentEdgeIds.filter(
          (incId) =>
            incId !== eId &&
            state.edges[incId]?.ownerId === route.ownerId &&
            state.edges[incId]?.type === "road"
        );
        return otherOwnRoads.length === 0;
      };

      return isOpenEndpoint(eNode.v1) || isOpenEndpoint(eNode.v2);
    })
    .map(([eId]) => eId);
}
