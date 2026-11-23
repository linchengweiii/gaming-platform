import {
  optimizeAzulMasterWeights,
  optimizeMasterWeights,
  optimizeSplendorMasterWeights,
} from "./optimize-bots/optimizers.ts";
import {
  runAzulMixedTournament,
  runCatanMixedTournament,
  runSplendorMixedTournament,
} from "./optimize-bots/runners.ts";

function runOptimizeBotsCli(argv: readonly string[]): void {
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
    console.log(
      "Gold Unseen Catan 4-Tier Mixed (2000 matches):",
      JSON.stringify(runCatanMixedTournament(500, true, "gold-unseen-catan"))
    );
    console.log(
      "Gold Unseen Splendor 4-Tier Mixed (2000 matches):",
      JSON.stringify(
        runSplendorMixedTournament(500, true, "gold-unseen-splendor")
      )
    );
    console.log(
      "Gold Unseen Azul 4-Tier Mixed (2000 matches):",
      JSON.stringify(runAzulMixedTournament(500, true, "gold-unseen-azul"))
    );
  } else {
    console.log(
      `\n=== Running 4-Tier Seat-Balanced Tournaments (${argCount * 4} matches per game) ===`
    );
    console.log(
      "Catan 4-Tier Mixed:",
      JSON.stringify(runCatanMixedTournament(argCount, true))
    );
    console.log(
      "Splendor 4-Tier Mixed:",
      JSON.stringify(runSplendorMixedTournament(argCount))
    );
    console.log(
      "Azul 4-Tier Mixed:",
      JSON.stringify(runAzulMixedTournament(argCount))
    );
  }
}

const isMain =
  Boolean((import.meta as { readonly main?: boolean }).main) ||
  import.meta.url === `file://${process.argv[1]}` ||
  Boolean(process.argv[1]?.endsWith("scripts/optimize-bots.ts"));

if (isMain) {
  runOptimizeBotsCli(process.argv);
}
