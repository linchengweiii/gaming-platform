import {
  type CatanState,
  RESOURCES,
  TRADE_GOODS,
  computePlayerVictoryPoints,
  getLegalShipEdges,
  getPlayerGoodCount,
  isCommodityType,
  totalCommodityCount,
  totalResourceCount,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  RESOURCE_META,
  renderActionPieceIconSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../../catan-graphics.ts";
import { DRAWN_ARROW_SVG, escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel, ClientRoom } from "../../types.ts";
import {
  renderResourceColumnHeadersPure,
  renderTradeGoodColumnHeadersPure,
} from "../catan-hud-view.ts";
import { renderActiveTradeOfferCardPure } from "../catan-trade-and-popup-view.ts";

export function renderCatanSetupAndPhaseDockPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  canCancelMyTrade: boolean
): string | null {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-buttons" style="justify-content: space-between;">
        <span class="action-prompt"><strong>Match complete.</strong> ${escapeAttr(winner?.name ?? "Player")} wins Catan with ${
          winner ? computePlayerVictoryPoints(state, winner.id, false) : 0
        } victory points.</span>
        <button type="button" id="btn-goto-setup-finished" class="btn btn--primary btn--sm">Configure next game${DRAWN_ARROW_SVG}</button>
      </div>`;
  }

  const pColor = actingPlayer.color;

  if (
    state.phase === "SETUP_SETTLEMENT_1" ||
    state.phase === "SETUP_SETTLEMENT_2"
  ) {
    if (
      state.config.enableCitiesAndKnights &&
      state.phase === "SETUP_SETTLEMENT_2"
    ) {
      return `<div class="action-buttons">
        ${renderActionPieceIconSvg("city", pColor, 22)}
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Click any pulsing intersection on the map to place a starting city.</span>
      </div>`;
    }
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("settlement", pColor, 22)}
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Click any pulsing intersection on the map to place a starting settlement.</span>
      </div>`;
  }

  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const anchor = state.lastSetupSettlementVertexId;
    const canShip =
      state.config.enableSeafarers &&
      getLegalShipEdges(state, actingPlayer.id, anchor).length > 0;
    const anchorKind =
      state.config.enableCitiesAndKnights && state.phase === "SETUP_ROAD_2"
        ? "city"
        : "settlement";
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.setupEdgeKind, pColor, 22)}
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Click a pulsing edge next to your ${anchorKind} to place a starting ${model.setupEdgeKind}.</span>
        ${
          canShip
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>Switch to ${model.setupEdgeKind === "road" ? "ship" : "road"}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "DISCARD_ON_SEVEN") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Roll of 7:</strong> Resolving discards...</span></div>`;
    }
    const req = state.pendingDiscards[actingPlayer.id] ?? 0;
    if (state.config.enableCitiesAndKnights) {
      const currentSelected =
        totalResourceCount(model.discardSelection) +
        totalCommodityCount(model.discardCommodities);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Discard · ${escapeAttr(actingPlayer.name)}:</strong> Discard ${req} cards</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${currentSelected}/${req} selected</span>
          </div>
          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(actingPlayer)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Discard
            </div>
            ${TRADE_GOODS.map((g) => {
              const sel = isCommodityType(g)
                ? model.discardCommodities[g]
                : model.discardSelection[g];
              const have = getPlayerGoodCount(actingPlayer, g);
              return `
                <div class="ga-res-cell ${sel > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-discard-good-sub="${g}" class="ga-res-step-btn" ${sel <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${sel}</span>
                  <button type="button" data-discard-good-add="${g}" class="ga-res-step-btn" ${sel >= have || currentSelected >= req ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}
          </div>
          <div class="ga-trade-preview">
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">Reset</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">Auto-pick ${req}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>Confirm discard</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt"><strong>Discard required:</strong> Select ${req} resource or commodity cards below while keeping the map in view.</span>
        </div>`;
    }
    const currentSelected = totalResourceCount(model.discardSelection);
    return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Roll of 7 · ${escapeAttr(actingPlayer.name)}:</strong> Discard ${req} cards</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${currentSelected}/${req} selected</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>Discard
            </div>
            ${RESOURCES.map((r) => {
              const sel = model.discardSelection[r];
              const have = actingPlayer.resources[r];
              return `
                <div class="ga-res-cell ${sel > 0 ? "ga-res-cell--active-give" : ""}">
                  <button type="button" data-discard-sub="${r}" class="ga-res-step-btn" ${sel <= 0 ? "disabled" : ""}>−</button>
                  <span class="ga-res-step-val">${sel}</span>
                  <button type="button" data-discard-add="${r}" class="ga-res-step-btn" ${sel >= have || currentSelected >= req ? "disabled" : ""}>+</button>
                </div>
              `;
            }).join("")}
          </div>
          <div class="ga-trade-preview">
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">Reset</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">Auto-pick ${req}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>Confirm discard</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt"><strong>Roll of 7:</strong> Select ${req} resource cards below while keeping the map in view.</span>
        </div>`;
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Gold river:</strong> Selecting resources...</span></div>`;
    }
    const rem = state.pendingGoldPicks[actingPlayer.id] ?? 0;
    return `
        <div class="sub-modal sub-modal--trade sub-modal--gold">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Gold river · ${escapeAttr(actingPlayer.name)}:</strong> Pick ${rem} free resource${rem === 1 ? "" : "s"}</span>
            <span class="ga-chip ga-chip--warn ga-num">${rem} left</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>Take 1
            </div>
            ${RESOURCES.map(
              (r) => `
                <button type="button" data-gold-pick="${r}" class="ga-res-port-btn is-selected-want" ${state.bank[r] <= 0 ? "disabled" : ""}>
                  <span style="font-size: 13px; font-weight: 600;">+1 ${RESOURCE_META[r].label}</span>
                </button>
              `
            ).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
          <span class="action-prompt"><strong>Gold river:</strong> Select your free resource card in the tray below.</span>
        </div>`;
  }

  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.robberOrPirateMode, pColor, 22)}
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Click any pulsing hex on the map to move the ${
          model.robberOrPirateMode === "pirate" ? "pirate ship" : "robber"
        }.</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-robber-pirate" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.robberOrPirateMode === "robber" ? "pirate" : "robber", pColor, 18)}
                 <span>Switch to ${
                   model.robberOrPirateMode === "robber"
                     ? "pirate (sea)"
                     : "robber (land)"
                 }</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("robber", pColor, 20)}
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Choose an adjacent player on the map popup above to draw 1 card.</span>
      </div>`;
  }

  if (state.phase === "ROAD_BUILDING_DEV") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("road_building", pColor, 22)}
        <span class="action-prompt"><strong>Road building active:</strong> Click a highlighted edge on the map (${state.freeRoadsRemaining} free ${state.freeRoadsRemaining === 1 ? "route" : "routes"} left).</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>Mode: ${model.setupEdgeKind === "road" ? "Road (switch to Ship)" : "Ship (switch to Road)"}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "PRE_ROLL") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn--sm action-btn-graphic">${renderRollDiceButtonGraphicSvg(24)} <span>Roll dice</span></button>
        </div>`;
    }
    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "progress_card" &&
      model.selectedProgressCardId
    ) {
      const alchCard = actingPlayer.progressCards.find(
        (c) => c.id === model.selectedProgressCardId && c.type === "alchemist"
      );
      if (alchCard) {
        const dFaces = [1, 2, 3, 4, 5, 6];
        return `
          <div class="sub-modal sub-modal--trade">
            <div class="ga-trade-head">
              <div style="display: inline-flex; align-items: center; gap: 7px;">
                ${renderActionPieceIconSvg("progress_card", DISCIPLINE_META.science.accent, 18)}
                <strong style="font-size: var(--t-small); font-weight: 500;">Alchemist — choose exact White & Red dice before Event Die roll</strong>
              </div>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span class="t-label muted">White:</span>
                ${dFaces
                  .map(
                    (f) =>
                      `<button type="button" data-alch-die1="${f}" class="btn btn--sm ${
                        model.alchemistDie1 === f
                          ? "btn--primary"
                          : "btn--secondary"
                      } ga-num">${f}</button>`
                  )
                  .join("")}
              </div>
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span class="t-label muted">Red (caliper):</span>
                ${dFaces
                  .map(
                    (f) =>
                      `<button type="button" data-alch-die2="${f}" class="btn btn--sm ${
                        model.alchemistDie2 === f
                          ? "btn--primary"
                          : "btn--secondary"
                      } ga-num">${f}</button>`
                  )
                  .join("")}
              </div>
              <button type="button" id="btn-exec-alchemist" class="btn btn--primary btn--sm ga-num" style="margin-left: auto;">
                Roll ${model.alchemistDie1} + ${model.alchemistDie2} = ${model.alchemistDie1 + model.alchemistDie2}
              </button>
            </div>
          </div>
          <div class="action-buttons">
            <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Set your Alchemist dice below or close to roll normally.</span>
          </div>`;
      }
    }
    return `<div class="action-buttons">
        <span class="action-prompt"><strong>${escapeAttr(actingPlayer.name)}:</strong> Roll the dice directly on the map above to start your turn (or click any map hex to inspect).</span>
      </div>`;
  }

  if (state.phase === "MAIN_PHASE" && state.activeTradeOffer) {
    if (model.autoPlayBots) {
      return `<div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
        model,
        room,
        state,
        actingPlayer,
        canCancelMyTrade
      )}</div>`;
    }
    return `
        <div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
          model,
          room,
          state,
          actingPlayer,
          canCancelMyTrade
        )}</div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 20)}
          <span class="action-prompt"><strong>Active player trade:</strong> Inspect the map above and respond to the resource offer below.</span>
        </div>`;
  }

  return null;
}
