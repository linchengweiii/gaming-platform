import { GEM_COLORS } from "../config.ts";
import { totalTokens } from "../rules.ts";
import type { SplendorPlayerState, SplendorState } from "../types.ts";
import {
  computeBonusColorDemand,
  estimateTurnsToAfford,
  getUnlockedNoblePoints,
} from "./helpers.ts";

export function playerStillActsIfFinalRoundTriggeredNow(
  state: SplendorState,
  oppIndex: number
): boolean {
  if (state.phase === "GAME_OVER") return false;
  const n = state.players.length;
  const startIdx = state.startingPlayerIndex ?? 0;
  if (!state.finalRoundTriggered) {
    return true;
  }
  let cur = state.activePlayerIndex;
  for (let steps = 0; steps < n; steps++) {
    if (cur === oppIndex) return true;
    const next = (cur + 1) % n;
    if (next === startIdx) break;
    cur = next;
  }
  return false;
}

function countOpponentWinningThreats(
  state: SplendorState,
  opp: SplendorPlayerState,
  oppIdx: number
): { immediateWins: number; oneTurnWins: number } {
  if (!playerStillActsIfFinalRoundTriggeredNow(state, oppIdx)) {
    return { immediateWins: 0, oneTurnWins: 0 };
  }
  const targetPts = state.config.targetPoints;
  const scoreToBeat = state.finalRoundTriggered
    ? Math.max(targetPts, ...state.players.map((p) => p.points))
    : targetPts;

  let immediateWins = 0;
  let oneTurnWins = 0;

  const cards = [
    ...opp.reservedCards,
    ...state.market[3],
    ...state.market[2],
    ...state.market[1],
  ];
  for (const c of cards) {
    if (c.redacted) {
      const bonusSum = GEM_COLORS.reduce((s, col) => s + opp.bonuses[col], 0);
      if (
        c.tier === 3 &&
        opp.points + 4 >= scoreToBeat &&
        bonusSum + totalTokens(opp.tokens) >= 10
      ) {
        oneTurnWins += 1;
      }
      continue;
    }
    const noblePts = getUnlockedNoblePoints(state, opp, c.bonus);
    if (opp.points + c.points + noblePts < scoreToBeat) continue;
    const { minTurns, starved } = estimateTurnsToAfford(state, opp, c);
    if (minTurns === 0) immediateWins++;
    else if (minTurns === 1 && !starved) oneTurnWins++;
  }

  return { immediateWins, oneTurnWins };
}

function evaluateSinglePlayerBoardStrength(
  state: SplendorState,
  p: SplendorPlayerState
): number {
  const nPlayers = state.players.length;
  const targetPts = state.config.targetPoints;
  const maxOppPts = Math.max(
    0,
    ...state.players.filter((o) => o.id !== p.id).map((o) => o.points)
  );
  const inSprint = p.points >= 8 || maxOppPts >= 10;

  const pointsVal = p.points * (inSprint ? 14.4 : 10.6);

  const colorDemand = computeBonusColorDemand(state, p);
  const bonusCount = GEM_COLORS.reduce((s, c) => s + p.bonuses[c], 0);
  const perBonusWeight = inSprint ? 1.85 : bonusCount < 5 ? 3.6 : 3.15;
  let bonusVal = 0;
  for (const c of GEM_COLORS) {
    const b = Math.min(5, p.bonuses[c]);
    const synergyMult = 0.88 + Math.min(0.42, (colorDemand[c] - 1.0) * 0.14);
    bonusVal += b * perBonusWeight * synergyMult;
  }
  bonusVal -= Math.max(0, bonusCount - 10) * 0.5;

  let nobleVal = 0;
  for (const noble of state.nobles) {
    const miss = GEM_COLORS.reduce(
      (m, c) => m + Math.max(0, (noble.requirements[c] ?? 0) - p.bonuses[c]),
      0
    );
    if (miss === 0) nobleVal += 27;
    else if (miss === 1) nobleVal += 10.5;
    else if (miss === 2) nobleVal += 4.4;
    else if (miss === 3) nobleVal += 1.9;
    else if (miss === 4) nobleVal += 0.85;
    else if (miss === 5) nobleVal += 0.35;
  }

  const coloredTokens = GEM_COLORS.reduce((s, c) => s + p.tokens[c], 0);
  const tokenVal = coloredTokens * 1.22 + p.tokens.gold * 2.18;

  const targets = [
    ...p.reservedCards.filter((c) => !c.redacted),
    ...state.market[3],
    ...state.market[2],
    ...state.market[1].filter((c) => c.points > 0 || bonusCount < 6),
  ];

  let best1 = 0;
  let best2 = 0;
  for (const card of targets) {
    const isReserved = p.reservedCards.some((r) => r.id === card.id);
    const { minTurns, netMissing, starved } = estimateTurnsToAfford(
      state,
      p,
      card
    );
    const noblePts = getUnlockedNoblePoints(state, p, card.bonus);
    const winsIfBought = p.points + card.points + noblePts >= targetPts;
    const rawWorth = winsIfBought
      ? 49
      : (card.points + noblePts) * (nPlayers >= 3 ? 4.55 : 4.35) +
        (card.points === 0 ? (inSprint ? 0.45 : 1.55) : 0);

    const effDist = Math.max(netMissing, minTurns * 1.55);
    const reachFactor =
      minTurns === 0
        ? 0.65
        : effDist <= 2.2
          ? 0.44
          : effDist <= 3.5
            ? 0.27
            : effDist <= 5.2
              ? 0.12
              : 0.03;
    const starveMult = starved ? 0.28 : 1.0;
    const resMult = isReserved ? (nPlayers >= 3 ? 1.18 : 1.1) : 1.0;
    const pot = rawWorth * reachFactor * starveMult * resMult;
    if (pot > best1) {
      best2 = best1;
      best1 = pot;
    } else if (pot > best2) {
      best2 = pot;
    }
  }

  let blindReserveVal = 0;
  for (const rc of p.reservedCards) {
    if (rc.redacted) {
      blindReserveVal += rc.tier === 3 ? 3.4 : rc.tier === 2 ? 2.2 : 1.0;
    }
  }

  const cardTiebreakTerm =
    -p.purchasedCards.length * 0.14 -
    p.reservedCards.length * (nPlayers >= 3 ? 0.55 : 0.95);

  return (
    pointsVal +
    bonusVal +
    nobleVal +
    tokenVal +
    best1 +
    best2 * 0.18 +
    blindReserveVal +
    cardTiebreakTerm
  );
}

export function evaluateMasterPublicState(
  state: SplendorState,
  meId: string
): number {
  const me = state.players.find((p) => p.id === meId)!;
  if (state.phase === "GAME_OVER") {
    if (state.winnerId === meId) {
      return 12000 + me.points * 25 - me.purchasedCards.length;
    }
    const maxOpp = Math.max(
      0,
      ...state.players.filter((p) => p.id !== meId).map((p) => p.points)
    );
    return -12000 + (me.points - maxOpp) * 25;
  }

  const myStrength = evaluateSinglePlayerBoardStrength(state, me);

  let starvationBonus = 0;
  if (state.players.length <= 3) {
    for (const opp of state.players) {
      if (opp.id === meId) continue;
      for (const rc of opp.reservedCards) {
        if (rc.redacted || rc.points < 2) continue;
        for (const c of GEM_COLORS) {
          const oppNeed = Math.max(0, rc.cost[c] - opp.bonuses[c]);
          const oppMiss = Math.max(0, oppNeed - opp.tokens[c]);
          if (oppMiss > state.bank[c] && me.tokens[c] > 0) {
            starvationBonus +=
              state.players.length === 2
                ? 2.4 * Math.min(2, me.tokens[c])
                : 1.1;
          }
        }
      }
    }
  }

  const myIdx = state.players.findIndex((p) => p.id === meId);
  const nPlayers = state.players.length;
  const oppScores: number[] = [];
  state.players.forEach((opp, idx) => {
    if (opp.id === meId) return;
    const base = evaluateSinglePlayerBoardStrength(state, opp);
    const threats = countOpponentWinningThreats(state, opp, idx);
    const isNextOpp = myIdx >= 0 && (myIdx + 1) % nPlayers === idx;
    const threatPen =
      nPlayers === 2
        ? (threats.immediateWins > 0 ? 520 + threats.immediateWins * 40 : 0) +
          (threats.oneTurnWins > 0 ? 55 * Math.min(2, threats.oneTurnWins) : 0)
        : isNextOpp && threats.immediateWins > 0
          ? 480 + threats.immediateWins * 30
          : threats.immediateWins >= 2
            ? 260
            : 0;
    oppScores.push(base + threatPen);
  });

  if (oppScores.length === 0) return myStrength;
  const maxOpp = Math.max(...oppScores);
  const avgOpp = oppScores.reduce((a, b) => a + b, 0) / oppScores.length;
  const maxOppRawPts = Math.max(
    0,
    ...state.players.filter((p) => p.id !== meId).map((p) => p.points)
  );
  const leaderWeight =
    nPlayers === 2 ? 1.0 : maxOppRawPts >= 12 ? 0.85 : 0.52;

  return (
    myStrength +
    starvationBonus -
    (maxOpp * leaderWeight + avgOpp * (1 - leaderWeight)) *
      (nPlayers === 2 ? 1.0 : 0.78)
  );
}
