import type { GameEngine, GameEvent } from "@gaming-platform/core";
import { chooseAzulBotAction } from "./bot/search.ts";
import { applyAzulAction, getAzulLegalActions } from "./rules/apply.ts";
import { checkAzulInvariants, getAzulPlayerView } from "./rules/redaction.ts";
import { initAzulGame } from "./rules/setup.ts";
import type { AzulAction, AzulConfig, AzulState } from "./types.ts";

export * from "./config.ts";
export * from "./types.ts";
export {
  canPlaceColorOnPatternLine,
  getWallColumnForColor,
} from "./rules/helpers.ts";
export { getAzulActingPlayerId } from "./rules/redaction.ts";
export { scoreWallPlacement } from "./rules/scoring.ts";

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
  initGame: initAzulGame,
  getLegalActions: getAzulLegalActions,
  applyAction: applyAzulAction,
  getPlayerView: getAzulPlayerView,
  getWinner: (state) => state.winnerId,
  chooseBotAction: chooseAzulBotAction,
  checkInvariants: checkAzulInvariants,
  isActionUndoable(prevState, _action, nextState): boolean {
    if (nextState.phase === "GAME_OVER") return false;
    if (prevState.turn !== nextState.turn) return false;
    return (
      prevState.rngState === nextState.rngState &&
      prevState.bag.length === nextState.bag.length
    );
  },
};
