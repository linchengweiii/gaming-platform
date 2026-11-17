import {
  type CatanAction,
  type CatanState,
  TERRAIN_TO_RESOURCE,
  getDiplomatRemovableRoadEdges,
  getLegalPromoteKnightVertices,
  getLegalRobberHexes,
} from "@gaming-platform/catan";
import {
  renderReferenceGuideModalPure,
  renderTutorialCoachBannerPure,
} from "../../../tutorials.ts";
import type { AppModel, ClientRoom } from "../../types.ts";
import { renderCatanMapDecisionPopupPure } from "../catan-trade-and-popup-view.ts";

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
          true
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
    if (progressCard.type === "deserter" && model.deserterTargetPlayerId) {
      return {
        progressTargetVertexIds: cState.topology.vertexOrder.filter((vId) => {
          if (cState.buildings[vId] || cState.knights[vId]) return false;
          const vNode = cState.topology.vertices[vId];
          return Boolean(
            vNode?.incidentEdgeIds.some(
              (eId) => cState.edges[eId]?.ownerId === actingPlayer.id
            )
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

  const tutorialCoachHtml =
    model.activeTutorial && model.activeTutorial.roomId === room.roomId
      ? renderTutorialCoachBannerPure(
          room.gameId,
          model.activeTutorial.stepIndex,
          Boolean(isMyTurn && actingPlayerId && state.phase !== "GAME_OVER"),
          state,
          Boolean(catanDecisionPopupHtml)
        )
      : "";

  const guideModalHtml = model.guideModalGameId
    ? renderReferenceGuideModalPure(model.guideModalGameId, true)
    : "";

  return {
    catanDecisionPopupHtml,
    tutorialCoachHtml,
    guideModalHtml,
  };
}
