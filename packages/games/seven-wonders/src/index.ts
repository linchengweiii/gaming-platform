import type { GameEngine, GameEvent } from "@gaming-platform/core";
import { chooseSevenWondersBotAction } from "./bot/choose.ts";
import {
  SEVEN_WONDERS_MAX_PLAYERS,
  SEVEN_WONDERS_MIN_PLAYERS,
} from "./config/game-config.ts";
import { applySevenWondersAction } from "./rules/apply-turn.ts";
import { checkSevenWondersInvariants } from "./rules/invariants.ts";
import { getSevenWondersLegalActions } from "./rules/legal-actions.ts";
import { getSevenWondersPlayerView } from "./rules/redaction.ts";
import { initSevenWondersGame } from "./rules/setup.ts";
import type {
  SevenWondersAction,
  SevenWondersConfig,
  SevenWondersState,
} from "./types.ts";

export * from "./types.ts";
export {
  ALL_WONDER_IDS,
  WONDER_BOARDS,
  getWonderBoardDefinition,
} from "./config/wonders-config.ts";
export { SEVEN_WONDERS_AGE_I_CARDS } from "./cards/age1.ts";
export { SEVEN_WONDERS_AGE_II_CARDS } from "./cards/age2.ts";
export { SEVEN_WONDERS_AGE_III_BASE_CARDS } from "./cards/age3.ts";
export { SEVEN_WONDERS_GUILD_CARDS } from "./cards/guilds.ts";
export * from "./rules.ts";

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
    minPlayers: SEVEN_WONDERS_MIN_PLAYERS,
    maxPlayers: SEVEN_WONDERS_MAX_PLAYERS,
    supportsBots: true,
  },
  initGame: initSevenWondersGame,
  getLegalActions: getSevenWondersLegalActions,
  applyAction: applySevenWondersAction,
  getPlayerView: getSevenWondersPlayerView,
  getWinner: (state) => state.winnerId,
  chooseBotAction: chooseSevenWondersBotAction,
  checkInvariants: checkSevenWondersInvariants,
  isActionUndoable(prevState, _action, nextState): boolean {
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
