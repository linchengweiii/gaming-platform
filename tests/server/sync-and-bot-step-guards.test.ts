import { describe, expect, test } from "bun:test";
import { CatanEngine } from "../../packages/games/catan/src/index.ts";
import {
  createPlatformServer,
  decodeWsFramesStreamPure,
  encodeWsTextFramePure,
} from "../../apps/server/src/index.ts";
import {
  MultiGamePlatformApp,
  createInitialAppModelPure,
  extractDebugModeFromLocationPure,
  syncOnlineLobbyRoomsPure,
  upsertRoomFromSummaryPure,
} from "../../apps/web/src/app.ts";
import { createFakeDomRoot } from "./helpers.ts";

describe("@gaming-platform/server - Sync Revisions, Auto-Bots Continuity & Step-Bot Guards", () => {
  test("hides debug bot controls in normal play, and in debugMode blocks Step bot on human turns while preserving Undo", async () => {
    const fakeRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    uiApp.autoRespondBotsToHuman = false;
    uiApp.enterOrJoinRoom("room-1");
    const localRoom = uiApp.getActiveRoom();
    localRoom.startingPlayerMode = "first";
    uiApp.startRoomMatch("room-1");

    // Normal player mode (debugMode = false by default): Auto-place setup, Auto-bots, Step bot, and Auto-sim are hidden so .board-banner stays uncluttered!
    expect(uiApp.debugMode).toBe(false);
    expect(fakeRoot.innerHTML).not.toContain('id="btn-finish-setup"');
    expect(fakeRoot.innerHTML).not.toContain('id="btn-toggle-bot-response"');
    expect(fakeRoot.innerHTML).not.toContain('id="btn-step-bot"');
    expect(fakeRoot.innerHTML).not.toContain('id="btn-autoplay"');
    expect(extractDebugModeFromLocationPure("?debug=1", "")).toBe(true);
    expect(extractDebugModeFromLocationPure("", "#debug")).toBe(true);
    expect(extractDebugModeFromLocationPure("", "#room=ab12cd")).toBe(false);

    // Enable debugMode: debug controls appear, #btn-step-bot is disabled on Player 1's own turn, and stepOneBotMove(true) refuses to move Player 1
    uiApp.debugMode = true;
    uiApp.render();
    expect(fakeRoot.innerHTML).toContain('id="btn-finish-setup"');
    expect(fakeRoot.innerHTML).toContain('id="btn-toggle-bot-response"');
    expect(fakeRoot.innerHTML).toContain('id="btn-step-bot"');
    expect(
      /<button[^>]*id="btn-step-bot"[^>]*disabled/.test(fakeRoot.innerHTML)
    ).toBe(true);
    expect(uiApp.stepOneBotMove(true)).toBe(false);
    expect(localRoom.session!.getStep()).toBe(0);

    // Verify live HTTP /bot-step also blocks stepping humans while preserving requesterId view & canUndo
    const { server } = createPlatformServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "human-1",
          hostName: "Alice",
          botCount: 3,
          startingPlayerMode: "first",
          autoStepBots: false,
          autoStart: true,
        }),
      });
      const created = await createRes.json();
      const roomId = created.room.roomId as string;

      // Alice places her 1st reversible setup settlement (now on SETUP_ROAD_1, still Alice's turn)
      const firstSettlement = CatanEngine.getLegalActions(
        created.state,
        "human-1"
      )[0]!;
      const actRes = await fetch(`${baseUrl}/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: "human-1",
          requesterId: "human-1",
          action: firstSettlement,
        }),
      });
      const afterSettlement = await actRes.json();
      expect(afterSettlement.actingPlayerId).toBe("human-1");
      expect(afterSettlement.room.canUndo).toBe(true);
      expect(afterSettlement.room.undoableSteps).toBe(1);

      // Calling /bot-step on Alice's turn must NOT execute a move for Alice, must NOT redact her hand, and keeps canUndo = true!
      const botStepRes = await fetch(
        `${baseUrl}/api/rooms/${roomId}/bot-step`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterId: "human-1", onlyBots: true }),
        }
      );
      const stepped = await botStepRes.json();
      expect(stepped.actedPlayerId).toBeNull();
      expect(stepped.action).toBeNull();
      expect(stepped.actingPlayerId).toBe("human-1");
      expect(stepped.state.phase).toBe("SETUP_ROAD_1");
      expect(stepped.room.canUndo).toBe(true);
      expect(stepped.room.undoableSteps).toBe(1);
      const aliceView = stepped.state.players.find(
        (p: any) => p.id === "human-1"
      );
      expect(Boolean(aliceView?.handRedacted)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("preserves autoStepBots across /undo & /redo and resumes automatic bot turns after manual /bot-step", async () => {
    const { server } = createPlatformServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "human-1",
          hostName: "Alice",
          botCount: 2,
          startingPlayerMode: "first",
          autoStepBots: true,
          autoStart: true,
        }),
      });
      const created = await createRes.json();
      const roomId = created.room.roomId as string;
      expect(created.room.autoStepBots).toBe(true);

      // Place 1st settlement, Undo it, and verify autoStepBots remains true!
      const firstSettlement = CatanEngine.getLegalActions(
        created.state,
        "human-1"
      )[0]!;
      await fetch(`${baseUrl}/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: "human-1",
          requesterId: "human-1",
          action: firstSettlement,
        }),
      });

      const undoRes = await fetch(`${baseUrl}/api/rooms/${roomId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: "human-1" }),
      });
      const undone = await undoRes.json();
      expect(undone.room.autoStepBots).toBe(true);
      expect(undone.state.phase).toBe("SETUP_SETTLEMENT_1");

      // Redo settlement, place road -> Bot 1's turn starts; trigger manual /bot-step mid-bot-turn
      await fetch(`${baseUrl}/api/rooms/${roomId}/redo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: "human-1" }),
      });
      const roomSnapRes = await fetch(
        `${baseUrl}/api/rooms/${roomId}?playerId=human-1`
      );
      const roomSnap = await roomSnapRes.json();
      const firstRoad = CatanEngine.getLegalActions(
        roomSnap.state,
        "human-1"
      )[0]!;
      const roadRes = await fetch(`${baseUrl}/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: "human-1",
          requesterId: "human-1",
          action: firstRoad,
        }),
      });
      const afterRoad = await roadRes.json();
      expect(afterRoad.actingPlayerId).not.toBe("human-1");

      // Immediately call /bot-step: it steps 1 micro-action AND re-schedules remaining bot snake-draft steps back to Alice!
      const stepRes = await fetch(`${baseUrl}/api/rooms/${roomId}/bot-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: "human-1", onlyBots: true }),
      });
      const stepped = await stepRes.json();
      expect(stepped.actedPlayerId).not.toBeNull();

      // Poll briefly (without shell sleep) via micro-yields until bots return snake draft to Alice's 2nd settlement
      let returnedToAlice = false;
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        const checkRes = await fetch(
          `${baseUrl}/api/rooms/${roomId}?playerId=human-1`
        );
        const checkData = await checkRes.json();
        if (
          checkData.actingPlayerId === "human-1" &&
          checkData.state.phase === "SETUP_SETTLEMENT_2"
        ) {
          returnedToAlice = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      expect(returnedToAlice).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test("ignores stale out-of-order HTTP revisions and isolates active room Undo & autoRespondBotsToHuman from LOBBY_ROOMS", () => {
    let model = createInitialAppModelPure(
      {
        forceLocalMode: false,
        startAtLogin: false,
      },
      {
        isStaticHost: false,
        isBrowserHttp: true,
        randomGuestSuffix: 42,
        deviceGuests: [],
        savedGuest: null,
        nowMs: 1_700_000_000_000,
      }
    );

    // Apply newer WS ROOM_STATE at revision 12 (bots finished; back to human p1 with 1 undoable step and autoStepBots = false)
    const wsUpsert = upsertRoomFromSummaryPure(
      model,
      {
        roomId: "ab12cd",
        name: "#ab12cd",
        gameId: "catan",
        ownerId: "p1",
        ownerName: "Alice",
        status: "in_progress",
        botCount: 3,
        botDifficulty: "master",
        allBots: false,
        startingPlayerMode: "first",
        autoStepBots: false,
        players: [
          { id: "p1", name: "Alice", color: "#e11d48", isBot: false },
          { id: "p2", name: "Bot 1", color: "#2563eb", isBot: true },
        ],
        config: { scenarioId: "standard" },
        canUndo: true,
        undoableSteps: 1,
        canRedo: false,
        step: 9,
        revision: 12,
      },
      { phase: "SETUP_ROAD_2", players: [] },
      "p1"
    );
    model = { ...wsUpsert.model, activeRoomId: "ab12cd" };
    model = upsertRoomFromSummaryPure(
      model,
      { ...wsUpsert.room, revision: 12 },
      { phase: "SETUP_ROAD_2", players: [] },
      "p1"
    ).model;
    expect(model.autoRespondBotsToHuman).toBe(false);

    // Late HTTP response from earlier POST /action arrives with revision 9 (actingPlayerId = p2 Bot 1, canUndo = false)
    const staleHttp = upsertRoomFromSummaryPure(
      model,
      {
        ...wsUpsert.room,
        canUndo: false,
        undoableSteps: 0,
        step: 6,
        revision: 9,
      },
      { phase: "SETUP_SETTLEMENT_1", players: [] },
      "p2"
    );
    expect(staleHttp.room.revision).toBe(12);
    expect(staleHttp.room.remoteActingPlayerId).toBe("p1");
    expect(staleHttp.room.canUndo).toBe(true);
    expect(staleHttp.room.undoableSteps).toBe(1);

    // Unauthenticated LOBBY_ROOMS broadcast arrives with ab12cd (canUndo: false) + another room ef34ab (autoStepBots: true)
    const afterLobbySync = syncOnlineLobbyRoomsPure(staleHttp.model, [
      {
        ...wsUpsert.room,
        canUndo: false,
        undoableSteps: 0,
        autoStepBots: false,
        revision: 13,
      },
      {
        roomId: "ef34ab",
        name: "#ef34ab",
        gameId: "splendor",
        ownerId: "p9",
        ownerName: "Bob",
        status: "lobby",
        botCount: 2,
        autoStepBots: true,
        players: [],
        config: {},
        canUndo: false,
        undoableSteps: 0,
        canRedo: false,
        step: 0,
        revision: 2,
      },
    ]);

    // Active room keeps its viewer-scoped canUndo = true and autoRespondBotsToHuman stays false!
    expect(afterLobbySync.rooms["ab12cd"]?.canUndo).toBe(true);
    expect(afterLobbySync.rooms["ab12cd"]?.undoableSteps).toBe(1);
    expect(afterLobbySync.rooms["ab12cd"]?.remoteActingPlayerId).toBe("p1");
    expect(afterLobbySync.autoRespondBotsToHuman).toBe(false);
  });

  test("buffers TCP-fragmented WebSocket frames cleanly and replies PONG (0x8a) to client PING (0x89)", async () => {
    const fullFrame = encodeWsTextFramePure({
      type: "SUBSCRIBE_ROOM",
      roomId: "ab12cd",
      playerId: "p1",
    });
    const part1 = fullFrame.subarray(0, 7);
    const part2 = fullFrame.subarray(7);

    const firstPass = decodeWsFramesStreamPure(part1);
    expect(firstPass.frames.length).toBe(0);
    expect(firstPass.remainder.length).toBe(7);

    const secondPass = decodeWsFramesStreamPure(
      Buffer.concat([firstPass.remainder, part2])
    );
    expect(secondPass.frames.length).toBe(1);
    expect(secondPass.remainder.length).toBe(0);
    expect(JSON.parse(secondPass.frames[0]!.text!)).toEqual({
      type: "SUBSCRIBE_ROOM",
      roomId: "ab12cd",
      playerId: "p1",
    });

    // Verify live server WS hub buffers split TCP chunks AND responds to masked client PING (0x89) with PONG (0x8a)
    const srv = createPlatformServer();
    const room = srv.roomManager.createRoom({
      gameId: "catan",
      ownerId: "p1",
      hostName: "Alice",
      botCount: 3,
      autoStepBots: false,
      autoStart: true,
    });

    const listeners: Record<string, Array<(arg?: any) => void>> = {};
    const writtenFrames: Array<{ opcode: number; text?: string; payload?: Buffer }> = [];
    const fakeSocket: any = {
      destroyed: false,
      writable: true,
      on: (ev: string, fn: (arg?: any) => void) => {
        listeners[ev] = [...(listeners[ev] ?? []), fn];
      },
      write: (chunk: Buffer | string) => {
        if (Buffer.isBuffer(chunk)) {
          writtenFrames.push(...decodeWsFramesStreamPure(chunk).frames);
        }
      },
      destroy: () => {
        fakeSocket.destroyed = true;
        for (const fn of listeners.close ?? []) fn();
      },
    };

    try {
      srv.server.emit(
        "upgrade",
        { headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } },
        fakeSocket
      );

      // 1) Feed SUBSCRIBE_ROOM split across two TCP chunks and verify ROOM_STATE arrives only after chunk 2
      const subFrame = encodeWsTextFramePure({
        type: "SUBSCRIBE_ROOM",
        roomId: `#${room.roomId.toUpperCase()}`,
        playerId: "p1",
      });
      const beforeCount = writtenFrames.length;
      for (const fn of listeners.data ?? []) fn(subFrame.subarray(0, 6));
      expect(writtenFrames.length).toBe(beforeCount);

      for (const fn of listeners.data ?? []) fn(subFrame.subarray(6));
      const roomStates = writtenFrames
        .filter((f) => f.opcode === 0x01 && f.text)
        .map((f) => JSON.parse(f.text!))
        .filter((m) => m.type === "ROOM_STATE");
      expect(roomStates.length).toBe(1);
      expect(roomStates[0].roomId).toBe(room.roomId);

      // 2) Send masked RFC 6455 PING frame (0x89) with payload "hi" and verify PONG (0x0a) reply
      const pingBytes = Buffer.from([
        0x89,
        0x82,
        1,
        2,
        3,
        4,
        "h".charCodeAt(0) ^ 1,
        "i".charCodeAt(0) ^ 2,
      ]);
      for (const fn of listeners.data ?? []) fn(pingBytes);
      const pongFrames = writtenFrames.filter((f) => f.opcode === 0x0a);
      expect(pongFrames.length).toBe(1);
    } finally {
      fakeSocket.destroy();
      srv.server.emit("close");
    }
  });
});
