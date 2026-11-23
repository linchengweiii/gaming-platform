import type { InvariantCheckResult } from "@gaming-platform/core";
import {
  ALL_TOKEN_COLORS,
  SPLENDOR_GOLD_COUNT,
  SPLENDOR_HAND_TOKEN_LIMIT,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import type { CardTier, SplendorCard, SplendorState } from "../types.ts";
import {
  emptyGemMap,
  getInitialGemBankCount,
  totalTokens,
} from "./helpers.ts";

export function getSplendorActingPlayerId(state: SplendorState): string | null {
  if (state.phase === "GAME_OVER") return null;
  return state.players[state.activePlayerIndex]?.id ?? null;
}

export function getSplendorPlayerView(
  state: SplendorState,
  viewerPlayerId: string | null = null
): SplendorState {
  if (state.phase === "GAME_OVER") {
    return state;
  }

  const redactDeck = (
    tier: CardTier,
    cards: readonly SplendorCard[]
  ): SplendorCard[] =>
    cards.map((_, idx) => ({
      id: `hidden-deck-t${tier}-${idx}`,
      tier,
      bonus: "onyx",
      points: 0,
      cost: emptyGemMap(),
      redacted: true,
    }));

  return {
    ...state,
    rngState: 0,
    decks: {
      1: redactDeck(1, state.decks[1]),
      2: redactDeck(2, state.decks[2]),
      3: redactDeck(3, state.decks[3]),
    },
    players: state.players.map((p) => {
      if (viewerPlayerId && p.id === viewerPlayerId) {
        return p;
      }
      return {
        ...p,
        reservedCards: p.reservedCards.map((c, idx) =>
          c.reservedFromDeck
            ? {
                id: `hidden-reserve-${p.id}-${idx}`,
                tier: c.tier,
                bonus: "onyx",
                points: 0,
                cost: emptyGemMap(),
                reservedFromDeck: true,
                redacted: true,
              }
            : c
        ),
      };
    }),
  };
}

export function checkSplendorInvariants(
  state: SplendorState
): InvariantCheckResult {
  const expectedGemTotal = getInitialGemBankCount(state.players.length);
  const violations: string[] = [];

  for (const color of ALL_TOKEN_COLORS) {
    const expected =
      color === "gold" ? SPLENDOR_GOLD_COUNT : expectedGemTotal;
    if (state.bank[color] < 0) {
      violations.push(`Negative bank ${color}: ${state.bank[color]}`);
    }
    let playerSum = 0;
    for (const p of state.players) {
      if (p.tokens[color] < 0) {
        violations.push(`Player ${p.id} has negative ${color}`);
      }
      playerSum += p.tokens[color];
    }
    if (state.bank[color] + playerSum !== expected) {
      violations.push(
        `Token conservation violated for ${color}: ${state.bank[color]} + ${playerSum} !== ${expected}`
      );
    }
  }

  for (const p of state.players) {
    if (p.reservedCards.length > SPLENDOR_MAX_RESERVED_CARDS) {
      violations.push(`Player ${p.id} has > 3 reserved cards`);
    }
    if (
      state.phase !== "RETURN_TOKENS" &&
      totalTokens(p.tokens) > SPLENDOR_HAND_TOKEN_LIMIT
    ) {
      violations.push(
        `Player ${p.id} holds ${totalTokens(p.tokens)} > 10 tokens outside RETURN_TOKENS phase`
      );
    }
    const calcPoints =
      p.purchasedCards.reduce((s, c) => s + c.points, 0) +
      p.nobles.reduce((s, n) => s + n.points, 0);
    if (p.points !== calcPoints) {
      violations.push(
        `Player ${p.id} points mismatch: ${p.points} !== ${calcPoints}`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}
