import {
  type VertexId,
  computeLongestSimpleEdgePath,
} from "@gaming-platform/core";
import { AWARD_THRESHOLDS } from "../config/costs-and-limits.ts";
import { IMPROVEMENT_DISCIPLINES } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";

/**
 * Computes a player's Victory Points.
 * When `visibleOnly` is true, hidden Victory Point development cards are excluded.
 */
export function computePlayerVictoryPoints(
  state: CatanState,
  playerId: string,
  visibleOnly = false
): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const buildingVp = Object.values(state.buildings).reduce<number>(
    (sum, b) =>
      b.ownerId === playerId ? sum + (b.type === "city" ? 2 : 1) : sum,
    0
  );
  const metropolisVp = state.config.enableCitiesAndKnights
    ? IMPROVEMENT_DISCIPLINES.reduce<number>(
        (sum, d) =>
          state.metropolises[d].ownerId === playerId ? sum + 2 : sum,
        0
      )
    : 0;
  const defenderVp = state.config.enableCitiesAndKnights
    ? player.defenderPoints
    : 0;
  const merchantVp =
    state.config.enableCitiesAndKnights && state.merchantOwnerId === playerId
      ? 1
      : 0;
  const publicProgressVp = state.config.enableCitiesAndKnights
    ? player.publicProgressVpCards.length
    : 0;
  const longestRoadVp = state.longestRoadOwnerId === playerId ? 2 : 0;
  const largestArmyVp =
    !state.config.enableCitiesAndKnights && state.largestArmyOwnerId === playerId
      ? 2
      : 0;
  const harbormasterVp =
    state.config.enableHarbormaster && state.harbormasterOwnerId === playerId
      ? 2
      : 0;
  const hiddenCardVp = visibleOnly
    ? 0
    : player.devCards.reduce<number>(
        (sum, card) => (card.type === "victory_point" ? sum + 1 : sum),
        0
      );

  return (
    player.bonusVictoryPoints +
    buildingVp +
    metropolisVp +
    defenderVp +
    merchantVp +
    publicProgressVp +
    longestRoadVp +
    largestArmyVp +
    harbormasterVp +
    hiddenCardVp
  );
}

function resolveHoldableAward(
  players: readonly { id: string }[],
  getScore: (p: any) => number,
  minThreshold: number,
  currentOwnerId: string | null
): { ownerId: string | null; value: number } {
  const maxVal = Math.max(0, ...players.map(getScore));
  if (maxVal < minThreshold) return { ownerId: null, value: 0 };
  const leaders = players.filter((p) => getScore(p) === maxVal);
  if (currentOwnerId && leaders.some((p) => p.id === currentOwnerId)) {
    return { ownerId: currentOwnerId, value: maxVal };
  }
  return leaders.length === 1
    ? { ownerId: leaders[0]!.id, value: maxVal }
    : { ownerId: null, value: 0 };
}

/**
 * Purely recalculates Longest Road / Longest Trade Route, Largest Army, and Harbormaster awards.
 */
export function recalculateAwardsPure(state: CatanState): CatanState {
  const harborVertexIds = Array.from(
    new Set(state.harbors.flatMap((h) => [h.vertexIds[0], h.vertexIds[1]]))
  );

  const nextPlayers = state.players.map((player) => {
    const playerEdges = Object.entries(state.edges)
      .filter(([, e]) => e.ownerId === player.id)
      .map(([eId]) => eId);

    const blockedVertices = new Set<VertexId>([
      ...Object.entries(state.buildings)
        .filter(([, b]) => b.ownerId !== player.id)
        .map(([vId]) => vId),
      ...Object.entries(state.knights)
        .filter(([, k]) => k.ownerId !== player.id)
        .map(([vId]) => vId),
    ]);

    const roadResult = computeLongestSimpleEdgePath(
      state.topology,
      playerEdges,
      blockedVertices,
      (prevEdgeId, nextEdgeId, sharedVertexId) => {
        const e1 = state.edges[prevEdgeId];
        const e2 = state.edges[nextEdgeId];
        if (!e1 || !e2) return false;
        if (e1.type !== e2.type) {
          // Road <-> Ship transition requires a player-owned building at sharedVertexId
          return state.buildings[sharedVertexId]?.ownerId === player.id;
        }
        return true;
      }
    );

    const harborPoints = harborVertexIds.reduce<number>((pts, vId) => {
      const b = state.buildings[vId];
      if (b && b.ownerId === player.id) {
        return pts + (b.type === "city" ? 2 : 1);
      }
      return pts;
    }, 0);

    return {
      ...player,
      longestRoadLength: roadResult.length,
      harborPoints,
    };
  });

  const nextRoadAward = resolveHoldableAward(
    nextPlayers,
    (p) => p.longestRoadLength,
    AWARD_THRESHOLDS.longestRoadMinLength,
    state.longestRoadOwnerId
  );

  // Largest Army (>= 3 knights played; disabled in Cities & Knights)
  const nextArmyAward = state.config.enableCitiesAndKnights
    ? { ownerId: null as string | null, size: 0 }
    : nextPlayers.reduce(
        (acc, player) =>
          player.knightsPlayed >= AWARD_THRESHOLDS.largestArmyMinSize &&
          player.knightsPlayed > acc.size
            ? { ownerId: player.id as string | null, size: player.knightsPlayed }
            : acc,
        { ownerId: state.largestArmyOwnerId, size: state.largestArmySize }
      );

  const nextHarborAward = state.config.enableHarbormaster
    ? resolveHoldableAward(
        nextPlayers,
        (p) => p.harborPoints,
        AWARD_THRESHOLDS.harbormasterMinPoints,
        state.harbormasterOwnerId
      )
    : {
        ownerId: state.harbormasterOwnerId,
        value: state.harbormasterPoints,
      };

  return {
    ...state,
    players: nextPlayers,
    longestRoadOwnerId: nextRoadAward.ownerId,
    longestRoadLength: nextRoadAward.value,
    largestArmyOwnerId: nextArmyAward.ownerId,
    largestArmySize: nextArmyAward.size,
    harbormasterOwnerId: nextHarborAward.ownerId,
    harbormasterPoints: nextHarborAward.value,
  };
}

/**
 * Purely checks whether `actingPlayerId` has reached the target Victory Points.
 */
export function checkAndAssignWinnerPure(
  state: CatanState,
  actingPlayerId: string
): { state: CatanState; won: boolean } {
  const awarded = recalculateAwardsPure(state);
  // Official 5–6P rule: players may only win on their own turn, never during Special Building Phase.
  if (awarded.phase === "SPECIAL_BUILDING") {
    return { state: awarded, won: false };
  }
  const vp = computePlayerVictoryPoints(awarded, actingPlayerId, false);
  if (vp >= awarded.config.targetVictoryPoints) {
    return {
      state: {
        ...awarded,
        winnerId: actingPlayerId,
        phase: "GAME_OVER",
      },
      won: true,
    };
  }
  return { state: awarded, won: false };
}
