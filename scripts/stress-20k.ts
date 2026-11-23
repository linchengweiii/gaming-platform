import { STRESS_DEFAULTS } from "./stress-20k/config.ts";
import { runHumanMimicIterations } from "./stress-20k/human-mimic-runner.ts";
import { runRobotIterations } from "./stress-20k/robot-runner.ts";

export { runHumanMimicIterations, runRobotIterations };

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("scripts/stress-20k.ts");

if (isMain) {
  console.log(
    "🚀 Running 10,000 Robot Iterations + 10,000 Human-Mimic Iterations..."
  );
  const robotReport = runRobotIterations(
    STRESS_DEFAULTS.defaultTargetIterations
  );
  console.log("🤖 Robot 10,000 Iterations Complete:", robotReport);

  const humanReport = runHumanMimicIterations(
    STRESS_DEFAULTS.defaultTargetIterations
  );
  console.log("🧑 Human-Mimic 10,000 Iterations Complete:", humanReport);
}
