import type { GameEvent } from "@gaming-platform/core";
import { SPLENDOR_HAND_TOKEN_LIMIT } from "../config.ts";
import type {
  SplendorNoble,
  SplendorPlayerState,
  SplendorState,
} from "../types.ts";
import {
  appendSplendorEvent,
  qualifiesForNoble,
  replacePlayerAt,
  totalTokens,
} from "./helpers.ts";

export function awardNobleAndFinishTurn(
  state: SplendorState,
  events: readonly GameEvent[],
  noble: SplendorNoble
): { state: SplendorState; events: GameEvent[] } {
  const player = state.players[state.activePlayerIndex]!;
  const updatedPlayer: SplendorPlayerState = {
    ...player,
    nobles: [...player.nobles, noble],
    points: player.points + noble.points,
  };
  const withNoble: SplendorState = {
    ...state,
    nobles: state.nobles.filter((n) => n.id !== noble.id),
    eligibleNobleIds: [],
    players: replacePlayerAt(
      state.players,
      state.activePlayerIndex,
      updatedPlayer
    ),
  };
  const logged = appendSplendorEvent(
    withNoble,
    events,
    "NOBLE_VISITED",
    `👑 Noble ${noble.name} visited ${player.name} (+${noble.points} VP)!`,
    player.id
  );
  return finishTurnTransition(logged.state, logged.events);
}

export function resolvePostMainAction(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (totalTokens(activePlayer.tokens) > SPLENDOR_HAND_TOKEN_LIMIT) {
    return {
      state: { ...state, phase: "RETURN_TOKENS" },
      events: [...events],
    };
  }
  return resolveNoblesAndAdvanceTurn(state, events);
}

export function resolveNoblesAndAdvanceTurn(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const player = state.players[state.activePlayerIndex]!;
  const matching = state.nobles.filter((n) => qualifiesForNoble(player, n));
  if (matching.length === 1) {
    return awardNobleAndFinishTurn(state, events, matching[0]!);
  }

  if (matching.length > 1) {
    return {
      state: {
        ...state,
        eligibleNobleIds: matching.map((n) => n.id),
        phase: "SELECT_NOBLE",
      },
      events: [...events],
    };
  }

  return finishTurnTransition(state, events);
}

export function finishTurnTransition(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const player = state.players[state.activePlayerIndex]!;
  const justTriggeredFinalRound =
    !state.finalRoundTriggered && player.points >= state.config.targetPoints;

  const baseTransition = justTriggeredFinalRound
    ? appendSplendorEvent(
        { ...state, finalRoundTriggered: true },
        events,
        "FINAL_ROUND_TRIGGERED",
        `${player.name} reached ${player.points} Prestige Points — finishing the current round!`,
        player.id
      )
    : { state, events: [...events] };

  const curState = baseTransition.state;
  const curEvents = baseTransition.events;

  const startIdx = curState.startingPlayerIndex ?? 0;
  const nextIdx = (curState.activePlayerIndex + 1) % curState.players.length;
  const isLastPlayerInRound = nextIdx === startIdx;

  if (
    (curState.finalRoundTriggered && isLastPlayerInRound) ||
    curState.turn >= curState.config.maxTurns
  ) {
    const sorted = [...curState.players].sort((a, b) =>
      b.points !== a.points
        ? b.points - a.points
        : a.purchasedCards.length - b.purchasedCards.length
    );
    const winner = sorted[0]!;
    return appendSplendorEvent(
      { ...curState, winnerId: winner.id, phase: "GAME_OVER" },
      curEvents,
      "GAME_OVER",
      `${winner.name} wins Splendor with ${winner.points} Prestige Points (${winner.purchasedCards.length} cards)!`,
      winner.id
    );
  }

  return {
    state: {
      ...curState,
      activePlayerIndex: nextIdx,
      turn: curState.turn + 1,
      round: isLastPlayerInRound ? curState.round + 1 : curState.round,
      phase: "MAIN_ACTION",
    },
    events: curEvents,
  };
}
