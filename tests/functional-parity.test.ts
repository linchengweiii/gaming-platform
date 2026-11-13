import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GameRegistry,
  MatchSession,
  SeededRNG,
  buildHexBoardTopology,
  computeLongestSimpleEdgePath,
  createMatchSessionState,
  createRngState,
  dispatchSessionActionPure,
  generateHexRadiusCoords,
  getSessionState,
  getSessionStep,
  nextFloatPure,
  redoSessionForPlayerPure,
  undoSessionForPlayerPure,
  type BotDifficulty,
  type EdgeId,
  type PlayerDescriptor,
  type VertexId,
} from "../packages/core/src/index.ts";
import {
  CatanEngine,
  computePlayerVictoryPoints,
  getNextActingPlayerId,
  getPlayerResourceCount,
  type CatanConfig,
  type CatanState,
} from "../packages/games/catan/src/index.ts";
import {
  SplendorEngine,
  totalTokens,
  type SplendorState,
} from "../packages/games/splendor/src/index.ts";
import {
  AzulEngine,
  type AzulState,
} from "../packages/games/azul/src/index.ts";
import {
  PlatformRoomManager,
  createInitialRoomManagerState,
  createRoomPure,
  dispatchActionPure,
  startGamePure,
} from "../apps/server/src/room-manager.ts";
import {
  MultiGamePlatformApp,
  createInitialAppModelPure,
  getActiveRoomPure,
  rebuildRoomSeatsPure,
  renderLobbyViewPure,
  renderLoginViewPure,
  setSharedTradeWantPure,
  switchTradeModePure,
  toggleSplendorDraftGemPure,
} from "../apps/web/src/app.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../apps/web/src/catan-graphics.ts";
import { renderSplendorBoardView } from "../apps/web/src/splendor-view.ts";
import { renderAzulBoardView } from "../apps/web/src/azul-view.ts";

const GOLDEN_SNAPSHOT_PATH = fileURLToPath(
  new URL("./__snapshots__/functional-parity.golden.json", import.meta.url)
);

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function withDeterministicClockAndRandom<T>(fn: () => T): T {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalAlert = (globalThis as Record<string, unknown>).alert;
  let tick = 0;
  let randIdx = 0;
  const randPool = [0.17, 0.42, 0.68, 0.91, 0.05, 0.53, 0.79, 0.24];

  Date.now = () => 1_700_000_000_000 + tick++ * 100;
  Math.random = () => {
    const val = randPool[randIdx % randPool.length]!;
    randIdx += 1;
    return val;
  };
  (globalThis as Record<string, unknown>).alert = () => {};

  try {
    return fn();
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    if (originalAlert === undefined) {
      delete (globalThis as Record<string, unknown>).alert;
    } else {
      (globalThis as Record<string, unknown>).alert = originalAlert;
    }
  }
}

function makePlayers(
  count: number,
  difficulties: readonly BotDifficulty[] = ["master", "smart", "normal", "easy"]
): PlayerDescriptor[] {
  const colors = [
    "#e11d48",
    "#2563eb",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
  ];
  return Array.from({ length: count }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    color: colors[idx % colors.length]!,
    isBot: true,
    botDifficulty: difficulties[idx % difficulties.length] ?? "normal",
  }));
}

function collectPrngSnapshot() {
  const hashInputs = [
    "",
    "catan-seed-42",
    "splendor-golden",
    "azul-golden",
    "0",
    "unicode-dice-test-777",
  ];
  const hashes = Object.fromEntries(
    hashInputs.map((input) => [input, SeededRNG.hashString(input)])
  );

  const seeds: Array<string | number> = ["catan-seed-42", 123456789, 0];
  const streams = seeds.map((seed) => {
    const rng = new SeededRNG(seed);
    const initialState = rng.getState();
    const floats = Array.from({ length: 20 }, () => rng.nextFloat());
    const ints = Array.from({ length: 20 }, (_, idx) =>
      rng.nextInt(-5, idx + 5)
    );
    const rolls = Array.from({ length: 20 }, () => rng.roll2d6());
    const shuffled = rng.shuffle([
      "brick",
      "lumber",
      "wool",
      "grain",
      "ore",
      "desert",
      "gold",
      "ocean",
    ]);
    const picked = rng.pick(shuffled);
    const checkpointState = rng.getState();
    const resumed = SeededRNG.fromState(checkpointState);
    const resumedFloats = Array.from({ length: 10 }, () =>
      resumed.nextFloat()
    );
    return {
      seed: String(seed),
      initialState,
      floats,
      ints,
      rolls,
      shuffled,
      picked,
      checkpointState,
      resumedFloats,
      finalState: resumed.getState(),
    };
  });

  return { hashes, streams };
}

function collectHexAndPathSnapshot() {
  const coords = generateHexRadiusCoords(2);
  const topology = buildHexBoardTopology(coords, 58);

  const hexRingEdgeIds = topology.hexes[topology.hexOrder[0]!]!.sideEdgeIds;
  const ringLongest = computeLongestSimpleEdgePath(
    topology,
    hexRingEdgeIds,
    new Set<VertexId>()
  );

  // Branched network with opponent settlement blocking one middle vertex
  const sampleEdgeIds = topology.edgeOrder.slice(0, 12);
  const branchedUnblocked = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>()
  );
  const blockedVertexId = topology.edges[sampleEdgeIds[3]!]!.v1;
  const branchedBlocked = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>([blockedVertexId])
  );

  // Seafarers road-to-ship transition constraint
  const kindByEdgeId = new Map<EdgeId, "road" | "ship">(
    sampleEdgeIds.map((id, idx) => [id, idx % 2 === 0 ? "road" : "ship"])
  );
  const harborSettlementVertex = topology.edges[sampleEdgeIds[0]!]!.v2;
  const transitionFiltered = computeLongestSimpleEdgePath(
    topology,
    sampleEdgeIds,
    new Set<VertexId>(),
    (e1: EdgeId, e2: EdgeId, sharedVertex: VertexId) =>
      kindByEdgeId.get(e1) === kindByEdgeId.get(e2) ||
      sharedVertex === harborSettlementVertex
  );

  return {
    coordCount: coords.length,
    firstFiveCoords: coords.slice(0, 5),
    lastFiveCoords: coords.slice(-5),
    hexOrder: topology.hexOrder,
    vertexCount: topology.vertexOrder.length,
    edgeCount: topology.edgeOrder.length,
    sampleVertices: topology.vertexOrder
      .slice(0, 6)
      .map((id) => topology.vertices[id]),
    sampleEdges: topology.edgeOrder.slice(0, 6).map((id) => topology.edges[id]),
    ringLongest,
    branchedUnblocked,
    branchedBlocked,
    transitionFiltered,
  };
}

function runCatanTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  config: Partial<CatanConfig>,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: CatanState = CatanEngine.initGame(players, config, seed);
    let steps = 0;
    let checkpoint25: unknown = null;

    while (CatanEngine.getWinner(state) === null && steps < 2500) {
      const actorId = getNextActingPlayerId(state);
      if (!actorId) break;
      const action = CatanEngine.chooseBotAction(state, actorId);
      if (!action) {
        throw new Error(`Null bot action in ${label} at step ${steps}`);
      }
      const next = CatanEngine.applyAction(state, actorId, action);
      const inv = CatanEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Catan invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 25) {
        const p1View = CatanEngine.getPlayerView(state, "p1");
        checkpoint25 = {
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          legalCountForActor: getNextActingPlayerId(state)
            ? CatanEngine.getLegalActions(state, getNextActingPlayerId(state)!)
                .length
            : 0,
          p1ViewSummary: {
            devCardDeckLength: p1View.devCardDeck.length,
            players: p1View.players.map((p) => ({
              id: p.id,
              handRedacted: Boolean(p.handRedacted),
              resourceCount:
                p.hiddenResourceCount ?? getPlayerResourceCount(p),
              victoryPoints: computePlayerVictoryPoints(p1View, p.id),
              devCardTypes: p.devCards.map((d) => d.type),
            })),
          },
        };
      }
    }

    return {
      label,
      steps,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      longestRoadOwnerId: state.longestRoadOwnerId,
      longestRoadLength: state.longestRoadLength,
      largestArmyOwnerId: state.largestArmyOwnerId,
      harbormasterOwnerId: state.harbormasterOwnerId,
      bank: state.bank,
      players: state.players.map((p) => ({
        id: p.id,
        victoryPoints: computePlayerVictoryPoints(state, p.id),
        resources: p.resources,
        settlementsRemaining: p.settlementsRemaining,
        citiesRemaining: p.citiesRemaining,
        roadsRemaining: p.roadsRemaining,
        shipsRemaining: p.shipsRemaining,
        knightsPlayed: p.knightsPlayed,
        harborPoints: p.harborPoints,
        bonusVictoryPoints: p.bonusVictoryPoints,
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint25,
    };
  });
}

function runSplendorTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: SplendorState = SplendorEngine.initGame(
      players,
      { targetPoints: 15 },
      seed
    );
    let steps = 0;
    let checkpoint20: unknown = null;

    while (SplendorEngine.getWinner(state) === null && steps < 1000) {
      const actor = state.players[state.activePlayerIndex]!;
      const action = SplendorEngine.chooseBotAction(state, actor.id);
      if (!action) {
        throw new Error(`Null Splendor bot action in ${label} at step ${steps}`);
      }
      const next = SplendorEngine.applyAction(state, actor.id, action);
      const inv = SplendorEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Splendor invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 20) {
        checkpoint20 = {
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          bank: state.bank,
          marketIds: {
            1: state.market[1].map((c) => c.id),
            2: state.market[2].map((c) => c.id),
            3: state.market[3].map((c) => c.id),
          },
        };
      }
    }

    return {
      label,
      steps,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      bank: state.bank,
      nobleIds: state.nobles.map((n) => n.id),
      players: state.players.map((p) => ({
        id: p.id,
        points: p.points,
        tokens: p.tokens,
        bonuses: p.bonuses,
        purchasedCount: p.purchasedCards.length,
        reservedCount: p.reservedCards.length,
        nobleIds: p.nobles.map((n) => n.id),
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint20,
    };
  });
}

function runAzulTrajectory(
  label: string,
  playerCount: number,
  seed: string,
  difficulties: BotDifficulty[]
) {
  return withDeterministicClockAndRandom(() => {
    const players = makePlayers(playerCount, difficulties);
    let state: AzulState = AzulEngine.initGame(players, {}, seed);
    let steps = 0;
    let checkpoint20: unknown = null;

    while (AzulEngine.getWinner(state) === null && steps < 1000) {
      const actor = state.players[state.activePlayerIndex]!;
      const action = AzulEngine.chooseBotAction(state, actor.id);
      if (!action) {
        throw new Error(`Null Azul bot action in ${label} at step ${steps}`);
      }
      const next = AzulEngine.applyAction(state, actor.id, action);
      const inv = AzulEngine.checkInvariants(next.state);
      if (!inv.valid) {
        throw new Error(
          `Azul invariant failure in ${label} at step ${steps}: ${inv.violations.join("; ")}`
        );
      }
      state = next.state;
      steps += 1;

      if (steps === 20) {
        checkpoint20 = {
          round: state.round,
          turn: state.turn,
          phase: state.phase,
          rngState: state.rngState,
          factories: state.factories,
          centerPool: state.centerPool,
        };
      }
    }

    return {
      label,
      steps,
      round: state.round,
      turn: state.turn,
      phase: state.phase,
      winnerId: state.winnerId,
      rngState: state.rngState,
      bagCount: state.bag.length,
      discardCount: state.discardLid.length,
      players: state.players.map((p) => ({
        id: p.id,
        score: p.score,
        wall: p.wall,
        floorLine: p.floorLine,
      })),
      eventLogLength: state.eventLog.length,
      lastEvents: state.eventLog.slice(-5).map((e) => e.message),
      checkpoint20,
    };
  });
}

function collectRoomManagerSnapshot() {
  return withDeterministicClockAndRandom(() => {
    const manager = new PlatformRoomManager();
    const room = manager.createRoom({
      name: "Golden Parity Room",
      gameId: "catan",
      ownerId: "p1",
      hostName: "Alice",
      seed: "golden-room-seed",
      startingPlayerMode: "first",
    });
    manager.joinRoom(room.roomId, "Bob", false, "p2");
    manager.addLocalPlayer(room.roomId, "p1", "Charlie");
    manager.updateRoomSetup(room.roomId, "p1", {
      botCount: 1,
      botDifficulty: "master",
      startingPlayerMode: "first",
      config: {
        scenarioId: "standard",
        enableHarbormaster: true,
      },
    });
    const preStartSummary = manager.toRoomSummary(room, "p1");

    manager.startGame(room.roomId, "p1");
    const firstLegal = CatanEngine.getLegalActions(
      room.session!.getState(),
      "p1"
    )[0]!;
    manager.dispatchAction(room.roomId, "p1", firstLegal);
    const afterFirstMoveP1 = manager.toRoomSummary(room, "p1");
    const afterFirstMoveP2 = manager.toRoomSummary(room, "p2");

    manager.undoAction(room.roomId, "p1");
    const afterUndoP1 = manager.toRoomSummary(room, "p1");
    manager.redoAction(room.roomId, "p1");
    const afterRedoP1 = manager.toRoomSummary(room, "p1");

    // Finish snake draft through p1/p2/local/bot
    while (room.session!.getState().phase.startsWith("SETUP_")) {
      const cur = room.session!.getState();
      const actId = getNextActingPlayerId(cur)!;
      const playerEntry = room.players.find((p) => p.id === actId)!;
      if (playerEntry.isBot) {
        manager.stepBot(room.roomId);
      } else {
        const act = CatanEngine.chooseBotAction(cur, actId)!;
        manager.dispatchAction(room.roomId, actId, act);
      }
    }

    const postSetupSummaryP1 = manager.toRoomSummary(room, "p1");
    const postSetupSummaryP2 = manager.toRoomSummary(room, "p2");
    const p1StateView = CatanEngine.getPlayerView(
      room.session!.getState(),
      "p1"
    );
    const p2StateView = CatanEngine.getPlayerView(
      room.session!.getState(),
      "p2"
    );

    return {
      registeredGames: manager.registry.list(),
      preStartSummary: {
        roomId: preStartSummary.roomId,
        name: preStartSummary.name,
        status: preStartSummary.status,
        players: preStartSummary.players,
        botCount: preStartSummary.botCount,
        botDifficulty: preStartSummary.botDifficulty,
        config: preStartSummary.config,
      },
      undoLifecycle: {
        afterFirstMoveP1CanUndo: afterFirstMoveP1.canUndo,
        afterFirstMoveP1UndoSteps: afterFirstMoveP1.undoableSteps,
        afterFirstMoveP2CanUndo: afterFirstMoveP2.canUndo,
        afterUndoStep: afterUndoP1.step,
        afterUndoCanRedo: afterUndoP1.canRedo,
        afterRedoStep: afterRedoP1.step,
      },
      postSetupP1Status: postSetupSummaryP1.status,
      postSetupP2Status: postSetupSummaryP2.status,
      postSetupP1Phase: p1StateView.phase,
      postSetupP2Phase: p2StateView.phase,
      postSetupP1Players: p1StateView.players.map((p) => ({
        id: p.id,
        handRedacted: Boolean(p.handRedacted),
        hiddenResourceCount: p.hiddenResourceCount,
        resources: p.resources,
      })),
      postSetupP2Players: p2StateView.players.map((p) => ({
        id: p.id,
        handRedacted: Boolean(p.handRedacted),
        hiddenResourceCount: p.hiddenResourceCount,
        resources: p.resources,
      })),
    };
  });
}

function collectVisualUiSnapshots() {
  return withDeterministicClockAndRandom(() => {
    const snapshots: Record<string, string> = {};

    // 1. Guest Login Screen
    const loginRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    new MultiGamePlatformApp(loginRoot, {
      forceLocalMode: true,
      startAtLogin: true,
    });
    snapshots.loginView = loginRoot.innerHTML;

    // 2. Lobby, Host Setup, Guest Setup, Catan, Splendor, and Azul Views
    const appRoot: any = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    };
    const app = new MultiGamePlatformApp(appRoot, {
      forceLocalMode: true,
      startAtLogin: false,
    }) as any;
    app.autoRespondBotsToHuman = false;
    snapshots.lobbyView = appRoot.innerHTML;

    // 3. Host Editable Room Setup (room-1)
    app.enterOrJoinRoom("room-1");
    const room1 = app.getActiveRoom();
    room1.seed = "golden-ui-catan-seed";
    room1.startingPlayerMode = "first";
    app.render();
    snapshots.roomSetupHost = appRoot.innerHTML;

    // 4. Guest Read-only Setup Summary (room-2)
    app.enterOrJoinRoom("room-2");
    snapshots.roomSetupGuest = appRoot.innerHTML;

    // 5. Catan SETUP_SETTLEMENT_1
    app.enterOrJoinRoom("room-1");
    app.startRoomMatch("room-1");
    snapshots.catanSetupSettlement1 = appRoot.innerHTML;

    // 6. Catan PRE_ROLL
    app.finishSetupWithBots();
    snapshots.catanPreRoll = appRoot.innerHTML;

    // 7. Catan MAIN_PHASE
    const aliceId = room1.players[0]!.id as string;
    const bot1Id = room1.players[1]!.id as string;
    app.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room1.session.getState().phase !== "MAIN_PHASE") {
      const cur = room1.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      app.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    snapshots.catanMainPhase = appRoot.innerHTML;

    // 8. Catan Bank Trade Drawer + Request Selection
    app.switchTradeMode("maritime_trade");
    app.setSharedTradeWant("ore", 1);
    app.setSharedTradeWant("brick", 1);
    app.render();
    snapshots.catanBankTradeModal = appRoot.innerHTML;

    // 9. Catan Player Trade Drawer (preserving Request)
    app.switchTradeMode("domestic_trade");
    app.domesticGive.wool = 1;
    app.render();
    snapshots.catanPlayerTradeModal = appRoot.innerHTML;
    app.switchTradeMode(null);

    // 10. Opponent Turn (!isMyTurn) & Incoming Trade Offer Decision
    app.dispatch(aliceId, { type: "END_TURN" });
    snapshots.catanOpponentTurn = appRoot.innerHTML;

    app.dispatch(bot1Id, { type: "ROLL_DICE" });
    while (room1.session.getState().phase !== "MAIN_PHASE") {
      const cur = room1.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      app.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    const stBot = room1.session.getState();
    stBot.players[1]!.resources.grain += 1;
    stBot.bank.grain -= 1;
    stBot.players[0]!.resources.lumber += 1;
    stBot.bank.lumber -= 1;
    app.dispatch(bot1Id, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: aliceId,
      give: { grain: 1 },
      want: { lumber: 1 },
    });
    snapshots.catanIncomingTradeOffer = appRoot.innerHTML;

    // 11. Splendor In-Game View (room-3)
    const room3 = app.rooms.get("room-3");
    room3.ownerId = app.currentUserId;
    room3.ownerName = app.currentUserName;
    room3.humanPlayers = [
      {
        id: app.currentUserId,
        name: app.currentUserName,
        color: "#e11d48",
        isBot: false,
      },
    ];
    room3.seed = "golden-ui-splendor-seed";
    room3.startingPlayerMode = "first";
    app.rebuildRoomSeats(room3);
    app.enterOrJoinRoom("room-3");
    app.startRoomMatch("room-3");
    app.splendorDraftGems = { emerald: 1, sapphire: 1 };
    app.render();
    snapshots.splendorInGame = appRoot.innerHTML;

    // 12. Azul In-Game View (room-4)
    const room4 = app.rooms.get("room-4");
    room4.ownerId = app.currentUserId;
    room4.ownerName = app.currentUserName;
    room4.humanPlayers = [
      {
        id: app.currentUserId,
        name: app.currentUserName,
        color: "#e11d48",
        isBot: false,
      },
    ];
    room4.seed = "golden-ui-azul-seed";
    room4.startingPlayerMode = "first";
    app.rebuildRoomSeats(room4);
    app.enterOrJoinRoom("room-4");
    app.startRoomMatch("room-4");
    const firstFactoryColor = room4.session.getState().factories[0]![0]!;
    app.azulSelectedDraft = {
      source: { kind: "factory", factoryIndex: 0 },
      color: firstFactoryColor,
    };
    app.render();
    snapshots.azulInGame = appRoot.innerHTML;

    // 13. Direct Pure Component Renderers
    const catanDirectState = CatanEngine.initGame(
      makePlayers(4),
      { scenarioId: "seafarers_new_shores", enableHarbormaster: true },
      "direct-svg-seed"
    );
    snapshots.directCatanSvg = renderCatanBoardSvg(catanDirectState, "p1", {
      buildMode: null,
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
    });
    snapshots.directCatanHand = renderCatanVisualHandTray(
      catanDirectState,
      {
        ...catanDirectState.players[0]!,
        resources: { brick: 2, lumber: 1, wool: 3, grain: 0, ore: 1 },
      },
      CatanEngine.getLegalActions(catanDirectState, "p1")
    );
    const splendorDirectState = SplendorEngine.initGame(
      makePlayers(3),
      {},
      "direct-splendor-seed"
    );
    snapshots.directSplendorBoard = renderSplendorBoardView(
      splendorDirectState,
      { ruby: 1 }
    );
    const azulDirectState = AzulEngine.initGame(
      makePlayers(3),
      {},
      "direct-azul-seed"
    );
    snapshots.directAzulBoard = renderAzulBoardView(azulDirectState, null);

    const hashes = Object.fromEntries(
      Object.entries(snapshots).map(([key, html]) => [
        key,
        { length: html.length, sha256: sha256(html) },
      ])
    );

    return { hashes, htmlByScreen: snapshots };
  });
}

interface GoldenSnapshotData {
  prng: ReturnType<typeof collectPrngSnapshot>;
  hexAndPath: ReturnType<typeof collectHexAndPathSnapshot>;
  catanTrajectories: ReturnType<typeof runCatanTrajectory>[];
  splendorTrajectories: ReturnType<typeof runSplendorTrajectory>[];
  azulTrajectories: ReturnType<typeof runAzulTrajectory>[];
  roomManager: ReturnType<typeof collectRoomManagerSnapshot>;
  visualUi: ReturnType<typeof collectVisualUiSnapshots>;
}

function collectCatanTrajectories() {
  return [
    runCatanTrajectory(
      "catan-standard-4p",
      4,
      "golden-catan-std-4p",
      { scenarioId: "standard" },
      ["master", "smart", "normal", "easy"]
    ),
    runCatanTrajectory(
      "catan-ext-5p",
      5,
      "golden-catan-ext-5p",
      { scenarioId: "big_island_5_6" },
      ["smart", "normal", "master", "normal", "easy"]
    ),
    runCatanTrajectory(
      "catan-new-shores-4p",
      4,
      "golden-catan-new-shores",
      { scenarioId: "seafarers_new_shores" },
      ["master", "smart", "normal", "smart"]
    ),
    runCatanTrajectory(
      "catan-fog-islands-4p",
      4,
      "golden-catan-fog",
      { scenarioId: "seafarers_fog_islands" },
      ["smart", "normal", "smart", "normal"]
    ),
    runCatanTrajectory(
      "catan-variants-4p",
      4,
      "golden-catan-variants",
      {
        scenarioId: "standard",
        enableHarbormaster: true,
        enableCityWalls: true,
        enableFriendlyRobber: true,
      },
      ["master", "smart", "normal", "smart"]
    ),
  ];
}

function collectSplendorTrajectories() {
  return [
    runSplendorTrajectory("splendor-2p", 2, "golden-splendor-2p", [
      "master",
      "smart",
    ]),
    runSplendorTrajectory("splendor-3p", 3, "golden-splendor-3p", [
      "master",
      "smart",
      "normal",
    ]),
    runSplendorTrajectory("splendor-4p", 4, "golden-splendor-4p", [
      "master",
      "smart",
      "normal",
      "easy",
    ]),
  ];
}

function collectAzulTrajectories() {
  return [
    runAzulTrajectory("azul-2p", 2, "golden-azul-2p", ["master", "smart"]),
    runAzulTrajectory("azul-3p", 3, "golden-azul-3p", [
      "master",
      "smart",
      "normal",
    ]),
    runAzulTrajectory("azul-4p", 4, "golden-azul-4p", [
      "master",
      "smart",
      "normal",
      "easy",
    ]),
  ];
}

function computeFullGoldenSuite(): GoldenSnapshotData {
  return {
    prng: collectPrngSnapshot(),
    hexAndPath: collectHexAndPathSnapshot(),
    catanTrajectories: collectCatanTrajectories(),
    splendorTrajectories: collectSplendorTrajectories(),
    azulTrajectories: collectAzulTrajectories(),
    roomManager: collectRoomManagerSnapshot(),
    visualUi: collectVisualUiSnapshots(),
  };
}

function loadOrCreateGoldenSnapshot(): GoldenSnapshotData {
  if (!fs.existsSync(GOLDEN_SNAPSHOT_PATH)) {
    fs.mkdirSync(path.dirname(GOLDEN_SNAPSHOT_PATH), { recursive: true });
    const generated = computeFullGoldenSuite();
    fs.writeFileSync(
      GOLDEN_SNAPSHOT_PATH,
      JSON.stringify(generated, null, 2),
      "utf8"
    );
    return generated;
  }
  return JSON.parse(
    fs.readFileSync(GOLDEN_SNAPSHOT_PATH, "utf8")
  ) as GoldenSnapshotData;
}

describe("Functional Refactoring Golden Parity & Immutability Suite", () => {
  const golden = loadOrCreateGoldenSnapshot();

  test("preserves exact PRNG hashes, float/int/dice streams, shuffles, and state resume", () => {
    const actual = collectPrngSnapshot();
    expect(actual).toEqual(golden.prng);
  });

  test("preserves exact hex grid coordinates, topology ordering, and longest simple path results", () => {
    const actual = collectHexAndPathSnapshot();
    expect(actual).toEqual(golden.hexAndPath);
  });

  test("preserves exact deterministic full-game trajectories for Catan, Splendor, and Azul", () => {
    expect(collectCatanTrajectories()).toEqual(golden.catanTrajectories);
    expect(collectSplendorTrajectories()).toEqual(golden.splendorTrajectories);
    expect(collectAzulTrajectories()).toEqual(golden.azulTrajectories);
  });

  test("preserves exact PlatformRoomManager lifecycle, redaction, and turn-scoped undo/redo", () => {
    const actual = collectRoomManagerSnapshot();
    expect(actual).toEqual(golden.roomManager);
  });

  test("preserves byte-for-byte identical HTML & SVG visual output across all UI screens and game boards", () => {
    const actual = collectVisualUiSnapshots();
    expect(actual.hashes).toEqual(golden.visualUi.hashes);
    for (const [screenName, expectedHtml] of Object.entries(
      golden.visualUi.htmlByScreen
    )) {
      expect(actual.htmlByScreen[screenName]).toBe(expectedHtml);
    }
  });

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

  test("enforces functional style across all project TypeScript source files (zero classes, zero `this`, zero OOP project `new` calls)", () => {
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      ".."
    );
    const targetDirs = ["packages", "apps", "scripts"].map((d) =>
      path.join(repoRoot, d)
    );

    const collectTsFiles = (dir: string): readonly string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "public"
        ) {
          return [];
        }
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory()
          ? collectTsFiles(fullPath)
          : entry.isFile() && entry.name.endsWith(".ts")
            ? [fullPath]
            : [];
      });

    const sourceFiles = targetDirs.flatMap(collectTsFiles);
    expect(sourceFiles.length).toBeGreaterThanOrEqual(28);

    const stripLiteralsAndComments = (src: string): string => {
      let out = "";
      let i = 0;
      let prevNonSpace = "(";
      const templateBraceStack: number[] = [];
      let braceDepth = 0;
      let mode:
        | "code"
        | "line_comment"
        | "block_comment"
        | "single"
        | "double"
        | "regex"
        | "template" = "code";
      let inRegexCharClass = false;

      while (i < src.length) {
        const ch = src[i]!;
        const next = src[i + 1] ?? "";

        if (mode === "line_comment") {
          if (ch === "\n") {
            out += "\n";
            mode = "code";
          } else {
            out += " ";
          }
          i++;
          continue;
        }

        if (mode === "block_comment") {
          if (ch === "*" && next === "/") {
            out += "  ";
            i += 2;
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
            i++;
          }
          continue;
        }

        if (mode === "regex") {
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === "[") {
            inRegexCharClass = true;
            out += " ";
            i++;
            continue;
          }
          if (ch === "]") {
            inRegexCharClass = false;
            out += " ";
            i++;
            continue;
          }
          if (ch === "/" && !inRegexCharClass) {
            out += " ";
            i++;
            while (i < src.length && /[dgimsuvy]/.test(src[i]!)) {
              out += " ";
              i++;
            }
            prevNonSpace = "/";
            mode = "code";
            continue;
          }
          out += ch === "\n" ? "\n" : " ";
          i++;
          continue;
        }

        if (mode === "single" || mode === "double") {
          const quote = mode === "single" ? "'" : '"';
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === quote) {
            out += " ";
            prevNonSpace = quote;
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
          }
          i++;
          continue;
        }

        if (mode === "template") {
          if (ch === "\\") {
            out += "  ";
            i += 2;
            continue;
          }
          if (ch === "$" && next === "{") {
            templateBraceStack.push(braceDepth);
            out += "  ";
            i += 2;
            prevNonSpace = "{";
            mode = "code";
            continue;
          }
          if (ch === "`") {
            out += " ";
            prevNonSpace = "`";
            mode = "code";
          } else {
            out += ch === "\n" ? "\n" : " ";
          }
          i++;
          continue;
        }

        // mode === "code"
        if (ch === "/" && next === "/") {
          out += "  ";
          i += 2;
          mode = "line_comment";
          continue;
        }
        if (ch === "/" && next === "*") {
          out += "  ";
          i += 2;
          mode = "block_comment";
          continue;
        }
        if (
          ch === "/" &&
          next !== "=" &&
          "=(,:;!&|?{}[~^+-*%<>".includes(prevNonSpace)
        ) {
          out += " ";
          i++;
          inRegexCharClass = false;
          mode = "regex";
          continue;
        }
        if (ch === "'") {
          out += " ";
          i++;
          mode = "single";
          continue;
        }
        if (ch === '"') {
          out += " ";
          i++;
          mode = "double";
          continue;
        }
        if (ch === "`") {
          out += " ";
          i++;
          mode = "template";
          continue;
        }
        if (ch === "{") {
          braceDepth++;
          out += ch;
          prevNonSpace = ch;
          i++;
          continue;
        }
        if (ch === "}") {
          if (
            templateBraceStack.length > 0 &&
            braceDepth === templateBraceStack[templateBraceStack.length - 1]
          ) {
            templateBraceStack.pop();
            out += " ";
            i++;
            mode = "template";
            continue;
          }
          braceDepth = Math.max(0, braceDepth - 1);
          out += ch;
          prevNonSpace = ch;
          i++;
          continue;
        }

        if (!/\s/.test(ch)) {
          prevNonSpace = ch;
        }
        out += ch;
        i++;
      }

      return out;
    };

    const bannedNewPattern =
      /\bnew\s+(SeededRNG|GameRegistry|MatchSession|PlatformRoomManager|MultiGamePlatformApp)\b/;

    const violations = sourceFiles.flatMap((filePath) => {
      const rel = path.relative(repoRoot, filePath);
      const raw = fs.readFileSync(filePath, "utf8");
      const stripped = stripLiteralsAndComments(raw);
      return stripped.split("\n").flatMap((lineText, idx) => {
        const lineNo = idx + 1;
        return [
          ...(/\bclass\b/.test(lineText)
            ? [`${rel}:${lineNo} unexpected 'class' keyword: ${lineText.trim()}`]
            : []),
          ...(/\bthis\b/.test(lineText)
            ? [`${rel}:${lineNo} unexpected 'this' keyword: ${lineText.trim()}`]
            : []),
          ...(bannedNewPattern.test(lineText)
            ? [`${rel}:${lineNo} unexpected OOP 'new' call: ${lineText.trim()}`]
            : []),
        ];
      });
    });

    expect(violations).toEqual([]);
  });
});
