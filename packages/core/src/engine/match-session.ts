/**
 * Stateful MatchSession handle wrapping pure session reducers.
 */

import {
  type MatchSessionState,
  type RecordedActionEntry,
  canSessionPlayerRedo,
  canSessionPlayerUndo,
  canSessionRedo,
  canSessionUndo,
  createMatchSessionState,
  dispatchSessionActionPure,
  getSessionActionLog,
  getSessionState,
  getSessionStep,
  getSessionTotalSteps,
  getSessionUndoableStepCount,
  jumpSessionToStepPure,
  redoSessionForPlayerPure,
  redoSessionPure,
  undoSessionForPlayerPure,
  undoSessionPure,
} from "./session-reducers.ts";
import type { ActionApplicationResult, GameEngine, GameEvent } from "./types.ts";

export interface MatchSession<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
> {
  readonly engine: GameEngine<TState, TConfig, TAction, TEvent, TView>;
  readonly enforceInvariants: boolean;
  getState(): TState;
  getStep(): number;
  getTotalSteps(): number;
  getActionLog(): readonly RecordedActionEntry<TAction>[];
  dispatch(
    playerId: string,
    action: TAction
  ): ActionApplicationResult<TState, TEvent>;
  canUndo(): boolean;
  canRedo(): boolean;
  getUndoableStepCount(actingPlayerId: string | null): number;
  canPlayerUndo(actingPlayerId: string | null): boolean;
  undoForPlayer(actingPlayerId: string | null): TState;
  canPlayerRedo(actingPlayerId: string | null): boolean;
  redoForPlayer(actingPlayerId: string | null): TState;
  undo(): TState;
  redo(): TState;
  jumpToStep(step: number): TState;
  cloneWithMappedSnapshots?(
    mapper: (snapshot: TState) => TState
  ): MatchSession<TState, TConfig, TAction, TEvent, TView>;
}

export interface MatchSessionConstructor {
  new <
    TState,
    TConfig,
    TAction extends { type: string },
    TEvent extends GameEvent = GameEvent,
    TView = TState,
  >(
    engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
    initialState: TState,
    enforceInvariants?: boolean
  ): MatchSession<TState, TConfig, TAction, TEvent, TView>;
  <
    TState,
    TConfig,
    TAction extends { type: string },
    TEvent extends GameEvent = GameEvent,
    TView = TState,
  >(
    engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
    initialState: TState,
    enforceInvariants?: boolean
  ): MatchSession<TState, TConfig, TAction, TEvent, TView>;
}

export function createMatchSession<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  initialState: TState,
  enforceInvariants = true,
  existingSessionState?: MatchSessionState<TState, TAction>
): MatchSession<TState, TConfig, TAction, TEvent, TView> {
  let session =
    existingSessionState ??
    createMatchSessionState(engine, initialState, enforceInvariants);

  return {
    engine,
    enforceInvariants,
    getState: () => getSessionState(session),
    getStep: () => getSessionStep(session),
    getTotalSteps: () => getSessionTotalSteps(session),
    getActionLog: () => getSessionActionLog(session),
    dispatch: (playerId, action) => {
      const next = dispatchSessionActionPure(engine, session, playerId, action);
      session = next.session;
      return next.result;
    },
    canUndo: () => canSessionUndo(session),
    canRedo: () => canSessionRedo(session),
    getUndoableStepCount: (actingPlayerId) =>
      getSessionUndoableStepCount(engine, session, actingPlayerId),
    canPlayerUndo: (actingPlayerId) =>
      canSessionPlayerUndo(engine, session, actingPlayerId),
    undoForPlayer: (actingPlayerId) => {
      session = undoSessionForPlayerPure(engine, session, actingPlayerId);
      return getSessionState(session);
    },
    canPlayerRedo: (actingPlayerId) =>
      canSessionPlayerRedo(session, actingPlayerId),
    redoForPlayer: (actingPlayerId) => {
      session = redoSessionForPlayerPure(session, actingPlayerId);
      return getSessionState(session);
    },
    undo: () => {
      session = undoSessionPure(session);
      return getSessionState(session);
    },
    redo: () => {
      session = redoSessionPure(session);
      return getSessionState(session);
    },
    jumpToStep: (step) => {
      session = jumpSessionToStepPure(session, step);
      return getSessionState(session);
    },
    cloneWithMappedSnapshots: (mapper) => {
      const mappedSnapshots = session.snapshots.map((snap) => mapper(snap));
      const mappedState: MatchSessionState<TState, TAction> = {
        ...session,
        snapshots: mappedSnapshots,
      };
      return createMatchSession(
        engine,
        getSessionState(mappedState),
        enforceInvariants,
        mappedState
      );
    },
  };
}

export const MatchSession: MatchSessionConstructor = function MatchSession<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  initialState: TState,
  enforceInvariants = true
): MatchSession<TState, TConfig, TAction, TEvent, TView> {
  return createMatchSession(engine, initialState, enforceInvariants);
} as unknown as MatchSessionConstructor;
