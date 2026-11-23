import type { BotDifficulty } from "@gaming-platform/core";
import { AZUL_BOT_TUNING, AZUL_FLOOR_CAPACITY } from "../config.ts";
import { getAzulLegalActions } from "../rules/apply.ts";
import { setPatternLineAt } from "../rules/helpers.ts";
import type {
  AzulAction,
  AzulPlayerState,
  AzulState,
  AzulTileColor,
} from "../types.ts";
import {
  computeRelativeUtility,
  evaluateIntraRoundBoardVector,
} from "./board-eval.ts";
import { evaluateDraftAction } from "./evaluate.ts";
import {
  canPlayerTriggerRowEndThisRound,
  computePublicTileTracker,
} from "./tracker.ts";

/**
 * Pure deterministic intra-round draft step (never touches `bag` or `rngState`, 100% fair public info).
 */
function stepIntraRoundDraftPure(
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
    const leftovers: AzulTileColor[] = [];
    for (const c of state.factories[fIdx]!) {
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

  let overflow = pickedCount;
  let nextLines = actor.patternLines;
  if (action.targetLine !== "floor") {
    const r = action.targetLine;
    const line = actor.patternLines[r]!;
    const placed = Math.min(line.capacity - line.count, pickedCount);
    overflow = pickedCount - placed;
    nextLines = setPatternLineAt(actor.patternLines, r, {
      capacity: line.capacity,
      color: action.color,
      count: line.count + placed,
    });
  }

  const nextFloor = [...actor.floorLine];
  if (tookMarker && nextFloor.length < AZUL_FLOOR_CAPACITY) {
    nextFloor.push("first_player");
  }
  for (let i = 0; i < overflow && nextFloor.length < AZUL_FLOOR_CAPACITY; i++) {
    nextFloor.push(action.color);
  }

  const updatedPlayer: AzulPlayerState = {
    ...actor,
    patternLines: nextLines,
    floorLine: nextFloor,
  };
  const roundEnded =
    nextCenter.length === 0 && nextFactories.every((f) => f.length === 0);

  return {
    state: {
      ...state,
      players: state.players.map((p, idx) =>
        idx === actorIdx ? updatedPlayer : p
      ),
      factories: nextFactories,
      centerPool: nextCenter,
      centerHasFirstPlayerMarker: nextCenterHasMarker,
      nextRoundStartPlayerIndex: nextRoundStarter,
      activePlayerIndex: (actorIdx + 1) % state.players.length,
    },
    roundEnded,
  };
}

function dedupeFactoryActions(
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

function chooseMasterAzulAction(
  state: AzulState,
  playerId: string,
  legal: readonly AzulAction[]
): AzulAction {
  const sc = AZUL_BOT_TUNING.masterSearch;
  const meIdx = state.players.findIndex((p) => p.id === playerId);
  const me = state.players[meIdx]!;
  const nPlayers = state.players.length;
  const tracker = computePublicTileTracker(state);

  const tilesRemaining =
    state.centerPool.length +
    state.factories.reduce((s, f) => s + f.length, 0);

  const oppThreatensEndgame = state.players.some(
    (p, idx) =>
      idx !== meIdx && canPlayerTriggerRowEndThisRound(p, tracker.inOffer)
  );

  const orderCandidates = (
    curState: AzulState,
    actor: AzulPlayerState,
    acts: readonly AzulAction[]
  ) =>
    dedupeFactoryActions(curState, acts)
      .map((act) => ({
        act,
        h: evaluateDraftAction(
          curState,
          actor,
          act,
          "master",
          tracker,
          oppThreatensEndgame
        ),
      }))
      .sort((a, b) => b.h - a.h);

  // 2P: Zero-Sum Alpha-Beta Negamax (solves exact round end when <= 16 tiles remain)
  if (nPlayers === 2) {
    const eval2P = (s: AzulState) =>
      computeRelativeUtility(evaluateIntraRoundBoardVector(s, tracker), meIdx);
    const maxDepth =
      tilesRemaining <= sc.twoPlayerEndgameTilesThreshold
        ? sc.twoPlayerEndgameDepth
        : sc.twoPlayerMidgameDepth;
    const rootBeam =
      tilesRemaining <= sc.twoPlayerEndgameTilesThreshold
        ? sc.twoPlayerEndgameRootBeam
        : sc.twoPlayerMidgameRootBeam;
    const innerBeam =
      tilesRemaining <= sc.twoPlayerInnerTightThreshold
        ? sc.twoPlayerEndgameInnerBeam
        : sc.twoPlayerMidgameInnerBeam;

    const searchAB = (
      curState: AzulState,
      depth: number,
      alpha: number,
      beta: number
    ): number => {
      const actorIdx = curState.activePlayerIndex;
      const actor = curState.players[actorIdx]!;
      const acts = getAzulLegalActions(curState, actor.id);
      if (acts.length === 0 || depth <= 0) return eval2P(curState);

      const uniq = orderCandidates(curState, actor, acts);
      const limit = Math.min(uniq.length, innerBeam);

      if (actorIdx === meIdx) {
        let best = -Infinity;
        let curAlpha = alpha;
        for (let i = 0; i < limit; i++) {
          const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
          const val = stepped.roundEnded
            ? eval2P(stepped.state)
            : searchAB(stepped.state, depth - 1, curAlpha, beta);
          if (val > best) best = val;
          if (best > curAlpha) curAlpha = best;
          if (curAlpha >= beta) break;
        }
        return best;
      }

      let best = Infinity;
      let curBeta = beta;
      for (let i = 0; i < limit; i++) {
        const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
        const val = stepped.roundEnded
          ? eval2P(stepped.state)
          : searchAB(stepped.state, depth - 1, alpha, curBeta);
        if (val < best) best = val;
        if (best < curBeta) curBeta = best;
        if (alpha >= curBeta) break;
      }
      return best;
    };

    const rootOrdered = orderCandidates(state, me, legal).slice(0, rootBeam);
    let bestAct = rootOrdered[0]!.act;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    for (const cand of rootOrdered) {
      const stepped = stepIntraRoundDraftPure(state, cand.act);
      const val = stepped.roundEnded
        ? eval2P(stepped.state)
        : searchAB(stepped.state, maxDepth - 1, alpha - 2, Infinity);
      const total = val + cand.h * 0.04;
      if (total > bestScore) {
        bestScore = total;
        bestAct = cand.act;
      }
      if (val > alpha) alpha = val;
    }
    return bestAct;
  }

  // 3P & 4P: Full-Orbit Multiplayer MaxN (every opponent acts once + me acts a 2nd time)
  const maxDepth =
    tilesRemaining <= sc.multiplayerEndgameTilesThreshold
      ? sc.multiplayerEndgameDepth
      : nPlayers + 1;
  const rootBeam =
    tilesRemaining <= sc.multiplayerEndgameTilesThreshold
      ? sc.multiplayerEndgameRootBeam
      : sc.multiplayerMidgameRootBeam;

  const searchMaxN = (curState: AzulState, depth: number): number[] => {
    const actorIdx = curState.activePlayerIndex;
    const actor = curState.players[actorIdx]!;
    const acts = getAzulLegalActions(curState, actor.id);
    if (acts.length === 0 || depth <= 0) {
      return evaluateIntraRoundBoardVector(curState, tracker);
    }

    const uniq = orderCandidates(curState, actor, acts);
    const beam =
      actorIdx === meIdx
        ? sc.multiplayerSelfBeam
        : tilesRemaining <= sc.multiplayerOppTightThreshold
          ? sc.multiplayerOppEndgameBeam
          : sc.multiplayerOppMidgameBeam;
    const limit = Math.min(uniq.length, beam);

    let bestRel = -Infinity;
    let bestVec: number[] = [];
    for (let i = 0; i < limit; i++) {
      const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
      const vec =
        stepped.roundEnded || depth === 1
          ? evaluateIntraRoundBoardVector(stepped.state, tracker)
          : searchMaxN(stepped.state, depth - 1);
      const rel = computeRelativeUtility(vec, actorIdx) + uniq[i]!.h * 0.06;
      if (rel > bestRel) {
        bestRel = rel;
        bestVec = vec;
      }
    }
    return bestVec;
  };

  const rootOrdered = orderCandidates(state, me, legal).slice(0, rootBeam);
  let bestAct = rootOrdered[0]!.act;
  let bestScore = -Infinity;
  for (const cand of rootOrdered) {
    const stepped = stepIntraRoundDraftPure(state, cand.act);
    const vec = stepped.roundEnded
      ? evaluateIntraRoundBoardVector(stepped.state, tracker)
      : searchMaxN(stepped.state, maxDepth - 1);
    const rel = computeRelativeUtility(vec, meIdx) + cand.h * 0.08;
    if (rel > bestScore) {
      bestScore = rel;
      bestAct = cand.act;
    }
  }
  return bestAct;
}

export function chooseAzulBotAction(
  rawState: AzulState,
  playerId: string
): AzulAction | null {
  // Scrub hidden draw order & PRNG state so bot search operates on 100% fair public information
  const state: AzulState = { ...rawState, bag: [], rngState: 0 };
  const legal = getAzulLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId);
  if (!player) return legal[0]!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";

  if (difficulty === "master") {
    return chooseMasterAzulAction(state, playerId, legal);
  }

  return legal.reduce<{ act: AzulAction; score: number } | null>(
    (best, act) => {
      const score = evaluateDraftAction(state, player, act, difficulty);
      return best === null || score > best.score ? { act, score } : best;
    },
    null
  )!.act;
}
