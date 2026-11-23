import {
  type SupportedLocale,
  detectBrowserLocale,
} from "../../i18n/index.ts";
import {
  canControlPlayerOnDevicePure,
  getRoomStatePure,
} from "../helpers/room-queries.ts";
import { createInitialAppModelPure } from "../reducers/session-init-and-signin.ts";
import type {
  AppModel,
  ClientRoom,
  GuestSession,
  MultiGamePlatformApp as MultiGamePlatformAppType,
  MultiGamePlatformAppConstructor,
  MultiGamePlatformAppOptions,
  SupportedGameId,
} from "../types.ts";
import { registerGlobalCatanMapShortcuts } from "./bind-events-catan-viewport.ts";
import { registerWindowHashChangeListener } from "./bind-events-other-games.ts";
import { attachCatanUiActions } from "./catan-ui-actions.ts";
import {
  type AppRuntimeContext,
  createAppRuntimeContext,
  loadActiveRoomIdFromStorage,
  loadBotMoveThrottleMsFromStorage,
  loadDeviceGuestsFromStorage,
  loadLastActiveGuestIdFromStorage,
  loadSavedGuestSessionFromStorage,
  loadSavedLocaleFromStorage,
  loadShowBotMovesFromStorage,
  saveDeviceGuestsToStorage,
  saveGuestSessionToStorage,
} from "./context.ts";
import { attachFullscreenActions } from "./fullscreen-actions.ts";
import { attachGuestAndLobbyActions } from "./guest-and-lobby-actions.ts";
import { attachMatchAndBotActions } from "./match-and-bot-actions.ts";
import { attachRealtimeAndHttpActions } from "./realtime-and-http.ts";
import {
  attachRenderHandlers,
  registerGlobalDropdownDismiss,
} from "./render-and-dropdowns.ts";

const PLAIN_MODEL_KEYS: readonly (keyof AppModel)[] = [
  "viewMode",
  "useServerBackend",
  "isAuthenticated",
  "currentUserId",
  "currentUserName",
  "hidePassAndPlayHand",
  "createRoomName",
  "activeRoomId",
  "buildMode",
  "selectedBoardSpot",
  "setupEdgeKind",
  "robberOrPirateMode",
  "selectedMoveFromEdgeId",
  "azulSelectedDraft",
  "sidebarSettingsExpanded",
  "autoRespondBotsToHuman",
  "botMoveThrottleMs",
];

const BOOL_MODEL_KEYS: readonly (keyof AppModel)[] = [
  "mapBuildMenuExpanded",
  "debugMode",
  "showBotMoves",
  "botFeedHistoryExpanded",
];

const CLONE_OBJECT_MODEL_KEYS: readonly (keyof AppModel)[] = [
  "catanMapViewport",
  "maritimeGive",
  "maritimeWant",
  "domesticGive",
  "domesticWant",
  "splendorDraftGems",
];

function buildMultiGamePlatformAppFacade(
  ctx: AppRuntimeContext
): MultiGamePlatformAppType {
  const facade: Record<string, unknown> = {
    get rooms() {
      return ctx.roomsFacade;
    },
    get locale() {
      return ctx.model.locale;
    },
    set locale(v: SupportedLocale) {
      ctx.setLocale(v);
    },
    get lobbyGameFilter() {
      return ctx.model.lobbyGameFilter;
    },
    set lobbyGameFilter(v: SupportedGameId) {
      ctx.model = { ...ctx.model, lobbyGameFilter: v, createRoomGameId: v };
    },
    get createRoomGameId() {
      return ctx.model.createRoomGameId;
    },
    set createRoomGameId(v: SupportedGameId) {
      ctx.model = { ...ctx.model, createRoomGameId: v, lobbyGameFilter: v };
    },
    get deviceGuests() {
      return ctx.model.deviceGuests;
    },
    set deviceGuests(v: GuestSession[]) {
      ctx.model = { ...ctx.model, deviceGuests: [...v] };
    },
    get boardFullscreen() {
      return ctx.model.boardFullscreen;
    },
    set boardFullscreen(v: boolean) {
      ctx.setBoardFullscreen(Boolean(v));
    },
    get fullscreenSidebarOpen() {
      return ctx.model.fullscreenSidebarOpen;
    },
    set fullscreenSidebarOpen(v: boolean) {
      ctx.model = {
        ...ctx.model,
        fullscreenSidebarOpen: ctx.model.boardFullscreen ? Boolean(v) : false,
      };
    },
    render: () => ctx.render(),
    setLocale: (nextLocale: SupportedLocale) => ctx.setLocale(nextLocale),
    signInAsGuest: (rawName?: string, existingGuestId?: string) =>
      ctx.signInAsGuest(rawName, existingGuestId),
    startSoloGameFromLogin: (rawName?: string) =>
      ctx.startSoloGameFromLogin(rawName),
    startOfflineLocalFromLogin: (rawName?: string) =>
      ctx.startOfflineLocalFromLogin(rawName),
    openAddGuestView: () => ctx.openAddGuestView(),
    switchActiveGuest: (guestId: string) => ctx.switchActiveGuest(guestId),
    renameCurrentGuest: (rawNewName: string) =>
      ctx.renameCurrentGuest(rawNewName),
    signOutGuest: () => ctx.signOutGuest(),
    createLocalRoom: (opts: Parameters<AppRuntimeContext["createLocalRoom"]>[0]) =>
      ctx.createLocalRoom(opts),
    getActiveRoom: () => ctx.getActiveRoom(),
    getRoomState: (room: ClientRoom) => getRoomStatePure(ctx.model, room),
    canControlPlayerOnThisDevice: (room: ClientRoom, playerId: string | null) =>
      canControlPlayerOnDevicePure(ctx.model, room, playerId),
    rebuildRoomSeats: (room: ClientRoom) => ctx.rebuildRoomSeats(room),
    addLocalFriendToRoom: (room: ClientRoom, rawName: string) =>
      ctx.addLocalFriendToRoom(room, rawName),
    removePlayerFromRoom: (room: ClientRoom, targetPlayerId: string) =>
      ctx.removePlayerFromRoom(room, targetPlayerId),
    createAndOpenRoom: () => ctx.createAndOpenRoom(),
    enterOrJoinRoom: (roomId: string) => ctx.enterOrJoinRoom(roomId),
    leaveActiveRoom: () => ctx.leaveActiveRoom(),
    startRoomMatch: (roomId: string) => ctx.startRoomMatch(roomId),
    startInteractiveTutorial: (gameId: SupportedGameId) =>
      ctx.startInteractiveTutorial(gameId),
    dispatchUiAction: (playerId: string, action: any) =>
      ctx.dispatchUiAction(playerId, action),
    dispatch: (playerId: string, action: any) => ctx.dispatch(playerId, action),
    stepOneBotMove: (onlyBots?: boolean) => ctx.stepOneBotMove(onlyBots),
    finishSetupWithBots: () => ctx.finishSetupWithBots(),
    undoMatch: () => ctx.undoMatch(),
    stopAutoPlay: () => ctx.stopAutoPlay(),
    toggleShowBotMoves: () => ctx.toggleShowBotMoves(),
    toggleBotFeedHistory: () => ctx.toggleBotFeedHistory(),
    setBotMoveThrottleMs: (delayMs: number) => ctx.setBotMoveThrottleMs(delayMs),
    cycleBotMoveThrottle: () => ctx.cycleBotMoveThrottle(),
    toggleBoardFullscreen: () => ctx.toggleBoardFullscreen(),
    setBoardFullscreen: (enabled: boolean) => ctx.setBoardFullscreen(enabled),
    toggleFullscreenSidebar: () => ctx.toggleFullscreenSidebar(),
    switchTradeMode: (
      nextMode: "maritime_trade" | "domestic_trade" | null
    ) => ctx.switchTradeMode(nextMode),
    setSharedTradeWant: (
      resource: Parameters<AppRuntimeContext["setSharedTradeWant"]>[0],
      amount: number
    ) => ctx.setSharedTradeWant(resource, amount),
  };

  const defineModelProps = (
    keys: readonly (keyof AppModel)[],
    transform?: (v: any) => unknown
  ): void => {
    const descriptors: PropertyDescriptorMap = {};
    for (const key of keys) {
      descriptors[key] = {
        enumerable: true,
        configurable: true,
        get: () => ctx.model[key],
        set: (v: unknown) => {
          ctx.model = { ...ctx.model, [key]: transform ? transform(v) : v };
        },
      };
    }
    Object.defineProperties(facade, descriptors);
  };

  defineModelProps(PLAIN_MODEL_KEYS);
  defineModelProps(BOOL_MODEL_KEYS, (v) => Boolean(v));
  defineModelProps(CLONE_OBJECT_MODEL_KEYS, (v) => ({ ...v }));

  return facade as unknown as MultiGamePlatformAppType;
}

export function createMultiGamePlatformApp(
  root: HTMLElement,
  options?: MultiGamePlatformAppOptions
): MultiGamePlatformAppType {
  const isStaticHost =
    Boolean(options?.staticHostOnly) ||
    (typeof document !== "undefined" &&
      Boolean(document.documentElement?.hasAttribute("data-static-only"))) ||
    (typeof window !== "undefined" &&
      Boolean(window.location?.hostname?.endsWith(".github.io")));
  const isBrowserHttp =
    !options?.forceLocalMode &&
    typeof window !== "undefined" &&
    typeof fetch === "function" &&
    Boolean(window.location?.protocol?.startsWith("http"));

  const savedGuest = loadSavedGuestSessionFromStorage();
  const browserLocale =
    typeof navigator !== "undefined"
      ? detectBrowserLocale(navigator.languages, navigator.language)
      : null;
  const initialModel = createInitialAppModelPure(options, {
    isStaticHost,
    isBrowserHttp,
    randomGuestSuffix: 100 + Math.floor(Math.random() * 900),
    deviceGuests: loadDeviceGuestsFromStorage(),
    savedGuest,
    lastActiveGuestId: loadLastActiveGuestIdFromStorage(),
    nowMs: Date.now(),
    locationSearch:
      typeof window !== "undefined" ? window.location?.search ?? "" : "",
    locationHash:
      typeof window !== "undefined" ? window.location?.hash ?? "" : "",
    savedShowBotMoves: loadShowBotMovesFromStorage(),
    savedBotMoveThrottleMs: loadBotMoveThrottleMsFromStorage(),
    savedLocale: loadSavedLocaleFromStorage(),
    browserLocale,
  });

  if (initialModel.isAuthenticated) {
    saveDeviceGuestsToStorage(initialModel.deviceGuests);
    if (!savedGuest && initialModel.currentUserId) {
      saveGuestSessionToStorage({
        id: initialModel.currentUserId,
        name: initialModel.currentUserName,
        mode: "guest",
      });
    }
  }

  const storedActiveRoomId = loadActiveRoomIdFromStorage();
  const isInitialReloadRoomRestore = Boolean(
    savedGuest &&
      storedActiveRoomId &&
      initialModel.pendingInviteRoomId &&
      storedActiveRoomId === initialModel.pendingInviteRoomId
  );

  const initialPendingRestoreRoomId = initialModel.isAuthenticated
    ? initialModel.pendingInviteRoomId ?? storedActiveRoomId
    : null;

  const ctx = createAppRuntimeContext(
    root,
    initialModel,
    initialPendingRestoreRoomId,
    isInitialReloadRoomRestore
  );

  attachRealtimeAndHttpActions(ctx);
  attachGuestAndLobbyActions(ctx);
  attachMatchAndBotActions(ctx);
  attachCatanUiActions(ctx);
  const fullscreenController = attachFullscreenActions(ctx);
  attachRenderHandlers(ctx);

  registerGlobalDropdownDismiss(root);
  registerGlobalCatanMapShortcuts(ctx);
  fullscreenController.registerGlobalListeners();
  ctx.render();
  registerWindowHashChangeListener(ctx);

  if (ctx.model.useServerBackend && ctx.model.isAuthenticated) {
    void ctx.fetchLobbyRooms();
  } else if (ctx.model.isAuthenticated && ctx.model.pendingInviteRoomId) {
    const inviteId = ctx.model.pendingInviteRoomId;
    ctx.model = { ...ctx.model, pendingInviteRoomId: null };
    ctx.enterOrJoinRoom(inviteId);
  }

  return buildMultiGamePlatformAppFacade(ctx);
}

export const MultiGamePlatformApp: MultiGamePlatformAppConstructor =
  createMultiGamePlatformApp as unknown as MultiGamePlatformAppConstructor;
