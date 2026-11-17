import {
  type GameEvent,
  type PlayerDescriptor,
  createRngState,
  nextIntPure,
  shufflePure,
} from "@gaming-platform/core";
import { buildAgeDeckPure } from "../cards/deck-builder.ts";
import {
  DEFAULT_SEVEN_WONDERS_COLORS,
  SEVEN_WONDERS_COINS_PER_TREASURY_VP,
  SEVEN_WONDERS_DEFAULT_SEED,
  SEVEN_WONDERS_MAX_PLAYERS,
  SEVEN_WONDERS_MIN_PLAYERS,
  SEVEN_WONDERS_PASS_DIRECTION_BY_AGE,
  SEVEN_WONDERS_STARTING_COINS,
} from "../config/game-config.ts";
import {
  ALL_WONDER_IDS,
  getWonderBoardDefinition,
} from "../config/wonders-config.ts";
import type {
  SevenWondersConfig,
  SevenWondersPlayerState,
  SevenWondersScoreBreakdown,
  SevenWondersState,
  WonderId,
  WonderSide,
} from "../types.ts";
import { dealHandsToPlayers } from "./helpers.ts";
import { refreshAllPlayerScores } from "./scoring.ts";

export function initSevenWondersGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<SevenWondersConfig>,
  seed: number | string = SEVEN_WONDERS_DEFAULT_SEED
): SevenWondersState {
  if (
    players.length < SEVEN_WONDERS_MIN_PLAYERS ||
    players.length > SEVEN_WONDERS_MAX_PLAYERS
  ) {
    throw new Error(
      `7 Wonders requires ${SEVEN_WONDERS_MIN_PLAYERS} to ${SEVEN_WONDERS_MAX_PLAYERS} players, received ${players.length}`
    );
  }

  const resolvedConfig: SevenWondersConfig = {
    wonderSideMode: config?.wonderSideMode ?? "random",
    startingPlayerIndex: config?.startingPlayerIndex,
    randomizeStartingPlayer: config?.randomizeStartingPlayer ?? false,
  };

  let rng = createRngState(seed);

  const [startingPlayerIndex, rngAfterStarter] = (() => {
    if (
      typeof resolvedConfig.startingPlayerIndex === "number" &&
      resolvedConfig.startingPlayerIndex >= 0 &&
      resolvedConfig.startingPlayerIndex < players.length
    ) {
      return [resolvedConfig.startingPlayerIndex, rng] as const;
    }
    if (resolvedConfig.randomizeStartingPlayer) {
      return nextIntPure(rng, 0, players.length - 1);
    }
    return [0, rng] as const;
  })();
  rng = rngAfterStarter;

  const [shuffledWonders, rngAfterWonders] = shufflePure(rng, ALL_WONDER_IDS);
  rng = rngAfterWonders;

  const initialTreasuryVp = Math.floor(
    SEVEN_WONDERS_STARTING_COINS / SEVEN_WONDERS_COINS_PER_TREASURY_VP
  );

  const initialPlayersDraft: SevenWondersPlayerState[] = [];
  for (let idx = 0; idx < players.length; idx++) {
    const desc = players[idx]!;
    const wonderId: WonderId = shuffledWonders[idx]!;
    let wonderSide: WonderSide = "A";
    if (resolvedConfig.wonderSideMode === "night") {
      wonderSide = "B";
    } else if (resolvedConfig.wonderSideMode === "random") {
      const [sidePick, nextRng] = nextIntPure(rng, 0, 1);
      rng = nextRng;
      wonderSide = sidePick === 0 ? "A" : "B";
    }

    const board = getWonderBoardDefinition(wonderId, wonderSide);
    const emptyBreakdown: SevenWondersScoreBreakdown = {
      militaryVp: 0,
      treasuryVp: initialTreasuryVp,
      wonderVp: 0,
      civilianVp: 0,
      scientificVp: 0,
      commercialVp: 0,
      guildVp: 0,
      totalVp: initialTreasuryVp,
      coinsTiebreaker: SEVEN_WONDERS_STARTING_COINS,
      scienceCounts: { compass: 0, gear: 0, tablet: 0 },
      copiedGuildName: null,
    };

    initialPlayersDraft.push({
      id: desc.id,
      name: desc.name,
      color:
        desc.color ||
        DEFAULT_SEVEN_WONDERS_COLORS[idx % DEFAULT_SEVEN_WONDERS_COLORS.length]!,
      isBot: Boolean(desc.isBot),
      botDifficulty: desc.botDifficulty ?? "smart",
      wonderId,
      wonderSide,
      startingResource: board.startingResource,
      coins: SEVEN_WONDERS_STARTING_COINS,
      builtWonderStages: 0,
      tuckedWonderCardIds: [],
      tableau: [],
      hand: [],
      militaryTokens: [],
      usedFreeBuildInAge: { 1: false, 2: false, 3: false },
      scoreBreakdown: emptyBreakdown,
    });
  }

  const age1Build = buildAgeDeckPure(rng, 1, players.length);
  const age2Build = buildAgeDeckPure(age1Build.rngState, 2, players.length);
  const age3Build = buildAgeDeckPure(age2Build.rngState, 3, players.length);
  rng = age3Build.rngState;

  const dealtPlayers = refreshAllPlayerScores(
    dealHandsToPlayers(initialPlayersDraft, age1Build.deck)
  );

  const initEvt: GameEvent = {
    id: "evt-0",
    timestamp: 0,
    turn: 1,
    type: "GAME_INIT",
    message: `Age I begins across ${players.length} civilizations (passing clockwise).`,
  };

  return {
    gameId: "seven_wonders",
    config: resolvedConfig,
    phase: "AGE_DRAFT",
    age: 1,
    draftRound: 1,
    turn: 1,
    passDirection: SEVEN_WONDERS_PASS_DIRECTION_BY_AGE[1],
    startingPlayerIndex,
    players: dealtPlayers,
    pendingChoices: {},
    lockedPlayerIds: [],
    seventhCardQueue: [],
    halikarnassusQueue: [],
    discardPile: [],
    ageDecks: {
      2: age2Build.deck,
      3: age3Build.deck,
    },
    rngState: rng,
    winnerId: null,
    eventLog: [initEvt],
  };
}
