import { t } from "../../i18n/index.ts";
import {
  findActiveRoomPure,
  getActiveRoomPure,
  getRoomBoundsPure,
  rebuildRoomSeatsPure,
  roomUsesServerPure,
  setRoomInModelPure,
} from "../helpers/room-queries.ts";
import {
  createLocalRoomPure,
  upsertRoomFromSummaryPure,
} from "../reducers/room-sync-reducers.ts";
import {
  addOfflineLocalFriendPure,
  removeOfflinePlayerPure,
} from "../reducers/session-init-and-signin.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { ClientRoom, CreateLocalRoomOptions } from "../types.ts";
import {
  type AppRuntimeContext,
  saveActiveRoomIdToStorage,
} from "./context.ts";
import { attachGuestProfileActions } from "./guest-actions.ts";
import { attachRoomMembershipActions } from "./room-membership-actions.ts";

export function attachGuestAndLobbyActions(ctx: AppRuntimeContext): void {
  attachGuestProfileActions(ctx);
  attachRoomMembershipActions(ctx);

  const createLocalRoom = (opts: CreateLocalRoomOptions): ClientRoom => {
    const created = createLocalRoomPure(ctx.model, opts, Date.now());
    ctx.model = created.model;
    if (opts.autoStart) ctx.startRoomMatch(created.room.roomId);
    return ctx.getOrCreateRoomLens(created.room.roomId);
  };

  const getActiveRoom = (): ClientRoom => {
    const active = findActiveRoomPure(ctx.model) ?? getActiveRoomPure(ctx.model);
    return active ? ctx.getOrCreateRoomLens(active.roomId) : ({} as ClientRoom);
  };

  const rebuildRoomSeats = (roomLike: ClientRoom): void => {
    const target = ctx.model.rooms[roomLike.roomId] ?? roomLike;
    ctx.model = setRoomInModelPure(ctx.model, rebuildRoomSeatsPure(target));
  };

  const postRoomPlayerMutation = (
    roomId: string,
    endpoint: string,
    body: Record<string, unknown>,
    opts: {
      readonly fallbackErrorKey: "alert.unableAddLocalPlayer" | "alert.unableRemovePlayer";
      readonly reasonErrorKey:
        | "alert.unableAddLocalPlayerWithReason"
        | "alert.unableRemovePlayerWithReason";
      readonly clearDraftName?: boolean;
    }
  ): void => {
    void (async () => {
      try {
        const res = await ctx.fetchApi(
          `/api/rooms/${encodeURIComponent(roomId)}/${endpoint}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const data = await res.json();
        if (!res.ok) {
          alert(data.error ?? t(ctx.model.locale, opts.fallbackErrorKey));
          return;
        }
        const base = opts.clearDraftName
          ? { ...ctx.model, localFriendDraftName: "" }
          : ctx.model;
        ctx.model = upsertRoomFromSummaryPure(base, data.room).model;
        ctx.render();
      } catch (err: any) {
        alert(
          t(ctx.model.locale, opts.reasonErrorKey, {
            reason: err?.message ?? String(err),
          })
        );
      }
    })();
  };

  const addLocalFriendToRoom = (room: ClientRoom, rawName: string): void => {
    const liveRoom = ctx.model.rooms[room.roomId] ?? room;
    const cleanName =
      rawName.trim() || `Player ${liveRoom.humanPlayers.length + 1}`;
    if (liveRoom.humanPlayers.length >= getRoomBoundsPure(liveRoom).maxPlayers) {
      return;
    }
    if (roomUsesServerPure(ctx.model, liveRoom)) {
      postRoomPlayerMutation(
        liveRoom.roomId,
        "local-players",
        {
          requesterId: ctx.model.currentUserId,
          playerName: cleanName.slice(0, 28),
        },
        {
          fallbackErrorKey: "alert.unableAddLocalPlayer",
          reasonErrorKey: "alert.unableAddLocalPlayerWithReason",
          clearDraftName: true,
        }
      );
      return;
    }
    ctx.model = addOfflineLocalFriendPure(
      ctx.model,
      liveRoom.roomId,
      rawName,
      Math.random().toString(36).slice(2, 7)
    );
    ctx.render();
  };

  const removePlayerFromRoom = (
    room: ClientRoom,
    targetPlayerId: string
  ): void => {
    const liveRoom = ctx.model.rooms[room.roomId] ?? room;
    if (targetPlayerId === liveRoom.ownerId) return;
    if (roomUsesServerPure(ctx.model, liveRoom)) {
      postRoomPlayerMutation(
        liveRoom.roomId,
        "remove-player",
        { requesterId: ctx.model.currentUserId, targetPlayerId },
        {
          fallbackErrorKey: "alert.unableRemovePlayer",
          reasonErrorKey: "alert.unableRemovePlayerWithReason",
        }
      );
      return;
    }
    ctx.model = removeOfflinePlayerPure(
      ctx.model,
      liveRoom.roomId,
      targetPlayerId
    );
    ctx.render();
  };

  const createAndOpenRoom = (): void => {
    if (ctx.createRoomInFlight) return;
    const selectedGameId =
      ctx.model.lobbyGameFilter || ctx.model.createRoomGameId;
    const explicitName = ctx.model.createRoomName.trim();

    const openLocalFallbackRoom = (): void => {
      const localRoom = createLocalRoom({
        ...(explicitName ? { name: explicitName } : {}),
        gameId: selectedGameId,
        ownerId: ctx.model.currentUserId,
        ownerName: ctx.model.currentUserName,
        isOfflineLocal: true,
        botCount: 0,
        startingPlayerMode: "random",
        autoStart: false,
      });
      ctx.model = resetSubModesPure({
        ...ctx.model,
        lobbyGameFilter: localRoom.gameId,
        createRoomGameId: localRoom.gameId,
        activeRoomId: localRoom.roomId,
        inspectingSetupDuringMatch: false,
        viewMode: "room_setup",
      });
      ctx.render();
    };

    if (
      ctx.model.createRoomMode === "offline" ||
      !ctx.model.useServerBackend ||
      !ctx.model.serverReachable
    ) {
      openLocalFallbackRoom();
      return;
    }

    ctx.createRoomInFlight = true;
    ctx.navEpoch += 1;
    const capturedEpoch = ctx.navEpoch;
    void (async () => {
      try {
        const res = await ctx.fetchApi("/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(explicitName ? { name: explicitName } : {}),
            gameId: selectedGameId,
            ownerId: ctx.model.currentUserId,
            hostName: ctx.model.currentUserName,
            botCount: 0,
            botStepDelayMs: ctx.model.botMoveThrottleMs,
            startingPlayerMode: "random",
            autoStart: false,
          }),
        });
        if (ctx.navEpoch !== capturedEpoch) return;
        const data = await res.json();
        if (!res.ok) {
          alert(data.error ?? t(ctx.model.locale, "alert.unableCreateRoom"));
          return;
        }
        const upserted = upsertRoomFromSummaryPure(
          ctx.model,
          data.room,
          data.state,
          data.actingPlayerId
        );
        const created = upserted.room;
        saveActiveRoomIdToStorage(created.roomId);
        ctx.syncUrlRoomHash(created.roomId);
        ctx.model = resetSubModesPure({
          ...upserted.model,
          lobbyGameFilter: created.gameId,
          createRoomGameId: created.gameId,
          activeRoomId: created.roomId,
          inspectingSetupDuringMatch: false,
          viewMode: created.status === "in_progress" ? "in_game" : "room_setup",
        });
        ctx.connectServerRealtime();
        ctx.sendWsMessage({
          type: "SUBSCRIBE_ROOM",
          roomId: created.roomId,
          playerId: ctx.model.currentUserId,
        });
        ctx.render();
      } catch {
        if (ctx.navEpoch !== capturedEpoch) return;
        ctx.model = {
          ...ctx.model,
          serverReachable: false,
          createRoomMode: "offline",
        };
        ctx.scheduleWsReconnect();
        openLocalFallbackRoom();
      } finally {
        ctx.createRoomInFlight = false;
      }
    })();
  };

  Object.assign(ctx, {
    createLocalRoom,
    getActiveRoom,
    rebuildRoomSeats,
    addLocalFriendToRoom,
    removePlayerFromRoom,
    createAndOpenRoom,
  });
}
