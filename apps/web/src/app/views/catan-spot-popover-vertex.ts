import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  getEffectiveCityCost,
  getLegalSettlementVertices,
  hasResources,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  RESOURCE_META,
  renderActionPieceIconSvg,
} from "../../catan-graphics.ts";
import type { AppModel } from "../types.ts";
import {
  renderCostPipStripPure,
  renderMissingCostBadgePure,
} from "./catan-hud-view.ts";

export interface SpotPopoverDetails {
  readonly valid: boolean;
  readonly titleHtml: string;
  readonly actionItems: readonly string[];
  readonly hintHtml: string;
}

export function computeVertexSpotPopoverDetailsPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  legalActions: readonly CatanAction[],
  spotId: string
): SpotPopoverDetails {
  const pColor = actingPlayer.color;
  const vNode = state.topology.vertices[spotId];
  if (!vNode) {
    return { valid: false, titleHtml: "", actionItems: [], hintHtml: "" };
  }
  const existing = state.buildings[spotId];
  const existingKnight = state.config.enableCitiesAndKnights
    ? state.knights[spotId]
    : undefined;
  const harbor = state.harbors.find((h) => {
    const he = state.topology.edges[h.edgeId];
    return he && (he.v1 === spotId || he.v2 === spotId);
  });
  const spotTitle = harbor
    ? harbor.type === "generic"
      ? "3:1 Harbor spot"
      : `2:1 ${RESOURCE_META[harbor.type].label} port`
    : existing
      ? existing.metropolis
        ? `${DISCIPLINE_META[existing.metropolis].label} Metropolis`
        : existing.type === "city"
          ? "Fortified city"
          : "Settlement"
      : existingKnight
        ? `${
            existingKnight.level === 3
              ? "Mighty"
              : existingKnight.level === 2
                ? "Strong"
                : "Basic"
          } knight (${existingKnight.active ? "active" : "inactive"})`
        : "Island intersection";
  const titleHtml = `${renderActionPieceIconSvg(
    existing?.metropolis
      ? "metropolis"
      : existingKnight
        ? "knight_piece"
        : existing?.type === "city"
          ? "city"
          : "settlement",
    existing
      ? state.players.find((p) => p.id === existing.ownerId)?.color ?? pColor
      : existingKnight
        ? state.players.find((p) => p.id === existingKnight.ownerId)?.color ??
          pColor
        : pColor,
    18
  )} <span>${spotTitle}</span>`;

  const canSetupSettleHere = legalActions.some(
    (a) => a.type === "PLACE_SETUP_SETTLEMENT" && a.vertexId === spotId
  );
  const canSettleHere = legalActions.some(
    (a) => a.type === "BUILD_SETTLEMENT" && a.vertexId === spotId
  );
  const canCityHere = legalActions.some(
    (a) => a.type === "BUILD_CITY" && a.vertexId === spotId
  );
  const canWallHere = legalActions.some(
    (a) => a.type === "BUILD_CITY_WALL" && a.vertexId === spotId
  );
  const canPillageHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "SELECT_PILLAGED_CITY" && a.vertexId === spotId
    );
  const canBuildKnightHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "BUILD_KNIGHT" && a.vertexId === spotId
    );
  const canPromoteKnightHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "PROMOTE_KNIGHT" && a.vertexId === spotId
    );
  const canActivateKnightHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "ACTIVATE_KNIGHT" && a.vertexId === spotId
    );
  const canMoveKnightFromHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "MOVE_KNIGHT" && a.fromVertexId === spotId
    );
  const canMoveKnightToHere =
    state.config.enableCitiesAndKnights &&
    model.selectedMoveKnightFromVertexId
      ? legalActions.some(
          (a) =>
            a.type === "MOVE_KNIGHT" &&
            a.fromVertexId === model.selectedMoveKnightFromVertexId &&
            a.toVertexId === spotId
        )
      : false;
  const canChaseFromHere =
    state.config.enableCitiesAndKnights &&
    legalActions.some(
      (a) => a.type === "CHASE_ROBBER_WITH_KNIGHT" && a.vertexId === spotId
    );
  const effectiveCityCost = state.config.enableCitiesAndKnights
    ? getEffectiveCityCost(actingPlayer)
    : BUILDING_COSTS.city;
  const setupPieceLabel =
    state.config.enableCitiesAndKnights &&
    state.phase === "SETUP_SETTLEMENT_2"
      ? "Place starting city"
      : "Place starting settlement";

  const actionItems = [
    canSetupSettleHere
      ? `<button type="button" data-spot-action="setup_settlement" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg(state.config.enableCitiesAndKnights && state.phase === "SETUP_SETTLEMENT_2" ? "city" : "settlement", pColor, 18)} <span>${setupPieceLabel}</span></button>`
      : "",
    canPillageHere
      ? `<button type="button" data-spot-action="pillage_city" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", "#ef4444", 18)} <span>Downgrade this city</span></button>`
      : "",
    canSettleHere
      ? `<button type="button" data-spot-action="build_settlement" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("settlement", pColor, 18)} Build settlement</span>
            ${renderCostPipStripPure(BUILDING_COSTS.settlement)}
          </button>`
      : "",
    canCityHere
      ? `<button type="button" data-spot-action="build_city" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("city", pColor, 18)} Upgrade city</span>
            ${renderCostPipStripPure(effectiveCityCost)}
          </button>`
      : "",
    canWallHere
      ? `<button type="button" data-spot-action="build_wall" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("wall", pColor, 18)} Build city wall</span>
            ${renderCostPipStripPure(BUILDING_COSTS.cityWall)}
          </button>`
      : "",
    canBuildKnightHere
      ? `<button type="button" data-spot-action="build_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("knight_piece", pColor, 18)} Recruit knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight)}
          </button>`
      : "",
    canActivateKnightHere
      ? `<button type="button" data-spot-action="activate_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("activate_knight", pColor, 18)} Activate knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.activateKnight)}
          </button>`
      : "",
    canPromoteKnightHere
      ? `<button type="button" data-spot-action="promote_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("promote_knight", pColor, 18)} Promote knight</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight)}
          </button>`
      : "",
    canMoveKnightToHere
      ? `<button type="button" data-spot-action="complete_move_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>March knight here</span></button>`
      : "",
    canMoveKnightFromHere
      ? `<button type="button" data-spot-action="start_move_knight" data-spot-id="${spotId}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>Move this knight</span></button>`
      : "",
    canChaseFromHere
      ? `<button type="button" data-spot-action="start_chase_robber" data-spot-id="${spotId}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>Chase robber</span></button>`
      : "",
  ].filter(Boolean);

  const hintHtml = (() => {
    if (actionItems.length > 0) return "";
    const effCityCost = state.config.enableCitiesAndKnights
      ? getEffectiveCityCost(actingPlayer)
      : BUILDING_COSTS.city;
    if (
      existing &&
      existing.ownerId === actingPlayer.id &&
      existing.type === "settlement" &&
      !hasResources(actingPlayer.resources, effCityCost)
    ) {
      return `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>City upgrade needs</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, effCityCost)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
    }
    if (
      !existing &&
      getLegalSettlementVertices(state, actingPlayer.id, false).includes(
        spotId
      ) &&
      !hasResources(actingPlayer.resources, BUILDING_COSTS.settlement)
    ) {
      return `
            <div class="t-label muted" style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <span>Settlement needs</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.settlement)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>Trade for resources</span></button>`
                : ""
            }
          `;
    }
    if (existing) {
      const owner = state.players.find((p) => p.id === existing.ownerId);
      return `<div class="t-label muted">${owner?.name ?? "Player"} ${existing.type}${existing.hasWall ? " · walled" : ""}</div>`;
    }
    const adjOccupied = vNode.adjacentVertexIds.some((nbV) =>
      Boolean(state.buildings[nbV])
    );
    return `<div class="t-label muted">${
      adjOccupied
        ? "Distance rule: adjacent intersection occupied."
        : "Connect your road or ship to settle here."
    }</div>`;
  })();

  return { valid: true, titleHtml, actionItems, hintHtml };
}
