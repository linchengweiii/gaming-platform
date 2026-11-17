import { createInitialAppModelPure } from "../reducers/session-init-and-signin.ts";
import type {
  MultiGamePlatformApp as MultiGamePlatformAppType,
  MultiGamePlatformAppConstructor,
  MultiGamePlatformAppOptions,
} from "../types.ts";
import { buildMultiGamePlatformAppFacade } from "./app-facade.ts";
import { registerWindowHashChangeListener } from "./bind-events-other-games.ts";
import { attachCatanUiActions } from "./catan-ui-actions.ts";
import {
  createAppRuntimeContext,
  loadActiveRoomIdFromStorage,
  loadDeviceGuestsFromStorage,
  loadSavedGuestSessionFromStorage,
  saveDeviceGuestsToStorage,
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

  const initialModel = createInitialAppModelPure(options, {
    isStaticHost,
    isBrowserHttp,
    randomGuestSuffix: 100 + Math.floor(Math.random() * 900),
    deviceGuests: loadDeviceGuestsFromStorage(),
    savedGuest: loadSavedGuestSessionFromStorage(),
    nowMs: Date.now(),
    locationSearch:
      typeof window !== "undefined" ? window.location?.search ?? "" : "",
    locationHash:
      typeof window !== "undefined" ? window.location?.hash ?? "" : "",
  });

  if (initialModel.isAuthenticated) {
    saveDeviceGuestsToStorage(initialModel.deviceGuests);
  }

  const initialPendingRestoreRoomId = initialModel.isAuthenticated
    ? initialModel.pendingInviteRoomId ?? loadActiveRoomIdFromStorage()
    : null;

  const ctx = createAppRuntimeContext(
    root,
    initialModel,
    initialPendingRestoreRoomId
  );

  attachRealtimeAndHttpActions(ctx);
  attachGuestAndLobbyActions(ctx);
  attachMatchAndBotActions(ctx);
  attachCatanUiActions(ctx);
  attachRenderHandlers(ctx);

  registerGlobalDropdownDismiss(root);
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
