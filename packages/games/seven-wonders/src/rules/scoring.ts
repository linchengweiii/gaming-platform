import {
  SEVEN_WONDERS_COINS_PER_TREASURY_VP,
  SEVEN_WONDERS_SCIENCE_SET_BONUS_VP,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import type {
  CardColor,
  ScienceMap,
  SevenWondersCard,
  SevenWondersPlayerState,
  SevenWondersScoreBreakdown,
} from "../types.ts";
import {
  getLeftNeighborIndex,
  getRightNeighborIndex,
  hasWonderStageEffect,
} from "./helpers.ts";

export function computeOptimalScienceScorePure(
  baseCounts: ScienceMap,
  wildcards: number
): { readonly points: number; readonly finalCounts: ScienceMap } {
  let bestPoints = -1;
  let bestCounts: ScienceMap = { ...baseCounts };

  for (let wc = 0; wc <= wildcards; wc++) {
    for (let wg = 0; wg <= wildcards - wc; wg++) {
      const wt = wildcards - wc - wg;
      const c = baseCounts.compass + wc;
      const g = baseCounts.gear + wg;
      const t = baseCounts.tablet + wt;
      const sets = Math.min(c, g, t);
      const pts = c * c + g * g + t * t + sets * SEVEN_WONDERS_SCIENCE_SET_BONUS_VP;
      if (pts > bestPoints) {
        bestPoints = pts;
        bestCounts = { compass: c, gear: g, tablet: t };
      }
    }
  }

  return { points: Math.max(0, bestPoints), finalCounts: bestCounts };
}

function countMatchingCards(
  owner: SevenWondersPlayerState,
  left: SevenWondersPlayerState,
  right: SevenWondersPlayerState,
  targetColors: readonly CardColor[],
  includeSelf: boolean,
  includeNeighbors: boolean
): number {
  const colorSet = new Set(targetColors);
  let count = 0;
  if (includeSelf) count += owner.tableau.filter((c) => colorSet.has(c.color)).length;
  if (includeNeighbors) {
    count += left.tableau.filter((c) => colorSet.has(c.color)).length;
    count += right.tableau.filter((c) => colorSet.has(c.color)).length;
  }
  return count;
}

function countMatchingWonderStages(
  owner: SevenWondersPlayerState,
  left: SevenWondersPlayerState,
  right: SevenWondersPlayerState,
  includeSelf: boolean,
  includeNeighbors: boolean
): number {
  return (
    (includeSelf ? owner.builtWonderStages : 0) +
    (includeNeighbors ? left.builtWonderStages + right.builtWonderStages : 0)
  );
}

function evaluateCardVpForOwner(
  players: readonly SevenWondersPlayerState[],
  ownerIndex: number,
  card: SevenWondersCard
): number {
  const owner = players[ownerIndex]!;
  const left = players[getLeftNeighborIndex(ownerIndex, players.length)]!;
  const right = players[getRightNeighborIndex(ownerIndex, players.length)]!;

  let vp = 0;
  for (const ef of card.effects) {
    if (ef.kind === "vp") {
      vp += ef.points;
    } else if (ef.kind === "per_card_reward" && ef.vpPerMatch > 0) {
      vp +=
        countMatchingCards(
          owner,
          left,
          right,
          ef.targetColors,
          ef.includeSelf,
          ef.includeNeighbors
        ) * ef.vpPerMatch;
    } else if (ef.kind === "per_wonder_stage_reward" && ef.vpPerStage > 0) {
      vp +=
        countMatchingWonderStages(
          owner,
          left,
          right,
          ef.includeSelf,
          ef.includeNeighbors
        ) * ef.vpPerStage;
    } else if (ef.kind === "per_defeat_token_vp") {
      if (ef.includeNeighbors) {
        const defeats =
          left.militaryTokens.filter((t) => t.points < 0).length +
          right.militaryTokens.filter((t) => t.points < 0).length;
        vp += defeats * ef.vpPerToken;
      }
    } else if (ef.kind === "complete_wonder_vp") {
      const board = getWonderBoardDefinition(owner.wonderId, owner.wonderSide);
      if (owner.builtWonderStages >= board.stages.length) {
        vp += ef.points;
      }
    }
  }

  return vp;
}

export function evaluateImmediateCardCoins(
  players: readonly SevenWondersPlayerState[],
  ownerIndex: number,
  card: SevenWondersCard
): number {
  const owner = players[ownerIndex]!;
  const left = players[getLeftNeighborIndex(ownerIndex, players.length)]!;
  const right = players[getRightNeighborIndex(ownerIndex, players.length)]!;

  let coins = 0;
  for (const ef of card.effects) {
    if (ef.kind === "coins") {
      coins += ef.coins;
    } else if (ef.kind === "per_card_reward" && ef.coinsPerMatch > 0) {
      coins +=
        countMatchingCards(
          owner,
          left,
          right,
          ef.targetColors,
          ef.includeSelf,
          ef.includeNeighbors
        ) * ef.coinsPerMatch;
    } else if (ef.kind === "per_wonder_stage_reward" && ef.coinsPerStage > 0) {
      coins +=
        countMatchingWonderStages(
          owner,
          left,
          right,
          ef.includeSelf,
          ef.includeNeighbors
        ) * ef.coinsPerStage;
    }
  }
  return coins;
}

export function computeSevenWondersScoreBreakdown(
  players: readonly SevenWondersPlayerState[],
  playerIndex: number
): SevenWondersScoreBreakdown {
  const player = players[playerIndex]!;
  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);

  const militaryVp = player.militaryTokens.reduce((s, t) => s + t.points, 0);
  const treasuryVp = Math.floor(player.coins / SEVEN_WONDERS_COINS_PER_TREASURY_VP);

  let wonderVp = 0;
  let wonderWildcardScience = 0;
  for (const st of board.stages.slice(0, player.builtWonderStages)) {
    for (const ef of st.effects) {
      if (ef.kind === "vp") wonderVp += ef.points;
      if (ef.kind === "wildcard_science") wonderWildcardScience += 1;
    }
  }

  let civilianVp = 0;
  let commercialVp = 0;
  let guildVp = 0;
  const baseScience: ScienceMap = { compass: 0, gear: 0, tablet: 0 };
  let cardWildcardScience = 0;

  for (const card of player.tableau) {
    if (card.color === "blue") {
      civilianVp += evaluateCardVpForOwner(players, playerIndex, card);
    } else if (card.color === "yellow") {
      commercialVp += evaluateCardVpForOwner(players, playerIndex, card);
    } else if (card.color === "purple") {
      guildVp += evaluateCardVpForOwner(players, playerIndex, card);
    }
    for (const ef of card.effects) {
      if (ef.kind === "science") {
        baseScience[ef.symbol] += 1;
      } else if (ef.kind === "wildcard_science") {
        cardWildcardScience += 1;
      }
    }
  }

  const baseWildcards = wonderWildcardScience + cardWildcardScience;
  let bestScience = computeOptimalScienceScorePure(baseScience, baseWildcards);
  let copiedGuildName: string | null = null;

  if (hasWonderStageEffect(player, "copy_neighbor_guild")) {
    const left = players[getLeftNeighborIndex(playerIndex, players.length)]!;
    const right = players[getRightNeighborIndex(playerIndex, players.length)]!;
    const neighborGuilds = [
      ...left.tableau.filter((c) => c.color === "purple"),
      ...right.tableau.filter((c) => c.color === "purple"),
    ];

    let bestExtraPoints = 0;
    let bestGuildCard: SevenWondersCard | null = null;
    let bestAltScience = bestScience;

    for (const gCard of neighborGuilds) {
      const hasSciWildcard = gCard.effects.some(
        (ef) => ef.kind === "wildcard_science"
      );
      if (hasSciWildcard) {
        const sciWithCopy = computeOptimalScienceScorePure(
          baseScience,
          baseWildcards + 1
        );
        const gain = sciWithCopy.points - bestScience.points;
        if (gain > bestExtraPoints) {
          bestExtraPoints = gain;
          bestGuildCard = gCard;
          bestAltScience = sciWithCopy;
        }
      } else {
        const gain = evaluateCardVpForOwner(players, playerIndex, gCard);
        if (gain > bestExtraPoints) {
          bestExtraPoints = gain;
          bestGuildCard = gCard;
          bestAltScience = bestScience;
        }
      }
    }

    if (bestGuildCard && bestExtraPoints > 0) {
      copiedGuildName = bestGuildCard.name;
      if (bestGuildCard.effects.some((ef) => ef.kind === "wildcard_science")) {
        bestScience = bestAltScience;
      } else {
        guildVp += bestExtraPoints;
      }
    }
  }

  const scientificVp = bestScience.points;
  const totalVp =
    militaryVp +
    treasuryVp +
    wonderVp +
    civilianVp +
    scientificVp +
    commercialVp +
    guildVp;

  return {
    militaryVp,
    treasuryVp,
    wonderVp,
    civilianVp,
    scientificVp,
    commercialVp,
    guildVp,
    totalVp,
    coinsTiebreaker: player.coins,
    scienceCounts: bestScience.finalCounts,
    copiedGuildName,
  };
}

export function refreshAllPlayerScores(
  players: readonly SevenWondersPlayerState[]
): SevenWondersPlayerState[] {
  return players.map((p, idx) => ({
    ...p,
    scoreBreakdown: computeSevenWondersScoreBreakdown(players, idx),
  }));
}
