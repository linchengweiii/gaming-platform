import type { BotDifficulty } from "@gaming-platform/core";
import { getAzulLegalActions } from "../rules.ts";
import type { AzulAction, AzulState } from "../types.ts";
import { evaluateDraftAction } from "./evaluate.ts";
import { chooseMasterAzulAction } from "./search.ts";

export function chooseAzulBotAction(
  rawState: AzulState,
  playerId: string
): AzulAction | null {
  // Scrub hidden draw order & PRNG state so bot search operates on 100% fair public information
  const state: AzulState = { ...rawState, bag: [], rngState: 0 };
  const legal = getAzulLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  if (difficulty === "master") {
    return chooseMasterAzulAction(state, playerId, legal);
  }

  return legal.reduce<{ act: AzulAction; score: number } | null>(
    (best, act) => {
      const score = evaluateDraftAction(state, player, act, difficulty);
      return best === null || score > best.score ? { act, score } : best;
    },
    null
  )!.act;
}
