export {
  DEFAULT_BOT_MOVE_THROTTLE_MS,
  DEFAULT_SHOW_BOT_MOVES,
  clampBotMoveThrottleMsPure,
  formatBotThrottleShortPure,
  getBotMoveThrottlePresetPure,
  getNextBotMoveThrottlePresetPure,
} from "./config/app-config.ts";
export {
  getActiveRoomPure,
  rebuildRoomSeatsPure,
} from "./app/helpers/room-queries.ts";
export {
  buildRoomShareUrlPure,
  extractDebugModeFromLocationPure,
  extractInviteRoomHashFromLocationPure,
  formatRoomHashLabelPure,
} from "./app/helpers/room-hash-and-links.ts";
export {
  syncOnlineLobbyRoomsPure,
  upsertRoomFromSummaryPure,
} from "./app/reducers/room-sync-reducers.ts";
export {
  setSharedTradeWantPure,
  switchTradeModePure,
  toggleSplendorDraftGemPure,
} from "./app/reducers/trade-and-draft-reducers.ts";
export { createInitialAppModelPure } from "./app/reducers/session-init-and-signin.ts";
export { renderLoginViewPure } from "./app/views/login-and-topbar-view.ts";
export { renderLobbyViewPure } from "./app/views/lobby-view.ts";
export {
  classifyBotEventCategoryPure,
  extractBotMoveFeedPure,
} from "./app/views/in-game/bot-move-feed.ts";

import {
  MultiGamePlatformApp as MultiGamePlatformAppCtor,
  createMultiGamePlatformApp,
} from "./app/controller/create-app.ts";
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
