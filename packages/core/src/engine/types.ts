/**
 * Core Game Platform Engine Contract & Domain Types.
 */

export type BotDifficulty = "easy" | "normal" | "smart" | "master";

export interface PlayerDescriptor {
  id: string;
  name: string;
  color: string;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  /** Optional ID of the host/device guest who added local seat control on the same computer. */
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
