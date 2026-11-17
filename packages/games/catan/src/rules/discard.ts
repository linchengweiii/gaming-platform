import type { GameEvent } from "@gaming-platform/core";
import {
  addCommoditiesPure,
  getPlayerGoodCount,
  hasCommodities,
  isCommodityType,
  subtractCommoditiesPure,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  type CommodityMap,
  RESOURCES,
  type ResourceMap,
  TRADE_GOODS,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  hasResources,
  omitRecordKey,
  subtractResourcesPure,
  totalResourceCount,
  updatePlayerById,
} from "./helpers.ts";

function buildGreedyGoodDiscardOption(
  player: Pick<CatanPlayerState, "resources" | "commodities">,
  orderedGoods: readonly TradeGoodType[],
  discardCount: number
): {
  resources: Partial<ResourceMap>;
  commodities: Partial<CommodityMap>;
  remaining: number;
} {
  return orderedGoods.reduce<{
    resources: Partial<ResourceMap>;
    commodities: Partial<CommodityMap>;
    remaining: number;
  }>(
    (acc, g) => {
      const held = isCommodityType(g)
        ? player.commodities[g]
        : player.resources[g];
      const take = Math.min(held, acc.remaining);
      if (take <= 0) return acc;
      if (isCommodityType(g)) {
        return {
          resources: acc.resources,
          commodities: { ...acc.commodities, [g]: take },
          remaining: acc.remaining - take,
        };
      }
      return {
        resources: { ...acc.resources, [g]: take },
        commodities: acc.commodities,
        remaining: acc.remaining - take,
      };
    },
    { resources: {}, commodities: {}, remaining: discardCount }
  );
}

/**
 * Generates deterministic discard options for a player who needs to discard `count` cards.
 * Also allows arbitrary valid combinations in `applyAction`.
 */
export function generateDiscardActions(
  player: Pick<CatanPlayerState, "resources" | "commodities">,
  discardCount: number,
  includeCommodities: boolean
): Array<{
  type: "DISCARD_CARDS";
  resources: Partial<ResourceMap>;
  commodities?: Partial<CommodityMap>;
}> {
  const pool: readonly TradeGoodType[] = includeCommodities
    ? TRADE_GOODS
    : RESOURCES;
  const byAbundance = [...pool].sort(
    (a, b) => getPlayerGoodCount(player, b) - getPlayerGoodCount(player, a)
  );
  const first = buildGreedyGoodDiscardOption(player, byAbundance, discardCount);
  const lowPriority: readonly TradeGoodType[] = includeCommodities
    ? ["wool", "lumber", "brick", "grain", "ore", "cloth", "coin", "paper"]
    : ["wool", "lumber", "brick", "grain", "ore"];
  const second = buildGreedyGoodDiscardOption(player, lowPriority, discardCount);

  const toAction = (opt: {
    resources: Partial<ResourceMap>;
    commodities: Partial<CommodityMap>;
  }) => ({
    type: "DISCARD_CARDS" as const,
    resources: opt.resources,
    ...(totalCommodityCount(opt.commodities) > 0
      ? { commodities: opt.commodities }
      : {}),
  });

  const firstAct = first.remaining === 0 ? toAction(first) : null;
  const secondAct = second.remaining === 0 ? toAction(second) : null;

  return [
    ...(firstAct ? [firstAct] : []),
    ...(secondAct &&
    JSON.stringify(secondAct) !== JSON.stringify(firstAct)
      ? [secondAct]
      : []),
  ];
}

export function applyDiscardCardsPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "DISCARD_CARDS" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "DISCARD_ON_SEVEN") {
    throw new Error("Not in discard phase");
  }
  const required = currentState.pendingDiscards[playerId] ?? 0;
  if (required <= 0) {
    throw new Error("You do not need to discard");
  }
  const discardSum =
    totalResourceCount(action.resources) +
    totalCommodityCount(action.commodities);
  if (discardSum !== required) {
    throw new Error(
      `Must discard exactly ${required} cards (got ${discardSum})`
    );
  }
  if (
    !hasResources(player.resources, action.resources) ||
    !hasCommodities(player.commodities, action.commodities)
  ) {
    throw new Error("Cannot discard cards you do not have");
  }

  const nextPendingDiscards = omitRecordKey(
    currentState.pendingDiscards,
    playerId
  );
  const discardedState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, action.resources),
    commodityBank: addCommoditiesPure(
      currentState.commodityBank,
      action.commodities
    ),
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, action.resources),
      commodities: subtractCommoditiesPure(p.commodities, action.commodities),
    })),
    pendingDiscards: nextPendingDiscards,
  };

  const logged = appendCatanEvent(
    discardedState,
    [],
    "CARDS_DISCARDED",
    `${player.name} discarded ${required} resource cards.`,
    playerId,
    totalCommodityCount(action.commodities) > 0
      ? { resources: action.resources, commodities: action.commodities }
      : { resources: action.resources }
  );

  return {
    state: {
      ...logged.state,
      phase:
        Object.keys(nextPendingDiscards).length === 0
          ? logged.state.phaseAfterDiscard
          : logged.state.phase,
    },
    events: logged.emitted,
  };
}
