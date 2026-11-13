import {
  type GameEngine,
  type MatchSessionState,
  type PlayerDescriptor,
  createMatchSessionState,
  dispatchSessionActionPure,
  getSessionState,
} from "@gaming-platform/core";
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

const SCENARIOS_TO_RUN: ReadonlyArray<{
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

function makeBotPlayers(count: number): PlayerDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot ${i + 1}`,
    color: "",
    isBot: true,
    botDifficulty: "smart",
  }));
}

function runSessionUntilFinishedPure<
  TState extends { phase: string },
  TConfig,
  TAction extends { type: string },
>(
  engine: GameEngine<TState, TConfig, TAction>,
  initialSession: MatchSessionState<TState, TAction>,
  getActorId: (state: TState) => string | null,
  maxSteps: number
): { finalState: TState; steps: number } {
  let session = initialSession;
  let steps = 0;

  while (getSessionState(session).phase !== "GAME_OVER" && steps < maxSteps) {
    const state = getSessionState(session);
    const actorId = getActorId(state);
    if (!actorId) break;
    const action = engine.chooseBotAction(state, actorId);
    if (!action) {
      throw new Error(
        `No bot action found in phase ${state.phase} for ${actorId}`
      );
    }
    session = dispatchSessionActionPure(engine, session, actorId, action).session;
    steps += 1;
  }

  return { finalState: getSessionState(session), steps };
}

console.log("=== 1. Catan Multi-Scenario Full-Game Bot Simulation ===");

SCENARIOS_TO_RUN.forEach((spec) => {
  const players = makeBotPlayers(spec.playerCount);
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

  const { finalState, steps } = runSessionUntilFinishedPure(
    CatanEngine,
    createMatchSessionState(CatanEngine, initialState, true),
    getNextActingPlayerId,
    5000
  );

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
});

console.log("\n=== 2. Splendor Full-Game Bot Simulation (2P, 3P, 4P) ===");

([2, 3, 4] as const).forEach((count) => {
  const players = makeBotPlayers(count);
  const initialState = SplendorEngine.initGame(
    players,
    {},
    `sim-splendor-${count}p`
  );
  const { finalState, steps } = runSessionUntilFinishedPure(
    SplendorEngine,
    createMatchSessionState(SplendorEngine, initialState, true),
    getSplendorActingPlayerId,
    500
  );
  const winner = finalState.players.find((p) => p.id === finalState.winnerId);
  const standings = finalState.players
    .map((p) => `${p.name}: ${p.points} VP (${p.purchasedCards.length} cards)`)
    .join(" | ");
  console.log(
    `✔ [Splendor ${count}P] Winner: ${winner?.name} in ${finalState.round} rounds (${steps} actions) -> ${standings}`
  );
});

console.log("\n=== 3. Azul Full-Game Bot Simulation (2P, 3P, 4P) ===");

([2, 3, 4] as const).forEach((count) => {
  const players = makeBotPlayers(count);
  const initialState = AzulEngine.initGame(players, {}, `sim-azul-${count}p`);
  const { finalState, steps } = runSessionUntilFinishedPure(
    AzulEngine,
    createMatchSessionState(AzulEngine, initialState, true),
    getAzulActingPlayerId,
    500
  );
  const winner = finalState.players.find((p) => p.id === finalState.winnerId);
  const standings = finalState.players
    .map((p) => `${p.name}: ${p.score} pts (${p.completedRows} rows)`)
    .join(" | ");
  console.log(
    `✔ [Azul ${count}P] Winner: ${winner?.name} in ${finalState.round} rounds (${steps} actions) -> ${standings}`
  );
});
