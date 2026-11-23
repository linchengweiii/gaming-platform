import type { BotDifficulty } from "@gaming-platform/core";
import {
  CATAN_BOT_WEIGHTS,
  type CatanBotWeights,
} from "../config/bot-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { emptyResources } from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceMap, ResourceType } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { evaluateVertexScore } from "./board-eval.ts";
import { scoreExpansionEdge } from "./edge-eval.ts";
import { seaHopsToForeignIsland } from "./route-eval.ts";

/**
 * Full Snake-Draft Rollout Search for Master's 1st Settlement (`SETUP_SETTLEMENT_1`).
 * Simulates subsequent opponents' snake-draft picks (`i+1..N-1`, `N-1..i+1`) to evaluate the
 * exact surviving 2nd-settlement pair `(v1, v2)` + full empire OWS/Road-Settlement coherence!
 */
function chooseMasterFirstSettlementWithSnakeRollout(
  state: CatanState,
  playerId: string,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction {
  const setupActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLACE_SETUP_SETTLEMENT" }> =>
      a.type === "PLACE_SETUP_SETTLEMENT"
  );
  if (setupActs.length <= 1) return legalActions[0]!;

  const scored = setupActs
    .map((act) => ({
      act,
      s1: evaluateVertexScore(state, act.vertexId, playerId, weights, scarcity),
    }))
    .sort((a, b) => b.s1 - a.s1);

  const legalPool = scored.map((x) => x.act.vertexId);
  const topCandidates = scored.slice(0, Math.min(10, scored.length));

  const myIdx = state.players.findIndex((p) => p.id === playerId);
  const n = state.players.length;
  const startIdx = state.startingPlayerIndex ?? 0;
  const snakeSteps: Array<{ oppId: string; phase: CatanState["phase"] }> = [];
  if (myIdx >= 0) {
    const myOrder = (myIdx - startIdx + n) % n;
    for (let ord = myOrder + 1; ord < n; ord++) {
      snakeSteps.push({
        oppId: state.players[(startIdx + ord) % n]!.id,
        phase: "SETUP_SETTLEMENT_1",
      });
    }
    for (let ord = n - 1; ord > myOrder; ord--) {
      snakeSteps.push({
        oppId: state.players[(startIdx + ord) % n]!.id,
        phase: "SETUP_SETTLEMENT_2",
      });
    }
  }

  return topCandidates.reduce<{ act: CatanAction; bestCombined: number }>(
    (best, cand) => {
      const initialBuildings: CatanState["buildings"] = {
        ...state.buildings,
        [cand.act.vertexId]: { ownerId: playerId, type: "settlement" },
      };

      const isOpenIn = (
        buildings: CatanState["buildings"],
        vId: string
      ): boolean =>
        !buildings[vId] &&
        state.topology.vertices[vId]!.adjacentVertexIds.every(
          (nb) => !buildings[nb]
        );

      const postSnakeBuildings = snakeSteps.reduce<CatanState["buildings"]>(
        (curBuildings, step) => {
          const stepState: CatanState = {
            ...state,
            buildings: curBuildings,
            phase: step.phase,
          };
          const oppPick = legalPool.reduce<{
            vId: string | null;
            score: number;
          }>(
            (oppBest, vId) => {
              if (!isOpenIn(curBuildings, vId)) return oppBest;
              const os = evaluateVertexScore(
                stepState,
                vId,
                step.oppId,
                CATAN_BOT_WEIGHTS.smart,
                scarcity
              );
              return os > oppBest.score ? { vId, score: os } : oppBest;
            },
            { vId: null, score: -Infinity }
          );
          return oppPick.vId
            ? {
                ...curBuildings,
                [oppPick.vId]: {
                  ownerId: step.oppId,
                  type:
                    state.config.enableCitiesAndKnights &&
                    step.phase === "SETUP_SETTLEMENT_2"
                      ? "city"
                      : "settlement",
                },
              }
            : curBuildings;
        },
        initialBuildings
      );

      const secondRoundState: CatanState = {
        ...state,
        buildings: postSnakeBuildings,
        phase: "SETUP_SETTLEMENT_2",
      };

      const secondPick = legalPool.reduce<{ vId: string | null; score: number }>(
        (myBest, vId) => {
          if (!isOpenIn(postSnakeBuildings, vId)) return myBest;
          const s2 = evaluateVertexScore(
            secondRoundState,
            vId,
            playerId,
            weights,
            scarcity
          );
          return s2 > myBest.score ? { vId, score: s2 } : myBest;
        },
        { vId: null, score: -20 }
      );

      const empireSynergy = secondPick.vId
        ? (() => {
            const pairPips = [
              cand.act.vertexId,
              secondPick.vId,
            ].reduce<ResourceMap>(
              (pipsAcc, sv) =>
                (
                  state.topology.vertices[sv]?.adjacentHexIds ?? []
                ).reduce<ResourceMap>((inner, hId) => {
                  const tile = state.hexes[hId];
                  const res = tile ? TERRAIN_TO_RESOURCE[tile.terrain] : null;
                  if (!res || !tile?.numberToken) return inner;
                  return {
                    ...inner,
                    [res]:
                      inner[res] + (NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0),
                  };
                }, pipsAcc),
              emptyResources()
            );
            return (
              (pairPips.ore >= 4 && pairPips.grain >= 4 ? 3.2 : 0) +
              (pairPips.brick >= 4 &&
              pairPips.lumber >= 4 &&
              pairPips.grain >= 3
                ? 2.2
                : 0) -
              (pairPips.ore >= 4 && pairPips.grain === 0 ? 4.0 : 0) -
              (state.config.enableCitiesAndKnights && pairPips.wool === 0
                ? 6.5
                : 0) -
              (state.config.enableCitiesAndKnights && pairPips.ore === 0
                ? 5.5
                : 0)
            );
          })()
        : 0;

      const s1Weight = state.config.enableCitiesAndKnights ? 0.46 : 0.56;
      const s2Weight = state.config.enableCitiesAndKnights ? 0.68 : 0.58;
      const combined =
        cand.s1 * s1Weight + secondPick.score * s2Weight + empireSynergy;
      return combined > best.bestCombined
        ? { act: cand.act, bestCombined: combined }
        : best;
    },
    { act: topCandidates[0]!.act, bestCombined: -Infinity }
  ).act;
}

export function chooseSetupSettlementAction(
  state: CatanState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction {
  if (difficulty === "master" && state.phase === "SETUP_SETTLEMENT_1") {
    return chooseMasterFirstSettlementWithSnakeRollout(
      state,
      playerId,
      legalActions,
      weights,
      scarcity
    );
  }
  let bestAction = legalActions[0]!;
  let bestScore = -Infinity;
  for (const act of legalActions) {
    if (act.type === "PLACE_SETUP_SETTLEMENT") {
      const s = evaluateVertexScore(
        state,
        act.vertexId,
        playerId,
        weights,
        scarcity
      );
      if (s > bestScore) {
        bestScore = s;
        bestAction = act;
      }
    }
  }
  return bestAction;
}

export function chooseSetupEdgeAction(
  state: CatanState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction {
  if (difficulty === "easy") {
    return legalActions[0]!;
  }
  if (difficulty === "master" && state.config.enableSeafarers) {
    let bestShipAct: CatanAction | null = null;
    let bestHops = 99;
    for (const act of legalActions) {
      if (act.type === "PLACE_SETUP_EDGE" && act.edgeKind === "ship") {
        const hops = seaHopsToForeignIsland(state, playerId, act.edgeId);
        if (hops < bestHops) {
          bestHops = hops;
          bestShipAct = act;
        }
      }
    }
    if (bestShipAct && bestHops <= 3) {
      return bestShipAct;
    }
  }
  let bestAction = legalActions[0]!;
  let bestScore = -Infinity;
  for (const act of legalActions) {
    if (act.type === "PLACE_SETUP_EDGE") {
      const s = scoreExpansionEdge(
        state,
        act.edgeId,
        playerId,
        act.edgeKind,
        weights,
        scarcity
      );
      if (s > bestScore) {
        bestScore = s;
        bestAction = act;
      }
    }
  }
  return bestAction;
}
