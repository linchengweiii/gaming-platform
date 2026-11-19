import {
  type CatanState,
  RESOURCES,
  type ResourceType,
  TRADE_GOODS,
  type TradeGoodMap,
  type TradeGoodType,
  getPlayerGoodCount,
  getPlayerGoodTradeRatios,
  getPlayerTradeRatios,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  setSharedTradeGoodWantPure,
  setSharedTradeWantPure,
  switchTradeModePure,
} from "../reducers/trade-and-draft-reducers.ts";
import type { AppRuntimeContext } from "./context.ts";

const IMMEDIATE_PROGRESS_CARD_TYPES = new Set([
  "mining",
  "irrigation",
  "crane",
  "medicine",
  "road_building",
  "warlord",
  "saboteur",
  "wedding",
  "commercial_harbor",
]);

export function attachCatanUiActions(ctx: AppRuntimeContext): void {
  ctx.switchTradeMode = (
    nextMode: "maritime_trade" | "domestic_trade" | null
  ): void => {
    ctx.model = switchTradeModePure(ctx.model, nextMode);
    ctx.render();
  };

  ctx.setSharedTradeWant = (resource: ResourceType, amount: number): void => {
    ctx.model = setSharedTradeWantPure(ctx.model, resource, amount);
  };
}

export function handleCatanHandCardClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  g: TradeGoodType
): void {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
  if (!actingPlayer || getPlayerGoodCount(actingPlayer, g) <= 0) return;

  if (isCommodityType(g)) {
    if (!state.config.enableCitiesAndKnights) return;
    if (state.phase === "DISCARD_ON_SEVEN") {
      const req = state.pendingDiscards[actingPlayerId] ?? 0;
      const totalSel =
        totalResourceCount(ctx.model.discardSelection) +
        totalCommodityCount(ctx.model.discardCommodities);
      if (
        ctx.model.discardCommodities[g] < actingPlayer.commodities[g] &&
        totalSel < req
      ) {
        ctx.model = {
          ...ctx.model,
          discardCommodities: {
            ...ctx.model.discardCommodities,
            [g]: ctx.model.discardCommodities[g] + 1,
          },
        };
        ctx.render();
      }
    } else if (ctx.model.buildMode === "domestic_trade") {
      if (ctx.model.domesticCommGive[g] < actingPlayer.commodities[g]) {
        ctx.model = setSharedTradeGoodWantPure(
          {
            ...ctx.model,
            domesticCommGive: {
              ...ctx.model.domesticCommGive,
              [g]: ctx.model.domesticCommGive[g] + 1,
            },
          },
          g,
          0
        );
        ctx.render();
      }
    } else if (state.phase === "MAIN_PHASE" && !state.activeTradeOffer) {
      const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
      const ratio = goodRatios[g];
      if (actingPlayer.commodities[g] >= ctx.model.maritimeCommGive[g] + ratio) {
        ctx.model = switchTradeModePure(
          setSharedTradeGoodWantPure(
            {
              ...ctx.model,
              maritimeCommGive: {
                ...ctx.model.maritimeCommGive,
                [g]: ctx.model.maritimeCommGive[g] + ratio,
              },
            },
            g,
            0
          ),
          "maritime_trade"
        );
        ctx.render();
      } else {
        const withGive =
          ctx.model.domesticCommGive[g] < actingPlayer.commodities[g]
            ? setSharedTradeGoodWantPure(
                {
                  ...ctx.model,
                  domesticCommGive: {
                    ...ctx.model.domesticCommGive,
                    [g]: ctx.model.domesticCommGive[g] + 1,
                  },
                },
                g,
                0
              )
            : ctx.model;
        ctx.model = switchTradeModePure(withGive, "domestic_trade");
        ctx.render();
      }
    }
    return;
  }

  const r = g;
  if (state.phase === "DISCARD_ON_SEVEN") {
    const req = state.pendingDiscards[actingPlayerId] ?? 0;
    const totalSel =
      totalResourceCount(ctx.model.discardSelection) +
      (state.config.enableCitiesAndKnights
        ? totalCommodityCount(ctx.model.discardCommodities)
        : 0);
    if (
      ctx.model.discardSelection[r] < actingPlayer.resources[r] &&
      totalSel < req
    ) {
      ctx.model = {
        ...ctx.model,
        discardSelection: {
          ...ctx.model.discardSelection,
          [r]: ctx.model.discardSelection[r] + 1,
        },
      };
      ctx.render();
    }
  } else if (ctx.model.buildMode === "domestic_trade") {
    if (ctx.model.domesticGive[r] < actingPlayer.resources[r]) {
      ctx.model = setSharedTradeWantPure(
        {
          ...ctx.model,
          domesticGive: {
            ...ctx.model.domesticGive,
            [r]: ctx.model.domesticGive[r] + 1,
          },
        },
        r,
        0
      );
      ctx.render();
    }
  } else if (state.phase === "MAIN_PHASE" && !state.activeTradeOffer) {
    const ratios = state.config.enableCitiesAndKnights
      ? getPlayerGoodTradeRatios(state, actingPlayerId)
      : getPlayerTradeRatios(state, actingPlayerId);
    const ratio = ratios[r];
    if (actingPlayer.resources[r] >= ctx.model.maritimeGive[r] + ratio) {
      ctx.model = switchTradeModePure(
        setSharedTradeWantPure(
          {
            ...ctx.model,
            maritimeGive: {
              ...ctx.model.maritimeGive,
              [r]: ctx.model.maritimeGive[r] + ratio,
            },
          },
          r,
          0
        ),
        "maritime_trade"
      );
      ctx.render();
    } else {
      const withGive =
        ctx.model.domesticGive[r] < actingPlayer.resources[r]
          ? setSharedTradeWantPure(
              {
                ...ctx.model,
                domesticGive: {
                  ...ctx.model.domesticGive,
                  [r]: ctx.model.domesticGive[r] + 1,
                },
              },
              r,
              0
            )
          : ctx.model;
      ctx.model = switchTradeModePure(withGive, "domestic_trade");
      ctx.render();
    }
  }
}

export function handleCatanPlayProgressCardClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  cardId: string
): void {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
  const card = actingPlayer?.progressCards.find((c) => c.id === cardId);
  if (!card) return;
  if (IMMEDIATE_PROGRESS_CARD_TYPES.has(card.type)) {
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_PROGRESS_CARD",
      cardId,
    });
    return;
  }
  ctx.model = {
    ...ctx.model,
    selectedBoardSpot: null,
    buildMode: "progress_card",
    selectedProgressCardId: cardId,
    inventorHex1: null,
    smithVertex1: null,
    deserterTargetPlayerId: null,
  };
  ctx.render();
}

export function handleCatanMaritimeGiveInc(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  r: ResourceType
): void {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
  if (!actingPlayer) return;
  const ratios = getPlayerTradeRatios(state, actingPlayerId);
  const step = ratios[r];
  if (actingPlayer.resources[r] >= ctx.model.maritimeGive[r] + step) {
    ctx.model = setSharedTradeWantPure(
      {
        ...ctx.model,
        tradeGiveRes: r,
        maritimeGive: {
          ...ctx.model.maritimeGive,
          [r]: ctx.model.maritimeGive[r] + step,
        },
      },
      r,
      0
    );
    ctx.render();
  }
}

export function handleCatanMaritimeGiveDec(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  r: ResourceType
): void {
  const ratios = getPlayerTradeRatios(state, actingPlayerId);
  const step = ratios[r];
  const nextVal =
    ctx.model.maritimeGive[r] >= step ? ctx.model.maritimeGive[r] - step : 0;
  ctx.model = {
    ...ctx.model,
    maritimeGive: {
      ...ctx.model.maritimeGive,
      [r]: nextVal,
    },
  };
  ctx.render();
}

export function handleCatanCkMaritimeGiveInc(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  g: TradeGoodType
): void {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
  if (!actingPlayer) return;
  const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
  const step = goodRatios[g];
  const cur = isCommodityType(g)
    ? ctx.model.maritimeCommGive[g]
    : ctx.model.maritimeGive[g];
  if (getPlayerGoodCount(actingPlayer, g) >= cur + step) {
    if (isCommodityType(g)) {
      ctx.model = setSharedTradeGoodWantPure(
        {
          ...ctx.model,
          maritimeCommGive: {
            ...ctx.model.maritimeCommGive,
            [g]: cur + step,
          },
        },
        g,
        0
      );
    } else {
      ctx.model = setSharedTradeWantPure(
        {
          ...ctx.model,
          tradeGiveRes: g,
          maritimeGive: {
            ...ctx.model.maritimeGive,
            [g]: cur + step,
          },
        },
        g,
        0
      );
    }
    ctx.render();
  }
}

export function handleCatanCkMaritimeGiveDec(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  g: TradeGoodType
): void {
  const goodRatios = getPlayerGoodTradeRatios(state, actingPlayerId);
  const step = goodRatios[g];
  if (isCommodityType(g)) {
    const nextVal =
      ctx.model.maritimeCommGive[g] >= step
        ? ctx.model.maritimeCommGive[g] - step
        : 0;
    ctx.model = {
      ...ctx.model,
      maritimeCommGive: { ...ctx.model.maritimeCommGive, [g]: nextVal },
    };
  } else {
    const nextVal =
      ctx.model.maritimeGive[g] >= step ? ctx.model.maritimeGive[g] - step : 0;
    ctx.model = {
      ...ctx.model,
      maritimeGive: { ...ctx.model.maritimeGive, [g]: nextVal },
    };
  }
  ctx.render();
}

export function executeCatanMaritimeTrade(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  if (state.config.enableCitiesAndKnights) {
    const giveMap: TradeGoodMap = {
      ...ctx.model.maritimeGive,
      ...ctx.model.maritimeCommGive,
    };
    const receiveMap: TradeGoodMap = {
      ...ctx.model.maritimeWant,
      ...ctx.model.maritimeCommWant,
    };
    const activeGive = TRADE_GOODS.filter((g) => giveMap[g] > 0);
    const activeWant = TRADE_GOODS.filter((g) => receiveMap[g] > 0);
    if (activeGive.length === 0 || activeWant.length === 0) return;

    const firstGive = activeGive[0]!;
    const firstWant = activeWant[0]!;
    if (activeGive.length === 1 && activeWant.length === 1) {
      ctx.dispatch(actingPlayerId, {
        type: "MARITIME_TRADE",
        give: firstGive,
        giveAmount: giveMap[firstGive],
        receive: firstWant,
        receiveAmount: receiveMap[firstWant],
      });
    } else {
      ctx.dispatch(actingPlayerId, {
        type: "MARITIME_TRADE",
        give: firstGive,
        giveAmount: giveMap[firstGive],
        receive: firstWant,
        receiveAmount: receiveMap[firstWant],
        giveMap,
        receiveMap,
      });
    }
    return;
  }

  const activeGive = RESOURCES.filter((r) => ctx.model.maritimeGive[r] > 0);
  const activeWant = RESOURCES.filter((r) => ctx.model.maritimeWant[r] > 0);
  if (activeGive.length === 0 || activeWant.length === 0) return;

  const firstGive = activeGive[0]!;
  const firstWant = activeWant[0]!;
  if (activeGive.length === 1 && activeWant.length === 1) {
    ctx.dispatch(actingPlayerId, {
      type: "MARITIME_TRADE",
      give: firstGive,
      giveAmount: ctx.model.maritimeGive[firstGive],
      receive: firstWant,
      receiveAmount: ctx.model.maritimeWant[firstWant],
    });
  } else {
    ctx.dispatch(actingPlayerId, {
      type: "MARITIME_TRADE",
      give: firstGive,
      giveAmount: ctx.model.maritimeGive[firstGive],
      receive: firstWant,
      receiveAmount: ctx.model.maritimeWant[firstWant],
      giveMap: { ...ctx.model.maritimeGive },
      receiveMap: { ...ctx.model.maritimeWant },
    });
  }
}
