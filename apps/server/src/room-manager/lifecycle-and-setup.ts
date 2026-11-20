import {
  type BotDifficulty,
  type PlayerDescriptor,
  getRegisteredEnginePure,
} from "@gaming-platform/core";
import {
  PLAYER_COLORS,
  SCENARIO_CATALOG,
  type ScenarioId,
  isExpanded56Scenario,
  toExpanded56ScenarioId,
  toStandard34ScenarioId,
} from "@gaming-platform/catan";
import {
  DEFAULT_BOT_DIFFICULTY,
  DEFAULT_BOT_STEP_DELAY_MS,
  DEFAULT_CATAN_ROOM_PRESET,
  DEFAULT_GAME_ID,
  DEFAULT_STARTING_PLAYER_MODE,
  MAX_GUEST_DISPLAY_NAME_LENGTH,
  clampServerBotStepDelayMsPure,
} from "../config.ts";
import {
  computeRoomHashPure,
  getRoomPlayerBoundsPure,
  getRoomRecordPure,
  rebuildRoomPlayersPure,
  setRoomRecordInState,
} from "./helpers.ts";
import { startGamePure } from "./match-actions.ts";
import type {
  CreateRoomOptions,
  RoomManagerState,
  RoomRecord,
  RoomSetupUpdates,
} from "./types.ts";

export function createRoomPure(
  managerState: RoomManagerState,
  options: CreateRoomOptions,
  nowMs: number = Date.now()
): { state: RoomManagerState; roomId: string } {
  const roomIndex = managerState.roomCounter;
  const gameId = options.gameId ?? DEFAULT_GAME_ID;
  getRegisteredEnginePure(managerState.registry, gameId);

  const ownerId = options.ownerId?.trim() || "p1";
  const ownerName = options.hostName?.trim() || "Player 1 (Host)";
  const roomId = computeRoomHashPure(
    roomIndex,
    nowMs,
    `${gameId}:${ownerId}:${options.seed ?? ""}`,
    managerState.rooms
  );

  const botDifficulty: BotDifficulty =
    options.botDifficulty ??
    (options.config?.botDifficulty as BotDifficulty | undefined) ??
    DEFAULT_BOT_DIFFICULTY;

  const humanPlayers: PlayerDescriptor[] = options.allBots
    ? []
    : [
        {
          id: ownerId,
          name: ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        },
      ];

  const defaultBotCount = (() => {
    if (options.botCount !== undefined) {
      if (
        typeof options.botCount !== "number" ||
        !Number.isFinite(options.botCount)
      ) {
        throw new Error("botCount must be a finite number");
      }
      return Math.trunc(options.botCount);
    }
    return options.allBots ? 4 : options.autoStart ? 3 : 0;
  })();

  const defaultConfig =
    gameId === "catan"
      ? {
          ...DEFAULT_CATAN_ROOM_PRESET,
          botDifficulty,
          ...options.config,
        }
      : { botDifficulty, ...options.config };

  const draftRoom: RoomRecord = {
    roomId,
    name: options.name?.trim() || `#${roomId}`,
    gameId,
    ownerId,
    ownerName,
    status: "lobby",
    isPrivate: Boolean(options.isPrivate),
    humanPlayers,
    botCount: defaultBotCount,
    botDifficulty,
    allBots: Boolean(options.allBots),
    startingPlayerMode: options.startingPlayerMode ?? DEFAULT_STARTING_PLAYER_MODE,
    autoStepBots: options.autoStepBots ?? true,
    botStepDelayMs:
      options.botStepDelayMs !== undefined
        ? clampServerBotStepDelayMsPure(options.botStepDelayMs)
        : DEFAULT_BOT_STEP_DELAY_MS,
    players: [],
    config: defaultConfig,
    seed: options.seed ?? `${roomId}-${nowMs}`,
    matchCounter: 0,
    sessionState: null,
    revision: 0,
    createdAt: nowMs,
  };

  const builtRoom = rebuildRoomPlayersPure(managerState.registry, draftRoom);
  const withRoom = setRoomRecordInState(
    { ...managerState, roomCounter: roomIndex + 1 },
    builtRoom
  );

  if (options.autoStart === true) {
    const started = startGamePure(withRoom, roomId, ownerId);
    return { state: started.state, roomId };
  }

  return { state: withRoom, roomId };
}

export function updateRoomSetupPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  updates: RoomSetupUpdates
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Game setup is read-only while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can change the game setup");
  }

  const nextName =
    updates.name !== undefined && updates.name.trim()
      ? updates.name.trim()
      : room.name;

  const gameChanged = Boolean(updates.gameId && updates.gameId !== room.gameId);
  const nextGameId = gameChanged
    ? (() => {
        getRegisteredEnginePure(managerState.registry, updates.gameId!);
        return updates.gameId!;
      })()
    : room.gameId;

  const baseConfigSource: Record<string, unknown> = gameChanged
    ? {}
    : room.config;

  const mergedConfig = updates.config
    ? (() => {
        const base: Record<string, unknown> = {
          ...baseConfigSource,
          ...updates.config,
        };
        if (nextGameId === "catan") {
          const prevScenario =
            (room.config.scenarioId as ScenarioId) ?? "standard";
          const rawScenario = (base.scenarioId as ScenarioId) ?? "standard";
          const effectiveScenario =
            updates.config.enable56PlayerExtension !== undefined &&
            updates.config.scenarioId === undefined
              ? updates.config.enable56PlayerExtension
                ? toExpanded56ScenarioId(rawScenario)
                : toStandard34ScenarioId(rawScenario)
              : rawScenario;

          const withScenario: Record<string, unknown> =
            effectiveScenario !== rawScenario
              ? { ...base, scenarioId: effectiveScenario }
              : isExpanded56Scenario(effectiveScenario) &&
                  updates.config.scenarioId !== undefined &&
                  updates.config.enable56PlayerExtension === undefined
                ? { ...base, enable56PlayerExtension: true }
                : !isExpanded56Scenario(effectiveScenario) &&
                    updates.config.scenarioId !== undefined &&
                    updates.config.enable56PlayerExtension === undefined &&
                    Boolean(base.enable56PlayerExtension)
                  ? { ...base, enable56PlayerExtension: false }
                  : base;

          const prevIsCkPreset = Boolean(
            SCENARIO_CATALOG[prevScenario]?.enableCitiesAndKnights
          );
          const nextIsCkPreset = Boolean(
            SCENARIO_CATALOG[effectiveScenario]?.enableCitiesAndKnights
          );

          if (nextIsCkPreset) {
            return {
              ...withScenario,
              enableCitiesAndKnights: true,
              enableCityWalls: true,
            };
          }
          if (
            prevIsCkPreset &&
            updates.config.scenarioId &&
            !nextIsCkPreset &&
            updates.config.enableCitiesAndKnights === undefined
          ) {
            return {
              ...withScenario,
              enableCitiesAndKnights: false,
            };
          }
          if (
            updates.config.enableCitiesAndKnights === true &&
            updates.config.enableCityWalls === undefined
          ) {
            return {
              ...withScenario,
              enableCityWalls: true,
            };
          }
          return withScenario;
        }
        return base;
      })()
    : room.config;

  const mergedConfigFinal = updates.config ? mergedConfig : baseConfigSource;
  const nextBotDifficulty = updates.botDifficulty ?? room.botDifficulty;
  const nextConfig = updates.botDifficulty
    ? { ...mergedConfigFinal, botDifficulty: updates.botDifficulty }
    : mergedConfigFinal;

  const nextStartingPlayerMode =
    updates.startingPlayerMode !== undefined
      ? updates.startingPlayerMode
      : room.startingPlayerMode;

  const nextSeed = updates.seed ? updates.seed : room.seed;
  const nextBotStepDelayMs =
    updates.botStepDelayMs !== undefined
      ? clampServerBotStepDelayMsPure(updates.botStepDelayMs)
      : room.botStepDelayMs;
  const nextAllBots =
    updates.allBots !== undefined ? updates.allBots : room.allBots;
  const nextIsPrivate =
    updates.isPrivate !== undefined ? Boolean(updates.isPrivate) : room.isPrivate;

  const nextHumanPlayers =
    updates.allBots !== undefined &&
    !nextAllBots &&
    room.humanPlayers.length === 0 &&
    room.ownerId
      ? [
          {
            id: room.ownerId,
            name: room.ownerName,
            color: PLAYER_COLORS[0]!,
            isBot: false,
          },
        ]
      : room.humanPlayers;

  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    nextGameId,
    nextConfig
  );

  const nextBotCount = (() => {
    if (updates.botCount !== undefined) {
      if (
        typeof updates.botCount !== "number" ||
        !Number.isFinite(updates.botCount)
      ) {
        throw new Error("botCount must be a finite number");
      }
      return Math.trunc(updates.botCount);
    }
    if (updates.playerCount !== undefined) {
      if (
        typeof updates.playerCount !== "number" ||
        !Number.isFinite(updates.playerCount)
      ) {
        throw new Error("playerCount must be a finite number");
      }
      const clampedTarget = Math.max(
        bounds.minPlayers,
        Math.min(bounds.maxPlayers, Math.trunc(updates.playerCount))
      );
      return nextAllBots
        ? clampedTarget
        : Math.max(0, clampedTarget - nextHumanPlayers.length);
    }
    if (
      nextGameId === "catan" &&
      (isExpanded56Scenario(
        (nextConfig.scenarioId as ScenarioId) ?? "standard"
      ) ||
        Boolean(nextConfig.enable56PlayerExtension)) &&
      nextHumanPlayers.length + room.botCount < 5
    ) {
      return Math.max(room.botCount, 5 - nextHumanPlayers.length);
    }
    return room.botCount;
  })();

  const updatedRoom = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    name: nextName,
    isPrivate: nextIsPrivate,
    gameId: nextGameId,
    config: nextConfig,
    botDifficulty: nextBotDifficulty,
    startingPlayerMode: nextStartingPlayerMode,
    botStepDelayMs: nextBotStepDelayMs,
    seed: nextSeed,
    allBots: nextAllBots,
    humanPlayers: nextHumanPlayers,
    botCount: nextBotCount,
    ...(gameChanged ? { status: "lobby" as const, sessionState: null } : {}),
  });

  return setRoomRecordInState(managerState, updatedRoom);
}

export function addLocalPlayerPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  playerName: string,
  localIdSuffix: string = Math.random().toString(36).slice(2, 6)
): { state: RoomManagerState; player: PlayerDescriptor } {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Cannot add players while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can add local players");
  }
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  if (room.humanPlayers.length >= bounds.maxPlayers) {
    throw new Error(`Room is full (max ${bounds.maxPlayers} players)`);
  }
  const cleanName = playerName.trim();
  if (!cleanName) {
    throw new Error("Enter a player name");
  }
  const localId = `local-${room.humanPlayers.length + 1}-${localIdSuffix}`;
  const descriptor: PlayerDescriptor = {
    id: localId,
    name: cleanName.slice(0, MAX_GUEST_DISPLAY_NAME_LENGTH),
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
    controllerId: room.ownerId,
  };

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    allBots: false,
    humanPlayers: [...room.humanPlayers, descriptor],
  });
  const seated = rebuilt.players.find((p) => p.id === localId) ?? descriptor;
  return {
    state: setRoomRecordInState(managerState, rebuilt),
    player: seated,
  };
}

export function removeLocalPlayerPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId: string,
  targetPlayerId: string
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  if (room.status === "in_progress") {
    throw new Error("Cannot remove players while the game is in progress");
  }
  if (room.ownerId !== requesterId) {
    throw new Error("Only the room owner can remove seats");
  }
  if (targetPlayerId === room.ownerId) {
    throw new Error("The host seat cannot be removed");
  }

  const rebuilt = rebuildRoomPlayersPure(managerState.registry, {
    ...room,
    humanPlayers: room.humanPlayers.filter((p) => p.id !== targetPlayerId),
  });
  return setRoomRecordInState(managerState, rebuilt);
}
