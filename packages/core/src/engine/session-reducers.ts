/**
 * Pure Functional MatchSession state & transition reducers.
 */

import type { ActionApplicationResult, GameEngine, GameEvent } from "./types.ts";

export interface RecordedActionEntry<TAction> {
  step: number;
  playerId: string;
  action: TAction;
  timestamp: number;
}

export interface MatchSessionState<TState, TAction extends { type: string }> {
  readonly snapshots: readonly TState[];
  readonly cursor: number;
  readonly actionLog: readonly RecordedActionEntry<TAction>[];
  readonly enforceInvariants: boolean;
}

export function createMatchSessionState<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  initialState: TState,
  enforceInvariants = true
): MatchSessionState<TState, TAction> {
  if (enforceInvariants) {
    const check = engine.checkInvariants(initialState);
    if (!check.valid) {
      throw new Error(
        `Initial state invariant violation: ${check.violations.join("; ")}`
      );
    }
  }
  return {
    snapshots: [structuredClone(initialState)],
    cursor: 0,
    actionLog: [],
    enforceInvariants,
  };
}

export function getSessionState<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): TState {
  return session.snapshots[session.cursor]!;
}

export function getSessionStep<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): number {
  return session.cursor;
}

export function getSessionTotalSteps<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): number {
  return session.snapshots.length - 1;
}

export function getSessionActionLog<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): readonly RecordedActionEntry<TAction>[] {
  return session.actionLog.slice(0, session.cursor);
}

export function dispatchSessionActionPure<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  session: MatchSessionState<TState, TAction>,
  playerId: string,
  action: TAction,
  timestamp = Date.now()
): {
  session: MatchSessionState<TState, TAction>;
  result: ActionApplicationResult<TState, TEvent>;
} {
  const current = getSessionState(session);
  const result = engine.applyAction(current, playerId, action);

  if (session.enforceInvariants) {
    const check = engine.checkInvariants(result.state);
    if (!check.valid) {
      throw new Error(
        `Invariant violation after ${action.type} by ${playerId}: ${check.violations.join("; ")}`
      );
    }
  }

  const nextCursor = session.cursor + 1;
  const nextSnapshots = [
    ...session.snapshots.slice(0, nextCursor),
    structuredClone(result.state),
  ];
  const nextActionLog: readonly RecordedActionEntry<TAction>[] = [
    ...session.actionLog.slice(0, session.cursor),
    {
      step: nextCursor,
      playerId,
      action: structuredClone(action),
      timestamp,
    },
  ];

  return {
    session: {
      ...session,
      snapshots: nextSnapshots,
      cursor: nextCursor,
      actionLog: nextActionLog,
    },
    result,
  };
}

export function canSessionUndo<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): boolean {
  return session.cursor > 0;
}

export function canSessionRedo<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): boolean {
  return session.cursor < session.snapshots.length - 1;
}

export function getSessionUndoableStepCount<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  session: MatchSessionState<TState, TAction>,
  actingPlayerId: string | null
): number {
  if (!actingPlayerId || session.cursor <= 0) {
    return 0;
  }

  const countFromIndex = (idx: number, acc: number): number => {
    if (idx < 0) return acc;
    const entry = session.actionLog[idx];
    if (!entry || entry.playerId !== actingPlayerId) {
      return acc;
    }
    const prevState = session.snapshots[idx]!;
    const nextState = session.snapshots[idx + 1]!;
    const undoable = engine.isActionUndoable
      ? engine.isActionUndoable(
          prevState,
          entry.action,
          nextState,
          entry.playerId
        )
      : true;
    return undoable ? countFromIndex(idx - 1, acc + 1) : acc;
  };

  return countFromIndex(session.cursor - 1, 0);
}

export function canSessionPlayerUndo<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  session: MatchSessionState<TState, TAction>,
  actingPlayerId: string | null
): boolean {
  return getSessionUndoableStepCount(engine, session, actingPlayerId) > 0;
}

export function undoSessionForPlayerPure<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
  session: MatchSessionState<TState, TAction>,
  actingPlayerId: string | null
): MatchSessionState<TState, TAction> {
  if (!canSessionPlayerUndo(engine, session, actingPlayerId)) {
    throw new Error(
      "Cannot undo: only reversible actions from your current turn can be undone"
    );
  }
  return { ...session, cursor: session.cursor - 1 };
}

export function canSessionPlayerRedo<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>,
  actingPlayerId: string | null
): boolean {
  if (!actingPlayerId || session.cursor >= session.snapshots.length - 1) {
    return false;
  }
  const nextEntry = session.actionLog[session.cursor];
  return Boolean(nextEntry && nextEntry.playerId === actingPlayerId);
}

export function redoSessionForPlayerPure<
  TState,
  TAction extends { type: string },
>(
  session: MatchSessionState<TState, TAction>,
  actingPlayerId: string | null
): MatchSessionState<TState, TAction> {
  if (!canSessionPlayerRedo(session, actingPlayerId)) {
    throw new Error("Cannot redo: no undone action from your current turn");
  }
  return { ...session, cursor: session.cursor + 1 };
}

export function undoSessionPure<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): MatchSessionState<TState, TAction> {
  return canSessionUndo(session)
    ? { ...session, cursor: session.cursor - 1 }
    : session;
}

export function redoSessionPure<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>
): MatchSessionState<TState, TAction> {
  return canSessionRedo(session)
    ? { ...session, cursor: session.cursor + 1 }
    : session;
}

export function jumpSessionToStepPure<TState, TAction extends { type: string }>(
  session: MatchSessionState<TState, TAction>,
  step: number
): MatchSessionState<TState, TAction> {
  if (!Number.isInteger(step) || step < 0 || step >= session.snapshots.length) {
    throw new Error(`Invalid step ${step}`);
  }
  return { ...session, cursor: step };
}
