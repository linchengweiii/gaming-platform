import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  type CatanState,
  getDiplomatRemovableRoadEdges,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  getLegalRobberHexes,
} from "@gaming-platform/catan";
import {
  FOUR_PLAYERS,
  SIX_PLAYERS,
  completeSnakeDraftSetup,
  grantCardFromDeckForTest,
  resetAllPlayerHandsToBank,
} from "./helpers.ts";

function makeCkMainPhase(seed: string): CatanState {
  const init = CatanEngine.initGame(
    FOUR_PLAYERS,
    { scenarioId: "cities_and_knights", enableCitiesAndKnights: true },
    seed
  );
  const done = completeSnakeDraftSetup(init).state;
  return { ...done, phase: "MAIN_PHASE", activePlayerIndex: 0, turn: 5 };
}

describe("@gaming-platform/catan - Rules Audit Regression Suite", () => {
  test("Smith enforces once-per-turn knight promotion rule while allowing same-turn build + single promotion", () => {
    const base = structuredClone(makeCkMainPhase("audit-smith-once"));
    resetAllPlayerHandsToBank(base);
    const p1Id = base.players[0]!.id;
    base.players[0]!.cityImprovements.politics = 3; // Fortress unlocked
    grantCardFromDeckForTest(base, p1Id, "smith-1", "smith", "science");

    const p1Road = Object.entries(base.edges).find(
      ([, r]) => r.ownerId === p1Id && r.type === "road"
    )![0];
    const roadNode = base.topology.edges[p1Road]!;
    const vKnight = !base.buildings[roadNode.v1] ? roadNode.v1 : roadNode.v2;

    // Give p1 Wool + Ore to build a brand-new Basic Knight, then pay Wool + Ore to promote to Strong
    base.players[0]!.resources.wool = 2;
    base.players[0]!.resources.ore = 2;
    base.bank.wool -= 2;
    base.bank.ore -= 2;

    let s = CatanEngine.applyAction(base, p1Id, {
      type: "BUILD_KNIGHT",
      vertexId: vKnight,
    }).state;

    // Newly built Basic Knight CAN be promoted once via Smith on the same turn
    expect(
      CatanEngine.getLegalActions(s, p1Id).some(
        (a) =>
          a.type === "PLAY_PROGRESS_CARD" &&
          a.cardId === "smith-1" &&
          a.params?.vertexIds?.includes(vKnight)
      )
    ).toBe(true);

    // Promote it via PROMOTE_KNIGHT (Basic -> Strong, promotedThisTurn = true)
    s = CatanEngine.applyAction(s, p1Id, {
      type: "PROMOTE_KNIGHT",
      vertexId: vKnight,
    }).state;
    expect(s.knights[vKnight]?.level).toBe(2);
    expect(s.knights[vKnight]?.promotedThisTurn).toBe(true);

    // Smith must NOT allow promoting that same knight again on the same turn!
    expect(
      CatanEngine.getLegalActions(s, p1Id).some(
        (a) => a.type === "PLAY_PROGRESS_CARD" && a.cardId === "smith-1"
      )
    ).toBe(false);
    expect(() =>
      CatanEngine.applyAction(s, p1Id, {
        type: "PLAY_PROGRESS_CARD",
        cardId: "smith-1",
        params: { vertexIds: [vKnight] },
      })
    ).toThrow();
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });

  test("Seafarers + C&K: Diplomat ignores unconnected own ships and MOVE_SHIP refuses to leave own knight stranded", () => {
    const sfCk = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        {
          scenarioId: "seafarers_new_shores",
          enableSeafarers: true,
          enableCitiesAndKnights: true,
        },
        "audit-diplomat-knight-ship"
      )
    ).state;

    // Find a coastal vertex with a pure-land edge and a sea-touching edge
    let sharedV: string | null = null;
    let roadEdge: string | null = null;
    let shipEdge: string | null = null;
    for (const vId of sfCk.topology.vertexOrder) {
      const vNode = sfCk.topology.vertices[vId]!;
      const landE = vNode.incidentEdgeIds.find((eId) =>
        sfCk.topology.edges[eId]!.adjacentHexIds.every(
          (h) => sfCk.hexes[h]?.terrain !== "sea"
        )
      );
      const seaE = vNode.incidentEdgeIds.find((eId) =>
        sfCk.topology.edges[eId]!.adjacentHexIds.some(
          (h) => sfCk.hexes[h]?.terrain === "sea"
        )
      );
      if (landE && seaE && landE !== seaE) {
        sharedV = vId;
        roadEdge = landE;
        shipEdge = seaE;
        break;
      }
    }
    expect(sharedV).not.toBeNull();

    const rNode = sfCk.topology.edges[roadEdge!]!;
    const roadOtherV = rNode.v1 === sharedV ? rNode.v2 : rNode.v1;
    const sNode = sfCk.topology.edges[shipEdge!]!;
    const shipOtherV = sNode.v1 === sharedV ? sNode.v2 : sNode.v1;

    // Coastal road touches own settlement at roadOtherV and ONLY an unconnected own ship at sharedV
    const diplomatState: CatanState = {
      ...sfCk,
      turn: 5,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      pirateHexId: null,
      buildings: {
        [roadOtherV]: { ownerId: "p1", type: "settlement" },
      },
      edges: {
        [roadEdge!]: { ownerId: "p1", type: "road", builtOnTurn: 1 },
        [shipEdge!]: { ownerId: "p1", type: "ship", builtOnTurn: 1 },
      },
      knights: {},
    };
    expect(getDiplomatRemovableRoadEdges(diplomatState)).toContain(roadEdge!);

    // Now place p1's settlement at sharedV and p1's knight at shipOtherV -> ship is anchored at BOTH ends and cannot move!
    const anchoredShipState: CatanState = {
      ...diplomatState,
      buildings: {
        [sharedV!]: { ownerId: "p1", type: "settlement" },
      },
      knights: {
        [shipOtherV]: {
          ownerId: "p1",
          level: 1,
          active: false,
          activatedThisTurn: false,
          actedThisTurn: false,
          promotedThisTurn: false,
        },
      },
    };
    expect(
      getLegalMoveShipActions(anchoredShipState, "p1").some(
        (m) => m.fromEdgeId === shipEdge
      )
    ).toBe(false);
  });

  test("Friendly Robber protects <= 3 visible VP in Cities & Knights (for Robber and Pirate) and unlocks at 4+ VP", () => {
    const ck = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        {
          scenarioId: "seafarers_new_shores",
          enableCitiesAndKnights: true,
          enableFriendlyRobber: true,
        },
        "audit-ck-friendly"
      )
    ).state;

    // After C&K setup, every player has 3 visible VP (1 settlement + 1 city) -> all opponents are protected!
    const legalAt3Vp = getLegalRobberHexes(ck, "p1");
    for (const hId of legalAt3Vp) {
      const hNode = ck.topology.hexes[hId]!;
      const touchesProtectedOpp = hNode.cornerVertexIds.some((vId) => {
        const b = ck.buildings[vId];
        return Boolean(b && b.ownerId !== "p1");
      });
      expect(touchesProtectedOpp).toBe(false);
    }

    // Pirate Friendly Robber also protects 3-VP opponent ships in C&K
    const oppSeaHex = ck.topology.hexOrder.find(
      (hId) => hId !== ck.pirateHexId && ck.hexes[hId]!.terrain === "sea"
    )!;
    const oppShipEdge = ck.topology.hexes[oppSeaHex]!.sideEdgeIds[0]!;
    const withOppShip: CatanState = {
      ...ck,
      edges: {
        ...ck.edges,
        [oppShipEdge]: { ownerId: "p2", type: "ship", builtOnTurn: 1 },
      },
    };
    expect(getLegalPirateHexes(withOppShip, "p1")).not.toContain(oppSeaHex);

    // Once p2 reaches 4 visible VP, p2's sea hex becomes targetable!
    const p2At4Vp: CatanState = {
      ...withOppShip,
      players: withOppShip.players.map((p) =>
        p.id === "p2" ? { ...p, defenderPoints: 1 } : p
      ),
    };
    expect(getLegalPirateHexes(p2At4Vp, "p1")).toContain(oppSeaHex);
  });

  test("Alchemist enumerates all 36 (die1, die2) pairs and Crane Lv 1 free upgrade is recognized by bots", () => {
    const ck = structuredClone(makeCkMainPhase("audit-alch-crane"));
    resetAllPlayerHandsToBank(ck);
    const p1Id = ck.players[0]!.id;
    grantCardFromDeckForTest(ck, p1Id, "alch-all", "alchemist", "science");
    const preRollState: CatanState = { ...ck, phase: "PRE_ROLL" };

    const alchActions = CatanEngine.getLegalActions(preRollState, p1Id).filter(
      (a): a is Extract<typeof a, { type: "PLAY_PROGRESS_CARD" }> =>
        a.type === "PLAY_PROGRESS_CARD" && a.cardId === "alch-all"
    );
    expect(alchActions).toHaveLength(36);
    expect(
      alchActions.some((a) => a.params?.die1 === 6 && a.params?.die2 === 2)
    ).toBe(true);
    expect(
      alchActions.some((a) => a.params?.die1 === 2 && a.params?.die2 === 6)
    ).toBe(true);

    // Crane with 0 commodities makes Lv 1 City Improvement free -> bot should play Crane!
    const craneState = structuredClone(makeCkMainPhase("audit-crane-free"));
    resetAllPlayerHandsToBank(craneState);
    grantCardFromDeckForTest(craneState, p1Id, "crane-free", "crane", "science");
    const botPick = CatanEngine.chooseBotAction(craneState, p1Id);
    expect(botPick).toEqual({
      type: "PLAY_PROGRESS_CARD",
      cardId: "crane-free",
    });
  });

  test("PLAY_KNIGHT wins immediately upon reaching target VP via Largest Army and END_TURN rejects unresolved trade offers", () => {
    let base = completeSnakeDraftSetup(
      CatanEngine.initGame(FOUR_PLAYERS, { scenarioId: "standard" }, "audit-knight-win")
    ).state;
    base = {
      ...base,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      turn: 4,
      players: base.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              bonusVictoryPoints: 6, // 2 setup + 6 bonus = 8 VP; Largest Army (+2) reaches 10 VP!
              knightsPlayed: 2,
              devCards: [
                { id: "k-win", type: "knight", boughtOnTurn: 1, played: false },
              ],
              resources: { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 },
            }
          : { ...p, resources: { brick: 0, lumber: 1, wool: 0, grain: 0, ore: 0 } }
      ),
    };

    const offered = CatanEngine.applyAction(base, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: "p2",
      give: { brick: 1 },
      want: { lumber: 1 },
    }).state;
    expect(offered.activeTradeOffer).not.toBeNull();
    expect(() =>
      CatanEngine.applyAction(offered, "p1", { type: "END_TURN" })
    ).toThrow();

    // Playing 3rd Knight claims Largest Army (10 VP) and ends the game immediately without robber step
    const won = CatanEngine.applyAction(base, "p1", {
      type: "PLAY_KNIGHT",
    }).state;
    expect(won.phase).toBe("GAME_OVER");
    expect(won.winnerId).toBe("p1");
    expect(won.largestArmyOwnerId).toBe("p1");
  });

  test("Seafarers Four/Six Islands start Robber off-board, Fog Gold avoids empty bank stacks, and invariants verify City Walls", () => {
    const fourIslands = CatanEngine.initGame(
      FOUR_PLAYERS,
      { scenarioId: "seafarers_four_islands" },
      "audit-four-robber"
    );
    expect(fourIslands.robberHexId).toBe("");
    const sixIslands = CatanEngine.initGame(
      SIX_PLAYERS,
      { scenarioId: "seafarers_six_islands_5_6" },
      "audit-six-robber"
    );
    expect(sixIslands.robberHexId).toBe("");
    expect(CatanEngine.checkInvariants(fourIslands).valid).toBe(true);
    expect(CatanEngine.checkInvariants(sixIslands).valid).toBe(true);

    // Fog reveal of Gold when 4 of 5 bank stacks are empty still grants the 1 available bank resource
    const fog = completeSnakeDraftSetup(
      CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "seafarers_fog_islands" },
        "audit-fog-gold-bank"
      )
    ).state;
    const fogEdge = fog.topology.edgeOrder.find((eId) => {
      const en = fog.topology.edges[eId]!;
      const hasSea = en.adjacentHexIds.some((h) => fog.hexes[h]!.terrain === "sea");
      const touchesFog = [
        ...fog.topology.vertices[en.v1]!.adjacentHexIds,
        ...fog.topology.vertices[en.v2]!.adjacentHexIds,
      ].some((h) => fog.hexes[h]!.terrain === "fog");
      return hasSea && touchesFog;
    })!;
    const fogEdgeNode = fog.topology.edges[fogEdge]!;
    const preFog: CatanState = {
      ...fog,
      phase: "ROAD_BUILDING_DEV",
      freeRoadsRemaining: 1,
      turn: 4,
      activePlayerIndex: 0,
      pirateHexId: null,
      fogPool: Array.from({ length: 4 }, () => ({
        terrain: "gold" as const,
        numberToken: 6,
      })),
      bank: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 3 },
      buildings: {
        [fogEdgeNode.v1]: { ownerId: "p1", type: "settlement" },
      },
      edges: {},
      players: fog.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              resources: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
            }
          : p
      ),
    };
    const afterFog = CatanEngine.applyAction(preFog, "p1", {
      type: "BUILD_SHIP",
      edgeId: fogEdge,
    }).state;
    expect(afterFog.players[0]!.resources.ore).toBeGreaterThanOrEqual(1);

    // City Wall invariant catches supply corruption
    const ck = makeCkMainPhase("audit-wall-inv");
    const corruptedWalls: CatanState = {
      ...ck,
      players: ck.players.map((p, idx) =>
        idx === 0 ? { ...p, cityWallsRemaining: 1 } : p
      ),
    };
    const inv = CatanEngine.checkInvariants(corruptedWalls);
    expect(inv.valid).toBe(false);
    expect(inv.violations.some((v) => v.includes("city wall count mismatch"))).toBe(
      true
    );
  });
});
