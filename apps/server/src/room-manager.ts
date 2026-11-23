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
  getRoomActingPlayerId,
  getRoomRecordPure,
  listRoomsPure,
  setRoomRecordInState,
  toRoomSummaryPure,
} from "./room-manager/helpers.ts";
import {
  addLocalPlayerPure,
  createRoomPure,
  removeLocalPlayerPure,
  updateRoomSetupPure,
} from "./room-manager/lifecycle-and-setup.ts";
import {
  dispatchActionPure,
  finishCatanSetupWithBotsPure,
  redoActionPure,
  setRoomAutoStepBotsPure,
  setRoomBotStepDelayPure,
  startGamePure,
  stepBotPure,
  undoActionPure,
} from "./room-manager/match-actions.ts";
import {
  closeRoomPure,
  joinRoomPure,
  leaveRoomPure,
  renameGuestEverywherePure,
  signOutGuestEverywherePure,
} from "./room-manager/seats-and-guests.ts";
import type {
  PlatformRoomManager as PlatformRoomManagerHandle,
  PlatformRoomManagerConstructor,
  RoomInstance,
  RoomManagerState,
  RoomRecord,
  RoomSummary,
} from "./room-manager/types.ts";

export type { RoomInstance, RoomSummary };
export type PlatformRoomManager = PlatformRoomManagerHandle;
export {
  createInitialRoomManagerState,
  createRoomPure,
  dispatchActionPure,
  getRoomActingPlayerId,
  startGamePure,
  updateRoomSetupPure,
};

export function createPlatformRoomManager(): PlatformRoomManager {
  let state: RoomManagerState = createInitialRoomManagerState();
  const roomLensCache = new Map<string, RoomInstance>();

  const registryLens: GameRegistry = {
    register(engine) {
      state = { ...state, registry: registerEnginePure(state.registry, engine) };
    },
    get: (gameId) => getRegisteredEnginePure(state.registry, gameId),
    list: () => listRegisteredGamesPure(state.registry),
  };

  function createSessionLens(roomId: string): MatchSession<any, any, any> {
    const readRoom = (): RoomRecord => getRoomRecordPure(state, roomId);
    const readEngine = () =>
      getRegisteredEnginePure(state.registry, readRoom().gameId);
    const readSession = (): MatchSessionState<any, any> => {
      const s = readRoom().sessionState;
      if (!s) throw new Error("Game has not started in this room");
      return s;
    };
    const commitSession = (nextSession: MatchSessionState<any, any>) => {
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
      return curGame;
    };

    return {
      get engine() {
        return readEngine();
      },
      get enforceInvariants() {
        return readSession().enforceInvariants;
      },
      getState: () => getSessionState(readSession()),
      getStep: () => getSessionStep(readSession()),
      getTotalSteps: () => getSessionTotalSteps(readSession()),
      getActionLog: () => getSessionActionLog(readSession()),
      dispatch(playerId: string, action: any) {
        const dispatched = dispatchSessionActionPure(
          readEngine(),
          readSession(),
          playerId,
          action
        );
        commitSession(dispatched.session);
        return dispatched.result;
      },
      canUndo: () => getSessionStep(readSession()) > 0,
      canRedo: () =>
        getSessionStep(readSession()) < getSessionTotalSteps(readSession()),
      getUndoableStepCount: (playerId) =>
        getSessionUndoableStepCount(readEngine(), readSession(), playerId),
      canPlayerUndo: (playerId) =>
        canSessionPlayerUndo(readEngine(), readSession(), playerId),
      canPlayerRedo: (playerId) =>
        canSessionPlayerRedo(readSession(), playerId),
      undoForPlayer: (playerId) =>
        commitSession(
          undoSessionForPlayerPure(readEngine(), readSession(), playerId)
        ),
      redoForPlayer: (playerId) =>
        commitSession(redoSessionForPlayerPure(readSession(), playerId)),
      undo: () => commitSession(undoSessionPure(readSession())),
      redo: () => commitSession(redoSessionPure(readSession())),
      jumpToStep: (step) =>
        commitSession(jumpSessionToStepPure(readSession(), step)),
    };
  }

  function getOrCreateRoomLens(rawRoomId: string): RoomInstance {
    const initialRec = getRoomRecordPure(state, rawRoomId);
    const roomId = initialRec.roomId;
    const cached = roomLensCache.get(roomId);
    if (cached) return cached;

    let lastKnownRecord: RoomRecord = initialRec;
    const sessionLens = createSessionLens(roomId);
    const readCurrent = (): RoomRecord => {
      const current = state.rooms[roomId];
      if (current) lastKnownRecord = current;
      return current ?? lastKnownRecord;
    };

    const proxy = new Proxy({} as RoomInstance, {
      get(_t, prop: string | symbol) {
        const rec = readCurrent();
        if (prop === "session") return rec.sessionState ? sessionLens : null;
        if (prop === Symbol.toStringTag) return "RoomInstance";
        return (rec as unknown as Record<string | symbol, unknown>)[prop];
      },
      set(_t, prop: string | symbol, value: unknown) {
        const current = state.rooms[roomId];
        if (!current || typeof prop !== "string") return true;
        const updated: RoomRecord =
          prop === "session"
            ? {
                ...current,
                sessionState:
                  value &&
                  typeof (value as MatchSession<any, any, any>).getState ===
                    "function"
                    ? createMatchSessionState(
                        getRegisteredEnginePure(state.registry, current.gameId),
                        (value as MatchSession<any, any, any>).getState(),
                        (value as MatchSession<any, any, any>).enforceInvariants
                      )
                    : null,
              }
            : ({ ...current, [prop]: value } as RoomRecord);
        lastKnownRecord = updated;
        state = setRoomRecordInState(state, updated);
        return true;
      },
      ownKeys() {
        return [
          ...Object.keys(readCurrent()).filter((k) => k !== "sessionState"),
          "session",
        ];
      },
      getOwnPropertyDescriptor(_t, prop: string | symbol) {
        const rec = readCurrent();
        if (prop === "session") {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: rec.sessionState ? sessionLens : null,
          };
        }
        if (typeof prop === "string" && prop in rec && prop !== "sessionState") {
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

  const commitGameState = (res: { state: RoomManagerState; gameState: any }) => {
    state = res.state;
    return res.gameState;
  };

  return {
    registry: registryLens,
    getStateSnapshot: () => state,
    canViewerControlActor: canViewerControlActorPure,
    toRoomSummary(r, viewerId) {
      const existing = state.rooms[r.roomId];
      if (existing) return toRoomSummaryPure(state.registry, existing, viewerId);
      if ("sessionState" in r) {
        return toRoomSummaryPure(state.registry, r, viewerId);
      }
      const engine = getRegisteredEnginePure(state.registry, r.gameId);
      const fallbackRec: RoomRecord = {
        ...r,
        isPrivate: Boolean(r.isPrivate),
        revision: r.revision ?? 1,
        sessionState: r.session
          ? createMatchSessionState(engine, r.session.getState(), false)
          : null,
      };
      return toRoomSummaryPure(state.registry, fallbackRec, viewerId);
    },
    listRooms: (gameFilter, viewerId) =>
      listRoomsPure(state, gameFilter, viewerId),
    getRoom: getOrCreateRoomLens,
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
      const closed = closeRoomPure(state, roomId);
      state = closed.state;
      if (closed.closed) roomLensCache.delete(closed.canonicalId);
      return closed.closed;
    },
    signOutGuest(playerId) {
      const { state: next, closedRoomIds, updatedRoomIds } =
        signOutGuestEverywherePure(state, playerId);
      state = next;
      closedRoomIds.forEach((id) => roomLensCache.delete(id));
      return { closedRoomIds, updatedRoomIds };
    },
    renameGuest(playerId, newName) {
      const { state: next, cleanName, updatedRoomIds } =
        renameGuestEverywherePure(state, playerId, newName);
      state = next;
      return { cleanName, updatedRoomIds };
    },
    startGame: (roomId, requesterId) =>
      commitGameState(startGamePure(state, roomId, requesterId)),
    dispatchAction: (roomId, playerId, action) =>
      commitGameState(dispatchActionPure(state, roomId, playerId, action)),
    undoAction: (roomId, requesterId) =>
      commitGameState(undoActionPure(state, roomId, requesterId)),
    redoAction: (roomId, requesterId) =>
      commitGameState(redoActionPure(state, roomId, requesterId)),
    finishCatanSetupWithBots: (roomId) =>
      commitGameState(finishCatanSetupWithBotsPure(state, roomId)),
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
    setRoomBotStepDelay(roomId, delayMs) {
      state = setRoomBotStepDelayPure(state, roomId, delayMs);
      return getOrCreateRoomLens(roomId);
    },
  };
}

export const PlatformRoomManager: PlatformRoomManagerConstructor =
  createPlatformRoomManager as unknown as PlatformRoomManagerConstructor;
