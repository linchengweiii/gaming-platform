import type {
  BotDifficulty,
  MatchSession,
  PlayerDescriptor,
} from "@gaming-platform/core";
import type {
  CommodityMap,
  ResourceMap,
  ResourceType,
  ScenarioId,
} from "@gaming-platform/catan";
import type { GemColor } from "@gaming-platform/splendor";
import type { AzulDraftSource, AzulTileColor } from "@gaming-platform/azul";
import type { CatanMapViewport } from "../catan-graphics/viewport.ts";

export type SupportedGameId = "catan" | "splendor" | "azul" | "seven_wonders";
export type AppViewMode = "login" | "lobby" | "room_setup" | "in_game";

export interface MultiGamePlatformAppOptions {
  startAtLogin?: boolean;
  forceLocalMode?: boolean;
  staticHostOnly?: boolean;
  debugMode?: boolean;
}

export interface GuestSession {
  readonly id: string;
  readonly name: string;
  readonly mode: "guest";
  readonly token?: string;
}

export type BuildMode =
  | null
  | "road"
  | "ship"
  | "settlement"
  | "city"
  | "wall"
  | "move_ship"
  | "knight"
  | "promote_knight"
  | "activate_knight"
  | "move_knight"
  | "chase_robber"
  | "city_upgrades"
  | "progress_card"
  | "maritime_trade"
  | "domestic_trade"
  | "year_of_plenty"
  | "monopoly";

export interface BoardSpotSelection {
  readonly kind: "edge" | "vertex" | "hex";
  readonly id: string;
}

export interface ClientRoomConfig {
  scenarioId: ScenarioId;
  enable56PlayerExtension?: boolean;
  enableHarbormaster: boolean;
  enableCityWalls: boolean;
  enableFriendlyRobber: boolean;
  enableCitiesAndKnights: boolean;
  wonderSideMode?: "random" | "day" | "night";
}

export interface ClientRoom {
  roomId: string;
  name: string;
  gameId: SupportedGameId;
  isOfflineLocal: boolean;
  isPrivate: boolean;
  ownerId: string;
  ownerName: string;
  status: "lobby" | "in_progress" | "finished";
  humanPlayers: PlayerDescriptor[];
  botCount: number;
  allBots: boolean;
  botDifficulty: BotDifficulty;
  startingPlayerMode: string; // "random" | "first" | playerId
  autoStepBots: boolean;
  players: PlayerDescriptor[];
  config: ClientRoomConfig;
  seed: string;
  matchCounter: number;
  session: MatchSession<any, any, any> | null;
  remoteState: any | null;
  remoteActingPlayerId: string | null;
  canUndo: boolean;
  undoableSteps: number;
  canRedo: boolean;
  step: number;
  revision?: number;
  offlinePlayerIds?: string[];
}

export interface CreateLocalRoomOptions {
  readonly name?: string;
  readonly customRoomId?: string;
  readonly gameId: SupportedGameId;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isOfflineLocal?: boolean;
  readonly isPrivate?: boolean;
  readonly botCount?: number;
  readonly allBots?: boolean;
  readonly botDifficulty?: BotDifficulty;
  readonly startingPlayerMode?: string;
  readonly scenarioId?: ScenarioId;
  readonly enable56PlayerExtension?: boolean;
  readonly enableHarbormaster?: boolean;
  readonly enableCityWalls?: boolean;
  readonly enableFriendlyRobber?: boolean;
  readonly enableCitiesAndKnights?: boolean;
  readonly wonderSideMode?: "random" | "day" | "night";
  readonly customSeed?: string;
  readonly autoStart?: boolean;
}

export interface AppModel {
  readonly viewMode: AppViewMode;
  readonly lobbyGameFilter: SupportedGameId;
  readonly lobbyHeroEnteredOnce: boolean;
  readonly loginHeroEnteredOnce: boolean;
  readonly useServerBackend: boolean;
  readonly staticHostOnly: boolean;
  readonly serverReachable: boolean;
  readonly hasEverReachedServer: boolean;
  readonly inspectingSetupDuringMatch: boolean;
  readonly isAuthenticated: boolean;
  readonly addingAdditionalGuest: boolean;
  readonly returnViewAfterAddGuest: AppViewMode;
  readonly loginDraftName: string;
  readonly loginErrorMsg: string;
  readonly currentUserId: string;
  readonly currentUserName: string;
  readonly editingGuestName: boolean;
  readonly guestRenameDraft: string;
  readonly deviceGuests: GuestSession[];
  readonly localFriendDraftName: string;
  readonly hidePassAndPlayHand: boolean;
  readonly createRoomName: string;
  readonly createRoomGameId: SupportedGameId;
  readonly createRoomMode: "online" | "offline";
  readonly pendingInviteRoomId: string | null;
  readonly copiedRoomLinkId: string | null;
  readonly rooms: Readonly<Record<string, ClientRoom>>;
  readonly roomOrder: readonly string[];
  readonly nextRoomNum: number;
  readonly activeRoomId: string;
  readonly buildMode: BuildMode;
  readonly selectedBoardSpot: BoardSpotSelection | null;
  readonly catanMapViewport: CatanMapViewport;
  readonly setupEdgeKind: "road" | "ship";
  readonly robberOrPirateMode: "robber" | "pirate";
  readonly selectedMoveFromEdgeId: string | null;
  readonly selectedMoveKnightFromVertexId: string | null;
  readonly selectedChaseKnightVertexId: string | null;
  readonly discardSelection: ResourceMap;
  readonly discardCommodities: CommodityMap;
  readonly tradeGiveRes: ResourceType;
  readonly tradeReceiveRes: ResourceType;
  readonly maritimeGive: ResourceMap;
  readonly maritimeWant: ResourceMap;
  readonly maritimeCommGive: CommodityMap;
  readonly maritimeCommWant: CommodityMap;
  readonly domesticGive: ResourceMap;
  readonly domesticWant: ResourceMap;
  readonly domesticCommGive: CommodityMap;
  readonly domesticCommWant: CommodityMap;
  readonly domesticTargetPlayerId: string;
  readonly selectedMetropolisVertexId: string | null;
  readonly selectedProgressCardId: string | null;
  readonly alchemistDie1: number;
  readonly alchemistDie2: number;
  readonly inventorHex1: string | null;
  readonly smithVertex1: string | null;
  readonly deserterTargetPlayerId: string | null;
  readonly yopRes1: ResourceType;
  readonly yopRes2: ResourceType;
  readonly monoRes: ResourceType;
  readonly splendorDraftGems: Partial<Record<GemColor, number>>;
  readonly azulSelectedDraft: {
    readonly source: AzulDraftSource;
    readonly color: AzulTileColor;
  } | null;
  readonly azulInspectedPlayerId: string | null;
  readonly sevenWondersSelectedCardId: string | null;
  readonly sevenWondersInspectedPlayerId: string | null;
  readonly activeTutorial: {
    readonly roomId: string;
    readonly gameId: SupportedGameId;
    readonly stepIndex: number;
    readonly maxAutoStepIndex: number;
  } | null;
  readonly guideModalGameId: SupportedGameId | null;
  readonly sidebarSettingsExpanded: boolean;
  readonly mapBuildMenuExpanded: boolean;
  readonly debugMode: boolean;
  readonly autoPlayBots: boolean;
  readonly autoRespondBotsToHuman: boolean;
  readonly autoPlaySpeedMs: number;
}

export interface DropdownOption {
  value: string;
  label: string;
  meta?: string;
}

export interface DropdownSpec {
  id: string;
  value: string;
  options: DropdownOption[];
  disabled?: boolean;
  size?: "md" | "sm";
  inline?: boolean;
  align?: "start" | "end";
  direction?: "down" | "up";
  title?: string;
}

export interface RoomsMapView {
  readonly size: number;
  get(roomId: string): ClientRoom | undefined;
  has(roomId: string): boolean;
  set(roomId: string, room: ClientRoom): RoomsMapView;
  delete(roomId: string): boolean;
  keys(): IterableIterator<string>;
  values(): IterableIterator<ClientRoom>;
  entries(): IterableIterator<[string, ClientRoom]>;
  forEach(cb: (room: ClientRoom, roomId: string) => void): void;
  [Symbol.iterator](): IterableIterator<[string, ClientRoom]>;
}

export interface MultiGamePlatformApp {
  readonly root: HTMLElement;
  viewMode: AppViewMode;
  lobbyGameFilter: SupportedGameId;
  lobbyHeroEnteredOnce: boolean;
  loginHeroEnteredOnce: boolean;
  useServerBackend: boolean;
  staticHostOnly: boolean;
  serverReachable: boolean;
  isAuthenticated: boolean;
  addingAdditionalGuest: boolean;
  returnViewAfterAddGuest: AppViewMode;
  loginDraftName: string;
  loginErrorMsg: string;
  currentUserId: string;
  currentUserName: string;
  deviceGuests: GuestSession[];
  localFriendDraftName: string;
  hidePassAndPlayHand: boolean;
  createRoomName: string;
  createRoomGameId: SupportedGameId;
  createRoomMode: "online" | "offline";
  readonly rooms: RoomsMapView;
  nextRoomNum: number;
  activeRoomId: string;
  buildMode: BuildMode;
  selectedBoardSpot: BoardSpotSelection | null;
  catanMapViewport: CatanMapViewport;
  setupEdgeKind: "road" | "ship";
  robberOrPirateMode: "robber" | "pirate";
  selectedMoveFromEdgeId: string | null;
  discardSelection: ResourceMap;
  tradeGiveRes: ResourceType;
  tradeReceiveRes: ResourceType;
  maritimeGive: ResourceMap;
  maritimeWant: ResourceMap;
  domesticGive: ResourceMap;
  domesticWant: ResourceMap;
  domesticTargetPlayerId: string;
  yopRes1: ResourceType;
  yopRes2: ResourceType;
  monoRes: ResourceType;
  splendorDraftGems: Partial<Record<GemColor, number>>;
  azulSelectedDraft: {
    source: AzulDraftSource;
    color: AzulTileColor;
  } | null;
  autoPlayBots: boolean;
  sidebarSettingsExpanded: boolean;
  mapBuildMenuExpanded: boolean;
  debugMode: boolean;
  autoRespondBotsToHuman: boolean;
  autoPlaySpeedMs: number;
  render(): void;
  signInAsGuest(rawName?: string, existingGuestId?: string): boolean;
  startSoloGameFromLogin(rawName?: string): boolean;
  startOfflineLocalFromLogin(rawName?: string): boolean;
  openAddGuestView(): void;
  switchActiveGuest(guestId: string): void;
  renameCurrentGuest(rawNewName: string): boolean;
  signOutGuest(): void;
  removeDeviceGuest(guestId: string): void;
  getRoomBounds(room: {
    gameId: SupportedGameId;
    config: { scenarioId: ScenarioId };
  }): { minPlayers: number; maxPlayers: number };
  createLocalRoom(opts: CreateLocalRoomOptions): ClientRoom;
  getActiveRoom(): ClientRoom;
  getRoomState(room: ClientRoom): any | null;
  canControlPlayerOnThisDevice(
    room: ClientRoom,
    playerId: string | null
  ): boolean;
  rebuildRoomSeats(room: ClientRoom): void;
  addLocalFriendToRoom(room: ClientRoom, rawName: string): void;
  removePlayerFromRoom(room: ClientRoom, targetPlayerId: string): void;
  createAndOpenRoom(): void;
  enterOrJoinRoom(roomId: string): void;
  leaveActiveRoom(): void;
  startRoomMatch(roomId: string): void;
  startInteractiveTutorial(gameId: SupportedGameId): ClientRoom;
  resetSubModes(): void;
  dispatchUiAction(playerId: string, action: any): void;
  dispatch(playerId: string, action: any): void;
  stepOneBotMove(onlyBots?: boolean): boolean;
  finishSetupWithBots(): void;
  undoMatch(): void;
  redoMatch(): void;
  toggleAutoRespondBots(): void;
  toggleAutoPlay(): void;
  stopAutoPlay(): void;
  switchTradeMode(nextMode: "maritime_trade" | "domestic_trade" | null): void;
  setSharedTradeWant(resource: ResourceType, amount: number): void;
}

export interface MultiGamePlatformAppConstructor {
  new (
    root: HTMLElement,
    options?: MultiGamePlatformAppOptions
  ): MultiGamePlatformApp;
  (
    root: HTMLElement,
    options?: MultiGamePlatformAppOptions
  ): MultiGamePlatformApp;
}
