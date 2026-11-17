import type { BotDifficulty } from "@gaming-platform/core";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import {
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  hasResources,
  totalResourceCount,
} from "../rules/helpers.ts";
import { getLegalSettlementVertices } from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceType } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { scoreExpansionEdge } from "./edge-eval.ts";
import {
  analyzeExpansionNetwork,
  seaHopsToForeignIsland,
  simulateRouteLengthWithEdge,
} from "./route-eval.ts";
import { countResourceDeficit, grantsNewIslandBonusVp } from "./utils.ts";

/**
 * Master Pre-Action Seafarers `MOVE_SHIP` (Claims Longest Route, unlocks Foreign Island / Settlement, steps across channel, or discovers Fog!).
 */
export function chooseMasterPreBuildMoveShipAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[]
): CatanAction | null {
  if (
    difficulty !== "master" ||
    state.phase !== "MAIN_PHASE" ||
    !state.config.enableSeafarers ||
    player.hasMovedShipThisTurn
  ) {
    return null;
  }

  const moveShips = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MOVE_SHIP" }> =>
      a.type === "MOVE_SHIP"
  );
  if (moveShips.length === 0) return null;

  const curSettleVerts = getLegalSettlementVertices(state, playerId, false);
  const curSettleMap: Record<string, true> = {};
  for (const vId of curSettleVerts) curSettleMap[vId] = true;
  const canAffordSettlementNow = hasResources(
    player.resources,
    BUILDING_COSTS.settlement
  );
  const neededAwardLen = Math.max(5, state.longestRoadLength + 1);

  let bestMove: Extract<CatanAction, { type: "MOVE_SHIP" }> | null = null;
  let bestMoveScore = 0;

  for (const mv of moveShips) {
    const newLen = simulateRouteLengthWithEdge(
      state,
      playerId,
      mv.toEdgeId,
      "ship",
      mv.fromEdgeId
    );
    // Never surrender Longest Trade Route by detaching a trunk ship!
    if (
      state.longestRoadOwnerId === playerId &&
      newLen < player.longestRoadLength
    ) {
      continue;
    }

    let s = 0;
    if (state.longestRoadOwnerId !== playerId && newLen >= neededAwardLen) {
      s += 95;
    } else if (newLen > player.longestRoadLength && newLen >= 5) {
      s += (newLen - player.longestRoadLength) * 10;
    }

    // Check if `toEdgeId` immediately unlocks a new legal settlement spot!
    const toEdge = state.topology.edges[mv.toEdgeId];
    if (toEdge) {
      for (const vId of [toEdge.v1, toEdge.v2]) {
        if (curSettleMap[vId] || state.buildings[vId]) continue;
        const vNode = state.topology.vertices[vId];
        if (!vNode) continue;
        const distOk = vNode.adjacentVertexIds.every(
          (nb) => !state.buildings[nb]
        );
        const touchesLand = vNode.adjacentHexIds.some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (!distOk || !touchesLand) continue;
        if (grantsNewIslandBonusVp(state, player, vId)) {
          s += canAffordSettlementNow ? 120 : 52;
        } else if (canAffordSettlementNow) {
          s += 38;
        }
      }
    }

    const hopsBefore = seaHopsToForeignIsland(state, playerId, mv.fromEdgeId);
    const hopsAfter = seaHopsToForeignIsland(state, playerId, mv.toEdgeId);
    if (hopsAfter < hopsBefore && newLen >= player.longestRoadLength) {
      s += (hopsBefore - hopsAfter) * 18;
    }

    const touchesFog = (toEdge?.adjacentHexIds ?? []).some(
      (hId) => state.hexes[hId]?.terrain === "fog"
    );
    if (touchesFog && newLen >= player.longestRoadLength - 1) {
      s += 30;
    }

    if (s > bestMoveScore) {
      bestMoveScore = s;
      bestMove = mv;
    }
  }

  if (bestMove && bestMoveScore >= 16) {
    return bestMove;
  }
  return null;
}

/**
 * Compare Expansion Road/Ship vs Development Card vs City Wall vs Seafarers Ship Move!
 */
export function chooseExpansionDevOrWallAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>,
  myCitiesCount: number
): { action: CatanAction | null; overSafeLimit: boolean } {
  const expansionInfo = analyzeExpansionNetwork(
    state,
    playerId,
    weights,
    scarcity
  );
  const buyDev = legalActions.find((a) => a.type === "BUY_DEV_CARD");
  const buildWalls = legalActions.filter((a) => a.type === "BUILD_CITY_WALL");
  const roadAndShipBuilds = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_ROAD" | "BUILD_SHIP" }> =>
      a.type === "BUILD_ROAD" || a.type === "BUILD_SHIP"
  );

  let bestEdgeAct: Extract<
    CatanAction,
    { type: "BUILD_ROAD" | "BUILD_SHIP" }
  > | null = null;
  let bestEdgeScore = -Infinity;
  for (const act of roadAndShipBuilds) {
    const s = scoreExpansionEdge(
      state,
      act.edgeId,
      playerId,
      act.type === "BUILD_SHIP" ? "ship" : "road",
      weights,
      scarcity
    );
    if (s > bestEdgeScore) {
      bestEdgeScore = s;
      bestEdgeAct = act;
    }
  }

  const safeLimit = getPlayerSafeHandLimit(state, playerId);
  const myTotalCards = state.config.enableCitiesAndKnights
    ? getPlayerResourceCount(player)
    : totalResourceCount(player.resources);
  const overSafeLimit = myTotalCards > safeLimit;

  // Master priority: if a high-EV Road/Ship claims Longest Route (+2 VP), opens a Foreign Island (+2 VP),
  // reveals Fog (+1 free card), or wins an urgent road race (`bestEdgeScore >= 32`), take it BEFORE buying a Dev Card!
  if (difficulty === "master" && bestEdgeAct && bestEdgeScore >= 32) {
    return { action: bestEdgeAct, overSafeLimit };
  }

  if (buyDev) {
    const hasSettlementToUpgrade =
      player.citiesRemaining > 0 &&
      Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "settlement"
      );
    const cityDeficit = countResourceDeficit(
      player.resources,
      BUILDING_COSTS.city
    );
    const savingForImminentCity =
      (difficulty === "master" || difficulty === "smart") &&
      hasSettlementToUpgrade &&
      cityDeficit === 1 &&
      !overSafeLimit;

    // Master First-City Engine Protection: don't burn `2 Ore + 1 Grain` (or `2 Grain + 1 Ore`) on a premature Dev Card
    // when we have 0 Cities yet, good Ore/Grain income, and low 7-discard risk!
    const savingForFirstCityEngine =
      difficulty === "master" &&
      hasSettlementToUpgrade &&
      myCitiesCount === 0 &&
      cityDeficit === 2 &&
      (player.resources.ore >= 2 || player.resources.grain >= 2) &&
      myProd.ore + myProd.grain >= 5 &&
      myTotalCards <= safeLimit - 2;

    const myBuildingCount = Object.values(state.buildings).filter(
      (b) => b.ownerId === playerId
    ).length;
    const savingForOpenSettlement =
      difficulty === "master" &&
      myBuildingCount <= 3 &&
      expansionInfo.immediateVertices.length > 0 &&
      countResourceDeficit(player.resources, BUILDING_COSTS.settlement) === 1 &&
      !overSafeLimit;

    if (
      !savingForImminentCity &&
      !savingForFirstCityEngine &&
      !savingForOpenSettlement
    ) {
      return { action: buyDev, overSafeLimit };
    }
  }

  if (bestEdgeAct) {
    const needSpot =
      expansionInfo.immediateVertices.length === 0 &&
      player.settlementsRemaining > 0 &&
      expansionInfo.hasReachableSpot;
    const contestingLongest =
      player.longestRoadLength >= 4 &&
      (state.longestRoadOwnerId !== playerId ||
        player.longestRoadLength <= state.longestRoadLength);

    if (
      difficulty === "easy" ||
      needSpot ||
      contestingLongest ||
      overSafeLimit ||
      bestEdgeScore >= 19
    ) {
      return { action: bestEdgeAct, overSafeLimit };
    }
  }

  if (buildWalls.length > 0) {
    return { action: buildWalls[0]!, overSafeLimit };
  }

  if (buyDev && overSafeLimit) {
    return { action: buyDev, overSafeLimit };
  }

  // Seafarers: Move an open ship if it strictly improves frontier reach or explores Fog!
  const moveShipActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MOVE_SHIP" }> =>
      a.type === "MOVE_SHIP"
  );
  if (moveShipActions.length > 0 && difficulty !== "easy") {
    for (const act of moveShipActions) {
      if (difficulty === "master" && state.longestRoadOwnerId === playerId) {
        const nextLen = simulateRouteLengthWithEdge(
          state,
          playerId,
          act.toEdgeId,
          "ship",
          act.fromEdgeId
        );
        if (nextLen < player.longestRoadLength) continue;
      }
      const fromScore = scoreExpansionEdge(
        state,
        act.fromEdgeId,
        playerId,
        "ship",
        weights,
        scarcity
      );
      const toScore = scoreExpansionEdge(
        state,
        act.toEdgeId,
        playerId,
        "ship",
        weights,
        scarcity
      );
      if (toScore > fromScore + 5) {
        return { action: act, overSafeLimit };
      }
    }
  }

  return { action: null, overSafeLimit };
}
