import {
  clampBotMoveThrottleMsPure,
  getNextBotMoveThrottlePresetPure,
} from "../../config/app-config.ts";
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
import {
  type AppRuntimeContext,
  saveBotMoveThrottleMsToStorage,
  saveShowBotMovesToStorage,
} from "./context.ts";
import { evictDeletedActiveRoom } from "./realtime-ws.ts";

function postRoomEndpointAndSync(
  ctx: AppRuntimeContext,
  roomId: string,
  endpoint: string,
  payload: Record<string, unknown>,
  opts: {
    readonly includeState: boolean;
    readonly preserveFocus?: boolean;
  }
): void {
  void (async () => {
    try {
      const res = await ctx.fetchApi(
        `/api/rooms/${encodeURIComponent(roomId)}/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (res.status === 404) {
        evictDeletedActiveRoom(ctx, roomId);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (opts.includeState) {
        ctx.model = resetSubModesPure(
          upsertRoomFromSummaryPure(
            ctx.model,
            data.room,
            data.state,
            data.actingPlayerId
          ).model
        );
        ctx.render();
      } else if (data.room) {
        ctx.model = upsertRoomFromSummaryPure(ctx.model, data.room).model;
        if (opts.preserveFocus) ctx.renderPreservingFocus();
        else ctx.render();
      }
    } catch {
      // Ignore transient network errors
    }
  })();
}

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
      if (!curActor || (!curActor.isBot && !room.allBots)) return false;
    }

    if (usesServer) {
      ctx.connectServerRealtime();
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "bot-step",
        { requesterId: ctx.model.currentUserId, onlyBots },
        { includeState: true }
      );
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
      if (!actor || (!actor.isBot && !room.allBots)) return false;
    }
    const action = getEngineForGamePure(room.gameId).chooseBotAction(
      state,
      actorId
    );
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
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "finish-setup",
        { requesterId: ctx.model.currentUserId },
        { includeState: true }
      );
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
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "undo",
        { requesterId: ctx.model.currentUserId },
        { includeState: true }
      );
      return;
    }
    if (!room.session) return;
    const rawState = room.session.getState();
    const baseActingId = getActingPlayerIdPure(room.gameId, rawState);
    const canUndoActor = (id: string | null | undefined): id is string =>
      Boolean(
        id &&
          canControlPlayerOnDevicePure(ctx.model, room, id) &&
          room.session!.canPlayerUndo(id)
      );

    let undoTargetId: string | null = null;
    if (canUndoActor(baseActingId)) {
      undoTargetId = baseActingId;
    } else if (
      room.gameId === "seven_wonders" &&
      rawState.phase === "AGE_DRAFT"
    ) {
      const log = room.session.getActionLog();
      const lastPlayerId = log[log.length - 1]?.playerId;
      if (canUndoActor(lastPlayerId)) undoTargetId = lastPlayerId;
    }
    if (!undoTargetId) return;
    room.session.undoForPlayer(undoTargetId);
    ctx.model = resetSubModesPure(ctx.model);
    ctx.render();
  };

  const redoMatch = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    stopAutoPlay();
    if (roomUsesServerPure(ctx.model, room)) {
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "redo",
        { requesterId: ctx.model.currentUserId },
        { includeState: true }
      );
      return;
    }
    if (!room.session) return;
    const actingId = getActingPlayerIdPure(room.gameId, room.session.getState());
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
    const next = !(usesServer
      ? room.autoStepBots
      : ctx.model.autoRespondBotsToHuman);
    ctx.model = updateRoomInModelPure(
      { ...ctx.model, autoRespondBotsToHuman: next },
      room.roomId,
      (r) => ({ ...r, autoStepBots: next })
    );
    if (usesServer) {
      ctx.connectServerRealtime();
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "auto-bots",
        { enabled: next, requesterId: ctx.model.currentUserId },
        { includeState: false, preserveFocus: true }
      );
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
        const state = room ? getRoomStatePure(ctx.model, room) : null;
        if (!room || !state) {
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

  const toggleShowBotMoves = (): void => {
    const next = !ctx.model.showBotMoves;
    ctx.model = {
      ...ctx.model,
      showBotMoves: next,
      ...(!next ? { botFeedHistoryExpanded: false } : {}),
    };
    saveShowBotMovesToStorage(next);
    ctx.render();
  };

  const toggleBotFeedHistory = (): void => {
    ctx.model = {
      ...ctx.model,
      botFeedHistoryExpanded: !ctx.model.botFeedHistoryExpanded,
    };
    ctx.render();
  };

  const setBotMoveThrottleMs = (delayMs: number): void => {
    const clamped = clampBotMoveThrottleMsPure(delayMs);
    saveBotMoveThrottleMsToStorage(clamped);
    const room = findActiveRoomPure(ctx.model);
    if (!room) {
      ctx.model = { ...ctx.model, botMoveThrottleMs: clamped };
      ctx.render();
      return;
    }
    const usesServer = roomUsesServerPure(ctx.model, room);
    ctx.model = updateRoomInModelPure(
      { ...ctx.model, botMoveThrottleMs: clamped },
      room.roomId,
      (r) => ({ ...r, botStepDelayMs: clamped })
    );
    if (usesServer) {
      ctx.connectServerRealtime();
      postRoomEndpointAndSync(
        ctx,
        room.roomId,
        "bot-speed",
        { botStepDelayMs: clamped, requesterId: ctx.model.currentUserId },
        { includeState: false, preserveFocus: true }
      );
      ctx.render();
      return;
    }
    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
  };

  const cycleBotMoveThrottle = (): void => {
    const room = findActiveRoomPure(ctx.model);
    const currentDelay =
      room && roomUsesServerPure(ctx.model, room)
        ? room.botStepDelayMs
        : room?.botStepDelayMs ?? ctx.model.botMoveThrottleMs;
    setBotMoveThrottleMs(getNextBotMoveThrottlePresetPure(currentDelay).delayMs);
  };

  Object.assign(ctx, {
    stopAutoPlay,
    stepOneBotMove,
    finishSetupWithBots,
    undoMatch,
    redoMatch,
    toggleAutoRespondBots,
    toggleAutoPlay,
    toggleShowBotMoves,
    toggleBotFeedHistory,
    setBotMoveThrottleMs,
    cycleBotMoveThrottle,
  });
}
