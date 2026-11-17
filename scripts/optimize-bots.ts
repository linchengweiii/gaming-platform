import { runOptimizeBotsCli } from "./optimize-bots/report.ts";

export type { TournamentSummary } from "./optimize-bots/config.ts";
export {
  evaluateMasterVsSmartAzul,
  evaluateMasterVsSmartCatan,
  evaluateMasterVsSmartSplendor,
  runAzulMixedTournament,
  runCatanMixedTournament,
  runSplendorMixedTournament,
} from "./optimize-bots/runners.ts";
export {
  optimizeAzulMasterWeights,
  optimizeMasterWeights,
  optimizeSplendorMasterWeights,
} from "./optimize-bots/optimizers.ts";

const isMain =
  Boolean((import.meta as { readonly main?: boolean }).main) ||
  import.meta.url === `file://${process.argv[1]}` ||
  Boolean(process.argv[1]?.endsWith("scripts/optimize-bots.ts"));

if (isMain) {
  runOptimizeBotsCli(process.argv);
}
