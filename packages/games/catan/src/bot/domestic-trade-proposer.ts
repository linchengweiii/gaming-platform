import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BANK_LIMITS, BUILDING_COSTS } from "../config/costs-and-limits.ts";
import {
  emptyResources,
  getPlayerResourceCount,
  getPlayerTradeRatios,
  isExpanded56State,
} from "../rules/helpers.ts";
import {
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
} from "../rules/network.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { canHandWinThisTurnDeterministically } from "./lethal-targets.ts";
import { isOpponentEmbargoedForTrade } from "./trade-eval.ts";
import { computePlayerProductionPips, countResourceDeficit } from "./utils.ts";

function makeOfferSignature(
  give: Partial<ResourceMap>,
  want: Partial<ResourceMap>
): string {
  return `${RESOURCES.map((r) => give[r] ?? 0).join(",")}->${RESOURCES.map((r) => want[r] ?? 0).join(",")}`;
}

function getTurnDomesticTradeHistory(
  state: CatanState,
  playerId: string
): { count: number; seenSignatures: Set<string> } {
  let count = 0;
  const seenSignatures = new Set<string>();
  for (let i = state.eventLog.length - 1; i >= 0; i--) {
    const evt = state.eventLog[i]!;
    if (evt.turn < state.turn) break;
    if (evt.playerId === playerId && evt.type === "DOMESTIC_TRADE_OFFERED") {
      count++;
      const p = evt.payload as
        | { give?: Partial<ResourceMap>; want?: Partial<ResourceMap> }
        | undefined;
      if (p?.give && p?.want) {
        seenSignatures.add(makeOfferSignature(p.give, p.want));
      }
    }
  }
  return { count, seenSignatures };
}

/**
 * Proposes high-EV Domestic Trades:
 * - `normal`: simple 1:1 trade when 1 card short of a City or Settlement.
 * - `smart`: scarcity-aware 1:1 trade for City, Settlement, or Dev Card.
 * - `master`:
 *   1) Combo Domestic + Maritime lookahead (finds 1-card domestic swaps that combine with in-hand port trades to build immediately!),
 *   2) Opponent-lack ranking (offers the surplus resource that non-threatening opponents lack in production so acceptance jumps!),
 *   3) Strict near-victory embargo (`isOpponentEmbargoedForTrade`), only allowing an embargoed trade if it deterministically wins on this turn!
 *   4) 2-for-1 surplus sweetener when 1-for-1 is declined and port rate is >= 3:1!
 */
export function findStrategicDomesticTradeOffer(
  state: CatanState,
  player: CatanPlayerState,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction | null {
  if (weights.maxDomesticOffersPerTurn <= 0) return null;
  if (state.activeTradeOffer) return null;

  const diff = player.botDifficulty ?? "smart";
  const history = getTurnDomesticTradeHistory(state, player.id);
  if (history.count >= weights.maxDomesticOffersPerTurn) return null;

  const cardHoldingOpponents = state.players.filter(
    (p) => p.id !== player.id && getPlayerResourceCount(p) > 0
  );
  if (cardHoldingOpponents.length === 0) return null;

  const eligibleOpponents = cardHoldingOpponents.filter(
    (p) => !isOpponentEmbargoedForTrade(state, player, p.id, weights)
  );
  const onlyLethalTradesAllowed = eligibleOpponents.length === 0;
  if (onlyLethalTradesAllowed && diff !== "master") {
    return null;
  }

  const candidateTargets: Array<{
    cost: Partial<ResourceMap>;
    priority: number;
  }> = [];

  const hasSettlement = Object.values(state.buildings).some(
    (b) => b.ownerId === player.id && b.type === "settlement"
  );
  if (hasSettlement && player.citiesRemaining > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.city,
      priority: weights.cityPriority + 4,
    });
  }
  const openSettlementSpots = getLegalSettlementVertices(state, player.id, false);
  if (player.settlementsRemaining > 0 && openSettlementSpots.length > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.settlement,
      priority: weights.settlementPriority,
    });
  }
  if (diff !== "normal" && state.devCardDeck.length > 0) {
    candidateTargets.push({
      cost: BUILDING_COSTS.devCard,
      priority: weights.devCardPriority,
    });
  }
  const ckUndefendedCity =
    state.config.enableCitiesAndKnights &&
    getPlayerVulnerableCities(state, player.id).length > 0 &&
    getTotalActiveKnightStrength(state) < getBarbarianStrength(state);
  if (state.config.enableCitiesAndKnights && diff !== "normal") {
    const hasInactiveKnight = Object.values(state.knights).some(
      (k) => k.ownerId === player.id && !k.active
    );
    if (hasInactiveKnight && player.resources.grain === 0) {
      candidateTargets.push({
        cost: { grain: 1 },
        priority: ckUndefendedCity
          ? weights.cityPriority + 18
          : weights.devCardPriority + 6,
      });
    }
    candidateTargets.push({
      cost: ckUndefendedCity
        ? { wool: 1, ore: 1, grain: 1 }
        : { wool: 1, ore: 1 },
      priority: ckUndefendedCity
        ? weights.cityPriority + 14
        : weights.devCardPriority + 4,
    });
  }
  if (
    diff === "master" &&
    player.settlementsRemaining > 0 &&
    openSettlementSpots.length === 0 &&
    player.roadsRemaining > 0 &&
    getLegalRoadEdges(state, player.id, null).length > 0
  ) {
    candidateTargets.push({
      cost: BUILDING_COSTS.road,
      priority: weights.roadToSpotPriority + 3,
    });
  }
  if (
    diff === "master" &&
    state.config.enableSeafarers &&
    player.shipsRemaining > 0 &&
    getLegalShipEdges(state, player.id, null).length > 0
  ) {
    candidateTargets.push({
      cost: BUILDING_COSTS.ship,
      priority: weights.roadToSpotPriority + 4,
    });
  }

  const ratios = getPlayerTradeRatios(state, player.id);

  // Public bank-deduction supply held across all opponents (`19 - bank[r] - myHand[r]`)
  const isExpandedSupply = isExpanded56State(state);
  const maxSupplyPerRes = isExpandedSupply
    ? BANK_LIMITS.expandedPerResource
    : BANK_LIMITS.standardPerResource;
  const oppPublicSupply: Record<ResourceType, number> = emptyResources();
  for (const r of RESOURCES) {
    oppPublicSupply[r] = Math.max(
      0,
      maxSupplyPerRes - state.bank[r] - player.resources[r]
    );
  }

  const desirePool =
    eligibleOpponents.length > 0 ? eligibleOpponents : cardHoldingOpponents;
  const oppLackDesire: Record<ResourceType, number> = emptyResources();
  if (diff === "master") {
    for (const opp of desirePool) {
      const oProd = computePlayerProductionPips(state, opp.id);
      for (const r of RESOURCES) {
        oppLackDesire[r] += oProd[r] === 0 ? 2.0 : 2.5 / (oProd[r] + 2);
      }
    }
  }

  const anyExcludedOpponent =
    eligibleOpponents.length > 0 &&
    eligibleOpponents.length < cardHoldingOpponents.length;

  for (const target of candidateTargets.sort((a, b) => b.priority - a.priority)) {
    const rawDeficit = countResourceDeficit(player.resources, target.cost);
    if (rawDeficit === 0) continue;

    if (rawDeficit > 2 || (rawDeficit === 2 && diff !== "master")) continue;

    let wantRes: ResourceType | null = null;
    const reservedForPort: ResourceMap = emptyResources();

    if (rawDeficit === 1) {
      wantRes =
        RESOURCES.find((r) => player.resources[r] < (target.cost[r] ?? 0)) ??
        null;
    } else {
      const missingList: ResourceType[] = [];
      for (const r of RESOURCES) {
        const miss = (target.cost[r] ?? 0) - player.resources[r];
        for (let k = 0; k < miss; k++) missingList.push(r);
      }
      const portSource = RESOURCES.find((r) => {
        const spare = player.resources[r] - (target.cost[r] ?? 0);
        return spare >= ratios[r];
      });
      if (portSource && missingList.length === 2) {
        const bankCoverable = missingList.find((m) => state.bank[m] > 0);
        if (bankCoverable) {
          reservedForPort[portSource] = ratios[portSource];
          wantRes =
            missingList[0] === bankCoverable ? missingList[1]! : missingList[0]!;
        }
      }
    }

    if (!wantRes) continue;

    if (diff === "master" && oppPublicSupply[wantRes] <= 0) {
      if (state.bank[wantRes] <= 0) continue;
      const arbPortRes = RESOURCES.find((r) => {
        if (r === wantRes || ratios[r] > 3 || oppPublicSupply[r] <= 0) {
          return false;
        }
        const freeCards =
          player.resources[r] - (target.cost[r] ?? 0) - reservedForPort[r];
        return freeCards === ratios[r] - 1;
      });
      if (!arbPortRes) continue;
      reservedForPort[arbPortRes] += ratios[arbPortRes] - 1;
      wantRes = arbPortRes;
    }

    const spareResources = RESOURCES.filter((r) => {
      if (r === wantRes) return false;
      const keepForDefense =
        ckUndefendedCity &&
        (r === "wool" || r === "ore" || r === "grain") &&
        (target.cost[r] ?? 0) === 0
          ? 1
          : 0;
      return (
        player.resources[r] -
          (target.cost[r] ?? 0) -
          reservedForPort[r] -
          keepForDefense >=
        1
      );
    }).sort((a, b) => {
      const spareA =
        player.resources[a] - (target.cost[a] ?? 0) - reservedForPort[a];
      const spareB =
        player.resources[b] - (target.cost[b] ?? 0) - reservedForPort[b];
      if (diff === "master") {
        const scoreA =
          spareA * 1.1 + oppLackDesire[a] * 0.9 - scarcity[a] * 1.2;
        const scoreB =
          spareB * 1.1 + oppLackDesire[b] * 0.9 - scarcity[b] * 1.2;
        return scoreB - scoreA;
      }
      if (spareB !== spareA) return spareB - spareA;
      return scarcity[a] - scarcity[b];
    });

    if (spareResources.length === 0) continue;

    // When only 1 non-embargoed opponent holds cards, target them directly; when >=2 safe opponents exist,
    // broadcast `null` so all safe opponents can accept and `CONFIRM_DOMESTIC_TRADE` enforces the embargo!
    const safePartnerId =
      anyExcludedOpponent && eligibleOpponents.length === 1
        ? eligibleOpponents[0]!.id
        : null;

    for (const giveRes of spareResources) {
      const spareAmt =
        player.resources[giveRes] -
        (target.cost[giveRes] ?? 0) -
        reservedForPort[giveRes];

      const give1: Partial<ResourceMap> = { [giveRes]: 1 };
      const want1: Partial<ResourceMap> = { [wantRes]: 1 };
      const sig1 = makeOfferSignature(give1, want1);
      if (!history.seenSignatures.has(sig1)) {
        const simAfter1: ResourceMap = {
          ...player.resources,
          [giveRes]: player.resources[giveRes] - 1,
          [wantRes]: player.resources[wantRes] + 1,
        };
        if (
          !onlyLethalTradesAllowed ||
          canHandWinThisTurnDeterministically(state, player, simAfter1)
        ) {
          return {
            type: "OFFER_DOMESTIC_TRADE",
            toPlayerId: safePartnerId,
            give: give1,
            want: want1,
          };
        }
      }

      if (diff === "master" && spareAmt >= 2 && ratios[giveRes] >= 3) {
        const give2: Partial<ResourceMap> = { [giveRes]: 2 };
        const want2: Partial<ResourceMap> = { [wantRes]: 1 };
        const sig2 = makeOfferSignature(give2, want2);
        if (!history.seenSignatures.has(sig2)) {
          const simAfter2: ResourceMap = {
            ...player.resources,
            [giveRes]: player.resources[giveRes] - 2,
            [wantRes]: player.resources[wantRes] + 1,
          };
          if (
            !onlyLethalTradesAllowed ||
            canHandWinThisTurnDeterministically(state, player, simAfter2)
          ) {
            return {
              type: "OFFER_DOMESTIC_TRADE",
              toPlayerId: safePartnerId,
              give: give2,
              want: want2,
            };
          }
        }
      }
    }
  }

  return null;
}
