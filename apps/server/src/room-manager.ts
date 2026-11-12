import {
  type BotDifficulty,
  GameRegistry,
  MatchSession,
  type PlayerDescriptor,
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
  canRedo: boolean;
  step: number;
  createdAt: number;
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

export function getRoomActingPlayerId(
  gameId: string,
  state: any
): string | null {
  if (!state) return null;
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
  return getNextActingPlayerId(state);
}

export class PlatformRoomManager {
  public readonly registry: GameRegistry;
  private rooms = new Map<string, RoomInstance>();
  private roomCounter = 1;

  constructor() {
    this.registry = new GameRegistry();
    this.registry.register(CatanEngine);
    this.registry.register(SplendorEngine);
    this.registry.register(AzulEngine);
  }

  public getRoomPlayerBounds(
    gameId: string,
    config: Record<string, unknown>
  ): { minPlayers: number; maxPlayers: number } {
    if (gameId === "catan") {
      const scId = (config.scenarioId as ScenarioId) ?? "standard";
      const sc = SCENARIO_CATALOG[scId] ?? SCENARIO_CATALOG.standard;
      return {
        minPlayers: sc.minPlayers,
        maxPlayers: sc.maxPlayers,
      };
    }
    const engine = this.registry.get(gameId);
    return {
      minPlayers: engine.metadata.minPlayers,
      maxPlayers: engine.metadata.maxPlayers,
    };
  }

  public toRoomSummary(r: RoomInstance): RoomSummary {
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
      players: r.players,
      config: r.config,
      canUndo: r.session?.canUndo() ?? false,
      canRedo: r.session?.canRedo() ?? false,
      step: r.session?.getStep() ?? 0,
      createdAt: r.createdAt,
    };
  }

  public listRooms(gameFilter?: string): RoomSummary[] {
    return Array.from(this.rooms.values())
      .filter(
        (r) => !gameFilter || gameFilter === "all" || r.gameId === gameFilter
      )
      .map((r) => this.toRoomSummary(r));
  }

  public getRoom(roomId: string): RoomInstance {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room "${roomId}" not found`);
    }
    return room;
  }

  private rebuildRoomPlayers(room: RoomInstance): void {
    const bounds = this.getRoomPlayerBounds(room.gameId, room.config);
    const nextPlayers: PlayerDescriptor[] = [];

    if (room.allBots) {
      room.botCount = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, room.botCount || 4)
      );
      for (let i = 0; i < room.botCount; i++) {
        nextPlayers.push({
          id: `p${i + 1}`,
          name: `Bot ${i + 1}`,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        });
      }
    } else {
      room.humanPlayers = room.humanPlayers.slice(0, bounds.maxPlayers);
      const maxBots = Math.max(0, bounds.maxPlayers - room.humanPlayers.length);
      room.botCount = Math.max(0, Math.min(maxBots, room.botCount));

      for (const hp of room.humanPlayers) {
        const idx = nextPlayers.length;
        nextPlayers.push({
          ...hp,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: false,
        });
      }

      for (let b = 0; b < room.botCount; b++) {
        const idx = nextPlayers.length;
        const defaultId = `p${idx + 1}`;
        const finalId = nextPlayers.some((p) => p.id === defaultId)
          ? `bot-${b + 1}`
          : defaultId;
        nextPlayers.push({
          id: finalId,
          name: `Bot ${b + 1}`,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        });
      }
    }

    room.players = nextPlayers;
    if (
      room.startingPlayerMode !== "random" &&
      room.startingPlayerMode !== "first" &&
      !room.players.some((p) => p.id === room.startingPlayerMode)
    ) {
      room.startingPlayerMode = "random";
    }
  }

  public createRoom(options: {
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
  }): RoomInstance {
    const roomId = `room-${this.roomCounter++}`;
    const gameId = options.gameId ?? "catan";
    const engine = this.registry.get(gameId);

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

    const room: RoomInstance = {
      roomId,
      name:
        options.name ||
        `${engine.metadata.name} Table #${this.roomCounter - 1}`,
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
      seed: options.seed ?? `${roomId}-${Date.now()}`,
      matchCounter: 0,
      session: null,
      createdAt: Date.now(),
    };

    this.rebuildRoomPlayers(room);
    this.rooms.set(roomId, room);

    if (options.autoStart === true) {
      this.startGame(roomId, ownerId);
    }

    return room;
  }

  /**
   * Updates the room setup (gameId, botCount, startingPlayerMode, scenario, rules).
   * Enforces:
   * 1. Room must be in "lobby" (not started yet) OR "finished" status (while "in_progress", setup is strictly read-only).
   * 2. Only the room owner (`room.ownerId === requesterId`) is allowed to modify game setup.
   */
  public updateRoomSetup(
    roomId: string,
    requesterId: string,
    updates: {
      name?: string;
      gameId?: string;
      botCount?: number;
      playerCount?: number; // Backwards-compatible alias computing botCount = playerCount - humans
      allBots?: boolean;
      botDifficulty?: BotDifficulty;
      startingPlayerMode?: string;
      config?: Record<string, unknown>;
      seed?: string;
    }
  ): RoomInstance {
    const room = this.getRoom(roomId);
    if (room.status === "in_progress") {
      throw new Error("Game setup is read-only while the game is in progress");
    }
    if (room.ownerId !== requesterId) {
      throw new Error("Only the room owner can change the game setup");
    }

    if (updates.name !== undefined && updates.name.trim()) {
      room.name = updates.name.trim();
    }
    if (updates.gameId && updates.gameId !== room.gameId) {
      this.registry.get(updates.gameId);
      room.gameId = updates.gameId;
    }
    if (updates.config) {
      room.config = { ...room.config, ...updates.config };
    }
    if (updates.botDifficulty) {
      room.botDifficulty = updates.botDifficulty;
      room.config = { ...room.config, botDifficulty: updates.botDifficulty };
    }
    if (updates.startingPlayerMode !== undefined) {
      room.startingPlayerMode = updates.startingPlayerMode;
    }
    if (updates.seed) {
      room.seed = updates.seed;
    }
    if (updates.allBots !== undefined) {
      room.allBots = updates.allBots;
      if (!room.allBots && room.humanPlayers.length === 0 && room.ownerId) {
        room.humanPlayers.push({
          id: room.ownerId,
          name: room.ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        });
      }
    }

    const bounds = this.getRoomPlayerBounds(room.gameId, room.config);

    if (updates.botCount !== undefined) {
      room.botCount = updates.botCount;
    } else if (updates.playerCount !== undefined) {
      const clampedTarget = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, updates.playerCount)
      );
      room.botCount = room.allBots
        ? clampedTarget
        : Math.max(0, clampedTarget - room.humanPlayers.length);
    } else if (
      room.gameId === "catan" &&
      room.config.scenarioId === "big_island_5_6" &&
      room.humanPlayers.length + room.botCount < 5
    ) {
      room.botCount = Math.max(room.botCount, 5 - room.humanPlayers.length);
    }

    this.rebuildRoomPlayers(room);
    return room;
  }

  /**
   * Adds a local human friend sharing the host's computer (`controllerId: room.ownerId`).
   */
  public addLocalPlayer(
    roomId: string,
    requesterId: string,
    playerName: string
  ): PlayerDescriptor {
    const room = this.getRoom(roomId);
    if (room.status === "in_progress") {
      throw new Error("Cannot add players while the game is in progress");
    }
    if (room.ownerId !== requesterId) {
      throw new Error("Only the room owner can add local players");
    }
    const bounds = this.getRoomPlayerBounds(room.gameId, room.config);
    if (room.humanPlayers.length >= bounds.maxPlayers) {
      throw new Error(`Room is full (max ${bounds.maxPlayers} players)`);
    }
    const cleanName = playerName.trim();
    if (!cleanName) {
      throw new Error("Enter a player name");
    }
    const localId = `local-${room.humanPlayers.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const descriptor: PlayerDescriptor = {
      id: localId,
      name: cleanName.slice(0, 28),
      color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
      isBot: false,
      controllerId: room.ownerId,
    };
    room.allBots = false;
    room.humanPlayers.push(descriptor);
    this.rebuildRoomPlayers(room);
    return room.players.find((p) => p.id === localId) ?? descriptor;
  }

  /**
   * Removes a local friend seat (or non-owner guest seat) before a match starts.
   */
  public removeLocalPlayer(
    roomId: string,
    requesterId: string,
    targetPlayerId: string
  ): RoomInstance {
    const room = this.getRoom(roomId);
    if (room.status === "in_progress") {
      throw new Error("Cannot remove players while the game is in progress");
    }
    if (room.ownerId !== requesterId) {
      throw new Error("Only the room owner can remove seats");
    }
    if (targetPlayerId === room.ownerId) {
      throw new Error("The host seat cannot be removed");
    }
    room.humanPlayers = room.humanPlayers.filter(
      (p) => p.id !== targetPlayerId
    );
    this.rebuildRoomPlayers(room);
    return room;
  }

  /**
   * Allows another guest (or reconnecting player) to enter an existing room opened by its host.
   * Human guests are added alongside the host's configured bots (`totalPlayers = humans + botCount`),
   * clamping `botCount` only if needed to fit within `maxPlayers` so bots never block a guest from joining.
   */
  public joinRoom(
    roomId: string,
    playerName: string,
    isBot = false,
    preferredPlayerId?: string
  ): PlayerDescriptor {
    const room = this.getRoom(roomId);
    const bounds = this.getRoomPlayerBounds(room.gameId, room.config);
    const cleanName = playerName.trim() || "Guest";

    // Reconnect check if already seated in room
    if (preferredPlayerId) {
      const existingHuman = room.humanPlayers.find(
        (p) => p.id === preferredPlayerId
      );
      if (existingHuman) {
        if (room.status !== "in_progress" && cleanName) {
          existingHuman.name = cleanName;
          if (room.ownerId === preferredPlayerId) {
            room.ownerName = cleanName;
          }
          this.rebuildRoomPlayers(room);
        }
        return (
          room.players.find((p) => p.id === preferredPlayerId) ?? existingHuman
        );
      }
      const existingAny = room.players.find((p) => p.id === preferredPlayerId);
      if (existingAny) return existingAny;
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
      room.botCount += 1;
      this.rebuildRoomPlayers(room);
      return room.players[room.players.length - 1]!;
    }

    if (room.humanPlayers.length >= bounds.maxPlayers) {
      throw new Error(`Room is full (max ${bounds.maxPlayers} human players)`);
    }

    const assignedId =
      preferredPlayerId ||
      `guest-${room.humanPlayers.length + 1}-${Date.now() % 10000}`;

    const humanDescriptor: PlayerDescriptor = {
      id: assignedId,
      name: cleanName,
      color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
      isBot: false,
    };
    room.humanPlayers.push(humanDescriptor);
    this.rebuildRoomPlayers(room);

    return (
      room.players.find((p) => p.id === assignedId) ?? humanDescriptor
    );
  }

  /**
   * Removes a leaving guest (and any local friends controlled by them).
   * If no human players remain in the room, closes/deletes the room (`null`)
   * instead of leaving an unclaimed hostless room behind.
   */
  public leaveRoom(roomId: string, playerId: string): RoomInstance | null {
    const room = this.getRoom(roomId);
    if (room.status === "in_progress") {
      return room;
    }
    const beforeLen = room.humanPlayers.length;
    room.humanPlayers = room.humanPlayers.filter(
      (p) => p.id !== playerId && p.controllerId !== playerId
    );
    if (room.humanPlayers.length !== beforeLen) {
      if (room.humanPlayers.length === 0 && !room.allBots) {
        this.rooms.delete(roomId);
        return null;
      }
      if (room.ownerId === playerId && room.humanPlayers.length > 0) {
        room.ownerId = room.humanPlayers[0]!.id;
        room.ownerName = room.humanPlayers[0]!.name;
      }
      this.rebuildRoomPlayers(room);
    }
    return room;
  }

  public startGame(roomId: string, requesterId?: string): any {
    const room = this.getRoom(roomId);
    if (requesterId && room.ownerId && requesterId !== room.ownerId) {
      throw new Error("Only the room owner can start the game");
    }

    this.rebuildRoomPlayers(room);
    const bounds = this.getRoomPlayerBounds(room.gameId, room.config);
    if (room.players.length < bounds.minPlayers) {
      throw new Error(
        `Need at least ${bounds.minPlayers} players to start (currently ${room.players.length}). Add bots or wait for another guest to join.`
      );
    }

    const engine = this.registry.get(room.gameId);
    let startingPlayerIndex: number | undefined;
    let randomizeStartingPlayer = false;

    if (room.startingPlayerMode === "first") {
      startingPlayerIndex = 0;
    } else if (room.startingPlayerMode === "random") {
      randomizeStartingPlayer = true;
    } else {
      const foundIdx = room.players.findIndex(
        (p) => p.id === room.startingPlayerMode
      );
      if (foundIdx >= 0) {
        startingPlayerIndex = foundIdx;
      } else {
        randomizeStartingPlayer = true;
      }
    }

    const matchSeed =
      room.matchCounter === 0
        ? room.seed
        : `${room.seed}-g${room.matchCounter}`;
    room.matchCounter += 1;

    const initialState = engine.initGame(
      room.players,
      {
        ...room.config,
        startingPlayerIndex,
        randomizeStartingPlayer,
      },
      matchSeed
    );
    room.session = new MatchSession(engine, initialState, true);
    room.status = "in_progress";
    return room.session.getState();
  }

  public dispatchAction(roomId: string, playerId: string, action: any): any {
    const room = this.getRoom(roomId);
    if (!room.session) {
      throw new Error("Game has not started in this room");
    }
    const result = room.session.dispatch(playerId, action);
    if (result.state.phase === "GAME_OVER") {
      room.status = "finished";
    }
    return result.state;
  }

  public undoAction(roomId: string): any {
    const room = this.getRoom(roomId);
    if (!room.session) {
      throw new Error("Game has not started in this room");
    }
    const state = room.session.undo();
    room.status = state.phase === "GAME_OVER" ? "finished" : "in_progress";
    return state;
  }

  public redoAction(roomId: string): any {
    const room = this.getRoom(roomId);
    if (!room.session) {
      throw new Error("Game has not started in this room");
    }
    const state = room.session.redo();
    room.status = state.phase === "GAME_OVER" ? "finished" : "in_progress";
    return state;
  }

  public finishCatanSetupWithBots(roomId: string): any {
    const room = this.getRoom(roomId);
    if (!room.session || room.gameId !== "catan") {
      throw new Error("Catan setup session not active");
    }
    let guard = 0;
    while (
      room.session.getState().phase.startsWith("SETUP_") &&
      guard < 40
    ) {
      const state = room.session.getState();
      const actorId = getNextActingPlayerId(state);
      if (!actorId) break;
      const action = CatanEngine.chooseBotAction(state, actorId);
      if (!action) break;
      room.session.dispatch(actorId, action);
      guard++;
    }
    return room.session.getState();
  }

  public stepBot(roomId: string): {
    actedPlayerId: string | null;
    action: any | null;
    state: any;
  } {
    const room = this.getRoom(roomId);
    if (!room.session) {
      throw new Error("Game has not started in this room");
    }
    const engine = this.registry.get(room.gameId);
    const state = room.session.getState();
    const nextActorId = getRoomActingPlayerId(room.gameId, state);
    if (!nextActorId) {
      return { actedPlayerId: null, action: null, state };
    }
    const action = engine.chooseBotAction(state, nextActorId);
    if (!action) {
      return { actedPlayerId: null, action: null, state };
    }
    const nextState = this.dispatchAction(roomId, nextActorId, action);
    return { actedPlayerId: nextActorId, action, state: nextState };
  }
}
