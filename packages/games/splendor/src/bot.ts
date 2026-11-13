import type { BotDifficulty } from "@gaming-platform/core";
import {
  computeCardPurchasePayment,
  emptyGemMap,
  getSplendorLegalActions,
  totalTokens,
} from "./rules.ts";
import {
  GEM_COLORS,
  type GemColor,
  type GemMap,
  type SplendorAction,
  type SplendorCard,
  type SplendorPlayerState,
  type SplendorState,
} from "./types.ts";

export interface SplendorMasterWeights {
  basePointWeight: number;
  sprintPointWeight: number;
  nobleImmediateWeight: number;
  nobleProgressWeight: number;
  earlyDiscountWeight: number;
  midDiscountWeight: number;
  costEfficiencyPenalty: number;
  sprintZeroPointPenalty: number;
  reserveBoost: number;
  distanceExponent: number;
  singleColorBottleneckMult: number;
  draftedCountBonus: number;
  overflowPenalty: number;
  unlockOneTurnWeight: number;
  unlockTwoTurnWeight: number;
}

export const DEFAULT_SPLENDOR_MASTER_WEIGHTS: Readonly<SplendorMasterWeights> =
  {
    basePointWeight: 5.969,
    sprintPointWeight: 9.328,
    nobleImmediateWeight: 7.935,
    nobleProgressWeight: 7.5,
    earlyDiscountWeight: 1.55,
    midDiscountWeight: 0.826,
    costEfficiencyPenalty: 0.259,
    sprintZeroPointPenalty: 0.595,
    reserveBoost: 1.46,
    distanceExponent: 2.15,
    singleColorBottleneckMult: 1.294,
    draftedCountBonus: 1.4,
    overflowPenalty: 7.715,
    unlockOneTurnWeight: 0.889,
    unlockTwoTurnWeight: 0.202,
  };

export let SPLENDOR_MASTER_WEIGHTS: SplendorMasterWeights = {
  ...DEFAULT_SPLENDOR_MASTER_WEIGHTS,
};

export function setMasterSplendorBotWeights(
  overrides: Partial<SplendorMasterWeights>
): void {
  SPLENDOR_MASTER_WEIGHTS = {
    ...SPLENDOR_MASTER_WEIGHTS,
    ...overrides,
  };
}

function maxBy<T>(items: readonly T[], scoreFn: (item: T) => number): T | null {
  return items.reduce<{ item: T; score: number } | null>((best, item) => {
    const score = scoreFn(item);
    return best === null || score > best.score ? { item, score } : best;
  }, null)?.item ?? null;
}

function getUnlockedNoblePoints(
  state: SplendorState,
  player: SplendorPlayerState,
  bonusColor: GemColor
): number {
  return state.nobles.reduce((bestNoblePts, noble) => {
    const qualifies = GEM_COLORS.every((c) => {
      const req = noble.requirements[c] ?? 0;
      const after = player.bonuses[c] + (c === bonusColor ? 1 : 0);
      return after >= req;
    });
    return qualifies && noble.points > bestNoblePts
      ? noble.points
      : bestNoblePts;
  }, 0);
}

/**
 * Pure strategic card utility evaluator across difficulty tiers (`easy` -> `master`).
 */
function evaluateCardUtility(
  state: SplendorState,
  player: SplendorPlayerState,
  card: SplendorCard,
  difficulty: BotDifficulty
): number {
  if (difficulty === "easy") {
    return card.points * 3 + 1;
  }

  const targetPts = state.config.targetPoints;
  const nobleImmediatePts = getUnlockedNoblePoints(state, player, card.bonus);

  if (player.points + card.points + nobleImmediatePts >= targetPts) {
    return 1000 + (player.points + card.points + nobleImmediatePts) * 10;
  }

  if (difficulty === "normal") {
    return (
      card.points * 4.6 +
      nobleImmediatePts * 5 +
      (player.purchasedCards.length < 8 ? 2.5 : 0.8)
    );
  }

  const mw = SPLENDOR_MASTER_WEIGHTS;
  const engineSize = player.purchasedCards.length;
  const maxOppPts = Math.max(
    0,
    ...state.players.filter((p) => p.id !== player.id).map((p) => p.points)
  );
  const inSprintPhase =
    player.points >= 8 || maxOppPts >= 10 || engineSize >= 9;

  const baseScore =
    card.points *
      (difficulty === "master"
        ? inSprintPhase
          ? mw.sprintPointWeight
          : mw.basePointWeight
        : 5.4) +
    nobleImmediatePts *
      (difficulty === "master" ? mw.nobleImmediateWeight : 8.5);

  const nobleProgressBonus = state.nobles.reduce((sum, noble) => {
    const req = noble.requirements[card.bonus] ?? 0;
    if (req <= 0 || player.bonuses[card.bonus] >= req) {
      return sum;
    }
    const totalMissingForNoble = GEM_COLORS.reduce(
      (mAcc, c) =>
        mAcc + Math.max(0, (noble.requirements[c] ?? 0) - player.bonuses[c]),
      0
    );
    const weight = difficulty === "master" ? mw.nobleProgressWeight : 3.0;
    return sum + weight / Math.max(1, totalMissingForNoble);
  }, 0);

  const futureTargets = [
    ...player.reservedCards,
    ...state.market[2],
    ...state.market[3],
  ];
  const demandForBonus = futureTargets.reduce((sum, future) => {
    if (future.id === card.id) return sum;
    return (future.cost[card.bonus] ?? 0) > player.bonuses[card.bonus]
      ? sum + (future.points >= 2 ? 1.5 : 0.75)
      : sum;
  }, 0);

  const discountWeight =
    engineSize < 5
      ? difficulty === "master"
        ? mw.earlyDiscountWeight
        : 1.5
      : engineSize < 8
        ? difficulty === "master"
          ? mw.midDiscountWeight
          : 1.0
        : inSprintPhase
          ? 0.2
          : 0.55;

  const engineBonus = (2.4 + Math.min(7.5, demandForBonus)) * discountWeight;

  const efficiencyPenalty =
    difficulty === "master"
      ? (() => {
          const payment = computeCardPurchasePayment(player, card);
          const coloredSpent = GEM_COLORS.reduce(
            (acc, c) => acc + (payment.payment[c] ?? 0),
            0
          );
          const effectiveCost = coloredSpent + payment.goldShortfall * 1.35;
          return (
            effectiveCost *
            (card.points === 0 && inSprintPhase
              ? mw.sprintZeroPointPenalty
              : mw.costEfficiencyPenalty)
          );
        })()
      : 0;

  return baseScore + nobleProgressBonus + engineBonus - efficiencyPenalty;
}

export function chooseSplendorBotAction(
  state: SplendorState,
  playerId: string
): SplendorAction | null {
  const legal = getSplendorLegalActions(state, playerId);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0]!;

  const player = state.players.find((p) => p.id === playerId)!;
  const difficulty: BotDifficulty = player.botDifficulty ?? "smart";
  const mw = SPLENDOR_MASTER_WEIGHTS;

  if (state.phase === "SELECT_NOBLE") {
    return legal[0]!;
  }

  if (state.phase === "RETURN_TOKENS") {
    const retActions = legal.filter(
      (a): a is Extract<SplendorAction, { type: "RETURN_TOKENS" }> =>
        a.type === "RETURN_TOKENS"
    );
    if (difficulty === "easy" || difficulty === "normal") {
      return retActions[0] ?? legal[0]!;
    }

    const relevantCards = [
      ...player.reservedCards,
      ...state.market[3],
      ...state.market[2],
      ...state.market[1],
    ];
    const colorPriority: GemMap = relevantCards.reduce<GemMap>(
      (acc, card) =>
        GEM_COLORS.reduce<GemMap>((inner, c) => {
          const need = Math.max(0, card.cost[c] - player.bonuses[c]);
          return { ...inner, [c]: inner[c] + need * (card.points + 1) };
        }, acc),
      emptyGemMap()
    );

    const sortedReturns = [...retActions].sort((a, b) => {
      const penaltyA =
        (a.tokens.gold ?? 0) * 100 +
        GEM_COLORS.reduce(
          (acc, c) => acc + (a.tokens[c] ?? 0) * colorPriority[c],
          0
        );
      const penaltyB =
        (b.tokens.gold ?? 0) * 100 +
        GEM_COLORS.reduce(
          (acc, c) => acc + (b.tokens[c] ?? 0) * colorPriority[c],
          0
        );
      return penaltyA - penaltyB;
    });
    return sortedReturns[0] ?? legal[0]!;
  }

  const allAvailableCards = [
    ...state.market[1],
    ...state.market[2],
    ...state.market[3],
    ...player.reservedCards,
  ];

  const purchaseActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "PURCHASE_CARD" }> =>
      a.type === "PURCHASE_CARD"
  );

  if (difficulty === "easy") {
    if (
      purchaseActions.length > 0 &&
      (state.round % 2 === 1 || totalTokens(player.tokens) >= 8)
    ) {
      return purchaseActions[0]!;
    }
    const takes = legal.filter((a) => a.type === "TAKE_GEMS");
    return takes[takes.length - 1] ?? purchaseActions[0] ?? legal[0]!;
  }

  const scoredPurchases = purchaseActions.flatMap((act) => {
    const card = allAvailableCards.find((c) => c.id === act.cardId);
    return card
      ? [{ act, card, score: evaluateCardUtility(state, player, card, difficulty) }]
      : [];
  });

  const bestPurchaseEntry = scoredPurchases.reduce<
    (typeof scoredPurchases)[number] | null
  >(
    (best, entry) => (best === null || entry.score > best.score ? entry : best),
    null
  );

  if (bestPurchaseEntry && bestPurchaseEntry.score >= 900) {
    return bestPurchaseEntry.act;
  }

  const reserveActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
      a.type === "RESERVE_CARD" && Boolean(a.cardId)
  );

  if (difficulty === "master" && reserveActions.length > 0) {
    const marketCards = [
      ...state.market[3],
      ...state.market[2],
      ...state.market[1],
    ];
    const defensiveReserve = state.players
      .filter(
        (opp) =>
          opp.id !== player.id && opp.points >= state.config.targetPoints - 6
      )
      .flatMap((opp) =>
        marketCards.flatMap((mCard) => {
          const oppNoble = getUnlockedNoblePoints(state, opp, mCard.bonus);
          if (opp.points + mCard.points + oppNoble < state.config.targetPoints) {
            return [];
          }
          if (!computeCardPurchasePayment(opp, mCard).affordable) {
            return [];
          }
          const blockAct = reserveActions.find((r) => r.cardId === mCard.id);
          return blockAct ? [blockAct] : [];
        })
      )[0];

    if (defensiveReserve) {
      return defensiveReserve;
    }
  }

  if (bestPurchaseEntry) {
    const { act: bestPurchase, card: bestPurchaseCard } = bestPurchaseEntry;
    const holdTokensForBomb =
      difficulty === "master" &&
      player.points >= 9 &&
      bestPurchaseCard.points === 0 &&
      getUnlockedNoblePoints(state, player, bestPurchaseCard.bonus) === 0 &&
      [...player.reservedCards, ...state.market[3], ...state.market[2]].some(
        (bomb) => {
          if (bomb.points < 3) return false;
          const miss = GEM_COLORS.reduce(
            (sum, c) =>
              sum +
              Math.max(0, bomb.cost[c] - player.bonuses[c] - player.tokens[c]),
            0
          );
          return miss - player.tokens.gold <= 2;
        }
      );

    if (!holdTokensForBomb) {
      return bestPurchase;
    }
  }

  if (
    difficulty === "master" &&
    player.reservedCards.length < 2 &&
    state.bank.gold > 0 &&
    totalTokens(player.tokens) <= 9
  ) {
    const starvedBombReserve = reserveActions.find((act) => {
      const card = [...state.market[3], ...state.market[2]].find(
        (c) => c.id === act.cardId
      );
      if (!card || card.points < 3) return false;
      const { totalMiss, bankStarvedMiss } = GEM_COLORS.reduce(
        (acc, c) => {
          const miss = Math.max(
            0,
            card.cost[c] - player.bonuses[c] - player.tokens[c]
          );
          return {
            totalMiss: acc.totalMiss + miss,
            bankStarvedMiss:
              acc.bankStarvedMiss || (miss > 0 && state.bank[c] === 0),
          };
        },
        { totalMiss: 0, bankStarvedMiss: false }
      );
      return bankStarvedMiss && totalMiss <= player.tokens.gold + 1;
    });

    if (starvedBombReserve) {
      return starvedBombReserve;
    }
  }

  const candidateCards =
    difficulty === "normal"
      ? [...state.market[1], ...state.market[2], ...player.reservedCards]
      : [
          ...player.reservedCards,
          ...state.market[1],
          ...state.market[2],
          ...state.market[3],
        ];

  const initialGemWeights: GemMap = {
    emerald: 0.4,
    diamond: 0.4,
    sapphire: 0.4,
    onyx: 0.4,
    ruby: 0.4,
  };

  const gemNeedWeights = candidateCards.reduce<GemMap>((weightsAcc, card) => {
    const isReservedByMe = player.reservedCards.some((r) => r.id === card.id);
    const { totalMissing, maxSingleColorMissing } = GEM_COLORS.reduce(
      (acc, c) => {
        const m = Math.max(
          0,
          card.cost[c] - player.bonuses[c] - player.tokens[c]
        );
        const effectiveColorTurns =
          m > acc.maxSingleColorMissing
            ? m === 2 && state.bank[c] >= 4
              ? 1
              : m
            : acc.maxSingleColorMissing;
        return {
          totalMissing: acc.totalMissing + m,
          maxSingleColorMissing: Math.max(
            acc.maxSingleColorMissing,
            effectiveColorTurns
          ),
        };
      },
      { totalMissing: 0, maxSingleColorMissing: 0 }
    );

    const netTotalMissing = Math.max(1, totalMissing - player.tokens.gold);
    const effectiveDistance =
      difficulty === "master"
        ? Math.max(
            netTotalMissing,
            Math.max(1, maxSingleColorMissing - player.tokens.gold) *
              mw.singleColorBottleneckMult
          )
        : netTotalMissing;
    const util = Math.max(
      1,
      evaluateCardUtility(state, player, card, difficulty)
    );
    const reserveBoost = isReservedByMe
      ? difficulty === "master"
        ? mw.reserveBoost
        : 1.55
      : 1.0;
    const exp =
      difficulty === "normal"
        ? 1.15
        : difficulty === "smart"
          ? 1.75
          : mw.distanceExponent;
    const weight = (util * reserveBoost) / Math.pow(effectiveDistance, exp);

    return GEM_COLORS.reduce<GemMap>((inner, color) => {
      const missing = Math.max(
        0,
        card.cost[color] - player.bonuses[color] - player.tokens[color]
      );
      return missing > 0
        ? { ...inner, [color]: inner[color] + missing * weight }
        : inner;
    }, weightsAcc);
  }, initialGemWeights);

  const takeGemsActions = legal.filter(
    (a): a is Extract<SplendorAction, { type: "TAKE_GEMS" }> =>
      a.type === "TAKE_GEMS"
  );

  if (takeGemsActions.length > 0) {
    const curTokens = totalTokens(player.tokens);

    const scoreTakeAction = (
      act: Extract<SplendorAction, { type: "TAKE_GEMS" }>
    ): number => {
      const { draftedCount, baseNeedScore } = GEM_COLORS.reduce(
        (acc, color) => {
          const count = act.gems[color] ?? 0;
          return {
            draftedCount: acc.draftedCount + count,
            baseNeedScore: acc.baseNeedScore + count * gemNeedWeights[color],
          };
        },
        { draftedCount: 0, baseNeedScore: 0 }
      );

      if (difficulty === "master") {
        const overflow = Math.max(0, curTokens + draftedCount - 10);
        const { maxUnlockedUtil, maxTwoTurnUtil } = candidateCards.reduce(
          (uAcc, card) => {
            const { remShortfall, maxColorRem } = GEM_COLORS.reduce(
              (cAcc, c) => {
                const haveAfter =
                  player.bonuses[c] + player.tokens[c] + (act.gems[c] ?? 0);
                if (haveAfter >= card.cost[c]) return cAcc;
                const cm = card.cost[c] - haveAfter;
                return {
                  remShortfall: cAcc.remShortfall + cm,
                  maxColorRem: Math.max(cAcc.maxColorRem, cm),
                };
              },
              { remShortfall: 0, maxColorRem: 0 }
            );

            if (remShortfall <= player.tokens.gold) {
              const u = evaluateCardUtility(state, player, card, difficulty);
              return {
                ...uAcc,
                maxUnlockedUtil: Math.max(uAcc.maxUnlockedUtil, u),
              };
            }
            if (
              remShortfall - player.tokens.gold <= 3 &&
              maxColorRem - player.tokens.gold <= 1
            ) {
              const u2 = evaluateCardUtility(state, player, card, difficulty);
              return {
                ...uAcc,
                maxTwoTurnUtil: Math.max(uAcc.maxTwoTurnUtil, u2),
              };
            }
            return uAcc;
          },
          { maxUnlockedUtil: 0, maxTwoTurnUtil: 0 }
        );

        return (
          baseNeedScore +
          draftedCount * mw.draftedCountBonus -
          overflow * mw.overflowPenalty +
          maxUnlockedUtil * mw.unlockOneTurnWeight +
          maxTwoTurnUtil * mw.unlockTwoTurnWeight
        );
      }

      if (difficulty === "smart") {
        const overflow = Math.max(0, curTokens + draftedCount - 10);
        return baseNeedScore - overflow * 4.5;
      }

      return baseNeedScore;
    };

    const bestTake = maxBy(takeGemsActions, scoreTakeAction)!;
    const bestDraftedCount = GEM_COLORS.reduce(
      (acc, c) => acc + (bestTake.gems[c] ?? 0),
      0
    );

    if (
      difficulty === "master" &&
      bestDraftedCount <= 1 &&
      state.bank.gold > 0 &&
      reserveActions.length > 0 &&
      curTokens <= 8
    ) {
      const validReserves = reserveActions.flatMap((rAct) => {
        const c = allAvailableCards.find((x) => x.id === rAct.cardId);
        return c
          ? [{ rAct, util: evaluateCardUtility(state, player, c, difficulty) }]
          : [];
      });
      const bestResEntry = maxBy(validReserves, (entry) => entry.util);
      return bestResEntry ? bestResEntry.rAct : reserveActions[0]!;
    }

    return bestTake;
  }

  if (bestPurchaseEntry) return bestPurchaseEntry.act;
  if (reserveActions.length > 0) return reserveActions[0]!;
  return legal[0]!;
}
