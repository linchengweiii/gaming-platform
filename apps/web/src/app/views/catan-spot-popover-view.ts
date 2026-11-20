import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  TERRAIN_TO_RESOURCE,
  getLegalRoadEdges,
  getLegalShipEdges,
  hasResources,
} from "@gaming-platform/catan";
import {
  getBoardSpotPercentPosition,
  getBoardSpotSvgCoords,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
} from "../../catan-graphics.ts";
import {
  getCatanResourceTextLocalized,
  getCatanTerrainLabelLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeHtml } from "../helpers/html-and-dropdown.ts";
import type { AppModel } from "../types.ts";
import {
  renderCostPipStripPure,
  renderMissingCostBadgePure,
} from "./catan-hud-view.ts";
import {
  type SpotPopoverDetails,
  computeVertexSpotPopoverDetailsPure,
} from "./catan-spot-popover-vertex.ts";

export function renderCatanSpotPopoverPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (
    !model.selectedBoardSpot ||
    !actingPlayer ||
    state.phase === "GAME_OVER"
  ) {
    return "";
  }

  const locale = model.locale;
  const spot = model.selectedBoardSpot;
  const { xPct, yPct } = getBoardSpotPercentPosition(
    state,
    spot,
    model.catanMapViewport
  );
  const { x: svgX, y: svgY } = getBoardSpotSvgCoords(state, spot);
  const belowClass = yPct < 36 ? "map-spot-popover--below" : "";
  const pColor = actingPlayer.color;

  const details = ((): SpotPopoverDetails => {
    if (spot.kind === "edge") {
      const eNode = state.topology.edges[spot.id];
      if (!eNode) {
        return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
      }
      const route = state.edges[spot.id];
      const hasSea = eNode.adjacentHexIds.some(
        (hId) => state.hexes[hId]?.terrain === "sea"
      );
      const hasLand = eNode.adjacentHexIds.some((hId) => {
        const tVal = state.hexes[hId]?.terrain;
        return tVal && tVal !== "sea" && tVal !== "fog";
      });
      const spotKindLabel =
        hasSea && hasLand
          ? t(locale, "catan.spot.coastalEdge")
          : hasSea
            ? t(locale, "catan.spot.seaLane")
            : t(locale, "catan.spot.islandPath");
      const titleHtml = `${renderActionPieceIconSvg(hasSea && !hasLand ? "ship" : "road", pColor, 18)} <span>${escapeHtml(spotKindLabel)}</span>`;

      const canBuildRoadHere = legalActions.some(
        (a) => a.type === "BUILD_ROAD" && a.edgeId === spot.id
      );
      const canBuildShipHere = legalActions.some(
        (a) => a.type === "BUILD_SHIP" && a.edgeId === spot.id
      );
      const canSetupRoadHere = legalActions.some(
        (a) =>
          a.type === "PLACE_SETUP_EDGE" &&
          a.edgeId === spot.id &&
          a.edgeKind === "road"
      );
      const canSetupShipHere = legalActions.some(
        (a) =>
          a.type === "PLACE_SETUP_EDGE" &&
          a.edgeId === spot.id &&
          a.edgeKind === "ship"
      );
      const moveFromHere = legalActions.some(
        (a) => a.type === "MOVE_SHIP" && a.fromEdgeId === spot.id
      );
      const moveToHere = model.selectedMoveFromEdgeId
        ? legalActions.some(
            (a) =>
              a.type === "MOVE_SHIP" &&
              a.fromEdgeId === model.selectedMoveFromEdgeId &&
              a.toEdgeId === spot.id
          )
        : false;

      const actionItems = [
        canSetupRoadHere
          ? `<button type="button" data-spot-action="setup_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.placeStartingRoad"))}</span></button>`
          : "",
        canSetupShipHere
          ? `<button type="button" data-spot-action="setup_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("ship", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.placeStartingShip"))}</span></button>`
          : "",
        canBuildRoadHere
          ? `<button type="button" data-spot-action="build_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("road", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.buildRoad"))}</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">${escapeHtml(t(locale, "common.free"))}</span>` : renderCostPipStripPure(BUILDING_COSTS.road, locale)}
          </button>`
          : "",
        canBuildShipHere
          ? `<button type="button" data-spot-action="build_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("ship", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.buildShip"))}</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">${escapeHtml(t(locale, "common.free"))}</span>` : renderCostPipStripPure(BUILDING_COSTS.ship, locale)}
          </button>`
          : "",
        moveToHere
          ? `<button type="button" data-spot-action="complete_move_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.sailShipHere"))}</span></button>`
          : "",
        moveFromHere
          ? `<button type="button" data-spot-action="start_move_ship" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.moveThisShip"))}</span></button>`
          : "",
      ].filter(Boolean);

      const hintHtml = (() => {
        if (actionItems.length > 0) return "";
        if (route) {
          const owner = state.players.find((p) => p.id === route.ownerId);
          const pieceLabel =
            route.type === "ship"
              ? t(locale, "catan.phase.edgeShip")
              : t(locale, "catan.phase.edgeRoad");
          return `<div class="t-label muted" style="display: flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg(route.type, owner?.color ?? pColor, 18)} <span>${escapeHtml(
            t(locale, "catan.spot.ownerPiece", {
              owner: owner?.name ?? t(locale, "common.player"),
              piece: pieceLabel,
            })
          )}</span></div>`;
        }
        const roadGeomOk = getLegalRoadEdges(
          state,
          actingPlayer.id,
          null
        ).includes(spot.id);
        const shipGeomOk =
          state.config.enableSeafarers &&
          getLegalShipEdges(state, actingPlayer.id, null).includes(spot.id);
        if (
          roadGeomOk &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.road)
        ) {
          return `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>${escapeHtml(t(locale, "catan.spot.roadNeeds"))}</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.road, locale)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>${escapeHtml(t(locale, "catan.spot.tradeForResources"))}</span></button>`
                  : ""
              }
            `;
        }
        if (
          shipGeomOk &&
          !hasResources(actingPlayer.resources, BUILDING_COSTS.ship)
        ) {
          return `
              <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                <span>${escapeHtml(t(locale, "catan.spot.shipNeeds"))}</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.ship, locale)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>${escapeHtml(t(locale, "catan.spot.tradeForResources"))}</span></button>`
                  : ""
              }
            `;
        }
        return `<div class="t-label muted">${escapeHtml(t(locale, "catan.spot.connectEdgeHint"))}</div>`;
      })();

      return { valid: true, titleHtml, actionItems, hintHtml };
    }

    if (spot.kind === "vertex") {
      return computeVertexSpotPopoverDetailsPure(
        model,
        state,
        actingPlayer,
        legalActions,
        spot.id
      );
    }

    const tile = state.hexes[spot.id];
    if (!tile) {
      return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
    }
    const res = TERRAIN_TO_RESOURCE[tile.terrain];
    const terrainName =
      locale === "en"
        ? tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1)
        : getCatanTerrainLabelLocalized(tile.terrain, locale);
    const titleHtml = `${
      res
        ? renderMiniResourceCardSvg(res, 32, 20)
        : renderActionPieceIconSvg(
            tile.terrain === "sea" ? "ship" : "robber",
            pColor,
            18
          )
    } <span>${escapeHtml(terrainName)}${tile.numberToken ? ` · #${tile.numberToken}` : ""}</span>`;

    const canRobHere = legalActions.some(
      (a) => a.type === "MOVE_ROBBER" && a.hexId === spot.id
    );
    const canPirateHere = legalActions.some(
      (a) => a.type === "MOVE_PIRATE" && a.hexId === spot.id
    );
    const canPlayKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
    const chaseCandidate = state.config.enableCitiesAndKnights
      ? legalActions.find(
          (
            a
          ): a is Extract<CatanAction, { type: "CHASE_ROBBER_WITH_KNIGHT" }> =>
            a.type === "CHASE_ROBBER_WITH_KNIGHT" &&
            a.hexId === spot.id &&
            (!model.selectedChaseKnightVertexId ||
              a.vertexId === model.selectedChaseKnightVertexId)
        )
      : undefined;

    const chaseTargetLabel =
      chaseCandidate?.targetKind === "pirate"
        ? locale === "en"
          ? "pirate"
          : t(locale, "catan.phase.piecePirateShip")
        : t(locale, "catan.phase.pieceRobber");

    const actionItems = [
      canRobHere
        ? `<button type="button" data-spot-action="move_robber" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.moveRobberHere"))}</span></button>`
        : "",
      canPirateHere
        ? `<button type="button" data-spot-action="move_pirate" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("pirate", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.movePirateHere"))}</span></button>`
        : "",
      chaseCandidate
        ? `<button type="button" data-spot-action="complete_chase_robber" data-spot-id="${spot.id}" data-chase-vertex="${chaseCandidate.vertexId}" data-chase-target="${chaseCandidate.targetKind ?? "robber"}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>${escapeHtml(
            t(locale, "catan.spot.chaseTargetHere", { target: chaseTargetLabel })
          )}</span></button>`
        : "",
      canPlayKnight &&
      ((tile.terrain !== "sea" && state.robberHexId !== spot.id) ||
        (tile.terrain === "sea" &&
          state.config.enableSeafarers &&
          state.pirateHexId !== spot.id))
        ? `<button type="button" data-spot-action="play_knight" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.playKnightCard"))}</span></button>`
        : "",
    ].filter(Boolean);

    const resLabel = res
      ? locale === "en"
        ? getCatanResourceTextLocalized(res, locale).label.toLowerCase()
        : getCatanResourceTextLocalized(res, locale).label
      : "";
    const hintHtml =
      actionItems.length === 0
        ? `<div class="t-label muted">${escapeHtml(
            state.robberHexId === spot.id
              ? t(locale, "catan.spot.robberBlocks")
              : state.pirateHexId === spot.id
                ? t(locale, "catan.spot.pirateBlocks")
                : res
                  ? t(locale, "catan.spot.producesOnRoll", {
                      resource: resLabel,
                      num: tile.numberToken ?? "",
                    })
                  : t(locale, "catan.spot.noYield")
          )}</div>`
        : "";

    return { valid: true, titleHtml, actionItems, hintHtml };
  })();

  if (!details.valid) return "";

  return `
      <div class="map-spot-popover ${belowClass}" data-spot-svg-x="${svgX.toFixed(2)}" data-spot-svg-y="${svgY.toFixed(2)}" style="left: ${xPct.toFixed(1)}%; top: ${yPct.toFixed(1)}%;">
        <div class="map-spot-popover__head">
          <div class="map-spot-popover__title">${details.titleHtml}</div>
          <button type="button" id="btn-close-spot-popover" class="map-spot-popover__close" aria-label="${escapeHtml(t(locale, "catan.spot.closeMenuAria"))}">×</button>
        </div>
        <div class="map-spot-popover__actions">
          ${details.actionItems.join("")}
          ${details.hintHtml}
        </div>
      </div>
    `;
}
