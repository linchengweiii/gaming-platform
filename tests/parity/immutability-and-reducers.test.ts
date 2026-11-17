import { describe, expect, test } from "bun:test";
import {
  GameRegistry,
  MatchSession,
  createMatchSessionState,
  createRngState,
  dispatchSessionActionPure,
  getSessionState,
  getSessionStep,
  nextFloatPure,
  redoSessionForPlayerPure,
  undoSessionForPlayerPure,
} from "../../packages/core/src/index.ts";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import {
  SplendorEngine,
  totalTokens,
} from "../../packages/games/splendor/src/index.ts";
import { AzulEngine } from "../../packages/games/azul/src/index.ts";
import {
  SevenWondersEngine,
  getSevenWondersActingPlayerId,
  type SevenWondersState,
} from "../../packages/games/seven-wonders/src/index.ts";
import {
  createInitialRoomManagerState,
  createRoomPure,
  dispatchActionPure,
  startGamePure,
} from "../../apps/server/src/room-manager.ts";
import {
  createInitialAppModelPure,
  getActiveRoomPure,
  rebuildRoomSeatsPure,
  renderLobbyViewPure,
  renderLoginViewPure,
  setSharedTradeWantPure,
  switchTradeModePure,
  toggleSplendorDraftGemPure,
} from "../../apps/web/src/app.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import { renderSplendorBoardView } from "../../apps/web/src/splendor-view.ts";
import { renderAzulBoardView } from "../../apps/web/src/azul-view.ts";
import { renderSevenWondersBoardView } from "../../apps/web/src/seven-wonders-view.ts";
import { deepFreeze, makePlayers } from "./golden-store.ts";

describe("Functional Refactoring Deep-Frozen Immutability & Pure Reducer Composition", () => {
  test("enforces strict referential transparency and zero input mutation on deep-frozen game states", () => {
    const players = deepFreeze(makePlayers(4));

    // Catan pure engine + view functions never mutate frozen inputs
    let catanState = deepFreeze(
      CatanEngine.initGame(
        players,
        deepFreeze({ scenarioId: "standard", enableHarbormaster: true }),
        "frozen-catan"
      )
    );
    for (let i = 0; i < 25; i++) {
      const actorId = getNextActingPlayerId(catanState)!;
      const legal = deepFreeze(
        CatanEngine.getLegalActions(catanState, actorId)
      );
      expect(legal.length).toBeGreaterThan(0);
      const view = CatanEngine.getPlayerView(catanState, "p1");
      expect(view.players.length).toBe(4);
      const chosen = deepFreeze(CatanEngine.chooseBotAction(catanState, actorId)!);
      expect(CatanEngine.checkInvariants(catanState).valid).toBe(true);
      const svg = renderCatanBoardSvg(catanState, actorId, {
        buildMode: null,
        setupEdgeKind: "road",
        robberOrPirateMode: "robber",
        selectedMoveFromEdgeId: null,
      });
      expect(svg.length).toBeGreaterThan(500);
      const hand = renderCatanVisualHandTray(
        catanState,
        catanState.players[0]!,
        legal as any
      );
      expect(hand.length).toBeGreaterThan(50);
      const res = CatanEngine.applyAction(catanState, actorId, chosen);
      catanState = deepFreeze(res.state);
    }

    // Splendor pure engine + view functions never mutate frozen inputs
    let splendorState = deepFreeze(
      SplendorEngine.initGame(players, deepFreeze({}), "frozen-splendor")
    );
    for (let i = 0; i < 15; i++) {
      const actor = splendorState.players[splendorState.activePlayerIndex]!;
      const legal = deepFreeze(
        SplendorEngine.getLegalActions(splendorState, actor.id)
      );
      expect(legal.length).toBeGreaterThan(0);
      expect(totalTokens(actor.tokens)).toBeGreaterThanOrEqual(0);
      const chosen = deepFreeze(
        SplendorEngine.chooseBotAction(splendorState, actor.id)!
      );
      expect(SplendorEngine.checkInvariants(splendorState).valid).toBe(true);
      expect(renderSplendorBoardView(splendorState, {}).length).toBeGreaterThan(
        100
      );
      splendorState = deepFreeze(
        SplendorEngine.applyAction(splendorState, actor.id, chosen).state
      );
    }

    // Azul pure engine + view functions never mutate frozen inputs
    let azulState = deepFreeze(
      AzulEngine.initGame(players, deepFreeze({}), "frozen-azul")
    );
    for (let i = 0; i < 15; i++) {
      const actor = azulState.players[azulState.activePlayerIndex]!;
      const legal = deepFreeze(AzulEngine.getLegalActions(azulState, actor.id));
      expect(legal.length).toBeGreaterThan(0);
      const chosen = deepFreeze(
        AzulEngine.chooseBotAction(azulState, actor.id)!
      );
      expect(AzulEngine.checkInvariants(azulState).valid).toBe(true);
      expect(renderAzulBoardView(azulState, null).length).toBeGreaterThan(100);
      azulState = deepFreeze(
        AzulEngine.applyAction(azulState, actor.id, chosen).state
      );
    }

    // 7 Wonders pure engine + view functions never mutate frozen inputs
    let swState: SevenWondersState = deepFreeze(
      SevenWondersEngine.initGame(
        players,
        deepFreeze({ wonderSideMode: "random" }),
        "frozen-seven-wonders"
      )
    );
    for (let i = 0; i < 20; i++) {
      const actorId = getSevenWondersActingPlayerId(swState)!;
      const legal = deepFreeze(
        SevenWondersEngine.getLegalActions(swState, actorId)
      );
      expect(legal.length).toBeGreaterThan(0);
      const redacted = SevenWondersEngine.getPlayerView(swState, actorId);
      expect(redacted.players.length).toBe(4);
      const chosen = deepFreeze(
        SevenWondersEngine.chooseBotAction(swState, actorId)!
      );
      expect(SevenWondersEngine.checkInvariants(swState).valid).toBe(true);
      expect(
        renderSevenWondersBoardView(redacted, actorId, null, legal).length
      ).toBeGreaterThan(200);
      swState = deepFreeze(
        SevenWondersEngine.applyAction(swState, actorId, chosen).state
      );
    }

    // GameRegistry + MatchSession contract
    const registry = new GameRegistry();
    registry.register(CatanEngine);
    expect(registry.get("catan").metadata.id).toBe("catan");
    const session = new MatchSession(
      CatanEngine,
      CatanEngine.initGame(players, {}, "session-parity")
    );
    const firstAct = CatanEngine.getLegalActions(session.getState(), "p1")[0]!;
    session.dispatch("p1", firstAct);
    expect(session.getStep()).toBe(1);
    session.undoForPlayer("p1");
    expect(session.getStep()).toBe(0);
    session.redoForPlayer("p1");
    expect(session.getStep()).toBe(1);
  });

  test("composes pure RngState, MatchSessionState, RoomManagerState, and AppModel reducers without mutating frozen inputs", () => {
    // 1. Pure RngState tuple threading
    const s0 = createRngState("pure-rng-seed");
    const [f1, s1] = nextFloatPure(s0);
    const [f1Repeat, s1Repeat] = nextFloatPure(s0);
    expect(f1).toBe(f1Repeat);
    expect(s1).toBe(s1Repeat);

    // 2. Pure MatchSessionState reducers on deep-frozen snapshots
    const players = makePlayers(4);
    const initialCatan = deepFreeze(
      CatanEngine.initGame(players, {}, "pure-session-seed")
    );
    const sess0 = deepFreeze(
      createMatchSessionState(CatanEngine, initialCatan, true)
    );
    const firstLegal = CatanEngine.getLegalActions(
      getSessionState(sess0),
      "p1"
    )[0]!;
    const { session: sess1 } = dispatchSessionActionPure(
      CatanEngine,
      sess0,
      "p1",
      firstLegal,
      1000
    );
    expect(getSessionStep(sess0)).toBe(0);
    expect(getSessionStep(sess1)).toBe(1);
    const sessUndone = undoSessionForPlayerPure(CatanEngine, deepFreeze(sess1), "p1");
    expect(getSessionStep(sessUndone)).toBe(0);
    const sessRedone = redoSessionForPlayerPure(deepFreeze(sessUndone), "p1");
    expect(getSessionStep(sessRedone)).toBe(1);

    // 3. Pure RoomManagerState reducers on deep-frozen manager state
    const rm0 = deepFreeze(createInitialRoomManagerState());
    const created = createRoomPure(rm0, {
      name: "Pure FP Room",
      gameId: "splendor",
      ownerId: "host-1",
      hostName: "Host One",
      botCount: 2,
      startingPlayerMode: "first",
    });
    expect(Object.keys(rm0.rooms).length).toBe(0);
    expect(Object.keys(created.state.rooms).length).toBe(1);
    const started = startGamePure(
      deepFreeze(created.state),
      created.roomId,
      "host-1"
    );
    const spLegal = SplendorEngine.getLegalActions(started.gameState, "host-1")[0]!;
    const stepped = dispatchActionPure(
      deepFreeze(started.state),
      created.roomId,
      "host-1",
      spLegal
    );
    expect(stepped.gameState).not.toBe(started.gameState);

    // 4. Pure Web AppModel reducers & pure HTML view functions on deep-frozen AppModel
    const appModel0 = deepFreeze(
      createInitialAppModelPure(
        { forceLocalMode: true },
        {
          isStaticHost: false,
          isBrowserHttp: false,
          randomGuestSuffix: 424,
          deviceGuests: [],
          savedGuest: null,
          nowMs: 123456,
        }
      )
    );
    expect(renderLobbyViewPure(appModel0)).toContain("Game Arena");
    expect(
      renderLoginViewPure(
        deepFreeze({ ...appModel0, isAuthenticated: false, viewMode: "login" })
      )
    ).toContain("Guest sign-in");

    const activeRoom = getActiveRoomPure(appModel0);
    const rebuiltRoom = rebuildRoomSeatsPure(deepFreeze(activeRoom));
    expect(rebuiltRoom).not.toBe(activeRoom);
    expect(rebuiltRoom.players.length).toBe(activeRoom.players.length);

    const modelWithWant = deepFreeze(
      setSharedTradeWantPure(appModel0, "ore", 2)
    );
    const modelDomestic = deepFreeze(
      switchTradeModePure(modelWithWant, "domestic_trade")
    );
    const modelMaritime = deepFreeze(
      switchTradeModePure(modelDomestic, "maritime_trade")
    );
    expect(appModel0.maritimeWant.ore).toBe(0);
    expect(modelMaritime.maritimeWant.ore).toBe(2);
    expect(modelMaritime.domesticWant.ore).toBe(2);

    const spInit = deepFreeze(SplendorEngine.initGame(players.slice(0, 3), {}, "sp-gem"));
    const draft0 = deepFreeze({});
    const draft1 = deepFreeze(toggleSplendorDraftGemPure(draft0, spInit, "ruby"));
    const draft2 = toggleSplendorDraftGemPure(draft1, spInit, "ruby");
    expect(draft0).toEqual({});
    expect(draft1).toEqual({ ruby: 1 });
    expect(draft2).toEqual({ ruby: 2 });
  });
});
