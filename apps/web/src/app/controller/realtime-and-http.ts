import {
  ONLINE_BOT_WATCHDOG_MS,
  WS_RECONNECT_DELAY_MS,
} from "../../config/app-config.ts";
import {
  getActingPlayerIdPure,
  getActiveRoomPure,
  getRoomStatePure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import {
  syncOnlineLobbyRoomsPure,
  upsertRoomFromSummaryPure,
} from "../reducers/room-sync-reducers.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { ClientRoom } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
} from "./context.ts";

export function attachRealtimeAndHttpActions(ctx: AppRuntimeContext): void {
  const sendWsMessage = (msg: Record<string, unknown>): void => {
    if (ctx.ws && ctx.ws.readyState === WebSocket.OPEN) {
      ctx.ws.send(JSON.stringify(msg));
    }
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
    try {
      const res = await fetch(
        `/api/rooms/${encodeURIComponent(active.roomId)}?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data.room) return;
      const prevStatus = ctx.model.rooms[data.room.roomId]?.status;
      const upserted = upsertRoomFromSummaryPure(
        ctx.model,
        data.room,
        data.state,
        data.actingPlayerId
      );
      ctx.model = upserted.model;
      if (upserted.room.roomId === ctx.model.activeRoomId) {
        if (
          ctx.model.viewMode === "room_setup" &&
          prevStatus !== "in_progress" &&
          upserted.room.status === "in_progress"
        ) {
          ctx.model = resetSubModesPure({
            ...ctx.model,
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
    const room = getActiveRoomPure(ctx.model);
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
      sendWsMessage({
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

  const connectServerRealtime = (): void => {
    if (!ctx.model.useServerBackend || typeof WebSocket === "undefined") return;
    if (
      ctx.ws &&
      (ctx.ws.readyState === WebSocket.OPEN ||
        ctx.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsQuery = ctx.model.currentUserId
      ? `/?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
      : "";
    const socket = new WebSocket(`${proto}//${window.location.host}${wsQuery}`);
    ctx.ws = socket;

    socket.addEventListener("open", () => {
      ctx.model = { ...ctx.model, serverReachable: true };
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
        void syncActiveServerRoomState();
      }
    });

    socket.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "LOBBY_ROOMS" && Array.isArray(msg.rooms)) {
          ctx.model = syncOnlineLobbyRoomsPure(ctx.model, msg.rooms);
          if (ctx.model.viewMode === "lobby") {
            ctx.renderPreservingFocus();
          }
        } else if (msg.type === "ROOM_STATE" && msg.room) {
          const prevStatus = ctx.model.rooms[msg.room.roomId]?.status;
          const upserted = upsertRoomFromSummaryPure(
            ctx.model,
            msg.room,
            msg.state,
            msg.actingPlayerId
          );
          ctx.model = upserted.model;
          const updated = upserted.room;
          if (updated.roomId === ctx.model.activeRoomId) {
            if (
              ctx.model.viewMode === "room_setup" &&
              prevStatus !== "in_progress" &&
              updated.status === "in_progress"
            ) {
              ctx.model = resetSubModesPure({
                ...ctx.model,
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
      if (ctx.ws === socket) {
        ctx.ws = null;
      }
      if (ctx.model.isAuthenticated && ctx.model.useServerBackend) {
        if (ctx.wsReconnectTimer) clearTimeout(ctx.wsReconnectTimer);
        const timer = setTimeout(
          () => connectServerRealtime(),
          WS_RECONNECT_DELAY_MS
        );
        (timer as any).unref?.();
        ctx.wsReconnectTimer = timer;
      }
    });
  };

  const fetchLobbyRooms = async (): Promise<void> => {
    if (!ctx.model.useServerBackend) return;
    try {
      const playerQuery = ctx.model.currentUserId
        ? `?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
        : "";
      const res = await fetch(`/api/rooms${playerQuery}`);
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("application/json")) {
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
      ctx.model = { ...ctx.model, serverReachable: true };
      connectServerRealtime();
      const data = await res.json();
      if (Array.isArray(data.rooms)) {
        ctx.model = syncOnlineLobbyRoomsPure(ctx.model, data.rooms);
        if (ctx.model.pendingInviteRoomId) {
          const inviteId = ctx.model.pendingInviteRoomId;
          ctx.model = { ...ctx.model, pendingInviteRoomId: null };
          ctx.pendingRestoreRoomId = null;
          ctx.enterOrJoinRoom(inviteId);
          return;
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
      if (ctx.model.viewMode === "lobby") {
        ctx.renderPreservingFocus();
      }
    }
  };

  const pushServerRoomSetup = (room: ClientRoom, debounceMs = 0): void => {
    if (!roomUsesServerPure(ctx.model, room)) return;
    if (ctx.setupSyncTimer) {
      clearTimeout(ctx.setupSyncTimer);
      ctx.setupSyncTimer = null;
    }
    const send = async () => {
      try {
        const latest = ctx.model.rooms[room.roomId] ?? room;
        const res = await fetch(
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
        if (res.ok) {
          const data = await res.json();
          if (data.room) {
            ctx.model = upsertRoomFromSummaryPure(ctx.model, data.room).model;
            ctx.renderPreservingFocus();
          }
        }
      } catch {
        // Ignore transient network errors
      }
    };
    if (debounceMs > 0) {
      ctx.setupSyncTimer = setTimeout(() => void send(), debounceMs);
    } else {
      void send();
    }
  };

  ctx.sendWsMessage = sendWsMessage;
  ctx.connectServerRealtime = connectServerRealtime;
  ctx.syncActiveServerRoomState = syncActiveServerRoomState;
  ctx.scheduleOnlineBotWatchdogIfNeeded = scheduleOnlineBotWatchdogIfNeeded;
  ctx.fetchLobbyRooms = fetchLobbyRooms;
  ctx.pushServerRoomSetup = pushServerRoomSetup;
}
