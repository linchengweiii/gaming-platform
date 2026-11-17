import { describe, expect, test } from "bun:test";
import {
  SevenWondersEngine,
  getSevenWondersActingPlayerId,
  type SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { createMultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  COMMODITY_META,
  RESOURCE_META,
} from "../../apps/web/src/catan-graphics.ts";
import { resolveEffectiveViewerIdPure } from "../../apps/server/src/index.ts";
import { createPlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  GAME_REFERENCE_GUIDES,
  TUTORIAL_LESSONS,
  chooseRecommendedTutorialActionPure,
  renderReferenceGuideModalPure,
} from "../../apps/web/src/tutorials.ts";

describe("7 Wonders Web UI, Tutorials, and Simultaneous Room Redaction", () => {
  test("renders 7 Wonders web UI, neighbor commerce panels, draft hand, and final scorepad cleanly", () => {
    const root: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const app = createMultiGamePlatformApp(root, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    app.autoRespondBotsToHuman = false;

    expect(root.innerHTML).toContain("7 Wonders");
    app.lobbyGameFilter = "seven_wonders";
    app.render();
    expect(root.innerHTML).toContain("+ Create 7 Wonders room");
    expect(root.innerHTML).toContain("Host: Hypatia");
    expect(root.innerHTML).toContain("Room #");

    const swRoom = app.createLocalRoom({
      gameId: "seven_wonders",
      ownerId: app.currentUserId,
      ownerName: app.currentUserName,
      isOfflineLocal: true,
      botCount: 4,
      wonderSideMode: "night",
      customSeed: "ui-sw-night-5p",
      autoStart: true,
    });
    app.enterOrJoinRoom(swRoom.roomId);
    expect(app.viewMode).toBe("in_game");
    expect(root.innerHTML).toContain("sw-board");
    expect(root.innerHTML).toContain("sw-neighbor-card");
    expect(root.innerHTML).toContain("sw-wonder-stage");
    expect(root.innerHTML).toContain("Age I");

    // Step through entire match via human + bot moves and verify GAME_OVER scorepad renders
    let guard = 0;
    while (app.getRoomState(swRoom)?.phase !== "GAME_OVER" && guard < 400) {
      const st = app.getRoomState(swRoom) as SevenWondersState;
      const actId = getSevenWondersActingPlayerId(st)!;
      const actor = st.players.find((p) => p.id === actId)!;
      if (actor.isBot) {
        app.stepOneBotMove();
      } else {
        const rec = chooseRecommendedTutorialActionPure(
          "seven_wonders",
          st,
          actId
        )!;
        app.dispatchUiAction(actId, rec);
      }
      guard += 1;
    }
    expect(app.getRoomState(swRoom)?.phase).toBe("GAME_OVER");
    expect(root.innerHTML).toContain("sw-scorepad-table");
  });

  test("supports interactive tutorials and reference strategy guides for all 4 games", () => {
    const root: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const app = createMultiGamePlatformApp(root, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    app.autoRespondBotsToHuman = false;

    expect(root.innerHTML).not.toContain("ga-tutorial-strip");
    expect(root.innerHTML).toContain("game-select-card__actions");
    for (const gameId of [
      "catan",
      "splendor",
      "azul",
      "seven_wonders",
    ] as const) {
      expect(root.innerHTML).toContain(`data-start-tutorial="${gameId}"`);
      expect(root.innerHTML).toContain(`data-open-guide="${gameId}"`);
    }

    expect(COMMODITY_META.paper.bgTop).toBe(RESOURCE_META.lumber.bgTop);
    expect(COMMODITY_META.cloth.bgTop).toBe(RESOURCE_META.wool.bgTop);
    expect(COMMODITY_META.coin.bgTop).toBe(RESOURCE_META.ore.bgTop);

    for (const gameId of [
      "catan",
      "splendor",
      "azul",
      "seven_wonders",
    ] as const) {
      expect(TUTORIAL_LESSONS[gameId].length).toBeGreaterThanOrEqual(5);
      expect(GAME_REFERENCE_GUIDES[gameId].sections.length).toBeGreaterThanOrEqual(
        4
      );

      const guideHtml = renderReferenceGuideModalPure(gameId, false);
      expect(guideHtml).toContain(`${GAME_REFERENCE_GUIDES[gameId].title} — How to play`);
      expect(guideHtml).toContain("ga-guide-visual");
      expect(guideHtml).not.toContain("Grandmaster table tips");
      expect(guideHtml).not.toContain("data-guide-tab");

      if (gameId === "catan") {
        expect(GAME_REFERENCE_GUIDES.catan.sections.length).toBe(8);
        expect(guideHtml).toContain("ga-guide-dev-grid");
        expect(guideHtml).toContain("Road Building");
        expect(guideHtml).toContain("Year of Plenty");
        expect(guideHtml).toContain("Monopoly");
        expect(guideHtml).toContain("Barbarian Ship");
      }

      const tutRoom = app.startInteractiveTutorial(gameId);
      expect(app.viewMode).toBe("in_game");
      expect(root.innerHTML).toContain("ga-tutorial-coach");
      expect(root.innerHTML).toContain("Tutorial 1/");

      const st0 = app.getRoomState(tutRoom);
      expect(st0).not.toBeNull();
      const rec = chooseRecommendedTutorialActionPure(
        gameId,
        st0,
        app.currentUserId
      );
      expect(rec).not.toBeNull();
      app.dispatchUiAction(app.currentUserId, rec);
    }
  });

  test("supports UNSELECT_DRAFT_ACTION (Change pick) in UI and preserves manual Prev tutorial step across renders", () => {
    const clickHandlers: Record<string, () => void> = {};
    const root: any = {
      innerHTML: "",
      querySelector: (sel: string) => ({
        addEventListener: (ev: string, fn: () => void) => {
          if (ev === "click") clickHandlers[sel] = fn;
        },
      }),
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const app = createMultiGamePlatformApp(root, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    app.autoRespondBotsToHuman = false;

    // 1. Player 1 locks a simultaneous pick while bots are still waiting, then clicks Change pick (`UNSELECT_DRAFT_ACTION`)!
    const room = app.createLocalRoom({
      name: "Change Pick Spec",
      gameId: "seven_wonders",
      ownerId: app.currentUserId,
      ownerName: "Player 1",
      isOfflineLocal: true,
      botCount: 2,
      wonderSideMode: "day",
      customSeed: "change-pick-spec",
      autoStart: true,
    });
    app.enterOrJoinRoom(room.roomId);
    const st0 = app.getRoomState(room) as SevenWondersState;
    const p1Id = st0.players[0]!.id;
    const firstLegal = SevenWondersEngine.getLegalActions(st0, p1Id)[0]!;
    app.dispatchUiAction(p1Id, firstLegal);

    const stLocked = app.getRoomState(room) as SevenWondersState;
    expect(stLocked.pendingChoices[p1Id]).toBeDefined();
    expect(getSevenWondersActingPlayerId(stLocked)).not.toBe(p1Id);

    // Even though getSevenWondersActingPlayerId now points to a bot seat, Player 1 can undo their locked pick!
    app.dispatchUiAction(p1Id, { type: "UNSELECT_DRAFT_ACTION" });
    const stUnlocked = app.getRoomState(room) as SevenWondersState;
    expect(stUnlocked.pendingChoices[p1Id]).toBeUndefined();

    // 2. Tutorial Prev step must NOT snap forward when re-rendering!
    const tutRoom = app.startInteractiveTutorial("seven_wonders");
    expect(root.innerHTML).toContain("Tutorial 1/");
    const tutSt = app.getRoomState(tutRoom);
    const rec = chooseRecommendedTutorialActionPure(
      "seven_wonders",
      tutSt,
      app.currentUserId
    )!;
    app.dispatchUiAction(app.currentUserId, rec);
    while (
      getSevenWondersActingPlayerId(
        app.getRoomState(tutRoom) as SevenWondersState
      ) !== app.currentUserId
    ) {
      app.stepOneBotMove();
    }
    expect(root.innerHTML).toContain("Tutorial 2/");

    clickHandlers["#btn-tutorial-prev"]!();
    expect(root.innerHTML).toContain("Tutorial 1/");
    app.render();
    expect(root.innerHTML).toContain("Tutorial 1/");
  });

  test("redacts rngState and tuckedWonderCardIds, supports out-of-order simultaneous redo, and hides Pass-and-Play hands cleanly", () => {
    const mgr = createPlatformRoomManager();
    const room = mgr.createRoom({
      name: "Simultaneous Redo & Hybrid Spec",
      gameId: "seven_wonders",
      ownerId: "h1",
      hostName: "Alice",
      botCount: 0,
      seed: "sw-r4-redo",
      autoStart: false,
    });
    mgr.joinRoom(room.roomId, "Bob", false, "h2");
    const charlie = mgr.addLocalPlayer(room.roomId, "h1", "Charlie");
    const st0 = mgr.startGame(room.roomId, "h1") as SevenWondersState;

    // 1. Player view masks rngState and opponents' tuckedWonderCardIds
    const fakeWithTuck: SevenWondersState = {
      ...st0,
      players: st0.players.map((p, idx) =>
        idx === 1 ? { ...p, tuckedWonderCardIds: ["secret-card-99"] } : p
      ),
    };
    const p1View = SevenWondersEngine.getPlayerView(fakeWithTuck, "h1");
    expect(p1View.rngState).toBe(0);
    expect(p1View.players[1]!.tuckedWonderCardIds).toEqual([
      "hidden-tucked-h2-0",
    ]);

    // 2. Out-of-order simultaneous undo & redo for h2 while h1 is actingId
    const h2Act = SevenWondersEngine.getLegalActions(st0, "h2")[0]!;
    mgr.dispatchAction(room.roomId, "h2", h2Act);
    expect(mgr.toRoomSummary(room, "h2").canUndo).toBe(true);
    mgr.undoAction(room.roomId, "h2");
    expect(mgr.toRoomSummary(room, "h2").canRedo).toBe(true);
    const redone = mgr.redoAction(room.roomId, "h2") as SevenWondersState;
    expect(redone.lockedPlayerIds).toContain("h2");

    // 3. Hybrid online + local Pass-and-Play: once h1 locks while h2 is still unlocked, h1's effective viewer becomes local Charlie!
    mgr.undoAction(room.roomId, "h2");
    const h1Act = SevenWondersEngine.getLegalActions(
      mgr.getRoom(room.roomId).session!.getState(),
      "h1"
    )[0]!;
    const afterH1Lock = mgr.dispatchAction(
      room.roomId,
      "h1",
      h1Act
    ) as SevenWondersState;
    const effViewer = resolveEffectiveViewerIdPure(
      mgr.getRoom(room.roomId),
      "h1",
      getSevenWondersActingPlayerId(afterH1Lock),
      afterH1Lock
    );
    expect(effViewer).toBe(charlie.id);
  });
});
