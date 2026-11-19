import {
  COMMODITIES,
  type CatanState,
  PROGRESS_CARD_CATALOG,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  getPlayerGoodCount,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  COMMODITY_META,
  DISCIPLINE_META,
  RESOURCE_META,
  TRADE_GOOD_META,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";

function describeVertexSpotsPure(state: CatanState, vId: string): string {
  const vNode = state.topology.vertices[vId];
  return (vNode?.adjacentHexIds ?? [])
    .map((hId) => {
      const t = state.hexes[hId];
      const r = t ? TERRAIN_TO_RESOURCE[t.terrain] : null;
      return r && t?.numberToken ? `${RESOURCE_META[r].label} #${t.numberToken}` : null;
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
  const totalSelected =
    totalResourceCount(model.discardSelection) +
    totalCommodityCount(model.discardCommodities);
  const canSubmit = totalSelected === requiredCount;

  return `
    <div class="ga-res-matrix ga-res-matrix--ck">
      <div class="ga-res-matrix__row-label">Cards</div>
      ${TRADE_GOODS.map((g) => {
        const have = getPlayerGoodCount(sourcePlayer, g);
        const picked = isCommodityType(g)
          ? model.discardCommodities[g]
          : model.discardSelection[g];
        return `<div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${TRADE_GOOD_META[g].label.slice(0, 3)}</span>
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
      <span class="ga-chip ${canSubmit ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${totalSelected}/${requiredCount} selected</span>
      <div style="display: inline-flex; gap: 6px;">
        <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">Reset</button>
        <button type="button" id="${submitId}" class="btn btn--primary btn--sm" ${!canSubmit ? "disabled" : ""}>${submitLabel}</button>
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
  if (model.autoPlayBots) {
    return `<div class="action-buttons"><span class="action-prompt"><strong>Cities &amp; Knights:</strong> Resolving player choice...</span></div>`;
  }
  const pending = state.pendingCkInteraction;
  const pColor = actingPlayer.color;

  switch (pending.kind) {
    case "displace_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Displaced Knight · ${escapeAttr(actingPlayer.name)}:</strong> Choose where your Level ${pending.knight.level} Knight retreats</span>
            <span class="ga-chip ga-chip--warn ga-num">${pending.candidateVertexIds.length} spots</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const desc = describeVertexSpotsPure(state, vId);
                return `<button type="button" data-ck-retreat-vertex="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("move_knight", pColor, 16)}
                  <span>Spot #${idx + 1}${desc ? ` (${desc})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("move_knight", pColor, 20)}
          <span class="action-prompt"><strong>Knight displaced:</strong> Click a glowing road intersection on the map or pick below.</span>
        </div>`;

    case "deserter_choose_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Deserter · ${escapeAttr(actingPlayer.name)}:</strong> Choose 1 of your Knights to desert</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const k = state.knights[vId];
                const desc = describeVertexSpotsPure(state, vId);
                return `<button type="button" data-ck-deserter-pick="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("knight_piece", pColor, 16)}
                  <span>Lv ${k?.level ?? 1} ${k?.active ? "Active" : "Inactive"} #${idx + 1}${desc ? ` (${desc})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("knight_piece", "#ef4444", 20)}
          <span class="action-prompt"><strong>Deserter:</strong> Click one of your highlighted Knights on the map or pick below.</span>
        </div>`;

    case "deserter_place_knight":
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Deserter Recruit · ${escapeAttr(actingPlayer.name)}:</strong> Place your new Level ${pending.knightLevel} ${pending.knightActive ? "Active" : "Inactive"} Knight</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${pending.candidateVertexIds
              .map((vId, idx) => {
                const desc = describeVertexSpotsPure(state, vId);
                return `<button type="button" data-ck-deserter-place="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("knight_piece", pColor, 16)}
                  <span>Spot #${idx + 1}${desc ? ` (${desc})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("knight_piece", pColor, 20)}
          <span class="action-prompt"><strong>Place deserted Knight:</strong> Click a highlighted road intersection on the map or pick below.</span>
        </div>`;

    case "spy_choose_card": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Spy · ${escapeAttr(actingPlayer.name)}:</strong> Inspect ${escapeAttr(target?.name ?? "opponent")}'s Progress Cards and take 1</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${(target?.progressCards ?? [])
              .map((c) => {
                const cat = PROGRESS_CARD_CATALOG[c.type];
                const dMeta = DISCIPLINE_META[c.discipline];
                return `<button type="button" data-ck-spy-card="${c.id}" class="btn btn--secondary btn--sm action-btn-graphic" title="${escapeAttr(cat.description)}">
                  ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                  <span>Take ${escapeAttr(cat.title)} (${dMeta.label})</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt"><strong>Spy:</strong> Choose 1 Progress Card to steal from ${escapeAttr(target?.name ?? "opponent")}.</span>
        </div>`;
    }

    case "master_merchant_choose_cards": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      if (!target) return null;
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Master Merchant · ${escapeAttr(actingPlayer.name)}:</strong> Inspect ${escapeAttr(target.name)}'s hand and take ${pending.maxCards} card(s)</span>
          </div>
          ${renderCardPickerMatrixPure(
            model,
            target,
            pending.maxCards,
            "btn-ck-mm-submit",
            `Take ${pending.maxCards} card(s)`
          )}
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", "#fbbf24", 20)}
          <span class="action-prompt"><strong>Master Merchant:</strong> Select ${pending.maxCards} card(s) from ${escapeAttr(target.name)}'s hand below.</span>
        </div>`;
    }

    case "wedding_give_cards": {
      const initiator = state.players.find((p) => p.id === pending.initiatorId);
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Wedding · ${escapeAttr(actingPlayer.name)}:</strong> Choose ${pending.requiredCount} card(s) to gift to ${escapeAttr(initiator?.name ?? "player")}</span>
          </div>
          ${renderCardPickerMatrixPure(
            model,
            actingPlayer,
            pending.requiredCount,
            "btn-ck-wedding-submit",
            `Gift ${pending.requiredCount} card(s)`
          )}
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt"><strong>Wedding gift:</strong> Pick ${pending.requiredCount} card(s) from your hand below.</span>
        </div>`;
    }

    case "commercial_harbor_offer": {
      const availRes = RESOURCES.filter((r) => actingPlayer.resources[r] > 0);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--keep-hand">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Commercial Harbor · ${escapeAttr(actingPlayer.name)}:</strong> Offer 1 resource to an eligible opponent for 1 commodity</span>
            <button type="button" id="btn-ck-ch-end" class="btn btn--secondary btn--sm">Done trading</button>
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
                        <span>Offer ${RESOURCE_META[r].label} (×${actingPlayer.resources[r]})</span>
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
          <span class="action-prompt"><strong>Commercial Harbor:</strong> Choose an opponent &amp; resource, or click <strong>Done trading</strong>.</span>
        </div>`;
    }

    case "commercial_harbor_respond": {
      const initiator = state.players.find((p) => p.id === pending.initiatorId);
      const availComms = COMMODITIES.filter((c) => actingPlayer.commodities[c] > 0);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--keep-hand">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Commercial Harbor · ${escapeAttr(actingPlayer.name)}:</strong> ${escapeAttr(initiator?.name ?? "Player")} offers 1 ${RESOURCE_META[pending.offeredResource].label} — choose 1 commodity to trade</span>
          </div>
          <div class="ga-trade-offer-bar">
            <div class="ga-trade-offer-side ga-trade-offer-side--gain">
              <span class="ga-trade-offer-side__label">
                <span class="ga-res-row-dot ga-res-row-dot--want"></span>You get
              </span>
              <span class="map-yield-chip">+1 ${renderMiniResourceCardSvg(pending.offeredResource, 30, 19)}<span>${RESOURCE_META[pending.offeredResource].label}</span></span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto;">
              ${availComms
                .map(
                  (c) => `<button type="button" data-ck-ch-resp="${c}" class="btn btn--primary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(c, 30, 19)}
                    <span>Give ${COMMODITY_META[c].label} (×${actingPlayer.commodities[c]})</span>
                  </button>`
                )
                .join("")}
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 20)}
          <span class="action-prompt"><strong>Commercial Harbor:</strong> Pick which commodity to trade for 1 ${RESOURCE_META[pending.offeredResource].label}.</span>
        </div>`;
    }
  }
}
