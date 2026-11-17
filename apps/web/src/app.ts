export type {
  AppModel, AppViewMode, BoardSpotSelection, BuildMode, ClientRoom, ClientRoomConfig,
  CreateLocalRoomOptions, DropdownOption, DropdownSpec, GuestSession,
  MultiGamePlatformAppConstructor, MultiGamePlatformAppOptions, RoomsMapView, SupportedGameId,
} from "./app/types.ts";
export { GAME_TITLE_BY_ID } from "./config/app-config.ts";
export { escapeAttr, escapeHtml, formatPhaseLabel, renderDropdown } from "./app/helpers/html-and-dropdown.ts";
export {
  canControlPlayerOnDevicePure, getActingPlayerIdPure, getActiveRoomPure, getEngineForGamePure,
  getRoomBoundsPure, getRoomByIdPure, getRoomListPure, getRoomStatePure, rebuildRoomSeatsPure,
  removeRoomFromModelPure, roomUsesServerPure, setRoomInModelPure, updateRoomInModelPure,
  upsertDeviceGuestListPure,
} from "./app/helpers/room-queries.ts";
export {
  buildRoomShareUrlPure, computeClientRoomHashPure, extractDebugModeFromLocationPure,
  extractInviteRoomHashFromLocationPure, formatRoomHashLabelPure, resolveClientRoomIdPure,
} from "./app/helpers/room-hash-and-links.ts";
export {
  createLocalRoomPure, seedInitialLobbyRoomsPure, syncOnlineLobbyRoomsPure, upsertRoomFromSummaryPure,
} from "./app/reducers/room-sync-reducers.ts";
export {
  resetSubModesPure, setSharedTradeGoodWantPure, setSharedTradeWantPure,
  switchTradeModePure, toggleSplendorDraftGemPure,
} from "./app/reducers/trade-and-draft-reducers.ts";
export {
  addOfflineLocalFriendPure, createInitialAppModelPure, enterOfflineRoomPure,
  leaveOfflineRoomPure, removeOfflinePlayerPure, resolveGuestSignInPure,
} from "./app/reducers/session-init-and-signin.ts";
export {
  renameGuestInModelPure, signOutGuestFromModelPure, startInteractiveTutorialPure,
  startOfflineRoomMatchPure, stepSetupBotsRecursive,
} from "./app/reducers/session-signout-and-match.ts";
export { renderLoginViewPure, renderTopbarUserSelectorPure } from "./app/views/login-and-topbar-view.ts";
export { renderLobbyViewPure } from "./app/views/lobby-view.ts";
export {
  getRoomSetupSummaryDataPure, getStartingPlayerSummaryLabelPure,
  renderRoomHeaderPure, renderSetupSummaryCardPure,
} from "./app/views/room-header-and-summary.ts";
export { renderRoomSetupViewPure } from "./app/views/room-setup-view.ts";
export {
  hasTradeGoodsForOfferPure, renderCatanBarbarianHudPure, renderCatanMapDiceHudPure,
  renderCostPipStripPure, renderMissingCostBadgePure, renderResourceColumnHeadersPure,
  renderTradeGoodColumnHeadersPure,
} from "./app/views/catan-hud-view.ts";
export { renderCatanSpotPopoverPure } from "./app/views/catan-spot-popover-view.ts";
export { renderActiveTradeOfferCardPure, renderCatanMapDecisionPopupPure } from "./app/views/catan-trade-and-popup-view.ts";
export { renderCatanActionDockPure } from "./app/views/catan-action-dock/index.ts";
export { renderCatanPlayerCardPure } from "./app/views/catan-player-card-view.ts";
export { renderInGameViewPure } from "./app/views/in-game/index.ts";

import { MultiGamePlatformApp as MultiGamePlatformAppCtor, createMultiGamePlatformApp } from "./app/controller/create-app.ts";
import type { MultiGamePlatformApp as MultiGamePlatformAppInterface } from "./app/types.ts";

export { createMultiGamePlatformApp };
export type MultiGamePlatformApp = MultiGamePlatformAppInterface;
export const MultiGamePlatformApp = MultiGamePlatformAppCtor;

if (typeof document !== "undefined") {
  const root = document.getElementById("app");
  if (root) {
    createMultiGamePlatformApp(root);
  }
}
