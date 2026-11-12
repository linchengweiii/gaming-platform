import { describe, expect, test } from "bun:test";
import type { PlayerDescriptor } from "@gaming-platform/core";
import { axialDistance } from "@gaming-platform/core";
import {
  CatanEngine,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  computePlayerVictoryPoints,
  getLegalMoveShipActions,
  getLegalRoadEdges,
  getLegalRobberHexes,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getNextActingPlayerId,
  recalculateAwards,
} from "@gaming-platform/catan";

const PLAYERS_4: PlayerDescriptor[] = [
  { id: "p1", name: "Alice", color: "#e63946", isBot: true },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: true },
  { id: "p3", name: "Charlie", color: "#f59e0b", isBot: true },
  { id: "p4", name: "Diana", color: "#10b981", isBot: true },
];

describe("Catan Executable Specification Suite", () => {
  test("SPEC 1: Standard board has exact terrain distribution, token distribution, 9 harbors, and no adjacent 6/8", () => {
    const state = CatanEngine.initGame(
      PLAYERS_4,
      { scenarioId: "standard", balancedNumbers: true },
      "spec-board-seed"
    );

    const tiles = Object.values(state.hexes);
    expect(tiles.length).toBe(19);

    const terrainCounts: Record<string, number> = {};
    const numberCounts: Record<number, number> = {};
    const redHexes: typeof tiles = [];

    for (const t of tiles) {
      terrainCounts[t.terrain] = (terrainCounts[t.terrain] ?? 0) + 1;
      if (t.numberToken !== null) {
        numberCounts[t.numberToken] = (numberCounts[t.numberToken] ?? 0) + 1;
      }
      if (t.numberToken === 6 || t.numberToken === 8) {
        redHexes.push(t);
      }
    }

    expect(terrainCounts).toEqual({
      forest: 4,
      pasture: 4,
      fields: 4,
      hills: 3,
      mountains: 3,
      desert: 1,
    });

    expect(numberCounts).toEqual({
      2: 1,
      3: 2,
      4: 2,
      5: 2,
      6: 2,
      8: 2,
      9: 2,
      10: 2,
      11: 2,
      12: 1,
    });

    // No two 6/8 tokens are adjacent on a balanced board
    for (let i = 0; i < redHexes.length; i++) {
      for (let j = i + 1; j < redHexes.length; j++) {
        expect(axialDistance(redHexes[i]!, redHexes[j]!)).toBeGreaterThan(1);
      }
    }

    // 9 harbors: four 3:1 generic and five 2:1 resource harbors
    expect(state.harbors.length).toBe(9);
    const genericCount = state.harbors.filter((h) => h.type === "generic").length;
    expect(genericCount).toBe(4);
  });

  test("SPEC 2: Distance Rule prohibits adjacent settlements and road must attach to setup anchor", () => {
    let state = CatanEngine.initGame(PLAYERS_4, { scenarioId: "standard" }, "spec-setup");
    const firstVertex = state.topology.vertexOrder[0]!;
    const vNode = state.topology.vertices[firstVertex]!;

    state = CatanEngine.applyAction(state, "p1", {
      type: "PLACE_SETUP_SETTLEMENT",
      vertexId: firstVertex,
    }).state;

    // Must place road attached to `firstVertex`; non-incident edges are illegal
    const nonIncidentEdge = state.topology.edgeOrder.find(
      (eId) => !vNode.incidentEdgeIds.includes(eId)
    )!;
    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "PLACE_SETUP_EDGE",
        edgeId: nonIncidentEdge,
        edgeKind: "road",
      })
    ).toThrow();

    // Place valid incident road
    const validEdge = vNode.incidentEdgeIds[0]!;
    state = CatanEngine.applyAction(state, "p1", {
      type: "PLACE_SETUP_EDGE",
      edgeId: validEdge,
      edgeKind: "road",
    }).state;

    // Now p2's turn: neither `firstVertex` nor any of its adjacent vertices may be settled
    const p2LegalVertices = getLegalSettlementVertices(state, "p2", true);
    expect(p2LegalVertices).not.toContain(firstVertex);
    for (const adjVId of vNode.adjacentVertexIds) {
      expect(p2LegalVertices).not.toContain(adjVId);
    }
  });

  test("SPEC 3: Resource production yields 1 for Settlement, 2 for City, 0 if Robber present, and obeys Bank Shortage rule", () => {
    let state = CatanEngine.initGame(PLAYERS_4, { scenarioId: "standard" }, "spec-prod");
    // Advance past setup
    while (state.phase.startsWith("SETUP_")) {
      const actor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(
        state,
        actor,
        CatanEngine.chooseBotAction(state, actor)!
      ).state;
    }

    // Pick a productive hex not blocked by the Robber
    const targetHex = Object.values(state.hexes).find(
      (h) => h.terrain !== "desert" && h.id !== state.robberHexId && h.numberToken !== null
    )!;
    const resType = TERRAIN_TO_RESOURCE[targetHex.terrain]!;
    const hNode = state.topology.hexes[targetHex.id]!;

    // Reset buildings & hands for clean production test
    state.buildings = {};
    for (const p of state.players) {
      p.settlementsRemaining = 5;
      p.citiesRemaining = 4;
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }

    // Place p1 City on corner 0 and p2 Settlement on corner 2 of targetHex
    state.buildings[hNode.cornerVertexIds[0]!] = { ownerId: "p1", type: "city" };
    state.players[0]!.citiesRemaining--;
    state.buildings[hNode.cornerVertexIds[2]!] = { ownerId: "p2", type: "settlement" };
    state.players[1]!.settlementsRemaining--;

    // Ensure no other hex shares targetHex.numberToken for isolated verification
    for (const h of Object.values(state.hexes)) {
      if (h.id !== targetHex.id && h.numberToken === targetHex.numberToken) {
        h.numberToken = targetHex.numberToken === 12 ? 2 : 12;
      }
    }

    // Bank Shortage test: if bank only has 2 of `resType`, and total demand is 2 (p1) + 1 (p2) = 3,
    // NEITHER player gets any `resType`!
    state.bank[resType] = 2;
    state.players[3]!.resources[resType] = 17; // keep total conservation = 19

    // Find an RNG seed state that rolls targetHex.numberToken, or trigger roll loop
    for (let seedTry = 1; seedTry < 500; seedTry++) {
      const testState = structuredClone(state);
      testState.rngState = seedTry;
      const rolled = CatanEngine.applyAction(testState, "p1", { type: "ROLL_DICE" }).state;
      if (rolled.lastRoll?.total === targetHex.numberToken) {
        // Because bank had 2 < 3 demanded by 2 players, neither p1 nor p2 received any!
        expect(rolled.players[0]!.resources[resType]).toBe(0);
        expect(rolled.players[1]!.resources[resType]).toBe(0);
        expect(rolled.bank[resType]).toBe(2);

        // Now restore full bank and roll the exact same seed -> p1 gets 2, p2 gets 1!
        const fullBankState = structuredClone(state);
        fullBankState.bank[resType] = 19;
        fullBankState.players[3]!.resources[resType] = 0;
        fullBankState.rngState = seedTry;
        const produced = CatanEngine.applyAction(fullBankState, "p1", {
          type: "ROLL_DICE",
        }).state;
        expect(produced.players[0]!.resources[resType]).toBe(2);
        expect(produced.players[1]!.resources[resType]).toBe(1);

        // If Robber is on targetHex, production is 0!
        const robbedState = structuredClone(fullBankState);
        robbedState.robberHexId = targetHex.id;
        const blocked = CatanEngine.applyAction(robbedState, "p1", {
          type: "ROLL_DICE",
        }).state;
        expect(blocked.players[0]!.resources[resType]).toBe(0);
        expect(blocked.players[1]!.resources[resType]).toBe(0);
        break;
      }
    }
  });

  test("SPEC 4: Roll of 7 forces players with >7 cards to discard floor(n/2), then moves Robber and steals", () => {
    let state = CatanEngine.initGame(PLAYERS_4, { scenarioId: "standard" }, "spec-seven");
    while (state.phase.startsWith("SETUP_")) {
      const actor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(
        state,
        actor,
        CatanEngine.chooseBotAction(state, actor)!
      ).state;
    }

    // Reset hands and give p2 8 cards (must discard 4) and p3 7 cards (safe!)
    for (const p of state.players) {
      for (const r of RESOURCES) {
        state.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    state.bank.brick -= 8;
    state.players[1]!.resources.brick = 8;
    state.bank.lumber -= 7;
    state.players[2]!.resources.lumber = 7;

    for (let seedTry = 1; seedTry < 200; seedTry++) {
      const candidate = structuredClone(state);
      candidate.rngState = seedTry;
      const rolled = CatanEngine.applyAction(candidate, "p1", { type: "ROLL_DICE" }).state;
      if (rolled.lastRoll?.total === 7) {
        expect(rolled.phase).toBe("DISCARD_ON_SEVEN");
        expect(rolled.pendingDiscards["p2"]).toBe(4);
        expect(rolled.pendingDiscards["p3"]).toBeUndefined();

        const afterDiscard = CatanEngine.applyAction(rolled, "p2", {
          type: "DISCARD_CARDS",
          resources: { brick: 4 },
        }).state;
        expect(afterDiscard.players[1]!.resources.brick).toBe(4);
        expect(afterDiscard.phase).toBe("MOVE_ROBBER_OR_PIRATE");
        expect(CatanEngine.checkInvariants(afterDiscard).valid).toBe(true);
        break;
      }
    }
  });

  test("SPEC 5: Upgrading a Settlement to a City returns the Settlement piece to the player's supply", () => {
    let state = CatanEngine.initGame(PLAYERS_4, { scenarioId: "standard" }, "spec-city");
    while (state.phase.startsWith("SETUP_")) {
      const actor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(
        state,
        actor,
        CatanEngine.chooseBotAction(state, actor)!
      ).state;
    }

    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;
    const p1 = state.players[0]!;
    expect(p1.settlementsRemaining).toBe(3);
    expect(p1.citiesRemaining).toBe(4);

    const p1SettlementVId = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === "p1" && b.type === "settlement"
    )![0];

    state.bank.grain -= 2;
    state.bank.ore -= 3;
    p1.resources.grain += 2;
    p1.resources.ore += 3;

    state = CatanEngine.applyAction(state, "p1", {
      type: "BUILD_CITY",
      vertexId: p1SettlementVId,
    }).state;

    expect(state.players[0]!.settlementsRemaining).toBe(4);
    expect(state.players[0]!.citiesRemaining).toBe(3);
    expect(state.buildings[p1SettlementVId]!.type).toBe("city");
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 6: Seafarers road-to-ship transition requires a coastal settlement/city at the shared vertex, and open ships can move once per turn", () => {
    let state = CatanEngine.initGame(
      PLAYERS_4,
      { scenarioId: "seafarers_new_shores" },
      "spec-seafarers"
    );
    while (state.phase.startsWith("SETUP_")) {
      const actor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(
        state,
        actor,
        CatanEngine.chooseBotAction(state, actor)!
      ).state;
    }

    // Find a coastal vertex touching both a land edge and a sea edge
    state.buildings = {};
    state.edges = {};
    state.players.forEach((p) => {
      p.settlementsRemaining = 5;
      p.roadsRemaining = 15;
      p.shipsRemaining = 15;
    });

    let coastalVertexId: string | null = null;
    let landEdgeId: string | null = null;
    let seaEdgeId: string | null = null;

    for (const vId of state.topology.vertexOrder) {
      const vNode = state.topology.vertices[vId]!;
      const incEdges = vNode.incidentEdgeIds.map((eId) => state.topology.edges[eId]!);
      const pureLand = incEdges.find((e) =>
        e.adjacentHexIds.every((hId) => state.hexes[hId]?.terrain !== "sea")
      );
      const hasSea = incEdges.find((e) =>
        e.adjacentHexIds.some((hId) => state.hexes[hId]?.terrain === "sea")
      );
      if (pureLand && hasSea && pureLand.id !== hasSea.id) {
        coastalVertexId = vId;
        landEdgeId = pureLand.id;
        seaEdgeId = hasSea.id;
        break;
      }
    }

    expect(coastalVertexId).not.toBeNull();
    state.edges[landEdgeId!] = { ownerId: "p1", type: "road", builtOnTurn: 1 };
    state.edges[seaEdgeId!] = { ownerId: "p1", type: "ship", builtOnTurn: 1 };
    state.players[0]!.roadsRemaining--;
    state.players[0]!.shipsRemaining--;

    // Without a settlement at coastalVertexId, road and ship do NOT combine into a length-2 route!
    recalculateAwards(state);
    expect(state.players[0]!.longestRoadLength).toBe(1);

    // Place p1 settlement at coastalVertexId -> now road + ship combine into a length-2 trade route!
    state.buildings[coastalVertexId!] = { ownerId: "p1", type: "settlement" };
    state.players[0]!.settlementsRemaining--;
    recalculateAwards(state);
    expect(state.players[0]!.longestRoadLength).toBe(2);

    // Test moving the open ship on turn 2
    state.turn = 2;
    state.phase = "MAIN_PHASE";
    state.activePlayerIndex = 0;
    state.pirateHexId = null;

    const moveActions = getLegalMoveShipActions(state, "p1");
    expect(moveActions.length).toBeGreaterThan(0);
    state = CatanEngine.applyAction(state, "p1", moveActions[0]!).state;
    expect(state.players[0]!.hasMovedShipThisTurn).toBe(true);
    expect(getLegalMoveShipActions(state, "p1").length).toBe(0); // Only once per turn
    expect(CatanEngine.checkInvariants(state).valid).toBe(true);
  });

  test("SPEC 7: Friendly Robber prevents moving the Robber onto a hex with a player who has <= 2 visible VP", () => {
    let state = CatanEngine.initGame(
      PLAYERS_4,
      { scenarioId: "standard", enableFriendlyRobber: true },
      "spec-friendly"
    );
    while (state.phase.startsWith("SETUP_")) {
      const actor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(
        state,
        actor,
        CatanEngine.chooseBotAction(state, actor)!
      ).state;
    }

    // At the end of setup, all players have exactly 2 visible VP (2 settlements).
    // Any hex with an opponent's settlement has a player with <= 2 visible VP!
    const legalRobberHexes = getLegalRobberHexes(state, "p1");
    for (const hId of legalRobberHexes) {
      const hNode = state.topology.hexes[hId]!;
      const hasOpponentWith2Vp = hNode.cornerVertexIds.some((vId) => {
        const b = state.buildings[vId];
        return b && b.ownerId !== "p1" && computePlayerVictoryPoints(state, b.ownerId, true) <= 2;
      });
      expect(hasOpponentWith2Vp).toBe(false);
    }
  });
});
