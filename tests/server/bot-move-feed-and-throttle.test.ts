import { describe, expect, test } from "bun:test";
import { CatanEngine } from "../../packages/games/catan/src/index.ts";
import { SplendorEngine } from "../../packages/games/splendor/src/index.ts";
import { AzulEngine } from "../../packages/games/azul/src/index.ts";
import { SevenWondersEngine } from "../../packages/games/seven-wonders/src/index.ts";
import { createPlatformServer } from "../../apps/server/src/index.ts";
import {
  DEFAULT_BOT_STEP_DELAY_MS,
  MAX_BOT_STEP_DELAY_MS,
  MIN_BOT_STEP_DELAY_MS,
  clampServerBotStepDelayMsPure,
} from "../../apps/server/src/config.ts";
import {
  DEFAULT_BOT_MOVE_THROTTLE_MS,
  DEFAULT_SHOW_BOT_MOVES,
  MultiGamePlatformApp,
  clampBotMoveThrottleMsPure,
  classifyBotEventCategoryPure,
  extractBotMoveFeedPure,
  formatBotThrottleShortPure,
  getBotMoveThrottlePresetPure,
  getNextBotMoveThrottlePresetPure,
} from "../../apps/web/src/app.ts";
import { authHeadersForTestGuest, createFakeDomRoot } from "./helpers.ts";

describe("Bot Move Feed (Default ON + Toggle) & Move Throttle", () => {
  test("clamps and cycles bot throttle presets cleanly on client and server", () => {
    expect(DEFAULT_SHOW_BOT_MOVES).toBe(true);
    expect(DEFAULT_BOT_MOVE_THROTTLE_MS).toBe(1200);
    expect(DEFAULT_BOT_STEP_DELAY_MS).toBe(1200);

    expect(clampBotMoveThrottleMsPure(50)).toBe(150);
    expect(clampBotMoveThrottleMsPure(99_999)).toBe(5000);
    expect(clampBotMoveThrottleMsPure(Number.NaN)).toBe(1200);
    expect(clampServerBotStepDelayMsPure(10)).toBe(MIN_BOT_STEP_DELAY_MS);
    expect(clampServerBotStepDelayMsPure(20_000)).toBe(MAX_BOT_STEP_DELAY_MS);

    expect(getBotMoveThrottlePresetPure(350).id).toBe("fast");
    expect(getBotMoveThrottlePresetPure(1200).id).toBe("normal");
    expect(getBotMoveThrottlePresetPure(2200).id).toBe("slow");

    expect(getNextBotMoveThrottlePresetPure(1200).id).toBe("slow");
    expect(getNextBotMoveThrottlePresetPure(2200).id).toBe("fast");
    expect(getNextBotMoveThrottlePresetPure(350).id).toBe("normal");

    expect(formatBotThrottleShortPure(350)).toBe("0.35s");
    expect(formatBotThrottleShortPure(1200)).toBe("1.2s");
    expect(formatBotThrottleShortPure(2200)).toBe("2.2s");
    expect(formatBotThrottleShortPure(1000)).toBe("1s");

    expect(classifyBotEventCategoryPure("DICE_ROLLED")).toBe("Roll");
    expect(classifyBotEventCategoryPure("SETTLEMENT_BUILT")).toBe("Build");
    expect(classifyBotEventCategoryPure("MARITIME_TRADE")).toBe("Trade");
    expect(classifyBotEventCategoryPure("CARD_PURCHASED")).toBe("Buy");
    expect(classifyBotEventCategoryPure("TILES_DRAFTED")).toBe("Draft");
    expect(classifyBotEventCategoryPure("BUILD_WONDER_STAGE")).toBe("Wonder");
  });

  test("extracts redacted bot steps across Catan, Splendor, Azul, and 7 Wonders while filtering lifecycle events", () => {
    // 1. All-human game returns hasBots: false
    const allHumanCatan = CatanEngine.initGame(
      [
        { id: "h1", name: "Alice", color: "#e11d48", isBot: false },
        { id: "h2", name: "Bob", color: "#2563eb", isBot: false },
        { id: "h3", name: "Cara", color: "#16a34a", isBot: false },
      ],
      { startingPlayerIndex: 0 },
      "all-human-feed"
    );
    const humanOnlyFeed = extractBotMoveFeedPure("catan", allHumanCatan);
    expect(humanOnlyFeed.hasBots).toBe(false);
    expect(humanOnlyFeed.latestMove).toBeNull();

    // 2. Catan: filters TURN_STARTED and tracks bot steps after human move
    const mixedPlayers = [
      { id: "h1", name: "Alice", color: "#e11d48", isBot: false },
      { id: "b1", name: "Bot 1", color: "#2563eb", isBot: true },
      { id: "b2", name: "Bot 2", color: "#16a34a", isBot: true },
    ];
    let catanState = CatanEngine.initGame(
      mixedPlayers,
      { startingPlayerIndex: 0 },
      "catan-bot-feed-seed"
    );
    const hSet = CatanEngine.getLegalActions(catanState, "h1")[0]!;
    catanState = CatanEngine.applyAction(catanState, "h1", hSet).state;
    const hRoad = CatanEngine.getLegalActions(catanState, "h1")[0]!;
    catanState = CatanEngine.applyAction(catanState, "h1", hRoad).state;
    // Bot 1 places settlement + road
    const b1Set = CatanEngine.chooseBotAction(catanState, "b1")!;
    catanState = CatanEngine.applyAction(catanState, "b1", b1Set).state;
    const b1Road = CatanEngine.chooseBotAction(catanState, "b1")!;
    catanState = CatanEngine.applyAction(catanState, "b1", b1Road).state;

    // Append a synthetic TURN_STARTED lifecycle event to confirm it is ignored
    const withLifecycle = {
      ...catanState,
      eventLog: [
        ...catanState.eventLog,
        {
          id: "evt-synthetic-turn-start",
          timestamp: 999,
          turn: 2,
          playerId: "b2",
          type: "TURN_STARTED",
          message: "Turn 2: Bot 2's turn.",
        },
      ],
    };
    const catanFeed = extractBotMoveFeedPure(
      "catan",
      CatanEngine.getPlayerView(withLifecycle, "h1")
    );
    expect(catanFeed.hasBots).toBe(true);
    expect(catanFeed.totalBotMoves).toBe(2);
    expect(catanFeed.sinceHumanCount).toBe(2);
    expect(catanFeed.latestMove?.playerId).toBe("b1");
    expect(catanFeed.latestMove?.type).toBe("SETUP_EDGE");
    expect(catanFeed.latestMove?.categoryLabel).toBe("Setup");

    // 3. Splendor bot step
    let splState = SplendorEngine.initGame(
      mixedPlayers,
      { startingPlayerIndex: 1 },
      "splendor-bot-feed-seed"
    );
    const splAct = SplendorEngine.chooseBotAction(splState, "b1")!;
    splState = SplendorEngine.applyAction(splState, "b1", splAct).state;
    const splFeed = extractBotMoveFeedPure(
      "splendor",
      SplendorEngine.getPlayerView(splState, "h1")
    );
    expect(splFeed.hasBots).toBe(true);
    expect(splFeed.totalBotMoves).toBeGreaterThanOrEqual(1);
    expect(splFeed.latestMove?.playerId).toBe("b1");
    expect(splFeed.latestMove?.message).toContain("Bot 1");

    // 4. Azul bot step
    let azulState = AzulEngine.initGame(
      mixedPlayers,
      { startingPlayerIndex: 1 },
      "azul-bot-feed-seed"
    );
    const azulAct = AzulEngine.chooseBotAction(azulState, "b1")!;
    azulState = AzulEngine.applyAction(azulState, "b1", azulAct).state;
    const azulFeed = extractBotMoveFeedPure(
      "azul",
      AzulEngine.getPlayerView(azulState, "h1")
    );
    expect(azulFeed.hasBots).toBe(true);
    expect(azulFeed.latestMove?.playerId).toBe("b1");
    expect(azulFeed.latestMove?.categoryLabel).toBe("Draft");

    // 5. 7 Wonders: hidden draft picks are NOT leaked before reveal; simultaneous reveal populates batch
    let swState = SevenWondersEngine.initGame(
      mixedPlayers,
      { startingPlayerIndex: 0 },
      "sw-bot-feed-seed"
    );
    const b1Pick = SevenWondersEngine.chooseBotAction(swState, "b1")!;
    swState = SevenWondersEngine.applyAction(swState, "b1", b1Pick).state;
    const preRevealFeed = extractBotMoveFeedPure(
      "seven_wonders",
      SevenWondersEngine.getPlayerView(swState, "h1")
    );
    expect(preRevealFeed.hasBots).toBe(true);
    expect(preRevealFeed.totalBotMoves).toBe(0);
    expect(preRevealFeed.latestMove).toBeNull();

    const hPick = SevenWondersEngine.getLegalActions(swState, "h1")[0]!;
    swState = SevenWondersEngine.applyAction(swState, "h1", hPick).state;
    const b2Pick = SevenWondersEngine.chooseBotAction(swState, "b2")!;
    swState = SevenWondersEngine.applyAction(swState, "b2", b2Pick).state;

    const postRevealFeed = extractBotMoveFeedPure(
      "seven_wonders",
      SevenWondersEngine.getPlayerView(swState, "h1")
    );
    expect(postRevealFeed.totalBotMoves).toBe(2);
    expect(postRevealFeed.latestSimultaneousBatch.length).toBe(2);
    expect(
      postRevealFeed.latestSimultaneousBatch.map((m) => m.playerId).sort()
    ).toEqual(["b1", "b2"]);
  });

  test("renders Bot moves ON by default with toggle, history drawer, pace cycle, and hides controls in 0-bot games", () => {
    const fakeRoot = createFakeDomRoot();
    const app = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    app.autoRespondBotsToHuman = false;
    expect(app.showBotMoves).toBe(true);
    expect(app.botMoveThrottleMs).toBe(1200);

    // Room setup for room-1 (has 3 bots) shows Bot move pace selector
    app.enterOrJoinRoom("room-1");
    expect(fakeRoot.innerHTML).toContain('id="setup-sel-bot-pace"');

    // Start match with bot moving first
    const room1 = app.getActiveRoom();
    room1.startingPlayerMode = room1.players.find((p) => p.isBot)!.id;
    app.startRoomMatch("room-1");

    // Default ON: banner has toggle + pace control, and bot feed bar renders
    expect(fakeRoot.innerHTML).toContain('id="btn-toggle-bot-moves"');
    expect(fakeRoot.innerHTML).toContain("Bot moves: On");
    expect(fakeRoot.innerHTML).toContain('id="btn-cycle-bot-pace"');
    expect(fakeRoot.innerHTML).toContain("Pace: Normal (1.2s)");
    expect(fakeRoot.innerHTML).toContain('class="ga-bot-feed');

    // Step 2 bot moves and confirm latest step + expandable history drawer render
    expect(app.stepOneBotMove(true)).toBe(true);
    expect(fakeRoot.innerHTML).toContain("placed their 1st settlement");
    expect(app.stepOneBotMove(true)).toBe(true);
    expect(fakeRoot.innerHTML).toContain("placed a starting road");
    expect(fakeRoot.innerHTML).toContain('id="btn-toggle-bot-feed-history"');
    expect(fakeRoot.innerHTML).toContain("2 new");

    // Expand history drawer
    app.toggleBotFeedHistory();
    expect(app.botFeedHistoryExpanded).toBe(true);
    expect(fakeRoot.innerHTML).toContain('class="ga-bot-feed__drawer"');
    expect(fakeRoot.innerHTML).toContain("Recent bot steps (2");

    // Cycle pace: Normal -> Slow -> Fast
    app.cycleBotMoveThrottle();
    expect(app.botMoveThrottleMs).toBe(2200);
    expect(room1.botStepDelayMs).toBe(2200);
    expect(fakeRoot.innerHTML).toContain("Pace: Slow (2.2s)");

    app.cycleBotMoveThrottle();
    expect(app.botMoveThrottleMs).toBe(350);
    expect(fakeRoot.innerHTML).toContain("Pace: Fast (0.35s)");

    // Toggle Bot moves OFF -> hides feed bar and collapses history drawer, keeps banner toggle
    app.toggleShowBotMoves();
    expect(app.showBotMoves).toBe(false);
    expect(app.botFeedHistoryExpanded).toBe(false);
    expect(fakeRoot.innerHTML).toContain("Bot moves: Off");
    expect(fakeRoot.innerHTML).not.toContain('class="ga-bot-feed');

    // Toggle back ON -> restores feed bar showing latest bot move
    app.toggleShowBotMoves();
    expect(app.showBotMoves).toBe(true);
    expect(fakeRoot.innerHTML).toContain("Bot moves: On");
    expect(fakeRoot.innerHTML).toContain("placed a starting road");

    // Create a 0-bot local pass-and-play Splendor room -> bot controls & feed are omitted
    const humanRoom = app.createLocalRoom({
      gameId: "splendor",
      ownerId: app.currentUserId,
      ownerName: app.currentUserName,
      botCount: 0,
      startingPlayerMode: "first",
    });
    app.addLocalFriendToRoom(humanRoom, "Friend 2");
    app.enterOrJoinRoom(humanRoom.roomId);
    expect(fakeRoot.innerHTML).not.toContain('id="setup-sel-bot-pace"');
    app.startRoomMatch(humanRoom.roomId);
    expect(fakeRoot.innerHTML).not.toContain('id="btn-toggle-bot-moves"');
    expect(fakeRoot.innerHTML).not.toContain('id="btn-cycle-bot-pace"');
    expect(fakeRoot.innerHTML).not.toContain('class="ga-bot-feed');
  });

  test("offline local match throttles automatic bot responses by botStepDelayMs and reschedules on live pace change", async () => {
    const fakeRoot = createFakeDomRoot();
    const app = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    const room = app.createLocalRoom({
      gameId: "azul",
      ownerId: app.currentUserId,
      ownerName: app.currentUserName,
      botCount: 2,
      botStepDelayMs: 650,
      startingPlayerMode: "first",
    });
    const botId = room.players.find((p) => p.isBot)!.id;
    room.startingPlayerMode = botId;
    app.enterOrJoinRoom(room.roomId);
    app.startRoomMatch(room.roomId);

    try {
      expect(room.session!.getStep()).toBe(0);
      // After 200ms, the 650ms throttle holds the bot before acting
      await new Promise((r) => setTimeout(r, 200));
      expect(room.session!.getStep()).toBe(0);

      // Speeding up live reschedules the pending timeout to 150ms
      app.setBotMoveThrottleMs(150);
      const deadline = Date.now() + 900;
      while (Date.now() < deadline && room.session!.getStep() < 1) {
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(room.session!.getStep()).toBeGreaterThanOrEqual(1);
      expect(fakeRoot.innerHTML).toContain('class="ga-bot-feed');
    } finally {
      app.stopAutoPlay();
    }
  });

  test("server defaults botStepDelayMs to 1200ms, guards /bot-speed, and throttles live auto-stepped bot turns", async () => {
    const srv = createPlatformServer();
    const { server } = srv;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const hostHeaders = authHeadersForTestGuest(srv, "host-1");
      const spectatorHeaders = authHeadersForTestGuest(srv, "spec-1");

      // Create Splendor room with default throttle (1200ms) and bot going first
      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          gameId: "splendor",
          ownerId: "host-1",
          hostName: "Host",
          botCount: 2,
          startingPlayerMode: "first",
          autoStepBots: true,
          autoStart: false,
        }),
      });
      const created = await createRes.json();
      const roomId = created.room.roomId as string;
      expect(created.room.botStepDelayMs).toBe(DEFAULT_BOT_STEP_DELAY_MS);

      // Spectator cannot change room bot speed (403)
      const specRes = await fetch(`${baseUrl}/api/rooms/${roomId}/bot-speed`, {
        method: "POST",
        headers: spectatorHeaders,
        body: JSON.stringify({
          requesterId: "spec-1",
          botStepDelayMs: 350,
        }),
      });
      expect(specRes.status).toBe(403);

      // Invalid payload returns 400
      const badRes = await fetch(`${baseUrl}/api/rooms/${roomId}/bot-speed`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          requesterId: "host-1",
          botStepDelayMs: "not-a-number",
        }),
      });
      expect(badRes.status).toBe(400);

      // Out-of-bounds value is clamped to MAX_BOT_STEP_DELAY_MS
      const clampRes = await fetch(`${baseUrl}/api/rooms/${roomId}/bot-speed`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          requesterId: "host-1",
          botStepDelayMs: 99_999,
        }),
      });
      expect(clampRes.status).toBe(200);
      const clamped = await clampRes.json();
      expect(clamped.room.botStepDelayMs).toBe(MAX_BOT_STEP_DELAY_MS);

      // Configure bot to start first with 700ms throttle, start match, verify bot does NOT act before 200ms
      const botId = created.room.players.find((p: any) => p.isBot)!.id as string;
      await fetch(`${baseUrl}/api/rooms/${roomId}/setup`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          requesterId: "host-1",
          startingPlayerMode: botId,
          botStepDelayMs: 700,
        }),
      });

      const startRes = await fetch(`${baseUrl}/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({ requesterId: "host-1" }),
      });
      const started = await startRes.json();
      expect(started.room.step).toBe(0);
      expect(started.room.botStepDelayMs).toBe(700);

      // After 200ms, the 700ms throttle should still hold the bot at step 0
      await new Promise((r) => setTimeout(r, 200));
      const midSnap = await (
        await fetch(`${baseUrl}/api/rooms/${roomId}`, { headers: hostHeaders })
      ).json();
      expect(midSnap.room.step).toBe(0);

      // Live-switch pace to fast (150ms): server reschedules timer immediately and bot acts promptly
      const speedUpRes = await fetch(
        `${baseUrl}/api/rooms/${roomId}/bot-speed`,
        {
          method: "POST",
          headers: hostHeaders,
          body: JSON.stringify({
            requesterId: "host-1",
            botStepDelayMs: 150,
          }),
        }
      );
      expect(speedUpRes.status).toBe(200);

      let stepped = false;
      const deadline = Date.now() + 1200;
      while (Date.now() < deadline) {
        const snap = await (
          await fetch(`${baseUrl}/api/rooms/${roomId}`, { headers: hostHeaders })
        ).json();
        if (snap.room.step >= 1) {
          const feed = extractBotMoveFeedPure("splendor", snap.state);
          expect(feed.latestMove).not.toBeNull();
          expect(feed.latestMove?.playerId).toBe(botId);
          stepped = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(stepped).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
