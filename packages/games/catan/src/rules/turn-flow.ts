import type { GameEvent } from "@gaming-platform/core";
import { emptyTurnDiscounts } from "../cities-and-knights/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import { IMPROVEMENT_DISCIPLINES } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  computePlayerVictoryPoints,
  recalculateAwardsPure,
} from "./awards-and-vp.ts";
import { type StateWithEvents, appendCatanEvent } from "./helpers.ts";

/**
 * Pure selector returning the player ID who acts next in `state` (handles asynchronous
 * BARBARIAN_PILLAGE_SELECTION, PROGRESS_CARD_SELECTION, DISCARD_ON_SEVEN,
 * GOLD_RESOURCE_SELECTION, active domestic trade responses, and SPECIAL_BUILDING).
 */
export function getNextActingPlayerId(state: CatanState): string | null {
  if (state.phase === "GAME_OVER") return null;

  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    return state.pendingPillageSelections[0] ?? null;
  }

  if (state.phase === "PROGRESS_CARD_SELECTION") {
    if (state.pendingDefenderDeckPicks.length > 0) {
      return state.pendingDefenderDeckPicks[0] ?? null;
    }
    return state.pendingProgressDiscards[0] ?? null;
  }

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

export function advanceToNextPlayerTurnPure(
  state: CatanState,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const nextActivePlayerIndex =
    (state.activePlayerIndex + 1) % state.players.length;
  const nextTurn = state.turn + 1;
  const resetPlayers = state.players.map((p) => ({
    ...p,
    hasPlayedDevCardThisTurn: false,
    hasMovedShipThisTurn: false,
    activeTurnDiscounts: emptyTurnDiscounts(),
  }));
  const resetKnights = Object.fromEntries(
    Object.entries(state.knights).map(([vId, k]) => [
      vId,
      {
        ...k,
        activatedThisTurn: false,
        actedThisTurn: false,
        promotedThisTurn: false,
      },
    ])
  );

  const advancedState: CatanState = {
    ...state,
    activePlayerIndex: nextActivePlayerIndex,
    turn: nextTurn,
    players: resetPlayers,
    knights: resetKnights,
  };

  if (nextTurn > advancedState.config.maxTurns) {
    const awarded = recalculateAwardsPure(advancedState);
    const best = awarded.players.reduce<{ player: CatanPlayerState; vp: number }>(
      (acc, p) => {
        const vp = computePlayerVictoryPoints(awarded, p.id, false);
        return vp > acc.vp ? { player: p, vp } : acc;
      },
      { player: awarded.players[0]!, vp: -1 }
    );
    const endedState: CatanState = {
      ...awarded,
      winnerId: best.player.id,
      phase: "GAME_OVER",
    };
    return appendCatanEvent(
      endedState,
      emitted,
      "GAME_OVER_MAX_TURNS",
      `Max turns reached. ${best.player.name} wins with ${best.vp} VP!`,
      best.player.id
    );
  }

  const nextPlayer = advancedState.players[nextActivePlayerIndex]!;
  const preRollState: CatanState = {
    ...advancedState,
    phase: "PRE_ROLL",
  };
  const logged = appendCatanEvent(
    preRollState,
    emitted,
    "TURN_STARTED",
    `Turn ${nextTurn}: ${nextPlayer.name}'s turn.`,
    nextPlayer.id
  );
  const checked = checkAndAssignWinnerPure(logged.state, nextPlayer.id);
  return { state: checked.state, emitted: logged.emitted };
}

export function applyEndTurnPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Cannot end turn now");
  }
  const clearedOffer: CatanState = {
    ...currentState,
    activeTradeOffer: null,
  };

  const checked = checkAndAssignWinnerPure(clearedOffer, playerId);
  if (checked.won) {
    return { state: checked.state, events: [] };
  }

  if (
    checked.state.config.enableSpecialBuildingPhase &&
    checked.state.players.length >= 3
  ) {
    const sbState: CatanState = {
      ...checked.state,
      phase: "SPECIAL_BUILDING",
      specialBuildPlayerIndex:
        (checked.state.activePlayerIndex + 1) % checked.state.players.length,
    };
    const logged = appendCatanEvent(
      sbState,
      [],
      "SPECIAL_BUILDING_STARTED",
      `${player.name} ended their turn. Special Building Phase started.`,
      playerId
    );
    return { state: logged.state, events: logged.emitted };
  }

  const advanced = advanceToNextPlayerTurnPure(checked.state, []);
  return { state: advanced.state, events: advanced.emitted };
}

const IRREVERSIBLE_CATAN_ACTIONS = new Set<CatanAction["type"]>([
  "ROLL_DICE",
  "BUY_DEV_CARD",
  "STEAL_FROM_PLAYER",
  "PLAY_MONOPOLY",
  "PLAY_PROGRESS_CARD",
  "CHASE_ROBBER_WITH_KNIGHT",
  "SELECT_PILLAGED_CITY",
  "SELECT_PROGRESS_DECK",
  "DISCARD_PROGRESS_CARD",
  "OFFER_DOMESTIC_TRADE",
  "ACCEPT_DOMESTIC_TRADE",
  "DECLINE_DOMESTIC_TRADE",
  "CONFIRM_DOMESTIC_TRADE",
  "CANCEL_DOMESTIC_TRADE",
  "END_TURN",
  "END_SPECIAL_BUILD",
]);

/**
 * Returns whether `action` can be fairly undone by the acting player within their own turn.
 * Disallows undoing dice rolls, dev-card draws, random steals, fog reveals, Monopoly hand reveals,
 * Progress Card plays, or interpersonal trade steps.
 */
export function isCatanActionUndoable(
  prevState: CatanState,
  action: CatanAction,
  nextState: CatanState
): boolean {
  if (
    nextState.phase === "GAME_OVER" ||
    prevState.turn !== nextState.turn ||
    prevState.phase.startsWith("SETUP_") !== nextState.phase.startsWith("SETUP_")
  ) {
    return false;
  }
  if (IRREVERSIBLE_CATAN_ACTIONS.has(action.type)) {
    return false;
  }
  if (
    prevState.rngState !== nextState.rngState ||
    prevState.devCardDeck.length !== nextState.devCardDeck.length ||
    prevState.fogPool.length !== nextState.fogPool.length ||
    IMPROVEMENT_DISCIPLINES.some(
      (d) => prevState.progressDecks[d].length !== nextState.progressDecks[d].length
    )
  ) {
    return false;
  }
  return true;
}
