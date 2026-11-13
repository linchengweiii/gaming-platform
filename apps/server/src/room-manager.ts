import {
  type BotDifficulty,
  type GameEngine,
  type GameRegistry,
  type GameRegistryState,
  type MatchSession,
  type MatchSessionState,
  type PlayerDescriptor,
  canSessionPlayerRedo,
  canSessionPlayerUndo,
  createEmptyRegistryState,
  createMatchSessionState,
  dispatchSessionActionPure,
  getRegisteredEnginePure,
  getSessionActionLog,
  getSessionState,
  getSessionStep,
  getSessionTotalSteps,
  getSessionUndoableStepCount,
  jumpSessionToStepPure,
  listRegisteredGamesPure,
  redoSessionForPlayerPure,
  redoSessionPure,
  registerEnginePure,
  undoSessionForPlayerPure,
  undoSessionPure,
} from "@gaming-platform/core";
import {
  CatanEngine,
  PLAYER_COLORS,
  SCENARIO_CATALOG,
  type ScenarioId,
  getNextActingPlayerId,
} from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";

export interface RoomSummary {
  roomId: string;
  name: string;
  gameId: string;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  botCount: number;
  botDifficulty: BotDifficulty;
  allBots: boolean;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  players: PlayerDescriptor[];
  config: Record<string, unknown>;
  canUndo: boolean;
  undoableSteps: number;
  canRedo: boolean;
  step: number;
  createdAt: number;
}

export interface RoomRecord {
  readonly roomId: string;
  readonly name: string;
  readonly gameId: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly status: "lobby" | "in_progress" | "finished";
  readonly humanPlayers: readonly PlayerDescriptor[];
  readonly botCount: number;
  readonly botDifficulty: BotDifficulty;
  readonly allBots: boolean;
  readonly startingPlayerMode: string;
  readonly autoStepBots: boolean;
  readonly players: readonly PlayerDescriptor[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly seed: string;
  readonly matchCounter: number;
  readonly sessionState: MatchSessionState<any, any> | null;
  readonly createdAt: number;
}

export interface RoomInstance {
  roomId: string;
  name: string;
  gameId: string;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  humanPlayers: PlayerDescriptor[];
  botCount: number;
  botDifficulty: BotDifficulty;
  allBots: boolean;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  players: PlayerDescriptor[];
  config: Record<string, unknown>;
  seed: string;
  matchCounter: number;
  session: MatchSession<any, any, any> | null;
  createdAt: number;
}

export interface RoomManagerState {
  readonly registry: GameRegistryState;
  readonly rooms: Readonly<Record<string, RoomRecord>>;
  readonly roomOrder: readonly string[];
  readonly roomCounter: number;
}

export function getRoomActingPlayerId(
  gameId: string,
  state: any
): string | null {
  if (!state) return null;
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
  return getNextActingPlayerId(state);
}

export function createInitialRoomManagerState(): RoomManagerState {
  const r0 = createEmptyRegistryState();
  const r1 = registerEnginePure(r0, CatanEngine);
  const r2 = registerEnginePure(r1, SplendorEngine);
  const r3 = registerEnginePure(r2, AzulEngine);
  return {
    registry: r3,
    rooms: {},
    roomOrder: [],
    roomCounter: 1,
  };
}

export function getRoomPlayerBoundsPure(
  registry: GameRegistryState,
  gameId: string,
  config: Readonly<Record<string, unknown>>
): { minPlayers: number; maxPlayers: number } {
  if (gameId === "catan") {
    const scId = (config.scenarioId as ScenarioId) ?? "standard";
    const sc = SCENARIO_CATALOG[scId] ?? SCENARIO_CATALOG.standard;
    return {
      minPlayers: sc.minPlayers,
      maxPlayers: sc.maxPlayers,
    };
  }
  const engine = getRegisteredEnginePure(registry, gameId);
  return {
    minPlayers: engine.metadata.minPlayers,
    maxPlayers: engine.metadata.maxPlayers,
  };
}

export function canViewerControlActorPure(
  room: Pick<RoomRecord, "players">,
  viewerId: string | null | undefined,
  actorId: string | null
): boolean {
  if (!viewerId || !actorId) return false;
  const actor = room.players.find((p) => p.id === actorId);
  if (!actor || actor.isBot) return false;
  return actor.id === viewerId || actor.controllerId === viewerId;
}

export function toRoomSummaryPure(
  registry: GameRegistryState,
  r: RoomRecord,
  viewerId?: string | null
): RoomSummary {
  const engine = getRegisteredEnginePure(registry, r.gameId);
  const state = r.sessionState ? getSessionState(r.sessionState) : null;
  const actingId = state ? getRoomActingPlayerId(r.gameId, state) : null;
  const rawUndoableSteps =
    r.sessionState && actingId
      ? getSessionUndoableStepCount(engine, r.sessionState, actingId)
      : 0;
  const viewerAllowed =
    viewerId === undefined
      ? Boolean(actingId && !r.players.find((p) => p.id === actingId)?.isBot)
      : canViewerControlActorPure(r, viewerId, actingId);
  const undoableSteps = viewerAllowed ? rawUndoableSteps : 0;
  const canRedo =
    viewerAllowed && r.sessionState && actingId
      ? canSessionPlayerRedo(r.sessionState, actingId)
      : false;

  return {
    roomId: r.roomId,
    name: r.name,
    gameId: r.gameId,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    status: r.status,
    botCount: r.botCount,
    botDifficulty: r.botDifficulty,
    allBots: r.allBots,
    startingPlayerMode: r.startingPlayerMode,
    autoStepBots: r.autoStepBots,
    players: r.players.slice(),
    config: { ...r.config },
    canUndo: undoableSteps > 0,
    undoableSteps,
    canRedo,
    step: r.sessionState ? getSessionStep(r.sessionState) : 0,
    createdAt: r.createdAt,
  };
}

export function listRoomsPure(
  managerState: RoomManagerState,
  gameFilter?: string
): RoomSummary[] {
  return managerState.roomOrder
    .map((id) => managerState.rooms[id])
    .filter(
      (r): r is RoomRecord =>
        Boolean(
          r && (!gameFilter || gameFilter === "all" || r.gameId === gameFilter)
        )
    )
    .map((r) => toRoomSummaryPure(managerState.registry, r));
}

export function getRoomRecordPure(
  managerState: RoomManagerState,
  roomId: string
): RoomRecord {
  const room = managerState.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found`);
  }
  return room;
}

function setRoomRecordInState(
  managerState: RoomManagerState,
  room: RoomRecord
): RoomManagerState {
  const exists = Boolean(managerState.rooms[room.roomId]);
  return {
    ...managerState,
    rooms: {
      ...managerState.rooms,
      [room.roomId]: room,
    },
    roomOrder: exists
      ? managerState.roomOrder
      : [...managerState.roomOrder, room.roomId],
  };
}

function removeRoomRecordFromState(
  managerState: RoomManagerState,
  roomId: string
): RoomManagerState {
  const nextRooms = Object.fromEntries(
    Object.entries(managerState.rooms).filter(([id]) => id !== roomId)
  );
  return {
    ...managerState,
    rooms: nextRooms,
    roomOrder: managerState.roomOrder.filter((id) => id !== roomId),
  };
}

export function rebuildRoomPlayersPure(
  registry: GameRegistryState,
  room: RoomRecord
): RoomRecord {
  const bounds = getRoomPlayerBoundsPure(registry, room.gameId, room.config);

  if (room.allBots) {
    const clampedBotCount = Math.max(
      bounds.minPlayers,
      Math.min(bounds.maxPlayers, room.botCount || 4)
    );
    const nextPlayers: PlayerDescriptor[] = Array.from(
      { length: clampedBotCount },
      (_, i) => ({
        id: `p${i + 1}`,
        name: `Bot ${i + 1}`,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
        isBot: true,
        botDifficulty: room.botDifficulty,
      })
    );
    const validStartMode =
      room.startingPlayerMode !== "random" &&
      room.startingPlayerMode !== "first" &&
      !nextPlayers.some((p) => p.id === room.startingPlayerMode)
        ? "random"
        : room.startingPlayerMode;

    return {
      ...room,
      botCount: clampedBotCount,
      players: nextPlayers,
      startingPlayerMode: validStartMode,
    };
  }

  const trimmedHumans = room.humanPlayers.slice(0, bounds.maxPlayers);
  const maxBots = Math.max(0, bounds.maxPlayers - trimmedHumans.length);
  const clampedBotCount = Math.max(0, Math.min(maxBots, room.botCount));

  const seatedHumans: PlayerDescriptor[] = trimmedHumans.map((hp, idx) => ({
    ...hp,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: false,
  }));

  const nextPlayers = Array.from({ length: clampedBotCount }).reduce<
    PlayerDescriptor[]
  >((acc, _, b) => {
    const idx = acc.length;
    const defaultId = `p${idx + 1}`;
    const finalId = acc.some((p) => p.id === defaultId)
      ? `bot-${b + 1}`
      : defaultId;
    return [
      ...acc,
      {
        id: finalId,
        name: `Bot ${b + 1}`,
        color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
        isBot: true,
        botDifficulty: room.botDifficulty,
      },
    ];
  }, seatedHumans);

  const validStartMode =
    room.startingPlayerMode !== "random" &&
    room.startingPlayerMode !== "first" &&
    !nextPlayers.some((p) => p.id === room.startingPlayerMode)
      ? "random"
      : room.startingPlayerMode;

  return {
    ...room,
    humanPlayers: trimmedHumans,
    botCount: clampedBotCount,
    players: nextPlayers,
    startingPlayerMode: validStartMode,
  };
}

export interface CreateRoomOptions {
  name?: string;
  gameId?: string;
  ownerId?: string;
  hostName?: string;
  botCount?: number;
  botDifficulty?: BotDifficulty;
  allBots?: boolean;
  startingPlayerMode?: string;
  autoStepBots?: boolean;
  config?: Record<string, unknown>;
  seed?: string;
  autoStart?: boolean;
}

export function createRoomPure(
  managerState: RoomManagerState,
  options: CreateRoomOptions,
  nowMs: number = Date.now()
): { state: RoomManagerState; roomId: string } {
  const roomIndex = managerState.roomCounter;
  const roomId = `room-${roomIndex}`;
  const gameId = options.gameId ?? "catan";
  const engine = getRegisteredEnginePure(managerState.registry, gameId);

  const ownerId = options.ownerId?.trim() || "p1";
  const ownerName = options.hostName?.trim() || "Player 1 (Host)";

  const botDifficulty: BotDifficulty =
    options.botDifficulty ??
    (options.config?.botDifficulty as BotDifficulty | undefined) ??
    "master";

  const humanPlayers: PlayerDescriptor[] = options.allBots
    ? []
    : [
        {
          id: ownerId,
          name: ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        },
      ];

  const defaultBotCount =
    options.botCount ??
    (options.allBots ? 4 : options.autoStart ? 3 : 0);

  const defaultConfig =
    gameId === "catan"
      ? {
          scenarioId: "standard",
          enableHarbormaster: false,
          enableCityWalls: false,
          enableFriendlyRobber: false,
          botDifficulty,
          ...options.config,
        }
      : { botDifficulty, ...options.config };

  const draftRoom: RoomRecord = {
    roomId,
    name: options.name || `${engine.metadata.name} Table #${roomIndex}`,
    gameId,
    ownerId,
    ownerName,
    status: "lobby",
    humanPlayers,
    botCount: defaultBotCount,
    botDifficulty,
    allBots: Boolean(options.allBots),
    startingPlayerMode: options.startingPlayerMode ?? "random",
    autoStepBots: options.autoStepBots ?? true,
    players: [],
    config: defaultConfig,
    seed: options.seed ?? `${roomId}-${nowMs}`,
    matchCounter: 0,
    sessionState: null,
    createdAt: nowMs,
  };

  const builtRoom = rebuildRoomPlayersPure(managerState.registry, draftRoom);
  const withRoom = setRoomRecordInState(
    { ...managerState, roomCounter: roomIndex + 1 },
    builtRoom
  );

  if (options.autoStart === true) {
    const started = startGamePure(withRoom, roomId, ownerId);
    return { state: started.state, roomId };
  }

  return { state: withRoom, roomId };
}

export interface RoomSetupUpdates {
  name?: string;
  gameId?: string;
  botCount?: number;
  playerCount?: number;
  allBots?: boolean;
  botDifficulty?: BotDifficulty;
  startingPlayerMode?: string;
  config?: Record<string, unknown>;
  seed?: string;
}

export function updateRoomSetupPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  updates: RoomSetupUpdates
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Game setup is read-only while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can change the game setup");
  }

  const nextName =
    updates.name !== undefined && updates.name.trim()
      ? updates.name.trim()
      : room.name;

  const nextGameId =
    updates.gameId && updates.gameId !== room.gameId
      ? (() => {
          getRegisteredEnginePure(managerState.registry, updates.gameId!);
          return updates.gameId!;
        })()
      : room.gameId;

  const mergedConfig = updates.config
    ? { ...room.config, ...updates.config }
    : room.config;

  const nextBotDifficulty = updates.botDifficulty ?? room.botDifficulty;
  const nextConfig = updates.botDifficulty
    ? { ...mergedConfig, botDifficulty: updates.botDifficulty }
    : mergedConfig;

  const nextStartingPlayerMode =
    updates.startingPlayerMode !== undefined
      ? updates.startingPlayerMode
      : room.startingPlayerMode;

  const nextSeed = updates.seed ? updates.seed : room.seed;
  const nextAllBots =
    updates.allBots !== undefined ? updates.allBots : room.allBots;

  const nextHumanPlayers =
    updates.allBots !== undefined &&
    !nextAllBots &&
    room.humanPlayers.length === 0 &&
    room.ownerId
      ? [
          {
            id: room.ownerId,
            name: room.ownerName,
            color: PLAYER_COLORS[0]!,
            isBot: false,
          },
        ]
      : room.humanPlayers;

  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    nextGameId,
    nextConfig
  );

  const nextBotCount = (() => {
    if (updates.botCount !== undefined) {
      return updates.botCount;
    }
    if (updates.playerCount !== undefined) {
      const clampedTarget = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, updates.playerCount)
      );
      return nextAllBots
        ? clampedTarget
        : Math.max(0, clampedTarget - nextHumanPlayers.length);
    }
    if (
      nextGameId === "catan" &&
      nextConfig.scenarioId === "big_island_5_6" &&
      nextHumanPlayers.length + room.botCount < 5
    ) {
      return Math.max(room.botCount, 5 - nextHumanPlayers.length);
    }
    return room.botCount;
  })();

  const updatedRoom = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    name: nextName,
    gameId: nextGameId,
    config: nextConfig,
    botDifficulty: nextBotDifficulty,
    startingPlayerMode: nextStartingPlayerMode,
    seed: nextSeed,
    allBots: nextAllBots,
    humanPlayers: nextHumanPlayers,
    botCount: nextBotCount,
  });

  return setRoomRecordInState(managerState, updatedRoom);
}

export function addLocalPlayerPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  playerName: string,
  localIdSuffix: string = Math.random().toString(36).slice(2, 6)
): { state: RoomManagerState; player: PlayerDescriptor } {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Cannot add players while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can add local players");
  }
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  if (room.humanPlayers.length >= bounds.maxPlayers) {
    throw new Error(`Room is full (max ${bounds.maxPlayers} players)`);
  }
  const cleanName = playerName.trim();
  if (!cleanName) {
    throw new Error("Enter a player name");
  }
  const localId = `local-${room.humanPlayers.length + 1}-${localIdSuffix}`;
  const descriptor: PlayerDescriptor = {
    id: localId,
    name: cleanName.slice(0, 28),
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
    controllerId: room.ownerId,
  };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    allBots: false,
    humanPlayers: [...room.humanPlayers, descriptor],
  });
  const seated = rebuilt.players.find((p) => p.id === localId) ?? descriptor;
  return {
    state: setRoomRecordInState(managerState, rebuilt),
    player: seated,
  };
}

export function removeLocalPlayerPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  targetPlayerId: string
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Cannot remove players while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can remove seats");
  }
  if (targetPlayerId === room.ownerId) {
    throw new Error("The host seat cannot be removed");
  }

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: room.humanPlayers.filter((p) => p.id !== targetPlayerId),
  });
  return setRoomRecordInState(managerState, rebuilt);
}

export function joinRoomPure(
  managerState: RoomManagerState,
  roomId: string,
  playerName: string,
  isBot = false,
  preferredPlayerId?: string,
  nowMs: number = Date.now()
): { state: RoomManagerState; player: PlayerDescriptor } {
  const room = getRoomRecordPure(managerState, roomId);
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  const cleanName = playerName.trim() || "Guest";

  if (preferredPlayerId) {
    const existingHuman = room.humanPlayers.find(
      (p) => p.id === preferredPlayerId
    );
    if (existingHuman) {
      if (room.status !== "in_progress" && cleanName) {
        const updatedHumans = room.humanPlayers.map((p) =>
          p.id === preferredPlayerId ? { ...p, name: cleanName } : p
        );
        const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
          ...room,
          humanPlayers: updatedHumans,
          ownerName:
            room.ownerId === preferredPlayerId ? cleanName : room.ownerName,
        });
        const seated =
          rebuilt.players.find((p) => p.id === preferredPlayerId) ?? {
            ...existingHuman,
            name: cleanName,
          };
        return {
          state: setRoomRecordInState(managerState, rebuilt),
          player: seated,
        };
      }
      return {
        state: managerState,
        player:
          room.players.find((p) => p.id === preferredPlayerId) ?? existingHuman,
      };
    }

    const existingAny = room.players.find((p) => p.id === preferredPlayerId);
    if (existingAny) {
      return { state: managerState, player: existingAny };
    }
  }

  if (room.status === "in_progress") {
    throw new Error(
      "Cannot join a room as a new player after the game has started"
    );
  }

  if (isBot) {
    if (room.players.length >= bounds.maxPlayers) {
      throw new Error(`Room is full (max ${bounds.maxPlayers} players)`);
    }
    const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
      ...room,
      botCount: room.botCount + 1,
    });
    return {
      state: setRoomRecordInState(managerState, rebuilt),
      player: rebuilt.players[rebuilt.players.length - 1]!,
    };
  }

  if (room.humanPlayers.length >= bounds.maxPlayers) {
    throw new Error(`Room is full (max ${bounds.maxPlayers} human players)`);
  }

  const assignedId =
    preferredPlayerId ||
    `guest-${room.humanPlayers.length + 1}-${nowMs % 10000}`;

  const humanDescriptor: PlayerDescriptor = {
    id: assignedId,
    name: cleanName,
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
  };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: [...room.humanPlayers, humanDescriptor],
  });
  const seated =
    rebuilt.players.find((p) => p.id === assignedId) ?? humanDescriptor;
  return {
    state: setRoomRecordInState(managerState, rebuilt),
    player: seated,
  };
}

export function leaveRoomPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string
): { state: RoomManagerState; closed: boolean } {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    return { state: managerState, closed: false };
  }

  const nextHumans = room.humanPlayers.filter(
    (p) => p.id !== playerId && p.controllerId !== playerId
  );
  if (nextHumans.length === room.humanPlayers.length) {
    return { state: managerState, closed: false };
  }

  if (nextHumans.length === 0 && !room.allBots) {
    return {
      state: removeRoomRecordFromState(managerState, roomId),
      closed: true,
    };
  }

  const promotedOwner =
    room.ownerId === playerId && nextHumans.length > 0
      ? { ownerId: nextHumans[0]!.id, ownerName: nextHumans[0]!.name }
      : { ownerId: room.ownerId, ownerName: room.ownerName };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: nextHumans,
    ownerId: promotedOwner.ownerId,
    ownerName: promotedOwner.ownerName,
  });

  return {
    state: setRoomRecordInState(managerState, rebuilt),
    closed: false,
  };
}

export function startGamePure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string
): { state: RoomManagerState; gameState: any } {
  const rawRoom = getRoomRecordPure(managerState, roomId);
  if (requesterId && rawRoom.ownerId && requesterId !== rawRoom.ownerId) {
    throw new Error("Only the room owner can start the game");
  }

  const room = rebuildRoomPlayersPure(managerState.registry, rawRoom);
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  if (room.players.length < bounds.minPlayers) {
    throw new Error(
      `Need at least ${bounds.minPlayers} players to start (currently ${room.players.length}). Add bots or wait for another guest to join.`
    );
  }

  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const startConfig = (() => {
    if (room.startingPlayerMode === "first") {
      return {
        startingPlayerIndex: 0 as number | undefined,
        randomizeStartingPlayer: false,
      };
    }
    if (room.startingPlayerMode === "random") {
      return {
        startingPlayerIndex: undefined as number | undefined,
        randomizeStartingPlayer: true,
      };
    }
    const foundIdx = room.players.findIndex(
      (p) => p.id === room.startingPlayerMode
    );
    return foundIdx >= 0
      ? {
          startingPlayerIndex: foundIdx as number | undefined,
          randomizeStartingPlayer: false,
        }
      : {
          startingPlayerIndex: undefined as number | undefined,
          randomizeStartingPlayer: true,
        };
  })();

  const matchSeed =
    room.matchCounter === 0 ? room.seed : `${room.seed}-g${room.matchCounter}`;

  const initialState = engine.initGame(
    room.players,
    {
      ...room.config,
      startingPlayerIndex: startConfig.startingPlayerIndex,
      randomizeStartingPlayer: startConfig.randomizeStartingPlayer,
    },
    matchSeed
  );

  const sessionState = createMatchSessionState(engine, initialState, true);
  const startedRoom: RoomRecord = {
    ...room,
    matchCounter: room.matchCounter + 1,
    sessionState,
    status: "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, startedRoom),
    gameState: getSessionState(sessionState),
  };
}

export function dispatchActionPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string,
  action: any
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const dispatched = dispatchSessionActionPure(
    engine,
    room.sessionState,
    playerId,
    action
  );
  const nextStatus =
    dispatched.result.state.phase === "GAME_OVER" ? "finished" : room.status;

  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: dispatched.session,
    status: nextStatus,
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: dispatched.result.state,
  };
}

export function undoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const currentState = getSessionState(room.sessionState);
  const actingId = getRoomActingPlayerId(room.gameId, currentState);
  if (!actingId) {
    throw new Error("Cannot undo after the game has finished");
  }
  const actingPlayer = room.players.find((p) => p.id === actingId);
  if (!actingPlayer || actingPlayer.isBot) {
    throw new Error("Undo is only available during a human player's turn");
  }
  if (
    requesterId !== undefined &&
    !canViewerControlActorPure(room, requesterId, actingId)
  ) {
    throw new Error("You can only undo during your own turn");
  }

  const nextSession = undoSessionForPlayerPure(
    engine,
    room.sessionState,
    actingId
  );
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
    status: nextGameState.phase === "GAME_OVER" ? "finished" : "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function redoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const currentState = getSessionState(room.sessionState);
  const actingId = getRoomActingPlayerId(room.gameId, currentState);
  if (!actingId) {
    throw new Error("Cannot redo after the game has finished");
  }
  if (
    requesterId !== undefined &&
    !canViewerControlActorPure(room, requesterId, actingId)
  ) {
    throw new Error("You can only redo during your own turn");
  }

  const nextSession = redoSessionForPlayerPure(room.sessionState, actingId);
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
    status: nextGameState.phase === "GAME_OVER" ? "finished" : "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function finishCatanSetupWithBotsPure(
  managerState: RoomManagerState,
  roomId: string
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState || room.gameId !== "catan") {
    throw new Error("Catan setup session not active");
  }

  const stepSetupPure = (
    curSession: MatchSessionState<any, any>,
    remainingGuard: number
  ): MatchSessionState<any, any> => {
    const curState = getSessionState(curSession);
    if (remainingGuard <= 0 || !curState.phase.startsWith("SETUP_")) {
      return curSession;
    }
    const actorId = getNextActingPlayerId(curState);
    if (!actorId) return curSession;
    const action = CatanEngine.chooseBotAction(curState, actorId);
    if (!action) return curSession;
    const dispatched = dispatchSessionActionPure(
      CatanEngine,
      curSession,
      actorId,
      action
    );
    return stepSetupPure(dispatched.session, remainingGuard - 1);
  };

  const nextSession = stepSetupPure(room.sessionState, 40);
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function stepBotPure(
  managerState: RoomManagerState,
  roomId: string
): {
  state: RoomManagerState;
  actedPlayerId: string | null;
  action: any | null;
  gameState: any;
} {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const curGameState = getSessionState(room.sessionState);
  const nextActorId = getRoomActingPlayerId(room.gameId, curGameState);
  if (!nextActorId) {
    return {
      state: managerState,
      actedPlayerId: null,
      action: null,
      gameState: curGameState,
    };
  }
  const action = engine.chooseBotAction(curGameState, nextActorId);
  if (!action) {
    return {
      state: managerState,
      actedPlayerId: null,
      action: null,
      gameState: curGameState,
    };
  }
  const dispatched = dispatchActionPure(
    managerState,
    roomId,
    nextActorId,
    action
  );
  return {
    state: dispatched.state,
    actedPlayerId: nextActorId,
    action,
    gameState: dispatched.gameState,
  };
}

export function setRoomAutoStepBotsPure(
  managerState: RoomManagerState,
  roomId: string,
  enabled: boolean
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  return setRoomRecordInState(managerState, {
    ...room,
    autoStepBots: Boolean(enabled),
  });
}

// ============================================================================
// Thin Imperative Shell (Classless Closure Factory + Functional Lens Handles)
// ============================================================================

export interface PlatformRoomManager {
  readonly registry: GameRegistry;
  getStateSnapshot(): RoomManagerState;
  getRoomPlayerBounds(
    gameId: string,
    config: Record<string, unknown>
  ): { minPlayers: number; maxPlayers: number };
  canViewerControlActor(
    room: Pick<RoomInstance, "players">,
    viewerId: string | null | undefined,
    actorId: string | null
  ): boolean;
  toRoomSummary(r: RoomInstance | RoomRecord, viewerId?: string | null): RoomSummary;
  listRooms(gameFilter?: string): RoomSummary[];
  getRoom(roomId: string): RoomInstance;
  createRoom(options: CreateRoomOptions): RoomInstance;
  updateRoomSetup(
    roomId: string,
    requesterId: string,
    updates: RoomSetupUpdates
  ): RoomInstance;
  addLocalPlayer(
    roomId: string,
    requesterId: string,
    playerName: string
  ): PlayerDescriptor;
  removeLocalPlayer(
    roomId: string,
    requesterId: string,
    targetPlayerId: string
  ): RoomInstance;
  joinRoom(
    roomId: string,
    playerName: string,
    isBot?: boolean,
    preferredPlayerId?: string
  ): PlayerDescriptor;
  leaveRoom(roomId: string, playerId: string): RoomInstance | null;
  startGame(roomId: string, requesterId?: string): any;
  dispatchAction(roomId: string, playerId: string, action: any): any;
  undoAction(roomId: string, requesterId?: string | null): any;
  redoAction(roomId: string, requesterId?: string | null): any;
  finishCatanSetupWithBots(roomId: string): any;
  stepBot(roomId: string): {
    actedPlayerId: string | null;
    action: any | null;
    state: any;
  };
  setRoomAutoStepBots(roomId: string, enabled: boolean): RoomInstance;
}

export interface PlatformRoomManagerConstructor {
  new (): PlatformRoomManager;
  (): PlatformRoomManager;
}

export function createPlatformRoomManager(): PlatformRoomManager {
  let state: RoomManagerState = createInitialRoomManagerState();
  const roomLensCache = new Map<string, RoomInstance>();

  const registryLens: GameRegistry = {
    register(engine) {
      state = {
        ...state,
        registry: registerEnginePure(state.registry, engine),
      };
    },
    get(gameId) {
      return getRegisteredEnginePure(state.registry, gameId);
    },
    list() {
      return listRegisteredGamesPure(state.registry);
    },
  };

  function createSessionLens(roomId: string): MatchSession<any, any, any> {
    const readRoom = (): RoomRecord => getRoomRecordPure(state, roomId);
    const readSession = (): MatchSessionState<any, any> => {
      const s = readRoom().sessionState;
      if (!s) throw new Error("Game has not started in this room");
      return s;
    };
    const writeSession = (nextSession: MatchSessionState<any, any>): void => {
      const curRoom = readRoom();
      const curGame = getSessionState(nextSession);
      state = setRoomRecordInState(state, {
        ...curRoom,
        sessionState: nextSession,
        status:
          curGame?.phase === "GAME_OVER"
            ? "finished"
            : curRoom.status === "finished"
              ? "in_progress"
              : curRoom.status,
      });
    };

    return {
      get engine() {
        return getRegisteredEnginePure(state.registry, readRoom().gameId);
      },
      get enforceInvariants() {
        return readSession().enforceInvariants;
      },
      getState: () => getSessionState(readSession()),
      getStep: () => getSessionStep(readSession()),
      getTotalSteps: () => getSessionTotalSteps(readSession()),
      getActionLog: () => getSessionActionLog(readSession()),
      dispatch(playerId: string, action: any) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        const dispatched = dispatchSessionActionPure(
          engine,
          readSession(),
          playerId,
          action
        );
        writeSession(dispatched.session);
        return dispatched.result;
      },
      canUndo: () => getSessionStep(readSession()) > 0,
      canRedo: () =>
        getSessionStep(readSession()) < getSessionTotalSteps(readSession()),
      getUndoableStepCount(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        return getSessionUndoableStepCount(engine, readSession(), playerId);
      },
      canPlayerUndo(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        return canSessionPlayerUndo(engine, readSession(), playerId);
      },
      canPlayerRedo: (playerId: string | null) =>
        canSessionPlayerRedo(readSession(), playerId),
      undoForPlayer(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        const nextSession = undoSessionForPlayerPure(
          engine,
          readSession(),
          playerId
        );
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      redoForPlayer(playerId: string | null) {
        const nextSession = redoSessionForPlayerPure(readSession(), playerId);
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      undo() {
        const nextSession = undoSessionPure(readSession());
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      redo() {
        const nextSession = redoSessionPure(readSession());
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      jumpToStep(step: number) {
        const nextSession = jumpSessionToStepPure(readSession(), step);
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
    };
  }

  function getOrCreateRoomLens(roomId: string): RoomInstance {
    const cached = roomLensCache.get(roomId);
    if (cached) return cached;

    let lastKnownRecord: RoomRecord = getRoomRecordPure(state, roomId);
    const sessionLens = createSessionLens(roomId);

    const target = {} as RoomInstance;
    const proxy = new Proxy(target, {
      get(_t, prop: string | symbol) {
        const current = state.rooms[roomId];
        if (current) {
          lastKnownRecord = current;
        }
        const rec = current ?? lastKnownRecord;
        if (prop === "session") {
          return rec.sessionState ? sessionLens : null;
        }
        if (prop === Symbol.toStringTag) {
          return "RoomInstance";
        }
        return (rec as unknown as Record<string | symbol, unknown>)[prop];
      },
      set(_t, prop: string | symbol, value: unknown) {
        const current = state.rooms[roomId];
        if (!current || typeof prop !== "string") {
          return true;
        }
        if (prop === "session") {
          const nextSessionState =
            value && typeof (value as MatchSession<any, any, any>).getState === "function"
              ? createMatchSessionState(
                  getRegisteredEnginePure(state.registry, current.gameId),
                  (value as MatchSession<any, any, any>).getState(),
                  (value as MatchSession<any, any, any>).enforceInvariants
                )
              : null;
          const updated: RoomRecord = {
            ...current,
            sessionState: nextSessionState,
          };
          lastKnownRecord = updated;
          state = setRoomRecordInState(state, updated);
          return true;
        }
        const updated = {
          ...current,
          [prop]: value,
        } as RoomRecord;
        lastKnownRecord = updated;
        state = setRoomRecordInState(state, updated);
        return true;
      },
      ownKeys() {
        const rec = state.rooms[roomId] ?? lastKnownRecord;
        return [
          ...Object.keys(rec).filter((k) => k !== "sessionState"),
          "session",
        ];
      },
      getOwnPropertyDescriptor(_t, prop: string | symbol) {
        const rec = state.rooms[roomId] ?? lastKnownRecord;
        if (prop === "session") {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: rec.sessionState ? sessionLens : null,
          };
        }
        if (typeof prop === "string" && prop in rec && prop !== "sessionState") {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: (rec as unknown as Record<string, unknown>)[prop],
          };
        }
        return undefined;
      },
    });

    roomLensCache.set(roomId, proxy);
    return proxy;
  }

  return {
    registry: registryLens,
    getStateSnapshot: () => state,
    getRoomPlayerBounds: (gameId, config) =>
      getRoomPlayerBoundsPure(state.registry, gameId, config),
    canViewerControlActor: (room, viewerId, actorId) =>
      canViewerControlActorPure(room, viewerId, actorId),
    toRoomSummary(r, viewerId) {
      const rec = state.rooms[r.roomId];
      if (rec) {
        return toRoomSummaryPure(state.registry, rec, viewerId);
      }
      if ("sessionState" in r) {
        return toRoomSummaryPure(state.registry, r, viewerId);
      }
      const engine = getRegisteredEnginePure(state.registry, r.gameId);
      const fallbackRec: RoomRecord = {
        roomId: r.roomId,
        name: r.name,
        gameId: r.gameId,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        status: r.status,
        humanPlayers: r.humanPlayers,
        botCount: r.botCount,
        botDifficulty: r.botDifficulty,
        allBots: r.allBots,
        startingPlayerMode: r.startingPlayerMode,
        autoStepBots: r.autoStepBots,
        players: r.players,
        config: r.config,
        seed: r.seed,
        matchCounter: r.matchCounter,
        sessionState: r.session
          ? createMatchSessionState(engine, r.session.getState(), false)
          : null,
        createdAt: r.createdAt,
      };
      return toRoomSummaryPure(state.registry, fallbackRec, viewerId);
    },
    listRooms: (gameFilter) => listRoomsPure(state, gameFilter),
    getRoom(roomId) {
      getRoomRecordPure(state, roomId);
      return getOrCreateRoomLens(roomId);
    },
    createRoom(options) {
      const created = createRoomPure(state, options);
      state = created.state;
      return getOrCreateRoomLens(created.roomId);
    },
    updateRoomSetup(roomId, requesterId, updates) {
      state = updateRoomSetupPure(state, roomId, requesterId, updates);
      return getOrCreateRoomLens(roomId);
    },
    addLocalPlayer(roomId, requesterId, playerName) {
      const added = addLocalPlayerPure(state, roomId, requesterId, playerName);
      state = added.state;
      return added.player;
    },
    removeLocalPlayer(roomId, requesterId, targetPlayerId) {
      state = removeLocalPlayerPure(state, roomId, requesterId, targetPlayerId);
      return getOrCreateRoomLens(roomId);
    },
    joinRoom(roomId, playerName, isBot = false, preferredPlayerId) {
      const joined = joinRoomPure(
        state,
        roomId,
        playerName,
        isBot,
        preferredPlayerId
      );
      state = joined.state;
      return joined.player;
    },
    leaveRoom(roomId, playerId) {
      const left = leaveRoomPure(state, roomId, playerId);
      state = left.state;
      if (left.closed) {
        roomLensCache.delete(roomId);
        return null;
      }
      return getOrCreateRoomLens(roomId);
    },
    startGame(roomId, requesterId) {
      const started = startGamePure(state, roomId, requesterId);
      state = started.state;
      return started.gameState;
    },
    dispatchAction(roomId, playerId, action) {
      const dispatched = dispatchActionPure(state, roomId, playerId, action);
      state = dispatched.state;
      return dispatched.gameState;
    },
    undoAction(roomId, requesterId) {
      const undone = undoActionPure(state, roomId, requesterId);
      state = undone.state;
      return undone.gameState;
    },
    redoAction(roomId, requesterId) {
      const redone = redoActionPure(state, roomId, requesterId);
      state = redone.state;
      return redone.gameState;
    },
    finishCatanSetupWithBots(roomId) {
      const finished = finishCatanSetupWithBotsPure(state, roomId);
      state = finished.state;
      return finished.gameState;
    },
    stepBot(roomId) {
      const stepped = stepBotPure(state, roomId);
      state = stepped.state;
      return {
        actedPlayerId: stepped.actedPlayerId,
        action: stepped.action,
        state: stepped.gameState,
      };
    },
    setRoomAutoStepBots(roomId, enabled) {
      state = setRoomAutoStepBotsPure(state, roomId, enabled);
      return getOrCreateRoomLens(roomId);
    },
  };
}

export const PlatformRoomManager: PlatformRoomManagerConstructor =
  createPlatformRoomManager as unknown as PlatformRoomManagerConstructor;
