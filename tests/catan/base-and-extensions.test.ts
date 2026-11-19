import { describe, expect, test } from "bun:test";
import { MatchSession, type PlayerDescriptor } from "@gaming-platform/core";
import {
  CatanEngine,
  RESOURCES,
  type ScenarioId,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  recalculateAwards,
  totalResourceCount,
} from "@gaming-platform/catan";
import { FOUR_PLAYERS, completeSnakeDraftSetup } from "./helpers.ts";

describe("@gaming-platform/catan - Base Game Rules", () => {
  test("Snake draft setup follows 1->2->3->4->4->3->2->1 and enforces Distance Rule", () => {
    const init = CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "setup-test");
    const { state, orderTrace } = completeSnakeDraftSetup(init);

    expect(orderTrace).toEqual(["p1", "p2", "p3", "p4", "p4", "p3", "p2", "p1"]);
    expect(state.phase).toBe("PRE_ROLL");
    expect(Object.keys(state.buildings).length).toBe(8);
    expect(Object.keys(state.edges).length).toBe(8);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Maritime and Harbor trade ratios (4:1, 3:1 generic, 2:1 specialized)", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "harbor-test")
    );

    const genericHarbor = state.harbors.find((h) => h.type === "generic")!;
    const brickHarbor = state.harbors.find((h) => h.type === "brick")!;

    // Clear existing buildings for clean harbor test
    state.buildings = {};
    state.players.forEach((p) => {
      p.settlementsRemaining = 5;
    });
    expect(getPlayerTradeRatios(state, "p1").brick).toBe(4);

    // Give p1 a settlement on a generic 3:1 harbor
    state.buildings[genericHarbor.vertexIds[0]] = {
      ownerId: "p1",
      type: "settlement",
    };
    state.players[0]!.settlementsRemaining--;
    expect(getPlayerTradeRatios(state, "p1").lumber).toBe(3);
    expect(getPlayerTradeRatios(state, "p1").brick).toBe(3);

    // Give p1 a settlement on the 2:1 brick harbor
    state.buildings[brickHarbor.vertexIds[0]] = {
      ownerId: "p1",
      type: "settlement",
    };
    state.players[0]!.settlementsRemaining--;
    expect(getPlayerTradeRatios(state, "p1").brick).toBe(2);
    expect(getPlayerTradeRatios(state, "p1").lumber).toBe(3);

    // Test executing a 2:1 brick -> ore maritime trade in MAIN_PHASE
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;
    state.players[0]!.resources.brick += 2;
    state.bank.brick -= 2;

    const prevOre = state.players[0]!.resources.ore;
    state = CatanEngine.applyAction(state, "p1", {
      type: "MARITIME_TRADE",
      give: "brick",
      giveAmount: 2,
      receive: "ore",
    }).state;
    expect(state.players[0]!.resources.ore).toBe(prevOre + 1);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Domestic player-to-player trade offer, multi-player acceptance, and partner selection", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "domestic-test")
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    // Reset hands cleanly into bank, then give p1 1 brick, and give BOTH p2 and p3 1 ore (p4 has 0 ore)
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    state.bank.brick -= 1;
    state.players[0]!.resources.brick += 1;
    state.bank.ore -= 2;
    state.players[1]!.resources.ore += 1;
    state.players[2]!.resources.ore += 1;

    const p1BrickBefore = state.players[0]!.resources.brick;
    const p1OreBefore = state.players[0]!.resources.ore;
    const p2OreBefore = state.players[1]!.resources.ore;
    const p3OreBefore = state.players[2]!.resources.ore;

    state = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    }).state;

    expect(state.activeTradeOffer).not.toBeNull();
    // p4 lacks ore and is automatically declined
    expect(state.activeTradeOffer!.declinedBy).toContain("p4");
    const offerId = state.activeTradeOffer!.id;

    // p2 accepts -> trade stays open so other players can respond and p1 can select partner
    state = CatanEngine.applyAction(state, "p2", {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId,
    }).state;
    expect(state.activeTradeOffer).not.toBeNull();
    expect(state.activeTradeOffer!.acceptedBy).toEqual(["p2"]);
    // As soon as p2 accepts, p1 ALREADY has CONFIRM_DOMESTIC_TRADE for p2 available!
    expect(
      CatanEngine.getLegalActions(state, "p1").some(
        (a) => a.type === "CONFIRM_DOMESTIC_TRADE" && a.partnerId === "p2"
      )
    ).toBe(true);

    // p3 also accepts -> now both p2 and p3 have accepted, and control returns to p1
    state = CatanEngine.applyAction(state, "p3", {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId,
    }).state;
    expect(state.activeTradeOffer!.acceptedBy).toEqual(["p2", "p3"]);

    // p1 chooses to trade with p3 instead of p2!
    state = CatanEngine.applyAction(state, "p1", {
      type: "CONFIRM_DOMESTIC_TRADE",
      offerId,
      partnerId: "p3",
    }).state;

    expect(state.activeTradeOffer).toBeNull();
    expect(state.players[0]!.resources.brick).toBe(p1BrickBefore - 1);
    expect(state.players[0]!.resources.ore).toBe(p1OreBefore + 1);
    expect(state.players[1]!.resources.ore).toBe(p2OreBefore); // p2 untouched
    expect(state.players[2]!.resources.ore).toBe(p3OreBefore - 1); // p3 traded
    expect(state.players[2]!.resources.brick).toBe(1);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Development cards: same-turn restriction, Knight & Largest Army, Year of Plenty, Monopoly", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "devcard-test")
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    // Force top of devCardDeck to be knight and give p1 resources to buy it
    state.devCardDeck.push("knight");
    state.bank.wool -= 1;
    state.bank.grain -= 1;
    state.bank.ore -= 1;
    state.players[0]!.resources.wool += 1;
    state.players[0]!.resources.grain += 1;
    state.players[0]!.resources.ore += 1;

    state = CatanEngine.applyAction(state, "p1", { type: "BUY_DEV_CARD" }).state;

    // Cannot play Knight bought on the same turn
    const legalSameTurn = CatanEngine.getLegalActions(state, "p1");
    expect(legalSameTurn.some((a) => a.type === "PLAY_KNIGHT")).toBe(false);

    // Give p1 2 already-played knights and make the new knight bought on an earlier turn
    state.players[0]!.knightsPlayed = 2;
    state.players[0]!.devCards[0]!.boughtOnTurn = 0;

    state = CatanEngine.applyAction(state, "p1", { type: "PLAY_KNIGHT" }).state;
    expect(state.players[0]!.knightsPlayed).toBe(3);
    expect(state.largestArmyOwnerId).toBe("p1");
    expect(state.phase).toBe("MOVE_ROBBER_OR_PIRATE");

    // Resolve robber movement & any steal
    const robberMove = CatanEngine.chooseBotAction(state, "p1")!;
    state = CatanEngine.applyAction(state, "p1", robberMove).state;
    if (state.phase === "STEAL_RESOURCE") {
      const stealAct = CatanEngine.chooseBotAction(state, "p1")!;
      state = CatanEngine.applyAction(state, "p1", stealAct).state;
    }
    expect(state.phase).toBe("MAIN_PHASE");

    // Next turn: test Monopoly
    state.turn += 1;
    state.players[0]!.hasPlayedDevCardThisTurn = false;
    state.players[0]!.devCards.push({
      id: "mono-1",
      type: "monopoly",
      boughtOnTurn: 0,
      played: false,
    });
    // Give p2 and p3 grain from bank
    state.bank.grain -= 3;
    state.players[1]!.resources.grain += 2;
    state.players[2]!.resources.grain += 1;
    const oppGrainTotal =
      state.players[1]!.resources.grain +
      state.players[2]!.resources.grain +
      state.players[3]!.resources.grain;
    const p1GrainBefore = state.players[0]!.resources.grain;

    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_MONOPOLY",
      resource: "grain",
    }).state;

    expect(state.players[0]!.resources.grain).toBe(p1GrainBefore + oppGrainTotal);
    expect(state.players[1]!.resources.grain).toBe(0);
    expect(state.players[2]!.resources.grain).toBe(0);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Longest Road is broken when an opponent builds a settlement on an intermediate vertex", () => {
    const { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "road-break-test")
    );
    state.buildings = {};
    state.edges = {};
    state.players.forEach((p) => {
      p.roadsRemaining = 15;
      p.settlementsRemaining = 5;
    });

    // Build a 6-edge cycle around hex (0,0) for p1
    const centerHex = state.topology.hexes["0,0"]!;
    for (const eId of centerHex.sideEdgeIds) {
      state.edges[eId] = { ownerId: "p1", type: "road", builtOnTurn: 1 };
      state.players[0]!.roadsRemaining--;
    }

    recalculateAwards(state);
    expect(state.players[0]!.longestRoadLength).toBe(6);
    expect(state.longestRoadOwnerId).toBe("p1");

    // Opponent p2 builds settlements on two opposite vertices of the ring
    state.buildings[centerHex.cornerVertexIds[0]!] = {
      ownerId: "p2",
      type: "settlement",
    };
    state.buildings[centerHex.cornerVertexIds[3]!] = {
      ownerId: "p2",
      type: "settlement",
    };
    state.players[1]!.settlementsRemaining -= 2;

    recalculateAwards(state);
    expect(state.players[0]!.longestRoadLength).toBe(3);
    expect(state.longestRoadOwnerId).toBeNull();
  });
});

describe("@gaming-platform/catan - Extensions & Expansions", () => {
  test("5-6 Player Extension: 30-hex board and Special Building Phase between turns", () => {
    const sixPlayers: PlayerDescriptor[] = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      color: "",
      isBot: true,
    }));

    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(sixPlayers, { scenarioId: "big_island_5_6" }, "big-island-test")
    );

    expect(state.topology.hexOrder.length).toBe(30);
    const rowCounts = [-3, -2, -1, 0, 1, 2, 3].map(
      (r) => Object.values(state.hexes).filter((h) => h.r === r).length
    );
    expect(rowCounts).toEqual([3, 4, 5, 6, 5, 4, 3]);
    expect(state.config.enableSpecialBuildingPhase).toBe(true);

    // Roll dice for p1 and advance to MAIN_PHASE, then END_TURN -> should enter SPECIAL_BUILDING
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    state = CatanEngine.applyAction(state, "p1", { type: "END_TURN" }).state;
    expect(state.phase).toBe("SPECIAL_BUILDING");
    expect(state.specialBuildPlayerIndex).toBe(1); // p2 gets to special-build first

    // Step through all 5 other players' special building phases
    for (let idx = 1; idx <= 5; idx++) {
      const sbActor = getNextActingPlayerId(state)!;
      expect(sbActor).toBe(`p${idx + 1}`);
      state = CatanEngine.applyAction(state, sbActor, {
        type: "END_SPECIAL_BUILD",
      }).state;
    }

    expect(state.phase).toBe("PRE_ROLL");
    expect(state.activePlayerIndex).toBe(1); // Now it is p2's normal turn
  });

  test("City Walls (Cities & Knights mechanic) increases safe hand limit by +2 per wall on a 7", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "standard", enableCityWalls: true },
        "walls-test"
      )
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    const p1SettlementVertex = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "settlement"
    )![0];

    // Upgrade p1's settlement to a city and build a city wall
    state.buildings[p1SettlementVertex]!.type = "city";
    state.players[0]!.settlementsRemaining++;
    state.players[0]!.citiesRemaining--;

    expect(getPlayerSafeHandLimit(state, "p1")).toBe(7);

    state.bank.brick -= 2;
    state.players[0]!.resources.brick += 2;
    state = CatanEngine.applyAction(state, "p1", {
      type: "BUILD_CITY_WALL",
      vertexId: p1SettlementVertex,
    }).state;

    expect(getPlayerSafeHandLimit(state, "p1")).toBe(9);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Harbormaster variant awards +2 VP upon reaching 3 Harbor Points", () => {
    const { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "standard", enableHarbormaster: true },
        "harbormaster-test"
      )
    );

    const h1 = state.harbors[0]!;
    const h2 = state.harbors[1]!;
    state.buildings = {
      [h1.vertexIds[0]]: { ownerId: "p1", type: "city" }, // 2 harbor points
      [h2.vertexIds[0]]: { ownerId: "p1", type: "settlement" }, // 1 harbor point
    };
    state.players[0]!.settlementsRemaining = 4;
    state.players[0]!.citiesRemaining = 3;

    recalculateAwards(state);
    expect(state.players[0]!.harborPoints).toBe(3);
    expect(state.harbormasterOwnerId).toBe("p1");
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(2 + 1 + 2); // city(2) + settlement(1) + harbormaster(2) = 5
  });

  test("Full-game bot simulations complete cleanly with valid invariants across all scenarios", () => {
    const scenarios: ScenarioId[] = [
      "standard",
      "big_island_5_6",
      "seafarers_new_shores",
      "seafarers_four_islands",
      "seafarers_fog_islands",
    ];

    for (const scenarioId of scenarios) {
      const count = scenarioId === "big_island_5_6" ? 5 : 4;
      const players: PlayerDescriptor[] = Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: `Bot ${i + 1}`,
        color: "",
        isBot: true,
      }));

      const initial = CatanEngine.initGame(
        players,
        {
          scenarioId,
          enableHarbormaster: scenarioId === "seafarers_new_shores",
          enableCityWalls: scenarioId === "big_island_5_6",
          enableFriendlyRobber: scenarioId === "seafarers_fog_islands",
        },
        `fuzz-${scenarioId}-77`
      );

      const session = new MatchSession(CatanEngine, initial, true);
      let steps = 0;
      while (session.getState().phase !== "GAME_OVER" && steps < 4000) {
        const s = session.getState();
        const actor = getNextActingPlayerId(s);
        expect(actor).not.toBeNull();
        const action = CatanEngine.chooseBotAction(s, actor!);
        expect(action).not.toBeNull();
        session.dispatch(actor!, action!);
        steps++;
      }

      const final = session.getState();
      expect(final.phase).toBe("GAME_OVER");
      expect(final.winnerId).not.toBeNull();
      const winnerVp = computePlayerVictoryPoints(final, final.winnerId!, false);
      expect(winnerVp).toBeGreaterThanOrEqual(final.config.targetVictoryPoints);
      expect(totalResourceCount(final.bank)).toBeGreaterThanOrEqual(0);
      expect(RESOURCES.every((r) => final.bank[r] >= 0)).toBe(true);
    }
  });
});
