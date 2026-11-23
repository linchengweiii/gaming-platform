import type { GameEvent, HexId } from "@gaming-platform/core";
import {
  drawOneRandomHandGoodPure,
  transferGoodBetweenPlayersPure,
} from "../cities-and-knights/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  computePlayerVictoryPoints,
} from "./awards-and-vp.ts";
import {
  type StateWithEvents,
  appendCatanEvent,
  getPlayerResourceCount,
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

  // Official Friendly Robber rule: protect players at starting VP (<= 2 in Base/Seafarers, <= 3 in C&K).
  const safeVpLimit = state.config.enableCitiesAndKnights ? 3 : 2;
  const friendlyFiltered = allLandHexes.filter((hId) => {
    const hNode = state.topology.hexes[hId]!;
    return hNode.cornerVertexIds.every((vId) => {
      const b = state.buildings[vId];
      if (!b || b.ownerId === playerId) return true;
      return computePlayerVictoryPoints(state, b.ownerId, true) > safeVpLimit;
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
  const safeVpLimit = state.config.enableCitiesAndKnights ? 3 : 2;
  const friendlyFiltered = allSeaHexes.filter((hId) => {
    const hNode = state.topology.hexes[hId]!;
    return hNode.sideEdgeIds.every((eId) => {
      const route = state.edges[eId];
      if (!route || route.type !== "ship" || route.ownerId === playerId) {
        return true;
      }
      return (
        computePlayerVictoryPoints(state, route.ownerId, true) > safeVpLimit
      );
    });
  });
  return friendlyFiltered.length > 0 ? friendlyFiltered : allSeaHexes;
}

function stealOneRandomCardPure(
  state: CatanState,
  thiefId: string,
  victimId: string,
  emitted: readonly GameEvent[]
): StateWithEvents {
  const thief = state.players.find((p) => p.id === thiefId)!;
  const victim = state.players.find((p) => p.id === victimId)!;
  const [stolen, nextRngState] = drawOneRandomHandGoodPure(
    state.rngState,
    victim
  );
  if (!stolen) {
    return { state, emitted: emitted.slice() };
  }

  return appendCatanEvent(
    {
      ...state,
      rngState: nextRngState,
      players: transferGoodBetweenPlayersPure(
        state.players,
        victimId,
        thiefId,
        stolen,
        1
      ),
    },
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

export function getStealCandidatesForHexPure(
  state: CatanState,
  hexId: string,
  playerId: string,
  kind: "robber" | "pirate"
): string[] {
  const hNode = state.topology.hexes[hexId]!;
  const ownerIds =
    kind === "robber"
      ? hNode.cornerVertexIds
          .map((vId) => state.buildings[vId])
          .filter(
            (b): b is NonNullable<typeof b> =>
              Boolean(b && b.ownerId !== playerId)
          )
          .map((b) => b.ownerId)
      : hNode.sideEdgeIds
          .map((eId) => state.edges[eId])
          .filter(
            (route): route is NonNullable<typeof route> =>
              Boolean(
                route && route.type === "ship" && route.ownerId !== playerId
              )
          )
          .map((route) => route.ownerId);

  return Array.from(
    new Set(
      ownerIds
        .map((ownerId) => state.players.find((p) => p.id === ownerId)!)
        .filter((victim) => getPlayerResourceCount(victim) > 0)
        .map((victim) => victim.id)
    )
  );
}

function applyMoveRaiderPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  hexId: HexId,
  kind: "robber" | "pirate"
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "MOVE_ROBBER_OR_PIRATE" ||
    activePlayer.id !== playerId
  ) {
    throw new Error(`Cannot move ${kind} right now`);
  }
  const legalHexes =
    kind === "robber"
      ? getLegalRobberHexes(currentState, playerId)
      : getLegalPirateHexes(currentState, playerId);
  if (!legalHexes.includes(hexId)) {
    throw new Error(`Illegal ${kind} destination ${hexId}`);
  }

  const hNode = currentState.topology.hexes[hexId]!;
  const candidates = getStealCandidatesForHexPure(
    currentState,
    hexId,
    playerId,
    kind
  );
  const movedState: CatanState =
    kind === "robber"
      ? { ...currentState, robberHexId: hexId }
      : { ...currentState, pirateHexId: hexId };
  const logged = appendCatanEvent(
    movedState,
    [],
    kind === "robber" ? "ROBBER_MOVED" : "PIRATE_MOVED",
    kind === "robber"
      ? `${player.name} moved the Robber to (${hNode.q},${hNode.r}).`
      : `${player.name} sailed the Pirate Fleet to sea hex (${hNode.q},${hNode.r}).`,
    playerId,
    { hexId }
  );
  const resolved = resolvePostRobberOrPirateStealPure(
    logged.state,
    playerId,
    candidates,
    logged.emitted
  );
  return { state: resolved.state, events: resolved.emitted };
}

export function applyMoveRobberPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_ROBBER" }>
): { state: CatanState; events: GameEvent[] } {
  return applyMoveRaiderPure(
    currentState,
    player,
    activePlayer,
    playerId,
    action.hexId,
    "robber"
  );
}

export function applyMovePiratePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "MOVE_PIRATE" }>
): { state: CatanState; events: GameEvent[] } {
  return applyMoveRaiderPure(
    currentState,
    player,
    activePlayer,
    playerId,
    action.hexId,
    "pirate"
  );
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
