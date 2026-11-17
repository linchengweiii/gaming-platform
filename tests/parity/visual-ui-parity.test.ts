import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { SplendorEngine } from "../../packages/games/splendor/src/index.ts";
import { AzulEngine } from "../../packages/games/azul/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import { renderSplendorBoardView } from "../../apps/web/src/splendor-view.ts";
import { renderAzulBoardView } from "../../apps/web/src/azul-view.ts";
import {
  loadOrCreateGoldenKey,
  makePlayers,
  sha256,
  withDeterministicClockAndRandom,
} from "./golden-store.ts";

function collectVisualUiSnapshots() {
  return withDeterministicClockAndRandom(() => {
    const snapshots: Record<string, string> = {};

    // 1. Guest Login Screen
    const loginRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    new MultiGamePlatformApp(loginRoot, {
      forceLocalMode: true,
      startAtLogin: true,
    });
    snapshots.loginView = loginRoot.innerHTML;

    // 2. Lobby, Host Setup, Guest Setup, Catan, Splendor, and Azul Views
    const appRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const app = new MultiGamePlatformApp(appRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    }) as any;
    app.autoRespondBotsToHuman = false;
    snapshots.lobbyView = appRoot.innerHTML;

    // 3. Host Editable Room Setup (room-1)
    app.enterOrJoinRoom("room-1");
    const room1 = app.getActiveRoom();
    room1.seed = "golden-ui-catan-seed";
    room1.startingPlayerMode = "first";
    app.render();
    snapshots.roomSetupHost = appRoot.innerHTML;

    // 4. Guest Read-only Setup Summary (room-2)
    app.enterOrJoinRoom("room-2");
    snapshots.roomSetupGuest = appRoot.innerHTML;

    // 5. Catan SETUP_SETTLEMENT_1
    app.enterOrJoinRoom("room-1");
    app.startRoomMatch("room-1");
    snapshots.catanSetupSettlement1 = appRoot.innerHTML;

    // 6. Catan PRE_ROLL
    app.finishSetupWithBots();
    snapshots.catanPreRoll = appRoot.innerHTML;

    // 7. Catan MAIN_PHASE
    const aliceId = room1.players[0]!.id as string;
    const bot1Id = room1.players[1]!.id as string;
    app.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room1.session.getState().phase !== "MAIN_PHASE") {
      const cur = room1.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      app.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    snapshots.catanMainPhase = appRoot.innerHTML;

    // 8. Catan Bank Trade Drawer + Request Selection
    app.switchTradeMode("maritime_trade");
    app.setSharedTradeWant("ore", 1);
    app.setSharedTradeWant("brick", 1);
    app.render();
    snapshots.catanBankTradeModal = appRoot.innerHTML;

    // 9. Catan Player Trade Drawer (preserving Request)
    app.switchTradeMode("domestic_trade");
    app.domesticGive.wool = 1;
    app.render();
    snapshots.catanPlayerTradeModal = appRoot.innerHTML;
    app.switchTradeMode(null);

    // 10. Opponent Turn (!isMyTurn) & Incoming Trade Offer Decision
    app.dispatch(aliceId, { type: "END_TURN" });
    snapshots.catanOpponentTurn = appRoot.innerHTML;

    app.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room1.session.getState().phase !== "MAIN_PHASE") {
      const cur = room1.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      app.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    const stBot = room1.session.getState();
    stBot.players[1]!.resources.grain += 1;
    stBot.bank.grain -= 1;
    stBot.players[0]!.resources.lumber += 1;
    stBot.bank.lumber -= 1;
    app.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { grain: 1 },
      want: { lumber: 1 },
    });
    snapshots.catanIncomingTradeOffer = appRoot.innerHTML;

    // 11. Splendor In-Game View (room-3)
    const room3 = app.rooms.get("room-3");
    room3.ownerId = app.currentUserId;
    room3.ownerName = app.currentUserName;
    room3.humanPlayers = [
      {
        id: app.currentUserId,
        name: app.currentUserName,
        color: "#e11d48",
        isBot: false,
      },
    ];
    room3.seed = "golden-ui-splendor-seed";
    room3.startingPlayerMode = "first";
    app.rebuildRoomSeats(room3);
    app.enterOrJoinRoom("room-3");
    app.startRoomMatch("room-3");
    app.splendorDraftGems = { emerald: 1, sapphire: 1 };
    app.render();
    snapshots.splendorInGame = appRoot.innerHTML;

    // 12. Azul In-Game View (room-4)
    const room4 = app.rooms.get("room-4");
    room4.ownerId = app.currentUserId;
    room4.ownerName = app.currentUserName;
    room4.humanPlayers = [
      {
        id: app.currentUserId,
        name: app.currentUserName,
        color: "#e11d48",
        isBot: false,
      },
    ];
    room4.seed = "golden-ui-azul-seed";
    room4.startingPlayerMode = "first";
    app.rebuildRoomSeats(room4);
    app.enterOrJoinRoom("room-4");
    app.startRoomMatch("room-4");
    const firstFactoryColor = room4.session.getState().factories[0]![0]!;
    app.azulSelectedDraft = {
      source: { kind: "factory", factoryIndex: 0 },
      color: firstFactoryColor,
    };
    app.render();
    snapshots.azulInGame = appRoot.innerHTML;

    // 13. Direct Pure Component Renderers
    const catanDirectState = CatanEngine.initGame(
      makePlayers(4),
      { scenarioId: "seafarers_new_shores", enableHarbormaster: true },
      "direct-svg-seed"
    );
    snapshots.directCatanSvg = renderCatanBoardSvg(catanDirectState, "p1", {
      buildMode: null,
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
    });
    snapshots.directCatanHand = renderCatanVisualHandTray(
      catanDirectState,
      {
        ...catanDirectState.players[0]!,
        resources: { brick: 2, lumber: 1, wool: 3, grain: 0, ore: 1 },
      },
      CatanEngine.getLegalActions(catanDirectState, "p1")
    );
    const splendorDirectState = SplendorEngine.initGame(
      makePlayers(3),
      {},
      "direct-splendor-seed"
    );
    snapshots.directSplendorBoard = renderSplendorBoardView(
      splendorDirectState,
      { ruby: 1 }
    );
    const azulDirectState = AzulEngine.initGame(
      makePlayers(3),
      {},
      "direct-azul-seed"
    );
    snapshots.directAzulBoard = renderAzulBoardView(azulDirectState, null);

    const hashes = Object.fromEntries(
      Object.entries(snapshots).map(([key, html]) => [
        key,
        { length: html.length, sha256: sha256(html) },
      ])
    );

    return { hashes, htmlByScreen: snapshots };
  });
}

describe("Functional Refactoring Visual HTML & SVG Parity", () => {
  const goldenVisualUi = loadOrCreateGoldenKey(
    "visualUi",
    collectVisualUiSnapshots
  );

  test("preserves byte-for-byte identical HTML & SVG visual output across all UI screens and game boards", () => {
    const actual = collectVisualUiSnapshots();
    expect(actual.hashes).toEqual(goldenVisualUi.hashes);
    for (const [screenName, expectedHtml] of Object.entries(
      goldenVisualUi.htmlByScreen
    )) {
      expect(actual.htmlByScreen[screenName]).toBe(expectedHtml);
    }
  });
});
