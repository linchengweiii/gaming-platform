import { describe, expect, test } from "bun:test";
import type { BotDifficulty } from "../../packages/core/src/index.ts";
import {
  CatanEngine,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerResourceCount,
  type CatanConfig,
  type CatanState,
} from "../../packages/games/catan/src/index.ts";
import {
  SplendorEngine,
  type SplendorState,
} from "../../packages/games/splendor/src/index.ts";
import {
  AzulEngine,
  type AzulState,
} from "../../packages/games/azul/src/index.ts";
import {
  loadOrCreateGoldenKey,
  makePlayers,
  withDeterministicClockAndRandom,
} from "./golden-store.ts";

function runCatanTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  config: Partial<CatanConfig>,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: CatanState = CatanEngine.initGame(players, config, seed);
    let steps = 0;
    let checkpoint25: unknown = null;

    while (CatanEngine.getWinner(state) === null && steps < 2500) {
      const actorId = getNextActingPlayerId(state);
      if (!actorId) break;
      const action = CatanEngine.chooseBotAction(state, actorId);
      if (!action) {
        throw new Error(`Null bot action in ${label} at step ${steps}`);
      }
      const next = CatanEngine.applyAction(state, actorId, action);
      const inv = CatanEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Catan invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 25) {
        const p1View = CatanEngine.getPlayerView(state, "p1");
        checkpoint25 = {
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          legalCountForActor: getNextActingPlayerId(state)
            ? CatanEngine.getLegalActions(state, getNextActingPlayerId(state)!)
                .length
            : 0,
          p1ViewSummary: {
            devCardDeckLength: p1View.devCardDeck.length,
            players: p1View.players.map((p) => ({
              id: p.id,
              handRedacted: Boolean(p.handRedacted),
              resourceCount:
                p.hiddenResourceCount ?? getPlayerResourceCount(p),
              victoryPoints: computePlayerVictoryPoints(p1View, p.id),
              devCardTypes: p.devCards.map((d) => d.type),
            })),
          },
        };
      }
    }

    return {
      label,
      steps,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      longestRoadOwnerId: state.longestRoadOwnerId,
      longestRoadLength: state.longestRoadLength,
      largestArmyOwnerId: state.largestArmyOwnerId,
      harbormasterOwnerId: state.harbormasterOwnerId,
      bank: state.bank,
      players: state.players.map((p) => ({
        id: p.id,
        victoryPoints: computePlayerVictoryPoints(state, p.id),
        resources: p.resources,
        settlementsRemaining: p.settlementsRemaining,
        citiesRemaining: p.citiesRemaining,
        roadsRemaining: p.roadsRemaining,
        shipsRemaining: p.shipsRemaining,
        knightsPlayed: p.knightsPlayed,
        harborPoints: p.harborPoints,
        bonusVictoryPoints: p.bonusVictoryPoints,
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint25,
    };
  });
}

function runSplendorTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: SplendorState = SplendorEngine.initGame(
      players,
      { targetPoints: 15 },
      seed
    );
    let steps = 0;
    let checkpoint20: unknown = null;

    while (SplendorEngine.getWinner(state) === null && steps < 1000) {
      const actor = state.players[state.activePlayerIndex]!;
      const action = SplendorEngine.chooseBotAction(state, actor.id);
      if (!action) {
        throw new Error(`Null Splendor bot action in ${label} at step ${steps}`);
      }
      const next = SplendorEngine.applyAction(state, actor.id, action);
      const inv = SplendorEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Splendor invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 20) {
        checkpoint20 = {
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          bank: state.bank,
          marketIds: {
            1: state.market[1].map((c) => c.id),
            2: state.market[2].map((c) => c.id),
            3: state.market[3].map((c) => c.id),
          },
        };
      }
    }

    return {
      label,
      steps,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      bank: state.bank,
      nobleIds: state.nobles.map((n) => n.id),
      players: state.players.map((p) => ({
        id: p.id,
        points: p.points,
        tokens: p.tokens,
        bonuses: p.bonuses,
        purchasedCount: p.purchasedCards.length,
        reservedCount: p.reservedCards.length,
        nobleIds: p.nobles.map((n) => n.id),
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint20,
    };
  });
}

function runAzulTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: AzulState = AzulEngine.initGame(players, {}, seed);
    let steps = 0;
    let checkpoint20: unknown = null;

    while (AzulEngine.getWinner(state) === null && steps < 1000) {
      const actor = state.players[state.activePlayerIndex]!;
      const action = AzulEngine.chooseBotAction(state, actor.id);
      if (!action) {
        throw new Error(`Null Azul bot action in ${label} at step ${steps}`);
      }
      const next = AzulEngine.applyAction(state, actor.id, action);
      const inv = AzulEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Azul invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 20) {
        checkpoint20 = {
          round: state.round,
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          factories: state.factories,
          centerPool: state.centerPool,
        };
      }
    }

    return {
      label,
      steps,
      round: state.round,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      bagCount: state.bag.length,
      discardCount: state.discardLid.length,
      players: state.players.map((p) => ({
        id: p.id,
        score: p.score,
        wall: p.wall,
        floorLine: p.floorLine,
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint20,
    };
  });
}

function collectCatanTrajectories() {
  return [
    runCatanTrajectory(
      "catan-standard-4p",
      4,
      "golden-catan-std-4p",
      { scenarioId: "standard" },
      ["master", "smart", "normal", "easy"]
    ),
    runCatanTrajectory(
      "catan-ext-5p",
      5,
      "golden-catan-ext-5p",
      { scenarioId: "big_island_5_6" },
      ["smart", "normal", "master", "normal", "easy"]
    ),
    runCatanTrajectory(
      "catan-new-shores-4p",
      4,
      "golden-catan-new-shores",
      { scenarioId: "seafarers_new_shores" },
      ["master", "smart", "normal", "smart"]
    ),
    runCatanTrajectory(
      "catan-fog-islands-4p",
      4,
      "golden-catan-fog",
      { scenarioId: "seafarers_fog_islands" },
      ["smart", "normal", "smart", "normal"]
    ),
    runCatanTrajectory(
      "catan-variants-4p",
      4,
      "golden-catan-variants",
      {
        scenarioId: "standard",
        enableHarbormaster: true,
        enableCityWalls: true,
        enableFriendlyRobber: true,
      },
      ["master", "smart", "normal", "smart"]
    ),
  ];
}

function collectSplendorTrajectories() {
  return [
    runSplendorTrajectory("splendor-2p", 2, "golden-splendor-2p", [
      "master",
      "smart",
    ]),
    runSplendorTrajectory("splendor-3p", 3, "golden-splendor-3p", [
      "master",
      "smart",
      "normal",
    ]),
    runSplendorTrajectory("splendor-4p", 4, "golden-splendor-4p", [
      "master",
      "smart",
      "normal",
      "easy",
    ]),
  ];
}

function collectAzulTrajectories() {
  return [
    runAzulTrajectory("azul-2p", 2, "golden-azul-2p", ["master", "smart"]),
    runAzulTrajectory("azul-3p", 3, "golden-azul-3p", [
      "master",
      "smart",
      "normal",
    ]),
    runAzulTrajectory("azul-4p", 4, "golden-azul-4p", [
      "master",
      "smart",
      "normal",
      "easy",
    ]),
  ];
}

describe("Functional Refactoring Golden Game Trajectories Parity", () => {
  const goldenCatan = loadOrCreateGoldenKey(
    "catanTrajectories",
    collectCatanTrajectories
  );
  const goldenSplendor = loadOrCreateGoldenKey(
    "splendorTrajectories",
    collectSplendorTrajectories
  );
  const goldenAzul = loadOrCreateGoldenKey(
    "azulTrajectories",
    collectAzulTrajectories
  );

  test("preserves exact deterministic full-game trajectories for Catan, Splendor, and Azul", () => {
    expect(collectCatanTrajectories()).toEqual(goldenCatan);
    expect(collectSplendorTrajectories()).toEqual(goldenSplendor);
    expect(collectAzulTrajectories()).toEqual(goldenAzul);
  });
});
