import {
  type GameEvent,
  type InvariantCheckResult,
  type PlayerDescriptor,
  type RngState,
  createRngState,
  nextIntPure,
  normalizeRngState,
  shufflePure,
} from "@gaming-platform/core";
import {
  AZUL_COLORS,
  AZUL_WALL_PATTERN,
  type AzulAction,
  type AzulConfig,
  type AzulPlayerState,
  type AzulState,
  type AzulTargetLine,
  type AzulTileColor,
  FLOOR_PENALTIES,
  type FloorToken,
  type PatternLineState,
} from "./types.ts";

const ROW_INDICES = [0, 1, 2, 3, 4] as const;
const COL_INDICES = [0, 1, 2, 3, 4] as const;
const TARGET_LINES: readonly AzulTargetLine[] = [0, 1, 2, 3, 4, "floor"];

export function getFactoryCount(playerCount: number): number {
  if (playerCount === 2) return 5;
  if (playerCount === 3) return 7;
  return 9;
}

export function getWallColumnForColor(row: number, color: AzulTileColor): number {
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

function createEmptyPlayer(p: PlayerDescriptor): AzulPlayerState {
  const patternLines: [
    PatternLineState,
    PatternLineState,
    PatternLineState,
    PatternLineState,
    PatternLineState,
  ] = [
    { capacity: 1, color: null, count: 0 },
    { capacity: 2, color: null, count: 0 },
    { capacity: 3, color: null, count: 0 },
    { capacity: 4, color: null, count: 0 },
    { capacity: 5, color: null, count: 0 },
  ];
  const wall: (AzulTileColor | null)[][] = ROW_INDICES.map(() =>
    COL_INDICES.map(() => null)
  );
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: Boolean(p.isBot),
    botDifficulty: p.botDifficulty ?? "smart",
    score: 0,
    patternLines,
    wall,
    floorLine: [],
    completedRows: 0,
    completedCols: 0,
    completedColorSets: 0,
  };
}

function setWallCell(
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

function setPatternLineAt(
  lines: AzulPlayerState["patternLines"],
  row: 0 | 1 | 2 | 3 | 4,
  updated: PatternLineState
): AzulPlayerState["patternLines"] {
  return lines.map((l, idx) =>
    idx === row ? updated : l
  ) as AzulPlayerState["patternLines"];
}

function appendFloorOverflow(
  floorLine: readonly FloorToken[],
  discardLid: readonly AzulTileColor[],
  color: AzulTileColor,
  count: number
): { floorLine: FloorToken[]; discardLid: AzulTileColor[] } {
  const freeFloorSlots = Math.max(0, 7 - floorLine.length);
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

function appendAzulEvent(
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

function fillFactoriesPure(
  playerCount: number,
  bag: readonly AzulTileColor[],
  discardLid: readonly AzulTileColor[],
  rngState: RngState
): {
  factories: AzulTileColor[][];
  bag: AzulTileColor[];
  discardLid: AzulTileColor[];
  rngState: RngState;
} {
  const factoryCount = getFactoryCount(playerCount);
  const factoryIndices = Array.from({ length: factoryCount }, (_, idx) => idx);
  const fourSlots = [0, 1, 2, 3] as const;

  return factoryIndices.reduce<{
    factories: AzulTileColor[][];
    bag: AzulTileColor[];
    discardLid: AzulTileColor[];
    rngState: RngState;
  }>(
    (outerAcc) => {
      const filledOne = fourSlots.reduce<{
        tiles: AzulTileColor[];
        bag: AzulTileColor[];
        discardLid: AzulTileColor[];
        rngState: RngState;
      }>(
        (slotAcc) => {
          const refilled =
            slotAcc.bag.length === 0 && slotAcc.discardLid.length > 0
              ? (() => {
                  const [shuffled, nextRng] = shufflePure(
                    slotAcc.rngState,
                    slotAcc.discardLid
                  );
                  return {
                    bag: shuffled,
                    discardLid: [] as AzulTileColor[],
                    rngState: nextRng,
                  };
                })()
              : {
                  bag: slotAcc.bag,
                  discardLid: slotAcc.discardLid,
                  rngState: slotAcc.rngState,
                };

          if (refilled.bag.length === 0) {
            return {
              tiles: slotAcc.tiles,
              bag: refilled.bag,
              discardLid: refilled.discardLid,
              rngState: refilled.rngState,
            };
          }

          const drawn = refilled.bag[refilled.bag.length - 1]!;
          return {
            tiles: [...slotAcc.tiles, drawn],
            bag: refilled.bag.slice(0, -1),
            discardLid: refilled.discardLid,
            rngState: refilled.rngState,
          };
        },
        {
          tiles: [],
          bag: outerAcc.bag,
          discardLid: outerAcc.discardLid,
          rngState: outerAcc.rngState,
        }
      );

      return {
        factories: [...outerAcc.factories, filledOne.tiles],
        bag: filledOne.bag,
        discardLid: filledOne.discardLid,
        rngState: filledOne.rngState,
      };
    },
    {
      factories: [],
      bag: [...bag],
      discardLid: [...discardLid],
      rngState,
    }
  );
}

export function initAzulGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<AzulConfig>,
  seed: number | string = Date.now()
): AzulState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Azul requires 2 to 4 players");
  }

  const rng0 = createRngState(seed);
  const allTiles: AzulTileColor[] = AZUL_COLORS.flatMap((color) =>
    Array.from({ length: 20 }, () => color)
  );

  const [shuffledBag, rng1] = shufflePure(rng0, allTiles);
  const playerStates = players.map(createEmptyPlayer);

  const [startingPlayerIndex, rng2] =
    typeof config?.startingPlayerIndex === "number" &&
    Number.isFinite(config.startingPlayerIndex)
      ? [
          ((Math.trunc(config.startingPlayerIndex) % playerStates.length) +
            playerStates.length) %
            playerStates.length,
          rng1,
        ]
      : config?.randomizeStartingPlayer
        ? nextIntPure(rng1, 0, playerStates.length - 1)
        : [0, rng1];

  const filled = fillFactoriesPure(players.length, shuffledBag, [], rng2);

  return {
    gameId: "azul",
    config: {
      maxRounds: config?.maxRounds ?? 15,
      startingPlayerIndex: config?.startingPlayerIndex,
      randomizeStartingPlayer: config?.randomizeStartingPlayer,
    },
    rngState: filled.rngState,
    turn: 1,
    round: 1,
    phase: "FACTORY_OFFER",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    nextRoundStartPlayerIndex: startingPlayerIndex,
    players: playerStates,
    factories: filled.factories,
    centerPool: [],
    centerHasFirstPlayerMarker: true,
    bag: filled.bag,
    discardLid: filled.discardLid,
    winnerId: null,
    eventLog: [
      {
        id: "evt-0",
        timestamp: 0,
        turn: 1,
        type: "GAME_STARTED",
        message: `Azul started with ${players.length} players and ${filled.factories.length} Factory Displays (${playerStates[startingPlayerIndex]!.name} goes first).`,
      },
    ],
  };
}

export function getAzulLegalActions(
  state: AzulState,
  playerId: string
): AzulAction[] {
  if (state.phase === "GAME_OVER") return [];
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (activePlayer.id !== playerId) return [];

  const factoryActions: AzulAction[] = state.factories.flatMap(
    (factory, fIdx) => {
      if (factory.length === 0) return [];
      const distinctColors = Array.from(new Set(factory));
      return distinctColors.flatMap((color) =>
        TARGET_LINES.filter(
          (targetLine) =>
            targetLine === "floor" ||
            canPlaceColorOnPatternLine(activePlayer, targetLine, color)
        ).map(
          (targetLine): AzulAction => ({
            type: "DRAFT_TILES",
            source: { kind: "factory", factoryIndex: fIdx },
            color,
            targetLine,
          })
        )
      );
    }
  );

  const centerActions: AzulAction[] =
    state.centerPool.length > 0
      ? Array.from(new Set(state.centerPool)).flatMap((color) =>
          TARGET_LINES.filter(
            (targetLine) =>
              targetLine === "floor" ||
              canPlaceColorOnPatternLine(activePlayer, targetLine, color)
          ).map(
            (targetLine): AzulAction => ({
              type: "DRAFT_TILES",
              source: { kind: "center" },
              color,
              targetLine,
            })
          )
        )
      : [];

  return [...factoryActions, ...centerActions];
}

function countContiguous(
  start: number,
  step: -1 | 1,
  isOccupied: (idx: number) => boolean
): number {
  const next = start + step;
  if (next < 0 || next >= 5 || !isOccupied(next)) {
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
      tookMarker && player.floorLine.length < 7
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
    .slice(0, 7)
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
      ) === 5
  ).length;

  const bonus = rows * 2 + cols * 7 + colors * 10;
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

function resolveWallTilingAndEndOfRoundPure(
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
    (color) => totalCounts[color] !== 20
  ).map(
    (color) =>
      `Tile conservation violated for ${color}: found ${totalCounts[color]} !== 20`
  );

  const violations = [...playerViolations, ...conservationViolations];
  return {
    valid: violations.length === 0,
    violations,
  };
}
