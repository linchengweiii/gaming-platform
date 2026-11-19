import {
  type GameEvent,
  type HexId,
  pickPure,
} from "@gaming-platform/core";
import {
  addCommoditiesPure,
  isCommodityType,
  subtractCommoditiesPure,
} from "../cities-and-knights/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  COMMODITIES,
  RESOURCES,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  computePlayerVictoryPoints,
} from "./awards-and-vp.ts";
import {
  type StateWithEvents,
  addResourcesPure,
  appendCatanEvent,
  getPlayerResourceCount,
  subtractResourcesPure,
} from "./helpers.ts";

/**
 * Returns valid land hexes where `playerId` can move the Robber.
 * Respects `enableFriendlyRobber` if configured.
 */
export function getLegalRobberHexes(state: CatanState, playerId: string): HexId[] {
  const allLandHexes = state.topology.hexOrder.filter((hId) => {
    const t = state.hexes[hId]!;
    return (
      hId !== state.robberHexId &&
      t.terrain !== "sea" &&
      t.terrain !== "fog"
    );
  });

  if (!state.config.enableFriendlyRobber) {
    return allLandHexes;
  }

  const friendlyFiltered = allLandHexes.filter((hId) => {
    const hNode = state.topology.hexes[hId]!;
    return hNode.cornerVertexIds.every((vId) => {
      const b = state.buildings[vId];
      if (!b || b.ownerId === playerId) return true;
      return computePlayerVictoryPoints(state, b.ownerId, true) > 2;
    });
  });

  return friendlyFiltered.length > 0 ? friendlyFiltered : allLandHexes;
}

/**
 * Returns valid sea hexes where `playerId` can move the Pirate Fleet (Seafarers).
 */
export function getLegalPirateHexes(
  state: CatanState,
  playerId?: string
): HexId[] {
  if (!state.config.enableSeafarers) return [];
  const allSeaHexes = state.topology.hexOrder.filter((hId) => {
    const t = state.hexes[hId]!;
    return hId !== state.pirateHexId && t.terrain === "sea";
  });
  if (!state.config.enableFriendlyRobber || !playerId) {
    return allSeaHexes;
  }
  const friendlyFiltered = allSeaHexes.filter((hId) => {
    const hNode = state.topology.hexes[hId]!;
    return hNode.sideEdgeIds.every((eId) => {
      const route = state.edges[eId];
      if (!route || route.type !== "ship" || route.ownerId === playerId) {
        return true;
      }
      return computePlayerVictoryPoints(state, route.ownerId, true) > 2;
    });
  });
  return friendlyFiltered.length > 0 ? friendlyFiltered : allSeaHexes;
}

export function stealOneRandomCardPure(
  state: CatanState,
  thiefId: string,
  victimId: string,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const thief = state.players.find((p) => p.id === thiefId)!;
  const victim = state.players.find((p) => p.id === victimId)!;
  const pool: TradeGoodType[] = [
    ...RESOURCES.flatMap((r) =>
      Array.from({ length: victim.resources[r] }, (): TradeGoodType => r)
    ),
    ...(state.config.enableCitiesAndKnights
      ? COMMODITIES.flatMap((c) =>
          Array.from({ length: victim.commodities[c] }, (): TradeGoodType => c)
        )
      : []),
  ];
  if (pool.length === 0) {
    return { state, emitted: emitted.slice() };
  }

  const [stolen, nextRngState] = pickPure(state.rngState, pool);
  const nextPlayers = state.players.map((p) => {
    if (p.id === victimId) {
      return isCommodityType(stolen)
        ? {
            ...p,
            commodities: subtractCommoditiesPure(p.commodities, {
              [stolen]: 1,
            }),
          }
        : {
            ...p,
            resources: subtractResourcesPure(p.resources, { [stolen]: 1 }),
          };
    }
    if (p.id === thiefId) {
      return isCommodityType(stolen)
        ? {
            ...p,
            commodities: addCommoditiesPure(p.commodities, { [stolen]: 1 }),
          }
        : {
            ...p,
            resources: addResourcesPure(p.resources, { [stolen]: 1 }),
          };
    }
    return p;
  });

  const updatedState: CatanState = {
    ...state,
    rngState: nextRngState,
    players: nextPlayers,
  };

  return appendCatanEvent(
    updatedState,
    emitted,
    "RESOURCE_STOLEN",
    `${thief.name} stole 1 resource card from ${victim.name}.`,
    thief.id,
    { victimId: victim.id }
  );
}

export function resolvePostRobberOrPirateStealPure(
  state: CatanState,
  thiefId: string,
  candidates: string[],
  emitted: readonly GameEvent[]
): StateWithEvents {
  if (candidates.length === 0) {
    const transitioned: CatanState = {
      ...state,
      stealCandidates: [],
      phase: state.phaseAfterRobber,
    };
    const checked = checkAndAssignWinnerPure(transitioned, thiefId);
    return { state: checked.state, emitted: emitted.slice() };
  }

  if (candidates.length === 1) {
    const stolen = stealOneRandomCardPure(state, thiefId, candidates[0]!, emitted);
    const transitioned: CatanState = {
      ...stolen.state,
      stealCandidates: [],
      phase: stolen.state.phaseAfterRobber,
    };
    const checked = checkAndAssignWinnerPure(transitioned, thiefId);
    return { state: checked.state, emitted: stolen.emitted };
  }

  return {
    state: {
      ...state,
      stealCandidates: candidates,
      phase: "STEAL_RESOURCE",
    },
    emitted: emitted.slice(),
  };
}

export function applyMoveRobberPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_ROBBER" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "MOVE_ROBBER_OR_PIRATE" ||
    activePlayer.id !== playerId
  ) {
    throw new Error("Cannot move robber right now");
  }
  const legalHexes = getLegalRobberHexes(currentState, playerId);
  if (!legalHexes.includes(action.hexId)) {
    throw new Error(`Illegal robber destination ${action.hexId}`);
  }

  const hNode = currentState.topology.hexes[action.hexId]!;
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

  const movedState: CatanState = {
    ...currentState,
    robberHexId: action.hexId,
  };
  const logged = appendCatanEvent(
    movedState,
    [],
    "ROBBER_MOVED",
    `${player.name} moved the Robber to (${hNode.q},${hNode.r}).`,
    playerId,
    { hexId: action.hexId }
  );
  const resolved = resolvePostRobberOrPirateStealPure(
    logged.state,
    playerId,
    candidates,
    logged.emitted
  );
  return { state: resolved.state, events: resolved.emitted };
}

export function applyMovePiratePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_PIRATE" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "MOVE_ROBBER_OR_PIRATE" ||
    activePlayer.id !== playerId
  ) {
    throw new Error("Cannot move pirate right now");
  }
  const legalPirate = getLegalPirateHexes(currentState, playerId);
  if (!legalPirate.includes(action.hexId)) {
    throw new Error(`Illegal pirate destination ${action.hexId}`);
  }

  const hNode = currentState.topology.hexes[action.hexId]!;
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

  const movedState: CatanState = {
    ...currentState,
    pirateHexId: action.hexId,
  };
  const logged = appendCatanEvent(
    movedState,
    [],
    "PIRATE_MOVED",
    `${player.name} sailed the Pirate Fleet to sea hex (${hNode.q},${hNode.r}).`,
    playerId,
    { hexId: action.hexId }
  );
  const resolved = resolvePostRobberOrPirateStealPure(
    logged.state,
    playerId,
    candidates,
    logged.emitted
  );
  return { state: resolved.state, events: resolved.emitted };
}

export function applyStealFromPlayerPure(
  currentState: CatanState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "STEAL_FROM_PLAYER" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "STEAL_RESOURCE" || activePlayer.id !== playerId) {
    throw new Error("Not in steal phase");
  }
  if (!currentState.stealCandidates.includes(action.victimId)) {
    throw new Error(`Cannot steal from ${action.victimId}`);
  }

  const stolen = stealOneRandomCardPure(
    currentState,
    playerId,
    action.victimId,
    []
  );
  const transitioned: CatanState = {
    ...stolen.state,
    stealCandidates: [],
    phase: stolen.state.phaseAfterRobber,
  };
  const checked = checkAndAssignWinnerPure(transitioned, playerId);
  return { state: checked.state, events: stolen.emitted };
}
