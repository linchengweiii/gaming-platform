import {
  type CatanState,
  type ResourceType,
  type TradeGoodType,
  emptyCommodities,
  emptyResources,
  getBankGoodCount,
  isCommodityType,
} from "@gaming-platform/catan";
import {
  setSharedTradeGoodWantPure,
  setSharedTradeWantPure,
} from "../reducers/trade-and-draft-reducers.ts";
import {
  executeCatanMaritimeTrade,
  handleCatanCkMaritimeGiveDec,
  handleCatanCkMaritimeGiveInc,
  handleCatanMaritimeGiveDec,
  handleCatanMaritimeGiveInc,
} from "./catan-ui-actions.ts";
import type { AppRuntimeContext } from "./context.ts";

export function bindCatanTradeEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  root.querySelectorAll("[data-trade-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextTab = btn.getAttribute("data-trade-tab") as
        | "maritime_trade"
        | "domestic_trade";
      if (nextTab === ctx.model.buildMode) return;
      ctx.switchTradeMode(nextTab);
    });
  });

  root.querySelector("#btn-mode-maritime")?.addEventListener("click", () => {
    if (ctx.model.buildMode === "maritime_trade") {
      ctx.model = { ...ctx.model, selectedBoardSpot: null, buildMode: null };
      ctx.render();
    } else {
      ctx.switchTradeMode("maritime_trade");
    }
  });

  root.querySelector("#btn-mode-domestic")?.addEventListener("click", () => {
    if (ctx.model.buildMode === "domestic_trade") {
      ctx.model = { ...ctx.model, selectedBoardSpot: null, buildMode: null };
      ctx.render();
    } else {
      ctx.switchTradeMode("domestic_trade");
    }
  });

  root.querySelector("#sel-dom-target")?.addEventListener("change", (e) => {
    ctx.model = {
      ...ctx.model,
      domesticTargetPlayerId: (e.target as HTMLSelectElement).value,
    };
    ctx.render();
  });

  root.querySelectorAll("[data-dom-give]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-dom-give") as ResourceType;
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
    });
  });

  root.querySelectorAll("[data-dom-give-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-dom-give-dec") as ResourceType;
      if (ctx.model.domesticGive[r] > 0) {
        ctx.model = {
          ...ctx.model,
          domesticGive: {
            ...ctx.model.domesticGive,
            [r]: ctx.model.domesticGive[r] - 1,
          },
        };
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-dom-want]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-dom-want") as ResourceType;
      ctx.model = setSharedTradeWantPure(
        ctx.model,
        r,
        ctx.model.domesticWant[r] + 1
      );
      ctx.render();
    });
  });

  root.querySelectorAll("[data-dom-want-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-dom-want-dec") as ResourceType;
      if (ctx.model.domesticWant[r] > 0) {
        ctx.model = setSharedTradeWantPure(
          ctx.model,
          r,
          ctx.model.domesticWant[r] - 1
        );
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-ck-dom-give]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-dom-give") as TradeGoodType;
      if (isCommodityType(g)) {
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
      } else {
        ctx.model = setSharedTradeWantPure(
          {
            ...ctx.model,
            domesticGive: {
              ...ctx.model.domesticGive,
              [g]: ctx.model.domesticGive[g] + 1,
            },
          },
          g,
          0
        );
      }
      ctx.render();
    });
  });

  root.querySelectorAll("[data-ck-dom-give-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-dom-give-dec") as TradeGoodType;
      if (isCommodityType(g)) {
        if (ctx.model.domesticCommGive[g] > 0) {
          ctx.model = {
            ...ctx.model,
            domesticCommGive: {
              ...ctx.model.domesticCommGive,
              [g]: ctx.model.domesticCommGive[g] - 1,
            },
          };
          ctx.render();
        }
      } else if (ctx.model.domesticGive[g] > 0) {
        ctx.model = {
          ...ctx.model,
          domesticGive: {
            ...ctx.model.domesticGive,
            [g]: ctx.model.domesticGive[g] - 1,
          },
        };
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-ck-dom-want]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-dom-want") as TradeGoodType;
      const cur = isCommodityType(g)
        ? ctx.model.domesticCommWant[g]
        : ctx.model.domesticWant[g];
      ctx.model = setSharedTradeGoodWantPure(ctx.model, g, cur + 1);
      ctx.render();
    });
  });

  root.querySelectorAll("[data-ck-dom-want-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-dom-want-dec") as TradeGoodType;
      const cur = isCommodityType(g)
        ? ctx.model.domesticCommWant[g]
        : ctx.model.domesticWant[g];
      if (cur > 0) {
        ctx.model = setSharedTradeGoodWantPure(ctx.model, g, cur - 1);
        ctx.render();
      }
    });
  });

  const resetAllTradeDrafts = () => {
    ctx.model = {
      ...ctx.model,
      maritimeGive: emptyResources(),
      maritimeWant: emptyResources(),
      maritimeCommGive: emptyCommodities(),
      maritimeCommWant: emptyCommodities(),
      domesticGive: emptyResources(),
      domesticWant: emptyResources(),
      domesticCommGive: emptyCommodities(),
      domesticCommWant: emptyCommodities(),
    };
    ctx.render();
  };

  root
    .querySelector("#btn-dom-reset")
    ?.addEventListener("click", resetAllTradeDrafts);

  root.querySelector("#btn-dom-propose")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: null,
      give: { ...ctx.model.domesticGive },
      want: { ...ctx.model.domesticWant },
      ...(state.config.enableCitiesAndKnights
        ? {
            giveCommodities: { ...ctx.model.domesticCommGive },
            wantCommodities: { ...ctx.model.domesticCommWant },
          }
        : {}),
    });
  });

  root.querySelectorAll("[data-confirm-trade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const partnerId = btn.getAttribute("data-confirm-trade")!;
      if (state.activeTradeOffer) {
        ctx.dispatch(state.activeTradeOffer.fromPlayerId, {
          type: "CONFIRM_DOMESTIC_TRADE",
          offerId: state.activeTradeOffer.id,
          partnerId,
        });
      }
    });
  });

  root.querySelectorAll("[data-accept-trade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const acceptorId = btn.getAttribute("data-accept-trade")!;
      if (state.activeTradeOffer) {
        ctx.dispatch(acceptorId, {
          type: "ACCEPT_DOMESTIC_TRADE",
          offerId: state.activeTradeOffer.id,
        });
      }
    });
  });

  root.querySelectorAll("[data-decline-trade]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const declinerId = btn.getAttribute("data-decline-trade")!;
      if (state.activeTradeOffer) {
        ctx.dispatch(declinerId, {
          type: "DECLINE_DOMESTIC_TRADE",
          offerId: state.activeTradeOffer.id,
        });
      }
    });
  });

  root.querySelector("#btn-cancel-domestic")?.addEventListener("click", () => {
    if (state.activeTradeOffer) {
      ctx.dispatch(state.activeTradeOffer.fromPlayerId, {
        type: "CANCEL_DOMESTIC_TRADE",
      });
    }
  });

  root.querySelectorAll("[data-maritime-give]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-maritime-give") as ResourceType;
      handleCatanMaritimeGiveInc(ctx, state, actingPlayerId, r);
    });
  });

  root.querySelectorAll("[data-maritime-give-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-maritime-give-dec") as ResourceType;
      handleCatanMaritimeGiveDec(ctx, state, actingPlayerId, r);
    });
  });

  root.querySelectorAll("[data-maritime-receive]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-maritime-receive") as ResourceType;
      if (ctx.model.maritimeWant[r] < state.bank[r]) {
        ctx.model = {
          ...setSharedTradeWantPure(ctx.model, r, ctx.model.maritimeWant[r] + 1),
          tradeReceiveRes: r,
        };
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-maritime-receive-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = btn.getAttribute("data-maritime-receive-dec") as ResourceType;
      if (ctx.model.maritimeWant[r] > 0) {
        ctx.model = setSharedTradeWantPure(
          ctx.model,
          r,
          ctx.model.maritimeWant[r] - 1
        );
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-ck-maritime-give]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-maritime-give") as TradeGoodType;
      handleCatanCkMaritimeGiveInc(ctx, state, actingPlayerId, g);
    });
  });

  root.querySelectorAll("[data-ck-maritime-give-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-maritime-give-dec") as TradeGoodType;
      handleCatanCkMaritimeGiveDec(ctx, state, actingPlayerId, g);
    });
  });

  root.querySelectorAll("[data-ck-maritime-receive]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-maritime-receive") as TradeGoodType;
      const cur = isCommodityType(g)
        ? ctx.model.maritimeCommWant[g]
        : ctx.model.maritimeWant[g];
      if (cur < getBankGoodCount(state, g)) {
        const next = setSharedTradeGoodWantPure(ctx.model, g, cur + 1);
        ctx.model = isCommodityType(g) ? next : { ...next, tradeReceiveRes: g };
        ctx.render();
      }
    });
  });

  root.querySelectorAll("[data-ck-maritime-receive-dec]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-ck-maritime-receive-dec") as TradeGoodType;
      const cur = isCommodityType(g)
        ? ctx.model.maritimeCommWant[g]
        : ctx.model.maritimeWant[g];
      if (cur > 0) {
        ctx.model = setSharedTradeGoodWantPure(ctx.model, g, cur - 1);
        ctx.render();
      }
    });
  });

  root
    .querySelector("#btn-maritime-reset")
    ?.addEventListener("click", resetAllTradeDrafts);

  root.querySelector("#btn-exec-maritime")?.addEventListener("click", () => {
    executeCatanMaritimeTrade(ctx, state, actingPlayerId);
  });
}
