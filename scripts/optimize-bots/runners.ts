import type {
  BotDifficulty,
  GameEngine,
  PlayerDescriptor,
} from "@gaming-platform/core";
import {
  CatanEngine,
  PLAYER_COLORS,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";
import {
  DEFAULT_CATAN_DUEL_SCENARIOS,
  DEFAULT_CATAN_MIXED_SCENARIOS,
  OPTIMIZE_BOTS_DEFAULTS,
  TIERS,
  type TournamentSummary,
} from "./config.ts";

function makeRotatedTierPlayers(
  rot: number,
  uppercaseName = false
): PlayerDescriptor[] {
  return TIERS.map((_, seatIdx) => {
    const tier = TIERS[(seatIdx + rot) % 4]!;
    return {
      id: `p${seatIdx + 1}`,
      name: `${uppercaseName ? tier.toUpperCase() : tier}-${seatIdx + 1}`,
      color: PLAYER_COLORS[seatIdx]!,
      isBot: true,
      botDifficulty: tier,
    };
  });
}

function makeDuelPlayers(seatCount: number, flip: number): PlayerDescriptor[] {
  return Array.from({ length: seatCount }, (_, seatIdx) => {
    const tier: BotDifficulty =
      (seatIdx + flip) % 2 === 0 ? "master" : "smart";
    return {
      id: `p${seatIdx + 1}`,
      name: `${tier}-${seatIdx + 1}`,
      color: PLAYER_COLORS[seatIdx % PLAYER_COLORS.length]!,
      isBot: true,
      botDifficulty: tier,
    };
  });
}

function toWinRatePct(
  winsByTier: Record<BotDifficulty, number>,
  matchesPlayed: number
): Record<BotDifficulty, number> {
  const denom = Math.max(1, matchesPlayed);
  return {
    easy: Number(((winsByTier.easy / denom) * 100).toFixed(1)),
    normal: Number(((winsByTier.normal / denom) * 100).toFixed(1)),
    smart: Number(((winsByTier.smart / denom) * 100).toFixed(1)),
    master: Number(((winsByTier.master / denom) * 100).toFixed(1)),
  };
}

export function runCatanMixedTournament(
  boardCount = 60,
  checkInvariants = false,
  seedPrefix = "arena-catan"
): TournamentSummary {
  const start = performance.now();
  const winsByTier: Record<BotDifficulty, number> = {
    easy: 0,
    normal: 0,
    smart: 0,
    master: 0,
  };
  let matchesPlayed = 0;
  let domesticTradesOffered = 0;
  let domesticTradesCompleted = 0;
  let totalTurns = 0;
  let invariantViolations = 0;

  for (let b = 0; b < boardCount; b++) {
    const scenarioId =
      DEFAULT_CATAN_MIXED_SCENARIOS[b % DEFAULT_CATAN_MIXED_SCENARIOS.length]!;
    const boardSeed = `${seedPrefix}-${scenarioId}-${b}`;

    for (let rot = 0; rot < 4; rot++) {
      let state = CatanEngine.initGame(
        makeRotatedTierPlayers(rot, true),
        {
          scenarioId,
          enableHarbormaster: b % 3 === 0,
          enableCityWalls: b % 4 === 0,
        },
        boardSeed
      );

      let steps = 0;
      while (
        state.phase !== "GAME_OVER" &&
        steps < OPTIMIZE_BOTS_DEFAULTS.catanStepCap4P
      ) {
        const actorId = getNextActingPlayerId(state);
        if (!actorId) break;
        const action = CatanEngine.chooseBotAction(state, actorId);
        if (!action) break;
        if (action.type === "OFFER_DOMESTIC_TRADE") domesticTradesOffered++;
        if (action.type === "CONFIRM_DOMESTIC_TRADE") domesticTradesCompleted++;
        state = CatanEngine.applyAction(state, actorId, action).state;
        steps++;
      }

      if (checkInvariants) {
        const inv = CatanEngine.checkInvariants(state);
        if (!inv.valid) invariantViolations += inv.violations.length;
      }

      matchesPlayed++;
      totalTurns += state.turn;
      if (state.winnerId) {
        const winner = state.players.find((p) => p.id === state.winnerId);
        if (winner) winsByTier[winner.botDifficulty]++;
      }
    }
  }

  return {
    game: "catan",
    matchesPlayed,
    winsByTier,
    winRatePct: toWinRatePct(winsByTier, matchesPlayed),
    domesticTradesOffered,
    domesticTradesCompleted,
    avgTurns: Number((totalTurns / Math.max(1, matchesPlayed)).toFixed(1)),
    invariantViolations,
    elapsedMs: Math.round(performance.now() - start),
  };
}

export function evaluateMasterVsSmartCatan(
  boardCount = 50,
  seedPrefix = "duel"
): number {
  let masterWins = 0;
  let totalGames = 0;

  for (let b = 0; b < boardCount; b++) {
    const scenarioId =
      DEFAULT_CATAN_DUEL_SCENARIOS[b % DEFAULT_CATAN_DUEL_SCENARIOS.length]!;
    const seatCount = scenarioId === "big_island_5_6" ? 6 : 4;
    const seed = `${seedPrefix}-${scenarioId}-${b}`;
    const stepCap =
      seatCount === 6
        ? OPTIMIZE_BOTS_DEFAULTS.catanStepCap6P
        : OPTIMIZE_BOTS_DEFAULTS.catanStepCap4P;

    for (let flip = 0; flip < 2; flip++) {
      let state = CatanEngine.initGame(
        makeDuelPlayers(seatCount, flip),
        {
          scenarioId,
          enableHarbormaster: b % 3 === 0,
          enableCityWalls: b % 4 === 0,
        },
        seed
      );
      let steps = 0;
      while (state.phase !== "GAME_OVER" && steps < stepCap) {
        const actorId = getNextActingPlayerId(state);
        if (!actorId) break;
        const act = CatanEngine.chooseBotAction(state, actorId);
        if (!act) break;
        state = CatanEngine.applyAction(state, actorId, act).state;
        steps++;
      }

      totalGames++;
      if (state.winnerId) {
        const w = state.players.find((p) => p.id === state.winnerId);
        if (w?.botDifficulty === "master") masterWins++;
      }
    }
  }

  return masterWins / Math.max(1, totalGames);
}

function runSimpleMixedTournament<TState extends {
  phase: string;
  winnerId: string | null;
  players: readonly { id: string; botDifficulty: BotDifficulty }[];
}>(
  game: string,
  engine: GameEngine<TState, any, any, any>,
  getActingId: (state: TState) => string | null,
  stepCap: number,
  boardCount: number,
  checkInvariants: boolean,
  seedPrefix: string
): TournamentSummary {
  const start = performance.now();
  const winsByTier: Record<BotDifficulty, number> = {
    easy: 0,
    normal: 0,
    smart: 0,
    master: 0,
  };
  let matchesPlayed = 0;
  let invariantViolations = 0;

  for (let b = 0; b < boardCount; b++) {
    const seed = `${seedPrefix}-${b}`;
    for (let rot = 0; rot < 4; rot++) {
      let state = engine.initGame(makeRotatedTierPlayers(rot), {}, seed);
      let steps = 0;
      while (state.phase !== "GAME_OVER" && steps < stepCap) {
        const actorId = getActingId(state);
        if (!actorId) break;
        const act = engine.chooseBotAction(state, actorId);
        if (!act) break;
        state = engine.applyAction(state, actorId, act).state;
        steps++;
      }
      if (checkInvariants) {
        const inv = engine.checkInvariants(state);
        if (!inv.valid) invariantViolations += inv.violations.length;
      }
      matchesPlayed++;
      if (state.winnerId) {
        const w = state.players.find((p) => p.id === state.winnerId);
        if (w) winsByTier[w.botDifficulty]++;
      }
    }
  }

  return {
    game,
    matchesPlayed,
    winsByTier,
    winRatePct: toWinRatePct(winsByTier, matchesPlayed),
    invariantViolations,
    elapsedMs: Math.round(performance.now() - start),
  };
}

function evaluateSimpleMasterVsSmart<TState extends {
  phase: string;
  winnerId: string | null;
  players: readonly { id: string; botDifficulty: BotDifficulty }[];
}>(
  engine: GameEngine<TState, any, any, any>,
  getActingId: (state: TState) => string | null,
  stepCap: number,
  boardCount: number,
  seedPrefix: string
): number {
  let masterWins = 0;
  let total = 0;
  for (let b = 0; b < boardCount; b++) {
    const seed = `${seedPrefix}-${b}`;
    for (let flip = 0; flip < 2; flip++) {
      let state = engine.initGame(makeDuelPlayers(4, flip), {}, seed);
      let steps = 0;
      while (state.phase !== "GAME_OVER" && steps < stepCap) {
        const actorId = getActingId(state);
        if (!actorId) break;
        const act = engine.chooseBotAction(state, actorId);
        if (!act) break;
        state = engine.applyAction(state, actorId, act).state;
        steps++;
      }
      total++;
      if (state.winnerId) {
        const w = state.players.find((p) => p.id === state.winnerId);
        if (w?.botDifficulty === "master") masterWins++;
      }
    }
  }
  return masterWins / Math.max(1, total);
}

export const runSplendorMixedTournament = (
  boardCount = 60,
  checkInvariants = true,
  seedPrefix = "arena-splendor"
): TournamentSummary =>
  runSimpleMixedTournament(
    "splendor",
    SplendorEngine,
    getSplendorActingPlayerId,
    OPTIMIZE_BOTS_DEFAULTS.splendorStepCap,
    boardCount,
    checkInvariants,
    seedPrefix
  );

export const evaluateMasterVsSmartSplendor = (
  boardCount = 80,
  seedPrefix = "sp-duel"
): number =>
  evaluateSimpleMasterVsSmart(
    SplendorEngine,
    getSplendorActingPlayerId,
    OPTIMIZE_BOTS_DEFAULTS.splendorStepCap,
    boardCount,
    seedPrefix
  );

export const runAzulMixedTournament = (
  boardCount = 60,
  checkInvariants = true,
  seedPrefix = "arena-azul"
): TournamentSummary =>
  runSimpleMixedTournament(
    "azul",
    AzulEngine,
    getAzulActingPlayerId,
    OPTIMIZE_BOTS_DEFAULTS.azulStepCap,
    boardCount,
    checkInvariants,
    seedPrefix
  );

export const evaluateMasterVsSmartAzul = (
  boardCount = 90,
  seedPrefix = "az-duel"
): number =>
  evaluateSimpleMasterVsSmart(
    AzulEngine,
    getAzulActingPlayerId,
    OPTIMIZE_BOTS_DEFAULTS.azulStepCap,
    boardCount,
    seedPrefix
  );
