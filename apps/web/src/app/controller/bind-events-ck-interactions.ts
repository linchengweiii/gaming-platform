import type {
  CatanState,
  CommodityType,
  ResourceType,
} from "@gaming-platform/catan";
import type { AppRuntimeContext } from "./context.ts";

export function bindCkInteractionEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  if (state.phase !== "CK_INTERACTION" || !state.pendingCkInteraction) {
    return;
  }
  const { root } = ctx;

  root.querySelectorAll("[data-ck-retreat-vertex]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vertexId = btn.getAttribute("data-ck-retreat-vertex")!;
      ctx.dispatch(actingPlayerId, {
        type: "RESOLVE_DISPLACED_KNIGHT",
        vertexId,
      });
    });
  });

  root.querySelectorAll("[data-ck-deserter-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vertexId = btn.getAttribute("data-ck-deserter-pick")!;
      ctx.dispatch(actingPlayerId, {
        type: "SELECT_DESERTER_KNIGHT",
        vertexId,
      });
    });
  });

  root.querySelectorAll("[data-ck-deserter-place]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vertexId = btn.getAttribute("data-ck-deserter-place")!;
      ctx.dispatch(actingPlayerId, {
        type: "PLACE_DESERTED_KNIGHT",
        vertexId,
      });
    });
  });

  root.querySelectorAll("[data-ck-spy-card]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const stolenCardId = btn.getAttribute("data-ck-spy-card")!;
      ctx.dispatch(actingPlayerId, {
        type: "SELECT_SPY_CARD",
        stolenCardId,
      });
    });
  });

  root.querySelector("#btn-ck-mm-submit")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, {
      type: "SELECT_MASTER_MERCHANT_CARDS",
      resources: { ...ctx.model.discardSelection },
      commodities: { ...ctx.model.discardCommodities },
    });
  });

  root.querySelector("#btn-ck-wedding-submit")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, {
      type: "GIVE_WEDDING_CARDS",
      resources: { ...ctx.model.discardSelection },
      commodities: { ...ctx.model.discardCommodities },
    });
  });

  root.querySelectorAll("[data-ck-ch-offer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-ck-ch-offer") ?? "";
      const [targetPlayerId, resource] = raw.split(":");
      if (!targetPlayerId || !resource) return;
      ctx.dispatch(actingPlayerId, {
        type: "OFFER_COMMERCIAL_HARBOR",
        targetPlayerId,
        resource: resource as ResourceType,
      });
    });
  });

  root.querySelector("#btn-ck-ch-end")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, { type: "END_COMMERCIAL_HARBOR" });
  });

  root.querySelectorAll("[data-ck-ch-resp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const commodity = btn.getAttribute("data-ck-ch-resp") as CommodityType;
      ctx.dispatch(actingPlayerId, {
        type: "RESPOND_COMMERCIAL_HARBOR",
        commodity,
      });
    });
  });
}
