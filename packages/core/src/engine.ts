/**
 * Core Game Platform Engine Contract, Pure Functional Registry, and Pure Match Session Reducers.
 */

export type BotDifficulty = "easy" | "normal" | "smart" | "master";

export interface PlayerDescriptor {
  id: string;
  name: string;
  color: string;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  /** Optional ID of the host/device guest who added this local player on the same computer. */
  controllerId?: string;
}

export interface GameEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  timestamp: number;
  turn: number;
  playerId?: string;
  type: TType;
  message: string;
  payload?: TPayload;
}

export interface InvariantCheckResult {
  valid: boolean;
  violations: string[];
}

export interface ActionApplicationResult<
  TState,
  TEvent extends GameEvent = GameEvent,
> {
  state: TState;
  events: TEvent[];
}

export interface GameMetadata {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportsBots: boolean;
}

/**
 * Pure, deterministic state machine interface that every board game on the platform implements.
 */
export interface GameEngine<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TPlayerView = TState,
> {
  readonly metadata: GameMetadata;

  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<TConfig>,
    seed?: number | string
  ): TState;

  getLegalActions(state: TState, playerId: string): TAction[];

  applyAction(
    state: TState,
    playerId: string,
    action: TAction
  ): ActionApplicationResult<TState, TEvent>;

  getPlayerView(state: TState, viewerPlayerId: string | null): TPlayerView;

  getWinner(state: TState): string | null;

  chooseBotAction(state: TState, playerId: string): TAction | null;

  checkInvariants(state: TState): InvariantCheckResult;

  isActionUndoable?(
    prevState: TState,
    action: TAction,
    nextState: TState,
    playerId: string
  ): boolean;
}

/**
 * Pure Functional Game Registry state & operations.
 */
export type GameRegistryState = ReadonlyMap<
  string,
  GameEngine<any, any, any, any, any>
>;

export function createEmptyRegistryState(): GameRegistryState {
  return new Map();
}

export function registerEnginePure<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent,
  TView,
>(
  registry: GameRegistryState,
  engine: GameEngine<TState, TConfig, TAction, TEvent, TView>
): GameRegistryState {
  return new Map([...registry, [engine.metadata.id, engine]]);
}

export function listRegisteredGamesPure(
  registry: GameRegistryState
): GameMetadata[] {
  return Array.from(registry.values()).map((e) => e.metadata);
}

export function getRegisteredEnginePure<
  TState = any,
  TConfig = any,
  TAction extends { type: string } = { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState,
>(
  registry: GameRegistryState,
  gameId: string
): GameEngine<TState, TConfig, TAction, TEvent, TView> {
  const engine = registry.get(gameId);
  if (!engine) {
    throw new Error(
      `Unknown gameId "${gameId}". Registered games: ${listRegisteredGamesPure(
        registry
      )
        .map((g) => g.id)
        .join(", ")}`
    );
  }
  return engine;
}

export interface GameRegistry {
  register<
    TState,
    TConfig,
    TAction extends { type: string },
    TEvent extends GameEvent,
    TView,
  >(
    engine: GameEngine<TState, TConfig, TAction, TEvent, TView>
  ): void;
  get<
    TState = any,
    TConfig = any,
    TAction extends { type: string } = { type: string },
    TEvent extends GameEvent = GameEvent,
    TView = TState,
  >(
    gameId: string
  ): GameEngine<TState, TConfig, TAction, TEvent, TView>;
  list(): GameMetadata[];
}

export interface GameRegistryConstructor {
  new (initial?: GameRegistryState): GameRegistry;
  (initial?: GameRegistryState): GameRegistry;
}

export function createGameRegistry(
  initial: GameRegistryState = createEmptyRegistryState()
): GameRegistry {
  let state = initial;
  return {
    register: (engine) => {
      state = registerEnginePure(state, engine);
    },
    get: (gameId) => getRegisteredEnginePure(state, gameId),
    list: () => listRegisteredGamesPure(state),
  };
}

export const GameRegistry: GameRegistryConstructor = function GameRegistry(
  initial?: GameRegistryState
): GameRegistry {
  return createGameRegistry(initial);
} as unknown as GameRegistryConstructor;

export interface RecordedActionEntry<TAction> {
  step: number;
  playerId: string;
  action: TAction;
  timestamp: number;
}

/**
 * Pure Functional MatchSession state & transition reducers.
 */
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
  if (step < 0 || step >= session.snapshots.length) {
    throw new Error(`Invalid step ${step}`);
  }
  return { ...session, cursor: step };
}

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
  enforceInvariants = true
): MatchSession<TState, TConfig, TAction, TEvent, TView> {
  let session = createMatchSessionState(engine, initialState, enforceInvariants);

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
