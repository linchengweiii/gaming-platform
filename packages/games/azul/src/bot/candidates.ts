import { AZUL_FLOOR_CAPACITY } from "../config.ts";
import type {
  AzulAction,
  AzulPlayerState,
  AzulState,
  AzulTileColor,
} from "../types.ts";

/**
 * Pure deterministic intra-round draft step (never touches `bag` or `rngState`, 100% fair public info).
 */
export function stepIntraRoundDraftPure(
  state: AzulState,
  action: AzulAction
): { state: AzulState; roundEnded: boolean } {
  const actorIdx = state.activePlayerIndex;
  const actor = state.players[actorIdx]!;
  let pickedCount = 0;
  let nextFactories = state.factories;
  let nextCenter = state.centerPool;
  let tookMarker = false;
  let nextCenterHasMarker = state.centerHasFirstPlayerMarker;
  let nextRoundStarter = state.nextRoundStartPlayerIndex;

  if (action.source.kind === "factory") {
    const fIdx = action.source.factoryIndex;
    const f = state.factories[fIdx]!;
    const leftovers: AzulTileColor[] = [];
    for (const c of f) {
      if (c === action.color) pickedCount++;
      else leftovers.push(c);
    }
    nextFactories = state.factories.map((fac, i) => (i === fIdx ? [] : fac));
    nextCenter =
      leftovers.length > 0
        ? [...state.centerPool, ...leftovers]
        : state.centerPool;
  } else {
    const leftovers: AzulTileColor[] = [];
    for (const c of state.centerPool) {
      if (c === action.color) pickedCount++;
      else leftovers.push(c);
    }
    nextCenter = leftovers;
    if (state.centerHasFirstPlayerMarker) {
      tookMarker = true;
      nextCenterHasMarker = false;
      nextRoundStarter = actorIdx;
    }
  }

  let updatedPlayer: AzulPlayerState;
  if (action.targetLine === "floor") {
    const nextFloor = [...actor.floorLine];
    if (tookMarker && nextFloor.length < AZUL_FLOOR_CAPACITY) {
      nextFloor.push("first_player");
    }
    for (
      let i = 0;
      i < pickedCount && nextFloor.length < AZUL_FLOOR_CAPACITY;
      i++
    ) {
      nextFloor.push(action.color);
    }
    updatedPlayer = { ...actor, floorLine: nextFloor };
  } else {
    const r = action.targetLine;
    const line = actor.patternLines[r]!;
    const placed = Math.min(line.capacity - line.count, pickedCount);
    const overflow = pickedCount - placed;
    const nextFloor = [...actor.floorLine];
    if (tookMarker && nextFloor.length < AZUL_FLOOR_CAPACITY) {
      nextFloor.push("first_player");
    }
    for (
      let i = 0;
      i < overflow && nextFloor.length < AZUL_FLOOR_CAPACITY;
      i++
    ) {
      nextFloor.push(action.color);
    }
    const nextLines = actor.patternLines.map((l, idx) =>
      idx === r
        ? { capacity: l.capacity, color: action.color, count: l.count + placed }
        : l
    ) as AzulPlayerState["patternLines"];
    updatedPlayer = { ...actor, patternLines: nextLines, floorLine: nextFloor };
  }

  const nextPlayers = state.players.map((p, idx) =>
    idx === actorIdx ? updatedPlayer : p
  );
  let roundEnded = nextCenter.length === 0;
  if (roundEnded) {
    for (const f of nextFactories) {
      if (f.length > 0) {
        roundEnded = false;
        break;
      }
    }
  }

  return {
    state: {
      ...state,
      players: nextPlayers,
      factories: nextFactories,
      centerPool: nextCenter,
      centerHasFirstPlayerMarker: nextCenterHasMarker,
      nextRoundStartPlayerIndex: nextRoundStarter,
      activePlayerIndex: (actorIdx + 1) % state.players.length,
    },
    roundEnded,
  };
}

export function dedupeFactoryActions(
  state: AzulState,
  actions: readonly AzulAction[]
): AzulAction[] {
  const result: AzulAction[] = [];
  const seenFactorySig: Record<string, true> = {};
  for (const act of actions) {
    if (act.source.kind === "factory") {
      const fTiles = [...state.factories[act.source.factoryIndex]!]
        .sort()
        .join(",");
      const sig = `${fTiles}|${act.color}|${act.targetLine}`;
      if (seenFactorySig[sig]) continue;
      seenFactorySig[sig] = true;
    }
    result.push(act);
  }
  return result;
}
