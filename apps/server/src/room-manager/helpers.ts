import {
  type GameRegistryState,
  type PlayerDescriptor,
  canSessionPlayerRedo,
  createEmptyRegistryState,
  getRegisteredEnginePure,
  getSessionState,
  getSessionStep,
  getSessionUndoableStepCount,
  registerEnginePure,
} from "@gaming-platform/core";
import {
  CatanEngine,
  PLAYER_COLORS,
  SCENARIO_CATALOG,
  type ScenarioId,
  getNextActingPlayerId,
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
  DEFAULT_ROOM_HASH_SALT,
  MAX_ROOM_HASH_ATTEMPTS,
  ROOM_HASH_HEX_LENGTH,
  ROOM_PLAYER_BOUNDS_BY_GAME,
  type SupportedGameId,
} from "../config.ts";
import type { RoomManagerState, RoomRecord, RoomSummary } from "./types.ts";

export function getRoomActingPlayerId(
  gameId: string,
  state: any
): string | null {
  if (!state) return null;
  if (gameId === "splendor") return getSplendorActingPlayerId(state);
  if (gameId === "azul") return getAzulActingPlayerId(state);
  if (gameId === "seven_wonders") return getSevenWondersActingPlayerId(state);
  return getNextActingPlayerId(state);
}

export function createInitialRoomManagerState(): RoomManagerState {
  const r0 = createEmptyRegistryState();
  const r1 = registerEnginePure(r0, CatanEngine);
  const r2 = registerEnginePure(r1, SplendorEngine);
  const r3 = registerEnginePure(r2, AzulEngine);
  const r4 = registerEnginePure(r3, SevenWondersEngine);
  return {
    registry: r4,
    rooms: {},
    roomOrder: [],
    roomCounter: 1,
  };
}

export function getRoomPlayerBoundsPure(
  registry: GameRegistryState,
  gameId: string,
  config: Readonly<Record<string, unknown>>
): { minPlayers: number; maxPlayers: number } {
  if (gameId === "catan") {
    const scId = (config.scenarioId as ScenarioId) ?? "standard";
    const sc =
      SCENARIO_CATALOG[scId] ??
      SCENARIO_CATALOG.standard ??
      ROOM_PLAYER_BOUNDS_BY_GAME.catan;
    return {
      minPlayers: sc.minPlayers,
      maxPlayers: sc.maxPlayers,
    };
  }
  const engine = getRegisteredEnginePure(registry, gameId);
  const presetBounds = ROOM_PLAYER_BOUNDS_BY_GAME[gameId as SupportedGameId];
  return {
    minPlayers: engine.metadata.minPlayers ?? presetBounds?.minPlayers,
    maxPlayers: engine.metadata.maxPlayers ?? presetBounds?.maxPlayers,
  };
}

export function canViewerControlActorPure(
  room: Pick<RoomRecord, "players">,
  viewerId: string | null | undefined,
  actorId: string | null
): boolean {
  if (!viewerId || !actorId) return false;
  const actor = room.players.find((p) => p.id === actorId);
  if (!actor || actor.isBot) return false;
  return actor.controllerId
    ? actor.controllerId === viewerId
    : actor.id === viewerId;
}

export function resolveUndoTargetPlayerIdPure(
  engine: any,
  r: RoomRecord,
  viewerId?: string | null
): string | null {
  if (!r.sessionState) return null;
  const state = getSessionState(r.sessionState);
  const actingId = getRoomActingPlayerId(r.gameId, state);
  if (
    r.gameId === "seven_wonders" &&
    state?.phase === "AGE_DRAFT" &&
    r.sessionState.cursor > 0
  ) {
    const lastEntry = r.sessionState.actionLog[r.sessionState.cursor - 1];
    if (
      lastEntry &&
      getSessionUndoableStepCount(engine, r.sessionState, lastEntry.playerId) >
        0 &&
      (viewerId === undefined ||
        canViewerControlActorPure(r, viewerId, lastEntry.playerId))
    ) {
      return lastEntry.playerId;
    }
  }
  return actingId;
}

export function resolveRedoTargetPlayerIdPure(
  r: RoomRecord,
  viewerId?: string | null
): string | null {
  if (!r.sessionState) return null;
  const state = getSessionState(r.sessionState);
  const actingId = getRoomActingPlayerId(r.gameId, state);
  if (
    r.gameId === "seven_wonders" &&
    state?.phase === "AGE_DRAFT" &&
    r.sessionState.cursor < r.sessionState.snapshots.length - 1
  ) {
    const nextEntry = r.sessionState.actionLog[r.sessionState.cursor];
    if (
      nextEntry &&
      canSessionPlayerRedo(r.sessionState, nextEntry.playerId) &&
      (viewerId === undefined ||
        canViewerControlActorPure(r, viewerId, nextEntry.playerId))
    ) {
      return nextEntry.playerId;
    }
  }
  return actingId;
}

export function toRoomSummaryPure(
  registry: GameRegistryState,
  r: RoomRecord,
  viewerId?: string | null
): RoomSummary {
  const engine = getRegisteredEnginePure(registry, r.gameId);
  const undoTargetId = resolveUndoTargetPlayerIdPure(engine, r, viewerId);
  const redoTargetId = resolveRedoTargetPlayerIdPure(r, viewerId);
  const rawUndoableSteps =
    r.sessionState && undoTargetId
      ? getSessionUndoableStepCount(engine, r.sessionState, undoTargetId)
      : 0;
  const canControlTarget = (targetId: string | null): boolean =>
    viewerId === undefined
      ? Boolean(targetId && !r.players.find((p) => p.id === targetId)?.isBot)
      : canViewerControlActorPure(r, viewerId, targetId);
  const undoableSteps = canControlTarget(undoTargetId) ? rawUndoableSteps : 0;
  const canRedo =
    canControlTarget(redoTargetId) && r.sessionState && redoTargetId
      ? canSessionPlayerRedo(r.sessionState, redoTargetId)
      : false;

  return {
    roomId: r.roomId,
    name: r.name,
    gameId: r.gameId,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    status: r.status,
    isPrivate: Boolean(r.isPrivate),
    botCount: r.botCount,
    botDifficulty: r.botDifficulty,
    allBots: r.allBots,
    startingPlayerMode: r.startingPlayerMode,
    autoStepBots: r.autoStepBots,
    botStepDelayMs: r.botStepDelayMs,
    players: r.players.slice(),
    config: { ...r.config },
    canUndo: undoableSteps > 0,
    undoableSteps,
    canRedo,
    step: r.sessionState ? getSessionStep(r.sessionState) : 0,
    revision: r.revision,
    createdAt: r.createdAt,
  };
}

export function isPlayerInRoomPure(
  room: Pick<RoomRecord, "ownerId" | "humanPlayers" | "players">,
  playerId: string
): boolean {
  return (
    room.ownerId === playerId ||
    room.humanPlayers.some(
      (p) => p.id === playerId || p.controllerId === playerId
    ) ||
    room.players.some(
      (p) => !p.isBot && (p.id === playerId || p.controllerId === playerId)
    )
  );
}

export function listRoomsPure(
  managerState: RoomManagerState,
  gameFilter?: string,
  viewerId?: string | null
): RoomSummary[] {
  const canViewerSeeRoom = (r: RoomRecord): boolean =>
    !r.isPrivate || (Boolean(viewerId) && isPlayerInRoomPure(r, viewerId!));

  return managerState.roomOrder
    .map((id) => managerState.rooms[id])
    .filter(
      (r): r is RoomRecord =>
        Boolean(
          r &&
            canViewerSeeRoom(r) &&
            (!gameFilter || gameFilter === "all" || r.gameId === gameFilter)
        )
    )
    .map((r) => toRoomSummaryPure(managerState.registry, r, viewerId));
}

function normalizeRoomHashIdPure(rawRoomId: string): string {
  return rawRoomId.trim().replace(/^#+/, "");
}

export function findRoomRecord(
  managerState: RoomManagerState,
  roomId: string
): RoomRecord | undefined {
  const cleaned = normalizeRoomHashIdPure(roomId);
  return (
    managerState.rooms[roomId] ??
    managerState.rooms[cleaned] ??
    managerState.rooms[cleaned.toLowerCase()]
  );
}

export function computeRoomHashPure(
  counter: number,
  nowMs: number,
  salt: string = DEFAULT_ROOM_HASH_SALT,
  existingRooms: Readonly<Record<string, unknown>> = {}
): string {
  const hashOnce = (input: string): string => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return (h & 0xffffff).toString(16).padStart(ROOM_HASH_HEX_LENGTH, "0");
  };

  for (let attempt = 0; attempt < MAX_ROOM_HASH_ATTEMPTS; attempt++) {
    const candidate = hashOnce(`${counter}:${nowMs}:${salt}:${attempt}`);
    if (!existingRooms[candidate]) {
      return candidate;
    }
  }
  return `${hashOnce(`${counter}:${nowMs}:${salt}`)}${counter}`;
}

export function getRoomRecordPure(
  managerState: RoomManagerState,
  roomId: string
): RoomRecord {
  const room = findRoomRecord(managerState, roomId);
  if (!room) {
    throw new Error(`Room "${roomId}" not found`);
  }
  return room;
}

export function setRoomRecordInState(
  managerState: RoomManagerState,
  room: RoomRecord
): RoomManagerState {
  const prev = managerState.rooms[room.roomId];
  const nextRevision = prev
    ? (prev.revision ?? 0) + 1
    : Math.max(1, room.revision || 1);
  const stampedRoom: RoomRecord = {
    ...room,
    revision: nextRevision,
  };
  return {
    ...managerState,
    rooms: {
      ...managerState.rooms,
      [room.roomId]: stampedRoom,
    },
    roomOrder: prev
      ? managerState.roomOrder
      : [...managerState.roomOrder, room.roomId],
  };
}

export function removeRoomRecordFromState(
  managerState: RoomManagerState,
  roomId: string
): RoomManagerState {
  const canonicalId = findRoomRecord(managerState, roomId)?.roomId ?? roomId;
  const nextRooms = Object.fromEntries(
    Object.entries(managerState.rooms).filter(([id]) => id !== canonicalId)
  );
  return {
    ...managerState,
    rooms: nextRooms,
    roomOrder: managerState.roomOrder.filter((id) => id !== canonicalId),
  };
}

function resolveValidStartMode(
  mode: string,
  players: readonly PlayerDescriptor[]
): string {
  return mode !== "random" &&
    mode !== "first" &&
    !players.some((p) => p.id === mode)
    ? "random"
    : mode;
}

export function rebuildRoomPlayersPure(
  registry: GameRegistryState,
  room: RoomRecord
): RoomRecord {
  const bounds = getRoomPlayerBoundsPure(registry, room.gameId, room.config);

  if (room.allBots) {
    const rawBots = Number.isFinite(room.botCount)
      ? Math.trunc(room.botCount)
      : 4;
    const clampedBotCount = Math.max(
      bounds.minPlayers,
      Math.min(bounds.maxPlayers, rawBots || 4)
    );
    const nextPlayers: PlayerDescriptor[] = Array.from(
      { length: clampedBotCount },
      (_, i) => ({
        id: `p${i + 1}`,
        name: `Bot ${i + 1}`,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
        isBot: true,
        botDifficulty: room.botDifficulty,
      })
    );
    return {
      ...room,
      botCount: clampedBotCount,
      players: nextPlayers,
      startingPlayerMode: resolveValidStartMode(
        room.startingPlayerMode,
        nextPlayers
      ),
    };
  }

  const trimmedHumans = room.humanPlayers.slice(0, bounds.maxPlayers);
  const maxBots = Math.max(0, bounds.maxPlayers - trimmedHumans.length);
  const rawBots = Number.isFinite(room.botCount)
    ? Math.trunc(room.botCount)
    : 0;
  const clampedBotCount = Math.max(0, Math.min(maxBots, rawBots));

  const seatedHumans: PlayerDescriptor[] = trimmedHumans.map((hp, idx) => ({
    ...hp,
    color: PLAYER_COLORS[idx % PLAYER_COLORS.length]!,
    isBot: false,
  }));

  const nextPlayers = Array.from({ length: clampedBotCount }).reduce<
    PlayerDescriptor[]
  >((acc, _, b) => {
    const idx = acc.length;
    const defaultId = `p${idx + 1}`;
    const finalId = acc.some((p) => p.id === defaultId)
      ? `bot-${b + 1}`
      : defaultId;
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
  }, seatedHumans);

  return {
    ...room,
    humanPlayers: trimmedHumans,
    botCount: clampedBotCount,
    players: nextPlayers,
    startingPlayerMode: resolveValidStartMode(
      room.startingPlayerMode,
      nextPlayers
    ),
  };
}
