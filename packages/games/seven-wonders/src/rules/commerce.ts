import {
  SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST,
  SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST,
} from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  type NeighborPayment,
  type ResourceProductionChoice,
  type SevenWondersPlayerState,
  WONDER_RESOURCES,
  type WonderResource,
  type WonderResourceMap,
} from "../types.ts";
import {
  emptyWonderResourceMap,
  getLeftNeighborIndex,
  getRightNeighborIndex,
  hasWonderStageEffect,
  isRawResource,
} from "./helpers.ts";

export interface ResourceProfile {
  readonly fixed: WonderResourceMap;
  readonly choices: readonly ResourceProductionChoice[];
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
    rawLeft: rawLeftDiscount
      ? SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST
      : SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST,
    rawRight: rawRightDiscount
      ? SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST
      : SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST,
    manufacturedLeft: mfgBothDiscount
      ? SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST
      : SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST,
    manufacturedRight: mfgBothDiscount
      ? SEVEN_WONDERS_DISCOUNTED_NEIGHBOR_TRADE_COST
      : SEVEN_WONDERS_BASE_NEIGHBOR_TRADE_COST,
  };
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
        neededList.some(
          (r) => lPool[r] + rightProfile.fixed[r] + rightProfile.choices.length < need[r]
        )
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
