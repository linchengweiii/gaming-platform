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
import type { AppRuntimeContext } from "./context.ts";

export function handleCatanVertexSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  vertexId: string
): void {
  if (
    state.phase === "BARBARIAN_PILLAGE_SELECTION" &&
    getPlayerVulnerableCities(state, actingPlayerId).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, {
      type: "SELECT_PILLAGED_CITY",
      vertexId,
    });
    return;
  }
  if (
    (state.phase === "SETUP_SETTLEMENT_1" ||
      state.phase === "SETUP_SETTLEMENT_2") &&
    getLegalSettlementVertices(state, actingPlayerId, true).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, {
      type: "PLACE_SETUP_SETTLEMENT",
      vertexId,
    });
    return;
  }
  if (
    ctx.model.buildMode === "settlement" &&
    getLegalSettlementVertices(state, actingPlayerId, false).includes(vertexId)
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_SETTLEMENT", vertexId });
    return;
  }
  if (
    ctx.model.buildMode === "city" &&
    state.buildings[vertexId]?.ownerId === actingPlayerId &&
    state.buildings[vertexId]?.type === "settlement"
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_CITY", vertexId });
    return;
  }
  if (
    ctx.model.buildMode === "wall" &&
    state.buildings[vertexId]?.ownerId === actingPlayerId &&
    state.buildings[vertexId]?.type === "city" &&
    !state.buildings[vertexId]?.hasWall
  ) {
    ctx.dispatch(actingPlayerId, { type: "BUILD_CITY_WALL", vertexId });
    return;
  }
  if (state.config.enableCitiesAndKnights) {
    if (
      ctx.model.buildMode === "knight" &&
      getLegalBuildKnightVertices(state, actingPlayerId).includes(vertexId)
    ) {
      ctx.dispatch(actingPlayerId, { type: "BUILD_KNIGHT", vertexId });
      return;
    }
    if (
      ctx.model.buildMode === "activate_knight" &&
      getLegalActivateKnightVertices(state, actingPlayerId).includes(vertexId)
    ) {
      ctx.dispatch(actingPlayerId, { type: "ACTIVATE_KNIGHT", vertexId });
      return;
    }
    if (
      ctx.model.buildMode === "promote_knight" &&
      getLegalPromoteKnightVertices(state, actingPlayerId, false).includes(
        vertexId
      )
    ) {
      ctx.dispatch(actingPlayerId, { type: "PROMOTE_KNIGHT", vertexId });
      return;
    }
    if (ctx.model.buildMode === "move_knight") {
      const kMoves = getLegalMoveKnightActions(state, actingPlayerId);
      if (
        !ctx.model.selectedMoveKnightFromVertexId &&
        kMoves.some((m) => m.fromVertexId === vertexId)
      ) {
        ctx.model = {
          ...ctx.model,
          selectedMoveKnightFromVertexId: vertexId,
          selectedBoardSpot: null,
        };
        ctx.render();
        return;
      }
      if (
        ctx.model.selectedMoveKnightFromVertexId &&
        kMoves.some(
          (m) =>
            m.fromVertexId === ctx.model.selectedMoveKnightFromVertexId &&
            m.toVertexId === vertexId
        )
      ) {
        ctx.dispatch(actingPlayerId, {
          type: "MOVE_KNIGHT",
          fromVertexId: ctx.model.selectedMoveKnightFromVertexId,
          toVertexId: vertexId,
        });
        return;
      }
    }
    if (ctx.model.buildMode === "chase_robber") {
      const chases = getLegalChaseRobberActions(
        state,
        actingPlayerId,
        getLegalRobberHexes(state, actingPlayerId),
        state.config.enableSeafarers ? getLegalPirateHexes(state) : []
      );
      if (chases.some((c) => c.vertexId === vertexId)) {
        ctx.model = {
          ...ctx.model,
          selectedChaseKnightVertexId: vertexId,
          selectedBoardSpot: null,
        };
        ctx.render();
        return;
      }
    }
    if (
      ctx.model.buildMode === "progress_card" &&
      ctx.model.selectedProgressCardId
    ) {
      const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
      const card = actingPlayer?.progressCards.find(
        (c) => c.id === ctx.model.selectedProgressCardId
      );
      if (
        card?.type === "engineer" &&
        state.buildings[vertexId]?.ownerId === actingPlayerId &&
        state.buildings[vertexId]?.type === "city" &&
        !state.buildings[vertexId]?.hasWall
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
          true
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
            ctx.model = {
              ...ctx.model,
              smithVertex1: vertexId,
              selectedBoardSpot: null,
            };
            ctx.render();
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
      if (
        card?.type === "deserter" &&
        ctx.model.deserterTargetPlayerId &&
        !state.buildings[vertexId] &&
        !state.knights[vertexId] &&
        state.topology.vertices[vertexId]?.incidentEdgeIds.some(
          (eId) => state.edges[eId]?.ownerId === actingPlayerId
        )
      ) {
        ctx.dispatchUiAction(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: card.id,
          params: {
            targetPlayerId: ctx.model.deserterTargetPlayerId,
            placeVertexId: vertexId,
          },
        });
        return;
      }
    }
  }
  ctx.model = {
    ...ctx.model,
    selectedBoardSpot:
      ctx.model.selectedBoardSpot?.kind === "vertex" &&
      ctx.model.selectedBoardSpot.id === vertexId
        ? null
        : { kind: "vertex", id: vertexId },
  };
  ctx.render();
}

export function handleCatanEdgeSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  edgeId: string
): void {
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const anchor = state.lastSetupSettlementVertexId;
    const legalRoads = getLegalRoadEdges(state, actingPlayerId, anchor);
    const legalShips = state.config.enableSeafarers
      ? getLegalShipEdges(state, actingPlayerId, anchor)
      : [];
    const canRoad = legalRoads.includes(edgeId);
    const canShip = legalShips.includes(edgeId);
    if (canRoad || canShip) {
      const chosenEdgeKind: "road" | "ship" =
        canRoad && canShip
          ? ctx.model.setupEdgeKind
          : canShip
            ? "ship"
            : "road";
      ctx.dispatch(actingPlayerId, {
        type: "PLACE_SETUP_EDGE",
        edgeId,
        edgeKind: chosenEdgeKind,
      });
      return;
    }
  } else if (state.phase === "ROAD_BUILDING_DEV") {
    const isRoad = getLegalRoadEdges(state, actingPlayerId, null).includes(
      edgeId
    );
    const isShip = state.config.enableSeafarers
      ? getLegalShipEdges(state, actingPlayerId, null).includes(edgeId)
      : false;
    if (isRoad && isShip) {
      ctx.dispatch(actingPlayerId, {
        type: ctx.model.setupEdgeKind === "ship" ? "BUILD_SHIP" : "BUILD_ROAD",
        edgeId,
      });
      return;
    }
    if (isRoad) {
      ctx.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId });
      return;
    }
    if (isShip) {
      ctx.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId });
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
    if (
      !ctx.model.selectedMoveFromEdgeId &&
      moves.some((m) => m.fromEdgeId === edgeId)
    ) {
      ctx.model = {
        ...ctx.model,
        selectedMoveFromEdgeId: edgeId,
        selectedBoardSpot: null,
      };
      ctx.render();
      return;
    }
    if (
      ctx.model.selectedMoveFromEdgeId &&
      moves.some(
        (m) =>
          m.fromEdgeId === ctx.model.selectedMoveFromEdgeId &&
          m.toEdgeId === edgeId
      )
    ) {
      ctx.dispatch(actingPlayerId, {
        type: "MOVE_SHIP",
        fromEdgeId: ctx.model.selectedMoveFromEdgeId,
        toEdgeId: edgeId,
      });
      return;
    }
  } else if (
    state.config.enableCitiesAndKnights &&
    ctx.model.buildMode === "progress_card" &&
    ctx.model.selectedProgressCardId
  ) {
    const actingPlayer = state.players.find((p) => p.id === actingPlayerId);
    const card = actingPlayer?.progressCards.find(
      (c) => c.id === ctx.model.selectedProgressCardId
    );
    if (
      card?.type === "diplomat" &&
      getDiplomatRemovableRoadEdges(state).includes(edgeId)
    ) {
      const ownRebuilds = getLegalRoadEdges(
        state,
        actingPlayerId,
        null
      ).filter((rId) => rId !== edgeId);
      const isOwn = state.edges[edgeId]?.ownerId === actingPlayerId;
      ctx.dispatch(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: card.id,
        params: {
          edgeId,
          ...(isOwn && ownRebuilds[0]
            ? { rebuildEdgeId: ownRebuilds[0] }
            : {}),
        },
      });
      return;
    }
  }

  ctx.model = {
    ...ctx.model,
    selectedBoardSpot:
      ctx.model.selectedBoardSpot?.kind === "edge" &&
      ctx.model.selectedBoardSpot.id === edgeId
        ? null
        : { kind: "edge", id: edgeId },
  };
  ctx.render();
}
