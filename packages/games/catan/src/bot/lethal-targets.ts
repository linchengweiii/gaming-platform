import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getPlayerTradeRatios } from "../rules/helpers.ts";
import {
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
} from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { simulateRouteLengthWithEdge } from "./route-eval.ts";
import { grantsNewIslandBonusVp } from "./utils.ts";

/**
 * Computes all deterministic lethal resource targets reachable on `player`'s current board this turn,
 * including 1-build and 2-build combos (Settlement, City, Longest Road, Foreign Island, Harbormaster, Road+Settlement).
 */
export interface LethalResourceTarget {
  cost: ResourceMap;
  directFirstAction?: CatanAction;
}

export function buildBoardLethalResourceTargets(
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

  if (
    canClaimLongest &&
    vpNeeded <= 2 &&
    player.longestRoadLength + 1 >= neededRoadLen
  ) {
    for (const eId of legalRoads) {
      if (
        simulateRouteLengthWithEdge(state, player.id, eId, "road") >=
        neededRoadLen
      ) {
        targets.push({
          cost: { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 },
          directFirstAction: { type: "BUILD_ROAD", edgeId: eId },
        });
        break;
      }
    }
    for (const eId of legalShips) {
      if (
        simulateRouteLengthWithEdge(state, player.id, eId, "ship") >=
        neededRoadLen
      ) {
        targets.push({
          cost: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 },
          directFirstAction: { type: "BUILD_SHIP", edgeId: eId },
        });
        break;
      }
    }
  }

  // 4. 1-Hop Road + Settlement (+1 to +5 VP, e.g. Road claims Longest Road +2 AND opens Settlement +1 = +3 VP!)
  if (
    player.settlementsRemaining > 0 &&
    legalRoads.length > 0 &&
    vpNeeded <= 5
  ) {
    for (const eId of legalRoads) {
      const eNode = state.topology.edges[eId];
      if (!eNode) continue;
      const roadClaimsLongest =
        canClaimLongest &&
        player.longestRoadLength + 1 >= neededRoadLen &&
        simulateRouteLengthWithEdge(state, player.id, eId, "road") >=
          neededRoadLen;
      for (const vId of [eNode.v1, eNode.v2]) {
        if (state.buildings[vId]) continue;
        const distOk = (
          state.topology.vertices[vId]?.adjacentVertexIds ?? []
        ).every((nb) => !state.buildings[nb]);
        if (!distOk) continue;
        const touchesLand = (
          state.topology.vertices[vId]?.adjacentHexIds ?? []
        ).some((hId) => state.hexes[hId]?.terrain !== "sea");
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
  if (
    player.settlementsRemaining > 0 &&
    legalShips.length > 0 &&
    vpNeeded <= 5
  ) {
    for (const eId of legalShips) {
      const eNode = state.topology.edges[eId];
      if (!eNode) continue;
      const shipClaimsLongest =
        canClaimLongest &&
        player.longestRoadLength + 1 >= neededRoadLen &&
        simulateRouteLengthWithEdge(state, player.id, eId, "ship") >=
          neededRoadLen;
      for (const vId of [eNode.v1, eNode.v2]) {
        if (state.buildings[vId]) continue;
        const distOk = (
          state.topology.vertices[vId]?.adjacentVertexIds ?? []
        ).every((nb) => !state.buildings[nb]);
        if (!distOk) continue;
        const touchesLand = (
          state.topology.vertices[vId]?.adjacentHexIds ?? []
        ).some((hId) => state.hexes[hId]?.terrain !== "sea");
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
export function checkHandPortConvertibleToCost(
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

export function canHandWinThisTurnDeterministically(
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
