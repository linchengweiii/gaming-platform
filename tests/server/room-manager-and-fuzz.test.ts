import { describe, expect, test } from "bun:test";
import { PlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  CatanEngine,
  getLegalRoadEdges,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import {
  runHumanMimicIterations,
  runRobotIterations,
} from "../../scripts/stress-20k.ts";

describe("@gaming-platform/server - PlatformRoomManager, Graphics & Fuzz Specs", () => {
  test("registers Catan, Splendor, Azul, and 7 Wonders and runs rooms for all 4 games", () => {
    const manager = new PlatformRoomManager();
    const games = manager.registry.list().map((g) => g.id);
    expect(games).toEqual(["catan", "splendor", "azul", "seven_wonders"]);

    // 1. Catan Room
    const catanRoom = manager.createRoom({
      gameId: "catan",
      hostName: "Alice",
      botCount: 3,
      config: { scenarioId: "seafarers_new_shores", enableHarbormaster: true },
      seed: "room-catan",
      autoStart: true,
    });
    expect(catanRoom.status).toBe("in_progress");
    for (let i = 0; i < 16; i++) {
      manager.stepBot(catanRoom.roomId);
    }
    expect(catanRoom.session!.getState().phase).toBe("PRE_ROLL");

    // 2. Splendor Room (random starting player across all seats by default)
    const splendorRoom = manager.createRoom({
      gameId: "splendor",
      hostName: "Alice",
      botCount: 3,
      seed: "room-splendor",
      autoStart: true,
    });
    const spStep = manager.stepBot(splendorRoom.roomId);
    expect(splendorRoom.players.map((p) => p.id)).toContain(
      spStep.actedPlayerId!
    );
    expect(spStep.action).not.toBeNull();

    // 3. Azul Room (random starting player across all seats by default)
    const azulRoom = manager.createRoom({
      gameId: "azul",
      hostName: "Alice",
      botCount: 3,
      seed: "room-azul",
      autoStart: true,
    });
    const azStep = manager.stepBot(azulRoom.roomId);
    expect(azulRoom.players.map((p) => p.id)).toContain(azStep.actedPlayerId!);
    expect(azStep.action).not.toBeNull();

    // 4. 7 Wonders Room (3-7P simultaneous drafting + pre-reveal undo)
    const swRoom = manager.createRoom({
      gameId: "seven_wonders",
      ownerId: "p1",
      hostName: "Alice",
      botCount: 3,
      seed: "room-seven-wonders",
      autoStart: true,
    });
    expect(swRoom.status).toBe("in_progress");
    const p1Legal = swRoom.session!.engine.getLegalActions(
      swRoom.session!.getState(),
      "p1"
    );
    expect(p1Legal.length).toBeGreaterThan(0);
    manager.dispatchAction(swRoom.roomId, "p1", p1Legal[0]!);
    expect(manager.toRoomSummary(swRoom, "p1").canUndo).toBe(true);
    manager.undoAction(swRoom.roomId, "p1");
    expect(manager.toRoomSummary(swRoom, "p1").canRedo).toBe(true);
    manager.redoAction(swRoom.roomId, "p1");
    for (let i = 0; i < 3; i++) {
      const swStep = manager.stepBot(swRoom.roomId);
      expect(swStep.action).not.toBeNull();
    }
    expect(swRoom.session!.getState().draftRound).toBe(2);
  });

  test("enforces Room Owner editable setup in lobby and Read-Only setup for joined guests & started games", () => {
    const manager = new PlatformRoomManager();
    const room = manager.createRoom({
      name: "Alice's Catan Table",
      gameId: "catan",
      ownerId: "user-alice",
      hostName: "Alice",
      botCount: 3,
      autoStart: false,
    });

    expect(room.status).toBe("lobby");
    expect(room.ownerId).toBe("user-alice");

    // Owner CAN change the game setup while in lobby
    const updated = manager.updateRoomSetup(room.roomId, "user-alice", {
      playerCount: 4,
      config: {
        scenarioId: "seafarers_four_islands",
        enableHarbormaster: true,
        enableCityWalls: true,
      },
    });
    expect(updated.config.scenarioId).toBe("seafarers_four_islands");
    expect(updated.config.enableHarbormaster).toBe(true);

    // Bob joins the room as a non-owner guest
    const bob = manager.joinRoom(room.roomId, "Bob", false, "user-bob");
    expect(bob.id).toBe("user-bob");
    expect(bob.isBot).toBe(false);

    // Bob (non-owner) CANNOT change the game setup (strictly read-only for joined non-owners)
    expect(() =>
      manager.updateRoomSetup(room.roomId, "user-bob", {
        config: { scenarioId: "standard" },
      })
    ).toThrow(/Only the room owner/i);

    // Non-owner also cannot start the game
    expect(() => manager.startGame(room.roomId, "user-bob")).toThrow(
      /Only the room owner/i
    );

    // Owner starts the game
    manager.startGame(room.roomId, "user-alice");
    expect(room.status).toBe("in_progress");

    // Once started ("in_progress"), game setup is strictly read-only even for the owner
    expect(() =>
      manager.updateRoomSetup(room.roomId, "user-alice", {
        config: { enableFriendlyRobber: true },
      })
    ).toThrow(/read-only/i);

    // When the game is finished ("finished"), the owner CAN configure the game setup again for the next game
    room.status = "finished";
    const rematchedSetup = manager.updateRoomSetup(room.roomId, "user-alice", {
      config: { enableFriendlyRobber: true, scenarioId: "standard" },
    });
    expect(rematchedSetup.config.enableFriendlyRobber).toBe(true);
    expect(rematchedSetup.config.scenarioId).toBe("standard");

    // Non-owner still cannot edit setup even when finished
    expect(() =>
      manager.updateRoomSetup(room.roomId, "user-bob", {
        config: { enableFriendlyRobber: false },
      })
    ).toThrow(/Only the room owner/i);
  });

  test("renders Ocean frame hexes, visual cards, and non-clipping 2D roads on all edge orientations (NE, E vertical, SE)", () => {
    let state = CatanEngine.initGame(
      [
        { id: "p1", name: "Alice", color: "#ef4444", isBot: false },
        { id: "p2", name: "Bob", color: "#3b82f6", isBot: true },
        { id: "p3", name: "Carol", color: "#eab308", isBot: true },
      ],
      { scenarioId: "standard" },
      "road-visibility-regression-seed"
    );

    // Force-test road rendering on NE, E (vertical x1===x2), and SE edges
    const neEdge = state.topology.edgeOrder.find(
      (id) => state.topology.edges[id]!.dir === "NE"
    )!;
    const eEdge = state.topology.edgeOrder.find(
      (id) => state.topology.edges[id]!.dir === "E"
    )!;
    const seEdge = state.topology.edgeOrder.find(
      (id) => state.topology.edges[id]!.dir === "SE"
    )!;

    // Verify vertical E edge indeed has x1 === x2
    expect(
      Math.abs(
        state.topology.edges[eEdge]!.x1 - state.topology.edges[eEdge]!.x2
      )
    ).toBeLessThan(1e-6);

    // Place a settlement and a vertical road through legal actions
    const vWithVerticalEdge = state.topology.edges[eEdge]!.v1;
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLACE_SETUP_SETTLEMENT",
      vertexId: vWithVerticalEdge,
    }).state;
    expect(getLegalRoadEdges(state, "p1", vWithVerticalEdge)).toContain(eEdge);

    state = CatanEngine.applyAction(state, "p1", {
      type: "PLACE_SETUP_EDGE",
      edgeId: eEdge,
      edgeKind: "road",
    }).state;

    // Verify the road is stored in state.edges and rendered with filterUnits="userSpaceOnUse" and 2D <rect> plank
    expect(state.edges[eEdge]).toEqual({
      ownerId: "p1",
      type: "road",
      builtOnTurn: 0,
    });

    const svg = renderCatanBoardSvg(state, getNextActingPlayerId(state), {
      buildMode: null,
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
    });

    expect(svg).toContain('filterUnits="userSpaceOnUse"');
    expect(svg).toContain('id="island-shelf-shadow"');
    expect(svg).toContain('id="catan-hex-clip-0"');
    expect(svg).toContain('class="harbor-marker"');
    expect(svg).toContain(`data-road-edge-id="${eEdge}"`);
    expect(svg).toContain('class="ocean-frame-hex"');
    expect(neEdge).toBeDefined();
    expect(seEdge).toBeDefined();

    // Verify visual hand tray renders illustrated Resource Cards (with stack depth) and illustrated Development Cards
    const samplePlayer = {
      ...state.players[0]!,
      resources: { brick: 3, lumber: 2, wool: 1, grain: 0, ore: 0 },
      devCards: [
        { id: "d1", type: "knight" as const, boughtOnTurn: 0, played: false },
      ],
    };
    const handHtml = renderCatanVisualHandTray(state, samplePlayer, []);
    expect(handHtml).toContain("resource-playing-card");
    expect(handHtml).toContain('data-stack="3"');
    expect(handHtml).toContain('data-stack="2"');
    expect(handHtml).toContain("dev-playing-card");
    expect(handHtml).toContain("Brick");
    expect(handHtml).toContain("Lumber");
    expect(handHtml).toContain("Wool");
    expect(handHtml).toContain("Grain");
    expect(handHtml).toContain("Ore");
  });

  test("executes robot and human-mimic stress simulation loops with zero invariant violations", () => {
    const robotRes = runRobotIterations(500);
    expect(robotRes.completedIterations).toBe(500);
    expect(robotRes.invariantViolations).toBe(0);
    expect(robotRes.catanRoadsVerified).toBeGreaterThan(0);
    expect(robotRes.verticalERoadsVerified).toBeGreaterThan(0);

    const humanRes = runHumanMimicIterations(500);
    expect(humanRes.completedIterations).toBe(500);
    expect(humanRes.invariantViolations).toBe(0);
    expect(humanRes.catanRoadsVerified).toBeGreaterThan(0);
    expect(humanRes.verticalERoadsVerified).toBeGreaterThan(0);
    expect(humanRes.readonlyRoomChecksVerified).toBeGreaterThan(0);
  });

  test("lets Host decide bot count (deriving total players), admits multiple human guests, and starts games from any player", () => {
    const manager = new PlatformRoomManager();

    // 1. Host creates a Catan room with 0 bots initially -> 1 human guest total
    const room = manager.createRoom({
      name: "Multi-Guest Catan Table",
      gameId: "catan",
      ownerId: "guest-alice",
      hostName: "Alice",
      botCount: 0,
      autoStart: false,
      seed: "multi-guest-seed",
    });
    expect(room.players.length).toBe(1);
    expect(room.botCount).toBe(0);

    // Cannot start Catan with only 1 player (0 bots and no other guests yet)
    expect(() => manager.startGame(room.roomId, "guest-alice")).toThrow(
      /Need at least 2 players/i
    );

    // 2. Two more guests join the room alongside Alice
    const bob = manager.joinRoom(room.roomId, "Bob", false, "guest-bob");
    const carol = manager.joinRoom(room.roomId, "Carol", false, "guest-carol");
    expect(bob.id).toBe("guest-bob");
    expect(carol.id).toBe("guest-carol");
    expect(room.humanPlayers.length).toBe(3);
    expect(room.players.length).toBe(3); // 3 guests + 0 bots

    // 3. Host adds 1 bot -> total players becomes 4 (3 guests + 1 bot)
    manager.updateRoomSetup(room.roomId, "guest-alice", {
      botCount: 1,
      startingPlayerMode: "guest-carol", // Seat 3 starts instead of Seat 1!
    });
    expect(room.players.length).toBe(4);
    expect(room.players.filter((p) => !p.isBot).length).toBe(3);
    expect(room.players.filter((p) => p.isBot).length).toBe(1);

    // 4. Start Catan from Seat 3 (Carol, index 2) and verify full snake draft order:
    //    Forward: Carol (2) -> Bot 1 (3) -> Alice (0) -> Bob (1)
    //    Reverse: Bob (1) -> Alice (0) -> Bot 1 (3) -> Carol (2) -> PRE_ROLL Carol (2)
    manager.startGame(room.roomId, "guest-alice");
    const setupOrder: string[] = [];
    while (room.session!.getState().phase.startsWith("SETUP_")) {
      const st = room.session!.getState();
      const actorId = getNextActingPlayerId(st)!;
      setupOrder.push(`${st.phase}:${actorId}`);
      const move = CatanEngine.chooseBotAction(st, actorId)!;
      manager.dispatchAction(room.roomId, actorId, move);
    }

    const botId = room.players[3]!.id;
    expect(setupOrder).toEqual([
      "SETUP_SETTLEMENT_1:guest-carol",
      "SETUP_ROAD_1:guest-carol",
      `SETUP_SETTLEMENT_1:${botId}`,
      `SETUP_ROAD_1:${botId}`,
      "SETUP_SETTLEMENT_1:guest-alice",
      "SETUP_ROAD_1:guest-alice",
      "SETUP_SETTLEMENT_1:guest-bob",
      "SETUP_ROAD_1:guest-bob",
      "SETUP_SETTLEMENT_2:guest-bob",
      "SETUP_ROAD_2:guest-bob",
      "SETUP_SETTLEMENT_2:guest-alice",
      "SETUP_ROAD_2:guest-alice",
      `SETUP_SETTLEMENT_2:${botId}`,
      `SETUP_ROAD_2:${botId}`,
      "SETUP_SETTLEMENT_2:guest-carol",
      "SETUP_ROAD_2:guest-carol",
    ]);
    expect(room.session!.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session!.getState())).toBe("guest-carol");

    // 5. Whoever opens the room is always Host; joining guests are guests; leaving last human closes room
    const hostRoom = manager.createRoom({
      name: "Host-Owned Splendor Table",
      gameId: "splendor",
      ownerId: "guest-1",
      hostName: "Guest One",
      botCount: 2,
      autoStart: false,
      seed: "open-starter-seed",
    });
    expect(hostRoom.ownerId).toBe("guest-1");
    expect(hostRoom.ownerName).toBe("Guest One");
    manager.joinRoom(hostRoom.roomId, "Guest Two", false, "guest-2");
    expect(hostRoom.players.length).toBe(4); // 2 guests + 2 bots

    // Start Splendor from Guest Two (Seat 2, index 1) and play to completion
    manager.updateRoomSetup(hostRoom.roomId, "guest-1", {
      startingPlayerMode: "guest-2",
    });
    manager.startGame(hostRoom.roomId, "guest-1");
    expect(hostRoom.session!.getState().activePlayerIndex).toBe(1);
    expect(hostRoom.session!.getState().startingPlayerIndex).toBe(1);
    let spGuard = 0;
    while (
      hostRoom.session!.getState().phase !== "GAME_OVER" &&
      spGuard < 600
    ) {
      manager.stepBot(hostRoom.roomId);
      spGuard++;
    }
    expect(hostRoom.session!.getState().phase).toBe("GAME_OVER");

    // Verify pre-game room closes completely when the last human leaves (never leaves unclaimed host seat)
    const transientRoom = manager.createRoom({
      name: "Transient Room",
      gameId: "catan",
      ownerId: "solo-host",
      hostName: "Solo Host",
    });
    expect(transientRoom.botCount).toBe(0);
    expect(transientRoom.ownerId).toBe("solo-host");
    const afterLeave = manager.leaveRoom(transientRoom.roomId, "solo-host");
    expect(afterLeave).toBeNull();
    expect(() => manager.getRoom(transientRoom.roomId)).toThrow();

    // 6. Start Azul from Seat 3 (index 2) and verify random starting player covers multiple seats
    const azulRoom = manager.createRoom({
      name: "Azul Non-First Start",
      gameId: "azul",
      ownerId: "guest-a",
      hostName: "Guest A",
      botCount: 2,
      startingPlayerMode: "p3",
      autoStart: true,
      seed: "azul-seat3-seed",
    });
    expect(azulRoom.session!.getState().activePlayerIndex).toBe(2);
    expect(azulRoom.session!.getState().startingPlayerIndex).toBe(2);

    const observedFirstActors = new Set<string>();
    for (let s = 0; s < 16; s++) {
      const r = manager.createRoom({
        gameId: "catan",
        hostName: "Host",
        botCount: 3,
        startingPlayerMode: "random",
        autoStart: true,
        seed: `rand-starter-${s}`,
      });
      observedFirstActors.add(getNextActingPlayerId(r.session!.getState())!);
    }
    expect(observedFirstActors.size).toBeGreaterThan(1);
  });
});
