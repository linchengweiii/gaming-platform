import type { InvariantCheckResult } from "@gaming-platform/core";
import { AZUL_COLORS, AZUL_TILES_PER_COLOR } from "../config.ts";
import type { AzulState, AzulTileColor } from "../types.ts";
import { ROW_INDICES, isColorOnWallRow } from "./helpers.ts";

export function getAzulActingPlayerId(state: AzulState): string | null {
  if (state.phase === "GAME_OVER") return null;
  return state.players[state.activePlayerIndex]?.id ?? null;
}

export function getAzulPlayerView(state: AzulState): AzulState {
  if (state.phase === "GAME_OVER") return state;
  return {
    ...state,
    bag: [...state.bag].sort(),
    rngState: 0,
  };
}

export function checkAzulInvariants(state: AzulState): InvariantCheckResult {
  const counts: Record<AzulTileColor, number> = {
    blue: 0,
    yellow: 0,
    red: 0,
    black: 0,
    teal: 0,
  };
  const countTiles = (tiles: readonly AzulTileColor[]) => {
    for (const color of tiles) counts[color]++;
  };

  countTiles(state.bag);
  countTiles(state.discardLid);
  for (const factory of state.factories) countTiles(factory);
  countTiles(state.centerPool);

  const violations: string[] = [];
  for (const p of state.players) {
    if (p.score < 0) {
      violations.push(`Player ${p.id} has negative score: ${p.score}`);
    }
    for (const r of ROW_INDICES) {
      const line = p.patternLines[r];
      if (line.count > line.capacity) {
        violations.push(`Player ${p.id} pattern line ${r} exceeds capacity`);
      }
      if (line.color && line.count > 0 && isColorOnWallRow(p.wall, r, line.color)) {
        violations.push(
          `Player ${p.id} pattern line ${r} holds ${line.color} which is already on wall row ${r}`
        );
      }
      if (line.color && line.count > 0) {
        counts[line.color] += line.count;
      }
      for (const cell of p.wall[r]!) {
        if (cell !== null) counts[cell]++;
      }
    }
    for (const token of p.floorLine) {
      if (token !== "first_player") counts[token]++;
    }
  }

  for (const color of AZUL_COLORS) {
    if (counts[color] !== AZUL_TILES_PER_COLOR) {
      violations.push(
        `Tile conservation violated for ${color}: found ${counts[color]} !== ${AZUL_TILES_PER_COLOR}`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}
