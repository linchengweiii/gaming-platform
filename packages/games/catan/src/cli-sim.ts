import { MatchSession, type PlayerDescriptor } from "@gaming-platform/core";
import {
  CatanEngine,
  SCENARIO_CATALOG,
  type ScenarioId,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
} from "./index.ts";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import {
  AzulEngine,
  getAzulActingPlayerId,
} from "@gaming-platform/azul";

const SCENARIOS_TO_RUN: Array<{
  scenarioId: ScenarioId;
  playerCount: number;
  enableHarbormaster?: boolean;
  enableCityWalls?: boolean;
  enableFriendlyRobber?: boolean;
}> = [
  { scenarioId: "standard", playerCount: 4 },
  { scenarioId: "big_island_5_6", playerCount: 6, enableCityWalls: true },
  { scenarioId: "seafarers_new_shores", playerCount: 4, enableHarbormaster: true },
  { scenarioId: "seafarers_four_islands", playerCount: 4 },
  { scenarioId: "seafarers_fog_islands", playerCount: 4, enableFriendlyRobber: true },
];

console.log("=== 1. Catan Multi-Scenario Full-Game Bot Simulation ===");

for (const spec of SCENARIOS_TO_RUN) {
  const players: PlayerDescriptor[] = Array.from({ length: spec.playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    color: "",
    isBot: true,
    botDifficulty: "smart",
  }));

  const initialState = CatanEngine.initGame(
    players,
    {
      scenarioId: spec.scenarioId,
      enableHarbormaster: spec.enableHarbormaster ?? false,
      enableCityWalls: spec.enableCityWalls ?? false,
      enableFriendlyRobber: spec.enableFriendlyRobber ?? false,
    },
    `sim-${spec.scenarioId}-seed-101`
  );

  const session = new MatchSession(CatanEngine, initialState, true);
  let steps = 0;

  while (session.getState().phase !== "GAME_OVER" && steps < 5000) {
    const state = session.getState();
    const actorId = getNextActingPlayerId(state);
    if (!actorId) break;
    const action = CatanEngine.chooseBotAction(state, actorId);
    if (!action) {
      throw new Error(`No bot action found in phase ${state.phase} for ${actorId}`);
    }
    session.dispatch(actorId, action);
    steps++;
  }

  const finalState = session.getState();
  const winner = finalState.players.find((p) => p.id === finalState.winnerId);
  const standings = finalState.players
    .map(
      (p) =>
        `${p.name}: ${computePlayerVictoryPoints(finalState, p.id, false)} VP`
    )
    .join(" | ");

  console.log(
    `✔ [${SCENARIO_CATALOG[spec.scenarioId].name}] Winner: ${winner?.name ?? "None"} in ${finalState.turn} turns (${steps} actions) -> ${standings}`
  );
}

console.log("\n=== 2. Splendor Full-Game Bot Simulation (2P, 3P, 4P) ===");
for (const count of [2, 3, 4]) {
  const players: PlayerDescriptor[] = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    color: "",
    isBot: true,
  }));
  const session = new MatchSession(
    SplendorEngine,
    SplendorEngine.initGame(players, {}, `sim-splendor-${count}p`),
    true
  );
  let steps = 0;
  while (session.getState().phase !== "GAME_OVER" && steps < 500) {
    const state = session.getState();
    const actorId = getSplendorActingPlayerId(state)!;
    const action = SplendorEngine.chooseBotAction(state, actorId)!;
    session.dispatch(actorId, action);
    steps++;
  }
  const finalState = session.getState();
  const winner = finalState.players.find((p) => p.id === finalState.winnerId);
  const standings = finalState.players
    .map((p) => `${p.name}: ${p.points} VP (${p.purchasedCards.length} cards)`)
    .join(" | ");
  console.log(
    `✔ [Splendor ${count}P] Winner: ${winner?.name} in ${finalState.round} rounds (${steps} actions) -> ${standings}`
  );
}

console.log("\n=== 3. Azul Full-Game Bot Simulation (2P, 3P, 4P) ===");
for (const count of [2, 3, 4]) {
  const players: PlayerDescriptor[] = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    color: "",
    isBot: true,
  }));
  const session = new MatchSession(
    AzulEngine,
    AzulEngine.initGame(players, {}, `sim-azul-${count}p`),
    true
  );
  let steps = 0;
  while (session.getState().phase !== "GAME_OVER" && steps < 500) {
    const state = session.getState();
    const actorId = getAzulActingPlayerId(state)!;
    const action = AzulEngine.chooseBotAction(state, actorId)!;
    session.dispatch(actorId, action);
    steps++;
  }
  const finalState = session.getState();
  const winner = finalState.players.find((p) => p.id === finalState.winnerId);
  const standings = finalState.players
    .map((p) => `${p.name}: ${p.score} pts (${p.completedRows} rows)`)
    .join(" | ");
  console.log(
    `✔ [Azul ${count}P] Winner: ${winner?.name} in ${finalState.round} rounds (${steps} actions) -> ${standings}`
  );
}
