import type { PlayerDescriptor } from "@gaming-platform/core";
import { PLAYER_COLORS } from "@gaming-platform/catan";
import { MAX_GUEST_DISPLAY_NAME_LENGTH } from "../config.ts";
import {
  getRoomPlayerBoundsPure,
  getRoomRecordPure,
  rebuildRoomPlayersPure,
  removeRoomRecordFromState,
  setRoomRecordInState,
} from "./helpers.ts";
import type { RoomManagerState, RoomRecord } from "./types.ts";

export function joinRoomPure(
  managerState: RoomManagerState,
  roomId: string,
  playerName: string,
  isBot = false,
  preferredPlayerId?: string,
  nowMs: number = Date.now()
): { state: RoomManagerState; player: PlayerDescriptor } {
  const room = getRoomRecordPure(managerState, roomId);
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  const cleanName = playerName.trim() || "Guest";

  if (preferredPlayerId) {
    const existingHuman = room.humanPlayers.find(
      (p) => p.id === preferredPlayerId
    );
    if (existingHuman) {
      if (room.status !== "in_progress" && cleanName) {
        const updatedHumans = room.humanPlayers.map((p) =>
          p.id === preferredPlayerId ? { ...p, name: cleanName } : p
        );
        const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
          ...room,
          humanPlayers: updatedHumans,
          ownerName:
            room.ownerId === preferredPlayerId ? cleanName : room.ownerName,
        });
        const seated =
          rebuilt.players.find((p) => p.id === preferredPlayerId) ?? {
            ...existingHuman,
            name: cleanName,
          };
        return {
          state: setRoomRecordInState(managerState, rebuilt),
          player: seated,
        };
      }
      return {
        state: managerState,
        player:
          room.players.find((p) => p.id === preferredPlayerId) ?? existingHuman,
      };
    }

    const existingAny = room.players.find((p) => p.id === preferredPlayerId);
    if (existingAny) {
      return { state: managerState, player: existingAny };
    }
  }

  if (room.status === "in_progress") {
    throw new Error(
      "Cannot join a room as a new player after the game has started"
    );
  }

  if (isBot) {
    if (room.players.length >= bounds.maxPlayers) {
      throw new Error(`Room is full (max ${bounds.maxPlayers} players)`);
    }
    const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
      ...room,
      botCount: room.botCount + 1,
    });
    return {
      state: setRoomRecordInState(managerState, rebuilt),
      player: rebuilt.players[rebuilt.players.length - 1]!,
    };
  }

  if (room.humanPlayers.length >= bounds.maxPlayers) {
    throw new Error(`Room is full (max ${bounds.maxPlayers} human players)`);
  }

  const assignedId =
    preferredPlayerId ||
    `guest-${room.humanPlayers.length + 1}-${nowMs % 10000}`;

  const humanDescriptor: PlayerDescriptor = {
    id: assignedId,
    name: cleanName,
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
  };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: [...room.humanPlayers, humanDescriptor],
  });
  const seated =
    rebuilt.players.find((p) => p.id === assignedId) ?? humanDescriptor;
  return {
    state: setRoomRecordInState(managerState, rebuilt),
    player: seated,
  };
}

export function leaveRoomPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string
): { state: RoomManagerState; closed: boolean } {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    return { state: managerState, closed: false };
  }

  const nextHumans = room.humanPlayers.filter(
    (p) => p.id !== playerId && p.controllerId !== playerId
  );
  if (nextHumans.length === room.humanPlayers.length) {
    return { state: managerState, closed: false };
  }

  if (nextHumans.length === 0 && !room.allBots) {
    return {
      state: removeRoomRecordFromState(managerState, roomId),
      closed: true,
    };
  }

  const promotedOwner =
    room.ownerId === playerId && nextHumans.length > 0
      ? { ownerId: nextHumans[0]!.id, ownerName: nextHumans[0]!.name }
      : { ownerId: room.ownerId, ownerName: room.ownerName };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: nextHumans,
    ownerId: promotedOwner.ownerId,
    ownerName: promotedOwner.ownerName,
  });

  return {
    state: setRoomRecordInState(managerState, rebuilt),
    closed: false,
  };
}

export function closeRoomPure(
  managerState: RoomManagerState,
  roomId: string
): { state: RoomManagerState; closed: boolean } {
  if (!managerState.rooms[roomId]) {
    return { state: managerState, closed: false };
  }
  return {
    state: removeRoomRecordFromState(managerState, roomId),
    closed: true,
  };
}

export function signOutPlayerFromRoomPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string
): {
  state: RoomManagerState;
  closed: boolean;
  updated: boolean;
  convertedToBot: boolean;
} {
  const room = managerState.rooms[roomId];
  if (!room || !playerId) {
    return {
      state: managerState,
      closed: false,
      updated: false,
      convertedToBot: false,
    };
  }

  const isOwnedOrSeated =
    room.ownerId === playerId ||
    room.humanPlayers.some(
      (p) => p.id === playerId || p.controllerId === playerId
    ) ||
    room.players.some(
      (p) => !p.isBot && (p.id === playerId || p.controllerId === playerId)
    );

  if (!isOwnedOrSeated) {
    return {
      state: managerState,
      closed: false,
      updated: false,
      convertedToBot: false,
    };
  }

  if (room.status !== "in_progress") {
    const left = leaveRoomPure(managerState, roomId, playerId);
    return {
      state: left.state,
      closed: left.closed,
      updated: !left.closed && left.state !== managerState,
      convertedToBot: false,
    };
  }

  const remainingHumans = room.humanPlayers.filter(
    (p) => p.id !== playerId && p.controllerId !== playerId
  );

  if (remainingHumans.length === 0 && !room.allBots) {
    return {
      state: removeRoomRecordFromState(managerState, roomId),
      closed: true,
      updated: false,
      convertedToBot: false,
    };
  }

  const leavingSeatIds = new Set(
    room.players
      .filter(
        (p) => !p.isBot && (p.id === playerId || p.controllerId === playerId)
      )
      .map((p) => p.id)
  );

  const promotedOwner =
    room.ownerId === playerId && remainingHumans.length > 0
      ? { ownerId: remainingHumans[0]!.id, ownerName: remainingHumans[0]!.name }
      : { ownerId: room.ownerId, ownerName: room.ownerName };

  const toBotName = (name: string): string =>
    name.endsWith(" (Bot)") ? name : `${name} (Bot)`;

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

  const nextSessionState = room.sessionState
    ? (() => {
        const cursor = room.sessionState.cursor;
        const curSnap = room.sessionState.snapshots[cursor];
        if (!curSnap || !Array.isArray(curSnap.players)) {
          return room.sessionState;
        }
        const updatedSnap = {
          ...curSnap,
          players: curSnap.players.map((sp: any) =>
            leavingSeatIds.has(sp.id)
              ? {
                  ...sp,
                  name: toBotName(sp.name),
                  isBot: true,
                  botDifficulty: room.botDifficulty,
                }
              : sp
          ),
        };
        const nextSnapshots = room.sessionState.snapshots.map((snap, idx) =>
          idx === cursor ? updatedSnap : snap
        );
        return {
          ...room.sessionState,
          snapshots: nextSnapshots,
        };
      })()
    : null;

  const updatedRoom: RoomRecord = {
    ...room,
    ownerId: promotedOwner.ownerId,
    ownerName: promotedOwner.ownerName,
    humanPlayers: remainingHumans,
    botCount: nextPlayers.filter((p) => p.isBot).length,
    players: nextPlayers,
    sessionState: nextSessionState,
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    closed: false,
    updated: true,
    convertedToBot: leavingSeatIds.size > 0,
  };
}

export function signOutGuestEverywherePure(
  managerState: RoomManagerState,
  playerId: string
): {
  state: RoomManagerState;
  closedRoomIds: string[];
  updatedRoomIds: string[];
} {
  return managerState.roomOrder.reduce<{
    state: RoomManagerState;
    closedRoomIds: string[];
    updatedRoomIds: string[];
  }>(
    (acc, roomId) => {
      const res = signOutPlayerFromRoomPure(acc.state, roomId, playerId);
      return {
        state: res.state,
        closedRoomIds: res.closed
          ? [...acc.closedRoomIds, roomId]
          : acc.closedRoomIds,
        updatedRoomIds: res.updated
          ? [...acc.updatedRoomIds, roomId]
          : acc.updatedRoomIds,
      };
    },
    { state: managerState, closedRoomIds: [], updatedRoomIds: [] }
  );
}

export function renameGuestEverywherePure(
  managerState: RoomManagerState,
  playerId: string,
  rawNewName: string
): {
  state: RoomManagerState;
  cleanName: string;
  updatedRoomIds: string[];
} {
  const cleanName = rawNewName.trim().slice(0, MAX_GUEST_DISPLAY_NAME_LENGTH);
  if (!cleanName) {
    throw new Error("Enter a guest display name");
  }
  if (!playerId) {
    return { state: managerState, cleanName, updatedRoomIds: [] };
  }

  return managerState.roomOrder.reduce<{
    state: RoomManagerState;
    cleanName: string;
    updatedRoomIds: string[];
  }>(
    (acc, roomId) => {
      const room = acc.state.rooms[roomId];
      if (!room) return acc;

      const matchesRoom =
        room.ownerId === playerId ||
        room.humanPlayers.some((p) => p.id === playerId) ||
        room.players.some((p) => !p.isBot && p.id === playerId);

      if (!matchesRoom) return acc;

      const nextOwnerName =
        room.ownerId === playerId ? cleanName : room.ownerName;
      const nextHumans = room.humanPlayers.map((p) =>
        p.id === playerId ? { ...p, name: cleanName } : p
      );
      const nextPlayers = room.players.map((p) =>
        !p.isBot && p.id === playerId ? { ...p, name: cleanName } : p
      );
      const nextSessionState = room.sessionState
        ? {
            ...room.sessionState,
            snapshots: room.sessionState.snapshots.map((snap) =>
              snap && Array.isArray(snap.players)
                ? {
                    ...snap,
                    players: snap.players.map((sp: any) =>
                      !sp.isBot && sp.id === playerId
                        ? { ...sp, name: cleanName }
                        : sp
                    ),
                  }
                : snap
            ),
          }
        : null;

      const updatedRoom: RoomRecord = {
        ...room,
        ownerName: nextOwnerName,
        humanPlayers: nextHumans,
        players: nextPlayers,
        sessionState: nextSessionState,
      };

      return {
        state: setRoomRecordInState(acc.state, updatedRoom),
        cleanName,
        updatedRoomIds: [...acc.updatedRoomIds, roomId],
      };
    },
    { state: managerState, cleanName, updatedRoomIds: [] }
  );
}
