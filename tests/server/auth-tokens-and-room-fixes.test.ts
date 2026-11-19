import { describe, expect, test } from "bun:test";
import { CatanEngine } from "../../packages/games/catan/src/index.ts";
import {
  createPlatformServer,
  decodeWsFramesStreamPure,
  encodeWsTextFramePure,
} from "../../apps/server/src/index.ts";
import { authHeadersForTestGuest, openSubscribedTestWs } from "./helpers.ts";

function openRawTestWs(
  srv: ReturnType<typeof createPlatformServer>,
  url = "/"
) {
  const listeners: Record<string, Array<(arg?: any) => void>> = {};
  const messages: any[] = [];
  const socket: any = {
    destroyed: false,
    writable: true,
    setKeepAlive: () => {},
    on: (ev: string, fn: (arg?: any) => void) => {
      listeners[ev] = [...(listeners[ev] ?? []), fn];
    },
    write: (chunk: Buffer | string) => {
      if (Buffer.isBuffer(chunk)) {
        for (const frame of decodeWsFramesStreamPure(chunk).frames) {
          if (frame.opcode === 0x01 && frame.text) {
            messages.push(JSON.parse(frame.text));
          }
        }
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
    { url, headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } },
    socket
  );
  return {
    messages,
    send: (msg: unknown) => {
      const frame = encodeWsTextFramePure(msg);
      for (const fn of listeners.data ?? []) fn(frame);
    },
    disconnect: () => socket.destroy(),
  };
}

describe("@gaming-platform/server - Session Tokens, Auth Guards & Room Lifecycle Fixes", () => {
  test("issues guest session tokens, blocks unauthenticated/spoofed HTTP & WS requests, and strips anonymous WS legalActions", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const base = `http://127.0.0.1:${(srv.server.address() as { port: number }).port}`;

    try {
      // 1. Mint token via POST /api/guests/session; re-minting same ID without token is rejected (401)
      const s1 = await fetch(`${base}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "g-alice", playerName: "Alice" }),
      });
      expect(s1.status).toBe(200);
      const { token: aliceToken } = await s1.json();
      expect(typeof aliceToken).toBe("string");
      expect(aliceToken.length).toBeGreaterThan(16);

      const hijackSession = await fetch(`${base}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "g-alice" }),
      });
      expect(hijackSession.status).toBe(401);

      // 2. Missing token on POST /api/rooms returns 401
      const noTokenCreate = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "g-alice",
          hostName: "Alice",
        }),
      });
      expect(noTokenCreate.status).toBe(401);

      // Create private Catan room with Alice's token
      const aliceHeaders = {
        "Content-Type": "application/json",
        "X-Guest-Token": aliceToken,
      };
      const createRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "g-alice",
          hostName: "Alice",
          isPrivate: true,
          botCount: 2,
          startingPlayerMode: "first",
          autoStepBots: false,
          autoStart: false,
        }),
      });
      expect(createRes.status).toBe(201);
      const { room } = await createRes.json();

      // 3. Query param ?playerId=g-alice WITHOUT token cannot see private room or unredacted hand
      const spoofedLobby = await (
        await fetch(`${base}/api/rooms?playerId=g-alice`)
      ).json();
      expect(
        spoofedLobby.rooms.some((r: any) => r.roomId === room.roomId)
      ).toBe(false);

      // Bob gets a token, tries to start Alice's room or spoof requesterId -> 403 / 400
      const bobHeaders = authHeadersForTestGuest(srv, "g-bob");
      const spoofedStart = await fetch(
        `${base}/api/rooms/${room.roomId}/start`,
        {
          method: "POST",
          headers: bobHeaders,
          body: JSON.stringify({ requesterId: "g-alice" }),
        }
      );
      expect(spoofedStart.status).toBe(403);

      // Direct roomManager.startGame without requesterId on owned room is rejected
      expect(() => srv.roomManager.startGame(room.roomId)).toThrow();

      // Alice starts cleanly, and duplicate POST /start while in_progress is rejected
      const startOk = await fetch(`${base}/api/rooms/${room.roomId}/start`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice" }),
      });
      expect(startOk.status).toBe(200);
      const dupStart = await fetch(`${base}/api/rooms/${room.roomId}/start`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice" }),
      });
      expect(dupStart.status).toBe(400);

      // 4. Anonymous WS spectator receives legalActions: [] and cannot dispatch actions or spoof identity
      const anonWs = openRawTestWs(srv, `/?playerId=g-alice`); // missing token -> stays anonymous
      anonWs.send({ type: "SUBSCRIBE_ROOM", roomId: room.roomId });
      const roomStateMsg = anonWs.messages.find((m) => m.type === "ROOM_STATE");
      expect(roomStateMsg).toBeDefined();
      expect(roomStateMsg.legalActions).toEqual([]);

      const legalAction = CatanEngine.getLegalActions(
        srv.roomManager.getRoom(room.roomId).session!.getState(),
        "g-alice"
      )[0]!;
      anonWs.send({
        type: "DISPATCH_ACTION",
        playerId: "g-alice",
        action: legalAction,
      });
      expect(anonWs.messages.some((m) => m.type === "ERROR")).toBe(true);
      expect(
        srv.roomManager.getRoom(room.roomId).session!.getStep()
      ).toBe(0);

      // Unverified WS IDENTIFY_PLAYER is rejected with ERROR
      anonWs.messages.length = 0;
      anonWs.send({ type: "IDENTIFY_PLAYER", playerId: "g-alice" });
      expect(anonWs.messages.some((m) => m.type === "ERROR")).toBe(true);
      anonWs.disconnect();
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });

  test("blocks bot-seat rejoin during in_progress, allows rematch rejoin when finished, resets session on gameId change, and evicts kicked WS guests", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const base = `http://127.0.0.1:${(srv.server.address() as { port: number }).port}`;

    try {
      const aliceHeaders = authHeadersForTestGuest(srv, "g-alice");
      const bobHeaders = authHeadersForTestGuest(srv, "g-bob");

      const createRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({
          gameId: "splendor",
          ownerId: "g-alice",
          hostName: "Alice",
          botCount: 0,
          autoStart: false,
        }),
      });
      const { room } = await createRes.json();

      await fetch(`${base}/api/rooms/${room.roomId}/join`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerId: "g-bob", playerName: "Bob" }),
      });

      // Kick Bob from lobby -> Bob receives ROOM_REMOVED and stops receiving ROOM_STATE
      const bobWs = openSubscribedTestWs(srv, room.roomId, "g-bob");
      bobWs.receivedMessages.length = 0;
      const kickRes = await fetch(
        `${base}/api/rooms/${room.roomId}/remove-player`,
        {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            requesterId: "g-alice",
            targetPlayerId: "g-bob",
          }),
        }
      );
      expect(kickRes.status).toBe(200);
      expect(
        bobWs.receivedMessages.some(
          (m) => m.type === "ROOM_REMOVED" && m.roomId === room.roomId
        )
      ).toBe(true);
      bobWs.receivedMessages.length = 0;
      await fetch(`${base}/api/rooms/${room.roomId}/setup`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice", botCount: 1 }),
      });
      expect(
        bobWs.receivedMessages.some((m) => m.type === "ROOM_STATE")
      ).toBe(false);
      bobWs.disconnect();

      // Bob rejoins lobby, Alice starts match, then Bob signs out mid-game (converted to bot)
      await fetch(`${base}/api/rooms/${room.roomId}/join`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerId: "g-bob", playerName: "Bob" }),
      });
      await fetch(`${base}/api/rooms/${room.roomId}/start`, {
        method: "POST",
        headers: aliceHeaders,
        body: JSON.stringify({ requesterId: "g-alice" }),
      });
      await fetch(`${base}/api/guests/signout`, {
        method: "POST",
        headers: bobHeaders,
        body: JSON.stringify({ playerId: "g-bob" }),
      });

      // Bob gets a new token and tries to rejoin during in_progress -> MUST BE REJECTED (no bot hand leak!)
      const bobHeaders2 = authHeadersForTestGuest(srv, "g-bob");
      const midGameRejoin = await fetch(
        `${base}/api/rooms/${room.roomId}/join`,
        {
          method: "POST",
          headers: bobHeaders2,
          body: JSON.stringify({ playerId: "g-bob", playerName: "Bob" }),
        }
      );
      expect(midGameRejoin.status).toBe(400);

      // Mark room finished -> Bob CAN now rejoin cleanly for a rematch (no duplicate seat, back to human)
      const liveRoom = srv.roomManager.getRoom(room.roomId);
      liveRoom.status = "finished";
      const rematchJoin = await fetch(
        `${base}/api/rooms/${room.roomId}/join`,
        {
          method: "POST",
          headers: bobHeaders2,
          body: JSON.stringify({ playerId: "g-bob", playerName: "Bob" }),
        }
      );
      expect(rematchJoin.status).toBe(200);
      const rematchData = await rematchJoin.json();
      expect(
        rematchData.room.players.find((p: any) => p.id === "g-bob")?.isBot
      ).toBe(false);

      // Switching gameId on a finished room resets status -> "lobby" and clears session
      const switchRes = await fetch(
        `${base}/api/rooms/${room.roomId}/setup`,
        {
          method: "POST",
          headers: aliceHeaders,
          body: JSON.stringify({
            requesterId: "g-alice",
            gameId: "azul",
            config: {},
          }),
        }
      );
      expect(switchRes.status).toBe(200);
      const switched = await switchRes.json();
      expect(switched.room.gameId).toBe("azul");
      expect(switched.room.status).toBe("lobby");
      expect(srv.roomManager.getRoom(room.roomId).session).toBeNull();
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });

  test("sweeps abandoned HTTP-only private rooms, in-progress leave rooms, WS identity-switch rooms, and closes abandoned allBots rooms", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const base = `http://127.0.0.1:${(srv.server.address() as { port: number }).port}`;

    try {
      const h1 = authHeadersForTestGuest(srv, "g-p1");
      const h2 = authHeadersForTestGuest(srv, "g-p2");

      // Leak 1: HTTP-only PRIVATE room (never opens a WS) must be swept once idle
      const privRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: h1,
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "g-p1",
          hostName: "P1",
          isPrivate: true,
        }),
      });
      const privId = (await privRes.json()).room.roomId as string;

      // Leak 2: In-progress room where player calls POST /leave (no-op) then disconnects WS must still sweep
      const leaveRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: h1,
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "g-p1",
          hostName: "P1",
          botCount: 2,
          autoStepBots: false,
          autoStart: true,
        }),
      });
      const leaveId = (await leaveRes.json()).room.roomId as string;
      const wsLeave = openSubscribedTestWs(srv, leaveId, "g-p1");
      await fetch(`${base}/api/rooms/${leaveId}/leave`, {
        method: "POST",
        headers: h1,
        body: JSON.stringify({ playerId: "g-p1" }),
      });
      wsLeave.disconnect();

      // Leak 3: WS switches identity via IDENTIFY_PLAYER away from g-p2 -> g-p2's room disconnect clock starts
      const switchRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: h2,
        body: JSON.stringify({
          gameId: "azul",
          ownerId: "g-p2",
          hostName: "P2",
        }),
      });
      const switchId = (await switchRes.json()).room.roomId as string;
      const p2Token = srv.guestSessions.issueTokenForPlayer("g-p2");
      const p3Token = srv.guestSessions.issueTokenForPlayer("g-p3");
      const wsSwitch = openRawTestWs(
        srv,
        `/?playerId=g-p2&token=${encodeURIComponent(p2Token)}`
      );
      wsSwitch.send({ type: "SUBSCRIBE_ROOM", roomId: switchId, playerId: "g-p2", token: p2Token });
      wsSwitch.send({ type: "IDENTIFY_PLAYER", playerId: "g-p3", token: p3Token });

      // Leak 4: allBots room closes when owner leaves in lobby/finished (0 humans)
      const botsRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: h1,
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "g-p1",
          hostName: "P1",
          allBots: true,
          botCount: 3,
          autoStepBots: false,
          autoStart: false,
        }),
      });
      const botsId = (await botsRes.json()).room.roomId as string;
      const leaveBots = await fetch(`${base}/api/rooms/${botsId}/leave`, {
        method: "POST",
        headers: h1,
        body: JSON.stringify({ playerId: "g-p1" }),
      });
      expect((await leaveBots.json()).closed).toBe(true);

      // Advance clock past idle timeout -> all 3 abandoned rooms are swept!
      const future = Date.now() + 20 * 60_000;
      const swept = srv.sweepAbandonedRooms(future, 15 * 60_000);
      expect(swept).toContain(privId);
      expect(swept).toContain(leaveId);
      expect(swept).toContain(switchId);
      wsSwitch.disconnect();
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });
});
