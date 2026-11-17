import { describe, expect, test } from "bun:test";
import {
  SeededRNG,
  buildHexBoardTopology,
  computeLongestSimpleEdgePath,
  generateHexRadiusCoords,
  type EdgeId,
  type VertexId,
} from "../../packages/core/src/index.ts";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { PlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  loadOrCreateGoldenKey,
  withDeterministicClockAndRandom,
} from "./golden-store.ts";

function collectPrngSnapshot() {
  const hashInputs = [
    "",
    "catan-seed-42",
    "splendor-golden",
    "azul-golden",
    "0",
    "unicode-dice-test-777",
  ];
  const hashes = Object.fromEntries(
    hashInputs.map((input) => [input, SeededRNG.hashString(input)])
  );

  const seeds: Array<string | number> = ["catan-seed-42", 123456789, 0];
  const streams = seeds.map((seed) => {
    const rng = new SeededRNG(seed);
    const initialState = rng.getState();
    const floats = Array.from({ length: 20 }, () => rng.nextFloat());
    const ints = Array.from({ length: 20 }, (_, idx) =>
      rng.nextInt(-5, idx + 5)
    );
    const rolls = Array.from({ length: 20 }, () => rng.roll2d6());
    const shuffled = rng.shuffle([
      "brick",
      "lumber",
      "wool",
      "grain",
      "ore",
      "desert",
      "gold",
      "ocean",
    ]);
    const picked = rng.pick(shuffled);
    const checkpointState = rng.getState();
    const resumed = SeededRNG.fromState(checkpointState);
    const resumedFloats = Array.from({ length: 10 }, () =>
      resumed.nextFloat()
    );
    return {
      seed: String(seed),
      initialState,
      floats,
      ints,
      rolls,
      shuffled,
      picked,
      checkpointState,
      resumedFloats,
      finalState: resumed.getState(),
    };
  });

  return { hashes, streams };
}

function collectHexAndPathSnapshot() {
  const coords = generateHexRadiusCoords(2);
  const topology = buildHexBoardTopology(coords, 58);

  const hexRingEdgeIds = topology.hexes[topology.hexOrder[0]!]!.sideEdgeIds;
  const ringLongest = computeLongestSimpleEdgePath(
    topology,
    hexRingEdgeIds,
    new Set<VertexId>()
  );

  // Branched network with opponent settlement blocking one middle vertex
  const sampleEdgeIds = topology.edgeOrder.slice(0, 12);
  const branchedUnblocked = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>()
  );
  const blockedVertexId = topology.edges[sampleEdgeIds[3]!]!.v1;
  const branchedBlocked = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>([blockedVertexId])
  );

  // Seafarers road-to-ship transition constraint
  const kindByEdgeId = new Map<EdgeId, "road" | "ship">(
    sampleEdgeIds.map((id, idx) => [id, idx % 2 === 0 ? "road" : "ship"])
  );
  const harborSettlementVertex = topology.edges[sampleEdgeIds[0]!]!.v2;
  const transitionFiltered = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>(),
    (e1: EdgeId, e2: EdgeId, sharedVertex: VertexId) =>
      kindByEdgeId.get(e1) === kindByEdgeId.get(e2) ||
      sharedVertex === harborSettlementVertex
  );

  return {
    coordCount: coords.length,
    firstFiveCoords: coords.slice(0, 5),
    lastFiveCoords: coords.slice(-5),
    hexOrder: topology.hexOrder,
    vertexCount: topology.vertexOrder.length,
    edgeCount: topology.edgeOrder.length,
    sampleVertices: topology.vertexOrder
      .slice(0, 6)
      .map((id) => topology.vertices[id]),
    sampleEdges: topology.edgeOrder.slice(0, 6).map((id) => topology.edges[id]),
    ringLongest,
    branchedUnblocked,
    branchedBlocked,
    transitionFiltered,
  };
}

function collectRoomManagerSnapshot() {
  return withDeterministicClockAndRandom(() => {
    const manager = new PlatformRoomManager();
    const room = manager.createRoom({
      name: "Golden Parity Room",
      gameId: "catan",
      ownerId: "p1",
      hostName: "Alice",
      seed: "golden-room-seed",
      startingPlayerMode: "first",
    });
    manager.joinRoom(room.roomId, "Bob", false, "p2");
    manager.addLocalPlayer(room.roomId, "p1", "Charlie");
    manager.updateRoomSetup(room.roomId, "p1", {
      botCount: 1,
      botDifficulty: "master",
      startingPlayerMode: "first",
      config: {
        scenarioId: "standard",
        enableHarbormaster: true,
      },
    });
    const preStartSummary = manager.toRoomSummary(room, "p1");

    manager.startGame(room.roomId, "p1");
    const firstLegal = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    )[0]!;
    manager.dispatchAction(room.roomId, "p1", firstLegal);
    const afterFirstMoveP1 = manager.toRoomSummary(room, "p1");
    const afterFirstMoveP2 = manager.toRoomSummary(room, "p2");

    manager.undoAction(room.roomId, "p1");
    const afterUndoP1 = manager.toRoomSummary(room, "p1");
    manager.redoAction(room.roomId, "p1");
    const afterRedoP1 = manager.toRoomSummary(room, "p1");

    // Finish snake draft through p1/p2/local/bot
    while (room.session!.getState().phase.startsWith("SETUP_")) {
      const cur = room.session!.getState();
      const actId = getNextActingPlayerId(cur)!;
      const playerEntry = room.players.find((p) => p.id === actId)!;
      if (playerEntry.isBot) {
        manager.stepBot(room.roomId);
      } else {
        const act = CatanEngine.chooseBotAction(cur, actId)!;
        manager.dispatchAction(room.roomId, actId, act);
      }
    }

    const postSetupSummaryP1 = manager.toRoomSummary(room, "p1");
    const postSetupSummaryP2 = manager.toRoomSummary(room, "p2");
    const p1StateView = CatanEngine.getPlayerView(
      room.session!.getState(),
      "p1"
    );
    const p2StateView = CatanEngine.getPlayerView(
      room.session!.getState(),
      "p2"
    );

    return {
      registeredGames: manager.registry.list(),
      preStartSummary: {
        roomId: preStartSummary.roomId,
        name: preStartSummary.name,
        status: preStartSummary.status,
        players: preStartSummary.players,
        botCount: preStartSummary.botCount,
        botDifficulty: preStartSummary.botDifficulty,
        config: preStartSummary.config,
      },
      undoLifecycle: {
        afterFirstMoveP1CanUndo: afterFirstMoveP1.canUndo,
        afterFirstMoveP1UndoSteps: afterFirstMoveP1.undoableSteps,
        afterFirstMoveP2CanUndo: afterFirstMoveP2.canUndo,
        afterUndoStep: afterUndoP1.step,
        afterUndoCanRedo: afterUndoP1.canRedo,
        afterRedoStep: afterRedoP1.step,
      },
      postSetupP1Status: postSetupSummaryP1.status,
      postSetupP2Status: postSetupSummaryP2.status,
      postSetupP1Phase: p1StateView.phase,
      postSetupP2Phase: p2StateView.phase,
      postSetupP1Players: p1StateView.players.map((p) => ({
        id: p.id,
        handRedacted: Boolean(p.handRedacted),
        hiddenResourceCount: p.hiddenResourceCount,
        resources: p.resources,
      })),
      postSetupP2Players: p2StateView.players.map((p) => ({
        id: p.id,
        handRedacted: Boolean(p.handRedacted),
        hiddenResourceCount: p.hiddenResourceCount,
        resources: p.resources,
      })),
    };
  });
}

describe("Functional Refactoring PRNG, Topology & RoomManager Parity", () => {
  const goldenPrng = loadOrCreateGoldenKey("prng", collectPrngSnapshot);
  const goldenHexAndPath = loadOrCreateGoldenKey(
    "hexAndPath",
    collectHexAndPathSnapshot
  );
  const goldenRoomManager = loadOrCreateGoldenKey(
    "roomManager",
    collectRoomManagerSnapshot
  );

  test("preserves exact PRNG hashes, float/int/dice streams, shuffles, and state resume", () => {
    const actual = collectPrngSnapshot();
    expect(actual).toEqual(goldenPrng);
  });

  test("preserves exact hex grid coordinates, topology ordering, and longest simple path results", () => {
    const actual = collectHexAndPathSnapshot();
    expect(actual).toEqual(goldenHexAndPath);
  });

  test("preserves exact PlatformRoomManager lifecycle, redaction, and turn-scoped undo/redo", () => {
    const actual = collectRoomManagerSnapshot();
    expect(actual).toEqual(goldenRoomManager);
  });
});
