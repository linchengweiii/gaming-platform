import {
  type CatanState,
  TERRAIN_TO_RESOURCE,
  getLegalChaseRobberActions,
  getLegalPirateHexes,
  getLegalRobberHexes,
} from "@gaming-platform/catan";
import type { AppRuntimeContext } from "./context.ts";

export {
  handleCatanEdgeSpotClick,
  handleCatanVertexSpotClick,
} from "./catan-spot-vertex-edge-actions.ts";

export function handleCatanPopoverSpotAction(
  ctx: AppRuntimeContext,
  actingPlayerId: string,
  act: string,
  spotId: string,
  chaseVertexAttr: string | null,
  chaseTargetAttr: string | null
): void {
  if (act === "build_road") {
    ctx.dispatch(actingPlayerId, { type: "BUILD_ROAD", edgeId: spotId });
  } else if (act === "build_ship") {
    ctx.dispatch(actingPlayerId, { type: "BUILD_SHIP", edgeId: spotId });
  } else if (act === "setup_road") {
    ctx.dispatch(actingPlayerId, {
      type: "PLACE_SETUP_EDGE",
      edgeId: spotId,
      edgeKind: "road",
    });
  } else if (act === "setup_ship") {
    ctx.dispatch(actingPlayerId, {
      type: "PLACE_SETUP_EDGE",
      edgeId: spotId,
      edgeKind: "ship",
    });
  } else if (act === "start_move_ship") {
    ctx.model = {
      ...ctx.model,
      buildMode: "move_ship",
      selectedMoveFromEdgeId: spotId,
      selectedBoardSpot: null,
    };
    ctx.render();
  } else if (act === "complete_move_ship" && ctx.model.selectedMoveFromEdgeId) {
    ctx.dispatch(actingPlayerId, {
      type: "MOVE_SHIP",
      fromEdgeId: ctx.model.selectedMoveFromEdgeId,
      toEdgeId: spotId,
    });
  } else if (act === "setup_settlement") {
    ctx.dispatch(actingPlayerId, {
      type: "PLACE_SETUP_SETTLEMENT",
      vertexId: spotId,
    });
  } else if (act === "build_settlement") {
    ctx.dispatch(actingPlayerId, {
      type: "BUILD_SETTLEMENT",
      vertexId: spotId,
    });
  } else if (act === "build_city") {
    ctx.dispatch(actingPlayerId, {
      type: "BUILD_CITY",
      vertexId: spotId,
    });
  } else if (act === "build_wall") {
    ctx.dispatch(actingPlayerId, {
      type: "BUILD_CITY_WALL",
      vertexId: spotId,
    });
  } else if (act === "pillage_city") {
    ctx.dispatch(actingPlayerId, {
      type: "SELECT_PILLAGED_CITY",
      vertexId: spotId,
    });
  } else if (act === "build_knight") {
    ctx.dispatch(actingPlayerId, {
      type: "BUILD_KNIGHT",
      vertexId: spotId,
    });
  } else if (act === "activate_knight") {
    ctx.dispatch(actingPlayerId, {
      type: "ACTIVATE_KNIGHT",
      vertexId: spotId,
    });
  } else if (act === "promote_knight") {
    ctx.dispatch(actingPlayerId, {
      type: "PROMOTE_KNIGHT",
      vertexId: spotId,
    });
  } else if (act === "start_move_knight") {
    ctx.model = {
      ...ctx.model,
      buildMode: "move_knight",
      selectedMoveKnightFromVertexId: spotId,
      selectedBoardSpot: null,
    };
    ctx.render();
  } else if (
    act === "complete_move_knight" &&
    ctx.model.selectedMoveKnightFromVertexId
  ) {
    ctx.dispatch(actingPlayerId, {
      type: "MOVE_KNIGHT",
      fromVertexId: ctx.model.selectedMoveKnightFromVertexId,
      toVertexId: spotId,
    });
  } else if (act === "start_chase_robber") {
    ctx.model = {
      ...ctx.model,
      buildMode: "chase_robber",
      selectedChaseKnightVertexId: spotId,
      selectedBoardSpot: null,
    };
    ctx.render();
  } else if (act === "complete_chase_robber") {
    const chaseVId =
      chaseVertexAttr ?? ctx.model.selectedChaseKnightVertexId ?? "";
    const targetKind = (chaseTargetAttr as "robber" | "pirate") ?? "robber";
    if (chaseVId) {
      ctx.dispatch(actingPlayerId, {
        type: "CHASE_ROBBER_WITH_KNIGHT",
        vertexId: chaseVId,
        hexId: spotId,
        targetKind,
      });
    }
  } else if (act === "move_robber") {
    ctx.dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId: spotId });
  } else if (act === "move_pirate") {
    ctx.dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId: spotId });
  } else if (act === "play_knight") {
    ctx.dispatch(actingPlayerId, { type: "PLAY_KNIGHT" });
  } else if (act === "open_trade") {
    ctx.model = {
      ...ctx.model,
      selectedBoardSpot: null,
      buildMode: "domestic_trade",
    };
    ctx.render();
  }
}

export function handleCatanHexSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  hexId: string
): void {
  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    if (
      ctx.model.robberOrPirateMode === "pirate" &&
      state.config.enableSeafarers
    ) {
      if (getLegalPirateHexes(state, actingPlayerId).includes(hexId)) {
        ctx.dispatch(actingPlayerId, { type: "MOVE_PIRATE", hexId });
        return;
      }
    } else {
      if (getLegalRobberHexes(state, actingPlayerId).includes(hexId)) {
        ctx.dispatch(actingPlayerId, { type: "MOVE_ROBBER", hexId });
        return;
      }
    }
  } else if (
    state.config.enableCitiesAndKnights &&
    ctx.model.buildMode === "chase_robber"
  ) {
    const legalChases = getLegalChaseRobberActions(
      state,
      actingPlayerId,
      getLegalRobberHexes(state, actingPlayerId),
      state.config.enableSeafarers
        ? getLegalPirateHexes(state, actingPlayerId)
        : []
    );
    const chosen = legalChases.find(
      (c) =>
        c.hexId === hexId &&
        (!ctx.model.selectedChaseKnightVertexId ||
          c.vertexId === ctx.model.selectedChaseKnightVertexId)
    );
    if (chosen) {
      ctx.dispatch(actingPlayerId, chosen);
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
    if (card?.type === "bishop") {
      if (getLegalRobberHexes(state, actingPlayerId).includes(hexId)) {
        ctx.dispatch(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: card.id,
          params: { hexId },
        });
        return;
      }
    } else if (card?.type === "merchant") {
      const tile = state.hexes[hexId];
      const touchesOwn = Boolean(
        tile &&
          TERRAIN_TO_RESOURCE[tile.terrain] &&
          state.topology.hexes[hexId]?.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === actingPlayerId
          )
      );
      if (touchesOwn) {
        ctx.dispatch(actingPlayerId, {
          type: "PLAY_PROGRESS_CARD",
          cardId: card.id,
          params: { hexId },
        });
        return;
      }
    } else if (card?.type === "inventor") {
      const t = state.hexes[hexId];
      const swappable = Boolean(
        t &&
          t.numberToken !== null &&
          t.numberToken !== 2 &&
          t.numberToken !== 6 &&
          t.numberToken !== 8 &&
          t.numberToken !== 12 &&
          t.terrain !== "sea" &&
          t.terrain !== "fog"
      );
      if (swappable) {
        if (!ctx.model.inventorHex1) {
          ctx.model = {
            ...ctx.model,
            inventorHex1: hexId,
            selectedBoardSpot: null,
          };
          ctx.render();
          return;
        }
        if (ctx.model.inventorHex1 !== hexId) {
          ctx.dispatch(actingPlayerId, {
            type: "PLAY_PROGRESS_CARD",
            cardId: card.id,
            params: { hexId1: ctx.model.inventorHex1, hexId2: hexId },
          });
          return;
        }
      }
    }
  }
  ctx.model = {
    ...ctx.model,
    selectedBoardSpot:
      ctx.model.selectedBoardSpot?.kind === "hex" &&
      ctx.model.selectedBoardSpot.id === hexId
        ? null
        : { kind: "hex", id: hexId },
  };
  ctx.render();
}
