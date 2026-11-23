import {
  type CatanState,
  RESOURCES,
  type ResourceType,
  type TradeGoodType,
} from "@gaming-platform/catan";
import { bindCatanPhasesAndCkEvents } from "./bind-events-catan-phases-and-ck.ts";
import { bindCatanTradeEvents } from "./bind-events-catan-trade-and-dev.ts";
import {
  handleCatanEdgeSpotClick,
  handleCatanHexSpotClick,
  handleCatanPopoverSpotAction,
  handleCatanVertexSpotClick,
} from "./catan-spot-actions.ts";
import {
  handleCatanHandCardClick,
  handleCatanPlayProgressCardClick,
} from "./catan-ui-actions.ts";
import type { AppRuntimeContext } from "./context.ts";
import { onClick, onDataClick, patchModelAndRender } from "./dom-events.ts";

export function bindReadOnlyCatanSpotInspect(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  onClick(root, "#btn-close-spot-popover", () =>
    patchModelAndRender(ctx, { selectedBoardSpot: null })
  );

  for (const [attr, kind] of [
    ["data-spot-hex", "hex"],
    ["data-spot-vertex", "vertex"],
    ["data-spot-edge", "edge"],
  ] as const) {
    onDataClick(root, attr, (id, _el, e) => {
      e.stopPropagation();
      const cur = ctx.model.selectedBoardSpot;
      patchModelAndRender(ctx, {
        selectedBoardSpot:
          cur?.kind === kind && cur.id === id ? null : { kind, id },
      });
    });
  }
}

export function bindCatanEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  onDataClick(root, "data-close-submodal", () =>
    patchModelAndRender(ctx, {
      selectedBoardSpot: null,
      buildMode: null,
      mapBuildMenuExpanded: false,
      selectedProgressCardId: null,
      inventorHex1: null,
      smithVertex1: null,
    })
  );

  onClick(root, ".board-svg", () => {
    if (ctx.model.mapBuildMenuExpanded || ctx.model.selectedBoardSpot) {
      patchModelAndRender(ctx, {
        mapBuildMenuExpanded: false,
        selectedBoardSpot: null,
      });
    }
  });

  onDataClick(root, "data-hand-res-card", (g) =>
    handleCatanHandCardClick(ctx, state, actingPlayerId, g as TradeGoodType)
  );
  onDataClick(root, "data-play-progress-card", (cardId) =>
    handleCatanPlayProgressCardClick(ctx, state, actingPlayerId, cardId)
  );

  onClick(root, "#btn-hand-play-knight", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" })
  );
  onClick(root, "#btn-hand-play-roadbuild", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" })
  );
  onClick(root, "#btn-hand-play-yop", () =>
    patchModelAndRender(ctx, { buildMode: "year_of_plenty" })
  );
  onClick(root, "#btn-hand-play-mono", () =>
    patchModelAndRender(ctx, { buildMode: "monopoly" })
  );
  onClick(root, "#btn-close-spot-popover", () =>
    patchModelAndRender(ctx, { selectedBoardSpot: null })
  );

  onDataClick(root, "data-spot-action", (act, btn) =>
    handleCatanPopoverSpotAction(
      ctx,
      actingPlayerId,
      act,
      btn.getAttribute("data-spot-id") ?? "",
      btn.getAttribute("data-chase-vertex"),
      btn.getAttribute("data-chase-target")
    )
  );

  for (const [attr, handler] of [
    ["data-spot-hex", handleCatanHexSpotClick],
    ["data-spot-vertex", handleCatanVertexSpotClick],
    ["data-spot-edge", handleCatanEdgeSpotClick],
  ] as const) {
    onDataClick(root, attr, (id, _el, e) => {
      e.stopPropagation();
      ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
      handler(ctx, state, actingPlayerId, id);
    });
  }

  bindCatanPhasesAndCkEvents(ctx, state, actingPlayerId);
  bindCatanTradeEvents(ctx, state, actingPlayerId);

  onClick(root, "#btn-buy-dev", () => {
    ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
    ctx.dispatch(actingPlayerId, { type: "BUY_DEV_CARD" });
  });
  onClick(root, "#btn-play-knight", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" })
  );
  onClick(root, "#btn-play-roadbuild", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" })
  );

  const pickValidYopPair = (
    preferred1: ResourceType,
    preferred2: ResourceType
  ): { yopRes1: ResourceType; yopRes2: ResourceType } => {
    const avail = RESOURCES.filter((r) => state.bank[r] > 0);
    if (avail.length === 0) return { yopRes1: preferred1, yopRes2: preferred2 };
    const r1 = state.bank[preferred1] > 0 ? preferred1 : avail[0]!;
    const totalBank = avail.reduce((sum, r) => sum + state.bank[r], 0);
    if (totalBank === 1) return { yopRes1: r1, yopRes2: r1 };
    const r2Ok = state.bank[preferred2] >= (r1 === preferred2 ? 2 : 1);
    const r2 = r2Ok
      ? preferred2
      : avail.find((r) => state.bank[r] >= (r1 === r ? 2 : 1)) ?? r1;
    return { yopRes1: r1, yopRes2: r2 };
  };

  onClick(root, "#btn-mode-yop", () => {
    const nextOpen = ctx.model.buildMode !== "year_of_plenty";
    const pair = nextOpen
      ? pickValidYopPair(ctx.model.yopRes1, ctx.model.yopRes2)
      : { yopRes1: ctx.model.yopRes1, yopRes2: ctx.model.yopRes2 };
    patchModelAndRender(ctx, {
      ...pair,
      selectedBoardSpot: null,
      buildMode: nextOpen ? "year_of_plenty" : null,
    });
  });
  onDataClick(root, "data-yop-pick1", (picked1) =>
    patchModelAndRender(
      ctx,
      pickValidYopPair(picked1 as ResourceType, ctx.model.yopRes2)
    )
  );
  onDataClick(root, "data-yop-pick2", (r) =>
    patchModelAndRender(ctx, { yopRes2: r as ResourceType })
  );
  onClick(root, "#btn-exec-yop", () => {
    const totalBank = RESOURCES.reduce((sum, r) => sum + state.bank[r], 0);
    const { yopRes1: r1, yopRes2: r2 } = ctx.model;
    const valid =
      totalBank === 1
        ? state.bank[r1] === 1 && r2 === r1
        : state.bank[r1] >= 1 && state.bank[r2] >= (r1 === r2 ? 2 : 1);
    if (!valid) return;
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_YEAR_OF_PLENTY",
      resource1: r1,
      resource2: r2,
    });
  });

  onClick(root, "#btn-mode-mono", () =>
    patchModelAndRender(ctx, {
      selectedBoardSpot: null,
      buildMode: ctx.model.buildMode === "monopoly" ? null : "monopoly",
    })
  );
  onDataClick(root, "data-mono-pick", (r) =>
    patchModelAndRender(ctx, { monoRes: r as ResourceType })
  );
  onClick(root, "#btn-exec-mono", () =>
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_MONOPOLY",
      resource: ctx.model.monoRes,
    })
  );
  onClick(root, "#btn-end-turn", () =>
    ctx.dispatch(actingPlayerId, {
      type: state.phase === "SPECIAL_BUILDING" ? "END_SPECIAL_BUILD" : "END_TURN",
    })
  );
}
