import type { BotDifficulty, PlayerDescriptor } from "@gaming-platform/core";
import {
  PLAYER_COLORS,
  SCENARIO_CATALOG,
  type ScenarioId,
  isExpanded56Scenario,
} from "@gaming-platform/catan";
import { INITIAL_LOBBY_ROOM_SEEDS } from "../../config/app-config.ts";
import {
  computeClientRoomHashPure,
  formatRoomHashLabelPure,
} from "../helpers/room-hash-and-links.ts";
import {
  rebuildRoomSeatsPure,
  removeRoomFromModelPure,
  setRoomInModelPure,
} from "../helpers/room-queries.ts";
import type {
  AppModel,
  ClientRoom,
  CreateLocalRoomOptions,
  SupportedGameId,
} from "../types.ts";

export function createLocalRoomPure(
  model: Readonly<AppModel>,
  opts: CreateLocalRoomOptions,
  nowMs: number = Date.now()
): { readonly model: AppModel; readonly room: ClientRoom } {
  const roomId =
    opts.customRoomId ??
    computeClientRoomHashPure(
      model.nextRoomNum,
      nowMs,
      `${opts.gameId}:${opts.ownerId}:${opts.customSeed ?? ""}`,
      model.rooms
    );
  const roomName = opts.name?.trim() || formatRoomHashLabelPure(roomId);
  const allBots = opts.allBots ?? false;
  const botDifficulty: BotDifficulty = opts.botDifficulty ?? "master";
  const humanPlayers: PlayerDescriptor[] = allBots
    ? []
    : [
        {
          id: opts.ownerId,
          name: opts.ownerName,
          color: PLAYER_COLORS[0]!,
          isBot: false,
        },
      ];

  const baseRoom: ClientRoom = {
    roomId,
    name: roomName,
    gameId: opts.gameId,
    isOfflineLocal: opts.isOfflineLocal ?? true,
    isPrivate: Boolean(opts.isPrivate),
    ownerId: opts.ownerId,
    ownerName: opts.ownerName,
    status: "lobby",
    humanPlayers,
    botCount: opts.botCount ?? (allBots ? 4 : 0),
    allBots,
    botDifficulty,
    startingPlayerMode: opts.startingPlayerMode ?? "random",
    autoStepBots: true,
    players: [],
    config: (() => {
      const scId = opts.scenarioId ?? "standard";
      const isCkPreset = Boolean(SCENARIO_CATALOG[scId]?.enableCitiesAndKnights);
      const is56Preset = isExpanded56Scenario(scId);
      return {
        scenarioId: scId,
        ...(opts.enable56PlayerExtension !== undefined
          ? { enable56PlayerExtension: opts.enable56PlayerExtension }
          : is56Preset
            ? { enable56PlayerExtension: true }
            : {}),
        enableHarbormaster: opts.enableHarbormaster ?? false,
        enableCityWalls:
          opts.enableCityWalls ??
          Boolean(opts.enableCitiesAndKnights || isCkPreset),
        enableFriendlyRobber: opts.enableFriendlyRobber ?? false,
        enableCitiesAndKnights: opts.enableCitiesAndKnights ?? isCkPreset,
        ...(opts.wonderSideMode ? { wonderSideMode: opts.wonderSideMode } : {}),
      };
    })(),
    seed: opts.customSeed ?? `arena-${roomId}-${nowMs % 10000}`,
    matchCounter: 0,
    session: null,
    remoteState: null,
    remoteActingPlayerId: null,
    canUndo: false,
    undoableSteps: 0,
    canRedo: false,
    step: 0,
  };

  const rebuilt = rebuildRoomSeatsPure(baseRoom);
  const nextModel = setRoomInModelPure(
    {
      ...model,
      nextRoomNum: model.nextRoomNum + 1,
    },
    rebuilt
  );
  return { model: nextModel, room: rebuilt };
}

export function seedInitialLobbyRoomsPure(
  model: Readonly<AppModel>,
  nowMs: number = Date.now()
): AppModel {
  return INITIAL_LOBBY_ROOM_SEEDS.reduce(
    (accModel, seedOpts) => createLocalRoomPure(accModel, seedOpts, nowMs).model,
    model
  );
}

export function upsertRoomFromSummaryPure(
  model: Readonly<AppModel>,
  summary: any,
  remoteState?: any,
  remoteActingPlayerId?: string | null,
  options?: { readonly isLobbySummaryOnly?: boolean }
): { readonly model: AppModel; readonly room: ClientRoom } {
  const existing = model.rooms[summary.roomId];
  const incomingRevision =
    typeof summary.revision === "number" ? summary.revision : undefined;
  const existingRevision = existing?.revision;
  if (
    existing &&
    incomingRevision !== undefined &&
    existingRevision !== undefined &&
    incomingRevision < existingRevision
  ) {
    return { model, room: existing };
  }

  const incomingGameId = (summary.gameId as SupportedGameId) ?? "catan";
  const incomingStatus = summary.status ?? "lobby";
  const gameOrMatchReset = Boolean(
    existing &&
      (existing.gameId !== incomingGameId ||
        (existing.status !== "lobby" && incomingStatus === "lobby"))
  );

  const preserveActiveGameFields = Boolean(
    !gameOrMatchReset &&
      options?.isLobbySummaryOnly &&
      remoteState === undefined &&
      existing &&
      existing.remoteState !== null
  );

  const players: PlayerDescriptor[] = Array.isArray(summary.players)
    ? summary.players
    : [];
  const humanPlayers = players.filter((p) => !p.isBot);
  const botCount =
    typeof summary.botCount === "number"
      ? summary.botCount
      : players.filter((p) => p.isBot).length;
  const cfg = summary.config ?? {};

  const resolvedRevision = preserveActiveGameFields
    ? existing?.revision
    : incomingRevision ?? existing?.revision;

  const room: ClientRoom = {
    roomId: summary.roomId,
    name: summary.name ?? "Table",
    gameId: (summary.gameId as SupportedGameId) ?? "catan",
    isOfflineLocal: false,
    isPrivate:
      summary.isPrivate !== undefined
        ? Boolean(summary.isPrivate)
        : (existing?.isPrivate ?? false),
    ownerId: summary.ownerId ?? "p1",
    ownerName: summary.ownerName ?? "Host",
    status: summary.status ?? "lobby",
    humanPlayers,
    botCount,
    allBots: Boolean(summary.allBots),
    botDifficulty:
      (summary.botDifficulty as BotDifficulty) ??
      (cfg.botDifficulty as BotDifficulty) ??
      "master",
    startingPlayerMode: summary.startingPlayerMode ?? "random",
    autoStepBots:
      summary.autoStepBots !== undefined ? Boolean(summary.autoStepBots) : true,
    players,
    config: (() => {
      const scId = (cfg.scenarioId as ScenarioId) ?? "standard";
      const isCkPreset = Boolean(SCENARIO_CATALOG[scId]?.enableCitiesAndKnights);
      const is56Preset = isExpanded56Scenario(scId);
      return {
        scenarioId: scId,
        ...(cfg.enable56PlayerExtension !== undefined || is56Preset
          ? {
              enable56PlayerExtension: Boolean(
                cfg.enable56PlayerExtension || is56Preset
              ),
            }
          : {}),
        enableHarbormaster: Boolean(cfg.enableHarbormaster),
        enableCityWalls: Boolean(
          cfg.enableCityWalls || cfg.enableCitiesAndKnights || isCkPreset
        ),
        enableFriendlyRobber: Boolean(cfg.enableFriendlyRobber),
        enableCitiesAndKnights: Boolean(
          cfg.enableCitiesAndKnights || isCkPreset
        ),
        ...(cfg.wonderSideMode
          ? { wonderSideMode: cfg.wonderSideMode as "random" | "day" | "night" }
          : {}),
      };
    })(),
    seed: existing?.seed ?? summary.roomId,
    matchCounter: existing?.matchCounter ?? 0,
    session: gameOrMatchReset ? null : (existing?.session ?? null),
    remoteState:
      remoteState !== undefined
        ? remoteState
        : gameOrMatchReset
          ? null
          : (existing?.remoteState ?? null),
    remoteActingPlayerId:
      remoteActingPlayerId !== undefined
        ? remoteActingPlayerId
        : gameOrMatchReset
          ? null
          : (existing?.remoteActingPlayerId ?? null),
    canUndo: preserveActiveGameFields
      ? existing!.canUndo
      : summary.canUndo !== undefined
        ? Boolean(summary.canUndo)
        : (existing?.canUndo ?? false),
    undoableSteps: preserveActiveGameFields
      ? existing!.undoableSteps
      : typeof summary.undoableSteps === "number"
        ? summary.undoableSteps
        : (existing?.undoableSteps ?? 0),
    canRedo: preserveActiveGameFields
      ? existing!.canRedo
      : summary.canRedo !== undefined
        ? Boolean(summary.canRedo)
        : (existing?.canRedo ?? false),
    step: preserveActiveGameFields
      ? existing!.step
      : typeof summary.step === "number"
        ? summary.step
        : (existing?.step ?? 0),
    ...(resolvedRevision !== undefined ? { revision: resolvedRevision } : {}),
    ...(Array.isArray(summary.offlinePlayerIds) &&
    summary.offlinePlayerIds.length > 0
      ? { offlinePlayerIds: summary.offlinePlayerIds.slice() }
      : {}),
  };

  const nextModel = setRoomInModelPure(
    {
      ...model,
      autoRespondBotsToHuman:
        room.roomId === model.activeRoomId
          ? room.autoStepBots
          : model.autoRespondBotsToHuman,
    },
    room
  );
  return { model: nextModel, room };
}

export function syncOnlineLobbyRoomsPure(
  model: Readonly<AppModel>,
  summaries: readonly any[]
): AppModel {
  const incomingIds = new Set(summaries.map((s) => s.roomId));
  const keepActiveUnpruned =
    (model.viewMode === "room_setup" || model.viewMode === "in_game") &&
    Boolean(model.activeRoomId);

  const prunedModel = model.roomOrder.reduce<AppModel>((acc, id) => {
    const existing = acc.rooms[id];
    if (
      existing &&
      !existing.isOfflineLocal &&
      (!keepActiveUnpruned || id !== acc.activeRoomId) &&
      !incomingIds.has(id)
    ) {
      return removeRoomFromModelPure(acc, id);
    }
    return acc;
  }, model);

  return summaries.reduce<AppModel>(
    (acc, s) =>
      upsertRoomFromSummaryPure(acc, s, undefined, undefined, {
        isLobbySummaryOnly: true,
      }).model,
    prunedModel
  );
}
