import {
  COMMODITIES,
  type CatanState,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  getPlayerGoodCount,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import {
  type SupportedLocale,
  getCatanCommodityTextLocalized,
  getCatanDisciplineTextLocalized,
  getCatanProgressCardTextLocalized,
  getCatanResourceTextLocalized,
  getCatanTradeGoodLabelLocalized,
  t,
} from "../../../i18n/index.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";

function describeVertexSpotsPure(
  state: CatanState,
  vId: string,
  locale: SupportedLocale
): string {
  const vNode = state.topology.vertices[vId];
  return (vNode?.adjacentHexIds ?? [])
    .map((hId) => {
      const tile = state.hexes[hId];
      const r = tile ? TERRAIN_TO_RESOURCE[tile.terrain] : null;
      return r && tile?.numberToken
        ? `${getCatanResourceTextLocalized(r, locale).label} #${tile.numberToken}`
        : null;
    })
    .filter(Boolean)
    .join(" · ");
}

function renderCardPickerMatrixPure(
  model: Readonly<AppModel>,
  sourcePlayer: CatanState["players"][number],
  requiredCount: number,
  submitId: string,
  submitLabel: string
): string {
  const locale = model.locale;
  const totalSelected =
    totalResourceCount(model.discardSelection) +
    totalCommodityCount(model.discardCommodities);
  const canSubmit = totalSelected === requiredCount;

  return `
    <div class="ga-res-matrix ga-res-matrix--ck">
      <div class="ga-res-matrix__row-label">${escapeAttr(t(locale, "catan.ck.cardsRow"))}</div>
      ${TRADE_GOODS.map((g) => {
        const have = getPlayerGoodCount(sourcePlayer, g);
        const picked = isCommodityType(g)
          ? model.discardCommodities[g]
          : model.discardSelection[g];
        const goodLabel = getCatanTradeGoodLabelLocalized(g, locale);
        return `<div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${escapeAttr(locale === "en" ? goodLabel.slice(0, 3) : goodLabel)}</span>
            <span class="ga-res-col-head__have">${have}</span>
          </div>
          <div class="ga-res-cell ${picked > 0 ? "ga-res-cell--active-want" : ""}">
            <button type="button" class="ga-res-step-btn" data-discard-good-sub="${g}" ${picked <= 0 ? "disabled" : ""}>−</button>
            <span class="ga-res-step-val">${picked}</span>
            <button type="button" class="ga-res-step-btn" data-discard-good-add="${g}" ${picked >= have || totalSelected >= requiredCount ? "disabled" : ""}>+</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="ga-trade-preview">
      <span class="ga-chip ${canSubmit ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${escapeAttr(
        t(locale, "catan.phase.selectedCount", {
          selected: totalSelected,
          req: requiredCount,
        })
      )}</span>
      <div style="display: inline-flex; gap: 6px;">
        <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.reset"))}</button>
        <button type="button" id="${submitId}" class="btn btn--primary btn--sm" ${!canSubmit ? "disabled" : ""}>${escapeAttr(submitLabel)}</button>
      </div>
    </div>`;
}

export function renderCkInteractionDockPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string | null {
  if (state.phase !== "CK_INTERACTION" || !state.pendingCkInteraction) {
    return null;
  }
  const locale = model.locale;
  if (model.autoPlayBots) {
    return `<div class="action-buttons"><span class="action-prompt">${t(
      locale,
      "catan.ck.resolvingChoice",
      { prefix: `<strong>${escapeAttr(t(locale, "catan.ck.ckPrefix"))}</strong>` }
    )}</span></div>`;
  }
  const pending = state.pendingCkInteraction;
  const pColor = actingPlayer.color;

  switch (pending.kind) {
    case "displace_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.displacedHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.displacedPrefix", { name: actingPlayer.name }))}</strong>`,
              lv: pending.knight.level,
            })}</span>
            <span class="ga-chip ga-chip--warn ga-num">${escapeAttr(
              t(locale, "catan.ck.spotsCount", {
                count: pending.candidateVertexIds.length,
              })
            )}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const desc = describeVertexSpotsPure(state, vId, locale);
                return `<button type="button" data-ck-retreat-vertex="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("move_knight", pColor, 16)}
                  <span>${escapeAttr(t(locale, "catan.ck.spotNum", { num: idx + 1 }))}${desc ? ` (${escapeAttr(desc)})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("move_knight", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.displacedPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.knightDisplacedPrefix"))}</strong>`,
          })}</span>
        </div>`;

    case "deserter_choose_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.deserterChooseHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.deserterPrefix", { name: actingPlayer.name }))}</strong>`,
            })}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const k = state.knights[vId];
                const desc = describeVertexSpotsPure(state, vId, locale);
                const statusWord = k?.active
                  ? t(locale, "catan.ck.knightActiveWord")
                  : t(locale, "catan.ck.knightInactiveWord");
                return `<button type="button" data-ck-deserter-pick="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("knight_piece", pColor, 16)}
                  <span>Lv ${k?.level ?? 1} ${escapeAttr(statusWord)} #${idx + 1}${desc ? ` (${escapeAttr(desc)})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("knight_piece", "#ef4444", 20)}
          <span class="action-prompt">${t(locale, "catan.ck.deserterChoosePrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.deserterShortPrefix"))}</strong>`,
          })}</span>
        </div>`;

    case "deserter_place_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.deserterPlaceHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.deserterRecruitPrefix", { name: actingPlayer.name }))}</strong>`,
              lv: pending.knightLevel,
              status: escapeAttr(
                pending.knightActive
                  ? t(locale, "catan.ck.knightActiveWord")
                  : t(locale, "catan.ck.knightInactiveWord")
              ),
            })}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const desc = describeVertexSpotsPure(state, vId, locale);
                return `<button type="button" data-ck-deserter-place="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("knight_piece", pColor, 16)}
                  <span>${escapeAttr(t(locale, "catan.ck.spotNum", { num: idx + 1 }))}${desc ? ` (${escapeAttr(desc)})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("knight_piece", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.deserterPlacePrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.placeDesertedPrefix"))}</strong>`,
          })}</span>
        </div>`;

    case "spy_choose_card": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      const targetName = target?.name ?? t(locale, "common.playerFallback");
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.spyHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.spyPrefix", { name: actingPlayer.name }))}</strong>`,
              target: escapeAttr(targetName),
            })}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${(target?.progressCards ?? [])
              .map((c) => {
                const cat = getCatanProgressCardTextLocalized(c.type, locale);
                const dMeta = DISCIPLINE_META[c.discipline];
                const dText = getCatanDisciplineTextLocalized(c.discipline, locale);
                return `<button type="button" data-ck-spy-card="${c.id}" class="btn btn--secondary btn--sm action-btn-graphic" title="${escapeAttr(cat.description)}">
                  ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                  <span>${escapeAttr(
                    t(locale, "catan.ck.takeProgressCard", {
                      title: cat.title,
                      discipline: dText.label,
                    })
                  )}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.spyPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.spyShortPrefix"))}</strong>`,
            target: escapeAttr(targetName),
          })}</span>
        </div>`;
    }

    case "master_merchant_choose_cards": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      if (!target) return null;
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.mmHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.mmPrefix", { name: actingPlayer.name }))}</strong>`,
              target: escapeAttr(target.name),
              count: pending.maxCards,
            })}</span>
          </div>
          ${renderCardPickerMatrixPure(
            model,
            target,
            pending.maxCards,
            "btn-ck-mm-submit",
            t(locale, "catan.ck.mmSubmit", { count: pending.maxCards })
          )}
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", "#fbbf24", 20)}
          <span class="action-prompt">${t(locale, "catan.ck.mmPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.mmShortPrefix"))}</strong>`,
            count: pending.maxCards,
            target: escapeAttr(target.name),
          })}</span>
        </div>`;
    }

    case "wedding_give_cards": {
      const initiator = state.players.find((p) => p.id === pending.initiatorId);
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.weddingHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.weddingPrefix", { name: actingPlayer.name }))}</strong>`,
              count: pending.requiredCount,
              initiator: escapeAttr(
                initiator?.name ?? t(locale, "common.playerFallback")
              ),
            })}</span>
          </div>
          ${renderCardPickerMatrixPure(
            model,
            actingPlayer,
            pending.requiredCount,
            "btn-ck-wedding-submit",
            t(locale, "catan.ck.weddingSubmit", { count: pending.requiredCount })
          )}
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.weddingPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.weddingShortPrefix"))}</strong>`,
            count: pending.requiredCount,
          })}</span>
        </div>`;
    }

    case "commercial_harbor_offer": {
      const availRes = RESOURCES.filter((r) => actingPlayer.resources[r] > 0);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--keep-hand">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.chOfferHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.chPrefix", { name: actingPlayer.name }))}</strong>`,
            })}</span>
            <button type="button" id="btn-ck-ch-end" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "catan.ck.doneTrading"))}</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${pending.eligibleTargetIds
              .map((oppId) => {
                const opp = state.players.find((p) => p.id === oppId);
                return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                  <span class="t-label" style="min-width: 84px; display: inline-flex; align-items: center; gap: 5px;">
                    <span class="player-dot" style="background: ${opp?.color ?? "#94a3b8"}"></span>
                    <strong>${escapeAttr(opp?.name ?? oppId)}</strong>
                  </span>
                  ${availRes
                    .map(
                      (r) => `<button type="button" data-ck-ch-offer="${oppId}:${r}" class="btn btn--secondary btn--sm action-btn-graphic">
                        ${renderMiniResourceCardSvg(r, 26, 16)}
                        <span>${escapeAttr(
                          t(locale, "catan.ck.offerResourceCount", {
                            label: getCatanResourceTextLocalized(r, locale).label,
                            count: actingPlayer.resources[r],
                          })
                        )}</span>
                      </button>`
                    )
                    .join("")}
                </div>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("maritime_trade", "#fbbf24", 20)}
          <span class="action-prompt">${t(locale, "catan.ck.chOfferPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.chShortPrefix"))}</strong>`,
            done: `<strong>${escapeAttr(t(locale, "catan.ck.doneTrading"))}</strong>`,
          })}</span>
        </div>`;
    }

    case "commercial_harbor_respond": {
      const initiator = state.players.find((p) => p.id === pending.initiatorId);
      const availComms = COMMODITIES.filter((c) => actingPlayer.commodities[c] > 0);
      const offeredLabel = getCatanResourceTextLocalized(
        pending.offeredResource,
        locale
      ).label;
      return `
        <div class="sub-modal sub-modal--trade sub-modal--keep-hand">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.chRespondHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.chPrefix", { name: actingPlayer.name }))}</strong>`,
              initiator: escapeAttr(
                initiator?.name ?? t(locale, "common.player")
              ),
              resource: escapeAttr(offeredLabel),
            })}</span>
          </div>
          <div class="ga-trade-offer-bar">
            <div class="ga-trade-offer-side ga-trade-offer-side--gain">
              <span class="ga-trade-offer-side__label">
                <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.trade.youGet"))}
              </span>
              <span class="map-yield-chip">+1 ${renderMiniResourceCardSvg(pending.offeredResource, 30, 19)}<span>${escapeAttr(offeredLabel)}</span></span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto;">
              ${availComms
                .map(
                  (c) => `<button type="button" data-ck-ch-resp="${c}" class="btn btn--primary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(c, 30, 19)}
                    <span>${escapeAttr(
                      t(locale, "catan.ck.giveCommodityCount", {
                        label: getCatanCommodityTextLocalized(c, locale).label,
                        count: actingPlayer.commodities[c],
                      })
                    )}</span>
                  </button>`
                )
                .join("")}
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.chRespondPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.chShortPrefix"))}</strong>`,
            resource: escapeAttr(offeredLabel),
          })}</span>
        </div>`;
    }
  }
}
