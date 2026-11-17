import { USER_PROFILES } from "../../config/app-config.ts";
import {
  roomUsesServerPure,
  upsertDeviceGuestListPure,
} from "../helpers/room-queries.ts";
import { upsertRoomFromSummaryPure } from "../reducers/room-sync-reducers.ts";
import { resolveGuestSignInPure } from "../reducers/session-init-and-signin.ts";
import {
  renameGuestInModelPure,
  signOutGuestFromModelPure,
} from "../reducers/session-signout-and-match.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { GuestSession } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
  clearGuestSessionFromStorage,
  saveActiveRoomIdToStorage,
  saveDeviceGuestsToStorage,
  saveGuestSessionToStorage,
} from "./context.ts";

export function attachGuestProfileActions(ctx: AppRuntimeContext): void {
  const signInAsGuest = (
    rawName?: string,
    existingGuestId?: string
  ): boolean => {
    const inviteBeforeSignIn = ctx.model.pendingInviteRoomId;
    const res = resolveGuestSignInPure(
      ctx.model,
      rawName,
      Math.random().toString(36).slice(2, 8),
      Date.now(),
      existingGuestId
    );
    ctx.model = res.model;
    if (!res.ok) {
      ctx.render();
      return false;
    }

    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (inviteBeforeSignIn) {
      ctx.model = { ...ctx.model, pendingInviteRoomId: null };
      ctx.pendingRestoreRoomId = null;
      if (ctx.model.useServerBackend) {
        void ctx.fetchLobbyRooms();
      }
      ctx.enterOrJoinRoom(inviteBeforeSignIn);
      return true;
    }

    ctx.render();

    if (ctx.model.useServerBackend) {
      void ctx.fetchLobbyRooms();
    }
    return true;
  };

  const startSoloGameFromLogin = (rawName?: string): boolean => {
    const fallbackName =
      (rawName ?? ctx.model.loginDraftName).trim() || "Player 1";
    ctx.model = { ...ctx.model, pendingInviteRoomId: null };
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    ctx.model = { ...ctx.model, createRoomMode: "offline" };
    const room = ctx.createLocalRoom({
      gameId: ctx.model.createRoomGameId,
      ownerId: ctx.model.currentUserId,
      ownerName: ctx.model.currentUserName,
      isOfflineLocal: true,
      botCount: 3,
      startingPlayerMode: "random",
      autoStart: false,
    });
    ctx.model = resetSubModesPure({
      ...ctx.model,
      activeRoomId: room.roomId,
      viewMode: "room_setup",
    });
    ctx.render();
    return true;
  };

  const startOfflineLocalFromLogin = (rawName?: string): boolean => {
    const fallbackName =
      (rawName ?? ctx.model.loginDraftName).trim() || "Player 1";
    ctx.model = { ...ctx.model, pendingInviteRoomId: null };
    const ok = signInAsGuest(fallbackName);
    if (!ok) return false;
    ctx.model = { ...ctx.model, createRoomMode: "offline" };
    const room = ctx.createLocalRoom({
      gameId: ctx.model.createRoomGameId,
      ownerId: ctx.model.currentUserId,
      ownerName: ctx.model.currentUserName,
      isOfflineLocal: true,
      botCount: 0,
      startingPlayerMode: "random",
      autoStart: false,
    });
    ctx.model = resetSubModesPure({
      ...ctx.model,
      activeRoomId: room.roomId,
      viewMode: "room_setup",
    });
    ctx.render();
    return true;
  };

  const openAddGuestView = (): void => {
    ctx.stopAutoPlay();
    ctx.model = {
      ...ctx.model,
      returnViewAfterAddGuest:
        ctx.model.viewMode === "login" ? "lobby" : ctx.model.viewMode,
      addingAdditionalGuest: true,
      loginErrorMsg: "",
      loginDraftName: `Guest ${ctx.model.deviceGuests.length + 1}`,
      viewMode: "login",
    };
    ctx.render();
  };

  const switchActiveGuest = (guestId: string): void => {
    const found =
      ctx.model.deviceGuests.find((g) => g.id === guestId) ??
      USER_PROFILES.find((u) => u.id === guestId);
    if (!found) return;

    const session: GuestSession = {
      id: found.id,
      name: found.name,
      mode: "guest",
    };
    ctx.model = {
      ...ctx.model,
      currentUserId: found.id,
      currentUserName: found.name,
      deviceGuests: upsertDeviceGuestListPure(ctx.model.deviceGuests, session),
    };
    saveGuestSessionToStorage(session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    const active = ctx.model.rooms[ctx.model.activeRoomId];
    if (
      active &&
      roomUsesServerPure(ctx.model, active) &&
      (ctx.model.viewMode === "room_setup" || ctx.model.viewMode === "in_game")
    ) {
      ctx.sendWsMessage({
        type: "SUBSCRIBE_ROOM",
        roomId: active.roomId,
        playerId: ctx.model.currentUserId,
      });
      void fetch(
        `/api/rooms/${encodeURIComponent(active.roomId)}?playerId=${encodeURIComponent(ctx.model.currentUserId)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.room) {
            ctx.model = upsertRoomFromSummaryPure(
              ctx.model,
              data.room,
              data.state,
              data.actingPlayerId
            ).model;
            ctx.render();
          }
        })
        .catch(() => {});
    }

    ctx.render();
  };

  const performGuestCleanup = (targetGuestId: string): void => {
    if (!targetGuestId) return;
    const isSigningOutCurrent = targetGuestId === ctx.model.currentUserId;
    if (isSigningOutCurrent) {
      ctx.stopAutoPlay();
      ctx.pendingRestoreRoomId = null;
    }

    if (ctx.model.useServerBackend) {
      void fetch("/api/guests/signout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: targetGuestId }),
      })
        .then(() => {
          if (ctx.model.isAuthenticated && ctx.model.useServerBackend) {
            return ctx.fetchLobbyRooms();
          }
        })
        .catch(() => {});

      if (isSigningOutCurrent) {
        ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
      }
    }

    const cleaned = signOutGuestFromModelPure(
      ctx.model,
      targetGuestId,
      100 + Math.floor(Math.random() * 900)
    );
    ctx.model = cleaned.model;
    cleaned.removedRoomIds.forEach((id) => ctx.roomLensCache.delete(id));
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (cleaned.switchedToGuest) {
      saveGuestSessionToStorage(cleaned.switchedToGuest);
      if (
        (ctx.model.viewMode === "room_setup" ||
          ctx.model.viewMode === "in_game") &&
        ctx.model.activeRoomId
      ) {
        saveActiveRoomIdToStorage(ctx.model.activeRoomId);
        const active = ctx.model.rooms[ctx.model.activeRoomId];
        if (active && roomUsesServerPure(ctx.model, active)) {
          ctx.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: active.roomId,
            playerId: ctx.model.currentUserId,
          });
        }
      } else {
        clearActiveRoomIdFromStorage();
      }
    } else if (isSigningOutCurrent) {
      clearGuestSessionFromStorage();
      clearActiveRoomIdFromStorage();
    }

    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
  };

  const signOutGuest = (): void => {
    performGuestCleanup(ctx.model.currentUserId);
  };

  const removeDeviceGuest = (guestId: string): void => {
    performGuestCleanup(guestId);
  };

  const renameCurrentGuest = (rawNewName: string): boolean => {
    const res = renameGuestInModelPure(
      ctx.model,
      ctx.model.currentUserId,
      rawNewName
    );
    if (!res.ok) {
      return false;
    }
    ctx.model = res.model;
    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (ctx.model.useServerBackend) {
      void fetch("/api/guests/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: res.session.id,
          newName: res.session.name,
        }),
      }).catch(() => {});
    }

    ctx.render();
    return true;
  };

  ctx.signInAsGuest = signInAsGuest;
  ctx.startSoloGameFromLogin = startSoloGameFromLogin;
  ctx.startOfflineLocalFromLogin = startOfflineLocalFromLogin;
  ctx.openAddGuestView = openAddGuestView;
  ctx.switchActiveGuest = switchActiveGuest;
  ctx.signOutGuest = signOutGuest;
  ctx.removeDeviceGuest = removeDeviceGuest;
  ctx.renameCurrentGuest = renameCurrentGuest;
}
