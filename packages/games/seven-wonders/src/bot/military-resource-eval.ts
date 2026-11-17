import {
  SEVEN_WONDERS_BOT_RESOURCES,
  SEVEN_WONDERS_MASTER_BOT_WEIGHTS,
} from "../config/bot-config.ts";
import {
  SEVEN_WONDERS_MILITARY_DEFEAT_POINTS,
  SEVEN_WONDERS_MILITARY_VICTORY_POINTS_BY_AGE,
  SEVEN_WONDERS_TURNS_PER_AGE,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  getLeftNeighborIndex,
  getNeighborTradableProfile,
  getOwnResourceProfile,
  getPlayerShields,
  getPlayerTradeRates,
  getRightNeighborIndex,
} from "../rules.ts";
import {
  RAW_RESOURCES,
  type SevenWondersState,
  type WonderResource,
} from "../types.ts";

export function emptyResRecord(): Record<WonderResource, number> {
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

export function computeOpponentContenderWeight(
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

export function evaluateMasterMilitarySwing(
  fairView: SevenWondersState,
  myIdx: number,
  oppIdx: number,
  addedShields: number,
  circulatingShields: number
): number {
  if (addedShields <= 0) return 0;
  const milCfg = SEVEN_WONDERS_MASTER_BOT_WEIGHTS.military;
  const me = fairView.players[myIdx]!;
  const opp = fairView.players[oppIdx]!;
  const myNow = getPlayerShields(me);
  const myAfter = myNow + addedShields;
  const oppNow = getPlayerShields(opp);

  const age = fairView.age;
  const winVal = SEVEN_WONDERS_MILITARY_VICTORY_POINTS_BY_AGE[age];
  const defeatVal = SEVEN_WONDERS_MILITARY_DEFEAT_POINTS;
  const myOutcome = (m: number, o: number) =>
    m > o ? winVal : m < o ? defeatVal : 0;
  const oppOutcome = (m: number, o: number) =>
    o > m ? winVal : o < m ? defeatVal : 0;

  const oppWeight = computeOpponentContenderWeight(fairView, myIdx, oppIdx);
  const tableDenialScale =
    fairView.players.length === 3
      ? milCfg.tableDenialByPlayers[3]
      : fairView.players.length === 4
        ? milCfg.tableDenialByPlayers[4]
        : fairView.players.length === 5
          ? milCfg.tableDenialByPlayers[5]
          : milCfg.tableDenialByPlayers.default;

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

  const roundsLeft = Math.max(
    0,
    SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound
  );
  if (myNow >= oppNow + (roundsLeft >= 3 ? 3 : 2)) {
    return age < 3 ? milCfg.overkillEarlyAgeBonus : milCfg.overkillAge3Bonus;
  }

  const certainty =
    roundsLeft === 0 || circulatingShields === 0
      ? 1.0
      : milCfg.baseCertainty +
        milCfg.roundCertaintySlope *
          (fairView.draftRound / SEVEN_WONDERS_TURNS_PER_AGE);
  const wheelRisk =
    roundsLeft >= 2 && circulatingShields >= 2
      ? milCfg.wheelRiskDiscount
      : 1.0;

  const cushion =
    myNow === oppNow + 1 && roundsLeft >= 1 && circulatingShields > 0
      ? (winVal + 1) * milCfg.oneAheadCushionFactor
      : myAfter < oppNow && oppNow - myAfter <= 2 && age < 3
        ? addedShields * milCfg.closeDeficitPerShieldBonus
        : 0;

  const multiAgePersistence = milCfg.persistenceByAge[age];
  return (
    combinedImmediateSwing * multiAgePersistence * certainty * wheelRisk +
    cushion
  );
}

export function getMasterResourceProfileWithNeighbors(
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
    SEVEN_WONDERS_BOT_RESOURCES.reduce((s, r) => s + own.fixed[r], 0) +
    own.choices.length;

  const cheapNeighborSupply = emptyResRecord();
  const anyNeighborSupply = emptyResRecord();

  for (const r of SEVEN_WONDERS_BOT_RESOURCES) {
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
    for (const r of SEVEN_WONDERS_BOT_RESOURCES) {
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
      for (const r of SEVEN_WONDERS_BOT_RESOURCES) {
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
