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
    if (opts.autoStart) {
      ctx.startRoomMatch(created.room.roomId);
    }
    return ctx.getOrCreateRoomLens(created.room.roomId);
  };

  const getActiveRoom = (): ClientRoom => {
    const active = findActiveRoomPure(ctx.model) ?? getActiveRoomPure(ctx.model);
    return active ? ctx.getOrCreateRoomLens(active.roomId) : ({} as ClientRoom);
  };

  const rebuildRoomSeats = (roomLike: ClientRoom): void => {
    const target = ctx.model.rooms[roomLike.roomId] ?? roomLike;
    const rebuilt = rebuildRoomSeatsPure(target);
    ctx.model = setRoomInModelPure(ctx.model, rebuilt);
  };

  const addLocalFriendToRoom = (room: ClientRoom, rawName: string): void => {
    const liveRoom = ctx.model.rooms[room.roomId] ?? room;
    const cleanName =
      rawName.trim() || `Player ${liveRoom.humanPlayers.length + 1}`;
    const bounds = getRoomBoundsPure(liveRoom);
    if (liveRoom.humanPlayers.length >= bounds.maxPlayers) return;

    if (roomUsesServerPure(ctx.model, liveRoom)) {
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(liveRoom.roomId)}/local-players`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: ctx.model.currentUserId,
                playerName: cleanName.slice(0, 28),
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to add local player");
            return;
          }
          ctx.model = upsertRoomFromSummaryPure(
            { ...ctx.model, localFriendDraftName: "" },
            data.room
          ).model;
          ctx.render();
        } catch (err: any) {
          alert(`Unable to add local player: ${err?.message ?? String(err)}`);
        }
      })();
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
      void (async () => {
        try {
          const res = await ctx.fetchApi(
            `/api/rooms/${encodeURIComponent(liveRoom.roomId)}/remove-player`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requesterId: ctx.model.currentUserId,
                targetPlayerId,
              }),
            }
          );
          const data = await res.json();
          if (!res.ok) {
            alert(data.error ?? "Unable to remove player");
            return;
          }
          ctx.model = upsertRoomFromSummaryPure(ctx.model, data.room).model;
          ctx.render();
        } catch (err: any) {
          alert(`Unable to remove player: ${err?.message ?? String(err)}`);
        }
      })();
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

    const openAsOfflineLocal =
      ctx.model.createRoomMode === "offline" ||
      !ctx.model.useServerBackend ||
      !ctx.model.serverReachable;

    if (!openAsOfflineLocal) {
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
            alert(data.error ?? "Unable to create room");
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
            viewMode:
              created.status === "in_progress" ? "in_game" : "room_setup",
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
          const fallbackRoom = createLocalRoom({
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
            lobbyGameFilter: fallbackRoom.gameId,
            createRoomGameId: fallbackRoom.gameId,
            activeRoomId: fallbackRoom.roomId,
            inspectingSetupDuringMatch: false,
            viewMode: "room_setup",
          });
          ctx.render();
        } finally {
          ctx.createRoomInFlight = false;
        }
      })();
      return;
    }

    const room = createLocalRoom({
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
      lobbyGameFilter: room.gameId,
      createRoomGameId: room.gameId,
      activeRoomId: room.roomId,
      inspectingSetupDuringMatch: false,
      viewMode: "room_setup",
    });
    ctx.render();
  };

  ctx.createLocalRoom = createLocalRoom;
  ctx.getActiveRoom = getActiveRoom;
  ctx.rebuildRoomSeats = rebuildRoomSeats;
  ctx.addLocalFriendToRoom = addLocalFriendToRoom;
  ctx.removePlayerFromRoom = removePlayerFromRoom;
  ctx.createAndOpenRoom = createAndOpenRoom;
}
