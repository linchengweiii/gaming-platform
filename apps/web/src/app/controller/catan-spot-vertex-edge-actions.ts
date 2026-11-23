import {
  type CatanState,
  getDiplomatRemovableRoadEdges,
  getLegalActivateKnightVertices,
  getLegalBuildKnightVertices,
  getLegalChaseRobberActions,
  getLegalMoveKnightActions,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  getLegalPromoteKnightVertices,
  getLegalRoadEdges,
  getLegalRobberHexes,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getPlayerVulnerableCities,
} from "@gaming-platform/catan";
import { toggleSelectedBoardSpot } from "./catan-spot-actions.ts";
import type { AppRuntimeContext } from "./context.ts";
import { patchModelAndRender } from "./dom-events.ts";

const CK_VERTEX_INTERACTION_ACTIONS: Readonly<Record<string, string>> = {
  displace_knight: "RESOLVE_DISPLACED_KNIGHT",
  deserter_choose_knight: "SELECT_DESERTER_KNIGHT",
  deserter_place_knight: "PLACE_DESERTED_KNIGHT",
};

export function handleCatanVertexSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  vertexId: string
): void {
  const pending = state.pendingCkInteraction;
  if (
    state.phase === "CK_INTERACTION" &&
    pending &&
    pending.actorId === actingPlayerId &&
    "candidateVertexIds" in pending &&
    pending.candidateVertexIds.includes(vertexId)
  ) {
    const actionType = CK_VERTEX_INTERACTION_ACTIONS[pending.kind];
    if (actionType) {
      ctx.dispatch(actingPlayerId, { type: actionType, vertexId });
      return;
    }
  }

  if (
    state.phase === "BARBARIAN_PILLAGE_SELECTION" &&
    getPlayerVulnerableCities(state, actingPlayerId).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "SELECT_PILLAGED_CITY", vertexId });
    return;
  }
  if (
    (state.phase === "SETUP_SETTLEMENT_1" ||
      state.phase === "SETUP_SETTLEMENT_2") &&
    getLegalSettlementVertices(state, actingPlayerId, true).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "PLACE_SETUP_SETTLEMENT", vertexId });
    return;
  }

  const { buildMode } = ctx.model;
  const bld = state.buildings[vertexId];
  if (
    buildMode === "settlement" &&
    getLegalSettlementVertices(state, actingPlayerId, false).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_SETTLEMENT", vertexId });
    return;
  }
  if (buildMode === "city" && bld?.ownerId === actingPlayerId && bld.type === "settlement") {
    ctx.dispatch(actingPlayerId, { type: "BUILD_CITY", vertexId });
    return;
  }
  if (buildMode === "wall" && bld?.ownerId === actingPlayerId && bld.type === "city" && !bld.hasWall) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_CITY_WALL", vertexId });
    return;
  }

  if (state.config.enableCitiesAndKnights) {
    if (
      buildMode === "knight" &&
      getLegalBuildKnightVertices(state, actingPlayerId).includes(vertexId)
    ) {
      ctx.dispatch(actingPlayerId, { type: "BUILD_KNIGHT", vertexId });
      return;
    }
    if (
      buildMode === "activate_knight" &&
      getLegalActivateKnightVertices(state, actingPlayerId).includes(vertexId)
    ) {
      ctx.dispatch(actingPlayerId, { type: "ACTIVATE_KNIGHT", vertexId });
      return;
    }
    if (
      buildMode === "promote_knight" &&
      getLegalPromoteKnightVertices(state, actingPlayerId, false).includes(
        vertexId
      )
    ) {
      ctx.dispatch(actingPlayerId, { type: "PROMOTE_KNIGHT", vertexId });
      return;
    }
    if (buildMode === "move_knight") {
      const kMoves = getLegalMoveKnightActions(state, actingPlayerId);
      const fromId = ctx.model.selectedMoveKnightFromVertexId;
      if (!fromId && kMoves.some((m) => m.fromVertexId === vertexId)) {
        patchModelAndRender(ctx, {
          selectedMoveKnightFromVertexId: vertexId,
          selectedBoardSpot: null,
        });
        return;
      }
      if (
        fromId &&
        kMoves.some((m) => m.fromVertexId === fromId && m.toVertexId === vertexId)
      ) {
        ctx.dispatch(actingPlayerId, {
          type: "MOVE_KNIGHT",
          fromVertexId: fromId,
          toVertexId: vertexId,
        });
        return;
      }
    }
    if (buildMode === "chase_robber") {
      const chases = getLegalChaseRobberActions(
        state,
        actingPlayerId,
        getLegalRobberHexes(state, actingPlayerId),
        state.config.enableSeafarers
          ? getLegalPirateHexes(state, actingPlayerId)
          : []
      );
      if (chases.some((c) => c.vertexId === vertexId)) {
        patchModelAndRender(ctx, {
          selectedChaseKnightVertexId: vertexId,
          selectedBoardSpot: null,
        });
        return;
      }
    }
    if (buildMode === "progress_card" && ctx.model.selectedProgressCardId) {
      const card = state.players
        .find((p) => p.id === actingPlayerId)
        ?.progressCards.find((c) => c.id === ctx.model.selectedProgressCardId);
      if (
        card?.type === "engineer" &&
        bld?.ownerId === actingPlayerId &&
        bld.type === "city" &&
        !bld.hasWall
      ) {
        ctx.dispatch(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: card.id,
          params: { vertexId },
        });
        return;
      }
      if (
        card?.type === "intrigue" &&
        state.knights[vertexId] &&
        state.knights[vertexId]!.ownerId !== actingPlayerId &&
        state.topology.vertices[vertexId]?.incidentEdgeIds.some(
          (eId) => state.edges[eId]?.ownerId === actingPlayerId
        )
      ) {
        ctx.dispatch(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: card.id,
          params: { vertexId },
        });
        return;
      }
      if (card?.type === "smith") {
        const promotable = getLegalPromoteKnightVertices(
          state,
          actingPlayerId,
          false
        );
        if (promotable.includes(vertexId)) {
          if (promotable.length === 1) {
            ctx.dispatch(actingPlayerId, {
              type: "PLAY_PROGRESS_CARD",
              cardId: card.id,
              params: { vertexIds: [vertexId] },
            });
            return;
          }
          if (!ctx.model.smithVertex1) {
            patchModelAndRender(ctx, {
              smithVertex1: vertexId,
              selectedBoardSpot: null,
            });
            return;
          }
          if (ctx.model.smithVertex1 !== vertexId) {
            ctx.dispatch(actingPlayerId, {
              type: "PLAY_PROGRESS_CARD",
              cardId: card.id,
              params: { vertexIds: [ctx.model.smithVertex1, vertexId] },
            });
            return;
          }
        }
      }
    }
  }

  toggleSelectedBoardSpot(ctx, "vertex", vertexId);
}

export function handleCatanEdgeSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  edgeId: string
): void {
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const anchor = state.lastSetupSettlementVertexId;
    const canRoad = getLegalRoadEdges(state, actingPlayerId, anchor).includes(
      edgeId
    );
    const canShip = state.config.enableSeafarers
      ? getLegalShipEdges(state, actingPlayerId, anchor).includes(edgeId)
      : false;
    if (canRoad || canShip) {
      const edgeKind: "road" | "ship" =
        canRoad && canShip ? ctx.model.setupEdgeKind : canShip ? "ship" : "road";
      ctx.dispatch(actingPlayerId, {
        type: "PLACE_SETUP_EDGE",
        edgeId,
        edgeKind,
      });
      return;
    }
  } else if (state.phase === "ROAD_BUILDING_DEV") {
    const isRoad = getLegalRoadEdges(state, actingPlayerId, null).includes(edgeId);
    const isShip = state.config.enableSeafarers
      ? getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
      : false;
    if (isRoad || isShip) {
      const buildShip = isRoad && isShip ? ctx.model.setupEdgeKind === "ship" : isShip;
      ctx.dispatch(actingPlayerId, {
        type: buildShip ? "BUILD_SHIP" : "BUILD_ROAD",
        edgeId,
      });
      return;
    }
  } else if (
    ctx.model.buildMode === "road" &&
    getLegalRoadEdges(state, actingPlayerId, null).includes(edgeId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
    return;
  } else if (
    ctx.model.buildMode === "ship" &&
    getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
    return;
  } else if (ctx.model.buildMode === "move_ship") {
    const moves = getLegalMoveShipActions(state, actingPlayerId);
    const fromId = ctx.model.selectedMoveFromEdgeId;
    if (!fromId && moves.some((m) => m.fromEdgeId === edgeId)) {
      patchModelAndRender(ctx, {
        selectedMoveFromEdgeId: edgeId,
        selectedBoardSpot: null,
      });
      return;
    }
    if (
      fromId &&
      moves.some((m) => m.fromEdgeId === fromId && m.toEdgeId === edgeId)
    ) {
      ctx.dispatch(actingPlayerId, {
        type: "MOVE_SHIP",
        fromEdgeId: fromId,
        toEdgeId: edgeId,
      });
      return;
    }
  } else if (
    state.config.enableCitiesAndKnights &&
    ctx.model.buildMode === "progress_card" &&
    ctx.model.selectedProgressCardId
  ) {
    const card = state.players
      .find((p) => p.id === actingPlayerId)
      ?.progressCards.find((c) => c.id === ctx.model.selectedProgressCardId);
    if (
      card?.type === "diplomat" &&
      getDiplomatRemovableRoadEdges(state).includes(edgeId)
    ) {
      const isOwn = state.edges[edgeId]?.ownerId === actingPlayerId;
      let rebuildEdgeId: string | undefined;
      if (isOwn) {
        const afterRemove: CatanState = {
          ...state,
          edges: Object.fromEntries(
            Object.entries(state.edges).filter(([k]) => k !== edgeId)
          ),
          players: state.players.map((p) =>
            p.id === actingPlayerId
              ? { ...p, roadsRemaining: p.roadsRemaining + 1 }
              : p
          ),
        };
        rebuildEdgeId = getLegalRoadEdges(
          afterRemove,
          actingPlayerId,
          null
        ).find((rId) => rId !== edgeId);
      }
      ctx.dispatch(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: card.id,
        params: { edgeId, ...(rebuildEdgeId ? { rebuildEdgeId } : {}) },
      });
      return;
    }
  }

  toggleSelectedBoardSpot(ctx, "edge", edgeId);
}
