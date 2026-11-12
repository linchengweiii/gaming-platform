import { describe, expect, test } from "bun:test";
import { MatchSession, type PlayerDescriptor } from "@gaming-platform/core";
import {
  GEM_COLORS,
  SPLENDOR_CARDS,
  SplendorEngine,
  getSplendorActingPlayerId,
  totalTokens,
} from "@gaming-platform/splendor";

const PLAYERS_2: PlayerDescriptor[] = [
  { id: "p1", name: "Merchant 1", color: "#e63946", isBot: true },
  { id: "p2", name: "Merchant 2", color: "#2563eb", isBot: true },
];

const PLAYERS_4: PlayerDescriptor[] = [
  ...PLAYERS_2,
  { id: "p3", name: "Merchant 3", color: "#f59e0b", isBot: true },
  { id: "p4", name: "Merchant 4", color: "#10b981", isBot: true },
];

describe("@gaming-platform/splendor - Executable Specification Suite", () => {
  test("SPEC 1: 90-card deck composition and 2P/3P/4P gem & noble scaling", () => {
    expect(SPLENDOR_CARDS.length).toBe(90);
    expect(SPLENDOR_CARDS.filter((c) => c.tier === 1).length).toBe(40);
    expect(SPLENDOR_CARDS.filter((c) => c.tier === 2).length).toBe(30);
    expect(SPLENDOR_CARDS.filter((c) => c.tier === 3).length).toBe(20);

    const s2 = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-2p");
    expect(s2.bank.emerald).toBe(4);
    expect(s2.bank.gold).toBe(5);
    expect(s2.nobles.length).toBe(3);

    const s3 = SplendorEngine.initGame(PLAYERS_4.slice(0, 3), {}, "splendor-3p");
    expect(s3.bank.emerald).toBe(5);
    expect(s3.nobles.length).toBe(4);

    const s4 = SplendorEngine.initGame(PLAYERS_4, {}, "splendor-4p");
    expect(s4.bank.emerald).toBe(7);
    expect(s4.nobles.length).toBe(5);
    expect(s4.market[1].length).toBe(4);
    expect(s4.market[2].length).toBe(4);
    expect(s4.market[3].length).toBe(4);
  });

  test("SPEC 2: Taking 3 distinct gems vs 2 of the same gem (requires >= 4 in bank)", () => {
    let state = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-gems");
    // In 2P, bank starts with 4 of each gem -> taking 2 emerald is legal!
    state = SplendorEngine.applyAction(state, "p1", {
      type: "TAKE_GEMS",
      gems: { emerald: 2 },
    }).state;

    expect(state.players[0]!.tokens.emerald).toBe(2);
    expect(state.bank.emerald).toBe(2);

    // Now bank only has 2 emerald (< 4), so p2 CANNOT take 2 emerald!
    expect(() =>
      SplendorEngine.applyAction(state, "p2", {
        type: "TAKE_GEMS",
        gems: { emerald: 2 },
      })
    ).toThrow();

    // p2 CAN take 3 different gems
    state = SplendorEngine.applyAction(state, "p2", {
      type: "TAKE_GEMS",
      gems: { emerald: 1, diamond: 1, sapphire: 1 },
    }).state;
    expect(state.players[1]!.tokens.emerald).toBe(1);
    expect(state.players[1]!.tokens.diamond).toBe(1);
    expect(state.players[1]!.tokens.sapphire).toBe(1);
    expect(SplendorEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 3: Reserving a card grants 1 Gold joker, refills market, and enforces max 3 reserved cards", () => {
    let state = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-reserve");
    for (let i = 0; i < 3; i++) {
      const targetCard = state.market[1][0]!;
      state = SplendorEngine.applyAction(state, "p1", {
        type: "RESERVE_CARD",
        cardId: targetCard.id,
      }).state;
      // p2 takes 3 gems to pass turn back to p1
      state = SplendorEngine.applyAction(
        state,
        "p2",
        SplendorEngine.chooseBotAction(state, "p2")!
      ).state;
    }

    expect(state.players[0]!.reservedCards.length).toBe(3);
    expect(state.players[0]!.tokens.gold).toBe(3);
    expect(state.market[1].length).toBe(4); // refilled from deck

    // p1 cannot reserve a 4th card!
    const p1Legal = SplendorEngine.getLegalActions(state, "p1");
    expect(p1Legal.some((a) => a.type === "RESERVE_CARD")).toBe(false);
  });

  test("SPEC 4: Exceeding 10 tokens triggers RETURN_TOKENS phase before ending turn", () => {
    let state = SplendorEngine.initGame(PLAYERS_4, {}, "splendor-10-limit");
    // Give p1 9 tokens from bank
    state.bank.emerald -= 3;
    state.bank.diamond -= 3;
    state.bank.sapphire -= 3;
    state.players[0]!.tokens.emerald = 3;
    state.players[0]!.tokens.diamond = 3;
    state.players[0]!.tokens.sapphire = 3;

    // p1 takes 3 more tokens -> now holds 12 tokens -> must enter RETURN_TOKENS!
    state = SplendorEngine.applyAction(state, "p1", {
      type: "TAKE_GEMS",
      gems: { emerald: 1, onyx: 1, ruby: 1 },
    }).state;

    expect(state.phase).toBe("RETURN_TOKENS");
    expect(totalTokens(state.players[0]!.tokens)).toBe(12);

    state = SplendorEngine.applyAction(state, "p1", {
      type: "RETURN_TOKENS",
      tokens: { emerald: 1, diamond: 1 },
    }).state;

    expect(totalTokens(state.players[0]!.tokens)).toBe(10);
    expect(state.phase).toBe("MAIN_ACTION");
    expect(state.activePlayerIndex).toBe(1);
    expect(SplendorEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 5: Purchasing a card applies permanent gem bonuses first, then color tokens, then Gold jokers", () => {
    let state = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-purchase");
    const targetCard = {
      id: "custom-test-card",
      tier: 2 as const,
      bonus: "ruby" as const,
      points: 2,
      cost: { emerald: 3, diamond: 2, sapphire: 0, onyx: 0, ruby: 0 },
    };
    state.market[2][0] = targetCard;

    // Give p1 2 permanent emerald bonuses, 2 diamond tokens, and 1 gold joker
    state.players[0]!.bonuses.emerald = 2;
    state.bank.diamond -= 2;
    state.players[0]!.tokens.diamond = 2;
    state.bank.gold -= 1;
    state.players[0]!.tokens.gold = 1;

    state = SplendorEngine.applyAction(state, "p1", {
      type: "PURCHASE_CARD",
      cardId: targetCard.id,
    }).state;

    expect(state.players[0]!.points).toBe(2);
    expect(state.players[0]!.bonuses.ruby).toBe(1);
    expect(state.players[0]!.tokens.diamond).toBe(0);
    expect(state.players[0]!.tokens.gold).toBe(0);
    expect(SplendorEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 6: Qualifying for multiple Nobles triggers SELECT_NOBLE (max 1 Noble per turn)", () => {
    let state = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-nobles");
    state.nobles = [
      { id: "n1", name: "Noble A", points: 3, requirements: { emerald: 3, ruby: 3 } },
      { id: "n2", name: "Noble B", points: 3, requirements: { emerald: 3, sapphire: 3 } },
    ];

    state.players[0]!.bonuses = {
      emerald: 3,
      diamond: 0,
      sapphire: 3,
      onyx: 0,
      ruby: 3,
    };

    // p1 takes gems -> qualifies for BOTH n1 and n2 -> enters SELECT_NOBLE!
    state = SplendorEngine.applyAction(state, "p1", {
      type: "TAKE_GEMS",
      gems: { emerald: 1, diamond: 1, sapphire: 1 },
    }).state;

    expect(state.phase).toBe("SELECT_NOBLE");
    expect(state.eligibleNobleIds).toEqual(["n1", "n2"]);

    state = SplendorEngine.applyAction(state, "p1", {
      type: "SELECT_NOBLE",
      nobleId: "n2",
    }).state;

    expect(state.players[0]!.nobles.length).toBe(1);
    expect(state.players[0]!.points).toBe(3);
    expect(state.nobles.length).toBe(1); // n1 remains on board until a future turn
    expect(state.phase).toBe("MAIN_ACTION");
    expect(state.activePlayerIndex).toBe(1);
  });

  test("SPEC 7: Reaching 15 Prestige triggers final round and breaks ties by fewest purchased cards", () => {
    let state = SplendorEngine.initGame(PLAYERS_2, {}, "splendor-tiebreak");
    // Give p1 15 points across 4 cards, and p2 15 points across 3 cards
    const makeDummyCard = (id: string, pts: number) => ({
      id,
      tier: 3 as const,
      bonus: "emerald" as const,
      points: pts,
      cost: { emerald: 0, diamond: 0, sapphire: 0, onyx: 0, ruby: 0 },
    });

    state.players[0]!.purchasedCards = [
      makeDummyCard("c1", 5),
      makeDummyCard("c2", 4),
      makeDummyCard("c3", 3),
      makeDummyCard("c4", 3),
    ];
    state.players[0]!.points = 15;

    state.players[1]!.purchasedCards = [
      makeDummyCard("d1", 5),
      makeDummyCard("d2", 5),
      makeDummyCard("d3", 5),
    ];
    state.players[1]!.points = 15;

    // p1 takes turn -> triggers finalRoundTriggered, but game does NOT end until p2 completes the round!
    state = SplendorEngine.applyAction(state, "p1", {
      type: "TAKE_GEMS",
      gems: { emerald: 1, diamond: 1, sapphire: 1 },
    }).state;
    expect(state.finalRoundTriggered).toBe(true);
    expect(state.phase).toBe("MAIN_ACTION");
    expect(state.activePlayerIndex).toBe(1);

    // p2 completes the round -> both tied at 15 pts, p2 wins with 3 cards vs p1's 4 cards!
    state = SplendorEngine.applyAction(state, "p2", {
      type: "TAKE_GEMS",
      gems: { emerald: 1, diamond: 1, sapphire: 1 },
    }).state;
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerId).toBe("p2");
  });

  test("SPEC 8: Full-game bot simulations complete cleanly for 2, 3, and 4 players with valid invariants", () => {
    for (const count of [2, 3, 4]) {
      const players = PLAYERS_4.slice(0, count);
      const init = SplendorEngine.initGame(players, {}, `splendor-sim-${count}`);
      const session = new MatchSession(SplendorEngine, init, true);

      let steps = 0;
      while (session.getState().phase !== "GAME_OVER" && steps < 500) {
        const s = session.getState();
        const actor = getSplendorActingPlayerId(s)!;
        const act = SplendorEngine.chooseBotAction(s, actor)!;
        session.dispatch(actor, act);
        steps++;
      }

      const final = session.getState();
      expect(final.phase).toBe("GAME_OVER");
      expect(final.winnerId).not.toBeNull();
      const winner = final.players.find((p) => p.id === final.winnerId)!;
      expect(winner.points).toBeGreaterThanOrEqual(15);
      expect(GEM_COLORS.every((c) => final.bank[c] >= 0)).toBe(true);
    }
  });
});
