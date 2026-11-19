import { resolveClientRoomIdPure } from "../helpers/room-hash-and-links.ts";
import {
  findActiveRoomPure,
  removeRoomFromModelPure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import { upsertRoomFromSummaryPure } from "../reducers/room-sync-reducers.ts";
import {
  enterOfflineRoomPure,
  leaveOfflineRoomPure,
} from "../reducers/session-init-and-signin.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { ClientRoom } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
  saveActiveRoomIdToStorage,
} from "./context.ts";
import { fetchWithTimeout } from "./http-fetch-helper.ts";
import { evictDeletedActiveRoom } from "./realtime-ws.ts";

export function attachRoomMembershipActions(ctx: AppRuntimeContext): void {
  const enterOrJoinRoom = (rawRoomId: string): void => {
    ctx.navEpoch += 1;
    const capturedEpoch = ctx.navEpoch;
    const requestedPlayerId = ctx.model.currentUserId;
    ctx.stopAutoPlay();
    ctx.cancelPendingSetupSync();
    const roomId = resolveClientRoomIdPure(ctx.model, rawRoomId);
    const room = ctx.model.rooms[roomId];

    if (!room) {
      if (ctx.model.useServerBackend) {
        void (async () => {
          try {
            const getRes = await fetchWithTimeout(
              `/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(requestedPlayerId)}`
            );
            if (ctx.navEpoch !== capturedEpoch) return;
            if (!getRes.ok) {
              clearActiveRoomIdFromStorage();
              ctx.syncUrlRoomHash(null);
              ctx.render();
              return;
            }
            const getData = await getRes.json();
            if (ctx.navEpoch !== capturedEpoch) return;
            const fetchedStatus = getData.room?.status ?? "lobby";
            let latestRoom: ClientRoom;

            if (fetchedStatus === "lobby" || fetchedStatus === "finished") {
              const joinRes = await fetchWithTimeout(
                `/api/rooms/${encodeURIComponent(getData.room.roomId)}/join`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    playerId: requestedPlayerId,
                    playerName: ctx.model.currentUserName,
                  }),
                }
              );
              const joinData = await joinRes.json();
              if (ctx.navEpoch !== capturedEpoch) return;
              if (!joinRes.ok) {
                alert(joinData.error ?? "Unable to join room");
                clearActiveRoomIdFromStorage();
                ctx.syncUrlRoomHash(null);
                ctx.render();
                return;
              }
              const upserted = upsertRoomFromSummaryPure(
                ctx.model,
                joinData.room,
                joinData.state,
                joinData.actingPlayerId
              );
              ctx.model = upserted.model;
              latestRoom = upserted.room;
            } else {
              const upserted = upsertRoomFromSummaryPure(
                ctx.model,
                getData.room,
                getData.state,
                getData.actingPlayerId
              );
              ctx.model = upserted.model;
              latestRoom = upserted.room;
            }

            ctx.connectServerRealtime();
            saveActiveRoomIdToStorage(latestRoom.roomId);
            ctx.syncUrlRoomHash(latestRoom.roomId);
            ctx.sendWsMessage({
              type: "SUBSCRIBE_ROOM",
              roomId: latestRoom.roomId,
              playerId: ctx.model.currentUserId,
            });
            ctx.model = resetSubModesPure({
              ...ctx.model,
              lobbyGameFilter: latestRoom.gameId,
              createRoomGameId: latestRoom.gameId,
              activeRoomId: latestRoom.roomId,
              inspectingSetupDuringMatch: false,
              viewMode:
                latestRoom.status === "in_progress" ? "in_game" : "room_setup",
            });
            ctx.render();
          } catch {
            if (ctx.navEpoch !== capturedEpoch) return;
            ctx.syncUrlRoomHash(null);
            ctx.render();
          }
        })();
      }
      return;
    }

    ctx.model = {
      ...ctx.model,
      lobbyGameFilter: room.gameId,
      createRoomGameId: room.gameId,
      activeRoomId: room.roomId,
      inspectingSetupDuringMatch: false,
    };
    saveActiveRoomIdToStorage(room.roomId);
    if (!room.isOfflineLocal) {
      ctx.syncUrlRoomHash(room.roomId);
    }

    if (roomUsesServerPure(ctx.model, room)) {
      void (async () => {
        try {
          let latestRoom = room;
          if (room.status === "lobby" || room.status === "finished") {
            const joinRes = await fetchWithTimeout(
              `/api/rooms/${encodeURIComponent(room.roomId)}/join`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerId: requestedPlayerId,
                  playerName: ctx.model.currentUserName,
                }),
              }
            );
            if (ctx.navEpoch !== capturedEpoch) return;
            if (joinRes.status === 404) {
              evictDeletedActiveRoom(ctx, room.roomId);
              return;
            }
            const joinData = await joinRes.json();
            if (!joinRes.ok) {
              alert(joinData.error ?? "Unable to join room");
              ctx.exitRoomToLobby();
              ctx.render();
              return;
            }
            const upserted = upsertRoomFromSummaryPure(
              ctx.model,
              joinData.room,
              joinData.state,
              joinData.actingPlayerId
            );
            ctx.model = upserted.model;
            latestRoom = upserted.room;
          } else {
            const getRes = await fetchWithTimeout(
              `/api/rooms/${encodeURIComponent(room.roomId)}?playerId=${encodeURIComponent(requestedPlayerId)}`
            );
            if (ctx.navEpoch !== capturedEpoch) return;
            if (getRes.status === 404) {
              evictDeletedActiveRoom(ctx, room.roomId);
              return;
            }
            if (getRes.ok) {
              const getData = await getRes.json();
              const upserted = upsertRoomFromSummaryPure(
                ctx.model,
                getData.room,
                getData.state,
                getData.actingPlayerId
              );
              ctx.model = upserted.model;
              latestRoom = upserted.room;
            }
          }

          if (ctx.navEpoch !== capturedEpoch) return;
          ctx.connectServerRealtime();
          ctx.syncUrlRoomHash(latestRoom.roomId);
          ctx.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: latestRoom.roomId,
            playerId: ctx.model.currentUserId,
          });
          ctx.model = resetSubModesPure({
            ...ctx.model,
            lobbyGameFilter: latestRoom.gameId,
            createRoomGameId: latestRoom.gameId,
            activeRoomId: latestRoom.roomId,
            inspectingSetupDuringMatch: false,
            viewMode:
              latestRoom.status === "in_progress" ? "in_game" : "room_setup",
          });
          ctx.render();
        } catch (err: any) {
          if (ctx.navEpoch !== capturedEpoch) return;
          alert(`Unable to enter room: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    ctx.model = enterOfflineRoomPure(ctx.model, room.roomId);
    ctx.render();
  };

  const leaveActiveRoom = (): void => {
    const room = findActiveRoomPure(ctx.model);
    if (!room) {
      ctx.exitRoomToLobby();
      ctx.render();
      return;
    }
    const leavingRoomId = room.roomId;
    const leavingPlayerId = ctx.model.currentUserId;

    if (roomUsesServerPure(ctx.model, room)) {
      ctx.exitRoomToLobby();
      const capturedEpoch = ctx.navEpoch;
      ctx.render();
      void (async () => {
        try {
          const res = await fetchWithTimeout(
            `/api/rooms/${encodeURIComponent(leavingRoomId)}/leave`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: leavingPlayerId }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.closed) {
              ctx.model = removeRoomFromModelPure(ctx.model, leavingRoomId);
              ctx.roomLensCache.delete(leavingRoomId);
            }
          }
        } catch {
          // Ignore network errors
        }
        if (ctx.navEpoch === capturedEpoch) {
          await ctx.fetchLobbyRooms();
          if (ctx.navEpoch === capturedEpoch && ctx.model.viewMode === "lobby") {
            ctx.renderPreservingFocus();
          }
        }
      })();
      return;
    }

    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);
    ctx.model = leaveOfflineRoomPure(ctx.model, leavingRoomId);
    ctx.render();
  };

  ctx.enterOrJoinRoom = enterOrJoinRoom;
  ctx.leaveActiveRoom = leaveActiveRoom;
}
