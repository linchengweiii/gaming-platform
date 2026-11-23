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
  type TournamentSummary,
} from "./config.ts";
import {
  evaluateMasterVsSmartAzul,
  evaluateMasterVsSmartCatan,
  evaluateMasterVsSmartSplendor,
  runAzulMixedTournament,
  runCatanMixedTournament,
  runSplendorMixedTournament,
} from "./runners.ts";

function evolveMasterWeights<T extends object>(opts: {
  readonly label: string;
  readonly seed: string;
  readonly initial: T;
  readonly keys: readonly (keyof T)[];
  readonly setWeights: (w: Partial<T>) => void;
  readonly evaluateDuel: (tag: string) => number;
  readonly evaluateMixed: (tag: string) => TournamentSummary;
  readonly trainTag: string;
  readonly holdoutTag: string;
  readonly generations: number;
  readonly minSigma: number;
  readonly maxSigma: number;
  readonly minWeight: number;
}): T {
  let rngState = createRngState(opts.seed);
  let champion: T = { ...opts.initial };
  opts.setWeights(champion);

  const evalFit = (tag: string) => {
    const duel = opts.evaluateDuel(tag);
    const mixedRes = opts.evaluateMixed(tag);
    const mixed =
      mixedRes.winsByTier.master / Math.max(1, mixedRes.matchesPlayed);
    const fitness =
      duel * OPTIMIZE_BOTS_DEFAULTS.duelFitnessWeight +
      mixed *
        OPTIMIZE_BOTS_DEFAULTS.mixedFitnessWeight *
        OPTIMIZE_BOTS_DEFAULTS.mixedFitnessScale;
    return { duel, mixed, fitness };
  };

  const baseTrain = evalFit(opts.trainTag);
  const baseHoldout = evalFit(opts.holdoutTag);
  let championScore = (baseTrain.fitness + baseHoldout.fitness) / 2;
  let championTrainScore = baseTrain.fitness;

  console.log(
    `[${opts.label} Init] Duel vs Smart: ${(((baseTrain.duel + baseHoldout.duel) / 2) * 100).toFixed(1)}%, Mixed 4P: ${(((baseTrain.mixed + baseHoldout.mixed) / 2) * 100).toFixed(1)}%, Composite: ${(championScore * 100).toFixed(2)}`
  );

  for (let gen = 1; gen <= opts.generations; gen++) {
    const sigma = Math.max(
      opts.minSigma,
      opts.maxSigma * (1 - gen / (opts.generations + 4))
    );
    const candidate: T = { ...champion };

    const [mutRand, nextRng0] =
      gen % 2 === 0 ? [0, rngState] : nextFloatPure(rngState);
    rngState = nextRng0;
    const numMutate = gen % 2 === 0 ? 1 : 2 + Math.floor(mutRand * 3);
    for (let m = 0; m < numMutate; m++) {
      const [key, nextRng1] = pickPure(rngState, opts.keys);
      const [deltaRand, nextRng2] = nextFloatPure(nextRng1);
      rngState = nextRng2;
      const delta = (deltaRand * 2 - 1) * sigma;
      const cur = Number(candidate[key]);
      (candidate as Record<keyof T, number>)[key] = Number(
        Math.max(opts.minWeight, cur * (1 + delta)).toFixed(3)
      );
    }

    opts.setWeights(candidate);
    const tr = evalFit(opts.trainTag);
    if (tr.fitness > championTrainScore - 0.01) {
      const ho = evalFit(opts.holdoutTag);
      const combined = (tr.fitness + ho.fitness) / 2;
      if (combined > championScore) {
        champion = candidate;
        championScore = combined;
        championTrainScore = tr.fitness;
        console.log(
          `[${opts.label} Gen ${gen}/${opts.generations}] NEW CHAMPION! Duel = ${(((tr.duel + ho.duel) / 2) * 100).toFixed(1)}%, Mixed 4P = ${(((tr.mixed + ho.mixed) / 2) * 100).toFixed(1)}%, Composite = ${(championScore * 100).toFixed(2)}`
        );
      }
    }
    opts.setWeights(champion);
  }

  return champion;
}

export function optimizeMasterWeights(
  generations = 90,
  duelBoards = 84,
  mixedBoards = 56
): CatanBotWeights {
  return evolveMasterWeights({
    label: "Catan",
    seed: "catan-master-optimizer-stage4",
    initial: CATAN_BOT_WEIGHTS.master,
    keys: TUNABLE_CATAN_WEIGHT_KEYS,
    setWeights: setMasterCatanBotWeights,
    evaluateDuel: (tag) =>
      evaluateMasterVsSmartCatan(duelBoards, `opt-duel-${tag}`),
    evaluateMixed: (tag) =>
      runCatanMixedTournament(mixedBoards, false, `opt-mixed-${tag}`),
    trainTag: "s4-train",
    holdoutTag: "s4-holdout",
    generations,
    minSigma: 0.03,
    maxSigma: 0.14,
    minWeight: 0.05,
  });
}

export function optimizeSplendorMasterWeights(
  generations = 80,
  duelBoards = 90,
  mixedBoards = 60
): SplendorMasterWeights {
  return evolveMasterWeights({
    label: "Splendor",
    seed: "splendor-master-optimizer-stage4",
    initial: SPLENDOR_MASTER_WEIGHTS,
    keys: Object.keys(SPLENDOR_MASTER_WEIGHTS) as Array<
      keyof SplendorMasterWeights
    >,
    setWeights: setMasterSplendorBotWeights,
    evaluateDuel: (tag) =>
      evaluateMasterVsSmartSplendor(duelBoards, `sp-duel-${tag}`),
    evaluateMixed: (tag) =>
      runSplendorMixedTournament(mixedBoards, false, `sp-mix-${tag}`),
    trainTag: "train",
    holdoutTag: "holdout",
    generations,
    minSigma: 0.035,
    maxSigma: 0.2,
    minWeight: 0.03,
  });
}

export function optimizeAzulMasterWeights(
  generations = 100,
  duelBoards = 100,
  mixedBoards = 70
): AzulMasterWeights {
  return evolveMasterWeights({
    label: "Azul",
    seed: "azul-master-optimizer-stage4",
    initial: AZUL_MASTER_WEIGHTS,
    keys: Object.keys(AZUL_MASTER_WEIGHTS) as Array<keyof AzulMasterWeights>,
    setWeights: setMasterAzulBotWeights,
    evaluateDuel: (tag) =>
      evaluateMasterVsSmartAzul(duelBoards, `az-duel-${tag}`),
    evaluateMixed: (tag) =>
      runAzulMixedTournament(mixedBoards, false, `az-mix-${tag}`),
    trainTag: "train",
    holdoutTag: "holdout",
    generations,
    minSigma: 0.035,
    maxSigma: 0.22,
    minWeight: 0.03,
  });
}
