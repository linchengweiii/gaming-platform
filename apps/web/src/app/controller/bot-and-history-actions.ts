import {
  canControlPlayerOnDevicePure,
  findActiveRoomPure,
  getActingPlayerIdPure,
  getEngineForGamePure,
  getRoomStatePure,
  roomUsesServerPure,
  updateRoomInModelPure,
} from "../helpers/room-queries.ts";
import { upsertRoomFromSummaryPure } from "../reducers/room-sync-reducers.ts";
import { stepSetupBotsRecursive } from "../reducers/session-signout-and-match.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { AppRuntimeContext } from "./context.ts";
import { evictDeletedActiveRoom } from "./realtime-ws.ts";

export function attachBotAndHistoryActions(ctx: AppRuntimeContext): void {
  const stopAutoPlay = (): void => {
    ctx.model = { ...ctx.model, autoPlayBots: false };
    if (ctx.autoPlayTimer) {
      clearInterval(ctx.autoPlayTimer);
      ctx.autoPlayTimer = null;
    }
    if (ctx.botResponseTimeout) {
      clearTimeout(ctx.botResponseTimeout);
      ctx.botResponseTimeout = null;
    }
    if (ctx.onlineBotWatchdogTimer) {
      clearTimeout(ctx.onlineBotWatchdogTimer);
      ctx.onlineBotWatchdogTimer = null;
    }
  };

  const stepOneBotMove = (onlyBots = false): boolean => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return false;
    const usesServer = roomUsesServerPure(ctx.model, room);
    if (onlyBots) {
      const curState = getRoomStatePure(ctx.model, room);
      if (!curState || curState.phase === "GAME_OVER") return false;
      const curActorId = usesServer
        ? room.remoteActingPlayerId ??
          getActingPlayerIdPure(room.gameId, curState)
        : getActingPlayerIdPure(room.gameId, curState);
      const curActor =
        curState.players?.find((p: any) => p.id === curActorId) ??
        room.players.find((p) => p.id === curActorId);
      if (!curActor || (!curActor.isBot && !room.allBots)) {
        return false;
      }
    }

    if (usesServer) {
      ctx.connectServerRealtime();
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/bot-step`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: ctx.model.currentUserId,
                onlyBots,
              }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            ctx.model = resetSubModesPure(
              upsertRoomFromSummaryPure(
                ctx.model,
                data.room,
                data.state,
                data.actingPlayerId
              ).model
            );
            ctx.render();
          }
        } catch {
          // Ignore transient network errors
        }
      })();
      return true;
    }

    if (!room.session) return false;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") {
      ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
        ...r,
        status: "finished",
      }));
      stopAutoPlay();
      return false;
    }
    const actorId = getActingPlayerIdPure(room.gameId, state);
    if (!actorId) return false;
    if (onlyBots) {
      const actor = state.players?.find((p: any) => p.id === actorId);
      if (!actor || (!actor.isBot && !room.allBots)) {
        return false;
      }
    }
    const engine = getEngineForGamePure(room.gameId);
    const action = engine.chooseBotAction(state, actorId);
    if (!action) return false;
    const res = room.session.dispatch(actorId, action);
    if (res.state.phase === "GAME_OVER") {
      ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
        ...r,
        status: "finished",
      }));
    }
    ctx.model = resetSubModesPure(ctx.model);
    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
    return true;
  };

  const finishSetupWithBots = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    if (roomUsesServerPure(ctx.model, room)) {
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/finish-setup`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: ctx.model.currentUserId }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            ctx.model = resetSubModesPure(
              upsertRoomFromSummaryPure(
                ctx.model,
                data.room,
                data.state,
                data.actingPlayerId
              ).model
            );
            ctx.render();
          }
        } catch {
          // Ignore transient network errors
        }
      })();
      return;
    }

    if (!room.session || room.gameId !== "catan") return;
    stepSetupBotsRecursive(room.session, 40);
    ctx.model = resetSubModesPure(ctx.model);
    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
  };

  const undoMatch = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    stopAutoPlay();
    if (roomUsesServerPure(ctx.model, room)) {
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/undo`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: ctx.model.currentUserId }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            ctx.model = resetSubModesPure(
              upsertRoomFromSummaryPure(
                ctx.model,
                data.room,
                data.state,
                data.actingPlayerId
              ).model
            );
            ctx.render();
          }
        } catch {
          // Ignore transient network errors
        }
      })();
      return;
    }
    if (!room.session) return;
    const rawState = room.session.getState();
    const baseActingId = getActingPlayerIdPure(room.gameId, rawState);
    const undoTargetId = ((): string | null => {
      if (
        baseActingId &&
        canControlPlayerOnDevicePure(ctx.model, room, baseActingId) &&
        room.session.canPlayerUndo(baseActingId)
      ) {
        return baseActingId;
      }
      if (room.gameId === "seven_wonders" && rawState.phase === "AGE_DRAFT") {
        const log = room.session.getActionLog();
        const last = log[log.length - 1];
        if (
          last &&
          canControlPlayerOnDevicePure(ctx.model, room, last.playerId) &&
          room.session.canPlayerUndo(last.playerId)
        ) {
          return last.playerId;
        }
      }
      return null;
    })();
    if (!undoTargetId) {
      return;
    }
    room.session.undoForPlayer(undoTargetId);
    ctx.model = resetSubModesPure(ctx.model);
    ctx.render();
  };

  const redoMatch = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    stopAutoPlay();
    if (roomUsesServerPure(ctx.model, room)) {
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/redo`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: ctx.model.currentUserId }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
          if (res.ok) {
            const data = await res.json();
            ctx.model = resetSubModesPure(
              upsertRoomFromSummaryPure(
                ctx.model,
                data.room,
                data.state,
                data.actingPlayerId
              ).model
            );
            ctx.render();
          }
        } catch {
          // Ignore transient network errors
        }
      })();
      return;
    }
    if (!room.session) return;
    const rawState = room.session.getState();
    const actingId = getActingPlayerIdPure(room.gameId, rawState);
    if (
      !actingId ||
      !canControlPlayerOnDevicePure(ctx.model, room, actingId) ||
      !room.session.canPlayerRedo(actingId)
    ) {
      return;
    }
    room.session.redoForPlayer(actingId);
    ctx.model = resetSubModesPure(ctx.model);
    ctx.render();
  };

  const toggleAutoRespondBots = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    const usesServer = roomUsesServerPure(ctx.model, room);
    const currentEnabled = usesServer
      ? room.autoStepBots
      : ctx.model.autoRespondBotsToHuman;
    const next = !currentEnabled;
    ctx.model = updateRoomInModelPure(
      { ...ctx.model, autoRespondBotsToHuman: next },
      room.roomId,
      (r) => ({ ...r, autoStepBots: next })
    );
    if (usesServer) {
      ctx.connectServerRealtime();
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/auto-bots`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                enabled: next,
                requesterId: ctx.model.currentUserId,
              }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
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
      })();
    }
    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
  };

  const toggleAutoPlay = (): void => {
    if (ctx.model.autoPlayBots) {
      stopAutoPlay();
    } else {
      ctx.model = { ...ctx.model, autoPlayBots: true };
      ctx.autoPlayTimer = setInterval(() => {
        const room = findActiveRoomPure(ctx.model);
        if (!room) {
          stopAutoPlay();
          return;
        }
        const state = getRoomStatePure(ctx.model, room);
        if (!state) {
          stopAutoPlay();
          return;
        }
        if (state.phase === "GAME_OVER") {
          ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
            ...r,
            status: "finished",
          }));
          stopAutoPlay();
          ctx.render();
          return;
        }
        stepOneBotMove();
      }, ctx.model.autoPlaySpeedMs);
    }
    ctx.render();
  };

  ctx.stopAutoPlay = stopAutoPlay;
  ctx.stepOneBotMove = stepOneBotMove;
  ctx.finishSetupWithBots = finishSetupWithBots;
  ctx.undoMatch = undoMatch;
  ctx.redoMatch = redoMatch;
  ctx.toggleAutoRespondBots = toggleAutoRespondBots;
  ctx.toggleAutoPlay = toggleAutoPlay;
}
