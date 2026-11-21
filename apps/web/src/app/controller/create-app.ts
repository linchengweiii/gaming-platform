import { detectBrowserLocale } from "../../i18n/index.ts";
import { createInitialAppModelPure } from "../reducers/session-init-and-signin.ts";
import type {
  MultiGamePlatformApp as MultiGamePlatformAppType,
  MultiGamePlatformAppConstructor,
  MultiGamePlatformAppOptions,
} from "../types.ts";
import { buildMultiGamePlatformAppFacade } from "./app-facade.ts";
import { registerGlobalCatanMapShortcuts } from "./bind-events-catan-viewport.ts";
import { registerWindowHashChangeListener } from "./bind-events-other-games.ts";
import { attachCatanUiActions } from "./catan-ui-actions.ts";
import { attachFullscreenActions } from "./fullscreen-actions.ts";
import {
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
import { attachGuestAndLobbyActions } from "./guest-and-lobby-actions.ts";
import { attachMatchAndBotActions } from "./match-and-bot-actions.ts";
import { attachRealtimeAndHttpActions } from "./realtime-and-http.ts";
import {
  attachRenderHandlers,
  registerGlobalDropdownDismiss,
} from "./render-and-dropdowns.ts";

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
