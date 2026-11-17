import type { GameEvent } from "@gaming-platform/core";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { checkAndAssignWinnerPure } from "./awards-and-vp.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  assertCanBuildInCurrentPhase,
  hasResources,
  omitRecordKey,
  subtractResourcesPure,
  updatePlayerById,
} from "./helpers.ts";
import {
  getLegalMoveShipActions,
  getLegalRoadEdges,
  getLegalShipEdges,
  revealAdjacentFogHexesPure,
} from "./network.ts";

export function applyBuildRoadPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_ROAD" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase === "ROAD_BUILDING_DEV") {
    if (activePlayer.id !== playerId) {
      throw new Error("Not your turn");
    }
    const legal = getLegalRoadEdges(currentState, playerId, null);
    if (!legal.includes(action.edgeId)) {
      throw new Error(`Illegal road edge ${action.edgeId}`);
    }

    const builtFree: CatanState = {
      ...currentState,
      edges: {
        ...currentState.edges,
        [action.edgeId]: {
          ownerId: playerId,
          type: "road",
          builtOnTurn: currentState.turn,
        },
      },
      players: updatePlayerById(currentState.players, playerId, (p) => ({
        ...p,
        roadsRemaining: p.roadsRemaining - 1,
      })),
      freeRoadsRemaining: currentState.freeRoadsRemaining - 1,
    };

    const fogRevealed = revealAdjacentFogHexesPure(
      builtFree,
      action.edgeId,
      playerId,
      []
    );
    const logged = appendCatanEvent(
      fogRevealed.state,
      fogRevealed.emitted,
      "ROAD_BUILT",
      `${player.name} built a free road (Road Building).`,
      playerId,
      { edgeId: action.edgeId }
    );

    const moreMoves =
      getLegalRoadEdges(logged.state, playerId, null).length +
      getLegalShipEdges(logged.state, playerId, null).length;
    const phaseAdjusted: CatanState =
      logged.state.freeRoadsRemaining <= 0 || moreMoves === 0
        ? { ...logged.state, freeRoadsRemaining: 0, phase: "MAIN_PHASE" }
        : logged.state;
    const checked = checkAndAssignWinnerPure(phaseAdjusted, playerId);
    return { state: checked.state, events: logged.emitted };
  }

  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!hasResources(player.resources, BUILDING_COSTS.road)) {
    throw new Error("Insufficient resources for road");
  }
  const legal = getLegalRoadEdges(currentState, playerId, null);
  if (!legal.includes(action.edgeId)) {
    throw new Error(`Illegal road edge ${action.edgeId}`);
  }

  const builtPaid: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.road),
    edges: {
      ...currentState.edges,
      [action.edgeId]: {
        ownerId: playerId,
        type: "road",
        builtOnTurn: currentState.turn,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, BUILDING_COSTS.road),
      roadsRemaining: p.roadsRemaining - 1,
    })),
  };

  const fogRevealed = revealAdjacentFogHexesPure(
    builtPaid,
    action.edgeId,
    playerId,
    []
  );
  const logged = appendCatanEvent(
    fogRevealed.state,
    fogRevealed.emitted,
    "ROAD_BUILT",
    `${player.name} built a road.`,
    playerId,
    { edgeId: action.edgeId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyBuildShipPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_SHIP" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase === "ROAD_BUILDING_DEV") {
    if (activePlayer.id !== playerId) {
      throw new Error("Not your turn");
    }
    const legal = getLegalShipEdges(currentState, playerId, null);
    if (!legal.includes(action.edgeId)) {
      throw new Error(`Illegal ship edge ${action.edgeId}`);
    }

    const builtFree: CatanState = {
      ...currentState,
      edges: {
        ...currentState.edges,
        [action.edgeId]: {
          ownerId: playerId,
          type: "ship",
          builtOnTurn: currentState.turn,
        },
      },
      players: updatePlayerById(currentState.players, playerId, (p) => ({
        ...p,
        shipsRemaining: p.shipsRemaining - 1,
      })),
      freeRoadsRemaining: currentState.freeRoadsRemaining - 1,
    };

    const fogRevealed = revealAdjacentFogHexesPure(
      builtFree,
      action.edgeId,
      playerId,
      []
    );
    const logged = appendCatanEvent(
      fogRevealed.state,
      fogRevealed.emitted,
      "SHIP_BUILT",
      `${player.name} built a free ship (Road Building).`,
      playerId,
      { edgeId: action.edgeId }
    );

    const moreMoves =
      getLegalRoadEdges(logged.state, playerId, null).length +
      getLegalShipEdges(logged.state, playerId, null).length;
    const phaseAdjusted: CatanState =
      logged.state.freeRoadsRemaining <= 0 || moreMoves === 0
        ? { ...logged.state, freeRoadsRemaining: 0, phase: "MAIN_PHASE" }
        : logged.state;
    const checked = checkAndAssignWinnerPure(phaseAdjusted, playerId);
    return { state: checked.state, events: logged.emitted };
  }

  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!hasResources(player.resources, BUILDING_COSTS.ship)) {
    throw new Error("Insufficient resources for ship");
  }
  const legal = getLegalShipEdges(currentState, playerId, null);
  if (!legal.includes(action.edgeId)) {
    throw new Error(`Illegal ship edge ${action.edgeId}`);
  }

  const builtPaid: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.ship),
    edges: {
      ...currentState.edges,
      [action.edgeId]: {
        ownerId: playerId,
        type: "ship",
        builtOnTurn: currentState.turn,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, BUILDING_COSTS.ship),
      shipsRemaining: p.shipsRemaining - 1,
    })),
  };

  const fogRevealed = revealAdjacentFogHexesPure(
    builtPaid,
    action.edgeId,
    playerId,
    []
  );
  const logged = appendCatanEvent(
    fogRevealed.state,
    fogRevealed.emitted,
    "SHIP_BUILT",
    `${player.name} built a ship.`,
    playerId,
    { edgeId: action.edgeId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyMoveShipPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_SHIP" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Can only move a ship during your main phase");
  }
  const legalMoves = getLegalMoveShipActions(currentState, playerId);
  const isLegal = legalMoves.some(
    (m) => m.fromEdgeId === action.fromEdgeId && m.toEdgeId === action.toEdgeId
  );
  if (!isLegal) {
    throw new Error(
      `Illegal ship move from ${action.fromEdgeId} to ${action.toEdgeId}`
    );
  }

  const withoutOldEdge = omitRecordKey(currentState.edges, action.fromEdgeId);
  const movedState: CatanState = {
    ...currentState,
    edges: {
      ...withoutOldEdge,
      [action.toEdgeId]: {
        ownerId: playerId,
        type: "ship",
        builtOnTurn: currentState.turn,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      hasMovedShipThisTurn: true,
    })),
  };

  const fogRevealed = revealAdjacentFogHexesPure(
    movedState,
    action.toEdgeId,
    playerId,
    []
  );
  const logged = appendCatanEvent(
    fogRevealed.state,
    fogRevealed.emitted,
    "SHIP_MOVED",
    `${player.name} repositioned an open ship.`,
    playerId,
    { fromEdgeId: action.fromEdgeId, toEdgeId: action.toEdgeId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}
