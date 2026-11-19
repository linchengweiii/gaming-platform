import { CatanEngine, hasResources } from "@gaming-platform/catan";
import {
  type SevenWondersState,
  canPlayerUnselectDraftPick,
} from "@gaming-platform/seven-wonders";
import {
  BOT_RESPONSE_DELAY_MS,
  BOT_SEVEN_WONDERS_DRAFT_DELAY_MS,
  SPECIAL_BUILD_AUTO_END_DELAY_MS,
} from "../../config/app-config.ts";
import {
  canControlPlayerOnDevicePure,
  findActiveRoomPure,
  getActingPlayerIdPure,
  getRoomStatePure,
  roomUsesServerPure,
  updateRoomInModelPure,
} from "../helpers/room-queries.ts";
import { upsertRoomFromSummaryPure } from "../reducers/room-sync-reducers.ts";
import {
  startInteractiveTutorialPure,
  startOfflineRoomMatchPure,
} from "../reducers/session-signout-and-match.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { ClientRoom, SupportedGameId } from "../types.ts";
import { hasTradeGoodsForOfferPure } from "../views/catan-hud-view.ts";
import { attachBotAndHistoryActions } from "./bot-and-history-actions.ts";
import type { AppRuntimeContext } from "./context.ts";
import { evictDeletedActiveRoom } from "./realtime-ws.ts";

export function attachMatchAndBotActions(ctx: AppRuntimeContext): void {
  attachBotAndHistoryActions(ctx);
  const startingRoomIds = new Set<string>();

  const scheduleBotAutoResponseIfNeeded = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room || roomUsesServerPure(ctx.model, room)) return;
    if (ctx.botResponseTimeout) {
      clearTimeout(ctx.botResponseTimeout);
      ctx.botResponseTimeout = null;
    }
    if (!room.session || ctx.model.viewMode !== "in_game") return;
    const state = room.session.getState();
    if (state.phase === "GAME_OVER") return;

    const actorId = getActingPlayerIdPure(room.gameId, state);
    const actor = state.players.find((p: any) => p.id === actorId);

    if (
      room.gameId === "catan" &&
      state.phase === "MAIN_PHASE" &&
      state.activeTradeOffer &&
      actor &&
      actor.id !== state.activeTradeOffer.fromPlayerId &&
      !(state.config.enableCitiesAndKnights
        ? hasTradeGoodsForOfferPure(actor, state.activeTradeOffer)
        : hasResources(actor.resources, state.activeTradeOffer.want))
    ) {
      ctx.dispatch(actor.id, {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
      });
      return;
    }

    if (!ctx.model.autoRespondBotsToHuman || ctx.model.autoPlayBots) return;
    if (actor && actor.isBot) {
      const delayMs =
        room.gameId === "seven_wonders" &&
        state.phase === "AGE_DRAFT" &&
        state.players.some(
          (p: any) => !p.isBot && state.lockedPlayerIds.includes(p.id)
        )
          ? BOT_SEVEN_WONDERS_DRAFT_DELAY_MS
          : BOT_RESPONSE_DELAY_MS;
      ctx.botResponseTimeout = setTimeout(() => {
        ctx.stepOneBotMove();
      }, delayMs);
      return;
    }

    if (
      room.gameId === "catan" &&
      state.phase === "SPECIAL_BUILDING" &&
      actor &&
      !actor.isBot &&
      !room.allBots &&
      canControlPlayerOnDevicePure(ctx.model, room, actor.id)
    ) {
      const spLegal = CatanEngine.getLegalActions(state, actor.id);
      if (
        spLegal.length === 1 &&
        spLegal[0]?.type === "END_SPECIAL_BUILD"
      ) {
        ctx.botResponseTimeout = setTimeout(() => {
          ctx.dispatch(actor.id, { type: "END_SPECIAL_BUILD" });
        }, SPECIAL_BUILD_AUTO_END_DELAY_MS);
      }
    }
  };

  const startRoomMatch = (roomId: string): void => {
    ctx.stopAutoPlay();
    const room = ctx.model.rooms[roomId];
    if (!room) return;

    if (roomUsesServerPure(ctx.model, room)) {
      if (startingRoomIds.has(roomId)) return;
      startingRoomIds.add(roomId);
      const capturedEpoch = ctx.navEpoch;
      void (async () => {
        try {
          await ctx.flushPendingSetupSync();
          if (ctx.navEpoch !== capturedEpoch) return;
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(roomId)}/start`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requesterId: ctx.model.currentUserId }),
            }
          );
          if (ctx.navEpoch !== capturedEpoch) return;
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, roomId);
            return;
          }
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Cannot start match");
            return;
          }
          const upserted = upsertRoomFromSummaryPure(
            ctx.model,
            data.room,
            data.state,
            data.actingPlayerId
          );
          ctx.model = resetSubModesPure({
            ...upserted.model,
            activeRoomId: upserted.room.roomId,
            inspectingSetupDuringMatch: false,
            viewMode: "in_game",
          });
          ctx.connectServerRealtime();
          ctx.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: upserted.room.roomId,
            playerId: ctx.model.currentUserId,
          });
          ctx.render();
        } catch (err: any) {
          if (ctx.navEpoch !== capturedEpoch) return;
          alert(`Unable to start match: ${err?.message ?? String(err)}`);
        } finally {
          startingRoomIds.delete(roomId);
        }
      })();
      return;
    }

    const startedRes = startOfflineRoomMatchPure(ctx.model, roomId);
    ctx.model = { ...startedRes.model, inspectingSetupDuringMatch: false };
    if (!startedRes.started) return;
    ctx.render();
    scheduleBotAutoResponseIfNeeded();
  };

  const resetSubModes = (): void => {
    ctx.model = resetSubModesPure(ctx.model);
  };

  const dispatch = (playerId: string, action: any): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) return;
    if (roomUsesServerPure(ctx.model, room)) {
      ctx.connectServerRealtime();
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(room.roomId)}/action`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId,
                requesterId: ctx.model.currentUserId,
                action,
              }),
            }
          );
          if (res.status === 404) {
            evictDeletedActiveRoom(ctx, room.roomId);
            return;
          }
          const data = await res.json();
          if (!res.ok) {
            alert(`Action error: ${data.error ?? "Illegal action"}`);
            return;
          }
          ctx.model = resetSubModesPure(
            upsertRoomFromSummaryPure(
              ctx.model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model
          );
          ctx.render();
        } catch (err: any) {
          alert(`Action error: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    if (!room.session) return;
    try {
      const prevActorId = getActingPlayerIdPure(
        room.gameId,
        room.session.getState()
      );
      const result = room.session.dispatch(playerId, action);
      if (result.state.phase === "GAME_OVER") {
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          status: "finished",
        }));
      }
      ctx.model = resetSubModesPure(ctx.model);
      ctx.render();
      scheduleBotAutoResponseIfNeeded();
    } catch (err: any) {
      alert(`Action error: ${err?.message ?? String(err)}`);
    }
  };

  const dispatchUiAction = (playerId: string, action: any): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room || !canControlPlayerOnDevicePure(ctx.model, room, playerId)) {
      return;
    }
    const rawState = getRoomStatePure(ctx.model, room);
    if (rawState) {
      const actingId = roomUsesServerPure(ctx.model, room)
        ? room.remoteActingPlayerId ??
          getActingPlayerIdPure(room.gameId, rawState)
        : getActingPlayerIdPure(room.gameId, rawState);
      const isTradeProposerAction =
        room.gameId === "catan" &&
        rawState.activeTradeOffer?.fromPlayerId === playerId &&
        (action?.type === "CONFIRM_DOMESTIC_TRADE" ||
          action?.type === "CANCEL_DOMESTIC_TRADE");
      const isSimultaneousSevenWondersDraft =
        room.gameId === "seven_wonders" &&
        rawState.phase === "AGE_DRAFT" &&
        Array.isArray(rawState.lockedPlayerIds) &&
        !rawState.lockedPlayerIds.includes(playerId);
      const isSevenWondersUnselect =
        room.gameId === "seven_wonders" &&
        action?.type === "UNSELECT_DRAFT_ACTION" &&
        canPlayerUnselectDraftPick(rawState as SevenWondersState, playerId);
      if (
        playerId !== actingId &&
        !isTradeProposerAction &&
        !isSimultaneousSevenWondersDraft &&
        !isSevenWondersUnselect
      ) {
        return;
      }
    }
    dispatch(playerId, action);
  };

  const startInteractiveTutorial = (gameId: SupportedGameId): ClientRoom => {
    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    ctx.cancelPendingSetupSync();
    const prevRoom = findActiveRoomPure(ctx.model);
    if (prevRoom && roomUsesServerPure(ctx.model, prevRoom)) {
      ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
    }
    const res = startInteractiveTutorialPure(ctx.model, gameId, Date.now());
    ctx.model = res.model;
    ctx.render();
    scheduleBotAutoResponseIfNeeded();
    return ctx.getOrCreateRoomLens(res.roomId);
  };

  ctx.scheduleBotAutoResponseIfNeeded = scheduleBotAutoResponseIfNeeded;
  ctx.startRoomMatch = startRoomMatch;
  ctx.resetSubModes = resetSubModes;
  ctx.dispatch = dispatch;
  ctx.dispatchUiAction = dispatchUiAction;
  ctx.startInteractiveTutorial = startInteractiveTutorial;
}
