import type { GameEngine, GameEvent } from "@gaming-platform/core";
import { chooseSplendorBotAction } from "./bot.ts";
import { applySplendorAction } from "./rules/apply.ts";
import { getSplendorLegalActions } from "./rules/legal-actions.ts";
import {
  checkSplendorInvariants,
  getSplendorPlayerView,
} from "./rules/view-and-invariants.ts";
import { initSplendorGame } from "./rules/setup.ts";
import type { SplendorAction, SplendorConfig, SplendorState } from "./types.ts";

export * from "./config.ts";
export * from "./types.ts";
export * from "./cards.ts";
export {
  computeCardPurchasePayment,
  totalTokens,
} from "./rules/helpers.ts";
export { getSplendorLegalActions } from "./rules/legal-actions.ts";
export { getSplendorActingPlayerId } from "./rules/view-and-invariants.ts";

export const SplendorEngine: GameEngine<
  SplendorState,
  SplendorConfig,
  SplendorAction,
  GameEvent,
  SplendorState
> = {
  metadata: {
    id: "splendor",
    name: "Splendor",
    description:
      "Renaissance merchant engine-builder! Collect gem tokens, acquire development mines & artisans across 3 tiers, and attract Noble patrons to reach 15 Prestige Points.",
    minPlayers: 2,
    maxPlayers: 4,
    supportsBots: true,
  },
  initGame: initSplendorGame,
  getLegalActions: getSplendorLegalActions,
  applyAction: applySplendorAction,
  getPlayerView: getSplendorPlayerView,
  getWinner: (state) => state.winnerId,
  chooseBotAction: chooseSplendorBotAction,
  checkInvariants: checkSplendorInvariants,
  isActionUndoable(prevState, action, nextState): boolean {
    if (nextState.phase === "GAME_OVER") return false;
    if (prevState.turn !== nextState.turn) return false;
    if (action.type === "RESERVE_CARD" || action.type === "PURCHASE_CARD") {
      return false;
    }
    const prevDeckCount =
      prevState.decks[1].length +
      prevState.decks[2].length +
      prevState.decks[3].length;
    const nextDeckCount =
      nextState.decks[1].length +
      nextState.decks[2].length +
      nextState.decks[3].length;
    return prevDeckCount === nextDeckCount;
  },
};
