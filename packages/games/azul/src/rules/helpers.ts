import type { GameEvent } from "@gaming-platform/core";
import {
  AZUL_FACTORY_COUNTS_BY_PLAYER,
  AZUL_FLOOR_CAPACITY,
  AZUL_WALL_PATTERN,
} from "../config.ts";
import type {
  AzulPlayerState,
  AzulState,
  AzulTargetLine,
  AzulTileColor,
  FloorToken,
  PatternLineState,
} from "../types.ts";

export const ROW_INDICES = [0, 1, 2, 3, 4] as const;
export const COL_INDICES = [0, 1, 2, 3, 4] as const;
export const TARGET_LINES: readonly AzulTargetLine[] = [0, 1, 2, 3, 4, "floor"];

export function getFactoryCount(playerCount: number): number {
  return AZUL_FACTORY_COUNTS_BY_PLAYER[playerCount] ?? 9;
}

export function getWallColumnForColor(
  row: number,
  color: AzulTileColor
): number {
  return AZUL_WALL_PATTERN[row]!.indexOf(color);
}

export function isColorOnWallRow(
  wall: readonly (readonly (AzulTileColor | null)[])[],
  row: number,
  color: AzulTileColor
): boolean {
  const col = getWallColumnForColor(row, color);
  return wall[row]![col] === color;
}

export function canPlaceColorOnPatternLine(
  player: AzulPlayerState,
  row: 0 | 1 | 2 | 3 | 4,
  color: AzulTileColor
): boolean {
  const line = player.patternLines[row];
  if (line.count >= line.capacity) return false;
  if (line.color !== null && line.color !== color) return false;
  if (isColorOnWallRow(player.wall, row, color)) return false;
  return true;
}

export function setWallCell(
  wall: readonly (readonly (AzulTileColor | null)[])[],
  row: number,
  col: number,
  color: AzulTileColor
): (AzulTileColor | null)[][] {
  return wall.map((rCells, rIdx) =>
    rIdx === row
      ? rCells.map((cell, cIdx) => (cIdx === col ? color : cell))
      : [...rCells]
  );
}

export function setPatternLineAt(
  lines: AzulPlayerState["patternLines"],
  row: 0 | 1 | 2 | 3 | 4,
  updated: PatternLineState
): AzulPlayerState["patternLines"] {
  return lines.map((l, idx) =>
    idx === row ? updated : l
  ) as AzulPlayerState["patternLines"];
}

export function appendFloorOverflow(
  floorLine: readonly FloorToken[],
  discardLid: readonly AzulTileColor[],
  color: AzulTileColor,
  count: number
): { floorLine: FloorToken[]; discardLid: AzulTileColor[] } {
  const freeFloorSlots = Math.max(0, AZUL_FLOOR_CAPACITY - floorLine.length);
  const toFloor = Math.min(freeFloorSlots, count);
  const toDiscard = Math.max(0, count - toFloor);
  return {
    floorLine: [
      ...floorLine,
      ...Array.from({ length: toFloor }, () => color),
    ],
    discardLid: [
      ...discardLid,
      ...Array.from({ length: toDiscard }, () => color),
    ],
  };
}

export function appendAzulEvent(
  state: AzulState,
  events: readonly GameEvent[],
  type: string,
  message: string,
  playerId?: string
): { state: AzulState; events: GameEvent[] } {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
  };
  return {
    state: { ...state, eventLog: [...state.eventLog, evt] },
    events: [...events, evt],
  };
}
