import { ONLINE_BOT_WATCHDOG_MS } from "../../config/app-config.ts";
import {
  findActiveRoomPure,
  getActingPlayerIdPure,
  getRoomStatePure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import {
  syncOnlineLobbyRoomsPure,
  upsertRoomFromSummaryPure,
} from "../reducers/room-sync-reducers.ts";
import { DEFAULT_CATAN_MAP_VIEWPORT } from "../../catan-graphics/viewport.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { ClientRoom } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
} from "./context.ts";
import {
  attachGuestTokenAndFetchHelpers,
  isLikelyStaticHostResponsePure,
} from "./http-fetch-helper.ts";
import {
  attachRealtimeWsActions,
  evictDeletedActiveRoom,
} from "./realtime-ws.ts";

export function attachRealtimeAndHttpActions(ctx: AppRuntimeContext): void {
  attachGuestTokenAndFetchHelpers(ctx);
  attachRealtimeWsActions(ctx);

  const cancelPendingSetupSync = (): void => {
    if (ctx.setupSyncTimer) {
      clearTimeout(ctx.setupSyncTimer);
      ctx.setupSyncTimer = null;
    }
    ctx.setupSyncFlushFn = null;
  };

  const flushPendingSetupSync = async (): Promise<void> => {
    if (ctx.setupSyncTimer && ctx.setupSyncFlushFn) {
      clearTimeout(ctx.setupSyncTimer);
      ctx.setupSyncTimer = null;
      const fn = ctx.setupSyncFlushFn;
      ctx.setupSyncFlushFn = null;
      await fn();
      return;
    }
    if (ctx.setupSyncPromise) {
      await ctx.setupSyncPromise;
    }
  };

  const exitRoomToLobby = (): void => {
    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    cancelPendingSetupSync();
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);
    ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
    ctx.model = resetSubModesPure({
      ...ctx.model,
      activeRoomId: "",
      inspectingSetupDuringMatch: false,
      viewMode: "lobby",
      catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
    });
  };

  const syncActiveServerRoomState = async (): Promise<void> => {
    if (!ctx.model.useServerBackend) return;
    const active = ctx.model.rooms[ctx.model.activeRoomId];
    if (
      !active ||
      active.isOfflineLocal ||
      (ctx.model.viewMode !== "in_game" && ctx.model.viewMode !== "room_setup")
    ) {
      return;
    }
    const requestedRoomId = active.roomId;
    const requestedPlayerId = ctx.model.currentUserId;
    const capturedEpoch = ctx.navEpoch;
    try {
      const res = await ctx.fetchApi(
        `/api/rooms/${encodeURIComponent(requestedRoomId)}`,
        undefined,
        { guestId: requestedPlayerId }
      );
      if (
        ctx.navEpoch !== capturedEpoch ||
        ctx.model.currentUserId !== requestedPlayerId
      ) {
        return;
      }
      if (res.status === 404) {
        evictDeletedActiveRoom(ctx, requestedRoomId);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (
        !data.room ||
        ctx.navEpoch !== capturedEpoch ||
        ctx.model.currentUserId !== requestedPlayerId
      ) {
        return;
      }
      const upserted = upsertRoomFromSummaryPure(
        ctx.model,
        data.room,
        data.state,
        data.actingPlayerId
      );
      ctx.model = upserted.model;
      if (
        upserted.room.roomId === ctx.model.activeRoomId &&
        (ctx.model.viewMode === "room_setup" ||
          ctx.model.viewMode === "in_game")
      ) {
        if (
          ctx.model.viewMode === "room_setup" &&
          upserted.room.status === "in_progress" &&
          upserted.room.remoteState !== null &&
          !ctx.model.inspectingSetupDuringMatch
        ) {
          ctx.model = resetSubModesPure({
            ...ctx.model,
            inspectingSetupDuringMatch: false,
            viewMode: "in_game",
          });
        }
        ctx.renderPreservingFocus();
      }
    } catch {
      // Ignore transient network errors
    }
  };

  const scheduleOnlineBotWatchdogIfNeeded = (): void => {
    if (ctx.onlineBotWatchdogTimer) {
      clearTimeout(ctx.onlineBotWatchdogTimer);
      ctx.onlineBotWatchdogTimer = null;
    }
    if (!ctx.model.isAuthenticated || ctx.model.viewMode !== "in_game") {
      return;
    }
    const room = findActiveRoomPure(ctx.model);
    if (
      !room ||
      !roomUsesServerPure(ctx.model, room) ||
      room.status !== "in_progress" ||
      !room.autoStepBots
    ) {
      return;
    }
    const state = getRoomStatePure(ctx.model, room);
    if (!state || state.phase === "GAME_OVER") return;
    const actingId =
      room.remoteActingPlayerId ?? getActingPlayerIdPure(room.gameId, state);
    if (!actingId) return;
    const actor =
      state.players?.find((p: any) => p.id === actingId) ??
      room.players.find((p) => p.id === actingId);
    if (!actor || !actor.isBot) return;

    const timer = setTimeout(() => {
      ctx.onlineBotWatchdogTimer = null;
      ctx.connectServerRealtime();
      ctx.sendWsMessage({
        type: "SUBSCRIBE_ROOM",
        roomId: room.roomId,
        playerId: ctx.model.currentUserId,
      });
      void syncActiveServerRoomState().then(() => {
        scheduleOnlineBotWatchdogIfNeeded();
      });
    }, ONLINE_BOT_WATCHDOG_MS);
    (timer as any).unref?.();
    ctx.onlineBotWatchdogTimer = timer;
  };

  const fetchLobbyRooms = async (): Promise<void> => {
    if (!ctx.model.useServerBackend) return;
    const requestedPlayerId = ctx.model.currentUserId;
    try {
      const res = await ctx.fetchApi(`/api/rooms`, undefined, {
        guestId: requestedPlayerId || null,
      });
      const ct = res.headers.get("content-type") ?? "";

      if (
        isLikelyStaticHostResponsePure(
          res.status,
          ct,
          ctx.model.hasEverReachedServer
        )
      ) {
        ctx.model = {
          ...ctx.model,
          staticHostOnly: true,
          useServerBackend: false,
          serverReachable: false,
          createRoomMode: "offline",
        };
        if (ctx.wsReconnectTimer) {
          clearTimeout(ctx.wsReconnectTimer);
          ctx.wsReconnectTimer = null;
        }
        if (ctx.model.viewMode === "lobby") {
          ctx.renderPreservingFocus();
        }
        return;
      }

      if (!res.ok || !ct.includes("application/json")) {
        ctx.model = {
          ...ctx.model,
          serverReachable: false,
          createRoomMode: "offline",
        };
        ctx.scheduleWsReconnect();
        if (ctx.model.viewMode === "lobby") {
          ctx.renderPreservingFocus();
        }
        return;
      }

      if (ctx.model.currentUserId !== requestedPlayerId) return;

      ctx.wsReconnectAttempt = 0;
      const wasUnreachable = !ctx.model.serverReachable;
      ctx.model = {
        ...ctx.model,
        serverReachable: true,
        hasEverReachedServer: true,
        ...(wasUnreachable ? { createRoomMode: "online" } : {}),
      };
      ctx.connectServerRealtime();

      const data = await res.json();
      if (ctx.model.currentUserId !== requestedPlayerId) return;

      if (Array.isArray(data.rooms)) {
        ctx.model = syncOnlineLobbyRoomsPure(ctx.model, data.rooms);
        const isReloadSameRoom =
          ctx.isInitialReloadRoomRestore &&
          Boolean(ctx.model.pendingInviteRoomId) &&
          ctx.pendingRestoreRoomId === ctx.model.pendingInviteRoomId;
        ctx.isInitialReloadRoomRestore = false;

        if (ctx.model.pendingInviteRoomId && !isReloadSameRoom) {
          const inviteId = ctx.model.pendingInviteRoomId;
          ctx.model = { ...ctx.model, pendingInviteRoomId: null };
          ctx.pendingRestoreRoomId = null;
          ctx.enterOrJoinRoom(inviteId);
          return;
        }

        if (isReloadSameRoom) {
          ctx.model = { ...ctx.model, pendingInviteRoomId: null };
        }

        if (ctx.pendingRestoreRoomId) {
          const restoreId = ctx.pendingRestoreRoomId;
          ctx.pendingRestoreRoomId = null;
          const restoreTarget = ctx.model.rooms[restoreId];
          const isSeatedInRestore = Boolean(
            restoreTarget?.players.some(
              (p) =>
                p.id === ctx.model.currentUserId ||
                p.controllerId === ctx.model.currentUserId
            )
          );
          if (restoreTarget && isSeatedInRestore) {
            ctx.enterOrJoinRoom(restoreId);
            return;
          }
          clearActiveRoomIdFromStorage();
          ctx.syncUrlRoomHash(null);
        }
        if (ctx.model.viewMode === "lobby") {
          ctx.renderPreservingFocus();
        }
      }
    } catch {
      ctx.model = {
        ...ctx.model,
        serverReachable: false,
        createRoomMode: "offline",
      };
      ctx.scheduleWsReconnect();
      if (ctx.model.viewMode === "lobby") {
        ctx.renderPreservingFocus();
      }
    }
  };

  const pushServerRoomSetup = (room: ClientRoom, debounceMs = 0): void => {
    if (!roomUsesServerPure(ctx.model, room)) return;
    cancelPendingSetupSync();
    const send = async (): Promise<void> => {
      const p = (async () => {
        try {
          const latest = ctx.model.rooms[room.roomId] ?? room;
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(latest.roomId)}/setup`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: ctx.model.currentUserId,
                name: latest.name,
                gameId: latest.gameId,
                isPrivate: latest.isPrivate,
                botCount: latest.botCount,
                allBots: latest.allBots,
                botDifficulty: latest.botDifficulty,
                startingPlayerMode: latest.startingPlayerMode,
                config: latest.config,
              }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, latest.roomId);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            if (data.room) {
              ctx.model = upsertRoomFromSummaryPure(
                ctx.model,
                data.room
              ).model;
              ctx.renderPreservingFocus();
            }
          }
        } catch {
          // Ignore transient network errors
        } finally {
          ctx.setupSyncPromise = null;
        }
      })();
      ctx.setupSyncPromise = p;
      await p;
    };
    if (debounceMs > 0) {
      ctx.setupSyncFlushFn = send;
      ctx.setupSyncTimer = setTimeout(() => {
        ctx.setupSyncTimer = null;
        ctx.setupSyncFlushFn = null;
        void send();
      }, debounceMs);
    } else {
      void send();
    }
  };

  ctx.cancelPendingSetupSync = cancelPendingSetupSync;
  ctx.flushPendingSetupSync = flushPendingSetupSync;
  ctx.exitRoomToLobby = exitRoomToLobby;
  ctx.syncActiveServerRoomState = syncActiveServerRoomState;
  ctx.scheduleOnlineBotWatchdogIfNeeded = scheduleOnlineBotWatchdogIfNeeded;
  ctx.fetchLobbyRooms = fetchLobbyRooms;
  ctx.pushServerRoomSetup = pushServerRoomSetup;
}
