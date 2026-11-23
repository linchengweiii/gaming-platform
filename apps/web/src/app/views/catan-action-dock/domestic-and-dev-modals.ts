import {
  type CatanState,
  RESOURCES,
  TRADE_GOODS,
  type TradeGoodType,
  getPlayerGoodCount,
  getPlayerGoodTradeRatios,
  getPlayerTradeRatios,
  hasCommodities,
  hasResources,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import { getCatanResourceTextLocalized, t } from "../../../i18n/index.ts";
import { DRAWN_ARROW_SVG, escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";
import {
  renderResourceColumnHeadersPure,
  renderTradeGoodColumnHeadersPure,
} from "../catan-hud-view.ts";
import { renderTradeModeTabsPure } from "./trade-modals.ts";

export function renderDomesticTradeSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  const locale = model.locale;
  const pColor = actingPlayer.color;
  const isCk = Boolean(state.config.enableCitiesAndKnights);
  const goods: readonly TradeGoodType[] = isCk ? TRADE_GOODS : RESOURCES;
  const getGive = (g: TradeGoodType): number =>
    isCommodityType(g) ? model.domesticCommGive[g] : model.domesticGive[g];
  const getWant = (g: TradeGoodType): number =>
    isCommodityType(g) ? model.domesticCommWant[g] : model.domesticWant[g];

  const giveTotal =
    totalResourceCount(model.domesticGive) +
    (isCk ? totalCommodityCount(model.domesticCommGive) : 0);
  const wantTotal =
    totalResourceCount(model.domesticWant) +
    (isCk ? totalCommodityCount(model.domesticCommWant) : 0);
  const canPropose =
    giveTotal > 0 &&
    wantTotal > 0 &&
    goods.every((g) => !(getGive(g) > 0 && getWant(g) > 0)) &&
    hasResources(actingPlayer.resources, model.domesticGive) &&
    (!isCk || hasCommodities(actingPlayer.commodities, model.domesticCommGive));

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

  const dataPrefix = isCk ? "data-ck-dom" : "data-dom";
  const headersHtml = isCk
    ? renderTradeGoodColumnHeadersPure(
        actingPlayer,
        undefined,
        getPlayerGoodTradeRatios(state, actingPlayer.id),
        locale
      )
    : renderResourceColumnHeadersPure(
        actingPlayer.resources,
        undefined,
        getPlayerTradeRatios(state, actingPlayer.id),
        locale
      );

  return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          ${renderTradeModeTabsPure(model, pColor)}
          <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
            <span class="ga-chip ${canPropose ? "ga-chip--ok" : ""}">${escapeAttr(
              t(
                locale,
                isCk
                  ? "catan.trade.ckDomesticBadge"
                  : "catan.trade.baseDomesticBadge"
              )
            )}</span>
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
              const val = getGive(g);
              const max = getPlayerGoodCount(actingPlayer, g);
              return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-give" : ""}">
                <button type="button" ${dataPrefix}-give-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" ${dataPrefix}-give="${g}" class="ga-res-step-btn" ${val >= max ? "disabled" : ""}>+</button>
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
              return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-want" : ""}">
                <button type="button" ${dataPrefix}-want-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" ${dataPrefix}-want="${g}" class="ga-res-step-btn">+</button>
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
                : `<span class="t-label muted">${escapeAttr(t(locale, isCk ? "catan.trade.ckDomesticFootnote" : "catan.trade.baseBankFootnote"))}</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.reset"))}</button>
            <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canPropose ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
              <span>${escapeAttr(t(locale, "catan.trade.sendOffer"))}</span>
            </button>
          </div>
        </div>
      </div>`;
}

export function renderDevCardSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  const locale = model.locale;
  const pColor = actingPlayer.color;
  if (model.buildMode === "year_of_plenty") {
    const totalBankRes = RESOURCES.reduce<number>(
      (sum, r) => sum + state.bank[r],
      0
    );
    const singleCardOnly = totalBankRes === 1;
    const canExecYoP = singleCardOnly
      ? state.bank[model.yopRes1] === 1 && model.yopRes2 === model.yopRes1
      : state.bank[model.yopRes1] >= 1 &&
        state.bank[model.yopRes2] >= (model.yopRes1 === model.yopRes2 ? 2 : 1);
    return `<div class="sub-modal">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(
              singleCardOnly
                ? t(locale, "catan.yop.titleOne")
                : t(locale, "catan.yop.titleTwo")
            )}</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(undefined, state.bank, undefined, locale)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.yop.firstCard"))}
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick1="${r}" class="ga-res-port-btn ${
                model.yopRes1 === r ? "is-selected-want" : ""
              }" ${state.bank[r] <= 0 ? "disabled" : ""}>
                <span style="font-size: 13px; font-weight: 600;">+1 ${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
              </button>
            `
          ).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.yop.secondCard"))}
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick2="${r}" class="ga-res-port-btn ${
                model.yopRes2 === r ? "is-selected-want" : ""
              }" ${
                singleCardOnly
                  ? state.bank[r] <= 0
                    ? "disabled"
                    : ""
                  : state.bank[r] <= (model.yopRes1 === r ? 1 : 0)
                    ? "disabled"
                    : ""
              }>
                <span style="font-size: 13px; font-weight: 600;">+1 ${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.yopRes1, 42, 27)}
            ${singleCardOnly ? "" : renderMiniResourceCardSvg(model.yopRes2, 42, 27)}
          </div>
          <button type="button" id="btn-exec-yop" class="btn btn--primary btn--sm" ${canExecYoP ? "" : "disabled"}>${escapeAttr(
            singleCardOnly
              ? t(locale, "catan.yop.takeOne")
              : t(locale, "catan.yop.takeTwo")
          )}</button>
        </div>
      </div>`;
  }

  if (model.buildMode === "monopoly") {
    const monoResLabel = getCatanResourceTextLocalized(
      model.monoRes,
      locale
    ).label;
    return `<div class="sub-modal">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("monopoly", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(t(locale, "catan.mono.title"))}</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(actingPlayer.resources, undefined, undefined, locale)}
          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.mono.claimAll"))}
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-mono-pick="${r}" class="ga-res-port-btn ${
                model.monoRes === r ? "is-selected-want" : ""
              }">
                <span style="font-size: 13px; font-weight: 600;">${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.monoRes, 44, 28)}
          </div>
          <button type="button" id="btn-exec-mono" class="btn btn--primary btn--sm">${escapeAttr(
            t(locale, "catan.mono.claimAllResource", {
              resource: locale === "en" ? monoResLabel.toLowerCase() : monoResLabel,
            })
          )}</button>
        </div>
      </div>`;
  }

  return "";
}
