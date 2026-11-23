import {
  type CatanState,
  TERRAIN_TO_RESOURCE,
  getLegalChaseRobberActions,
  getLegalPirateHexes,
  getLegalRobberHexes,
} from "@gaming-platform/catan";
import type { BoardSpotSelection } from "../types.ts";
import type { AppRuntimeContext } from "./context.ts";
import { patchModelAndRender } from "./dom-events.ts";

export {
  handleCatanEdgeSpotClick,
  handleCatanVertexSpotClick,
} from "./catan-spot-vertex-edge-actions.ts";

export function toggleSelectedBoardSpot(
  ctx: AppRuntimeContext,
  kind: BoardSpotSelection["kind"],
  id: string
): void {
  const cur = ctx.model.selectedBoardSpot;
  patchModelAndRender(ctx, {
    selectedBoardSpot:
      cur?.kind === kind && cur.id === id ? null : { kind, id },
  });
}

const DIRECT_POPOVER_ACTIONS: Readonly<
  Record<string, (spotId: string) => Record<string, unknown>>
> = {
  build_road: (edgeId) => ({ type: "BUILD_ROAD", edgeId }),
  build_ship: (edgeId) => ({ type: "BUILD_SHIP", edgeId }),
  setup_road: (edgeId) => ({ type: "PLACE_SETUP_EDGE", edgeId, edgeKind: "road" }),
  setup_ship: (edgeId) => ({ type: "PLACE_SETUP_EDGE", edgeId, edgeKind: "ship" }),
  setup_settlement: (vertexId) => ({ type: "PLACE_SETUP_SETTLEMENT", vertexId }),
  build_settlement: (vertexId) => ({ type: "BUILD_SETTLEMENT", vertexId }),
  build_city: (vertexId) => ({ type: "BUILD_CITY", vertexId }),
  build_wall: (vertexId) => ({ type: "BUILD_CITY_WALL", vertexId }),
  pillage_city: (vertexId) => ({ type: "SELECT_PILLAGED_CITY", vertexId }),
  build_knight: (vertexId) => ({ type: "BUILD_KNIGHT", vertexId }),
  activate_knight: (vertexId) => ({ type: "ACTIVATE_KNIGHT", vertexId }),
  promote_knight: (vertexId) => ({ type: "PROMOTE_KNIGHT", vertexId }),
  move_robber: (hexId) => ({ type: "MOVE_ROBBER", hexId }),
  move_pirate: (hexId) => ({ type: "MOVE_PIRATE", hexId }),
  play_knight: () => ({ type: "PLAY_KNIGHT" }),
};

export function handleCatanPopoverSpotAction(
  ctx: AppRuntimeContext,
  actingPlayerId: string,
  act: string,
  spotId: string,
  chaseVertexAttr: string | null,
  chaseTargetAttr: string | null
): void {
  const direct = DIRECT_POPOVER_ACTIONS[act];
  if (direct) {
    ctx.dispatch(actingPlayerId, direct(spotId));
    return;
  }

  if (act === "start_move_ship") {
    patchModelAndRender(ctx, {
      buildMode: "move_ship",
      selectedMoveFromEdgeId: spotId,
      selectedBoardSpot: null,
    });
  } else if (act === "complete_move_ship" && ctx.model.selectedMoveFromEdgeId) {
    ctx.dispatch(actingPlayerId, {
      type: "MOVE_SHIP",
      fromEdgeId: ctx.model.selectedMoveFromEdgeId,
      toEdgeId: spotId,
    });
  } else if (act === "start_move_knight") {
    patchModelAndRender(ctx, {
      buildMode: "move_knight",
      selectedMoveKnightFromVertexId: spotId,
      selectedBoardSpot: null,
    });
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
    patchModelAndRender(ctx, {
      buildMode: "chase_robber",
      selectedChaseKnightVertexId: spotId,
      selectedBoardSpot: null,
    });
  } else if (act === "complete_chase_robber") {
    const chaseVId =
      chaseVertexAttr ?? ctx.model.selectedChaseKnightVertexId ?? "";
    if (chaseVId) {
      ctx.dispatch(actingPlayerId, {
        type: "CHASE_ROBBER_WITH_KNIGHT",
        vertexId: chaseVId,
        hexId: spotId,
        targetKind: (chaseTargetAttr as "robber" | "pirate") ?? "robber",
      });
    }
  } else if (act === "open_trade") {
    patchModelAndRender(ctx, {
      selectedBoardSpot: null,
      buildMode: "domestic_trade",
    });
  }
}

export function handleCatanHexSpotClick(
  ctx: AppRuntimeContext,
  state: CatanState,
  actingPlayerId: string,
  hexId: string
): void {
  if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
    const movePirate =
      ctx.model.robberOrPirateMode === "pirate" && state.config.enableSeafarers;
    const legalHexes = movePirate
      ? getLegalPirateHexes(state, actingPlayerId)
      : getLegalRobberHexes(state, actingPlayerId);
    if (legalHexes.includes(hexId)) {
      ctx.dispatch(actingPlayerId, {
        type: movePirate ? "MOVE_PIRATE" : "MOVE_ROBBER",
        hexId,
      });
      return;
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
    const card = state.players
      .find((p) => p.id === actingPlayerId)
      ?.progressCards.find((c) => c.id === ctx.model.selectedProgressCardId);
    if (
      card?.type === "bishop" &&
      getLegalRobberHexes(state, actingPlayerId).includes(hexId)
    ) {
      ctx.dispatch(actingPlayerId, {
        type: "PLAY_PROGRESS_CARD",
        cardId: card.id,
        params: { hexId },
      });
      return;
    }
    if (card?.type === "merchant") {
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
    }
    if (card?.type === "inventor") {
      const t = state.hexes[hexId];
      const swappable = Boolean(
        t &&
          t.numberToken !== null &&
          ![2, 6, 8, 12].includes(t.numberToken) &&
          t.terrain !== "sea" &&
          t.terrain !== "fog"
      );
      if (swappable) {
        if (!ctx.model.inventorHex1) {
          patchModelAndRender(ctx, {
            inventorHex1: hexId,
            selectedBoardSpot: null,
          });
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

  toggleSelectedBoardSpot(ctx, "hex", hexId);
}
