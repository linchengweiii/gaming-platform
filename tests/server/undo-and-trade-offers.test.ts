import { describe, expect, test } from "bun:test";
import { PlatformRoomManager } from "../../apps/server/src/room-manager.ts";
import {
  CatanEngine,
  getNextActingPlayerId,
  getPlayerResourceCount,
  getPlayerTradeRatios,
} from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { createFakeDomRoot } from "./helpers.ts";

describe("@gaming-platform/server - Turn-Scoped Undo, Redaction & Trade Offer Decisions", () => {
  test("enforces turn-scoped reversible undo, hides opponent cards and dev-card VPs, and supports multi-trade + instant trade mode switching", () => {
    const manager = new PlatformRoomManager();
    const room = manager.createRoom({
      name: "Fair Undo & Hidden Hands",
      gameId: "catan",
      ownerId: "p1",
      hostName: "Alice",
      startingPlayerMode: "first",
    });
    manager.joinRoom(room.roomId, "Bob", false, "p2");
    manager.updateRoomSetup(room.roomId, "p1", {
      botCount: 1,
      startingPlayerMode: "first",
    });
    manager.startGame(room.roomId, "p1");

    // 1. Setup undo: Alice places settlement 1 -> Alice can undo it; Bob cannot undo Alice's move
    const setupActions1 = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    );
    const firstSettlement = setupActions1.find(
      (a) => a.type === "PLACE_SETUP_SETTLEMENT"
    )!;
    manager.dispatchAction(room.roomId, "p1", firstSettlement);
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(true);
    expect(manager.toRoomSummary(room, "p1").undoableSteps).toBe(1);
    expect(manager.toRoomSummary(room, "p2").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p2")).toThrow();

    // Once Alice places her setup road, turn passes to Bob -> neither Alice nor Bob can undo Alice's setup
    const setupRoad1 = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    ).find((a) => a.type === "PLACE_SETUP_EDGE")!;
    manager.dispatchAction(room.roomId, "p1", setupRoad1);
    expect(getNextActingPlayerId(room.session!.getState())).toBe("p2");
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(manager.toRoomSummary(room, "p2").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();
    expect(() => manager.undoAction(room.roomId, "p2")).toThrow();

    // Finish snake draft setup so Alice starts Turn 1 at PRE_ROLL
    manager.finishCatanSetupWithBots(room.roomId);
    expect(room.session!.getState().phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(room.session!.getState())).toBe("p1");
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);

    // 2. Rolling dice (and resolving any 7) is irreversible -> cannot undo dice roll
    manager.dispatchAction(room.roomId, "p1", { type: "ROLL_DICE" });
    while (room.session!.getState().phase !== "MAIN_PHASE") {
      const st = room.session!.getState();
      const actor = getNextActingPlayerId(st)!;
      const move = CatanEngine.chooseBotAction(st, actor)!;
      manager.dispatchAction(room.roomId, actor, move);
    }
    expect(room.session!.getState().phase).toBe("MAIN_PHASE");
    expect(room.session!.getUndoableStepCount("p1")).toBe(0);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // 3. Multi-trade at once (2x grain port bundle -> 2 brick) + reversible undo stopping at dice roll
    const liveState = room.session!.getState();
    const alice = liveState.players.find((p: any) => p.id === "p1")!;
    const bob = liveState.players.find((p: any) => p.id === "p2")!;
    const aliceRatios = getPlayerTradeRatios(liveState, "p1");
    const twoBundleGrain = aliceRatios.grain * 2;

    // Ensure Alice has at least `twoBundleGrain` grain while preserving conservation
    while (alice.resources.grain < twoBundleGrain && liveState.bank.grain > 0) {
      alice.resources.grain += 1;
      liveState.bank.grain -= 1;
    }

    // Also give Bob 2 hidden VP dev cards and extra resource cards from bank
    const bobLumber = Math.min(3, liveState.bank.lumber);
    const bobOre = Math.min(2, liveState.bank.ore);
    bob.resources.lumber += bobLumber;
    liveState.bank.lumber -= bobLumber;
    bob.resources.ore += bobOre;
    liveState.bank.ore -= bobOre;
    const expectedBobCards = getPlayerResourceCount(bob);
    bob.devCards.push(
      { id: "vp-hidden-1", type: "victory_point", boughtOnTurn: 1, played: false },
      { id: "vp-hidden-2", type: "victory_point", boughtOnTurn: 1, played: false }
    );
    expect(CatanEngine.checkInvariants(liveState).valid).toBe(true);

    // Verify getPlayerView hides Bob's exact resources AND hidden VP dev cards from Alice
    const aliceView = CatanEngine.getPlayerView(liveState, "p1");
    const bobInAliceView = aliceView.players.find((p) => p.id === "p2")!;
    expect(bobInAliceView.handRedacted).toBe(true);
    expect(bobInAliceView.resources).toEqual({
      brick: 0,
      lumber: 0,
      wool: 0,
      grain: 0,
      ore: 0,
    });
    expect(bobInAliceView.hiddenResourceCount).toBe(expectedBobCards);
    const bobTrueVp = CatanEngine.getWinner(liveState) ? 0 : bob.devCards.filter((c: any) => c.type === "victory_point").length;
    expect(bobTrueVp).toBe(2);
    // In Alice's view, Bob's total VP has 0 hidden dev-card VPs
    expect(
      bobInAliceView.devCards.some((c) => c.type === "victory_point")
    ).toBe(false);
    expect(CatanEngine.checkInvariants(aliceView).valid).toBe(true);

    // Execute multi-trade: 2 grain bundles (e.g. 8 grain at 4:1) -> 2 brick in a single MARITIME_TRADE action!
    const prevAliceBrick = alice.resources.brick;
    const prevAliceGrain = alice.resources.grain;
    manager.dispatchAction(room.roomId, "p1", {
      type: "MARITIME_TRADE",
      give: "grain",
      giveAmount: twoBundleGrain,
      receive: "brick",
      receiveAmount: 2,
    });
    const afterTradeState = room.session!.getState();
    const aliceAfterTrade = afterTradeState.players.find((p: any) => p.id === "p1")!;
    expect(aliceAfterTrade.resources.grain).toBe(prevAliceGrain - twoBundleGrain);
    expect(aliceAfterTrade.resources.brick).toBe(prevAliceBrick + 2);
    expect(CatanEngine.checkInvariants(afterTradeState).valid).toBe(true);

    // Alice CAN undo her MARITIME_TRADE, and after undoing it, cannot undo further past the dice roll!
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(true);
    expect(manager.toRoomSummary(room, "p1").undoableSteps).toBe(1);
    manager.undoAction(room.roomId, "p1");
    const afterUndoState = room.session!.getState();
    expect(
      afterUndoState.players.find((p: any) => p.id === "p1")!.resources.grain
    ).toBe(prevAliceGrain);
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // Also test multi-resource combined MARITIME_TRADE (giveMap + receiveMap) + undo
    const stCombo = room.session!.getState();
    const p1Combo = stCombo.players.find((p: any) => p.id === "p1")!;
    const comboRatios = getPlayerTradeRatios(stCombo, "p1");
    while (p1Combo.resources.grain < comboRatios.grain && stCombo.bank.grain > 0) {
      p1Combo.resources.grain += 1;
      stCombo.bank.grain -= 1;
    }
    while (p1Combo.resources.lumber < comboRatios.lumber && stCombo.bank.lumber > 0) {
      p1Combo.resources.lumber += 1;
      stCombo.bank.lumber -= 1;
    }
    const preComboBrick = p1Combo.resources.brick;
    const preComboOre = p1Combo.resources.ore;
    manager.dispatchAction(room.roomId, "p1", {
      type: "MARITIME_TRADE",
      give: "grain",
      giveAmount: comboRatios.grain,
      receive: "brick",
      receiveAmount: 1,
      giveMap: { grain: comboRatios.grain, lumber: comboRatios.lumber },
      receiveMap: { brick: 1, ore: 1 },
    });
    const postCombo = room.session!.getState().players.find((p: any) => p.id === "p1")!;
    expect(postCombo.resources.brick).toBe(preComboBrick + 1);
    expect(postCombo.resources.ore).toBe(preComboOre + 1);
    manager.undoAction(room.roomId, "p1");

    // Buying a Development Card draws a secret card -> CANNOT be undone!
    const stForDev = room.session!.getState();
    const p1Dev = stForDev.players.find((p: any) => p.id === "p1")!;
    for (const r of ["wool", "grain", "ore"] as const) {
      if (p1Dev.resources[r] < 1 && stForDev.bank[r] > 0) {
        p1Dev.resources[r] += 1;
        stForDev.bank[r] -= 1;
      }
    }
    manager.dispatchAction(room.roomId, "p1", { type: "BUY_DEV_CARD" });
    expect(manager.toRoomSummary(room, "p1").canUndo).toBe(false);
    expect(() => manager.undoAction(room.roomId, "p1")).toThrow();

    // 4. Verify UI renders hidden card pill for opponents and segmented Bank <-> Player trade tabs
    const uiRoot = createFakeDomRoot();
    const uiApp = new MultiGamePlatformApp(uiRoot, {
      forceLocalMode: true,
    }) as any;
    uiApp.startSoloGameFromLogin("Alice");
    const localRoom = uiApp.getActiveRoom();
    localRoom.startingPlayerMode = "first";
    uiApp.startRoomMatch(localRoom.roomId);
    const aliceId = localRoom.players[0]!.id as string;

    uiApp.finishSetupWithBots();
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (localRoom.session.getState().phase !== "MAIN_PHASE") {
      const st = localRoom.session.getState();
      const actId = getNextActingPlayerId(st)!;
      if (actId === aliceId) {
        const mv = CatanEngine.chooseBotAction(st, aliceId)!;
        uiApp.dispatch(aliceId, mv);
      } else {
        uiApp.stepOneBotMove();
      }
    }
    // Right after dice roll (and any robber step), undo must not be allowed across the dice roll
    expect(localRoom.session.canPlayerUndo(aliceId)).toBe(false);

    // Give bot-2 a hidden VP dev card and verify UI Standings hides bot-2's VP dev card & exact resources
    const localSt = localRoom.session.getState();
    localSt.players[1]!.devCards.push({
      id: "bot-secret-vp",
      type: "victory_point",
      boughtOnTurn: 1,
      played: false,
    });
    // Also give Alice 2 grain port bundles from bank so we can verify multi-bundle bank trade in UI
    const uiGrainBundle2 = getPlayerTradeRatios(localSt, aliceId).grain * 2;
    while (
      localSt.players[0]!.resources.grain < uiGrainBundle2 &&
      localSt.bank.grain > 0
    ) {
      localSt.players[0]!.resources.grain += 1;
      localSt.bank.grain -= 1;
    }

    uiApp.buildMode = "maritime_trade";
    uiApp.maritimeGive.grain = uiGrainBundle2;
    uiApp.maritimeWant.brick = 2;
    uiApp.render();
    expect(uiRoot.innerHTML).toContain("res-pill--hidden");
    expect(uiRoot.innerHTML).toContain('data-trade-tab="maritime_trade"');
    expect(uiRoot.innerHTML).toContain('data-trade-tab="domestic_trade"');
    expect(uiRoot.innerHTML).toContain("2 bank trades ready");
    // Bot-2 has 2 settlements (2 public VP) + 1 secret VP dev card -> UI must show "2 VP", NOT "3 VP (2)"
    expect(uiRoot.innerHTML).not.toContain("3 VP (2)");
    // Rules invariant badge on redacted view must stay valid
    expect(uiRoot.innerHTML).toContain("Rules verified");
  });

  test("shows only Accept and Decline (no Cancel) on incoming trade offers and auto-declines when missing resources", () => {
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
    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const st = room.session.getState();
      const actId = getNextActingPlayerId(st)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(st, actId)!);
    }

    // Clear all player hands back into bank cleanly so we can set exact resources
    const st = room.session.getState();
    for (const p of st.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        st.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // 1. Alice offers 1 brick -> 1 ore when NOBODY holds ore: all opponents auto-decline immediately!
    st.players[0]!.resources.brick = 2;
    st.bank.brick -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(room.session.getState().activeTradeOffer).toBeNull();
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);

    // 2. Give BOTH Bot 2 (index 2) and Bot 3 (index 3) 1 ore while Bot 1 (index 1) has 0 ore:
    // Bot 1 auto-declines and acting responder skips directly to Bot 2!
    const bot3Id = room.players[3]!.id as string;
    const st2 = room.session.getState();
    st2.players[2]!.resources.ore = 1;
    st2.players[3]!.resources.ore = 1;
    st2.bank.ore -= 2;
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(room.session.getState().activeTradeOffer).not.toBeNull();
    expect(room.session.getState().activeTradeOffer.declinedBy).toContain(bot1Id);
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot2Id);
    // Because ALICE proposed this trade and is waiting on Bot 2, Alice (the proposer) sees Cancel offer
    expect(uiRoot.innerHTML).toContain('id="btn-cancel-domestic"');
    const offer2Id = room.session.getState().activeTradeOffer.id as string;

    // 2b. Bot 2 accepts! Even while Bot 3 hasn't responded yet, Alice can ALREADY select "Trade with Bot 2"!
    uiApp.dispatch(bot2Id, {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offer2Id,
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot3Id);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot2Id}"`);

    // 2c. Bot 3 also accepts! Now control returns to Alice with BOTH "Trade with Bot 2" and "Trade with Bot 3"
    uiApp.dispatch(bot3Id, {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offer2Id,
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot2Id}"`);
    expect(uiRoot.innerHTML).toContain(`data-confirm-trade="${bot3Id}"`);

    // Alice chooses to trade with Bot 3!
    uiApp.dispatch(aliceId, {
      type: "CONFIRM_DOMESTIC_TRADE",
      offerId: offer2Id,
      partnerId: bot3Id,
    });
    expect(room.session.getState().activeTradeOffer).toBeNull();
    expect(room.session.getState().players[0]!.resources.ore).toBe(1);
    expect(room.session.getState().players[2]!.resources.ore).toBe(1); // Bot 2 untouched
    expect(room.session.getState().players[3]!.resources.ore).toBe(0); // Bot 3 traded
    expect(room.session.getState().players[3]!.resources.brick).toBe(1);

    // 3. Advance to Bot 1's MAIN_PHASE and have Bot 1 offer a trade!
    uiApp.dispatch(aliceId, { type: "END_TURN" });
    uiApp.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }

    const st3 = room.session.getState();
    for (const p of st3.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        st3.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    st3.players[1]!.resources.wool = 2; // Bot 1 gives wool
    st3.bank.wool -= 2;
    st3.players[2]!.resources.lumber = 1; // Bot 2 has lumber, Alice has 0 lumber!
    st3.bank.lumber -= 1;

    // 3a. Bot 1 offers 1 wool -> 1 lumber: Alice lacks lumber, so Alice auto-declines without being prompted!
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(room.session.getState().activeTradeOffer.declinedBy).toContain(aliceId);
    expect(getNextActingPlayerId(room.session.getState())).toBe(bot2Id);
    uiApp.dispatch(bot1Id, { type: "CANCEL_DOMESTIC_TRADE" });

    // 3b. Now give Alice 1 lumber so Alice CAN respond to Bot 1's offer:
    // Alice MUST see ONLY Accept and Decline, and MUST NOT see Cancel offer!
    const st4 = room.session.getState();
    st4.players[0]!.resources.lumber = 1;
    st4.bank.lumber -= 1;
    uiApp.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { wool: 1 },
      want: { lumber: 1 },
    });
    expect(getNextActingPlayerId(room.session.getState())).toBe(aliceId);
    expect(uiRoot.innerHTML).toContain(`data-accept-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).toContain(`data-decline-trade="${aliceId}"`);
    expect(uiRoot.innerHTML).not.toContain('id="btn-cancel-domestic"');
  });
});
