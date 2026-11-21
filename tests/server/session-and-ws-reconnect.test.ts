import { describe, expect, test } from "bun:test";
import { createPlatformServer } from "../../apps/server/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  authHeadersForTestGuest,
  createFakeDomRoot,
  openSubscribedTestWs,
} from "./helpers.ts";

describe("@gaming-platform/server - Guest Switch, Sign-Out Cleanup & WS Reconnects", () => {
  test("distinguishes switching guests from signing out, cleans up rooms/bots on sign-out, and preserves seats across WS reconnects", async () => {
    // 1. Client-side multi-guest switch vs sign-out cleanup
    const fakeRoot = createFakeDomRoot();
    const app = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: true,
    });
    app.autoRespondBotsToHuman = false;

    // Sign in as Alice and create a solo in-progress match + a shared match with Bob
    app.signInAsGuest("Alice");
    const aliceId = app.currentUserId;
    const aliceSolo = app.createLocalRoom({
      name: "Alice Solo Azul",
      gameId: "azul",
      ownerId: aliceId,
      ownerName: "Alice",
      isOfflineLocal: true,
      botCount: 1,
      autoStart: true,
    });

    app.openAddGuestView();
    app.signInAsGuest("Bob");
    const bobId = app.currentUserId;
    expect(app.deviceGuests.length).toBe(2);

    // Switching guests keeps BOTH profiles and Alice's solo room intact
    app.switchActiveGuest(aliceId);
    expect(app.deviceGuests.length).toBe(2);
    expect(app.rooms.has(aliceSolo.roomId)).toBe(true);

    // Create a shared 2-human room (Alice + Bob) and start the game
    const sharedRoom = app.createLocalRoom({
      name: "Shared Splendor",
      gameId: "splendor",
      ownerId: aliceId,
      ownerName: "Alice",
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "first",
      autoStart: false,
    });
    sharedRoom.humanPlayers = [
      { id: aliceId, name: "Alice", color: "#e63946", isBot: false },
      { id: bobId, name: "Bob", color: "#2563eb", isBot: false },
    ];
    app.rebuildRoomSeats(sharedRoom);
    app.startRoomMatch(sharedRoom.roomId);
    expect(sharedRoom.status).toBe("in_progress");

    // Alice signs out while Bob is still on this computer:
    // - Alice is removed from deviceGuests
    // - Alice's solo in-progress room (0 remaining humans) is deleted
    // - Shared match stays alive for Bob, promotes Bob to owner, and converts Alice's seat to a Bot!
    // - Active session switches automatically to Bob
    app.signOutGuest();
    expect(app.isAuthenticated).toBe(true);
    expect(app.currentUserId).toBe(bobId);
    expect(app.deviceGuests.map((g) => g.id)).toEqual([bobId]);
    expect(app.rooms.has(aliceSolo.roomId)).toBe(false);
    expect(app.rooms.has(sharedRoom.roomId)).toBe(true);
    expect(sharedRoom.ownerId).toBe(bobId);
    expect(sharedRoom.players.find((p) => p.id === aliceId)?.isBot).toBe(true);
    expect(
      app
        .getRoomState(sharedRoom)
        .players.find((p: any) => p.id === aliceId)?.isBot
    ).toBe(true);

    // Since Alice's seat is now a Bot on Turn 1, stepOneBotMove immediately acts for her seat!
    app.enterOrJoinRoom(sharedRoom.roomId);
    app.stepOneBotMove();
    expect(app.getRoomState(sharedRoom).turn).toBe(2);

    // Now Bob (the last human on this device) signs out -> shared room now has 0 humans and is deleted, returning to Login!
    app.signOutGuest();
    expect(app.isAuthenticated).toBe(false);
    expect(app.viewMode).toBe("login");
    expect(app.deviceGuests.length).toBe(0);
    expect(app.rooms.has(sharedRoom.roomId)).toBe(false);

    // 2. Live Server WebSocket Reconnect + Offline Badge + /api/guests/signout + 15-min Abandoned Sweep
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    try {
      const port = (srv.server.address() as { port: number }).port;
      const base = `http://127.0.0.1:${port}`;

      const aliceHeaders = authHeadersForTestGuest(srv, "g-alice");
      const bobHeaders = authHeadersForTestGuest(srv, "g-bob");

      const createRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          name: "Online Reconnect Table",
          gameId: "seven_wonders",
          ownerId: "g-alice",
          hostName: "Alice",
          botCount: 1,
          autoStart: false,
        }),
      });
      const { room: createdSummary } = await createRes.json();
      const roomId = createdSummary.roomId as string;

      await fetch(`${base}/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerId: "g-bob", playerName: "Bob" }),
      });
      await fetch(`${base}/api/rooms/${roomId}/start`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice" }),
      });

      const wsAlice = openSubscribedTestWs(srv, roomId, "g-alice");
      const wsBob = openSubscribedTestWs(srv, roomId, "g-bob");
      expect(
        wsBob.receivedMessages.some((m) => m.type === "ROOM_STATE")
      ).toBe(true);

      // Simulate Bob losing internet (WS closes WITHOUT calling /api/guests/signout)
      wsBob.disconnect();

      // Bob's seat is preserved (NOT a bot), and RoomSummary marks Bob in offlinePlayerIds!
      const duringDropRes = await fetch(`${base}/api/rooms/${roomId}`, {
        headers: aliceHeaders,
      });
      const duringDropData = await duringDropRes.json();
      expect(duringDropData.room.offlinePlayerIds).toEqual(["g-bob"]);
      expect(
        duringDropData.room.players.find((p: any) => p.id === "g-bob")?.isBot
      ).toBe(false);

      // Bob's internet returns -> reconnects & reclaims his full 7-card unredacted hand!
      const wsBobReconnected = openSubscribedTestWs(srv, roomId, "g-bob");
      const afterRejoinRes = await fetch(`${base}/api/rooms/${roomId}`, {
        headers: bobHeaders,
      });
      const afterRejoinData = await afterRejoinRes.json();
      expect(afterRejoinData.room.offlinePlayerIds ?? []).toEqual([]);
      const bobState = afterRejoinData.state.players.find(
        (p: any) => p.id === "g-bob"
      );
      expect(bobState.handRedacted).toBe(false);
      expect(bobState.hand.length).toBe(7);

      // Explicit sign-out by Bob converts Bob to a Bot while keeping Alice's match alive
      const signOutBobRes = await fetch(`${base}/api/guests/signout`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerId: "g-bob" }),
      });
      const signOutBobData = await signOutBobRes.json();
      expect(signOutBobData.updatedRoomIds).toContain(roomId);
      expect(
        srv.roomManager
          .getRoom(roomId)
          .players.find((p) => p.id === "g-bob")?.isBot
      ).toBe(true);

      // Simulate Alice also closing her laptop without signing out:
      // Kept alive during 15-min grace period, then swept once idle >= 15 min!
      wsBobReconnected.disconnect();
      wsAlice.disconnect();

      const baseNow = Date.now();
      expect(srv.sweepAbandonedRooms(baseNow + 60_000, 15 * 60_000)).toEqual([]);
      expect(srv.roomManager.listRooms().some((r) => r.roomId === roomId)).toBe(
        true
      );
      expect(
        srv.sweepAbandonedRooms(baseNow + 16 * 60_000, 15 * 60_000)
      ).toEqual([roomId]);
      expect(srv.roomManager.listRooms().some((r) => r.roomId === roomId)).toBe(
        false
      );
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });

  test("supports real WebSocket connections under Bun, keeps rooms alive during active HTTP play without WS, and emits INVALID_GUEST_TOKEN for stale tokens", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const port = (srv.server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. Mint guest tokens via real HTTP session endpoint
      const aliceSess = await (
        await fetch(`${base}/api/guests/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: "g-real-alice", playerName: "Alice" }),
        })
      ).json();
      const bobSess = await (
        await fetch(`${base}/api/guests/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: "g-real-bob", playerName: "Bob" }),
        })
      ).json();

      const aliceHeaders = {
        "Content-Type": "application/json",
        "X-Guest-Token": aliceSess.token,
      };
      const bobHeaders = {
        "Content-Type": "application/json",
        "X-Guest-Token": bobSess.token,
      };

      const created = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "splendor",
            ownerId: aliceSess.playerId,
            hostName: "Alice",
            botCount: 0,
            startingPlayerMode: "first",
            autoStart: false,
          }),
        })
      ).json();
      const roomId = created.room.roomId as string;

      // 2. Open a REAL WebSocket connection (not synthetic server.emit) with stale token first -> receives INVALID_GUEST_TOKEN
      const realWs = new WebSocket(
        `ws://127.0.0.1:${port}/?playerId=${encodeURIComponent(aliceSess.playerId)}&token=stale-dead-token`
      );
      const received: any[] = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Real WebSocket handshake timed out")),
          3000
        );
        realWs.addEventListener("open", () => {
          realWs.send(
            JSON.stringify({
              type: "IDENTIFY_PLAYER",
              playerId: aliceSess.playerId,
              token: "stale-dead-token",
            })
          );
        });
        realWs.addEventListener("message", (ev) => {
          const msg = JSON.parse(String(ev.data));
          received.push(msg);
          if (msg.type === "ERROR" && msg.code === "INVALID_GUEST_TOKEN") {
            // Recover with fresh token and subscribe to room on same open WebSocket
            realWs.send(
              JSON.stringify({
                type: "IDENTIFY_PLAYER",
                playerId: aliceSess.playerId,
                token: aliceSess.token,
              })
            );
            realWs.send(
              JSON.stringify({
                type: "SUBSCRIBE_ROOM",
                roomId,
                playerId: aliceSess.playerId,
                token: aliceSess.token,
              })
            );
            realWs.send(JSON.stringify({ type: "PING" }));
          }
          if (
            received.some((m) => m.type === "PONG") &&
            received.some(
              (m) => m.type === "ROOM_STATE" && m.roomId === roomId
            )
          ) {
            clearTimeout(timer);
            resolve();
          }
        });
      });

      expect(
        received.some(
          (m) => m.type === "ERROR" && m.code === "INVALID_GUEST_TOKEN"
        )
      ).toBe(true);

      // While real WS is connected, room MUST NEVER be swept even hours later!
      expect(
        srv.sweepAbandonedRooms(Date.now() + 2 * 60 * 60_000, 15 * 60_000)
      ).toEqual([]);

      // Friend joins via HTTP -> real WS receives live ROOM_STATE update with Bob seated!
      received.length = 0;
      await fetch(`${base}/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({
          playerId: bobSess.playerId,
          playerName: "Bob",
        }),
      });
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const poll = () => {
          if (
            received.some(
              (m) =>
                m.type === "ROOM_STATE" &&
                m.room?.players?.some((p: any) => p.id === bobSess.playerId)
            )
          ) {
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error("Did not receive live ROOM_STATE on real WS"));
            return;
          }
          setTimeout(poll, 20);
        };
        poll();
      });

      realWs.close();
      await new Promise((r) => setTimeout(r, 100));

      // 3. Even with 0 WebSockets connected, active HTTP gameplay keeps the room alive past 15 minutes!
      const httpRoomCreated = await (
        await fetch(`${base}/api/rooms`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            gameId: "splendor",
            ownerId: aliceSess.playerId,
            hostName: "Alice",
            botCount: 1,
            startingPlayerMode: "first",
            autoStepBots: false,
            autoStart: true,
          }),
        })
      ).json();
      const httpRoomId = httpRoomCreated.room.roomId as string;

      const t0 = Date.now();
      const origNow = Date.now;
      try {
        // Simulate player taking a turn via HTTP at t0 + 10 min (still no WebSocket)
        Date.now = () => t0 + 10 * 60_000;
        const roomState = srv.roomManager
          .getRoom(httpRoomId)
          .session!.getState();
        const legal = srv.roomManager.registry
          .get("splendor")
          .getLegalActions(roomState, aliceSess.playerId);
        const actionRes = await fetch(`${base}/api/rooms/${httpRoomId}/action`, {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            playerId: aliceSess.playerId,
            requesterId: aliceSess.playerId,
            action: legal[0],
          }),
        });
        expect(actionRes.status).toBe(200);
      } finally {
        Date.now = origNow;
      }

      // At t0 + 16 min (6 min since last HTTP action), room MUST NOT be swept!
      expect(
        srv.sweepAbandonedRooms(t0 + 16 * 60_000, 15 * 60_000)
      ).not.toContain(httpRoomId);
      expect(
        srv.roomManager.listRooms().some((r) => r.roomId === httpRoomId)
      ).toBe(true);

      // Once truly idle for >= 15 min after the last HTTP action (t0 + 26 min), it IS swept!
      expect(
        srv.sweepAbandonedRooms(t0 + 26 * 60_000, 15 * 60_000)
      ).toContain(httpRoomId);
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });
});
