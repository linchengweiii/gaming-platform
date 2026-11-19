import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  getEffectiveCityCost,
} from "@gaming-platform/catan";
import { renderActionPieceIconSvg } from "../../../catan-graphics.ts";
import type { AppModel, BuildMode } from "../../types.ts";
import { renderCostPipStripPure } from "../catan-hud-view.ts";

const ACTIVE_MAP_BUILD_LABELS: Partial<Record<Exclude<BuildMode, null>, string>> =
  {
    road: "Road",
    ship: "Ship",
    move_ship: "Move ship",
    settlement: "Settlement",
    city: "City",
    wall: "City wall",
    knight: "Build knight",
    activate_knight: "Activate knight",
    promote_knight: "Promote knight",
    move_knight: "March knight",
    chase_robber: "Chase robber",
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
    <span class="map-build-btn__label">${renderActionPieceIconSvg("road", pColor, 16)}<span>Road</span></span>
    ${renderCostPipStripPure(BUILDING_COSTS.road)}
  </button>`);

  if (state.config.enableSeafarers) {
    if (canShip) readyCount += 1;
    if (canMoveShip) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "ship" ? "is-selected" : ""
    }" ${!canShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("ship", pColor, 16)}<span>Ship</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.ship)}
    </button>`);
    buildButtons.push(`<button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "move_ship" ? "is-selected" : ""
    }" ${!canMoveShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("move_ship", pColor, 16)}<span>Move ship</span></span>
    </button>`);
  }

  if (canSettlement) readyCount += 1;
  buildButtons.push(`<button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
    model.buildMode === "settlement" ? "is-selected" : ""
  }" ${!canSettlement ? "disabled" : ""}>
    <span class="map-build-btn__label">${renderActionPieceIconSvg("settlement", pColor, 16)}<span>Settlement</span></span>
    ${renderCostPipStripPure(BUILDING_COSTS.settlement)}
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
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 16)}<span>City</span></span>
      ${renderCostPipStripPure(cityCost)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "wall" ? "is-selected" : ""
    }" ${!canWall ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 16)}<span>Wall</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "knight" ? "is-selected" : ""
    }" ${!canBuildKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("knight_piece", pColor, 16)}<span>Knight</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-activate-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "activate_knight" ? "is-selected" : ""
    }" ${!canActivateKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("activate_knight", pColor, 16)}<span>Activate</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.activateKnight)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-promote-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "promote_knight" ? "is-selected" : ""
    }" ${!canPromoteKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("promote_knight", pColor, 16)}<span>Promote</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight)}
    </button>`);

    if (canMoveKnight || model.buildMode === "move_knight") {
      buildButtons.push(`<button type="button" id="btn-mode-move-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "move_knight" ? "is-selected" : ""
      }" ${!canMoveKnight ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("move_knight", pColor, 16)}<span>March</span></span>
      </button>`);
    }

    if (canChaseRobber || model.buildMode === "chase_robber") {
      buildButtons.push(`<button type="button" id="btn-mode-chase-robber" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "chase_robber" ? "is-selected" : ""
      }" ${!canChaseRobber ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("chase_robber", pColor, 16)}<span>Chase robber</span></span>
      </button>`);
    }

    buildButtons.push(`<button type="button" id="btn-mode-upgrades" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city_upgrades" ? "is-selected" : ""
    }">
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 16)}<span>Upgrades${canUpgradeAny ? " •" : ""}</span></span>
    </button>`);
  } else {
    if (canCity) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city" ? "is-selected" : ""
    }" ${!canCity ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 16)}<span>City</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.city)}
    </button>`);

    if (state.config.enableCityWalls) {
      if (canWall) readyCount += 1;
      buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "wall" ? "is-selected" : ""
      }" ${!canWall ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 16)}<span>Wall</span></span>
        ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
      </button>`);
    }

    if (canBuyDev) readyCount += 1;
    buildButtons.push(`<button type="button" id="btn-buy-dev" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn" ${
      !canBuyDev ? "disabled" : ""
    }>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("dev_card", pColor, 16)}<span>Dev card</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.devCard)}
    </button>`);
  }

  const useTwoColGrid = buildButtons.length >= 6;
  const isExpanded = Boolean(model.mapBuildMenuExpanded);
  const activePlacementLabel = model.buildMode
    ? ACTIVE_MAP_BUILD_LABELS[model.buildMode]
    : undefined;
  const endTurnLabel =
    state.phase === "SPECIAL_BUILDING" ? "Finish build" : "End turn";

  return `
      <div class="map-build-dock ${isExpanded ? "is-open" : ""}" role="toolbar" aria-label="Build pieces">
        <div class="map-build-dock__panel ${useTwoColGrid ? "map-build-dock__panel--grid" : ""}" ${
          isExpanded ? "" : "hidden"
        }>
          <div class="map-build-dock__head">
            <span>Build &amp; actions</span>
            <button type="button" id="btn-fold-build-menu" class="map-spot-popover__close" aria-label="Fold build menu" title="Fold build menu">✕</button>
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
            <span>Build</span>
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
              ? `<button type="button" data-close-submodal="1" class="btn btn--secondary btn--sm map-build-active-pill" title="Cancel ${activePlacementLabel} placement">
                   <span>Placing: ${activePlacementLabel}</span>
                   <span aria-hidden="true">✕</span>
                 </button>`
              : ""
          }
        </div>
      </div>
      <div class="map-end-turn-hud">
        <button type="button" id="btn-end-turn" class="btn btn--primary btn-end-turn-graphic">
          <span>${endTurnLabel}</span>
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
        <span class="action-prompt">Special Building Phase — click map spots directly or open <strong>Build</strong> (bottom-left), then click <strong>Finish build</strong>.</span>
      </div>
    `;
  }

  return `
      ${subModalHtml}
      <div class="action-buttons">
        <button type="button" id="btn-mode-maritime" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "maritime_trade" ? "is-selected" : ""
        }" title="${
          canMaritime
            ? "Trade resources with the bank or harbors"
            : "Inspect harbor rates or switch to player trade"
        }">
          ${renderActionPieceIconSvg("maritime_trade", pColor, 18)}
          <span>Bank trade</span>
        </button>
        <button type="button" id="btn-mode-domestic" class="btn btn--secondary btn--sm action-btn-graphic ${
          model.buildMode === "domestic_trade" ? "is-selected" : ""
        }">
          ${renderActionPieceIconSvg("domestic_trade", pColor, 18)}
          <span>Player trade</span>
        </button>
        ${
          !state.config.enableCitiesAndKnights && canKnight
            ? `<button type="button" id="btn-play-knight" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>Knight</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canRoadBuildDev
            ? `<button type="button" id="btn-play-roadbuild" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road_building", pColor, 18)} <span>2 roads</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canYoP
            ? `<button type="button" id="btn-mode-yop" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "year_of_plenty" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("year_of_plenty", pColor, 18)} <span>Year of plenty</span></button>`
            : ""
        }
        ${
          !state.config.enableCitiesAndKnights && canMonopoly
            ? `<button type="button" id="btn-mode-mono" class="btn btn--secondary btn--sm action-btn-graphic ${
                model.buildMode === "monopoly" ? "is-selected" : ""
              }">${renderActionPieceIconSvg("monopoly", pColor, 18)} <span>Monopoly</span></button>`
            : ""
        }
        <span class="action-prompt muted" style="margin-left: auto;">Click map spots directly or open Build (bottom-left) · End turn (bottom-right)</span>
      </div>
    `;
}
