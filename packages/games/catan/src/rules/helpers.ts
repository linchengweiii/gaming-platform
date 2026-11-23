import { isExpanded56Scenario } from "../board/helpers.ts";
import {
  type StateEventsPair,
  pushCkEvent,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import { getPlayerGoodTradeRatios } from "../cities-and-knights/improvements.ts";
import {
  CITY_WALL_SAFE_HAND_BONUS,
  SAFE_HAND_LIMIT_BASE,
} from "../config/costs-and-limits.ts";
import {
  type CommodityMap,
  type DevCardInstance,
  type DevCardType,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

export type StateWithEvents = StateEventsPair;
export const appendCatanEvent = pushCkEvent;

export function emptyResources(): ResourceMap {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
}

export function totalResourceCount(res: Partial<ResourceMap>): number {
  return RESOURCES.reduce<number>((sum, r) => sum + (res[r] ?? 0), 0);
}

export function assertNonNegativeIntGoodMapPure(
  map: Partial<Record<string, number>> | undefined,
  label: string
): void {
  if (!map) return;
  for (const [key, val] of Object.entries(map)) {
    if (val === undefined) continue;
    if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
      throw new Error(`${label} quantity for ${key} must be a non-negative integer`);
    }
  }
}

export function getPlayerResourceCount(
  player: Pick<CatanPlayerState, "resources" | "hiddenResourceCount"> & {
    commodities?: Partial<CommodityMap>;
  }
): number {
  if (typeof player.hiddenResourceCount === "number") {
    return player.hiddenResourceCount;
  }
  return (
    totalResourceCount(player.resources) +
    totalCommodityCount(player.commodities)
  );
}

export function hasResources(
  hand: ResourceMap,
  cost: Partial<ResourceMap>
): boolean {
  return RESOURCES.every((r) => (hand[r] ?? 0) >= (cost[r] ?? 0));
}

export function addResourcesPure(
  target: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  return {
    brick: target.brick + (delta.brick ?? 0),
    lumber: target.lumber + (delta.lumber ?? 0),
    wool: target.wool + (delta.wool ?? 0),
    grain: target.grain + (delta.grain ?? 0),
    ore: target.ore + (delta.ore ?? 0),
  };
}

export function subtractResourcesPure(
  target: ResourceMap,
  delta: Partial<ResourceMap>
): ResourceMap {
  return {
    brick: target.brick - (delta.brick ?? 0),
    lumber: target.lumber - (delta.lumber ?? 0),
    wool: target.wool - (delta.wool ?? 0),
    grain: target.grain - (delta.grain ?? 0),
    ore: target.ore - (delta.ore ?? 0),
  };
}

export function omitRecordKey<V>(
  record: Readonly<Record<string, V>>,
  keyToOmit: string
): Record<string, V> {
  return Object.fromEntries(
    Object.entries(record).filter(([k]) => k !== keyToOmit)
  );
}

export function updatePlayerById(
  players: readonly CatanPlayerState[],
  playerId: string,
  updater: (player: CatanPlayerState) => CatanPlayerState
): CatanPlayerState[] {
  return players.map((p) => (p.id === playerId ? updater(p) : p));
}

export function markFirstPlayableDevCardUsed(
  devCards: readonly DevCardInstance[],
  type: DevCardType,
  currentTurn: number
): DevCardInstance[] {
  const targetIdx = devCards.findIndex(
    (c) => !c.played && c.type === type && c.boughtOnTurn < currentTurn
  );
  if (targetIdx < 0) {
    return devCards.slice();
  }
  return devCards.map((c, idx) =>
    idx === targetIdx ? { ...c, played: true } : c
  );
}

export function canPlayDevCard(
  state: CatanState,
  player: CatanPlayerState,
  type: DevCardType
): boolean {
  if (state.config.enableCitiesAndKnights) return false;
  if (player.hasPlayedDevCardThisTurn) return false;
  return player.devCards.some(
    (c) => !c.played && c.type === type && c.boughtOnTurn < state.turn
  );
}

export function isExpanded56State(
  state: Pick<CatanState, "players" | "config">
): boolean {
  return (
    state.players.length >= 5 ||
    Boolean(state.config.enable56PlayerExtension) ||
    isExpanded56Scenario(state.config.scenarioId)
  );
}

/**
 * Computes each resource's maritime trade ratio (4, 3, or 2) for `playerId` based on harbors
 * (and Merchant / Merchant Fleet in Cities & Knights).
 */
export function getPlayerTradeRatios(
  state: CatanState,
  playerId: string
): Record<ResourceType, number> {
  const goodRatios = getPlayerGoodTradeRatios(state, playerId);
  return {
    brick: goodRatios.brick,
    lumber: goodRatios.lumber,
    wool: goodRatios.wool,
    grain: goodRatios.grain,
    ore: goodRatios.ore,
  };
}

/**
 * Returns the maximum cards `playerId` can hold when a 7 is rolled without discarding.
 * Base is 7; each City Wall adds +2 cards.
 */
export function getPlayerSafeHandLimit(
  state: CatanState,
  playerId: string
): number {
  if (!state.config.enableCityWalls) return SAFE_HAND_LIMIT_BASE;
  const wallBonus = Object.values(state.buildings).reduce<number>(
    (bonus, b) =>
      b.ownerId === playerId && b.type === "city" && b.hasWall
        ? bonus + CITY_WALL_SAFE_HAND_BONUS
        : bonus,
    0
  );
  return SAFE_HAND_LIMIT_BASE + wallBonus;
}

export function assertCanBuildInCurrentPhase(
  state: CatanState,
  playerId: string
): void {
  if (state.phase === "MAIN_PHASE") {
    const active = state.players[state.activePlayerIndex]!;
    if (active.id !== playerId) {
      throw new Error("Not your turn");
    }
    if (state.activeTradeOffer) {
      throw new Error("Resolve the active domestic trade offer first");
    }
    return;
  }
  if (state.phase === "SPECIAL_BUILDING") {
    if (
      state.specialBuildPlayerIndex === null ||
      state.players[state.specialBuildPlayerIndex]?.id !== playerId
    ) {
      throw new Error("Not your Special Building turn");
    }
    return;
  }
  throw new Error(`Cannot build in phase ${state.phase}`);
}
