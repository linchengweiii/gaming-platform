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

function applyBuildRouteEdgePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  edgeId: string,
  kind: "road" | "ship"
): { state: CatanState; events: GameEvent[] } {
  const isFree = currentState.phase === "ROAD_BUILDING_DEV";
  const cost = kind === "road" ? BUILDING_COSTS.road : BUILDING_COSTS.ship;
  const remainingKey = kind === "road" ? "roadsRemaining" : "shipsRemaining";
  const eventType = kind === "road" ? "ROAD_BUILT" : "SHIP_BUILT";
  const legal =
    kind === "road"
      ? getLegalRoadEdges(currentState, playerId, null)
      : getLegalShipEdges(currentState, playerId, null);

  if (isFree) {
    if (activePlayer.id !== playerId) throw new Error("Not your turn");
  } else {
    assertCanBuildInCurrentPhase(currentState, playerId);
    if (!hasResources(player.resources, cost)) {
      throw new Error(`Insufficient resources for ${kind}`);
    }
  }
  if (!legal.includes(edgeId)) {
    throw new Error(`Illegal ${kind} edge ${edgeId}`);
  }

  const builtState: CatanState = {
    ...currentState,
    ...(isFree
      ? { freeRoadsRemaining: currentState.freeRoadsRemaining - 1 }
      : { bank: addResourcesPure(currentState.bank, cost) }),
    edges: {
      ...currentState.edges,
      [edgeId]: { ownerId: playerId, type: kind, builtOnTurn: currentState.turn },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      ...(isFree ? {} : { resources: subtractResourcesPure(p.resources, cost) }),
      [remainingKey]: p[remainingKey] - 1,
    })),
  };

  const fogRevealed = revealAdjacentFogHexesPure(
    builtState,
    edgeId,
    playerId,
    []
  );
  const message = isFree
    ? `${player.name} built a free ${kind} (Road Building).`
    : `${player.name} built a ${kind}.`;
  const logged = appendCatanEvent(
    fogRevealed.state,
    fogRevealed.emitted,
    eventType,
    message,
    playerId,
    { edgeId }
  );

  let nextState = logged.state;
  if (isFree) {
    const moreMoves =
      getLegalRoadEdges(nextState, playerId, null).length +
      getLegalShipEdges(nextState, playerId, null).length;
    if (nextState.freeRoadsRemaining <= 0 || moreMoves === 0) {
      nextState = { ...nextState, freeRoadsRemaining: 0, phase: "MAIN_PHASE" };
    }
  }
  const checked = checkAndAssignWinnerPure(nextState, playerId);
  return { state: checked.state, events: logged.emitted };
}

export const applyBuildRoadPure = (
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_ROAD" }>
): { state: CatanState; events: GameEvent[] } =>
  applyBuildRouteEdgePure(
    currentState,
    player,
    activePlayer,
    playerId,
    action.edgeId,
    "road"
  );

export const applyBuildShipPure = (
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_SHIP" }>
): { state: CatanState; events: GameEvent[] } =>
  applyBuildRouteEdgePure(
    currentState,
    player,
    activePlayer,
    playerId,
    action.edgeId,
    "ship"
  );

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
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  const isLegal = getLegalMoveShipActions(currentState, playerId).some(
    (m) => m.fromEdgeId === action.fromEdgeId && m.toEdgeId === action.toEdgeId
  );
  if (!isLegal) {
    throw new Error(
      `Illegal ship move from ${action.fromEdgeId} to ${action.toEdgeId}`
    );
  }

  const movedState: CatanState = {
    ...currentState,
    edges: {
      ...omitRecordKey(currentState.edges, action.fromEdgeId),
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
