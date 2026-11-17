import { type GameEvent, normalizeRngState } from "@gaming-platform/core";
import { AZUL_FLOOR_CAPACITY } from "../config.ts";
import type {
  AzulAction,
  AzulPlayerState,
  AzulState,
  FloorToken,
  PatternLineState,
} from "../types.ts";
import {
  appendAzulEvent,
  appendFloorOverflow,
  canPlaceColorOnPatternLine,
  setPatternLineAt,
} from "./helpers.ts";
import { resolveWallTilingAndEndOfRoundPure } from "./scoring.ts";

export function applyAzulAction(
  currentState: AzulState,
  playerId: string,
  action: AzulAction
): { state: AzulState; events: GameEvent[] } {
  const player = currentState.players[currentState.activePlayerIndex]!;
  if (player.id !== playerId || currentState.phase !== "FACTORY_OFFER") {
    throw new Error("Not your turn");
  }

  const draftExtraction = (() => {
    if (action.source.kind === "factory") {
      const fIdx = action.source.factoryIndex;
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
    rngState: normalizeRngState(currentState.rngState),
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
