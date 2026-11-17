import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  getNextActingPlayerId,
  type CatanState,
} from "../../packages/games/catan/src/index.ts";
import {
  createInitialRoomManagerState,
  createRoomPure,
  startGamePure,
  updateRoomSetupPure,
} from "../../apps/server/src/room-manager.ts";
import { createMultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import {
  deepFreeze,
  makePlayers,
  withDeterministicClockAndRandom,
} from "./golden-store.ts";

describe("Functional Refactoring Cities & Knights Referential Transparency & UI Parity", () => {
  test("enforces strict referential transparency and UI rendering for Cities & Knights expansion", () => {
    const players = deepFreeze(makePlayers(4));
    let ckState = deepFreeze(
      CatanEngine.initGame(
        players,
        deepFreeze({ scenarioId: "cities_and_knights" }),
        "frozen-ck-catan"
      )
    );

    for (let i = 0; i < 60; i++) {
      const actorId = getNextActingPlayerId(ckState)!;
      const legal = deepFreeze(CatanEngine.getLegalActions(ckState, actorId));
      expect(legal.length).toBeGreaterThan(0);
      const redacted = deepFreeze(CatanEngine.getPlayerView(ckState, "p1"));
      expect(redacted.players.length).toBe(4);
      const chosen = deepFreeze(CatanEngine.chooseBotAction(ckState, actorId)!);
      expect(CatanEngine.checkInvariants(ckState).valid).toBe(true);
      const svg = renderCatanBoardSvg(ckState, actorId, {
        buildMode: null,
        setupEdgeKind: "road",
        robberOrPirateMode: "robber",
        selectedMoveFromEdgeId: null,
      });
      expect(svg).toContain("<svg");
      const hand = renderCatanVisualHandTray(
        ckState,
        ckState.players[0]!,
        legal as any
      );
      expect(hand.length).toBeGreaterThan(50);
      ckState = deepFreeze(CatanEngine.applyAction(ckState, actorId, chosen).state);
    }

    // RoomManager pure setup synchronization for both C&K scenario and C&K checkbox combo
    const rm0 = deepFreeze(createInitialRoomManagerState());
    const rmCreated = createRoomPure(rm0, {
      name: "CK Room",
      gameId: "catan",
      ownerId: "host-ck",
      hostName: "Host CK",
      botCount: 3,
      startingPlayerMode: "first",
    });
    const rmScenario = updateRoomSetupPure(
      deepFreeze(rmCreated.state),
      rmCreated.roomId,
      "host-ck",
      { config: { scenarioId: "cities_and_knights" } }
    );
    expect(rmScenario.rooms[rmCreated.roomId]!.config.enableCitiesAndKnights).toBe(
      true
    );
    expect(rmScenario.rooms[rmCreated.roomId]!.config.enableCityWalls).toBe(true);
    const startedScenario = startGamePure(
      deepFreeze(rmScenario),
      rmCreated.roomId,
      "host-ck"
    );
    expect(
      (startedScenario.gameState as CatanState).config.targetVictoryPoints
    ).toBe(13);

    const rmCombo = updateRoomSetupPure(
      deepFreeze(rmScenario),
      rmCreated.roomId,
      "host-ck",
      {
        config: {
          scenarioId: "seafarers_new_shores",
          enableCitiesAndKnights: true,
        },
      }
    );
    expect(rmCombo.rooms[rmCreated.roomId]!.config.enableCitiesAndKnights).toBe(
      true
    );
    const startedCk = startGamePure(
      deepFreeze(rmCombo),
      rmCreated.roomId,
      "host-ck"
    );
    expect((startedCk.gameState as CatanState).config.enableCitiesAndKnights).toBe(
      true
    );
    expect((startedCk.gameState as CatanState).config.targetVictoryPoints).toBe(14);

    // 5-6P Extension scenarios & checkbox toggle synchronization in RoomManager
    const rmCk56 = updateRoomSetupPure(
      deepFreeze(rmCombo),
      rmCreated.roomId,
      "host-ck",
      { config: { scenarioId: "cities_and_knights_5_6" } }
    );
    expect(rmCk56.rooms[rmCreated.roomId]!.players.length).toBe(5);
    expect(rmCk56.rooms[rmCreated.roomId]!.config.enable56PlayerExtension).toBe(
      true
    );
    expect(rmCk56.rooms[rmCreated.roomId]!.config.enableCitiesAndKnights).toBe(
      true
    );
    const rmSixIslands6P = updateRoomSetupPure(
      deepFreeze(rmCk56),
      rmCreated.roomId,
      "host-ck",
      {
        playerCount: 6,
        config: {
          scenarioId: "seafarers_four_islands",
          enable56PlayerExtension: true,
          enableCitiesAndKnights: true,
        },
      }
    );
    expect(rmSixIslands6P.rooms[rmCreated.roomId]!.players.length).toBe(6);
    const startedSixIslandsCk = startGamePure(
      deepFreeze(rmSixIslands6P),
      rmCreated.roomId,
      "host-ck"
    );
    const sixIslandsState = startedSixIslandsCk.gameState as CatanState;
    expect(Object.keys(sixIslandsState.hexes)).toHaveLength(58);
    expect(sixIslandsState.config.enable56PlayerExtension).toBe(true);
    expect(sixIslandsState.config.enableSeafarers).toBe(true);
    expect(sixIslandsState.config.enableCitiesAndKnights).toBe(true);
    expect(sixIslandsState.config.targetVictoryPoints).toBe(14);

    // Web UI rendering of Cities & Knights HUD, Upgrades flip-chart drawer, and 8-good Trade matrix
    withDeterministicClockAndRandom(() => {
      const root: any = {
        innerHTML: "",
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
      };
      const app = createMultiGamePlatformApp(root, {
        forceLocalMode: true,
        startAtLogin: false,
      }) as any;
      app.autoRespondBotsToHuman = false;
      app.enterOrJoinRoom("room-1");
      expect(root.innerHTML).toContain('id="setup-chk-citiesknights"');
      expect(root.innerHTML).not.toContain('id="setup-chk-allbots"');
      expect(root.innerHTML).not.toContain('id="setup-chk-extension56"');
      expect(root.innerHTML).not.toContain('value="cities_and_knights"');
      expect(root.innerHTML).not.toContain('value="big_island_5_6"');
      const room = app.getActiveRoom();
      room.config = {
        ...room.config,
        scenarioId: "standard",
        enableCitiesAndKnights: true,
        enableCityWalls: true,
        targetVictoryPoints: 13,
      };
      room.startingPlayerMode = "first";
      app.startRoomMatch("room-1");
      app.finishSetupWithBots();
      const aliceId = room.players[0]!.id as string;
      app.dispatch(aliceId, { type: "ROLL_DICE" });
      while (room.session.getState().phase !== "MAIN_PHASE") {
        const cur = room.session.getState();
        const actId = getNextActingPlayerId(cur)!;
        app.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
      }
      expect(root.innerHTML).toContain("map-barbarian-hud");
      expect(root.innerHTML).toContain("catan-event-die-svg");
      expect(root.innerHTML).toContain("btn-mode-upgrades");

      app.switchTradeMode("maritime_trade");
      expect(root.innerHTML).toContain("ga-res-matrix--ck");
    });
  });
});
