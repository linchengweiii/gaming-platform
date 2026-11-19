import type { ResourceType } from "@gaming-platform/catan";
import { COPY_LINK_RESET_DELAY_MS } from "../../config/app-config.ts";
import { buildRoomShareUrlPure } from "../helpers/room-hash-and-links.ts";
import {
  removeRoomFromModelPure,
  setRoomInModelPure,
} from "../helpers/room-queries.ts";
import type {
  AppModel,
  ClientRoom,
  ClientRoomConfig,
  CreateLocalRoomOptions,
  RoomsMapView,
  SupportedGameId,
} from "../types.ts";

export {
  clearActiveRoomIdFromStorage,
  clearGuestSessionFromStorage,
  clearLastActiveGuestIdFromStorage,
  loadActiveRoomIdFromStorage,
  loadDeviceGuestsFromStorage,
  loadLastActiveGuestIdFromStorage,
  loadSavedGuestSessionFromStorage,
  saveActiveRoomIdToStorage,
  saveDeviceGuestsToStorage,
  saveGuestSessionToStorage,
  saveLastActiveGuestIdToStorage,
} from "./storage.ts";

export interface AppRuntimeContext {
  readonly root: HTMLElement;
  model: AppModel;
  ws: WebSocket | null;
  wsReconnectTimer: ReturnType<typeof setTimeout> | null;
  wsPingTimer: ReturnType<typeof setInterval> | null;
  wsReconnectAttempt: number;
  lastWsActivityMs: number;
  onlineBotWatchdogTimer: ReturnType<typeof setTimeout> | null;
  setupSyncTimer: ReturnType<typeof setTimeout> | null;
  setupSyncPromise: Promise<void> | null;
  setupSyncFlushFn: (() => Promise<void>) | null;
  autoPlayTimer: ReturnType<typeof setInterval> | null;
  botResponseTimeout: ReturnType<typeof setTimeout> | null;
  copyLinkResetTimer: ReturnType<typeof setTimeout> | null;
  pendingRestoreRoomId: string | null;
  isInitialReloadRoomRestore: boolean;
  navEpoch: number;
  createRoomInFlight: boolean;
  readonly tokenPromises: Map<string, Promise<string | null>>;
  readonly roomLensCache: Map<string, ClientRoom>;
  readonly roomsFacade: RoomsMapView;
  getGuestToken: (guestId?: string | null) => string | null;
  clearGuestToken: (guestId: string) => void;
  ensureGuestToken: (guestId?: string | null) => Promise<string | null>;
  fetchApi: (
    input: string,
    init?: RequestInit,
    opts?: { readonly guestId?: string | null; readonly explicitToken?: string | null }
  ) => Promise<Response>;
  getOrCreateRoomLens: (roomId: string) => ClientRoom;
  syncUrlRoomHash: (roomId: string | null) => void;
  copyRoomShareLink: (roomId: string) => string;
  render: () => void;
  renderPreservingFocus: () => void;
  stopAutoPlay: () => void;
  sendWsMessage: (msg: Record<string, unknown>) => void;
  connectServerRealtime: (forceReconnect?: boolean) => void;
  scheduleWsReconnect: () => void;
  syncActiveServerRoomState: () => Promise<void>;
  scheduleOnlineBotWatchdogIfNeeded: () => void;
  fetchLobbyRooms: () => Promise<void>;
  pushServerRoomSetup: (room: ClientRoom, debounceMs?: number) => void;
  flushPendingSetupSync: () => Promise<void>;
  cancelPendingSetupSync: () => void;
  exitRoomToLobby: () => void;
  signInAsGuest: (rawName?: string, existingGuestId?: string) => boolean;
  startSoloGameFromLogin: (rawName?: string) => boolean;
  startOfflineLocalFromLogin: (rawName?: string) => boolean;
  openAddGuestView: () => void;
  switchActiveGuest: (guestId: string) => void;
  renameCurrentGuest: (rawNewName: string) => boolean;
  signOutGuest: () => void;
  removeDeviceGuest: (guestId: string) => void;
  createLocalRoom: (opts: CreateLocalRoomOptions) => ClientRoom;
  getActiveRoom: () => ClientRoom;
  rebuildRoomSeats: (room: ClientRoom) => void;
  addLocalFriendToRoom: (room: ClientRoom, rawName: string) => void;
  removePlayerFromRoom: (room: ClientRoom, targetPlayerId: string) => void;
  createAndOpenRoom: () => void;
  enterOrJoinRoom: (rawRoomId: string) => void;
  leaveActiveRoom: () => void;
  scheduleBotAutoResponseIfNeeded: () => void;
  startRoomMatch: (roomId: string) => void;
  resetSubModes: () => void;
  dispatch: (playerId: string, action: any) => void;
  dispatchUiAction: (playerId: string, action: any) => void;
  startInteractiveTutorial: (gameId: SupportedGameId) => ClientRoom;
  stepOneBotMove: (onlyBots?: boolean) => boolean;
  finishSetupWithBots: () => void;
  undoMatch: () => void;
  redoMatch: () => void;
  toggleAutoRespondBots: () => void;
  toggleAutoPlay: () => void;
  switchTradeMode: (nextMode: "maritime_trade" | "domestic_trade" | null) => void;
  setSharedTradeWant: (resource: ResourceType, amount: number) => void;
}

export function createAppRuntimeContext(
  root: HTMLElement,
  initialModel: AppModel,
  initialPendingRestoreRoomId: string | null,
  isInitialReloadRoomRestore = false
): AppRuntimeContext {
  const roomLensCache = new Map<string, ClientRoom>();

  const noop = (): void => {};
  const noopAsync = async (): Promise<void> => {};

  const ctx: AppRuntimeContext = {
    root,
    model: initialModel,
    ws: null,
    wsReconnectTimer: null,
    wsPingTimer: null,
    wsReconnectAttempt: 0,
    lastWsActivityMs: 0,
    onlineBotWatchdogTimer: null,
    setupSyncTimer: null,
    setupSyncPromise: null,
    setupSyncFlushFn: null,
    autoPlayTimer: null,
    botResponseTimeout: null,
    copyLinkResetTimer: null,
    pendingRestoreRoomId: initialPendingRestoreRoomId,
    isInitialReloadRoomRestore,
    navEpoch: 0,
    createRoomInFlight: false,
    tokenPromises: new Map<string, Promise<string | null>>(),
    roomLensCache,
    roomsFacade: null as unknown as RoomsMapView,
    getGuestToken: () => null,
    clearGuestToken: noop,
    ensureGuestToken: async () => null,
    fetchApi: (input: string, init?: RequestInit) => fetch(input, init),
    getOrCreateRoomLens: null as unknown as (roomId: string) => ClientRoom,
    syncUrlRoomHash: noop,
    copyRoomShareLink: () => "",
    render: noop,
    renderPreservingFocus: noop,
    stopAutoPlay: noop,
    sendWsMessage: noop,
    connectServerRealtime: noop,
    scheduleWsReconnect: noop,
    syncActiveServerRoomState: noopAsync,
    scheduleOnlineBotWatchdogIfNeeded: noop,
    fetchLobbyRooms: noopAsync,
    pushServerRoomSetup: noop,
    flushPendingSetupSync: noopAsync,
    cancelPendingSetupSync: noop,
    exitRoomToLobby: noop,
    signInAsGuest: () => false,
    startSoloGameFromLogin: () => false,
    startOfflineLocalFromLogin: () => false,
    openAddGuestView: noop,
    switchActiveGuest: noop,
    renameCurrentGuest: () => false,
    signOutGuest: noop,
    removeDeviceGuest: noop,
    createLocalRoom: () => ({}) as ClientRoom,
    getActiveRoom: () => ({}) as ClientRoom,
    rebuildRoomSeats: noop,
    addLocalFriendToRoom: noop,
    removePlayerFromRoom: noop,
    createAndOpenRoom: noop,
    enterOrJoinRoom: noop,
    leaveActiveRoom: noop,
    scheduleBotAutoResponseIfNeeded: noop,
    startRoomMatch: noop,
    resetSubModes: noop,
    dispatch: noop,
    dispatchUiAction: noop,
    startInteractiveTutorial: () => ({}) as ClientRoom,
    stepOneBotMove: () => false,
    finishSetupWithBots: noop,
    undoMatch: noop,
    redoMatch: noop,
    toggleAutoRespondBots: noop,
    toggleAutoPlay: noop,
    switchTradeMode: noop,
    setSharedTradeWant: noop,
  };

  const syncUrlRoomHash = (roomId: string | null): void => {
    if (
      typeof window === "undefined" ||
      !window.history ||
      typeof window.history.replaceState !== "function"
    ) {
      return;
    }
    try {
      const pathname = window.location?.pathname ?? "/";
      const rawSearch = window.location?.search ?? "";
      const params = new URLSearchParams(rawSearch.replace(/^\?+/, ""));
      params.delete("room");
      const cleanSearch = params.toString();
      const base = `${pathname}${cleanSearch ? `?${cleanSearch}` : ""}`;
      if (roomId) {
        const cleanId = roomId.trim().replace(/^#+/, "");
        window.history.replaceState(
          null,
          "",
          `${base}#room=${encodeURIComponent(cleanId)}`
        );
      } else if (
        window.location?.hash?.includes("room=") ||
        /^#[0-9a-f]{6,10}$/i.test(window.location?.hash ?? "")
      ) {
        window.history.replaceState(null, "", base);
      }
    } catch {
      // Ignore history security errors in sandboxed frames
    }
  };

  const copyRoomShareLink = (roomId: string): string => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost:3000";
    const pathname =
      typeof window !== "undefined" && window.location?.pathname
        ? window.location.pathname
        : "/";
    const search =
      typeof window !== "undefined" && window.location?.search
        ? window.location.search
        : "";
    const shareUrl = buildRoomShareUrlPure(origin, pathname, search, roomId);

    const markCopied = () => {
      ctx.model = { ...ctx.model, copiedRoomLinkId: roomId };
      ctx.render();
      if (ctx.copyLinkResetTimer) clearTimeout(ctx.copyLinkResetTimer);
      ctx.copyLinkResetTimer = setTimeout(() => {
        if (ctx.model.copiedRoomLinkId === roomId) {
          ctx.model = { ...ctx.model, copiedRoomLinkId: null };
          ctx.render();
        }
      }, COPY_LINK_RESET_DELAY_MS);
    };

    const fallbackCopyViaTextarea = () => {
      try {
        if (typeof document !== "undefined" && document.body) {
          const ta = document.createElement("textarea");
          ta.value = shareUrl;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand?.("copy");
          document.body.removeChild(ta);
        }
      } catch {
        // Ignore fallback error
      }
      markCopied();
    };

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      void navigator.clipboard
        .writeText(shareUrl)
        .then(() => markCopied())
        .catch(() => fallbackCopyViaTextarea());
    } else {
      fallbackCopyViaTextarea();
    }

    return shareUrl;
  };

  const getOrCreateRoomLens = (roomId: string): ClientRoom => {
    const cached = roomLensCache.get(roomId);
    if (cached) return cached;

    const initialSnapshot = ctx.model.rooms[roomId];
    const targetObj: ClientRoom = initialSnapshot
      ? { ...initialSnapshot, config: { ...initialSnapshot.config } }
      : ({ roomId } as ClientRoom);

    const configProxy = new Proxy({} as ClientRoomConfig, {
      get(_cfgTarget, cfgProp) {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        return (live.config as any)[cfgProp];
      },
      set(_cfgTarget, cfgProp, cfgValue) {
        const live = ctx.model.rooms[roomId];
        if (live) {
          ctx.model = setRoomInModelPure(ctx.model, {
            ...live,
            config: {
              ...live.config,
              [cfgProp]: cfgValue,
            },
          });
        } else {
          (targetObj.config as any)[cfgProp] = cfgValue;
        }
        return true;
      },
      ownKeys() {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        return Reflect.ownKeys(live.config);
      },
      getOwnPropertyDescriptor(_cfgTarget, cfgProp) {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        return Object.getOwnPropertyDescriptor(live.config, cfgProp);
      },
    });

    const lens = new Proxy(targetObj, {
      get(_target, prop) {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        if (prop === "config") return configProxy;
        return (live as any)[prop];
      },
      set(_target, prop, value) {
        const live = ctx.model.rooms[roomId];
        if (live) {
          ctx.model = setRoomInModelPure(ctx.model, {
            ...live,
            [prop]: value,
          });
        } else {
          (targetObj as any)[prop] = value;
        }
        return true;
      },
      ownKeys() {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        return Reflect.ownKeys(live);
      },
      getOwnPropertyDescriptor(_target, prop) {
        const live = ctx.model.rooms[roomId] ?? targetObj;
        return Object.getOwnPropertyDescriptor(live, prop);
      },
    });

    roomLensCache.set(roomId, lens);
    return lens;
  };

  const roomsFacade: RoomsMapView = {
    get size() {
      return ctx.model.roomOrder.length;
    },
    get(roomId: string) {
      if (!Object.prototype.hasOwnProperty.call(ctx.model.rooms, roomId)) {
        return undefined;
      }
      return getOrCreateRoomLens(roomId);
    },
    has(roomId: string) {
      return Object.prototype.hasOwnProperty.call(ctx.model.rooms, roomId);
    },
    set(roomId: string, room: ClientRoom) {
      ctx.model = setRoomInModelPure(ctx.model, { ...room, roomId });
      return roomsFacade;
    },
    delete(roomId: string) {
      const existed = Object.prototype.hasOwnProperty.call(
        ctx.model.rooms,
        roomId
      );
      if (existed) {
        ctx.model = removeRoomFromModelPure(ctx.model, roomId);
        roomLensCache.delete(roomId);
      }
      return existed;
    },
    keys() {
      return [...ctx.model.roomOrder][Symbol.iterator]();
    },
    values() {
      return ctx.model.roomOrder
        .filter((id) => Object.prototype.hasOwnProperty.call(ctx.model.rooms, id))
        .map((id) => getOrCreateRoomLens(id))[Symbol.iterator]();
    },
    entries() {
      return ctx.model.roomOrder
        .filter((id) => Object.prototype.hasOwnProperty.call(ctx.model.rooms, id))
        .map(
          (id) => [id, getOrCreateRoomLens(id)] as [string, ClientRoom]
        )[Symbol.iterator]();
    },
    forEach(cb: (room: ClientRoom, roomId: string) => void) {
      ctx.model.roomOrder.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(ctx.model.rooms, id)) {
          cb(getOrCreateRoomLens(id), id);
        }
      });
    },
    [Symbol.iterator]() {
      return roomsFacade.entries();
    },
  };

  (ctx as { roomsFacade: RoomsMapView }).roomsFacade = roomsFacade;
  ctx.getOrCreateRoomLens = getOrCreateRoomLens;
  ctx.syncUrlRoomHash = syncUrlRoomHash;
  ctx.copyRoomShareLink = copyRoomShareLink;

  return ctx;
}
