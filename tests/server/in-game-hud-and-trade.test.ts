import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { createFakeDomRoot, readCombinedWebStyles } from "./helpers.ts";

describe("@gaming-platform/server - Zero-Scroll Canvas, Shared Trade Request & Locked Map HUD", () => {
  test("renders zero-scroll game canvas, hides bank count in bank trade, and keeps Request identical with minimal UI diff on quick trade switch", () => {
    const cssText = readCombinedWebStyles();
    expect(cssText).toContain(".ga-game-canvas");
    expect(cssText).toContain("height: 100dvh;");
    expect(cssText).toContain(".ga-game-canvas .action-dock > .sub-modal");

    const uiRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startSoloGameFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    room.startingPlayerMode = "first";
    uiApp.startRoomMatch(room.roomId);
    const aliceId = room.players[0]!.id as string;

    uiApp.finishSetupWithBots();
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    // 1. Canvas layout: no inline overflow-y on .board-svg-wrap, Standings prioritized first & last to scroll, and Game settings folded by default
    expect(uiRoot.innerHTML).toContain('class="ga-game-canvas"');
    expect(uiRoot.innerHTML).not.toContain(
      'class="board-svg-wrap" style="overflow-y: auto;"'
    );
    expect(uiRoot.innerHTML).toContain('class="ga-standings-list"');
    expect(uiRoot.innerHTML).toContain('class="res-pills res-pills--bank"');
    expect(uiRoot.innerHTML).toContain('class="event-log"');
    expect(
      uiRoot.innerHTML.indexOf('class="ga-standings-section"')
    ).toBeLessThan(uiRoot.innerHTML.indexOf('class="ga-sidebar__secondary"'));
    expect(cssText).toContain(".ga-game-canvas .ga-standings-section");
    expect(cssText).toContain(".ga-game-canvas .ga-sidebar__secondary");

    expect(uiApp.sidebarSettingsExpanded).toBe(false);
    expect(uiRoot.innerHTML).toContain('id="btn-toggle-game-settings"');
    expect(uiRoot.innerHTML).toContain('aria-expanded="false"');
    expect(uiRoot.innerHTML).not.toContain('class="ga-settings-fold__body"');

    uiApp.sidebarSettingsExpanded = true;
    uiApp.render();
    expect(uiRoot.innerHTML).toContain('aria-expanded="true"');
    expect(uiRoot.innerHTML).toContain('class="ga-settings-fold__body"');
    uiApp.sidebarSettingsExpanded = false;
    uiApp.render();

    // 2. Start in Player Trade, request 2 Ore + 1 Brick, then quick-switch to Bank Trade:
    //    Request stays 100% identical and Bank Trade shows NO bank supply numbers!
    uiApp.switchTradeMode("domestic_trade");
    uiApp.setSharedTradeWant("ore", 2);
    uiApp.setSharedTradeWant("brick", 1);
    uiApp.domesticGive.grain = 1;
    uiApp.render();

    const domesticModalMatch = uiRoot.innerHTML.match(
      /<div class="sub-modal sub-modal--trade">[\s\S]*?<\/div>\s*<div class="action-buttons">/
    );
    expect(domesticModalMatch).not.toBeNull();
    expect(uiRoot.innerHTML).toContain("ga-res-col-head__rate");

    uiApp.switchTradeMode("maritime_trade");
    expect(uiApp.maritimeWant.ore).toBe(2);
    expect(uiApp.maritimeWant.brick).toBe(1);
    expect(uiApp.domesticWant.ore).toBe(2);
    expect(uiApp.domesticWant.brick).toBe(1);

    const maritimeModalMatch = uiRoot.innerHTML.match(
      /<div class="sub-modal sub-modal--trade">[\s\S]*?<\/div>\s*<div class="action-buttons">/
    );
    expect(maritimeModalMatch).not.toBeNull();
    const maritimeModalHtml = maritimeModalMatch![0];

    // Bank Trade must NOT display bank supply counts ("bank 19", etc.) or stack metadata rows
    expect(maritimeModalHtml).not.toContain("ga-res-cell--stack");
    expect(/bank \d+/i.test(maritimeModalHtml)).toBe(false);
    expect(maritimeModalHtml).not.toContain("Trade with bank (");
    // Both tabs share identical row labels ("Offer" and "Request") and column rate badges
    expect(maritimeModalHtml).toContain("Offer");
    expect(maritimeModalHtml).toContain("Request");
    expect(maritimeModalHtml).toContain("ga-res-col-head__rate");

    // 3. Modify Request in Bank Trade (+1 Wool) and quick-switch back to Player Trade: Request stays identical!
    uiApp.setSharedTradeWant("wool", 1);
    uiApp.switchTradeMode("domestic_trade");
    expect(uiApp.domesticWant).toEqual({
      brick: 1,
      lumber: 0,
      wool: 1,
      grain: 0,
      ore: 2,
    });
    expect(uiApp.maritimeWant).toEqual(uiApp.domesticWant);
  });

  test("locks map container size, keeps map unobstructed during all trade states, and blocks dice roll and dev cards on others' turns", () => {
    const cssText = readCombinedWebStyles();
    // 1. Fixed HUD tracks so .board-svg-wrap never changes dimensions mid-game, and downward sub-modal drawer
    expect(cssText).toContain("flex: 0 0 48px;");
    expect(cssText).toContain("flex: 0 0 184px;");
    expect(cssText).toContain("height: 30px;");
    expect(cssText).toContain(".ga-game-canvas .hand-tray-header__left");
    expect(cssText).toContain(".ga-game-canvas .hand-tray-header__hint");
    expect(cssText).toContain(".ga-game-canvas .ck-hand-tray .playing-card:not(.dev-playing-card)");
    expect(cssText).toContain("top: 100%;");
    expect(cssText).not.toContain("bottom: calc(100% + 8px);");

    const uiRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.autoRespondBotsToHuman = false;
    uiApp.startSoloGameFromLogin("Alice");
    const room = uiApp.getActiveRoom();
    room.startingPlayerMode = "first";
    uiApp.startRoomMatch(room.roomId);
    const aliceId = room.players[0]!.id as string;
    const bot1Id = room.players[1]!.id as string;
    const bot2Id = room.players[2]!.id as string;

    uiApp.finishSetupWithBots();

    // Pull playable development cards directly from the deck so Catan's 25-card invariant holds
    const st = room.session.getState();
    const takeDevFromDeck = (devType: string, id: string) => {
      const idx = st.devCardDeck.indexOf(devType);
      if (idx >= 0) st.devCardDeck.splice(idx, 1);
      return { id, type: devType, boughtOnTurn: 0, played: false };
    };
    st.players[0]!.devCards.push(
      takeDevFromDeck("knight", "dev-a-1"),
      takeDevFromDeck("road_building", "dev-a-2"),
      takeDevFromDeck("year_of_plenty", "dev-a-3"),
      takeDevFromDeck("monopoly", "dev-a-4")
    );
    st.players[1]!.devCards.push(
      takeDevFromDeck("knight", "dev-b-1"),
      takeDevFromDeck("monopoly", "dev-b-2")
    );
    uiApp.render();

    // On Alice's PRE_ROLL: Alice CAN roll dice or play Knight
    expect(uiApp.canControlPlayerOnThisDevice(room, aliceId)).toBe(true);
    expect(uiApp.canControlPlayerOnThisDevice(room, bot1Id)).toBe(false);
    expect(uiRoot.innerHTML).toContain('id="btn-roll-dice"');
    expect(uiRoot.innerHTML).toContain('id="btn-play-knight"');
    expect(uiRoot.innerHTML).toContain('id="btn-hand-play-knight"');

    // Advance to Alice's MAIN_PHASE
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    // Check map unobstructed when proposing Bank Trade or Player Trade
    const getBoardWrapHtml = (html: string): string => {
      const start = html.indexOf('<div class="board-svg-wrap">');
      const end = html.indexOf('<div class="action-dock">');
      return html.slice(start, end);
    };

    uiApp.switchTradeMode("maritime_trade");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="board-svg"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="map-build-dock ');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('id="btn-toggle-build-menu"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('aria-expanded="false"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="map-build-dock__panel " hidden>');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="map-end-turn-hud"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('id="btn-end-turn"');
    expect(uiRoot.innerHTML).toContain('class="player-stat-chip"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("sub-modal");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");

    // Expand build menu, then verify switching modes folds it back automatically
    uiApp.mapBuildMenuExpanded = true;
    uiApp.render();
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('class="map-build-dock is-open"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('aria-expanded="true"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('id="btn-fold-build-menu"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain('class="map-build-dock__panel " hidden>');

    uiApp.switchTradeMode("domestic_trade");
    expect(uiApp.mapBuildMenuExpanded).toBe(false);
    expect(getBoardWrapHtml(uiRoot.innerHTML)).toContain('aria-expanded="false"');
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("sub-modal");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");

    // Check map unobstructed when Alice proposes a trade and waits / chooses partner
    const stMain = room.session.getState();
    for (const p of stMain.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        stMain.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    stMain.players[0]!.resources.brick = 2;
    stMain.bank.brick -= 2;
    stMain.players[2]!.resources.ore = 2;
    stMain.bank.ore -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: bot2Id,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("trade offer");
    expect(uiRoot.innerHTML).toContain("sub-modal--trade-offer");
    uiApp.dispatch(aliceId, { type: "CANCEL_DOMESTIC_TRADE" });

    // 2. End Alice's turn -> Bot 1's PRE_ROLL: Alice MUST NOT see Roll Dice or ANY Dev Card play buttons!
    uiApp.dispatch(aliceId, { type: "END_TURN" });
    expect(room.session.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot1Id);

    const forbiddenTurnButtons = [
      'id="btn-roll-dice"',
      'id="btn-play-knight"',
      'id="btn-play-roadbuild"',
      'id="btn-mode-yop"',
      'id="btn-mode-mono"',
      'id="btn-hand-play-knight"',
      'id="btn-hand-play-roadbuild"',
      'id="btn-hand-play-yop"',
      'id="btn-hand-play-mono"',
    ];
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }
    expect(uiRoot.innerHTML).toContain("Play on your turn");
    expect(uiRoot.innerHTML).toContain('class="visual-hand-tray"');

    // UI action guard also blocks programmatic UI dispatch attempts on Bot 1's turn
    uiApp.dispatchUiAction(bot1Id, { type: "ROLL_DICE" });
    uiApp.dispatchUiAction(aliceId, { type: "PLAY_KNIGHT" });
    expect(room.session.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot1Id);

    // 3. Advance to Bot 1's MAIN_PHASE: still NO roll dice or dev card play buttons!
    uiApp.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }

    // 4. Bot 1 sends a trade offer to Alice:
    //    - Map (.board-svg-wrap) stays 100% unobstructed (Accept/Decline docked in .action-dock > .sub-modal)
    //    - Alice still CANNOT play development cards or roll dice during Bot 1's turn!
    const stBotMain = room.session.getState();
    for (const p of stBotMain.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        stBotMain.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    stBotMain.players[1]!.resources.wool = 2;
    stBotMain.bank.wool -= 2;
    stBotMain.players[0]!.resources.lumber = 2;
    stBotMain.bank.lumber -= 2;
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("map-decision-popup");
    expect(getBoardWrapHtml(uiRoot.innerHTML)).not.toContain("Accept");
    expect(uiRoot.innerHTML).toContain(`data-accept-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).toContain(`data-decline-trade="${aliceId}"`);
    for (const selector of forbiddenTurnButtons) {
      expect(uiRoot.innerHTML).not.toContain(selector);
    }
  });
});
