import {
  optimizeAzulMasterWeights,
  optimizeMasterWeights,
  optimizeSplendorMasterWeights,
} from "./optimizers.ts";
import {
  runAzulMixedTournament,
  runCatanMixedTournament,
  runSplendorMixedTournament,
} from "./runners.ts";

export function runOptimizeBotsCli(argv: readonly string[]): void {
  const mode = argv[2] ?? "benchmark";
  const argCount = Number(argv[3] ?? (mode === "optimize" ? "90" : "60"));

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

    console.log(
      "\n=== Final Gold-Standard Unseen 2,000-Match Validation Per Game (6,000 Unseen Matches) ==="
    );
    const unseenCatan = runCatanMixedTournament(
      500,
      undefined,
      true,
      "gold-unseen-catan"
    );
    console.log(
      "Gold Unseen Catan 4-Tier Mixed (2000 matches):",
      JSON.stringify(unseenCatan)
    );
    const unseenSplendor = runSplendorMixedTournament(
      500,
      true,
      "gold-unseen-splendor"
    );
    console.log(
      "Gold Unseen Splendor 4-Tier Mixed (2000 matches):",
      JSON.stringify(unseenSplendor)
    );
    const unseenAzul = runAzulMixedTournament(500, true, "gold-unseen-azul");
    console.log(
      "Gold Unseen Azul 4-Tier Mixed (2000 matches):",
      JSON.stringify(unseenAzul)
    );
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
