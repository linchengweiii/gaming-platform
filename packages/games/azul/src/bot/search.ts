import { AZUL_BOT_TUNING } from "../config.ts";
import { getAzulLegalActions } from "../rules.ts";
import type { AzulAction, AzulState } from "../types.ts";
import {
  computeRelativeUtility,
  evaluateIntraRoundBoardVector,
} from "./board-eval.ts";
import { dedupeFactoryActions, stepIntraRoundDraftPure } from "./candidates.ts";
import { evaluateDraftAction } from "./evaluate.ts";
import {
  canPlayerTriggerRowEndThisRound,
  computePublicTileTracker,
} from "./tracker.ts";

export function chooseMasterAzulAction(
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

  const dedupedLegal = dedupeFactoryActions(state, legal);

  // 2P: Zero-Sum Alpha-Beta Negamax (solves exact round end when <= 16 tiles remain)
  if (nPlayers === 2) {
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
      if (acts.length === 0 || depth <= 0) {
        const vec = evaluateIntraRoundBoardVector(curState, tracker);
        return vec[meIdx]! - vec[1 - meIdx]!;
      }

      const uniq = dedupeFactoryActions(curState, acts)
        .map((a) => ({
          act: a,
          h: evaluateDraftAction(
            curState,
            actor,
            a,
            "master",
            tracker,
            oppThreatensEndgame
          ),
        }))
        .sort((a, b) => b.h - a.h);
      const limit = Math.min(uniq.length, innerBeam);

      if (actorIdx === meIdx) {
        let best = -Infinity;
        let curAlpha = alpha;
        for (let i = 0; i < limit; i++) {
          const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
          const val = stepped.roundEnded
            ? (() => {
                const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
                return v[meIdx]! - v[1 - meIdx]!;
              })()
            : searchAB(stepped.state, depth - 1, curAlpha, beta);
          if (val > best) best = val;
          if (best > curAlpha) curAlpha = best;
          if (curAlpha >= beta) break;
        }
        return best;
      } else {
        let best = Infinity;
        let curBeta = beta;
        for (let i = 0; i < limit; i++) {
          const stepped = stepIntraRoundDraftPure(curState, uniq[i]!.act);
          const val = stepped.roundEnded
            ? (() => {
                const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
                return v[meIdx]! - v[1 - meIdx]!;
              })()
            : searchAB(stepped.state, depth - 1, alpha, curBeta);
          if (val < best) best = val;
          if (best < curBeta) curBeta = best;
          if (alpha >= curBeta) break;
        }
        return best;
      }
    };

    const rootOrdered = dedupedLegal
      .map((act) => ({
        act,
        h: evaluateDraftAction(
          state,
          me,
          act,
          "master",
          tracker,
          oppThreatensEndgame
        ),
      }))
      .sort((a, b) => b.h - a.h)
      .slice(0, rootBeam);

    let bestAct = rootOrdered[0]!.act;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    for (const cand of rootOrdered) {
      const stepped = stepIntraRoundDraftPure(state, cand.act);
      const val = stepped.roundEnded
        ? (() => {
            const v = evaluateIntraRoundBoardVector(stepped.state, tracker);
            return v[meIdx]! - v[1 - meIdx]!;
          })()
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

    const uniq = dedupeFactoryActions(curState, acts)
      .map((a) => ({
        act: a,
        h: evaluateDraftAction(
          curState,
          actor,
          a,
          "master",
          tracker,
          oppThreatensEndgame
        ),
      }))
      .sort((a, b) => b.h - a.h);

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

  const rootOrdered = dedupedLegal
    .map((act) => ({
      act,
      h: evaluateDraftAction(
        state,
        me,
        act,
        "master",
        tracker,
        oppThreatensEndgame
      ),
    }))
    .sort((a, b) => b.h - a.h)
    .slice(0, rootBeam);

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
