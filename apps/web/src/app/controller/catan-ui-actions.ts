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
import type { AppModel } from "../types.ts";
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

function getGoodCountFromModel(
  model: Readonly<AppModel>,
  kind: "discard" | "domesticGive" | "maritimeGive",
  good: TradeGoodType
): number {
  if (isCommodityType(good)) {
    const key =
      kind === "discard"
        ? "discardCommodities"
        : kind === "domesticGive"
          ? "domesticCommGive"
          : "maritimeCommGive";
    return model[key][good];
  }
  const key =
    kind === "discard"
      ? "discardSelection"
      : kind === "domesticGive"
        ? "domesticGive"
        : "maritimeGive";
  return model[key][good];
}

function setGoodCountInModel(
  model: Readonly<AppModel>,
  kind: "discard" | "domesticGive" | "maritimeGive",
  good: TradeGoodType,
  value: number
): AppModel {
  if (isCommodityType(good)) {
    const key =
      kind === "discard"
        ? "discardCommodities"
        : kind === "domesticGive"
          ? "domesticCommGive"
          : "maritimeCommGive";
    return { ...model, [key]: { ...model[key], [good]: value } };
  }
  const key =
    kind === "discard"
      ? "discardSelection"
      : kind === "domesticGive"
        ? "domesticGive"
        : "maritimeGive";
  return { ...model, [key]: { ...model[key], [good]: value } };
}

export function attachCatanUiActions(ctx: AppRuntimeContext): void {
  ctx.switchTradeMode = (nextMode): void => {
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
  good: TradeGoodType
): void {
  const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
  const owned = actingPlayer ? getPlayerGoodCount(actingPlayer, good) : 0;
  if (owned <= 0) return;
  if (isCommodityType(good) && !state.config.enableCitiesAndKnights) return;

  if (state.phase === "DISCARD_ON_SEVEN") {
    const req = state.pendingDiscards[actingPlayerId] ?? 0;
    const totalSel =
      totalResourceCount(ctx.model.discardSelection) +
      (state.config.enableCitiesAndKnights
        ? totalCommodityCount(ctx.model.discardCommodities)
        : 0);
    const cur = getGoodCountFromModel(ctx.model, "discard", good);
    if (cur < owned && totalSel < req) {
      ctx.model = setGoodCountInModel(ctx.model, "discard", good, cur + 1);
      ctx.render();
    }
    return;
  }

  const addDomesticGive = (base: AppModel): AppModel => {
    const cur = getGoodCountFromModel(base, "domesticGive", good);
    if (cur >= owned) return base;
    return setSharedTradeGoodWantPure(
      setGoodCountInModel(base, "domesticGive", good, cur + 1),
      good,
      0
    );
  };

  if (ctx.model.buildMode === "domestic_trade") {
    const next = addDomesticGive(ctx.model);
    if (next !== ctx.model) {
      ctx.model = next;
      ctx.render();
    }
    return;
  }

  if (state.phase === "MAIN_PHASE" && !state.activeTradeOffer) {
    const ratio = state.config.enableCitiesAndKnights
      ? getPlayerGoodTradeRatios(state, actingPlayerId)[good]
      : getPlayerTradeRatios(state, actingPlayerId)[good as ResourceType];
    const curMar = getGoodCountFromModel(ctx.model, "maritimeGive", good);
    if (owned >= curMar + ratio) {
      ctx.model = switchTradeModePure(
        setSharedTradeGoodWantPure(
          setGoodCountInModel(ctx.model, "maritimeGive", good, curMar + ratio),
          good,
          0
        ),
        "maritime_trade"
      );
    } else {
      ctx.model = switchTradeModePure(
        addDomesticGive(ctx.model),
        "domestic_trade"
      );
    }
    ctx.render();
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
  };
  ctx.render();
}

export function adjustCatanMaritimeGive(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  good: TradeGoodType,
  deltaDir: 1 | -1,
  useCkRatios: boolean
): void {
  const step = useCkRatios
    ? getPlayerGoodTradeRatios(state, actingPlayerId)[good]
    : getPlayerTradeRatios(state, actingPlayerId)[good as ResourceType];
  const cur = getGoodCountFromModel(ctx.model, "maritimeGive", good);

  if (deltaDir === 1) {
    const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
    if (!actingPlayer || getPlayerGoodCount(actingPlayer, good) < cur + step) {
      return;
    }
    ctx.model = setSharedTradeGoodWantPure(
      setGoodCountInModel(ctx.model, "maritimeGive", good, cur + step),
      good,
      0
    );
  } else {
    const nextVal = cur >= step ? cur - step : 0;
    ctx.model = setGoodCountInModel(ctx.model, "maritimeGive", good, nextVal);
  }
  ctx.render();
}

export function executeCatanMaritimeTrade(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const isCk = state.config.enableCitiesAndKnights;
  const goods: readonly TradeGoodType[] = isCk ? TRADE_GOODS : RESOURCES;
  const giveMap: Partial<TradeGoodMap> = isCk
    ? { ...ctx.model.maritimeGive, ...ctx.model.maritimeCommGive }
    : { ...ctx.model.maritimeGive };
  const receiveMap: Partial<TradeGoodMap> = isCk
    ? { ...ctx.model.maritimeWant, ...ctx.model.maritimeCommWant }
    : { ...ctx.model.maritimeWant };

  const activeGive = goods.filter((g) => (giveMap[g] ?? 0) > 0);
  const activeWant = goods.filter((g) => (receiveMap[g] ?? 0) > 0);
  if (activeGive.length === 0 || activeWant.length === 0) return;

  const firstGive = activeGive[0]!;
  const firstWant = activeWant[0]!;
  const isSingle = activeGive.length === 1 && activeWant.length === 1;
  ctx.dispatch(actingPlayerId, {
    type: "MARITIME_TRADE",
    give: firstGive,
    giveAmount: giveMap[firstGive]!,
    receive: firstWant,
    receiveAmount: receiveMap[firstWant]!,
    ...(!isSingle ? { giveMap, receiveMap } : {}),
  });
}
