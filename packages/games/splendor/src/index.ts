import type { GameEngine, GameEvent, PlayerDescriptor } from "@gaming-platform/core";
import { chooseSplendorBotAction } from "./bot.ts";
import {
  applySplendorAction,
  checkSplendorInvariants,
  getSplendorLegalActions,
  initSplendorGame,
} from "./rules.ts";
import type { SplendorAction, SplendorConfig, SplendorState } from "./types.ts";

export * from "./types.ts";
export * from "./cards.ts";
export * from "./rules.ts";
export * from "./bot.ts";

export function getSplendorActingPlayerId(state: SplendorState): string | null {
  if (state.phase === "GAME_OVER") return null;
  return state.players[state.activePlayerIndex]?.id ?? null;
}

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

  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<SplendorConfig>,
    seed?: number | string
  ): SplendorState {
    return initSplendorGame(players, config, seed);
  },

  getLegalActions(state: SplendorState, playerId: string): SplendorAction[] {
    return getSplendorLegalActions(state, playerId);
  },

  applyAction(
    state: SplendorState,
    playerId: string,
    action: SplendorAction
  ): { state: SplendorState; events: GameEvent[] } {
    return applySplendorAction(state, playerId, action);
  },

  getPlayerView(state: SplendorState): SplendorState {
    return state;
  },

  getWinner(state: SplendorState): string | null {
    return state.winnerId;
  },

  chooseBotAction(state: SplendorState, playerId: string): SplendorAction | null {
    return chooseSplendorBotAction(state, playerId);
  },

  checkInvariants(state: SplendorState) {
    return checkSplendorInvariants(state);
  },

  isActionUndoable(
    prevState: SplendorState,
    action: SplendorAction,
    nextState: SplendorState
  ): boolean {
    if (nextState.phase === "GAME_OVER") return false;
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
