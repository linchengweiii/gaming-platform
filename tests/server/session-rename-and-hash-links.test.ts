import { describe, expect, test } from "bun:test";
import { createPlatformServer } from "../../apps/server/src/index.ts";
import {
  MultiGamePlatformApp,
  buildRoomShareUrlPure,
  createInitialAppModelPure,
  extractInviteRoomHashFromLocationPure,
  formatRoomHashLabelPure,
  renderLoginViewPure,
} from "../../apps/web/src/app.ts";
import {
  authHeadersForTestGuest,
  createFakeDomRoot,
  openSubscribedTestWs,
} from "./helpers.ts";

describe("@gaming-platform/server - Live Guest Rename & 6-Char Room Hash Share Links", () => {
  test("lets guests rename their display name across Lobby, Room Setup, and active matches while preserving Undo history", async () => {
    const fakeRoot = createFakeDomRoot();
    const app = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: true,
    });
    app.autoRespondBotsToHuman = false;

    app.signInAsGuest("InitialName");
    const guestId = app.currentUserId;
    expect(fakeRoot.innerHTML).toContain('id="btn-edit-guest-name"');

    const room = app.createLocalRoom({
      name: "Rename Test Table",
      gameId: "seven_wonders",
      ownerId: guestId,
      ownerName: "InitialName",
      isOfflineLocal: true,
      botCount: 2,
      autoStart: true,
    });
    app.enterOrJoinRoom(room.roomId);

    // Lock a reversible draft pick first so Undo history has 1 step
    const st0 = app.getRoomState(room);
    const act0 = room.session!.engine.getLegalActions(st0, guestId)[0]!;
    app.dispatchUiAction(guestId, act0);
    expect(room.session!.canPlayerUndo(guestId)).toBe(true);

    // Reject empty whitespace rename
    expect(app.renameCurrentGuest("   ")).toBe(false);
    expect(app.currentUserName).toBe("InitialName");

    // Valid rename updates identity, deviceGuests, room owner/seats, and live match state without losing Undo!
    expect(app.renameCurrentGuest("Captain Nemo")).toBe(true);
    expect(app.currentUserName).toBe("Captain Nemo");
    expect(app.deviceGuests.find((g) => g.id === guestId)?.name).toBe(
      "Captain Nemo"
    );
    expect(room.ownerName).toBe("Captain Nemo");
    expect(room.players.find((p) => p.id === guestId)?.name).toBe(
      "Captain Nemo"
    );
    expect(
      app.getRoomState(room).players.find((p: any) => p.id === guestId)?.name
    ).toBe("Captain Nemo");
    expect(room.session!.canPlayerUndo(guestId)).toBe(true);

    // Undoing still keeps the renamed display name across previous snapshots!
    app.undoMatch();
    expect(
      app.getRoomState(room).players.find((p: any) => p.id === guestId)?.name
    ).toBe("Captain Nemo");

    // Live server POST /api/guests/rename updates room summary & active match snapshots and broadcasts WS ROOM_STATE
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    try {
      const port = (srv.server.address() as { port: number }).port;
      const base = `http://127.0.0.1:${port}`;

      const hostHeaders = authHeadersForTestGuest(srv, "g-host");
      const createdRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          name: "Online Rename Room",
          gameId: "splendor",
          ownerId: "g-host",
          hostName: "OldHost",
          botCount: 1,
          autoStart: true,
        }),
      });
      const { room: created } = await createdRes.json();

      const wsSub = openSubscribedTestWs(srv, created.roomId, "g-host");
      wsSub.receivedMessages.length = 0;

      const renameRes = await fetch(`${base}/api/guests/rename`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({ playerId: "g-host", newName: "Admiral Yi" }),
      });
      const renameData = await renameRes.json();
      expect(renameRes.ok).toBe(true);
      expect(renameData.name).toBe("Admiral Yi");
      expect(renameData.updatedRoomIds).toEqual([created.roomId]);

      const roomBroadcast = wsSub.receivedMessages.find(
        (m) => m.type === "ROOM_STATE"
      );
      expect(roomBroadcast).toBeDefined();
      expect(roomBroadcast.room.ownerName).toBe("Admiral Yi");
      expect(
        roomBroadcast.state.players.find((p: any) => p.id === "g-host")?.name
      ).toBe("Admiral Yi");
      wsSub.disconnect();
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });

  test("assigns 6-char room hashes without room-name inputs, creates rooms from selected game filter, and joins rooms directly from shared hash links", async () => {
    const fakeRoot = createFakeDomRoot();
    const app = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: true,
    });

    app.signInAsGuest("HostClara");
    expect(app.viewMode).toBe("lobby");
    expect(app.lobbyGameFilter).toBe("catan");
    expect(fakeRoot.innerHTML).not.toContain('id="inp-create-room-name"');
    expect(fakeRoot.innerHTML).not.toContain('id="sel-create-room-game"');
    expect(fakeRoot.innerHTML).not.toContain('data-lobby-filter="all"');
    expect(fakeRoot.innerHTML).toContain("+ Create Settlers of Catan room");

    // Switching game filter to Azul updates the compact Create button and creates an Azul room with a 6-char hex hash
    app.lobbyGameFilter = "azul";
    app.render();
    expect(fakeRoot.innerHTML).toContain("+ Create Azul room");

    app.createAndOpenRoom();
    const createdRoom = app.getActiveRoom();
    expect(app.viewMode).toBe("room_setup");
    expect(createdRoom.gameId).toBe("azul");
    expect(/^[0-9a-f]{6}$/.test(createdRoom.roomId)).toBe(true);
    expect(createdRoom.name).toBe(`#${createdRoom.roomId}`);
    expect(fakeRoot.innerHTML).not.toContain('id="setup-room-name"');
    expect(fakeRoot.innerHTML).toContain(
      `Room ${formatRoomHashLabelPure(createdRoom.roomId)}`
    );

    // Shareable URL builder and hash/search parsers round-trip cleanly
    const shareUrl = buildRoomShareUrlPure(
      "https://home.tailnet.ts.net",
      "/",
      "",
      createdRoom.roomId
    );
    expect(shareUrl).toBe(
      `https://home.tailnet.ts.net/#room=${createdRoom.roomId}`
    );
    expect(
      extractInviteRoomHashFromLocationPure("", `#room=${createdRoom.roomId}`)
    ).toBe(createdRoom.roomId);
    expect(
      extractInviteRoomHashFromLocationPure("", `#${createdRoom.roomId.toUpperCase()}`)
    ).toBe(createdRoom.roomId);
    expect(
      extractInviteRoomHashFromLocationPure(`?room=${createdRoom.roomId}`, "")
    ).toBe(createdRoom.roomId);

    // Login screen displays invite banner when opened via #room=<hash>
    const invitedModel = createInitialAppModelPure(
      { startAtLogin: true },
      {
        isStaticHost: false,
        isBrowserHttp: true,
        randomGuestSuffix: 404,
        deviceGuests: [],
        savedGuest: null,
        nowMs: 1700000000000,
        locationSearch: "",
        locationHash: `#room=${createdRoom.roomId}`,
      }
    );
    expect(invitedModel.pendingInviteRoomId).toBe(createdRoom.roomId);
    const invitedLoginHtml = renderLoginViewPure(invitedModel);
    expect(invitedLoginHtml).toContain(`#${createdRoom.roomId}`);
    expect(invitedLoginHtml).toContain(`Join #${createdRoom.roomId}`);

    // Live server creates 6-char hash room and allows joining by hash (with or without leading #)
    const srv = createPlatformServer();
    await new Promise<void>((resolve) =>
      srv.server.listen(0, "127.0.0.1", () => resolve())
    );
    try {
      const port = (srv.server.address() as { port: number }).port;
      const base = `http://127.0.0.1:${port}`;

      const createRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: authHeadersForTestGuest(srv, "g-host-1"),
        body: JSON.stringify({
          gameId: "seven_wonders",
          ownerId: "g-host-1",
          hostName: "HostClara",
        }),
      });
      const { room: srvRoom } = await createRes.json();
      expect(/^[0-9a-f]{6}$/.test(srvRoom.roomId)).toBe(true);
      expect(srvRoom.name).toBe(`#${srvRoom.roomId}`);
      expect(srvRoom.gameId).toBe("seven_wonders");

      // Friend opens link #room=<hash> and joins directly
      const joinRes = await fetch(`${base}/api/rooms/${srvRoom.roomId}/join`, {
        method: "POST",
        headers: authHeadersForTestGuest(srv, "g-friend-2"),
        body: JSON.stringify({
          playerId: "g-friend-2",
          playerName: "FriendDan",
        }),
      });
      const joinData = await joinRes.json();
      expect(joinRes.ok).toBe(true);
      expect(joinData.room.players.map((p: any) => p.name)).toEqual([
        "HostClara",
        "FriendDan",
      ]);
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });

  test("hides Private rooms from Open rooms for uninvited players while allowing direct hash-link join and Public toggle", async () => {
    const fakeRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(fakeRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    uiApp.enterOrJoinRoom("room-1");
    expect(fakeRoot.innerHTML).toContain('id="setup-vis-public"');
    expect(fakeRoot.innerHTML).toContain('id="setup-vis-private"');
    expect(uiApp.getActiveRoom().isPrivate).toBe(false);

    // Toggle local room-1 to Private and switch to Guest 2 in Lobby: Guest 2 cannot see room-1 in Open rooms!
    const room1 = uiApp.getActiveRoom();
    room1.isPrivate = true;
    uiApp.switchActiveGuest("guest-2");
    uiApp.viewMode = "lobby";
    uiApp.render();
    expect(fakeRoot.innerHTML).not.toContain('data-join-room="room-1"');

    // Verify live HTTP & WS server enforces Private vs Public visibility
    const srv = createPlatformServer();
    await new Promise<void>((resolve) => srv.server.listen(0, resolve));
    try {
      const port = (srv.server.address() as { port: number }).port;
      const base = `http://127.0.0.1:${port}`;

      const hostHeaders = authHeadersForTestGuest(srv, "host-1");
      const strangerHeaders = authHeadersForTestGuest(srv, "stranger-9");
      const friendHeaders = authHeadersForTestGuest(srv, "friend-2");

      const createRes = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          gameId: "catan",
          ownerId: "host-1",
          hostName: "Alice",
        }),
      });
      const { room: created } = await createRes.json();
      expect(created.isPrivate).toBe(false);

      // Public by default: stranger sees it in Open rooms
      const pubList = await (
        await fetch(`${base}/api/rooms`, { headers: strangerHeaders })
      ).json();
      expect(pubList.rooms.some((r: any) => r.roomId === created.roomId)).toBe(
        true
      );

      // Host switches room to Private in Room Setup
      const privRes = await fetch(`${base}/api/rooms/${created.roomId}/setup`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          requesterId: "host-1",
          isPrivate: true,
        }),
      });
      const privData = await privRes.json();
      expect(privData.room.isPrivate).toBe(true);

      // Uninvited players (or anonymous lobby queries) do NOT see the private room in Open rooms
      const anonList = await (await fetch(`${base}/api/rooms`)).json();
      expect(anonList.rooms.some((r: any) => r.roomId === created.roomId)).toBe(
        false
      );
      const strangerList = await (
        await fetch(`${base}/api/rooms`, { headers: strangerHeaders })
      ).json();
      expect(
        strangerList.rooms.some((r: any) => r.roomId === created.roomId)
      ).toBe(false);

      // Host still sees their own private room
      const hostList = await (
        await fetch(`${base}/api/rooms`, { headers: hostHeaders })
      ).json();
      expect(hostList.rooms.some((r: any) => r.roomId === created.roomId)).toBe(
        true
      );

      // Invited friend with the direct #room=<hash> link CAN fetch and join the private room!
      const directJoinRes = await fetch(
        `${base}/api/rooms/${created.roomId}/join`,
        {
          method: "POST",
          headers: friendHeaders,
          body: JSON.stringify({
            playerId: "friend-2",
            playerName: "Bob",
          }),
        }
      );
      expect(directJoinRes.ok).toBe(true);
      const friendList = await (
        await fetch(`${base}/api/rooms`, { headers: friendHeaders })
      ).json();
      expect(
        friendList.rooms.some((r: any) => r.roomId === created.roomId)
      ).toBe(true);

      // Host switches room back to Public -> visible to everyone in Open rooms again!
      await fetch(`${base}/api/rooms/${created.roomId}/setup`, {
        method: "POST",
        headers: hostHeaders,
        body: JSON.stringify({
          requesterId: "host-1",
          isPrivate: false,
        }),
      });
      const reopenedList = await (
        await fetch(`${base}/api/rooms`, { headers: strangerHeaders })
      ).json();
      expect(
        reopenedList.rooms.some((r: any) => r.roomId === created.roomId)
      ).toBe(true);
    } finally {
      (srv.server as any).closeAllConnections?.();
      srv.server.close();
    }
  });
});
