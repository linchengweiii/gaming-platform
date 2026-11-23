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
    domesticTargetPlayerId: "all",
    selectedMetropolisVertexId: null,
    selectedProgressCardId: null,
    inventorHex1: null,
    smithVertex1: null,
    deserterTargetPlayerId: null,
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
  const syncedWants = (() => {
    const marTotal =
      totalResourceCount(model.maritimeWant) +
      totalCommodityCount(model.maritimeCommWant);
    const domTotal =
      totalResourceCount(model.domesticWant) +
      totalCommodityCount(model.domesticCommWant);
    if (model.buildMode === "domestic_trade" && nextMode === "maritime_trade") {
      return {
        maritimeWant: { ...model.domesticWant },
        domesticWant: { ...model.domesticWant },
        maritimeCommWant: { ...model.domesticCommWant },
        domesticCommWant: { ...model.domesticCommWant },
      };
    }
    if (model.buildMode === "maritime_trade" && nextMode === "domestic_trade") {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    if (nextMode === "maritime_trade") {
      if (marTotal === 0 && domTotal > 0) {
        return {
          maritimeWant: { ...model.domesticWant },
          domesticWant: { ...model.domesticWant },
          maritimeCommWant: { ...model.domesticCommWant },
          domesticCommWant: { ...model.domesticCommWant },
        };
      }
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    if (domTotal === 0 && marTotal > 0) {
      return {
        maritimeWant: { ...model.maritimeWant },
        domesticWant: { ...model.maritimeWant },
        maritimeCommWant: { ...model.maritimeCommWant },
        domesticCommWant: { ...model.maritimeCommWant },
      };
    }
    return {
      maritimeWant: { ...model.domesticWant },
      domesticWant: { ...model.domesticWant },
      maritimeCommWant: { ...model.domesticCommWant },
      domesticCommWant: { ...model.domesticCommWant },
    };
  })();

  const nextMaritimeGive = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({
      ...acc,
      [r]: syncedWants.maritimeWant[r] > 0 ? 0 : model.maritimeGive[r],
    }),
    emptyResources()
  );

  const nextDomesticGive = RESOURCES.reduce<ResourceMap>(
    (acc, r) => ({
      ...acc,
      [r]: syncedWants.domesticWant[r] > 0 ? 0 : model.domesticGive[r],
    }),
    emptyResources()
  );

  const nextMaritimeCommGive = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({
      ...acc,
      [c]: syncedWants.maritimeCommWant[c] > 0 ? 0 : model.maritimeCommGive[c],
    }),
    emptyCommodities()
  );

  const nextDomesticCommGive = COMMODITIES.reduce<CommodityMap>(
    (acc, c) => ({
      ...acc,
      [c]: syncedWants.domesticCommWant[c] > 0 ? 0 : model.domesticCommGive[c],
    }),
    emptyCommodities()
  );

  return {
    ...model,
    selectedBoardSpot: null,
    mapBuildMenuExpanded: false,
    maritimeWant: syncedWants.maritimeWant,
    domesticWant: syncedWants.domesticWant,
    maritimeCommWant: syncedWants.maritimeCommWant,
    domesticCommWant: syncedWants.domesticCommWant,
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
