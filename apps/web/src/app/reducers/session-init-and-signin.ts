import type { PlayerDescriptor } from "@gaming-platform/core";
import { PLAYER_COLORS, emptyCommodities, emptyResources } from "@gaming-platform/catan";
import { DEFAULT_CATAN_MAP_VIEWPORT } from "../../catan-graphics/viewport.ts";
import {
  DEFAULT_AUTOPLAY_SPEED_MS,
  DEFAULT_BOT_MOVE_THROTTLE_MS,
  DEFAULT_SHOW_BOT_MOVES,
  clampBotMoveThrottleMsPure,
} from "../../config/app-config.ts";
import {
  extractDebugModeFromLocationPure,
  extractInviteRoomHashFromLocationPure,
} from "../helpers/room-hash-and-links.ts";
import { getRoomBoundsPure, rebuildRoomSeatsPure, removeRoomFromModelPure, setRoomInModelPure, upsertDeviceGuestListPure } from "../helpers/room-queries.ts";
import type { AppModel, AppViewMode, GuestSession, MultiGamePlatformAppOptions } from "../types.ts";
import { seedInitialLobbyRoomsPure } from "./room-sync-reducers.ts";
import { resetSubModesPure } from "./trade-and-draft-reducers.ts";

export function createInitialAppModelPure(
  options: MultiGamePlatformAppOptions | undefined,
  env: {
    readonly isStaticHost: boolean;
    readonly isBrowserHttp: boolean;
    readonly randomGuestSuffix: number;
    readonly deviceGuests: readonly GuestSession[];
    readonly savedGuest: GuestSession | null;
    readonly lastActiveGuestId?: string | null;
    readonly nowMs: number;
    readonly locationSearch?: string;
    readonly locationHash?: string;
    readonly savedShowBotMoves?: boolean | null;
    readonly savedBotMoveThrottleMs?: number | null;
  }
): AppModel {
  const staticHostOnly = env.isStaticHost;
  const useServerBackend = env.isBrowserHttp && !env.isStaticHost;
  const serverReachable = !env.isStaticHost;
  const createRoomMode: "online" | "offline" = useServerBackend
    ? "online"
    : "offline";
  const initialDraftName = `Guest ${env.randomGuestSuffix}`;
  const pendingInviteRoomId = extractInviteRoomHashFromLocationPure(
    env.locationSearch ?? "",
    env.locationHash ?? ""
  );

  const fallbackReopenGuest =
    !env.savedGuest &&
    options?.startAtLogin === undefined &&
    pendingInviteRoomId &&
    env.lastActiveGuestId
      ? env.deviceGuests.find((g) => g.id === env.lastActiveGuestId) ?? null
      : null;

  const effectiveSavedGuest = env.savedGuest ?? fallbackReopenGuest;

  const authInit = ((): {
    currentUserId: string;
    currentUserName: string;
    loginDraftName: string;
    deviceGuests: GuestSession[];
    isAuthenticated: boolean;
    viewMode: AppViewMode;
  } => {
    if (effectiveSavedGuest) {
      return {
        currentUserId: effectiveSavedGuest.id,
        currentUserName: effectiveSavedGuest.name,
        loginDraftName: effectiveSavedGuest.name,
        deviceGuests: upsertDeviceGuestListPure(
          env.deviceGuests,
          effectiveSavedGuest
        ),
        isAuthenticated: true,
        viewMode: "lobby",
      };
    }
    if (options?.startAtLogin !== undefined) {
      const isAuth = !options.startAtLogin;
      const guests = isAuth
        ? upsertDeviceGuestListPure(env.deviceGuests, {
            id: "p1",
            name: "Player 1 (You)",
            mode: "guest",
          })
        : [...env.deviceGuests];
      return {
        currentUserId: "p1",
        currentUserName: "Player 1 (You)",
        loginDraftName: initialDraftName,
        deviceGuests: guests,
        isAuthenticated: isAuth,
        viewMode: options.startAtLogin ? "login" : "lobby",
      };
    }
    if (env.isBrowserHttp || env.isStaticHost) {
      return {
        currentUserId: "p1",
        currentUserName: "Player 1 (You)",
        loginDraftName: initialDraftName,
        deviceGuests: [...env.deviceGuests],
        isAuthenticated: false,
        viewMode: "login",
      };
    }
    return {
      currentUserId: "p1",
      currentUserName: "Player 1 (You)",
      loginDraftName: initialDraftName,
      deviceGuests: upsertDeviceGuestListPure(env.deviceGuests, {
        id: "p1",
        name: "Player 1 (You)",
        mode: "guest",
      }),
      isAuthenticated: true,
      viewMode: "lobby",
    };
  })();

  const baseModel: AppModel = {
    viewMode: authInit.viewMode,
    lobbyGameFilter: "catan",
    lobbyHeroEnteredOnce: false,
    loginHeroEnteredOnce: false,
    useServerBackend,
    staticHostOnly,
    serverReachable,
    hasEverReachedServer: false,
    inspectingSetupDuringMatch: false,
    isAuthenticated: authInit.isAuthenticated,
    addingAdditionalGuest: false,
    returnViewAfterAddGuest: "lobby",
    loginDraftName: authInit.loginDraftName,
    loginErrorMsg: "",
    currentUserId: authInit.currentUserId,
    currentUserName: authInit.currentUserName,
    editingGuestName: false,
    guestRenameDraft: "",
    deviceGuests: authInit.deviceGuests,
    localFriendDraftName: "",
    hidePassAndPlayHand: false,
    createRoomName: "",
    createRoomGameId: "catan",
    createRoomMode,
    pendingInviteRoomId,
    copiedRoomLinkId: null,
    rooms: {},
    roomOrder: [],
    nextRoomNum: 1,
    activeRoomId: "room-1",
    buildMode: null,
    selectedBoardSpot: null,
    catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
    setupEdgeKind: "road",
    robberOrPirateMode: "robber",
    selectedMoveFromEdgeId: null,
    selectedMoveKnightFromVertexId: null,
    selectedChaseKnightVertexId: null,
    discardSelection: emptyResources(),
    discardCommodities: emptyCommodities(),
    tradeGiveRes: "brick",
    tradeReceiveRes: "ore",
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    maritimeCommGive: emptyCommodities(),
    maritimeCommWant: emptyCommodities(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticCommGive: emptyCommodities(),
    domesticCommWant: emptyCommodities(),
    domesticTargetPlayerId: "all",
    selectedMetropolisVertexId: null,
    selectedProgressCardId: null,
    alchemistDie1: 4,
    alchemistDie2: 3,
    inventorHex1: null,
    smithVertex1: null,
    deserterTargetPlayerId: null,
    yopRes1: "grain",
    yopRes2: "ore",
    monoRes: "ore",
    splendorDraftGems: {},
    azulSelectedDraft: null,
    azulInspectedPlayerId: null,
    sevenWondersSelectedCardId: null,
    sevenWondersInspectedPlayerId: null,
    activeTutorial: null,
    guideModalGameId: null,
    sidebarSettingsExpanded: false,
    mapBuildMenuExpanded: false,
    debugMode:
      options?.debugMode !== undefined
        ? Boolean(options.debugMode)
        : extractDebugModeFromLocationPure(
            env.locationSearch ?? "",
            env.locationHash ?? ""
          ),
    autoPlayBots: false,
    autoRespondBotsToHuman: true,
    autoPlaySpeedMs: DEFAULT_AUTOPLAY_SPEED_MS,
    showBotMoves:
      env.savedShowBotMoves !== undefined && env.savedShowBotMoves !== null
        ? Boolean(env.savedShowBotMoves)
        : DEFAULT_SHOW_BOT_MOVES,
    botFeedHistoryExpanded: false,
    botMoveThrottleMs:
      env.savedBotMoveThrottleMs !== undefined &&
      env.savedBotMoveThrottleMs !== null
        ? clampBotMoveThrottleMsPure(env.savedBotMoveThrottleMs)
        : DEFAULT_BOT_MOVE_THROTTLE_MS,
  };

  if (!useServerBackend && !staticHostOnly) {
    return seedInitialLobbyRoomsPure(baseModel, env.nowMs);
  }
  return baseModel;
}

export function resolveGuestSignInPure(
  model: Readonly<AppModel>,
  rawName: string | undefined,
  randomToken: string,
  nowMs: number,
  existingGuestId?: string
):
  | { readonly ok: false; readonly model: AppModel }
  | {
      readonly ok: true;
      readonly model: AppModel;
      readonly session: GuestSession;
    } {
  const clean = (rawName ?? model.loginDraftName).trim();
  if (!clean) {
    return {
      ok: false,
      model: {
        ...model,
        loginErrorMsg: "Enter a guest display name to continue.",
      },
    };
  }

  const trimmedName = clean.slice(0, 28);
  const matchedById = existingGuestId
    ? model.deviceGuests.find((g) => g.id === existingGuestId)
    : undefined;
  const matchedByName = !matchedById
    ? model.deviceGuests.find(
        (g) => g.name.toLowerCase() === trimmedName.toLowerCase()
      )
    : undefined;

  const session: GuestSession = matchedById
    ? { id: matchedById.id, name: trimmedName, mode: "guest" }
    : matchedByName
      ? { id: matchedByName.id, name: trimmedName, mode: "guest" }
      : {
          id: `guest-${randomToken}-${nowMs % 10000}`,
          name: trimmedName,
          mode: "guest",
        };

  const withGuest: AppModel = {
    ...model,
    currentUserId: session.id,
    currentUserName: session.name,
    loginDraftName: session.name,
    loginErrorMsg: "",
    isAuthenticated: true,
    addingAdditionalGuest: false,
    deviceGuests: upsertDeviceGuestListPure(model.deviceGuests, session),
    viewMode: "lobby",
  };

  const firstRoom = withGuest.rooms["room-1"];
  const withClaimedRoom1 =
    !withGuest.useServerBackend &&
    withGuest.roomOrder.length > 0 &&
    firstRoom &&
    firstRoom.status === "lobby" &&
    firstRoom.ownerId === "p1"
      ? setRoomInModelPure(
          withGuest,
          rebuildRoomSeatsPure({
            ...firstRoom,
            ownerId: session.id,
            ownerName: session.name,
            humanPlayers: [
              {
                id: session.id,
                name: session.name,
                color: PLAYER_COLORS[0]!,
                isBot: false,
              },
            ],
          })
        )
      : withGuest;

  return { ok: true, model: withClaimedRoom1, session };
}

export function addOfflineLocalFriendPure(
  model: Readonly<AppModel>,
  roomId: string,
  rawName: string,
  randomToken: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;
  const cleanName = rawName.trim() || `Player ${room.humanPlayers.length + 1}`;
  const bounds = getRoomBoundsPure(room);
  if (room.humanPlayers.length >= bounds.maxPlayers) return model;

  const localId = `local-${randomToken}-${room.humanPlayers.length + 1}`;
  const nextHuman: PlayerDescriptor = {
    id: localId,
    name: cleanName.slice(0, 28),
    color: PLAYER_COLORS[room.humanPlayers.length % PLAYER_COLORS.length]!,
    isBot: false,
    controllerId: room.ownerId,
  };

  const rebuilt = rebuildRoomSeatsPure({
    ...room,
    humanPlayers: [...room.humanPlayers, nextHuman],
  });

  return setRoomInModelPure(
    {
      ...model,
      localFriendDraftName: "",
    },
    rebuilt
  );
}

export function removeOfflinePlayerPure(
  model: Readonly<AppModel>,
  roomId: string,
  targetPlayerId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room || targetPlayerId === room.ownerId) return model;

  const rebuilt = rebuildRoomSeatsPure({
    ...room,
    humanPlayers: room.humanPlayers.filter((p) => p.id !== targetPlayerId),
  });
  return setRoomInModelPure(model, rebuilt);
}

export function enterOfflineRoomPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;

  if (room.status === "lobby" || room.status === "finished") {
    const alreadySeated = room.humanPlayers.some(
      (p) => p.id === model.currentUserId
    );
    const bounds = getRoomBoundsPure(room);
    const updatedRoom =
      !alreadySeated &&
      !room.allBots &&
      room.humanPlayers.length < bounds.maxPlayers
        ? rebuildRoomSeatsPure({
            ...room,
            humanPlayers: [
              ...room.humanPlayers,
              {
                id: model.currentUserId,
                name: model.currentUserName,
                color:
                  PLAYER_COLORS[
                    room.humanPlayers.length % PLAYER_COLORS.length
                  ]!,
                isBot: false,
              },
            ],
          })
        : room;

    return resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          activeRoomId: roomId,
          viewMode: "room_setup",
          catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
        },
        updatedRoom
      )
    );
  }

  return resetSubModesPure({
    ...model,
    activeRoomId: roomId,
    viewMode: "in_game",
    catanMapViewport:
      roomId !== model.activeRoomId
        ? DEFAULT_CATAN_MAP_VIEWPORT
        : model.catanMapViewport,
  });
}

export function leaveOfflineRoomPure(
  model: Readonly<AppModel>,
  roomId: string
): AppModel {
  const room = model.rooms[roomId];
  if (!room) return model;

  if (room.status !== "in_progress") {
    const remainingHumans = room.humanPlayers.filter(
      (p) =>
        p.id !== model.currentUserId && p.controllerId !== model.currentUserId
    );
    if (remainingHumans.length === 0 && !room.allBots) {
      const removed = removeRoomFromModelPure(model, room.roomId);
      const nextActive = removed.roomOrder[0] ?? "";
      return resetSubModesPure({
        ...removed,
        activeRoomId: nextActive,
        viewMode: "lobby",
        catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
      });
    }
    const nextOwnerId =
      room.ownerId === model.currentUserId && remainingHumans.length > 0
        ? remainingHumans[0]!.id
        : room.ownerId;
    const nextOwnerName =
      room.ownerId === model.currentUserId && remainingHumans.length > 0
        ? remainingHumans[0]!.name
        : room.ownerName;
    const rebuilt = rebuildRoomSeatsPure({
      ...room,
      ownerId: nextOwnerId,
      ownerName: nextOwnerName,
      humanPlayers: remainingHumans,
    });
    return resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          viewMode: "lobby",
          catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
        },
        rebuilt
      )
    );
  }

  return resetSubModesPure({
    ...model,
    viewMode: "lobby",
    catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
  });
}
