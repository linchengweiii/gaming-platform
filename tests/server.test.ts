import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { PlatformRoomManager } from "../apps/server/src/room-manager.ts";
import {
  CatanEngine,
  getLegalRoadEdges,
  getNextActingPlayerId,
  getPlayerResourceCount,
  getPlayerTradeRatios,
} from "../packages/games/catan/src/index.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../apps/web/src/catan-graphics.ts";
import { MultiGamePlatformApp } from "../apps/web/src/app.ts";
import {
  runHumanMimicIterations,
  runRobotIterations,
} from "../scripts/stress-20k.ts";

describe("@gaming-platform/server - PlatformRoomManager & UI Graphics Specs", () => {
  test("registers Catan, Splendor, and Azul and runs rooms for all 3 games", () => {
    const manager = new PlatformRoomManager();
    const games = manager.registry.list().map((g) => g.id);
    expect(games).toEqual(["catan", "splendor", "azul"]);

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

  test("applies taste-skill design system tokens and renders Lobby, Setup, and Game pages cleanly", () => {
    const indexHtml = fs.readFileSync(
      new URL("../apps/web/public/index.html", import.meta.url),
      "utf8"
    );
    expect(indexHtml).toContain('data-type="software"');
    expect(indexHtml).toContain('data-radius="soft"');
    expect(indexHtml).toContain('data-buttons="solid"');
    expect(indexHtml).toContain("--p-bg: #18191b");
    expect(indexHtml).toContain("--p-action: #ff4a1f");
    expect(indexHtml).toContain('"Sora"');
    expect(indexHtml).toContain('"Figtree"');
    expect(indexHtml).toContain('"Martian Mono"');

    const root: any = {
      innerHTML: "",
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    };
    const app = new MultiGamePlatformApp(root) as any;

    // 1. Lobby view uses taste-skill .btn--primary, .btn--secondary, .ga-nav, and custom .ga-dropdown
    expect(root.innerHTML).toContain("ga-nav");
    expect(root.innerHTML).toContain("btn--primary");
    expect(root.innerHTML).toContain("btn--secondary");
    expect(root.innerHTML).toContain("ga-dropdown");
    expect(root.innerHTML).toContain("ga-dropdown__trigger");
    expect(root.innerHTML).toContain("ga-dropdown__menu");
    expect(root.innerHTML).toContain("ga-dropdown--end");
    expect(root.innerHTML).not.toContain('class="ga-select');
    expect(root.innerHTML).toContain("Tabletop board games in one room.");

    // 2. Owner Setup page is editable before start and uses unified zero-jump room shell
    app.enterOrJoinRoom("room-1");
    expect(root.innerHTML).toContain("ga-nav--room");
    expect(root.innerHTML).toContain("ga-room-shell");
    expect(root.innerHTML).toContain("Match configuration");
    expect(root.innerHTML).toContain("Owner editable");
    expect(root.innerHTML).toContain('id="setup-sel-game-btn"');
    expect(root.innerHTML).toContain('id="setup-sel-scenario-btn"');
    expect(root.innerHTML).toContain('id="setup-sel-bots-btn"');
    expect(root.innerHTML).toContain('id="setup-sel-starting-player-btn"');
    expect(root.innerHTML).toContain('id="setup-sel-bot-difficulty-btn"');

    // 3. Joined guest sees Setup Summary instead of a disabled readonly setup form
    app.enterOrJoinRoom("room-2");
    expect(root.innerHTML).toContain("ga-setup-summary");
    expect(root.innerHTML).toContain("Setup summary");
    expect(root.innerHTML).toContain("Harbormaster (+2 VP)");
    expect(root.innerHTML).not.toContain('id="setup-sel-game"');
    expect(root.innerHTML).not.toContain('id="setup-room-name"');

    // 4. Active Game page shares identical ga-nav--room & ga-room-shell, positions .action-dock
    //    immediately below .board-svg-wrap (above .visual-hand-tray), and shows Setup summary on Setup tab
    app.autoRespondBotsToHuman = false;
    app.startRoomMatch("room-1");
    expect(root.innerHTML).toContain("ga-nav--room");
    expect(root.innerHTML).toContain("ga-room-shell--game");
    expect(root.innerHTML).toContain("ga-inline-summary");
    expect(root.innerHTML).toContain("visual-hand-tray");
    expect(root.innerHTML.indexOf('class="action-dock"')).toBeLessThan(
      root.innerHTML.indexOf('class="visual-hand-tray"')
    );

    app.viewMode = "room_setup";
    app.render();
    expect(root.innerHTML).toContain("ga-setup-summary");
    expect(root.innerHTML).not.toContain('id="setup-sel-game"');

    // 5. Graphic Roll Dice button on map during PRE_ROLL & clear On-Map Dice HUD after rolling
    app.viewMode = "in_game";
    app.render();
    app.finishSetupWithBots();
    expect(root.innerHTML).toContain("map-decision-popup");
    expect(root.innerHTML).toContain("roll-dice-btn-graphic");
    expect(root.innerHTML).toContain('id="btn-roll-dice"');

    app.dispatch("p1", { type: "ROLL_DICE" });
    expect(root.innerHTML).toContain("map-dice-hud--");
    expect(root.innerHTML).toContain("map-dice-hud__total");
    while (app.getActiveRoom().session.getState().phase !== "MAIN_PHASE") {
      app.stepOneBotMove();
    }

    // 6. Click-spot-on-map contextual action popover (edges, vertices, hexes)
    const activeState = app.getActiveRoom().session.getState();
    const firstEdgeId = activeState.topology.edgeOrder[0]!;
    app.selectedBoardSpot = { kind: "edge", id: firstEdgeId };
    app.render();
    expect(root.innerHTML).toContain("map-spot-popover");
    expect(root.innerHTML).toContain('id="btn-close-spot-popover"');
    app.selectedBoardSpot = null;

    // 7. Vertically-aligned 5-column graphic resource matrices for Maritime & Domestic Trade
    app.buildMode = "maritime_trade";
    app.render();
    expect(root.innerHTML).toContain("ga-res-matrix");
    expect(root.innerHTML).toContain('data-maritime-give="brick"');
    expect(root.innerHTML).toContain('data-maritime-receive="ore"');

    app.buildMode = "domestic_trade";
    app.render();
    expect(root.innerHTML).toContain("ga-res-matrix");
    expect(root.innerHTML).toContain(
      "Open to all players · pick partner after accept"
    );
    expect(root.innerHTML).toContain('data-dom-give="brick"');
    expect(root.innerHTML).toContain('data-dom-want="ore"');
  });

  test("renders Guest Login page, validates guest display name, signs in to Lobby, and signs out cleanly", () => {
    const root: any = {
      innerHTML: "",
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
    };
    const app = new MultiGamePlatformApp(root, {
      startAtLogin: true,
      forceLocalMode: true,
    }) as any;

    expect(app.viewMode).toBe("login");
    expect(root.innerHTML).toContain('id="form-guest-login"');
    expect(root.innerHTML).toContain('id="inp-guest-name"');
    expect(root.innerHTML).toContain('id="btn-guest-login"');
    expect(root.innerHTML).toContain("Enter Game Arena as a guest.");

    // Empty name validation stays on Login page with inline alert
    app.signInAsGuest("   ");
    expect(app.viewMode).toBe("login");
    expect(root.innerHTML).toContain('id="login-error"');

    // Valid guest display name enters Lobby
    app.signInAsGuest("Maya");
    expect(app.isAuthenticated).toBe(true);
    expect(app.currentUserName).toBe("Maya");
    expect(app.viewMode).toBe("lobby");
    expect(root.innerHTML).toContain("Tabletop board games in one room.");
    expect(root.innerHTML).toContain('id="btn-sign-out"');

    // Sign out returns to Guest Login page
    app.signOutGuest();
    expect(app.isAuthenticated).toBe(false);
    expect(app.viewMode).toBe("login");
    expect(root.innerHTML).toContain('id="form-guest-login"');
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

    // 5.Whoever opens the room is always Host; joining guests are guests; leaving last human closes room
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

  test("omits pre-creation bot selection, never renders unclaimed host rooms, supports multiple hosts on one computer, and plays offline with local friends", () => {
    const fakeRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const app = new MultiGamePlatformApp(fakeRoot, { startAtLogin: true });

    // 1. Login page includes offline local button, and signing in as Alice opens Lobby without pre-creation bot selector
    expect(fakeRoot.innerHTML).toContain('id="btn-start-offline-local"');
    app.signInAsGuest("Alice");
    expect((app as any).viewMode).toBe("lobby");
    expect(fakeRoot.innerHTML).not.toContain('id="sel-create-room-bots"');
    expect(fakeRoot.innerHTML).not.toContain('id="btn-quick-start-room"');
    expect(fakeRoot.innerHTML).toContain('id="sel-create-room-mode"');
    expect(fakeRoot.innerHTML).not.toContain("Claim host seat");
    expect(fakeRoot.innerHTML).not.toContain("Open host seat");

    const aliceId = (app as any).currentUserId as string;

    // 2. Alice creates Room A — starts with 0 bots in Room Setup where Alice is Host
    (app as any).createRoomName = "Alice Catan Table";
    (app as any).createRoomGameId = "catan";
    (app as any).createAndOpenRoom();
    const roomAId = (app as any).activeRoomId as string;
    const roomA = (app as any).rooms.get(roomAId);
    expect((app as any).viewMode).toBe("room_setup");
    expect(roomA.ownerId).toBe(aliceId);
    expect(roomA.botCount).toBe(0);
    expect(roomA.players.length).toBe(1);
    expect(fakeRoot.innerHTML).toContain("Owner editable");

    // 3. One computer represents multiple hosts: add Bob via openAddGuestView() without removing Alice's host seat
    app.openAddGuestView();
    expect((app as any).viewMode).toBe("login");
    expect(fakeRoot.innerHTML).toContain("Add another guest on this computer.");
    expect(fakeRoot.innerHTML).toContain("Guests on this computer");

    app.signInAsGuest("Bob");
    const bobId = (app as any).currentUserId as string;
    expect(bobId).not.toBe(aliceId);
    expect((app as any).deviceGuests.length).toBe(2);

    // Bob creates Room B as Host while Alice still hosts Room A!
    (app as any).createRoomName = "Bob Splendor Table";
    (app as any).createRoomGameId = "splendor";
    (app as any).createAndOpenRoom();
    const roomBId = (app as any).activeRoomId as string;
    const roomB = (app as any).rooms.get(roomBId);

    expect(roomA.ownerId).toBe(aliceId);
    expect(roomB.ownerId).toBe(bobId);

    // When Bob views Alice's Room A, Bob sees read-only Setup Summary; switching back to Alice restores Owner editable!
    (app as any).enterOrJoinRoom(roomAId);
    expect(fakeRoot.innerHTML).toContain("Setup summary");
    expect(fakeRoot.innerHTML).not.toContain("Owner editable");

    app.switchActiveGuest(aliceId);
    expect((app as any).currentUserId).toBe(aliceId);
    expect(fakeRoot.innerHTML).toContain("Owner editable");

    // 4. Offline pass-and-play with local friends (0 bots, 3 human friends on one computer)
    (app as any).createRoomGameId = "catan";
    app.startOfflineLocalFromLogin("Host Mia");
    const offlineRoomId = (app as any).activeRoomId as string;
    const offlineRoom = (app as any).rooms.get(offlineRoomId);
    expect(offlineRoom.isOfflineLocal).toBe(true);
    expect(offlineRoom.botCount).toBe(0);
    expect(offlineRoom.players.length).toBe(1);
    expect(fakeRoot.innerHTML).toContain('id="inp-local-friend-name"');

    app.addLocalFriendToRoom(offlineRoom, "Friend Leo");
    app.addLocalFriendToRoom(offlineRoom, "Friend Zoe");
    app.addLocalFriendToRoom(offlineRoom, "Temp Friend");
    expect(offlineRoom.players.length).toBe(4);

    // Remove Temp Friend and verify 3 local friends remain
    const tempFriend = offlineRoom.players.find(
      (p: any) => p.name === "Temp Friend"
    )!;
    app.removePlayerFromRoom(offlineRoom, tempFriend.id);
    expect(offlineRoom.players.map((p: any) => p.name)).toEqual([
      "Host Mia",
      "Friend Leo",
      "Friend Zoe",
    ]);

    // Start offline Catan game with 3 local friends + 0 bots, starting from Friend Zoe!
    offlineRoom.startingPlayerMode = offlineRoom.players[2]!.id;
    (app as any).startRoomMatch(offlineRoomId);
    expect((app as any).viewMode).toBe("in_game");
    expect(offlineRoom.status).toBe("in_progress");

    const catanState0 = offlineRoom.session.getState();
    expect(catanState0.startingPlayerIndex).toBe(2);
    expect(getNextActingPlayerId(catanState0)).toBe(offlineRoom.players[2]!.id);
    expect(fakeRoot.innerHTML).toContain('id="btn-toggle-hand-privacy"');

    // Toggle pass-and-play hand privacy shield
    (app as any).hidePassAndPlayHand = true;
    app.render();
    expect(fakeRoot.innerHTML).toContain('class="ga-hand-privacy-card"');
    (app as any).hidePassAndPlayHand = false;
    app.render();
    expect(fakeRoot.innerHTML).not.toContain('class="ga-hand-privacy-card"');

    // Play through setup and turns for all 3 local human friends with zero invariant errors
    for (let step = 0; step < 24; step++) {
      const st = offlineRoom.session.getState();
      const actorId = getNextActingPlayerId(st)!;
      expect((app as any).canControlPlayerOnThisDevice(offlineRoom, actorId)).toBe(
        true
      );
      const action = CatanEngine.chooseBotAction(st, actorId)!;
      (app as any).dispatch(actorId, action);
      expect(CatanEngine.checkInvariants(offlineRoom.session.getState()).valid).toBe(
        true
      );
    }

    // Server RoomManager also supports adding and removing local friend seats
    const manager = new PlatformRoomManager();
    const srvRoom = manager.createRoom({
      name: "Hybrid Local + Online Table",
      gameId: "azul",
      ownerId: "host-mia",
      hostName: "Mia",
    });
    expect(srvRoom.players.length).toBe(1);
    manager.addLocalPlayer(srvRoom.roomId, "host-mia", "Leo");
    expect(srvRoom.players.length).toBe(2);
    expect(srvRoom.players[1]!.controllerId).toBe("host-mia");
    manager.startGame(srvRoom.roomId, "host-mia");
    expect(srvRoom.status).toBe("in_progress");
  });

  test("serves static GitHub Pages mode cleanly for solo games against bots and local pass-and-play", () => {
    const fakeRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const staticApp = new MultiGamePlatformApp(fakeRoot, {
      staticHostOnly: true,
    });

    // Boots at Guest Sign-In with zero pre-seeded rooms and zero server/WS calls
    expect((staticApp as any).viewMode).toBe("login");
    expect((staticApp as any).useServerBackend).toBe(false);
    expect((staticApp as any).rooms.size).toBe(0);
    expect(fakeRoot.innerHTML).toContain('id="btn-start-solo-game"');
    expect(fakeRoot.innerHTML).toContain('id="btn-start-offline-local"');

    // 1-click Solo game vs bots opens Room Setup with 1 human + 3 bots
    staticApp.startSoloGameFromLogin("Solo Explorer");
    expect((staticApp as any).viewMode).toBe("room_setup");
    expect(fakeRoot.innerHTML).toContain("Solo and local play");
    const soloRoomId = (staticApp as any).activeRoomId as string;
    const soloRoom = (staticApp as any).rooms.get(soloRoomId);
    expect(soloRoom.isOfflineLocal).toBe(true);
    expect(soloRoom.botCount).toBe(3);
    expect(soloRoom.players.length).toBe(4);

    // Launch solo match and verify invariants
    (staticApp as any).startRoomMatch(soloRoomId);
    expect((staticApp as any).viewMode).toBe("in_game");
    expect(CatanEngine.checkInvariants(soloRoom.session.getState()).valid).toBe(
      true
    );
  });

  test("enforces turn-scoped reversible undo, hides opponent cards and dev-card VPs, and supports multi-trade + instant trade mode switching", () => {
    const manager = new PlatformRoomManager();
    const room = manager.createRoom({
      name: "Fair Undo & Hidden Hands",
      gameId: "catan",
      ownerId: "p1",
      hostName: "Alice",
      startingPlayerMode: "first",
    });
    manager.joinRoom(room.roomId, "Bob", false, "p2");
    manager.updateRoomSetup(room.roomId, "p1", {
      botCount: 1,
      startingPlayerMode: "first",
    });
    manager.startGame(room.roomId, "p1");

    // 1. Setup undo: Alice places settlement 1 -> Alice can undo it; Bob cannot undo Alice's move
    const setupActions1 = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    );
    const firstSettlement = setupActions1.find(
      (a) => a.type === "PLACE_SETUP_SETTLEMENT"
    )!;
    manager.dispatchAction(room.roomId, "p1", firstSettlement);
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(true);
    expect(manager.toRoomSummary(room, "p1").undoableSteps).toBe(1);
    expect(manager.toRoomSummary(room, "p2").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p2")).toThrow();

    // Once Alice places her setup road, turn passes to Bob -> neither Alice nor Bob can undo Alice's setup
    const setupRoad1 = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    ).find((a) => a.type === "PLACE_SETUP_EDGE")!;
    manager.dispatchAction(room.roomId, "p1", setupRoad1);
    expect(getNextActingPlayerId(room.session!.getState())).toBe("p2");
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(manager.toRoomSummary(room, "p2").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();
    expect(() => manager.undoAction(room.roomId, "p2")).toThrow();

    // Finish snake draft setup so Alice starts Turn 1 at PRE_ROLL
    manager.finishCatanSetupWithBots(room.roomId);
    expect(room.session!.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session!.getState())).toBe("p1");
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);

    // 2. Rolling dice (and resolving any 7) is irreversible -> cannot undo dice roll
    manager.dispatchAction(room.roomId, "p1", { type: "ROLL_DICE" });
    while (room.session!.getState().phase !== "MAIN_PHASE") {
      const st = room.session!.getState();
      const actor = getNextActingPlayerId(st)!;
      const move = CatanEngine.chooseBotAction(st, actor)!;
      manager.dispatchAction(room.roomId, actor, move);
    }
    expect(room.session!.getState().phase).toBe("MAIN_PHASE");
    expect(room.session!.getUndoableStepCount("p1")).toBe(0);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // 3. Multi-trade at once (2x grain port bundle -> 2 brick) + reversible undo stopping at dice roll
    const liveState = room.session!.getState();
    const alice = liveState.players.find((p: any) => p.id === "p1")!;
    const bob = liveState.players.find((p: any) => p.id === "p2")!;
    const aliceRatios = getPlayerTradeRatios(liveState, "p1");
    const twoBundleGrain = aliceRatios.grain * 2;

    // Ensure Alice has at least `twoBundleGrain` grain while preserving conservation
    while (alice.resources.grain < twoBundleGrain && liveState.bank.grain > 0) {
      alice.resources.grain += 1;
      liveState.bank.grain -= 1;
    }

    // Also give Bob 2 hidden VP dev cards and extra resource cards from bank
    const bobLumber = Math.min(3, liveState.bank.lumber);
    const bobOre = Math.min(2, liveState.bank.ore);
    bob.resources.lumber += bobLumber;
    liveState.bank.lumber -= bobLumber;
    bob.resources.ore += bobOre;
    liveState.bank.ore -= bobOre;
    const expectedBobCards = getPlayerResourceCount(bob);
    bob.devCards.push(
      { id: "vp-hidden-1", type: "victory_point", boughtOnTurn: 1, played: false },
      { id: "vp-hidden-2", type: "victory_point", boughtOnTurn: 1, played: false }
    );
    expect(CatanEngine.checkInvariants(liveState).valid).toBe(true);

    // Verify getPlayerView hides Bob's exact resources AND hidden VP dev cards from Alice
    const aliceView = CatanEngine.getPlayerView(liveState, "p1");
    const bobInAliceView = aliceView.players.find((p) => p.id === "p2")!;
    expect(bobInAliceView.handRedacted).toBe(true);
    expect(bobInAliceView.resources).toEqual({
      brick: 0,
      lumber: 0,
      wool: 0,
      grain: 0,
      ore: 0,
    });
    expect(bobInAliceView.hiddenResourceCount).toBe(expectedBobCards);
    const bobTrueVp = CatanEngine.getWinner(liveState) ? 0 : bob.devCards.filter((c: any) => c.type === "victory_point").length;
    expect(bobTrueVp).toBe(2);
    // In Alice's view, Bob's total VP has 0 hidden dev-card VPs
    expect(
      bobInAliceView.devCards.some((c) => c.type === "victory_point")
    ).toBe(false);
    expect(CatanEngine.checkInvariants(aliceView).valid).toBe(true);

    // Execute multi-trade: 2 grain bundles (e.g. 8 grain at 4:1) -> 2 brick in a single MARITIME_TRADE action!
    const prevAliceBrick = alice.resources.brick;
    const prevAliceGrain = alice.resources.grain;
    manager.dispatchAction(room.roomId, "p1", {
      type: "MARITIME_TRADE",
      give: "grain",
      giveAmount: twoBundleGrain,
      receive: "brick",
      receiveAmount: 2,
    });
    const afterTradeState = room.session!.getState();
    const aliceAfterTrade = afterTradeState.players.find((p: any) => p.id === "p1")!;
    expect(aliceAfterTrade.resources.grain).toBe(prevAliceGrain - twoBundleGrain);
    expect(aliceAfterTrade.resources.brick).toBe(prevAliceBrick + 2);
    expect(CatanEngine.checkInvariants(afterTradeState).valid).toBe(true);

    // Alice CAN undo her MARITIME_TRADE, and after undoing it, cannot undo further past the dice roll!
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(true);
    expect(manager.toRoomSummary(room, "p1").undoableSteps).toBe(1);
    manager.undoAction(room.roomId, "p1");
    const afterUndoState = room.session!.getState();
    expect(
      afterUndoState.players.find((p: any) => p.id === "p1")!.resources.grain
    ).toBe(prevAliceGrain);
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // Also test multi-resource combined MARITIME_TRADE (giveMap + receiveMap) + undo
    const stCombo = room.session!.getState();
    const p1Combo = stCombo.players.find((p: any) => p.id === "p1")!;
    const comboRatios = getPlayerTradeRatios(stCombo, "p1");
    while (p1Combo.resources.grain < comboRatios.grain && stCombo.bank.grain > 0) {
      p1Combo.resources.grain += 1;
      stCombo.bank.grain -= 1;
    }
    while (p1Combo.resources.lumber < comboRatios.lumber && stCombo.bank.lumber > 0) {
      p1Combo.resources.lumber += 1;
      stCombo.bank.lumber -= 1;
    }
    const preComboBrick = p1Combo.resources.brick;
    const preComboOre = p1Combo.resources.ore;
    manager.dispatchAction(room.roomId, "p1", {
      type: "MARITIME_TRADE",
      give: "grain",
      giveAmount: comboRatios.grain,
      receive: "brick",
      receiveAmount: 1,
      giveMap: { grain: comboRatios.grain, lumber: comboRatios.lumber },
      receiveMap: { brick: 1, ore: 1 },
    });
    const postCombo = room.session!.getState().players.find((p: any) => p.id === "p1")!;
    expect(postCombo.resources.brick).toBe(preComboBrick + 1);
    expect(postCombo.resources.ore).toBe(preComboOre + 1);
    manager.undoAction(room.roomId, "p1");

    // Buying a Development Card draws a secret card -> CANNOT be undone!
    const stForDev = room.session!.getState();
    const p1Dev = stForDev.players.find((p: any) => p.id === "p1")!;
    for (const r of ["wool", "grain", "ore"] as const) {
      if (p1Dev.resources[r] < 1 && stForDev.bank[r] > 0) {
        p1Dev.resources[r] += 1;
        stForDev.bank[r] -= 1;
      }
    }
    manager.dispatchAction(room.roomId, "p1", { type: "BUY_DEV_CARD" });
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // 4. Verify UI renders hidden card pill for opponents and segmented Bank <-> Player trade tabs
    const uiRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.startSoloGameFromLogin("Alice");
    const localRoom = uiApp.getActiveRoom();
    localRoom.startingPlayerMode = "first";
    uiApp.startRoomMatch(localRoom.roomId);
    const aliceId = localRoom.players[0]!.id as string;

    uiApp.finishSetupWithBots();
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (localRoom.session.getState().phase !== "MAIN_PHASE") {
      const st = localRoom.session.getState();
      const actId = getNextActingPlayerId(st)!;
      if (actId === aliceId) {
        const mv = CatanEngine.chooseBotAction(st, aliceId)!;
        uiApp.dispatch(aliceId, mv);
      } else {
        uiApp.stepOneBotMove();
      }
    }
    // Right after dice roll (and any robber step), undo must not be allowed across the dice roll
    expect(localRoom.session.canPlayerUndo(aliceId)).toBe(false);

    // Give bot-2 a hidden VP dev card and verify UI Standings hides bot-2's VP dev card & exact resources
    const localSt = localRoom.session.getState();
    localSt.players[1]!.devCards.push({
      id: "bot-secret-vp",
      type: "victory_point",
      boughtOnTurn: 1,
      played: false,
    });
    // Also give Alice 2 grain port bundles from bank so we can verify multi-bundle bank trade in UI
    const uiGrainBundle2 = getPlayerTradeRatios(localSt, aliceId).grain * 2;
    while (
      localSt.players[0]!.resources.grain < uiGrainBundle2 &&
      localSt.bank.grain > 0
    ) {
      localSt.players[0]!.resources.grain += 1;
      localSt.bank.grain -= 1;
    }

    uiApp.buildMode = "maritime_trade";
    uiApp.maritimeGive.grain = uiGrainBundle2;
    uiApp.maritimeWant.brick = 2;
    uiApp.render();
    expect(uiRoot.innerHTML).toContain("res-pill--hidden");
    expect(uiRoot.innerHTML).toContain('data-trade-tab="maritime_trade"');
    expect(uiRoot.innerHTML).toContain('data-trade-tab="domestic_trade"');
    expect(uiRoot.innerHTML).toContain("2 bank trades ready");
    // Bot-2 has 2 settlements (2 public VP) + 1 secret VP dev card -> UI must show "2 VP", NOT "3 VP (2)"
    expect(uiRoot.innerHTML).not.toContain("3 VP (2)");
    // Rules invariant badge on redacted view must stay valid
    expect(uiRoot.innerHTML).toContain("Rules verified");
  });

  test("shows only Accept and Decline (no Cancel) on incoming trade offers and auto-declines when missing resources", () => {
    const uiRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startSoloGameFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    room.startingPlayerMode = "first";
    uiApp.startRoomMatch(room.roomId);
    const aliceId = room.players[0]!.id as string;
    const bot1Id = room.players[1]!.id as string;
    const bot2Id = room.players[2]!.id as string;

    uiApp.finishSetupWithBots();
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const st = room.session.getState();
      const actId = getNextActingPlayerId(st)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(st, actId)!);
    }

    // Clear all player hands back into bank cleanly so we can set exact resources
    const st = room.session.getState();
    for (const p of st.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        st.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // 1. Alice offers 1 brick -> 1 ore when NOBODY holds ore: all opponents auto-decline immediately!
    st.players[0]!.resources.brick = 2;
    st.bank.brick -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(room.session.getState().activeTradeOffer).toBeNull();
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);

    // 2. Give BOTH Bot 2 (index 2) and Bot 3 (index 3) 1 ore while Bot 1 (index 1) has 0 ore:
    // Bot 1 auto-declines and acting responder skips directly to Bot 2!
    const bot3Id = room.players[3]!.id as string;
    const st2 = room.session.getState();
    st2.players[2]!.resources.ore = 1;
    st2.players[3]!.resources.ore = 1;
    st2.bank.ore -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(room.session.getState().activeTradeOffer).not.toBeNull();
    expect(room.session.getState().activeTradeOffer.declinedBy).toContain(bot1Id);
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot2Id);
    // Because ALICE proposed this trade and is waiting on Bot 2, Alice (the proposer) sees Cancel offer
    expect(uiRoot.innerHTML).toContain('id="btn-cancel-domestic"');
    const offer2Id = room.session.getState().activeTradeOffer.id as string;

    // 2b. Bot 2 accepts! Even while Bot 3 hasn't responded yet, Alice can ALREADY select "Trade with Bot 2"!
    uiApp.dispatch(bot2Id, {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offer2Id,
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot3Id);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot2Id}"`);

    // 2c. Bot 3 also accepts! Now control returns to Alice with BOTH "Trade with Bot 2" and "Trade with Bot 3"
    uiApp.dispatch(bot3Id, {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offer2Id,
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot2Id}"`);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot3Id}"`);

    // Alice chooses to trade with Bot 3!
    uiApp.dispatch(aliceId, {
      type: "CONFIRM_DOMESTIC_TRADE",
      offerId: offer2Id,
      partnerId: bot3Id,
    });
    expect(room.session.getState().activeTradeOffer).toBeNull();
    expect(room.session.getState().players[0]!.resources.ore).toBe(1);
    expect(room.session.getState().players[2]!.resources.ore).toBe(1); // Bot 2 untouched
    expect(room.session.getState().players[3]!.resources.ore).toBe(0); // Bot 3 traded
    expect(room.session.getState().players[3]!.resources.brick).toBe(1);

    // 3. Advance to Bot 1's MAIN_PHASE and have Bot 1 offer a trade!
    uiApp.dispatch(aliceId, { type: "END_TURN" });
    uiApp.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    const st3 = room.session.getState();
    for (const p of st3.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        st3.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    st3.players[1]!.resources.wool = 2; // Bot 1 gives wool
    st3.bank.wool -= 2;
    st3.players[2]!.resources.lumber = 1; // Bot 2 has lumber, Alice has 0 lumber!
    st3.bank.lumber -= 1;

    // 3a. Bot 1 offers 1 wool -> 1 lumber: Alice lacks lumber, so Alice auto-declines without being prompted!
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(room.session.getState().activeTradeOffer.declinedBy).toContain(aliceId);
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot2Id);
    uiApp.dispatch(bot1Id, { type: "CANCEL_DOMESTIC_TRADE" });

    // 3b. Now give Alice 1 lumber so Alice CAN respond to Bot 1's offer:
    // Alice MUST see ONLY Accept and Decline, and MUST NOT see Cancel offer!
    const st4 = room.session.getState();
    st4.players[0]!.resources.lumber = 1;
    st4.bank.lumber -= 1;
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(uiRoot.innerHTML).toContain(`data-accept-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).toContain(`data-decline-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).not.toContain('id="btn-cancel-domestic"');
  });

  test("renders zero-scroll game canvas, hides bank count in bank trade, and keeps Request identical with minimal UI diff on quick trade switch", () => {
    const cssText = fs.readFileSync(
      new URL("../apps/web/public/styles.css", import.meta.url),
      "utf8"
    );
    expect(cssText).toContain(".ga-game-canvas");
    expect(cssText).toContain("height: 100dvh;");
    expect(cssText).toContain(".ga-game-canvas .action-dock > .sub-modal");

    const uiRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startSoloGameFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    room.startingPlayerMode = "first";
    uiApp.startRoomMatch(room.roomId);
    const aliceId = room.players[0]!.id as string;

    uiApp.finishSetupWithBots();
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    // 1. Canvas layout: no inline overflow-y on .board-svg-wrap, and all HUD panels rendered together
    expect(uiRoot.innerHTML).toContain('class="ga-game-canvas"');
    expect(uiRoot.innerHTML).not.toContain(
      'class="board-svg-wrap" style="overflow-y: auto;"'
    );
    expect(uiRoot.innerHTML).toContain('class="ga-standings-list"');
    expect(uiRoot.innerHTML).toContain('class="res-pills res-pills--bank"');
    expect(uiRoot.innerHTML).toContain('class="event-log"');

    // 2. Start in Player Trade, request 2 Ore + 1 Brick, then quick-switch to Bank Trade:
    //    Request stays 100% identical and Bank Trade shows NO bank supply numbers!
    uiApp.switchTradeMode("domestic_trade");
    uiApp.setSharedTradeWant("ore", 2);
    uiApp.setSharedTradeWant("brick", 1);
    uiApp.domesticGive.grain = 1;
    uiApp.render();

    const domesticModalMatch = uiRoot.innerHTML.match(
      /<div class="sub-modal sub-modal--trade">[\s\S]*?<\/div>\s*<div class="action-buttons">/
    );
    expect(domesticModalMatch).not.toBeNull();
    expect(uiRoot.innerHTML).toContain("ga-res-col-head__rate");

    uiApp.switchTradeMode("maritime_trade");
    expect(uiApp.maritimeWant.ore).toBe(2);
    expect(uiApp.maritimeWant.brick).toBe(1);
    expect(uiApp.domesticWant.ore).toBe(2);
    expect(uiApp.domesticWant.brick).toBe(1);

    const maritimeModalMatch = uiRoot.innerHTML.match(
      /<div class="sub-modal sub-modal--trade">[\s\S]*?<\/div>\s*<div class="action-buttons">/
    );
    expect(maritimeModalMatch).not.toBeNull();
    const maritimeModalHtml = maritimeModalMatch![0];

    // Bank Trade must NOT display bank supply counts ("bank 19", etc.) or stack metadata rows
    expect(maritimeModalHtml).not.toContain("ga-res-cell--stack");
    expect(/bank \d+/i.test(maritimeModalHtml)).toBe(false);
    expect(maritimeModalHtml).not.toContain("Trade with bank (");
    // Both tabs share identical row labels ("Offer" and "Request") and column rate badges
    expect(maritimeModalHtml).toContain("Offer");
    expect(maritimeModalHtml).toContain("Request");
    expect(maritimeModalHtml).toContain("ga-res-col-head__rate");

    // 3. Modify Request in Bank Trade (+1 Wool) and quick-switch back to Player Trade: Request stays identical!
    uiApp.setSharedTradeWant("wool", 1);
    uiApp.switchTradeMode("domestic_trade");
    expect(uiApp.domesticWant).toEqual({
      brick: 1,
      lumber: 0,
      wool: 1,
      grain: 0,
      ore: 2,
    });
    expect(uiApp.maritimeWant).toEqual(uiApp.domesticWant);
  });

  test("locks map container size, keeps map unobstructed during all trade states, and blocks dice roll and dev cards on others' turns", () => {
    const cssText = fs.readFileSync(
      new URL("../apps/web/public/styles.css", import.meta.url),
      "utf8"
    );
    // 1. Fixed HUD tracks so .board-svg-wrap never changes dimensions mid-game, and downward sub-modal drawer
    expect(cssText).toContain("flex: 0 0 40px;");
    expect(cssText).toContain("flex: 0 0 44px;");
    expect(cssText).toContain("flex: 0 0 176px;");
    expect(cssText).toContain("top: 100%;");
    expect(cssText).not.toContain("bottom: calc(100% + 8px);");

    const uiRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startSoloGameFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    room.startingPlayerMode = "first";
    uiApp.startRoomMatch(room.roomId);
    const aliceId = room.players[0]!.id as string;
    const bot1Id = room.players[1]!.id as string;
    const bot2Id = room.players[2]!.id as string;

    uiApp.finishSetupWithBots();

    // Pull playable development cards directly from the deck so Catan's 25-card invariant holds
    const st = room.session.getState();
    const takeDevFromDeck = (devType: string, id: string) => {
      const idx = st.devCardDeck.indexOf(devType);
      if (idx >= 0) st.devCardDeck.splice(idx, 1);
      return { id, type: devType, boughtOnTurn: 0, played: false };
    };
    st.players[0]!.devCards.push(
      takeDevFromDeck("knight", "dev-a-1"),
      takeDevFromDeck("road_building", "dev-a-2"),
      takeDevFromDeck("year_of_plenty", "dev-a-3"),
      takeDevFromDeck("monopoly", "dev-a-4")
    );
    st.players[1]!.devCards.push(
      takeDevFromDeck("knight", "dev-b-1"),
      takeDevFromDeck("monopoly", "dev-b-2")
    );
    uiApp.render();

    // On Alice's PRE_ROLL: Alice CAN roll dice or play Knight
    expect(uiApp.canControlPlayerOnThisDevice(room, aliceId)).toBe(true);
    expect(uiApp.canControlPlayerOnThisDevice(room, bot1Id)).toBe(false);
    expect(uiRoot.innerHTML).toContain('id="btn-roll-dice"');
    expect(uiRoot.innerHTML).toContain('id="btn-play-knight"');
    expect(uiRoot.innerHTML).toContain('id="btn-hand-play-knight"');

    // Advance to Alice's MAIN_PHASE
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    // Check map unobstructed when proposing Bank Trade or Player Trade
    const getBoardWrapHtml = (html: string): string => {
      const start = html.indexOf('<div class="board-svg-wrap">');
      const end = html.indexOf('<div class="action-dock">');
      return html.slice(start, end);
    };

    uiApp.switchTradeMode("maritime_trade");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="board-svg"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("sub-modal");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");

    uiApp.switchTradeMode("domestic_trade");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("sub-modal");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");

    // Check map unobstructed when Alice proposes a trade and waits / chooses partner
    const stMain = room.session.getState();
    for (const p of stMain.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        stMain.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    stMain.players[0]!.resources.brick = 2;
    stMain.bank.brick -= 2;
    stMain.players[2]!.resources.ore = 2;
    stMain.bank.ore -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: bot2Id,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("trade offer");
    expect(uiRoot.innerHTML).toContain("sub-modal--trade-offer");
    uiApp.dispatch(aliceId, { type: "CANCEL_DOMESTIC_TRADE" });

    // 2. End Alice's turn -> Bot 1's PRE_ROLL: Alice MUST NOT see Roll Dice or ANY Dev Card play buttons!
    uiApp.dispatch(aliceId, { type: "END_TURN" });
    expect(room.session.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot1Id);

    const forbiddenTurnButtons = [
      'id="btn-roll-dice"',
      'id="btn-play-knight"',
      'id="btn-play-roadbuild"',
      'id="btn-mode-yop"',
      'id="btn-mode-mono"',
      'id="btn-hand-play-knight"',
      'id="btn-hand-play-roadbuild"',
      'id="btn-hand-play-yop"',
      'id="btn-hand-play-mono"',
    ];
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }
    expect(uiRoot.innerHTML).toContain("Play on your turn");
    expect(uiRoot.innerHTML).toContain('class="visual-hand-tray"');

    // UI action guard also blocks programmatic UI dispatch attempts on Bot 1's turn
    uiApp.dispatchUiAction(bot1Id, { type: "ROLL_DICE" });
    uiApp.dispatchUiAction(aliceId, { type: "PLAY_KNIGHT" });
    expect(room.session.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot1Id);

    // 3. Advance to Bot 1's MAIN_PHASE: still NO roll dice or dev card play buttons!
    uiApp.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }

    // 4. Bot 1 sends a trade offer to Alice:
    //    - Map (.board-svg-wrap) stays 100% unobstructed (Accept/Decline docked in .action-dock > .sub-modal)
    //    - Alice still CANNOT play development cards or roll dice during Bot 1's turn!
    const stBotMain = room.session.getState();
    for (const p of stBotMain.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        stBotMain.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    stBotMain.players[1]!.resources.wool = 2;
    stBotMain.bank.wool -= 2;
    stBotMain.players[0]!.resources.lumber = 2;
    stBotMain.bank.lumber -= 2;
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("Accept");
    expect(uiRoot.innerHTML).toContain(`data-accept-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).toContain(`data-decline-trade="${aliceId}"`);
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }
  });
});
