/**
 * Core Game Platform Engine Contract, Game Registry, and Match Session Manager.
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

export interface ActionApplicationResult<TState, TEvent extends GameEvent = GameEvent> {
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
  TPlayerView = TState
> {
  readonly metadata: GameMetadata;

  /**
   * Creates the initial game state from players, game-specific configuration, and RNG seed.
   */
  initGame(
    players: readonly PlayerDescriptor[],
    config?: Partial<TConfig>,
    seed?: number | string
  ): TState;

  /**
   * Returns all legal actions that `playerId` can currently take in `state`.
   */
  getLegalActions(state: TState, playerId: string): TAction[];

  /**
   * Validates and applies `action` by `playerId`, returning the updated state and emitted events.
   * Throws a descriptive Error if the action is illegal.
   */
  applyAction(
    state: TState,
    playerId: string,
    action: TAction
  ): ActionApplicationResult<TState, TEvent>;

  /**
   * Produces a redacted view of `state` safe to send to `viewerPlayerId` over the network
   * (or full unredacted state if `viewerPlayerId` is null / spectator with god-view).
   */
  getPlayerView(state: TState, viewerPlayerId: string | null): TPlayerView;

  /**
   * Returns the winning player ID if the game has finished, or null if still in progress.
   */
  getWinner(state: TState): string | null;

  /**
   * Chooses an action for an AI bot player (`playerId`), or returns null if the bot has no legal moves.
   */
  chooseBotAction(state: TState, playerId: string): TAction | null;

  /**
   * Checks domain invariants on `state` (conservation of resources, valid board placement, VP totals).
   */
  checkInvariants(state: TState): InvariantCheckResult;
}

/**
 * Registry of all games installed on the platform.
 */
export class GameRegistry {
  private engines = new Map<string, GameEngine<any, any, any, any, any>>();

  public register<TState, TConfig, TAction extends { type: string }, TEvent extends GameEvent, TView>(
    engine: GameEngine<TState, TConfig, TAction, TEvent, TView>
  ): void {
    this.engines.set(engine.metadata.id, engine);
  }

  public get<
    TState = any,
    TConfig = any,
    TAction extends { type: string } = { type: string },
    TEvent extends GameEvent = GameEvent,
    TView = TState
  >(gameId: string): GameEngine<TState, TConfig, TAction, TEvent, TView> {
    const engine = this.engines.get(gameId);
    if (!engine) {
      throw new Error(`Unknown gameId "${gameId}". Registered games: ${this.list().map((g) => g.id).join(", ")}`);
    }
    return engine;
  }

  public list(): GameMetadata[] {
    return Array.from(this.engines.values()).map((e) => e.metadata);
  }
}

export interface RecordedActionEntry<TAction> {
  step: number;
  playerId: string;
  action: TAction;
  timestamp: number;
}

/**
 * Stateful wrapper around a pure `GameEngine` supporting undo/redo time-travel,
 * automatic invariant checking, and bot step execution.
 */
export class MatchSession<
  TState,
  TConfig,
  TAction extends { type: string },
  TEvent extends GameEvent = GameEvent,
  TView = TState
> {
  public readonly engine: GameEngine<TState, TConfig, TAction, TEvent, TView>;
  private snapshots: TState[] = [];
  private cursor = 0;
  private actionLog: RecordedActionEntry<TAction>[] = [];
  public readonly enforceInvariants: boolean;

  constructor(
    engine: GameEngine<TState, TConfig, TAction, TEvent, TView>,
    initialState: TState,
    enforceInvariants = true
  ) {
    this.engine = engine;
    this.enforceInvariants = enforceInvariants;
    this.snapshots = [structuredClone(initialState)];
    this.cursor = 0;
    if (this.enforceInvariants) {
      const check = this.engine.checkInvariants(initialState);
      if (!check.valid) {
        throw new Error(`Initial state invariant violation: ${check.violations.join("; ")}`);
      }
    }
  }

  public getState(): TState {
    return this.snapshots[this.cursor]!;
  }

  public getStep(): number {
    return this.cursor;
  }

  public getTotalSteps(): number {
    return this.snapshots.length - 1;
  }

  public getActionLog(): readonly RecordedActionEntry<TAction>[] {
    return this.actionLog.slice(0, this.cursor);
  }

  public dispatch(playerId: string, action: TAction): ActionApplicationResult<TState, TEvent> {
    const current = this.getState();
    const result = this.engine.applyAction(current, playerId, action);

    if (this.enforceInvariants) {
      const check = this.engine.checkInvariants(result.state);
      if (!check.valid) {
        throw new Error(
          `Invariant violation after ${action.type} by ${playerId}: ${check.violations.join("; ")}`
        );
      }
    }

    // Truncate future branch if we undid and dispatched a new action
    this.snapshots = this.snapshots.slice(0, this.cursor + 1);
    this.actionLog = this.actionLog.slice(0, this.cursor);

    this.snapshots.push(structuredClone(result.state));
    this.cursor = this.snapshots.length - 1;
    this.actionLog.push({
      step: this.cursor,
      playerId,
      action,
      timestamp: Date.now(),
    });

    return result;
  }

  public canUndo(): boolean {
    return this.cursor > 0;
  }

  public canRedo(): boolean {
    return this.cursor < this.snapshots.length - 1;
  }

  public undo(): TState {
    if (this.canUndo()) {
      this.cursor--;
    }
    return this.getState();
  }

  public redo(): TState {
    if (this.canRedo()) {
      this.cursor++;
    }
    return this.getState();
  }

  public jumpToStep(step: number): TState {
    if (step < 0 || step >= this.snapshots.length) {
      throw new Error(`Invalid step ${step}`);
    }
    this.cursor = step;
    return this.getState();
  }
}
