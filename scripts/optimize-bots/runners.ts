import type { BotDifficulty, PlayerDescriptor } from "@gaming-platform/core";
import {
  CatanEngine,
  PLAYER_COLORS,
  type ScenarioId,
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

export function runCatanMixedTournament(
  boardCount = 60,
  scenarios: ScenarioId[] = DEFAULT_CATAN_MIXED_SCENARIOS,
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
    const scenarioId = scenarios[b % scenarios.length]!;
    const boardSeed = `${seedPrefix}-${scenarioId}-${b}`;

    for (let rot = 0; rot < 4; rot++) {
      const players: PlayerDescriptor[] = TIERS.map((_, seatIdx) => {
        const tier = TIERS[(seatIdx + rot) % 4]!;
        return {
          id: `p${seatIdx + 1}`,
          name: `${tier.toUpperCase()}-${seatIdx + 1}`,
          color: PLAYER_COLORS[seatIdx]!,
          isBot: true,
          botDifficulty: tier,
        };
      });

      let state = CatanEngine.initGame(
        players,
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
        if (winner) {
          winsByTier[winner.botDifficulty]++;
        }
      }
    }
  }

  return {
    game: "catan",
    matchesPlayed,
    winsByTier,
    winRatePct: {
      easy: Number(((winsByTier.easy / matchesPlayed) * 100).toFixed(1)),
      normal: Number(((winsByTier.normal / matchesPlayed) * 100).toFixed(1)),
      smart: Number(((winsByTier.smart / matchesPlayed) * 100).toFixed(1)),
      master: Number(((winsByTier.master / matchesPlayed) * 100).toFixed(1)),
    },
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
): {
  masterWinRate: number;
  masterWins: number;
  smartWins: number;
  totalGames: number;
} {
  let masterWins = 0;
  let smartWins = 0;
  let totalGames = 0;
  const scenarios = DEFAULT_CATAN_DUEL_SCENARIOS;

  for (let b = 0; b < boardCount; b++) {
    const scenarioId = scenarios[b % scenarios.length]!;
    const seatCount = scenarioId === "big_island_5_6" ? 6 : 4;
    const seed = `${seedPrefix}-${scenarioId}-${b}`;

    for (let flip = 0; flip < 2; flip++) {
      const players: PlayerDescriptor[] = Array.from(
        { length: seatCount },
        (_, seatIdx) => {
          const isMaster = (seatIdx + flip) % 2 === 0;
          const tier: BotDifficulty = isMaster ? "master" : "smart";
          return {
            id: `p${seatIdx + 1}`,
            name: `${tier}-${seatIdx + 1}`,
            color: PLAYER_COLORS[seatIdx % PLAYER_COLORS.length]!,
            isBot: true,
            botDifficulty: tier,
          };
        }
      );

      let state = CatanEngine.initGame(
        players,
        {
          scenarioId,
          enableHarbormaster: b % 3 === 0,
          enableCityWalls: b % 4 === 0,
        },
        seed
      );
      let steps = 0;
      const stepCap =
        seatCount === 6
          ? OPTIMIZE_BOTS_DEFAULTS.catanStepCap6P
          : OPTIMIZE_BOTS_DEFAULTS.catanStepCap4P;
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
        else smartWins++;
      }
    }
  }

  return {
    masterWinRate: masterWins / Math.max(1, totalGames),
    masterWins,
    smartWins,
    totalGames,
  };
}

export function runSplendorMixedTournament(
  boardCount = 60,
  checkInvariants = true,
  seedPrefix = "arena-splendor"
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
      const players: PlayerDescriptor[] = TIERS.map((_, seatIdx) => {
        const tier = TIERS[(seatIdx + rot) % 4]!;
        return {
          id: `p${seatIdx + 1}`,
          name: `${tier}-${seatIdx + 1}`,
          color: PLAYER_COLORS[seatIdx]!,
          isBot: true,
          botDifficulty: tier,
        };
      });
      let state = SplendorEngine.initGame(players, {}, seed);
      let steps = 0;
      while (
        state.phase !== "GAME_OVER" &&
        steps < OPTIMIZE_BOTS_DEFAULTS.splendorStepCap
      ) {
        const actorId = getSplendorActingPlayerId(state);
        if (!actorId) break;
        const act = SplendorEngine.chooseBotAction(state, actorId);
        if (!act) break;
        state = SplendorEngine.applyAction(state, actorId, act).state;
        steps++;
      }
      if (checkInvariants) {
        const inv = SplendorEngine.checkInvariants(state);
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
    game: "splendor",
    matchesPlayed,
    winsByTier,
    winRatePct: {
      easy: Number(((winsByTier.easy / matchesPlayed) * 100).toFixed(1)),
      normal: Number(((winsByTier.normal / matchesPlayed) * 100).toFixed(1)),
      smart: Number(((winsByTier.smart / matchesPlayed) * 100).toFixed(1)),
      master: Number(((winsByTier.master / matchesPlayed) * 100).toFixed(1)),
    },
    invariantViolations,
    elapsedMs: Math.round(performance.now() - start),
  };
}

export function evaluateMasterVsSmartSplendor(
  boardCount = 80,
  seedPrefix = "sp-duel"
): number {
  let masterWins = 0;
  let total = 0;
  for (let b = 0; b < boardCount; b++) {
    const seed = `${seedPrefix}-${b}`;
    for (let flip = 0; flip < 2; flip++) {
      const players: PlayerDescriptor[] = [0, 1, 2, 3].map((seatIdx) => {
        const tier: BotDifficulty =
          (seatIdx + flip) % 2 === 0 ? "master" : "smart";
        return {
          id: `p${seatIdx + 1}`,
          name: `${tier}-${seatIdx + 1}`,
          color: PLAYER_COLORS[seatIdx]!,
          isBot: true,
          botDifficulty: tier,
        };
      });
      let state = SplendorEngine.initGame(players, {}, seed);
      let steps = 0;
      while (
        state.phase !== "GAME_OVER" &&
        steps < OPTIMIZE_BOTS_DEFAULTS.splendorStepCap
      ) {
        const actorId = getSplendorActingPlayerId(state);
        if (!actorId) break;
        const act = SplendorEngine.chooseBotAction(state, actorId);
        if (!act) break;
        state = SplendorEngine.applyAction(state, actorId, act).state;
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

export function runAzulMixedTournament(
  boardCount = 60,
  checkInvariants = true,
  seedPrefix = "arena-azul"
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
      const players: PlayerDescriptor[] = TIERS.map((_, seatIdx) => {
        const tier = TIERS[(seatIdx + rot) % 4]!;
        return {
          id: `p${seatIdx + 1}`,
          name: `${tier}-${seatIdx + 1}`,
          color: PLAYER_COLORS[seatIdx]!,
          isBot: true,
          botDifficulty: tier,
        };
      });
      let state = AzulEngine.initGame(players, {}, seed);
      let steps = 0;
      while (
        state.phase !== "GAME_OVER" &&
        steps < OPTIMIZE_BOTS_DEFAULTS.azulStepCap
      ) {
        const actorId = getAzulActingPlayerId(state);
        if (!actorId) break;
        const act = AzulEngine.chooseBotAction(state, actorId);
        if (!act) break;
        state = AzulEngine.applyAction(state, actorId, act).state;
        steps++;
      }
      if (checkInvariants) {
        const inv = AzulEngine.checkInvariants(state);
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
    game: "azul",
    matchesPlayed,
    winsByTier,
    winRatePct: {
      easy: Number(((winsByTier.easy / matchesPlayed) * 100).toFixed(1)),
      normal: Number(((winsByTier.normal / matchesPlayed) * 100).toFixed(1)),
      smart: Number(((winsByTier.smart / matchesPlayed) * 100).toFixed(1)),
      master: Number(((winsByTier.master / matchesPlayed) * 100).toFixed(1)),
    },
    invariantViolations,
    elapsedMs: Math.round(performance.now() - start),
  };
}

export function evaluateMasterVsSmartAzul(
  boardCount = 90,
  seedPrefix = "az-duel"
): number {
  let masterWins = 0;
  let total = 0;
  for (let b = 0; b < boardCount; b++) {
    const seed = `${seedPrefix}-${b}`;
    for (let flip = 0; flip < 2; flip++) {
      const players: PlayerDescriptor[] = [0, 1, 2, 3].map((seatIdx) => {
        const tier: BotDifficulty =
          (seatIdx + flip) % 2 === 0 ? "master" : "smart";
        return {
          id: `p${seatIdx + 1}`,
          name: `${tier}-${seatIdx + 1}`,
          color: PLAYER_COLORS[seatIdx]!,
          isBot: true,
          botDifficulty: tier,
        };
      });
      let state = AzulEngine.initGame(players, {}, seed);
      let steps = 0;
      while (
        state.phase !== "GAME_OVER" &&
        steps < OPTIMIZE_BOTS_DEFAULTS.azulStepCap
      ) {
        const actorId = getAzulActingPlayerId(state);
        if (!actorId) break;
        const act = AzulEngine.chooseBotAction(state, actorId);
        if (!act) break;
        state = AzulEngine.applyAction(state, actorId, act).state;
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
