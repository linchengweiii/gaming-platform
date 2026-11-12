import type { GameEngine, GameEvent, PlayerDescriptor } from "@gaming-platform/core";
import { chooseAzulBotAction } from "./bot.ts";
import {
  applyAzulAction,
  checkAzulInvariants,
  getAzulLegalActions,
  initAzulGame,
} from "./rules.ts";
import type { AzulAction, AzulConfig, AzulState } from "./types.ts";

export * from "./types.ts";
export * from "./rules.ts";
export * from "./bot.ts";

export function getAzulActingPlayerId(state: AzulState): string | null {
  if (state.phase === "GAME_OVER") return null;
  return state.players[state.activePlayerIndex]?.id ?? null;
}

export const AzulEngine: GameEngine<
  AzulState,
  AzulConfig,
  AzulAction,
  GameEvent,
  AzulState
> = {
  metadata: {
    id: "azul",
    name: "Azul",
    description:
      "Draft colorful Portuguese Azulejo ceramic tiles from Factory displays to tile the royal palace walls of Évora!",
    minPlayers: 2,
    maxPlayers: 4,
    supportsBots: true,
  },

  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<AzulConfig>,
    seed?: number | string
  ): AzulState {
    return initAzulGame(players, config, seed);
  },

  getLegalActions(state: AzulState, playerId: string): AzulAction[] {
    return getAzulLegalActions(state, playerId);
  },

  applyAction(
    state: AzulState,
    playerId: string,
    action: AzulAction
  ): { state: AzulState; events: GameEvent[] } {
    return applyAzulAction(state, playerId, action);
  },

  getPlayerView(state: AzulState): AzulState {
    return state;
  },

  getWinner(state: AzulState): string | null {
    return state.winnerId;
  },

  chooseBotAction(state: AzulState, playerId: string): AzulAction | null {
    return chooseAzulBotAction(state, playerId);
  },

  checkInvariants(state: AzulState) {
    return checkAzulInvariants(state);
  },
};
