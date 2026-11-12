import {
  type GameEvent,
  type InvariantCheckResult,
  type PlayerDescriptor,
  SeededRNG,
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
  type PatternLineState,
} from "./types.ts";

export function getFactoryCount(playerCount: number): number {
  if (playerCount === 2) return 5;
  if (playerCount === 3) return 7;
  return 9;
}

export function getWallColumnForColor(row: number, color: AzulTileColor): number {
  return AZUL_WALL_PATTERN[row]!.indexOf(color);
}

export function isColorOnWallRow(
  wall: (AzulTileColor | null)[][],
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
  const wall: (AzulTileColor | null)[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => null)
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

function fillFactoriesFromBag(state: AzulState, rng: SeededRNG): void {
  const factoryCount = getFactoryCount(state.players.length);
  state.factories = Array.from({ length: factoryCount }, () => []);

  for (let f = 0; f < factoryCount; f++) {
    for (let t = 0; t < 4; t++) {
      if (state.bag.length === 0 && state.discardLid.length > 0) {
        state.bag = rng.shuffle(state.discardLid);
        state.discardLid = [];
      }
      if (state.bag.length > 0) {
        state.factories[f]!.push(state.bag.pop()!);
      }
    }
  }
  state.centerPool = [];
  state.centerHasFirstPlayerMarker = true;
}

export function initAzulGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<AzulConfig>,
  seed: number | string = Date.now()
): AzulState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Azul requires 2 to 4 players");
  }

  const rng = new SeededRNG(seed);
  const allTiles: AzulTileColor[] = [];
  for (const color of AZUL_COLORS) {
    for (let i = 0; i < 20; i++) {
      allTiles.push(color);
    }
  }

  const bag = rng.shuffle(allTiles);
  const playerStates = players.map(createEmptyPlayer);
  const startingPlayerIndex =
    typeof config?.startingPlayerIndex === "number" &&
    Number.isFinite(config.startingPlayerIndex)
      ? ((Math.trunc(config.startingPlayerIndex) % playerStates.length) +
          playerStates.length) %
        playerStates.length
      : config?.randomizeStartingPlayer
        ? rng.nextInt(0, playerStates.length - 1)
        : 0;

  const state: AzulState = {
    gameId: "azul",
    config: {
      maxRounds: config?.maxRounds ?? 15,
      startingPlayerIndex: config?.startingPlayerIndex,
      randomizeStartingPlayer: config?.randomizeStartingPlayer,
    },
    rngState: rng.getState(),
    turn: 1,
    round: 1,
    phase: "FACTORY_OFFER",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    nextRoundStartPlayerIndex: startingPlayerIndex,
    players: playerStates,
    factories: [],
    centerPool: [],
    centerHasFirstPlayerMarker: true,
    bag,
    discardLid: [],
    winnerId: null,
    eventLog: [],
  };

  fillFactoriesFromBag(state, rng);
  state.rngState = rng.getState();
  state.eventLog.push({
    id: "evt-0",
    timestamp: 0,
    turn: 1,
    type: "GAME_STARTED",
    message: `Azul started with ${players.length} players and ${state.factories.length} Factory Displays (${playerStates[startingPlayerIndex]!.name} goes first).`,
  });

  return state;
}

export function getAzulLegalActions(
  state: AzulState,
  playerId: string
): AzulAction[] {
  if (state.phase === "GAME_OVER") return [];
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (activePlayer.id !== playerId) return [];

  const actions: AzulAction[] = [];
  const targetLines: AzulTargetLine[] = [0, 1, 2, 3, 4, "floor"];

  // 1. Draft from each non-empty Factory
  for (let fIdx = 0; fIdx < state.factories.length; fIdx++) {
    const factory = state.factories[fIdx]!;
    if (factory.length === 0) continue;
    const distinctColors = Array.from(new Set(factory));
    for (const color of distinctColors) {
      for (const targetLine of targetLines) {
        if (
          targetLine === "floor" ||
          canPlaceColorOnPatternLine(activePlayer, targetLine, color)
        ) {
          actions.push({
            type: "DRAFT_TILES",
            source: { kind: "factory", factoryIndex: fIdx },
            color,
            targetLine,
          });
        }
      }
    }
  }

  // 2. Draft from Center Pool
  if (state.centerPool.length > 0) {
    const distinctColors = Array.from(new Set(state.centerPool));
    for (const color of distinctColors) {
      for (const targetLine of targetLines) {
        if (
          targetLine === "floor" ||
          canPlaceColorOnPatternLine(activePlayer, targetLine, color)
        ) {
          actions.push({
            type: "DRAFT_TILES",
            source: { kind: "center" },
            color,
            targetLine,
          });
        }
      }
    }
  }

  return actions;
}

function pushEvent(
  state: AzulState,
  emitted: GameEvent[],
  type: string,
  message: string,
  playerId?: string
): void {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
  };
  state.eventLog.push(evt);
  emitted.push(evt);
}

/**
 * Computes points earned immediately when placing a tile at `(row, col)` on `wall`.
 */
export function scoreWallPlacement(
  wall: (AzulTileColor | null)[][],
  row: number,
  col: number
): number {
  let horizChain = 1;
  for (let c = col - 1; c >= 0 && wall[row]![c] !== null; c--) horizChain++;
  for (let c = col + 1; c < 5 && wall[row]![c] !== null; c++) horizChain++;

  let vertChain = 1;
  for (let r = row - 1; r >= 0 && wall[r]![col] !== null; r--) vertChain++;
  for (let r = row + 1; r < 5 && wall[r]![col] !== null; r++) vertChain++;

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
  const state = structuredClone(currentState);
  const emitted: GameEvent[] = [];
  const rng = SeededRNG.fromState(state.rngState);

  const player = state.players[state.activePlayerIndex]!;
  if (player.id !== playerId || state.phase !== "FACTORY_OFFER") {
    throw new Error("Not your turn");
  }

  // Extract drafted tiles from source
  let draftedCount = 0;
  let tookFirstPlayerMarker = false;

  if (action.source.kind === "factory") {
    const factory = state.factories[action.source.factoryIndex];
    if (!factory || factory.length === 0) {
      throw new Error("Selected factory is empty");
    }
    const matching = factory.filter((c) => c === action.color);
    if (matching.length === 0) {
      throw new Error(`Factory has no ${action.color} tiles`);
    }
    draftedCount = matching.length;
    const remainder = factory.filter((c) => c !== action.color);
    state.centerPool.push(...remainder);
    state.factories[action.source.factoryIndex] = [];
  } else {
    const matching = state.centerPool.filter((c) => c === action.color);
    if (matching.length === 0) {
      throw new Error(`Center pool has no ${action.color} tiles`);
    }
    draftedCount = matching.length;
    state.centerPool = state.centerPool.filter((c) => c !== action.color);

    if (state.centerHasFirstPlayerMarker) {
      state.centerHasFirstPlayerMarker = false;
      state.nextRoundStartPlayerIndex = state.activePlayerIndex;
      tookFirstPlayerMarker = true;
      if (player.floorLine.length < 7) {
        player.floorLine.push("first_player");
      }
    }
  }

  // Place tiles onto target Pattern Line or Floor Line
  if (action.targetLine === "floor") {
    for (let i = 0; i < draftedCount; i++) {
      if (player.floorLine.length < 7) {
        player.floorLine.push(action.color);
      } else {
        state.discardLid.push(action.color);
      }
    }
  } else {
    if (!canPlaceColorOnPatternLine(player, action.targetLine, action.color)) {
      throw new Error(`Cannot place ${action.color} on pattern line ${action.targetLine + 1}`);
    }
    const line = player.patternLines[action.targetLine];
    line.color = action.color;
    const space = line.capacity - line.count;
    const placed = Math.min(space, draftedCount);
    line.count += placed;
    const overflow = draftedCount - placed;

    for (let i = 0; i < overflow; i++) {
      if (player.floorLine.length < 7) {
        player.floorLine.push(action.color);
      } else {
        state.discardLid.push(action.color);
      }
    }
  }

  const srcDesc =
    action.source.kind === "factory"
      ? `Factory #${action.source.factoryIndex + 1}`
      : "Center Pool";
  const destDesc =
    action.targetLine === "floor"
      ? "Floor Line"
      : `Pattern Row ${action.targetLine + 1}`;
  pushEvent(
    state,
    emitted,
    "TILES_DRAFTED",
    `${player.name} drafted ${draftedCount} ${action.color} from ${srcDesc} → ${destDesc}${
      tookFirstPlayerMarker ? " (+1st Player token)" : ""
    }.`,
    playerId
  );

  // Check if all factories and center pool are now empty -> trigger Wall-Tiling phase!
  const allFactoriesEmpty = state.factories.every((f) => f.length === 0);
  if (allFactoriesEmpty && state.centerPool.length === 0) {
    resolveWallTilingAndEndOfRound(state, rng, emitted);
  } else {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
    state.turn++;
  }

  state.rngState = rng.getState();
  return { state, events: emitted };
}

function resolveWallTilingAndEndOfRound(
  state: AzulState,
  rng: SeededRNG,
  emitted: GameEvent[]
): void {
  let completedRowTriggered = false;

  for (const p of state.players) {
    let roundPointsGained = 0;

    for (let r = 0; r < 5; r++) {
      const line = p.patternLines[r as 0 | 1 | 2 | 3 | 4];
      if (line.count === line.capacity && line.color !== null) {
        const tileColor = line.color;
        const col = getWallColumnForColor(r, tileColor);
        p.wall[r]![col] = tileColor;

        const pts = scoreWallPlacement(p.wall, r, col);
        p.score += pts;
        roundPointsGained += pts;

        // Remaining (capacity - 1) tiles go to discardLid
        for (let d = 0; d < line.capacity - 1; d++) {
          state.discardLid.push(tileColor);
        }

        line.color = null;
        line.count = 0;
      }
    }

    // Apply Floor Line penalties
    let penalty = 0;
    for (let i = 0; i < Math.min(7, p.floorLine.length); i++) {
      penalty += FLOOR_PENALTIES[i]!;
    }
    for (const token of p.floorLine) {
      if (token !== "first_player") {
        state.discardLid.push(token);
      }
    }
    p.floorLine = [];
    p.score = Math.max(0, p.score + penalty);

    // Count completed horizontal rows
    let rowsDone = 0;
    for (let r = 0; r < 5; r++) {
      if (p.wall[r]!.every((cell) => cell !== null)) {
        rowsDone++;
      }
    }
    p.completedRows = rowsDone;
    if (rowsDone > 0) {
      completedRowTriggered = true;
    }

    pushEvent(
      state,
      emitted,
      "WALL_TILED",
      `Round ${state.round} Wall-Tiling: ${p.name} +${roundPointsGained} pts${
        penalty < 0 ? `, ${penalty} floor penalty` : ""
      } (Total: ${p.score}).`,
      p.id
    );
  }

  // Check if game ends
  const noTilesLeft = state.bag.length === 0 && state.discardLid.length === 0;
  if (
    completedRowTriggered ||
    noTilesLeft ||
    state.round >= state.config.maxRounds
  ) {
    // Award Endgame Bonuses (+2 per row, +7 per col, +10 per 5-of-a-color)
    for (const p of state.players) {
      let rows = 0;
      let cols = 0;
      let colors = 0;

      for (let r = 0; r < 5; r++) {
        if (p.wall[r]!.every((c) => c !== null)) rows++;
      }
      for (let c = 0; c < 5; c++) {
        let fullCol = true;
        for (let r = 0; r < 5; r++) {
          if (p.wall[r]![c] === null) fullCol = false;
        }
        if (fullCol) cols++;
      }
      for (const color of AZUL_COLORS) {
        let countColor = 0;
        for (let r = 0; r < 5; r++) {
          for (let c = 0; c < 5; c++) {
            if (p.wall[r]![c] === color) countColor++;
          }
        }
        if (countColor === 5) colors++;
      }

      p.completedRows = rows;
      p.completedCols = cols;
      p.completedColorSets = colors;
      const bonus = rows * 2 + cols * 7 + colors * 10;
      p.score += bonus;

      if (bonus > 0) {
        pushEvent(
          state,
          emitted,
          "ENDGAME_BONUS",
          `${p.name} earned +${bonus} Endgame Bonus (${rows} row, ${cols} col, ${colors} color set) → ${p.score} pts!`,
          p.id
        );
      }
    }

    const sorted = [...state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.completedRows - a.completedRows;
    });
    const winner = sorted[0]!;
    state.winnerId = winner.id;
    state.phase = "GAME_OVER";
    pushEvent(
      state,
      emitted,
      "GAME_OVER",
      `🏆 ${winner.name} wins Azul with ${winner.score} points!`,
      winner.id
    );
    return;
  }

  // Prepare next round
  state.round++;
  state.turn++;
  state.activePlayerIndex = state.nextRoundStartPlayerIndex;
  fillFactoriesFromBag(state, rng);
}

export function checkAzulInvariants(state: AzulState): InvariantCheckResult {
  const violations: string[] = [];

  // 1. Total conservation of the 100 ceramic tiles (20 of each of the 5 colors)
  const counts: Record<AzulTileColor, number> = {
    blue: 0,
    yellow: 0,
    red: 0,
    black: 0,
    teal: 0,
  };

  for (const c of state.bag) counts[c]++;
  for (const c of state.discardLid) counts[c]++;
  for (const f of state.factories) {
    for (const c of f) counts[c]++;
  }
  for (const c of state.centerPool) counts[c]++;

  for (const p of state.players) {
    if (p.score < 0) {
      violations.push(`Player ${p.id} has negative score: ${p.score}`);
    }
    for (let r = 0; r < 5; r++) {
      const line = p.patternLines[r as 0 | 1 | 2 | 3 | 4];
      if (line.count > line.capacity) {
        violations.push(`Player ${p.id} pattern line ${r} exceeds capacity`);
      }
      if (line.color && line.count > 0) {
        counts[line.color] += line.count;
        if (isColorOnWallRow(p.wall, r, line.color)) {
          violations.push(
            `Player ${p.id} pattern line ${r} holds ${line.color} which is already on wall row ${r}`
          );
        }
      }
      for (let c = 0; c < 5; c++) {
        const wColor = p.wall[r]![c];
        if (wColor !== null) {
          counts[wColor]++;
        }
      }
    }
    for (const fToken of p.floorLine) {
      if (fToken !== "first_player") {
        counts[fToken]++;
      }
    }
  }

  for (const color of AZUL_COLORS) {
    if (counts[color] !== 20) {
      violations.push(`Tile conservation violated for ${color}: found ${counts[color]} !== 20`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
