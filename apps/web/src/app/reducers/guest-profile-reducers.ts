import {
  type PlayerDescriptor,
  createMatchSession,
} from "@gaming-platform/core";
import {
  getEngineForGamePure,
  rebuildRoomSeatsPure,
  removeRoomFromModelPure,
  setRoomInModelPure,
  upsertDeviceGuestListPure,
} from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom, GuestSession } from "../types.ts";
import { DEFAULT_CATAN_MAP_VIEWPORT } from "../../catan-graphics/viewport.ts";
import { resetSubModesPure } from "./trade-and-draft-reducers.ts";

function mapRoomSessionSnapshots(
  room: ClientRoom,
  mapper: (snap: any) => any
): ClientRoom["session"] {
  if (!room.session) return null;
  return room.session.cloneWithMappedSnapshots
    ? room.session.cloneWithMappedSnapshots(mapper)
    : createMatchSession(
        getEngineForGamePure(room.gameId),
        mapper(room.session.getState()),
        true
      );
}

export function signOutGuestFromModelPure(
  model: Readonly<AppModel>,
  targetGuestId: string,
  fallbackDraftSuffix: number
): {
  readonly model: AppModel;
  readonly removedRoomIds: readonly string[];
  readonly switchedToGuest: GuestSession | null;
} {
  if (!targetGuestId) {
    return { model, removedRoomIds: [], switchedToGuest: null };
  }

  const remainingDeviceGuests = model.deviceGuests.filter(
    (g) => g.id !== targetGuestId
  );
  const toBotName = (name: string): string =>
    name.endsWith(" (Bot)") ? name : `${name} (Bot)`;

  const swept = model.roomOrder.reduce<{
    readonly model: AppModel;
    readonly removedRoomIds: readonly string[];
  }>(
    (acc, roomId) => {
      const room = acc.model.rooms[roomId];
      if (!room) return acc;

      const isOwnedOrSeated =
        room.ownerId === targetGuestId ||
        room.humanPlayers.some(
          (p) => p.id === targetGuestId || p.controllerId === targetGuestId
        ) ||
        room.players.some(
          (p) =>
            !p.isBot &&
            (p.id === targetGuestId || p.controllerId === targetGuestId)
        );

      if (!isOwnedOrSeated) return acc;

      const remainingHumans = room.humanPlayers.filter(
        (p) => p.id !== targetGuestId && p.controllerId !== targetGuestId
      );

      if (remainingHumans.length === 0 && !room.allBots) {
        return {
          model: removeRoomFromModelPure(acc.model, roomId),
          removedRoomIds: [...acc.removedRoomIds, roomId],
        };
      }

      const nextOwnerId =
        room.ownerId === targetGuestId && remainingHumans.length > 0
          ? remainingHumans[0]!.id
          : room.ownerId;
      const nextOwnerName =
        room.ownerId === targetGuestId && remainingHumans.length > 0
          ? remainingHumans[0]!.name
          : room.ownerName;

      if (room.status !== "in_progress") {
        const rebuilt = rebuildRoomSeatsPure({
          ...room,
          ownerId: nextOwnerId,
          ownerName: nextOwnerName,
          humanPlayers: remainingHumans,
        });
        return {
          model: setRoomInModelPure(acc.model, rebuilt),
          removedRoomIds: acc.removedRoomIds,
        };
      }

      const leavingSeatIds = new Set(
        room.players
          .filter(
            (p) =>
              !p.isBot &&
              (p.id === targetGuestId || p.controllerId === targetGuestId)
          )
          .map((p) => p.id)
      );

      const nextPlayers: PlayerDescriptor[] = room.players.map((p) =>
        leavingSeatIds.has(p.id)
          ? {
              id: p.id,
              name: toBotName(p.name),
              color: p.color,
              isBot: true,
              botDifficulty: room.botDifficulty,
            }
          : p
      );

      const mapStateLeavingToBots = (snap: any): any =>
        snap && Array.isArray(snap.players)
          ? {
              ...snap,
              players: snap.players.map((sp: any) =>
                leavingSeatIds.has(sp.id)
                  ? {
                      ...sp,
                      name: toBotName(sp.name),
                      isBot: true,
                      botDifficulty: room.botDifficulty,
                    }
                  : sp
              ),
            }
          : snap;

      const nextSession = mapRoomSessionSnapshots(room, mapStateLeavingToBots);
      const nextRemoteState = room.remoteState
        ? mapStateLeavingToBots(room.remoteState)
        : room.remoteState;

      const updatedRoom: ClientRoom = {
        ...room,
        ownerId: nextOwnerId,
        ownerName: nextOwnerName,
        humanPlayers: remainingHumans,
        botCount: nextPlayers.filter((p) => p.isBot).length,
        players: nextPlayers,
        session: nextSession,
        remoteState: nextRemoteState,
      };

      return {
        model: setRoomInModelPure(acc.model, updatedRoom),
        removedRoomIds: acc.removedRoomIds,
      };
    },
    { model: { ...model, deviceGuests: remainingDeviceGuests }, removedRoomIds: [] }
  );

  const fallbackActiveRoomId = swept.model.rooms[swept.model.activeRoomId]
    ? swept.model.activeRoomId
    : (swept.model.roomOrder[0] ?? "");

  if (targetGuestId !== model.currentUserId) {
    return {
      model: {
        ...swept.model,
        activeRoomId: fallbackActiveRoomId,
      },
      removedRoomIds: swept.removedRoomIds,
      switchedToGuest: null,
    };
  }

  if (remainingDeviceGuests.length > 0 && model.viewMode !== "login") {
    const nextGuest = remainingDeviceGuests[0]!;
    const activeStillHasNextGuest = Boolean(
      fallbackActiveRoomId &&
        swept.model.rooms[fallbackActiveRoomId]?.players.some(
          (p) => p.id === nextGuest.id || p.controllerId === nextGuest.id
        )
    );
    const nextView = activeStillHasNextGuest ? model.viewMode : "lobby";
    return {
      model: resetSubModesPure({
        ...swept.model,
        isAuthenticated: true,
        addingAdditionalGuest: false,
        inspectingSetupDuringMatch: false,
        loginErrorMsg: "",
        currentUserId: nextGuest.id,
        currentUserName: nextGuest.name,
        activeRoomId:
          activeStillHasNextGuest || !swept.model.useServerBackend
            ? fallbackActiveRoomId
            : "",
        viewMode: nextView,
        catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
      }),
      removedRoomIds: swept.removedRoomIds,
      switchedToGuest: nextGuest,
    };
  }

  return {
    model: resetSubModesPure({
      ...swept.model,
      isAuthenticated: false,
      addingAdditionalGuest: false,
      inspectingSetupDuringMatch: false,
      loginErrorMsg: "",
      loginDraftName: `Guest ${fallbackDraftSuffix}`,
      activeRoomId: swept.model.useServerBackend ? "" : fallbackActiveRoomId,
      viewMode: "login",
      catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
    }),
    removedRoomIds: swept.removedRoomIds,
    switchedToGuest: null,
  };
}

export function renameGuestInModelPure(
  model: Readonly<AppModel>,
  guestId: string,
  rawNewName: string
):
  | { readonly ok: false; readonly model: AppModel }
  | {
      readonly ok: true;
      readonly model: AppModel;
      readonly session: GuestSession;
    } {
  const cleanName = rawNewName.trim().slice(0, 28);
  if (!cleanName || !guestId) {
    return { ok: false, model };
  }

  const session: GuestSession = {
    id: guestId,
    name: cleanName,
    mode: "guest",
  };

  const withProfile: AppModel = {
    ...model,
    currentUserName:
      model.currentUserId === guestId ? cleanName : model.currentUserName,
    loginDraftName:
      model.currentUserId === guestId ? cleanName : model.loginDraftName,
    editingGuestName: false,
    guestRenameDraft: "",
    deviceGuests: upsertDeviceGuestListPure(model.deviceGuests, session),
  };

  const mapStatePlayerName = (snap: any): any =>
    snap && Array.isArray(snap.players)
      ? {
          ...snap,
          players: snap.players.map((sp: any) =>
            !sp.isBot && sp.id === guestId ? { ...sp, name: cleanName } : sp
          ),
        }
      : snap;

  const updatedModel = withProfile.roomOrder.reduce<AppModel>((acc, roomId) => {
    const room = acc.rooms[roomId];
    if (!room) return acc;

    const matchesRoom =
      room.ownerId === guestId ||
      room.humanPlayers.some((p) => p.id === guestId) ||
      room.players.some((p) => !p.isBot && p.id === guestId);

    if (!matchesRoom) return acc;

    const nextOwnerName =
      room.ownerId === guestId ? cleanName : room.ownerName;
    const nextHumans = room.humanPlayers.map((p) =>
      p.id === guestId ? { ...p, name: cleanName } : p
    );
    const nextPlayers = room.players.map((p) =>
      !p.isBot && p.id === guestId ? { ...p, name: cleanName } : p
    );
    const nextSession = mapRoomSessionSnapshots(room, mapStatePlayerName);
    const nextRemoteState = room.remoteState
      ? mapStatePlayerName(room.remoteState)
      : null;

    return setRoomInModelPure(acc, {
      ...room,
      ownerName: nextOwnerName,
      humanPlayers: nextHumans,
      players: nextPlayers,
      session: nextSession,
      remoteState: nextRemoteState,
    });
  }, withProfile);

  return { ok: true, model: updatedModel, session };
}
