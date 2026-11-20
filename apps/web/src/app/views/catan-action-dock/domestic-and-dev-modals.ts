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
  RESOURCE_META,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import { DRAWN_ARROW_SVG } from "../../helpers/html-and-dropdown.ts";
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
  const pColor = actingPlayer.color;
  if (state.config.enableCitiesAndKnights) {
    const goodRatios = getPlayerGoodTradeRatios(state, actingPlayer.id);
    const getDomGive = (g: TradeGoodType): number =>
      isCommodityType(g) ? model.domesticCommGive[g] : model.domesticGive[g];
    const getDomWant = (g: TradeGoodType): number =>
      isCommodityType(g) ? model.domesticCommWant[g] : model.domesticWant[g];

    const giveTotal =
      totalResourceCount(model.domesticGive) +
      totalCommodityCount(model.domesticCommGive);
    const wantTotal =
      totalResourceCount(model.domesticWant) +
      totalCommodityCount(model.domesticCommWant);
    const canPropose =
      giveTotal > 0 &&
      wantTotal > 0 &&
      TRADE_GOODS.every((g) => !(getDomGive(g) > 0 && getDomWant(g) > 0)) &&
      hasResources(actingPlayer.resources, model.domesticGive) &&
      hasCommodities(actingPlayer.commodities, model.domesticCommGive);

    const giveCardsPreview = TRADE_GOODS.filter((g) => getDomGive(g) > 0)
      .map(
        (g) =>
          `<span class="map-yield-chip">−${getDomGive(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
      )
      .join("");
    const wantCardsPreview = TRADE_GOODS.filter((g) => getDomWant(g) > 0)
      .map(
        (g) =>
          `<span class="map-yield-chip">+${getDomWant(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
      )
      .join("");

    return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            ${renderTradeModeTabsPure(model, pColor)}
            <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
              <span class="ga-chip ${canPropose ? "ga-chip--ok" : ""}">Open to all players · resources & commodities</span>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
            </div>
          </div>

          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(
              actingPlayer,
              undefined,
              goodRatios
            )}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getDomGive(g);
              const max = getPlayerGoodCount(actingPlayer, g);
              return `
                <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-ck-dom-give-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-dom-give="${g}" class="ga-res-step-btn" ${val >= max ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getDomWant(g);
              return `
                <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-want" : ""}">
                  <button type="button" data-ck-dom-want-dec="${g}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-dom-want="${g}" class="ga-res-step-btn">+</button>
                </div>
              `;
            }).join("")}
          </div>

          <div class="ga-trade-preview">
            <div class="ga-trade-bundle">
              ${
                giveCardsPreview || wantCardsPreview
                  ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                  : `<span class="t-label muted">Use + and − in each column to trade resources or commodities</span>`
              }
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">Reset</button>
              <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
                !canPropose ? "disabled" : ""
              }>
                ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
                <span>Send trade offer</span>
              </button>
            </div>
          </div>
        </div>`;
  }

  const ratios = getPlayerTradeRatios(state, actingPlayer.id);
  const canPropose =
    totalResourceCount(model.domesticGive) > 0 &&
    totalResourceCount(model.domesticWant) > 0 &&
    RESOURCES.every(
      (r) => !(model.domesticGive[r] > 0 && model.domesticWant[r] > 0)
    ) &&
    hasResources(actingPlayer.resources, model.domesticGive);

  const giveCardsPreview = RESOURCES.filter((r) => model.domesticGive[r] > 0)
    .map(
      (r) =>
        `<span class="map-yield-chip">−${model.domesticGive[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
    )
    .join("");
  const wantCardsPreview = RESOURCES.filter((r) => model.domesticWant[r] > 0)
    .map(
      (r) =>
        `<span class="map-yield-chip">+${model.domesticWant[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
    )
    .join("");

  return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          ${renderTradeModeTabsPure(model, pColor)}
          <div style="display: inline-flex; align-items: center; gap: 6px; margin-left: auto;">
            <span class="ga-chip ${canPropose ? "ga-chip--ok" : ""}">Open to all players · pick partner after accept</span>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
          </div>
        </div>

        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(
            actingPlayer.resources,
            undefined,
            ratios
          )}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>Offer
          </div>
          ${RESOURCES.map((r) => {
            const val = model.domesticGive[r];
            const max = actingPlayer.resources[r];
            return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-give" : ""}">
                <button type="button" data-dom-give-dec="${r}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-dom-give="${r}" class="ga-res-step-btn" ${val >= max ? "disabled" : ""}>+</button>
              </div>
            `;
          }).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
          </div>
          ${RESOURCES.map((r) => {
            const val = model.domesticWant[r];
            return `
              <div class="ga-res-cell ${val > 0 ? "ga-res-cell--active-want" : ""}">
                <button type="button" data-dom-want-dec="${r}" class="ga-res-step-btn" ${val <= 0 ? "disabled" : ""}>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-dom-want="${r}" class="ga-res-step-btn">+</button>
              </div>
            `;
          }).join("")}
        </div>

        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${
              giveCardsPreview || wantCardsPreview
                ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                : `<span class="t-label muted">Use + and − in each column to set your offer and request</span>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" id="btn-dom-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button type="button" id="btn-dom-propose" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canPropose ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("domestic_trade", pColor, 16)}
              <span>Send trade offer</span>
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
            <strong style="font-size: var(--t-small); font-weight: 500;">Year of plenty — choose ${singleCardOnly ? "1 remaining bank card" : "2 free bank cards"}</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(undefined, state.bank)}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>1st card
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-yop-pick1="${r}" class="ga-res-port-btn ${
                model.yopRes1 === r ? "is-selected-want" : ""
              }" ${state.bank[r] <= 0 ? "disabled" : ""}>
                <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>2nd card
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
                <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.yopRes1, 42, 27)}
            ${singleCardOnly ? "" : renderMiniResourceCardSvg(model.yopRes2, 42, 27)}
          </div>
          <button type="button" id="btn-exec-yop" class="btn btn--primary btn--sm" ${canExecYoP ? "" : "disabled"}>${singleCardOnly ? "Take 1 resource" : "Take 2 resources"}</button>
        </div>
      </div>`;
  }

  if (model.buildMode === "monopoly") {
    return `<div class="sub-modal">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("monopoly", pColor, 20)}
            <strong style="font-size: var(--t-small); font-weight: 500;">Monopoly — claim every opponent copy of 1 resource</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ga-res-matrix">
          ${renderResourceColumnHeadersPure(actingPlayer.resources)}
          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Claim all
          </div>
          ${RESOURCES.map(
            (r) => `
              <button type="button" data-mono-pick="${r}" class="ga-res-port-btn ${
                model.monoRes === r ? "is-selected-want" : ""
              }">
                <span style="font-size: 13px; font-weight: 600;">${RESOURCE_META[r].label}</span>
              </button>
            `
          ).join("")}
        </div>
        <div class="ga-trade-preview">
          <div class="ga-trade-bundle">
            ${renderMiniResourceCardSvg(model.monoRes, 44, 28)}
          </div>
          <button type="button" id="btn-exec-mono" class="btn btn--primary btn--sm">Claim all ${RESOURCE_META[model.monoRes].label.toLowerCase()}</button>
        </div>
      </div>`;
  }

  return "";
}
