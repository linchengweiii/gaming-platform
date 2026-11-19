import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  type CatanState,
  getCatanPlayerViewPure,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import {
  FOUR_PLAYERS,
  completeSnakeDraftSetup,
  grantCardFromDeckForTest,
  resetAllPlayerHandsToBank,
} from "./helpers.ts";

function setupCkMainPhase(seed = 507): CatanState {
  const init = CatanEngine.initGame(
    FOUR_PLAYERS,
    {
      scenarioId: "cities_and_knights",
      enableCitiesAndKnights: true,
      enableCityWalls: true,
    },
    seed
  );
  const done = completeSnakeDraftSetup(init).state;
  return { ...done, phase: "MAIN_PHASE", activePlayerIndex: 0, turn: 5 };
}

describe("@gaming-platform/catan - Multi-Step C&K Player-Choice Sub-Phases", () => {
  test("Spy reveals target progress cards only to actor via redaction and steals exact chosen card", () => {
    const base = structuredClone(setupCkMainPhase(507));
    const [p1, p2, p3] = [
      base.players[0]!.id,
      base.players[1]!.id,
      base.players[2]!.id,
    ];
    grantCardFromDeckForTest(base, p1, "spy-1", "spy", "politics");
    grantCardFromDeckForTest(base, p2, "p2-a", "mining", "science");
    grantCardFromDeckForTest(base, p2, "p2-b", "merchant", "trade");

    let s = CatanEngine.applyAction(base, p1, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "spy-1",
      params: { targetPlayerId: p2 },
    }).state;
    expect(s.phase).toBe("CK_INTERACTION");
    expect(getNextActingPlayerId(s)).toBe(p1);

    const viewP1 = getCatanPlayerViewPure(s, p1);
    const viewP3 = getCatanPlayerViewPure(s, p3);
    expect(viewP1.players[1]!.progressCards.map((c) => c.id)).toEqual([
      "p2-a",
      "p2-b",
    ]);
    expect(viewP3.players[1]!.progressCards).toEqual([]);

    s = CatanEngine.applyAction(s, p1, {
      type: "SELECT_SPY_CARD",
      stolenCardId: "p2-b",
    }).state;
    expect(s.phase).toBe("MAIN_PHASE");
    expect(s.players[0]!.progressCards.some((c) => c.id === "p2-b")).toBe(true);
    expect(s.players[1]!.progressCards.map((c) => c.id)).toEqual(["p2-a"]);
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });

  test("Master Merchant reveals leader hand only to actor and takes exact chosen cards", () => {
    const base = structuredClone(setupCkMainPhase(508));
    resetAllPlayerHandsToBank(base);
    const [p1, p2, p3] = [
      base.players[0]!.id,
      base.players[1]!.id,
      base.players[2]!.id,
    ];
    grantCardFromDeckForTest(base, p1, "mm-1", "master_merchant", "trade");
    base.players[1]!.bonusVictoryPoints = 3;
    base.players[1]!.resources.ore = 2;
    base.bank.ore -= 2;
    base.players[1]!.commodities.paper = 1;
    base.commodityBank.paper -= 1;

    let s = CatanEngine.applyAction(base, p1, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "mm-1",
      params: { targetPlayerId: p2 },
    }).state;
    expect(s.phase).toBe("CK_INTERACTION");
    const viewP1 = getCatanPlayerViewPure(s, p1);
    const viewP3 = getCatanPlayerViewPure(s, p3);
    expect(viewP1.players[1]!.commodities.paper).toBe(1);
    expect(viewP1.players[1]!.resources.ore).toBe(2);
    expect(viewP3.players[1]!.handRedacted).toBe(true);

    s = CatanEngine.applyAction(s, p1, {
      type: "SELECT_MASTER_MERCHANT_CARDS",
      resources: { ore: 1 },
      commodities: { paper: 1 },
    }).state;
    expect(s.phase).toBe("MAIN_PHASE");
    expect(s.players[0]!.resources.ore).toBe(1);
    expect(s.players[0]!.commodities.paper).toBe(1);
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });

  test("Wedding prompts leaders clockwise to choose exact gift cards", () => {
    const base = structuredClone(setupCkMainPhase(509));
    resetAllPlayerHandsToBank(base);
    const [p1, p2, p3] = [
      base.players[0]!.id,
      base.players[1]!.id,
      base.players[2]!.id,
    ];
    grantCardFromDeckForTest(base, p1, "wed-1", "wedding", "politics");
    for (const idx of [1, 2]) {
      base.players[idx]!.bonusVictoryPoints = 3;
      base.players[idx]!.resources.brick = 2;
      base.players[idx]!.resources.lumber = 1;
      base.bank.brick -= 2;
      base.bank.lumber -= 1;
    }

    let s = CatanEngine.applyAction(base, p1, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "wed-1",
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p2);
    s = CatanEngine.applyAction(s, p2, {
      type: "GIVE_WEDDING_CARDS",
      resources: { brick: 2 },
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p3);
    s = CatanEngine.applyAction(s, p3, {
      type: "GIVE_WEDDING_CARDS",
      resources: { brick: 1, lumber: 1 },
    }).state;
    expect(s.phase).toBe("MAIN_PHASE");
    expect(s.players[0]!.resources.brick).toBe(3);
    expect(s.players[0]!.resources.lumber).toBe(1);
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });

  test("Commercial Harbor lets actor offer 1 chosen resource, opponent choose commodity, and actor stop early", () => {
    const base = structuredClone(setupCkMainPhase(510));
    resetAllPlayerHandsToBank(base);
    const [p1, p2] = [base.players[0]!.id, base.players[1]!.id];
    grantCardFromDeckForTest(base, p1, "ch-1", "commercial_harbor", "trade");
    base.players[0]!.resources.wool = 1;
    base.players[0]!.resources.ore = 2;
    base.bank.wool -= 1;
    base.bank.ore -= 2;
    for (const idx of [1, 2]) {
      base.players[idx]!.commodities.paper = 1;
      base.players[idx]!.commodities.cloth = 1;
      base.commodityBank.paper -= 1;
      base.commodityBank.cloth -= 1;
    }

    let s = CatanEngine.applyAction(base, p1, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "ch-1",
    }).state;
    expect(s.phase).toBe("CK_INTERACTION");
    s = CatanEngine.applyAction(s, p1, {
      type: "OFFER_COMMERCIAL_HARBOR",
      targetPlayerId: p2,
      resource: "wool",
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p2);
    s = CatanEngine.applyAction(s, p2, {
      type: "RESPOND_COMMERCIAL_HARBOR",
      commodity: "cloth",
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p1);
    s = CatanEngine.applyAction(s, p1, {
      type: "END_COMMERCIAL_HARBOR",
    }).state;
    expect(s.phase).toBe("MAIN_PHASE");
    expect(s.players[0]!.resources.ore).toBe(2);
    expect(s.players[0]!.commodities.cloth).toBe(1);
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });

  test("Deserter lets target choose knight and lets actor place Mighty Knight without Fortress on vacated vertex able to act same turn", () => {
    const base = structuredClone(setupCkMainPhase(511));
    const [p1, p2] = [base.players[0]!.id, base.players[1]!.id];
    grantCardFromDeckForTest(base, p1, "des-1", "deserter", "politics");
    const p1RoadEdge = Object.entries(base.edges).find(
      ([, r]) => r.ownerId === p1 && r.type === "road"
    )![0];
    const p1RoadNode = base.topology.edges[p1RoadEdge]!;
    const vacatedV = !base.buildings[p1RoadNode.v1]
      ? p1RoadNode.v1
      : p1RoadNode.v2;

    base.knights[vacatedV] = {
      ownerId: p2,
      level: 3,
      active: true,
      activatedThisTurn: false,
      actedThisTurn: false,
      promotedThisTurn: false,
    };
    base.players[1]!.mightyKnightsRemaining -= 1;
    base.players[0]!.cityImprovements.politics = 0;

    let s = CatanEngine.applyAction(base, p1, {
      type: "PLAY_PROGRESS_CARD",
      cardId: "des-1",
      params: { targetPlayerId: p2 },
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p2);
    s = CatanEngine.applyAction(s, p2, {
      type: "SELECT_DESERTER_KNIGHT",
      vertexId: vacatedV,
    }).state;
    expect(getNextActingPlayerId(s)).toBe(p1);
    expect(s.pendingCkInteraction?.kind).toBe("deserter_place_knight");

    s = CatanEngine.applyAction(s, p1, {
      type: "PLACE_DESERTED_KNIGHT",
      vertexId: vacatedV,
    }).state;
    expect(s.phase).toBe("MAIN_PHASE");
    expect(s.knights[vacatedV]?.ownerId).toBe(p1);
    expect(s.knights[vacatedV]?.level).toBe(3);
    expect(s.knights[vacatedV]?.active).toBe(true);
    expect(s.knights[vacatedV]?.activatedThisTurn).toBe(false);
    expect(CatanEngine.checkInvariants(s).valid).toBe(true);
  });
});
