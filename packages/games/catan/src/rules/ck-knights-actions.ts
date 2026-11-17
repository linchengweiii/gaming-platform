import type { GameEvent, VertexId } from "@gaming-platform/core";
import {
  canPromoteKnightAtVertex,
  displaceKnightAtVertexPure,
  getLegalActivateKnightVertices,
  getLegalBuildKnightVertices,
  getLegalChaseRobberActions,
  getLegalMoveKnightActions,
  returnKnightToSupplyPure,
  takeKnightFromSupplyPure,
} from "../cities-and-knights/knights.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import type { KnightLevel } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { checkAndAssignWinnerPure } from "./awards-and-vp.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  assertCanBuildInCurrentPhase,
  getPlayerResourceCount,
  hasResources,
  omitRecordKey,
  subtractResourcesPure,
  updatePlayerById,
} from "./helpers.ts";
import {
  getLegalPirateHexes,
  getLegalRobberHexes,
  resolvePostRobberOrPirateStealPure,
} from "./robber-pirate.ts";

export function applyBuildKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "BUILD_KNIGHT" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!currentState.config.enableCitiesAndKnights) {
    throw new Error("Cities & Knights is not enabled");
  }
  if (!hasResources(player.resources, BUILDING_COSTS.knight)) {
    throw new Error("Insufficient resources to recruit a Knight");
  }
  const legal = getLegalBuildKnightVertices(currentState, playerId);
  if (!legal.includes(action.vertexId)) {
    throw new Error(`Illegal knight vertex ${action.vertexId}`);
  }

  const builtState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.knight),
    knights: {
      ...currentState.knights,
      [action.vertexId]: {
        ownerId: playerId,
        level: 1,
        active: false,
        activatedThisTurn: false,
        actedThisTurn: false,
        promotedThisTurn: false,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) =>
      takeKnightFromSupplyPure(
        {
          ...p,
          resources: subtractResourcesPure(p.resources, BUILDING_COSTS.knight),
        },
        1
      )
    ),
  };

  const logged = appendCatanEvent(
    builtState,
    [],
    "KNIGHT_BUILT",
    `${player.name} recruited a Basic Knight.`,
    playerId,
    { vertexId: action.vertexId }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyPromoteKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PROMOTE_KNIGHT" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!currentState.config.enableCitiesAndKnights) {
    throw new Error("Cities & Knights is not enabled");
  }
  if (!hasResources(player.resources, BUILDING_COSTS.knight)) {
    throw new Error("Insufficient resources to promote Knight");
  }
  if (!canPromoteKnightAtVertex(currentState, player, action.vertexId, false)) {
    throw new Error(`Cannot promote Knight at ${action.vertexId}`);
  }

  const existingKnight = currentState.knights[action.vertexId]!;
  const nextLevel = (existingKnight.level + 1) as KnightLevel;
  const levelName = nextLevel === 3 ? "Mighty" : "Strong";

  const promotedState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.knight),
    knights: {
      ...currentState.knights,
      [action.vertexId]: {
        ...existingKnight,
        level: nextLevel,
        promotedThisTurn: true,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) =>
      takeKnightFromSupplyPure(
        returnKnightToSupplyPure(
          {
            ...p,
            resources: subtractResourcesPure(
              p.resources,
              BUILDING_COSTS.knight
            ),
          },
          existingKnight.level
        ),
        nextLevel
      )
    ),
  };

  const logged = appendCatanEvent(
    promotedState,
    [],
    "KNIGHT_PROMOTED",
    `${player.name} promoted a Knight to ${levelName} (Lv ${nextLevel}).`,
    playerId,
    { vertexId: action.vertexId, level: nextLevel }
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyActivateKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "ACTIVATE_KNIGHT" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (!currentState.config.enableCitiesAndKnights) {
    throw new Error("Cities & Knights is not enabled");
  }
  if (!hasResources(player.resources, BUILDING_COSTS.activateKnight)) {
    throw new Error("Insufficient grain to activate Knight");
  }
  const legal = getLegalActivateKnightVertices(currentState, playerId);
  if (!legal.includes(action.vertexId)) {
    throw new Error(`Cannot activate Knight at ${action.vertexId}`);
  }

  const existingKnight = currentState.knights[action.vertexId]!;
  const activatedState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.activateKnight),
    knights: {
      ...currentState.knights,
      [action.vertexId]: {
        ...existingKnight,
        active: true,
        activatedThisTurn: true,
      },
    },
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(
        p.resources,
        BUILDING_COSTS.activateKnight
      ),
    })),
  };

  const logged = appendCatanEvent(
    activatedState,
    [],
    "KNIGHT_ACTIVATED",
    `${player.name} activated a Level ${existingKnight.level} Knight.`,
    playerId,
    { vertexId: action.vertexId }
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyMoveKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_KNIGHT" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Can only move a Knight during your main phase");
  }
  const legalMoves = getLegalMoveKnightActions(currentState, playerId);
  const isLegal = legalMoves.some(
    (m) =>
      m.fromVertexId === action.fromVertexId &&
      m.toVertexId === action.toVertexId
  );
  if (!isLegal) {
    throw new Error(
      `Illegal Knight move from ${action.fromVertexId} to ${action.toVertexId}`
    );
  }

  const movingKnight = currentState.knights[action.fromVertexId]!;
  const stateWithoutMover: CatanState = {
    ...currentState,
    knights: omitRecordKey(currentState.knights, action.fromVertexId),
  };

  const hasDisplacedTarget = Boolean(
    stateWithoutMover.knights[action.toVertexId]
  );
  const displacement = hasDisplacedTarget
    ? displaceKnightAtVertexPure(stateWithoutMover, action.toVertexId)
    : {
        knights: stateWithoutMover.knights,
        players: stateWithoutMover.players,
        relocatedTo: null as VertexId | null,
      };

  const movedState: CatanState = {
    ...currentState,
    knights: {
      ...displacement.knights,
      [action.toVertexId]: {
        ...movingKnight,
        active: false,
        actedThisTurn: true,
      },
    },
    players: displacement.players,
  };

  const displaceNote = hasDisplacedTarget
    ? " and displaced an opposing Knight!"
    : ".";
  const logged = appendCatanEvent(
    movedState,
    [],
    "KNIGHT_MOVED",
    `${player.name} marched a Knight${displaceNote}`,
    playerId,
    {
      fromVertexId: action.fromVertexId,
      toVertexId: action.toVertexId,
      displaced: hasDisplacedTarget,
    }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyChaseRobberWithKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "CHASE_ROBBER_WITH_KNIGHT" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Can only chase the Robber during your main phase");
  }
  const targetKind = action.targetKind ?? "robber";
  const legalChases = getLegalChaseRobberActions(
    currentState,
    playerId,
    getLegalRobberHexes(currentState, playerId),
    getLegalPirateHexes(currentState)
  );
  const isLegal = legalChases.some(
    (c) =>
      c.vertexId === action.vertexId &&
      c.hexId === action.hexId &&
      c.targetKind === targetKind
  );
  if (!isLegal) {
    throw new Error("Illegal Knight chase action");
  }

  const knight = currentState.knights[action.vertexId]!;
  const hNode = currentState.topology.hexes[action.hexId]!;

  if (targetKind === "pirate") {
    const candidates = Array.from(
      new Set(
        hNode.sideEdgeIds
          .map((eId) => currentState.edges[eId])
          .filter(
            (route): route is NonNullable<typeof route> =>
              Boolean(
                route && route.type === "ship" && route.ownerId !== playerId
              )
          )
          .map((route) => currentState.players.find((p) => p.id === route.ownerId)!)
          .filter((victim) => getPlayerResourceCount(victim) > 0)
          .map((victim) => victim.id)
      )
    );
    const chasedState: CatanState = {
      ...currentState,
      pirateHexId: action.hexId,
      phaseAfterRobber: "MAIN_PHASE",
      knights: {
        ...currentState.knights,
        [action.vertexId]: {
          ...knight,
          active: false,
          actedThisTurn: true,
        },
      },
    };
    const logged = appendCatanEvent(
      chasedState,
      [],
      "PIRATE_CHASED",
      `${player.name}'s Knight drove the Pirate Fleet to (${hNode.q},${hNode.r})!`,
      playerId,
      { vertexId: action.vertexId, hexId: action.hexId }
    );
    const resolved = resolvePostRobberOrPirateStealPure(
      logged.state,
      playerId,
      candidates,
      logged.emitted
    );
    return { state: resolved.state, events: resolved.emitted };
  }

  const candidates = Array.from(
    new Set(
      hNode.cornerVertexIds
        .map((vId) => currentState.buildings[vId])
        .filter(
          (b): b is NonNullable<typeof b> =>
            Boolean(b && b.ownerId !== playerId)
        )
        .map((b) => currentState.players.find((p) => p.id === b.ownerId)!)
        .filter((victim) => getPlayerResourceCount(victim) > 0)
        .map((victim) => victim.id)
    )
  );
  const chasedState: CatanState = {
    ...currentState,
    robberHexId: action.hexId,
    phaseAfterRobber: "MAIN_PHASE",
    knights: {
      ...currentState.knights,
      [action.vertexId]: {
        ...knight,
        active: false,
        actedThisTurn: true,
      },
    },
  };
  const logged = appendCatanEvent(
    chasedState,
    [],
    "ROBBER_CHASED",
    `${player.name}'s Knight chased the Robber to (${hNode.q},${hNode.r})!`,
    playerId,
    { vertexId: action.vertexId, hexId: action.hexId }
  );
  const resolved = resolvePostRobberOrPirateStealPure(
    logged.state,
    playerId,
    candidates,
    logged.emitted
  );
  return { state: resolved.state, events: resolved.emitted };
}
