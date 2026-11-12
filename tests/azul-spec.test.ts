import { describe, expect, test } from "bun:test";
import { MatchSession, type PlayerDescriptor } from "@gaming-platform/core";
import {
  AZUL_WALL_PATTERN,
  AzulEngine,
  canPlaceColorOnPatternLine,
  getAzulActingPlayerId,
  getWallColumnForColor,
  scoreWallPlacement,
} from "@gaming-platform/azul";

const PLAYERS_2: PlayerDescriptor[] = [
  { id: "p1", name: "Artisan 1", color: "#e63946", isBot: true },
  { id: "p2", name: "Artisan 2", color: "#2563eb", isBot: true },
];

const PLAYERS_4: PlayerDescriptor[] = [
  ...PLAYERS_2,
  { id: "p3", name: "Artisan 3", color: "#f59e0b", isBot: true },
  { id: "p4", name: "Artisan 4", color: "#10b981", isBot: true },
];

describe("@gaming-platform/azul - Executable Specification Suite", () => {
  test("SPEC 1: 100-tile conservation and 2P/3P/4P Factory count scaling (5, 7, 9)", () => {
    const s2 = AzulEngine.initGame(PLAYERS_2, {}, "azul-2p");
    expect(s2.factories.length).toBe(5);
    expect(s2.factories.every((f) => f.length === 4)).toBe(true);
    expect(s2.bag.length).toBe(100 - 20);
    expect(AzulEngine.checkInvariants(s2).valid).toBe(true);

    const s3 = AzulEngine.initGame(PLAYERS_4.slice(0, 3), {}, "azul-3p");
    expect(s3.factories.length).toBe(7);
    expect(s3.bag.length).toBe(100 - 28);

    const s4 = AzulEngine.initGame(PLAYERS_4, {}, "azul-4p");
    expect(s4.factories.length).toBe(9);
    expect(s4.bag.length).toBe(100 - 36);
  });

  test("SPEC 2: Drafting from Factory moves remainder to Center; first Center draft claims 1st Player marker", () => {
    let state = AzulEngine.initGame(PLAYERS_2, {}, "azul-draft");
    // Return original factory[0] tiles to bag and draw ["blue", "blue", "red", "yellow"] from bag to preserve 100-tile conservation
    state.bag.push(...state.factories[0]!);
    const desired = ["blue", "blue", "red", "yellow"] as const;
    for (const c of desired) {
      const idx = state.bag.indexOf(c);
      state.bag.splice(idx, 1);
    }
    state.factories[0] = [...desired];

    // p1 drafts blue from Factory 0 onto Pattern Row 1 (capacity 2)
    state = AzulEngine.applyAction(state, "p1", {
      type: "DRAFT_TILES",
      source: { kind: "factory", factoryIndex: 0 },
      color: "blue",
      targetLine: 1,
    }).state;

    expect(state.factories[0]!.length).toBe(0);
    expect(state.centerPool).toEqual(["red", "yellow"]);
    expect(state.players[0]!.patternLines[1]).toEqual({
      capacity: 2,
      color: "blue",
      count: 2,
    });

    // p2 drafts red from Center Pool -> receives First Player marker on Floor Line!
    state = AzulEngine.applyAction(state, "p2", {
      type: "DRAFT_TILES",
      source: { kind: "center" },
      color: "red",
      targetLine: 0,
    }).state;

    expect(state.centerHasFirstPlayerMarker).toBe(false);
    expect(state.nextRoundStartPlayerIndex).toBe(1);
    expect(state.players[1]!.floorLine).toEqual(["first_player"]);
    expect(AzulEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 3: Pattern line rejects mixed colors or colors already on that Wall row, and overflows excess to Floor", () => {
    let state = AzulEngine.initGame(PLAYERS_2, {}, "azul-overflow");
    state.factories[0] = ["teal", "teal", "teal", "blue"];

    // p1 drafts 3 teal onto Pattern Row 1 (capacity 2) -> 2 placed on row 1, 1 overflows to Floor!
    state = AzulEngine.applyAction(state, "p1", {
      type: "DRAFT_TILES",
      source: { kind: "factory", factoryIndex: 0 },
      color: "teal",
      targetLine: 1,
    }).state;

    expect(state.players[0]!.patternLines[1].count).toBe(2);
    expect(state.players[0]!.floorLine).toEqual(["teal"]);

    // If p1's wall row 2 already has "black", p1 cannot place "black" on pattern line 2
    const blackCol = getWallColumnForColor(2, "black");
    state.players[0]!.wall[2]![blackCol] = "black";
    expect(canPlaceColorOnPatternLine(state.players[0]!, 2, "black")).toBe(false);
  });

  test("SPEC 4: Wall-tiling contiguous horizontal + vertical chain scoring math", () => {
    const wall = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null)) as any;

    // 1. Isolated tile at (2, 2) -> 1 point
    wall[2][2] = AZUL_WALL_PATTERN[2]![2];
    expect(scoreWallPlacement(wall, 2, 2)).toBe(1);

    // 2. Horizontal neighbor at (2, 3) -> chain of 2 horizontally = 2 points
    wall[2][3] = AZUL_WALL_PATTERN[2]![3];
    expect(scoreWallPlacement(wall, 2, 3)).toBe(2);

    // 3. Vertical neighbor at (1, 3) -> vertical chain of 2 = 2 points
    wall[1][3] = AZUL_WALL_PATTERN[1]![3];
    expect(scoreWallPlacement(wall, 1, 3)).toBe(2);

    // 4. Tile at (1, 2) connects horizontally with (1, 3) [len 2] AND vertically with (2, 2) [len 2] -> 2 + 2 = 4 points!
    wall[1][2] = AZUL_WALL_PATTERN[1]![2];
    expect(scoreWallPlacement(wall, 1, 2)).toBe(4);
  });

  test("SPEC 5: Full-game bot simulations complete cleanly for 2, 3, and 4 players with valid invariants", () => {
    for (const count of [2, 3, 4]) {
      const players = PLAYERS_4.slice(0, count);
      const init = AzulEngine.initGame(players, {}, `azul-sim-${count}`);
      const session = new MatchSession(AzulEngine, init, true);

      let steps = 0;
      while (session.getState().phase !== "GAME_OVER" && steps < 600) {
        const s = session.getState();
        const actor = getAzulActingPlayerId(s)!;
        const act = AzulEngine.chooseBotAction(s, actor)!;
        session.dispatch(actor, act);
        steps++;
      }

      const final = session.getState();
      expect(final.phase).toBe("GAME_OVER");
      expect(final.winnerId).not.toBeNull();
      expect(AzulEngine.checkInvariants(final).valid).toBe(true);
    }
  });
});
