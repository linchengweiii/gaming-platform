import type { CatanBotWeights } from "../config/bot-config.ts";
import {
  BUILDING_COSTS,
  NUMBER_TOKEN_PIPS,
} from "../config/costs-and-limits.ts";
import type { ResourceType } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { evaluateVertexScore } from "./board-eval.ts";
import { simulateRouteLengthWithEdge } from "./route-eval.ts";
import { countResourceDeficit } from "./utils.ts";

/**
 * Scores candidate edges for road or ship expansion, including road-race urgency and exact Longest Route swings.
 */
export function scoreExpansionEdge(
  state: CatanState,
  edgeId: string,
  playerId: string,
  kind: "road" | "ship",
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): number {
  const eNode = state.topology.edges[edgeId];
  if (!eNode) return -999;

  const player = state.players.find((p) => p.id === playerId)!;
  const diff = player.botDifficulty ?? "smart";
  let score = 0;

  for (const vId of [eNode.v1, eNode.v2]) {
    const existingBuilding = state.buildings[vId];
    if (!existingBuilding) {
      const vNode = state.topology.vertices[vId]!;
      const distRuleOk = vNode.adjacentVertexIds.every(
        (adjV) => !state.buildings[adjV]
      );
      if (distRuleOk) {
        const touchesLand = vNode.adjacentHexIds.some(
          (hId) => state.hexes[hId]?.terrain !== "sea"
        );
        if (touchesLand) {
          const vScore = evaluateVertexScore(
            state,
            vId,
            playerId,
            weights,
            scarcity
          );
          score += 12.5 + vScore * 0.58;

          // Master Road-Race Detection: prioritize claiming contested high-value vertices before an opponent plows us!
          if (
            diff === "master" &&
            !state.phase.startsWith("SETUP_") &&
            vScore >= 16
          ) {
            const oppTouchesDirectly = vNode.incidentEdgeIds.some((incE) => {
              const owner = state.edges[incE]?.ownerId;
              return owner && owner !== playerId;
            });
            const oppOneHopAway =
              !oppTouchesDirectly &&
              vNode.adjacentVertexIds.some((adjV) =>
                (state.topology.vertices[adjV]?.incidentEdgeIds ?? []).some(
                  (incE) => {
                    const owner = state.edges[incE]?.ownerId;
                    return owner && owner !== playerId;
                  }
                )
              );
            if (oppTouchesDirectly) {
              const setDef = countResourceDeficit(
                player.resources,
                BUILDING_COSTS.settlement
              );
              score += setDef <= 1 ? 13 : setDef === 2 ? 5 : 0;
            } else if (oppOneHopAway) {
              score += 9.5;
            }
          }
        }
      } else if (diff === "smart" || diff === "master") {
        for (const hopV of vNode.adjacentVertexIds) {
          if (state.buildings[hopV]) continue;
          const hopDistOk = (
            state.topology.vertices[hopV]?.adjacentVertexIds ?? []
          ).every((nb) => !state.buildings[nb]);
          const hopLand = (
            state.topology.vertices[hopV]?.adjacentHexIds ?? []
          ).some((hId) => state.hexes[hId]?.terrain !== "sea");
          if (hopDistOk && hopLand) {
            score +=
              4.2 +
              evaluateVertexScore(state, hopV, playerId, weights, scarcity) *
                0.3;
          }
        }
      }
    }
  }

  // Longest Route (+2 VP) extension & exact path check for Master
  if (diff === "master" && player.longestRoadLength >= 3) {
    const newLen = simulateRouteLengthWithEdge(state, playerId, edgeId, kind);
    if (newLen > player.longestRoadLength) {
      const needForAward = Math.max(5, state.longestRoadLength + 1);
      if (state.longestRoadOwnerId !== playerId && newLen >= needForAward) {
        score += weights.longestRoadContestBonus * 2.05;
      } else if (
        state.longestRoadOwnerId !== playerId &&
        newLen === needForAward - 1
      ) {
        score += weights.longestRoadContestBonus * 1.1;
      } else if (state.longestRoadOwnerId === playerId) {
        const runnerUp = Math.max(
          0,
          ...state.players
            .filter((p) => p.id !== playerId)
            .map((p) => p.longestRoadLength)
        );
        if (runnerUp >= player.longestRoadLength - 1) {
          score += weights.longestRoadContestBonus * 0.95;
        }
      }
    }
  } else {
    const touchesOwnRoute = [eNode.v1, eNode.v2].some((vId) => {
      const b = state.buildings[vId];
      if (b && b.ownerId !== playerId) return false;
      return (state.topology.vertices[vId]?.incidentEdgeIds ?? []).some(
        (incE) => incE !== edgeId && state.edges[incE]?.ownerId === playerId
      );
    });
    if (touchesOwnRoute && player.longestRoadLength >= 3) {
      const needForAward = Math.max(5, state.longestRoadLength + 1);
      if (
        state.longestRoadOwnerId !== playerId &&
        player.longestRoadLength >= needForAward - 2
      ) {
        score += weights.longestRoadContestBonus;
      }
    }
  }

  if (kind === "ship") {
    let directShipBonus = 0;
    for (const hId of eNode.adjacentHexIds) {
      const tile = state.hexes[hId];
      if (!tile) continue;
      if (tile.terrain === "fog") directShipBonus += diff === "master" ? 24 : 16;
      if (tile.terrain === "gold")
        directShipBonus += diff === "master" ? 15 : 10;
      if (
        tile.islandId > 0 &&
        !player.homeIslandIds.includes(tile.islandId) &&
        !player.settledIslandIds.includes(tile.islandId)
      ) {
        directShipBonus += diff === "master" ? 22 : 14;
      }
    }
    score += directShipBonus;

    // 4-hop sea BFS so coastal ships on home islands sail toward +2 VP foreign islands, gold, and fog!
    if (diff !== "easy") {
      const visitedEdges = new Set<string>([edgeId]);
      let frontier: string[] = [edgeId];
      let bestDistantSeaBonus = 0;

      for (let hop = 1; hop <= 4 && frontier.length > 0; hop++) {
        const nextFrontier: string[] = [];
        for (const curEId of frontier) {
          const curEdge = state.topology.edges[curEId];
          if (!curEdge) continue;
          for (const vId of [curEdge.v1, curEdge.v2]) {
            const b = state.buildings[vId];
            if (b && b.ownerId !== playerId) continue;
            const vNode = state.topology.vertices[vId];
            if (!vNode) continue;

            for (const nextEId of vNode.incidentEdgeIds) {
              if (visitedEdges.has(nextEId)) continue;
              const existingEdge = state.edges[nextEId];
              if (existingEdge && existingEdge.ownerId !== playerId) continue;
              const nextEdge = state.topology.edges[nextEId];
              if (!nextEdge) continue;
              const canSail = nextEdge.adjacentHexIds.some((hId) => {
                const t = state.hexes[hId]?.terrain;
                return t === "sea" || t === "fog";
              });
              if (!canSail) continue;
              visitedEdges.add(nextEId);
              nextFrontier.push(nextEId);

              let hopTargetVal = 0;
              for (const hId of nextEdge.adjacentHexIds) {
                const tile = state.hexes[hId];
                if (!tile) continue;
                if (tile.terrain === "fog") {
                  hopTargetVal = Math.max(
                    hopTargetVal,
                    diff === "master" ? 22 : 15
                  );
                }
                if (
                  tile.islandId > 0 &&
                  !player.homeIslandIds.includes(tile.islandId) &&
                  !player.settledIslandIds.includes(tile.islandId)
                ) {
                  const pips = tile.numberToken
                    ? NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0
                    : 0;
                  const goldBoost = tile.terrain === "gold" ? 8 : 0;
                  hopTargetVal = Math.max(
                    hopTargetVal,
                    (diff === "master" ? 24 : 16) + pips * 1.4 + goldBoost
                  );
                }
              }
              if (hopTargetVal > 0) {
                bestDistantSeaBonus = Math.max(
                  bestDistantSeaBonus,
                  hopTargetVal / (hop * 0.75 + 0.45)
                );
              }
            }
          }
        }
        frontier = nextFrontier;
      }

      score += bestDistantSeaBonus;

      if (
        state.phase.startsWith("SETUP_ROAD_") &&
        (directShipBonus > 0 || bestDistantSeaBonus > 0)
      ) {
        const alreadyHasShip = Object.values(state.edges).some(
          (r) => r.ownerId === playerId && r.type === "ship"
        );
        if (!alreadyHasShip) {
          score += diff === "master" ? 9.5 : 6.5;
        }
      }
    }
  }

  return score;
}
