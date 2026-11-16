import { describe, expect, test } from "bun:test";
import {
  MatchSession,
  type PlayerDescriptor,
  axialDistance,
  createMatchSessionState,
  dispatchSessionActionPure,
  getSessionState,
} from "@gaming-platform/core";
import {
  COMMODITIES,
  CatanEngine,
  RESOURCES,
  SCENARIO_CATALOG,
  type ScenarioId,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerGoodTradeRatios,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  recalculateAwards,
  resolveEventDieRollPure,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import { renderCatanBoardSvg } from "../apps/web/src/catan-graphics.ts";

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

describe("@gaming-platform/catan - Cities & Knights Expansion", () => {
  test("Setup places 2nd building as a City, sets 13/14 VP target, builds 54-card Progress Decks, and keeps Robber dormant before 1st Barbarian attack", () => {
    const ckInit = CatanEngine.initGame(
      FOUR_PLAYERS,
      { scenarioId: "cities_and_knights" },
      "ck-setup-spec"
    );
    expect(ckInit.config.enableCitiesAndKnights).toBe(true);
    expect(ckInit.config.enableCityWalls).toBe(true);
    expect(ckInit.config.targetVictoryPoints).toBe(13);
    expect(ckInit.devCardDeck.length).toBe(0);
    expect(ckInit.progressDecks.trade.length).toBe(18);
    expect(ckInit.progressDecks.politics.length).toBe(18);
    expect(ckInit.progressDecks.science.length).toBe(18);

    const seafarersCk = CatanEngine.initGame(
      FOUR_PLAYERS,
      { scenarioId: "seafarers_new_shores", enableCitiesAndKnights: true },
      "ck-seafarers-target"
    );
    expect(seafarersCk.config.targetVictoryPoints).toBe(14);

    let { state } = completeSnakeDraftSetup(ckInit);
    expect(state.phase).toBe("PRE_ROLL");
    // Each player starts with 1 Settlement + 1 City (= 3 VP)
    for (const p of state.players) {
      const owned = Object.values(state.buildings).filter((b) => b.ownerId === p.id);
      expect(owned.filter((b) => b.type === "settlement").length).toBe(1);
      expect(owned.filter((b) => b.type === "city").length).toBe(1);
      expect(p.settlementsRemaining).toBe(4);
      expect(p.citiesRemaining).toBe(3);
      expect(computePlayerVictoryPoints(state, p.id, true)).toBe(3);
    }

    // Before barbarianAttacksCount >= 1: rolling a 7 via Alchemist enforces >7 hand discard (including commodities!)
    // and then enters MAIN_PHASE directly WITHOUT moving the dormant Robber!
    state.activePlayerIndex = 0;
    grantCardFromDeckForTest(state, "p1", "alch-1", "alchemist", "science");
    for (const r of RESOURCES) {
      state.bank[r] += state.players[0]!.resources[r];
      state.players[0]!.resources[r] = 0;
    }
    state.players[0]!.resources.brick = 6;
    state.bank.brick -= 6;
    state.players[0]!.commodities.paper = 2;
    state.commodityBank.paper -= 2; // 8 total cards > 7 safe limit -> must discard 4

    // Force top event die roll not to trigger barbarian attack (barbarianPosition starts at 0)
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "alch-1",
      params: { die1: 3, die2: 4 },
    }).state;
    expect(state.phase).toBe("DISCARD_ON_SEVEN");
    expect(state.pendingDiscards.p1).toBe(4);

    state = CatanEngine.applyAction(state, "p1", {
      type: "DISCARD_CARDS",
      resources: { brick: 2 },
      commodities: { paper: 2 },
    }).state;
    // Dormant robber skipped!
    expect(state.phase).toBe("MAIN_PHASE");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);

    // Once barbarianAttacksCount >= 1, rolling 7 enters MOVE_ROBBER_OR_PIRATE
    state.phase = "PRE_ROLL";
    state.barbarianAttacksCount = 1;
    grantCardFromDeckForTest(state, "p1", "alch-2", "alchemist", "science");
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "alch-2",
      params: { die1: 4, die2: 3 },
    }).state;
    expect(state.phase).toBe("MOVE_ROBBER_OR_PIRATE");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Commodity production (Forest/Pasture/Mountains Cities) and Science Lv 3 Aqueduct zero-yield pick", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "cities_and_knights" },
        "ck-commodity-aqueduct"
      )
    );
    state.buildings = {};
    for (const p of state.players) {
      p.settlementsRemaining = 5;
      p.citiesRemaining = 4;
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
      for (const c of COMMODITIES) {
        state.commodityBank[c] += p.commodities[c];
        p.commodities[c] = 0;
      }
    }

    const forestEntry = Object.entries(state.hexes).find(
      ([hId, tile]) =>
        tile.terrain === "forest" &&
        tile.numberToken !== null &&
        hId !== state.robberHexId
    )!;
    const [forestHexId, forestTile] = forestEntry;
    const rollNum = forestTile.numberToken!;
    const forestNode = state.topology.hexes[forestHexId]!;

    // Place p1 City and p2 Settlement on non-adjacent corners of the Forest hex
    const p1CityVertex = forestNode.cornerVertexIds[0]!;
    const p2SettleVertex = forestNode.cornerVertexIds[2]!;
    state.buildings[p1CityVertex] = { ownerId: "p1", type: "city" };
    state.players[0]!.citiesRemaining--;
    state.buildings[p2SettleVertex] = { ownerId: "p2", type: "settlement" };
    state.players[1]!.settlementsRemaining--;

    // Give p3 Science Lv 3 (Aqueduct!) and 0 buildings on rollNum so p3 gets 0 natural yield -> 1 Aqueduct pick!
    state.players[2]!.cityImprovements.science = 3;

    // Split rollNum into valid (die1, die2) in 1..6
    const die1 = Math.max(1, Math.min(6, rollNum - 1));
    const die2 = rollNum - die1;
    state.activePlayerIndex = 0;
    state.phase = "PRE_ROLL";
    grantCardFromDeckForTest(state, "p1", "alch-prod", "alchemist", "science");

    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "alch-prod",
      params: { die1, die2 },
    }).state;

    // p1 City on Forest produced 1 Lumber + 1 Paper; p2 Settlement on Forest produced 1 Lumber + 0 Paper!
    expect(state.players[0]!.resources.lumber).toBeGreaterThanOrEqual(1);
    expect(state.players[0]!.commodities.paper).toBeGreaterThanOrEqual(1);
    expect(state.players[1]!.resources.lumber).toBeGreaterThanOrEqual(1);
    expect(state.players[1]!.commodities.paper).toBe(0);

    // p3 received an Aqueduct free resource pick!
    expect(state.phase).toBe("GOLD_RESOURCE_SELECTION");
    expect(state.pendingGoldPicks.p3).toBe(1);
    expect(getNextActingPlayerId(state)).toBe("p3");

    state = CatanEngine.applyAction(state, "p3", {
      type: "SELECT_GOLD_RESOURCE",
      resource: "ore",
    }).state;
    expect(state.players[2]!.resources.ore).toBe(1);
    expect(state.phase).toBe("MAIN_PHASE");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("City Improvements, Trading House (2:1 commodities), Metropolis claiming at Lv 4, and Metropolis stealing at Lv 5", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "cities_and_knights" },
        "ck-metropolis-spec"
      )
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    const p1CityVertex = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "city"
    )![0];
    const p2CityVertex = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p2" && b.type === "city"
    )![0];

    // Give p1 10 cloth (cost 1+2+3+4 = 10 for Trade Lv 1 -> Lv 4)
    state.commodityBank.cloth -= 10;
    state.players[0]!.commodities.cloth += 10;

    expect(getPlayerGoodTradeRatios(state, "p1").paper).toBe(4);

    for (let targetLv = 1; targetLv <= 4; targetLv++) {
      state = CatanEngine.applyAction(state, "p1", {
        type: "UPGRADE_CITY_IMPROVEMENT",
        discipline: "trade",
        ...(targetLv === 4 ? { metropolisVertexId: p1CityVertex } : {}),
      }).state;
    }

    expect(state.players[0]!.cityImprovements.trade).toBe(4);
    // Trading House unlocked at Trade Lv 3 -> 2:1 on all 3 commodities!
    expect(getPlayerGoodTradeRatios(state, "p1").paper).toBe(2);
    expect(getPlayerGoodTradeRatios(state, "p1").cloth).toBe(2);
    expect(getPlayerGoodTradeRatios(state, "p1").coin).toBe(2);

    // Trade Metropolis claimed by p1 (+2 VP -> 3 base + 2 = 5 VP)
    expect(state.metropolises.trade).toEqual({
      ownerId: "p1",
      vertexId: p1CityVertex,
      level: 4,
    });
    expect(state.buildings[p1CityVertex]!.metropolis).toBe("trade");
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(5);

    // Verify 2:1 commodity maritime trade works cleanly
    state.commodityBank.coin -= 2;
    state.players[0]!.commodities.coin += 2;
    const prevOre = state.players[0]!.resources.ore;
    state = CatanEngine.applyAction(state, "p1", {
      type: "MARITIME_TRADE",
      give: "coin",
      giveAmount: 2,
      receive: "ore",
    }).state;
    expect(state.players[0]!.resources.ore).toBe(prevOre + 1);

    // Now p2 sits at Trade Lv 4 and upgrades to Trade Lv 5 -> steals the Trade Metropolis from p1!
    state.activePlayerIndex = 1;
    state.players[1]!.cityImprovements.trade = 4;
    state.commodityBank.cloth -= 5;
    state.players[1]!.commodities.cloth += 5;

    state = CatanEngine.applyAction(state, "p2", {
      type: "UPGRADE_CITY_IMPROVEMENT",
      discipline: "trade",
      metropolisVertexId: p2CityVertex,
    }).state;

    expect(state.metropolises.trade).toEqual({
      ownerId: "p2",
      vertexId: p2CityVertex,
      level: 5,
    });
    expect(state.buildings[p1CityVertex]!.metropolis).toBeUndefined();
    expect(state.buildings[p2CityVertex]!.metropolis).toBe("trade");
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(3);
    expect(computePlayerVictoryPoints(state, "p2", true)).toBe(5);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Knights: recruit, activate, promote (Fortress Lv 3 gate), displace weaker knight, break Longest Road, and chase Robber", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "cities_and_knights" },
        "ck-knights-spec"
      )
    );
    state.buildings = {};
    state.edges = {};
    state.knights = {};
    for (const p of state.players) {
      p.roadsRemaining = 15;
      p.settlementsRemaining = 5;
      p.citiesRemaining = 4;
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // Build a 5-road chain around center hex (0,0) for p1 so p1 holds Longest Road (length 5)
    const centerHex = state.topology.hexes["0,0"]!;
    const chainEdges = centerHex.sideEdgeIds.slice(0, 5);
    for (const eId of chainEdges) {
      state.edges[eId] = { ownerId: "p1", type: "road", builtOnTurn: 1 };
      state.players[0]!.roadsRemaining--;
    }
    const vStart = centerHex.cornerVertexIds[0]!;
    const vMid = centerHex.cornerVertexIds[2]!;
    state.buildings[vStart] = { ownerId: "p1", type: "city" };
    state.players[0]!.citiesRemaining--;

    recalculateAwards(state);
    expect(state.longestRoadOwnerId).toBe("p1");
    expect(state.players[0]!.longestRoadLength).toBe(5);

    // Connect p2's road to vMid and place a Basic (Lv 1) opponent knight at vMid -> breaks p1's Longest Road!
    const p2IncomingEdge = state.topology.vertices[vMid]!.incidentEdgeIds.find(
      (eId) => !state.edges[eId]
    )!;
    state.edges[p2IncomingEdge] = { ownerId: "p2", type: "road", builtOnTurn: 1 };
    state.players[1]!.roadsRemaining--;
    state.knights[vMid] = {
      ownerId: "p2",
      level: 1,
      active: true,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    state.players[1]!.basicKnightsRemaining--;

    recalculateAwards(state);
    expect(state.players[0]!.longestRoadLength).toBeLessThan(5);
    expect(state.longestRoadOwnerId).toBeNull();

    // Now on p1's MAIN_PHASE: recruit a Basic knight on vAdj, activate it, promote to Strong (Lv 2), and check Lv 3 gate!
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;
    const vAdj = centerHex.cornerVertexIds[1]!;
    state.bank.wool -= 3;
    state.bank.ore -= 3;
    state.bank.grain -= 1;
    state.players[0]!.resources.wool += 3;
    state.players[0]!.resources.ore += 3;
    state.players[0]!.resources.grain += 1;

    state = CatanEngine.applyAction(state, "p1", {
      type: "BUILD_KNIGHT",
      vertexId: vAdj,
    }).state;
    expect(state.knights[vAdj]?.level).toBe(1);
    expect(state.knights[vAdj]?.active).toBe(false);

    state = CatanEngine.applyAction(state, "p1", {
      type: "ACTIVATE_KNIGHT",
      vertexId: vAdj,
    }).state;
    expect(state.knights[vAdj]?.active).toBe(true);
    // Cannot move or chase on the same turn it was activated!
    expect(
      CatanEngine.getLegalActions(state, "p1").some((a) => a.type === "MOVE_KNIGHT")
    ).toBe(false);

    // Promote to Strong (Lv 2)
    state = CatanEngine.applyAction(state, "p1", {
      type: "PROMOTE_KNIGHT",
      vertexId: vAdj,
    }).state;
    expect(state.knights[vAdj]?.level).toBe(2);
    // Same-turn double promotion is forbidden even if Fortress were unlocked
    expect(
      CatanEngine.getLegalActions(state, "p1").some(
        (a) => a.type === "PROMOTE_KNIGHT" && a.vertexId === vAdj
      )
    ).toBe(false);

    // Next turn: reset per-turn knight flags -> still cannot promote to Mighty (Lv 3) without Politics Lv 3 Fortress!
    state.knights[vAdj] = {
      ...state.knights[vAdj]!,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    expect(
      CatanEngine.getLegalActions(state, "p1").some(
        (a) => a.type === "PROMOTE_KNIGHT" && a.vertexId === vAdj
      )
    ).toBe(false);
    state.players[0]!.cityImprovements.politics = 3;
    expect(
      CatanEngine.getLegalActions(state, "p1").some(
        (a) => a.type === "PROMOTE_KNIGHT" && a.vertexId === vAdj
      )
    ).toBe(true);

    // p1's Strong (Lv 2) knight marches onto vMid, displacing p2's Basic (Lv 1) knight and restoring Longest Road!
    state = CatanEngine.applyAction(state, "p1", {
      type: "MOVE_KNIGHT",
      fromVertexId: vAdj,
      toVertexId: vMid,
    }).state;
    expect(state.knights[vMid]?.ownerId).toBe("p1");
    expect(state.knights[vMid]?.active).toBe(false); // Deactivates after displacing/moving!
    expect(state.longestRoadOwnerId).toBe("p1");

    // Re-activate on next turn and test CHASE_ROBBER_WITH_KNIGHT once barbarianAttacksCount >= 1
    state.barbarianAttacksCount = 1;
    state.robberHexId = "0,0";
    state.knights[vMid] = {
      ...state.knights[vMid]!,
      active: true,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    const chaseAct = CatanEngine.getLegalActions(state, "p1").find(
      (a) => a.type === "CHASE_ROBBER_WITH_KNIGHT" && a.vertexId === vMid
    )!;
    expect(chaseAct).toBeDefined();
    state = CatanEngine.applyAction(state, "p1", chaseAct).state;
    expect(state.robberHexId).not.toBe("0,0");
    expect(state.knights[vMid]?.active).toBe(false);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Event Die & Barbarian Attack: Caliper draws, VP auto-reveal, Defender Victory (solo & tie), and Barbarian Pillage (Metropolis immunity + borrowedCityPiece)", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "cities_and_knights" },
        "ck-barbarians-spec"
      )
    );

    // 1. Colored gate draw: p1 has Science Lv 2 (caliper 1..3); move "printer" to top of 18-card science deck
    state.players[0]!.cityImprovements.science = 2;
    const printerIdx = state.progressDecks.science.indexOf("printer");
    expect(printerIdx).toBeGreaterThanOrEqual(0);
    state.progressDecks.science.splice(printerIdx, 1);
    state.progressDecks.science.unshift("printer");

    const vpDraw = resolveEventDieRollPure(state, "science", 3, []);
    state = vpDraw.state;
    expect(state.players[0]!.publicProgressVpCards).toEqual(["printer"]);
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(4); // 3 setup + 1 Printer
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);

    // 2. Barbarian Attack — Solo Top Defender wins +1 Defender of Catan VP!
    const vKnight1 = Object.keys(state.topology.vertices).find(
      (vId) => !state.buildings[vId] && !state.knights[vId]
    )!;
    const vKnight2 = Object.keys(state.topology.vertices).find(
      (vId) => vId !== vKnight1 && !state.buildings[vId] && !state.knights[vId]
    )!;
    // 4 cities on board -> Barbarian Strength = 4. Give p1 Lv 3 active + p2 Lv 1 active = 4 -> Defenders Win!
    state.knights[vKnight1] = {
      ownerId: "p1",
      level: 3,
      active: true,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    state.players[0]!.mightyKnightsRemaining--;
    state.knights[vKnight2] = {
      ownerId: "p2",
      level: 1,
      active: true,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    state.players[1]!.basicKnightsRemaining--;
    state.barbarianPosition = 6;

    const soloWin = resolveEventDieRollPure(state, "barbarian", 4, []);
    state = soloWin.state;
    expect(state.barbarianPosition).toBe(0);
    expect(state.barbarianAttacksCount).toBe(1);
    expect(state.players[0]!.defenderPoints).toBe(1);
    expect(state.knights[vKnight1]?.active).toBe(false);
    expect(state.knights[vKnight2]?.active).toBe(false);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);

    // 3. Barbarian Attack — Tied Top Defenders enter PROGRESS_CARD_SELECTION -> SELECT_PROGRESS_DECK
    state.knights[vKnight1] = { ...state.knights[vKnight1]!, level: 2, active: true };
    state.players[0]!.mightyKnightsRemaining++;
    state.players[0]!.strongKnightsRemaining--;
    state.knights[vKnight2] = { ...state.knights[vKnight2]!, level: 2, active: true };
    state.players[1]!.basicKnightsRemaining++;
    state.players[1]!.strongKnightsRemaining--;
    state.barbarianPosition = 6;
    state.phase = "PRE_ROLL";
    const tiedWin = resolveEventDieRollPure(state, "barbarian", 2, []);
    state = {
      ...tiedWin.state,
      phase: "PROGRESS_CARD_SELECTION",
      pendingRollResolution: { die1: 2, die2: 3, total: 5 },
    };
    expect(state.pendingDefenderDeckPicks).toEqual(["p1", "p2"]);
    expect(getNextActingPlayerId(state)).toBe("p1");
    state = CatanEngine.applyAction(state, "p1", {
      type: "SELECT_PROGRESS_DECK",
      discipline: "science",
    }).state;
    expect(getNextActingPlayerId(state)).toBe("p2");
    state = CatanEngine.applyAction(state, "p2", {
      type: "SELECT_PROGRESS_DECK",
      discipline: "trade",
    }).state;
    expect(state.phase).toBe("MAIN_PHASE");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);

    // 4. Barbarian Victory — Metropolis city is immune; 0-settlementsRemaining player uses borrowedCityPiece!
    const p1CityV = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "city"
    )![0];
    const p2CityV = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p2" && b.type === "city"
    )![0];
    // Protect p1's city with the Science Metropolis so p1 has 0 vulnerable cities!
    state.buildings[p1CityV] = {
      ...state.buildings[p1CityV]!,
      metropolis: "science",
    };
    state.metropolises.science = { ownerId: "p1", vertexId: p1CityV, level: 4 };
    state.players[0]!.cityImprovements.science = 4;

    // Clear knights first so empty vertex selection sees clean vertices
    state.knights = {};
    state.players[0]!.strongKnightsRemaining = 2;
    state.players[1]!.strongKnightsRemaining = 2;

    // Place 4 Distance-Rule-valid extra settlements for p2 so p2 has 5 settlements on board and settlementsRemaining = 0!
    let placedExtra = 0;
    for (const vId of state.topology.vertexOrder) {
      if (placedExtra >= 4) break;
      if (state.buildings[vId]) continue;
      const vNode = state.topology.vertices[vId]!;
      if (vNode.adjacentVertexIds.some((adj) => Boolean(state.buildings[adj]))) {
        continue;
      }
      state.buildings[vId] = { ownerId: "p2", type: "settlement" };
      placedExtra++;
    }
    expect(placedExtra).toBe(4);
    state.players[1]!.settlementsRemaining = 0; // 5 settlements already on board!

    const knightSpots = state.topology.vertexOrder.filter(
      (vId) => !state.buildings[vId] && !state.knights[vId]
    );
    state.knights = {
      [knightSpots[0]!]: {
        ownerId: "p3",
        level: 1,
        active: true,
        activatedThisTurn: false,
        actedThisTurn: false,
        promotedThisTurn: false,
      },
      [knightSpots[1]!]: {
        ownerId: "p4",
        level: 1,
        active: true,
        activatedThisTurn: false,
        actedThisTurn: false,
        promotedThisTurn: false,
      },
    };
    state.players[2]!.basicKnightsRemaining = 1;
    state.players[3]!.basicKnightsRemaining = 1;

    // Barbarian strength = 4 cities, Defender strength = 2 -> Barbarians Win!
    // p1 has 0 strength, BUT p1's only city is a Metropolis (immune!), so ONLY p2 (0 strength, 1 vulnerable city) is pillaged!
    state.barbarianPosition = 6;
    const pillageRes = resolveEventDieRollPure(state, "barbarian", 5, []);
    state = pillageRes.state;

    expect(state.buildings[p1CityV]!.type).toBe("city"); // Metropolis untouched!
    expect(state.buildings[p2CityV]!.type).toBe("settlement"); // Auto-downgraded!
    expect(state.buildings[p2CityV]!.borrowedCityPiece).toBe(true); // Physical piece conservation preserved!
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("Progress Cards (Medicine, Crane, Engineer, Resource/Trade Monopoly, Merchant) and Player View Redaction", () => {
    let { state } = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "cities_and_knights" },
        "ck-progress-redaction"
      )
    );
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;

    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
      for (const c of COMMODITIES) {
        state.commodityBank[c] += p.commodities[c];
        p.commodities[c] = 0;
      }
    }

    const p1SettleV = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "settlement"
    )![0];
    const p1CityV = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "city"
    )![0];
    const adjLandHex = state.topology.vertices[p1CityV]!.adjacentHexIds.find(
      (hId) =>
        state.hexes[hId] &&
        TERRAIN_TO_RESOURCE_FOR_TEST(state.hexes[hId]!.terrain) !== null
    )!;

    grantCardFromDeckForTest(state, "p1", "pc-med", "medicine", "science");
    grantCardFromDeckForTest(state, "p1", "pc-eng", "engineer", "science");
    grantCardFromDeckForTest(state, "p1", "pc-tmono", "trade_monopoly", "trade");
    grantCardFromDeckForTest(state, "p1", "pc-merch", "merchant", "trade");
    state.players[1]!.commodities.paper = 2;
    state.commodityBank.paper -= 2;
    grantCardFromDeckForTest(state, "p2", "opp-secret", "spy", "politics");

    // Check getPlayerView redaction for p1 looking at p2!
    const viewForP1 = CatanEngine.getPlayerView(state, "p1");
    expect(totalCommodityCount(viewForP1.players[1]!.commodities)).toBe(0);
    expect(viewForP1.players[1]!.hiddenResourceCount).toBe(2); // includes commodities!
    expect(viewForP1.players[1]!.progressCards).toEqual([]);
    expect(viewForP1.players[1]!.hiddenProgressCardCount).toBe(1);

    // 1. Medicine -> upgrade settlement to city for only 2 Ore + 1 Grain!
    state.bank.ore -= 2;
    state.bank.grain -= 1;
    state.players[0]!.resources.ore = 2;
    state.players[0]!.resources.grain = 1;
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "pc-med",
    }).state;
    state = CatanEngine.applyAction(state, "p1", {
      type: "BUILD_CITY",
      vertexId: p1SettleV,
    }).state;
    expect(state.buildings[p1SettleV]!.type).toBe("city");
    expect(totalResourceCount(state.players[0]!.resources)).toBe(0);

    // 2. Engineer -> free City Wall (+2 safe hand limit -> 9)
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "pc-eng",
      params: { vertexId: p1CityV },
    }).state;
    expect(state.buildings[p1CityV]!.hasWall).toBe(true);
    expect(getPlayerSafeHandLimit(state, "p1")).toBe(9);

    // 3. Trade Monopoly (Paper) -> steals up to 1 Paper from each opponent holding it
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "pc-tmono",
      params: { commodity: "paper" },
    }).state;
    expect(state.players[0]!.commodities.paper).toBe(1);
    expect(state.players[1]!.commodities.paper).toBe(1);

    // 4. Merchant -> places cone on adjacent land hex (+1 VP + 2:1 bank rate on that hex's resource!)
    const vpBeforeMerch = computePlayerVictoryPoints(state, "p1", true);
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "pc-merch",
      params: { hexId: adjLandHex },
    }).state;
    expect(state.merchantOwnerId).toBe("p1");
    expect(state.merchantHexId).toBe(adjLandHex);
    expect(computePlayerVictoryPoints(state, "p1", true)).toBe(vpBeforeMerch + 1);
    const merchRes = TERRAIN_TO_RESOURCE_FOR_TEST(state.hexes[adjLandHex]!.terrain)!;
    expect(getPlayerGoodTradeRatios(state, "p1")[merchRes]).toBe(2);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

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

      const initial = CatanEngine.initGame(
        players,
        item.config,
        `ck-fuzz-${item.label}-2026`
      );
      let session = createMatchSessionState(CatanEngine, initial, true);
      let steps = 0;

      while (getSessionState(session).phase !== "GAME_OVER" && steps < 5000) {
        const cur = getSessionState(session);
        const actor = getNextActingPlayerId(cur);
        expect(actor).not.toBeNull();
        const act = CatanEngine.chooseBotAction(cur, actor!);
        expect(act).not.toBeNull();
        session = dispatchSessionActionPure(
          CatanEngine,
          session,
          actor!,
          act!,
          steps
        ).session;
        steps++;
      }

      const final = getSessionState(session);
      expect(final.phase).toBe("GAME_OVER");
      expect(final.winnerId).not.toBeNull();
      expect(
        computePlayerVictoryPoints(final, final.winnerId!, false)
      ).toBeGreaterThanOrEqual(final.config.targetVictoryPoints);
      expect(CatanEngine.checkInvariants(final).valid).toBe(true);
    }
  });
});

describe("@gaming-platform/catan - 5–6 Player Extension for Seafarers & Cities & Knights", () => {
  const SIX_PLAYERS: PlayerDescriptor[] = Array.from({ length: 6 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: "",
    isBot: true,
    botDifficulty: "smart",
  }));

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
        const initial = CatanEngine.initGame(
          simPlayers,
          item.config,
          `ext56-sim-${item.label}-2026`
        );
        let session = createMatchSessionState(CatanEngine, initial, true);
        let steps = 0;

        while (getSessionState(session).phase !== "GAME_OVER" && steps < 6000) {
          const cur = getSessionState(session);
          const actor = getNextActingPlayerId(cur);
          expect(actor).not.toBeNull();
          const act = CatanEngine.chooseBotAction(cur, actor!);
          expect(act).not.toBeNull();
          session = dispatchSessionActionPure(
            CatanEngine,
            session,
            actor!,
            act!,
            steps
          ).session;
          steps++;
        }

        const final = getSessionState(session);
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

function grantCardFromDeckForTest(
  state: ReturnType<typeof CatanEngine.initGame>,
  playerId: string,
  cardId: string,
  type: import("@gaming-platform/catan").ProgressCardType,
  discipline: import("@gaming-platform/catan").ImprovementDiscipline
): void {
  const deck = state.progressDecks[discipline];
  const idx = deck.indexOf(type);
  if (idx >= 0) {
    deck.splice(idx, 1);
  }
  const player = state.players.find((p) => p.id === playerId)!;
  player.progressCards.push({ id: cardId, type, discipline });
}

function TERRAIN_TO_RESOURCE_FOR_TEST(
  terrain: string
): "brick" | "lumber" | "wool" | "grain" | "ore" | null {
  switch (terrain) {
    case "hills":
      return "brick";
    case "forest":
      return "lumber";
    case "pasture":
      return "wool";
    case "fields":
      return "grain";
    case "mountains":
      return "ore";
    default:
      return null;
  }
}
