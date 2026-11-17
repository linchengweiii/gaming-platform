import type { InvariantCheckResult } from "@gaming-platform/core";
import {
  SEVEN_WONDERS_HAND_SIZE,
  SEVEN_WONDERS_MAX_PLAYERS,
  SEVEN_WONDERS_MIN_PLAYERS,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import type { SevenWondersState } from "../types.ts";
import { computeSevenWondersScoreBreakdown } from "./scoring.ts";

export function checkSevenWondersInvariants(
  state: SevenWondersState
): InvariantCheckResult {
  const violations: string[] = [];

  if (
    state.players.length < SEVEN_WONDERS_MIN_PLAYERS ||
    state.players.length > SEVEN_WONDERS_MAX_PLAYERS
  ) {
    violations.push(`Invalid player count ${state.players.length}`);
  }

  const wonderIds = new Set<string>();
  for (const p of state.players) {
    if (wonderIds.has(p.wonderId)) {
      violations.push(`Duplicate wonder ${p.wonderId} assigned`);
    }
    wonderIds.add(p.wonderId);

    if (p.coins < 0) {
      violations.push(`Player ${p.id} has negative coins (${p.coins})`);
    }

    const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
    if (p.builtWonderStages < 0 || p.builtWonderStages > board.stages.length) {
      violations.push(
        `Player ${p.id} has out-of-range wonder stages ${p.builtWonderStages}`
      );
    }

    const names = new Set<string>();
    for (const c of p.tableau) {
      if (names.has(c.name)) {
        violations.push(
          `Player ${p.id} built duplicate structure name "${c.name}"`
        );
      }
      names.add(c.name);
    }

    const expectedScore = computeSevenWondersScoreBreakdown(
      state.players,
      state.players.indexOf(p)
    );
    if (p.scoreBreakdown.totalVp !== expectedScore.totalVp) {
      violations.push(
        `Player ${p.id} scoreBreakdown mismatch: stored ${p.scoreBreakdown.totalVp} vs computed ${expectedScore.totalVp}`
      );
    }
  }

  if (state.phase === "AGE_DRAFT") {
    const expectedHandSize = SEVEN_WONDERS_HAND_SIZE + 1 - state.draftRound;
    for (const p of state.players) {
      const actualCount = p.handRedacted
        ? (p.hiddenHandCount ?? 0)
        : p.hand.length;
      if (actualCount !== expectedHandSize) {
        violations.push(
          `Player ${p.id} hand size ${actualCount} !== expected ${expectedHandSize} at Age ${state.age} Round ${state.draftRound}`
        );
      }
    }
  }

  if (state.phase === "GAME_OVER" && !state.winnerId) {
    violations.push("GAME_OVER state missing winnerId");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
