import type { ResourceMap, ResourceType } from "@gaming-platform/catan";
import type { GemColor } from "@gaming-platform/splendor";
import type { AzulDraftSource, AzulTileColor } from "@gaming-platform/azul";
import {
  canControlPlayerOnDevicePure,
  getRoomBoundsPure,
  getRoomStatePure,
} from "../helpers/room-queries.ts";
import type {
  AppViewMode,
  BoardSpotSelection,
  BuildMode,
  ClientRoom,
  GuestSession,
  MultiGamePlatformApp,
  SupportedGameId,
} from "../types.ts";
import type { AppRuntimeContext } from "./context.ts";

export function buildMultiGamePlatformAppFacade(
  ctx: AppRuntimeContext
): MultiGamePlatformApp {
  return {
    get root() {
      return ctx.root;
    },
    get viewMode() {
      return ctx.model.viewMode;
    },
    set viewMode(v: AppViewMode) {
      ctx.model = { ...ctx.model, viewMode: v };
    },
    get lobbyGameFilter() {
      return ctx.model.lobbyGameFilter;
    },
    set lobbyGameFilter(v: SupportedGameId) {
      ctx.model = { ...ctx.model, lobbyGameFilter: v, createRoomGameId: v };
    },
    get lobbyHeroEnteredOnce() {
      return ctx.model.lobbyHeroEnteredOnce;
    },
    set lobbyHeroEnteredOnce(v: boolean) {
      ctx.model = { ...ctx.model, lobbyHeroEnteredOnce: v };
    },
    get loginHeroEnteredOnce() {
      return ctx.model.loginHeroEnteredOnce;
    },
    set loginHeroEnteredOnce(v: boolean) {
      ctx.model = { ...ctx.model, loginHeroEnteredOnce: v };
    },
    get useServerBackend() {
      return ctx.model.useServerBackend;
    },
    set useServerBackend(v: boolean) {
      ctx.model = { ...ctx.model, useServerBackend: v };
    },
    get staticHostOnly() {
      return ctx.model.staticHostOnly;
    },
    set staticHostOnly(v: boolean) {
      ctx.model = { ...ctx.model, staticHostOnly: v };
    },
    get serverReachable() {
      return ctx.model.serverReachable;
    },
    set serverReachable(v: boolean) {
      ctx.model = { ...ctx.model, serverReachable: v };
    },
    get isAuthenticated() {
      return ctx.model.isAuthenticated;
    },
    set isAuthenticated(v: boolean) {
      ctx.model = { ...ctx.model, isAuthenticated: v };
    },
    get addingAdditionalGuest() {
      return ctx.model.addingAdditionalGuest;
    },
    set addingAdditionalGuest(v: boolean) {
      ctx.model = { ...ctx.model, addingAdditionalGuest: v };
    },
    get returnViewAfterAddGuest() {
      return ctx.model.returnViewAfterAddGuest;
    },
    set returnViewAfterAddGuest(v: AppViewMode) {
      ctx.model = { ...ctx.model, returnViewAfterAddGuest: v };
    },
    get loginDraftName() {
      return ctx.model.loginDraftName;
    },
    set loginDraftName(v: string) {
      ctx.model = { ...ctx.model, loginDraftName: v };
    },
    get loginErrorMsg() {
      return ctx.model.loginErrorMsg;
    },
    set loginErrorMsg(v: string) {
      ctx.model = { ...ctx.model, loginErrorMsg: v };
    },
    get currentUserId() {
      return ctx.model.currentUserId;
    },
    set currentUserId(v: string) {
      ctx.model = { ...ctx.model, currentUserId: v };
    },
    get currentUserName() {
      return ctx.model.currentUserName;
    },
    set currentUserName(v: string) {
      ctx.model = { ...ctx.model, currentUserName: v };
    },
    get deviceGuests() {
      return ctx.model.deviceGuests;
    },
    set deviceGuests(v: GuestSession[]) {
      ctx.model = { ...ctx.model, deviceGuests: [...v] };
    },
    get localFriendDraftName() {
      return ctx.model.localFriendDraftName;
    },
    set localFriendDraftName(v: string) {
      ctx.model = { ...ctx.model, localFriendDraftName: v };
    },
    get hidePassAndPlayHand() {
      return ctx.model.hidePassAndPlayHand;
    },
    set hidePassAndPlayHand(v: boolean) {
      ctx.model = { ...ctx.model, hidePassAndPlayHand: v };
    },
    get createRoomName() {
      return ctx.model.createRoomName;
    },
    set createRoomName(v: string) {
      ctx.model = { ...ctx.model, createRoomName: v };
    },
    get createRoomGameId() {
      return ctx.model.createRoomGameId;
    },
    set createRoomGameId(v: SupportedGameId) {
      ctx.model = { ...ctx.model, createRoomGameId: v, lobbyGameFilter: v };
    },
    get createRoomMode() {
      return ctx.model.createRoomMode;
    },
    set createRoomMode(v: "online" | "offline") {
      ctx.model = { ...ctx.model, createRoomMode: v };
    },
    get rooms() {
      return ctx.roomsFacade;
    },
    get nextRoomNum() {
      return ctx.model.nextRoomNum;
    },
    set nextRoomNum(v: number) {
      ctx.model = { ...ctx.model, nextRoomNum: v };
    },
    get activeRoomId() {
      return ctx.model.activeRoomId;
    },
    set activeRoomId(v: string) {
      ctx.model = { ...ctx.model, activeRoomId: v };
    },
    get buildMode() {
      return ctx.model.buildMode;
    },
    set buildMode(v: BuildMode) {
      ctx.model = { ...ctx.model, buildMode: v };
    },
    get selectedBoardSpot() {
      return ctx.model.selectedBoardSpot;
    },
    set selectedBoardSpot(v: BoardSpotSelection | null) {
      ctx.model = { ...ctx.model, selectedBoardSpot: v };
    },
    get setupEdgeKind() {
      return ctx.model.setupEdgeKind;
    },
    set setupEdgeKind(v: "road" | "ship") {
      ctx.model = { ...ctx.model, setupEdgeKind: v };
    },
    get robberOrPirateMode() {
      return ctx.model.robberOrPirateMode;
    },
    set robberOrPirateMode(v: "robber" | "pirate") {
      ctx.model = { ...ctx.model, robberOrPirateMode: v };
    },
    get selectedMoveFromEdgeId() {
      return ctx.model.selectedMoveFromEdgeId;
    },
    set selectedMoveFromEdgeId(v: string | null) {
      ctx.model = { ...ctx.model, selectedMoveFromEdgeId: v };
    },
    get discardSelection() {
      return ctx.model.discardSelection;
    },
    set discardSelection(v: ResourceMap) {
      ctx.model = { ...ctx.model, discardSelection: { ...v } };
    },
    get tradeGiveRes() {
      return ctx.model.tradeGiveRes;
    },
    set tradeGiveRes(v: ResourceType) {
      ctx.model = { ...ctx.model, tradeGiveRes: v };
    },
    get tradeReceiveRes() {
      return ctx.model.tradeReceiveRes;
    },
    set tradeReceiveRes(v: ResourceType) {
      ctx.model = { ...ctx.model, tradeReceiveRes: v };
    },
    get maritimeGive() {
      return ctx.model.maritimeGive;
    },
    set maritimeGive(v: ResourceMap) {
      ctx.model = { ...ctx.model, maritimeGive: { ...v } };
    },
    get maritimeWant() {
      return ctx.model.maritimeWant;
    },
    set maritimeWant(v: ResourceMap) {
      ctx.model = { ...ctx.model, maritimeWant: { ...v } };
    },
    get domesticGive() {
      return ctx.model.domesticGive;
    },
    set domesticGive(v: ResourceMap) {
      ctx.model = { ...ctx.model, domesticGive: { ...v } };
    },
    get domesticWant() {
      return ctx.model.domesticWant;
    },
    set domesticWant(v: ResourceMap) {
      ctx.model = { ...ctx.model, domesticWant: { ...v } };
    },
    get domesticTargetPlayerId() {
      return ctx.model.domesticTargetPlayerId;
    },
    set domesticTargetPlayerId(v: string) {
      ctx.model = { ...ctx.model, domesticTargetPlayerId: v };
    },
    get yopRes1() {
      return ctx.model.yopRes1;
    },
    set yopRes1(v: ResourceType) {
      ctx.model = { ...ctx.model, yopRes1: v };
    },
    get yopRes2() {
      return ctx.model.yopRes2;
    },
    set yopRes2(v: ResourceType) {
      ctx.model = { ...ctx.model, yopRes2: v };
    },
    get monoRes() {
      return ctx.model.monoRes;
    },
    set monoRes(v: ResourceType) {
      ctx.model = { ...ctx.model, monoRes: v };
    },
    get splendorDraftGems() {
      return ctx.model.splendorDraftGems;
    },
    set splendorDraftGems(v: Partial<Record<GemColor, number>>) {
      ctx.model = { ...ctx.model, splendorDraftGems: { ...v } };
    },
    get azulSelectedDraft() {
      return ctx.model.azulSelectedDraft;
    },
    set azulSelectedDraft(
      v: { source: AzulDraftSource; color: AzulTileColor } | null
    ) {
      ctx.model = { ...ctx.model, azulSelectedDraft: v };
    },
    get autoPlayBots() {
      return ctx.model.autoPlayBots;
    },
    set autoPlayBots(v: boolean) {
      ctx.model = { ...ctx.model, autoPlayBots: v };
    },
    get sidebarSettingsExpanded() {
      return ctx.model.sidebarSettingsExpanded;
    },
    set sidebarSettingsExpanded(v: boolean) {
      ctx.model = { ...ctx.model, sidebarSettingsExpanded: v };
    },
    get debugMode() {
      return ctx.model.debugMode;
    },
    set debugMode(v: boolean) {
      ctx.model = { ...ctx.model, debugMode: Boolean(v) };
    },
    get autoRespondBotsToHuman() {
      return ctx.model.autoRespondBotsToHuman;
    },
    set autoRespondBotsToHuman(v: boolean) {
      ctx.model = { ...ctx.model, autoRespondBotsToHuman: v };
    },
    get autoPlaySpeedMs() {
      return ctx.model.autoPlaySpeedMs;
    },
    set autoPlaySpeedMs(v: number) {
      ctx.model = { ...ctx.model, autoPlaySpeedMs: v };
    },
    render: () => ctx.render(),
    signInAsGuest: (rawName, existingGuestId) =>
      ctx.signInAsGuest(rawName, existingGuestId),
    startSoloGameFromLogin: (rawName) => ctx.startSoloGameFromLogin(rawName),
    startOfflineLocalFromLogin: (rawName) =>
      ctx.startOfflineLocalFromLogin(rawName),
    openAddGuestView: () => ctx.openAddGuestView(),
    switchActiveGuest: (guestId) => ctx.switchActiveGuest(guestId),
    renameCurrentGuest: (rawNewName) => ctx.renameCurrentGuest(rawNewName),
    signOutGuest: () => ctx.signOutGuest(),
    removeDeviceGuest: (guestId) => ctx.removeDeviceGuest(guestId),
    getRoomBounds: getRoomBoundsPure,
    createLocalRoom: (opts) => ctx.createLocalRoom(opts),
    getActiveRoom: () => ctx.getActiveRoom(),
    getRoomState: (room: ClientRoom) => getRoomStatePure(ctx.model, room),
    canControlPlayerOnThisDevice: (room: ClientRoom, playerId: string | null) =>
      canControlPlayerOnDevicePure(ctx.model, room, playerId),
    rebuildRoomSeats: (room) => ctx.rebuildRoomSeats(room),
    addLocalFriendToRoom: (room, rawName) =>
      ctx.addLocalFriendToRoom(room, rawName),
    removePlayerFromRoom: (room, targetPlayerId) =>
      ctx.removePlayerFromRoom(room, targetPlayerId),
    createAndOpenRoom: () => ctx.createAndOpenRoom(),
    enterOrJoinRoom: (roomId) => ctx.enterOrJoinRoom(roomId),
    leaveActiveRoom: () => ctx.leaveActiveRoom(),
    startRoomMatch: (roomId) => ctx.startRoomMatch(roomId),
    startInteractiveTutorial: (gameId) => ctx.startInteractiveTutorial(gameId),
    resetSubModes: () => ctx.resetSubModes(),
    dispatchUiAction: (playerId, action) =>
      ctx.dispatchUiAction(playerId, action),
    dispatch: (playerId, action) => ctx.dispatch(playerId, action),
    stepOneBotMove: (onlyBots) => ctx.stepOneBotMove(onlyBots),
    finishSetupWithBots: () => ctx.finishSetupWithBots(),
    undoMatch: () => ctx.undoMatch(),
    redoMatch: () => ctx.redoMatch(),
    toggleAutoRespondBots: () => ctx.toggleAutoRespondBots(),
    toggleAutoPlay: () => ctx.toggleAutoPlay(),
    stopAutoPlay: () => ctx.stopAutoPlay(),
    switchTradeMode: (nextMode) => ctx.switchTradeMode(nextMode),
    setSharedTradeWant: (resource, amount) =>
      ctx.setSharedTradeWant(resource, amount),
  };
}
