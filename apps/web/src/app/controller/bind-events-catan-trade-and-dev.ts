import {
  type CatanState,
  type ResourceType,
  type TradeGoodType,
  emptyCommodities,
  emptyResources,
  getBankGoodCount,
  isCommodityType,
} from "@gaming-platform/catan";
import { setSharedTradeGoodWantPure } from "../reducers/trade-and-draft-reducers.ts";
import {
  executeCatanMaritimeTrade,
  handleCatanCkMaritimeGiveDec,
  handleCatanCkMaritimeGiveInc,
  handleCatanMaritimeGiveDec,
  handleCatanMaritimeGiveInc,
} from "./catan-ui-actions.ts";
import type { AppRuntimeContext } from "./context.ts";
import { onClick, onDataClick, patchModelAndRender } from "./dom-events.ts";

export function bindCatanTradeEvents(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  onDataClick(root, "data-trade-tab", (tab) => {
    const nextTab = tab as "maritime_trade" | "domestic_trade";
    if (nextTab !== ctx.model.buildMode) ctx.switchTradeMode(nextTab);
  });

  const bindTradeModeToggle = (
    selector: string,
    mode: "maritime_trade" | "domestic_trade"
  ) =>
    onClick(root, selector, () => {
      if (ctx.model.buildMode === mode) {
        patchModelAndRender(ctx, { selectedBoardSpot: null, buildMode: null });
      } else {
        ctx.switchTradeMode(mode);
      }
    });
  bindTradeModeToggle("#btn-mode-maritime", "maritime_trade");
  bindTradeModeToggle("#btn-mode-domestic", "domestic_trade");

  const adjustDomesticGive = (good: TradeGoodType, delta: 1 | -1): void => {
    if (isCommodityType(good)) {
      const next = ctx.model.domesticCommGive[good] + delta;
      if (next < 0) return;
      const updated = {
        ...ctx.model,
        domesticCommGive: { ...ctx.model.domesticCommGive, [good]: next },
      };
      ctx.model = delta > 0 ? setSharedTradeGoodWantPure(updated, good, 0) : updated;
    } else {
      const next = ctx.model.domesticGive[good] + delta;
      if (next < 0) return;
      const updated = {
        ...ctx.model,
        domesticGive: { ...ctx.model.domesticGive, [good]: next },
      };
      ctx.model = delta > 0 ? setSharedTradeGoodWantPure(updated, good, 0) : updated;
    }
    ctx.render();
  };

  const adjustDomesticWant = (good: TradeGoodType, delta: 1 | -1): void => {
    const cur = isCommodityType(good)
      ? ctx.model.domesticCommWant[good]
      : ctx.model.domesticWant[good];
    if (cur + delta < 0) return;
    ctx.model = setSharedTradeGoodWantPure(ctx.model, good, cur + delta);
    ctx.render();
  };

  for (const [attr, delta] of [
    ["data-dom-give", 1],
    ["data-dom-give-dec", -1],
    ["data-ck-dom-give", 1],
    ["data-ck-dom-give-dec", -1],
  ] as const) {
    onDataClick(root, attr, (g) => adjustDomesticGive(g as TradeGoodType, delta));
  }
  for (const [attr, delta] of [
    ["data-dom-want", 1],
    ["data-dom-want-dec", -1],
    ["data-ck-dom-want", 1],
    ["data-ck-dom-want-dec", -1],
  ] as const) {
    onDataClick(root, attr, (g) => adjustDomesticWant(g as TradeGoodType, delta));
  }

  const resetAllTradeDrafts = () =>
    patchModelAndRender(ctx, {
      maritimeGive: emptyResources(),
      maritimeWant: emptyResources(),
      maritimeCommGive: emptyCommodities(),
      maritimeCommWant: emptyCommodities(),
      domesticGive: emptyResources(),
      domesticWant: emptyResources(),
      domesticCommGive: emptyCommodities(),
      domesticCommWant: emptyCommodities(),
    });
  onClick(root, "#btn-dom-reset", resetAllTradeDrafts);
  onClick(root, "#btn-maritime-reset", resetAllTradeDrafts);

  onClick(root, "#btn-dom-propose", () =>
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
    })
  );

  onDataClick(root, "data-confirm-trade", (partnerId) => {
    if (state.activeTradeOffer) {
      ctx.dispatch(state.activeTradeOffer.fromPlayerId, {
        type: "CONFIRM_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
        partnerId,
      });
    }
  });
  onDataClick(root, "data-accept-trade", (acceptorId) => {
    if (state.activeTradeOffer) {
      ctx.dispatch(acceptorId, {
        type: "ACCEPT_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
      });
    }
  });
  onDataClick(root, "data-decline-trade", (declinerId) => {
    if (state.activeTradeOffer) {
      ctx.dispatch(declinerId, {
        type: "DECLINE_DOMESTIC_TRADE",
        offerId: state.activeTradeOffer.id,
      });
    }
  });
  onClick(root, "#btn-cancel-domestic", () => {
    if (state.activeTradeOffer) {
      ctx.dispatch(state.activeTradeOffer.fromPlayerId, {
        type: "CANCEL_DOMESTIC_TRADE",
      });
    }
  });

  onDataClick(root, "data-maritime-give", (r) =>
    handleCatanMaritimeGiveInc(ctx, state, actingPlayerId, r as ResourceType)
  );
  onDataClick(root, "data-maritime-give-dec", (r) =>
    handleCatanMaritimeGiveDec(ctx, state, actingPlayerId, r as ResourceType)
  );
  onDataClick(root, "data-ck-maritime-give", (g) =>
    handleCatanCkMaritimeGiveInc(ctx, state, actingPlayerId, g as TradeGoodType)
  );
  onDataClick(root, "data-ck-maritime-give-dec", (g) =>
    handleCatanCkMaritimeGiveDec(ctx, state, actingPlayerId, g as TradeGoodType)
  );

  const adjustMaritimeReceive = (good: TradeGoodType, delta: 1 | -1): void => {
    const cur = isCommodityType(good)
      ? ctx.model.maritimeCommWant[good]
      : ctx.model.maritimeWant[good];
    if (delta > 0 && cur >= getBankGoodCount(state, good)) return;
    if (delta < 0 && cur <= 0) return;
    const next = setSharedTradeGoodWantPure(ctx.model, good, cur + delta);
    ctx.model =
      delta > 0 && !isCommodityType(good)
        ? { ...next, tradeReceiveRes: good }
        : next;
    ctx.render();
  };
  for (const [attr, delta] of [
    ["data-maritime-receive", 1],
    ["data-maritime-receive-dec", -1],
    ["data-ck-maritime-receive", 1],
    ["data-ck-maritime-receive-dec", -1],
  ] as const) {
    onDataClick(root, attr, (g) =>
      adjustMaritimeReceive(g as TradeGoodType, delta)
    );
  }

  onClick(root, "#btn-exec-maritime", () =>
    executeCatanMaritimeTrade(ctx, state, actingPlayerId)
  );
}
