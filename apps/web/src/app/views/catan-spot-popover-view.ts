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
  RESOURCE_META,
  getBoardSpotPercentPosition,
  getBoardSpotSvgCoords,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
} from "../../catan-graphics.ts";
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

  const spot = model.selectedBoardSpot;
  const { xPct, yPct } = getBoardSpotPercentPosition(state, spot);
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
        const t = state.hexes[hId]?.terrain;
        return t && t !== "sea" && t !== "fog";
      });
      const spotKindLabel =
        hasSea && hasLand
          ? "Coastal edge"
          : hasSea
            ? "Sea lane"
            : "Island path";
      const titleHtml = `${renderActionPieceIconSvg(hasSea && !hasLand ? "ship" : "road", pColor, 18)} <span>${spotKindLabel}</span>`;

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
          ? `<button type="button" data-spot-action="setup_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("road", pColor, 18)} <span>Place starting road</span></button>`
          : "",
        canSetupShipHere
          ? `<button type="button" data-spot-action="setup_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("ship", pColor, 18)} <span>Place starting ship</span></button>`
          : "",
        canBuildRoadHere
          ? `<button type="button" data-spot-action="build_road" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("road", pColor, 18)} Build road</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : renderCostPipStripPure(BUILDING_COSTS.road)}
          </button>`
          : "",
        canBuildShipHere
          ? `<button type="button" data-spot-action="build_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("ship", pColor, 18)} Build ship</span>
            ${state.phase === "ROAD_BUILDING_DEV" ? `<span class="ga-chip">Free</span>` : renderCostPipStripPure(BUILDING_COSTS.ship)}
          </button>`
          : "",
        moveToHere
          ? `<button type="button" data-spot-action="complete_move_ship" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Sail ship here</span></button>`
          : "",
        moveFromHere
          ? `<button type="button" data-spot-action="start_move_ship" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_ship", pColor, 18)} <span>Move this ship</span></button>`
          : "",
      ].filter(Boolean);

      const hintHtml = (() => {
        if (actionItems.length > 0) return "";
        if (route) {
          const owner = state.players.find((p) => p.id === route.ownerId);
          return `<div class="t-label muted" style="display: flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg(route.type, owner?.color ?? pColor, 18)} <span>${owner?.name ?? "Player"} ${route.type}</span></div>`;
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
                <span>Road needs</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.road)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
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
                <span>Ship needs</span>
                ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.ship)}
              </div>
              ${
                state.phase === "MAIN_PHASE" && legalActions.length > 0
                  ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                  : ""
              }
            `;
        }
        return `<div class="t-label muted">Connect a road or ship to build on this edge.</div>`;
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
      tile.terrain.charAt(0).toUpperCase() + tile.terrain.slice(1);
    const titleHtml = `${
      res
        ? renderMiniResourceCardSvg(res, 32, 20)
        : renderActionPieceIconSvg(
            tile.terrain === "sea" ? "ship" : "robber",
            pColor,
            18
          )
    } <span>${terrainName}${tile.numberToken ? ` · #${tile.numberToken}` : ""}</span>`;

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

    const actionItems = [
      canRobHere
        ? `<button type="button" data-spot-action="move_robber" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", pColor, 18)} <span>Move robber here</span></button>`
        : "",
      canPirateHere
        ? `<button type="button" data-spot-action="move_pirate" data-spot-id="${spot.id}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("pirate", pColor, 18)} <span>Move pirate here</span></button>`
        : "",
      chaseCandidate
        ? `<button type="button" data-spot-action="complete_chase_robber" data-spot-id="${spot.id}" data-chase-vertex="${chaseCandidate.vertexId}" data-chase-target="${chaseCandidate.targetKind ?? "robber"}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>Chase ${chaseCandidate.targetKind ?? "robber"} here</span></button>`
        : "",
      canPlayKnight &&
      ((tile.terrain !== "sea" && state.robberHexId !== spot.id) ||
        (tile.terrain === "sea" &&
          state.config.enableSeafarers &&
          state.pirateHexId !== spot.id))
        ? `<button type="button" data-spot-action="play_knight" data-spot-id="${spot.id}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("knight", pColor, 18)} <span>Play knight card</span></button>`
        : "",
    ].filter(Boolean);

    const hintHtml =
      actionItems.length === 0
        ? `<div class="t-label muted">${
            state.robberHexId === spot.id
              ? "Robber currently blocks this tile."
              : state.pirateHexId === spot.id
                ? "Pirate ship currently blocks this sea."
                : res
                  ? `Produces ${RESOURCE_META[res].label.toLowerCase()} on roll ${tile.numberToken}.`
                  : "No resource yield on this tile."
          }</div>`
        : "";

    return { valid: true, titleHtml, actionItems, hintHtml };
  })();

  if (!details.valid) return "";

  return `
      <div class="map-spot-popover ${belowClass}" data-spot-svg-x="${svgX.toFixed(2)}" data-spot-svg-y="${svgY.toFixed(2)}" style="left: ${xPct.toFixed(1)}%; top: ${yPct.toFixed(1)}%;">
        <div class="map-spot-popover__head">
          <div class="map-spot-popover__title">${details.titleHtml}</div>
          <button type="button" id="btn-close-spot-popover" class="map-spot-popover__close" aria-label="Close spot menu">×</button>
        </div>
        <div class="map-spot-popover__actions">
          ${details.actionItems.join("")}
          ${details.hintHtml}
        </div>
      </div>
    `;
}
