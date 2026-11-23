import { computeLongestSimpleEdgePath } from "@gaming-platform/core";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { getLegalSettlementVertices } from "../rules/network.ts";
import type { ResourceType } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { evaluateVertexScore } from "./board-eval.ts";
import { isOpenLandSettlementVertex } from "./utils.ts";

/**
 * Shortest sea-edge hop distance from `startEdgeId` to any open vertex on an unsettled
 * foreign island (`islandId >= 2` or `fog`) respecting the distance rule.
 */
export function seaHopsToForeignIsland(
  state: CatanState,
  playerId: string,
  startEdgeId: string
): number {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return 99;
  const homeIds = me.homeIslandIds.length > 0 ? me.homeIslandIds : [1];
  const homeMap: Record<number, true> = {};
  for (const id of homeIds) homeMap[id] = true;

  const isTargetVertex = (vId: string): boolean => {
    if (state.buildings[vId]) return false;
    const v = state.topology.vertices[vId];
    if (!v) return false;
    if (v.adjacentVertexIds.some((adj) => Boolean(state.buildings[adj]))) {
      return false;
    }
    return v.adjacentHexIds.some((hId) => {
      const h = state.hexes[hId];
      if (!h) return false;
      if (h.terrain === "fog") return true;
      return (
        h.islandId >= 2 &&
        !homeMap[h.islandId] &&
        !me.settledIslandIds.includes(h.islandId)
      );
    });
  };

  const e0 = state.topology.edges[startEdgeId];
  if (!e0) return 99;
  if (isTargetVertex(e0.v1) || isTargetVertex(e0.v2)) return 0;

  const visitedVerts: Record<string, true> = {
    [e0.v1]: true,
    [e0.v2]: true,
  };
  const queue: Array<{ vId: string; dist: number }> = [
    { vId: e0.v1, dist: 0 },
    { vId: e0.v2, dist: 0 },
  ];

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]!;
    head += 1;
    if (cur.dist >= 7) continue;
    const v = state.topology.vertices[cur.vId];
    if (!v) continue;
    const b = state.buildings[cur.vId];
    if (b && b.ownerId !== playerId) continue;

    for (const nextEdgeId of v.incidentEdgeIds) {
      const edgeOwner = state.edges[nextEdgeId]?.ownerId;
      if (edgeOwner && edgeOwner !== playerId) continue;
      const ne = state.topology.edges[nextEdgeId];
      if (!ne) continue;
      const isWater = ne.adjacentHexIds.some((hId) => {
        const t = state.hexes[hId]?.terrain;
        return t === "sea" || t === "fog";
      });
      if (!isWater && edgeOwner !== playerId) continue;
      const nextV = ne.v1 === cur.vId ? ne.v2 : ne.v1;
      if (visitedVerts[nextV]) continue;
      const stepCost = edgeOwner === playerId ? 0 : 1;
      const nd = cur.dist + stepCost;
      if (isTargetVertex(nextV)) return nd;
      visitedVerts[nextV] = true;
      queue.push({ vId: nextV, dist: nd });
    }
  }
  return 99;
}

function collectBlockedVerticesForRoute(
  state: CatanState,
  ownerId: string,
  extraBlockedVertexId?: string
): Set<string> {
  const blocked = new Set<string>(
    extraBlockedVertexId ? [extraBlockedVertexId] : undefined
  );
  for (const [vId, b] of Object.entries(state.buildings)) {
    if (b.ownerId !== ownerId) blocked.add(vId);
  }
  if (state.config.enableCitiesAndKnights) {
    for (const [vId, k] of Object.entries(state.knights)) {
      if (k.ownerId !== ownerId) blocked.add(vId);
    }
  }
  return blocked;
}

/**
 * Computes `playerId`'s Longest Road / Trade Route if `addedEdge` is placed (and optional `removedEdgeId` removed).
 */
export function simulateRouteLengthWithEdge(
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

  const blockedVertices = collectBlockedVerticesForRoute(state, playerId);

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
export function simulateOpponentRouteLengthAfterBlock(
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

  const blockedVertices = collectBlockedVerticesForRoute(
    state,
    oppId,
    blockedVertexId
  );

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
 * Shortest unblocked edge distance from player's current road/ship network to any open legal settlement spot.
 */
export function analyzeExpansionNetwork(
  state: CatanState,
  playerId: string,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): {
  immediateVertices: string[];
  bestOneHopVertexScore: number;
  hasReachableSpot: boolean;
} {
  const immediateVertices = getLegalSettlementVertices(state, playerId, false);
  let bestOneHopVertexScore = 0;
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
      if (isOpenLandSettlementVertex(state, nextV)) {
        hasReachableSpot = true;
        const sc = evaluateVertexScore(
          state,
          nextV,
          playerId,
          weights,
          scarcity
        );
        if (sc > bestOneHopVertexScore) bestOneHopVertexScore = sc;
      }
      if (!hasReachableSpot) {
        for (const hop2 of state.topology.vertices[nextV]?.adjacentVertexIds ??
          []) {
          if (hop2 !== vId && isOpenLandSettlementVertex(state, hop2)) {
            hasReachableSpot = true;
            break;
          }
        }
      }
    }
  }

  return {
    immediateVertices,
    bestOneHopVertexScore,
    hasReachableSpot,
  };
}
