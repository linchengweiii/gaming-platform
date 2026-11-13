/**
 * Pure Functional Deterministic Pseudo-Random Number Generator (Mulberry32).
 *
 * Exposes referentially transparent state-threading functions (`[value, nextState]`)
 * alongside a classless closure factory (`createSeededRng` / `SeededRNG`) for callers
 * expecting an object handle.
 */

export type RngState = number;

const FALLBACK_RNG_STATE = 0x6d2b79f5;

export function normalizeRngState(state: number): RngState {
  return state >>> 0 || FALLBACK_RNG_STATE;
}

export function hashSeedString(str: string): RngState {
  const hashed = Array.from(str).reduce<number>((acc, ch) => {
    const xored = acc ^ ch.charCodeAt(0);
    return Math.imul(xored, 16777619);
  }, 2166136261 >>> 0);
  return normalizeRngState(hashed);
}

export function createRngState(seed: number | string = 123456789): RngState {
  return typeof seed === "string"
    ? hashSeedString(seed)
    : normalizeRngState(seed);
}

/**
 * Pure Mulberry32 step returning `[floatInZeroOne, nextRngState]`.
 */
export function nextFloatPure(state: RngState): readonly [number, RngState] {
  const added = (state >>> 0) + 0x6d2b79f5;
  const t1 = Math.imul(added ^ (added >>> 15), added | 1);
  const t2 = t1 ^ (t1 + Math.imul(t1 ^ (t1 >>> 7), t1 | 61));
  const nextState = normalizeRngState(added);
  const value = ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  return [value, added >>> 0 === 0 ? 0 : nextState];
}

/**
 * Pure integer draw in `[min, max]` inclusive.
 * Note: matches exact baseline behavior where `max <= min` returns `[min, state]` without consuming RNG.
 */
export function nextIntPure(
  state: RngState,
  min: number,
  max: number
): readonly [number, RngState] {
  if (max <= min) {
    return [min, state >>> 0];
  }
  const [unit, nextState] = nextFloatPure(state);
  return [Math.floor(unit * (max - min + 1)) + min, nextState];
}

export function rollDiePure(
  state: RngState,
  sides = 6
): readonly [number, RngState] {
  return nextIntPure(state, 1, sides);
}

export function roll2d6Pure(
  state: RngState
): readonly [{ die1: number; die2: number; total: number }, RngState] {
  const [die1, s1] = rollDiePure(state, 6);
  const [die2, s2] = rollDiePure(s1, 6);
  return [{ die1, die2, total: die1 + die2 }, s2];
}

/**
 * Pure Fisher-Yates shuffle returning `[shuffledItems, nextRngState]` without mutating `items`.
 */
export function shufflePure<T>(
  state: RngState,
  items: readonly T[]
): readonly [T[], RngState] {
  const indicesDesc = Array.from(
    { length: Math.max(0, items.length - 1) },
    (_, idx) => items.length - 1 - idx
  );
  return indicesDesc.reduce<readonly [T[], RngState]>(
    ([arr, curState], i) => {
      const [j, nextState] = nextIntPure(curState, 0, i);
      if (i === j) {
        return [arr, nextState];
      }
      const swapped = arr.map((item, idx) =>
        idx === i ? arr[j]! : idx === j ? arr[i]! : item
      );
      return [swapped, nextState];
    },
    [[...items], state >>> 0]
  );
}

export function pickPure<T>(
  state: RngState,
  items: readonly T[]
): readonly [T, RngState] {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty array");
  }
  const [idx, nextState] = nextIntPure(state, 0, items.length - 1);
  return [items[idx]!, nextState];
}

export interface SeededRNG {
  getState(): number;
  nextFloat(): number;
  nextInt(min: number, max: number): number;
  rollDie(sides?: number): number;
  roll2d6(): { die1: number; die2: number; total: number };
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

export interface SeededRNGConstructor {
  new (seed?: number | string): SeededRNG;
  (seed?: number | string): SeededRNG;
  readonly hashString: (str: string) => number;
  readonly fromState: (state: number) => SeededRNG;
}

export function createSeededRngFromState(initialState: RngState): SeededRNG {
  let currentState = initialState >>> 0;

  return {
    getState: () => currentState >>> 0,
    nextFloat: () => {
      const [value, nextState] = nextFloatPure(currentState);
      currentState = nextState;
      return value;
    },
    nextInt: (min: number, max: number) => {
      const [value, nextState] = nextIntPure(currentState, min, max);
      currentState = nextState;
      return value;
    },
    rollDie: (sides = 6) => {
      const [value, nextState] = rollDiePure(currentState, sides);
      currentState = nextState;
      return value;
    },
    roll2d6: () => {
      const [roll, nextState] = roll2d6Pure(currentState);
      currentState = nextState;
      return roll;
    },
    shuffle: <T>(items: readonly T[]) => {
      const [shuffled, nextState] = shufflePure(currentState, items);
      currentState = nextState;
      return shuffled;
    },
    pick: <T>(items: readonly T[]) => {
      const [picked, nextState] = pickPure(currentState, items);
      currentState = nextState;
      return picked;
    },
  };
}

export function createSeededRng(seed: number | string = 123456789): SeededRNG {
  return createSeededRngFromState(createRngState(seed));
}

export const SeededRNG: SeededRNGConstructor = Object.assign(
  function SeededRNG(seed: number | string = 123456789): SeededRNG {
    return createSeededRng(seed);
  } as unknown as SeededRNGConstructor,
  {
    hashString: hashSeedString,
    fromState: (state: number): SeededRNG =>
      createSeededRngFromState(normalizeRngState(state)),
  }
);
