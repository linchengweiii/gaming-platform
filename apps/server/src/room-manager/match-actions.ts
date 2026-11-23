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
import {
  DEFAULT_CATAN_SETUP_STEP_GUARD,
  clampServerBotStepDelayMsPure,
} from "../config.ts";
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

function requireStartedRoom(
  managerState: RoomManagerState,
  roomId: string
): RoomRecord & { sessionState: MatchSessionState<any, any> } {
  const room = getRoomRecordPure(managerState, roomId);
  if (!room.sessionState) {
    throw new Error("Game has not started in this room");
  }
  return room as RoomRecord & { sessionState: MatchSessionState<any, any> };
}

function commitRoomSession(
  managerState: RoomManagerState,
  room: RoomRecord,
  sessionState: MatchSessionState<any, any>,
  status: RoomRecord["status"],
  extra?: Partial<RoomRecord>
): { state: RoomManagerState; gameState: any } {
  const gameState = getSessionState(sessionState);
  return {
    state: setRoomRecordInState(managerState, {
      ...room,
      ...extra,
      sessionState,
      status,
    }),
    gameState,
  };
}

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
  const explicitIdx =
    room.startingPlayerMode === "first"
      ? 0
      : room.startingPlayerMode === "random"
        ? -1
        : room.players.findIndex((p) => p.id === room.startingPlayerMode);
  const startConfig =
    explicitIdx >= 0
      ? { startingPlayerIndex: explicitIdx, randomizeStartingPlayer: false }
      : { startingPlayerIndex: undefined, randomizeStartingPlayer: true };

  const matchSeed =
    room.matchCounter === 0 ? room.seed : `${room.seed}-g${room.matchCounter}`;

  const initialState = engine.initGame(
    room.players,
    { ...room.config, ...startConfig },
    matchSeed
  );

  const sessionState = createMatchSessionState(engine, initialState, true);
  return commitRoomSession(managerState, room, sessionState, "in_progress", {
    matchCounter: room.matchCounter + 1,
  });
}

export function dispatchActionPure(
  managerState: RoomManagerState,
  roomId: string,
  playerId: string,
  action: any
): { state: RoomManagerState; gameState: any } {
  const room = requireStartedRoom(managerState, roomId);
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const dispatched = dispatchSessionActionPure(
    engine,
    room.sessionState,
    playerId,
    action
  );
  const nextStatus =
    dispatched.result.state.phase === "GAME_OVER" ? "finished" : room.status;
  return commitRoomSession(managerState, room, dispatched.session, nextStatus);
}

export function undoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = requireStartedRoom(managerState, roomId);
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
  const nextStatus =
    getSessionState(nextSession).phase === "GAME_OVER"
      ? "finished"
      : "in_progress";
  return commitRoomSession(managerState, room, nextSession, nextStatus);
}

export function redoActionPure(
  managerState: RoomManagerState,
  roomId: string,
  requesterId?: string | null
): { state: RoomManagerState; gameState: any } {
  const room = requireStartedRoom(managerState, roomId);
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
  const nextStatus =
    getSessionState(nextSession).phase === "GAME_OVER"
      ? "finished"
      : "in_progress";
  return commitRoomSession(managerState, room, nextSession, nextStatus);
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
  return commitRoomSession(managerState, room, nextSession, room.status);
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
  const room = requireStartedRoom(managerState, roomId);
  const engine = getRegisteredEnginePure(managerState.registry, room.gameId);
  const curGameState = getSessionState(room.sessionState);
  const noOp = {
    state: managerState,
    actedPlayerId: null,
    action: null,
    gameState: curGameState,
  };
  const nextActorId = getRoomActingPlayerId(room.gameId, curGameState);
  if (!nextActorId) return noOp;
  if (options?.onlyBots) {
    const actor =
      curGameState.players?.find((p: any) => p.id === nextActorId) ??
      room.players.find((p) => p.id === nextActorId);
    if (!actor || (!actor.isBot && !room.allBots)) return noOp;
  }
  const action = engine.chooseBotAction(curGameState, nextActorId);
  if (!action) return noOp;
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

export function setRoomBotStepDelayPure(
  managerState: RoomManagerState,
  roomId: string,
  delayMs: number
): RoomManagerState {
  const room = getRoomRecordPure(managerState, roomId);
  return setRoomRecordInState(managerState, {
    ...room,
    botStepDelayMs: clampServerBotStepDelayMsPure(delayMs),
  });
}
