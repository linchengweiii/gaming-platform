import {
  type PlayerDescriptor,
  type RngState,
  createRngState,
  nextIntPure,
  shufflePure,
} from "@gaming-platform/core";
import {
  AZUL_COLORS,
  AZUL_DEFAULT_MAX_ROUNDS,
  AZUL_TILES_PER_COLOR,
  AZUL_TILES_PER_FACTORY,
} from "../config.ts";
import type {
  AzulConfig,
  AzulPlayerState,
  AzulState,
  AzulTileColor,
  PatternLineState,
} from "../types.ts";
import { COL_INDICES, ROW_INDICES, getFactoryCount } from "./helpers.ts";

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

export function fillFactoriesPure(
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
  let curBag = [...bag];
  let curDiscard = [...discardLid];
  let curRng = rngState;
  const factories: AzulTileColor[][] = [];

  for (let f = 0; f < factoryCount; f++) {
    const tiles: AzulTileColor[] = [];
    for (let s = 0; s < AZUL_TILES_PER_FACTORY; s++) {
      if (curBag.length === 0 && curDiscard.length > 0) {
        const [shuffled, nextRng] = shufflePure(curRng, curDiscard);
        curBag = shuffled;
        curDiscard = [];
        curRng = nextRng;
      }
      if (curBag.length === 0) break;
      tiles.push(curBag.pop()!);
    }
    factories.push(tiles);
  }

  return { factories, bag: curBag, discardLid: curDiscard, rngState: curRng };
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
    Array.from({ length: AZUL_TILES_PER_COLOR }, () => color)
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
      maxRounds: config?.maxRounds ?? AZUL_DEFAULT_MAX_ROUNDS,
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
