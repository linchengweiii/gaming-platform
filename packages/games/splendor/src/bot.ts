import type { BotDifficulty } from "@gaming-platform/core";
import { getSplendorLegalActions } from "./rules/legal-actions.ts";
import { getSplendorPlayerView } from "./rules/view-and-invariants.ts";
import type { SplendorAction, SplendorState } from "./types.ts";
import {
  chooseBestNobleAction,
  chooseBestReturnTokensAction,
  chooseOnePlySplendorAction,
} from "./bot/candidates.ts";
import { chooseMasterSplendorAction } from "./bot/search.ts";

export function chooseSplendorBotAction(
  rawState: SplendorState,
  playerId: string
): SplendorAction | null {
  // Enforce 100% fair player view (redacting face-down decks & opponents' blind deck reserves)
  const state = getSplendorPlayerView(rawState, playerId);
  const legal = getSplendorLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  if (state.phase === "SELECT_NOBLE") {
    return chooseBestNobleAction(state, player, legal, difficulty);
  }
  if (state.phase === "RETURN_TOKENS") {
    return chooseBestReturnTokensAction(state, player, legal, difficulty);
  }

  if (difficulty !== "master") {
    return chooseOnePlySplendorAction(state, player, legal, difficulty);
  }

  return chooseMasterSplendorAction(state, player, playerId, legal);
}
