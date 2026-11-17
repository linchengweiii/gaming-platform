import { getPlayerGoodCount } from "../cities-and-knights/helpers.ts";
import {
  getPlayerGoodTradeRatios,
  getPlayerVulnerableCities,
} from "../cities-and-knights/improvements.ts";
import { DISCIPLINE_TO_COMMODITY } from "../config/cities-knights-config.ts";
import {
  BANK_LIMITS,
  NUMBER_TOKEN_PIPS,
} from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getPlayerResourceCount, isExpanded56State } from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import type {
  ImprovementDiscipline,
  ProgressCardType,
  ResourceType,
  TradeGoodType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { chooseCkPreUpgradeDefenseAction } from "./ck-knights-ai.ts";
import { scoreMasterMainProgressCard } from "./ck-progress-master-ai.ts";

function scoreStandardMainProgressCard(
  state: CatanState,
  player: CatanPlayerState,
  act: Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }>,
  cType: ProgressCardType,
  maxResBank: number,
  maxCommBank: number,
  ratios: Record<TradeGoodType, number>
): number {
  const playerId = player.id;
  switch (cType) {
    case "mining":
    case "irrigation":
      return 34;
    case "merchant": {
      const hId = act.params?.hexId;
      const pips =
        hId && state.hexes[hId]?.numberToken
          ? NUMBER_TOKEN_PIPS[state.hexes[hId]!.numberToken!] ?? 0
          : 0;
      return (state.merchantOwnerId !== playerId ? 28 : 12) + pips * 2;
    }
    case "resource_monopoly": {
      const res = act.params?.resource;
      if (!res) return 0;
      const oppTotal = Math.max(
        0,
        maxResBank - state.bank[res] - player.resources[res]
      );
      return oppTotal >= 2 ? 16 + oppTotal * 3.5 : 0;
    }
    case "trade_monopoly": {
      const comm = act.params?.commodity;
      if (!comm) return 0;
      const oppTotal = Math.max(
        0,
        maxCommBank - state.commodityBank[comm] - player.commodities[comm]
      );
      return oppTotal >= 1 ? 18 + oppTotal * 6 : 0;
    }
    case "road_building":
      return 25;
    case "spy":
    case "master_merchant":
    case "wedding":
      return 24;
    case "bishop": {
      const hId = act.params?.hexId;
      const hNode = hId ? state.topology.hexes[hId] : undefined;
      const touchesSelf = Boolean(
        hNode?.cornerVertexIds.some(
          (vId) => state.buildings[vId]?.ownerId === playerId
        )
      );
      const oppTouchCount = (hNode?.cornerVertexIds ?? []).filter((vId) => {
        const b = state.buildings[vId];
        return b && b.ownerId !== playerId;
      }).length;
      return touchesSelf ? -20 : 14 + oppTouchCount * 6;
    }
    case "saboteur": {
      const hurtCount = state.players.filter(
        (opp) =>
          opp.id !== playerId &&
          computePlayerVictoryPoints(state, opp.id, true) >=
            computePlayerVictoryPoints(state, playerId, true) &&
          getPlayerResourceCount(opp) >= 4
      ).length;
      return hurtCount > 0 ? 15 + hurtCount * 6 : 0;
    }
    case "deserter":
      return 26;
    case "intrigue":
      return 19;
    case "diplomat": {
      const eId = act.params?.edgeId;
      const isOpp = eId && state.edges[eId]?.ownerId !== playerId;
      return isOpp ? 18 : 0;
    }
    case "inventor": {
      const h1 = act.params?.hexId1;
      const h2 = act.params?.hexId2;
      if (!h1 || !h2) return 0;
      const p1 = NUMBER_TOKEN_PIPS[state.hexes[h1]?.numberToken ?? 0] ?? 0;
      const p2 = NUMBER_TOKEN_PIPS[state.hexes[h2]?.numberToken ?? 0] ?? 0;
      const own1 = (state.topology.hexes[h1]?.cornerVertexIds ?? []).some(
        (vId) => state.buildings[vId]?.ownerId === playerId
      );
      const own2 = (state.topology.hexes[h2]?.cornerVertexIds ?? []).some(
        (vId) => state.buildings[vId]?.ownerId === playerId
      );
      if (own1 && !own2 && p2 > p1) return 14 + (p2 - p1) * 4;
      if (own2 && !own1 && p1 > p2) return 14 + (p1 - p2) * 4;
      return 0;
    }
    case "merchant_fleet": {
      const g = act.params?.good;
      if (g && getPlayerGoodCount(player, g) >= 2 && ratios[g] > 2) {
        return 13;
      }
      return 0;
    }
    case "commercial_harbor":
      return player.progressCards.length >= 3 ? 11 : 0;
    default:
      return 0;
  }
}

export function chooseCkPriorityMainAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  currentVp: number,
  targetVp: number
): CatanAction | null {
  const pre = chooseCkPreUpgradeDefenseAction(
    state,
    player,
    legalActions,
    currentVp,
    targetVp
  );
  if (pre.action) return pre.action;

  const playerId = player.id;
  const difficulty = player.botDifficulty ?? "smart";
  const myVulnCities = getPlayerVulnerableCities(state, playerId);
  const opponents = state.players.filter((p) => p.id !== playerId);

  const progressActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
      a.type === "PLAY_PROGRESS_CARD"
  );
  const chaseActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "CHASE_ROBBER_WITH_KNIGHT" }> =>
      a.type === "CHASE_ROBBER_WITH_KNIGHT"
  );
  const moveKnightActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MOVE_KNIGHT" }> =>
      a.type === "MOVE_KNIGHT"
  );

  const hasCitySlotForDiscipline = (d: ImprovementDiscipline): boolean => {
    const nextLv = player.cityImprovements[d] + 1;
    if (!state.config.enableCitiesAndKnights || nextLv > 5) return false;
    const hasOwnCity = Object.values(state.buildings).some(
      (b) => b.ownerId === playerId && b.type === "city"
    );
    if (!hasOwnCity) return false;
    const metro = state.metropolises[d];
    const wouldClaimNewMetro =
      metro.ownerId !== playerId &&
      ((nextLv === 4 && !metro.ownerId) || (nextLv === 5 && metro.level < 5));
    if (wouldClaimNewMetro && myVulnCities.length === 0) {
      return false;
    }
    return true;
  };

  // 5. High-Impact Progress Cards in Main Phase
  if (progressActs.length > 0) {
    let bestProg: CatanAction | null = null;
    let bestProgScore = difficulty === "master" ? 14 : 8;
    const isExp = isExpanded56State(state);
    const maxResBank = isExp
      ? BANK_LIMITS.expandedPerResource
      : BANK_LIMITS.standardPerResource;
    const maxCommBank = isExp
      ? BANK_LIMITS.expandedPerCommodity
      : BANK_LIMITS.standardPerCommodity;
    const ratios = getPlayerGoodTradeRatios(state, playerId);
    const myVisibleVp = computePlayerVictoryPoints(state, playerId, true);

    for (const act of progressActs) {
      const cType = player.progressCards.find((c) => c.id === act.cardId)?.type;
      if (!cType) continue;
      const s =
        difficulty === "master"
          ? scoreMasterMainProgressCard(
              state,
              player,
              act,
              cType,
              opponents,
              maxResBank,
              maxCommBank,
              ratios,
              myVisibleVp,
              hasCitySlotForDiscipline
            )
          : scoreStandardMainProgressCard(
              state,
              player,
              act,
              cType,
              maxResBank,
              maxCommBank,
              ratios
            );
      if (s > bestProgScore) {
        bestProgScore = s;
        bestProg = act;
      }
    }
    if (bestProg) return bestProg;
  }

  // 5b. Master Pre-9e Maritime Trade into Medicine-Discounted City OR High-EV Commodity Upgrades!
  if (difficulty === "master" && state.phase === "MAIN_PHASE") {
    const hasImmediateCityOrSettlement = legalActions.some(
      (a) => a.type === "BUILD_CITY" || a.type === "BUILD_SETTLEMENT"
    );
    if (!hasImmediateCityOrSettlement) {
      if (
        player.activeTurnDiscounts.medicine &&
        player.citiesRemaining > 0 &&
        Object.values(state.buildings).some(
          (b) => b.ownerId === playerId && b.type === "settlement"
        )
      ) {
        const missOre = Math.max(0, 2 - player.resources.ore);
        const missGrain = Math.max(0, 1 - player.resources.grain);
        if (missOre + missGrain === 1) {
          const needed: ResourceType = missOre === 1 ? "ore" : "grain";
          const mTrades = legalActions.filter(
            (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
              a.type === "MARITIME_TRADE" && a.receive === needed
          );
          const safeTrade = mTrades.find((t) => {
            if (t.give === "ore") {
              return player.resources.ore - t.giveAmount >= 2;
            }
            if (t.give === "grain") {
              return player.resources.grain - t.giveAmount >= 1;
            }
            return true;
          });
          if (safeTrade) return safeTrade;
        }
      }

      const craneActive = player.activeTurnDiscounts.crane;
      const hasSettlementForCity =
        player.citiesRemaining > 0 &&
        Object.values(state.buildings).some(
          (b) => b.ownerId === playerId && b.type === "settlement"
        );
      const oneCardOffCity =
        hasSettlementForCity &&
        Math.max(0, 3 - player.resources.ore) +
          Math.max(0, 2 - player.resources.grain) <=
          1;

      for (const d of ["science", "trade", "politics"] as const) {
        if (!hasCitySlotForDiscipline(d)) continue;
        const nextLv = player.cityImprovements[d] + 1;
        const metro = state.metropolises[d];
        const claimsOrStealsMetro =
          (nextLv === 4 && !metro.ownerId) ||
          (nextLv === 5 &&
            metro.ownerId !== null &&
            metro.ownerId !== playerId &&
            metro.level < 5);
        const locksThreatenedMetro =
          nextLv === 5 &&
          metro.ownerId === playerId &&
          opponents.some((o) => o.cityImprovements[d] >= 4);
        const isAqueduct = d === "science" && nextLv === 3;
        if (
          !claimsOrStealsMetro &&
          !locksThreatenedMetro &&
          !isAqueduct &&
          !craneActive
        ) {
          continue;
        }

        const reqComm = craneActive ? Math.max(1, nextLv - 1) : nextLv;
        const comm = DISCIPLINE_TO_COMMODITY[d];
        if (state.commodityBank[comm] < 1) continue;
        const missingComm = reqComm - player.commodities[comm];
        if (missingComm === 1) {
          const commTrades = legalActions
            .filter(
              (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
                a.type === "MARITIME_TRADE" &&
                a.receive === comm &&
                a.give !== comm
            )
            .sort((a, b) => a.giveAmount - b.giveAmount);

          for (const ct of commTrades) {
            if (
              oneCardOffCity &&
              !claimsOrStealsMetro &&
              (ct.give === "ore" || ct.give === "grain")
            ) {
              continue;
            }
            if (
              !claimsOrStealsMetro &&
              ct.giveAmount >= 4 &&
              (ct.give === "ore" || ct.give === "grain") &&
              getPlayerResourceCount(player) <= 7
            ) {
              continue;
            }
            return ct;
          }
        }
      }
    }
  }

  // 6. Tactical Knight Actions: Chase Robber off our hex, or displace / road-break opponent!
  if (chaseActs.length > 0 && (!pre.cityInDanger || pre.stepsLeft >= 3)) {
    const robberTouchesMe = (
      state.topology.hexes[state.robberHexId]?.cornerVertexIds ?? []
    ).some((vId) => state.buildings[vId]?.ownerId === playerId);
    if (robberTouchesMe) {
      const goodChase = chaseActs.find((act) => {
        const hNode = state.topology.hexes[act.hexId];
        return (
          hNode &&
          !hNode.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === playerId
          ) &&
          hNode.cornerVertexIds.some((vId) => Boolean(state.buildings[vId]))
        );
      });
      if (goodChase) return goodChase;
    }
  }

  if (moveKnightActs.length > 0 && (!pre.cityInDanger || pre.stepsLeft >= 3)) {
    const displacingMove = moveKnightActs.find((m) =>
      Boolean(state.knights[m.toVertexId])
    );
    if (displacingMove) return displacingMove;
  }

  return null;
}
