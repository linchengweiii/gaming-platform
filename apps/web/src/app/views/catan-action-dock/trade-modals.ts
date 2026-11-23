import {
  type CatanState,
  RESOURCES,
  TRADE_GOODS,
  type TradeGoodType,
  getBankGoodCount,
  getPlayerGoodCount,
  getPlayerGoodTradeRatios,
  getPlayerTradeRatios,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import {
  getCatanResourceTextLocalized,
  getCatanTradeGoodLabelLocalized,
  t,
} from "../../../i18n/index.ts";
import { DRAWN_ARROW_SVG, escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";
import {
  renderResourceColumnHeadersPure,
  renderTradeGoodColumnHeadersPure,
} from "../catan-hud-view.ts";

export function renderTradeModeTabsPure(
  model: Readonly<AppModel>,
  pColor: string
): string {
  const locale = model.locale;
  return `
      <div class="ga-trade-tabs" role="tablist" aria-label="${escapeAttr(t(locale, "catan.trade.modeAria"))}">
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "maritime_trade"
        }" data-trade-tab="maritime_trade" class="ga-trade-tab ${
          model.buildMode === "maritime_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 15)}
          <span>${escapeAttr(t(locale, "catan.trade.bankAndHarbors"))}</span>
        </button>
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "domestic_trade"
        }" data-trade-tab="domestic_trade" class="ga-trade-tab ${
          model.buildMode === "domestic_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 15)}
          <span>${escapeAttr(t(locale, "catan.dock.playerTrade"))}</span>
        </button>
      </div>
    `;
}

export function renderMaritimeTradeSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  const locale = model.locale;
  const pColor = actingPlayer.color;
  const isCk = Boolean(state.config.enableCitiesAndKnights);
  const goods: readonly TradeGoodType[] = isCk ? TRADE_GOODS : RESOURCES;
  const ratios: Record<string, number> = isCk
    ? getPlayerGoodTradeRatios(state, actingPlayer.id)
    : getPlayerTradeRatios(state, actingPlayer.id);
  const getGive = (g: TradeGoodType): number =>
    isCommodityType(g) ? model.maritimeCommGive[g] : model.maritimeGive[g];
  const getWant = (g: TradeGoodType): number =>
    isCommodityType(g) ? model.maritimeCommWant[g] : model.maritimeWant[g];

  const giveCredits = goods.reduce(
    (sum, g) => sum + Math.floor(getGive(g) / ratios[g]!),
    0
  );
  const receiveCount =
    totalResourceCount(model.maritimeWant) +
    (isCk ? totalCommodityCount(model.maritimeCommWant) : 0);
  const canExec =
    giveCredits > 0 &&
    giveCredits === receiveCount &&
    goods.every((g) => {
      const gv = getGive(g);
      const wv = getWant(g);
      return (
        !(gv > 0 && wv > 0) &&
        gv % ratios[g]! === 0 &&
        getPlayerGoodCount(actingPlayer, g) >= gv &&
        getBankGoodCount(state, g) >= wv
      );
    });

  const renderCard = (g: TradeGoodType): string =>
    isCk
      ? renderMiniTradeGoodCardSvg(g, 32, 20)
      : renderMiniResourceCardSvg(g as (typeof RESOURCES)[number], 34, 22);
  const giveCardsPreview = goods
    .filter((g) => getGive(g) > 0)
    .map((g) => `<span class="map-yield-chip">−${getGive(g)} ${renderCard(g)}</span>`)
    .join("");
  const wantCardsPreview = goods
    .filter((g) => getWant(g) > 0)
    .map((g) => `<span class="map-yield-chip">+${getWant(g)} ${renderCard(g)}</span>`)
    .join("");

  const diffNeed = giveCredits - receiveCount;
  const diffGive = receiveCount - giveCredits;
  const statusHint =
    giveCredits === 0 && receiveCount === 0
      ? t(locale, isCk ? "catan.trade.ckMaritimeHint" : "catan.trade.maritimeHint")
      : diffNeed > 0
        ? diffNeed === 1
          ? t(locale, "catan.trade.addMoreRequestedOne")
          : t(locale, "catan.trade.addMoreRequestedMany", { count: diffNeed })
        : diffGive > 0
          ? diffGive === 1
            ? t(
                locale,
                isCk
                  ? "catan.trade.addMoreBundlesOne"
                  : "catan.trade.addMoreHarborBundlesOne"
              )
            : t(
                locale,
                isCk
                  ? "catan.trade.addMoreBundlesMany"
                  : "catan.trade.addMoreHarborBundlesMany",
                { count: diffGive }
              )
          : giveCredits === 1
            ? t(locale, "catan.trade.readyOne")
            : t(locale, "catan.trade.readyMany", { count: giveCredits });

  const dataPrefix = isCk ? "data-ck-maritime" : "data-maritime";
  const headersHtml = isCk
    ? renderTradeGoodColumnHeadersPure(
        actingPlayer,
        undefined,
        ratios as Record<TradeGoodType, number>,
        locale
      )
    : renderResourceColumnHeadersPure(
        actingPlayer.resources,
        undefined,
        ratios as Record<(typeof RESOURCES)[number], number>,
        locale
      );

  return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          ${renderTradeModeTabsPure(model, pColor)}
          <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
            <span class="ga-chip ${
              canExec
                ? "ga-chip--ok"
                : giveCredits > 0 || receiveCount > 0
                  ? "ga-chip--warn"
                  : ""
            } ga-num">${escapeAttr(statusHint)}</span>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
          </div>
        </div>

        <div class="${isCk ? "ga-res-matrix ga-res-matrix--ck" : "ga-res-matrix"}">
          ${headersHtml}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.trade.offer"))}
          </div>
          ${goods
            .map((g) => {
              const ratio = ratios[g]!;
              const val = getGive(g);
              const canAddBundle =
                getPlayerGoodCount(actingPlayer, g) >= val + ratio;
              const label = isCk
                ? getCatanTradeGoodLabelLocalized(g, locale)
                : getCatanResourceTextLocalized(
                    g as (typeof RESOURCES)[number],
                    locale
                  ).label;
              return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-give" : ""
              }">
                <button type="button" ${dataPrefix}-give-dec="${g}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" ${dataPrefix}-give="${g}" class="ga-res-step-btn" title="${escapeAttr(
                  t(locale, "catan.trade.offerRateTitle", { ratio, label })
                )}" ${!canAddBundle ? "disabled" : ""}>+</button>
              </div>
            `;
            })
            .join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.trade.request"))}
          </div>
          ${goods
            .map((g) => {
              const val = getWant(g);
              const bankAvail = getBankGoodCount(state, g);
              return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-want" : ""
              }">
                <button type="button" ${dataPrefix}-receive-dec="${g}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" ${dataPrefix}-receive="${g}" class="ga-res-step-btn" ${
                  val >= bankAvail ? "disabled" : ""
                }>+</button>
              </div>
            `;
            })
            .join("")}
        </div>

        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${
              giveCardsPreview || wantCardsPreview
                ? `${giveCardsPreview || `<span class="t-label muted">${escapeAttr(t(locale, "catan.trade.noOffer"))}</span>`} ${DRAWN_ARROW_SVG} ${wantCardsPreview || `<span class="t-label muted">${escapeAttr(t(locale, "catan.trade.noRequest"))}</span>`}`
                : `<span class="t-label muted">${escapeAttr(t(locale, isCk ? "catan.trade.ckBankFootnote" : "catan.trade.baseBankFootnote"))}</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-maritime-reset" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.reset"))}</button>
            <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canExec ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
              <span>${escapeAttr(t(locale, "catan.trade.withBank"))}</span>
            </button>
          </div>
        </div>
      </div>`;
}
