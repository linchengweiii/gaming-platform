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
  renderActionPieceIconSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../../catan-graphics.ts";
import { getCatanResourceTextLocalized, t } from "../../../i18n/index.ts";
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
  const locale = model.locale;
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-buttons" style="justify-content: space-between;">
        <span class="action-prompt">${t(locale, "catan.phase.winsCatan", {
          complete: `<strong>${escapeAttr(t(locale, "catan.phase.matchCompletePrefix"))}</strong>`,
          winner: escapeAttr(winner?.name ?? t(locale, "common.player")),
          vp: winner ? computePlayerVictoryPoints(state, winner.id, false) : 0,
        })}</span>
        <button type="button" id="btn-goto-setup-finished" class="btn btn--primary btn--sm">${escapeAttr(t(locale, "inGame.configureNextGame"))}${DRAWN_ARROW_SVG}</button>
      </div>`;
  }

  const pColor = actingPlayer.color;
  const actorStrong = `<strong>${escapeAttr(actingPlayer.name)}:</strong>`;

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
        <span class="action-prompt">${t(locale, "catan.phase.placeStartingCity", { name: actorStrong })}</span>
      </div>`;
    }
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("settlement", pColor, 22)}
        <span class="action-prompt">${t(locale, "catan.phase.placeStartingSettlement", { name: actorStrong })}</span>
      </div>`;
  }

  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const anchor = state.lastSetupSettlementVertexId;
    const canShip =
      state.config.enableSeafarers &&
      getLegalShipEdges(state, actingPlayer.id, anchor).length > 0;
    const anchorKind =
      state.config.enableCitiesAndKnights && state.phase === "SETUP_ROAD_2"
        ? t(locale, "catan.phase.anchorCity")
        : t(locale, "catan.phase.anchorSettlement");
    const edgeWord =
      model.setupEdgeKind === "ship"
        ? t(locale, "catan.phase.edgeShip")
        : t(locale, "catan.phase.edgeRoad");
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.setupEdgeKind, pColor, 22)}
        <span class="action-prompt">${t(locale, "catan.phase.placeStartingEdge", {
          name: actorStrong,
          anchor: escapeAttr(anchorKind),
          edge: escapeAttr(edgeWord),
        })}</span>
        ${
          canShip
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>${escapeAttr(
                   model.setupEdgeKind === "road"
                     ? t(locale, "catan.phase.switchToShip")
                     : t(locale, "catan.phase.switchToRoad")
                 )}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "DISCARD_ON_SEVEN") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt">${t(
        locale,
        "catan.phase.roll7Resolving",
        { prefix: `<strong>${escapeAttr(t(locale, "catan.phase.roll7Prefix"))}</strong>` }
      )}</span></div>`;
    }
    const req = state.pendingDiscards[actingPlayer.id] ?? 0;
    if (state.config.enableCitiesAndKnights) {
      const currentSelected =
        totalResourceCount(model.discardSelection) +
        totalCommodityCount(model.discardCommodities);
      return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.phase.discardCkHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.phase.discardPrefix", { name: actingPlayer.name }))}</strong>`,
              req,
            })}</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${escapeAttr(
              t(locale, "catan.phase.selectedCount", {
                selected: currentSelected,
                req,
              })
            )}</span>
          </div>
          <div class="ga-res-matrix ga-res-matrix--ck">
            ${renderTradeGoodColumnHeadersPure(actingPlayer, undefined, undefined, locale)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.phase.discardRowLabel"))}
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
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.reset"))}</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "catan.phase.autoPick", { req }))}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>${escapeAttr(t(locale, "catan.phase.confirmDiscard"))}</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.phase.discardCkPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.phase.discardRequiredPrefix"))}</strong>`,
            req,
          })}</span>
        </div>`;
    }
    const currentSelected = totalResourceCount(model.discardSelection);
    return `
        <div class="sub-modal sub-modal--trade sub-modal--discard">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.phase.discardCkHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.phase.roll7NamePrefix", { name: actingPlayer.name }))}</strong>`,
              req,
            })}</span>
            <span class="ga-chip ${currentSelected === req ? "ga-chip--ok" : "ga-chip--warn"} ga-num">${escapeAttr(
              t(locale, "catan.phase.selectedCount", {
                selected: currentSelected,
                req,
              })
            )}</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources, undefined, undefined, locale)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.phase.discardRowLabel"))}
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
            <button type="button" id="btn-discard-reset" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.reset"))}</button>
            <div style="display: flex; gap: 6px;">
              <button type="button" id="btn-discard-auto" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "catan.phase.autoPick", { req }))}</button>
              <button type="button" id="btn-discard-submit" class="btn btn--primary btn--sm" ${currentSelected !== req ? "disabled" : ""}>${escapeAttr(t(locale, "catan.phase.confirmDiscard"))}</button>
            </div>
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.phase.discardBasePrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.phase.roll7Prefix"))}</strong>`,
            req,
          })}</span>
        </div>`;
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt">${t(
        locale,
        "catan.phase.goldResolving",
        { prefix: `<strong>${escapeAttr(t(locale, "catan.phase.goldPrefix"))}</strong>` }
      )}</span></div>`;
    }
    const rem = state.pendingGoldPicks[actingPlayer.id] ?? 0;
    const goldPrefix = `<strong>${escapeAttr(
      t(locale, "catan.phase.goldNamePrefix", { name: actingPlayer.name })
    )}</strong>`;
    return `
        <div class="sub-modal sub-modal--trade sub-modal--gold">
          <div class="ga-trade-head">
            <span class="action-prompt">${
              rem === 1
                ? t(locale, "catan.phase.goldHeadOne", { prefix: goldPrefix })
                : t(locale, "catan.phase.goldHeadMany", {
                    prefix: goldPrefix,
                    rem,
                  })
            }</span>
            <span class="ga-chip ga-chip--warn ga-num">${escapeAttr(t(locale, "catan.phase.leftCount", { rem }))}</span>
          </div>
          <div class="ga-res-matrix">
            ${renderResourceColumnHeadersPure(actingPlayer.resources, undefined, undefined, locale)}
            <div class="ga-res-matrix__row-label">
              <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.phase.takeOne"))}
            </div>
            ${RESOURCES.map(
              (r) => `
                <button type="button" data-gold-pick="${r}" class="ga-res-port-btn is-selected-want" ${state.bank[r] <= 0 ? "disabled" : ""}>
                  <span style="font-size: 13px; font-weight: 600;">+1 ${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
                </button>
              `
            ).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("year_of_plenty", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.phase.goldPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.phase.goldPrefix"))}</strong>`,
          })}</span>
        </div>`;
  }

  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg(model.robberOrPirateMode, pColor, 22)}
        <span class="action-prompt">${t(locale, "catan.phase.moveRobberOrPirate", {
          name: actorStrong,
          piece: escapeAttr(
            model.robberOrPirateMode === "pirate"
              ? t(locale, "catan.phase.piecePirateShip")
              : t(locale, "catan.phase.pieceRobber")
          ),
        })}</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-robber-pirate" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.robberOrPirateMode === "robber" ? "pirate" : "robber", pColor, 18)}
                 <span>${escapeAttr(
                   model.robberOrPirateMode === "robber"
                     ? t(locale, "catan.phase.switchToPirate")
                     : t(locale, "catan.phase.switchToRobber")
                 )}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("robber", pColor, 20)}
        <span class="action-prompt">${t(locale, "catan.phase.stealPrompt", { name: actorStrong })}</span>
      </div>`;
  }

  if (state.phase === "ROAD_BUILDING_DEV") {
    const rbPrefix = `<strong>${escapeAttr(t(locale, "catan.phase.roadBuildingPrefix"))}</strong>`;
    return `<div class="action-buttons">
        ${renderActionPieceIconSvg("road_building", pColor, 22)}
        <span class="action-prompt">${
          state.freeRoadsRemaining === 1
            ? t(locale, "catan.phase.roadBuildingPromptOne", { prefix: rbPrefix })
            : t(locale, "catan.phase.roadBuildingPromptMany", {
                prefix: rbPrefix,
                rem: state.freeRoadsRemaining,
              })
        }</span>
        ${
          state.config.enableSeafarers
            ? `<button type="button" id="btn-toggle-setup-edge" class="btn btn--secondary btn--sm is-selected action-btn-graphic">
                 ${renderActionPieceIconSvg(model.setupEdgeKind === "road" ? "ship" : "road", pColor, 18)}
                 <span>${escapeAttr(
                   model.setupEdgeKind === "road"
                     ? t(locale, "catan.phase.modeRoadToShip")
                     : t(locale, "catan.phase.modeShipToRoad")
                 )}</span>
               </button>`
            : ""
        }
      </div>`;
  }

  if (state.phase === "PRE_ROLL") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn--sm action-btn-graphic">${renderRollDiceButtonGraphicSvg(24)} <span>${escapeAttr(t(locale, "catan.decision.rollDice"))}</span></button>
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
                <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(t(locale, "catan.phase.alchemistTitle"))}</strong>
              </div>
              <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span class="t-label muted">${escapeAttr(t(locale, "catan.phase.whiteDie"))}</span>
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
                <span class="t-label muted">${escapeAttr(t(locale, "catan.phase.redDie"))}</span>
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
                ${escapeAttr(
                  t(locale, "catan.phase.rollEquation", {
                    d1: model.alchemistDie1,
                    d2: model.alchemistDie2,
                    sum: model.alchemistDie1 + model.alchemistDie2,
                  })
                )}
              </button>
            </div>
          </div>
          <div class="action-buttons">
            <span class="action-prompt">${t(locale, "catan.phase.alchemistPrompt", { name: actorStrong })}</span>
          </div>`;
      }
    }
    return `<div class="action-buttons">
        <span class="action-prompt">${t(locale, "catan.phase.preRollPrompt", { name: actorStrong })}</span>
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
          <span class="action-prompt">${t(locale, "catan.phase.activeTradePrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.phase.activeTradePrefix"))}</strong>`,
          })}</span>
        </div>`;
  }

  return null;
}
