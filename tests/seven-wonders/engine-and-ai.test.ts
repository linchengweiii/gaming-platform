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
});
