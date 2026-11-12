import {
  type BotDifficulty,
  type PlayerDescriptor,
  SeededRNG,
} from "@gaming-platform/core";
import {
  CATAN_BOT_WEIGHTS,
  type CatanBotWeights,
  CatanEngine,
  PLAYER_COLORS,
  type ScenarioId,
  getNextActingPlayerId,
  setMasterCatanBotWeights,
} from "@gaming-platform/catan";
import {
  SPLENDOR_MASTER_WEIGHTS,
  SplendorEngine,
  type SplendorMasterWeights,
  getSplendorActingPlayerId,
  setMasterSplendorBotWeights,
} from "@gaming-platform/splendor";
import {
  AZUL_MASTER_WEIGHTS,
  AzulEngine,
  type AzulMasterWeights,
  getAzulActingPlayerId,
  setMasterAzulBotWeights,
} from "@gaming-platform/azul";

const TIERS: BotDifficulty[] = ["easy", "normal", "smart", "master"];

export interface TournamentSummary {
  game: string;
  matchesPlayed: number;
  winsByTier: Record<BotDifficulty, number>;
  winRatePct: Record<BotDifficulty, number>;
  domesticTradesOffered?: number;
  domesticTradesCompleted?: number;
  avgTurns?: number;
  invariantViolations: number;
  elapsedMs: number;
}

export function runCatanMixedTournament(
  boardCount = 60,
  scenarios: ScenarioId[] = [
    "standard",
    "seafarers_new_shores",
    "seafarers_four_islands",
    "seafarers_fog_islands",
  ],
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
      while (state.phase !== "GAME_OVER" && steps < 1800) {
        const actorId = getNextActingPlayerId(state);
        if (!actorId) break;
        const action = CatanEngine.chooseBotAction(state, actorId);
        if (!action) break;
        if (action.type === "OFFER_DOMESTIC_TRADE") domesticTradesOffered++;
        if (action.type === "ACCEPT_DOMESTIC_TRADE") domesticTradesCompleted++;
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
  const scenarios: ScenarioId[] = [
    "standard",
    "standard",
    "seafarers_new_shores",
    "seafarers_four_islands",
    "seafarers_fog_islands",
    "big_island_5_6",
  ];

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
      const stepCap = seatCount === 6 ? 2400 : 1800;
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
      while (state.phase !== "GAME_OVER" && steps < 600) {
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
      while (state.phase !== "GAME_OVER" && steps < 600) {
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
      while (state.phase !== "GAME_OVER" && steps < 600) {
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
      while (state.phase !== "GAME_OVER" && steps < 600) {
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

function evaluateCompositeMasterFitness(
  duelBoards: number,
  mixedBoards: number,
  seedTag: string
): { fitness: number; duelWinRate: number; mixedWinRate: number } {
  const duel = evaluateMasterVsSmartCatan(duelBoards, `opt-duel-${seedTag}`);
  const mixed = runCatanMixedTournament(
    mixedBoards,
    undefined,
    false,
    `opt-mixed-${seedTag}`
  );
  const mixedRate = mixed.winsByTier.master / Math.max(1, mixed.matchesPlayed);
  const fitness = duel.masterWinRate * 0.55 + mixedRate * 0.45 * 1.35;
  return {
    fitness,
    duelWinRate: duel.masterWinRate,
    mixedWinRate: mixedRate,
  };
}

export function optimizeMasterWeights(
  generations = 90,
  duelBoards = 84,
  mixedBoards = 56
): CatanBotWeights {
  const rng = new SeededRNG("catan-master-optimizer-stage4");
  let champion: CatanBotWeights = { ...CATAN_BOT_WEIGHTS.master };
  setMasterCatanBotWeights(champion);

  const baseEval = evaluateCompositeMasterFitness(
    duelBoards,
    mixedBoards,
    "s4-train"
  );
  const baseHoldout = evaluateCompositeMasterFitness(
    duelBoards,
    mixedBoards,
    "s4-holdout"
  );
  let championScore = (baseEval.fitness + baseHoldout.fitness) / 2;
  let championTrainScore = baseEval.fitness;

  console.log(
    `[Catan Init] Duel vs Smart: ${(((baseEval.duelWinRate + baseHoldout.duelWinRate) / 2) * 100).toFixed(1)}%, Mixed 4P: ${(((baseEval.mixedWinRate + baseHoldout.mixedWinRate) / 2) * 100).toFixed(1)}%, Composite: ${(championScore * 100).toFixed(2)}`
  );

  const tunableKeys: Array<keyof CatanBotWeights> = [
    "setupPipWeight",
    "setupScarcityWeight",
    "setupDiversityBonus",
    "setupNumberSpreadBonus",
    "setupPairSynergyBonus",
    "setupHarborBonus",
    "setupExpansionSpaceWeight",
    "setupSecondStartHandWeight",
    "cityPriority",
    "settlementPriority",
    "devCardPriority",
    "roadToSpotPriority",
    "longestRoadContestBonus",
    "harbormasterContestBonus",
    "cityWallPriority",
    "robberLeaderVpWeight",
    "robberPipsWeight",
    "tradeAcceptThreshold",
    "tradeFairnessRatio",
    "sevenDiscardRiskWeight",
  ];

  for (let gen = 1; gen <= generations; gen++) {
    const sigma = Math.max(0.03, 0.14 * (1 - gen / (generations + 4)));
    const candidate: CatanBotWeights = { ...champion };

    const numMutate =
      gen % 2 === 0 ? 1 : 2 + Math.floor(rng.nextFloat() * 3);
    for (let m = 0; m < numMutate; m++) {
      const key = rng.pick(tunableKeys);
      const cur = candidate[key];
      const delta = (rng.nextFloat() * 2 - 1) * sigma;
      candidate[key] = Number(Math.max(0.05, cur * (1 + delta)).toFixed(3));
    }

    setMasterCatanBotWeights(candidate);
    const trainRes = evaluateCompositeMasterFitness(
      duelBoards,
      mixedBoards,
      "s4-train"
    );

    if (trainRes.fitness > championTrainScore - 0.01) {
      const holdoutRes = evaluateCompositeMasterFitness(
        duelBoards,
        mixedBoards,
        "s4-holdout"
      );
      const combined = (trainRes.fitness + holdoutRes.fitness) / 2;
      if (combined > championScore) {
        champion = candidate;
        championScore = combined;
        championTrainScore = trainRes.fitness;
        console.log(
          `[Catan Gen ${gen}/${generations}] NEW CHAMPION! Duel = ${(((trainRes.duelWinRate + holdoutRes.duelWinRate) / 2) * 100).toFixed(1)}%, Mixed 4P = ${(((trainRes.mixedWinRate + holdoutRes.mixedWinRate) / 2) * 100).toFixed(1)}%, Composite = ${(championScore * 100).toFixed(2)}`
        );
      }
    }
    setMasterCatanBotWeights(champion);
  }

  return champion;
}

export function optimizeSplendorMasterWeights(
  generations = 80,
  duelBoards = 90,
  mixedBoards = 60
): SplendorMasterWeights {
  const rng = new SeededRNG("splendor-master-optimizer-stage4");
  let champion: SplendorMasterWeights = { ...SPLENDOR_MASTER_WEIGHTS };
  setMasterSplendorBotWeights(champion);

  const evalFit = (tag: string) => {
    const duel = evaluateMasterVsSmartSplendor(duelBoards, `sp-duel-${tag}`);
    const mixed =
      runSplendorMixedTournament(mixedBoards, false, `sp-mix-${tag}`).winsByTier
        .master /
      (mixedBoards * 4);
    return { duel, mixed, fitness: duel * 0.55 + mixed * 0.45 * 1.35 };
  };

  const bTrain = evalFit("train");
  const bHold = evalFit("holdout");
  let championScore = (bTrain.fitness + bHold.fitness) / 2;
  let championTrain = bTrain.fitness;
  console.log(
    `[Splendor Init] Duel vs Smart: ${(((bTrain.duel + bHold.duel) / 2) * 100).toFixed(1)}%, Mixed 4P: ${(((bTrain.mixed + bHold.mixed) / 2) * 100).toFixed(1)}%, Composite: ${(championScore * 100).toFixed(2)}`
  );

  const keys = Object.keys(champion) as Array<keyof SplendorMasterWeights>;

  for (let gen = 1; gen <= generations; gen++) {
    const sigma = Math.max(0.035, 0.2 * (1 - gen / (generations + 4)));
    const candidate: SplendorMasterWeights = { ...champion };
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(rng.nextFloat() * 3);
    for (let m = 0; m < numMutate; m++) {
      const k = rng.pick(keys);
      const delta = (rng.nextFloat() * 2 - 1) * sigma;
      candidate[k] = Number(Math.max(0.03, candidate[k] * (1 + delta)).toFixed(3));
    }

    setMasterSplendorBotWeights(candidate);
    const tr = evalFit("train");
    if (tr.fitness > championTrain - 0.01) {
      const ho = evalFit("holdout");
      const comb = (tr.fitness + ho.fitness) / 2;
      if (comb > championScore) {
        champion = candidate;
        championScore = comb;
        championTrain = tr.fitness;
        console.log(
          `[Splendor Gen ${gen}/${generations}] NEW CHAMPION! Duel = ${(((tr.duel + ho.duel) / 2) * 100).toFixed(1)}%, Mixed 4P = ${(((tr.mixed + ho.mixed) / 2) * 100).toFixed(1)}%, Composite = ${(championScore * 100).toFixed(2)}`
        );
      }
    }
    setMasterSplendorBotWeights(champion);
  }

  return champion;
}

export function optimizeAzulMasterWeights(
  generations = 100,
  duelBoards = 100,
  mixedBoards = 70
): AzulMasterWeights {
  const rng = new SeededRNG("azul-master-optimizer-stage4");
  let champion: AzulMasterWeights = { ...AZUL_MASTER_WEIGHTS };
  setMasterAzulBotWeights(champion);

  const evalFit = (tag: string) => {
    const duel = evaluateMasterVsSmartAzul(duelBoards, `az-duel-${tag}`);
    const mixed =
      runAzulMixedTournament(mixedBoards, false, `az-mix-${tag}`).winsByTier
        .master /
      (mixedBoards * 4);
    return { duel, mixed, fitness: duel * 0.55 + mixed * 0.45 * 1.35 };
  };

  const bTrain = evalFit("train");
  const bHold = evalFit("holdout");
  let championScore = (bTrain.fitness + bHold.fitness) / 2;
  let championTrain = bTrain.fitness;
  console.log(
    `[Azul Init] Duel vs Smart: ${(((bTrain.duel + bHold.duel) / 2) * 100).toFixed(1)}%, Mixed 4P: ${(((bTrain.mixed + bHold.mixed) / 2) * 100).toFixed(1)}%, Composite: ${(championScore * 100).toFixed(2)}`
  );

  const keys = Object.keys(champion) as Array<keyof AzulMasterWeights>;

  for (let gen = 1; gen <= generations; gen++) {
    const sigma = Math.max(0.035, 0.22 * (1 - gen / (generations + 4)));
    const candidate: AzulMasterWeights = { ...champion };
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(rng.nextFloat() * 3);
    for (let m = 0; m < numMutate; m++) {
      const k = rng.pick(keys);
      const delta = (rng.nextFloat() * 2 - 1) * sigma;
      candidate[k] = Number(Math.max(0.03, candidate[k] * (1 + delta)).toFixed(3));
    }

    setMasterAzulBotWeights(candidate);
    const tr = evalFit("train");
    if (tr.fitness > championTrain - 0.01) {
      const ho = evalFit("holdout");
      const comb = (tr.fitness + ho.fitness) / 2;
      if (comb > championScore) {
        champion = candidate;
        championScore = comb;
        championTrain = tr.fitness;
        console.log(
          `[Azul Gen ${gen}/${generations}] NEW CHAMPION! Duel = ${(((tr.duel + ho.duel) / 2) * 100).toFixed(1)}%, Mixed 4P = ${(((tr.mixed + ho.mixed) / 2) * 100).toFixed(1)}%, Composite = ${(championScore * 100).toFixed(2)}`
        );
      }
    }
    setMasterAzulBotWeights(champion);
  }

  return champion;
}

if (import.meta.main) {
  const mode = process.argv[2] ?? "benchmark";
  const argCount = Number(process.argv[3] ?? (mode === "optimize" ? "90" : "60"));

  if (mode === "optimize") {
    console.log(
      `=== Stage-4 Multi-Game Grandmaster Evolution (Catan ${argCount}g + Splendor 80g + Azul 100g) ===`
    );
    const bestCatan = optimizeMasterWeights(argCount, 84, 56);
    console.log("\n=== Optimized Catan Master Weights ===");
    console.log(JSON.stringify(bestCatan, null, 2));

    const bestSplendor = optimizeSplendorMasterWeights(80, 90, 60);
    console.log("\n=== Optimized Splendor Master Weights ===");
    console.log(JSON.stringify(bestSplendor, null, 2));

    const bestAzul = optimizeAzulMasterWeights(100, 100, 70);
    console.log("\n=== Optimized Azul Master Weights ===");
    console.log(JSON.stringify(bestAzul, null, 2));

    console.log("\n=== Final Gold-Standard Unseen 2,000-Match Validation Per Game (6,000 Unseen Matches) ===");
    const unseenCatan = runCatanMixedTournament(500, undefined, true, "gold-unseen-catan");
    console.log("Gold Unseen Catan 4-Tier Mixed (2000 matches):", JSON.stringify(unseenCatan));
    const unseenSplendor = runSplendorMixedTournament(500, true, "gold-unseen-splendor");
    console.log("Gold Unseen Splendor 4-Tier Mixed (2000 matches):", JSON.stringify(unseenSplendor));
    const unseenAzul = runAzulMixedTournament(500, true, "gold-unseen-azul");
    console.log("Gold Unseen Azul 4-Tier Mixed (2000 matches):", JSON.stringify(unseenAzul));
  } else {
    console.log(
      `\n=== Running 4-Tier Seat-Balanced Tournaments (${argCount * 4} matches per game) ===`
    );
    const catanRes = runCatanMixedTournament(argCount, undefined, true);
    console.log("Catan 4-Tier Mixed:", JSON.stringify(catanRes));

    const splendorRes = runSplendorMixedTournament(argCount);
    console.log("Splendor 4-Tier Mixed:", JSON.stringify(splendorRes));

    const azulRes = runAzulMixedTournament(argCount);
    console.log("Azul 4-Tier Mixed:", JSON.stringify(azulRes));
  }
}
