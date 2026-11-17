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

function addTileCounts(
  counts: Record<AzulTileColor, number>,
  tiles: readonly AzulTileColor[]
): Record<AzulTileColor, number> {
  return tiles.reduce<Record<AzulTileColor, number>>(
    (acc, color) => ({ ...acc, [color]: acc[color] + 1 }),
    counts
  );
}

export function checkAzulInvariants(state: AzulState): InvariantCheckResult {
  const zeroCounts: Record<AzulTileColor, number> = {
    blue: 0,
    yellow: 0,
    red: 0,
    black: 0,
    teal: 0,
  };

  const poolCounts = [
    state.bag,
    state.discardLid,
    state.factories.flat(),
    state.centerPool,
  ].reduce(addTileCounts, zeroCounts);

  const { counts: totalCounts, playerViolations } = state.players.reduce<{
    counts: Record<AzulTileColor, number>;
    playerViolations: string[];
  }>(
    (acc, p) => {
      const scoreErr =
        p.score < 0 ? [`Player ${p.id} has negative score: ${p.score}`] : [];

      const rowCheck = ROW_INDICES.reduce<{
        counts: Record<AzulTileColor, number>;
        errs: string[];
      }>(
        (rAcc, r) => {
          const line = p.patternLines[r];
          const capErr =
            line.count > line.capacity
              ? [`Player ${p.id} pattern line ${r} exceeds capacity`]
              : [];
          const dupErr =
            line.color && line.count > 0 && isColorOnWallRow(p.wall, r, line.color)
              ? [
                  `Player ${p.id} pattern line ${r} holds ${line.color} which is already on wall row ${r}`,
                ]
              : [];
          const withLineCount =
            line.color && line.count > 0
              ? {
                  ...rAcc.counts,
                  [line.color]: rAcc.counts[line.color] + line.count,
                }
              : rAcc.counts;
          const wallRowColors = p.wall[r]!.filter(
            (c): c is AzulTileColor => c !== null
          );
          return {
            counts: addTileCounts(withLineCount, wallRowColors),
            errs: [...rAcc.errs, ...capErr, ...dupErr],
          };
        },
        { counts: acc.counts, errs: [] }
      );

      const floorColors = p.floorLine.filter(
        (t): t is AzulTileColor => t !== "first_player"
      );

      return {
        counts: addTileCounts(rowCheck.counts, floorColors),
        playerViolations: [
          ...acc.playerViolations,
          ...scoreErr,
          ...rowCheck.errs,
        ],
      };
    },
    { counts: poolCounts, playerViolations: [] }
  );

  const conservationViolations = AZUL_COLORS.filter(
    (color) => totalCounts[color] !== AZUL_TILES_PER_COLOR
  ).map(
    (color) =>
      `Tile conservation violated for ${color}: found ${totalCounts[color]} !== ${AZUL_TILES_PER_COLOR}`
  );

  const violations = [...playerViolations, ...conservationViolations];
  return {
    valid: violations.length === 0,
    violations,
  };
}
