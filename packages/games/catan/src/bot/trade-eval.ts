import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getPlayerActiveKnightStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import {
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  totalResourceCount,
} from "../rules/helpers.ts";
import { getLegalSettlementVertices } from "../rules/network.ts";
import {
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  countResourceDeficit,
  estimatePublicPlayerThreatVp,
  grantsNewIslandBonusVp,
} from "./utils.ts";

/**
 * Determines whether `oppId` must be strictly embargoed from Domestic Trading by `me`.
 * Uses 100% public information (visible VP, unplayed dev card count, and imminent +2/+3 VP awards).
 */
export function isOpponentEmbargoedForTrade(
  state: CatanState,
  me: CatanPlayerState,
  oppId: string,
  weights: CatanBotWeights
): boolean {
  if (weights.leaderEmbargoMargin <= 0) return false;
  const opp = state.players.find((p) => p.id === oppId);
  if (!opp) return true;

  const diff = me.botDifficulty ?? "smart";
  const targetVp = state.config.targetVictoryPoints;
  const oppVisibleVp = computePlayerVictoryPoints(state, oppId, true);
  const oppThreatVp = estimatePublicPlayerThreatVp(state, oppId);
  const myVp = computePlayerVictoryPoints(state, me.id, false);

  // 1. Hard visible-VP & threat-VP ceiling near victory (e.g. >= 7 visible VP for Master in 10-VP Catan)
  if (
    oppVisibleVp >= targetVp - weights.leaderEmbargoMargin ||
    oppThreatVp >= targetVp - weights.leaderEmbargoMargin + 0.25
  ) {
    return true;
  }

  if (diff === "easy" || diff === "normal") {
    return false;
  }

  // 2. Smart & Master: embargo solo/clear table leaders in the second half of the game
  if (oppThreatVp >= targetVp - 3.5 && oppThreatVp >= myVp + 1.5) {
    return true;
  }

  if (diff !== "master") {
    return false;
  }

  // 3. Master Public Burst-VP Threat Embargo:
  // Never feed an opponent whose visible VP + unplayed dev cards + 1-step award swing can hit lethal!
  const unplayedDevs = opp.devCards.filter((c) => !c.played).length;
  const canFlipArmyWithOneKnight =
    state.largestArmyOwnerId !== oppId &&
    unplayedDevs >= 1 &&
    opp.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
  const nearLongestAward =
    state.longestRoadOwnerId !== oppId &&
    (opp.roadsRemaining > 0 || opp.shipsRemaining > 0) &&
    opp.longestRoadLength + 1 >= Math.max(5, state.longestRoadLength + 1);
  const oppOpenSettle = getLegalSettlementVertices(state, oppId, false);
  const hasThreeVpSpot = oppOpenSettle.some(
    (vId) =>
      grantsNewIslandBonusVp(state, opp, vId) ||
      (state.config.enableHarbormaster &&
        state.harbormasterOwnerId !== oppId &&
        state.harbors.some((h) => h.vertexIds.includes(vId)) &&
        opp.harborPoints + 1 >= Math.max(3, state.harbormasterPoints + 1))
  );

  const potentialDevAndArmyVp =
    oppVisibleVp +
    Math.min(4, unplayedDevs) +
    (canFlipArmyWithOneKnight ? 1 : 0);
  if (potentialDevAndArmyVp >= targetVp - 2) {
    return true;
  }

  if (
    oppVisibleVp >= targetVp - 4 &&
    (nearLongestAward || hasThreeVpSpot || canFlipArmyWithOneKnight)
  ) {
    return true;
  }

  // 4. Master Off-Turn Table-Leader Embargo: never help a 6+ threat-VP table leader on THEIR active turn!
  const oppIsActiveTurnPlayer =
    state.players[state.activePlayerIndex]?.id === oppId;
  const maxTableThreat = Math.max(
    0,
    ...state.players
      .filter((p) => p.id !== me.id)
      .map((p) => estimatePublicPlayerThreatVp(state, p.id))
  );
  if (
    oppIsActiveTurnPlayer &&
    oppThreatVp >= targetVp - 4 &&
    oppThreatVp >= maxTableThreat - 0.1 &&
    oppThreatVp > myVp + 0.5
  ) {
    return true;
  }

  return false;
}

/**
 * Evaluates the strategic potential of holding `hand` for `player` right now.
 */
export function evaluateHandStrategicValue(
  state: CatanState,
  player: CatanPlayerState,
  hand: ResourceMap,
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  prod: Record<ResourceType, number>,
  isOwnActiveTurn: boolean
): number {
  const ratios = getPlayerTradeRatios(state, player.id);
  const safeLimit = getPlayerSafeHandLimit(state, player.id);
  const totalCards = totalResourceCount(hand);

  const hasSettlementOnBoard = Object.values(state.buildings).some(
    (b) => b.ownerId === player.id && b.type === "settlement"
  );
  const legalSettleNow = getLegalSettlementVertices(state, player.id, false);

  let val = 0;

  for (const r of RESOURCES) {
    const count = hand[r];
    if (count <= 0) continue;
    const lackFactor = prod[r] === 0 ? 1.58 : 1 + 2.25 / (prod[r] + 3);
    const portUtility = ratios[r] === 2 ? 1.28 : ratios[r] === 3 ? 1.09 : 1.0;
    const effectiveUnits =
      count <= 3 ? count : 3 + (count - 3) * (ratios[r] === 2 ? 0.85 : 0.46);
    val += effectiveUnits * 1.15 * scarcity[r] * lackFactor * portUtility;

    if (count >= ratios[r]) {
      val += ratios[r] === 2 ? 1.9 : 1.4;
    }
  }

  // Evaluate mutually-exclusive Grain/Ore consumers (City vs Dev Card) without double-counting the same cards!
  const effectiveCityVal = weights.cityPriority + 24;
  let cityOnlyScore = 0;
  if (hasSettlementOnBoard && player.citiesRemaining > 0) {
    const cityDef = countResourceDeficit(hand, BUILDING_COSTS.city);
    if (cityDef === 0) {
      cityOnlyScore = effectiveCityVal * 0.44;
      if (state.devCardDeck.length > 0) {
        const remAfterCity: ResourceMap = {
          ...hand,
          grain: hand.grain - 2,
          ore: hand.ore - 3,
        };
        if (countResourceDeficit(remAfterCity, BUILDING_COSTS.devCard) === 0) {
          cityOnlyScore += weights.devCardPriority * 0.4;
        }
      }
    } else if (cityDef === 1) {
      cityOnlyScore = effectiveCityVal * 0.17;
    } else if (cityDef === 2) {
      cityOnlyScore = effectiveCityVal * 0.06;
    }
  }

  let devFirstScore = 0;
  if (state.devCardDeck.length > 0) {
    const devDef = countResourceDeficit(hand, BUILDING_COSTS.devCard);
    if (devDef === 0) {
      devFirstScore = weights.devCardPriority * 0.4;
      if (hasSettlementOnBoard && player.citiesRemaining > 0) {
        const remAfterDev: ResourceMap = {
          ...hand,
          wool: hand.wool - 1,
          grain: hand.grain - 1,
          ore: hand.ore - 1,
        };
        const remCityDef = countResourceDeficit(remAfterDev, BUILDING_COSTS.city);
        if (remCityDef === 0) devFirstScore += effectiveCityVal * 0.44;
        else if (remCityDef === 1) devFirstScore += effectiveCityVal * 0.17;
        else if (remCityDef === 2) devFirstScore += effectiveCityVal * 0.06;
      }
    } else if (devDef === 1) {
      devFirstScore = weights.devCardPriority * 0.11;
    }
  } else if (state.config.enableCitiesAndKnights) {
    const vulnCities = getPlayerVulnerableCities(state, player.id).length;
    const totalDef = getTotalActiveKnightStrength(state);
    const barbStr = getBarbarianStrength(state);
    const myActStr = getPlayerActiveKnightStrength(state, player.id);
    const inactiveKnights = Object.values(state.knights).filter(
      (k) => k.ownerId === player.id && !k.active
    ).length;
    const urgentDefense =
      vulnCities > 0 &&
      totalDef < barbStr &&
      (state.barbarianPosition >= 3 || myActStr === 0);
    const knightAndActivateCost: Partial<ResourceMap> = {
      wool: 1,
      ore: 1,
      grain: 1,
    };
    const knightCostOnly: Partial<ResourceMap> = { wool: 1, ore: 1 };
    const fullDef = countResourceDeficit(hand, knightAndActivateCost);
    const recDef = countResourceDeficit(hand, knightCostOnly);
    const urgMult = urgentDefense
      ? state.barbarianPosition >= 5
        ? 1.85
        : 1.45
      : 0.85;

    if (inactiveKnights > 0 && hand.grain >= 1) {
      devFirstScore = Math.max(devFirstScore, 14 * urgMult);
    }
    if (fullDef === 0) {
      devFirstScore = Math.max(devFirstScore, 20 * urgMult);
    } else if (recDef === 0) {
      devFirstScore = Math.max(devFirstScore, 13.5 * urgMult);
    } else if (fullDef === 1 && urgentDefense) {
      devFirstScore = Math.max(devFirstScore, 8.5 * urgMult);
    }
  }
  val += Math.max(cityOnlyScore, devFirstScore);

  if (player.settlementsRemaining > 0) {
    const setDef = countResourceDeficit(hand, BUILDING_COSTS.settlement);
    const spotMult = legalSettleNow.length > 0 ? 1.05 : 0.55;
    if (setDef === 0) val += weights.settlementPriority * 0.44 * spotMult;
    else if (setDef === 1) val += weights.settlementPriority * 0.16 * spotMult;
    else if (setDef === 2) val += weights.settlementPriority * 0.05 * spotMult;
  }

  const roadDef = countResourceDeficit(hand, BUILDING_COSTS.road);
  if (
    roadDef === 0 &&
    player.roadsRemaining > 0 &&
    legalSettleNow.length === 0
  ) {
    val += weights.roadToSpotPriority * 0.26;
  }
  if (state.config.enableSeafarers && player.shipsRemaining > 0) {
    const shipDef = countResourceDeficit(hand, BUILDING_COSTS.ship);
    if (shipDef === 0) val += weights.roadToSpotPriority * 0.3;
  }

  const specialBuildRiskMult = state.config.enableSpecialBuildingPhase
    ? 0.45
    : 1.0;
  if (!isOwnActiveTurn && totalCards > safeLimit) {
    const discardLoss = Math.floor(totalCards / 2);
    val -=
      discardLoss *
      weights.sevenDiscardRiskWeight *
      0.9 *
      specialBuildRiskMult;
  } else if (isOwnActiveTurn && totalCards > safeLimit + 2) {
    val -=
      (totalCards - safeLimit) *
      weights.sevenDiscardRiskWeight *
      0.25 *
      specialBuildRiskMult;
  }

  return val;
}
