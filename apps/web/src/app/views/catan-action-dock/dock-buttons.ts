import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  getEffectiveCityCost,
} from "@gaming-platform/catan";
import { renderActionPieceIconSvg } from "../../../catan-graphics.ts";
import type { AppModel } from "../../types.ts";
import { renderCostPipStripPure } from "../catan-hud-view.ts";

export function renderCatanMapBuildAndEndTurnHudPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (
    !actingPlayer ||
    model.autoPlayBots ||
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

  const buildButtons: string[] = [];

  buildButtons.push(`<button type="button" id="btn-mode-road" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
    model.buildMode === "road" ? "is-selected" : ""
  }" ${!canRoad ? "disabled" : ""}>
    <span class="map-build-btn__label">${renderActionPieceIconSvg("road", pColor, 17)}<span>Road</span></span>
    ${renderCostPipStripPure(BUILDING_COSTS.road)}
  </button>`);

  if (state.config.enableSeafarers) {
    buildButtons.push(`<button type="button" id="btn-mode-ship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "ship" ? "is-selected" : ""
    }" ${!canShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("ship", pColor, 17)}<span>Ship</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.ship)}
    </button>`);
    buildButtons.push(`<button type="button" id="btn-mode-moveship" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "move_ship" ? "is-selected" : ""
    }" ${!canMoveShip ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("move_ship", pColor, 17)}<span>Move ship</span></span>
    </button>`);
  }

  buildButtons.push(`<button type="button" id="btn-mode-settlement" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
    model.buildMode === "settlement" ? "is-selected" : ""
  }" ${!canSettlement ? "disabled" : ""}>
    <span class="map-build-btn__label">${renderActionPieceIconSvg("settlement", pColor, 17)}<span>Settlement</span></span>
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

    buildButtons.push(`<button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city" ? "is-selected" : ""
    }" ${!canCity ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 17)}<span>City</span></span>
      ${renderCostPipStripPure(cityCost)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "wall" ? "is-selected" : ""
    }" ${!canWall ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 17)}<span>Wall</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "knight" ? "is-selected" : ""
    }" ${!canBuildKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("knight_piece", pColor, 17)}<span>Knight</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-activate-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "activate_knight" ? "is-selected" : ""
    }" ${!canActivateKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("activate_knight", pColor, 17)}<span>Activate</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.activateKnight)}
    </button>`);

    buildButtons.push(`<button type="button" id="btn-mode-promote-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "promote_knight" ? "is-selected" : ""
    }" ${!canPromoteKnight ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("promote_knight", pColor, 17)}<span>Promote</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.knight)}
    </button>`);

    if (canMoveKnight || model.buildMode === "move_knight") {
      buildButtons.push(`<button type="button" id="btn-mode-move-knight" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "move_knight" ? "is-selected" : ""
      }" ${!canMoveKnight ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("move_knight", pColor, 17)}<span>March</span></span>
      </button>`);
    }

    if (canChaseRobber || model.buildMode === "chase_robber") {
      buildButtons.push(`<button type="button" id="btn-mode-chase-robber" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "chase_robber" ? "is-selected" : ""
      }" ${!canChaseRobber ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("chase_robber", pColor, 17)}<span>Chase robber</span></span>
      </button>`);
    }

    buildButtons.push(`<button type="button" id="btn-mode-upgrades" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city_upgrades" ? "is-selected" : ""
    }">
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 17)}<span>Upgrades${canUpgradeAny ? " •" : ""}</span></span>
    </button>`);
  } else {
    buildButtons.push(`<button type="button" id="btn-mode-city" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
      model.buildMode === "city" ? "is-selected" : ""
    }" ${!canCity ? "disabled" : ""}>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("city", pColor, 17)}<span>City</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.city)}
    </button>`);

    if (state.config.enableCityWalls) {
      buildButtons.push(`<button type="button" id="btn-mode-wall" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn ${
        model.buildMode === "wall" ? "is-selected" : ""
      }" ${!canWall ? "disabled" : ""}>
        <span class="map-build-btn__label">${renderActionPieceIconSvg("wall", pColor, 17)}<span>Wall</span></span>
        ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
      </button>`);
    }

    buildButtons.push(`<button type="button" id="btn-buy-dev" class="btn btn--secondary btn--sm action-btn-graphic map-build-btn" ${
      !canBuyDev ? "disabled" : ""
    }>
      <span class="map-build-btn__label">${renderActionPieceIconSvg("dev_card", pColor, 17)}<span>Dev card</span></span>
      ${renderCostPipStripPure(BUILDING_COSTS.devCard)}
    </button>`);
  }

  const useTwoColGrid = buildButtons.length >= 6;
  const endTurnLabel =
    state.phase === "SPECIAL_BUILDING" ? "Finish build" : "End turn";

  return `
      <div class="map-build-dock ${useTwoColGrid ? "map-build-dock--grid" : ""}" role="toolbar" aria-label="Build pieces">
        ${buildButtons.join("")}
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
        <span class="action-prompt">Special Building Phase — choose pieces in the bottom-left build menu, then click <strong>Finish build</strong>.</span>
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
        <span class="action-prompt muted" style="margin-left: auto;">Build from the bottom-left of the map · End turn on the bottom-right</span>
      </div>
    `;
}
