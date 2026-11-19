import { describe, expect, test } from "bun:test";
import { axialDistance } from "@gaming-platform/core";
import {
  CatanEngine,
  type CatanState,
  generateCatanBoardPure,
  getLegalBuildKnightVertices,
  getNextActingPlayerId,
  resolveDefaultConfig,
} from "@gaming-platform/catan";
import {
  FOUR_PLAYERS,
  SIX_PLAYERS,
  completeSnakeDraftSetup,
} from "./helpers.ts";

function makePostSetup(
  count: 4 | 5 | 6,
  config: Partial<CatanState["config"]>,
  seed: number
): CatanState {
  const players =
    count === 4 ? FOUR_PLAYERS : SIX_PLAYERS.slice(0, count);
  const init = CatanEngine.initGame(players, config, seed);
  return completeSnakeDraftSetup(init).state;
}

describe("@gaming-platform/catan - Critical & High Rules Regression Suite", () => {
  test("rejects negative, fractional, and non-C&K commodity quantities in DISCARD_CARDS and OFFER_DOMESTIC_TRADE", () => {
    let state = makePostSetup(4, { scenarioId: "standard" }, 101);
    const p1 = state.players[0]!;
    state = {
      ...state,
      phase: "DISCARD_ON_SEVEN",
      pendingDiscards: { [p1.id]: 4 },
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              resources: { brick: 5, lumber: 3, wool: 0, grain: 0, ore: 0 },
            }
          : p
      ),
    };

    expect(() =>
      CatanEngine.applyAction(state, p1.id, {
        type: "DISCARD_CARDS",
        resources: { brick: 5, ore: -1 },
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, p1.id, {
        type: "DISCARD_CARDS",
        resources: { brick: 2.5, lumber: 1.5 },
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, p1.id, {
        type: "DISCARD_CARDS",
        resources: { brick: 3 },
        commodities: { paper: 1 },
      })
    ).toThrow();

    const mainState: CatanState = {
      ...state,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      pendingDiscards: {},
    };
    expect(() =>
      CatanEngine.applyAction(mainState, p1.id, {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: state.players[1]!.id,
        give: { brick: 2, ore: -1 },
        want: { lumber: 1 },
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(mainState, p1.id, {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: state.players[1]!.id,
        give: { brick: 1.5 },
        want: { lumber: 1 },
      })
    ).toThrow();
  });

  test("Science road_building does not softlock at 0 edges, and Base PLAY_ROAD_BUILDING grants 2 roads when 1st road opens 2nd", () => {
    let ck = makePostSetup(
      4,
      { scenarioId: "cities_and_knights", enableCitiesAndKnights: true },
      102
    );
    ck = { ...ck, phase: "MAIN_PHASE", activePlayerIndex: 0, turn: 5 };
    const p1 = ck.players[0]!;
    ck = {
      ...ck,
      players: ck.players.map((p) =>
        p.id === p1.id
          ? {
              ...p,
              roadsRemaining: 0,
              shipsRemaining: 0,
              progressCards: [
                { id: "rb-1", type: "road_building", discipline: "science" },
              ],
            }
          : p
      ),
    };
    const afterRb = CatanEngine.applyAction(ck, p1.id, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "rb-1",
    }).state;
    expect(afterRb.phase).toBe("MAIN_PHASE");
    expect(afterRb.freeRoadsRemaining).toBe(0);
    expect(CatanEngine.getLegalActions(afterRb, p1.id).length).toBeGreaterThan(0);

    let base = makePostSetup(4, { scenarioId: "standard" }, 103);
    base = { ...base, phase: "MAIN_PHASE", activePlayerIndex: 0, turn: 4 };
    const actorId = base.players[0]!.id;
    const vStart = base.topology.vertexOrder.find(
      (vId) => base.topology.vertices[vId]!.incidentEdgeIds.length === 3
    )!;
    const [eOpen, eBlock1, eBlock2] = base.topology.vertices[vStart]!
      .incidentEdgeIds as [string, string, string];
    base = {
      ...base,
      buildings: { [vStart]: { ownerId: actorId, type: "settlement" } },
      edges: {
        [eBlock1]: { ownerId: "p2", type: "road", builtOnTurn: 1 },
        [eBlock2]: { ownerId: "p2", type: "road", builtOnTurn: 1 },
      },
      players: base.players.map((p) =>
        p.id === actorId
          ? {
              ...p,
              roadsRemaining: 10,
              devCards: [
                {
                  id: "dev-rb",
                  type: "road_building",
                  boughtOnTurn: 1,
                  played: false,
                },
              ],
              hasPlayedDevCardThisTurn: false,
            }
          : p
      ),
    };
    const afterPlay = CatanEngine.applyAction(base, actorId, {
      type: "PLAY_ROAD_BUILDING",
    }).state;
    expect(afterPlay.phase).toBe("ROAD_BUILDING_DEV");
    expect(afterPlay.freeRoadsRemaining).toBe(2);
    const afterFirst = CatanEngine.applyAction(afterPlay, actorId, {
      type: "BUILD_ROAD",
      edgeId: eOpen,
    }).state;
    expect(afterFirst.phase).toBe("ROAD_BUILDING_DEV");
    expect(afterFirst.freeRoadsRemaining).toBe(1);
  });

  test("5-6P Special Building Phase updates VP/awards but defers victory until the player's own turn", () => {
    let state = makePostSetup(
      5,
      {
        scenarioId: "big_island_5_6",
        enable56PlayerExtension: true,
        enableSpecialBuildingPhase: true,
        targetVictoryPoints: 10,
      },
      204
    );
    const p2Id = state.players[1]!.id;
    const p2SettlementV = Object.entries(state.buildings).find(
      ([, b]) => b.ownerId === p2Id && b.type === "settlement"
    )![0];
    state = {
      ...state,
      phase: "SPECIAL_BUILDING",
      activePlayerIndex: 0,
      specialBuildPlayerIndex: 1,
      players: state.players.map((p) =>
        p.id === p2Id
          ? {
              ...p,
              bonusVictoryPoints: 7,
              resources: { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 },
            }
          : p
      ),
    };
    state = CatanEngine.applyAction(state, p2Id, {
      type: "BUILD_CITY",
      vertexId: p2SettlementV,
    }).state;
    expect(state.phase).toBe("SPECIAL_BUILDING");
    expect(state.winnerId).toBeNull();

    while (state.phase === "SPECIAL_BUILDING") {
      const sbActor = getNextActingPlayerId(state)!;
      state = CatanEngine.applyAction(state, sbActor, {
        type: "END_SPECIAL_BUILD",
      }).state;
    }
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winnerId).toBe(p2Id);
  });

  test("all three 3-4P Seafarers boards strictly separate distinct islands and fog belt by sea (axialDistance >= 2)", () => {
    for (const scenarioId of [
      "seafarers_new_shores",
      "seafarers_four_islands",
      "seafarers_fog_islands",
    ] as const) {
      const cfg = resolveDefaultConfig(4, { scenarioId });
      const [board] = generateCatanBoardPure(cfg, 4242);
      const nonSeaTiles = Object.values(board.hexes).filter(
        (h) => h.terrain !== "sea"
      );
      for (let i = 0; i < nonSeaTiles.length; i++) {
        const a = nonSeaTiles[i]!;
        for (let j = i + 1; j < nonSeaTiles.length; j++) {
          const b = nonSeaTiles[j]!;
          if (a.islandId !== b.islandId) {
            expect(axialDistance(a, b)).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  });

  test("Harbormaster award transfers cleanly when Barbarians pillage a harbor city", () => {
    let state = makePostSetup(
      4,
      {
        scenarioId: "cities_and_knights",
        enableCitiesAndKnights: true,
        enableHarbormaster: true,
      },
      305
    );
    const [h1, , h2, , h3, , h4] = state.harbors;
    const p1 = state.players[0]!.id;
    const p2 = state.players[1]!.id;
    state = {
      ...state,
      buildings: {
        [h1!.vertexIds[0]]: { ownerId: p1, type: "city" },
        [h2!.vertexIds[0]]: { ownerId: p1, type: "settlement" },
        [h3!.vertexIds[0]]: { ownerId: p2, type: "city" },
        [h4!.vertexIds[0]]: { ownerId: p2, type: "settlement" },
      },
      harbormasterOwnerId: p1,
      harbormasterPoints: 3,
      phase: "BARBARIAN_PILLAGE_SELECTION",
      pendingPillageSelections: [p1],
    };
    const afterPillage = CatanEngine.applyAction(state, p1, {
      type: "SELECT_PILLAGED_CITY",
      vertexId: h1!.vertexIds[0],
    }).state;
    expect(afterPillage.harbormasterOwnerId).toBe(p2);
    expect(afterPillage.harbormasterPoints).toBe(3);
  });

  test("Diplomat computes rebuilds post-removal (works at roadsRemaining === 0) and Knights cannot stand on open-sea vertices", () => {
    let state = makePostSetup(
      4,
      {
        scenarioId: "seafarers_new_shores",
        enableSeafarers: true,
        enableCitiesAndKnights: true,
        enableCityWalls: true,
      },
      406
    );
    state = { ...state, phase: "MAIN_PHASE", activePlayerIndex: 0, turn: 6 };
    const p1 = state.players[0]!.id;

    const pureSeaEdge = state.topology.edgeOrder.find((eId) =>
      state.topology.edges[eId]!.adjacentHexIds.every(
        (h) => state.hexes[h]?.terrain === "sea"
      )
    )!;
    const seaEdgeNode = state.topology.edges[pureSeaEdge]!;
    const withSeaShip: CatanState = {
      ...state,
      edges: {
        ...state.edges,
        [pureSeaEdge]: { ownerId: p1, type: "ship", builtOnTurn: 2 },
      },
    };
    const legalKnightVerts = getLegalBuildKnightVertices(withSeaShip, p1);
    expect(legalKnightVerts).not.toContain(seaEdgeNode.v1);
    expect(legalKnightVerts).not.toContain(seaEdgeNode.v2);

    const ownRoadEdge = Object.entries(state.edges).find(
      ([, r]) => r.ownerId === p1 && r.type === "road"
    )![0];
    const dipState: CatanState = {
      ...state,
      players: state.players.map((p) =>
        p.id === p1
          ? {
              ...p,
              roadsRemaining: 0,
              progressCards: [
                { id: "dip-1", type: "diplomat", discipline: "politics" },
              ],
            }
          : p
      ),
    };
    const dipRebuilds = CatanEngine.getLegalActions(dipState, p1).filter(
      (a): a is Extract<typeof a, { type: "PLAY_PROGRESS_CARD" }> =>
        a.type === "PLAY_PROGRESS_CARD" &&
        a.cardId === "dip-1" &&
        a.params?.edgeId === ownRoadEdge &&
        Boolean(a.params?.rebuildEdgeId)
    );
    expect(dipRebuilds.length).toBeGreaterThan(0);
    const afterDip = CatanEngine.applyAction(dipState, p1, dipRebuilds[0]!).state;
    expect(afterDip.edges[ownRoadEdge]).toBeUndefined();
    expect(afterDip.edges[dipRebuilds[0]!.params!.rebuildEdgeId!]?.ownerId).toBe(p1);
    expect(afterDip.players[0]!.roadsRemaining).toBe(0);
  });
});
