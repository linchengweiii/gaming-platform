import { describe, expect, test } from "bun:test";
import {
  createPlatformServer,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
  resolveEffectiveViewerIdPure,
} from "../../apps/server/src/index.ts";
import { CatanEngine } from "../../packages/games/catan/src/index.ts";
import { renderDropdown } from "../../apps/web/src/app/helpers/html-and-dropdown.ts";
import { renderCatanVisualHandTray } from "../../apps/web/src/catan-graphics.ts";
import { renderReferenceGuideModalPure } from "../../apps/web/src/tutorials.ts";
import { createMultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  authHeadersForTestGuest,
  createFakeDomRoot,
  readCombinedWebStyles,
} from "./helpers.ts";

describe("Audit Regressions: Server Security, WS Protocol, and Web UI/XSS", () => {
  test("blocks claiming local/bot/existing seat IDs via /api/guests/session and fixes local trade responder viewer resolution", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const base = `http://127.0.0.1:${(srv.server.address() as { port: number }).port}`;

    try {
      const aliceHeaders = authHeadersForTestGuest(srv, "g-alice");
      const created = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "catan",
            ownerId: "g-alice",
            hostName: "Alice",
            botCount: 2,
          }),
        })
      ).json();
      const roomId = created.room.roomId as string;
      const added = await (
        await fetch(`${base}/api/rooms/${roomId}/local-players`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({ requesterId: "g-alice", playerName: "LocalBob" }),
        })
      ).json();
      const localSeatId = added.player.id as string;

      // Attempting to claim local seat, bot seat (p3), or bot-1 is rejected
      for (const forbiddenId of [localSeatId, "p3", "bot-1"]) {
        const res = await fetch(`${base}/api/guests/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: forbiddenId }),
        });
        expect(res.status).toBe(403);
      }

      // resolveEffectiveViewerIdPure returns host's own ID when host responds to local seat's trade offer, and null for unseated viewer
      const room = srv.roomManager.getRoom(roomId);
      const effHost = resolveEffectiveViewerIdPure(room, "g-alice", "g-alice", {
        activeTradeOffer: { fromPlayerId: localSeatId },
      });
      expect(effHost).toBe("g-alice");
      expect(resolveEffectiveViewerIdPure(room, "p3", "p3", {})).toBeNull();
      expect(
        resolveEffectiveViewerIdPure(room, "g-stranger", "g-alice", {})
      ).toBeNull();
    } finally {
      srv.server.close();
    }
  });

  test("redacts raw bot action in /bot-step, locks down allBots rooms from non-owners, validates JSON body/botCount, and clears enable56PlayerExtension", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const base = `http://127.0.0.1:${(srv.server.address() as { port: number }).port}`;

    try {
      const aliceHeaders = authHeadersForTestGuest(srv, "g-alice");
      const bobHeaders = authHeadersForTestGuest(srv, "g-bob");

      // Non-object JSON body returns 400
      const nullBody = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: aliceHeaders,
        body: "null",
      });
      expect(nullBody.status).toBe(400);

      // 7 Wonders bot-step does not leak secret cardId/kind in HTTP response
      const swRoom = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "seven_wonders",
            ownerId: "g-alice",
            hostName: "Alice",
            botCount: 2,
            autoStepBots: false,
            autoStart: true,
          }),
        })
      ).json();
      const swRoomId = swRoom.room.roomId as string;
      const aliceCardId = swRoom.state.players[0].hand[0].id;
      await fetch(`${base}/api/rooms/${swRoomId}/action`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          playerId: "g-alice",
          action: {
            type: "SELECT_DRAFT_ACTION",
            kind: "discard",
            cardId: aliceCardId,
          },
        }),
      });
      const stepRes = await (
        await fetch(`${base}/api/rooms/${swRoomId}/bot-step`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({ requesterId: "g-alice", onlyBots: true }),
        })
      ).json();
      expect(stepRes.actedPlayerId).toBeTruthy();
      expect(stepRes.action).toEqual({ type: "SELECT_DRAFT_ACTION" });
      expect(stepRes.action.cardId).toBeUndefined();
      expect(stepRes.action.kind).toBeUndefined();

      // allBots room cannot be joined, stepped, or toggled by non-owner Bob
      const allBotsRes = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "catan",
            ownerId: "g-alice",
            hostName: "Alice",
            allBots: true,
            autoStepBots: false,
          }),
        })
      ).json();
      const abId = allBotsRes.room.roomId as string;
      const bobJoin = await fetch(`${base}/api/rooms/${abId}/join`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerName: "Bob", playerId: "g-bob" }),
      });
      expect(bobJoin.status).toBe(400);
      const bobAuto = await fetch(`${base}/api/rooms/${abId}/auto-bots`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ requesterId: "g-bob", enabled: true }),
      });
      expect(bobAuto.status).toBe(403);

      // Switching Catan from 5-6P back to standard clears enable56PlayerExtension, and NaN botCount throws
      const catanLobby = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "catan",
            ownerId: "g-alice",
            hostName: "Alice",
            botCount: 2,
          }),
        })
      ).json();
      const cId = catanLobby.room.roomId as string;
      const badBots = await fetch(`${base}/api/rooms/${cId}/setup`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice", botCount: "abc" }),
      });
      expect(badBots.status).toBe(400);

      await fetch(`${base}/api/rooms/${cId}/setup`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          requesterId: "g-alice",
          config: { scenarioId: "big_island_5_6" },
        }),
      });
      const backToStd = await (
        await fetch(`${base}/api/rooms/${cId}/setup`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            requesterId: "g-alice",
            config: { scenarioId: "standard" },
          }),
        })
      ).json();
      expect(backToStd.room.config.enable56PlayerExtension).toBe(false);

      // Idle session pruning keeps active players and evicts expired unreferenced tokens
      const idleSession = srv.guestSessions.issueSession("g-idle-visitor");
      expect(srv.guestSessions.verifyToken(idleSession.token)).toBe("g-idle-visitor");
      const pruned = srv.guestSessions.pruneIdleSessions(
        new Set(["g-alice"]),
        Date.now() + 7 * 60 * 60 * 1000
      );
      expect(pruned).toBeGreaterThanOrEqual(1);
      expect(srv.guestSessions.verifyToken(idleSession.token)).toBeNull();
    } finally {
      srv.server.close();
    }
  });

  test("WS protocol handles 15k frames iteratively, caps continuation fragments, and processes upgrade head buffer", () => {
    // 15,000 tiny PONG frames in one chunk do not overflow the call stack
    const pong = encodeWsControlFramePure(0x0a);
    const bigChunk = Buffer.concat(Array.from({ length: 15000 }, () => pong));
    const decoded = decodeWsFramesStreamPure(bigChunk);
    expect(decoded.frames.length).toBe(15000);

    // >128 0-byte continuation frames rejected to prevent memory/CPU DoS
    const startFrag = Buffer.from([0x01, 0x00]);
    const contFrag = Buffer.from([0x00, 0x00]);
    const flood = Buffer.concat([
      startFrag,
      ...Array.from({ length: 135 }, () => contFrag),
    ]);
    expect(() => decodeWsFramesStreamPure(flood)).toThrow();

    // Upgrade processes pipelined head buffer
    const srv = createPlatformServer();
    const sent: any[] = [];
    const socket: any = {
      destroyed: false,
      writable: true,
      setKeepAlive: () => {},
      on: () => {},
      write: (chunk: Buffer | string) => {
        if (Buffer.isBuffer(chunk)) {
          for (const f of decodeWsFramesStreamPure(chunk).frames) {
            if (f.opcode === 0x01 && f.text) sent.push(JSON.parse(f.text));
          }
        }
      },
      destroy: () => {
        socket.destroyed = true;
      },
    };
    const headFrame = encodeWsTextFramePure({ type: "PING" });
    srv.server.emit(
      "upgrade",
      { url: "/", headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } },
      socket,
      headFrame
    );
    expect(sent.some((m) => m.type === "PONG")).toBe(true);
    srv.server.close();
  });

  test("Web UI fixes desktop Splendor sub-modal CSS, escapes XSS in dropdown/Catan views, hides Catan HUD on Pass-and-Play privacy screen, and adds guide modal tabindex", () => {
    const css = readCombinedWebStyles();
    expect(css).toContain(
      ".ga-game-canvas .board-container--neutral .action-dock > .sub-modal"
    );
    expect(css).toContain("bottom: 100%");
    expect(css).toContain("flex-direction: column");

    // Dropdown escapes HTML in label and meta
    const xssPayload = '<img src=x onerror="alert(1)">';
    const ddHtml = renderDropdown({
      id: "test-dd",
      value: "a",
      options: [{ value: "a", label: xssPayload, meta: xssPayload }],
    });
    expect(ddHtml).not.toContain("<img src=x");
    expect(ddHtml).toContain("&lt;img src=x");

    // Catan hand tray escapes player name
    const catan = CatanEngine.initGame(
      [
        { id: "p1", name: xssPayload, color: "#e11d48", isBot: false, botDifficulty: "normal" },
        { id: "p2", name: "Bob", color: "#2563eb", isBot: true, botDifficulty: "normal" },
        { id: "p3", name: "Carol", color: "#16a34a", isBot: true, botDifficulty: "normal" },
      ],
      { scenarioId: "standard" },
      "xss-catan-hand"
    );
    const trayHtml = renderCatanVisualHandTray(catan, catan.players[0]!, []);
    expect(trayHtml).not.toContain("<img src=x");
    expect(trayHtml).toContain("&lt;img src=x");

    // Guide modal backdrop has tabindex="-1"
    expect(renderReferenceGuideModalPure("catan", false)).toContain('tabindex="-1"');

    // Pass-and-Play hidden hand hides Catan Roll dice / End turn map HUD
    const uiRoot = createFakeDomRoot();
    const app = createMultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    app.autoRespondBotsToHuman = false;
    app.startOfflineLocalFromLogin("Alice");
    const room = app.getActiveRoom();
    app.addLocalFriendToRoom(room, "Friend");
    room.botCount = 1;
    room.startingPlayerMode = "first";
    app.rebuildRoomSeats(room);
    app.startRoomMatch(room.roomId);
    app.finishSetupWithBots();
    app.hidePassAndPlayHand = true;
    app.render();
    expect(uiRoot.innerHTML).toContain("btn-reveal-hand");
    expect(uiRoot.innerHTML).not.toContain('id="btn-roll-dice"');
    expect(uiRoot.innerHTML).not.toContain('id="btn-end-turn"');
  });
});
