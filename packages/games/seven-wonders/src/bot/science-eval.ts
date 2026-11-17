import { SEVEN_WONDERS_MASTER_BOT_WEIGHTS } from "../config/bot-config.ts";
import { SEVEN_WONDERS_TURNS_PER_AGE } from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  computeOptimalScienceScorePure,
  type computeSevenWondersScoreBreakdown,
} from "../rules.ts";
import type {
  ScienceMap,
  SevenWondersCard,
  SevenWondersState,
} from "../types.ts";

export interface WheelIntel {
  readonly circulatingShieldCards: number;
  readonly returningCardNames: Readonly<Record<string, true>>;
}

export function getWheelIntelForPlayer(
  fairView: SevenWondersState,
  pIdx: number
): WheelIntel {
  const me = fairView.players[pIdx]!;
  const seenHands = me.seenHandsThisAge ?? [];
  if (seenHands.length <= 1) {
    return {
      circulatingShieldCards: Math.max(
        0,
        SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound
      ),
      returningCardNames: {},
    };
  }
  const builtNames: Record<string, number> = {};
  for (const p of fairView.players) {
    for (const c of p.tableau) {
      builtNames[c.name] = (builtNames[c.name] ?? 0) + 1;
    }
  }
  const myHandIds: Record<string, true> = {};
  for (const c of me.hand) myHandIds[c.id] = true;

  const seenCards: Record<string, SevenWondersCard> = {};
  const returning: Record<string, true> = {};
  const n = fairView.players.length;

  seenHands.forEach((h, hIdx) => {
    const willReturn =
      hIdx + n < SEVEN_WONDERS_TURNS_PER_AGE && hIdx + n >= fairView.draftRound;
    for (const c of h) {
      if (myHandIds[c.id]) continue;
      seenCards[c.id] = c;
      if (willReturn && (builtNames[c.name] ?? 0) === 0) {
        returning[c.name] = true;
      }
    }
  });

  const shieldCards = Object.values(seenCards).filter(
    (c) => c.color === "red" && (builtNames[c.name] ?? 0) === 0
  ).length;
  return { circulatingShieldCards: shieldCards, returningCardNames: returning };
}

export function evaluateMasterScienceBonus(
  fairView: SevenWondersState,
  pIdx: number,
  beforeScore: ReturnType<typeof computeSevenWondersScoreBreakdown>,
  afterScore: ReturnType<typeof computeSevenWondersScoreBreakdown>
): number {
  const sciCfg = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.science;
  const me = fairView.players[pIdx]!;
  const b = beforeScore.scienceCounts;
  const a = afterScore.scienceCounts;
  const totalBefore = b.compass + b.gear + b.tablet;
  const totalAfter = a.compass + a.gear + a.tablet;
  if (
    totalAfter <= totalBefore &&
    afterScore.scientificVp <= beforeScore.scientificVp
  ) {
    return 0;
  }

  const distinctBefore =
    (b.compass > 0 ? 1 : 0) + (b.gear > 0 ? 1 : 0) + (b.tablet > 0 ? 1 : 0);
  const distinctAfter =
    (a.compass > 0 ? 1 : 0) + (a.gear > 0 ? 1 : 0) + (a.tablet > 0 ? 1 : 0);

  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  const hasFutureWonderSciWildcard = board.stages
    .slice(me.builtWonderStages)
    .some((st) => st.effects.some((e) => e.kind === "wildcard_science"));

  const babylonBoost = hasFutureWonderSciWildcard
    ? sciCfg.babylonFutureWildcardBoost
    : 0;

  if (fairView.age === 1) {
    return (
      (distinctAfter > distinctBefore
        ? sciCfg.age1NewDistinct
        : sciCfg.age1RepeatSymbol) + babylonBoost
    );
  }
  if (fairView.age === 2) {
    if (distinctAfter === 3 && distinctBefore === 2) {
      return sciCfg.age2CompleteSet + babylonBoost;
    }
    if (distinctAfter === 2 && distinctBefore === 1) {
      return sciCfg.age2SecondDistinct + babylonBoost;
    }
    return (
      (totalAfter >= 3 ? sciCfg.age2ThreePlusTotal : sciCfg.age2Base) +
      babylonBoost * sciCfg.age2BabylonScale
    );
  }
  if (hasFutureWonderSciWildcard && fairView.draftRound <= 5) {
    const baseCounts: ScienceMap = { compass: 0, gear: 0, tablet: 0 };
    let wilds = 1;
    for (const c of me.tableau) {
      for (const ef of c.effects) {
        if (ef.kind === "science") baseCounts[ef.symbol] += 1;
        if (ef.kind === "wildcard_science") wilds += 1;
      }
    }
    const afterCounts: ScienceMap = {
      compass: baseCounts.compass + Math.max(0, a.compass - b.compass),
      gear: baseCounts.gear + Math.max(0, a.gear - b.gear),
      tablet: baseCounts.tablet + Math.max(0, a.tablet - b.tablet),
    };
    const futureDelta =
      computeOptimalScienceScorePure(afterCounts, wilds).points -
      computeOptimalScienceScorePure(baseCounts, wilds).points;
    const currentDelta = afterScore.scientificVp - beforeScore.scientificVp;
    if (futureDelta > currentDelta) {
      return (futureDelta - currentDelta) * sciCfg.age3FutureWildcardDeltaScale;
    }
  }
  return distinctAfter === 2 && totalAfter >= 3 && fairView.draftRound <= 3
    ? sciCfg.age3EarlyPairBonus
    : 0;
}
