import {
  SEVEN_WONDERS_MASTER_BOT_WEIGHTS,
  SEVEN_WONDERS_NORMAL_BOT_WEIGHTS,
} from "../config/bot-config.ts";
import { SEVEN_WONDERS_TURNS_PER_AGE } from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  computeSevenWondersScoreBreakdown,
  getLeftNeighborIndex,
  getPlayerShields,
  getRightNeighborIndex,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "../rules.ts";
import {
  MANUFACTURED_GOODS,
  RAW_RESOURCES,
  type SevenWondersCard,
  type SevenWondersPlayerState,
  type SevenWondersState,
} from "../types.ts";
import {
  computeOpponentContenderWeight,
  evaluateMasterMilitarySwing,
  getMasterResourceProfileWithNeighbors,
} from "./military-resource-eval.ts";
import {
  type WheelIntel,
  evaluateMasterScienceBonus,
} from "./science-eval.ts";

export function evaluateMasterCardUtility(
  fairView: SevenWondersState,
  pIdx: number,
  card: SevenWondersCard,
  wheel?: WheelIntel
): { readonly nonCoinUtility: number; readonly immediateCoinsGained: number } {
  const players = fairView.players;
  const me = players[pIdx]!;
  if (hasDuplicateCardName(me, card.name)) {
    return {
      nonCoinUtility: SEVEN_WONDERS_MASTER_BOT_WEIGHTS.duplicateCardPenalty,
      immediateCoinsGained: 0,
    };
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
        wheel?.circulatingShieldCards ??
        Math.max(0, SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound);
      return (
        acc +
        evaluateMasterMilitarySwing(fairView, pIdx, leftIdx, ef.shields, circ) +
        evaluateMasterMilitarySwing(fairView, pIdx, rightIdx, ef.shields, circ)
      );
    }

    if (ef.kind === "science" || ef.kind === "wildcard_science") {
      return (
        acc +
        evaluateMasterScienceBonus(
          fairView,
          pIdx,
          beforeScore,
          afterScore,
          card
        )
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
          const rLeft = SEVEN_WONDERS_TURNS_PER_AGE - fairView.draftRound;
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

/**
 * Casual policy card evaluation for `normal` tier.
 */
export function evaluateCasualNormalCardUtility(
  state: SevenWondersState,
  player: SevenWondersPlayerState,
  card: SevenWondersCard
): number {
  if (hasDuplicateCardName(player, card.name)) {
    return SEVEN_WONDERS_MASTER_BOT_WEIGHTS.duplicateCardPenalty;
  }

  const nw = SEVEN_WONDERS_NORMAL_BOT_WEIGHTS;
  return card.effects.reduce<number>((sum, ef) => {
    if (ef.kind === "vp") return sum + ef.points;
    if (ef.kind === "coins") return sum + ef.coins * nw.coinImmediateWeight;
    if (ef.kind === "shields") {
      return sum + ef.shields * nw.shieldWeightByAge[state.age];
    }
    if (ef.kind === "resources") {
      return sum + (ef.count ?? 1) * nw.resourceWeightByAge[state.age];
    }
    if (ef.kind === "trade_discount") {
      return (
        sum + (state.age === 1 ? nw.tradeDiscountAge1 : nw.tradeDiscountLater)
      );
    }
    if (ef.kind === "science" || ef.kind === "wildcard_science") {
      const greens = player.tableau.filter((c) => c.color === "green").length;
      return (
        sum +
        nw.scienceBase +
        Math.min(nw.scienceMaxGreenCap, greens) * nw.sciencePerExistingGreen
      );
    }
    if (ef.kind === "per_card_reward") {
      return sum + (ef.vpPerMatch > 0 ? nw.perCardVpBonus : nw.perCardCoinBonus);
    }
    if (ef.kind === "per_wonder_stage_reward") {
      return (
        sum +
        (ef.vpPerStage > 0
          ? nw.perWonderStageVpBonus
          : nw.perWonderStageCoinBonus)
      );
    }
    return sum + nw.fallbackEffectBonus;
  }, 0);
}
