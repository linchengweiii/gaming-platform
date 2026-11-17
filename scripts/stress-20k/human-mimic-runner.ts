import { createSeededRng } from "@gaming-platform/core";
import {
  CatanEngine,
  type CatanState,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";
import { createPlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import {
  CATAN_SCENARIOS,
  STRESS_DEFAULTS,
  STRESS_GAME_CYCLE,
  type StressReport,
} from "./config.ts";
import { chooseHumanMimicCatanAction } from "./human-mimic-catan.ts";

/**
 * Runs `targetIterations` mimicking human gameplay across Lobby room creation/joining,
 * Catan (with domestic trades, undo/redo, vertical road clicks, SVG + card hand checks), Splendor, and Azul.
 */
export function runHumanMimicIterations(
  targetIterations: number = STRESS_DEFAULTS.defaultTargetIterations
): StressReport {
  const startTime = performance.now();
  const rng = createSeededRng(STRESS_DEFAULTS.humanMimicSeed);
  const roomManager = createPlatformRoomManager();

  let completedIterations = 0;
  let matchesStarted = 0;
  let matchesCompleted = 0;
  let catanRoadsVerified = 0;
  let verticalERoadsVerified = 0;
  let svgRendersVerified = 0;
  let domesticTradesTested = 0;
  let undoRedoCyclesVerified = 0;
  let readonlyRoomChecksVerified = 0;
  let invariantViolations = 0;

  let matchIdx = 0;

  while (completedIterations < targetIterations) {
    const gameId = STRESS_GAME_CYCLE[matchIdx % STRESS_GAME_CYCLE.length]!;
    matchIdx++;
    matchesStarted++;

    // Mimic Human Lobby Flow:
    // 1. User "human-owner" creates a room in "lobby" status
    const room = roomManager.createRoom({
      name: `Human Match #${matchIdx}`,
      gameId,
      ownerId: "p1",
      hostName: "Human Host",
      botCount: 3,
      autoStart: false,
    });

    // 2. Owner modifies room setup while in lobby
    const scenarioId = CATAN_SCENARIOS[matchIdx % CATAN_SCENARIOS.length]!;
    roomManager.updateRoomSetup(room.roomId, "p1", {
      playerCount:
        gameId === "catan" && scenarioId === "big_island_5_6" ? 5 : 4,
      config:
        gameId === "catan"
          ? {
              scenarioId,
              enableHarbormaster: matchIdx % 2 === 0,
              enableCityWalls: matchIdx % 3 === 0,
              enableFriendlyRobber: matchIdx % 4 === 0,
            }
          : {},
    });

    // 3. Another human ("p2") joins the room and verifies setup is read-only for non-owner
    roomManager.joinRoom(room.roomId, "Joined Human 2", false, "p2");
    let blockedNonOwner = false;
    try {
      roomManager.updateRoomSetup(room.roomId, "p2", {
        playerCount: 3,
      });
    } catch {
      blockedNonOwner = true;
    }
    if (!blockedNonOwner) {
      throw new Error("Non-owner was able to modify room setup!");
    }
    readonlyRoomChecksVerified++;

    // 4. Owner starts the match, and verifies setup is now read-only even for the owner
    roomManager.startGame(room.roomId, "p1");
    let blockedAfterStart = false;
    try {
      roomManager.updateRoomSetup(room.roomId, "p1", {
        playerCount: 3,
      });
    } catch {
      blockedAfterStart = true;
    }
    if (!blockedAfterStart) {
      throw new Error("Setup was modifiable after game started!");
    }
    readonlyRoomChecksVerified++;

    const session = room.session!;
    const knownRoadEdgeIds = new Set<string>();
    let stepsInMatch = 0;

    while (
      completedIterations < targetIterations &&
      session.getState().phase !== "GAME_OVER" &&
      stepsInMatch < STRESS_DEFAULTS.humanMimicMaxSteps
    ) {
      const state = session.getState();

      if (gameId === "catan") {
        const actorId = getNextActingPlayerId(state);
        if (!actorId) break;
        const chosen = chooseHumanMimicCatanAction(
          state as CatanState,
          actorId,
          rng
        );
        if (!chosen) break;

        session.dispatch(chosen.playerId, chosen.action);
        completedIterations++;
        stepsInMatch++;

        if (chosen.isDomesticTrade) {
          domesticTradesTested++;
        }

        const nextState = session.getState() as CatanState;
        const inv = CatanEngine.checkInvariants(nextState);
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Human-mimic Catan invariant violation: ${inv.violations.join("; ")}`
          );
        }

        if (
          chosen.action.type === "BUILD_ROAD" ||
          (chosen.action.type === "PLACE_SETUP_EDGE" &&
            chosen.action.edgeKind === "road")
        ) {
          knownRoadEdgeIds.add(chosen.action.edgeId);
        }

        // Mimic Human Undo + Redo interaction every 50 steps
        if (
          completedIterations % STRESS_DEFAULTS.humanUndoCheckInterval === 0 &&
          session.canUndo()
        ) {
          const snapshotEdges = JSON.stringify(nextState.edges);
          session.undo();
          session.redo();
          if (JSON.stringify(session.getState().edges) !== snapshotEdges) {
            throw new Error("Undo/Redo corrupted road edges!");
          }
          undoRedoCyclesVerified++;
        }

        // Verify all roads remain on the board
        for (const rEdgeId of knownRoadEdgeIds) {
          const rPiece = nextState.edges[rEdgeId];
          if (!rPiece || rPiece.type !== "road") {
            throw new Error(
              `Human-placed road on ${rEdgeId} disappeared from state!`
            );
          }
          catanRoadsVerified++;
          if (nextState.topology.edges[rEdgeId]?.dir === "E") {
            verticalERoadsVerified++;
          }
        }

        // Periodically render SVG + Visual Hand Cards to verify UI rendering
        if (completedIterations % STRESS_DEFAULTS.humanSvgCheckInterval === 0) {
          const svg = renderCatanBoardSvg(nextState, actorId, {
            buildMode: "road",
            setupEdgeKind: "road",
            robberOrPirateMode: "robber",
            selectedMoveFromEdgeId: null,
          });
          const handHtml = renderCatanVisualHandTray(
            nextState,
            nextState.players[0]!,
            CatanEngine.getLegalActions(nextState, nextState.players[0]!.id)
          );
          if (
            !svg.includes('class="ocean-frame-hex"') ||
            !handHtml.includes("resource-playing-card")
          ) {
            throw new Error("Missing ocean frame or visual hand cards in UI!");
          }
          for (const rEdgeId of knownRoadEdgeIds) {
            if (!svg.includes(`data-road-edge-id="${rEdgeId}"`)) {
              throw new Error(
                `Human road ${rEdgeId} missing from rendered SVG!`
              );
            }
          }
          svgRendersVerified++;
        }
      } else if (gameId === "splendor") {
        const actorId = getSplendorActingPlayerId(state);
        if (!actorId) break;
        const legal = SplendorEngine.getLegalActions(state, actorId);
        if (legal.length === 0) break;
        const action = rng.pick(legal);
        session.dispatch(actorId, action);
        completedIterations++;
        stepsInMatch++;

        const inv = SplendorEngine.checkInvariants(session.getState());
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Human-mimic Splendor invariant violation: ${inv.violations.join("; ")}`
          );
        }
      } else {
        const actorId = getAzulActingPlayerId(state);
        if (!actorId) break;
        const legal = AzulEngine.getLegalActions(state, actorId);
        if (legal.length === 0) break;
        const patternMoves = legal.filter(
          (a) => a.type === "DRAFT_TILES" && a.targetLine !== "floor"
        );
        const action =
          patternMoves.length > 0 && rng.nextFloat() < 0.8
            ? rng.pick(patternMoves)
            : rng.pick(legal);
        session.dispatch(actorId, action);
        completedIterations++;
        stepsInMatch++;

        const inv = AzulEngine.checkInvariants(session.getState());
        if (!inv.valid) {
          invariantViolations += inv.violations.length;
          throw new Error(
            `Human-mimic Azul invariant violation: ${inv.violations.join("; ")}`
          );
        }
      }
    }

    if (session.getState().phase === "GAME_OVER") {
      matchesCompleted++;
    }
  }

  return {
    mode: "human_mimic",
    targetIterations,
    completedIterations,
    matchesStarted,
    matchesCompleted,
    catanRoadsVerified,
    verticalERoadsVerified,
    svgRendersVerified,
    domesticTradesTested,
    undoRedoCyclesVerified,
    readonlyRoomChecksVerified,
    invariantViolations,
    elapsedMs: Math.round(performance.now() - startTime),
  };
}
