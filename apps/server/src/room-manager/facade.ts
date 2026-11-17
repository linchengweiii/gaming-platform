import {
  type GameRegistry,
  type MatchSession,
  type MatchSessionState,
  canSessionPlayerRedo,
  canSessionPlayerUndo,
  createMatchSessionState,
  dispatchSessionActionPure,
  getRegisteredEnginePure,
  getSessionActionLog,
  getSessionState,
  getSessionStep,
  getSessionTotalSteps,
  getSessionUndoableStepCount,
  jumpSessionToStepPure,
  listRegisteredGamesPure,
  redoSessionForPlayerPure,
  redoSessionPure,
  registerEnginePure,
  undoSessionForPlayerPure,
  undoSessionPure,
} from "@gaming-platform/core";
import {
  canViewerControlActorPure,
  createInitialRoomManagerState,
  getRoomPlayerBoundsPure,
  getRoomRecordPure,
  listRoomsPure,
  setRoomRecordInState,
  toRoomSummaryPure,
} from "./helpers.ts";
import {
  addLocalPlayerPure,
  createRoomPure,
  removeLocalPlayerPure,
  updateRoomSetupPure,
} from "./lifecycle-and-setup.ts";
import {
  dispatchActionPure,
  finishCatanSetupWithBotsPure,
  redoActionPure,
  setRoomAutoStepBotsPure,
  startGamePure,
  stepBotPure,
  undoActionPure,
} from "./match-actions.ts";
import {
  closeRoomPure,
  joinRoomPure,
  leaveRoomPure,
  renameGuestEverywherePure,
  signOutGuestEverywherePure,
} from "./seats-and-guests.ts";
import type {
  PlatformRoomManager as PlatformRoomManagerHandle,
  PlatformRoomManagerConstructor,
  RoomInstance,
  RoomManagerState,
  RoomRecord,
} from "./types.ts";

export type PlatformRoomManager = PlatformRoomManagerHandle;

export function createPlatformRoomManager(): PlatformRoomManager {
  let state: RoomManagerState = createInitialRoomManagerState();
  const roomLensCache = new Map<string, RoomInstance>();

  const registryLens: GameRegistry = {
    register(engine) {
      state = {
        ...state,
        registry: registerEnginePure(state.registry, engine),
      };
    },
    get(gameId) {
      return getRegisteredEnginePure(state.registry, gameId);
    },
    list() {
      return listRegisteredGamesPure(state.registry);
    },
  };

  function createSessionLens(roomId: string): MatchSession<any, any, any> {
    const readRoom = (): RoomRecord => getRoomRecordPure(state, roomId);
    const readSession = (): MatchSessionState<any, any> => {
      const s = readRoom().sessionState;
      if (!s) throw new Error("Game has not started in this room");
      return s;
    };
    const writeSession = (nextSession: MatchSessionState<any, any>): void => {
      const curRoom = readRoom();
      const curGame = getSessionState(nextSession);
      state = setRoomRecordInState(state, {
        ...curRoom,
        sessionState: nextSession,
        status:
          curGame?.phase === "GAME_OVER"
            ? "finished"
            : curRoom.status === "finished"
              ? "in_progress"
              : curRoom.status,
      });
    };

    return {
      get engine() {
        return getRegisteredEnginePure(state.registry, readRoom().gameId);
      },
      get enforceInvariants() {
        return readSession().enforceInvariants;
      },
      getState: () => getSessionState(readSession()),
      getStep: () => getSessionStep(readSession()),
      getTotalSteps: () => getSessionTotalSteps(readSession()),
      getActionLog: () => getSessionActionLog(readSession()),
      dispatch(playerId: string, action: any) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        const dispatched = dispatchSessionActionPure(
          engine,
          readSession(),
          playerId,
          action
        );
        writeSession(dispatched.session);
        return dispatched.result;
      },
      canUndo: () => getSessionStep(readSession()) > 0,
      canRedo: () =>
        getSessionStep(readSession()) < getSessionTotalSteps(readSession()),
      getUndoableStepCount(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        return getSessionUndoableStepCount(engine, readSession(), playerId);
      },
      canPlayerUndo(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        return canSessionPlayerUndo(engine, readSession(), playerId);
      },
      canPlayerRedo: (playerId: string | null) =>
        canSessionPlayerRedo(readSession(), playerId),
      undoForPlayer(playerId: string | null) {
        const room = readRoom();
        const engine = getRegisteredEnginePure(state.registry, room.gameId);
        const nextSession = undoSessionForPlayerPure(
          engine,
          readSession(),
          playerId
        );
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      redoForPlayer(playerId: string | null) {
        const nextSession = redoSessionForPlayerPure(readSession(), playerId);
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      undo() {
        const nextSession = undoSessionPure(readSession());
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      redo() {
        const nextSession = redoSessionPure(readSession());
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
      jumpToStep(step: number) {
        const nextSession = jumpSessionToStepPure(readSession(), step);
        writeSession(nextSession);
        return getSessionState(nextSession);
      },
    };
  }

  function getOrCreateRoomLens(rawRoomId: string): RoomInstance {
    const initialRec = getRoomRecordPure(state, rawRoomId);
    const roomId = initialRec.roomId;
    const cached = roomLensCache.get(roomId);
    if (cached) return cached;

    let lastKnownRecord: RoomRecord = initialRec;
    const sessionLens = createSessionLens(roomId);

    const target = {} as RoomInstance;
    const proxy = new Proxy(target, {
      get(_t, prop: string | symbol) {
        const current = state.rooms[roomId];
        if (current) {
          lastKnownRecord = current;
        }
        const rec = current ?? lastKnownRecord;
        if (prop === "session") {
          return rec.sessionState ? sessionLens : null;
        }
        if (prop === Symbol.toStringTag) {
          return "RoomInstance";
        }
        return (rec as unknown as Record<string | symbol, unknown>)[prop];
      },
      set(_t, prop: string | symbol, value: unknown) {
        const current = state.rooms[roomId];
        if (!current || typeof prop !== "string") {
          return true;
        }
        if (prop === "session") {
          const nextSessionState =
            value &&
            typeof (value as MatchSession<any, any, any>).getState === "function"
              ? createMatchSessionState(
                  getRegisteredEnginePure(state.registry, current.gameId),
                  (value as MatchSession<any, any, any>).getState(),
                  (value as MatchSession<any, any, any>).enforceInvariants
                )
              : null;
          const updated: RoomRecord = {
            ...current,
            sessionState: nextSessionState,
          };
          lastKnownRecord = updated;
          state = setRoomRecordInState(state, updated);
          return true;
        }
        const updated = {
          ...current,
          [prop]: value,
        } as RoomRecord;
        lastKnownRecord = updated;
        state = setRoomRecordInState(state, updated);
        return true;
      },
      ownKeys() {
        const rec = state.rooms[roomId] ?? lastKnownRecord;
        return [
          ...Object.keys(rec).filter((k) => k !== "sessionState"),
          "session",
        ];
      },
      getOwnPropertyDescriptor(_t, prop: string | symbol) {
        const rec = state.rooms[roomId] ?? lastKnownRecord;
        if (prop === "session") {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: rec.sessionState ? sessionLens : null,
          };
        }
        if (
          typeof prop === "string" &&
          prop in rec &&
          prop !== "sessionState"
        ) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: (rec as unknown as Record<string, unknown>)[prop],
          };
        }
        return undefined;
      },
    });

    roomLensCache.set(roomId, proxy);
    return proxy;
  }

  return {
    registry: registryLens,
    getStateSnapshot: () => state,
    getRoomPlayerBounds: (gameId, config) =>
      getRoomPlayerBoundsPure(state.registry, gameId, config),
    canViewerControlActor: (room, viewerId, actorId) =>
      canViewerControlActorPure(room, viewerId, actorId),
    toRoomSummary(r, viewerId) {
      const rec = state.rooms[r.roomId];
      if (rec) {
        return toRoomSummaryPure(state.registry, rec, viewerId);
      }
      if ("sessionState" in r) {
        return toRoomSummaryPure(state.registry, r, viewerId);
      }
      const engine = getRegisteredEnginePure(state.registry, r.gameId);
      const fallbackRec: RoomRecord = {
        roomId: r.roomId,
        name: r.name,
        gameId: r.gameId,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        status: r.status,
        humanPlayers: r.humanPlayers,
        botCount: r.botCount,
        botDifficulty: r.botDifficulty,
        allBots: r.allBots,
        startingPlayerMode: r.startingPlayerMode,
        autoStepBots: r.autoStepBots,
        players: r.players,
        config: r.config,
        seed: r.seed,
        matchCounter: r.matchCounter,
        sessionState: r.session
          ? createMatchSessionState(engine, r.session.getState(), false)
          : null,
        revision: r.revision ?? 1,
        createdAt: r.createdAt,
      };
      return toRoomSummaryPure(state.registry, fallbackRec, viewerId);
    },
    listRooms: (gameFilter) => listRoomsPure(state, gameFilter),
    getRoom(roomId) {
      return getOrCreateRoomLens(roomId);
    },
    createRoom(options) {
      const created = createRoomPure(state, options);
      state = created.state;
      return getOrCreateRoomLens(created.roomId);
    },
    updateRoomSetup(roomId, requesterId, updates) {
      state = updateRoomSetupPure(state, roomId, requesterId, updates);
      return getOrCreateRoomLens(roomId);
    },
    addLocalPlayer(roomId, requesterId, playerName) {
      const added = addLocalPlayerPure(state, roomId, requesterId, playerName);
      state = added.state;
      return added.player;
    },
    removeLocalPlayer(roomId, requesterId, targetPlayerId) {
      state = removeLocalPlayerPure(state, roomId, requesterId, targetPlayerId);
      return getOrCreateRoomLens(roomId);
    },
    joinRoom(roomId, playerName, isBot = false, preferredPlayerId) {
      const joined = joinRoomPure(
        state,
        roomId,
        playerName,
        isBot,
        preferredPlayerId
      );
      state = joined.state;
      return joined.player;
    },
    leaveRoom(roomId, playerId) {
      const canonicalId = getRoomRecordPure(state, roomId).roomId;
      const left = leaveRoomPure(state, canonicalId, playerId);
      state = left.state;
      if (left.closed) {
        roomLensCache.delete(canonicalId);
        return null;
      }
      return getOrCreateRoomLens(canonicalId);
    },
    closeRoom(roomId) {
      const canonicalId = (() => {
        try {
          return getRoomRecordPure(state, roomId).roomId;
        } catch {
          return roomId;
        }
      })();
      const closed = closeRoomPure(state, canonicalId);
      state = closed.state;
      if (closed.closed) {
        roomLensCache.delete(canonicalId);
      }
      return closed.closed;
    },
    signOutGuest(playerId) {
      const signedOut = signOutGuestEverywherePure(state, playerId);
      state = signedOut.state;
      signedOut.closedRoomIds.forEach((id) => roomLensCache.delete(id));
      return {
        closedRoomIds: signedOut.closedRoomIds,
        updatedRoomIds: signedOut.updatedRoomIds,
      };
    },
    renameGuest(playerId, newName) {
      const renamed = renameGuestEverywherePure(state, playerId, newName);
      state = renamed.state;
      return {
        cleanName: renamed.cleanName,
        updatedRoomIds: renamed.updatedRoomIds,
      };
    },
    startGame(roomId, requesterId) {
      const started = startGamePure(state, roomId, requesterId);
      state = started.state;
      return started.gameState;
    },
    dispatchAction(roomId, playerId, action) {
      const dispatched = dispatchActionPure(state, roomId, playerId, action);
      state = dispatched.state;
      return dispatched.gameState;
    },
    undoAction(roomId, requesterId) {
      const undone = undoActionPure(state, roomId, requesterId);
      state = undone.state;
      return undone.gameState;
    },
    redoAction(roomId, requesterId) {
      const redone = redoActionPure(state, roomId, requesterId);
      state = redone.state;
      return redone.gameState;
    },
    finishCatanSetupWithBots(roomId) {
      const finished = finishCatanSetupWithBotsPure(state, roomId);
      state = finished.state;
      return finished.gameState;
    },
    stepBot(roomId, options) {
      const stepped = stepBotPure(state, roomId, options);
      state = stepped.state;
      return {
        actedPlayerId: stepped.actedPlayerId,
        action: stepped.action,
        state: stepped.gameState,
      };
    },
    setRoomAutoStepBots(roomId, enabled) {
      state = setRoomAutoStepBotsPure(state, roomId, enabled);
      return getOrCreateRoomLens(roomId);
    },
  };
}

export const PlatformRoomManager: PlatformRoomManagerConstructor =
  createPlatformRoomManager as unknown as PlatformRoomManagerConstructor;
