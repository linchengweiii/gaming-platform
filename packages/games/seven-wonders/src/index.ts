import type { GameEngine, GameEvent, PlayerDescriptor } from "@gaming-platform/core";
import { chooseSevenWondersBotAction } from "./bot.ts";
import {
  applySevenWondersAction,
  checkSevenWondersInvariants,
  getSevenWondersActingPlayerId,
  getSevenWondersLegalActions,
  getSevenWondersPlayerView,
  initSevenWondersGame,
} from "./rules.ts";
import type {
  SevenWondersAction,
  SevenWondersConfig,
  SevenWondersState,
} from "./types.ts";

export * from "./types.ts";
export * from "./cards.ts";
export * from "./rules.ts";
export * from "./bot.ts";

export const SevenWondersEngine: GameEngine<
  SevenWondersState,
  SevenWondersConfig,
  SevenWondersAction,
  GameEvent,
  SevenWondersState
> = {
  metadata: {
    id: "seven_wonders",
    name: "7 Wonders",
    description:
      "Lead one of the Seven Wonders of the Ancient World across three Ages of simultaneous card drafting, neighbor commerce, military conflicts, science, and grand guilds.",
    minPlayers: 3,
    maxPlayers: 7,
    supportsBots: true,
  },

  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<SevenWondersConfig>,
    seed?: number | string
  ): SevenWondersState {
    return initSevenWondersGame(players, config, seed);
  },

  getLegalActions(
    state: SevenWondersState,
    playerId: string
  ): SevenWondersAction[] {
    return getSevenWondersLegalActions(state, playerId);
  },

  applyAction(
    state: SevenWondersState,
    playerId: string,
    action: SevenWondersAction
  ): { state: SevenWondersState; events: GameEvent[] } {
    return applySevenWondersAction(state, playerId, action);
  },

  getPlayerView(
    state: SevenWondersState,
    viewerPlayerId: string | null
  ): SevenWondersState {
    return getSevenWondersPlayerView(state, viewerPlayerId);
  },

  getWinner(state: SevenWondersState): string | null {
    return state.winnerId;
  },

  chooseBotAction(
    state: SevenWondersState,
    playerId: string
  ): SevenWondersAction | null {
    return chooseSevenWondersBotAction(state, playerId);
  },

  checkInvariants(state: SevenWondersState) {
    return checkSevenWondersInvariants(state);
  },

  isActionUndoable(
    prevState: SevenWondersState,
    _action: SevenWondersAction,
    nextState: SevenWondersState
  ): boolean {
    if (nextState.phase === "GAME_OVER") return false;
    // Reversible only while locking in a draft pick before simultaneous reveal & hand rotation!
    return (
      prevState.phase === "AGE_DRAFT" &&
      nextState.phase === "AGE_DRAFT" &&
      prevState.age === nextState.age &&
      prevState.draftRound === nextState.draftRound
    );
  },
};

export { getSevenWondersActingPlayerId };
