import {
  type MatchSessionState,
  createMatchSessionState,
  dispatchSessionActionPure,
  getRegisteredEnginePure,
  getSessionState,
  redoSessionForPlayerPure,
  undoSessionForPlayerPure,
} from "@gaming-platform/core";
import { CatanEngine, getNextActingPlayerId } from "@gaming-platform/catan";
import { DEFAULT_CATAN_SETUP_STEP_GUARD } from "../config.ts";
import {
  canViewerControlActorPure,
  getRoomActingPlayerId,
  getRoomPlayerBoundsPure,
  getRoomRecordPure,
  rebuildRoomPlayersPure,
  resolveRedoTargetPlayerIdPure,
  resolveUndoTargetPlayerIdPure,
  setRoomRecordInState,
} from "./helpers.ts";
import type {
  RoomManagerState,
  RoomRecord,
  StepBotOptions,
} from "./types.ts";

export function startGamePure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string
): { state: RoomManagerState; gameState: any } {
  const rawRoom = getRoomRecordPure(managerState, roomId);
  if (rawRoom.status === "in_progress") {
    throw new Error("Match is already in progress");
  }
  if (rawRoom.ownerId && requesterId !== rawRoom.ownerId) {
    throw new Error("Only the room owner can start the game");
  }

  const room = rebuildRoomPlayersPure(managerState.registry, rawRoom);
  const bounds = getRoomPlayerBoundsPure(
    managerState.registry,
    room.gameId,
    room.config
  );
  if (room.players.length < bounds.minPlayers) {
    throw new Error(
      `Need at least ${bounds.minPlayers} players to start (currently ${room.players.length}). Add bots or wait for another guest to join.`
    );
  }

  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const startConfig = (() => {
    if (room.startingPlayerMode === "first") {
      return {
        startingPlayerIndex: 0 as number | undefined,
        randomizeStartingPlayer: false,
      };
    }
    if (room.startingPlayerMode === "random") {
      return {
        startingPlayerIndex: undefined as number | undefined,
        randomizeStartingPlayer: true,
      };
    }
    const foundIdx = room.players.findIndex(
      (p) => p.id === room.startingPlayerMode
    );
    return foundIdx >= 0
      ? {
          startingPlayerIndex: foundIdx as number | undefined,
          randomizeStartingPlayer: false,
        }
      : {
          startingPlayerIndex: undefined as number | undefined,
          randomizeStartingPlayer: true,
        };
  })();

  const matchSeed =
    room.matchCounter === 0 ? room.seed : `${room.seed}-g${room.matchCounter}`;

  const initialState = engine.initGame(
    room.players,
    {
      ...room.config,
      startingPlayerIndex: startConfig.startingPlayerIndex,
      randomizeStartingPlayer: startConfig.randomizeStartingPlayer,
    },
    matchSeed
  );

  const sessionState = createMatchSessionState(engine, initialState, true);
  const startedRoom: RoomRecord = {
    ...room,
    matchCounter: room.matchCounter + 1,
    sessionState,
    status: "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, startedRoom),
    gameState: getSessionState(sessionState),
  };
}

export function dispatchActionPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string,
  action: any
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const dispatched = dispatchSessionActionPure(
    engine,
    room.sessionState,
    playerId,
    action
  );
  const nextStatus =
    dispatched.result.state.phase === "GAME_OVER" ? "finished" : room.status;

  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: dispatched.session,
    status: nextStatus,
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: dispatched.result.state,
  };
}

export function undoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const undoTargetId = resolveUndoTargetPlayerIdPure(engine, room, requesterId);
  if (!undoTargetId) {
    throw new Error("Cannot undo after the game has finished");
  }
  const actingPlayer = room.players.find((p) => p.id === undoTargetId);
  if (!actingPlayer || actingPlayer.isBot) {
    throw new Error("Undo is only available during a human player's turn");
  }
  if (
    requesterId !== undefined &&
    !canViewerControlActorPure(room, requesterId, undoTargetId)
  ) {
    throw new Error("You can only undo during your own turn");
  }

  const nextSession = undoSessionForPlayerPure(
    engine,
    room.sessionState,
    undoTargetId
  );
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
    status: nextGameState.phase === "GAME_OVER" ? "finished" : "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function redoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const redoTargetId = resolveRedoTargetPlayerIdPure(room, requesterId);
  if (!redoTargetId) {
    throw new Error("Cannot redo after the game has finished");
  }
  if (
    requesterId !== undefined &&
    !canViewerControlActorPure(room, requesterId, redoTargetId)
  ) {
    throw new Error("You can only redo during your own turn");
  }

  const nextSession = redoSessionForPlayerPure(room.sessionState, redoTargetId);
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
    status: nextGameState.phase === "GAME_OVER" ? "finished" : "in_progress",
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function finishCatanSetupWithBotsPure(
  managerState: RoomManagerState,
  roomId: string
): { state: RoomManagerState; gameState: any } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState || room.gameId !== "catan") {
    throw new Error("Catan setup session not active");
  }

  const stepSetupPure = (
    curSession: MatchSessionState<any, any>,
    remainingGuard: number
  ): MatchSessionState<any, any> => {
    const curState = getSessionState(curSession);
    if (remainingGuard <= 0 || !curState.phase.startsWith("SETUP_")) {
      return curSession;
    }
    const actorId = getNextActingPlayerId(curState);
    if (!actorId) return curSession;
    const action = CatanEngine.chooseBotAction(curState, actorId);
    if (!action) return curSession;
    const dispatched = dispatchSessionActionPure(
      CatanEngine,
      curSession,
      actorId,
      action
    );
    return stepSetupPure(dispatched.session, remainingGuard - 1);
  };

  const nextSession = stepSetupPure(
    room.sessionState,
    DEFAULT_CATAN_SETUP_STEP_GUARD
  );
  const nextGameState = getSessionState(nextSession);
  const updatedRoom: RoomRecord = {
    ...room,
    sessionState: nextSession,
  };

  return {
    state: setRoomRecordInState(managerState, updatedRoom),
    gameState: nextGameState,
  };
}

export function stepBotPure(
  managerState: RoomManagerState,
  roomId: string,
  options?: StepBotOptions
): {
  state: RoomManagerState;
  actedPlayerId: string | null;
  action: any | null;
  gameState: any;
} {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const curGameState = getSessionState(room.sessionState);
  const nextActorId = getRoomActingPlayerId(room.gameId, curGameState);
  if (!nextActorId) {
    return {
      state: managerState,
      actedPlayerId: null,
      action: null,
      gameState: curGameState,
    };
  }
  if (options?.onlyBots) {
    const actor =
      curGameState.players?.find((p: any) => p.id === nextActorId) ??
      room.players.find((p) => p.id === nextActorId);
    if (!actor || (!actor.isBot && !room.allBots)) {
      return {
        state: managerState,
        actedPlayerId: null,
        action: null,
        gameState: curGameState,
      };
    }
  }
  const action = engine.chooseBotAction(curGameState, nextActorId);
  if (!action) {
    return {
      state: managerState,
      actedPlayerId: null,
      action: null,
      gameState: curGameState,
    };
  }
  const dispatched = dispatchActionPure(
    managerState,
    room.roomId,
    nextActorId,
    action
  );
  return {
    state: dispatched.state,
    actedPlayerId: nextActorId,
    action,
    gameState: dispatched.gameState,
  };
}

export function setRoomAutoStepBotsPure(
  managerState: RoomManagerState,
  roomId: string,
  enabled: boolean
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  return setRoomRecordInState(managerState, {
    ...room,
    autoStepBots: Boolean(enabled),
  });
}
