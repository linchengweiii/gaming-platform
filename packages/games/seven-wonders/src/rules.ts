import {
  type GameEvent,
  type InvariantCheckResult,
  type PlayerDescriptor,
  createRngState,
  nextIntPure,
  shufflePure,
} from "@gaming-platform/core";
import {
  ALL_WONDER_IDS,
  SEVEN_WONDERS_AGE_III_BASE_CARDS,
  SEVEN_WONDERS_AGE_II_CARDS,
  SEVEN_WONDERS_AGE_I_CARDS,
  SEVEN_WONDERS_GUILD_CARDS,
  getWonderBoardDefinition,
} from "./cards.ts";
import {
  MANUFACTURED_GOODS,
  type NeighborPayment,
  RAW_RESOURCES,
  type ResourceProductionChoice,
  type ScienceMap,
  type SevenWondersAction,
  type SevenWondersAge,
  type SevenWondersCard,
  type SevenWondersConfig,
  type SevenWondersPlayerState,
  type SevenWondersScoreBreakdown,
  type SevenWondersState,
  WONDER_RESOURCES,
  type WonderId,
  type WonderResource,
  type WonderResourceMap,
  type WonderSide,
} from "./types.ts";

const DEFAULT_SEVEN_WONDERS_COLORS = [
  "#e63946",
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
] as const;

export function emptyWonderResourceMap(): WonderResourceMap {
  return {
    wood: 0,
    stone: 0,
    ore: 0,
    clay: 0,
    glass: 0,
    loom: 0,
    papyrus: 0,
  };
}

export function isRawResource(res: WonderResource): boolean {
  return (RAW_RESOURCES as readonly string[]).includes(res);
}

export function isManufacturedGood(res: WonderResource): boolean {
  return (MANUFACTURED_GOODS as readonly string[]).includes(res);
}

export function getLeftNeighborIndex(playerIndex: number, count: number): number {
  return (playerIndex - 1 + count) % count;
}

export function getRightNeighborIndex(playerIndex: number, count: number): number {
  return (playerIndex + 1) % count;
}

export function hasWonderStageEffect(
  player: Pick<SevenWondersPlayerState, "wonderId" | "wonderSide" | "builtWonderStages">,
  effectKind: string
): boolean {
  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  return board.stages
    .slice(0, player.builtWonderStages)
    .some((st) => st.effects.some((ef) => ef.kind === effectKind));
}

export function canPlayerBuildViaChain(
  player: Pick<SevenWondersPlayerState, "tableau">,
  card: SevenWondersCard
): boolean {
  if (card.freeFromChains.length === 0) return false;
  const ownedNames = new Set(player.tableau.map((c) => c.name));
  return card.freeFromChains.some((prereq) => ownedNames.has(prereq));
}

export function hasDuplicateCardName(
  player: Pick<SevenWondersPlayerState, "tableau">,
  cardName: string
): boolean {
  return player.tableau.some((c) => c.name === cardName);
}

export function canPlayerUseOlympiaFreeBuild(
  player: Pick<
    SevenWondersPlayerState,
    "wonderId" | "wonderSide" | "builtWonderStages" | "usedFreeBuildInAge"
  >,
  age: SevenWondersAge
): boolean {
  return (
    hasWonderStageEffect(player, "free_build_per_age") &&
    !player.usedFreeBuildInAge[age]
  );
}

export function getPlayerTradeRates(
  player: Pick<
    SevenWondersPlayerState,
    "wonderId" | "wonderSide" | "builtWonderStages" | "tableau"
  >
): {
  readonly rawLeft: 1 | 2;
  readonly rawRight: 1 | 2;
  readonly manufacturedLeft: 1 | 2;
  readonly manufacturedRight: 1 | 2;
} {
  const bothRawWonder = hasWonderStageEffect(player, "raw_trade_both_discount");
  let rawLeftDiscount = bothRawWonder;
  let rawRightDiscount = bothRawWonder;
  let mfgBothDiscount = false;

  for (const card of player.tableau) {
    for (const ef of card.effects) {
      if (ef.kind === "trade_discount") {
        if (ef.rawLeft) rawLeftDiscount = true;
        if (ef.rawRight) rawRightDiscount = true;
        if (ef.manufacturedBoth) mfgBothDiscount = true;
      }
    }
  }

  return {
    rawLeft: rawLeftDiscount ? 1 : 2,
    rawRight: rawRightDiscount ? 1 : 2,
    manufacturedLeft: mfgBothDiscount ? 1 : 2,
    manufacturedRight: mfgBothDiscount ? 1 : 2,
  };
}

interface ResourceProfile {
  readonly fixed: WonderResourceMap;
  readonly choices: readonly ResourceProductionChoice[];
}

export function getOwnResourceProfile(
  player: Pick<
    SevenWondersPlayerState,
    "wonderId" | "wonderSide" | "startingResource" | "builtWonderStages" | "tableau"
  >
): ResourceProfile {
  const fixed = emptyWonderResourceMap();
  fixed[player.startingResource] += 1;
  const choices: ResourceProductionChoice[] = [];

  for (const card of player.tableau) {
    for (const ef of card.effects) {
      if (ef.kind === "resources") {
        const count = ef.count ?? 1;
        if (ef.options.length === 1) {
          fixed[ef.options[0]!] += count;
        } else if (ef.options.length > 1) {
          for (let i = 0; i < count; i++) {
            choices.push(ef.options);
          }
        }
      }
    }
  }

  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  for (const st of board.stages.slice(0, player.builtWonderStages)) {
    for (const ef of st.effects) {
      if (ef.kind === "wildcard_resource") {
        if (ef.options.length === 1) {
          fixed[ef.options[0]!] += 1;
        } else {
          choices.push(ef.options);
        }
      }
    }
  }

  return { fixed, choices };
}

/**
 * Official 7 Wonders Commerce Rule:
 * Neighbors ONLY sell their Wonder starting resource + Brown & Gray card resources
 * (never Yellow Caravansery/Forum or Wonder wildcard stages).
 */
export function getNeighborTradableProfile(
  neighbor: Pick<SevenWondersPlayerState, "startingResource" | "tableau">
): ResourceProfile {
  const fixed = emptyWonderResourceMap();
  fixed[neighbor.startingResource] += 1;
  const choices: ResourceProductionChoice[] = [];

  for (const card of neighbor.tableau) {
    if (card.color !== "brown" && card.color !== "gray") continue;
    for (const ef of card.effects) {
      if (ef.kind === "resources") {
        const count = ef.count ?? 1;
        if (ef.options.length === 1) {
          fixed[ef.options[0]!] += count;
        } else if (ef.options.length > 1) {
          for (let i = 0; i < count; i++) {
            choices.push(ef.options);
          }
        }
      }
    }
  }

  return { fixed, choices };
}

function encodeNeedKey(need: WonderResourceMap): string {
  return WONDER_RESOURCES.map((r) => need[r]).join(",");
}

function sumNeed(need: WonderResourceMap): number {
  return WONDER_RESOURCES.reduce((s, r) => s + need[r], 0);
}

function reduceNeedWithChoices(
  initialNeed: WonderResourceMap,
  choices: readonly ResourceProductionChoice[]
): WonderResourceMap[] {
  const seen = new Map<string, WonderResourceMap>();
  seen.set(encodeNeedKey(initialNeed), initialNeed);

  let frontier: WonderResourceMap[] = [initialNeed];
  for (const opts of choices) {
    const nextMap = new Map<string, WonderResourceMap>();
    for (const need of frontier) {
      let usedAny = false;
      for (const res of opts) {
        if (need[res] > 0) {
          usedAny = true;
          const updated: WonderResourceMap = {
            ...need,
            [res]: need[res] - 1,
          };
          nextMap.set(encodeNeedKey(updated), updated);
        }
      }
      if (!usedAny) {
        nextMap.set(encodeNeedKey(need), need);
      }
    }
    frontier = Array.from(nextMap.values());
    if (frontier.some((n) => sumNeed(n) === 0)) {
      return [emptyWonderResourceMap()];
    }
  }

  // Keep Pareto-minimal need vectors
  return frontier.filter(
    (cand, i) =>
      !frontier.some(
        (other, j) =>
          i !== j &&
          WONDER_RESOURCES.every((r) => other[r] <= cand[r]) &&
          WONDER_RESOURCES.some((r) => other[r] < cand[r])
      )
  );
}

function expandDualAssignments(
  baseFixed: WonderResourceMap,
  choices: readonly ResourceProductionChoice[],
  relevantResources: ReadonlySet<WonderResource>
): WonderResourceMap[] {
  let states = new Map<string, WonderResourceMap>();
  states.set(encodeNeedKey(baseFixed), baseFixed);

  for (const opts of choices) {
    const relevantOpts = opts.filter((r) => relevantResources.has(r));
    if (relevantOpts.length === 0) continue;
    const nextStates = new Map<string, WonderResourceMap>();
    for (const cur of states.values()) {
      for (const r of relevantOpts) {
        const next: WonderResourceMap = { ...cur, [r]: cur[r] + 1 };
        nextStates.set(encodeNeedKey(next), next);
      }
    }
    states = nextStates;
  }

  return Array.from(states.values());
}

/**
 * Computes all minimum-total-coin (and Pareto-distinct neighbor coin split) payments
 * to satisfy `resourceCost` + `coinCost` for `player` seated at `playerIndex`.
 * Returns `[]` if unaffordable.
 */
export function computeAffordablePaymentsPure(
  players: readonly SevenWondersPlayerState[],
  playerIndex: number,
  resourceCost: Partial<WonderResourceMap>,
  coinCost = 0
): NeighborPayment[] {
  const player = players[playerIndex]!;
  if (player.coins < coinCost) return [];

  const maxTradeCoins = player.coins - coinCost;
  const ownProfile = getOwnResourceProfile(player);

  const afterOwnFixed: WonderResourceMap = {
    wood: Math.max(0, (resourceCost.wood ?? 0) - ownProfile.fixed.wood),
    stone: Math.max(0, (resourceCost.stone ?? 0) - ownProfile.fixed.stone),
    ore: Math.max(0, (resourceCost.ore ?? 0) - ownProfile.fixed.ore),
    clay: Math.max(0, (resourceCost.clay ?? 0) - ownProfile.fixed.clay),
    glass: Math.max(0, (resourceCost.glass ?? 0) - ownProfile.fixed.glass),
    loom: Math.max(0, (resourceCost.loom ?? 0) - ownProfile.fixed.loom),
    papyrus: Math.max(0, (resourceCost.papyrus ?? 0) - ownProfile.fixed.papyrus),
  };

  if (sumNeed(afterOwnFixed) === 0) {
    return [{ leftCoins: 0, rightCoins: 0 }];
  }

  const residualNeeds = reduceNeedWithChoices(afterOwnFixed, ownProfile.choices);
  if (residualNeeds.some((n) => sumNeed(n) === 0)) {
    return [{ leftCoins: 0, rightCoins: 0 }];
  }

  if (maxTradeCoins <= 0) return [];

  const leftIdx = getLeftNeighborIndex(playerIndex, players.length);
  const rightIdx = getRightNeighborIndex(playerIndex, players.length);
  const leftProfile = getNeighborTradableProfile(players[leftIdx]!);
  const rightProfile = getNeighborTradableProfile(players[rightIdx]!);
  const rates = getPlayerTradeRates(player);

  const unitRateLeft = (r: WonderResource): number =>
    isRawResource(r) ? rates.rawLeft : rates.manufacturedLeft;
  const unitRateRight = (r: WonderResource): number =>
    isRawResource(r) ? rates.rawRight : rates.manufacturedRight;

  const validPayments = new Map<string, NeighborPayment>();

  for (const need of residualNeeds) {
    const minPossibleCoins = WONDER_RESOURCES.reduce(
      (s, r) => s + need[r] * Math.min(unitRateLeft(r), unitRateRight(r)),
      0
    );
    if (minPossibleCoins > maxTradeCoins) continue;

    const neededSet = new Set(WONDER_RESOURCES.filter((r) => need[r] > 0));
    const leftPools = expandDualAssignments(
      leftProfile.fixed,
      leftProfile.choices,
      neededSet
    );
    const rightPools = expandDualAssignments(
      rightProfile.fixed,
      rightProfile.choices,
      neededSet
    );

    const neededList = Array.from(neededSet);

    for (const lPool of leftPools) {
      if (
        neededList.some((r) => lPool[r] + rightProfile.fixed[r] + rightProfile.choices.length < need[r])
      ) {
        continue;
      }
      for (const rPool of rightPools) {
        if (neededList.some((r) => lPool[r] + rPool[r] < need[r])) {
          continue;
        }

        // Accumulate valid (leftCoins, rightCoins) pairs across each needed resource
        let pairSet = new Map<string, NeighborPayment>([
          ["0:0", { leftCoins: 0, rightCoins: 0 }],
        ]);

        for (const res of neededList) {
          const req = need[res];
          const minFromLeft = Math.max(0, req - rPool[res]);
          const maxFromLeft = Math.min(req, lPool[res]);
          const nextPairs = new Map<string, NeighborPayment>();
          const lRate = unitRateLeft(res);
          const rRate = unitRateRight(res);

          for (const cur of pairSet.values()) {
            for (let takeL = minFromLeft; takeL <= maxFromLeft; takeL++) {
              const takeR = req - takeL;
              const nextL = cur.leftCoins + takeL * lRate;
              const nextR = cur.rightCoins + takeR * rRate;
              if (nextL + nextR <= maxTradeCoins) {
                nextPairs.set(`${nextL}:${nextR}`, {
                  leftCoins: nextL,
                  rightCoins: nextR,
                });
              }
            }
          }
          pairSet = nextPairs;
          if (pairSet.size === 0) break;
        }

        for (const [k, v] of pairSet.entries()) {
          validPayments.set(k, v);
        }
      }
    }
  }

  if (validPayments.size === 0) return [];

  const all = Array.from(validPayments.values());

  // Keep all Pareto-undominated (leftCoins, rightCoins) splits so players/bots can voluntarily
  // pay 2c to a trailing neighbor rather than feeding 1c to a leading neighbor with a discount
  return all
    .filter(
      (p) =>
        !all.some(
          (other) =>
            other.leftCoins <= p.leftCoins &&
            other.rightCoins <= p.rightCoins &&
            (other.leftCoins < p.leftCoins || other.rightCoins < p.rightCoins)
        )
    )
    .sort(
      (a, b) =>
        a.leftCoins + a.rightCoins - (b.leftCoins + b.rightCoins) ||
        a.leftCoins - b.leftCoins
    );
}

export function getPlayerShields(player: SevenWondersPlayerState): number {
  let shields = 0;
  for (const card of player.tableau) {
    for (const ef of card.effects) {
      if (ef.kind === "shields") shields += ef.shields;
    }
  }
  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  for (const st of board.stages.slice(0, player.builtWonderStages)) {
    for (const ef of st.effects) {
      if (ef.kind === "shields") shields += ef.shields;
    }
  }
  return shields;
}

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
      const pts = c * c + g * g + t * t + sets * 7;
      if (pts > bestPoints) {
        bestPoints = pts;
        bestCounts = { compass: c, gear: g, tablet: t };
      }
    }
  }

  return { points: Math.max(0, bestPoints), finalCounts: bestCounts };
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
      const colorSet = new Set(ef.targetColors);
      let count = 0;
      if (ef.includeSelf) {
        count += owner.tableau.filter((c) => colorSet.has(c.color)).length;
      }
      if (ef.includeNeighbors) {
        count += left.tableau.filter((c) => colorSet.has(c.color)).length;
        count += right.tableau.filter((c) => colorSet.has(c.color)).length;
      }
      vp += count * ef.vpPerMatch;
    } else if (ef.kind === "per_wonder_stage_reward" && ef.vpPerStage > 0) {
      let stages = 0;
      if (ef.includeSelf) stages += owner.builtWonderStages;
      if (ef.includeNeighbors) {
        stages += left.builtWonderStages + right.builtWonderStages;
      }
      vp += stages * ef.vpPerStage;
    } else if (ef.kind === "per_defeat_token_vp") {
      let defeats = 0;
      if (ef.includeNeighbors) {
        defeats += left.militaryTokens.filter((t) => t.points < 0).length;
        defeats += right.militaryTokens.filter((t) => t.points < 0).length;
      }
      vp += defeats * ef.vpPerToken;
    } else if (ef.kind === "complete_wonder_vp") {
      const board = getWonderBoardDefinition(owner.wonderId, owner.wonderSide);
      if (owner.builtWonderStages >= board.stages.length) {
        vp += ef.points;
      }
    }
  }

  return vp;
}

function evaluateImmediateCardCoins(
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
      const colorSet = new Set(ef.targetColors);
      let count = 0;
      if (ef.includeSelf) {
        count += owner.tableau.filter((c) => colorSet.has(c.color)).length;
      }
      if (ef.includeNeighbors) {
        count += left.tableau.filter((c) => colorSet.has(c.color)).length;
        count += right.tableau.filter((c) => colorSet.has(c.color)).length;
      }
      coins += count * ef.coinsPerMatch;
    } else if (ef.kind === "per_wonder_stage_reward" && ef.coinsPerStage > 0) {
      let stages = 0;
      if (ef.includeSelf) stages += owner.builtWonderStages;
      if (ef.includeNeighbors) {
        stages += left.builtWonderStages + right.builtWonderStages;
      }
      coins += stages * ef.coinsPerStage;
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
  const treasuryVp = Math.floor(player.coins / 3);

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
      if (
        bestGuildCard.effects.some((ef) => ef.kind === "wildcard_science")
      ) {
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

function refreshAllPlayerScores(
  players: readonly SevenWondersPlayerState[]
): SevenWondersPlayerState[] {
  return players.map((p, idx) => ({
    ...p,
    scoreBreakdown: computeSevenWondersScoreBreakdown(players, idx),
  }));
}

function buildAgeDeckPure(
  rngState: number,
  age: SevenWondersAge,
  playerCount: number
): { readonly deck: SevenWondersCard[]; readonly rngState: number } {
  if (age === 1) {
    const filtered = SEVEN_WONDERS_AGE_I_CARDS.filter(
      (c) => c.minPlayers <= playerCount
    );
    const [shuffled, nextRng] = shufflePure(rngState, filtered);
    return { deck: shuffled, rngState: nextRng };
  }
  if (age === 2) {
    const filtered = SEVEN_WONDERS_AGE_II_CARDS.filter(
      (c) => c.minPlayers <= playerCount
    );
    const [shuffled, nextRng] = shufflePure(rngState, filtered);
    return { deck: shuffled, rngState: nextRng };
  }

  const base = SEVEN_WONDERS_AGE_III_BASE_CARDS.filter(
    (c) => c.minPlayers <= playerCount
  );
  const [shuffledGuilds, rngAfterGuilds] = shufflePure(
    rngState,
    SEVEN_WONDERS_GUILD_CARDS
  );
  const selectedGuilds = shuffledGuilds.slice(0, playerCount + 2);
  const combined = [...base, ...selectedGuilds];
  const [shuffledAge3, rngAfterAge3] = shufflePure(rngAfterGuilds, combined);
  return { deck: shuffledAge3, rngState: rngAfterAge3 };
}

function dealHandsToPlayers(
  players: readonly SevenWondersPlayerState[],
  deck: readonly SevenWondersCard[]
): SevenWondersPlayerState[] {
  return players.map((p, idx) => {
    const dealtHand = deck.slice(idx * 7, (idx + 1) * 7);
    return {
      ...p,
      hand: dealtHand,
      seenHandsThisAge: [dealtHand],
    };
  });
}

export function initSevenWondersGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<SevenWondersConfig>,
  seed: number | string = "seven-wonders-default-seed"
): SevenWondersState {
  if (players.length < 3 || players.length > 7) {
    throw new Error(
      `7 Wonders requires 3 to 7 players, received ${players.length}`
    );
  }

  const resolvedConfig: SevenWondersConfig = {
    wonderSideMode: config?.wonderSideMode ?? "random",
    startingPlayerIndex: config?.startingPlayerIndex,
    randomizeStartingPlayer: config?.randomizeStartingPlayer ?? false,
  };

  let rng = createRngState(seed);

  const [startingPlayerIndex, rngAfterStarter] = (() => {
    if (
      typeof resolvedConfig.startingPlayerIndex === "number" &&
      resolvedConfig.startingPlayerIndex >= 0 &&
      resolvedConfig.startingPlayerIndex < players.length
    ) {
      return [resolvedConfig.startingPlayerIndex, rng] as const;
    }
    if (resolvedConfig.randomizeStartingPlayer) {
      return nextIntPure(rng, 0, players.length - 1);
    }
    return [0, rng] as const;
  })();
  rng = rngAfterStarter;

  const [shuffledWonders, rngAfterWonders] = shufflePure(rng, ALL_WONDER_IDS);
  rng = rngAfterWonders;

  const initialPlayersDraft: SevenWondersPlayerState[] = [];
  for (let idx = 0; idx < players.length; idx++) {
    const desc = players[idx]!;
    const wonderId: WonderId = shuffledWonders[idx]!;
    let wonderSide: WonderSide = "A";
    if (resolvedConfig.wonderSideMode === "night") {
      wonderSide = "B";
    } else if (resolvedConfig.wonderSideMode === "random") {
      const [sidePick, nextRng] = nextIntPure(rng, 0, 1);
      rng = nextRng;
      wonderSide = sidePick === 0 ? "A" : "B";
    }

    const board = getWonderBoardDefinition(wonderId, wonderSide);
    const emptyBreakdown: SevenWondersScoreBreakdown = {
      militaryVp: 0,
      treasuryVp: 1,
      wonderVp: 0,
      civilianVp: 0,
      scientificVp: 0,
      commercialVp: 0,
      guildVp: 0,
      totalVp: 1,
      coinsTiebreaker: 3,
      scienceCounts: { compass: 0, gear: 0, tablet: 0 },
      copiedGuildName: null,
    };

    initialPlayersDraft.push({
      id: desc.id,
      name: desc.name,
      color:
        desc.color ||
        DEFAULT_SEVEN_WONDERS_COLORS[idx % DEFAULT_SEVEN_WONDERS_COLORS.length]!,
      isBot: Boolean(desc.isBot),
      botDifficulty: desc.botDifficulty ?? "smart",
      wonderId,
      wonderSide,
      startingResource: board.startingResource,
      coins: 3,
      builtWonderStages: 0,
      tuckedWonderCardIds: [],
      tableau: [],
      hand: [],
      militaryTokens: [],
      usedFreeBuildInAge: { 1: false, 2: false, 3: false },
      scoreBreakdown: emptyBreakdown,
    });
  }

  const age1Build = buildAgeDeckPure(rng, 1, players.length);
  const age2Build = buildAgeDeckPure(age1Build.rngState, 2, players.length);
  const age3Build = buildAgeDeckPure(age2Build.rngState, 3, players.length);
  rng = age3Build.rngState;

  const dealtPlayers = refreshAllPlayerScores(
    dealHandsToPlayers(initialPlayersDraft, age1Build.deck)
  );

  const initEvt: GameEvent = {
    id: "evt-0",
    timestamp: 0,
    turn: 1,
    type: "GAME_INIT",
    message: `Age I begins across ${players.length} civilizations (passing clockwise).`,
  };

  return {
    gameId: "seven_wonders",
    config: resolvedConfig,
    phase: "AGE_DRAFT",
    age: 1,
    draftRound: 1,
    turn: 1,
    passDirection: "clockwise",
    startingPlayerIndex,
    players: dealtPlayers,
    pendingChoices: {},
    lockedPlayerIds: [],
    seventhCardQueue: [],
    halikarnassusQueue: [],
    discardPile: [],
    ageDecks: {
      2: age2Build.deck,
      3: age3Build.deck,
    },
    rngState: rng,
    winnerId: null,
    eventLog: [initEvt],
  };
}

export function getSevenWondersActingPlayerId(
  state: SevenWondersState
): string | null {
  if (state.phase === "GAME_OVER") return null;
  if (state.phase === "HALIKARNASSUS_PICK") {
    return state.halikarnassusQueue[0] ?? null;
  }
  if (state.phase === "SEVENTH_CARD_PLAY") {
    return state.seventhCardQueue[0] ?? null;
  }

  // In AGE_DRAFT, prioritize human seats that haven't locked in yet so humans act smoothly,
  // otherwise follow seat order starting from startingPlayerIndex.
  const n = state.players.length;
  for (let offset = 0; offset < n; offset++) {
    const p = state.players[(state.startingPlayerIndex + offset) % n]!;
    if (
      !p.isBot &&
      !state.lockedPlayerIds.includes(p.id) &&
      !state.pendingChoices[p.id]
    ) {
      return p.id;
    }
  }
  for (let offset = 0; offset < n; offset++) {
    const p = state.players[(state.startingPlayerIndex + offset) % n]!;
    if (!state.lockedPlayerIds.includes(p.id) && !state.pendingChoices[p.id]) {
      return p.id;
    }
  }
  return null;
}

export function getSevenWondersLegalActions(
  state: SevenWondersState,
  playerId: string
): SevenWondersAction[] {
  if (state.phase === "GAME_OVER") return [];

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0) return [];
  const player = state.players[pIdx]!;

  if (state.phase === "HALIKARNASSUS_PICK") {
    if (state.halikarnassusQueue[0] !== playerId) return [];
    const buildableCards = state.discardPile.filter(
      (c) => !hasDuplicateCardName(player, c.name)
    );
    const seenIds = new Set<string>();
    const actions: SevenWondersAction[] = [];
    for (const card of buildableCards) {
      if (!seenIds.has(card.id)) {
        seenIds.add(card.id);
        actions.push({ type: "BUILD_FROM_DISCARD", cardId: card.id });
      }
    }
    actions.push({ type: "SKIP_DISCARD_BUILD" });
    return actions;
  }

  if (state.phase === "SEVENTH_CARD_PLAY") {
    if (state.seventhCardQueue[0] !== playerId) return [];
  } else if (state.phase === "AGE_DRAFT") {
    if (state.lockedPlayerIds.includes(playerId) || state.pendingChoices[playerId]) {
      return [];
    }
  }

  if (player.hand.length === 0) return [];

  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const nextWonderStage =
    player.builtWonderStages < board.stages.length
      ? board.stages[player.builtWonderStages]!
      : null;
  const wonderPayments = nextWonderStage
    ? computeAffordablePaymentsPure(
        state.players,
        pIdx,
        nextWonderStage.resourceCost,
        0
      )
    : [];
  const canFreeBuild = canPlayerUseOlympiaFreeBuild(player, state.age);

  const actions: SevenWondersAction[] = [];

  for (const card of player.hand) {
    // 1. Build structure (if not duplicate name)
    if (!hasDuplicateCardName(player, card.name)) {
      if (canPlayerBuildViaChain(player, card)) {
        actions.push({
          type: "SELECT_DRAFT_ACTION",
          kind: "build",
          cardId: card.id,
          payment: { leftCoins: 0, rightCoins: 0 },
        });
      } else {
        const payments = computeAffordablePaymentsPure(
          state.players,
          pIdx,
          card.resourceCost,
          card.coinCost
        );
        for (const pay of payments) {
          actions.push({
            type: "SELECT_DRAFT_ACTION",
            kind: "build",
            cardId: card.id,
            payment: pay,
          });
        }
        if (
          canFreeBuild &&
          (payments.length === 0 ||
            card.coinCost > 0 ||
            payments[0]!.leftCoins + payments[0]!.rightCoins > 0)
        ) {
          actions.push({
            type: "SELECT_DRAFT_ACTION",
            kind: "build",
            cardId: card.id,
            payment: { leftCoins: 0, rightCoins: 0 },
            useFreeBuild: true,
          });
        }
      }
    }

    // 2. Build next Wonder stage
    if (nextWonderStage && wonderPayments.length > 0) {
      for (const pay of wonderPayments) {
        actions.push({
          type: "SELECT_DRAFT_ACTION",
          kind: "wonder",
          cardId: card.id,
          payment: pay,
        });
      }
    }

    // 3. Discard for +3 coins (always legal!)
    actions.push({
      type: "SELECT_DRAFT_ACTION",
      kind: "discard",
      cardId: card.id,
      payment: { leftCoins: 0, rightCoins: 0 },
    });
  }

  return actions;
}

function appendSwEvent(
  eventLog: readonly GameEvent[],
  batch: readonly GameEvent[],
  turn: number,
  type: string,
  message: string,
  playerId?: string
): { readonly eventLog: GameEvent[]; readonly batch: GameEvent[] } {
  const evt: GameEvent = {
    id: `evt-${eventLog.length}`,
    timestamp: eventLog.length,
    turn,
    playerId,
    type,
    message,
  };
  return {
    eventLog: [...eventLog, evt],
    batch: [...batch, evt],
  };
}

function resolveEndOfAgeOrFinish(
  state: SevenWondersState,
  incomingEvents: readonly GameEvent[]
): { state: SevenWondersState; events: GameEvent[] } {
  let eventLog = [...state.eventLog];
  let batch = [...incomingEvents];
  const n = state.players.length;
  const victoryPointsForAge: 1 | 3 | 5 =
    state.age === 1 ? 1 : state.age === 2 ? 3 : 5;

  const shieldsByIndex = state.players.map((p) => getPlayerShields(p));

  const updatedAfterWar: SevenWondersPlayerState[] = state.players.map(
    (p, idx) => {
      const leftIdx = getLeftNeighborIndex(idx, n);
      const rightIdx = getRightNeighborIndex(idx, n);
      const myShields = shieldsByIndex[idx]!;
      const newTokens = [...p.militaryTokens];

      for (const oppIdx of [leftIdx, rightIdx]) {
        const oppShields = shieldsByIndex[oppIdx]!;
        const opp = state.players[oppIdx]!;
        if (myShields > oppShields) {
          newTokens.push({
            age: state.age,
            points: victoryPointsForAge,
            opponentId: opp.id,
          });
        } else if (myShields < oppShields) {
          newTokens.push({
            age: state.age,
            points: -1,
            opponentId: opp.id,
          });
        }
      }

      return {
        ...p,
        militaryTokens: newTokens,
      };
    }
  );

  const warSummary = updatedAfterWar
    .map((p, idx) => `${p.name} (${shieldsByIndex[idx]} shields)`)
    .join(", ");
  ({ eventLog, batch } = appendSwEvent(
    eventLog,
    batch,
    state.turn,
    "MILITARY_CONFLICT",
    `Age ${state.age} military conflicts resolved: ${warSummary}.`
  ));

  if (state.age < 3) {
    const nextAge = (state.age + 1) as 2 | 3;
    const nextPass: "clockwise" | "counter_clockwise" =
      nextAge === 2 ? "counter_clockwise" : "clockwise";
    const dealtPlayers = refreshAllPlayerScores(
      dealHandsToPlayers(updatedAfterWar, state.ageDecks[nextAge])
    );

    ({ eventLog, batch } = appendSwEvent(
      eventLog,
      batch,
      state.turn + 1,
      "AGE_START",
      `Age ${nextAge === 2 ? "II" : "III"} begins (passing ${
        nextPass === "clockwise" ? "clockwise" : "counter-clockwise"
      }).`
    ));

    return {
      state: {
        ...state,
        phase: "AGE_DRAFT",
        age: nextAge,
        draftRound: 1,
        turn: state.turn + 1,
        passDirection: nextPass,
        players: dealtPlayers,
        pendingChoices: {},
        lockedPlayerIds: [],
        seventhCardQueue: [],
        halikarnassusQueue: [],
        eventLog,
      },
      events: batch,
    };
  }

  // End of Age III -> GAME_OVER!
  const finalPlayers = refreshAllPlayerScores(updatedAfterWar);
  const ranked = [...finalPlayers].sort(
    (a, b) =>
      b.scoreBreakdown.totalVp - a.scoreBreakdown.totalVp ||
      b.coins - a.coins
  );
  const winner = ranked[0]!;

  ({ eventLog, batch } = appendSwEvent(
    eventLog,
    batch,
    state.turn,
    "GAME_OVER",
    `Era complete! ${winner.name} triumphs with ${winner.scoreBreakdown.totalVp} Victory Points (${winner.coins} treasury coins).`,
    winner.id
  ));

  return {
    state: {
      ...state,
      phase: "GAME_OVER",
      players: finalPlayers,
      pendingChoices: {},
      lockedPlayerIds: [],
      seventhCardQueue: [],
      halikarnassusQueue: [],
      winnerId: winner.id,
      eventLog,
    },
    events: batch,
  };
}

function advancePostTurnQueuesOrNextRound(
  state: SevenWondersState,
  incomingEvents: readonly GameEvent[]
): { state: SevenWondersState; events: GameEvent[] } {
  let eventLog = [...state.eventLog];
  let batch = [...incomingEvents];

  // 1. If we just finished round 6 (players still hold 1 remaining 7th card):
  // Check Babylon B2 (`play_seventh_card`) vs discarding remaining 7th cards BEFORE Halikarnassus!
  if (
    state.draftRound === 6 &&
    state.seventhCardQueue.length === 0 &&
    state.players.some((p) => p.hand.length > 0)
  ) {
    const seventhPlayers: string[] = [];
    let nextDiscardPile = [...state.discardPile];
    const updatedPlayers = state.players.map((p) => {
      if (p.hand.length === 0) return p;
      if (hasWonderStageEffect(p, "play_seventh_card")) {
        seventhPlayers.push(p.id);
        return p;
      }
      nextDiscardPile = [...nextDiscardPile, ...p.hand];
      return { ...p, hand: [] };
    });

    if (seventhPlayers.length > 0) {
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        state.turn,
        "BABYLON_SEVENTH_CARD",
        `Hanging Gardens of Babylon activates — playing the 7th card of Age ${state.age}.`,
        seventhPlayers[0]
      ));
      return {
        state: {
          ...state,
          phase: "SEVENTH_CARD_PLAY",
          players: refreshAllPlayerScores(updatedPlayers),
          discardPile: nextDiscardPile,
          seventhCardQueue: seventhPlayers,
          eventLog,
        },
        events: batch,
      };
    }

    state = {
      ...state,
      players: refreshAllPlayerScores(updatedPlayers),
      discardPile: nextDiscardPile,
      eventLog,
    };
  }

  if (state.seventhCardQueue.length > 0) {
    return {
      state: {
        ...state,
        phase: "SEVENTH_CARD_PLAY",
        eventLog,
      },
      events: batch,
    };
  }

  // 2. Halikarnassus free build from discard pile (only if discardPile has at least 1 non-duplicate card for that player)
  const validHalikarnassusQueue = state.halikarnassusQueue.filter((pid) => {
    const pl = state.players.find((x) => x.id === pid);
    return Boolean(
      pl &&
        state.discardPile.length > 0 &&
        state.discardPile.some((c) => !hasDuplicateCardName(pl, c.name))
    );
  });

  if (validHalikarnassusQueue.length > 0) {
    return {
      state: {
        ...state,
        phase: "HALIKARNASSUS_PICK",
        halikarnassusQueue: validHalikarnassusQueue,
        eventLog,
      },
      events: batch,
    };
  }

  // 3. End of Round 6 -> Resolve Military & Next Age / Game Over
  if (state.draftRound >= 6) {
    return resolveEndOfAgeOrFinish(
      {
        ...state,
        halikarnassusQueue: [],
        eventLog,
      },
      batch
    );
  }

  // 4. Otherwise rotate hands and advance draftRound (1..5 -> 2..6)
  const n = state.players.length;
  const handsSnapshot = state.players.map((p) => p.hand);
  const rotatedPlayers = state.players.map((p, idx) => {
    // Clockwise means player i passes hand to (i + 1) % n -> so player idx receives from (idx - 1 + n) % n!
    // Counter-clockwise means player i passes hand to (i - 1 + n) % n -> so player idx receives from (idx + 1) % n!
    const senderIdx =
      state.passDirection === "clockwise"
        ? getLeftNeighborIndex(idx, n)
        : getRightNeighborIndex(idx, n);
    const nextHand = handsSnapshot[senderIdx]!;
    return {
      ...p,
      hand: nextHand,
      seenHandsThisAge: [...(p.seenHandsThisAge ?? []), nextHand],
    };
  });

  return {
    state: {
      ...state,
      phase: "AGE_DRAFT",
      draftRound: state.draftRound + 1,
      turn: state.turn + 1,
      players: refreshAllPlayerScores(rotatedPlayers),
      pendingChoices: {},
      lockedPlayerIds: [],
      halikarnassusQueue: [],
      eventLog,
    },
    events: batch,
  };
}

function applySingleChoiceEffectsToTables(
  players: readonly SevenWondersPlayerState[],
  choicesByPlayerId: Readonly<Record<string, NonNullable<SevenWondersState["pendingChoices"][string]>>>,
  age: SevenWondersAge,
  discardPile: readonly SevenWondersCard[],
  turn: number,
  initialEventLog: readonly GameEvent[],
  initialBatch: readonly GameEvent[]
): {
  readonly players: SevenWondersPlayerState[];
  readonly discardPile: SevenWondersCard[];
  readonly halikarnassusTriggered: string[];
  readonly eventLog: GameEvent[];
  readonly batch: GameEvent[];
} {
  const n = players.length;
  let eventLog = [...initialEventLog];
  let batch = [...initialBatch];
  let nextDiscard = [...discardPile];
  const halikarnassusTriggered: string[] = [];

  // Step 1: Deduct card coin costs + neighbor trade payments, credit neighbors, and place cards/stages
  const coinDeltas = players.map(() => 0);
  const builtCardThisStep: (SevenWondersCard | null)[] = players.map(() => null);
  const builtWonderStageThisStep: (number | null)[] = players.map(() => null);

  const afterPlacement = players.map((p, idx) => {
    const ch = choicesByPlayerId[p.id];
    if (!ch) return p;

    const card = p.hand.find((c) => c.id === ch.cardId)!;
    const remainingHand = p.hand.filter((c) => c.id !== ch.cardId);
    const leftIdx = getLeftNeighborIndex(idx, n);
    const rightIdx = getRightNeighborIndex(idx, n);

    if (ch.payment.leftCoins > 0) {
      coinDeltas[idx]! -= ch.payment.leftCoins;
      coinDeltas[leftIdx]! += ch.payment.leftCoins;
    }
    if (ch.payment.rightCoins > 0) {
      coinDeltas[idx]! -= ch.payment.rightCoins;
      coinDeltas[rightIdx]! += ch.payment.rightCoins;
    }

    if (ch.kind === "build") {
      const viaChain = canPlayerBuildViaChain(p, card);
      if (!viaChain && !ch.useFreeBuild && card.coinCost > 0) {
        coinDeltas[idx]! -= card.coinCost;
      }
      builtCardThisStep[idx] = card;
      return {
        ...p,
        hand: remainingHand,
        tableau: [...p.tableau, card],
        usedFreeBuildInAge: ch.useFreeBuild
          ? { ...p.usedFreeBuildInAge, [age]: true }
          : p.usedFreeBuildInAge,
      };
    }

    if (ch.kind === "wonder") {
      const nextStageCount = p.builtWonderStages + 1;
      builtWonderStageThisStep[idx] = nextStageCount;
      return {
        ...p,
        hand: remainingHand,
        builtWonderStages: nextStageCount,
        tuckedWonderCardIds: [...p.tuckedWonderCardIds, card.id],
      };
    }

    // ch.kind === "discard"
    coinDeltas[idx]! += 3;
    nextDiscard = [...nextDiscard, card];
    return {
      ...p,
      hand: remainingHand,
    };
  });

  // Step 2: Evaluate immediate coin grants from newly built cards & Wonder stages AFTER all structures entered play
  afterPlacement.forEach((p, idx) => {
    const builtCard = builtCardThisStep[idx];
    if (builtCard) {
      const gained = evaluateImmediateCardCoins(afterPlacement, idx, builtCard);
      coinDeltas[idx]! += gained;
      const ch = choicesByPlayerId[p.id]!;
      const tradePaid = ch.payment.leftCoins + ch.payment.rightCoins;
      const suffix = ch.useFreeBuild
        ? " (Olympia free build)"
        : canPlayerBuildViaChain(
              players[idx]!,
              builtCard
            )
          ? " (free chain)"
          : tradePaid > 0
            ? ` (${tradePaid}c neighbor trade)`
            : "";
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "BUILD_STRUCTURE",
        `${p.name} built ${builtCard.name}${suffix}.`,
        p.id
      ));
    }

    const stageNum = builtWonderStageThisStep[idx];
    if (stageNum !== null) {
      const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
      const stDef = board.stages[stageNum - 1]!;
      for (const ef of stDef.effects) {
        if (ef.kind === "coins") {
          coinDeltas[idx]! += ef.coins;
        }
        if (ef.kind === "build_from_discard") {
          halikarnassusTriggered.push(p.id);
        }
      }
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "BUILD_WONDER_STAGE",
        `${p.name} completed ${board.name} Stage ${stageNum} (${stDef.summary}).`,
        p.id
      ));
    }

    const ch = choicesByPlayerId[p.id];
    if (ch?.kind === "discard") {
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "DISCARD_FOR_COINS",
        `${p.name} sold a card for +3 coins.`,
        p.id
      ));
    }
  });

  const withCoins = afterPlacement.map((p, idx) => ({
    ...p,
    coins: p.coins + coinDeltas[idx]!,
  }));

  return {
    players: refreshAllPlayerScores(withCoins),
    discardPile: nextDiscard,
    halikarnassusTriggered,
    eventLog,
    batch,
  };
}

export function canPlayerUnselectDraftPick(
  state: SevenWondersState,
  playerId: string
): boolean {
  return (
    state.phase === "AGE_DRAFT" &&
    state.lockedPlayerIds.includes(playerId) &&
    state.players.some((p) => p.id === playerId)
  );
}

export function applySevenWondersAction(
  state: SevenWondersState,
  playerId: string,
  action: SevenWondersAction
): { state: SevenWondersState; events: GameEvent[] } {
  if (state.phase === "GAME_OVER") {
    throw new Error("Game is already over");
  }

  if (action.type === "UNSELECT_DRAFT_ACTION") {
    if (!canPlayerUnselectDraftPick(state, playerId)) {
      throw new Error(
        `Player ${playerId} does not have an unrevealed draft pick to unlock`
      );
    }
    const nextPending: Record<
      string,
      NonNullable<SevenWondersState["pendingChoices"][string]>
    > = {};
    for (const [pid, ch] of Object.entries(state.pendingChoices)) {
      if (pid !== playerId && ch) {
        nextPending[pid] = ch;
      }
    }
    return {
      state: {
        ...state,
        pendingChoices: nextPending,
        lockedPlayerIds: state.lockedPlayerIds.filter((pid) => pid !== playerId),
      },
      events: [],
    };
  }

  const legal = getSevenWondersLegalActions(state, playerId);
  const matched = legal.find((cand) => {
    if (cand.type !== action.type) return false;
    if (cand.type === "SKIP_DISCARD_BUILD" && action.type === "SKIP_DISCARD_BUILD") {
      return true;
    }
    if (cand.type === "BUILD_FROM_DISCARD" && action.type === "BUILD_FROM_DISCARD") {
      return cand.cardId === action.cardId;
    }
    if (cand.type === "SELECT_DRAFT_ACTION" && action.type === "SELECT_DRAFT_ACTION") {
      const aPay = action.payment ?? { leftCoins: 0, rightCoins: 0 };
      const cPay = cand.payment ?? { leftCoins: 0, rightCoins: 0 };
      return (
        cand.kind === action.kind &&
        cand.cardId === action.cardId &&
        cPay.leftCoins === aPay.leftCoins &&
        cPay.rightCoins === aPay.rightCoins &&
        Boolean(cand.useFreeBuild) === Boolean(action.useFreeBuild)
      );
    }
    return false;
  });

  if (!matched) {
    throw new Error(
      `Illegal 7 Wonders action ${JSON.stringify(action)} for player ${playerId} in phase ${state.phase}`
    );
  }

  if (state.phase === "HALIKARNASSUS_PICK") {
    const pIdx = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[pIdx]!;
    const remainingQueue = state.halikarnassusQueue.slice(1);

    if (action.type === "SKIP_DISCARD_BUILD") {
      const { eventLog, batch } = appendSwEvent(
        state.eventLog,
        [],
        state.turn,
        "HALIKARNASSUS_SKIP",
        `${player.name} skipped building from the discard pile.`,
        playerId
      );
      return advancePostTurnQueuesOrNextRound(
        {
          ...state,
          halikarnassusQueue: remainingQueue,
          eventLog,
        },
        batch
      );
    }

    if (action.type === "BUILD_FROM_DISCARD") {
      const cardIdx = state.discardPile.findIndex((c) => c.id === action.cardId);
      const card = state.discardPile[cardIdx]!;
      const nextDiscard = state.discardPile.filter((_, idx) => idx !== cardIdx);
      const updatedPlayersPrelim = state.players.map((p, idx) =>
        idx === pIdx ? { ...p, tableau: [...p.tableau, card] } : p
      );
      const gainedCoins = evaluateImmediateCardCoins(
        updatedPlayersPrelim,
        pIdx,
        card
      );
      const updatedPlayers = refreshAllPlayerScores(
        updatedPlayersPrelim.map((p, idx) =>
          idx === pIdx ? { ...p, coins: p.coins + gainedCoins } : p
        )
      );
      const { eventLog, batch } = appendSwEvent(
        state.eventLog,
        [],
        state.turn,
        "HALIKARNASSUS_BUILD",
        `${player.name} rescued ${card.name} from the discard pile for free!`,
        playerId
      );

      return advancePostTurnQueuesOrNextRound(
        {
          ...state,
          players: updatedPlayers,
          discardPile: nextDiscard,
          halikarnassusQueue: remainingQueue,
          eventLog,
        },
        batch
      );
    }
  }

  if (state.phase === "SEVENTH_CARD_PLAY" && action.type === "SELECT_DRAFT_ACTION") {
    const choice = {
      kind: action.kind,
      cardId: action.cardId,
      payment: action.payment ?? { leftCoins: 0, rightCoins: 0 },
      useFreeBuild: action.useFreeBuild,
    };
    const applied = applySingleChoiceEffectsToTables(
      state.players,
      { [playerId]: choice },
      state.age,
      state.discardPile,
      state.turn,
      state.eventLog,
      []
    );
    return advancePostTurnQueuesOrNextRound(
      {
        ...state,
        players: applied.players,
        discardPile: applied.discardPile,
        seventhCardQueue: state.seventhCardQueue.slice(1),
        halikarnassusQueue: [
          ...state.halikarnassusQueue,
          ...applied.halikarnassusTriggered,
        ],
        eventLog: applied.eventLog,
      },
      applied.batch
    );
  }

  // state.phase === "AGE_DRAFT"
  if (action.type !== "SELECT_DRAFT_ACTION") {
    throw new Error(`Expected SELECT_DRAFT_ACTION during AGE_DRAFT`);
  }

  const choice = {
    kind: action.kind,
    cardId: action.cardId,
    payment: action.payment ?? { leftCoins: 0, rightCoins: 0 },
    useFreeBuild: action.useFreeBuild,
  };
  const nextPending = {
    ...state.pendingChoices,
    [playerId]: choice,
  };
  const nextLocked = state.lockedPlayerIds.includes(playerId)
    ? state.lockedPlayerIds
    : [...state.lockedPlayerIds, playerId];

  // Wait until all players have locked in their simultaneous draft pick
  if (Object.keys(nextPending).length < state.players.length) {
    return {
      state: {
        ...state,
        pendingChoices: nextPending,
        lockedPlayerIds: nextLocked,
      },
      events: [],
    };
  }

  // All players have chosen — resolve simultaneous reveal!
  const resolved = applySingleChoiceEffectsToTables(
    state.players,
    nextPending,
    state.age,
    state.discardPile,
    state.turn,
    state.eventLog,
    []
  );

  return advancePostTurnQueuesOrNextRound(
    {
      ...state,
      players: resolved.players,
      discardPile: resolved.discardPile,
      pendingChoices: {},
      lockedPlayerIds: [],
      halikarnassusQueue: [
        ...state.halikarnassusQueue,
        ...resolved.halikarnassusTriggered,
      ],
      eventLog: resolved.eventLog,
    },
    resolved.batch
  );
}

export function getSevenWondersPlayerView(
  state: SevenWondersState,
  viewerPlayerId: string | null
): SevenWondersState {
  if (state.phase === "GAME_OVER") {
    return state;
  }

  const canInspectDiscard =
    state.phase === "HALIKARNASSUS_PICK" &&
    viewerPlayerId !== null &&
    state.halikarnassusQueue[0] === viewerPlayerId;

  const redactedPlayers = state.players.map((p) => {
    if (viewerPlayerId && p.id === viewerPlayerId) {
      return {
        ...p,
        handRedacted: false,
        hiddenHandCount: p.hand.length,
      };
    }
    return {
      ...p,
      hand: [],
      seenHandsThisAge: [],
      tuckedWonderCardIds: p.tuckedWonderCardIds.map(
        (_, idx) => `hidden-tucked-${p.id}-${idx}`
      ),
      handRedacted: true,
      hiddenHandCount: p.hand.length,
    };
  });

  const redactedPending: Record<string, SevenWondersState["pendingChoices"][string]> = {};
  if (viewerPlayerId && state.pendingChoices[viewerPlayerId]) {
    redactedPending[viewerPlayerId] = state.pendingChoices[viewerPlayerId]!;
  }

  return {
    ...state,
    rngState: 0,
    players: redactedPlayers,
    pendingChoices: redactedPending,
    discardPile: canInspectDiscard ? state.discardPile : [],
    hiddenDiscardCount: state.discardPile.length,
    ageDecks: { 2: [], 3: [] },
  };
}

export function checkSevenWondersInvariants(
  state: SevenWondersState
): InvariantCheckResult {
  const violations: string[] = [];

  if (state.players.length < 3 || state.players.length > 7) {
    violations.push(`Invalid player count ${state.players.length}`);
  }

  const wonderIds = new Set<string>();
  for (const p of state.players) {
    if (wonderIds.has(p.wonderId)) {
      violations.push(`Duplicate wonder ${p.wonderId} assigned`);
    }
    wonderIds.add(p.wonderId);

    if (p.coins < 0) {
      violations.push(`Player ${p.id} has negative coins (${p.coins})`);
    }

    const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
    if (p.builtWonderStages < 0 || p.builtWonderStages > board.stages.length) {
      violations.push(
        `Player ${p.id} has out-of-range wonder stages ${p.builtWonderStages}`
      );
    }

    const names = new Set<string>();
    for (const c of p.tableau) {
      if (names.has(c.name)) {
        violations.push(
          `Player ${p.id} built duplicate structure name "${c.name}"`
        );
      }
      names.add(c.name);
    }

    const expectedScore = computeSevenWondersScoreBreakdown(
      state.players,
      state.players.indexOf(p)
    );
    if (p.scoreBreakdown.totalVp !== expectedScore.totalVp) {
      violations.push(
        `Player ${p.id} scoreBreakdown mismatch: stored ${p.scoreBreakdown.totalVp} vs computed ${expectedScore.totalVp}`
      );
    }
  }

  if (state.phase === "AGE_DRAFT") {
    const expectedHandSize = 8 - state.draftRound;
    for (const p of state.players) {
      const actualCount = p.handRedacted
        ? (p.hiddenHandCount ?? 0)
        : p.hand.length;
      if (actualCount !== expectedHandSize) {
        violations.push(
          `Player ${p.id} hand size ${actualCount} !== expected ${expectedHandSize} at Age ${state.age} Round ${state.draftRound}`
        );
      }
    }
  }

  if (state.phase === "GAME_OVER" && !state.winnerId) {
    violations.push("GAME_OVER state missing winnerId");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
