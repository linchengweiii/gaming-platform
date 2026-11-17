import type { BotDifficulty } from "@gaming-platform/core";
import {
  CATAN_BOT_WEIGHTS,
  type CatanBotWeights,
} from "../config/bot-config.ts";
import { getCatanLegalActions } from "../rules/legal-actions.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanState } from "../types/state.ts";
import {
  chooseCkPillagedCityAction,
  chooseCkProgressSelectionAction,
} from "./ck-phases-ai.ts";
import {
  chooseGoldResourceAction,
  chooseOptimalDiscardAction,
} from "./discard-gold-ai.ts";
import {
  chooseDomesticTradeConfirmAction,
  chooseDomesticTradeResponseAction,
} from "./domestic-trade-responder.ts";
import { scoreExpansionEdge } from "./edge-eval.ts";
import { chooseMainOrSpecialBuildAction } from "./main-phase-ai.ts";
import {
  chooseMoveRobberOrPirateAction,
  choosePreRollAction,
  chooseStealResourceAction,
} from "./robber-steal-ai.ts";
import {
  chooseSetupEdgeAction,
  chooseSetupSettlementAction,
} from "./setup-ai.ts";
import {
  computeBoardScarcity,
  computePlayerProductionPips,
  redactStateForBotPlayerPure,
} from "./utils.ts";

/**
 * Heuristic & Tactical Lookahead AI bot supporting 4 distinct strength tiers:
 * `"easy"` | `"normal"` | `"smart"` | `"master"`.
 */
export function chooseCatanBotAction(
  rawState: CatanState,
  playerId: string
): CatanAction | null {
  const state = redactStateForBotPlayerPure(rawState, playerId);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;

  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";
  const baseWeights = CATAN_BOT_WEIGHTS[difficulty] ?? CATAN_BOT_WEIGHTS.smart;
  const weights: CatanBotWeights =
    difficulty === "master" && state.players.length >= 5
      ? {
          ...baseWeights,
          longestRoadContestBonus: baseWeights.longestRoadContestBonus * 0.42,
        }
      : baseWeights;
  const legalActions = getCatanLegalActions(state, playerId);

  if (legalActions.length === 0) return null;

  // 0. Responding to another player's Domestic Trade offer
  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    state.activeTradeOffer.fromPlayerId !== playerId
  ) {
    return chooseDomesticTradeResponseAction(
      state,
      player,
      legalActions,
      weights
    );
  }

  // 0b. Selecting partner (or cancelling) after players respond to our own Domestic Trade offer
  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    state.activeTradeOffer.fromPlayerId === playerId
  ) {
    return chooseDomesticTradeConfirmAction(
      state,
      player,
      difficulty,
      legalActions,
      weights
    );
  }

  const scarcity = computeBoardScarcity(state);
  const myProd = computePlayerProductionPips(state, playerId);

  // 1. Setup Settlement Placement
  if (
    state.phase === "SETUP_SETTLEMENT_1" ||
    state.phase === "SETUP_SETTLEMENT_2"
  ) {
    return chooseSetupSettlementAction(
      state,
      playerId,
      difficulty,
      legalActions,
      weights,
      scarcity
    );
  }

  // 2. Setup Road / Ship Placement
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    return chooseSetupEdgeAction(
      state,
      playerId,
      difficulty,
      legalActions,
      weights,
      scarcity
    );
  }

  // 3a. Cities & Knights asynchronous phases
  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    return chooseCkPillagedCityAction(state, legalActions);
  }
  if (state.phase === "PROGRESS_CARD_SELECTION") {
    return chooseCkProgressSelectionAction(state, player, legalActions);
  }

  // 3. Discard on 7
  if (state.phase === "DISCARD_ON_SEVEN") {
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed > 0) {
      return chooseOptimalDiscardAction(
        state,
        player,
        needed,
        weights,
        legalActions
      );
    }
    return legalActions[0]!;
  }

  // 4. Gold River Resource Selection
  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    return chooseGoldResourceAction(
      state,
      player,
      playerId,
      difficulty,
      legalActions,
      weights,
      scarcity,
      myProd
    );
  }

  // 5. Pre-Roll
  if (state.phase === "PRE_ROLL") {
    return choosePreRollAction(
      state,
      player,
      playerId,
      difficulty,
      legalActions
    );
  }

  // 6. Move Robber or Pirate
  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    return chooseMoveRobberOrPirateAction(
      state,
      playerId,
      difficulty,
      legalActions,
      weights,
      scarcity
    );
  }

  // 7. Steal Resource
  if (state.phase === "STEAL_RESOURCE") {
    return chooseStealResourceAction(
      state,
      player,
      difficulty,
      legalActions,
      weights,
      scarcity,
      myProd
    );
  }

  // 8. Free Road Building Development Card Phase
  if (state.phase === "ROAD_BUILDING_DEV") {
    let bestAction = legalActions[0]!;
    let bestScore = -Infinity;
    for (const act of legalActions) {
      if (act.type === "BUILD_ROAD" || act.type === "BUILD_SHIP") {
        const s = scoreExpansionEdge(
          state,
          act.edgeId,
          playerId,
          act.type === "BUILD_SHIP" ? "ship" : "road",
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

  // 9. MAIN_PHASE and SPECIAL_BUILDING
  return chooseMainOrSpecialBuildAction(
    state,
    player,
    playerId,
    difficulty,
    legalActions,
    weights,
    scarcity,
    myProd
  );
}
