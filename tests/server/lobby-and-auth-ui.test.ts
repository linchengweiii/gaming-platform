import { describe, expect, test } from "bun:test";
import { PlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { createFakeDomRoot, readWebIndexHtml } from "./helpers.ts";

describe("@gaming-platform/server - Lobby, Guest Auth, Multi-Host & Static Mode UI", () => {
  test("applies taste-skill design system tokens and renders Lobby, Setup, and Game pages cleanly", () => {
    const indexHtml = readWebIndexHtml();
    expect(indexHtml).toContain('data-type="software"');
    expect(indexHtml).toContain('data-radius="soft"');
    expect(indexHtml).toContain('data-buttons="solid"');
    expect(indexHtml).toContain("--p-bg: #18191b");
    expect(indexHtml).toContain("--p-action: #ff4a1f");
    expect(indexHtml).toContain('"Sora"');
    expect(indexHtml).toContain('"Figtree"');
    expect(indexHtml).toContain('"Martian Mono"');

    const root = createFakeDomRoot();
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
    expect(root.innerHTML).not.toContain("Tabletop board games in one room.");
    expect(root.innerHTML).not.toContain('data-lobby-filter="all"');
    expect(root.innerHTML).toContain("Open rooms");

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
    const root = createFakeDomRoot();
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
    expect(root.innerHTML).not.toContain("Tabletop board games in one room.");
    expect(root.innerHTML).toContain("Open rooms");
    expect(root.innerHTML).toContain('id="btn-create-room"');
    expect(root.innerHTML).toContain('id="btn-sign-out"');

    // Sign out returns to Guest Login page
    app.signOutGuest();
    expect(app.isAuthenticated).toBe(false);
    expect(app.viewMode).toBe("login");
    expect(root.innerHTML).toContain('id="form-guest-login"');
  });

  test("omits pre-creation bot selection, never renders unclaimed host rooms, supports multiple hosts on one computer, and plays offline with local friends", () => {
    const fakeRoot = createFakeDomRoot();
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
    const fakeRoot = createFakeDomRoot();
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
});
