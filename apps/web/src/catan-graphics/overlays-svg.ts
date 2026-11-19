import {
  type CatanState,
  NUMBER_TOKEN_PIPS,
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
import type { CatanBoardSvgOptions } from "./geometry.ts";
import {
  renderEdgeRoutePiecePart,
  renderVertexBuildingAndKnightParts,
} from "./pieces-svg.ts";

export interface ClickableBoardTargets {
  readonly clickableHexes: ReadonlySet<string>;
  readonly clickableVertices: ReadonlySet<string>;
  readonly clickableEdges: ReadonlySet<string>;
  readonly setupShipSuggestedEdges: ReadonlySet<string>;
}

export function computeClickableBoardTargets(
  state: CatanState,
  actingPlayerId: string | null,
  options: CatanBoardSvgOptions
): ClickableBoardTargets {
  const clickableHexes = new Set<string>();
  const clickableVertices = new Set<string>();
  const clickableEdges = new Set<string>();
  const setupShipSuggestedEdges = new Set<string>();

  if (actingPlayerId) {
    if (
      state.phase === "SETUP_SETTLEMENT_1" ||
      state.phase === "SETUP_SETTLEMENT_2"
    ) {
      getLegalSettlementVertices(state, actingPlayerId, true).forEach((v) =>
        clickableVertices.add(v)
      );
    } else if (
      state.phase === "SETUP_ROAD_1" ||
      state.phase === "SETUP_ROAD_2"
    ) {
      const anchor = state.lastSetupSettlementVertexId;
      if (state.config.enableSeafarers) {
        const legalRoads = getLegalRoadEdges(state, actingPlayerId, anchor);
        const legalShips = getLegalShipEdges(state, actingPlayerId, anchor);
        const roadSet = new Set(legalRoads);
        legalRoads.forEach((e) => clickableEdges.add(e));
        legalShips.forEach((e) => {
          clickableEdges.add(e);
          if (options.setupEdgeKind === "ship" || !roadSet.has(e)) {
            setupShipSuggestedEdges.add(e);
          }
        });
      } else {
        getLegalRoadEdges(state, actingPlayerId, anchor).forEach((e) =>
          clickableEdges.add(e)
        );
      }
    } else if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
      if (
        options.robberOrPirateMode === "pirate" &&
        state.config.enableSeafarers
      ) {
        getLegalPirateHexes(state, actingPlayerId).forEach((h) =>
          clickableHexes.add(h)
        );
      } else {
        getLegalRobberHexes(state, actingPlayerId).forEach((h) =>
          clickableHexes.add(h)
        );
      }
    } else if (state.phase === "ROAD_BUILDING_DEV") {
      const legalRoads = getLegalRoadEdges(state, actingPlayerId, null);
      const legalShips = state.config.enableSeafarers
        ? getLegalShipEdges(state, actingPlayerId, null)
        : [];
      const roadSet = new Set(legalRoads);
      legalRoads.forEach((e) => clickableEdges.add(e));
      legalShips.forEach((e) => {
        clickableEdges.add(e);
        if (options.setupEdgeKind === "ship" || !roadSet.has(e)) {
          setupShipSuggestedEdges.add(e);
        }
      });
    } else if (
      state.phase === "MAIN_PHASE" ||
      state.phase === "SPECIAL_BUILDING"
    ) {
      if (options.buildMode === "settlement") {
        getLegalSettlementVertices(state, actingPlayerId, false).forEach((v) =>
          clickableVertices.add(v)
        );
      } else if (options.buildMode === "city") {
        for (const [vId, b] of Object.entries(state.buildings)) {
          if (b.ownerId === actingPlayerId && b.type === "settlement") {
            clickableVertices.add(vId);
          }
        }
      } else if (options.buildMode === "wall") {
        for (const [vId, b] of Object.entries(state.buildings)) {
          if (
            b.ownerId === actingPlayerId &&
            b.type === "city" &&
            !b.hasWall
          ) {
            clickableVertices.add(vId);
          }
        }
      } else if (options.buildMode === "road") {
        getLegalRoadEdges(state, actingPlayerId, null).forEach((e) =>
          clickableEdges.add(e)
        );
      } else if (options.buildMode === "ship") {
        getLegalShipEdges(state, actingPlayerId, null).forEach((e) =>
          clickableEdges.add(e)
        );
      } else if (options.buildMode === "move_ship") {
        const moves = getLegalMoveShipActions(state, actingPlayerId);
        if (!options.selectedMoveFromEdgeId) {
          moves.forEach((m) => clickableEdges.add(m.fromEdgeId));
        } else {
          moves
            .filter((m) => m.fromEdgeId === options.selectedMoveFromEdgeId)
            .forEach((m) => clickableEdges.add(m.toEdgeId));
        }
      } else if (
        state.config.enableCitiesAndKnights &&
        options.buildMode === "knight"
      ) {
        getLegalBuildKnightVertices(state, actingPlayerId).forEach((v) =>
          clickableVertices.add(v)
        );
      } else if (
        state.config.enableCitiesAndKnights &&
        options.buildMode === "promote_knight"
      ) {
        getLegalPromoteKnightVertices(state, actingPlayerId).forEach((v) =>
          clickableVertices.add(v)
        );
      } else if (
        state.config.enableCitiesAndKnights &&
        options.buildMode === "activate_knight"
      ) {
        getLegalActivateKnightVertices(state, actingPlayerId).forEach((v) =>
          clickableVertices.add(v)
        );
      } else if (
        state.config.enableCitiesAndKnights &&
        options.buildMode === "move_knight"
      ) {
        const moves = getLegalMoveKnightActions(state, actingPlayerId);
        if (!options.selectedMoveKnightFromVertexId) {
          moves.forEach((m) => clickableVertices.add(m.fromVertexId));
        } else {
          moves
            .filter(
              (m) => m.fromVertexId === options.selectedMoveKnightFromVertexId
            )
            .forEach((m) => clickableVertices.add(m.toVertexId));
        }
      } else if (
        state.config.enableCitiesAndKnights &&
        options.buildMode === "chase_robber"
      ) {
        const chases = getLegalChaseRobberActions(
          state,
          actingPlayerId,
          getLegalRobberHexes(state, actingPlayerId),
          state.config.enableSeafarers
            ? getLegalPirateHexes(state, actingPlayerId)
            : []
        );
        const distinctVertices = Array.from(
          new Set(chases.map((c) => c.vertexId))
        );
        const chosenKnightVertex =
          options.selectedChaseKnightVertexId ??
          (distinctVertices.length === 1 ? distinctVertices[0]! : null);
        if (!chosenKnightVertex) {
          distinctVertices.forEach((v) => clickableVertices.add(v));
        } else {
          chases
            .filter((c) => c.vertexId === chosenKnightVertex)
            .forEach((c) => clickableHexes.add(c.hexId));
        }
      }
    } else if (
      state.config.enableCitiesAndKnights &&
      state.phase === "BARBARIAN_PILLAGE_SELECTION"
    ) {
      getPlayerVulnerableCities(state, actingPlayerId).forEach((v) =>
        clickableVertices.add(v)
      );
    } else if (
      state.config.enableCitiesAndKnights &&
      state.phase === "CK_INTERACTION" &&
      state.pendingCkInteraction &&
      state.pendingCkInteraction.actorId === actingPlayerId
    ) {
      const pending = state.pendingCkInteraction;
      if (
        pending.kind === "displace_knight" ||
        pending.kind === "deserter_choose_knight" ||
        pending.kind === "deserter_place_knight"
      ) {
        pending.candidateVertexIds.forEach((v) => clickableVertices.add(v));
      }
    }

    if (state.config.enableCitiesAndKnights) {
      options.progressTargetHexIds?.forEach((h) => clickableHexes.add(h));
      options.progressTargetVertexIds?.forEach((v) => clickableVertices.add(v));
      options.progressTargetEdgeIds?.forEach((e) => clickableEdges.add(e));
    }
  }

  return {
    clickableHexes,
    clickableVertices,
    clickableEdges,
    setupShipSuggestedEdges,
  };
}

export function buildEdgesAndVerticesParts(
  state: CatanState,
  actingPlayerId: string | null,
  targets: ClickableBoardTargets,
  options: CatanBoardSvgOptions
): readonly string[] {
  const topo = state.topology;
  const parts: string[] = [];

  // 3. Render 3D Beveled Wooden Roads & Seafarers Caravel Ships + Clickable Edges
  for (const eId of topo.edgeOrder) {
    const eNode = topo.edges[eId]!;
    const isClickable = targets.clickableEdges.has(eId);
    const routePart = renderEdgeRoutePiecePart(state, eId, isClickable);
    if (routePart !== null) {
      parts.push(routePart);
    }

    const isSelectedEdge =
      options.selectedSpot?.kind === "edge" && options.selectedSpot.id === eId;

    if (isClickable) {
      const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
      const hitLen = Math.max(24, Number((edgeLen * 0.76).toFixed(2)));
      const isSetupShip = targets.setupShipSuggestedEdges.has(eId);
      const highlightColor = isSetupShip ? "#38bdf8" : "#fde047";
      const isOccupiedEdge = Boolean(state.edges[eId]);
      parts.push(
        isOccupiedEdge
          ? `
        <g class="clickable-target pulse-highlight" data-edge-id="${eId}" data-spot-edge="${eId}" data-setup-ship="${isSetupShip ? "1" : "0"}">
          <g transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})">
            <rect x="${(-hitLen / 2).toFixed(2)}" y="-9" width="${hitLen}" height="18" rx="8"
                  fill="rgba(253, 224, 71, 0.14)" stroke="${highlightColor}" stroke-width="2.6" />
          </g>
        </g>
      `
          : `
        <g class="clickable-target pulse-highlight" data-edge-id="${eId}" data-spot-edge="${eId}" data-setup-ship="${isSetupShip ? "1" : "0"}">
          <g transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})">
            <rect x="${(-hitLen / 2).toFixed(2)}" y="-6" width="${hitLen}" height="12" rx="5"
                  fill="${highlightColor}" opacity="0.62" stroke="#18191b" stroke-width="1.3" />
          </g>
          <circle cx="${eNode.midX}" cy="${eNode.midY}" r="8.2" fill="${highlightColor}" stroke="#18191b" stroke-width="1.8" />
          ${
            isSetupShip
              ? `<polygon points="${eNode.midX},${eNode.midY - 4.4} ${eNode.midX + 3.8},${eNode.midY + 2.8} ${eNode.midX - 3.8},${eNode.midY + 2.8}" fill="#ffffff" stroke="#0c4a6e" stroke-width="0.8" pointer-events="none" />`
              : ""
          }
        </g>
      `
      );
    } else if (
      actingPlayerId &&
      (state.phase === "MAIN_PHASE" || state.phase === "SPECIAL_BUILDING")
    ) {
      const hasLandOrShipSpot = eNode.adjacentHexIds.some((id) => {
        const t = state.hexes[id]?.terrain;
        return t && (t !== "sea" || state.config.enableSeafarers);
      });
      if (hasLandOrShipSpot) {
        const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
        const hitLen = Math.max(24, Number((edgeLen * 0.72).toFixed(2)));
        parts.push(`
          <g class="spot-hit-target ${isSelectedEdge ? "is-selected-spot" : ""}" data-spot-edge="${eId}">
            <g transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})">
              <rect x="${(-hitLen / 2).toFixed(2)}" y="-7" width="${hitLen}" height="14" rx="6"
                    fill="${isSelectedEdge ? "rgba(56, 189, 248, 0.38)" : "transparent"}"
                    stroke="${isSelectedEdge ? "#38bdf8" : "transparent"}" stroke-width="2" />
            </g>
            ${
              isSelectedEdge
                ? `<circle cx="${eNode.midX}" cy="${eNode.midY}" r="8.5" fill="#38bdf8" stroke="#18191b" stroke-width="1.8" />`
                : ""
            }
          </g>
        `);
      }
    }
  }

  // 4. Render 3D Isometric Settlements, Fortified Cities & Bastion City Walls + Clickable Vertices
  for (const vId of topo.vertexOrder) {
    const vNode = topo.vertices[vId]!;
    const isClickable = targets.clickableVertices.has(vId);

    parts.push(...renderVertexBuildingAndKnightParts(state, vId, isClickable));

    const isSelectedVertex =
      options.selectedSpot?.kind === "vertex" &&
      options.selectedSpot.id === vId;

    if (isClickable) {
      const isOccupiedVertex = Boolean(state.buildings[vId] || state.knights[vId]);
      const isSetupSettlement =
        state.phase === "SETUP_SETTLEMENT_1" ||
        state.phase === "SETUP_SETTLEMENT_2";
      const setupPips = isSetupSettlement
        ? vNode.adjacentHexIds.reduce((sum, hId) => {
            const tok = state.hexes[hId]?.numberToken;
            return sum + (tok ? NUMBER_TOKEN_PIPS[tok] ?? 0 : 0);
          }, 0)
        : 0;
      parts.push(
        isOccupiedVertex
          ? `
        <g class="clickable-target pulse-highlight" data-vertex-id="${vId}" data-spot-vertex="${vId}">
          <circle cx="${vNode.x}" cy="${vNode.y}" r="16.2" fill="rgba(253, 224, 71, 0.12)" stroke="#18191b" stroke-width="5" />
          <circle cx="${vNode.x}" cy="${vNode.y}" r="16.2" fill="transparent" stroke="#fde047" stroke-width="2.8" />
        </g>
      `
          : `
        <g class="clickable-target pulse-highlight" data-vertex-id="${vId}" data-spot-vertex="${vId}">
          <circle cx="${vNode.x}" cy="${vNode.y}" r="11.2" fill="rgba(253, 224, 71, 0.9)" stroke="#18191b" stroke-width="2.2" />
          <circle cx="${vNode.x}" cy="${vNode.y}" r="4.2" fill="#18191b" opacity="0.7" />
          ${
            setupPips >= 10
              ? `<g transform="translate(${vNode.x}, ${vNode.y + 15})" pointer-events="none">
                   <rect x="-11" y="-5.5" width="22" height="11" rx="5.5" fill="#18191b" stroke="#fbbf24" stroke-width="1" opacity="0.92" />
                   <text x="0" y="2.6" text-anchor="middle" font-family="Martian Mono, monospace" font-size="7.2" font-weight="700" fill="#fde047">${setupPips}•</text>
                 </g>`
              : ""
          }
        </g>
      `
      );
    } else if (
      actingPlayerId &&
      (state.phase === "MAIN_PHASE" || state.phase === "SPECIAL_BUILDING")
    ) {
      const touchesLand = vNode.adjacentHexIds.some(
        (id) => state.hexes[id]?.terrain !== "sea"
      );
      if (touchesLand) {
        parts.push(`
          <g class="spot-hit-target ${isSelectedVertex ? "is-selected-spot" : ""}" data-spot-vertex="${vId}">
            <circle cx="${vNode.x}" cy="${vNode.y}" r="11.5"
                    fill="${isSelectedVertex ? "rgba(56, 189, 248, 0.35)" : "transparent"}"
                    stroke="${isSelectedVertex ? "#38bdf8" : "transparent"}" stroke-width="2.2" />
          </g>
        `);
      }
    }
  }

  return parts;
}
