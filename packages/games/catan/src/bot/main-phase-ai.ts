import type { BotDifficulty } from "@gaming-platform/core";
import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import {
  getBarbarianStrength,
  getPlayerActiveKnightStrength,
  getTotalActiveKnightStrength,
} from "../cities-and-knights/knights.ts";
import type { CatanBotWeights } from "../config/bot-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import type { CatanAction } from "../types/actions.ts";
import type { ResourceType } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { evaluateVertexScore } from "./board-eval.ts";
import { chooseCkPostBuildAction } from "./ck-knights-ai.ts";
import { chooseCkPriorityMainAction } from "./ck-progress-ai.ts";
import { chooseMainPhaseDevCardAction } from "./dev-cards-ai.ts";
import { findStrategicDomesticTradeOffer } from "./domestic-trade-proposer.ts";
import {
  chooseExpansionDevOrWallAction,
  chooseMasterPreBuildMoveShipAction,
} from "./expansion-phase-ai.ts";
import { findImmediateWinningAction } from "./lethal-solver.ts";
import {
  chooseEndOfTurnSevenShieldTradeAction,
  chooseMainMaritimeTradeAction,
  filterResourceMaritimeTrades,
} from "./maritime-trade-ai.ts";
import { simulateOpponentRouteLengthAfterBlock } from "./route-eval.ts";
import { grantsNewIslandBonusVp } from "./utils.ts";

/**
 * Score Settlements vs Cities (including Foreign Island +2 VP, Harbormaster +2 VP, Exact Road-Break, & Early City Engine!).
 */
export function chooseBestSettlementOrCityBuildAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myCitiesCount: number
): CatanAction | null {
  const buildSettlements = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_SETTLEMENT" }> =>
      a.type === "BUILD_SETTLEMENT"
  );
  const buildCities = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "BUILD_CITY" }> =>
      a.type === "BUILD_CITY"
  );

  let bestBuildAction: CatanAction | null = null;
  let bestBuildScore = -Infinity;

  for (const act of buildSettlements) {
    const vScore = evaluateVertexScore(
      state,
      act.vertexId,
      playerId,
      weights,
      scarcity
    );
    const vNode = state.topology.vertices[act.vertexId]!;
    const contested = vNode.incidentEdgeIds.some((eId) => {
      const e = state.edges[eId];
      return e && e.ownerId !== playerId;
    });
    const newIslandBonus =
      difficulty !== "easy" && grantsNewIslandBonusVp(state, player, act.vertexId)
        ? 36
        : 0;
    const harborBonus =
      state.config.enableHarbormaster &&
      state.harbors.some((h) => h.vertexIds.includes(act.vertexId))
        ? weights.harbormasterContestBonus
        : 0;

    let roadBreakBonus = 0;
    if (difficulty === "master" || difficulty === "smart") {
      const oppCounts = new Map<string, number>();
      for (const eId of vNode.incidentEdgeIds) {
        const owner = state.edges[eId]?.ownerId;
        if (owner && owner !== playerId) {
          oppCounts.set(owner, (oppCounts.get(owner) ?? 0) + 1);
        }
      }
      for (const [oppId, cnt] of oppCounts) {
        if (cnt >= 2) {
          if (difficulty === "master") {
            const oppPlayer = state.players.find((p) => p.id === oppId)!;
            const afterLen = simulateOpponentRouteLengthAfterBlock(
              state,
              oppId,
              act.vertexId
            );
            const drop = Math.max(0, oppPlayer.longestRoadLength - afterLen);
            const stripsAward =
              state.longestRoadOwnerId === oppId && afterLen < 5;
            roadBreakBonus +=
              (stripsAward ? 42 : state.longestRoadOwnerId === oppId ? 30 : 12) +
              drop * 3.5;
          } else {
            roadBreakBonus += state.longestRoadOwnerId === oppId ? 30 : 14;
          }
        }
      }
    }

    const totalS =
      weights.settlementPriority +
      vScore * 1.15 +
      (contested ? 12 : 0) +
      newIslandBonus +
      harborBonus +
      roadBreakBonus;
    if (totalS > bestBuildScore) {
      bestBuildScore = totalS;
      bestBuildAction = act;
    }
  }

  for (const act of buildCities) {
    const vNode = state.topology.vertices[act.vertexId]!;
    let prodGain = 0;
    let totalVertexPips = 0;
    let hasOreOrGrainOnVertex = false;
    for (const hId of vNode.adjacentHexIds) {
      if (hId === state.robberHexId) continue;
      const tile = state.hexes[hId];
      if (!tile?.numberToken) continue;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      totalVertexPips += pips;
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      if (res === "ore" || res === "grain") hasOreOrGrainOnVertex = true;
      const sc = res ? scarcity[res] : 1.45;
      const cityBias = res === "ore" || res === "grain" ? 1.32 : 1.0;
      prodGain += pips * 2.9 * sc * cityBias;
    }
    const harborBonus =
      state.config.enableHarbormaster &&
      state.harbors.some((h) => h.vertexIds.includes(act.vertexId))
        ? weights.harbormasterContestBonus * 0.95
        : 0;
    const freePieceBonus = player.settlementsRemaining === 0 ? 15 : 0;
    // Early City Snowball: 1st/2nd City on a strong Ore/Grain vertex supercharges velocity for the rest of the game!
    const earlyEngineBonus =
      difficulty === "master" &&
      myCitiesCount < 2 &&
      hasOreOrGrainOnVertex &&
      totalVertexPips >= 8
        ? 9.5
        : 0;
    // Self-pillage guard in Cities & Knights: building a new City at barbarianPosition >= 5
    // raises barbarian strength by +1; if we lack active knights to defend it and can't recruit+activate one now, penalize heavily!
    let ckSelfPillagePen = 0;
    if (
      state.config.enableCitiesAndKnights &&
      difficulty !== "easy" &&
      state.barbarianPosition >= 5
    ) {
      const barbAfterCity = getBarbarianStrength(state) + 1;
      const totalDef = getTotalActiveKnightStrength(state);
      const myActStr = getPlayerActiveKnightStrength(state, playerId);
      const minOtherContrib = state.players.reduce<number>((m, opp) => {
        if (opp.id === playerId) return m;
        return getPlayerVulnerableCities(state, opp.id).length > 0
          ? Math.min(m, getPlayerActiveKnightStrength(state, opp.id))
          : m;
      }, Infinity);
      const canFollowWithKnightAndActivate =
        player.resources.wool >= 1 &&
        player.resources.ore >= (player.activeTurnDiscounts.medicine ? 3 : 4) &&
        player.resources.grain >= (player.activeTurnDiscounts.medicine ? 2 : 3);
      if (
        totalDef < barbAfterCity &&
        myActStr <= minOtherContrib &&
        !canFollowWithKnightAndActivate
      ) {
        ckSelfPillagePen = state.barbarianPosition >= 6 ? 85 : 42;
      }
    }

    const totalC =
      weights.cityPriority +
      prodGain +
      harborBonus +
      freePieceBonus +
      earlyEngineBonus -
      ckSelfPillagePen;
    if (totalC > 10 && totalC > bestBuildScore) {
      bestBuildScore = totalC;
      bestBuildAction = act;
    }
  }

  return bestBuildAction;
}

export function chooseMainOrSpecialBuildAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction {
  const currentVp = computePlayerVictoryPoints(state, playerId, false);
  const targetVp = state.config.targetVictoryPoints;

  // 9a. Immediate & Multi-Step Deterministic Turn Lethal Scanner
  if (difficulty === "master" || difficulty === "smart") {
    const winNow = findImmediateWinningAction(
      state,
      player,
      legalActions,
      currentVp,
      targetVp
    );
    if (winNow) return winNow;
  }

  // 9a-ck. Cities & Knights high-priority defense, Metropolises, City Improvements, & Progress Cards
  if (state.config.enableCitiesAndKnights) {
    const ckPriority = chooseCkPriorityMainAction(
      state,
      player,
      legalActions,
      currentVp,
      targetVp
    );
    if (ckPriority) return ckPriority;
  }

  // 9a-2. Master Pre-Action Seafarers `MOVE_SHIP`
  const preMoveShip = chooseMasterPreBuildMoveShipAction(
    state,
    player,
    playerId,
    difficulty,
    legalActions
  );
  if (preMoveShip) return preMoveShip;

  const myCitiesCount = Object.values(state.buildings).filter(
    (b) => b.ownerId === playerId && b.type === "city"
  ).length;

  // 9b. Score Settlements vs Cities
  const bestBuildAction = chooseBestSettlementOrCityBuildAction(
    state,
    player,
    playerId,
    difficulty,
    legalActions,
    weights,
    scarcity,
    myCitiesCount
  );
  if (bestBuildAction) return bestBuildAction;

  // 9c. Play Development Cards
  const devCardPlay = chooseMainPhaseDevCardAction(
    state,
    player,
    playerId,
    difficulty,
    legalActions,
    weights,
    scarcity,
    myProd
  );
  if (devCardPlay) return devCardPlay;

  // 9d. Propose Strategic Domestic Trade BEFORE paying Maritime 3:1 / 4:1 bank rates!
  if (state.phase === "MAIN_PHASE") {
    const domesticOffer = findStrategicDomesticTradeOffer(
      state,
      player,
      weights,
      scarcity,
      myProd
    );
    if (domesticOffer) return domesticOffer;
  }

  // 9e. Smart Maritime / Port Trade
  const maritimeTrades = filterResourceMaritimeTrades(legalActions);
  const maritimeAction = chooseMainMaritimeTradeAction(
    state,
    player,
    playerId,
    difficulty,
    maritimeTrades,
    weights,
    scarcity,
    myProd
  );
  if (maritimeAction) return maritimeAction;

  // 9e-ck. Cities & Knights Knight Recruitment, Promotion & Commodity Maritime Trades
  if (state.config.enableCitiesAndKnights) {
    const ckPostBuild = chooseCkPostBuildAction(state, player, legalActions);
    if (ckPostBuild) return ckPostBuild;
  }

  // 9f. Compare Expansion Road/Ship vs Development Card vs City Wall!
  const expChoice = chooseExpansionDevOrWallAction(
    state,
    player,
    playerId,
    difficulty,
    legalActions,
    weights,
    scarcity,
    myProd,
    myCitiesCount
  );
  if (expChoice.action) return expChoice.action;

  // 9g. Master End-of-Turn 7-Discard Shielding!
  if (
    difficulty === "master" &&
    expChoice.overSafeLimit &&
    maritimeTrades.length > 0
  ) {
    const shieldTrade = chooseEndOfTurnSevenShieldTradeAction(
      state,
      player,
      maritimeTrades,
      weights,
      scarcity,
      myProd
    );
    if (shieldTrade) return shieldTrade;
  }

  // End Turn or End Special Build
  return (
    legalActions.find(
      (a) => a.type === "END_TURN" || a.type === "END_SPECIAL_BUILD"
    ) ?? legalActions[0]!
  );
}
