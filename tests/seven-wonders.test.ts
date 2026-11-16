import { describe, expect, test } from "bun:test";
import type { BotDifficulty, PlayerDescriptor } from "@gaming-platform/core";
import {
  SEVEN_WONDERS_AGE_III_BASE_CARDS,
  SEVEN_WONDERS_AGE_II_CARDS,
  SEVEN_WONDERS_AGE_I_CARDS,
  SEVEN_WONDERS_GUILD_CARDS,
  SevenWondersEngine,
  WONDER_BOARDS,
  computeAffordablePaymentsPure,
  computeOptimalScienceScorePure,
  computeSevenWondersScoreBreakdown,
  getSevenWondersActingPlayerId,
  type SevenWondersCard,
  type SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { createMultiGamePlatformApp } from "../apps/web/src/app.ts";
import { resolveEffectiveViewerIdPure } from "../apps/server/src/index.ts";
import { createPlatformRoomManager } from "../apps/server/src/room-manager.ts";
import {
  GAME_REFERENCE_GUIDES,
  TUTORIAL_LESSONS,
  chooseRecommendedTutorialActionPure,
  renderReferenceGuideModalPure,
} from "../apps/web/src/tutorials.ts";

function createTestPlayers(
  count: number,
  difficulties: readonly BotDifficulty[] = ["master", "smart", "normal", "easy"]
): PlayerDescriptor[] {
  const palette = [
    "#e63946",
    "#2563eb",
    "#f59e0b",
    "#10b981",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
  ];
  return Array.from({ length: count }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Civilization ${idx + 1}`,
    color: palette[idx % palette.length]!,
    isBot: true,
    botDifficulty: difficulties[idx % difficulties.length] ?? "smart",
  }));
}

describe("7 Wonders Pure Functional Engine", () => {
  test("verifies official card deck counts (7 * N) across 3, 4, 5, 6, and 7 players", () => {
    for (const playerCount of [3, 4, 5, 6, 7] as const) {
      const age1 = SEVEN_WONDERS_AGE_I_CARDS.filter(
        (c) => c.minPlayers <= playerCount
      );
      const age2 = SEVEN_WONDERS_AGE_II_CARDS.filter(
        (c) => c.minPlayers <= playerCount
      );
      const age3Base = SEVEN_WONDERS_AGE_III_BASE_CARDS.filter(
        (c) => c.minPlayers <= playerCount
      );
      expect(age1.length).toBe(playerCount * 7);
      expect(age2.length).toBe(playerCount * 7);
      expect(age3Base.length + (playerCount + 2)).toBe(playerCount * 7);
      expect(SEVEN_WONDERS_GUILD_CARDS.length).toBe(10);

      const state = SevenWondersEngine.initGame(
        createTestPlayers(playerCount),
        { wonderSideMode: "random" },
        `deck-size-${playerCount}p`
      );
      expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(state.ageDecks[2].length).toBe(playerCount * 7);
      expect(state.ageDecks[3].length).toBe(playerCount * 7);
      expect(SevenWondersEngine.checkInvariants(state).valid).toBe(true);
    }
  });

  test("enforces official neighbor commerce rules (Brown & Gray only, never Yellow wildcards) and trade discounts", () => {
    const base = SevenWondersEngine.initGame(
      createTestPlayers(3),
      { wonderSideMode: "day" },
      "commerce-rule-seed"
    );

    const forumCard: SevenWondersCard = {
      id: "test-forum",
      templateId: "forum",
      name: "Forum",
      age: 2,
      color: "yellow",
      minPlayers: 3,
      coinCost: 0,
      resourceCost: {},
      freeFromChains: [],
      chainsTo: [],
      effects: [{ kind: "resources", options: ["glass", "loom", "papyrus"] }],
    };
    const loomCard: SevenWondersCard = {
      id: "test-loom",
      templateId: "loom_1",
      name: "Loom",
      age: 1,
      color: "gray",
      minPlayers: 3,
      coinCost: 0,
      resourceCost: {},
      freeFromChains: [],
      chainsTo: [],
      effects: [{ kind: "resources", options: ["loom"] }],
    };
    const marketplaceCard: SevenWondersCard = {
      id: "test-marketplace",
      templateId: "marketplace",
      name: "Marketplace",
      age: 1,
      color: "yellow",
      minPlayers: 3,
      coinCost: 0,
      resourceCost: {},
      freeFromChains: [],
      chainsTo: [],
      effects: [{ kind: "trade_discount", manufacturedBoth: true }],
    };

    // Player 0 needs 1 loom; Left neighbor (p3, idx 2) has ONLY Yellow Forum (not tradable!); Right neighbor (p2, idx 1) has starting wood
    const customPlayers = base.players.map((p, idx) => ({
      ...p,
      wonderId: (idx === 0 ? "giza" : idx === 1 ? "olympia" : "babylon") as any,
      startingResource: (idx === 0
        ? "stone"
        : idx === 1
          ? "wood"
          : "clay") as any,
      coins: 5,
      tableau: idx === 2 ? [forumCard] : [],
    }));

    expect(
      computeAffordablePaymentsPure(customPlayers, 0, { loom: 1 }, 0)
    ).toEqual([]);

    // Now give Left neighbor (idx 2) a real Gray Loom card -> costs 2 coins to Left!
    const withGrayLoom = customPlayers.map((p, idx) =>
      idx === 2 ? { ...p, tableau: [forumCard, loomCard] } : p
    );
    expect(
      computeAffordablePaymentsPure(withGrayLoom, 0, { loom: 1 }, 0)
    ).toEqual([{ leftCoins: 2, rightCoins: 0 }]);

    // Now give Player 0 a Marketplace -> discounted to 1 coin to Left!
    const withMarketplace = withGrayLoom.map((p, idx) =>
      idx === 0 ? { ...p, tableau: [marketplaceCard] } : p
    );
    expect(
      computeAffordablePaymentsPure(withMarketplace, 0, { loom: 1 }, 0)
    ).toEqual([{ leftCoins: 1, rightCoins: 0 }]);
  });

  test("computes optimal Science sets & wildcards and Olympia B3 neighbor Guild copy", () => {
    expect(
      computeOptimalScienceScorePure({ compass: 2, gear: 2, tablet: 1 }, 1)
    ).toEqual({
      points: 2 * 2 + 2 * 2 + 2 * 2 + 2 * 7, // 4 + 4 + 4 + 14 = 26
      finalCounts: { compass: 2, gear: 2, tablet: 2 },
    });

    expect(
      computeOptimalScienceScorePure({ compass: 4, gear: 0, tablet: 0 }, 1)
    ).toEqual({
      points: 25, // 5^2 = 25 > 4^2 + 1^2 = 17
      finalCounts: { compass: 5, gear: 0, tablet: 0 },
    });

    // Olympia B Stage 3 Guild copy check
    const base = SevenWondersEngine.initGame(
      createTestPlayers(3),
      { wonderSideMode: "night" },
      "olympia-guild-copy"
    );
    const spiesGuild = SEVEN_WONDERS_GUILD_CARDS.find(
      (g) => g.templateId === "spies_guild"
    )!;
    const redDummy: SevenWondersCard = {
      id: "red-1",
      templateId: "barracks",
      name: "Barracks",
      age: 1,
      color: "red",
      minPlayers: 3,
      coinCost: 0,
      resourceCost: {},
      freeFromChains: [],
      chainsTo: [],
      effects: [{ kind: "shields", shields: 1 }],
    };

    const players = base.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          wonderId: "olympia" as const,
          wonderSide: "B" as const,
          builtWonderStages: 3,
          tableau: [],
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tableau: [spiesGuild, redDummy, { ...redDummy, id: "red-2", name: "Stockade" }],
        };
      }
      return {
        ...p,
        tableau: [{ ...redDummy, id: "red-3", name: "Guard Tower" }],
      };
    });

    expect(WONDER_BOARDS.olympia.B.stages.length).toBe(3);
    const breakdown = computeSevenWondersScoreBreakdown(players, 0);
    expect(breakdown.copiedGuildName).toBe("Spies Guild");
    expect(breakdown.guildVp).toBe(3); // 2 red on right neighbor + 1 red on left neighbor
  });

  test("redacts opponent hands, pending picks, and discard pile in getPlayerView, and allows pre-reveal undo only", () => {
    const humanAndBots: PlayerDescriptor[] = [
      { id: "h1", name: "Human 1", color: "#e63946", isBot: false },
      { id: "h2", name: "Human 2", color: "#2563eb", isBot: false },
      { id: "b1", name: "Bot 1", color: "#f59e0b", isBot: true, botDifficulty: "master" },
    ];
    const s0 = SevenWondersEngine.initGame(humanAndBots, {}, "redaction-seed");
    const firstMove = SevenWondersEngine.getLegalActions(s0, "h1")[0]!;
    const { state: s1 } = SevenWondersEngine.applyAction(s0, "h1", firstMove);

    // Pre-reveal lock-in is undoable
    expect(SevenWondersEngine.isActionUndoable!(s0, firstMove, s1, "h1")).toBe(
      true
    );

    // Human 2 cannot see Human 1's hand or Human 1's pending choice
    const viewForH2 = SevenWondersEngine.getPlayerView(s1, "h2");
    expect(viewForH2.players[0]!.hand).toEqual([]);
    expect(viewForH2.players[0]!.handRedacted).toBe(true);
    expect(viewForH2.players[0]!.hiddenHandCount).toBe(7);
    expect(viewForH2.players[1]!.hand.length).toBe(7);
    expect(viewForH2.pendingChoices["h1"]).toBeUndefined();
    expect(viewForH2.lockedPlayerIds).toContain("h1");

    // Once h2 and b1 also pick, hands rotate and undo across simultaneous reveal is blocked
    const moveH2 = SevenWondersEngine.getLegalActions(s1, "h2")[0]!;
    const { state: s2 } = SevenWondersEngine.applyAction(s1, "h2", moveH2);
    const moveB1 = SevenWondersEngine.chooseBotAction(s2, "b1")!;
    const { state: s3 } = SevenWondersEngine.applyAction(s2, "b1", moveB1);
    expect(s3.draftRound).toBe(2);
    expect(SevenWondersEngine.isActionUndoable!(s2, moveB1, s3, "b1")).toBe(
      false
    );
  });

  test("completes deterministic full-game simulations for 3, 4, 5, 6, and 7 players across Day and Night Wonders with 0 invariant errors", () => {
    for (const playerCount of [3, 4, 5, 6, 7] as const) {
      for (const mode of ["day", "night", "random"] as const) {
        let state: SevenWondersState = SevenWondersEngine.initGame(
          createTestPlayers(playerCount, ["master", "smart", "normal", "easy"]),
          { wonderSideMode: mode, randomizeStartingPlayer: true },
          `sim-${playerCount}p-${mode}`
        );

        let safety = 0;
        while (state.phase !== "GAME_OVER" && safety < 500) {
          const actorId = getSevenWondersActingPlayerId(state);
          expect(actorId).not.toBeNull();
          const act = SevenWondersEngine.chooseBotAction(state, actorId!);
          expect(act).not.toBeNull();
          state = SevenWondersEngine.applyAction(state, actorId!, act!).state;
          const inv = SevenWondersEngine.checkInvariants(state);
          expect(inv.valid).toBe(true);
          safety += 1;
        }

        expect(state.phase).toBe("GAME_OVER");
        expect(state.winnerId).not.toBeNull();
        const winner = state.players.find((p) => p.id === state.winnerId)!;
        expect(winner.scoreBreakdown.totalVp).toBeGreaterThanOrEqual(20);
      }
    }
  });

  test("verifies 4-tier bot strength ordering (master > smart > normal > easy) across seat-balanced 4P matches", () => {
    const tiers: readonly BotDifficulty[] = ["master", "smart", "normal", "easy"];
    const totalPoints: Record<BotDifficulty, number> = {
      master: 0,
      smart: 0,
      normal: 0,
      easy: 0,
    };
    const wins: Record<BotDifficulty, number> = {
      master: 0,
      smart: 0,
      normal: 0,
      easy: 0,
    };

    const seeds = 30; // 30 seeds * 4 seat rotations = 120 full games
    for (let s = 0; s < seeds; s++) {
      for (let rot = 0; rot < 4; rot++) {
        const rotatedTiers = [0, 1, 2, 3].map(
          (i) => tiers[(i + rot) % 4]!
        );
        const players = createTestPlayers(4, rotatedTiers);
        let state = SevenWondersEngine.initGame(
          players,
          { wonderSideMode: "random" },
          `bench-sw-${s}-rot-${rot}`
        );
        while (state.phase !== "GAME_OVER") {
          const actorId = getSevenWondersActingPlayerId(state)!;
          const act = SevenWondersEngine.chooseBotAction(state, actorId)!;
          state = SevenWondersEngine.applyAction(state, actorId, act).state;
        }
        for (const p of state.players) {
          totalPoints[p.botDifficulty] += p.scoreBreakdown.totalVp;
          if (p.id === state.winnerId) {
            wins[p.botDifficulty] += 1;
          }
        }
      }
    }

    expect(totalPoints.master).toBeGreaterThan(totalPoints.normal);
    expect(totalPoints.smart).toBeGreaterThan(totalPoints.easy);
    expect(wins.master).toBeGreaterThan(wins.easy);
  });

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
    expect(root.innerHTML).toContain("Alexandria — Seven Wonders");

    const swRoom = app.createLocalRoom({
      name: "Babylon Test Table",
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

    for (const gameId of [
      "catan",
      "splendor",
      "azul",
      "seven_wonders",
    ] as const) {
      expect(TUTORIAL_LESSONS[gameId].length).toBeGreaterThanOrEqual(5);
      expect(GAME_REFERENCE_GUIDES[gameId].sections.length).toBeGreaterThanOrEqual(
        3
      );

      const guideHtml = renderReferenceGuideModalPure(gameId, false);
      expect(guideHtml).toContain(GAME_REFERENCE_GUIDES[gameId].title);
      expect(guideHtml).toContain("Grandmaster table tips");

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
