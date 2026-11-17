import {
  isCommodityType,
  isResourceType,
} from "../cities-and-knights/helpers.ts";
import {
  canPlayerUpgradeDiscipline,
  getPlayerVulnerableCities,
} from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getPlayerActiveKnightStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import {
  BARBARIAN_TRACK_STEPS,
  DISCIPLINE_TO_COMMODITY,
} from "../config/cities-knights-config.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  type CommodityType,
  IMPROVEMENT_DISCIPLINES,
  type ImprovementDiscipline,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { getVertexResourcePipScore } from "./utils.ts";

export function chooseCkPreUpgradeDefenseAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[],
  currentVp: number,
  targetVp: number
): {
  action: CatanAction | null;
  cityInDanger: boolean;
  stepsLeft: number;
} {
  const playerId = player.id;
  const difficulty = player.botDifficulty ?? "smart";

  const upgradeActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "UPGRADE_CITY_IMPROVEMENT" }> =>
      a.type === "UPGRADE_CITY_IMPROVEMENT"
  );
  const progressActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
      a.type === "PLAY_PROGRESS_CARD"
  );
  const activateKnightActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "ACTIVATE_KNIGHT" }> =>
      a.type === "ACTIVATE_KNIGHT"
  );
  const buildKnightActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_KNIGHT" }> =>
      a.type === "BUILD_KNIGHT"
  );
  const promoteKnightActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PROMOTE_KNIGHT" }> =>
      a.type === "PROMOTE_KNIGHT"
  );

  const findCardType = (cardId: string) =>
    player.progressCards.find((c) => c.id === cardId)?.type;

  const barbStr = getBarbarianStrength(state);
  const totalDefStr = getTotalActiveKnightStrength(state);
  const myActiveStr = getPlayerActiveKnightStrength(state, playerId);
  const myVulnCities = getPlayerVulnerableCities(state, playerId);
  const stepsLeft = BARBARIAN_TRACK_STEPS - state.barbarianPosition;
  const minContributorStr = state.players.reduce<number>((minVal, p) => {
    const vuln = getPlayerVulnerableCities(state, p.id);
    if (vuln.length === 0) return minVal;
    return Math.min(minVal, getPlayerActiveKnightStrength(state, p.id));
  }, Infinity);
  const cityInDanger =
    myVulnCities.length > 0 &&
    totalDefStr < barbStr &&
    myActiveStr <= minContributorStr;

  // 1. Immediate C&K Lethal Checks (Metropolis +2 VP, Merchant +1 VP)
  for (const up of upgradeActs) {
    const check = canPlayerUpgradeDiscipline(state, player, up.discipline);
    const alreadyOwnMetro =
      state.metropolises[up.discipline].ownerId === playerId;
    if (
      check.claimsMetropolis &&
      !alreadyOwnMetro &&
      currentVp + 2 >= targetVp
    ) {
      return { action: up, cityInDanger, stepsLeft };
    }
  }
  if (state.merchantOwnerId !== playerId && currentVp + 1 >= targetVp) {
    const merchAct = progressActs.find(
      (a) => findCardType(a.cardId) === "merchant"
    );
    if (merchAct) return { action: merchAct, cityInDanger, stepsLeft };
  }

  // 2. Free Discount Progress Cards BEFORE spending commodities/resources (`crane`, `medicine`, `engineer`)
  const craneAct = progressActs.find((a) => findCardType(a.cardId) === "crane");
  if (craneAct) {
    const craneUnlocksOrSaves = IMPROVEMENT_DISCIPLINES.some((d) => {
      const lvl = player.cityImprovements[d];
      if (lvl >= 5) return false;
      const comm = DISCIPLINE_TO_COMMODITY[d];
      const hasCity = Object.values(state.buildings).some(
        (b) => b.ownerId === playerId && b.type === "city"
      );
      return hasCity && player.commodities[comm] >= Math.max(1, lvl);
    });
    if (craneUnlocksOrSaves) {
      return { action: craneAct, cityInDanger, stepsLeft };
    }
  }

  const medicineAct = progressActs.find(
    (a) => findCardType(a.cardId) === "medicine"
  );
  if (medicineAct) {
    const hasSettlement = Object.values(state.buildings).some(
      (b) => b.ownerId === playerId && b.type === "settlement"
    );
    if (
      hasSettlement &&
      (player.citiesRemaining > 0 ||
        Object.values(state.buildings).some(
          (b) =>
            b.ownerId === playerId &&
            b.type === "settlement" &&
            b.borrowedCityPiece
        )) &&
      player.resources.ore >= 2 &&
      player.resources.grain >= 1
    ) {
      return { action: medicineAct, cityInDanger, stepsLeft };
    }
  }

  const engineerAct = progressActs.find(
    (a) => findCardType(a.cardId) === "engineer"
  );
  if (engineerAct) return { action: engineerAct, cityInDanger, stepsLeft };

  // 3. Urgent Barbarian Defense & Solo Defender (+1 VP) Contest
  const warlordAct = progressActs.find(
    (a) => findCardType(a.cardId) === "warlord"
  );
  const smithActs = progressActs.filter(
    (a) => findCardType(a.cardId) === "smith"
  );
  if (smithActs.length > 0) {
    // Free 2-knight promotion is always huge tempo!
    return { action: smithActs[0]!, cityInDanger, stepsLeft };
  }
  if (warlordAct) {
    const myInactiveCount = Object.values(state.knights).filter(
      (k) => k.ownerId === playerId && !k.active
    ).length;
    if (myInactiveCount >= 1) {
      return { action: warlordAct, cityInDanger, stepsLeft };
    }
  }

  const maxOppActiveStr = Math.max(
    0,
    ...state.players
      .filter((p) => p.id !== playerId)
      .map((p) => getPlayerActiveKnightStrength(state, p.id))
  );
  const canClaimSoloDefenderSoon =
    barbStr > 0 &&
    stepsLeft <= 3 &&
    totalDefStr + 2 >= barbStr &&
    myActiveStr <= maxOppActiveStr &&
    myActiveStr + 2 > maxOppActiveStr;

  const metroSavesOnlyCity =
    difficulty === "master" &&
    myVulnCities.length === 1 &&
    upgradeActs.some((a) => Boolean(a.metropolisVertexId));

  if (
    cityInDanger &&
    !metroSavesOnlyCity &&
    (stepsLeft <= 4 || difficulty === "master")
  ) {
    if (activateKnightActs.length > 0) {
      return {
        action: [...activateKnightActs].sort(
          (a, b) =>
            (state.knights[b.vertexId]?.level ?? 1) -
            (state.knights[a.vertexId]?.level ?? 1)
        )[0]!,
        cityInDanger,
        stepsLeft,
      };
    }
    if (
      promoteKnightActs.length > 0 &&
      Object.values(state.knights).some(
        (k) => k.ownerId === playerId && k.active
      )
    ) {
      return { action: promoteKnightActs[0]!, cityInDanger, stepsLeft };
    }
    if (buildKnightActs.length > 0) {
      return { action: buildKnightActs[0]!, cityInDanger, stepsLeft };
    }
  }

  if (canClaimSoloDefenderSoon && activateKnightActs.length > 0) {
    return {
      action: [...activateKnightActs].sort(
        (a, b) =>
          (state.knights[b.vertexId]?.level ?? 1) -
          (state.knights[a.vertexId]?.level ?? 1)
      )[0]!,
      cityInDanger,
      stepsLeft,
    };
  }

  const opponents = state.players.filter((p) => p.id !== playerId);

  // 4. City Improvements & Metropolis Race!
  if (upgradeActs.length > 0) {
    const scoredUpgrades = upgradeActs
      .map((act) => {
        const check = canPlayerUpgradeDiscipline(state, player, act.discipline);
        if (difficulty === "master") {
          const d = act.discipline;
          const nextLv = check.nextLevel;
          let score = 32;
          if (d === "science" && nextLv === 3) score += 44; // Aqueduct rush!
          else if (d === "science") score += 14;
          else if (d === "trade" && nextLv === 3) score += 20; // 2:1 all commodities!

          const maxOppLv = Math.max(
            0,
            ...opponents.map((o) => o.cityImprovements[d])
          );
          const metro = state.metropolises[d];
          if (nextLv >= 4) {
            if (!metro.ownerId) {
              score += 55 + (maxOppLv >= 3 ? 20 : 0);
            } else if (metro.ownerId !== playerId && nextLv > metro.level) {
              score += 78; // 4-VP swing stealing opponent's Metropolis!
            } else if (
              metro.ownerId === playerId &&
              nextLv === 5 &&
              maxOppLv >= 4
            ) {
              score += 38; // Lock Lv 5 Metropolis against steals!
            }
          } else if (nextLv === 3 && !metro.ownerId && maxOppLv >= 3) {
            score += 12;
          }
          if (player.activeTurnDiscounts.crane) score += 14;

          // Score `act.metropolisVertexId` so we crown our highest-pip un-walled commodity City!
          if (act.metropolisVertexId) {
            const b = state.buildings[act.metropolisVertexId];
            const cityPipVal = getVertexResourcePipScore(
              state,
              act.metropolisVertexId,
              true
            );
            const wallSaveBonus = b && !b.hasWall ? 4.5 : 0;
            score += cityPipVal * 0.8 + wallSaveBonus;
          }
          return { act, score };
        }
        let score = 22 + check.nextLevel * 3;
        if (check.claimsMetropolis) score += 55;
        if (act.discipline === "science" && check.nextLevel <= 3) score += 16;
        if (act.discipline === "trade" && check.nextLevel <= 3) score += 11;
        if (act.discipline === "politics" && check.nextLevel === 3) score += 8;
        if (player.activeTurnDiscounts.crane) score += 14;
        return { act, score };
      })
      .sort((a, b) => b.score - a.score);
    // Claim Metropolises, Aqueduct (Science Lv 3), or Crane-discounted upgrades immediately!
    if (scoredUpgrades[0]!.score >= 38 || difficulty !== "easy") {
      return { action: scoredUpgrades[0]!.act, cityInDanger, stepsLeft };
    }
  }

  return { action: null, cityInDanger, stepsLeft };
}

export function chooseCkPostBuildAction(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[]
): CatanAction | null {
  const playerId = player.id;
  const activateActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "ACTIVATE_KNIGHT" }> =>
      a.type === "ACTIVATE_KNIGHT"
  );
  const buildKnightActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_KNIGHT" }> =>
      a.type === "BUILD_KNIGHT"
  );
  const promoteActs = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PROMOTE_KNIGHT" }> =>
      a.type === "PROMOTE_KNIGHT"
  );
  const maritimeTrades = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "MARITIME_TRADE" }> =>
      a.type === "MARITIME_TRADE"
  );

  // Activate existing inactive knights whenever we have spare grain or cities on board!
  if (activateActs.length > 0 && player.resources.grain >= 1) {
    return [...activateActs].sort(
      (a, b) =>
        (state.knights[b.vertexId]?.level ?? 1) -
        (state.knights[a.vertexId]?.level ?? 1)
    )[0]!;
  }

  const myKnightsOnBoard = Object.values(state.knights).filter(
    (k) => k.ownerId === playerId
  ).length;
  const myCitiesOnBoard = Object.values(state.buildings).filter(
    (b) => b.ownerId === playerId && b.type === "city"
  ).length;

  // Maintain at least 1 knight per city (and recruit on contested road intersections!)
  if (
    buildKnightActs.length > 0 &&
    myKnightsOnBoard < Math.max(1, myCitiesOnBoard)
  ) {
    const blockingSpot = buildKnightActs.find((act) => {
      const vNode = state.topology.vertices[act.vertexId];
      const oppEdges = (vNode?.incidentEdgeIds ?? []).filter((eId) => {
        const o = state.edges[eId]?.ownerId;
        return o && o !== playerId;
      });
      return oppEdges.length >= 2;
    });
    return blockingSpot ?? buildKnightActs[0]!;
  }

  if (
    promoteActs.length > 0 &&
    myCitiesOnBoard >= 1 &&
    player.resources.ore >= 2
  ) {
    return promoteActs[0]!;
  }

  // Commodity-aware Maritime Trade: trade surplus goods for 1 missing commodity to unlock a City Improvement / Metropolis!
  if (maritimeTrades.length > 0 && myCitiesOnBoard >= 1) {
    for (const d of ["science", "trade", "politics"] as const) {
      const lvl = player.cityImprovements[d];
      if (lvl >= 5) continue;
      const comm = DISCIPLINE_TO_COMMODITY[d];
      const needed = Math.max(
        1,
        lvl + 1 - (player.activeTurnDiscounts.crane ? 1 : 0)
      );
      if (
        player.commodities[comm] === needed - 1 &&
        state.commodityBank[comm] >= 1
      ) {
        const tradeForComm = maritimeTrades.find((t) => {
          if (t.receive !== comm) return false;
          if (isCommodityType(t.give)) {
            const otherDisc: ImprovementDiscipline =
              t.give === "paper"
                ? "science"
                : t.give === "cloth"
                  ? "trade"
                  : "politics";
            return (
              player.cityImprovements[otherDisc] >= 5 ||
              player.commodities[t.give] >
                player.cityImprovements[otherDisc] + 1
            );
          }
          return player.resources[t.give] >= t.giveAmount + 1;
        });
        if (tradeForComm) return tradeForComm;
      }
    }

    // Or convert surplus max-level / Trading-House (2:1) commodities into scarce Ore/Grain/Brick!
    const commToResTrades = maritimeTrades.filter(
      (t) => isCommodityType(t.give) && isResourceType(t.receive)
    );
    for (const t of commToResTrades) {
      const giveComm = t.give as CommodityType;
      const recvRes = t.receive as ResourceType;
      const disc: ImprovementDiscipline =
        giveComm === "paper"
          ? "science"
          : giveComm === "cloth"
            ? "trade"
            : "politics";
      const curLvl = player.cityImprovements[disc];
      const hasExcess =
        curLvl >= 5 || player.commodities[giveComm] >= curLvl + 1 + t.giveAmount;
      if (hasExcess && player.resources[recvRes] === 0) {
        return t;
      }
    }
  }

  return null;
}
