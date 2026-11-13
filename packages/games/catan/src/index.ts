import type { GameEngine, GameEvent, PlayerDescriptor } from "@gaming-platform/core";
import { chooseCatanBotAction } from "./bot.ts";
import {
  applyCatanAction,
  checkCatanInvariants,
  computePlayerVictoryPoints,
  emptyResources,
  getCatanLegalActions,
  getPlayerResourceCount,
  initCatanGame,
  isCatanActionUndoable,
} from "./rules.ts";
import type {
  CatanAction,
  CatanConfig,
  CatanPlayerState,
  CatanState,
} from "./types.ts";

export * from "./types.ts";
export * from "./board.ts";
export * from "./rules.ts";
export * from "./bot.ts";

/**
 * Pure selector returning the player ID who acts next in `state` (handles asynchronous
 * DISCARD_ON_SEVEN, GOLD_RESOURCE_SELECTION, active domestic trade responses, and SPECIAL_BUILDING).
 */
export function getNextActingPlayerId(state: CatanState): string | null {
  if (state.phase === "GAME_OVER") return null;

  if (state.phase === "DISCARD_ON_SEVEN") {
    return Object.keys(state.pendingDiscards)[0] ?? null;
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    return Object.keys(state.pendingGoldPicks)[0] ?? null;
  }

  if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    const proposerIdx = Math.max(
      0,
      state.players.findIndex((p) => p.id === offer.fromPlayerId)
    );
    const n = state.players.length;
    const offsets = Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1);
    const responder = offsets
      .map((offset) => state.players[(proposerIdx + offset) % n]!)
      .find(
        (candidate) =>
          (offer.toPlayerId === null || offer.toPlayerId === candidate.id) &&
          !offer.declinedBy.includes(candidate.id) &&
          !accepted.includes(candidate.id)
      );
    return responder ? responder.id : offer.fromPlayerId;
  }

  if (state.phase === "SPECIAL_BUILDING") {
    if (state.specialBuildPlayerIndex === null) return null;
    return state.players[state.specialBuildPlayerIndex]?.id ?? null;
  }

  return state.players[state.activePlayerIndex]?.id ?? null;
}

function redactPlayerForViewer(
  player: CatanPlayerState,
  viewerPlayerId: string | null
): CatanPlayerState {
  if (player.id === viewerPlayerId) {
    return player;
  }
  return {
    ...player,
    hiddenResourceCount: getPlayerResourceCount(player),
    handRedacted: true,
    resources: emptyResources(),
    devCards: player.devCards.map((c) =>
      c.played ? c : { ...c, type: "knight" }
    ),
  };
}

export function getCatanPlayerViewPure(
  state: CatanState,
  viewerPlayerId: string | null
): CatanState {
  if (state.phase === "GAME_OVER") {
    return state;
  }
  return {
    ...state,
    devCardDeck: state.devCardDeck.map(() => "knight"),
    fogPool: state.fogPool.map(() => ({
      terrain: "fog",
      numberToken: null,
    })),
    players: state.players.map((p) => redactPlayerForViewer(p, viewerPlayerId)),
    eventLog: state.eventLog.map((evt) => {
      if (evt.type === "CARDS_DISCARDED" && evt.playerId !== viewerPlayerId) {
        const { payload: _hidden, ...rest } = evt;
        return rest;
      }
      return evt;
    }),
  };
}

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
      "Trade, build, and settle the island of Catan! Includes Base Game, 5–6 Player Extension, Seafarers Expansion, Harbormaster, and City Walls.",
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
    chooseCatanBotAction(state, playerId),

  checkInvariants: (state: CatanState) => checkCatanInvariants(state),

  isActionUndoable: (
    prevState: CatanState,
    action: CatanAction,
    nextState: CatanState
  ): boolean => isCatanActionUndoable(prevState, action, nextState),
};

export { computePlayerVictoryPoints };
