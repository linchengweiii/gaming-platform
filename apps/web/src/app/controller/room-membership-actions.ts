import { resolveClientRoomIdPure } from "../helpers/room-hash-and-links.ts";
import {
  getActiveRoomPure,
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

export function attachRoomMembershipActions(ctx: AppRuntimeContext): void {
  const enterOrJoinRoom = (rawRoomId: string): void => {
    ctx.stopAutoPlay();
    const roomId = resolveClientRoomIdPure(ctx.model, rawRoomId);
    const room = ctx.model.rooms[roomId];

    if (!room) {
      if (ctx.model.useServerBackend) {
        void (async () => {
          try {
            const getRes = await fetch(
              `/api/rooms/${encodeURIComponent(roomId)}?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
            );
            if (!getRes.ok) {
              clearActiveRoomIdFromStorage();
              ctx.syncUrlRoomHash(null);
              ctx.render();
              return;
            }
            const getData = await getRes.json();
            const fetchedStatus = getData.room?.status ?? "lobby";
            let latestRoom: ClientRoom;

            if (fetchedStatus === "lobby" || fetchedStatus === "finished") {
              const joinRes = await fetch(
                `/api/rooms/${encodeURIComponent(getData.room.roomId)}/join`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    playerId: ctx.model.currentUserId,
                    playerName: ctx.model.currentUserName,
                  }),
                }
              );
              const joinData = await joinRes.json();
              if (!joinRes.ok) {
                alert(joinData.error ?? "Unable to join room");
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
              viewMode:
                latestRoom.status === "in_progress" ? "in_game" : "room_setup",
            });
            ctx.render();
          } catch {
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
            const joinRes = await fetch(
              `/api/rooms/${encodeURIComponent(room.roomId)}/join`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerId: ctx.model.currentUserId,
                  playerName: ctx.model.currentUserName,
                }),
              }
            );
            const joinData = await joinRes.json();
            if (!joinRes.ok) {
              alert(joinData.error ?? "Unable to join room");
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
            const getRes = await fetch(
              `/api/rooms/${encodeURIComponent(room.roomId)}?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
            );
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
            viewMode:
              latestRoom.status === "in_progress" ? "in_game" : "room_setup",
          });
          ctx.render();
        } catch (err: any) {
          alert(`Unable to enter room: ${err?.message ?? String(err)}`);
        }
      })();
      return;
    }

    ctx.model = enterOfflineRoomPure(ctx.model, room.roomId);
    ctx.render();
  };

  const leaveActiveRoom = (): void => {
    const room = getActiveRoomPure(ctx.model);
    if (!room) return;
    ctx.stopAutoPlay();
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);

    if (roomUsesServerPure(ctx.model, room)) {
      void (async () => {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(room.roomId)}/leave`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ playerId: ctx.model.currentUserId }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.closed) {
              ctx.model = removeRoomFromModelPure(ctx.model, room.roomId);
              ctx.roomLensCache.delete(room.roomId);
            }
          }
        } catch {
          // Ignore network errors
        }
        ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
        ctx.model = resetSubModesPure({ ...ctx.model, viewMode: "lobby" });
        await ctx.fetchLobbyRooms();
        ctx.render();
      })();
      return;
    }

    ctx.model = leaveOfflineRoomPure(ctx.model, room.roomId);
    ctx.render();
  };

  ctx.enterOrJoinRoom = enterOrJoinRoom;
  ctx.leaveActiveRoom = leaveActiveRoom;
}
