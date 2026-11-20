import { describe, expect, test } from "bun:test";
import { axialDistance } from "../../packages/core/src/index.ts";
import {
  CatanEngine,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  type CatanConfig,
  type CatanState,
} from "../../packages/games/catan/src/index.ts";
import { completeSnakeDraftSetup } from "./helpers.ts";

const FOUR_PLAYERS = [
  { id: "p1", name: "Alice", color: "#e11d48", isBot: false, botDifficulty: "normal" as const },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: false, botDifficulty: "normal" as const },
  { id: "p3", name: "Carol", color: "#16a34a", isBot: false, botDifficulty: "normal" as const },
  { id: "p4", name: "Dave", color: "#d97706", isBot: false, botDifficulty: "normal" as const },
];

function makePostSetup(
  config: Partial<CatanConfig>,
  seed: string
): CatanState {
  const init = CatanEngine.initGame(FOUR_PLAYERS, config, seed);
  return completeSnakeDraftSetup(init).state;
}

describe("Audit Regressions: Catan Core & Seafarers", () => {
  test("guards activeTradeOffer across MAIN_PHASE actions and validates domestic trade offer/accept/decline", () => {
    let state = makePostSetup({ scenarioId: "standard" }, "catan-trade-audit");
    state = {
      ...state,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      turn: 3,
      players: state.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              resources: { brick: 4, lumber: 4, wool: 1, grain: 1, ore: 1 },
              devCards: [
                { id: "dev-k1", type: "knight", boughtOnTurn: 1, played: false },
              ],
            }
          : { ...p, resources: { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 2 } }
      ),
    };

    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: "p2",
        give: { brick: 1 },
        want: { brick: 2 },
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: "p1",
        give: { brick: 1 },
        want: { ore: 1 },
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: "ghost",
        give: { brick: 1 },
        want: { ore: 1 },
      })
    ).toThrow();

    const offered = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: "p2",
      give: { brick: 1 },
      want: { ore: 1 },
    }).state;
    expect(offered.activeTradeOffer).not.toBeNull();
    const offerId = offered.activeTradeOffer!.id;

    expect(() =>
      CatanEngine.applyAction(offered, "p1", { type: "PLAY_KNIGHT" })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(offered, "p1", {
        type: "MARITIME_TRADE",
        give: "brick",
        giveAmount: 4,
        receive: "ore",
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(offered, "p1", {
        type: "OFFER_DOMESTIC_TRADE",
        toPlayerId: "p3",
        give: { lumber: 1 },
        want: { ore: 1 },
      })
    ).toThrow();

    expect(() =>
      CatanEngine.applyAction(offered, "p1", {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId,
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(offered, "p3", {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId,
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(offered, "p2", {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: "wrong-id",
      })
    ).toThrow();

    const broadcast = CatanEngine.applyAction(state, "p1", {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { brick: 1 },
      want: { ore: 1 },
    }).state;
    const bId = broadcast.activeTradeOffer!.id;
    const afterP2Decline = CatanEngine.applyAction(broadcast, "p2", {
      type: "DECLINE_DOMESTIC_TRADE",
      offerId: bId,
    }).state;
    expect(() =>
      CatanEngine.applyAction(afterP2Decline, "p2", {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: bId,
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(afterP2Decline, "p2", {
        type: "ACCEPT_DOMESTIC_TRADE",
        offerId: bId,
      })
    ).toThrow();
  });

  test("validates Monopoly/Year of Plenty/Gold resources, allows 1-card Year of Plenty, and rejects 0-spot base Road Building", () => {
    let state = makePostSetup({ scenarioId: "standard" }, "catan-dev-audit");
    state = {
      ...state,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      turn: 4,
      players: state.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              roadsRemaining: 0,
              shipsRemaining: 0,
              devCards: [
                { id: "dev-m1", type: "monopoly", boughtOnTurn: 1, played: false },
                { id: "dev-y1", type: "year_of_plenty", boughtOnTurn: 1, played: false },
                { id: "dev-r1", type: "road_building", boughtOnTurn: 1, played: false },
              ],
            }
          : p
      ),
    };

    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "PLAY_MONOPOLY",
        resource: "bogus" as any,
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, "p1", {
        type: "PLAY_YEAR_OF_PLENTY",
        resource1: "bogus" as any,
        resource2: "brick",
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(state, "p1", { type: "PLAY_ROAD_BUILDING" })
    ).toThrow();

    const oneCardBank = {
      ...state,
      bank: { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 },
    };
    const legal = CatanEngine.getLegalActions(oneCardBank, "p1");
    expect(legal.some((a) => a.type === "PLAY_YEAR_OF_PLENTY")).toBe(true);
    const afterYop = CatanEngine.applyAction(oneCardBank, "p1", {
      type: "PLAY_YEAR_OF_PLENTY",
      resource1: "brick",
      resource2: "brick",
    }).state;
    expect(afterYop.bank.brick).toBe(0);
    expect(afterYop.players[0]!.resources.brick).toBe(
      oneCardBank.players[0]!.resources.brick + 1
    );

    const goldState: CatanState = {
      ...state,
      phase: "GOLD_RESOURCE_SELECTION",
      bank: { brick: 0, lumber: 3, wool: 0, grain: 0, ore: 0 },
      pendingGoldPicks: { p1: 1 },
    };
    expect(() =>
      CatanEngine.applyAction(goldState, "p1", {
        type: "SELECT_GOLD_RESOURCE",
        resource: "bogus" as any,
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(goldState, "p1", {
        type: "SELECT_GOLD_RESOURCE",
        resource: "brick",
      })
    ).toThrow();
  });

  test("Seafarers: open ships ignore adjacent own roads, Friendly Robber filters Pirate hexes, Fog reveals vertex-adjacent hexes, and New Shores balances offshore 6/8", () => {
    for (let s = 1; s <= 15; s++) {
      const ns = CatanEngine.initGame(
        FOUR_PLAYERS,
        { scenarioId: "seafarers_new_shores", balancedNumbers: true },
        `ns-bal-${s}`
      );
      const redHexes = Object.values(ns.hexes).filter(
        (h) => h.numberToken === 6 || h.numberToken === 8
      );
      for (let i = 0; i < redHexes.length; i++) {
        for (let j = i + 1; j < redHexes.length; j++) {
          expect(
            axialDistance(
              { q: redHexes[i]!.q, r: redHexes[i]!.r },
              { q: redHexes[j]!.q, r: redHexes[j]!.r }
            )
          ).toBeGreaterThan(1);
        }
      }
    }

    const sf = makePostSetup(
      { scenarioId: "seafarers_new_shores", enableFriendlyRobber: true },
      "sf-ship-audit"
    );
    const coastalShipEdge = sf.topology.edgeOrder.find((eId) => {
      const e = sf.topology.edges[eId]!;
      const adj = e.adjacentHexIds.map((h) => sf.hexes[h]!.terrain);
      if (!adj.includes("sea")) return false;
      const v1Land = sf.topology.vertices[e.v1]!.adjacentHexIds.some(
        (h) => sf.hexes[h]!.terrain !== "sea"
      );
      const v2Land = sf.topology.vertices[e.v2]!.adjacentHexIds.some(
        (h) => sf.hexes[h]!.terrain !== "sea"
      );
      return v1Land && v2Land;
    })!;
    const eNode = sf.topology.edges[coastalShipEdge]!;
    const adjLandRoad = sf.topology.vertices[eNode.v2]!.incidentEdgeIds.find(
      (inc) =>
        inc !== coastalShipEdge &&
        sf.topology.edges[inc]!.adjacentHexIds.some(
          (h) => sf.hexes[h]!.terrain !== "sea"
        )
    )!;
    const shipTestState: CatanState = {
      ...sf,
      phase: "MAIN_PHASE",
      turn: 5,
      activePlayerIndex: 0,
      buildings: { [eNode.v1]: { ownerId: "p1", type: "settlement" } },
      edges: {
        [coastalShipEdge]: { ownerId: "p1", type: "ship", builtOnTurn: 1 },
        [adjLandRoad]: { ownerId: "p1", type: "road", builtOnTurn: 1 },
      },
    };
    const shipMoves = getLegalMoveShipActions(shipTestState, "p1");
    expect(shipMoves.some((m) => m.fromEdgeId === coastalShipEdge)).toBe(true);

    const oppSeaHex = sf.topology.hexOrder.find(
      (hId) =>
        hId !== sf.pirateHexId &&
        sf.hexes[hId]!.terrain === "sea" &&
        sf.topology.hexes[hId]!.sideEdgeIds.length > 0
    )!;
    const oppShipEdge = sf.topology.hexes[oppSeaHex]!.sideEdgeIds[0]!;
    const friendlyPirateState: CatanState = {
      ...sf,
      buildings: {},
      edges: {
        [oppShipEdge]: { ownerId: "p2", type: "ship", builtOnTurn: 1 },
      },
    };
    expect(getLegalPirateHexes(friendlyPirateState, "p1")).not.toContain(
      oppSeaHex
    );

    const fog = makePostSetup(
      { scenarioId: "seafarers_fog_islands" },
      "sf-fog-corner"
    );
    const cornerTouchEdge = fog.topology.edgeOrder.find((eId) => {
      const en = fog.topology.edges[eId]!;
      const sideHasFog = en.adjacentHexIds.some(
        (h) => fog.hexes[h]!.terrain === "fog"
      );
      const sideHasSea = en.adjacentHexIds.some(
        (h) => fog.hexes[h]!.terrain === "sea"
      );
      const cornerHasFog = [
        ...fog.topology.vertices[en.v1]!.adjacentHexIds,
        ...fog.topology.vertices[en.v2]!.adjacentHexIds,
      ].some((h) => fog.hexes[h]!.terrain === "fog");
      return !sideHasFog && sideHasSea && cornerHasFog;
    })!;
    const cornerEdgeNode = fog.topology.edges[cornerTouchEdge]!;
    const touchedFogHex = [
      ...fog.topology.vertices[cornerEdgeNode.v1]!.adjacentHexIds,
      ...fog.topology.vertices[cornerEdgeNode.v2]!.adjacentHexIds,
    ].find((h) => fog.hexes[h]!.terrain === "fog")!;
    const preBuildFog: CatanState = {
      ...fog,
      phase: "MAIN_PHASE",
      turn: 4,
      activePlayerIndex: 0,
      buildings: {
        [cornerEdgeNode.v1]: { ownerId: "p1", type: "settlement" },
      },
      edges: {},
      players: fog.players.map((p, i) =>
        i === 0 ? { ...p, resources: { ...p.resources, lumber: 2, wool: 2 } } : p
      ),
    };
    const afterFogShip = CatanEngine.applyAction(preBuildFog, "p1", {
      type: "BUILD_SHIP",
      edgeId: cornerTouchEdge,
    }).state;
    expect(afterFogShip.hexes[touchedFogHex]!.terrain).not.toBe("fog");
  });
});
