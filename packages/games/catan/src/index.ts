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
import type { CatanAction, CatanConfig, CatanState } from "./types.ts";

export * from "./types.ts";
export * from "./board.ts";
export * from "./rules.ts";
export * from "./bot.ts";

/**
 * Returns the player ID who needs to act next in `state` (handles asynchronous
 * DISCARD_ON_SEVEN, GOLD_RESOURCE_SELECTION, and SPECIAL_BUILDING phases).
 */
export function getNextActingPlayerId(state: CatanState): string | null {
  if (state.phase === "GAME_OVER") return null;

  if (state.phase === "DISCARD_ON_SEVEN") {
    const nextId = Object.keys(state.pendingDiscards)[0];
    return nextId ?? null;
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    const nextId = Object.keys(state.pendingGoldPicks)[0];
    return nextId ?? null;
  }

  if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    const proposerIdx = state.players.findIndex(
      (p) => p.id === offer.fromPlayerId
    );
    const n = state.players.length;
    for (let offset = 1; offset < n; offset++) {
      const candidate = state.players[(Math.max(0, proposerIdx) + offset) % n]!;
      if (
        (offer.toPlayerId === null || offer.toPlayerId === candidate.id) &&
        !offer.declinedBy.includes(candidate.id) &&
        !accepted.includes(candidate.id)
      ) {
        return candidate.id;
      }
    }
    return offer.fromPlayerId;
  }

  if (state.phase === "SPECIAL_BUILDING") {
    if (state.specialBuildPlayerIndex === null) return null;
    return state.players[state.specialBuildPlayerIndex]?.id ?? null;
  }

  return state.players[state.activePlayerIndex]?.id ?? null;
}

/**
 * Catan implementation of the platform's generic `GameEngine` interface.
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

  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<CatanConfig>,
    seed?: number | string
  ): CatanState {
    return initCatanGame(players, config, seed);
  },

  getLegalActions(state: CatanState, playerId: string): CatanAction[] {
    return getCatanLegalActions(state, playerId);
  },

  applyAction(
    state: CatanState,
    playerId: string,
    action: CatanAction
  ): { state: CatanState; events: GameEvent[] } {
    return applyCatanAction(state, playerId, action);
  },

  getPlayerView(state: CatanState, viewerPlayerId: string | null): CatanState {
    if (state.phase === "GAME_OVER") {
      return state;
    }
    const redacted = structuredClone(state);
    // Redact unplayed development card deck order and unrevealed fog pool
    redacted.devCardDeck = redacted.devCardDeck.map(() => "knight");
    redacted.fogPool = redacted.fogPool.map(() => ({
      terrain: "fog",
      numberToken: null,
    }));
    for (const p of redacted.players) {
      if (p.id !== viewerPlayerId) {
        p.hiddenResourceCount = getPlayerResourceCount(p);
        p.handRedacted = true;
        p.resources = emptyResources();
        p.devCards = p.devCards.map((c) =>
          c.played ? c : { ...c, type: "knight" }
        );
      }
    }
    redacted.eventLog = redacted.eventLog.map((evt) => {
      if (evt.type === "CARDS_DISCARDED" && evt.playerId !== viewerPlayerId) {
        const { payload: _hidden, ...rest } = evt;
        return rest;
      }
      return evt;
    });
    return redacted;
  },

  getWinner(state: CatanState): string | null {
    return state.winnerId;
  },

  chooseBotAction(state: CatanState, playerId: string): CatanAction | null {
    return chooseCatanBotAction(state, playerId);
  },

  checkInvariants(state: CatanState) {
    return checkCatanInvariants(state);
  },

  isActionUndoable(
    prevState: CatanState,
    action: CatanAction,
    nextState: CatanState
  ): boolean {
    return isCatanActionUndoable(prevState, action, nextState);
  },
};

export { computePlayerVictoryPoints };
