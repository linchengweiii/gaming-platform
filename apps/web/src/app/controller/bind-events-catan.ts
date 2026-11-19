import {
  type CatanState,
  RESOURCES,
  type ResourceType,
  type TradeGoodType,
} from "@gaming-platform/catan";
import {
  canControlPlayerOnDevicePure,
  getActiveRoomPure,
} from "../helpers/room-queries.ts";
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

export function bindReadOnlyCatanSpotInspect(ctx: AppRuntimeContext): void {
  const { root } = ctx;

  root
    .querySelector("#btn-close-spot-popover")
    ?.addEventListener("click", () => {
      ctx.model = { ...ctx.model, selectedBoardSpot: null };
      ctx.render();
    });

  root.querySelectorAll("[data-spot-hex]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const hexId = el.getAttribute("data-spot-hex")!;
      ctx.model = {
        ...ctx.model,
        selectedBoardSpot:
          ctx.model.selectedBoardSpot?.kind === "hex" &&
          ctx.model.selectedBoardSpot.id === hexId
            ? null
            : { kind: "hex", id: hexId },
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const vertexId = el.getAttribute("data-spot-vertex")!;
      ctx.model = {
        ...ctx.model,
        selectedBoardSpot:
          ctx.model.selectedBoardSpot?.kind === "vertex" &&
          ctx.model.selectedBoardSpot.id === vertexId
            ? null
            : { kind: "vertex", id: vertexId },
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-spot-edge]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const edgeId = el.getAttribute("data-spot-edge")!;
      ctx.model = {
        ...ctx.model,
        selectedBoardSpot:
          ctx.model.selectedBoardSpot?.kind === "edge" &&
          ctx.model.selectedBoardSpot.id === edgeId
            ? null
            : { kind: "edge", id: edgeId },
      };
      ctx.render();
    });
  });
}

export function bindCatanEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;
  const room = getActiveRoomPure(ctx.model);
  if (!canControlPlayerOnDevicePure(ctx.model, room, actingPlayerId)) {
    bindReadOnlyCatanSpotInspect(ctx);
    return;
  }

  root.querySelectorAll("[data-close-submodal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        selectedBoardSpot: null,
        buildMode: null,
        mapBuildMenuExpanded: false,
        selectedProgressCardId: null,
        inventorHex1: null,
        smithVertex1: null,
        deserterTargetPlayerId: null,
      };
      ctx.render();
    });
  });

  root.querySelector(".board-svg")?.addEventListener("click", () => {
    if (ctx.model.mapBuildMenuExpanded || ctx.model.selectedBoardSpot) {
      ctx.model = {
        ...ctx.model,
        mapBuildMenuExpanded: false,
        selectedBoardSpot: null,
      };
      ctx.render();
    }
  });

  root.querySelectorAll("[data-hand-res-card]").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const g = cardEl.getAttribute("data-hand-res-card") as TradeGoodType;
      handleCatanHandCardClick(ctx, state, actingPlayerId, g);
    });
  });

  root.querySelectorAll("[data-play-progress-card]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-play-progress-card")!;
      handleCatanPlayProgressCardClick(ctx, state, actingPlayerId, cardId);
    });
  });

  root
    .querySelector("#btn-hand-play-knight")
    ?.addEventListener("click", () => {
      ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" });
    });
  root
    .querySelector("#btn-hand-play-roadbuild")
    ?.addEventListener("click", () => {
      ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
    });
  root.querySelector("#btn-hand-play-yop")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, buildMode: "year_of_plenty" };
    ctx.render();
  });
  root.querySelector("#btn-hand-play-mono")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, buildMode: "monopoly" };
    ctx.render();
  });

  root
    .querySelector("#btn-close-spot-popover")
    ?.addEventListener("click", () => {
      ctx.model = { ...ctx.model, selectedBoardSpot: null };
      ctx.render();
    });

  root.querySelectorAll("[data-spot-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-spot-action")!;
      const spotId = btn.getAttribute("data-spot-id") ?? "";
      handleCatanPopoverSpotAction(
        ctx,
        actingPlayerId,
        act,
        spotId,
        btn.getAttribute("data-chase-vertex"),
        btn.getAttribute("data-chase-target")
      );
    });
  });

  root.querySelectorAll("[data-spot-hex]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
      const hexId = el.getAttribute("data-spot-hex")!;
      handleCatanHexSpotClick(ctx, state, actingPlayerId, hexId);
    });
  });

  root.querySelectorAll("[data-spot-vertex]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
      const vertexId = el.getAttribute("data-spot-vertex")!;
      handleCatanVertexSpotClick(ctx, state, actingPlayerId, vertexId);
    });
  });

  root.querySelectorAll("[data-spot-edge]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
      const edgeId = el.getAttribute("data-spot-edge")!;
      handleCatanEdgeSpotClick(ctx, state, actingPlayerId, edgeId);
    });
  });

  bindCatanPhasesAndCkEvents(ctx, state, actingPlayerId);
  bindCatanTradeEvents(ctx, state, actingPlayerId);

  root.querySelector("#btn-buy-dev")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, mapBuildMenuExpanded: false };
    ctx.dispatch(actingPlayerId, { type: "BUY_DEV_CARD" });
  });

  root.querySelector("#btn-play-knight")?.addEventListener("click", () => {
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_KNIGHT" });
  });

  root.querySelector("#btn-play-roadbuild")?.addEventListener("click", () => {
    ctx.dispatchUiAction(actingPlayerId, { type: "PLAY_ROAD_BUILDING" });
  });

  const pickValidYopPair = (
    preferred1: ResourceType,
    preferred2: ResourceType
  ): { yopRes1: ResourceType; yopRes2: ResourceType } => {
    const avail = RESOURCES.filter((r) => state.bank[r] > 0);
    if (avail.length === 0) {
      return { yopRes1: preferred1, yopRes2: preferred2 };
    }
    const r1 = state.bank[preferred1] > 0 ? preferred1 : avail[0]!;
    const totalBank = avail.reduce((sum, r) => sum + state.bank[r], 0);
    if (totalBank === 1) {
      return { yopRes1: r1, yopRes2: r1 };
    }
    const r2Ok = state.bank[preferred2] >= (r1 === preferred2 ? 2 : 1);
    const r2 = r2Ok
      ? preferred2
      : avail.find((r) => state.bank[r] >= (r1 === r ? 2 : 1)) ?? r1;
    return { yopRes1: r1, yopRes2: r2 };
  };

  root.querySelector("#btn-mode-yop")?.addEventListener("click", () => {
    const nextOpen = ctx.model.buildMode !== "year_of_plenty";
    const pair = nextOpen
      ? pickValidYopPair(ctx.model.yopRes1, ctx.model.yopRes2)
      : { yopRes1: ctx.model.yopRes1, yopRes2: ctx.model.yopRes2 };
    ctx.model = {
      ...ctx.model,
      ...pair,
      selectedBoardSpot: null,
      buildMode: nextOpen ? "year_of_plenty" : null,
    };
    ctx.render();
  });

  root.querySelectorAll("[data-yop-pick1]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const picked1 = btn.getAttribute("data-yop-pick1") as ResourceType;
      const pair = pickValidYopPair(picked1, ctx.model.yopRes2);
      ctx.model = {
        ...ctx.model,
        ...pair,
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-yop-pick2]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        yopRes2: btn.getAttribute("data-yop-pick2") as ResourceType,
      };
      ctx.render();
    });
  });

  root.querySelector("#btn-exec-yop")?.addEventListener("click", () => {
    const totalBank = RESOURCES.reduce((sum, r) => sum + state.bank[r], 0);
    const r1 = ctx.model.yopRes1;
    const r2 = ctx.model.yopRes2;
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

  root.querySelector("#btn-mode-mono")?.addEventListener("click", () => {
    ctx.model = {
      ...ctx.model,
      selectedBoardSpot: null,
      buildMode: ctx.model.buildMode === "monopoly" ? null : "monopoly",
    };
    ctx.render();
  });

  root.querySelectorAll("[data-mono-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        monoRes: btn.getAttribute("data-mono-pick") as ResourceType,
      };
      ctx.render();
    });
  });

  root.querySelector("#btn-exec-mono")?.addEventListener("click", () => {
    ctx.dispatchUiAction(actingPlayerId, {
      type: "PLAY_MONOPOLY",
      resource: ctx.model.monoRes,
    });
  });

  root.querySelector("#btn-end-turn")?.addEventListener("click", () => {
    if (state.phase === "SPECIAL_BUILDING") {
      ctx.dispatch(actingPlayerId, { type: "END_SPECIAL_BUILD" });
    } else {
      ctx.dispatch(actingPlayerId, { type: "END_TURN" });
    }
  });
}
