import type { GameEvent } from "@gaming-platform/core";
import { TERRAIN_TO_RESOURCE } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceMap, ResourceType } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { recalculateAwardsPure } from "./awards-and-vp.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  updatePlayerById,
} from "./helpers.ts";
import {
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
  recordIslandSettlementPure,
} from "./network.ts";

export function applyPlaceSetupSettlementPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PLACE_SETUP_SETTLEMENT" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    (currentState.phase !== "SETUP_SETTLEMENT_1" &&
      currentState.phase !== "SETUP_SETTLEMENT_2") ||
    activePlayer.id !== playerId
  ) {
    throw new Error("Not your turn to place a setup settlement");
  }
  const legal = getLegalSettlementVertices(currentState, playerId, true);
  if (!legal.includes(action.vertexId)) {
    throw new Error(`Illegal setup settlement vertex ${action.vertexId}`);
  }

  const isSetupCity =
    currentState.config.enableCitiesAndKnights &&
    currentState.phase === "SETUP_SETTLEMENT_2";

  const placedState: CatanState = {
    ...currentState,
    buildings: {
      ...currentState.buildings,
      [action.vertexId]: {
        ownerId: playerId,
        type: isSetupCity ? "city" : "settlement",
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) =>
      isSetupCity
        ? { ...p, citiesRemaining: p.citiesRemaining - 1 }
        : { ...p, settlementsRemaining: p.settlementsRemaining - 1 }
    ),
    lastSetupSettlementVertexId: action.vertexId,
  };

  const islandRecorded = recordIslandSettlementPure(
    placedState,
    action.vertexId,
    playerId,
    true,
    []
  );

  if (currentState.phase === "SETUP_SETTLEMENT_2") {
    const vNode = islandRecorded.state.topology.vertices[action.vertexId]!;
    const startingGain = vNode.adjacentHexIds.reduce<{
      bank: ResourceMap;
      gained: ResourceType[];
    }>(
      (acc, hId) => {
        const tile = islandRecorded.state.hexes[hId]!;
        const res = TERRAIN_TO_RESOURCE[tile.terrain];
        if (res && acc.bank[res] > 0) {
          return {
            bank: { ...acc.bank, [res]: acc.bank[res] - 1 },
            gained: [...acc.gained, res],
          };
        }
        return acc;
      },
      { bank: islandRecorded.state.bank, gained: [] }
    );

    const gainedDelta = startingGain.gained.reduce<Partial<ResourceMap>>(
      (acc, res) => ({ ...acc, [res]: (acc[res] ?? 0) + 1 }),
      {}
    );

    const withResources: CatanState = {
      ...islandRecorded.state,
      bank: startingGain.bank,
      players: updatePlayerById(islandRecorded.state.players, playerId, (p) => ({
        ...p,
        resources: addResourcesPure(p.resources, gainedDelta),
      })),
    };

    const buildingLabel = isSetupCity ? "starting city" : "2nd settlement";
    const logged = appendCatanEvent(
      withResources,
      islandRecorded.emitted,
      "SETUP_SETTLEMENT",
      `${player.name} placed their ${buildingLabel}${startingGain.gained.length > 0 ? ` and received starting resources (${startingGain.gained.join(", ")})` : ""}.`,
      playerId,
      { vertexId: action.vertexId, gained: startingGain.gained }
    );

    return {
      state: recalculateAwardsPure({ ...logged.state, phase: "SETUP_ROAD_2" }),
      events: logged.emitted,
    };
  }

  const logged = appendCatanEvent(
    islandRecorded.state,
    islandRecorded.emitted,
    "SETUP_SETTLEMENT",
    `${player.name} placed their 1st settlement.`,
    playerId,
    { vertexId: action.vertexId }
  );

  return {
    state: recalculateAwardsPure({ ...logged.state, phase: "SETUP_ROAD_1" }),
    events: logged.emitted,
  };
}

export function applyPlaceSetupEdgePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PLACE_SETUP_EDGE" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    (currentState.phase !== "SETUP_ROAD_1" &&
      currentState.phase !== "SETUP_ROAD_2") ||
    activePlayer.id !== playerId
  ) {
    throw new Error("Not your turn to place a setup road/ship");
  }
  const anchor = currentState.lastSetupSettlementVertexId;
  if (!anchor) {
    throw new Error("Missing setup settlement anchor");
  }

  const isShip = action.edgeKind === "ship";
  const legalEdges = isShip
    ? getLegalShipEdges(currentState, playerId, anchor)
    : getLegalRoadEdges(currentState, playerId, anchor);
  if (!legalEdges.includes(action.edgeId)) {
    throw new Error(`Illegal setup ${action.edgeKind} edge ${action.edgeId}`);
  }
  const clearedAnchor: CatanState = {
    ...currentState,
    lastSetupSettlementVertexId: null,
    edges: {
      ...currentState.edges,
      [action.edgeId]: {
        ownerId: playerId,
        type: isShip ? "ship" : "road",
        builtOnTurn: 0,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) =>
      isShip
        ? { ...p, shipsRemaining: p.shipsRemaining - 1 }
        : { ...p, roadsRemaining: p.roadsRemaining - 1 }
    ),
  };
  const logged = appendCatanEvent(
    clearedAnchor,
    [],
    "SETUP_EDGE",
    `${player.name} placed a starting ${action.edgeKind}.`,
    playerId,
    { edgeId: action.edgeId, edgeKind: action.edgeKind }
  );

  // Advance snake draft order relative to `startingPlayerIndex`
  const n = logged.state.players.length;
  const startIdx = logged.state.startingPlayerIndex ?? 0;
  const nextDraft = (() => {
    if (logged.state.phase === "SETUP_ROAD_1") {
      const nextIdx = (logged.state.activePlayerIndex + 1) % n;
      if (nextIdx !== startIdx) {
        return {
          activePlayerIndex: nextIdx,
          phase: "SETUP_SETTLEMENT_1" as const,
        };
      }
      return {
        activePlayerIndex: logged.state.activePlayerIndex,
        phase: "SETUP_SETTLEMENT_2" as const,
      };
    }

    if (logged.state.activePlayerIndex !== startIdx) {
      return {
        activePlayerIndex: (logged.state.activePlayerIndex - 1 + n) % n,
        phase: "SETUP_SETTLEMENT_2" as const,
      };
    }
    return {
      activePlayerIndex: logged.state.activePlayerIndex,
      phase: "PRE_ROLL" as const,
    };
  })();

  return {
    state: recalculateAwardsPure({
      ...logged.state,
      activePlayerIndex: nextDraft.activePlayerIndex,
      phase: nextDraft.phase,
    }),
    events: logged.emitted,
  };
}
