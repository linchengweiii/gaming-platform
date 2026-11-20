import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  getNextActingPlayerId,
  getPlayerGoodTradeRatios,
  type CatanConfig,
  type CatanState,
} from "../../packages/games/catan/src/index.ts";
import { resolveEventDieRollPure } from "../../packages/games/catan/src/cities-and-knights/barbarians.ts";
import { completeSnakeDraftSetup } from "./helpers.ts";

const FOUR_PLAYERS = [
  { id: "p1", name: "Alice", color: "#e11d48", isBot: false, botDifficulty: "normal" as const },
  { id: "p2", name: "Bob", color: "#2563eb", isBot: false, botDifficulty: "normal" as const },
  { id: "p3", name: "Carol", color: "#16a34a", isBot: false, botDifficulty: "normal" as const },
  { id: "p4", name: "Dave", color: "#d97706", isBot: false, botDifficulty: "normal" as const },
];

const TWO_PLAYERS = FOUR_PLAYERS.slice(0, 2);

function makePostSetup(
  players: typeof FOUR_PLAYERS,
  config: Partial<CatanConfig>,
  seed: string
): CatanState {
  const init = CatanEngine.initGame(players, config, seed);
  return completeSnakeDraftSetup(init).state;
}

describe("Audit Regressions: Catan Cities & Knights", () => {
  test("2P Master Merchant redacted view passes invariants, active player defers 5th card discard until END_TURN, and Merchant Fleet stacks", () => {
    const ck2 = makePostSetup(
      TWO_PLAYERS,
      { scenarioId: "cities_and_knights", enableCitiesAndKnights: true },
      "ck-2p-mm"
    );
    const p2Card =
      ck2.progressDecks.science[ck2.progressDecks.science.length - 1]!;
    const mmSetup: CatanState = {
      ...ck2,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      turn: 5,
      progressDecks: {
        ...ck2.progressDecks,
        science: ck2.progressDecks.science.slice(0, -1),
      },
      players: ck2.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              progressCards: [
                { id: "mm-1", type: "master_merchant", discipline: "trade" },
              ],
            }
          : {
              ...p,
              bonusVictoryPoints: 2,
              resources: { ...p.resources, brick: p.resources.brick + 1 },
              progressCards: [{ id: "p2-s1", type: p2Card, discipline: "science" }],
            }
      ),
      bank: { ...ck2.bank, brick: ck2.bank.brick - 1 },
    };
    const mmActive = CatanEngine.applyAction(mmSetup, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "mm-1",
      params: { targetPlayerId: "p2" },
    }).state;
    const p1View = CatanEngine.getPlayerView(mmActive, "p1");
    expect(CatanEngine.checkInvariants(p1View).valid).toBe(true);

    let ck4 = makePostSetup(
      FOUR_PLAYERS,
      { scenarioId: "cities_and_knights", enableCitiesAndKnights: true },
      "ck-4p-audit"
    );
    ck4 = {
      ...ck4,
      phase: "MAIN_PHASE",
      activePlayerIndex: 2,
      turn: 6,
      players: ck4.players.map((p, idx) =>
        idx === 2
          ? {
              ...p,
              progressCards: [
                { id: "c1", type: "crane", discipline: "science" },
                { id: "c2", type: "medicine", discipline: "science" },
                { id: "c3", type: "merchant_fleet", discipline: "trade" },
                { id: "c4", type: "merchant_fleet", discipline: "trade" },
                { id: "c5", type: "irrigation", discipline: "science" },
              ],
            }
          : p
      ),
    };
    const endAttempt = CatanEngine.applyAction(ck4, "p3", {
      type: "END_TURN",
    }).state;
    expect(endAttempt.phase).toBe("PROGRESS_CARD_SELECTION");
    expect(endAttempt.pendingProgressDiscards).toEqual(["p3"]);

    let afterFleet = CatanEngine.applyAction(ck4, "p3", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "c3",
      params: { good: "brick" },
    }).state;
    afterFleet = CatanEngine.applyAction(afterFleet, "p3", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "c4",
      params: { good: "paper" },
    }).state;
    const ratios = getPlayerGoodTradeRatios(afterFleet, "p3");
    expect(ratios.brick).toBe(2);
    expect(ratios.paper).toBe(2);

    const afterCrane = CatanEngine.applyAction(ck4, "p3", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "c1",
    }).state;
    const withDupCrane = {
      ...afterCrane,
      players: afterCrane.players.map((p) =>
        p.id === "p3"
          ? {
              ...p,
              progressCards: [
                ...p.progressCards,
                {
                  id: "c-crane2",
                  type: "crane" as const,
                  discipline: "science" as const,
                },
                {
                  id: "c-smith",
                  type: "smith" as const,
                  discipline: "science" as const,
                },
              ],
            }
          : p
      ),
    };
    expect(() =>
      CatanEngine.applyAction(withDupCrane, "p3", {
        type: "PLAY_PROGRESS_CARD",
        cardId: "c-crane2",
      })
    ).toThrow();
    expect(() =>
      CatanEngine.applyAction(withDupCrane, "p3", {
        type: "PLAY_PROGRESS_CARD",
        cardId: "c-smith",
        params: { vertexIds: ["nonexistent-v"] },
      })
    ).toThrow();
  });

  test("Barbarian Raid ties order clockwise, Intrigue works via ship, and Commercial Harbor redacts 3rd-party views", () => {
    const ck4 = makePostSetup(
      FOUR_PLAYERS,
      { scenarioId: "cities_and_knights", enableCitiesAndKnights: true },
      "ck-4p-barb-ch"
    );
    const emptySpots = ck4.topology.vertexOrder.filter(
      (v) => !ck4.buildings[v] && !ck4.knights[v]
    );
    const barbTieState: CatanState = {
      ...ck4,
      activePlayerIndex: 2,
      barbarianPosition: 6,
      knights: {
        [emptySpots[0]!]: {
          ownerId: "p1",
          level: 2,
          active: true,
          activatedThisTurn: false,
          actedThisTurn: false,
          promotedThisTurn: false,
        },
        [emptySpots[1]!]: {
          ownerId: "p3",
          level: 2,
          active: true,
          activatedThisTurn: false,
          actedThisTurn: false,
          promotedThisTurn: false,
        },
      },
    };
    const afterRaid = resolveEventDieRollPure(
      barbTieState,
      "barbarian",
      4,
      []
    ).state;
    expect(afterRaid.pendingDefenderDeckPicks).toEqual(["p3", "p1"]);

    const sfCk = makePostSetup(
      FOUR_PLAYERS,
      { scenarioId: "seafarers_new_shores", enableCitiesAndKnights: true },
      "ck-sf-intrigue"
    );
    const coastalEdge = sfCk.topology.edgeOrder.find((eId) => {
      const en = sfCk.topology.edges[eId]!;
      const hasSea = en.adjacentHexIds.some(
        (h) => sfCk.hexes[h]!.terrain === "sea"
      );
      const v1HasLand = sfCk.topology.vertices[en.v1]!.adjacentHexIds.some(
        (h) => sfCk.hexes[h]!.terrain !== "sea"
      );
      return hasSea && v1HasLand && !sfCk.buildings[en.v1];
    })!;
    const targetV = sfCk.topology.edges[coastalEdge]!.v1;
    const intrigueState: CatanState = {
      ...sfCk,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      turn: 5,
      edges: { [coastalEdge]: { ownerId: "p1", type: "ship", builtOnTurn: 1 } },
      knights: {
        [targetV]: {
          ownerId: "p2",
          level: 1,
          active: false,
          activatedThisTurn: false,
          actedThisTurn: false,
          promotedThisTurn: false,
        },
      },
      players: sfCk.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              progressCards: [
                { id: "intr-1", type: "intrigue", discipline: "politics" },
              ],
            }
          : p
      ),
    };
    expect(
      CatanEngine.getLegalActions(intrigueState, "p1").some(
        (a) => a.type === "PLAY_PROGRESS_CARD" && a.cardId === "intr-1"
      )
    ).toBe(true);
    expect(() =>
      CatanEngine.applyAction(intrigueState, "p1", {
        type: "PLAY_PROGRESS_CARD",
        cardId: "intr-1",
        params: { vertexId: targetV },
      })
    ).not.toThrow();

    const chSetup: CatanState = {
      ...ck4,
      phase: "MAIN_PHASE",
      activePlayerIndex: 0,
      players: ck4.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              resources: { ...p.resources, wool: 2 },
              progressCards: [
                { id: "ch-1", type: "commercial_harbor", discipline: "trade" },
              ],
            }
          : idx === 1
            ? { ...p, commodities: { paper: 1, cloth: 0, coin: 0 } }
            : { ...p, commodities: { paper: 0, cloth: 0, coin: 0 } }
      ),
    };
    const chOffer = CatanEngine.applyAction(chSetup, "p1", {
      type: "PLAY_PROGRESS_CARD",
      cardId: "ch-1",
    }).state;
    const p4OfferView = CatanEngine.getPlayerView(chOffer, "p4");
    expect(
      p4OfferView.pendingCkInteraction?.kind === "commercial_harbor_offer" &&
        p4OfferView.pendingCkInteraction.eligibleTargetIds
    ).toEqual([]);

    const chRespond = CatanEngine.applyAction(chOffer, "p1", {
      type: "OFFER_COMMERCIAL_HARBOR",
      targetPlayerId: "p2",
      resource: "wool",
    }).state;
    const p4RespView = CatanEngine.getPlayerView(chRespond, "p4");
    expect(
      p4RespView.pendingCkInteraction?.kind === "commercial_harbor_respond" &&
        p4RespView.pendingCkInteraction.offeredResourceRedacted
    ).toBe(true);
    const p4OfferEvt = p4RespView.eventLog[p4RespView.eventLog.length - 1]!;
    expect(p4OfferEvt.message).not.toContain("wool");
    expect(p4OfferEvt.payload).toBeUndefined();

    const chDone = CatanEngine.applyAction(chRespond, "p2", {
      type: "RESPOND_COMMERCIAL_HARBOR",
      commodity: "paper",
    }).state;
    const p4DoneView = CatanEngine.getPlayerView(chDone, "p4");
    const p4SwapEvt = p4DoneView.eventLog[p4DoneView.eventLog.length - 1]!;
    expect(p4SwapEvt.message).not.toContain("paper");
    expect(p4SwapEvt.message).not.toContain("wool");
    expect(p4SwapEvt.payload).toBeUndefined();
    expect(getNextActingPlayerId(chDone)).toBe("p1");
  });
});
