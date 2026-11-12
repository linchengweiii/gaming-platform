/**
 * Deterministic Seeded Pseudo-Random Number Generator (Mulberry32).
 * Pure/serializable state so board game engines remain 100% deterministic.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number | string = 123456789) {
    if (typeof seed === "string") {
      this.state = SeededRNG.hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) {
      this.state = 0x6d2b79f5;
    }
  }

  public static hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0 || 0x6d2b79f5;
  }

  public static fromState(state: number): SeededRNG {
    const rng = new SeededRNG(1);
    rng.state = state >>> 0 || 0x6d2b79f5;
    return rng;
  }

  public getState(): number {
    return this.state >>> 0;
  }

  /**
   * Returns a float in [0, 1).
   */
  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.state = this.state >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Rolls a single die with `sides` faces (1..sides).
   */
  public rollDie(sides = 6): number {
    return this.nextInt(1, sides);
  }

  /**
   * Rolls 2d6 and returns individual dice and sum.
   */
  public roll2d6(): { die1: number; die2: number; total: number } {
    const die1 = this.rollDie(6);
    const die2 = this.rollDie(6);
    return { die1, die2, total: die1 + die2 };
  }

  /**
   * Returns a new shuffled copy of `items` using Fisher-Yates.
   */
  public shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = copy[i]!;
      copy[i] = copy[j]!;
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Picks a random element from a non-empty array.
   */
  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return items[this.nextInt(0, items.length - 1)]!;
  }
}
