import { createMatchSession } from "@gaming-platform/core";
import { CatanEngine, getNextActingPlayerId } from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";
import { renderCatanBoardSvg } from "../../apps/web/src/catan-graphics.ts";
import {
  CATAN_SCENARIOS,
  STRESS_DEFAULTS,
  STRESS_GAME_CYCLE,
  type StressReport,
  makePlayers,
} from "./config.ts";

/**
 * Runs `targetIterations` playing as Robots (heuristic AI bot moves across Catan, Splendor, and Azul).
 */
export function runRobotIterations(
  targetIterations: number = STRESS_DEFAULTS.defaultTargetIterations
): StressReport {
  const startTime = performance.now();
  let completedIterations = 0;
  let matchesStarted = 0;
  let matchesCompleted = 0;
  let catanRoadsVerified = 0;
  let verticalERoadsVerified = 0;
  let svgRendersVerified = 0;
  let invariantViolations = 0;

  let matchIdx = 0;

  while (completedIterations < targetIterations) {
    const gameId = STRESS_GAME_CYCLE[matchIdx % STRESS_GAME_CYCLE.length]!;
    matchIdx++;
    matchesStarted++;

    if (gameId === "catan") {
      const scenarioId = CATAN_SCENARIOS[matchIdx % CATAN_SCENARIOS.length]!;
      const playerCount = scenarioId === "big_island_5_6" ? 5 : 4;
      const players = makePlayers(playerCount, true);
      const initialState = CatanEngine.initGame(
        players,
        {
          scenarioId,
          enableHarbormaster: matchIdx % 2 === 0,
          enableCityWalls: matchIdx % 3 === 0,
          enableFriendlyRobber: matchIdx % 4 === 0,
        },
        `robot-catan-${matchIdx}`
      );
      const session = createMatchSession(CatanEngine, initialState, true);

      // Track placed roads (roads can NEVER disappear once placed; only ships can move via MOVE_SHIP)
      const knownRoadEdgeIds = new Set<string>();
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < STRESS_DEFAULTS.robotCatanMaxSteps
      ) {
        const state = session.getState();
        const actorId = getNextActingPlayerId(state);
        if (!actorId) break;
        const action = CatanEngine.chooseBotAction(state, actorId);
        if (!action) break;

        session.dispatch(actorId, action);
        completedIterations++;
        stepsInMatch++;

        const nextState = session.getState();
        const inv = CatanEngine.checkInvariants(nextState);
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Robot Catan invariant violation: ${inv.violations.join("; ")}`
          );
        }

        if (
          action.type === "BUILD_ROAD" ||
          (action.type === "PLACE_SETUP_EDGE" && action.edgeKind === "road")
        ) {
          knownRoadEdgeIds.add(action.edgeId);
        }

        // Verify all known roads still exist on the map and never disappeared
        for (const rEdgeId of knownRoadEdgeIds) {
          const rPiece = nextState.edges[rEdgeId];
          if (!rPiece || rPiece.type !== "road") {
            throw new Error(`Road on edge ${rEdgeId} disappeared from state!`);
          }
          catanRoadsVerified++;
          if (nextState.topology.edges[rEdgeId]?.dir === "E") {
            verticalERoadsVerified++;
          }
        }

        // Periodically verify SVG rendering of all roads
        if (completedIterations % STRESS_DEFAULTS.robotSvgCheckInterval === 0) {
          const svg = renderCatanBoardSvg(nextState, actorId, {
            buildMode: null,
            setupEdgeKind: "road",
            robberOrPirateMode: "robber",
            selectedMoveFromEdgeId: null,
          });
          for (const rEdgeId of knownRoadEdgeIds) {
            if (!svg.includes(`data-road-edge-id="${rEdgeId}"`)) {
              throw new Error(
                `Road on edge ${rEdgeId} missing from rendered SVG!`
              );
            }
          }
          svgRendersVerified++;
        }
      }

      if (session.getState().phase === "GAME_OVER") {
        matchesCompleted++;
      }
    } else if (gameId === "splendor") {
      const playerCount = 2 + (matchIdx % 3);
      const players = makePlayers(playerCount, true);
      const initialState = SplendorEngine.initGame(
        players,
        {},
        `robot-splendor-${matchIdx}`
      );
      const session = createMatchSession(SplendorEngine, initialState, true);
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < STRESS_DEFAULTS.robotOtherMaxSteps
      ) {
        const state = session.getState();
        const actorId = getSplendorActingPlayerId(state);
        if (!actorId) break;
        const action = SplendorEngine.chooseBotAction(state, actorId);
        if (!action) break;

        session.dispatch(actorId, action);
        completedIterations++;
        stepsInMatch++;

        const inv = SplendorEngine.checkInvariants(session.getState());
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Robot Splendor invariant violation: ${inv.violations.join("; ")}`
          );
        }
      }

      if (session.getState().phase === "GAME_OVER") {
        matchesCompleted++;
      }
    } else {
      const playerCount = 2 + (matchIdx % 3);
      const players = makePlayers(playerCount, true);
      const initialState = AzulEngine.initGame(
        players,
        {},
        `robot-azul-${matchIdx}`
      );
      const session = createMatchSession(AzulEngine, initialState, true);
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < STRESS_DEFAULTS.robotOtherMaxSteps
      ) {
        const state = session.getState();
        const actorId = getAzulActingPlayerId(state);
        if (!actorId) break;
        const action = AzulEngine.chooseBotAction(state, actorId);
        if (!action) break;

        session.dispatch(actorId, action);
        completedIterations++;
        stepsInMatch++;

        const inv = AzulEngine.checkInvariants(session.getState());
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Robot Azul invariant violation: ${inv.violations.join("; ")}`
          );
        }
      }

      if (session.getState().phase === "GAME_OVER") {
        matchesCompleted++;
      }
    }
  }

  return {
    mode: "robot",
    targetIterations,
    completedIterations,
    matchesStarted,
    matchesCompleted,
    catanRoadsVerified,
    verticalERoadsVerified,
    svgRendersVerified,
    domesticTradesTested: 0,
    undoRedoCyclesVerified: 0,
    readonlyRoomChecksVerified: 0,
    invariantViolations,
    elapsedMs: Math.round(performance.now() - startTime),
  };
}
