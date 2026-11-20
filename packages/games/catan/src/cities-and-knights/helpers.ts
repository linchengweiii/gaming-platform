import {
  type GameEvent,
  type RngState,
  nextIntPure,
  pickPure,
  shufflePure,
} from "@gaming-platform/core";
import {
  EVENT_DIE_FACES,
  PROGRESS_CARD_CATALOG,
  type ProgressCardMetadata,
} from "../config/cities-knights-config.ts";
import {
  type ActiveTurnDiscounts,
  COMMODITIES,
  type CityImprovementMap,
  type CommodityMap,
  type CommodityType,
  type EventDieFace,
  type ImprovementDiscipline,
  type MetropolisState,
  type ProgressCardInstance,
  type ProgressCardType,
  RESOURCES,
  type ResourceType,
  type TradeGoodMap,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";

export type StateEventsPair = {
  readonly state: CatanState;
  readonly emitted: GameEvent[];
};

export function pushCkEvent(
  state: CatanState,
  emitted: readonly GameEvent[],
  type: string,
  message: string,
  playerId?: string,
  payload?: unknown
): StateEventsPair {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
    payload,
  };
  return {
    state: {
      ...state,
      eventLog: [...state.eventLog, evt],
    },
    emitted: [...emitted, evt],
  };
}

export function isCommodityType(good: string): good is CommodityType {
  return (COMMODITIES as readonly string[]).includes(good);
}

export function isResourceType(good: string): good is ResourceType {
  return (RESOURCES as readonly string[]).includes(good);
}

export function emptyCommodities(): CommodityMap {
  return { paper: 0, cloth: 0, coin: 0 };
}

export function emptyCityImprovements(): CityImprovementMap {
  return { trade: 0, politics: 0, science: 0 };
}

export function emptyTurnDiscounts(): ActiveTurnDiscounts {
  return {
    crane: false,
    medicine: false,
    merchantFleetGood: null,
    merchantFleetGoods: [],
  };
}

export function emptyMetropolises(): Record<
  ImprovementDiscipline,
  MetropolisState
> {
  return {
    trade: { ownerId: null, vertexId: null, level: 0 },
    politics: { ownerId: null, vertexId: null, level: 0 },
    science: { ownerId: null, vertexId: null, level: 0 },
  };
}

export function emptyTradeGoodMap(): TradeGoodMap {
  return {
    brick: 0,
    lumber: 0,
    wool: 0,
    grain: 0,
    ore: 0,
    paper: 0,
    cloth: 0,
    coin: 0,
  };
}

export function totalCommodityCount(
  comm: Partial<CommodityMap> | undefined
): number {
  if (!comm) return 0;
  return COMMODITIES.reduce<number>((sum, c) => sum + (comm[c] ?? 0), 0);
}

export function hasCommodities(
  hand: CommodityMap,
  cost: Partial<CommodityMap> | undefined
): boolean {
  if (!cost) return true;
  return COMMODITIES.every((c) => (hand[c] ?? 0) >= (cost[c] ?? 0));
}

export function addCommoditiesPure(
  target: CommodityMap,
  delta: Partial<CommodityMap> | undefined
): CommodityMap {
  if (!delta) return { ...target };
  return {
    paper: target.paper + (delta.paper ?? 0),
    cloth: target.cloth + (delta.cloth ?? 0),
    coin: target.coin + (delta.coin ?? 0),
  };
}

export function subtractCommoditiesPure(
  target: CommodityMap,
  delta: Partial<CommodityMap> | undefined
): CommodityMap {
  if (!delta) return { ...target };
  return {
    paper: target.paper - (delta.paper ?? 0),
    cloth: target.cloth - (delta.cloth ?? 0),
    coin: target.coin - (delta.coin ?? 0),
  };
}

export function getPlayerGoodCount(
  player: Pick<CatanPlayerState, "resources" | "commodities">,
  good: TradeGoodType
): number {
  return isCommodityType(good)
    ? player.commodities[good]
    : player.resources[good];
}

export function getBankGoodCount(
  state: Pick<CatanState, "bank" | "commodityBank">,
  good: TradeGoodType
): number {
  return isCommodityType(good)
    ? state.commodityBank[good]
    : state.bank[good];
}

export function createProgressDecksPure(
  rngState: RngState
): readonly [Record<ImprovementDiscipline, ProgressCardType[]>, RngState] {
  const buildUnshuffled = (
    discipline: ImprovementDiscipline
  ): ProgressCardType[] =>
    (Object.values(PROGRESS_CARD_CATALOG) as ProgressCardMetadata[])
      .filter((meta) => meta.discipline === discipline)
      .flatMap((meta) => Array.from({ length: meta.copies }, () => meta.type));

  const [trade, rng1] = shufflePure(rngState, buildUnshuffled("trade"));
  const [politics, rng2] = shufflePure(rng1, buildUnshuffled("politics"));
  const [science, rng3] = shufflePure(rng2, buildUnshuffled("science"));

  return [{ trade, politics, science }, rng3];
}

export function rollEventDiePure(
  rngState: RngState
): readonly [EventDieFace, RngState] {
  const [idx, nextRng] = nextIntPure(rngState, 0, 5);
  return [EVENT_DIE_FACES[idx]!, nextRng];
}

export function drawOneRandomHandGoodPure(
  rngState: RngState,
  victim: CatanPlayerState
): readonly [TradeGoodType | null, RngState] {
  const pool: TradeGoodType[] = [
    ...RESOURCES.flatMap((r) =>
      Array.from({ length: victim.resources[r] }, (): TradeGoodType => r)
    ),
    ...COMMODITIES.flatMap((c) =>
      Array.from({ length: victim.commodities[c] }, (): TradeGoodType => c)
    ),
  ];
  if (pool.length === 0) {
    return [null, rngState];
  }
  return pickPure(rngState, pool);
}

export function transferGoodBetweenPlayersPure(
  players: readonly CatanPlayerState[],
  fromId: string,
  toId: string,
  good: TradeGoodType,
  amount = 1
): CatanPlayerState[] {
  return players.map((p) => {
    if (p.id === fromId) {
      return isCommodityType(good)
        ? {
            ...p,
            commodities: subtractCommoditiesPure(p.commodities, {
              [good]: amount,
            }),
          }
        : {
            ...p,
            resources: {
              ...p.resources,
              [good]: p.resources[good] - amount,
            },
          };
    }
    if (p.id === toId) {
      return isCommodityType(good)
        ? {
            ...p,
            commodities: addCommoditiesPure(p.commodities, { [good]: amount }),
          }
        : {
            ...p,
            resources: {
              ...p.resources,
              [good]: p.resources[good] + amount,
            },
          };
    }
    return p;
  });
}

/**
 * Removes `cardId` from `playerId`'s `progressCards` and returns `card.type` to the bottom
 * of `state.progressDecks[card.discipline]` (preserving total 54-card deck conservation).
 */
export function consumePlayerProgressCardPure(
  state: CatanState,
  playerId: string,
  cardId: string
): { state: CatanState; card: ProgressCardInstance } {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}"`);
  }
  const card = player.progressCards.find((c) => c.id === cardId);
  if (!card) {
    throw new Error("Progress card not found in hand");
  }

  return {
    card,
    state: {
      ...state,
      progressDecks: {
        ...state.progressDecks,
        [card.discipline]: [...state.progressDecks[card.discipline], card.type],
      },
      players: state.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              progressCards: p.progressCards.filter((c) => c.id !== cardId),
            }
          : p
      ),
    },
  };
}
