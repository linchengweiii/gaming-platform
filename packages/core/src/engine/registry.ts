/**
 * Pure Functional Game Registry state & operations.
 */

import type { GameEngine, GameEvent, GameMetadata } from "./types.ts";

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
