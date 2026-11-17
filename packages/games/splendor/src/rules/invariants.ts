import type { InvariantCheckResult } from "@gaming-platform/core";
import {
  GEM_COLORS,
  SPLENDOR_GOLD_COUNT,
  SPLENDOR_HAND_TOKEN_LIMIT,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import type { SplendorState } from "../types.ts";
import { getInitialGemBankCount, totalTokens } from "./helpers.ts";

export function checkSplendorInvariants(
  state: SplendorState
): InvariantCheckResult {
  const expectedGemTotal = getInitialGemBankCount(state.players.length);

  const gemViolations = GEM_COLORS.flatMap((color) => {
    const bankNeg =
      state.bank[color] < 0
        ? [`Negative bank ${color}: ${state.bank[color]}`]
        : [];
    const playerNegs = state.players
      .filter((p) => p.tokens[color] < 0)
      .map((p) => `Player ${p.id} has negative ${color}`);
    const playerSum = state.players.reduce((s, p) => s + p.tokens[color], 0);
    const conservation =
      state.bank[color] + playerSum !== expectedGemTotal
        ? [
            `Token conservation violated for ${color}: ${state.bank[color]} + ${playerSum} !== ${expectedGemTotal}`,
          ]
        : [];
    return [...bankNeg, ...playerNegs, ...conservation];
  });

  const goldSum =
    state.bank.gold + state.players.reduce((s, p) => s + p.tokens.gold, 0);
  const goldViolations =
    goldSum !== SPLENDOR_GOLD_COUNT
      ? [`Gold conservation violated: ${goldSum} !== ${SPLENDOR_GOLD_COUNT}`]
      : [];

  const playerViolations = state.players.flatMap((p) => {
    const reservedErr =
      p.reservedCards.length > SPLENDOR_MAX_RESERVED_CARDS
        ? [`Player ${p.id} has > 3 reserved cards`]
        : [];
    const tokenLimitErr =
      state.phase !== "RETURN_TOKENS" &&
      totalTokens(p.tokens) > SPLENDOR_HAND_TOKEN_LIMIT
        ? [
            `Player ${p.id} holds ${totalTokens(p.tokens)} > 10 tokens outside RETURN_TOKENS phase`,
          ]
        : [];
    const calcPoints =
      p.purchasedCards.reduce((s, c) => s + c.points, 0) +
      p.nobles.reduce((s, n) => s + n.points, 0);
    const pointsErr =
      p.points !== calcPoints
        ? [`Player ${p.id} points mismatch: ${p.points} !== ${calcPoints}`]
        : [];
    return [...reservedErr, ...tokenLimitErr, ...pointsErr];
  });

  const violations = [...gemViolations, ...goldViolations, ...playerViolations];
  return {
    valid: violations.length === 0,
    violations,
  };
}
