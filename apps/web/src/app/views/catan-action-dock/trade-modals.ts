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
  RESOURCE_META,
  TRADE_GOOD_META,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
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
  return `
      <div class="ga-trade-tabs" role="tablist" aria-label="Trade mode">
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "maritime_trade"
        }" data-trade-tab="maritime_trade" class="ga-trade-tab ${
          model.buildMode === "maritime_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 15)}
          <span>Bank and harbors</span>
        </button>
        <button type="button" role="tab" aria-selected="${
          model.buildMode === "domestic_trade"
        }" data-trade-tab="domestic_trade" class="ga-trade-tab ${
          model.buildMode === "domestic_trade" ? "is-active" : ""
        }">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 15)}
          <span>Player trade</span>
        </button>
      </div>
    `;
}

export function renderMaritimeTradeSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  const pColor = actingPlayer.color;
  if (state.config.enableCitiesAndKnights) {
    const goodRatios = getPlayerGoodTradeRatios(state, actingPlayer.id);
    const getMarGive = (g: TradeGoodType): number =>
      isCommodityType(g) ? model.maritimeCommGive[g] : model.maritimeGive[g];
    const getMarWant = (g: TradeGoodType): number =>
      isCommodityType(g) ? model.maritimeCommWant[g] : model.maritimeWant[g];

    const giveCredits = TRADE_GOODS.reduce(
      (sum, g) => sum + Math.floor(getMarGive(g) / goodRatios[g]),
      0
    );
    const receiveCount =
      totalResourceCount(model.maritimeWant) +
      totalCommodityCount(model.maritimeCommWant);
    const canExec =
      giveCredits > 0 &&
      giveCredits === receiveCount &&
      TRADE_GOODS.every((g) => {
        const gv = getMarGive(g);
        const wv = getMarWant(g);
        return (
          !(gv > 0 && wv > 0) &&
          gv % goodRatios[g] === 0 &&
          getPlayerGoodCount(actingPlayer, g) >= gv &&
          getBankGoodCount(state, g) >= wv
        );
      });

    const giveCardsPreview = TRADE_GOODS.filter((g) => getMarGive(g) > 0)
      .map(
        (g) =>
          `<span class="map-yield-chip">−${getMarGive(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
      )
      .join("");
    const wantCardsPreview = TRADE_GOODS.filter((g) => getMarWant(g) > 0)
      .map(
        (g) =>
          `<span class="map-yield-chip">+${getMarWant(g)} ${renderMiniTradeGoodCardSvg(g, 32, 20)}</span>`
      )
      .join("");

    const statusHint =
      giveCredits === 0 && receiveCount === 0
        ? "Offer resource or commodity bundles (+4, +3, or +2)"
        : giveCredits > receiveCount
          ? `Add ${giveCredits - receiveCount} more requested card${
              giveCredits - receiveCount === 1 ? "" : "s"
            }`
          : receiveCount > giveCredits
            ? `Add ${receiveCount - giveCredits} more bundle${
                receiveCount - giveCredits === 1 ? "" : "s"
              }`
            : `${giveCredits} bank trade${giveCredits === 1 ? "" : "s"} ready`;

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
              const ratio = goodRatios[g];
              const val = getMarGive(g);
              const canAddBundle =
                getPlayerGoodCount(actingPlayer, g) >= val + ratio;
              return `
                <div class="ga-res-cell ${
                  val > 0 ? "ga-res-cell--active-give" : ""
                }">
                  <button type="button" data-ck-maritime-give-dec="${g}" class="ga-res-step-btn" ${
                    val <= 0 ? "disabled" : ""
                  }>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-maritime-give="${g}" class="ga-res-step-btn" title="Offer ${ratio} ${
                    TRADE_GOOD_META[g].label
                  } (${ratio}:1 rate)" ${!canAddBundle ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}

            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
            </div>
            ${TRADE_GOODS.map((g) => {
              const val = getMarWant(g);
              const bankAvail = getBankGoodCount(state, g);
              return `
                <div class="ga-res-cell ${
                  val > 0 ? "ga-res-cell--active-want" : ""
                }">
                  <button type="button" data-ck-maritime-receive-dec="${g}" class="ga-res-step-btn" ${
                    val <= 0 ? "disabled" : ""
                  }>−</button>
                  <span class="ga-res-step-val">${val}</span>
                  <button type="button" data-ck-maritime-receive="${g}" class="ga-res-step-btn" ${
                    val >= bankAvail ? "disabled" : ""
                  }>+</button>
                </div>
              `;
            }).join("")}
          </div>

          <div class="ga-trade-preview">
            <div class="ga-trade-bundle">
              ${
                giveCardsPreview || wantCardsPreview
                  ? `${giveCardsPreview || '<span class="t-label muted">No offer</span>'} ${DRAWN_ARROW_SVG} ${wantCardsPreview || '<span class="t-label muted">No request</span>'}`
                  : `<span class="t-label muted">Trade resources & commodities (Trading House Lv 3 unlocks 2:1 commodities)</span>`
              }
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-maritime-reset" class="btn btn--secondary btn--sm">Reset</button>
              <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
                !canExec ? "disabled" : ""
              }>
                ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
                <span>Trade with bank</span>
              </button>
            </div>
          </div>
        </div>`;
  }

  const ratios = getPlayerTradeRatios(state, actingPlayer.id);
  const giveCredits = RESOURCES.reduce(
    (sum, r) => sum + Math.floor(model.maritimeGive[r] / ratios[r]),
    0
  );
  const receiveCount = totalResourceCount(model.maritimeWant);
  const canExec =
    giveCredits > 0 &&
    giveCredits === receiveCount &&
    RESOURCES.every(
      (r) =>
        !(model.maritimeGive[r] > 0 && model.maritimeWant[r] > 0) &&
        model.maritimeGive[r] % ratios[r] === 0 &&
        actingPlayer.resources[r] >= model.maritimeGive[r] &&
        state.bank[r] >= model.maritimeWant[r]
    );

  const giveCardsPreview = RESOURCES.filter((r) => model.maritimeGive[r] > 0)
    .map(
      (r) =>
        `<span class="map-yield-chip">−${model.maritimeGive[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
    )
    .join("");
  const wantCardsPreview = RESOURCES.filter((r) => model.maritimeWant[r] > 0)
    .map(
      (r) =>
        `<span class="map-yield-chip">+${model.maritimeWant[r]} ${renderMiniResourceCardSvg(r, 34, 22)}</span>`
    )
    .join("");

  const statusHint =
    giveCredits === 0 && receiveCount === 0
      ? "Offer harbor bundles (+4, +3, or +2) for your request"
      : giveCredits > receiveCount
        ? `Add ${giveCredits - receiveCount} more requested card${
            giveCredits - receiveCount === 1 ? "" : "s"
          }`
        : receiveCount > giveCredits
          ? `Add ${receiveCount - giveCredits} more harbor bundle${
              receiveCount - giveCredits === 1 ? "" : "s"
            } for request`
          : `${giveCredits} bank trade${
              giveCredits === 1 ? "" : "s"
            } ready`;

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
            const ratio = ratios[r];
            const val = model.maritimeGive[r];
            const canAddBundle = actingPlayer.resources[r] >= val + ratio;
            return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-give" : ""
              }">
                <button type="button" data-maritime-give-dec="${r}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-maritime-give="${r}" class="ga-res-step-btn" title="Offer ${ratio} ${
                  RESOURCE_META[r].label
                } (${ratio}:1 rate)" ${!canAddBundle ? "disabled" : ""}>+</button>
              </div>
            `;
          }).join("")}

          <div class="ga-res-matrix__row-label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>Request
          </div>
          ${RESOURCES.map((r) => {
            const val = model.maritimeWant[r];
            const bankAvail = state.bank[r];
            return `
              <div class="ga-res-cell ${
                val > 0 ? "ga-res-cell--active-want" : ""
              }">
                <button type="button" data-maritime-receive-dec="${r}" class="ga-res-step-btn" ${
                  val <= 0 ? "disabled" : ""
                }>−</button>
                <span class="ga-res-step-val">${val}</span>
                <button type="button" data-maritime-receive="${r}" class="ga-res-step-btn" ${
                  val >= bankAvail ? "disabled" : ""
                }>+</button>
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
            <button type="button" id="btn-maritime-reset" class="btn btn--secondary btn--sm">Reset</button>
            <button type="button" id="btn-exec-maritime" class="btn btn--primary btn--sm action-btn-graphic ga-trade-submit-btn" ${
              !canExec ? "disabled" : ""
            }>
              ${renderActionPieceIconSvg("maritime_trade", pColor, 16)}
              <span>Trade with bank</span>
            </button>
          </div>
        </div>
      </div>`;
}
