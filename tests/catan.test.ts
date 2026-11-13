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

const FOUR_PLAYERS: PlayerDescriptor[] = [
  { id: "p1", name: "Alice", color: "#e63946", isBot: true },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: true },
  { id: "p3", name: "Charlie", color: "#f59e0b", isBot: true },
  { id: "p4", name: "Diana", color: "#10b981", isBot: true },
];

function completeSnakeDraftSetup(state: ReturnType<typeof CatanEngine.initGame>) {
  let s = state;
  const orderTrace: string[] = [];
  while (s.phase.startsWith("SETUP_")) {
    const actor = getNextActingPlayerId(s)!;
    if (s.phase === "SETUP_SETTLEMENT_1" || s.phase === "SETUP_SETTLEMENT_2") {
      orderTrace.push(actor);
    }
    const act = CatanEngine.chooseBotAction(s, actor)!;
    s = CatanEngine.applyAction(s, actor, act).state;
  }
  return { state: s, orderTrace };
}

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

describe("@gaming-platform/catan - Multi-Tier AI & Trading Strategy", () => {
  test("Master bot proposes build-unlocking Domestic Trade and never loops declined offers", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Master", color: "#e63946", isBot: true, botDifficulty: "master" },
      { id: "p2", name: "Smart", color: "#2563eb", isBot: true, botDifficulty: "smart" },
      { id: "p3", name: "Normal", color: "#f59e0b", isBot: true, botDifficulty: "normal" },
      { id: "p4", name: "Easy", color: "#10b981", isBot: true, botDifficulty: "easy" },
    ];
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "master-trade-spec")
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    // Reset hands cleanly into bank, then give p1 (Master) 2 grain, 2 ore, 2 wool (1 ore short of City)
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    state.players[0]!.resources = { brick: 0, lumber: 0, wool: 2, grain: 2, ore: 2 };
    state.bank.wool -= 2;
    state.bank.grain -= 2;
    state.bank.ore -= 2;

    // Give p2 (Smart) 2 grain + 1 ore (so public bank-deduction shows 1 Ore in opponent hands, while Smart keeps it)
    state.players[1]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 1 };
    state.bank.grain -= 2;
    state.bank.ore -= 1;

    const firstAct = CatanEngine.chooseBotAction(state, "p1")!;
    expect(firstAct.type).toBe("OFFER_DOMESTIC_TRADE");
    if (firstAct.type === "OFFER_DOMESTIC_TRADE") {
      expect(firstAct.want.ore).toBe(1);
      expect(firstAct.give.wool).toBe(1);
    }

    // Apply offer and let all responders decline -> ensure Master never loops infinitely
    state = CatanEngine.applyAction(state, "p1", firstAct).state;
    let guard = 0;
    while (state.phase === "MAIN_PHASE" && state.activePlayerIndex === 0 && guard < 16) {
      const actor = getNextActingPlayerId(state)!;
      const act = CatanEngine.chooseBotAction(state, actor)!;
      state = CatanEngine.applyAction(state, actor, act).state;
      if (act.type === "END_TURN") break;
      guard++;
    }
    expect(guard).toBeLessThan(16);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Leader Embargo: Master/Smart declines trade from 8-VP leader while Easy accepts", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Leader", color: "#e63946", isBot: false },
      { id: "p2", name: "Master", color: "#2563eb", isBot: true, botDifficulty: "master" },
      { id: "p3", name: "Easy", color: "#10b981", isBot: true, botDifficulty: "easy" },
    ];
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "embargo-spec")
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    // Give p1 +6 bonus VP so p1 sits at 8 visible VP (within 2 of 10 VP target!)
    state.players[0]!.bonusVictoryPoints = 6;
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(8);

    // Give p1 2 ore and give p2 & p3 1 brick each
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    state.players[0]!.resources.ore = 2;
    state.bank.ore -= 2;
    state.players[1]!.resources.brick = 1;
    state.players[2]!.resources.brick = 1;
    state.bank.brick -= 2;

    state = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { ore: 1 },
      want: { brick: 1 },
    }).state;

    // p2 (Master) acts first as responder and MUST embargo the 8-VP leader!
    expect(getNextActingPlayerId(state)).toBe("p2");
    const masterResp = CatanEngine.chooseBotAction(state, "p2")!;
    expect(masterResp.type).toBe("DECLINE_DOMESTIC_TRADE");

    state = CatanEngine.applyAction(state, "p2", masterResp).state;

    // p3 (Easy) has no leader embargo and accepts the generous Ore-for-Brick trade
    expect(getNextActingPlayerId(state)).toBe("p3");
    const easyResp = CatanEngine.chooseBotAction(state, "p3")!;
    expect(easyResp.type).toBe("ACCEPT_DOMESTIC_TRADE");
  });

  test("Master 7-Discard solver preserves intact 5-card City over surplus stack", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Master", color: "#e63946", isBot: true, botDifficulty: "master" },
      { id: "p2", name: "Smart", color: "#2563eb", isBot: true, botDifficulty: "smart" },
      { id: "p3", name: "Normal", color: "#f59e0b", isBot: true, botDifficulty: "normal" },
    ];
    const { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "discard-solver-spec")
    );

    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    // Give Master 9 cards: exact City (2 grain, 3 ore) + 4 excess wool -> must discard 4!
    state.players[0]!.resources = { brick: 0, lumber: 0, wool: 4, grain: 2, ore: 3 };
    state.bank.wool -= 4;
    state.bank.grain -= 2;
    state.bank.ore -= 3;
    state.phase = "DISCARD_ON_SEVEN";
    state.pendingDiscards = { p1: 4 };

    const discardAct = CatanEngine.chooseBotAction(state, "p1")!;
    expect(discardAct).toEqual({
      type: "DISCARD_CARDS",
      resources: { wool: 4 },
    });
  });

  test("Master Port-Arbitrage: asks opponents for 2:1 harbor resource when bank holds the only Ore", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Master", color: "#e63946", isBot: true, botDifficulty: "master" },
      { id: "p2", name: "Normal", color: "#2563eb", isBot: true, botDifficulty: "normal" },
      { id: "p3", name: "Easy", color: "#10b981", isBot: true, botDifficulty: "easy" },
    ];
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "port-arb-spec")
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    // Give p1 a settlement on the 2:1 Brick harbor (reusing one of p1's existing settlements)
    const brickHarbor = state.harbors.find((h) => h.type === "brick")!;
    const oldP1Vertex = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1"
    )![0];
    delete state.buildings[oldP1Vertex];
    state.buildings[brickHarbor.vertexIds[0]] = { ownerId: "p1", type: "settlement" };

    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // Nobody holds Ore (bank has 17, Master has 2). Master has 1 Brick (on 2:1 Brick harbor!) + 1 spare Lumber.
    // Opponents hold Brick! Master deduces 0 Ore in opponent hands and asks for 1 Brick to 2:1 port-trade for Ore!
    state.players[0]!.resources = { brick: 1, lumber: 1, wool: 0, grain: 2, ore: 2 };
    state.bank.brick -= 1;
    state.bank.lumber -= 1;
    state.bank.grain -= 2;
    state.bank.ore -= 2;

    state.players[2]!.resources.brick = 2;
    state.bank.brick -= 2;

    const offerAct = CatanEngine.chooseBotAction(state, "p1")!;
    expect(offerAct).toEqual({
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { lumber: 1 },
      want: { brick: 1 },
    });

    // Once Easy accepts { lumber: 1 } -> { brick: 1 }, Master immediately trades 2 Brick -> 1 Ore and builds a City!
    state = CatanEngine.applyAction(state, "p1", offerAct).state;
    while (state.activeTradeOffer) {
      const respId = getNextActingPlayerId(state)!;
      const respAct = CatanEngine.chooseBotAction(state, respId)!;
      state = CatanEngine.applyAction(state, respId, respAct).state;
    }
    const portAct = CatanEngine.chooseBotAction(state, "p1")!;
    expect(portAct).toEqual({
      type: "MARITIME_TRADE",
      give: "brick",
      giveAmount: 2,
      receive: "ore",
    });
    state = CatanEngine.applyAction(state, "p1", portAct).state;
    const cityAct = CatanEngine.chooseBotAction(state, "p1")!;
    expect(cityAct.type).toBe("BUILD_CITY");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Bidirectional Near-Victory Embargo: Master refuses 7-VP & burst-VP opponents unless trade is immediately lethal for Master", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Master", color: "#e63946", isBot: true, botDifficulty: "master" },
      { id: "p2", name: "NearWinHuman", color: "#2563eb", isBot: false },
      { id: "p3", name: "BurstHuman", color: "#f59e0b", isBot: false },
      { id: "p4", name: "SafePeer", color: "#10b981", isBot: false },
    ];
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "bi-embargo-spec")
    );
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // Case A: p2 sits at 7 visible VP (3 away from 10 VP) and offers Ore for Brick -> Master MUST decline!
    state.players[1]!.bonusVictoryPoints = 5; // 2 setup + 5 = 7 visible VP
    expect(computePlayerVictoryPoints(state, "p2", true)).toBe(7);
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 1;
    state.players[1]!.resources.ore = 2;
    state.players[0]!.resources.brick = 2;
    state.bank.ore -= 2;
    state.bank.brick -= 2;

    state = CatanEngine.applyAction(state, "p2", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { ore: 1 },
      want: { brick: 1 },
    }).state;
    expect(CatanEngine.chooseBotAction(state, "p1")!.type).toBe("DECLINE_DOMESTIC_TRADE");
    state = CatanEngine.applyAction(state, "p2", { type: "CANCEL_DOMESTIC_TRADE" }).state;

    // Case B: p3 sits at only 6 visible VP, BUT holds 2 unplayed dev cards (burst threat >= 8 VP) -> Master MUST decline!
    state.players[2]!.bonusVictoryPoints = 4; // 6 visible VP
    state.players[2]!.devCards = [
      { id: "dc1", type: "knight", boughtOnTurn: 1, played: false },
      { id: "dc2", type: "victory_point", boughtOnTurn: 1, played: false },
    ];
    state.activePlayerIndex = 2;
    state.players[2]!.resources.ore = 2;
    state.bank.ore -= 2;

    state = CatanEngine.applyAction(state, "p3", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { ore: 1 },
      want: { brick: 1 },
    }).state;
    // Also verify Master makes the exact same fair decision through redacted getPlayerView!
    const redactedForMaster = CatanEngine.getPlayerView(state, "p1");
    expect(CatanEngine.chooseBotAction(redactedForMaster, "p1")!.type).toBe(
      "DECLINE_DOMESTIC_TRADE"
    );
    state = CatanEngine.applyAction(state, "p3", { type: "CANCEL_DOMESTIC_TRADE" }).state;

    // Case C: Master (at 4 VP) broadcasts a trade; ONLY 7-VP p2 accepts while SafePeer declines -> Master MUST CANCEL!
    state.activePlayerIndex = 0;
    state.players[0]!.bonusVictoryPoints = 2; // 4 VP (not lethal)
    state.players[0]!.resources = { brick: 1, lumber: 0, wool: 0, grain: 2, ore: 2 };
    state.players[1]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 1 };
    state.players[2]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
    state.players[3]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 1 };
    state.bank.brick = 18;
    state.bank.lumber = 19;
    state.bank.wool = 19;
    state.bank.grain = 17;
    state.bank.ore = 15;

    state = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    }).state;
    const offerId1 = state.activeTradeOffer!.id;
    state = CatanEngine.applyAction(state, "p2", {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offerId1,
    }).state;
    state = CatanEngine.applyAction(state, "p4", {
      type: "DECLINE_DOMESTIC_TRADE",
      offerId: offerId1,
    }).state;
    // p3 auto-declined (0 ore), so Master now chooses whether to confirm with 7-VP p2 or cancel!
    expect(getNextActingPlayerId(state)).toBe("p1");
    expect(CatanEngine.chooseBotAction(state, "p1")).toEqual({
      type: "CANCEL_DOMESTIC_TRADE",
    });
    state = CatanEngine.applyAction(state, "p1", { type: "CANCEL_DOMESTIC_TRADE" }).state;

    // Case D: Lethal Exception! Master is at 9 VP (needs 1 Ore for winning City = 10 VP) and 7-VP p2 accepts -> Master CONFIRMS and WINS!
    state.players[0]!.bonusVictoryPoints = 7; // 2 + 7 = 9 VP!
    state = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    }).state;
    const offerId2 = state.activeTradeOffer!.id;
    state = CatanEngine.applyAction(state, "p2", {
      type: "ACCEPT_DOMESTIC_TRADE",
      offerId: offerId2,
    }).state;
    state = CatanEngine.applyAction(state, "p4", {
      type: "DECLINE_DOMESTIC_TRADE",
      offerId: offerId2,
    }).state;
    const lethalConfirm = CatanEngine.chooseBotAction(state, "p1")!;
    expect(lethalConfirm).toEqual({
      type: "CONFIRM_DOMESTIC_TRADE",
      offerId: offerId2,
      partnerId: "p2",
    });
    // Also verify redacted getPlayerView preserves CONFIRM_DOMESTIC_TRADE legal actions & identical Master decision!
    expect(
      CatanEngine.chooseBotAction(CatanEngine.getPlayerView(state, "p1"), "p1")
    ).toEqual(lethalConfirm);
    state = CatanEngine.applyAction(state, "p1", lethalConfirm).state;
    const winningCity = CatanEngine.chooseBotAction(state, "p1")!;
    expect(winningCity.type).toBe("BUILD_CITY");
    state = CatanEngine.applyAction(state, "p1", winningCity).state;
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerId).toBe("p1");
  });

  test("Master Multi-Step Turn Lethal Solver finds Year of Plenty -> City and Monopoly -> City wins", () => {
    const tieredPlayers: PlayerDescriptor[] = [
      { id: "p1", name: "Master", color: "#e63946", isBot: true, botDifficulty: "master" },
      { id: "p2", name: "RivalA", color: "#2563eb", isBot: true, botDifficulty: "smart" },
      { id: "p3", name: "RivalB", color: "#10b981", isBot: true, botDifficulty: "smart" },
    ];
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "lethal-combo-spec")
    );
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // Put Master at 9 VP (including 1 secret VP dev card!), holding 2 Grain + 1 Ore + unplayed Year of Plenty + Road Building!
    // Old bot wasted its 1 dev-card play on Road Building; Upgraded Master spots YoP(ore, ore) -> BUILD_CITY lethal!
    state.phase = "MAIN_PHASE";
    state.turn = 4;
    state.activePlayerIndex = 0;
    state.players[0]!.bonusVictoryPoints = 6; // 2 setup + 6 + 1 VP card = 9 true VP!
    state.players[0]!.devCards = [
      { id: "vp1", type: "victory_point", boughtOnTurn: 1, played: false },
      { id: "rb1", type: "road_building", boughtOnTurn: 1, played: false },
      { id: "yop1", type: "year_of_plenty", boughtOnTurn: 1, played: false },
    ];
    state.players[0]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 1 };
    state.bank.grain -= 2;
    state.bank.ore -= 1;

    const firstLethalStep = CatanEngine.chooseBotAction(state, "p1")!;
    expect(firstLethalStep).toEqual({
      type: "PLAY_YEAR_OF_PLENTY",
      resource1: "ore",
      resource2: "ore",
    });
    state = CatanEngine.applyAction(state, "p1", firstLethalStep).state;
    const finishCity = CatanEngine.chooseBotAction(state, "p1")!;
    expect(finishCity.type).toBe("BUILD_CITY");

    // Also verify Monopoly (deducing 2 Ore in opponent hands from public bank supply) -> City lethal!
    let { state: monoState } = completeSnakeDraftSetup(
      CatanEngine.initGame(tieredPlayers, { scenarioId: "standard" }, "mono-lethal-spec")
    );
    for (const p of monoState.players) {
      for (const r of RESOURCES) {
        monoState.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    monoState.phase = "MAIN_PHASE";
    monoState.turn = 5;
    monoState.activePlayerIndex = 0;
    monoState.players[0]!.bonusVictoryPoints = 7; // 9 VP
    monoState.players[0]!.devCards = [
      { id: "rb2", type: "road_building", boughtOnTurn: 1, played: false },
      { id: "mono1", type: "monopoly", boughtOnTurn: 1, played: false },
    ];
    monoState.players[0]!.resources = { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 1 };
    monoState.players[1]!.resources.ore = 2; // Opponents collectively hold 2 Ore (bank has 16)
    monoState.bank.grain -= 2;
    monoState.bank.ore -= 3;

    const monoAct = CatanEngine.chooseBotAction(
      CatanEngine.getPlayerView(monoState, "p1"),
      "p1"
    )!;
    expect(monoAct).toEqual({ type: "PLAY_MONOPOLY", resource: "ore" });
  });
});
