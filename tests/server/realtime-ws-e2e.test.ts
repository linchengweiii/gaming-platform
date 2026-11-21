import { describe, expect, test } from "bun:test";
import { SplendorEngine } from "@gaming-platform/splendor";
import { createPlatformServer } from "../../apps/server/src/index.ts";

interface LiveWsClient {
  readonly ws: WebSocket;
  readonly messages: any[];
  readonly waitForMessage: (
    predicate: (msg: any) => boolean,
    timeoutMs?: number
  ) => Promise<any>;
  readonly sendJson: (payload: Record<string, unknown>) => void;
  readonly close: () => void;
}

async function connectRealWs(url: string): Promise<LiveWsClient> {
  const messages: any[] = [];
  const waiters: Array<{
    predicate: (msg: any) => boolean;
    resolve: (msg: any) => void;
  }> = [];

  const ws = new WebSocket(url);

  ws.addEventListener("message", (ev) => {
    const parsed = JSON.parse(String(ev.data));
    messages.push(parsed);
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i]!;
      if (waiter.predicate(parsed)) {
        waiters.splice(i, 1);
        waiter.resolve(parsed);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`WebSocket open timed out for ${url}`)),
      3000
    );
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket connection failed for ${url}`));
    });
  });

  const waitForMessage = (
    predicate: (msg: any) => boolean,
    timeoutMs = 3000
  ): Promise<any> => {
    const existing = messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise<any>((resolve, reject) => {
      const entry = {
        predicate,
        resolve: (msg: any) => {
          clearTimeout(timer);
          resolve(msg);
        },
      };
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(entry);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeoutMs);
      waiters.push(entry);
    });
  };

  return {
    ws,
    messages,
    waitForMessage,
    sendJson: (payload: Record<string, unknown>) => {
      ws.send(JSON.stringify(payload));
    },
    close: () => {
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
    },
  };
}

describe("@gaming-platform/server - Real WebSocket E2E Multiplayer Sync", () => {
  test("broadcasts live moves bidirectionally over real TCP WebSockets between two online players", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const port = (srv.server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsBaseUrl = `ws://127.0.0.1:${port}`;

    let aliceWs: LiveWsClient | null = null;
    let bobWs: LiveWsClient | null = null;

    try {
      // 1. Issue real guest sessions via HTTP
      const aliceSessionRes = await fetch(`${baseUrl}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "guest-alice", playerName: "Alice" }),
      });
      expect(aliceSessionRes.status).toBe(200);
      const aliceSession = await aliceSessionRes.json();

      const bobSessionRes = await fetch(`${baseUrl}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "guest-bob", playerName: "Bob" }),
      });
      expect(bobSessionRes.status).toBe(200);
      const bobSession = await bobSessionRes.json();

      // 2. Connect both players via REAL WebSocket clients
      aliceWs = await connectRealWs(
        `${wsBaseUrl}/?playerId=${encodeURIComponent(aliceSession.playerId)}&token=${encodeURIComponent(aliceSession.token)}`
      );
      bobWs = await connectRealWs(
        `${wsBaseUrl}/?playerId=${encodeURIComponent(bobSession.playerId)}&token=${encodeURIComponent(bobSession.token)}`
      );

      // Verify initial LOBBY_ROOMS & PING/PONG
      await aliceWs.waitForMessage((m) => m.type === "LOBBY_ROOMS");
      aliceWs.sendJson({ type: "PING" });
      await aliceWs.waitForMessage((m) => m.type === "PONG");

      // 3. Alice creates an online Splendor room and Bob joins
      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Guest-Token": aliceSession.token,
        },
        body: JSON.stringify({
          gameId: "splendor",
          ownerId: aliceSession.playerId,
          hostName: "Alice",
          botCount: 0,
          startingPlayerMode: "first",
          autoStart: false,
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      const roomId = created.room.roomId as string;

      const joinRes = await fetch(
        `${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Guest-Token": bobSession.token,
          },
          body: JSON.stringify({
            playerId: bobSession.playerId,
            playerName: "Bob",
          }),
        }
      );
      expect(joinRes.status).toBe(200);

      // Both players subscribe to the room over their real WebSockets
      aliceWs.sendJson({
        type: "SUBSCRIBE_ROOM",
        roomId,
        playerId: aliceSession.playerId,
        token: aliceSession.token,
      });
      bobWs.sendJson({
        type: "SUBSCRIBE_ROOM",
        roomId,
        playerId: bobSession.playerId,
        token: bobSession.token,
      });

      await aliceWs.waitForMessage(
        (m) => m.type === "ROOM_STATE" && m.roomId === roomId
      );
      await bobWs.waitForMessage(
        (m) => m.type === "ROOM_STATE" && m.roomId === roomId
      );

      // 4. Alice starts the match -> Bob receives live ROOM_STATE push with in_progress state
      const startRes = await fetch(
        `${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Guest-Token": aliceSession.token,
          },
          body: JSON.stringify({ requesterId: aliceSession.playerId }),
        }
      );
      expect(startRes.status).toBe(200);
      const started = await startRes.json();
      expect(started.actingPlayerId).toBe(aliceSession.playerId);

      const bobStartedPush = await bobWs.waitForMessage(
        (m) =>
          m.type === "ROOM_STATE" &&
          m.roomId === roomId &&
          m.room?.status === "in_progress" &&
          m.state !== null
      );
      expect(bobStartedPush.actingPlayerId).toBe(aliceSession.playerId);

      // 5. Alice makes a move via HTTP -> Bob MUST receive live ROOM_STATE push over WebSocket!
      const aliceLegal = SplendorEngine.getLegalActions(
        started.state,
        aliceSession.playerId
      );
      expect(aliceLegal.length).toBeGreaterThan(0);

      const aliceMoveRes = await fetch(
        `${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Guest-Token": aliceSession.token,
          },
          body: JSON.stringify({
            playerId: aliceSession.playerId,
            requesterId: aliceSession.playerId,
            action: aliceLegal[0],
          }),
        }
      );
      expect(aliceMoveRes.status).toBe(200);

      const bobSawAliceMove = await bobWs.waitForMessage(
        (m) =>
          m.type === "ROOM_STATE" &&
          m.roomId === roomId &&
          m.room?.step >= 1 &&
          m.actingPlayerId === bobSession.playerId
      );
      expect(bobSawAliceMove.state.eventLog.length).toBeGreaterThan(
        bobStartedPush.state.eventLog.length
      );

      // 6. Bob makes a move via HTTP -> Alice MUST receive live ROOM_STATE push over WebSocket!
      const bobLegal = SplendorEngine.getLegalActions(
        bobSawAliceMove.state,
        bobSession.playerId
      );
      expect(bobLegal.length).toBeGreaterThan(0);

      const bobMoveRes = await fetch(
        `${baseUrl}/api/rooms/${encodeURIComponent(roomId)}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Guest-Token": bobSession.token,
          },
          body: JSON.stringify({
            playerId: bobSession.playerId,
            requesterId: bobSession.playerId,
            action: bobLegal[0],
          }),
        }
      );
      expect(bobMoveRes.status).toBe(200);

      const aliceSawBobMove = await aliceWs.waitForMessage(
        (m) =>
          m.type === "ROOM_STATE" &&
          m.roomId === roomId &&
          m.room?.step >= 2 &&
          m.actingPlayerId === aliceSession.playerId
      );
      expect(aliceSawBobMove.state.eventLog.length).toBeGreaterThan(
        bobSawAliceMove.state.eventLog.length
      );
    } finally {
      aliceWs?.close();
      bobWs?.close();
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });

  test("rejects stale guest token with ERROR on SUBSCRIBE_ROOM and delivers ROOM_STATE after fresh token re-subscribe", async () => {
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    const port = (srv.server.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsBaseUrl = `ws://127.0.0.1:${port}`;

    let wsClient: LiveWsClient | null = null;
    try {
      const hostRes = await fetch(`${baseUrl}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "guest-host", playerName: "Host" }),
      });
      const hostSession = await hostRes.json();

      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Guest-Token": hostSession.token,
        },
        body: JSON.stringify({
          gameId: "azul",
          ownerId: hostSession.playerId,
          hostName: "Host",
          botCount: 1,
          autoStart: false,
        }),
      });
      const created = await createRes.json();
      const roomId = created.room.roomId as string;

      // Connect with a stale/unknown token (simulating post-restart browser cache)
      wsClient = await connectRealWs(
        `${wsBaseUrl}/?playerId=guest-late&token=dead-old-token`
      );
      wsClient.sendJson({
        type: "SUBSCRIBE_ROOM",
        roomId,
        playerId: "guest-late",
        token: "dead-old-token",
      });
      const errMsg = await wsClient.waitForMessage((m) => m.type === "ERROR");
      expect(String(errMsg.error).toLowerCase()).toContain("token");

      // Recover with a fresh guest session token and re-subscribe on the same live WebSocket
      const freshRes = await fetch(`${baseUrl}/api/guests/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: "guest-late", playerName: "Late" }),
      });
      const freshSession = await freshRes.json();

      wsClient.sendJson({
        type: "IDENTIFY_PLAYER",
        playerId: freshSession.playerId,
        token: freshSession.token,
      });
      wsClient.sendJson({
        type: "SUBSCRIBE_ROOM",
        roomId,
        playerId: freshSession.playerId,
        token: freshSession.token,
      });

      const roomStateMsg = await wsClient.waitForMessage(
        (m) => m.type === "ROOM_STATE" && m.roomId === roomId
      );
      expect(roomStateMsg.room.roomId).toBe(roomId);
    } finally {
      wsClient?.close();
      await new Promise<void>((resolve) => srv.server.close(() => resolve()));
    }
  });
});
