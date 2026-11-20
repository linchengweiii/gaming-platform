import type {
  BotDifficulty,
  GameRegistry,
  GameRegistryState,
  MatchSession,
  MatchSessionState,
  PlayerDescriptor,
} from "@gaming-platform/core";

export interface RoomSummary {
  roomId: string;
  name: string;
  gameId: string;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  isPrivate?: boolean;
  botCount: number;
  botDifficulty: BotDifficulty;
  allBots: boolean;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  botStepDelayMs: number;
  players: PlayerDescriptor[];
  config: Record<string, unknown>;
  canUndo: boolean;
  undoableSteps: number;
  canRedo: boolean;
  step: number;
  revision?: number;
  createdAt: number;
  offlinePlayerIds?: string[];
}

export interface RoomRecord {
  readonly roomId: string;
  readonly name: string;
  readonly gameId: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly status: "lobby" | "in_progress" | "finished";
  readonly isPrivate: boolean;
  readonly humanPlayers: readonly PlayerDescriptor[];
  readonly botCount: number;
  readonly botDifficulty: BotDifficulty;
  readonly allBots: boolean;
  readonly startingPlayerMode: string;
  readonly autoStepBots: boolean;
  readonly botStepDelayMs: number;
  readonly players: readonly PlayerDescriptor[];
  readonly config: Readonly<Record<string, unknown>>;
  readonly seed: string;
  readonly matchCounter: number;
  readonly sessionState: MatchSessionState<any, any> | null;
  readonly revision: number;
  readonly createdAt: number;
}

export interface RoomInstance {
  roomId: string;
  name: string;
  gameId: string;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  isPrivate: boolean;
  humanPlayers: PlayerDescriptor[];
  botCount: number;
  botDifficulty: BotDifficulty;
  allBots: boolean;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  botStepDelayMs: number;
  players: PlayerDescriptor[];
  config: Record<string, unknown>;
  seed: string;
  matchCounter: number;
  session: MatchSession<any, any, any> | null;
  revision: number;
  createdAt: number;
}

export interface RoomManagerState {
  readonly registry: GameRegistryState;
  readonly rooms: Readonly<Record<string, RoomRecord>>;
  readonly roomOrder: readonly string[];
  readonly roomCounter: number;
}

export interface CreateRoomOptions {
  name?: string;
  gameId?: string;
  ownerId?: string;
  hostName?: string;
  isPrivate?: boolean;
  botCount?: number;
  botDifficulty?: BotDifficulty;
  allBots?: boolean;
  startingPlayerMode?: string;
  autoStepBots?: boolean;
  botStepDelayMs?: number;
  config?: Record<string, unknown>;
  seed?: string;
  autoStart?: boolean;
}

export interface RoomSetupUpdates {
  name?: string;
  gameId?: string;
  isPrivate?: boolean;
  botCount?: number;
  playerCount?: number;
  allBots?: boolean;
  botDifficulty?: BotDifficulty;
  startingPlayerMode?: string;
  botStepDelayMs?: number;
  config?: Record<string, unknown>;
  seed?: string;
}

export interface StepBotOptions {
  readonly onlyBots?: boolean;
}

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
  listRooms(gameFilter?: string, viewerId?: string | null): RoomSummary[];
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
  closeRoom(roomId: string): boolean;
  signOutGuest(playerId: string): {
    closedRoomIds: string[];
    updatedRoomIds: string[];
  };
  renameGuest(
    playerId: string,
    newName: string
  ): {
    cleanName: string;
    updatedRoomIds: string[];
  };
  startGame(roomId: string, requesterId?: string): any;
  dispatchAction(roomId: string, playerId: string, action: any): any;
  undoAction(roomId: string, requesterId?: string | null): any;
  redoAction(roomId: string, requesterId?: string | null): any;
  finishCatanSetupWithBots(roomId: string): any;
  stepBot(
    roomId: string,
    options?: StepBotOptions
  ): {
    actedPlayerId: string | null;
    action: any | null;
    state: any;
  };
  setRoomAutoStepBots(roomId: string, enabled: boolean): RoomInstance;
  setRoomBotStepDelay(roomId: string, delayMs: number): RoomInstance;
}

export interface PlatformRoomManagerConstructor {
  new (): PlatformRoomManager;
  (): PlatformRoomManager;
}
