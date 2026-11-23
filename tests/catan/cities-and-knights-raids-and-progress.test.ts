import { describe, expect, test } from "bun:test";
import {
  COMMODITIES,
  CatanEngine,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerGoodTradeRatios,
  getPlayerSafeHandLimit,
  resolveEventDieRollPure,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  FOUR_PLAYERS,
  completeSnakeDraftSetup,
  grantCardFromDeckForTest,
} from "./helpers.ts";

describe("@gaming-platform/catan - Cities & Knights Barbarian Raids & Progress Cards", () => {
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
        TERRAIN_TO_RESOURCE[state.hexes[hId]!.terrain] !== null
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
    const merchRes = TERRAIN_TO_RESOURCE[state.hexes[adjLandHex]!.terrain]!;
    expect(getPlayerGoodTradeRatios(state, "p1")[merchRes]).toBe(2);
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });
});
