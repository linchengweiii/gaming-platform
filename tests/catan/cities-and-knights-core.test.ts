import { describe, expect, test } from "bun:test";
import {
  COMMODITIES,
  CatanEngine,
  RESOURCES,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerGoodTradeRatios,
  recalculateAwardsPure,
} from "@gaming-platform/catan";
import {
  FOUR_PLAYERS,
  completeSnakeDraftSetup,
  grantCardFromDeckForTest,
} from "./helpers.ts";

describe("@gaming-platform/catan - Cities & Knights Core Mechanics", () => {
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

    state = recalculateAwardsPure(state);
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

    state = recalculateAwardsPure(state);
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
    // If p2 has legal retreat spots, p2 chooses where their displaced knight retreats!
    if (state.phase === "CK_INTERACTION") {
      const retreatAct = CatanEngine.getLegalActions(state, "p2").find(
        (a) => a.type === "RESOLVE_DISPLACED_KNIGHT"
      )!;
      expect(retreatAct).toBeDefined();
      state = CatanEngine.applyAction(state, "p2", retreatAct).state;
      expect(state.phase).toBe("MAIN_PHASE");
    }

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
});
