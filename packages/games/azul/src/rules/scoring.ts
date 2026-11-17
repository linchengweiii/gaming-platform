import type { GameEvent } from "@gaming-platform/core";
import {
  AZUL_BONUS_POINTS,
  AZUL_COLORS,
  AZUL_FLOOR_CAPACITY,
  AZUL_WALL_SIZE,
  FLOOR_PENALTIES,
} from "../config.ts";
import type {
  AzulPlayerState,
  AzulState,
  AzulTileColor,
  PatternLineState,
} from "../types.ts";
import {
  COL_INDICES,
  ROW_INDICES,
  appendAzulEvent,
  getWallColumnForColor,
  setPatternLineAt,
  setWallCell,
} from "./helpers.ts";
import { fillFactoriesPure } from "./setup.ts";

function countContiguous(
  start: number,
  step: -1 | 1,
  isOccupied: (idx: number) => boolean
): number {
  const next = start + step;
  if (next < 0 || next >= AZUL_WALL_SIZE || !isOccupied(next)) {
    return 0;
  }
  return 1 + countContiguous(next, step, isOccupied);
}

/**
 * Pure chain-scoring computation when placing a tile at `(row, col)` on `wall`.
 */
export function scoreWallPlacement(
  wall: readonly (readonly (AzulTileColor | null)[])[],
  row: number,
  col: number
): number {
  const horizChain =
    1 +
    countContiguous(col, -1, (c) => wall[row]![c] !== null) +
    countContiguous(col, 1, (c) => wall[row]![c] !== null);
  const vertChain =
    1 +
    countContiguous(row, -1, (r) => wall[r]![col] !== null) +
    countContiguous(row, 1, (r) => wall[r]![col] !== null);

  if (horizChain === 1 && vertChain === 1) {
    return 1;
  }
  return (horizChain > 1 ? horizChain : 0) + (vertChain > 1 ? vertChain : 0);
}

function tileSinglePlayerWallPure(
  player: AzulPlayerState,
  discardLid: readonly AzulTileColor[]
): {
  player: AzulPlayerState;
  discardLid: AzulTileColor[];
  roundPointsGained: number;
  penalty: number;
} {
  const rowTiled = ROW_INDICES.reduce<{
    wall: (AzulTileColor | null)[][];
    patternLines: AzulPlayerState["patternLines"];
    discardLid: AzulTileColor[];
    roundPointsGained: number;
  }>(
    (acc, r) => {
      const line = acc.patternLines[r];
      if (line.count !== line.capacity || line.color === null) {
        return acc;
      }
      const tileColor = line.color;
      const col = getWallColumnForColor(r, tileColor);
      const nextWall = setWallCell(acc.wall, r, col, tileColor);
      const pts = scoreWallPlacement(nextWall, r, col);
      const discardedFromRow = Array.from(
        { length: line.capacity - 1 },
        () => tileColor
      );
      const clearedLine: PatternLineState = {
        capacity: line.capacity,
        color: null,
        count: 0,
      };
      return {
        wall: nextWall,
        patternLines: setPatternLineAt(acc.patternLines, r, clearedLine),
        discardLid: [...acc.discardLid, ...discardedFromRow],
        roundPointsGained: acc.roundPointsGained + pts,
      };
    },
    {
      wall: player.wall.map((r) => [...r]),
      patternLines: player.patternLines,
      discardLid: [...discardLid],
      roundPointsGained: 0,
    }
  );

  const penalty = player.floorLine
    .slice(0, AZUL_FLOOR_CAPACITY)
    .reduce((sum, _, idx) => sum + FLOOR_PENALTIES[idx]!, 0);

  const floorTilesToDiscard = player.floorLine.filter(
    (token): token is AzulTileColor => token !== "first_player"
  );

  const completedRows = ROW_INDICES.filter((r) =>
    rowTiled.wall[r]!.every((cell) => cell !== null)
  ).length;

  const nextScore = Math.max(
    0,
    player.score + rowTiled.roundPointsGained + penalty
  );

  return {
    player: {
      ...player,
      score: nextScore,
      wall: rowTiled.wall,
      patternLines: rowTiled.patternLines,
      floorLine: [],
      completedRows,
    },
    discardLid: [...rowTiled.discardLid, ...floorTilesToDiscard],
    roundPointsGained: rowTiled.roundPointsGained,
    penalty,
  };
}

function computeEndgameBonusesPure(player: AzulPlayerState): {
  player: AzulPlayerState;
  rows: number;
  cols: number;
  colors: number;
  bonus: number;
} {
  const rows = ROW_INDICES.filter((r) =>
    player.wall[r]!.every((c) => c !== null)
  ).length;
  const cols = COL_INDICES.filter((c) =>
    ROW_INDICES.every((r) => player.wall[r]![c] !== null)
  ).length;
  const colors = AZUL_COLORS.filter(
    (color) =>
      ROW_INDICES.reduce<number>(
        (sum, r) =>
          sum +
          COL_INDICES.filter((c) => player.wall[r]![c] === color).length,
        0
      ) === AZUL_WALL_SIZE
  ).length;

  const bonus =
    rows * AZUL_BONUS_POINTS.row +
    cols * AZUL_BONUS_POINTS.col +
    colors * AZUL_BONUS_POINTS.color;
  return {
    player: {
      ...player,
      completedRows: rows,
      completedCols: cols,
      completedColorSets: colors,
      score: player.score + bonus,
    },
    rows,
    cols,
    colors,
    bonus,
  };
}

export function resolveWallTilingAndEndOfRoundPure(
  initialState: AzulState,
  initialEvents: readonly GameEvent[]
): { state: AzulState; events: GameEvent[] } {
  const tiledAll = initialState.players.reduce<{
    state: AzulState;
    events: GameEvent[];
    completedRowTriggered: boolean;
  }>(
    (acc, p, pIdx) => {
      const tiled = tileSinglePlayerWallPure(p, acc.state.discardLid);
      const nextPlayers = acc.state.players.map((existing, idx) =>
        idx === pIdx ? tiled.player : existing
      );
      const updatedState: AzulState = {
        ...acc.state,
        players: nextPlayers,
        discardLid: tiled.discardLid,
      };
      const logged = appendAzulEvent(
        updatedState,
        acc.events,
        "WALL_TILED",
        `Round ${updatedState.round} Wall-Tiling: ${tiled.player.name} +${tiled.roundPointsGained} pts${
          tiled.penalty < 0 ? `, ${tiled.penalty} floor penalty` : ""
        } (Total: ${tiled.player.score}).`,
        tiled.player.id
      );
      return {
        state: logged.state,
        events: logged.events,
        completedRowTriggered:
          acc.completedRowTriggered || tiled.player.completedRows > 0,
      };
    },
    {
      state: initialState,
      events: [...initialEvents],
      completedRowTriggered: false,
    }
  );

  const noTilesLeft =
    tiledAll.state.bag.length === 0 && tiledAll.state.discardLid.length === 0;
  if (
    tiledAll.completedRowTriggered ||
    noTilesLeft ||
    tiledAll.state.round >= tiledAll.state.config.maxRounds
  ) {
    const withBonuses = tiledAll.state.players.reduce<{
      state: AzulState;
      events: GameEvent[];
    }>(
      (acc, p, pIdx) => {
        const res = computeEndgameBonusesPure(p);
        const nextState: AzulState = {
          ...acc.state,
          players: acc.state.players.map((existing, idx) =>
            idx === pIdx ? res.player : existing
          ),
        };
        if (res.bonus <= 0) {
          return { state: nextState, events: acc.events };
        }
        return appendAzulEvent(
          nextState,
          acc.events,
          "ENDGAME_BONUS",
          `${res.player.name} earned +${res.bonus} Endgame Bonus (${res.rows} row, ${res.cols} col, ${res.colors} color set) → ${res.player.score} pts!`,
          res.player.id
        );
      },
      { state: tiledAll.state, events: tiledAll.events }
    );

    const sorted = [...withBonuses.state.players].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.completedRows - a.completedRows
    );
    const winner = sorted[0]!;
    const finishedState: AzulState = {
      ...withBonuses.state,
      winnerId: winner.id,
      phase: "GAME_OVER",
    };
    return appendAzulEvent(
      finishedState,
      withBonuses.events,
      "GAME_OVER",
      `🏆 ${winner.name} wins Azul with ${winner.score} points!`,
      winner.id
    );
  }

  const nextFilled = fillFactoriesPure(
    tiledAll.state.players.length,
    tiledAll.state.bag,
    tiledAll.state.discardLid,
    tiledAll.state.rngState
  );

  return {
    state: {
      ...tiledAll.state,
      round: tiledAll.state.round + 1,
      turn: tiledAll.state.turn + 1,
      activePlayerIndex: tiledAll.state.nextRoundStartPlayerIndex,
      factories: nextFilled.factories,
      centerPool: [],
      centerHasFirstPlayerMarker: true,
      bag: nextFilled.bag,
      discardLid: nextFilled.discardLid,
      rngState: nextFilled.rngState,
    },
    events: tiledAll.events,
  };
}
