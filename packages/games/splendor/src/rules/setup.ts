import {
  type PlayerDescriptor,
  createRngState,
  nextIntPure,
  shufflePure,
} from "@gaming-platform/core";
import { SPLENDOR_CARDS, SPLENDOR_NOBLES } from "../cards.ts";
import {
  SPLENDOR_DEFAULT_MAX_TURNS,
  SPLENDOR_GOLD_COUNT,
  SPLENDOR_MARKET_SIZE_PER_TIER,
  SPLENDOR_TARGET_PRESTIGE_POINTS,
} from "../config.ts";
import type {
  CardTier,
  SplendorCard,
  SplendorConfig,
  SplendorPlayerState,
  SplendorState,
  TokenMap,
} from "../types.ts";
import {
  emptyGemMap,
  emptyTokenMap,
  getInitialGemBankCount,
} from "./helpers.ts";

export function initSplendorGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<SplendorConfig>,
  seed: number | string = Date.now()
): SplendorState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Splendor requires 2 to 4 players");
  }

  const rng0 = createRngState(seed);
  const resolvedConfig: SplendorConfig = {
    targetPoints: config?.targetPoints ?? SPLENDOR_TARGET_PRESTIGE_POINTS,
    maxTurns: config?.maxTurns ?? SPLENDOR_DEFAULT_MAX_TURNS,
    startingPlayerIndex: config?.startingPlayerIndex,
    randomizeStartingPlayer: config?.randomizeStartingPlayer,
  };

  const gemCount = getInitialGemBankCount(players.length);
  const bank: TokenMap = {
    emerald: gemCount,
    diamond: gemCount,
    sapphire: gemCount,
    onyx: gemCount,
    ruby: gemCount,
    gold: SPLENDOR_GOLD_COUNT,
  };

  const [tier1All, rng1] = shufflePure(
    rng0,
    SPLENDOR_CARDS.filter((c) => c.tier === 1)
  );
  const [tier2All, rng2] = shufflePure(
    rng1,
    SPLENDOR_CARDS.filter((c) => c.tier === 2)
  );
  const [tier3All, rng3] = shufflePure(
    rng2,
    SPLENDOR_CARDS.filter((c) => c.tier === 3)
  );
  const [shuffledNobles, rng4] = shufflePure(rng3, SPLENDOR_NOBLES);

  const mSize = SPLENDOR_MARKET_SIZE_PER_TIER;
  const market: Record<CardTier, SplendorCard[]> = {
    1: tier1All.slice(0, mSize),
    2: tier2All.slice(0, mSize),
    3: tier3All.slice(0, mSize),
  };

  const decks: Record<CardTier, SplendorCard[]> = {
    1: tier1All.slice(mSize),
    2: tier2All.slice(mSize),
    3: tier3All.slice(mSize),
  };

  const nobles = shuffledNobles.slice(0, players.length + 1);

  const playerStates: SplendorPlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: Boolean(p.isBot),
    botDifficulty: p.botDifficulty ?? "smart",
    tokens: emptyTokenMap(),
    bonuses: emptyGemMap(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
    points: 0,
  }));

  const [startingPlayerIndex, finalRngState] =
    typeof resolvedConfig.startingPlayerIndex === "number" &&
    Number.isFinite(resolvedConfig.startingPlayerIndex)
      ? [
          ((Math.trunc(resolvedConfig.startingPlayerIndex) %
            playerStates.length) +
            playerStates.length) %
            playerStates.length,
          rng4,
        ]
      : resolvedConfig.randomizeStartingPlayer
        ? nextIntPure(rng4, 0, playerStates.length - 1)
        : [0, rng4];

  return {
    gameId: "splendor",
    config: resolvedConfig,
    rngState: finalRngState,
    turn: 1,
    round: 1,
    phase: "MAIN_ACTION",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    players: playerStates,
    bank,
    decks,
    market,
    nobles,
    eligibleNobleIds: [],
    finalRoundTriggered: false,
    winnerId: null,
    eventLog: [
      {
        id: "evt-0",
        timestamp: 0,
        turn: 1,
        type: "GAME_STARTED",
        message: `Splendor started with ${players.length} players (${playerStates[startingPlayerIndex]!.name} goes first · ${gemCount} gems/color, ${nobles.length} Nobles, Target: ${resolvedConfig.targetPoints} Prestige).`,
      },
    ],
  };
}
