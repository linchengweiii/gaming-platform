import { describe, expect, test } from "bun:test";
import type { PlayerDescriptor } from "@gaming-platform/core";
import {
  CatanEngine,
  RESOURCES,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import { completeSnakeDraftSetup } from "./helpers.ts";

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
