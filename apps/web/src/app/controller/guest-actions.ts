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
  clearLastActiveGuestIdFromStorage,
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

    ctx.navEpoch += 1;
    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (ctx.model.useServerBackend) {
      ctx.connectServerRealtime();
      ctx.sendWsMessage({ type: "IDENTIFY_PLAYER", playerId: res.session.id });
    }

    if (inviteBeforeSignIn) {
      ctx.model = { ...ctx.model, pendingInviteRoomId: null };
      ctx.pendingRestoreRoomId = null;
      ctx.render();
      if (ctx.model.useServerBackend) void ctx.fetchLobbyRooms();
      ctx.enterOrJoinRoom(inviteBeforeSignIn);
      return true;
    }

    ctx.render();
    if (ctx.model.useServerBackend) void ctx.fetchLobbyRooms();
    return true;
  };

  const startOfflineRoomFromLogin = (
    rawName: string | undefined,
    botCount: number
  ): boolean => {
    const fallbackName =
      (rawName ?? ctx.model.loginDraftName).trim() || "Player 1";
    ctx.model = { ...ctx.model, pendingInviteRoomId: null };
    if (!signInAsGuest(fallbackName)) return false;
    ctx.model = { ...ctx.model, createRoomMode: "offline" };
    const room = ctx.createLocalRoom({
      gameId: ctx.model.createRoomGameId,
      ownerId: ctx.model.currentUserId,
      ownerName: ctx.model.currentUserName,
      isOfflineLocal: true,
      botCount,
      startingPlayerMode: "random",
      autoStart: false,
    });
    ctx.model = resetSubModesPure({
      ...ctx.model,
      activeRoomId: room.roomId,
      inspectingSetupDuringMatch: false,
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

    ctx.navEpoch += 1;
    const capturedEpoch = ctx.navEpoch;
    const requestedGuestId = found.id;
    const session: GuestSession = { id: found.id, name: found.name, mode: "guest" };

    ctx.model = resetSubModesPure({
      ...ctx.model,
      currentUserId: found.id,
      currentUserName: found.name,
      editingGuestName: false,
      guestRenameDraft: "",
      deviceGuests: upsertDeviceGuestListPure(ctx.model.deviceGuests, session),
    });
    saveGuestSessionToStorage(session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (ctx.model.useServerBackend) {
      ctx.connectServerRealtime();
      ctx.sendWsMessage({ type: "IDENTIFY_PLAYER", playerId: requestedGuestId });
    }

    const active = ctx.model.rooms[ctx.model.activeRoomId];
    if (
      active &&
      roomUsesServerPure(ctx.model, active) &&
      (ctx.model.viewMode === "room_setup" || ctx.model.viewMode === "in_game")
    ) {
      const targetRoomId = active.roomId;
      ctx.sendWsMessage({
        type: "SUBSCRIBE_ROOM",
        roomId: targetRoomId,
        playerId: requestedGuestId,
      });
      void ctx
        .fetchApi(`/api/rooms/${encodeURIComponent(targetRoomId)}`, undefined, {
          guestId: requestedGuestId,
        })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (
            !data?.room ||
            ctx.navEpoch !== capturedEpoch ||
            ctx.model.currentUserId !== requestedGuestId
          ) {
            return;
          }
          ctx.model = upsertRoomFromSummaryPure(
            ctx.model,
            data.room,
            data.state,
            data.actingPlayerId
          ).model;
          ctx.render();
        })
        .catch(() => {});
    } else if (ctx.model.useServerBackend && ctx.model.viewMode === "lobby") {
      void ctx.fetchLobbyRooms();
    }

    ctx.render();
  };

  const performGuestCleanup = (targetGuestId: string): void => {
    if (!targetGuestId) return;
    const tokenForTarget = ctx.getGuestToken(targetGuestId);
    const isSigningOutCurrent = targetGuestId === ctx.model.currentUserId;
    if (isSigningOutCurrent) {
      ctx.navEpoch += 1;
      ctx.stopAutoPlay();
      ctx.cancelPendingSetupSync();
      ctx.pendingRestoreRoomId = null;
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
      const inRoomView =
        (ctx.model.viewMode === "room_setup" || ctx.model.viewMode === "in_game") &&
        Boolean(ctx.model.activeRoomId);
      if (inRoomView) {
        saveActiveRoomIdToStorage(ctx.model.activeRoomId);
        const active = ctx.model.rooms[ctx.model.activeRoomId];
        if (active && roomUsesServerPure(ctx.model, active)) {
          ctx.sendWsMessage({
            type: "IDENTIFY_PLAYER",
            playerId: ctx.model.currentUserId,
          });
          ctx.sendWsMessage({
            type: "SUBSCRIBE_ROOM",
            roomId: active.roomId,
            playerId: ctx.model.currentUserId,
          });
        }
      } else {
        clearActiveRoomIdFromStorage();
        ctx.syncUrlRoomHash(null);
        if (ctx.model.useServerBackend) {
          ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
          ctx.sendWsMessage({
            type: "IDENTIFY_PLAYER",
            playerId: ctx.model.currentUserId,
          });
        }
      }
    } else if (isSigningOutCurrent) {
      clearGuestSessionFromStorage();
      clearActiveRoomIdFromStorage();
      if (ctx.model.deviceGuests.length === 0) {
        clearLastActiveGuestIdFromStorage();
      }
      ctx.syncUrlRoomHash(null);
      if (ctx.model.useServerBackend) {
        ctx.sendWsMessage({ type: "UNSUBSCRIBE_ROOM" });
        ctx.sendWsMessage({ type: "IDENTIFY_PLAYER", playerId: null });
      }
    }

    if (ctx.model.useServerBackend && tokenForTarget) {
      void ctx
        .fetchApi(
          "/api/guests/signout",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: targetGuestId }),
          },
          { explicitToken: tokenForTarget }
        )
        .then(() => {
          if (ctx.model.isAuthenticated && ctx.model.useServerBackend) {
            return ctx.fetchLobbyRooms();
          }
        })
        .catch(() => {});
    }

    ctx.render();
    ctx.scheduleBotAutoResponseIfNeeded();
  };

  const renameCurrentGuest = (rawNewName: string): boolean => {
    const res = renameGuestInModelPure(
      ctx.model,
      ctx.model.currentUserId,
      rawNewName
    );
    if (!res.ok) return false;
    ctx.model = res.model;
    saveGuestSessionToStorage(res.session);
    saveDeviceGuestsToStorage(ctx.model.deviceGuests);

    if (ctx.model.useServerBackend) {
      void ctx
        .fetchApi(
          "/api/guests/rename",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: res.session.id,
              newName: res.session.name,
            }),
          },
          { guestId: res.session.id }
        )
        .catch(() => {});
    }

    ctx.render();
    return true;
  };

  Object.assign(ctx, {
    signInAsGuest,
    startSoloGameFromLogin: (rawName?: string) =>
      startOfflineRoomFromLogin(rawName, 3),
    startOfflineLocalFromLogin: (rawName?: string) =>
      startOfflineRoomFromLogin(rawName, 0),
    openAddGuestView,
    switchActiveGuest,
    signOutGuest: () => performGuestCleanup(ctx.model.currentUserId),
    removeDeviceGuest: performGuestCleanup,
    renameCurrentGuest,
  });
}
