import {
  createRngState,
  nextFloatPure,
  pickPure,
} from "@gaming-platform/core";
import {
  CATAN_BOT_WEIGHTS,
  type CatanBotWeights,
  setMasterCatanBotWeights,
} from "@gaming-platform/catan";
import {
  SPLENDOR_MASTER_WEIGHTS,
  type SplendorMasterWeights,
  setMasterSplendorBotWeights,
} from "@gaming-platform/splendor";
import {
  AZUL_MASTER_WEIGHTS,
  type AzulMasterWeights,
  setMasterAzulBotWeights,
} from "@gaming-platform/azul";
import {
  OPTIMIZE_BOTS_DEFAULTS,
  TUNABLE_CATAN_WEIGHT_KEYS,
} from "./config.ts";
import {
  evaluateMasterVsSmartAzul,
  evaluateMasterVsSmartCatan,
  evaluateMasterVsSmartSplendor,
  runAzulMixedTournament,
  runCatanMixedTournament,
  runSplendorMixedTournament,
} from "./runners.ts";

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
  const fitness =
    duel.masterWinRate * OPTIMIZE_BOTS_DEFAULTS.duelFitnessWeight +
    mixedRate *
      OPTIMIZE_BOTS_DEFAULTS.mixedFitnessWeight *
      OPTIMIZE_BOTS_DEFAULTS.mixedFitnessScale;
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
  let rngState = createRngState("catan-master-optimizer-stage4");
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

  for (let gen = 1; gen <= generations; gen++) {
    const sigma = Math.max(0.03, 0.14 * (1 - gen / (generations + 4)));
    const candidate: CatanBotWeights = { ...champion };

    const [mutRand, nextRng0] =
      gen % 2 === 0 ? [0, rngState] : nextFloatPure(rngState);
    rngState = nextRng0;
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(mutRand * 3);
    for (let m = 0; m < numMutate; m++) {
      const [key, nextRng1] = pickPure(rngState, TUNABLE_CATAN_WEIGHT_KEYS);
      const [deltaRand, nextRng2] = nextFloatPure(nextRng1);
      rngState = nextRng2;
      const cur = candidate[key];
      const delta = (deltaRand * 2 - 1) * sigma;
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
  let rngState = createRngState("splendor-master-optimizer-stage4");
  let champion: SplendorMasterWeights = { ...SPLENDOR_MASTER_WEIGHTS };
  setMasterSplendorBotWeights(champion);

  const evalFit = (tag: string) => {
    const duel = evaluateMasterVsSmartSplendor(duelBoards, `sp-duel-${tag}`);
    const mixed =
      runSplendorMixedTournament(mixedBoards, false, `sp-mix-${tag}`).winsByTier
        .master /
      (mixedBoards * 4);
    return {
      duel,
      mixed,
      fitness:
        duel * OPTIMIZE_BOTS_DEFAULTS.duelFitnessWeight +
        mixed *
          OPTIMIZE_BOTS_DEFAULTS.mixedFitnessWeight *
          OPTIMIZE_BOTS_DEFAULTS.mixedFitnessScale,
    };
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
    const [mutRand, nextRng0] =
      gen % 2 === 0 ? [0, rngState] : nextFloatPure(rngState);
    rngState = nextRng0;
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(mutRand * 3);
    for (let m = 0; m < numMutate; m++) {
      const [k, nextRng1] = pickPure(rngState, keys);
      const [deltaRand, nextRng2] = nextFloatPure(nextRng1);
      rngState = nextRng2;
      const delta = (deltaRand * 2 - 1) * sigma;
      candidate[k] = Number(
        Math.max(0.03, candidate[k] * (1 + delta)).toFixed(3)
      );
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
  let rngState = createRngState("azul-master-optimizer-stage4");
  let champion: AzulMasterWeights = { ...AZUL_MASTER_WEIGHTS };
  setMasterAzulBotWeights(champion);

  const evalFit = (tag: string) => {
    const duel = evaluateMasterVsSmartAzul(duelBoards, `az-duel-${tag}`);
    const mixed =
      runAzulMixedTournament(mixedBoards, false, `az-mix-${tag}`).winsByTier
        .master /
      (mixedBoards * 4);
    return {
      duel,
      mixed,
      fitness:
        duel * OPTIMIZE_BOTS_DEFAULTS.duelFitnessWeight +
        mixed *
          OPTIMIZE_BOTS_DEFAULTS.mixedFitnessWeight *
          OPTIMIZE_BOTS_DEFAULTS.mixedFitnessScale,
    };
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
    const [mutRand, nextRng0] =
      gen % 2 === 0 ? [0, rngState] : nextFloatPure(rngState);
    rngState = nextRng0;
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(mutRand * 3);
    for (let m = 0; m < numMutate; m++) {
      const [k, nextRng1] = pickPure(rngState, keys);
      const [deltaRand, nextRng2] = nextFloatPure(nextRng1);
      rngState = nextRng2;
      const delta = (deltaRand * 2 - 1) * sigma;
      candidate[k] = Number(
        Math.max(0.03, candidate[k] * (1 + delta)).toFixed(3)
      );
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
