import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
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
import {
  claimsHarbormasterAt,
  grantsNewIslandBonusVp,
  isOpenLandSettlementVertex,
} from "./utils.ts";

/**
 * Computes all deterministic lethal resource targets reachable on `player`'s current board this turn,
 * including 1-build and 2-build combos (Settlement, City, Longest Road, Foreign Island, Harbormaster, Road+Settlement).
 */
interface LethalResourceTarget {
  cost: Partial<ResourceMap>;
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
    if (claimsHarbormasterAt(state, player, vId)) gain += 2;
    if (gain >= vpNeeded) {
      targets.push({
        cost: BUILDING_COSTS.settlement,
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
      const gain = 1 + (claimsHarbormasterAt(state, player, vId) ? 2 : 0);
      if (gain >= vpNeeded) {
        targets.push({
          cost: BUILDING_COSTS.city,
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
          cost: BUILDING_COSTS.road,
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
          cost: BUILDING_COSTS.ship,
          directFirstAction: { type: "BUILD_SHIP", edgeId: eId },
        });
        break;
      }
    }
  }

  // 4 & 5. 1-Hop Road/Ship + Settlement (+1 to +5 VP)
  const addOneHopRouteSettlementTargets = (
    edges: readonly string[],
    kind: "road" | "ship",
    comboCost: ResourceMap
  ) => {
    if (
      player.settlementsRemaining <= 0 ||
      edges.length === 0 ||
      vpNeeded > 5
    ) {
      return;
    }
    for (const eId of edges) {
      const eNode = state.topology.edges[eId];
      if (!eNode) continue;
      const edgeClaimsLongest =
        canClaimLongest &&
        player.longestRoadLength + 1 >= neededRoadLen &&
        simulateRouteLengthWithEdge(state, player.id, eId, kind) >=
          neededRoadLen;
      for (const vId of [eNode.v1, eNode.v2]) {
        if (!isOpenLandSettlementVertex(state, vId)) continue;
        let gain = 1 + (edgeClaimsLongest ? 2 : 0);
        if (grantsNewIslandBonusVp(state, player, vId)) gain += 2;
        if (claimsHarbormasterAt(state, player, vId)) gain += 2;
        if (gain >= vpNeeded) {
          targets.push({
            cost: comboCost,
            directFirstAction:
              kind === "road"
                ? { type: "BUILD_ROAD", edgeId: eId }
                : { type: "BUILD_SHIP", edgeId: eId },
          });
          break;
        }
      }
    }
  };

  addOneHopRouteSettlementTargets(legalRoads, "road", {
    brick: 2,
    lumber: 2,
    wool: 1,
    grain: 1,
    ore: 0,
  });
  addOneHopRouteSettlementTargets(legalShips, "ship", {
    brick: 1,
    lumber: 2,
    wool: 2,
    grain: 1,
    ore: 0,
  });

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
  cost: Partial<ResourceMap>
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
    const req = cost[r] ?? 0;
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
