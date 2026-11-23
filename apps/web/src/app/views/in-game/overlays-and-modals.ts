import {
  type CatanAction,
  type CatanState,
  TERRAIN_TO_RESOURCE,
  getDiplomatRemovableRoadEdges,
  getLegalPromoteKnightVertices,
  getLegalRobberHexes,
} from "@gaming-platform/catan";
import { type SupportedLocale, t } from "../../../i18n/index.ts";
import {
  renderReferenceGuideModalPure,
  renderTutorialCoachBannerPure,
} from "../../../tutorials.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel, ClientRoom } from "../../types.ts";
import { renderCatanMapDecisionPopupPure } from "../catan-trade-and-popup-view.ts";

const FULLSCREEN_ENTER_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const FULLSCREEN_EXIT_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const FULLSCREEN_INFO_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 2.5v11" stroke="currentColor" stroke-width="1.4"/></svg>`;

export function renderFullscreenBannerControlsPure(
  model: Readonly<AppModel>,
  locale: SupportedLocale
): string {
  const isFullscreen = model.boardFullscreen;
  const label = isFullscreen
    ? t(locale, "inGame.fullscreenExit")
    : t(locale, "inGame.fullscreenEnter");
  const title = isFullscreen
    ? t(locale, "inGame.fullscreenExitTitle")
    : t(locale, "inGame.fullscreenEnterTitle");
  const iconSvg = isFullscreen ? FULLSCREEN_EXIT_SVG : FULLSCREEN_ENTER_SVG;

  const infoBtnHtml = isFullscreen
    ? `<button type="button" id="btn-toggle-fullscreen-sidebar" class="btn btn--secondary btn--sm ga-btn-fullscreen-info${
        model.fullscreenSidebarOpen ? " is-selected" : ""
      }" aria-expanded="${
        model.fullscreenSidebarOpen ? "true" : "false"
      }" title="${escapeAttr(
        t(locale, "inGame.fullscreenInfoTitle")
      )}">${FULLSCREEN_INFO_SVG}<span>${escapeAttr(
        t(locale, "inGame.fullscreenInfo")
      )}</span></button>`
    : "";

  const toggleBtnHtml = `<button type="button" id="btn-toggle-fullscreen" data-toggle-fullscreen="true" class="btn btn--secondary btn--sm ga-btn-fullscreen${
    isFullscreen ? " is-selected" : ""
  }" aria-pressed="${isFullscreen ? "true" : "false"}" title="${escapeAttr(
    title
  )}">${iconSvg}<span>${escapeAttr(label)}</span></button>`;

  return `${infoBtnHtml}${toggleBtnHtml}`;
}

export function renderFullscreenSidebarHeaderPure(
  locale: SupportedLocale
): string {
  return `<div class="ga-fullscreen-drawer-head">
              <span class="ga-fullscreen-drawer-head__title">${escapeAttr(
                t(locale, "inGame.fullscreenDrawerTitle")
              )}</span>
              <button type="button" id="btn-close-fullscreen-sidebar" class="btn btn--secondary btn--sm ga-fullscreen-drawer-head__close" aria-label="${escapeAttr(
                t(locale, "inGame.fullscreenDrawerCloseAria")
              )}">×</button>
            </div>`;
}

export function renderMapFullscreenButtonPure(
  isFullscreen: boolean,
  locale: SupportedLocale
): string {
  const label = isFullscreen
    ? t(locale, "inGame.fullscreenExit")
    : t(locale, "inGame.fullscreenEnter");
  const title = isFullscreen
    ? t(locale, "inGame.fullscreenExitTitle")
    : t(locale, "inGame.fullscreenEnterTitle");
  const iconSvg = isFullscreen ? FULLSCREEN_EXIT_SVG : FULLSCREEN_ENTER_SVG;
  return `<span class="map-zoom-divider" aria-hidden="true"></span><button type="button" id="btn-map-fullscreen" data-toggle-fullscreen="true" class="map-zoom-btn map-zoom-btn--fullscreen${
    isFullscreen ? " is-active" : ""
  }" aria-label="${escapeAttr(label)}" aria-pressed="${
    isFullscreen ? "true" : "false"
  }" title="${escapeAttr(title)}">${iconSvg}</button>`;
}

export function computeCkBoardOptionsPure(
  room: ClientRoom,
  state: any,
  model: Readonly<AppModel>,
  isMyTurn: boolean,
  actingPlayer: any
): Record<string, any> {
  if (
    room.gameId !== "catan" ||
    !(state as CatanState).config.enableCitiesAndKnights
  ) {
    return {};
  }
  const cState = state as CatanState;
  const progressCard =
    isMyTurn &&
    model.buildMode === "progress_card" &&
    model.selectedProgressCardId &&
    actingPlayer
      ? actingPlayer.progressCards.find(
          (c: any) => c.id === model.selectedProgressCardId
        )
      : undefined;

  const progressTargets = ((): {
    progressTargetVertexIds?: readonly string[];
    progressTargetEdgeIds?: readonly string[];
    progressTargetHexIds?: readonly string[];
  } => {
    if (!progressCard || !actingPlayer) return {};
    if (progressCard.type === "engineer") {
      return {
        progressTargetVertexIds: Object.entries(cState.buildings)
          .filter(
            ([, b]) =>
              b.ownerId === actingPlayer.id &&
              b.type === "city" &&
              !b.hasWall
          )
          .map(([vId]) => vId),
      };
    }
    if (progressCard.type === "smith") {
      return {
        progressTargetVertexIds: getLegalPromoteKnightVertices(
          cState,
          actingPlayer.id,
          false
        ).filter((vId) => vId !== model.smithVertex1),
      };
    }
    if (progressCard.type === "inventor") {
      return {
        progressTargetHexIds: cState.topology.hexOrder.filter((hId) => {
          if (hId === model.inventorHex1) return false;
          const t = cState.hexes[hId]!;
          return (
            t.numberToken !== null &&
            t.numberToken !== 2 &&
            t.numberToken !== 6 &&
            t.numberToken !== 8 &&
            t.numberToken !== 12 &&
            t.terrain !== "sea" &&
            t.terrain !== "fog"
          );
        }),
      };
    }
    if (progressCard.type === "bishop") {
      return {
        progressTargetHexIds: getLegalRobberHexes(cState, actingPlayer.id),
      };
    }
    if (progressCard.type === "intrigue") {
      return {
        progressTargetVertexIds: Object.entries(cState.knights)
          .filter(([vId, k]) => {
            if (k.ownerId === actingPlayer.id) return false;
            const vNode = cState.topology.vertices[vId];
            return Boolean(
              vNode?.incidentEdgeIds.some(
                (eId) => cState.edges[eId]?.ownerId === actingPlayer.id
              )
            );
          })
          .map(([vId]) => vId),
      };
    }
    if (progressCard.type === "diplomat") {
      return {
        progressTargetEdgeIds: getDiplomatRemovableRoadEdges(cState),
      };
    }
    if (progressCard.type === "merchant") {
      return {
        progressTargetHexIds: cState.topology.hexOrder.filter((hId) => {
          const tile = cState.hexes[hId]!;
          if (!TERRAIN_TO_RESOURCE[tile.terrain]) return false;
          return cState.topology.hexes[hId]!.cornerVertexIds.some(
            (vId) => cState.buildings[vId]?.ownerId === actingPlayer.id
          );
        }),
      };
    }
    return {};
  })();

  return {
    selectedMoveKnightFromVertexId: isMyTurn
      ? model.selectedMoveKnightFromVertexId
      : null,
    selectedChaseKnightVertexId: isMyTurn
      ? model.selectedChaseKnightVertexId
      : null,
    ...progressTargets,
  };
}

export function computeInGameOverlayHtmlPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: any,
  isMyTurn: boolean,
  actingPlayerId: string | null,
  actingPlayer: any,
  catanLegalActions: readonly CatanAction[]
): {
  readonly catanDecisionPopupHtml: string;
  readonly tutorialCoachHtml: string;
  readonly guideModalHtml: string;
} {
  const catanDecisionPopupHtml =
    room.gameId === "catan" && isMyTurn
      ? renderCatanMapDecisionPopupPure(
          model,
          state as CatanState,
          actingPlayer,
          catanLegalActions
        )
      : "";

  const hasBottomMapHud = Boolean(
    catanDecisionPopupHtml ||
      (room.gameId === "catan" &&
        isMyTurn &&
        !model.autoPlayBots &&
        !(state as CatanState).activeTradeOffer &&
        (state.phase === "MAIN_PHASE" || state.phase === "SPECIAL_BUILDING"))
  );

  const tutorialCoachHtml =
    model.activeTutorial && model.activeTutorial.roomId === room.roomId
      ? renderTutorialCoachBannerPure(
          room.gameId,
          model.activeTutorial.stepIndex,
          Boolean(isMyTurn && actingPlayerId && state.phase !== "GAME_OVER"),
          state,
          hasBottomMapHud,
          model.locale
        )
      : "";

  const guideModalHtml = model.guideModalGameId
    ? renderReferenceGuideModalPure(model.guideModalGameId, true, model.locale)
    : "";

  return {
    catanDecisionPopupHtml,
    tutorialCoachHtml,
    guideModalHtml,
  };
}
