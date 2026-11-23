import {
  COMMODITIES,
  type CommodityMap,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  type TradeGoodType,
  emptyCommodities,
  emptyResources,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import type { GemColor, SplendorState } from "@gaming-platform/splendor";
import type { AppModel } from "../types.ts";

export function createInitialSubModesPure() {
  return {
    buildMode: null,
    mapBuildMenuExpanded: false,
    selectedBoardSpot: null,
    setupEdgeKind: "road" as const,
    robberOrPirateMode: "robber" as const,
    selectedMoveFromEdgeId: null,
    selectedMoveKnightFromVertexId: null,
    selectedChaseKnightVertexId: null,
    discardSelection: emptyResources(),
    discardCommodities: emptyCommodities(),
    maritimeGive: emptyResources(),
    maritimeWant: emptyResources(),
    maritimeCommGive: emptyCommodities(),
    maritimeCommWant: emptyCommodities(),
    domesticGive: emptyResources(),
    domesticWant: emptyResources(),
    domesticCommGive: emptyCommodities(),
    domesticCommWant: emptyCommodities(),
    selectedMetropolisVertexId: null,
    selectedProgressCardId: null,
    inventorHex1: null,
    smithVertex1: null,
    splendorDraftGems: {},
    azulSelectedDraft: null,
    azulInspectedPlayerId: null,
    sevenWondersSelectedCardId: null,
    sevenWondersInspectedPlayerId: null,
  };
}

export function resetSubModesPure(model: Readonly<AppModel>): AppModel {
  return {
    ...model,
    ...createInitialSubModesPure(),
  };
}

export function switchTradeModePure(
  model: Readonly<AppModel>,
  nextMode: "maritime_trade" | "domestic_trade" | null
): AppModel {
  const marTotal =
    totalResourceCount(model.maritimeWant) +
    totalCommodityCount(model.maritimeCommWant);
  const domTotal =
    totalResourceCount(model.domesticWant) +
    totalCommodityCount(model.domesticCommWant);
  const useDomestic =
    (model.buildMode === "domestic_trade" && nextMode === "maritime_trade") ||
    (model.buildMode !== "maritime_trade" &&
      (nextMode === "maritime_trade"
        ? marTotal === 0 && domTotal > 0
        : !(domTotal === 0 && marTotal > 0)));
  const srcResWant = useDomestic ? model.domesticWant : model.maritimeWant;
  const srcCommWant = useDomestic
    ? model.domesticCommWant
    : model.maritimeCommWant;

  const zeroConflicts = <K extends string>(
    keys: readonly K[],
    want: Record<K, number>,
    give: Record<K, number>,
    empty: Record<K, number>
  ): Record<K, number> =>
    keys.reduce(
      (acc, k) => ({ ...acc, [k]: want[k] > 0 ? 0 : give[k] }),
      empty
    );

  const nextMaritimeGive = zeroConflicts(
    RESOURCES,
    srcResWant,
    model.maritimeGive,
    emptyResources()
  ) as ResourceMap;
  const nextDomesticGive = zeroConflicts(
    RESOURCES,
    srcResWant,
    model.domesticGive,
    emptyResources()
  ) as ResourceMap;
  const nextMaritimeCommGive = zeroConflicts(
    COMMODITIES,
    srcCommWant,
    model.maritimeCommGive,
    emptyCommodities()
  ) as CommodityMap;
  const nextDomesticCommGive = zeroConflicts(
    COMMODITIES,
    srcCommWant,
    model.domesticCommGive,
    emptyCommodities()
  ) as CommodityMap;

  return {
    ...model,
    selectedBoardSpot: null,
    mapBuildMenuExpanded: false,
    maritimeWant: { ...srcResWant },
    domesticWant: { ...srcResWant },
    maritimeCommWant: { ...srcCommWant },
    domesticCommWant: { ...srcCommWant },
    maritimeGive: nextMaritimeGive,
    domesticGive: nextDomesticGive,
    maritimeCommGive: nextMaritimeCommGive,
    domesticCommGive: nextDomesticCommGive,
    buildMode: nextMode,
  };
}

export function setSharedTradeWantPure(
  model: Readonly<AppModel>,
  resource: ResourceType,
  amount: number
): AppModel {
  const clamped = Math.max(0, amount);
  return {
    ...model,
    maritimeWant: { ...model.maritimeWant, [resource]: clamped },
    domesticWant: { ...model.domesticWant, [resource]: clamped },
    maritimeGive:
      clamped > 0
        ? { ...model.maritimeGive, [resource]: 0 }
        : { ...model.maritimeGive },
    domesticGive:
      clamped > 0
        ? { ...model.domesticGive, [resource]: 0 }
        : { ...model.domesticGive },
  };
}

export function setSharedTradeGoodWantPure(
  model: Readonly<AppModel>,
  good: TradeGoodType,
  amount: number
): AppModel {
  if (!isCommodityType(good)) {
    return setSharedTradeWantPure(model, good, amount);
  }
  const clamped = Math.max(0, amount);
  return {
    ...model,
    maritimeCommWant: { ...model.maritimeCommWant, [good]: clamped },
    domesticCommWant: { ...model.domesticCommWant, [good]: clamped },
    maritimeCommGive:
      clamped > 0
        ? { ...model.maritimeCommGive, [good]: 0 }
        : { ...model.maritimeCommGive },
    domesticCommGive:
      clamped > 0
        ? { ...model.domesticCommGive, [good]: 0 }
        : { ...model.domesticCommGive },
  };
}

export function toggleSplendorDraftGemPure(
  draftGems: Readonly<Partial<Record<GemColor, number>>>,
  state: SplendorState,
  color: GemColor
): Partial<Record<GemColor, number>> {
  const current = draftGems[color] ?? 0;
  const distinctSelected = (Object.keys(draftGems) as GemColor[]).filter(
    (k) => (draftGems[k] ?? 0) > 0
  );

  if (current === 0) {
    if (distinctSelected.length >= 3) {
      return { ...draftGems };
    }
    const normalized = distinctSelected.reduce<Partial<Record<GemColor, number>>>(
      (acc, k) => ({
        ...acc,
        [k]: 1,
      }),
      {}
    );
    return { ...normalized, [color]: 1 };
  }

  if (current === 1 && distinctSelected.length === 1 && state.bank[color] >= 4) {
    return { ...draftGems, [color]: 2 };
  }

  return Object.fromEntries(
    (Object.entries(draftGems) as Array<[GemColor, number | undefined]>).filter(
      ([k, v]) => k !== color && v !== undefined && v > 0
    )
  ) as Partial<Record<GemColor, number>>;
}
