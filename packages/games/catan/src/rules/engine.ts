import type {
  GameEngine,
  GameEvent,
  PlayerDescriptor,
} from "@gaming-platform/core";
import { chooseCatanBotAction } from "../bot/choose.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanConfig } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { applyCatanAction } from "./apply-action.ts";
import { checkCatanInvariants } from "./invariants.ts";
import { getCatanLegalActions } from "./legal-actions.ts";
import { getCatanPlayerViewPure } from "./redaction.ts";
import { initCatanGame } from "./setup-init.ts";
import { isCatanActionUndoable } from "./turn-flow.ts";

/**
 * Catan implementation of the platform's pure `GameEngine` state-machine contract.
 */
export const CatanEngine: GameEngine<
  CatanState,
  CatanConfig,
  CatanAction,
  GameEvent,
  CatanState
> = {
  metadata: {
    id: "catan",
    name: "Settlers of Catan",
    description:
      "Trade, build, and settle the island of Catan! Includes Base Game, 5–6 Player Extension, Cities & Knights Expansion, Seafarers Expansion, Harbormaster, and City Walls.",
    minPlayers: 2,
    maxPlayers: 6,
    supportsBots: true,
  },

  initGame: (
    players: readonly PlayerDescriptor[],
    config?: Partial<CatanConfig>,
    seed?: number | string
  ): CatanState => initCatanGame(players, config, seed),

  getLegalActions: (state: CatanState, playerId: string): CatanAction[] =>
    getCatanLegalActions(state, playerId),

  applyAction: (
    state: CatanState,
    playerId: string,
    action: CatanAction
  ): { state: CatanState; events: GameEvent[] } =>
    applyCatanAction(state, playerId, action),

  getPlayerView: (
    state: CatanState,
    viewerPlayerId: string | null
  ): CatanState => getCatanPlayerViewPure(state, viewerPlayerId),

  getWinner: (state: CatanState): string | null => state.winnerId,

  chooseBotAction: (state: CatanState, playerId: string): CatanAction | null =>
    chooseCatanBotAction(getCatanPlayerViewPure(state, playerId), playerId),

  checkInvariants: (state: CatanState) => checkCatanInvariants(state),

  isActionUndoable: (
    prevState: CatanState,
    action: CatanAction,
    nextState: CatanState
  ): boolean => isCatanActionUndoable(prevState, action, nextState),
};
