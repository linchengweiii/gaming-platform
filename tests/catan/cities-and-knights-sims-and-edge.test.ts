import { describe, expect, test } from "bun:test";
import { type PlayerDescriptor, axialDistance } from "@gaming-platform/core";
import {
  COMMODITIES,
  CatanEngine,
  RESOURCES,
  SCENARIO_CATALOG,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import { renderCatanBoardSvg } from "../../apps/web/src/catan-graphics.ts";
import {
  FOUR_PLAYERS,
  SIX_PLAYERS,
  completeSnakeDraftSetup,
  grantCardFromDeckForTest,
  runSimulatedMatch,
} from "./helpers.ts";

describe("@gaming-platform/catan - Cities & Knights Simulations & 5–6P Seafarers/C&K Edge Cases", () => {
  test("Full-game deterministic Cities & Knights bot simulations complete cleanly across 4P, 5-6P, and Seafarers", () => {
    const configs = [
      {
        label: "cities_and_knights-4p",
        count: 4,
        config: { scenarioId: "cities_and_knights" as const },
      },
      {
        label: "big_island_ck-5p",
        count: 5,
        config: {
          scenarioId: "big_island_5_6" as const,
          enableCitiesAndKnights: true,
        },
      },
      {
        label: "seafarers_ck-4p",
        count: 4,
        config: {
          scenarioId: "seafarers_new_shores" as const,
          enableCitiesAndKnights: true,
          enableHarbormaster: true,
        },
      },
    ];

    const difficulties = ["master", "smart", "normal", "easy", "smart"] as const;

    for (const item of configs) {
      const players: PlayerDescriptor[] = Array.from(
        { length: item.count },
        (_, i) => ({
          id: `p${i + 1}`,
          name: `CKBot ${i + 1}`,
          color: "",
          isBot: true,
          botDifficulty: difficulties[i % difficulties.length],
        })
      );

      const final = runSimulatedMatch(
        players,
        item.config,
        `ck-fuzz-${item.label}-2026`,
        5000
      );
      expect(final.phase).toBe("GAME_OVER");
      expect(final.winnerId).not.toBeNull();
      expect(
        computePlayerVictoryPoints(final, final.winnerId!, false)
      ).toBeGreaterThanOrEqual(final.config.targetVictoryPoints);
      expect(CatanEngine.checkInvariants(final).valid).toBe(true);
    }
  });

  test("supports 5–6P scenario presets AND auto-upgrades 3–4P scenarios when 5–6 players are seated", () => {
    // 1. All Catan scenarios allow up to 6 players
    for (const sc of Object.values(SCENARIO_CATALOG)) {
      expect(sc.maxPlayers).toBe(6);
    }

    // 2. Cities & Knights 5–6P (both explicit preset & 6P auto-upgrade on cities_and_knights)
    for (const scenarioId of [
      "cities_and_knights_5_6",
      "cities_and_knights",
    ] as const) {
      const ck6 = CatanEngine.initGame(
        SIX_PLAYERS,
        { scenarioId },
        `ck6-init-${scenarioId}`
      );
      expect(Object.keys(ck6.hexes)).toHaveLength(30);
      expect(ck6.harbors).toHaveLength(11);
      expect(ck6.config.enableCitiesAndKnights).toBe(true);
      expect(ck6.config.enable56PlayerExtension).toBe(true);
      expect(ck6.config.enableSpecialBuildingPhase).toBe(true);
      expect(ck6.config.targetVictoryPoints).toBe(13);
      for (const r of RESOURCES) expect(ck6.bank[r]).toBe(24);
      for (const c of COMMODITIES) expect(ck6.commodityBank[c]).toBe(18);
      const afterSetup = completeSnakeDraftSetup(ck6).state;
      expect(Object.keys(afterSetup.buildings)).toHaveLength(12);
      expect(
        Object.values(afterSetup.buildings).filter((b) => b.type === "city")
      ).toHaveLength(6);
      expect(CatanEngine.checkInvariants(afterSetup).valid).toBe(true);
    }

    // 3. Seafarers 5–6P maps: strict sea separation (axialDistance >= 2 between distinct islands) & SVG rendering
    const marine56Cases = [
      {
        scenarioId: "seafarers_new_shores_5_6" as const,
        autoFrom: "seafarers_new_shores" as const,
        expectedHexCount: 51,
        expectedIslandIds: [1, 2, 3, 4],
        expectedFogCount: 0,
      },
      {
        scenarioId: "seafarers_six_islands_5_6" as const,
        autoFrom: "seafarers_four_islands" as const,
        expectedHexCount: 58,
        expectedIslandIds: [1, 2, 3, 4, 5, 6],
        expectedFogCount: 0,
      },
      {
        scenarioId: "seafarers_fog_islands_5_6" as const,
        autoFrom: "seafarers_fog_islands" as const,
        expectedHexCount: 58,
        expectedIslandIds: [1, 2, 3],
        expectedFogCount: 11,
      },
    ];

    for (const item of marine56Cases) {
      for (const scId of [item.scenarioId, item.autoFrom]) {
        const s0 = CatanEngine.initGame(
          SIX_PLAYERS,
          { scenarioId: scId },
          `marine56-${scId}`
        );
        const tiles = Object.values(s0.hexes);
        expect(tiles).toHaveLength(item.expectedHexCount);
        expect(s0.config.enableSeafarers).toBe(true);
        expect(s0.config.enable56PlayerExtension).toBe(true);
        expect(s0.config.enableSpecialBuildingPhase).toBe(true);
        expect(s0.config.targetVictoryPoints).toBe(12);
        expect(s0.pirateHexId).not.toBeNull();
        expect(s0.hexes[s0.pirateHexId!]?.terrain).toBe("sea");
        expect(s0.fogPool).toHaveLength(item.expectedFogCount);
        for (const r of RESOURCES) expect(s0.bank[r]).toBe(24);

        const nonSeaTiles = tiles.filter((t) => t.islandId > 0);
        const distinctIslands = Array.from(
          new Set(nonSeaTiles.map((t) => t.islandId))
        ).sort((a, b) => a - b);
        expect(distinctIslands).toEqual(item.expectedIslandIds);

        // Verify no two distinct islands touch at an edge or vertex (axialDistance >= 2)
        for (let i = 0; i < nonSeaTiles.length; i++) {
          for (let j = i + 1; j < nonSeaTiles.length; j++) {
            const a = nonSeaTiles[i]!;
            const b = nonSeaTiles[j]!;
            if (a.islandId !== b.islandId) {
              expect(axialDistance(a, b)).toBeGreaterThanOrEqual(2);
            }
          }
        }

        // Complete 6-player snake draft (12 initial buildings + 12 roads/ships) & render SVG
        const { state: s1 } = completeSnakeDraftSetup(s0);
        expect(Object.keys(s1.buildings)).toHaveLength(12);
        expect(Object.keys(s1.edges)).toHaveLength(12);
        expect(CatanEngine.checkInvariants(s1).valid).toBe(true);

        const svg = renderCatanBoardSvg(s1, getNextActingPlayerId(s1), {
          buildMode: null,
          setupEdgeKind: "road",
          robberOrPirateMode: "robber",
          selectedMoveFromEdgeId: null,
        });
        expect(svg).toContain('class="ocean-frame-hex"');
        expect(svg).toContain('class="harbor-marker"');
      }
    }
  });

  test("Cities & Knights 6-player Special Building Phase allows City Improvements, Knights, and City Walls between turns", () => {
    let state = completeSnakeDraftSetup(
      CatanEngine.initGame(
        SIX_PLAYERS,
        { scenarioId: "cities_and_knights_5_6", startingPlayerIndex: 0 },
        "ck6-special-build-seed"
      )
    ).state;

    // Advance p1 through roll into MAIN_PHASE and end turn -> p2 enters SPECIAL_BUILDING
    const rollAct = CatanEngine.getLegalActions(state, "p1").find(
      (a) => a.type === "ROLL_DICE"
    )!;
    state = CatanEngine.applyAction(state, "p1", rollAct).state;
    while (state.phase !== "MAIN_PHASE") {
      const actor = getNextActingPlayerId(state)!;
      const move = CatanEngine.chooseBotAction(state, actor)!;
      state = CatanEngine.applyAction(state, actor, move).state;
    }

    // Grant p2 commodities & resources from the bank so conservation holds
    const p2 = state.players[1]!;
    p2.commodities.cloth += 1;
    state.commodityBank.cloth -= 1;
    p2.resources.wool += 1;
    state.bank.wool -= 1;
    p2.resources.ore += 1;
    state.bank.ore -= 1;
    p2.resources.grain += 1;
    state.bank.grain -= 1;
    p2.resources.brick += 2;
    state.bank.brick -= 2;

    state = CatanEngine.applyAction(state, "p1", { type: "END_TURN" }).state;
    expect(state.phase).toBe("SPECIAL_BUILDING");
    expect(getNextActingPlayerId(state)).toBe("p2");

    const sbLegal = CatanEngine.getLegalActions(state, "p2");
    const upgradeTrade = sbLegal.find(
      (a) =>
        a.type === "UPGRADE_CITY_IMPROVEMENT" && a.discipline === "trade"
    );
    const buildKnight = sbLegal.find((a) => a.type === "BUILD_KNIGHT");
    const buildWall = sbLegal.find((a) => a.type === "BUILD_CITY_WALL");
    expect(upgradeTrade).toBeDefined();
    expect(buildKnight).toBeDefined();
    expect(buildWall).toBeDefined();

    state = CatanEngine.applyAction(state, "p2", upgradeTrade!).state;
    expect(state.players[1]!.cityImprovements.trade).toBe(1);

    const buildKnight2 = CatanEngine.getLegalActions(state, "p2").find(
      (a) => a.type === "BUILD_KNIGHT"
    )!;
    state = CatanEngine.applyAction(state, "p2", buildKnight2).state;

    const activateKnight = CatanEngine.getLegalActions(state, "p2").find(
      (a) => a.type === "ACTIVATE_KNIGHT"
    )!;
    state = CatanEngine.applyAction(state, "p2", activateKnight).state;

    const buildWall2 = CatanEngine.getLegalActions(state, "p2").find(
      (a) => a.type === "BUILD_CITY_WALL"
    )!;
    state = CatanEngine.applyAction(state, "p2", buildWall2).state;
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);

    // Finish Special Building Phase across p2..p6 -> advances cleanly to p2's Turn 2 PRE_ROLL
    while (state.phase === "SPECIAL_BUILDING") {
      const sbActor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(state, sbActor, {
        type: "END_SPECIAL_BUILD",
      }).state;
    }
    expect(state.phase).toBe("PRE_ROLL");
    expect(getNextActingPlayerId(state)).toBe("p2");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  const sixPlayerSimScenarios = [
    {
      label: "cities_and_knights_5_6-6p",
      config: { scenarioId: "cities_and_knights_5_6" as const },
    },
    {
      label: "seafarers_new_shores_5_6-6p",
      config: {
        scenarioId: "seafarers_new_shores_5_6" as const,
        enableHarbormaster: true,
      },
    },
    {
      label: "seafarers_six_islands_5_6-6p",
      config: { scenarioId: "seafarers_six_islands_5_6" as const },
    },
    {
      label: "seafarers_fog_islands_5_6-6p",
      config: {
        scenarioId: "seafarers_fog_islands_5_6" as const,
        enableFriendlyRobber: true,
      },
    },
    {
      label: "seafarers_six_islands_ck_5_6-6p",
      config: {
        scenarioId: "seafarers_six_islands_5_6" as const,
        enableCitiesAndKnights: true,
      },
    },
  ];

  const simDiffs = ["master", "smart", "normal", "master", "smart", "easy"] as const;
  const simPlayers: PlayerDescriptor[] = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Bot6P ${i + 1}`,
    color: "",
    isBot: true,
    botDifficulty: simDiffs[i]!,
  }));

  for (const item of sixPlayerSimScenarios) {
    test(
      `Full-game 6-player bot simulation completes cleanly: ${item.label}`,
      () => {
        const final = runSimulatedMatch(
          simPlayers,
          item.config,
          `ext56-sim-${item.label}-2026`,
          6000
        );
        expect(final.phase).toBe("GAME_OVER");
        expect(final.winnerId).not.toBeNull();
        expect(
          computePlayerVictoryPoints(final, final.winnerId!, false)
        ).toBeGreaterThanOrEqual(final.config.targetVictoryPoints);
        expect(CatanEngine.checkInvariants(final).valid).toBe(true);
      }
    );
  }

  test("Cities & Knights + Seafarers generates full untrunacted Inventor hex pairs and Diplomat remove-only own open road actions", () => {
    const init = CatanEngine.initGame(
      FOUR_PLAYERS,
      {
        scenarioId: "seafarers_four_islands",
        enableCitiesAndKnights: true,
      },
      "ck-sf-full-progress-legals"
    );
    let { state } = completeSnakeDraftSetup(init);
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;
    grantCardFromDeckForTest(state, "p1", "inv-full", "inventor", "science");
    grantCardFromDeckForTest(state, "p1", "dip-full", "diplomat", "politics");

    const legal = CatanEngine.getLegalActions(state, "p1");
    const invActions = legal.filter(
      (a) => a.type === "PLAY_PROGRESS_CARD" && a.cardId === "inv-full"
    );
    const eligibleHexCount = state.topology.hexOrder.filter((hId) => {
      const tok = state.hexes[hId]?.numberToken;
      return (
        tok !== null &&
        tok !== undefined &&
        tok !== 2 &&
        tok !== 6 &&
        tok !== 8 &&
        tok !== 12
      );
    }).length;
    expect(invActions.length).toBe(
      (eligibleHexCount * (eligibleHexCount - 1)) / 2
    );
    expect(invActions.length).toBeGreaterThan(60);

    const dipRemoveOnly = legal.filter(
      (a) =>
        a.type === "PLAY_PROGRESS_CARD" &&
        a.cardId === "dip-full" &&
        a.params?.edgeId &&
        !a.params?.rebuildEdgeId &&
        state.edges[a.params.edgeId]?.ownerId === "p1"
    );
    // If p1 placed a road (not a ship) during setup, remove-only diplomat action must exist!
    const p1HasRoad = Object.values(state.edges).some(
      (e) => e.ownerId === "p1" && e.type === "road"
    );
    if (p1HasRoad) {
      expect(dipRemoveOnly.length).toBeGreaterThanOrEqual(1);
    }
  });
});
