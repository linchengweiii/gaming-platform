import {
  BUILDING_COSTS,
  type CatanAction,
  type CatanState,
  getEffectiveCityCost,
  getLegalSettlementVertices,
  hasResources,
} from "@gaming-platform/catan";
import { renderActionPieceIconSvg } from "../../catan-graphics.ts";
import {
  getCatanDisciplineTextLocalized,
  getCatanResourceTextLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeHtml } from "../helpers/html-and-dropdown.ts";
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
  const locale = model.locale;
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
      ? t(locale, "catan.spot.harbor31")
      : t(locale, "catan.spot.port21", {
          label: getCatanResourceTextLocalized(harbor.type, locale).label,
        })
    : existing
      ? existing.metropolis
        ? t(locale, "catan.spot.metropolisTitle", {
            discipline: getCatanDisciplineTextLocalized(
              existing.metropolis,
              locale
            ).label,
          })
        : existing.type === "city"
          ? t(locale, "catan.spot.fortifiedCity")
          : t(locale, "catan.build.settlement")
      : existingKnight
        ? t(locale, "catan.spot.knightTitle", {
            tier:
              existingKnight.level === 3
                ? t(locale, "catan.spot.knightMighty")
                : existingKnight.level === 2
                  ? t(locale, "catan.spot.knightStrong")
                  : t(locale, "catan.spot.knightBasic"),
            status: existingKnight.active
              ? t(locale, "catan.spot.knightActiveLower")
              : t(locale, "catan.spot.knightInactiveLower"),
          })
        : t(locale, "catan.spot.islandIntersection");
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
  )} <span>${escapeHtml(spotTitle)}</span>`;

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
      ? t(locale, "catan.spot.placeStartingCity")
      : t(locale, "catan.spot.placeStartingSettlement");

  const actionItems = [
    canSetupSettleHere
      ? `<button type="button" data-spot-action="setup_settlement" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg(state.config.enableCitiesAndKnights && state.phase === "SETUP_SETTLEMENT_2" ? "city" : "settlement", pColor, 18)} <span>${escapeHtml(setupPieceLabel)}</span></button>`
      : "",
    canPillageHere
      ? `<button type="button" data-spot-action="pillage_city" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("robber", "#ef4444", 18)} <span>${escapeHtml(t(locale, "catan.spot.downgradeCity"))}</span></button>`
      : "",
    canSettleHere
      ? `<button type="button" data-spot-action="build_settlement" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("settlement", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.buildSettlement"))}</span>
            ${renderCostPipStripPure(BUILDING_COSTS.settlement, locale)}
          </button>`
      : "",
    canCityHere
      ? `<button type="button" data-spot-action="build_city" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("city", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.upgradeCity"))}</span>
            ${renderCostPipStripPure(effectiveCityCost, locale)}
          </button>`
      : "",
    canWallHere
      ? `<button type="button" data-spot-action="build_wall" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("wall", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.buildCityWall"))}</span>
            ${renderCostPipStripPure(BUILDING_COSTS.cityWall, locale)}
          </button>`
      : "",
    canBuildKnightHere
      ? `<button type="button" data-spot-action="build_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("knight_piece", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.recruitKnight"))}</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight, locale)}
          </button>`
      : "",
    canActivateKnightHere
      ? `<button type="button" data-spot-action="activate_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("activate_knight", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.activateKnight"))}</span>
            ${renderCostPipStripPure(BUILDING_COSTS.activateKnight, locale)}
          </button>`
      : "",
    canPromoteKnightHere
      ? `<button type="button" data-spot-action="promote_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic" style="justify-content: space-between;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">${renderActionPieceIconSvg("promote_knight", pColor, 18)} ${escapeHtml(t(locale, "catan.spot.promoteKnight"))}</span>
            ${renderCostPipStripPure(BUILDING_COSTS.knight, locale)}
          </button>`
      : "",
    canMoveKnightToHere
      ? `<button type="button" data-spot-action="complete_move_knight" data-spot-id="${spotId}" class="btn btn--primary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.marchKnightHere"))}</span></button>`
      : "",
    canMoveKnightFromHere
      ? `<button type="button" data-spot-action="start_move_knight" data-spot-id="${spotId}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("move_knight", pColor, 18)} <span>${escapeHtml(t(locale, "catan.spot.moveThisKnight"))}</span></button>`
      : "",
    canChaseFromHere
      ? `<button type="button" data-spot-action="start_chase_robber" data-spot-id="${spotId}" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("chase_robber", pColor, 18)} <span>${escapeHtml(t(locale, "catan.build.chaseRobber"))}</span></button>`
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
              <span>${escapeHtml(t(locale, "catan.spot.cityUpgradeNeeds"))}</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, effCityCost, locale)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>${escapeHtml(t(locale, "catan.spot.tradeForResources"))}</span></button>`
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
              <span>${escapeHtml(t(locale, "catan.spot.settlementNeeds"))}</span>
              ${renderMissingCostBadgePure(actingPlayer.resources, BUILDING_COSTS.settlement, locale)}
            </div>
            ${
              state.phase === "MAIN_PHASE" && legalActions.length > 0
                ? `<button type="button" data-spot-action="open_trade" class="btn btn--secondary btn--sm action-btn-graphic">${renderActionPieceIconSvg("domestic_trade", pColor, 16)} <span>${escapeHtml(t(locale, "catan.spot.tradeForResources"))}</span></button>`
                : ""
            }
          `;
    }
    if (existing) {
      const owner = state.players.find((p) => p.id === existing.ownerId);
      const bTypeLabel =
        existing.type === "city"
          ? t(locale, "catan.phase.anchorCity")
          : t(locale, "catan.phase.anchorSettlement");
      return `<div class="t-label muted">${escapeHtml(
        t(locale, "catan.spot.ownerPiece", {
          owner: owner?.name ?? t(locale, "common.player"),
          piece: bTypeLabel,
        })
      )}${existing.hasWall ? escapeHtml(t(locale, "catan.spot.walledSuffix")) : ""}</div>`;
    }
    const adjOccupied = vNode.adjacentVertexIds.some((nbV) =>
      Boolean(state.buildings[nbV])
    );
    return `<div class="t-label muted">${escapeHtml(
      adjOccupied
        ? t(locale, "catan.spot.distanceRuleHint")
        : t(locale, "catan.spot.connectSettleHint")
    )}</div>`;
  })();

  return { valid: true, titleHtml, actionItems, hintHtml };
}
