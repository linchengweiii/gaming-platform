import {
  type CatanAction,
  CatanEngine,
  type CatanState,
  type CommodityType,
  type ImprovementDiscipline,
  type ResourceType,
  type TradeGoodType,
  emptyCommodities,
  emptyResources,
  getLegalPromoteKnightVertices,
  isCommodityType,
} from "@gaming-platform/catan";
import type { BuildMode } from "../types.ts";
import type { AppRuntimeContext } from "./context.ts";
import { onClick, onDataClick, patchModelAndRender } from "./dom-events.ts";

function bindCkInteractionEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  if (state.phase !== "CK_INTERACTION" || !state.pendingCkInteraction) return;
  const { root } = ctx;

  onDataClick(root, "data-ck-retreat-vertex", (vertexId) =>
    ctx.dispatch(actingPlayerId, { type: "RESOLVE_DISPLACED_KNIGHT", vertexId })
  );
  onDataClick(root, "data-ck-deserter-pick", (vertexId) =>
    ctx.dispatch(actingPlayerId, { type: "SELECT_DESERTER_KNIGHT", vertexId })
  );
  onDataClick(root, "data-ck-deserter-place", (vertexId) =>
    ctx.dispatch(actingPlayerId, { type: "PLACE_DESERTED_KNIGHT", vertexId })
  );
  onDataClick(root, "data-ck-spy-card", (stolenCardId) =>
    ctx.dispatch(actingPlayerId, { type: "SELECT_SPY_CARD", stolenCardId })
  );

  const submitCkCards = (
    type: "SELECT_MASTER_MERCHANT_CARDS" | "GIVE_WEDDING_CARDS"
  ) =>
    ctx.dispatch(actingPlayerId, {
      type,
      resources: { ...ctx.model.discardSelection },
      commodities: { ...ctx.model.discardCommodities },
    });
  onClick(root, "#btn-ck-mm-submit", () =>
    submitCkCards("SELECT_MASTER_MERCHANT_CARDS")
  );
  onClick(root, "#btn-ck-wedding-submit", () =>
    submitCkCards("GIVE_WEDDING_CARDS")
  );

  onDataClick(root, "data-ck-ch-offer", (raw) => {
    const [targetPlayerId, resource] = raw.split(":");
    if (!targetPlayerId || !resource) return;
    ctx.dispatch(actingPlayerId, {
      type: "OFFER_COMMERCIAL_HARBOR",
      targetPlayerId,
      resource: resource as ResourceType,
    });
  });
  onClick(root, "#btn-ck-ch-end", () =>
    ctx.dispatch(actingPlayerId, { type: "END_COMMERCIAL_HARBOR" })
  );
  onDataClick(root, "data-ck-ch-resp", (commodity) =>
    ctx.dispatch(actingPlayerId, {
      type: "RESPOND_COMMERCIAL_HARBOR",
      commodity: commodity as CommodityType,
    })
  );
}

const BUILD_MODE_TOGGLES: readonly [
  selector: string,
  mode: Exclude<BuildMode, null>,
  extraPatch?: Record<string, unknown>,
][] = [
  ["#btn-mode-road", "road"],
  ["#btn-mode-ship", "ship"],
  ["#btn-mode-moveship", "move_ship", { selectedMoveFromEdgeId: null }],
  ["#btn-mode-settlement", "settlement"],
  ["#btn-mode-city", "city"],
  ["#btn-mode-wall", "wall"],
  ["#btn-mode-knight", "knight"],
  ["#btn-mode-activate-knight", "activate_knight"],
  ["#btn-mode-promote-knight", "promote_knight"],
  [
    "#btn-mode-move-knight",
    "move_knight",
    { selectedMoveKnightFromVertexId: null },
  ],
  [
    "#btn-mode-chase-robber",
    "chase_robber",
    { selectedChaseKnightVertexId: null },
  ],
  ["#btn-mode-upgrades", "city_upgrades"],
];

export function bindCatanPhasesAndCkEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;
  bindCkInteractionEvents(ctx, state, actingPlayerId);

  onClick(root, "#btn-toggle-setup-edge", () =>
    patchModelAndRender(ctx, {
      setupEdgeKind: ctx.model.setupEdgeKind === "road" ? "ship" : "road",
    })
  );
  onClick(root, "#btn-toggle-robber-pirate", () =>
    patchModelAndRender(ctx, {
      robberOrPirateMode:
        ctx.model.robberOrPirateMode === "robber" ? "pirate" : "robber",
    })
  );

  onDataClick(root, "data-pillage-city", (vertexId) =>
    ctx.dispatch(actingPlayerId, { type: "SELECT_PILLAGED_CITY", vertexId })
  );
  onDataClick(root, "data-select-progress-deck", (discipline) =>
    ctx.dispatch(actingPlayerId, {
      type: "SELECT_PROGRESS_DECK",
      discipline: discipline as ImprovementDiscipline,
    })
  );
  onDataClick(root, "data-discard-progress-card", (cardId) =>
    ctx.dispatch(actingPlayerId, { type: "DISCARD_PROGRESS_CARD", cardId })
  );

  const adjustDiscardGood = (good: TradeGoodType, delta: 1 | -1): void => {
    if (isCommodityType(good)) {
      const next = ctx.model.discardCommodities[good] + delta;
      if (next < 0) return;
      patchModelAndRender(ctx, {
        discardCommodities: { ...ctx.model.discardCommodities, [good]: next },
      });
    } else {
      const next = ctx.model.discardSelection[good] + delta;
      if (next < 0) return;
      patchModelAndRender(ctx, {
        discardSelection: { ...ctx.model.discardSelection, [good]: next },
      });
    }
  };
  onDataClick(root, "data-discard-good-add", (g) =>
    adjustDiscardGood(g as TradeGoodType, 1)
  );
  onDataClick(root, "data-discard-good-sub", (g) =>
    adjustDiscardGood(g as TradeGoodType, -1)
  );
  onDataClick(root, "data-discard-add", (r) =>
    adjustDiscardGood(r as ResourceType, 1)
  );
  onDataClick(root, "data-discard-sub", (r) =>
    adjustDiscardGood(r as ResourceType, -1)
  );

  onClick(root, "#btn-discard-reset", () =>
    patchModelAndRender(ctx, {
      discardSelection: emptyResources(),
      discardCommodities: emptyCommodities(),
    })
  );
  onClick(root, "#btn-discard-submit", () =>
    ctx.dispatch(actingPlayerId, {
      type: "DISCARD_CARDS",
      resources: { ...ctx.model.discardSelection },
      ...(state.config.enableCitiesAndKnights
        ? { commodities: { ...ctx.model.discardCommodities } }
        : {}),
    })
  );
  onClick(root, "#btn-discard-auto", () => {
    const botAct = CatanEngine.chooseBotAction(state, actingPlayerId);
    if (botAct) ctx.dispatch(actingPlayerId, botAct);
  });

  onDataClick(root, "data-gold-pick", (resource) =>
    ctx.dispatch(actingPlayerId, {
      type: "SELECT_GOLD_RESOURCE",
      resource: resource as ResourceType,
    })
  );
  onDataClick(root, "data-steal-victim", (victimId) =>
    ctx.dispatch(actingPlayerId, { type: "STEAL_FROM_PLAYER", victimId })
  );

  onClick(root, "#btn-roll-dice", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "ROLL_DICE" })
  );
  onClick(root, "#btn-toggle-build-menu", (e) => {
    e.stopPropagation();
    patchModelAndRender(ctx, {
      mapBuildMenuExpanded: !ctx.model.mapBuildMenuExpanded,
    });
  });
  onClick(root, "#btn-fold-build-menu", (e) => {
    e.stopPropagation();
    patchModelAndRender(ctx, { mapBuildMenuExpanded: false });
  });

  for (const [selector, mode, extraPatch] of BUILD_MODE_TOGGLES) {
    onClick(root, selector, () =>
      patchModelAndRender(ctx, {
        selectedBoardSpot: null,
        mapBuildMenuExpanded: false,
        buildMode: ctx.model.buildMode === mode ? null : mode,
        ...(extraPatch ?? {}),
      })
    );
  }

  onDataClick(root, "data-select-metro-city", (vertexId) =>
    patchModelAndRender(ctx, { selectedMetropolisVertexId: vertexId })
  );
  onDataClick(root, "data-upgrade-discipline", (discipline, btn) => {
    const metroV = btn.getAttribute("data-metro-vertex") || undefined;
    ctx.dispatch(actingPlayerId, {
      type: "UPGRADE_CITY_IMPROVEMENT",
      discipline: discipline as ImprovementDiscipline,
      ...(metroV ? { metropolisVertexId: metroV } : {}),
    });
  });

  onDataClick(root, "data-alch-die1", (v) =>
    patchModelAndRender(ctx, { alchemistDie1: Number(v) })
  );
  onDataClick(root, "data-alch-die2", (v) =>
    patchModelAndRender(ctx, { alchemistDie2: Number(v) })
  );
  onClick(root, "#btn-exec-alchemist", () => {
    if (!ctx.model.selectedProgressCardId) return;
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_PROGRESS_CARD",
      cardId: ctx.model.selectedProgressCardId,
      params: {
        die1: ctx.model.alchemistDie1,
        die2: ctx.model.alchemistDie2,
      },
    });
  });
  onClick(root, "#btn-exec-smith-single", () => {
    if (!ctx.model.selectedProgressCardId) return;
    const promotable = getLegalPromoteKnightVertices(state, actingPlayerId, false);
    const vId = ctx.model.smithVertex1 ?? promotable[0];
    if (!vId) return;
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_PROGRESS_CARD",
      cardId: ctx.model.selectedProgressCardId,
      params: { vertexIds: [vId] },
    });
  });

  const dispatchSelectedProgress = (params: Record<string, unknown>): void => {
    if (!ctx.model.selectedProgressCardId) return;
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_PROGRESS_CARD",
      cardId: ctx.model.selectedProgressCardId,
      params,
    });
  };
  onDataClick(root, "data-prog-res", (resource) =>
    dispatchSelectedProgress({ resource: resource as ResourceType })
  );
  onDataClick(root, "data-prog-comm", (commodity) =>
    dispatchSelectedProgress({ commodity: commodity as CommodityType })
  );
  onDataClick(root, "data-prog-good", (good) =>
    dispatchSelectedProgress({ good: good as TradeGoodType })
  );

  onDataClick(root, "data-prog-opp", (targetPlayerId) => {
    if (!ctx.model.selectedProgressCardId) return;
    const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
    const card = actingPlayer?.progressCards.find(
      (c) => c.id === ctx.model.selectedProgressCardId
    );
    const matchingForOpp = CatanEngine.getLegalActions(
      state,
      actingPlayerId
    ).filter(
      (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
        a.type === "PLAY_PROGRESS_CARD" &&
        a.cardId === ctx.model.selectedProgressCardId &&
        a.params?.targetPlayerId === targetPlayerId
    );
    if (card?.type === "deserter" && matchingForOpp.length > 1) {
      patchModelAndRender(ctx, {
        deserterTargetPlayerId: targetPlayerId,
        selectedBoardSpot: null,
      });
      return;
    }
    ctx.dispatchUiAction(
      actingPlayerId,
      matchingForOpp[0] ?? {
        type: "PLAY_PROGRESS_CARD",
        cardId: ctx.model.selectedProgressCardId,
        params: { targetPlayerId },
      }
    );
  });

  onDataClick(root, "data-deserter-reset", () =>
    patchModelAndRender(ctx, { deserterTargetPlayerId: null })
  );
  onDataClick(root, "data-prog-action-idx", (rawIdx) => {
    if (!ctx.model.selectedProgressCardId) return;
    const legals = CatanEngine.getLegalActions(state, actingPlayerId).filter(
      (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
        a.type === "PLAY_PROGRESS_CARD" &&
        a.cardId === ctx.model.selectedProgressCardId
    );
    const chosen = legals[Number(rawIdx)];
    if (chosen) ctx.dispatchUiAction(actingPlayerId, chosen);
  });
}
