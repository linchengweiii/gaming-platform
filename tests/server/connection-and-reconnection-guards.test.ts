import { describe, expect, test } from "bun:test";
import path from "node:path";
import { CatanEngine, getNextActingPlayerId } from "@gaming-platform/catan";
import {
  createPlatformServer,
  decodeWsFramesStreamPure,
  encodeWsControlFramePure,
  encodeWsTextFramePure,
} from "../../apps/server/src/index.ts";
import { resolveSafeStaticPathPure } from "../../apps/server/src/http-ws/viewer-and-static.ts";
import { isLikelyStaticHostResponsePure } from "../../apps/web/src/app/controller/http-fetch-helper.ts";
import { findActiveRoomPure } from "../../apps/web/src/app/helpers/room-queries.ts";
import { syncOnlineLobbyRoomsPure } from "../../apps/web/src/app/reducers/room-sync-reducers.ts";
import { createInitialAppModelPure } from "../../apps/web/src/app/reducers/session-init-and-signin.ts";
import { computeWsReconnectDelayPure } from "../../apps/web/src/config/app-config.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { createFakeDomRoot } from "./helpers.ts";

function attachFakeWsClient(
  srv: ReturnType<typeof createPlatformServer>,
  playerId?: string
) {
  const listeners: Record<string, Array<(arg?: any) => void>> = {};
  const frames: Array<{ opcode: number; text?: string; payload?: Buffer }> = [];
  const socket: any = {
    destroyed: false,
    writable: true,
    writableLength: 0,
    setKeepAlive: () => {},
    on: (ev: string, fn: (arg?: any) => void) => {
      listeners[ev] = [...(listeners[ev] ?? []), fn];
    },
    write: (chunk: Buffer | string) => {
      if (Buffer.isBuffer(chunk)) {
        frames.push(...decodeWsFramesStreamPure(chunk).frames);
      }
    },
    destroy: () => {
      if (socket.destroyed) return;
      socket.destroyed = true;
      for (const fn of listeners.close ?? []) fn();
    },
  };
  srv.server.emit(
    "upgrade",
    {
      url: playerId ? `/?playerId=${encodeURIComponent(playerId)}` : "/",
      headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" },
    },
    socket
  );
  const sendChunk = (buf: Buffer) => {
    for (const fn of listeners.data ?? []) fn(buf);
  };
  const sendJsonMsg = (payload: unknown) => {
    sendChunk(encodeWsTextFramePure(payload));
  };
  const getJsonMessages = () =>
    frames
      .filter((f) => f.opcode === 0x01 && f.text)
      .map((f) => JSON.parse(f.text!));

  return { socket, frames, sendChunk, sendJsonMsg, getJsonMessages };
}

describe("@gaming-platform/server - Connection, Heartbeat & Reconnection Guards", () => {
  test("classifies transient 5xx vs static hosts accurately, applies exponential reconnect backoff, and guards empty online rooms & static paths", () => {
    // C1: 502/503/500/429 must NEVER brick client into staticHostOnly mode
    expect(isLikelyStaticHostResponsePure(502, "text/html", false)).toBe(false);
    expect(isLikelyStaticHostResponsePure(503, "application/json", false)).toBe(false);
    expect(isLikelyStaticHostResponsePure(500, "application/json", false)).toBe(false);
    expect(isLikelyStaticHostResponsePure(404, "text/html", false)).toBe(true);
    expect(isLikelyStaticHostResponsePure(200, "text/html", false)).toBe(true);
    expect(isLikelyStaticHostResponsePure(404, "text/html", true)).toBe(false);

    // M2: Exponential backoff with jitter cap
    expect(computeWsReconnectDelayPure(0, 0.5)).toBe(500);
    expect(computeWsReconnectDelayPure(1, 0.5)).toBe(1000);
    expect(computeWsReconnectDelayPure(2, 0.5)).toBe(2000);
    expect(computeWsReconnectDelayPure(10, 0.5)).toBe(10000);

    // M4: findActiveRoomPure returns null in online mode when activeRoomId is absent instead of returning a stranger's room
    const baseModel = createInitialAppModelPure(undefined, {
      isStaticHost: false,
      isBrowserHttp: true,
      randomGuestSuffix: 123,
      deviceGuests: [{ id: "g-alice", name: "Alice", mode: "guest" }],
      savedGuest: { id: "g-alice", name: "Alice", mode: "guest" },
      nowMs: 1700000000000,
    });
    const withStrangerRoom = syncOnlineLobbyRoomsPure(baseModel, [
      {
        roomId: "ef99ab",
        name: "Room #ef99ab",
        gameId: "splendor",
        ownerId: "g-stranger",
        ownerName: "Stranger",
        status: "lobby",
        botCount: 1,
        players: [{ id: "g-stranger", name: "Stranger", color: "#e11d48", isBot: false }],
        config: {},
      },
    ]);
    const lobbyModel = { ...withStrangerRoom, activeRoomId: "", viewMode: "lobby" as const };
    expect(findActiveRoomPure(lobbyModel)).toBeNull();

    // H3: syncOnlineLobbyRoomsPure prunes closed rooms when in lobby even if activeRoomId was previously pointing at it
    const staleLobby = { ...withStrangerRoom, activeRoomId: "ef99ab", viewMode: "lobby" as const };
    const afterClose = syncOnlineLobbyRoomsPure(staleLobby, []);
    expect(afterClose.rooms["ef99ab"]).toBeUndefined();

    // M3: Tab reopen via #room=<hash> recovers lastActiveGuestId seat when sessionStorage was cleared
    const recoveredModel = createInitialAppModelPure(undefined, {
      isStaticHost: false,
      isBrowserHttp: true,
      randomGuestSuffix: 555,
      deviceGuests: [{ id: "g-alice", name: "Alice", mode: "guest" }],
      savedGuest: null,
      lastActiveGuestId: "g-alice",
      nowMs: 1700000000000,
      locationHash: "#room=ab12cd",
    });
    expect(recoveredModel.isAuthenticated).toBe(true);
    expect(recoveredModel.currentUserId).toBe("g-alice");
    expect(recoveredModel.pendingInviteRoomId).toBe("ab12cd");

    // L2: Static path containment blocks directory traversal
    const pubRoot = path.resolve("/tmp/fake-public-dir");
    expect(resolveSafeStaticPathPure(pubRoot, "/../../etc/passwd")).toBe("");
    expect(resolveSafeStaticPathPure(pubRoot, "/styles.css")).toBe(
      path.join(pubRoot, "styles.css")
    );
  });

  test("evicts silent dead WebSocket peers via checkWsHeartbeats, emits ROOM_CLOSED on missing/closed rooms, and updates IDENTIFY_PLAYER for Private rooms", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const port = (srv.server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const room = srv.roomManager.createRoom({
        gameId: "splendor",
        ownerId: "g-alice",
        hostName: "Alice",
        botCount: 0,
        autoStart: false,
      });
      srv.roomManager.joinRoom(room.roomId, "Bob", false, "g-bob");

      const aliceWs = attachFakeWsClient(srv, "g-alice");
      const bobWs = attachFakeWsClient(srv, "g-bob");
      aliceWs.sendJsonMsg({
        type: "SUBSCRIBE_ROOM",
        roomId: room.roomId,
        playerId: "g-alice",
      });
      bobWs.sendJsonMsg({
        type: "SUBSCRIBE_ROOM",
        roomId: room.roomId,
        playerId: "g-bob",
      });

      // Keep Alice alive via PING right at t + 30s, while Bob goes silent (Wi-Fi drop without TCP FIN)
      const baseNow = Date.now();
      const evictedAt30s = srv.checkWsHeartbeats(baseNow + 30_000, 50_000);
      expect(evictedAt30s.length).toBe(0);

      // Refresh Alice's lastSeenMs by sending a PONG frame, while Bob never responds
      const origNow = Date.now;
      Date.now = () => baseNow + 40_000;
      try {
        aliceWs.sendChunk(encodeWsControlFramePure(0x0a));
      } finally {
        Date.now = origNow;
      }

      const evictedAt60s = srv.checkWsHeartbeats(baseNow + 60_000, 50_000);
      expect(evictedAt60s.length).toBe(1);
      expect(bobWs.socket.destroyed).toBe(true);
      expect(aliceWs.socket.destroyed).toBe(false);

      // Alice's latest ROOM_STATE now reports Bob in offlinePlayerIds!
      const aliceRoomStates = aliceWs
        .getJsonMessages()
        .filter((m) => m.type === "ROOM_STATE");
      expect(
        aliceRoomStates[aliceRoomStates.length - 1]?.room?.offlinePlayerIds
      ).toEqual(["g-bob"]);

      // H2: Subscribing to a non-existent room emits ROOM_CLOSED immediately, and HTTP GET returns 404
      aliceWs.sendJsonMsg({
        type: "SUBSCRIBE_ROOM",
        roomId: "dead99",
        playerId: "g-alice",
      });
      const closedMsgs = aliceWs
        .getJsonMessages()
        .filter((m) => m.type === "ROOM_CLOSED");
      expect(closedMsgs.some((m) => m.roomId === "dead99")).toBe(true);

      const res404 = await fetch(`${baseUrl}/api/rooms/dead99`);
      expect(res404.status).toBe(404);

      // C4: Sign-out clears wsClient.playerId, then IDENTIFY_PLAYER re-binds Charlie on the SAME open WS so Charlie sees his Private room
      await fetch(`${baseUrl}/api/guests/signout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "g-alice" }),
      });
      expect(
        aliceWs
          .getJsonMessages()
          .some((m) => m.type === "GUEST_SIGNED_OUT" && m.playerId === "g-alice")
      ).toBe(true);

      aliceWs.sendJsonMsg({
        type: "IDENTIFY_PLAYER",
        playerId: "g-charlie",
      });
      const privRoom = srv.roomManager.createRoom({
        gameId: "azul",
        ownerId: "g-charlie",
        hostName: "Charlie",
        isPrivate: true,
        botCount: 1,
      });
      aliceWs.sendJsonMsg({
        type: "IDENTIFY_PLAYER",
        playerId: "g-charlie",
      });
      const lobbyMsgs = aliceWs
        .getJsonMessages()
        .filter((m) => m.type === "LOBBY_ROOMS");
      const lastLobby = lobbyMsgs[lobbyMsgs.length - 1]!;
      expect(
        lastLobby.rooms.some((r: any) => r.roomId === privRoom.roomId)
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  test("preserves bot takeover across Undo after guest sign-out, blocks unauthorized match control, and reassembles RFC 6455 fragmented frames", async () => {
    // H5: Fragmented text frame (FIN=0 opcode=0x01 + interleaved 0x09 PING + FIN=1 opcode=0x00) splitting multi-byte UTF-8 ("🎲")
    const payloadBuf = Buffer.from(
      JSON.stringify({ type: "PING", note: "Roll 🎲 now" }),
      "utf8"
    );
    const splitIdx = payloadBuf.indexOf(0xf0) + 2; // right inside 4-byte emoji
    const partA = payloadBuf.subarray(0, splitIdx);
    const partB = payloadBuf.subarray(splitIdx);

    const frag1 = Buffer.concat([Buffer.from([0x01, partA.length]), partA]);
    const interleavedPing = encodeWsControlFramePure(0x09, Buffer.from("ok"));
    const frag2 = Buffer.concat([Buffer.from([0x80, partB.length]), partB]);

    const step1 = decodeWsFramesStreamPure(
      Buffer.concat([frag1, interleavedPing])
    );
    expect(step1.frames.length).toBe(1);
    expect(step1.frames[0]!.opcode).toBe(0x09);
    expect(step1.pendingFragments.length).toBe(1);

    const step2 = decodeWsFramesStreamPure(
      frag2,
      256 * 1024,
      step1.pendingFragments
    );
    expect(step2.pendingFragments.length).toBe(0);
    expect(step2.frames.length).toBe(1);
    expect(JSON.parse(step2.frames[0]!.text!)).toEqual({
      type: "PING",
      note: "Roll 🎲 now",
    });

    // H4 + C5: Sign-out converts player to bot across ALL snapshots so Undo never reverts isBot to false; non-seated callers are rejected
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const port = (srv.server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const room = srv.roomManager.createRoom({
        gameId: "catan",
        ownerId: "g-alice",
        hostName: "Alice",
        botCount: 1,
        startingPlayerMode: "first",
        autoStepBots: false,
        autoStart: false,
      });
      srv.roomManager.joinRoom(room.roomId, "Bob", false, "g-bob");
      srv.roomManager.startGame(room.roomId, "g-alice");

      // Alice places her first setup settlement (creates snapshot cursor = 1, undoableSteps = 1)
      const st0 = room.session!.getState();
      const legal0 = srv.roomManager.registry
        .get("catan")
        .getLegalActions(st0, "g-alice");
      srv.roomManager.dispatchAction(room.roomId, "g-alice", legal0[0]);

      // C5: Stranger cannot hijack /bot-step (onlyBots: false), /auto-bots, or /finish-setup
      const hijackStep = await fetch(
        `${baseUrl}/api/rooms/${room.roomId}/bot-step`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterId: "g-intruder", onlyBots: false }),
        }
      );
      expect(hijackStep.status).toBe(400);

      const hijackAuto = await fetch(
        `${baseUrl}/api/rooms/${room.roomId}/auto-bots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requesterId: "g-intruder", enabled: false }),
        }
      );
      expect(hijackAuto.status).toBe(400);

      // Bob signs out mid-turn -> converted to Bot across all snapshots
      await fetch(`${baseUrl}/api/guests/signout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "g-bob" }),
      });

      // Alice clicks Undo (reverting to snapshot 0) -> Bob MUST still be isBot: true in snapshot 0!
      const undoRes = await fetch(`${baseUrl}/api/rooms/${room.roomId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: "g-alice" }),
      });
      expect(undoRes.status).toBe(200);
      const afterUndoState = srv.roomManager
        .getRoom(room.roomId)
        .session!.getState();
      const bobInSnapshot0 = afterUndoState.players.find(
        (p: any) => p.id === "g-bob"
      );
      expect(bobInSnapshot0?.isBot).toBe(true);
    } finally {
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  test("keeps multi-seat Pass-and-Play hand visible when unhidden and allows trade cancel/confirm during opponent responses", () => {
    // H6: Host + Local Friend + 2 Bots in Catan with hidePassAndPlayHand = false
    const uiRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startOfflineLocalFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    uiApp.addLocalFriendToRoom(room, "Local Friend");
    room.botCount = 2;
    room.startingPlayerMode = "first";
    uiApp.rebuildRoomSeats(room);
    uiApp.startRoomMatch(room.roomId);
    uiApp.finishSetupWithBots();

    const aliceId = room.players[0]!.id as string;
    const botId = room.players.find((p: any) => p.isBot)!.id as string;
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    const stMain = room.session.getState();
    for (const p of stMain.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        stMain.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    stMain.players[0]!.resources.brick = 2;
    stMain.bank.brick -= 2;
    const botPlayer = stMain.players.find((p: any) => p.id === botId)!;
    botPlayer.resources.ore = 2;
    stMain.bank.ore -= 2;

    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: botId,
      give: { brick: 1 },
      want: { ore: 1 },
    });

    // Even while Bot is the responding actor (isMyTurn === false) and controllableHumansCount === 2, Alice can still cancel her trade and see her hand!
    expect(uiRoot.innerHTML).toContain('id="btn-cancel-domestic"');
    expect(uiRoot.innerHTML).not.toContain("Pass device to");
  });
});
