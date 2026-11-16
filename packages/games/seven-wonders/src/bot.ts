import { getWonderBoardDefinition } from "./cards.ts";
import {
  canPlayerBuildViaChain,
  canPlayerUseOlympiaFreeBuild,
  computeAffordablePaymentsPure,
  computeOptimalScienceScorePure,
  computeSevenWondersScoreBreakdown,
  getLeftNeighborIndex,
  getNeighborTradableProfile,
  getOwnResourceProfile,
  getPlayerShields,
  getPlayerTradeRates,
  getRightNeighborIndex,
  getSevenWondersLegalActions,
  getSevenWondersPlayerView,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "./rules.ts";
import {
  MANUFACTURED_GOODS,
  type NeighborPayment,
  RAW_RESOURCES,
  type ScienceMap,
  type SevenWondersAction,
  type SevenWondersCard,
  type SevenWondersPlayerState,
  type SevenWondersState,
  type WonderResource,
} from "./types.ts";

const ALL_RESOURCES: readonly WonderResource[] = [
  "wood",
  "stone",
  "clay",
  "ore",
  "glass",
  "loom",
  "papyrus",
];

function emptyResRecord(): Record<WonderResource, number> {
  return {
    wood: 0,
    stone: 0,
    clay: 0,
    ore: 0,
    glass: 0,
    loom: 0,
    papyrus: 0,
  };
}

interface WheelIntel {
  readonly circulatingShieldCards: number;
  readonly returningCardNames: Readonly<Record<string, true>>;
}

function getWheelIntelForPlayer(
  fairView: SevenWondersState,
  pIdx: number
): WheelIntel {
  const me = fairView.players[pIdx]!;
  const seenHands = me.seenHandsThisAge ?? [];
  if (seenHands.length <= 1) {
    return {
      circulatingShieldCards: Math.max(0, 6 - fairView.draftRound),
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
    const willReturn = hIdx + n < 6 && hIdx + n >= fairView.draftRound;
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

function computeOpponentContenderWeight(
  fairView: SevenWondersState,
  myIdx: number,
  oppIdx: number
): number {
  const n = fairView.players.length;
  const baseZeroSum = 1 / Math.max(2, n - 1);
  if (fairView.age === 1 && fairView.draftRound <= 4) {
    return baseZeroSum;
  }

  const oppScores = fairView.players
    .map((p, idx) => ({
      idx,
      est:
        p.scoreBreakdown.totalVp +
        p.builtWonderStages * 0.8 +
        p.tableau.filter((c) => c.color === "brown" || c.color === "gray")
          .length *
          (fairView.age < 3 ? 1.1 : 0.1),
    }))
    .filter((x) => x.idx !== myIdx)
    .sort((a, b) => b.est - a.est);

  const maxEst = oppScores[0]?.est ?? 0;
  const rank = oppScores.findIndex((x) => x.idx === oppIdx);
  const thisEst = oppScores[rank]?.est ?? 0;
  const gapToLeader = maxEst - thisEst;

  if (n === 3) {
    return rank === 0 ? (gapToLeader >= 4 ? 0.68 : 0.56) : 0.44;
  }
  if (rank === 0 && fairView.age === 3) {
    return Math.min(0.58, baseZeroSum * 2.1);
  }
  if (gapToLeader <= 3) {
    return Math.min(0.45, baseZeroSum * 1.45);
  }
  if (gapToLeader >= 9) {
    return baseZeroSum * 0.4;
  }
  return baseZeroSum * 0.8;
}

function evaluateMasterMilitarySwing(
  fairView: SevenWondersState,
  myIdx: number,
  oppIdx: number,
  addedShields: number,
  circulatingShields: number
): number {
  if (addedShields <= 0) return 0;
  const me = fairView.players[myIdx]!;
  const opp = fairView.players[oppIdx]!;
  const myNow = getPlayerShields(me);
  const myAfter = myNow + addedShields;
  const oppNow = getPlayerShields(opp);

  const age = fairView.age;
  const winVal = age === 1 ? 1 : age === 2 ? 3 : 5;
  const myOutcome = (m: number, o: number) =>
    m > o ? winVal : m < o ? -1 : 0;
  const oppOutcome = (m: number, o: number) =>
    o > m ? winVal : o < m ? -1 : 0;

  const oppWeight = computeOpponentContenderWeight(fairView, myIdx, oppIdx);
  const tableDenialScale =
    fairView.players.length === 3
      ? 0.9
      : fairView.players.length === 4
        ? 0.65
        : fairView.players.length === 5
          ? 0.45
          : 0.28;

  const meHasStrategists = me.tableau.some(
    (c) => c.name === "Strategists Guild"
  );
  const myDirectDelta =
    myOutcome(myAfter, oppNow) -
    myOutcome(myNow, oppNow) +
    (meHasStrategists && myNow <= oppNow && myAfter > oppNow ? 1 : 0);

  const oppDirectDelta =
    oppOutcome(myAfter, oppNow) - oppOutcome(myNow, oppNow);

  const combinedImmediateSwing =
    myDirectDelta - oppWeight * tableDenialScale * oppDirectDelta;

  const roundsLeft = Math.max(0, 6 - fairView.draftRound);
  if (myNow >= oppNow + (roundsLeft >= 3 ? 3 : 2)) {
    return age < 3 ? 0.16 : 0.02;
  }

  const certainty =
    roundsLeft === 0 || circulatingShields === 0
      ? 1.0
      : 0.58 + 0.42 * (fairView.draftRound / 6);
  const wheelRisk = roundsLeft >= 2 && circulatingShields >= 2 ? 0.88 : 1.0;

  const cushion =
    myNow === oppNow + 1 && roundsLeft >= 1 && circulatingShields > 0
      ? (winVal + 1) * 0.22
      : myAfter < oppNow && oppNow - myAfter <= 2 && age < 3
        ? addedShields * 0.48
        : 0;

  const multiAgePersistence = age === 1 ? 1.62 : age === 2 ? 1.32 : 1.0;
  return (
    combinedImmediateSwing * multiAgePersistence * certainty * wheelRisk +
    cushion
  );
}

function getMasterResourceProfileWithNeighbors(
  fairView: SevenWondersState,
  pIdx: number
) {
  const me = fairView.players[pIdx]!;
  const own = getOwnResourceProfile(me);
  const left =
    fairView.players[getLeftNeighborIndex(pIdx, fairView.players.length)]!;
  const right =
    fairView.players[getRightNeighborIndex(pIdx, fairView.players.length)]!;
  const leftTrad = getNeighborTradableProfile(left);
  const rightTrad = getNeighborTradableProfile(right);
  const rates = getPlayerTradeRates(me);

  // Cliff-free `1 / opts.length` expected share per wildcard option
  const ownEff: Record<WonderResource, number> = { ...own.fixed };
  for (const opts of own.choices) {
    const share = 1 / opts.length;
    for (const r of opts) ownEff[r] += share;
  }
  const totalOwnResourceUnits =
    ALL_RESOURCES.reduce((s, r) => s + own.fixed[r], 0) + own.choices.length;

  const cheapNeighborSupply = emptyResRecord();
  const anyNeighborSupply = emptyResRecord();

  for (const r of ALL_RESOURCES) {
    const isRaw = (RAW_RESOURCES as readonly string[]).includes(r);
    const lRate = isRaw ? rates.rawLeft : rates.manufacturedLeft;
    const rRate = isRaw ? rates.rawRight : rates.manufacturedRight;
    const lAmt =
      leftTrad.fixed[r] +
      leftTrad.choices.filter((c) => c.includes(r)).length * 0.5;
    const rAmt =
      rightTrad.fixed[r] +
      rightTrad.choices.filter((c) => c.includes(r)).length * 0.5;
    anyNeighborSupply[r] = lAmt + rAmt;
    if (lRate === 1) cheapNeighborSupply[r] += lAmt;
    if (rRate === 1) cheapNeighborSupply[r] += rAmt;
  }

  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  const wonderNeed = emptyResRecord();
  board.stages.slice(me.builtWonderStages).forEach((st, offset) => {
    const mult = offset === 0 ? 1.08 : offset === 1 ? 0.52 : 0.22;
    for (const r of ALL_RESOURCES) {
      const req = st.resourceCost[r] ?? 0;
      if (req > ownEff[r]) {
        wonderNeed[r] += (req - ownEff[r]) * mult;
      }
    }
  });

  const neighborWonderDemand = emptyResRecord();
  for (const nb of [left, right]) {
    const nbOwn = getOwnResourceProfile(nb);
    const nbBoard = getWonderBoardDefinition(nb.wonderId, nb.wonderSide);
    nbBoard.stages.slice(nb.builtWonderStages).forEach((st, idx) => {
      for (const r of ALL_RESOURCES) {
        const req = st.resourceCost[r] ?? 0;
        if (req > nbOwn.fixed[r]) {
          neighborWonderDemand[r] += idx === 0 ? 0.45 : 0.25;
        }
      }
    });
  }

  return {
    ownEff,
    totalOwnResourceUnits,
    cheapNeighborSupply,
    anyNeighborSupply,
    wonderNeed,
    neighborWonderDemand,
  };
}

function evaluateMasterScienceBonus(
  fairView: SevenWondersState,
  pIdx: number,
  beforeScore: ReturnType<typeof computeSevenWondersScoreBreakdown>,
  afterScore: ReturnType<typeof computeSevenWondersScoreBreakdown>
): number {
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

  const babylonBoost = hasFutureWonderSciWildcard ? 0.85 : 0;

  if (fairView.age === 1) {
    return (distinctAfter > distinctBefore ? 1.85 : 1.45) + babylonBoost;
  }
  if (fairView.age === 2) {
    if (distinctAfter === 3 && distinctBefore === 2) return 1.65 + babylonBoost;
    if (distinctAfter === 2 && distinctBefore === 1) {
      return 1.75 + babylonBoost;
    }
    return (totalAfter >= 3 ? 1.05 : 0.6) + babylonBoost * 0.7;
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
      return (futureDelta - currentDelta) * 0.55;
    }
  }
  return distinctAfter === 2 && totalAfter >= 3 && fairView.draftRound <= 3
    ? 0.5
    : 0;
}

function evaluateMasterCardUtility(
  fairView: SevenWondersState,
  pIdx: number,
  card: SevenWondersCard,
  wheel?: WheelIntel
): { readonly nonCoinUtility: number; readonly immediateCoinsGained: number } {
  const players = fairView.players;
  const me = players[pIdx]!;
  if (hasDuplicateCardName(me, card.name)) {
    return { nonCoinUtility: -999, immediateCoinsGained: 0 };
  }

  const leftIdx = getLeftNeighborIndex(pIdx, players.length);
  const rightIdx = getRightNeighborIndex(pIdx, players.length);
  const left = players[leftIdx]!;
  const right = players[rightIdx]!;

  const immediateCoinsGained = card.effects.reduce<number>((sum, ef) => {
    if (ef.kind === "coins") return sum + ef.coins;
    if (ef.kind === "per_card_reward" && ef.coinsPerMatch > 0) {
      const selfM = ef.includeSelf
        ? me.tableau.filter((c) => ef.targetColors.includes(c.color)).length +
          (ef.targetColors.includes(card.color) ? 1 : 0)
        : 0;
      const nbM = ef.includeNeighbors
        ? left.tableau.filter((c) => ef.targetColors.includes(c.color)).length +
          right.tableau.filter((c) => ef.targetColors.includes(c.color)).length
        : 0;
      return sum + (selfM + nbM) * ef.coinsPerMatch;
    }
    if (ef.kind === "per_wonder_stage_reward" && ef.coinsPerStage > 0) {
      const st =
        (ef.includeSelf ? me.builtWonderStages : 0) +
        (ef.includeNeighbors
          ? left.builtWonderStages + right.builtWonderStages
          : 0);
      return sum + st * ef.coinsPerStage;
    }
    return sum;
  }, 0);

  const simMe: SevenWondersPlayerState = {
    ...me,
    tableau: [...me.tableau, card],
  };
  const simPlayers = players.map((p, i) => (i === pIdx ? simMe : p));
  const beforeScore = computeSevenWondersScoreBreakdown(players, pIdx);
  const afterScore = computeSevenWondersScoreBreakdown(simPlayers, pIdx);

  const nonCoinImmediateVp =
    afterScore.totalVp -
    afterScore.treasuryVp -
    (beforeScore.totalVp - beforeScore.treasuryVp);

  const resCtx = getMasterResourceProfileWithNeighbors(fairView, pIdx);

  const effectsFutureVal = card.effects.reduce<number>((acc, ef) => {
    if (ef.kind === "resources") {
      const count = ef.count ?? 1;
      const ageMult =
        fairView.age === 1
          ? 1.22
          : fairView.age === 2
            ? Math.max(0.32, 0.72 - fairView.draftRound * 0.05)
            : 0.03;

      let totalResVal = 0;
      for (let unitIdx = 0; unitIdx < count; unitIdx++) {
        const unitSum = ef.options.reduce<number>((rSum, opt) => {
          const cur = resCtx.ownEff[opt] + unitIdx;
          const cheapNb = resCtx.cheapNeighborSupply[opt];
          const anyNb = resCtx.anyNeighborSupply[opt];

          let scarcity: number;
          if (cur === 0) {
            scarcity =
              anyNb < 0.2 ? 3.45 : cheapNb >= 1.0 ? 2.15 : 3.05;
          } else if (cur <= 0.55) {
            scarcity = cheapNb >= 1.0 ? 1.75 : 2.55 - cur * 0.9;
          } else if (cur < 1.15) {
            scarcity = cheapNb >= 1.0 ? 1.05 : 1.55;
          } else if (cur < 1.95) {
            scarcity = 0.72;
          } else {
            scarcity = 0.2;
          }

          if (
            resCtx.totalOwnResourceUnits < 3 &&
            fairView.age <= 2 &&
            unitIdx === 0
          ) {
            scarcity += 0.35;
          }

          const isMfg = opt === "glass" || opt === "loom" || opt === "papyrus";
          if (isMfg) scarcity *= 1.18;

          const wNeed = Math.max(0, resCtx.wonderNeed[opt] - unitIdx);
          const wBoost = wNeed > 0 ? Math.min(2.6, wNeed * 1.65) : 0;

          const passiveExport =
            fairView.age === 1 && unitIdx === 0
              ? Math.min(0.85, resCtx.neighborWonderDemand[opt])
              : 0;

          return (
            rSum +
            (scarcity + wBoost + passiveExport) / Math.sqrt(ef.options.length)
          );
        }, 0);
        totalResVal += unitSum;
      }

      const choiceFlex = ef.options.length > 1 ? 1.45 : 0;
      return acc + (totalResVal + choiceFlex) * ageMult;
    }

    if (ef.kind === "trade_discount") {
      if (
        (ef.rawLeft || ef.rawRight) &&
        hasWonderStageEffect(me, "raw_trade_both_discount")
      ) {
        return acc + 0.35;
      }
      const ageFactor = fairView.age === 1 ? 1.12 : 0.4;
      const lBrowns =
        left.tableau.filter((c) => c.color === "brown").length +
        ((RAW_RESOURCES as readonly string[]).includes(left.startingResource)
          ? 1
          : 0);
      const rBrowns =
        right.tableau.filter((c) => c.color === "brown").length +
        ((RAW_RESOURCES as readonly string[]).includes(right.startingResource)
          ? 1
          : 0);
      const lVal = ef.rawLeft ? (1.45 + lBrowns * 0.72) * ageFactor : 0;
      const rVal = ef.rawRight ? (1.45 + rBrowns * 0.72) * ageFactor : 0;
      const mVal = ef.manufacturedBoth
        ? (() => {
            const nbGrays =
              left.tableau.filter((c) => c.color === "gray").length +
              right.tableau.filter((c) => c.color === "gray").length +
              ((MANUFACTURED_GOODS as readonly string[]).includes(
                left.startingResource
              )
                ? 1
                : 0) +
              ((MANUFACTURED_GOODS as readonly string[]).includes(
                right.startingResource
              )
                ? 1
                : 0);
            const ownGrays =
              resCtx.ownEff.glass + resCtx.ownEff.loom + resCtx.ownEff.papyrus;
            return (
              (1.45 + nbGrays * 0.8) * ageFactor * (ownGrays < 1.1 ? 1.25 : 0.6)
            );
          })()
        : 0;
      return acc + lVal + rVal + mVal;
    }

    if (ef.kind === "shields") {
      const circ =
        wheel?.circulatingShieldCards ?? Math.max(0, 6 - fairView.draftRound);
      return (
        acc +
        evaluateMasterMilitarySwing(fairView, pIdx, leftIdx, ef.shields, circ) +
        evaluateMasterMilitarySwing(fairView, pIdx, rightIdx, ef.shields, circ)
      );
    }

    if (ef.kind === "science" || ef.kind === "wildcard_science") {
      return (
        acc + evaluateMasterScienceBonus(fairView, pIdx, beforeScore, afterScore)
      );
    }

    return acc;
  }, 0);

  const chainVal =
    card.chainsTo.length > 0 && fairView.age < 3
      ? card.chainsTo.length * (fairView.age === 1 ? 0.9 : 0.72) +
        (wheel && card.chainsTo.some((t) => Boolean(wheel.returningCardNames[t]))
          ? 1.25
          : 0)
      : 0;

  const lateScalingGrowth =
    fairView.age === 3 && fairView.draftRound <= 5
      ? card.effects.reduce<number>((acc, ef) => {
          const rLeft = 6 - fairView.draftRound;
          if (ef.kind === "per_card_reward" && ef.vpPerMatch > 0) {
            if (
              ef.includeNeighbors &&
              ef.targetColors.some((c) =>
                ["blue", "red", "green", "yellow"].includes(c)
              )
            ) {
              return acc + rLeft * 0.28 * ef.vpPerMatch;
            }
          }
          if (ef.kind === "per_wonder_stage_reward" && ef.vpPerStage > 0) {
            const unbuiltMe = ef.includeSelf
              ? Math.min(
                  1,
                  getWonderBoardDefinition(me.wonderId, me.wonderSide).stages
                    .length - me.builtWonderStages
                ) * 0.45
              : 0;
            const unbuiltNb = ef.includeNeighbors ? rLeft * 0.18 : 0;
            return acc + (unbuiltMe + unbuiltNb) * ef.vpPerStage;
          }
          if (ef.kind === "per_defeat_token_vp") {
            const mySh = getPlayerShields(me);
            const lLeftSh = getPlayerShields(
              players[getLeftNeighborIndex(leftIdx, players.length)]!
            );
            const rRightSh = getPlayerShields(
              players[getRightNeighborIndex(rightIdx, players.length)]!
            );
            let expNewDefeats = 0;
            if (getPlayerShields(left) < mySh) expNewDefeats += 0.85;
            if (getPlayerShields(left) < lLeftSh) expNewDefeats += 0.8;
            if (getPlayerShields(right) < mySh) expNewDefeats += 0.85;
            if (getPlayerShields(right) < rRightSh) expNewDefeats += 0.8;
            return acc + expNewDefeats * ef.vpPerToken;
          }
          return acc;
        }, 0)
      : 0;

  let olympiaCopyLeakPenalty = 0;
  if (card.color === "purple") {
    for (const nbIdx of [leftIdx, rightIdx]) {
      const nb = players[nbIdx]!;
      if (
        nb.wonderId === "olympia" &&
        nb.wonderSide === "B" &&
        nb.builtWonderStages >= 2
      ) {
        const nbSim: SevenWondersPlayerState = {
          ...nb,
          builtWonderStages: 3,
        };
        const beforeNb = computeSevenWondersScoreBreakdown(
          players.map((p, i) => (i === nbIdx ? nbSim : p)),
          nbIdx
        ).totalVp;
        const afterNb = computeSevenWondersScoreBreakdown(
          simPlayers.map((p, i) => (i === nbIdx ? nbSim : p)),
          nbIdx
        ).totalVp;
        if (afterNb > beforeNb) {
          const w = computeOpponentContenderWeight(fairView, pIdx, nbIdx);
          const leakScale = players.length === 3 ? 0.35 : 0.08;
          olympiaCopyLeakPenalty +=
            (afterNb - beforeNb) *
            w *
            leakScale *
            (nb.builtWonderStages === 3 ? 1.0 : 0.5);
        }
      }
    }
  }

  return {
    nonCoinUtility:
      nonCoinImmediateVp +
      effectsFutureVal +
      chainVal +
      lateScalingGrowth -
      olympiaCopyLeakPenalty,
    immediateCoinsGained,
  };
}

function evaluateMasterWonderStage(
  fairView: SevenWondersState,
  pIdx: number,
  wheel?: WheelIntel
): { readonly nonCoinUtility: number; readonly immediateCoinsGained: number } {
  const me = fairView.players[pIdx]!;
  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  if (me.builtWonderStages >= board.stages.length) {
    return { nonCoinUtility: -999, immediateCoinsGained: 0 };
  }

  const st = board.stages[me.builtWonderStages]!;
  const leftIdx = getLeftNeighborIndex(pIdx, fairView.players.length);
  const rightIdx = getRightNeighborIndex(pIdx, fairView.players.length);
  const left = fairView.players[leftIdx]!;
  const right = fairView.players[rightIdx]!;

  let coinsGained = 0;
  let val = 0;

  for (const ef of st.effects) {
    if (ef.kind === "vp") {
      val += ef.points;
    } else if (ef.kind === "coins") {
      coinsGained += ef.coins;
    } else if (ef.kind === "shields") {
      const circ =
        wheel?.circulatingShieldCards ?? Math.max(0, 6 - fairView.draftRound);
      val +=
        evaluateMasterMilitarySwing(fairView, pIdx, leftIdx, ef.shields, circ) +
        evaluateMasterMilitarySwing(fairView, pIdx, rightIdx, ef.shields, circ);
    } else if (ef.kind === "wildcard_resource") {
      const isMfg = ef.options.includes("glass");
      val +=
        fairView.age === 1
          ? isMfg
            ? 5.6
            : 5.3
          : fairView.age === 2
            ? isMfg
              ? 4.1
              : 3.5
            : 0.7;
    } else if (ef.kind === "wildcard_science") {
      const before = computeSevenWondersScoreBreakdown(fairView.players, pIdx);
      const simMe: SevenWondersPlayerState = {
        ...me,
        builtWonderStages: me.builtWonderStages + 1,
      };
      const after = computeSevenWondersScoreBreakdown(
        fairView.players.map((p, i) => (i === pIdx ? simMe : p)),
        pIdx
      );
      const exactGain = after.scientificVp - before.scientificVp;
      const greenCnt = me.tableau.filter((c) => c.color === "green").length;
      val +=
        fairView.age === 3
          ? Math.max(exactGain, fairView.draftRound <= 3 ? 4.5 : exactGain)
          : Math.max(exactGain, 4.0 + Math.min(3, greenCnt) * 0.9);
    } else if (ef.kind === "play_seventh_card") {
      const ownRes = getOwnResourceProfile(me);
      const resRichness = Math.min(
        4,
        ALL_RESOURCES.reduce((s, r) => s + ownRes.fixed[r], 0) +
          ownRes.choices.length
      );
      const perAgeVal = 3.05 + resRichness * 0.25;
      const agesRemainingIncludingThis = 4 - fairView.age;
      val += agesRemainingIncludingThis * perAgeVal;
    } else if (ef.kind === "free_build_per_age") {
      const curUsable = fairView.draftRound <= 5 ? 0.85 : 0.1;
      const futAges = 3 - fairView.age;
      val += (curUsable + futAges) * 4.2;
    } else if (ef.kind === "build_from_discard") {
      const discardCount =
        fairView.hiddenDiscardCount ?? fairView.discardPile.length;
      const remainingDiscardStagesAfterThis = board.stages
        .slice(me.builtWonderStages + 1)
        .filter((s) =>
          s.effects.some((e) => e.kind === "build_from_discard")
        ).length;

      if (fairView.draftRound === 6) {
        val += fairView.age === 3 ? 8.8 : fairView.age === 2 ? 7.2 : 5.2;
      } else if (discardCount === 0) {
        val += 0.6;
      } else if (fairView.age === 3) {
        val +=
          remainingDiscardStagesAfterThis >= 1
            ? 6.4
            : fairView.draftRound >= 4
              ? 6.8
              : 4.1;
      } else if (fairView.age === 2) {
        val +=
          remainingDiscardStagesAfterThis >= 1
            ? fairView.draftRound >= 4
              ? 5.8
              : 4.4
            : 3.1;
      } else {
        val += remainingDiscardStagesAfterThis >= 2 ? 4.0 : 2.2;
      }
    } else if (ef.kind === "raw_trade_both_discount") {
      const nbBrowns =
        left.tableau.filter((c) => c.color === "brown").length +
        right.tableau.filter((c) => c.color === "brown").length +
        2;
      val +=
        fairView.age === 1
          ? 3.8 + Math.min(2.0, nbBrowns * 0.45)
          : fairView.age === 2
            ? 2.2
            : 0.3;
    } else if (ef.kind === "copy_neighbor_guild") {
      const baseVp = computeSevenWondersScoreBreakdown(
        fairView.players,
        pIdx
      ).totalVp;
      const simMe3: SevenWondersPlayerState = {
        ...me,
        builtWonderStages: me.builtWonderStages + 1,
      };
      const exactCopiedGain =
        computeSevenWondersScoreBreakdown(
          fairView.players.map((p, i) => (i === pIdx ? simMe3 : p)),
          pIdx
        ).totalVp -
        baseVp -
        st.effects.reduce((s, e) => (e.kind === "vp" ? s + e.points : s), 0);
      const rLeft = 6 - fairView.draftRound;
      val +=
        fairView.age === 3
          ? Math.max(exactCopiedGain, rLeft >= 2 ? 6.2 : rLeft === 1 ? 4.5 : 0)
          : 6.4;
    }
  }

  if (me.tableau.some((c) => c.name === "Arena")) val += 1.0;
  if (me.tableau.some((c) => c.name === "Builders Guild")) val += 1.0;

  if (me.builtWonderStages + 1 < board.stages.length) {
    const nextSt = board.stages[me.builtWonderStages + 1]!;
    if (nextSt.effects.some((e) => e.kind === "play_seventh_card")) {
      val += fairView.age === 1 ? 2.75 : fairView.age === 2 ? 2.45 : 0.8;
    } else if (nextSt.effects.some((e) => e.kind === "copy_neighbor_guild")) {
      val += fairView.age <= 2 ? 2.1 : 1.6;
    } else if (nextSt.effects.some((e) => e.kind === "free_build_per_age")) {
      val += fairView.age === 1 ? 2.4 : 1.2;
    } else if (
      nextSt.effects.some(
        (e) =>
          (e.kind === "vp" && e.points >= 7) ||
          e.kind === "wildcard_science" ||
          e.kind === "build_from_discard"
      )
    ) {
      val += 1.45;
    } else {
      val += 0.85;
    }
  }

  return { nonCoinUtility: val, immediateCoinsGained: coinsGained };
}

function concaveCoinPotential(coins: number, age: 1 | 2 | 3): number {
  if (coins <= 0) return age < 3 ? -0.28 : 0;
  const tier1 = Math.min(4, coins);
  const tier2 = Math.max(0, Math.min(8, coins) - 4);
  const tier3 = Math.max(0, coins - 8);
  if (age === 1) return tier1 * 0.45 + tier2 * 0.4 + tier3 * 0.345;
  if (age === 2) return tier1 * 0.4 + tier2 * 0.375 + tier3 * 0.34;
  return tier1 * 0.36 + tier2 * 0.345 + tier3 * 0.335;
}

function evaluateCoinFlowUtility(
  fairView: SevenWondersState,
  pIdx: number,
  coinsSpent: number,
  coinsGained: number,
  payment: NeighborPayment
): number {
  const me = fairView.players[pIdx]!;
  const netCoins = coinsGained - coinsSpent;
  const endingCoins = me.coins + netCoins;

  const isFinalTurnOfGame =
    fairView.age === 3 &&
    (fairView.phase === "SEVENTH_CARD_PLAY" ||
      (fairView.draftRound === 6 &&
        !hasWonderStageEffect(me, "play_seventh_card")));

  let ownCoinUtil: number;
  if (isFinalTurnOfGame) {
    const treasuryDelta =
      Math.floor(endingCoins / 3) - Math.floor(me.coins / 3);
    ownCoinUtil = treasuryDelta + netCoins * 0.025;
  } else if (fairView.age === 3 && fairView.draftRound === 5) {
    const treasuryDelta =
      Math.floor(endingCoins / 3) - Math.floor(me.coins / 3);
    ownCoinUtil =
      0.62 * treasuryDelta +
      0.38 *
        (concaveCoinPotential(endingCoins, 3) -
          concaveCoinPotential(me.coins, 3));
  } else {
    ownCoinUtil =
      concaveCoinPotential(endingCoins, fairView.age) -
      concaveCoinPotential(me.coins, fairView.age);
  }

  const n = fairView.players.length;
  const leftIdx = getLeftNeighborIndex(pIdx, n);
  const rightIdx = getRightNeighborIndex(pIdx, n);

  const calcFeedCost = (oppIdx: number, paid: number): number => {
    if (paid <= 0) return 0;
    const opp = fairView.players[oppIdx]!;
    const w = computeOpponentContenderWeight(fairView, pIdx, oppIdx);
    if (fairView.age === 3 && fairView.draftRound === 6) {
      const oppTreasuryJump =
        Math.floor((opp.coins + paid) / 3) - Math.floor(opp.coins / 3);
      return w * (0.72 * oppTreasuryJump + 0.28 * (paid * 0.34));
    }
    const oppCoinVal =
      fairView.age === 1 ? 0.42 : fairView.age === 2 ? 0.37 : 0.34;
    return paid * oppCoinVal * w;
  };

  return (
    ownCoinUtil -
    calcFeedCost(leftIdx, payment.leftCoins) -
    calcFeedCost(rightIdx, payment.rightCoins)
  );
}

function estimateOpponentBestUseOfCard(
  fairView: SevenWondersState,
  oppIdx: number,
  card: SevenWondersCard
): number {
  const opp = fairView.players[oppIdx]!;
  if (hasDuplicateCardName(opp, card.name)) return 1.0;

  if (canPlayerBuildViaChain(opp, card)) {
    const u = evaluateMasterCardUtility(fairView, oppIdx, card);
    return u.nonCoinUtility + u.immediateCoinsGained * 0.35;
  }

  const payments = computeAffordablePaymentsPure(
    fairView.players,
    oppIdx,
    card.resourceCost,
    card.coinCost
  );
  const canZeus = canPlayerUseOlympiaFreeBuild(opp, fairView.age);
  if (payments.length === 0 && !canZeus) return 1.1;

  const u = evaluateMasterCardUtility(fairView, oppIdx, card);
  const gross = u.nonCoinUtility + u.immediateCoinsGained * 0.35;
  if (payments.length === 0 && canZeus) {
    return Math.max(1.1, gross - 3.5);
  }
  const minCost = Math.min(
    ...payments.map((p) => card.coinCost + p.leftCoins + p.rightCoins)
  );
  return Math.max(1.1, gross - minCost * 0.36);
}

function chooseMasterSevenWondersAction(
  state: SevenWondersState,
  playerId: string,
  legal: readonly SevenWondersAction[],
  pIdx: number
): SevenWondersAction {
  const me = state.players[pIdx]!;
  const wheel = getWheelIntelForPlayer(state, pIdx);

  if (state.phase === "HALIKARNASSUS_PICK") {
    let bestAct = legal[0]!;
    let bestScore = -1e9;
    for (const act of legal) {
      if (act.type === "SKIP_DISCARD_BUILD") {
        if (-0.05 > bestScore) {
          bestScore = -0.05;
          bestAct = act;
        }
      } else if (act.type === "BUILD_FROM_DISCARD") {
        const card = state.discardPile.find((c) => c.id === act.cardId);
        if (!card) continue;
        const u = evaluateMasterCardUtility(state, pIdx, card, wheel);
        const coinBonus =
          state.age === 3 && state.draftRound === 6
            ? Math.floor((me.coins + u.immediateCoinsGained) / 3) -
              Math.floor(me.coins / 3) +
              u.immediateCoinsGained * 0.025
            : u.immediateCoinsGained * (state.age === 1 ? 0.45 : 0.37);
        const total = u.nonCoinUtility + coinBonus;
        if (total > bestScore) {
          bestScore = total;
          bestAct = act;
        }
      }
    }
    return bestAct;
  }

  // Babylon B Round 6 exact 2-card lookahead
  const board = getWonderBoardDefinition(me.wonderId, me.wonderSide);
  const nextStageGrantsSeventh =
    me.builtWonderStages < board.stages.length &&
    board.stages[me.builtWonderStages]!.effects.some(
      (e) => e.kind === "play_seventh_card"
    );
  const alreadyHasSeventh = hasWonderStageEffect(me, "play_seventh_card");

  if (
    state.phase === "AGE_DRAFT" &&
    state.draftRound === 6 &&
    me.hand.length === 2 &&
    (alreadyHasSeventh || nextStageGrantsSeventh)
  ) {
    let bestComboAct: SevenWondersAction | null = null;
    let bestComboScore = -1e9;

    for (const act1 of legal) {
      if (act1.type !== "SELECT_DRAFT_ACTION") continue;
      const unlocksSeventh =
        alreadyHasSeventh || (act1.kind === "wonder" && nextStageGrantsSeventh);
      if (!unlocksSeventh) continue;

      const card1 = me.hand.find((c) => c.id === act1.cardId)!;
      const card2 = me.hand.find((c) => c.id !== act1.cardId)!;
      const pay1 = act1.payment ?? { leftCoins: 0, rightCoins: 0 };

      const step1Eval =
        act1.kind === "build"
          ? evaluateMasterCardUtility(state, pIdx, card1, wheel)
          : act1.kind === "wonder"
            ? evaluateMasterWonderStage(state, pIdx, wheel)
            : { nonCoinUtility: 0, immediateCoinsGained: 3 };
      const viaChain1 =
        act1.kind === "build" && canPlayerBuildViaChain(me, card1);
      const spent1 =
        act1.kind === "build"
          ? viaChain1 || act1.useFreeBuild
            ? 0
            : card1.coinCost + pay1.leftCoins + pay1.rightCoins
          : act1.kind === "wonder"
            ? pay1.leftCoins + pay1.rightCoins
            : 0;

      const n = state.players.length;
      const lIdx = getLeftNeighborIndex(pIdx, n);
      const rIdx = getRightNeighborIndex(pIdx, n);
      const simPlayersStep2 = state.players.map((p, idx) => {
        if (idx === pIdx) {
          return {
            ...p,
            coins: p.coins - spent1 + step1Eval.immediateCoinsGained,
            tableau: act1.kind === "build" ? [...p.tableau, card1] : p.tableau,
            builtWonderStages:
              act1.kind === "wonder"
                ? p.builtWonderStages + 1
                : p.builtWonderStages,
            usedFreeBuildInAge: act1.useFreeBuild
              ? { ...p.usedFreeBuildInAge, [state.age]: true }
              : p.usedFreeBuildInAge,
            hand: [card2],
          };
        }
        if (idx === lIdx && pay1.leftCoins > 0) {
          return { ...p, coins: p.coins + pay1.leftCoins };
        }
        if (idx === rIdx && pay1.rightCoins > 0) {
          return { ...p, coins: p.coins + pay1.rightCoins };
        }
        return p;
      });

      const simState2: SevenWondersState = {
        ...state,
        phase: "SEVENTH_CARD_PLAY",
        seventhCardQueue: [playerId],
        players: simPlayersStep2,
      };
      const legal2 = getSevenWondersLegalActions(simState2, playerId);
      let bestStep2Score = -1e9;
      for (const act2 of legal2) {
        if (act2.type !== "SELECT_DRAFT_ACTION") continue;
        const pay2 = act2.payment ?? { leftCoins: 0, rightCoins: 0 };
        const step2Eval =
          act2.kind === "build"
            ? evaluateMasterCardUtility(simState2, pIdx, card2, wheel)
            : act2.kind === "wonder"
              ? evaluateMasterWonderStage(simState2, pIdx, wheel)
              : { nonCoinUtility: 0, immediateCoinsGained: 3 };
        const viaChain2 =
          act2.kind === "build" &&
          canPlayerBuildViaChain(simPlayersStep2[pIdx]!, card2);
        const spent2 =
          act2.kind === "build"
            ? viaChain2 || act2.useFreeBuild
              ? 0
              : card2.coinCost + pay2.leftCoins + pay2.rightCoins
            : act2.kind === "wonder"
              ? pay2.leftCoins + pay2.rightCoins
              : 0;

        const coinUtil2 = evaluateCoinFlowUtility(
          simState2,
          pIdx,
          spent2,
          step2Eval.immediateCoinsGained,
          pay2
        );
        bestStep2Score = Math.max(
          bestStep2Score,
          step2Eval.nonCoinUtility + coinUtil2
        );
      }

      const coinUtil1 = evaluateCoinFlowUtility(
        { ...state, phase: "AGE_DRAFT" },
        pIdx,
        spent1,
        step1Eval.immediateCoinsGained,
        pay1
      );
      const ownC1 = hasDuplicateCardName(me, card1.name)
        ? { nonCoinUtility: 0, immediateCoinsGained: 0 }
        : evaluateMasterCardUtility(state, pIdx, card1, wheel);
      const leak1 =
        act1.kind === "build"
          ? 0
          : Math.max(
              0,
              ownC1.nonCoinUtility + ownC1.immediateCoinsGained * 0.35
            ) * 0.08;

      const comboTotal =
        step1Eval.nonCoinUtility + coinUtil1 - leak1 + bestStep2Score;
      if (comboTotal > bestComboScore) {
        bestComboScore = comboTotal;
        bestComboAct = act1;
      }
    }

    if (bestComboAct && alreadyHasSeventh) {
      return bestComboAct;
    }
  }

  const nPlayers = state.players.length;
  const leftIdx = getLeftNeighborIndex(pIdx, nPlayers);
  const rightIdx = getRightNeighborIndex(pIdx, nPlayers);
  const nextReceiverIdx =
    state.draftRound < 6 && state.phase === "AGE_DRAFT"
      ? state.passDirection === "clockwise"
        ? rightIdx
        : leftIdx
      : -1;

  const opponentHasActiveHalikarnassus = state.players.some((p, idx) => {
    if (idx === pIdx) return false;
    const b = getWonderBoardDefinition(p.wonderId, p.wonderSide);
    return b.stages
      .slice(p.builtWonderStages)
      .some((st) => st.effects.some((e) => e.kind === "build_from_discard"));
  });

  const receiverValById: Record<string, number> = {};
  let receiverValCount = 0;
  let maxReceiverBefore = 0;
  if (nextReceiverIdx >= 0 && me.hand.length >= 2) {
    for (const c of me.hand) {
      const v = estimateOpponentBestUseOfCard(state, nextReceiverIdx, c);
      receiverValById[c.id] = v;
      receiverValCount++;
      if (v > maxReceiverBefore) maxReceiverBefore = v;
    }
  }

  const secondReceiverIdx =
    nPlayers === 3 && nextReceiverIdx >= 0 && me.hand.length >= 3
      ? 3 - pIdx - nextReceiverIdx
      : -1;
  const secondReceiverValById: Record<string, number> = {};
  if (secondReceiverIdx >= 0) {
    for (const c of me.hand) {
      secondReceiverValById[c.id] = estimateOpponentBestUseOfCard(
        state,
        secondReceiverIdx,
        c
      );
    }
  }

  const wonderEval = evaluateMasterWonderStage(state, pIdx, wheel);

  let bestAct = legal[0]!;
  let bestScore = -1e9;

  for (const act of legal) {
    if (act.type !== "SELECT_DRAFT_ACTION") continue;
    const card = me.hand.find((c) => c.id === act.cardId);
    if (!card) continue;

    const pay = act.payment ?? { leftCoins: 0, rightCoins: 0 };
    const ownCardEval = hasDuplicateCardName(me, card.name)
      ? { nonCoinUtility: 0, immediateCoinsGained: 0 }
      : evaluateMasterCardUtility(state, pIdx, card, wheel);
    const ownOpportunityLeak =
      Math.max(
        0,
        ownCardEval.nonCoinUtility + ownCardEval.immediateCoinsGained * 0.35
      ) * 0.08;

    let actionScore: number;
    if (act.kind === "build") {
      const viaChain = canPlayerBuildViaChain(me, card);
      const coinsSpent =
        viaChain || act.useFreeBuild
          ? 0
          : card.coinCost + pay.leftCoins + pay.rightCoins;
      const coinUtil = evaluateCoinFlowUtility(
        state,
        pIdx,
        coinsSpent,
        ownCardEval.immediateCoinsGained,
        pay
      );

      let zeusOpportunityCost = 0;
      if (act.useFreeBuild) {
        const roundsLeft = 6 - state.draftRound;
        const normalPays = computeAffordablePaymentsPure(
          state.players,
          pIdx,
          card.resourceCost,
          card.coinCost
        );
        const minNormalCoins =
          normalPays.length > 0
            ? Math.min(
                ...normalPays.map(
                  (p) => card.coinCost + p.leftCoins + p.rightCoins
                )
              )
            : 8;
        if (roundsLeft >= 3 && minNormalCoins <= 2) {
          zeusOpportunityCost = 3.2;
        } else {
          zeusOpportunityCost = roundsLeft * 0.52;
        }
      }

      actionScore = ownCardEval.nonCoinUtility + coinUtil - zeusOpportunityCost;
    } else if (act.kind === "wonder") {
      const coinsSpent = pay.leftCoins + pay.rightCoins;
      const coinUtil = evaluateCoinFlowUtility(
        state,
        pIdx,
        coinsSpent,
        wonderEval.immediateCoinsGained,
        pay
      );
      actionScore = wonderEval.nonCoinUtility + coinUtil - ownOpportunityLeak;
    } else {
      const coinUtil = evaluateCoinFlowUtility(state, pIdx, 0, 3, {
        leftCoins: 0,
        rightCoins: 0,
      });
      let halikarnassusFeedPenalty = 0;
      if (opponentHasActiveHalikarnassus) {
        for (let idx = 0; idx < nPlayers; idx++) {
          if (idx === pIdx) continue;
          const p = state.players[idx]!;
          const b = getWonderBoardDefinition(p.wonderId, p.wonderSide);
          const hasDiscardPower = b.stages
            .slice(p.builtWonderStages)
            .some((st) =>
              st.effects.some((e) => e.kind === "build_from_discard")
            );
          if (hasDiscardPower && !hasDuplicateCardName(p, card.name)) {
            const valForHal = evaluateMasterCardUtility(state, idx, card);
            const grossHal =
              valForHal.nonCoinUtility +
              valForHal.immediateCoinsGained * 0.35;
            if (grossHal >= 5.5) {
              const w = computeOpponentContenderWeight(state, pIdx, idx);
              halikarnassusFeedPenalty += (grossHal - 4.5) * w * 0.55;
            }
          }
        }
      }
      actionScore = coinUtil - ownOpportunityLeak - halikarnassusFeedPenalty;
    }

    let denialBonus = 0;
    if (nextReceiverIdx >= 0 && receiverValCount >= 2) {
      let maxRem = 0;
      for (const other of me.hand) {
        if (other.id !== card.id) {
          maxRem = Math.max(maxRem, receiverValById[other.id] ?? 0);
        }
      }
      const marginalDrop = Math.max(0, maxReceiverBefore - maxRem);
      if (marginalDrop > 0.6) {
        const oppW = computeOpponentContenderWeight(
          state,
          pIdx,
          nextReceiverIdx
        );
        const mult = act.kind === "discard" ? oppW * 0.65 : oppW * 0.85;
        denialBonus += marginalDrop * mult;
      }
    }

    if (secondReceiverIdx >= 0) {
      const valNext = receiverValById[card.id] ?? 0;
      const valSecond = secondReceiverValById[card.id] ?? 0;
      if (valSecond >= 8.0 && valNext < maxReceiverBefore - 1.5) {
        let maxOtherForSecond = 0;
        for (const other of me.hand) {
          if (other.id !== card.id) {
            maxOtherForSecond = Math.max(
              maxOtherForSecond,
              secondReceiverValById[other.id] ?? 0
            );
          }
        }
        const drop2 = Math.max(0, valSecond - maxOtherForSecond);
        if (drop2 > 1.0) {
          const oppW2 = computeOpponentContenderWeight(
            state,
            pIdx,
            secondReceiverIdx
          );
          denialBonus += drop2 * oppW2 * 0.45;
        }
      }
    }

    const total = actionScore + denialBonus;
    if (total > bestScore) {
      bestScore = total;
      bestAct = act;
    }
  }

  return bestAct;
}

/**
 * Casual & intermediate policies for `normal` and `smart` tiers.
 */
function evaluateCasualNormalCardUtility(
  state: SevenWondersState,
  player: SevenWondersPlayerState,
  card: SevenWondersCard
): number {
  if (hasDuplicateCardName(player, card.name)) return -999;

  return card.effects.reduce<number>((sum, ef) => {
    if (ef.kind === "vp") return sum + ef.points;
    if (ef.kind === "coins") return sum + ef.coins * 0.34;
    if (ef.kind === "shields") {
      return (
        sum +
        ef.shields * (state.age === 1 ? 1.5 : state.age === 2 ? 2.1 : 2.6)
      );
    }
    if (ef.kind === "resources") {
      const ageMult = state.age === 1 ? 2.4 : state.age === 2 ? 1.3 : 0.1;
      return sum + (ef.count ?? 1) * ageMult;
    }
    if (ef.kind === "trade_discount") {
      return sum + (state.age === 1 ? 2.0 : 0.8);
    }
    if (ef.kind === "science" || ef.kind === "wildcard_science") {
      const greens = player.tableau.filter((c) => c.color === "green").length;
      return sum + 1.8 + Math.min(3, greens) * 0.9;
    }
    if (ef.kind === "per_card_reward") {
      return sum + (ef.vpPerMatch > 0 ? 4.2 : 1.8);
    }
    if (ef.kind === "per_wonder_stage_reward") {
      return sum + (ef.vpPerStage > 0 ? 3.5 : 1.5);
    }
    return sum + 2.0;
  }, 0);
}

function chooseIntermediateSevenWondersAction(
  state: SevenWondersState,
  legal: readonly SevenWondersAction[],
  pIdx: number,
  tier: "normal" | "smart"
): SevenWondersAction {
  const player = state.players[pIdx]!;

  if (state.phase === "HALIKARNASSUS_PICK") {
    return legal.reduce<{ bestAct: SevenWondersAction; bestScore: number }>(
      (best, act) => {
        if (act.type === "SKIP_DISCARD_BUILD") {
          return -0.1 > best.bestScore
            ? { bestAct: act, bestScore: -0.1 }
            : best;
        }
        if (act.type === "BUILD_FROM_DISCARD") {
          const card = state.discardPile.find((c) => c.id === act.cardId);
          if (!card) return best;
          const score =
            tier === "normal"
              ? evaluateCasualNormalCardUtility(state, player, card)
              : evaluateMasterCardUtility(state, pIdx, card).nonCoinUtility;
          return score > best.bestScore
            ? { bestAct: act, bestScore: score }
            : best;
        }
        return best;
      },
      { bestAct: legal[0]!, bestScore: -1e9 }
    ).bestAct;
  }

  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const wonderVal =
    player.builtWonderStages >= board.stages.length
      ? -999
      : tier === "normal"
        ? board.stages[player.builtWonderStages]!.effects.reduce<number>(
            (s, ef) => {
              if (ef.kind === "vp") return s + ef.points;
              if (ef.kind === "coins") return s + ef.coins * 0.34;
              if (ef.kind === "shields") return s + ef.shields * 1.8;
              return s + 4.2;
            },
            0.5
          )
        : evaluateMasterWonderStage(state, pIdx).nonCoinUtility * 0.88;

  return legal.reduce<{ bestAct: SevenWondersAction; bestScore: number }>(
    (best, act) => {
      if (act.type !== "SELECT_DRAFT_ACTION") return best;
      const card = player.hand.find((c) => c.id === act.cardId);
      if (!card) return best;

      const pay = act.payment ?? { leftCoins: 0, rightCoins: 0 };
      const totalNeighborCoins = pay.leftCoins + pay.rightCoins;

      const score =
        act.kind === "build"
          ? (() => {
              const baseUtil =
                tier === "normal"
                  ? evaluateCasualNormalCardUtility(state, player, card)
                  : (() => {
                      const u = evaluateMasterCardUtility(state, pIdx, card);
                      return u.nonCoinUtility + u.immediateCoinsGained * 0.36;
                    })();
              const viaChain = canPlayerBuildViaChain(player, card);
              const spent =
                viaChain || act.useFreeBuild
                  ? 0
                  : card.coinCost + totalNeighborCoins;
              const spendWeight = tier === "normal" ? 0.52 : 0.38;
              return baseUtil - spent * spendWeight - totalNeighborCoins * 0.18;
            })()
          : act.kind === "wonder"
            ? wonderVal - totalNeighborCoins * (tier === "normal" ? 0.52 : 0.4)
            : player.coins === 0 && state.age < 3
              ? 2.2
              : 1.25;

      return score > best.bestScore
        ? { bestAct: act, bestScore: score }
        : best;
    },
    { bestAct: legal[0]!, bestScore: -1e9 }
  ).bestAct;
}

export function chooseSevenWondersBotAction(
  rawState: SevenWondersState,
  playerId: string
): SevenWondersAction | null {
  const state = getSevenWondersPlayerView(rawState, playerId);
  const legal = getSevenWondersLegalActions(state, playerId);
  if (legal.length === 0) return null;

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0) return legal[0]!;
  const player = state.players[pIdx]!;
  const difficulty = player.botDifficulty ?? "smart";

  if (difficulty === "easy") {
    if (state.phase === "HALIKARNASSUS_PICK") {
      return legal[0]!;
    }
    const buildActions = legal.filter(
      (a): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" && a.kind === "build"
    );
    if (buildActions.length > 0) {
      const idx = (state.turn + pIdx) % buildActions.length;
      return buildActions[idx]!;
    }
    const wonderActions = legal.filter(
      (a): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder"
    );
    if (wonderActions.length > 0) return wonderActions[0]!;
    return legal[0]!;
  }

  if (difficulty === "master") {
    return chooseMasterSevenWondersAction(state, playerId, legal, pIdx);
  }

  return chooseIntermediateSevenWondersAction(
    state,
    legal,
    pIdx,
    difficulty === "smart" ? "smart" : "normal"
  );
}
