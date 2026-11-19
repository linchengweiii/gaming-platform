import type { PlayerDescriptor } from "@gaming-platform/core";
import {
  CatanEngine,
  PLAYER_COLORS,
  SCENARIO_CATALOG,
  type ScenarioId,
  getNextActingPlayerId,
  isExpanded56Scenario,
} from "@gaming-platform/catan";
import {
  SplendorEngine,
  getSplendorActingPlayerId,
} from "@gaming-platform/splendor";
import { AzulEngine, getAzulActingPlayerId } from "@gaming-platform/azul";
import {
  SevenWondersEngine,
  getSevenWondersActingPlayerId,
} from "@gaming-platform/seven-wonders";
import {
  DEFAULT_TWO_TO_FOUR_PLAYER_BOUNDS,
  SEVEN_WONDERS_PLAYER_BOUNDS,
} from "../../config/app-config.ts";
import type {
  AppModel,
  ClientRoom,
  GuestSession,
  SupportedGameId,
} from "../types.ts";

export function getEngineForGamePure(gameId: SupportedGameId): any {
  if (gameId === "splendor") return SplendorEngine;
  if (gameId === "azul") return AzulEngine;
  if (gameId === "seven_wonders") return SevenWondersEngine;
  return CatanEngine;
}

export function getActingPlayerIdPure(
  gameId: SupportedGameId,
  state: any
): string | null {
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
  if (gameId === "seven_wonders") return getSevenWondersActingPlayerId(state);
  return getNextActingPlayerId(state);
}

export function getRoomBoundsPure(room: {
  readonly gameId: SupportedGameId;
  readonly config: { readonly scenarioId: ScenarioId };
}): { minPlayers: number; maxPlayers: number } {
  if (room.gameId === "catan") {
    const sc = SCENARIO_CATALOG[room.config.scenarioId];
    return { minPlayers: sc.minPlayers, maxPlayers: sc.maxPlayers };
  }
  if (room.gameId === "seven_wonders") {
    return { ...SEVEN_WONDERS_PLAYER_BOUNDS };
  }
  return { ...DEFAULT_TWO_TO_FOUR_PLAYER_BOUNDS };
}

export function roomUsesServerPure(
  model: Pick<AppModel, "useServerBackend">,
  room: Pick<ClientRoom, "isOfflineLocal">
): boolean {
  return model.useServerBackend && !room.isOfflineLocal;
}

export function getRoomByIdPure(
  model: Readonly<AppModel>,
  roomId: string
): ClientRoom | undefined {
  return model.rooms[roomId];
}

export function getRoomListPure(
  model: Readonly<AppModel>
): readonly ClientRoom[] {
  return model.roomOrder
    .map((id) => model.rooms[id])
    .filter((r): r is ClientRoom => Boolean(r));
}

export function findActiveRoomPure(
  model: Pick<AppModel, "rooms" | "roomOrder" | "activeRoomId" | "useServerBackend">
): ClientRoom | null {
  if (model.activeRoomId && model.rooms[model.activeRoomId]) {
    return model.rooms[model.activeRoomId]!;
  }
  if (!model.useServerBackend) {
    return getRoomListPure(model as Readonly<AppModel>)[0] ?? null;
  }
  return null;
}

export function getActiveRoomPure(model: Readonly<AppModel>): ClientRoom {
  return (
    findActiveRoomPure(model) ??
    getRoomListPure(model)[0]!
  );
}

export function getRoomStatePure(
  model: Pick<AppModel, "useServerBackend">,
  room: ClientRoom
): any | null {
  if (roomUsesServerPure(model, room)) {
    return room.remoteState;
  }
  return room.session?.getState() ?? null;
}

export function canControlPlayerOnDevicePure(
  model: Pick<AppModel, "useServerBackend" | "currentUserId">,
  room: ClientRoom,
  playerId: string | null
): boolean {
  if (!playerId) return false;
  const seat = room.players.find((p) => p.id === playerId);
  if (!seat) return false;
  if (seat.isBot) {
    return Boolean(room.allBots);
  }
  if (!roomUsesServerPure(model, room) && room.isOfflineLocal) {
    return true;
  }
  return (
    playerId === model.currentUserId ||
    seat.controllerId === model.currentUserId
  );
}

export function setRoomInModelPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): AppModel {
  const exists = Object.prototype.hasOwnProperty.call(model.rooms, room.roomId);
  return {
    ...model,
    rooms: {
      ...model.rooms,
      [room.roomId]: room,
    },
    roomOrder: exists ? model.roomOrder : [...model.roomOrder, room.roomId],
  };
}

export function updateRoomInModelPure(
  model: Readonly<AppModel>,
  roomId: string,
  updater: (room: ClientRoom) => ClientRoom
): AppModel {
  const existing = model.rooms[roomId];
  if (!existing) return model;
  return setRoomInModelPure(model, updater(existing));
}

export function removeRoomFromModelPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  if (!Object.prototype.hasOwnProperty.call(model.rooms, roomId)) {
    return model;
  }
  const nextOrder = model.roomOrder.filter((id) => id !== roomId);
  const nextRooms = Object.fromEntries(
    nextOrder
      .map((id) => [id, model.rooms[id]!] as const)
      .filter((entry) => Boolean(entry[1]))
  );
  return {
    ...model,
    rooms: nextRooms,
    roomOrder: nextOrder,
  };
}

export function upsertDeviceGuestListPure(
  deviceGuests: readonly GuestSession[],
  session: GuestSession
): GuestSession[] {
  const idx = deviceGuests.findIndex((g) => g.id === session.id);
  if (idx >= 0) {
    const prev = deviceGuests[idx]!;
    const merged: GuestSession =
      session.token !== undefined
        ? session
        : prev.token
          ? { ...session, token: prev.token }
          : session;
    return deviceGuests.map((g, i) => (i === idx ? merged : g));
  }
  return [...deviceGuests, session];
}

export function rebuildRoomSeatsPure(room: Readonly<ClientRoom>): ClientRoom {
  if (room.status === "in_progress") {
    return { ...room };
  }

  const bounds = getRoomBoundsPure(room);
  const adjustedBotCountForBigIsland =
    room.gameId === "catan" &&
    (isExpanded56Scenario(room.config.scenarioId) ||
      Boolean(room.config.enable56PlayerExtension)) &&
    room.humanPlayers.length + room.botCount < 5
      ? Math.max(room.botCount, 5 - room.humanPlayers.length)
      : room.botCount;

  const computeSeats = (): {
    humanPlayers: PlayerDescriptor[];
    botCount: number;
    players: PlayerDescriptor[];
  } => {
    if (room.allBots) {
      const clampedBots = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, adjustedBotCountForBigIsland || 4)
      );
      const botPlayers: PlayerDescriptor[] = Array.from(
        { length: clampedBots },
        (_, i) => ({
          id: `p${i + 1}`,
          name: `Bot ${i + 1}`,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        })
      );
      return {
        humanPlayers: [...room.humanPlayers],
        botCount: clampedBots,
        players: botPlayers,
      };
    }

    const seededHumans =
      room.humanPlayers.length === 0 && room.ownerId
        ? [
            {
              id: room.ownerId,
              name: room.ownerName,
              color: PLAYER_COLORS[0]!,
              isBot: false,
            },
          ]
        : room.humanPlayers;
    const trimmedHumans = seededHumans.slice(0, bounds.maxPlayers);
    const maxBots = Math.max(0, bounds.maxPlayers - trimmedHumans.length);
    const clampedBots = Math.max(
      0,
      Math.min(maxBots, adjustedBotCountForBigIsland)
    );

    const humanSeats: PlayerDescriptor[] = trimmedHumans.map((h, idx) => ({
      ...h,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
      isBot: false,
    }));

    const botSeats = Array.from({ length: clampedBots }, (_, b) => b).reduce<
      PlayerDescriptor[]
    >((acc, b) => {
      const idx = humanSeats.length + acc.length;
      const defaultId = `p${idx + 1}`;
      const taken =
        humanSeats.some((p) => p.id === defaultId) ||
        acc.some((p) => p.id === defaultId);
      const finalId = taken ? `bot-${b + 1}` : defaultId;
      return [
        ...acc,
        {
          id: finalId,
          name: `Bot ${b + 1}`,
          color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
          isBot: true,
          botDifficulty: room.botDifficulty,
        },
      ];
    }, []);

    return {
      humanPlayers: trimmedHumans,
      botCount: clampedBots,
      players: [...humanSeats, ...botSeats],
    };
  };

  const { humanPlayers, botCount, players } = computeSeats();
  const startingPlayerMode =
    room.startingPlayerMode !== "random" &&
    room.startingPlayerMode !== "first" &&
    !players.some((p) => p.id === room.startingPlayerMode)
      ? "random"
      : room.startingPlayerMode;

  return {
    ...room,
    config: { ...room.config },
    humanPlayers,
    botCount,
    players,
    startingPlayerMode,
  };
}
