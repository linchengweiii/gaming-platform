import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  getEffectiveCityCost,
} from "@gaming-platform/catan";
import { renderActionPieceIconSvg } from "../../../catan-graphics.ts";
import { type TranslationKey, t } from "../../../i18n/index.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel, BuildMode } from "../../types.ts";
import { renderCostPipStripPure } from "../catan-hud-view.ts";

const ACTIVE_MAP_BUILD_KEYS: Partial<
  Record<Exclude<BuildMode, null>, TranslationKey>
> = {
  road: "catan.build.road",
  ship: "catan.build.ship",
  move_ship: "catan.build.moveShip",
  settlement: "catan.build.settlement",
  city: "catan.build.city",
  wall: "catan.build.cityWall",
  knight: "catan.build.buildKnight",
  activate_knight: "catan.build.activateKnight",
  promote_knight: "catan.build.promoteKnight",
  move_knight: "catan.build.marchKnight",
  chase_robber: "catan.build.chaseRobber",
};

export function renderCatanMapBuildAndEndTurnHudPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (
    !actingPlayer ||
    model.autoPlayBots ||
    Boolean(state.activeTradeOffer) ||
    (state.phase !== "MAIN_PHASE" && state.phase !== "SPECIAL_BUILDING")
  ) {
    return "";
  }

  const locale = model.locale;
  const pColor = actingPlayer.color;
  const canRoad = legalActions.some((a) => a.type === "BUILD_ROAD");
  const canShip = legalActions.some((a) => a.type === "BUILD_SHIP");
  const canMoveShip = legalActions.some((a) => a.type === "MOVE_SHIP");
  const canSettlement = legalActions.some((a) => a.type === "BUILD_SETTLEMENT");
  const canCity = legalActions.some((a) => a.type === "BUILD_CITY");
  const canWall = legalActions.some((a) => a.type === "BUILD_CITY_WALL");
  const canBuyDev = legalActions.some((a) => a.type === "BUY_DEV_CARD");

  let readyCount = 0;
  const buildButtons: string[] = [];

  if (canRoad) readyCount += 1;
  buildButtons.push(`<button type="button" id="btn-mode-road" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
    model.buildMode === "road" ? "is-selected" : ""
  }" ${!canRoad ? "disabled" : ""}>
    <span class="map-build-btn__label">${renderActionPieceIconSvg("road", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.road"))}</span></span>
    ${renderCostPipStripPure(BUILDING_COSTS.road, locale)}
  </button>`);

  if (state.config.enableSeafarers) {
    if (canShip) readyCount += 1;
    if (canMoveShip) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "ship" ? "is-selected" : ""
    }" ${!canShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("ship", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.ship"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.ship, locale)}
    </button>`);
    buildButtons.push(`<button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "move_ship" ? "is-selected" : ""
    }" ${!canMoveShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("move_ship", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.moveShip"))}</span></span>
    </button>`);
  }

  if (canSettlement) readyCount += 1;
  buildButtons.push(`<button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
    model.buildMode === "settlement" ? "is-selected" : ""
  }" ${!canSettlement ? "disabled" : ""}>
    <span class="map-build-btn__label">${renderActionPieceIconSvg("settlement", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.settlement"))}</span></span>
    ${renderCostPipStripPure(BUILDING_COSTS.settlement, locale)}
  </button>`);

  if (state.config.enableCitiesAndKnights) {
    const canBuildKnight = legalActions.some((a) => a.type === "BUILD_KNIGHT");
    const canActivateKnight = legalActions.some(
      (a) => a.type === "ACTIVATE_KNIGHT"
    );
    const canPromoteKnight = legalActions.some(
      (a) => a.type === "PROMOTE_KNIGHT"
    );
    const canMoveKnight = legalActions.some((a) => a.type === "MOVE_KNIGHT");
    const canChaseRobber = legalActions.some(
      (a) => a.type === "CHASE_ROBBER_WITH_KNIGHT"
    );
    const canUpgradeAny = legalActions.some(
      (a) => a.type === "UPGRADE_CITY_IMPROVEMENT"
    );
    const cityCost = getEffectiveCityCost(actingPlayer);

    if (canCity) readyCount += 1;
    if (canWall) readyCount += 1;
    if (canBuildKnight) readyCount += 1;
    if (canActivateKnight) readyCount += 1;
    if (canPromoteKnight) readyCount += 1;
    if (canMoveKnight) readyCount += 1;
    if (canChaseRobber) readyCount += 1;
    if (canUpgradeAny) readyCount += 1;

    buildButtons.push(`<button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city" ? "is-selected" : ""
    }" ${!canCity ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.city"))}</span></span>
      ${renderCostPipStripPure(cityCost, locale)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "wall" ? "is-selected" : ""
    }" ${!canWall ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.wall"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.cityWall, locale)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "knight" ? "is-selected" : ""
    }" ${!canBuildKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("knight_piece", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.knight"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight, locale)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-activate-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "activate_knight" ? "is-selected" : ""
    }" ${!canActivateKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("activate_knight", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.activate"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.activateKnight, locale)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-promote-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "promote_knight" ? "is-selected" : ""
    }" ${!canPromoteKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("promote_knight", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.promote"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight, locale)}
    </button>`);

    if (canMoveKnight || model.buildMode === "move_knight") {
      buildButtons.push(`<button type="button" id="btn-mode-move-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "move_knight" ? "is-selected" : ""
      }" ${!canMoveKnight ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("move_knight", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.march"))}</span></span>
      </button>`);
    }

    if (canChaseRobber || model.buildMode === "chase_robber") {
      buildButtons.push(`<button type="button" id="btn-mode-chase-robber" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "chase_robber" ? "is-selected" : ""
      }" ${!canChaseRobber ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("chase_robber", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.chaseRobber"))}</span></span>
      </button>`);
    }

    buildButtons.push(`<button type="button" id="btn-mode-upgrades" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city_upgrades" ? "is-selected" : ""
    }">
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 16)}<span>${escapeAttr(t(locale, "catan.build.upgrades"))}${canUpgradeAny ? " •" : ""}</span></span>
    </button>`);
  } else {
    if (canCity) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city" ? "is-selected" : ""
    }" ${!canCity ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.city"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.city, locale)}
    </button>`);

    if (state.config.enableCityWalls) {
      if (canWall) readyCount += 1;
      buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "wall" ? "is-selected" : ""
      }" ${!canWall ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.wall"))}</span></span>
        ${renderCostPipStripPure(BUILDING_COSTS.cityWall, locale)}
      </button>`);
    }

    if (canBuyDev) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-buy-dev" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn" ${
      !canBuyDev ? "disabled" : ""
    }>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("dev_card", pColor, 16)}<span>${escapeAttr(t(locale, "catan.build.devCard"))}</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.devCard, locale)}
    </button>`);
  }

  const useTwoColGrid = buildButtons.length >= 6;
  const isExpanded = Boolean(model.mapBuildMenuExpanded);
  const activePlacementKey = model.buildMode
    ? ACTIVE_MAP_BUILD_KEYS[model.buildMode]
    : undefined;
  const activePlacementLabel = activePlacementKey
    ? t(locale, activePlacementKey)
    : undefined;
  const endTurnLabel =
    state.phase === "SPECIAL_BUILDING"
      ? t(locale, "catan.build.finishBuild")
      : t(locale, "catan.build.endTurn");

  return `
      <div class="map-build-dock ${isExpanded ? "is-open" : ""}" role="toolbar" aria-label="${escapeAttr(t(locale, "catan.build.toolbarAria"))}">
        <div class="map-build-dock__panel ${useTwoColGrid ? "map-build-dock__panel--grid" : ""}" ${
          isExpanded ? "" : "hidden"
        }>
          <div class="map-build-dock__head">
            <span>${escapeAttr(t(locale, "catan.build.menuTitle"))}</span>
            <button type="button" id="btn-fold-build-menu" class="map-spot-popover__close" aria-label="${escapeAttr(t(locale, "catan.build.foldMenu"))}" title="${escapeAttr(t(locale, "catan.build.foldMenu"))}">✕</button>
          </div>
          <div class="map-build-dock__grid ${useTwoColGrid ? "is-two-col" : ""}">
            ${buildButtons.join("")}
          </div>
        </div>
        <div class="map-build-dock__bar">
          <button
            type="button"
            id="btn-toggle-build-menu"
            class="btn btn--secondary btn-build-toggle ${isExpanded ? "is-selected" : ""}"
            aria-expanded="${isExpanded ? "true" : "false"}"
          >
            ${renderActionPieceIconSvg("settlement", pColor, 17)}
            <span>${escapeAttr(t(locale, "catan.build.button"))}</span>
            ${
              readyCount > 0
                ? `<span class="ga-chip ga-chip--ok ga-num map-build-ready-badge">${readyCount}</span>`
                : ""
            }
            <svg class="map-build-chev" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 7.5L6 4l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          ${
            activePlacementLabel
              ? `<button type="button" data-close-submodal="1" class="btn btn--secondary btn--sm map-build-active-pill" title="${escapeAttr(
                  t(locale, "catan.build.cancelPlacementTitle", {
                    label: activePlacementLabel,
                  })
                )}">
                   <span>${escapeAttr(t(locale, "catan.build.placing", { label: activePlacementLabel }))}</span>
                   <span aria-hidden="true">✕</span>
                 </button>`
              : ""
          }
        </div>
      </div>
      <div class="map-end-turn-hud">
        <button type="button" id="btn-end-turn" class="btn btn--primary btn-end-turn-graphic">
          <span>${escapeAttr(endTurnLabel)}</span>
          ${renderActionPieceIconSvg("end_turn", pColor, 18)}
        </button>
      </div>
    `;
}

export function renderCatanMainDockButtonsPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  legalActions: readonly CatanAction[],
  subModalHtml: string
): string {
  const locale = model.locale;
  const pColor = actingPlayer.color;
  const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
  const canRoadBuildDev = legalActions.some(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  const canYoP = legalActions.some((a) => a.type === "PLAY_YEAR_OF_PLENTY");
  const canMonopoly = legalActions.some((a) => a.type === "PLAY_MONOPOLY");
  const canMaritime = legalActions.some((a) => a.type === "MARITIME_TRADE");

  if (state.phase === "SPECIAL_BUILDING") {
    return `
      ${subModalHtml}
      <div class="action-buttons">
        <span class="action-prompt">${t(locale, "catan.dock.specialBuildingPrompt", {
          build: `<strong>${escapeAttr(t(locale, "catan.build.button"))}</strong>`,
          finish: `<strong>${escapeAttr(t(locale, "catan.build.finishBuild"))}</strong>`,
        })}</span>
      </div>
    `;
  }

  return `
      ${subModalHtml}
      <div class="action-buttons">
        <button type="button" id="btn-mode-maritime" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "maritime_trade" ? "is-selected" : ""
        }" title="${escapeAttr(
          canMaritime
            ? t(locale, "catan.dock.bankTradeTitleCan")
            : t(locale, "catan.dock.bankTradeTitleInspect")
        )}">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 18)}
          <span>${escapeAttr(t(locale, "catan.dock.bankTrade"))}</span>
        </button>
        <button type="button" id="btn-mode-domestic" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "domestic_trade" ? "is-selected" : ""
        }">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 18)}
          <span>${escapeAttr(t(locale, "catan.dock.playerTrade"))}</span>
        </button>
        ${
          !state.config.enableCitiesAndKnights && canKnight
            ? `<button type="button" id="btn-play-knight" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>${escapeAttr(t(locale, "catan.build.knight"))}</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canRoadBuildDev
            ? `<button type="button" id="btn-play-roadbuild" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road_building", pColor, 18)} <span>${escapeAttr(t(locale, "catan.dock.twoRoads"))}</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canYoP
            ? `<button type="button" id="btn-mode-yop" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "year_of_plenty" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("year_of_plenty", pColor, 18)} <span>${escapeAttr(t(locale, "catan.dock.yearOfPlenty"))}</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canMonopoly
            ? `<button type="button" id="btn-mode-mono" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "monopoly" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("monopoly", pColor, 18)} <span>${escapeAttr(t(locale, "catan.dock.monopoly"))}</span></button>`
            : ""
        }
        <span class="action-prompt muted" style="margin-left: auto;">${escapeAttr(t(locale, "catan.dock.mainHint"))}</span>
      </div>
    `;
}
