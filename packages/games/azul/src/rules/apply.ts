import type { GameEvent } from "@gaming-platform/core";
import {
  AZUL_COLORS,
  AZUL_FLOOR_CAPACITY,
  AZUL_WALL_SIZE,
} from "../config.ts";
import type {
  AzulAction,
  AzulDraftSource,
  AzulPlayerState,
  AzulState,
  AzulTargetLine,
  AzulTileColor,
  FloorToken,
  PatternLineState,
} from "../types.ts";
import {
  appendAzulEvent,
  canPlaceColorOnPatternLine,
  setPatternLineAt,
} from "./helpers.ts";
import { resolveWallTilingAndEndOfRoundPure } from "./scoring.ts";

const TARGET_LINES: readonly AzulTargetLine[] = [0, 1, 2, 3, 4, "floor"];

function appendFloorOverflow(
  floorLine: readonly FloorToken[],
  discardLid: readonly AzulTileColor[],
  color: AzulTileColor,
  count: number
): { floorLine: FloorToken[]; discardLid: AzulTileColor[] } {
  const freeFloorSlots = Math.max(0, AZUL_FLOOR_CAPACITY - floorLine.length);
  const toFloor = Math.min(freeFloorSlots, count);
  const toDiscard = Math.max(0, count - toFloor);
  return {
    floorLine: [...floorLine, ...Array.from({ length: toFloor }, () => color)],
    discardLid: [...discardLid, ...Array.from({ length: toDiscard }, () => color)],
  };
}

export function getAzulLegalActions(
  state: AzulState,
  playerId: string
): AzulAction[] {
  if (state.phase === "GAME_OVER") return [];
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (activePlayer.id !== playerId) return [];

  const actionsForSource = (
    tiles: readonly AzulTileColor[],
    source: AzulDraftSource
  ): AzulAction[] =>
    Array.from(new Set(tiles)).flatMap((color) =>
      TARGET_LINES.filter(
        (targetLine) =>
          targetLine === "floor" ||
          canPlaceColorOnPatternLine(activePlayer, targetLine, color)
      ).map((targetLine): AzulAction => ({
        type: "DRAFT_TILES",
        source,
        color,
        targetLine,
      }))
    );

  return [
    ...state.factories.flatMap((factory, factoryIndex) =>
      actionsForSource(factory, { kind: "factory", factoryIndex })
    ),
    ...actionsForSource(state.centerPool, { kind: "center" }),
  ];
}

export function applyAzulAction(
  currentState: AzulState,
  playerId: string,
  action: AzulAction
): { state: AzulState; events: GameEvent[] } {
  const player = currentState.players[currentState.activePlayerIndex]!;
  if (player.id !== playerId || currentState.phase !== "FACTORY_OFFER") {
    throw new Error("Not your turn");
  }
  if (!action || action.type !== "DRAFT_TILES") {
    throw new Error("Invalid Azul action type");
  }
  if (!AZUL_COLORS.includes(action.color)) {
    throw new Error(`Invalid tile color: ${String(action.color)}`);
  }
  if (
    action.targetLine !== "floor" &&
    (typeof action.targetLine !== "number" ||
      !Number.isInteger(action.targetLine) ||
      action.targetLine < 0 ||
      action.targetLine >= AZUL_WALL_SIZE)
  ) {
    throw new Error(`Invalid target pattern line: ${String(action.targetLine)}`);
  }

  const draftExtraction = (() => {
    if (action.source?.kind === "factory") {
      const fIdx = action.source.factoryIndex;
      if (
        typeof fIdx !== "number" ||
        !Number.isInteger(fIdx) ||
        fIdx < 0 ||
        fIdx >= currentState.factories.length
      ) {
        throw new Error(`Invalid factory index: ${String(fIdx)}`);
      }
      const factory = currentState.factories[fIdx];
      if (!factory || factory.length === 0) {
        throw new Error("Selected factory is empty");
      }
      const matching = factory.filter((c) => c === action.color);
      if (matching.length === 0) {
        throw new Error(`Factory has no ${action.color} tiles`);
      }
      const remainder = factory.filter((c) => c !== action.color);
      return {
        draftedCount: matching.length,
        tookFirstPlayerMarker: false,
        factories: currentState.factories.map((f, idx) =>
          idx === fIdx ? [] : [...f]
        ),
        centerPool: [...currentState.centerPool, ...remainder],
        centerHasFirstPlayerMarker: currentState.centerHasFirstPlayerMarker,
        nextRoundStartPlayerIndex: currentState.nextRoundStartPlayerIndex,
        initialFloorLine: [...player.floorLine],
      };
    }

    if (action.source?.kind !== "center") {
      throw new Error("Invalid draft source");
    }

    const matching = currentState.centerPool.filter((c) => c === action.color);
    if (matching.length === 0) {
      throw new Error(`Center pool has no ${action.color} tiles`);
    }
    const tookMarker = currentState.centerHasFirstPlayerMarker;
    const floorWithMarker: FloorToken[] =
      tookMarker && player.floorLine.length < AZUL_FLOOR_CAPACITY
        ? [...player.floorLine, "first_player"]
        : [...player.floorLine];

    return {
      draftedCount: matching.length,
      tookFirstPlayerMarker: tookMarker,
      factories: currentState.factories.map((f) => [...f]),
      centerPool: currentState.centerPool.filter((c) => c !== action.color),
      centerHasFirstPlayerMarker: false,
      nextRoundStartPlayerIndex: tookMarker
        ? currentState.activePlayerIndex
        : currentState.nextRoundStartPlayerIndex,
      initialFloorLine: floorWithMarker,
    };
  })();

  const placement = (() => {
    if (action.targetLine === "floor") {
      const overflowed = appendFloorOverflow(
        draftExtraction.initialFloorLine,
        currentState.discardLid,
        action.color,
        draftExtraction.draftedCount
      );
      return {
        patternLines: player.patternLines,
        floorLine: overflowed.floorLine,
        discardLid: overflowed.discardLid,
      };
    }

    if (!canPlaceColorOnPatternLine(player, action.targetLine, action.color)) {
      throw new Error(
        `Cannot place ${action.color} on pattern line ${action.targetLine + 1}`
      );
    }
    const line = player.patternLines[action.targetLine];
    const space = line.capacity - line.count;
    const placed = Math.min(space, draftExtraction.draftedCount);
    const overflow = draftExtraction.draftedCount - placed;
    const updatedLine: PatternLineState = {
      capacity: line.capacity,
      color: action.color,
      count: line.count + placed,
    };
    const overflowed = appendFloorOverflow(
      draftExtraction.initialFloorLine,
      currentState.discardLid,
      action.color,
      overflow
    );
    return {
      patternLines: setPatternLineAt(
        player.patternLines,
        action.targetLine,
        updatedLine
      ),
      floorLine: overflowed.floorLine,
      discardLid: overflowed.discardLid,
    };
  })();

  const updatedPlayer: AzulPlayerState = {
    ...player,
    patternLines: placement.patternLines,
    floorLine: placement.floorLine,
  };

  const afterDraftState: AzulState = {
    ...currentState,
    rngState: currentState.rngState >>> 0,
    factories: draftExtraction.factories,
    centerPool: draftExtraction.centerPool,
    centerHasFirstPlayerMarker: draftExtraction.centerHasFirstPlayerMarker,
    nextRoundStartPlayerIndex: draftExtraction.nextRoundStartPlayerIndex,
    discardLid: placement.discardLid,
    players: currentState.players.map((p, idx) =>
      idx === currentState.activePlayerIndex ? updatedPlayer : p
    ),
  };

  const srcDesc =
    action.source.kind === "factory"
      ? `Factory #${action.source.factoryIndex + 1}`
      : "Center Pool";
  const destDesc =
    action.targetLine === "floor"
      ? "Floor Line"
      : `Pattern Row ${action.targetLine + 1}`;

  const loggedDraft = appendAzulEvent(
    afterDraftState,
    [],
    "TILES_DRAFTED",
    `${player.name} drafted ${draftExtraction.draftedCount} ${action.color} from ${srcDesc} → ${destDesc}${
      draftExtraction.tookFirstPlayerMarker ? " (+1st Player token)" : ""
    }.`,
    playerId
  );

  const allFactoriesEmpty = loggedDraft.state.factories.every(
    (f) => f.length === 0
  );
  if (allFactoriesEmpty && loggedDraft.state.centerPool.length === 0) {
    return resolveWallTilingAndEndOfRoundPure(
      loggedDraft.state,
      loggedDraft.events
    );
  }

  return {
    state: {
      ...loggedDraft.state,
      activePlayerIndex:
        (loggedDraft.state.activePlayerIndex + 1) %
        loggedDraft.state.players.length,
      turn: loggedDraft.state.turn + 1,
    },
    events: loggedDraft.events,
  };
}
