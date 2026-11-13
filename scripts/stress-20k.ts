import { MatchSession, type PlayerDescriptor, SeededRNG } from "@gaming-platform/core";
import {
  type CatanAction,
  CatanEngine,
  type CatanState,
  PLAYER_COLORS,
  RESOURCES,
  type ScenarioId,
  emptyResources,
  getNextActingPlayerId,
  hasResources,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";
import { PlatformRoomManager } from "../apps/server/src/room-manager.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../apps/web/src/catan-graphics.ts";

export interface StressReport {
  mode: "robot" | "human_mimic";
  targetIterations: number;
  completedIterations: number;
  matchesStarted: number;
  matchesCompleted: number;
  catanRoadsVerified: number;
  verticalERoadsVerified: number;
  svgRendersVerified: number;
  domesticTradesTested: number;
  undoRedoCyclesVerified: number;
  readonlyRoomChecksVerified: number;
  invariantViolations: number;
  elapsedMs: number;
}

const CATAN_SCENARIOS: ScenarioId[] = [
  "standard",
  "big_island_5_6",
  "seafarers_new_shores",
  "seafarers_four_islands",
  "seafarers_fog_islands",
];

function makePlayers(count: number, allBots: boolean): PlayerDescriptor[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: allBots ? `Robot ${i + 1}` : `HumanMimic ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    isBot: allBots,
    botDifficulty: "smart",
  }));
}

/**
 * Runs `targetIterations` playing as Robots (heuristic AI bot moves across Catan, Splendor, and Azul).
 */
export function runRobotIterations(targetIterations = 10000): StressReport {
  const startTime = performance.now();
  let completedIterations = 0;
  let matchesStarted = 0;
  let matchesCompleted = 0;
  let catanRoadsVerified = 0;
  let verticalERoadsVerified = 0;
  let svgRendersVerified = 0;
  let invariantViolations = 0;

  const gameCycle: Array<"catan" | "splendor" | "azul"> = [
    "catan",
    "catan",
    "splendor",
    "azul",
  ];
  let matchIdx = 0;

  while (completedIterations < targetIterations) {
    const gameId = gameCycle[matchIdx % gameCycle.length]!;
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
      const session = new MatchSession(CatanEngine, initialState, true);

      // Track placed roads (roads can NEVER disappear once placed; only ships can move via MOVE_SHIP)
      const knownRoadEdgeIds = new Set<string>();
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < 600
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
        if (completedIterations % 250 === 0) {
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
      const session = new MatchSession(SplendorEngine, initialState, true);
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < 300
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
      const session = new MatchSession(AzulEngine, initialState, true);
      let stepsInMatch = 0;

      while (
        completedIterations < targetIterations &&
        session.getState().phase !== "GAME_OVER" &&
        stepsInMatch < 300
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

/**
 * Chooses a human-mimic action:
 * Simulates human UI click patterns (diverse vertex/edge clicks including vertical E edges,
 * domestic trade offers/accepts/cancels, maritime trades, dev card plays, and exploratory builds).
 */
function chooseHumanMimicCatanAction(
  state: CatanState,
  actorId: string,
  rng: SeededRNG
): { playerId: string; action: CatanAction; isDomesticTrade?: boolean } | null {
  // If there is an active domestic trade offer, mimic responders accepting/declining and proposer selecting who to trade with
  if (state.activeTradeOffer) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    if (accepted.length > 0 && (actorId === offer.fromPlayerId || rng.nextFloat() < 0.35)) {
      if (rng.nextFloat() < 0.9) {
        return {
          playerId: offer.fromPlayerId,
          action: {
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: offer.id,
            partnerId: rng.pick(accepted),
          },
          isDomesticTrade: true,
        };
      }
      return {
        playerId: offer.fromPlayerId,
        action: { type: "CANCEL_DOMESTIC_TRADE" },
        isDomesticTrade: true,
      };
    }
    if (actorId !== offer.fromPlayerId) {
      const responder = state.players.find((p) => p.id === actorId);
      if (responder && hasResources(responder.resources, offer.want) && rng.nextFloat() < 0.65) {
        return {
          playerId: responder.id,
          action: { type: "ACCEPT_DOMESTIC_TRADE", offerId: offer.id },
          isDomesticTrade: true,
        };
      }
      return {
        playerId: actorId,
        action: { type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id },
        isDomesticTrade: true,
      };
    }
    return {
      playerId: offer.fromPlayerId,
      action: { type: "CANCEL_DOMESTIC_TRADE" },
      isDomesticTrade: true,
    };
  }

  const legal = CatanEngine.getLegalActions(state, actorId);
  if (legal.length === 0) return null;

  // During setup road placement, intentionally prefer vertical E edges 50% of the time when available to stress-test vertical roads
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const verticalSetupEdges = legal.filter(
      (a) =>
        a.type === "PLACE_SETUP_EDGE" &&
        state.topology.edges[a.edgeId]?.dir === "E"
    );
    if (verticalSetupEdges.length > 0 && rng.nextFloat() < 0.6) {
      return {
        playerId: actorId,
        action: rng.pick(verticalSetupEdges),
      };
    }
    return {
      playerId: actorId,
      action: rng.pick(legal),
    };
  }

  // During MAIN_PHASE, mimic human behavior:
  // 1. Sometimes propose a domestic trade offer to other players
  if (state.phase === "MAIN_PHASE") {
    const actor = state.players.find((p) => p.id === actorId)!;
    const ownedRes = RESOURCES.filter((r) => actor.resources[r] > 0);
    if (ownedRes.length > 0 && rng.nextFloat() < 0.08) {
      const giveRes = rng.pick(ownedRes);
      const wantRes = rng.pick(RESOURCES.filter((r) => r !== giveRes));
      const give = emptyResources();
      const want = emptyResources();
      give[giveRes] = 1;
      want[wantRes] = 1;
      return {
        playerId: actorId,
        action: {
          type: "OFFER_DOMESTIC_TRADE",
          toPlayerId: null,
          give,
          want,
        },
        isDomesticTrade: true,
      };
    }

    // 2. Prioritize building settlements, cities, roads (especially vertical E edges), dev cards, or playing dev cards
    const highValueActions = legal.filter(
      (a) =>
        a.type === "BUILD_CITY" ||
        a.type === "BUILD_SETTLEMENT" ||
        a.type === "BUILD_ROAD" ||
        a.type === "BUILD_SHIP" ||
        a.type === "BUILD_CITY_WALL" ||
        a.type === "BUY_DEV_CARD" ||
        a.type === "PLAY_KNIGHT" ||
        a.type === "PLAY_ROAD_BUILDING" ||
        a.type === "PLAY_YEAR_OF_PLENTY" ||
        a.type === "PLAY_MONOPOLY"
    );
    if (highValueActions.length > 0 && rng.nextFloat() < 0.85) {
      return {
        playerId: actorId,
        action: rng.pick(highValueActions),
      };
    }

    // 3. Otherwise maritime trade, move ship, or end turn
    const nonEndActions = legal.filter((a) => a.type !== "END_TURN");
    if (nonEndActions.length > 0 && rng.nextFloat() < 0.35) {
      return {
        playerId: actorId,
        action: rng.pick(nonEndActions),
      };
    }

    const endTurn = legal.find((a) => a.type === "END_TURN");
    if (endTurn) {
      return { playerId: actorId, action: endTurn };
    }
  }

  // For any other phase (PRE_ROLL, DISCARD_ON_SEVEN, MOVE_ROBBER_OR_PIRATE, STEAL_RESOURCE, etc.), pick randomly among legal human choices
  return {
    playerId: actorId,
    action: rng.pick(legal),
  };
}

/**
 * Runs `targetIterations` mimicking human gameplay across Lobby room creation/joining,
 * Catan (with domestic trades, undo/redo, vertical road clicks, SVG + card hand checks), Splendor, and Azul.
 */
export function runHumanMimicIterations(
  targetIterations = 10000
): StressReport {
  const startTime = performance.now();
  const rng = new SeededRNG("human-mimic-10000-seed");
  const roomManager = new PlatformRoomManager();

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

  const gameCycle: Array<"catan" | "catan" | "splendor" | "azul"> = [
    "catan",
    "catan",
    "splendor",
    "azul",
  ];
  let matchIdx = 0;

  while (completedIterations < targetIterations) {
    const gameId = gameCycle[matchIdx % gameCycle.length]!;
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
      stepsInMatch < 550
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
        if (completedIterations % 50 === 0 && session.canUndo()) {
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
        if (completedIterations % 200 === 0) {
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
        // Human mimic: pick randomly among legal purchases/drafts/reserves
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
        // Human mimic: prefer pattern line placements over floor dumping 80% of the time
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

// Run both 10,000 Robot iterations and 10,000 Human-Mimic iterations when executed directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("scripts/stress-20k.ts");

if (isMain) {
  console.log(
    "🚀 Running 10,000 Robot Iterations + 10,000 Human-Mimic Iterations..."
  );
  const robotReport = runRobotIterations(10000);
  console.log("🤖 Robot 10,000 Iterations Complete:", robotReport);

  const humanReport = runHumanMimicIterations(10000);
  console.log("🧑 Human-Mimic 10,000 Iterations Complete:", humanReport);
}
