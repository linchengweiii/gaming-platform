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

export function bindCatanPhasesAndCkEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  root
    .querySelector("#btn-toggle-setup-edge")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        setupEdgeKind: ctx.model.setupEdgeKind === "road" ? "ship" : "road",
      };
      ctx.render();
    });

  root
    .querySelector("#btn-toggle-robber-pirate")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        robberOrPirateMode:
          ctx.model.robberOrPirateMode === "robber" ? "pirate" : "robber",
      };
      ctx.render();
    });

  root.querySelectorAll("[data-pillage-city]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vertexId = btn.getAttribute("data-pillage-city")!;
      ctx.dispatch(actingPlayerId, {
        type: "SELECT_PILLAGED_CITY",
        vertexId,
      });
    });
  });

  root.querySelectorAll("[data-select-progress-deck]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const discipline = btn.getAttribute(
        "data-select-progress-deck"
      ) as ImprovementDiscipline;
      ctx.dispatch(actingPlayerId, {
        type: "SELECT_PROGRESS_DECK",
        discipline,
      });
    });
  });

  root.querySelectorAll("[data-discard-progress-card]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-discard-progress-card")!;
      ctx.dispatch(actingPlayerId, {
        type: "DISCARD_PROGRESS_CARD",
        cardId,
      });
    });
  });

  root.querySelectorAll("[data-discard-good-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-discard-good-add") as TradeGoodType;
      if (isCommodityType(g)) {
        ctx.model = {
          ...ctx.model,
          discardCommodities: {
            ...ctx.model.discardCommodities,
            [g]: ctx.model.discardCommodities[g] + 1,
          },
        };
      } else {
        ctx.model = {
          ...ctx.model,
          discardSelection: {
            ...ctx.model.discardSelection,
            [g]: ctx.model.discardSelection[g] + 1,
          },
        };
      }
      ctx.render();
    });
  });

  root.querySelectorAll("[data-discard-good-sub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-discard-good-sub") as TradeGoodType;
      if (isCommodityType(g)) {
        if (ctx.model.discardCommodities[g] > 0) {
          ctx.model = {
            ...ctx.model,
            discardCommodities: {
              ...ctx.model.discardCommodities,
              [g]: ctx.model.discardCommodities[g] - 1,
            },
          };
          ctx.render();
        }
      } else if (ctx.model.discardSelection[g] > 0) {
        ctx.model = {
          ...ctx.model,
          discardSelection: {
            ...ctx.model.discardSelection,
            [g]: ctx.model.discardSelection[g] - 1,
          },
        };
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-discard-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-discard-add") as ResourceType;
      ctx.model = {
        ...ctx.model,
        discardSelection: {
          ...ctx.model.discardSelection,
          [r]: ctx.model.discardSelection[r] + 1,
        },
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-discard-sub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-discard-sub") as ResourceType;
      if (ctx.model.discardSelection[r] > 0) {
        ctx.model = {
          ...ctx.model,
          discardSelection: {
            ...ctx.model.discardSelection,
            [r]: ctx.model.discardSelection[r] - 1,
          },
        };
        ctx.render();
      }
    });
  });

  root.querySelector("#btn-discard-reset")?.addEventListener("click", () => {
    ctx.model = {
      ...ctx.model,
      discardSelection: emptyResources(),
      discardCommodities: emptyCommodities(),
    };
    ctx.render();
  });

  root.querySelector("#btn-discard-submit")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, {
      type: "DISCARD_CARDS",
      resources: { ...ctx.model.discardSelection },
      ...(state.config.enableCitiesAndKnights
        ? { commodities: { ...ctx.model.discardCommodities } }
        : {}),
    });
  });

  root.querySelector("#btn-discard-auto")?.addEventListener("click", () => {
    const botAct = CatanEngine.chooseBotAction(state, actingPlayerId);
    if (botAct) ctx.dispatch(actingPlayerId, botAct);
  });

  root.querySelectorAll("[data-gold-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const resource = btn.getAttribute("data-gold-pick") as ResourceType;
      ctx.dispatch(actingPlayerId, {
        type: "SELECT_GOLD_RESOURCE",
        resource,
      });
    });
  });

  root.querySelectorAll("[data-steal-victim]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const victimId = btn.getAttribute("data-steal-victim")!;
      ctx.dispatch(actingPlayerId, {
        type: "STEAL_FROM_PLAYER",
        victimId,
      });
    });
  });

  root.querySelector("#btn-roll-dice")?.addEventListener("click", () => {
    ctx.dispatchUiAction(actingPlayerId, { type: "ROLL_DICE" });
  });

  root
    .querySelector("#btn-toggle-build-menu")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.model = {
        ...ctx.model,
        mapBuildMenuExpanded: !ctx.model.mapBuildMenuExpanded,
      };
      ctx.render();
    });

  root
    .querySelector("#btn-fold-build-menu")
    ?.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.model = {
        ...ctx.model,
        mapBuildMenuExpanded: false,
      };
      ctx.render();
    });

  const bindToggleBuildMode = (
    selector: string,
    mode: Exclude<BuildMode, null>,
    extraPatch?: Record<string, unknown>
  ) => {
    root.querySelector(selector)?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        selectedBoardSpot: null,
        mapBuildMenuExpanded: false,
        buildMode: ctx.model.buildMode === mode ? null : mode,
        ...(extraPatch ?? {}),
      };
      ctx.render();
    });
  };

  bindToggleBuildMode("#btn-mode-road", "road");
  bindToggleBuildMode("#btn-mode-ship", "ship");
  bindToggleBuildMode("#btn-mode-moveship", "move_ship", {
    selectedMoveFromEdgeId: null,
  });
  bindToggleBuildMode("#btn-mode-settlement", "settlement");
  bindToggleBuildMode("#btn-mode-city", "city");
  bindToggleBuildMode("#btn-mode-wall", "wall");
  bindToggleBuildMode("#btn-mode-knight", "knight");
  bindToggleBuildMode("#btn-mode-activate-knight", "activate_knight");
  bindToggleBuildMode("#btn-mode-promote-knight", "promote_knight");
  bindToggleBuildMode("#btn-mode-move-knight", "move_knight", {
    selectedMoveKnightFromVertexId: null,
  });
  bindToggleBuildMode("#btn-mode-chase-robber", "chase_robber", {
    selectedChaseKnightVertexId: null,
  });
  bindToggleBuildMode("#btn-mode-upgrades", "city_upgrades");

  root.querySelectorAll("[data-select-metro-city]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        selectedMetropolisVertexId: btn.getAttribute("data-select-metro-city"),
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-upgrade-discipline]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const discipline = btn.getAttribute(
        "data-upgrade-discipline"
      ) as ImprovementDiscipline;
      const metroV = btn.getAttribute("data-metro-vertex") || undefined;
      ctx.dispatch(actingPlayerId, {
        type: "UPGRADE_CITY_IMPROVEMENT",
        discipline,
        ...(metroV ? { metropolisVertexId: metroV } : {}),
      });
    });
  });

  root.querySelectorAll("[data-alch-die1]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        alchemistDie1: Number(btn.getAttribute("data-alch-die1")),
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-alch-die2]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        alchemistDie2: Number(btn.getAttribute("data-alch-die2")),
      };
      ctx.render();
    });
  });

  root
    .querySelector("#btn-exec-alchemist")
    ?.addEventListener("click", () => {
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

  root
    .querySelector("#btn-exec-smith-single")
    ?.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const promotable = getLegalPromoteKnightVertices(
        state,
        actingPlayerId,
        true
      );
      const vId = ctx.model.smithVertex1 ?? promotable[0];
      if (!vId) return;
      ctx.dispatchUiAction(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: ctx.model.selectedProgressCardId,
        params: { vertexIds: [vId] },
      });
    });

  root.querySelectorAll("[data-prog-res]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const resource = btn.getAttribute("data-prog-res") as ResourceType;
      ctx.dispatchUiAction(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: ctx.model.selectedProgressCardId,
        params: { resource },
      });
    });
  });

  root.querySelectorAll("[data-prog-comm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const commodity = btn.getAttribute("data-prog-comm") as CommodityType;
      ctx.dispatchUiAction(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: ctx.model.selectedProgressCardId,
        params: { commodity },
      });
    });
  });

  root.querySelectorAll("[data-prog-good]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const good = btn.getAttribute("data-prog-good") as TradeGoodType;
      ctx.dispatchUiAction(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: ctx.model.selectedProgressCardId,
        params: { good },
      });
    });
  });

  root.querySelectorAll("[data-prog-opp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const targetPlayerId = btn.getAttribute("data-prog-opp")!;
      const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
      const card = actingPlayer?.progressCards.find(
        (c) => c.id === ctx.model.selectedProgressCardId
      );
      const legals = CatanEngine.getLegalActions(state, actingPlayerId);
      const matchingForOpp = legals.filter(
        (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
          a.type === "PLAY_PROGRESS_CARD" &&
          a.cardId === ctx.model.selectedProgressCardId &&
          a.params?.targetPlayerId === targetPlayerId
      );
      if (card?.type === "deserter" && matchingForOpp.length > 1) {
        ctx.model = {
          ...ctx.model,
          deserterTargetPlayerId: targetPlayerId,
          selectedBoardSpot: null,
        };
        ctx.render();
        return;
      }
      const matched = matchingForOpp[0];
      ctx.dispatchUiAction(
        actingPlayerId,
        matched ?? {
          type: "PLAY_PROGRESS_CARD",
          cardId: ctx.model.selectedProgressCardId,
          params: { targetPlayerId },
        }
      );
    });
  });

  root.querySelectorAll("[data-deserter-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = { ...ctx.model, deserterTargetPlayerId: null };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-prog-action-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!ctx.model.selectedProgressCardId) return;
      const idx = Number(btn.getAttribute("data-prog-action-idx"));
      const legals = CatanEngine.getLegalActions(state, actingPlayerId).filter(
        (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
          a.type === "PLAY_PROGRESS_CARD" &&
          a.cardId === ctx.model.selectedProgressCardId
      );
      const chosen = legals[idx];
      if (chosen) {
        ctx.dispatchUiAction(actingPlayerId, chosen);
      }
    });
  });
}
