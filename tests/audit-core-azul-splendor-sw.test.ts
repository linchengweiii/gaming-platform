import { describe, expect, test } from "bun:test";
import {
  SeededRNG,
  createMatchSession,
} from "../packages/core/src/index.ts";
import { AzulEngine } from "../packages/games/azul/src/index.ts";
import { SplendorEngine } from "../packages/games/splendor/src/index.ts";
import {
  SevenWondersEngine,
  getLeftNeighborIndex,
  getRightNeighborIndex,
} from "../packages/games/seven-wonders/src/index.ts";
import { renderAzulActionDock } from "../apps/web/src/azul-view.ts";
import { renderSevenWondersBoardView } from "../apps/web/src/seven-wonders-view.ts";

const P2 = [
  { id: "p1", name: "Alice", color: "#e11d48", isBot: false, botDifficulty: "normal" as const },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: true, botDifficulty: "master" as const },
];

const P3 = [
  ...P2,
  { id: "p3", name: "Carol", color: "#16a34a", isBot: true, botDifficulty: "master" as const },
];

describe("Audit Regressions: Core, Azul, Splendor, and 7 Wonders", () => {
  test("Core: jumpToStep rejects NaN/fractional steps and SeededRNG.fromState preserves zero wrap-around", () => {
    const initial = AzulEngine.initGame(P2, {}, "core-audit-1");
    const session = createMatchSession(AzulEngine, initial);
    const legal = AzulEngine.getLegalActions(initial, "p1");
    session.dispatch("p1", legal[0]!);

    expect(() => session.jumpToStep(NaN)).toThrow();
    expect(() => session.jumpToStep(0.5)).toThrow();
    expect(session.getState()).toBeDefined();

    // Mulberry32 state 0x92d4860b wraps to 0 on next step
    const rng = SeededRNG.fromState(0x92d4860b);
    rng.nextFloat();
    expect(rng.getState()).toBe(0);
    const resumed = SeededRNG.fromState(rng.getState());
    expect(resumed.getState()).toBe(0);
    expect(rng.nextFloat()).toBe(resumed.nextFloat());
    expect(rng.nextFloat()).toBe(resumed.nextFloat());
  });

  test("Azul: validates action fields/indices, updates completedCols/completedColorSets mid-game, and shows exact 1st-marker floor penalty", () => {
    const state = AzulEngine.initGame(P2, {}, "azul-audit-1");
    const color = state.factories[0]![0]!;

    expect(() =>
      AzulEngine.applyAction(state, "p1", {
        type: "DRAFT_TILES",
        source: { kind: "factory", factoryIndex: 0 },
        color,
        targetLine: 5 as any,
      })
    ).toThrow();
    expect(() =>
      AzulEngine.applyAction(state, "p1", {
        type: "DRAFT_TILES",
        source: { kind: "factory", factoryIndex: "0" as any },
        color,
        targetLine: "floor",
      })
    ).toThrow();
    expect(() =>
      AzulEngine.applyAction(state, "p1", {
        type: "DRAFT_TILES",
        source: { kind: "factory", factoryIndex: 0 },
        color,
        targetLine: "0" as any,
      })
    ).toThrow();
    expect(() =>
      AzulEngine.applyAction(state, "p1", {
        type: "BOGUS" as any,
        source: { kind: "bogus" as any },
        color,
        targetLine: "floor",
      })
    ).toThrow();

    // Complete column 0 via wall-tiling without completing any full row
    const colWall = state.players[0]!.wall.map((row, r) =>
      row.map((cell, c) =>
        c === 0 && r > 0 ? (["blue", "black", "red", "yellow", "teal"][r] as any) : cell
      )
    ) as typeof state.players[0]["wall"];
    const preTileState = {
      ...state,
      factories: state.factories.map((f, i) => (i === 0 ? ["blue" as const] : [])),
      centerPool: [],
      players: state.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              wall: colWall,
              floorLine: ["red" as const, "red" as const],
            }
          : p
      ),
    };
    const afterRound = AzulEngine.applyAction(preTileState, "p1", {
      type: "DRAFT_TILES",
      source: { kind: "factory", factoryIndex: 0 },
      color: "blue",
      targetLine: 0,
    }).state;
    expect(afterRound.phase).toBe("FACTORY_OFFER");
    expect(afterRound.players[0]!.completedCols).toBe(1);

    // Action dock shows -2 floor when 2 tokens already occupy floorLine
    const dockHtml = renderAzulActionDock(
      { ...preTileState, centerPool: ["blue"], centerHasFirstPlayerMarker: true },
      preTileState.players[0]!,
      { source: { kind: "center" }, color: "blue" }
    );
    expect(dockHtml).toContain("(+ 1st marker, -2 floor)");
  });

  test("Splendor: guards PASS_TURN/GAME_OVER, rejects NaN/fractional returns, dual reserve args, redacted purchases, and negative gold invariants", () => {
    const state = SplendorEngine.initGame(P2, { targetPoints: 15 }, "splendor-audit-1");

    // Cannot PASS_TURN when legal actions exist
    expect(() =>
      SplendorEngine.applyAction(state, "p1", { type: "PASS_TURN" })
    ).toThrow();

    // Cannot pass invalid/negative/gold gem takes
    expect(() =>
      SplendorEngine.applyAction(state, "p1", {
        type: "TAKE_GEMS",
        gems: { emerald: -1, diamond: 1, sapphire: 1 } as any,
      })
    ).toThrow();
    expect(() =>
      SplendorEngine.applyAction(state, "p1", {
        type: "TAKE_GEMS",
        gems: { gold: 1 } as any,
      })
    ).toThrow();

    // Cannot supply both cardId and deckTier to RESERVE_CARD
    expect(() =>
      SplendorEngine.applyAction(state, "p1", {
        type: "RESERVE_CARD",
        cardId: state.market[1][0]!.id,
        deckTier: 1,
      })
    ).toThrow();

    // RETURN_TOKENS rejects PASS_TURN, NaN, and fractional .5
    const returnPhaseState = {
      ...state,
      phase: "RETURN_TOKENS" as const,
      bank: { ...state.bank, emerald: 0, diamond: 0, sapphire: 0 },
      players: state.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              tokens: {
                emerald: 4,
                diamond: 4,
                sapphire: 3,
                onyx: 0,
                ruby: 0,
                gold: 0,
              },
            }
          : p
      ),
    };
    expect(() =>
      SplendorEngine.applyAction(returnPhaseState, "p1", { type: "PASS_TURN" })
    ).toThrow();
    expect(() =>
      SplendorEngine.applyAction(returnPhaseState, "p1", {
        type: "RETURN_TOKENS",
        tokens: { emerald: NaN },
      })
    ).toThrow();
    expect(() =>
      SplendorEngine.applyAction(returnPhaseState, "p1", {
        type: "RETURN_TOKENS",
        tokens: { emerald: 0.5, diamond: 0.5 },
      })
    ).toThrow();

    // GAME_OVER rejects actions
    const overState = { ...state, phase: "GAME_OVER" as const, winnerId: "p1" };
    expect(() =>
      SplendorEngine.applyAction(overState, "p1", { type: "PASS_TURN" })
    ).toThrow();

    // Blind reserve redaction does not leak as a 0-cost purchasable card
    const afterBlind = SplendorEngine.applyAction(state, "p1", {
      type: "RESERVE_CARD",
      deckTier: 1,
    }).state;
    const redactedForP2 = SplendorEngine.getPlayerView(afterBlind, "p2");
    const redactedAsP1Turn = { ...redactedForP2, activePlayerIndex: 0 };
    const p1LegalOnRedacted = SplendorEngine.getLegalActions(redactedAsP1Turn, "p1");
    expect(
      p1LegalOnRedacted.some(
        (a) => a.type === "PURCHASE_CARD" && a.cardId.startsWith("hidden-reserve-")
      )
    ).toBe(false);
    expect(() =>
      SplendorEngine.applyAction(redactedAsP1Turn, "p1", {
        type: "PURCHASE_CARD",
        cardId: redactedForP2.players[0]!.reservedCards[0]!.id,
      })
    ).toThrow();

    // Negative gold caught by invariants
    const badGold = {
      ...state,
      bank: { ...state.bank, gold: 6 },
      players: state.players.map((p, idx) =>
        idx === 0 ? { ...p, tokens: { ...p.tokens, gold: -1 } } : p
      ),
    };
    expect(SplendorEngine.checkInvariants(badGold).valid).toBe(false);
  });

  test("7 Wonders: passes clockwise East->You->West, hides Halikarnassus in Pass-and-Play privacy mode, and fixes waiting/duplicate/scorepad UI", () => {
    let state = SevenWondersEngine.initGame(P3, {}, "sw-audit-1");
    const p0HandR1 = state.players[0]!.hand.map((c) => c.id);
    const p1HandR1 = state.players[1]!.hand.map((c) => c.id);
    const p2HandR1 = state.players[2]!.hand.map((c) => c.id);

    // Every player discards their first card simultaneously
    for (const p of state.players) {
      const cardId = p.hand[0]!.id;
      state = SevenWondersEngine.applyAction(state, p.id, {
        type: "SELECT_DRAFT_ACTION",
        kind: "discard",
        cardId,
      }).state;
    }

    // Age I clockwise: player i passes remaining 6 cards to LEFT/West neighbor (i - 1 + n) % n
    // So player 0 receives from right/East neighbor (1), player 2 receives from 0, player 1 receives from 2
    const leftOf0 = getLeftNeighborIndex(0, 3); // 2
    const rightOf0 = getRightNeighborIndex(0, 3); // 1
    expect(state.players[leftOf0]!.hand.map((c) => c.id)).toEqual(p0HandR1.slice(1));
    expect(state.players[0]!.hand.map((c) => c.id)).toEqual(p1HandR1.slice(1));
    expect(state.players[rightOf0]!.hand.map((c) => c.id)).toEqual(p2HandR1.slice(1));

    // Pass-and-Play privacy mode hides Halikarnassus picker and shows #btn-reveal-hand
    const haliState = {
      ...state,
      phase: "HALIKARNASSUS_PICK" as const,
      halikarnassusQueue: ["p1"],
    };
    const hiddenHtml = renderSevenWondersBoardView(
      haliState,
      "p1",
      null,
      [],
      null,
      true
    );
    expect(hiddenHtml).toContain("btn-reveal-hand");
    expect(hiddenHtml).not.toContain("data-sw-skip-discard");

    // Non-Babylon waiting player during SEVENTH_CARD_PLAY sees waiting banner (not Babylon prompt)
    const seventhState = {
      ...state,
      phase: "SEVENTH_CARD_PLAY" as const,
      seventhCardQueue: ["p2"],
    };
    const waitingHtml = renderSevenWondersBoardView(
      seventhState,
      "p1",
      null,
      [],
      null,
      false
    );
    expect(waitingHtml).toContain("Waiting for");
    expect(waitingHtml).not.toContain("Babylon bonus 7th card");

    // Waiting player during opponent HALIKARNASSUS_PICK does not get false "Locked" badges
    const oppHaliState = {
      ...state,
      phase: "HALIKARNASSUS_PICK" as const,
      halikarnassusQueue: ["p2"],
    };
    const oppHaliHtml = renderSevenWondersBoardView(
      oppHaliState,
      "p1",
      null,
      [],
      null,
      false
    );
    expect(oppHaliHtml).not.toContain('<span class="ga-chip">Locked</span>');

    // Scorepad renders * on Science column and footnote when Olympia B3 copies Scientists Guild
    const sciCopiedEndState = {
      ...state,
      phase: "GAME_OVER" as const,
      winnerId: "p1",
      players: state.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              scoreBreakdown: {
                ...p.scoreBreakdown,
                scientificVp: 10,
                guildVp: 0,
                totalVp: 25,
                copiedGuildName: "Scientists Guild",
              },
            }
          : p
      ),
    };
    const endHtml = renderSevenWondersBoardView(
      sciCopiedEndState,
      "p1",
      null,
      [],
      null,
      false
    );
    expect(endHtml).toContain("10 *");
    expect(endHtml).toContain("copied Scientists Guild via Olympia B3");
  });
});
