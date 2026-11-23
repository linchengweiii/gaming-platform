import type { SupportedLocale } from "../../i18n/index.ts";
import {
  canControlPlayerOnDevicePure,
  getRoomBoundsPure,
  getRoomStatePure,
} from "../helpers/room-queries.ts";
import type {
  AppModel,
  ClientRoom,
  GuestSession,
  MultiGamePlatformApp,
  SupportedGameId,
} from "../types.ts";
import type { AppRuntimeContext } from "./context.ts";

const PLAIN_MODEL_KEYS: readonly (keyof AppModel)[] = [
  "viewMode",
  "lobbyHeroEnteredOnce",
  "loginHeroEnteredOnce",
  "useServerBackend",
  "staticHostOnly",
  "serverReachable",
  "isAuthenticated",
  "addingAdditionalGuest",
  "returnViewAfterAddGuest",
  "loginDraftName",
  "loginErrorMsg",
  "currentUserId",
  "currentUserName",
  "localFriendDraftName",
  "hidePassAndPlayHand",
  "createRoomName",
  "createRoomMode",
  "nextRoomNum",
  "activeRoomId",
  "buildMode",
  "selectedBoardSpot",
  "setupEdgeKind",
  "robberOrPirateMode",
  "selectedMoveFromEdgeId",
  "tradeGiveRes",
  "tradeReceiveRes",
  "domesticTargetPlayerId",
  "yopRes1",
  "yopRes2",
  "monoRes",
  "azulSelectedDraft",
  "autoPlayBots",
  "sidebarSettingsExpanded",
  "autoRespondBotsToHuman",
  "autoPlaySpeedMs",
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
  "discardSelection",
  "maritimeGive",
  "maritimeWant",
  "domesticGive",
  "domesticWant",
  "splendorDraftGems",
];

export function buildMultiGamePlatformAppFacade(
  ctx: AppRuntimeContext
): MultiGamePlatformApp {
  const facade: Record<string, unknown> = {
    get root() {
      return ctx.root;
    },
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
    removeDeviceGuest: (guestId: string) => ctx.removeDeviceGuest(guestId),
    getRoomBounds: getRoomBoundsPure,
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
    resetSubModes: () => ctx.resetSubModes(),
    dispatchUiAction: (playerId: string, action: any) =>
      ctx.dispatchUiAction(playerId, action),
    dispatch: (playerId: string, action: any) => ctx.dispatch(playerId, action),
    stepOneBotMove: (onlyBots?: boolean) => ctx.stepOneBotMove(onlyBots),
    finishSetupWithBots: () => ctx.finishSetupWithBots(),
    undoMatch: () => ctx.undoMatch(),
    redoMatch: () => ctx.redoMatch(),
    toggleAutoRespondBots: () => ctx.toggleAutoRespondBots(),
    toggleAutoPlay: () => ctx.toggleAutoPlay(),
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

  return facade as unknown as MultiGamePlatformApp;
}
