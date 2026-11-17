import { BANK_LIMITS } from "../config/costs-and-limits.ts";
import { applyCatanAction } from "../rules/apply-action.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getPlayerTradeRatios, isExpanded56State } from "../rules/helpers.ts";
import { getCatanLegalActions } from "../rules/legal-actions.ts";
import { getLegalRoadEdges } from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceMap } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  buildBoardLethalResourceTargets,
  checkHandPortConvertibleToCost,
} from "./lethal-targets.ts";
import { simulateRouteLengthWithEdge } from "./route-eval.ts";
import { grantsNewIslandBonusVp } from "./utils.ts";

/**
 * Checks if `player` has a 1-step OR multi-step deterministic lethal win on the current turn!
 * Covers direct builds, Largest Army, Longest Road, Maritime/Port Trade -> Lethal,
 * Year of Plenty -> Lethal, Monopoly (public bank deduction) -> Lethal, and Road Building -> Lethal.
 */
export function findImmediateWinningAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  currentVp: number,
  targetVp: number
): CatanAction | null {
  // 1. Direct 1-action Settlement or City win
  for (const act of legalActions) {
    if (act.type === "BUILD_SETTLEMENT") {
      let gain = 1;
      if (grantsNewIslandBonusVp(state, player, act.vertexId)) {
        gain += 2;
      }
      if (
        state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== player.id &&
        state.harbors.some((h) => h.vertexIds.includes(act.vertexId)) &&
        player.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1)
      ) {
        gain += 2;
      }
      if (currentVp + gain >= targetVp) return act;
    } else if (act.type === "BUILD_CITY") {
      let gain = 1;
      if (
        state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== player.id &&
        state.harbors.some((h) => h.vertexIds.includes(act.vertexId)) &&
        player.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1)
      ) {
        gain += 2;
      }
      if (currentVp + gain >= targetVp) return act;
    }
  }

  // 2. Largest Army lethal (+2 VP) via PLAY_KNIGHT
  if (
    currentVp + 2 >= targetVp &&
    state.largestArmyOwnerId !== player.id &&
    player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1)
  ) {
    const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
    if (playKnight) return playKnight;
  }

  // 3. Longest Road / Trade Route lethal (+2 VP) via BUILD_ROAD, BUILD_SHIP, or 0-cost MOVE_SHIP!
  const neededLen = Math.max(5, state.longestRoadLength + 1);
  if (currentVp + 2 >= targetVp && state.longestRoadOwnerId !== player.id) {
    if (player.longestRoadLength + 1 >= neededLen) {
      for (const act of legalActions) {
        if (act.type === "MOVE_SHIP") {
          const newLen = simulateRouteLengthWithEdge(
            state,
            player.id,
            act.toEdgeId,
            "ship",
            act.fromEdgeId
          );
          if (newLen >= neededLen) return act;
        } else if (act.type === "BUILD_ROAD" || act.type === "BUILD_SHIP") {
          const newLen = simulateRouteLengthWithEdge(
            state,
            player.id,
            act.edgeId,
            act.type === "BUILD_SHIP" ? "ship" : "road"
          );
          if (newLen >= neededLen) return act;
        }
      }
    }
  }

  // 4. Master Multi-Step Deterministic Turn Lethal Solver
  if (
    (player.botDifficulty ?? "smart") !== "master" ||
    currentVp < targetVp - 5
  ) {
    return null;
  }

  const ratios = getPlayerTradeRatios(state, player.id);
  const lethalTargets = buildBoardLethalResourceTargets(
    state,
    player,
    currentVp,
    targetVp
  );
  const maritimeTrades = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
      a.type === "MARITIME_TRADE"
  );

  // 4a. Already holding (or port-convertible to) a multi-step lethal target (e.g. Road + Settlement or Port Trade -> City)
  for (const lt of lethalTargets) {
    const conv = checkHandPortConvertibleToCost(
      state,
      ratios,
      player.resources,
      lt.cost
    );
    if (!conv.reachable) continue;
    if (conv.missingCount === 0 && lt.directFirstAction) {
      const isLegalNow = legalActions.some(
        (a) =>
          a.type === lt.directFirstAction!.type &&
          JSON.stringify(a) === JSON.stringify(lt.directFirstAction)
      );
      if (isLegalNow) return lt.directFirstAction;
    } else if (conv.missingCount > 0 && conv.firstGive && conv.firstReceive) {
      const mTrade = maritimeTrades.find(
        (t) => t.give === conv.firstGive && t.receive === conv.firstReceive
      );
      if (mTrade) return mTrade;
    }
  }

  if (state.phase !== "MAIN_PHASE") return null;

  // 4b. Year of Plenty -> (+ optional Port Trade) -> Lethal Build!
  const yopActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_YEAR_OF_PLENTY" }> =>
      a.type === "PLAY_YEAR_OF_PLENTY"
  );
  for (const act of yopActions) {
    const simHand: ResourceMap = { ...player.resources };
    simHand[act.resource1] += 1;
    simHand[act.resource2] += 1;
    for (const lt of lethalTargets) {
      if (
        checkHandPortConvertibleToCost(state, ratios, simHand, lt.cost)
          .reachable
      ) {
        return act;
      }
    }
  }

  // 4c. Monopoly (using 100% public bank supply deduction) -> (+ optional Port Trade) -> Lethal Build!
  const monoActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_MONOPOLY" }> =>
      a.type === "PLAY_MONOPOLY"
  );
  if (monoActions.length > 0) {
    const isExpanded = isExpanded56State(state);
    const totalSupplyPerRes = isExpanded
      ? BANK_LIMITS.expandedPerResource
      : BANK_LIMITS.standardPerResource;
    for (const act of monoActions) {
      const oppCount = Math.max(
        0,
        totalSupplyPerRes -
          state.bank[act.resource] -
          player.resources[act.resource]
      );
      if (oppCount <= 0) continue;
      const simHand: ResourceMap = {
        ...player.resources,
        [act.resource]: player.resources[act.resource] + oppCount,
      };
      for (const lt of lethalTargets) {
        if (
          checkHandPortConvertibleToCost(state, ratios, simHand, lt.cost)
            .reachable
        ) {
          return act;
        }
      }
    }
  }

  // 4d. Road Building Dev Card -> 2 free roads/ships claiming Longest Road (+2 VP) or reaching Settlement spot!
  const playRoadBuild = legalActions.find(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  if (playRoadBuild) {
    if (
      currentVp + 2 >= targetVp &&
      state.longestRoadOwnerId !== player.id &&
      player.longestRoadLength + 2 >= neededLen
    ) {
      const legalR =
        player.roadsRemaining > 0
          ? getLegalRoadEdges(state, player.id, null)
          : [];
      for (const e1 of legalR) {
        const len1 = simulateRouteLengthWithEdge(state, player.id, e1, "road");
        if (len1 >= neededLen) return playRoadBuild;
        if (player.roadsRemaining >= 2 && len1 >= neededLen - 1) {
          const eNode1 = state.topology.edges[e1];
          if (!eNode1) continue;
          for (const vId of [eNode1.v1, eNode1.v2]) {
            if (
              state.buildings[vId] &&
              state.buildings[vId]!.ownerId !== player.id
            ) {
              continue;
            }
            for (const e2 of state.topology.vertices[vId]?.incidentEdgeIds ??
              []) {
              if (e2 === e1 || state.edges[e2]) continue;
              const touchesSeaOnly = (
                state.topology.edges[e2]?.adjacentHexIds ?? []
              ).every((hId) => state.hexes[hId]?.terrain === "sea");
              if (!touchesSeaOnly) return playRoadBuild;
            }
          }
        }
      }
    }
    if (
      player.settlementsRemaining > 0 &&
      checkHandPortConvertibleToCost(state, ratios, player.resources, {
        brick: 1,
        lumber: 1,
        wool: 1,
        grain: 1,
        ore: 0,
      }).reachable
    ) {
      const legalR =
        player.roadsRemaining > 0
          ? getLegalRoadEdges(state, player.id, null)
          : [];
      for (const e1 of legalR) {
        const eNode = state.topology.edges[e1];
        if (!eNode) continue;
        for (const vId of [eNode.v1, eNode.v2]) {
          if (state.buildings[vId]) continue;
          const distOk = (
            state.topology.vertices[vId]?.adjacentVertexIds ?? []
          ).every((nb) => !state.buildings[nb]);
          const touchesLand = (
            state.topology.vertices[vId]?.adjacentHexIds ?? []
          ).some((hId) => state.hexes[hId]?.terrain !== "sea");
          if (!distOk || !touchesLand) continue;
          const gain =
            1 + (grantsNewIslandBonusVp(state, player, vId) ? 2 : 0);
          if (currentVp + gain >= targetVp) return playRoadBuild;
        }
      }
    }
  }

  // 4e. Exact 1-step & 2-step deterministic lethal check via `applyCatanAction`
  //     (catches Port -> Commodity -> Metropolis +2 VP, Medicine City +2 VP, and MOVE_SHIP -> Foreign Island +3 VP!)
  for (const act of legalActions) {
    if (
      act.type === "END_TURN" ||
      act.type === "OFFER_DOMESTIC_TRADE" ||
      act.type === "MARITIME_TRADE" ||
      act.type === "BUY_DEV_CARD"
    ) {
      continue;
    }
    try {
      const sim = applyCatanAction(state, player.id, act);
      if (computePlayerVictoryPoints(sim.state, player.id, false) >= targetVp) {
        return act;
      }
    } catch {
      // Ignore actions whose simulation requires unredacted hidden deck draws
    }
  }

  if (currentVp >= targetVp - 3) {
    const setupCandidates = legalActions.filter(
      (a) => a.type === "MARITIME_TRADE" || a.type === "MOVE_SHIP"
    );
    for (const step1 of setupCandidates) {
      try {
        const sim1 = applyCatanAction(state, player.id, step1);
        const nextLegals = getCatanLegalActions(sim1.state, player.id);
        for (const step2 of nextLegals) {
          if (
            step2.type === "BUILD_SETTLEMENT" ||
            step2.type === "BUILD_CITY" ||
            step2.type === "UPGRADE_CITY_IMPROVEMENT"
          ) {
            try {
              const sim2 = applyCatanAction(sim1.state, player.id, step2);
              if (
                computePlayerVictoryPoints(sim2.state, player.id, false) >=
                targetVp
              ) {
                return step1;
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return null;
}
