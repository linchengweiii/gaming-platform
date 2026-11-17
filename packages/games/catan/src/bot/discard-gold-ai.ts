import type { BotDifficulty } from "@gaming-platform/core";
import {
  isCommodityType,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { emptyResources } from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  type CommodityMap,
  type ImprovementDiscipline,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  TRADE_GOODS,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { evaluateHandStrategicValue } from "./trade-eval.ts";
import { computeBoardScarcity, computePlayerProductionPips } from "./utils.ts";

function chooseCkDiscardWithCommodities(
  state: CatanState,
  player: CatanPlayerState,
  needed: number
): CatanAction {
  const scarcity = computeBoardScarcity(state);
  const remRes: ResourceMap = { ...player.resources };
  const remComm: CommodityMap = { ...player.commodities };
  const dropRes: Partial<ResourceMap> = {};
  const dropComm: Partial<CommodityMap> = {};

  const scoreDropPenalty = (good: TradeGoodType): number => {
    if (isCommodityType(good)) {
      const disc: ImprovementDiscipline =
        good === "paper" ? "science" : good === "cloth" ? "trade" : "politics";
      const curLvl = player.cityImprovements[disc];
      if (curLvl >= 5) return 0.5;
      const nextReq = Math.max(
        1,
        curLvl + 1 - (player.activeTurnDiscounts.crane ? 1 : 0)
      );
      const held = remComm[good];
      // Surplus above next upgrade cost is cheap to drop; cards needed for upgrade are precious!
      if (held > nextReq) return 1.4;
      const metroAvailable =
        (curLvl === 3 && state.metropolises[disc].ownerId === null) ||
        (curLvl === 4 && state.metropolises[disc].level < 5);
      const discBias = disc === "science" ? 2.5 : disc === "trade" ? 1.8 : 1.5;
      return (
        6.5 +
        discBias +
        (metroAvailable ? 4.5 : 0) -
        Math.max(0, nextReq - held)
      );
    }
    const held = remRes[good];
    const base =
      good === "ore"
        ? 4.8
        : good === "grain"
          ? 4.6
          : good === "wool"
            ? 3.4
            : 2.8;
    return (base * scarcity[good]) / Math.max(1, held * 0.65);
  };

  for (let step = 0; step < needed; step++) {
    let bestGood: TradeGoodType | null = null;
    let lowestPenalty = Infinity;
    for (const g of TRADE_GOODS) {
      const avail = isCommodityType(g) ? remComm[g] : remRes[g];
      if (avail <= 0) continue;
      const pen = scoreDropPenalty(g);
      if (pen < lowestPenalty) {
        lowestPenalty = pen;
        bestGood = g;
      }
    }
    if (!bestGood) break;
    if (isCommodityType(bestGood)) {
      remComm[bestGood] -= 1;
      dropComm[bestGood] = (dropComm[bestGood] ?? 0) + 1;
    } else {
      remRes[bestGood] -= 1;
      dropRes[bestGood] = (dropRes[bestGood] ?? 0) + 1;
    }
  }

  return {
    type: "DISCARD_CARDS",
    resources: dropRes,
    ...(totalCommodityCount(dropComm) > 0 ? { commodities: dropComm } : {}),
  };
}

/**
 * Computes the discard combination when a 7 is rolled.
 * - `easy`: first legal discard
 * - `normal`: fast greedy discard from largest resource stacks
 * - `smart` / `master`: exact DFS hand-preservation solver maximizing post-discard build potential!
 */
export function chooseOptimalDiscardAction(
  state: CatanState,
  player: CatanPlayerState,
  needed: number,
  weights: CatanBotWeights,
  fallbackLegal: CatanAction[]
): CatanAction {
  const diff = player.botDifficulty ?? "smart";
  if (diff === "easy") {
    return fallbackLegal[0]!;
  }

  if (
    state.config.enableCitiesAndKnights &&
    totalCommodityCount(player.commodities) > 0
  ) {
    return chooseCkDiscardWithCommodities(state, player, needed);
  }

  if (diff === "normal") {
    const greedyResult = Array.from({ length: needed }).reduce<{
      remHand: ResourceMap;
      discard: Partial<ResourceMap>;
    }>(
      (acc) => {
        const best = RESOURCES.reduce<{ res: ResourceType; cnt: number }>(
          (b, r) =>
            acc.remHand[r] > b.cnt ? { res: r, cnt: acc.remHand[r] } : b,
          { res: "wool", cnt: -1 }
        );
        if (best.cnt <= 0) return acc;
        return {
          remHand: {
            ...acc.remHand,
            [best.res]: acc.remHand[best.res] - 1,
          },
          discard: {
            ...acc.discard,
            [best.res]: (acc.discard[best.res] ?? 0) + 1,
          },
        };
      },
      { remHand: { ...player.resources }, discard: {} }
    );
    return { type: "DISCARD_CARDS", resources: greedyResult.discard };
  }

  const scarcity = computeBoardScarcity(state);
  const prod = computePlayerProductionPips(state, player.id);
  const resList = RESOURCES;

  function searchBestDiscard(
    idx: number,
    rem: number,
    partialDiscard: ResourceMap
  ): { bestScore: number; bestDiscard: ResourceMap | null } {
    if (idx === 4) {
      const rLast = resList[4]!;
      if (rem > player.resources[rLast]) {
        return { bestScore: -Infinity, bestDiscard: null };
      }
      const fullDiscard: ResourceMap = { ...partialDiscard, [rLast]: rem };
      const kept: ResourceMap = {
        brick: player.resources.brick - fullDiscard.brick,
        lumber: player.resources.lumber - fullDiscard.lumber,
        wool: player.resources.wool - fullDiscard.wool,
        grain: player.resources.grain - fullDiscard.grain,
        ore: player.resources.ore - fullDiscard.ore,
      };
      const score = evaluateHandStrategicValue(
        state,
        player,
        kept,
        weights,
        scarcity,
        prod,
        false
      );
      return { bestScore: score, bestDiscard: fullDiscard };
    }

    const r = resList[idx]!;
    const maxTake = Math.min(rem, player.resources[r]);
    const minTake = Math.max(
      0,
      rem -
        resList
          .slice(idx + 1)
          .reduce<number>((acc, rk) => acc + player.resources[rk], 0)
    );

    return Array.from(
      { length: Math.max(0, maxTake - minTake + 1) },
      (_, offset) => minTake + offset
    ).reduce<{ bestScore: number; bestDiscard: ResourceMap | null }>(
      (acc, take) => {
        const sub = searchBestDiscard(idx + 1, rem - take, {
          ...partialDiscard,
          [r]: take,
        });
        return sub.bestScore > acc.bestScore ? sub : acc;
      },
      { bestScore: -Infinity, bestDiscard: null }
    );
  }

  const solved = searchBestDiscard(0, needed, emptyResources());
  if (solved.bestDiscard) {
    const cleaned = Object.fromEntries(
      RESOURCES.filter((r) => solved.bestDiscard![r] > 0).map((r) => [
        r,
        solved.bestDiscard![r],
      ])
    ) as Partial<ResourceMap>;
    return { type: "DISCARD_CARDS", resources: cleaned };
  }

  return fallbackLegal[0]!;
}

export function chooseGoldResourceAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction {
  if (difficulty === "easy") {
    return legalActions[0]!;
  }
  let bestPick = legalActions[0]!;
  let bestVal = -Infinity;
  for (const act of legalActions) {
    if (act.type === "SELECT_GOLD_RESOURCE") {
      const nextHand: ResourceMap = {
        ...player.resources,
        [act.resource]: player.resources[act.resource] + 1,
      };
      const v = evaluateHandStrategicValue(
        state,
        player,
        nextHand,
        weights,
        scarcity,
        myProd,
        state.players[state.activePlayerIndex]?.id === playerId
      );
      if (v > bestVal) {
        bestVal = v;
        bestPick = act;
      }
    }
  }
  return bestPick;
}
