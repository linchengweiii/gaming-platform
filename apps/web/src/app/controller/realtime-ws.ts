import {
  WS_CLIENT_PING_INTERVAL_MS,
  WS_CLIENT_STALE_TIMEOUT_MS,
  WS_DISCONNECTED_FALLBACK_SYNC_MS,
  computeWsReconnectDelayPure,
} from "../../config/app-config.ts";
import {
  removeRoomFromModelPure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import { signOutGuestFromModelPure } from "../reducers/guest-profile-reducers.ts";
import {
  syncOnlineLobbyRoomsPure,
  upsertRoomFromSummaryPure,
} from "../reducers/room-sync-reducers.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
  clearGuestSessionFromStorage,
  clearLastActiveGuestIdFromStorage,
  saveDeviceGuestsToStorage,
  saveGuestSessionToStorage,
} from "./context.ts";

const BOUND_WAKE_ROOTS = new WeakSet<HTMLElement>();

export function evictDeletedActiveRoom(
  ctx: AppRuntimeContext,
  closedRoomId: string
): void {
  const isActive = ctx.model.activeRoomId === closedRoomId;
  ctx.model = removeRoomFromModelPure(ctx.model, closedRoomId);
  ctx.roomLensCache.delete(closedRoomId);
  if (isActive) {
    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    ctx.cancelPendingSetupSync();
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);
    ctx.model = resetSubModesPure({
      ...ctx.model,
      activeRoomId: "",
      inspectingSetupDuringMatch: false,
      viewMode: ctx.model.isAuthenticated ? "lobby" : "login",
    });
    ctx.render();
    return;
  }
  ctx.renderPreservingFocus();
}

export function attachRealtimeWsActions(ctx: AppRuntimeContext): void {
  const clearWsFallbackSyncTimer = (): void => {
    if (ctx.wsFallbackSyncTimer) {
      clearTimeout(ctx.wsFallbackSyncTimer);
      ctx.wsFallbackSyncTimer = null;
    }
  };

  const scheduleWsFallbackSyncIfNeeded = (): void => {
    if (
      !ctx.model.useServerBackend ||
      ctx.model.staticHostOnly ||
      !ctx.model.isAuthenticated
    ) {
      clearWsFallbackSyncTimer();
      return;
    }
    const active = ctx.model.rooms[ctx.model.activeRoomId];
    if (
      (ctx.model.viewMode !== "room_setup" &&
        ctx.model.viewMode !== "in_game") ||
      !active ||
      active.isOfflineLocal
    ) {
      clearWsFallbackSyncTimer();
      return;
    }
    if (ctx.ws && ctx.ws.readyState === WebSocket.OPEN) {
      clearWsFallbackSyncTimer();
      return;
    }
    if (ctx.wsFallbackSyncTimer) return;
    const timer = setTimeout(() => {
      ctx.wsFallbackSyncTimer = null;
      if (ctx.ws && ctx.ws.readyState === WebSocket.OPEN) return;
      void ctx.syncActiveServerRoomState().finally(() => {
        scheduleWsFallbackSyncIfNeeded();
      });
    }, WS_DISCONNECTED_FALLBACK_SYNC_MS);
    (timer as any).unref?.();
    ctx.wsFallbackSyncTimer = timer;
  };

  const sendWsMessage = (msg: Record<string, unknown>): void => {
    if (!ctx.ws || ctx.ws.readyState !== WebSocket.OPEN) return;
    let payload: Record<string, unknown> = msg;
    if (
      (msg.type === "IDENTIFY_PLAYER" || msg.type === "SUBSCRIBE_ROOM") &&
      typeof msg.playerId === "string" &&
      msg.playerId.trim() &&
      msg.token === undefined
    ) {
      const tok = ctx.getGuestToken(msg.playerId.trim());
      if (tok) {
        payload = { ...msg, token: tok };
      } else {
        const targetId = msg.playerId.trim();
        void ctx.ensureGuestToken(targetId).then((issued) => {
          if (
            issued &&
            ctx.model.currentUserId === targetId &&
            ctx.ws &&
            ctx.ws.readyState === WebSocket.OPEN
          ) {
            try {
              ctx.ws.send(JSON.stringify({ ...msg, token: issued }));
            } catch {
              // Ignore send errors on closing socket
            }
          }
        });
        return;
      }
    }
    try {
      ctx.ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send errors on closing socket
    }
  };

  const scheduleWsReconnect = (): void => {
    if (!ctx.model.useServerBackend || ctx.model.staticHostOnly) return;
    if (ctx.wsReconnectTimer) {
      clearTimeout(ctx.wsReconnectTimer);
      ctx.wsReconnectTimer = null;
    }
    const delay = computeWsReconnectDelayPure(
      ctx.wsReconnectAttempt,
      Math.random()
    );
    ctx.wsReconnectAttempt += 1;
    const timer = setTimeout(() => {
      ctx.wsReconnectTimer = null;
      if (!ctx.model.useServerBackend || ctx.model.staticHostOnly) return;
      if (ctx.model.isAuthenticated) {
        if (typeof WebSocket !== "undefined") {
          connectServerRealtime();
        }
        if (
          !ctx.model.serverReachable ||
          ctx.model.pendingInviteRoomId ||
          ctx.pendingRestoreRoomId
        ) {
          void ctx.fetchLobbyRooms();
        }
      }
    }, delay);
    (timer as any).unref?.();
    ctx.wsReconnectTimer = timer;
  };

  const connectServerRealtime = (forceReconnect = false): void => {
    if (
      !ctx.model.useServerBackend ||
      ctx.model.staticHostOnly ||
      typeof WebSocket === "undefined"
    ) {
      return;
    }
    if (ctx.wsReconnectTimer) {
      clearTimeout(ctx.wsReconnectTimer);
      ctx.wsReconnectTimer = null;
    }
    if (forceReconnect && ctx.ws) {
      const stale = ctx.ws;
      ctx.ws = null;
      try {
        stale.close();
      } catch {
        // Ignore close errors
      }
    }
    if (
      ctx.ws &&
      (ctx.ws.readyState === WebSocket.OPEN ||
        ctx.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const authToken =
      ctx.model.isAuthenticated && ctx.model.currentUserId
        ? ctx.getGuestToken(ctx.model.currentUserId)
        : null;
    const wsQuery =
      ctx.model.isAuthenticated && ctx.model.currentUserId
        ? authToken
          ? `/?playerId=${encodeURIComponent(ctx.model.currentUserId)}&token=${encodeURIComponent(authToken)}`
          : `/?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
        : "";
    const socket = new WebSocket(`${proto}//${window.location.host}${wsQuery}`);
    ctx.ws = socket;
    let wsAuthRecoveryAttempted = false;
    scheduleWsFallbackSyncIfNeeded();

    socket.addEventListener("open", () => {
      if (ctx.ws !== socket) return;
      ctx.wsReconnectAttempt = 0;
      ctx.lastWsActivityMs = Date.now();
      clearWsFallbackSyncTimer();
      const wasUnreachable = !ctx.model.serverReachable;
      ctx.model = {
        ...ctx.model,
        serverReachable: true,
        hasEverReachedServer: true,
        ...(wasUnreachable && ctx.model.useServerBackend
          ? { createRoomMode: "online" }
          : {}),
      };
      sendWsMessage({
        type: "IDENTIFY_PLAYER",
        playerId: ctx.model.isAuthenticated ? ctx.model.currentUserId : null,
      });

      const active = ctx.model.rooms[ctx.model.activeRoomId];
      if (
        (ctx.model.viewMode === "room_setup" ||
          ctx.model.viewMode === "in_game") &&
        active &&
        !active.isOfflineLocal
      ) {
        sendWsMessage({
          type: "SUBSCRIBE_ROOM",
          roomId: active.roomId,
          playerId: ctx.model.currentUserId,
        });
        void ctx.syncActiveServerRoomState();
      } else if (
        ctx.model.isAuthenticated &&
        (wasUnreachable ||
          ctx.model.pendingInviteRoomId ||
          ctx.pendingRestoreRoomId)
      ) {
        void ctx.fetchLobbyRooms();
      }
    });

    socket.addEventListener("message", (ev) => {
      if (ctx.ws !== socket) return;
      ctx.lastWsActivityMs = Date.now();
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "SERVER_HEARTBEAT" || msg.type === "PONG") {
          return;
        }
        if (
          msg.type === "ERROR" &&
          (msg.code === "INVALID_GUEST_TOKEN" ||
            (typeof msg.error === "string" &&
              msg.error.includes("guest session token"))) &&
          ctx.model.isAuthenticated &&
          ctx.model.currentUserId &&
          !wsAuthRecoveryAttempted
        ) {
          wsAuthRecoveryAttempted = true;
          const targetId = ctx.model.currentUserId;
          ctx.clearGuestToken(targetId);
          void ctx.ensureGuestToken(targetId).then((freshToken) => {
            if (
              !freshToken ||
              ctx.ws !== socket ||
              socket.readyState !== WebSocket.OPEN ||
              ctx.model.currentUserId !== targetId
            ) {
              return;
            }
            sendWsMessage({
              type: "IDENTIFY_PLAYER",
              playerId: targetId,
              token: freshToken,
            });
            const active = ctx.model.rooms[ctx.model.activeRoomId];
            if (
              (ctx.model.viewMode === "room_setup" ||
                ctx.model.viewMode === "in_game") &&
              active &&
              !active.isOfflineLocal
            ) {
              sendWsMessage({
                type: "SUBSCRIBE_ROOM",
                roomId: active.roomId,
                playerId: targetId,
                token: freshToken,
              });
              void ctx.syncActiveServerRoomState();
            }
          });
          return;
        }
        if (
          (msg.type === "ROOM_CLOSED" || msg.type === "ROOM_REMOVED") &&
          typeof msg.roomId === "string"
        ) {
          evictDeletedActiveRoom(ctx, msg.roomId);
          return;
        }
        if (
          msg.type === "GUEST_SIGNED_OUT" &&
          typeof msg.playerId === "string" &&
          msg.playerId === ctx.model.currentUserId &&
          ctx.model.isAuthenticated
        ) {
          ctx.navEpoch += 1;
          ctx.stopAutoPlay();
          ctx.cancelPendingSetupSync();
          ctx.pendingRestoreRoomId = null;
          const prevActiveRoom = ctx.model.rooms[ctx.model.activeRoomId];
          const cleaned = signOutGuestFromModelPure(
            ctx.model,
            msg.playerId,
            100 + Math.floor(Math.random() * 900)
          );
          ctx.model = cleaned.model;
          cleaned.removedRoomIds.forEach((id) => ctx.roomLensCache.delete(id));
          saveDeviceGuestsToStorage(ctx.model.deviceGuests);
          if (cleaned.switchedToGuest) {
            saveGuestSessionToStorage(cleaned.switchedToGuest);
            sendWsMessage({
              type: "IDENTIFY_PLAYER",
              playerId: cleaned.switchedToGuest.id,
            });
            const nextActive = ctx.model.rooms[ctx.model.activeRoomId];
            if (
              nextActive &&
              (ctx.model.viewMode === "room_setup" ||
                ctx.model.viewMode === "in_game") &&
              roomUsesServerPure(ctx.model, nextActive)
            ) {
              sendWsMessage({
                type: "SUBSCRIBE_ROOM",
                roomId: nextActive.roomId,
                playerId: cleaned.switchedToGuest.id,
              });
            } else if (prevActiveRoom) {
              sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
            }
          } else {
            if (prevActiveRoom) {
              sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
            }
            sendWsMessage({ type: "IDENTIFY_PLAYER", playerId: null });
            clearGuestSessionFromStorage();
            clearActiveRoomIdFromStorage();
            if (ctx.model.deviceGuests.length === 0) {
              clearLastActiveGuestIdFromStorage();
            }
            ctx.syncUrlRoomHash(null);
          }
          ctx.render();
          return;
        }
        if (msg.type === "LOBBY_ROOMS" && Array.isArray(msg.rooms)) {
          ctx.model = syncOnlineLobbyRoomsPure(ctx.model, msg.rooms);
          if (ctx.model.viewMode === "lobby") {
            ctx.renderPreservingFocus();
          }
          return;
        }
        if (msg.type === "ROOM_STATE" && msg.room) {
          const upserted = upsertRoomFromSummaryPure(
            ctx.model,
            msg.room,
            msg.state,
            msg.actingPlayerId
          );
          ctx.model = upserted.model;
          const updated = upserted.room;
          if (
            updated.roomId === ctx.model.activeRoomId &&
            (ctx.model.viewMode === "room_setup" ||
              ctx.model.viewMode === "in_game")
          ) {
            if (
              ctx.model.viewMode === "room_setup" &&
              updated.status === "in_progress" &&
              updated.remoteState !== null &&
              !ctx.model.inspectingSetupDuringMatch
            ) {
              ctx.model = resetSubModesPure({
                ...ctx.model,
                inspectingSetupDuringMatch: false,
                viewMode: "in_game",
              });
            }
            if (updated.status === "finished") {
              ctx.stopAutoPlay();
            }
            ctx.renderPreservingFocus();
          }
        }
      } catch {
        // Ignore malformed frame
      }
    });

    socket.addEventListener("close", () => {
      if (ctx.ws !== socket) return;
      ctx.ws = null;
      if (ctx.model.isAuthenticated && ctx.model.useServerBackend) {
        scheduleWsReconnect();
        scheduleWsFallbackSyncIfNeeded();
      }
    });
  };

  if (
    typeof window !== "undefined" &&
    typeof WebSocket !== "undefined" &&
    !BOUND_WAKE_ROOTS.has(ctx.root)
  ) {
    BOUND_WAKE_ROOTS.add(ctx.root);

    const handleWakeOrOnline = (): void => {
      if (
        !ctx.model.useServerBackend ||
        ctx.model.staticHostOnly ||
        !ctx.model.isAuthenticated
      ) {
        return;
      }
      const now = Date.now();
      const wsStale =
        !ctx.ws ||
        ctx.ws.readyState !== WebSocket.OPEN ||
        (ctx.lastWsActivityMs > 0 &&
          now - ctx.lastWsActivityMs > WS_CLIENT_STALE_TIMEOUT_MS);
      if (wsStale) {
        connectServerRealtime(true);
      } else {
        sendWsMessage({ type: "PING" });
      }
      if (
        ctx.model.viewMode === "room_setup" ||
        ctx.model.viewMode === "in_game"
      ) {
        void ctx.syncActiveServerRoomState();
      } else if (ctx.model.viewMode === "lobby") {
        void ctx.fetchLobbyRooms();
      }
    };

    window.addEventListener("online", handleWakeOrOnline);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          handleWakeOrOnline();
        }
      });
    }

    const pingTimer = setInterval(() => {
      if (
        !ctx.model.useServerBackend ||
        ctx.model.staticHostOnly ||
        !ctx.model.isAuthenticated
      ) {
        return;
      }
      const now = Date.now();
      if (ctx.ws && ctx.ws.readyState === WebSocket.OPEN) {
        if (
          ctx.lastWsActivityMs > 0 &&
          now - ctx.lastWsActivityMs > WS_CLIENT_STALE_TIMEOUT_MS
        ) {
          connectServerRealtime(true);
        } else {
          sendWsMessage({ type: "PING" });
        }
      }
    }, WS_CLIENT_PING_INTERVAL_MS);
    (pingTimer as any).unref?.();
    ctx.wsPingTimer = pingTimer;
  }

  ctx.sendWsMessage = sendWsMessage;
  ctx.scheduleWsReconnect = scheduleWsReconnect;
  ctx.scheduleWsFallbackSyncIfNeeded = scheduleWsFallbackSyncIfNeeded;
  ctx.connectServerRealtime = connectServerRealtime;
}
