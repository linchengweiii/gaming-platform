import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BotDifficulty, PlayerDescriptor } from "../../packages/core/src/index.ts";

const PARITY_DIR = path.dirname(fileURLToPath(import.meta.url));

export const GOLDEN_SNAPSHOT_PATH = path.resolve(
  PARITY_DIR,
  "../__snapshots__/functional-parity.golden.json"
);

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export function withDeterministicClockAndRandom<T>(fn: () => T): T {
  const originalNow = Date.now;
  const originalRandom = Math.random;
  const originalAlert = (globalThis as Record<string, unknown>).alert;
  let tick = 0;
  let randIdx = 0;
  const randPool = [0.17, 0.42, 0.68, 0.91, 0.05, 0.53, 0.79, 0.24];

  Date.now = () => 1_700_000_000_000 + tick++ * 100;
  Math.random = () => {
    const val = randPool[randIdx % randPool.length]!;
    randIdx += 1;
    return val;
  };
  (globalThis as Record<string, unknown>).alert = () => {};

  try {
    return fn();
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    if (originalAlert === undefined) {
      delete (globalThis as Record<string, unknown>).alert;
    } else {
      (globalThis as Record<string, unknown>).alert = originalAlert;
    }
  }
}

export function makePlayers(
  count: number,
  difficulties: readonly BotDifficulty[] = ["master", "smart", "normal", "easy"]
): PlayerDescriptor[] {
  const colors = [
    "#e11d48",
    "#2563eb",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
  ];
  return Array.from({ length: count }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    color: colors[idx % colors.length]!,
    isBot: true,
    botDifficulty: difficulties[idx % difficulties.length] ?? "normal",
  }));
}

export function readGoldenStore(): Record<string, unknown> {
  if (!fs.existsSync(GOLDEN_SNAPSHOT_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(GOLDEN_SNAPSHOT_PATH, "utf8").trim();
  if (!raw) {
    return {};
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

export function writeMergedGoldenKey<T>(key: string, value: T): T {
  fs.mkdirSync(path.dirname(GOLDEN_SNAPSHOT_PATH), { recursive: true });
  const existing = readGoldenStore();
  const normalizedValue = JSON.parse(JSON.stringify(value)) as T;
  const merged = {
    ...existing,
    [key]: normalizedValue,
  };
  fs.writeFileSync(
    GOLDEN_SNAPSHOT_PATH,
    JSON.stringify(merged, null, 2),
    "utf8"
  );
  return normalizedValue;
}

export function loadOrCreateGoldenKey<T>(
  key: string,
  computeFn: () => T
): T {
  const existing = readGoldenStore();
  if (
    Object.prototype.hasOwnProperty.call(existing, key) &&
    existing[key] !== undefined
  ) {
    return existing[key] as T;
  }
  return writeMergedGoldenKey(key, computeFn());
}
