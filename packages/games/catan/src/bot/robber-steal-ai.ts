import type { BotDifficulty } from "@gaming-platform/core";
import type { CatanBotWeights } from "../config/bot-config.ts";
import {
  NUMBER_TOKEN_PIPS,
  TERRAIN_TO_RESOURCE,
} from "../config/costs-and-limits.ts";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import {
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  totalResourceCount,
} from "../rules/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  RESOURCES,
  type ResourceMap,
  type ResourceType,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { chooseCkAlchemistPreRollAction } from "./ck-phases-ai.ts";
import { evaluateHandStrategicValue } from "./trade-eval.ts";
import {
  computePlayerProductionPips,
  estimatePublicPlayerThreatVp,
} from "./utils.ts";

export function choosePreRollAction(
  state: CatanState,
  player: CatanPlayerState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[]
): CatanAction {
  if (state.config.enableCitiesAndKnights && difficulty !== "easy") {
    const alchAct = chooseCkAlchemistPreRollAction(state, player, legalActions);
    if (alchAct) return alchAct;
  }
  const playKnight = legalActions.find((a) => a.type === "PLAY_KNIGHT");
  if (playKnight && difficulty !== "easy") {
    const robberHNode = state.topology.hexes[state.robberHexId];
    const robberTile = state.hexes[state.robberHexId];
    const touchesMyPiece = Boolean(
      robberTile?.numberToken &&
        robberHNode?.cornerVertexIds.some(
          (vId) => state.buildings[vId]?.ownerId === playerId
        )
    );
    const pirateHNode = state.pirateHexId
      ? state.topology.hexes[state.pirateHexId]
      : null;
    const pirateBlocksShip = Boolean(
      pirateHNode?.sideEdgeIds.some(
        (eId) => state.edges[eId]?.ownerId === playerId
      )
    );
    const claimsArmyNow =
      state.largestArmyOwnerId !== playerId &&
      player.knightsPlayed + 1 >= Math.max(3, state.largestArmySize + 1);
    const myVpNow = computePlayerVictoryPoints(state, playerId, false);
    const claimsArmyLethalNow =
      claimsArmyNow && myVpNow + 2 >= state.config.targetVictoryPoints;

    if (difficulty === "master") {
      const myCardCount = totalResourceCount(player.resources);
      const mySafe = getPlayerSafeHandLimit(state, playerId);
      const blockedPips = robberTile?.numberToken
        ? (NUMBER_TOKEN_PIPS[robberTile.numberToken] ?? 0)
        : 0;
      // Avoid turning exactly `safeLimit` (7) cards into 8 right before rolling unless unblocking a high-pip hex!
      const safeToStealPreRoll = myCardCount !== mySafe || blockedPips >= 4;
      if (
        claimsArmyLethalNow ||
        pirateBlocksShip ||
        (touchesMyPiece && safeToStealPreRoll)
      ) {
        return playKnight;
      }
    } else {
      const armyRace =
        difficulty === "smart"
          ? claimsArmyNow || player.knightsPlayed >= 2
          : false;
      if (touchesMyPiece || pirateBlocksShip || armyRace) {
        return playKnight;
      }
    }
  }
  return legalActions.find((a) => a.type === "ROLL_DICE") ?? legalActions[0]!;
}

export function chooseMoveRobberOrPirateAction(
  state: CatanState,
  playerId: string,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>
): CatanAction {
  if (difficulty === "easy") {
    for (const act of legalActions) {
      if (act.type === "MOVE_ROBBER") {
        const hNode = state.topology.hexes[act.hexId]!;
        const selfHit = hNode.cornerVertexIds.some(
          (vId) => state.buildings[vId]?.ownerId === playerId
        );
        if (!selfHit) return act;
      }
    }
    return legalActions[0]!;
  }

  const targetVpRob = state.config.targetVictoryPoints;
  const oppProdCache = new Map<string, Record<ResourceType, number>>();
  if (difficulty === "master") {
    for (const p of state.players) {
      if (p.id !== playerId) {
        oppProdCache.set(p.id, computePlayerProductionPips(state, p.id, true));
      }
    }
  }

  let bestAction = legalActions[0]!;
  let bestScore = -Infinity;

  for (const act of legalActions) {
    if (act.type === "MOVE_ROBBER") {
      const hNode = state.topology.hexes[act.hexId]!;
      const tile = state.hexes[act.hexId]!;
      const pips = tile.numberToken
        ? (NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0)
        : 0;
      const res = TERRAIN_TO_RESOURCE[tile.terrain];
      const scMult = res ? scarcity[res] : tile.terrain === "gold" ? 1.55 : 1;
      let hexScore = pips * weights.robberPipsWeight * scMult;
      let hitsSelf = false;
      let bestVictimBonus = 0;

      for (const vId of hNode.cornerVertexIds) {
        const b = state.buildings[vId];
        if (!b) continue;
        const mult = b.type === "city" ? 2 : 1;
        if (b.ownerId === playerId) {
          hitsSelf = true;
          hexScore -= 65 * mult;
        } else {
          const oppPlayer = state.players.find((p) => p.id === b.ownerId)!;
          const oppVisibleVp = computePlayerVictoryPoints(
            state,
            b.ownerId,
            true
          );
          const oppThreat = estimatePublicPlayerThreatVp(state, b.ownerId);
          const oppCards = getPlayerResourceCount(oppPlayer);

          // Steep endgame multiplier when an opponent is close to victory!
          let endgameUrgency = 1.0;
          if (difficulty === "master") {
            if (
              oppVisibleVp >= targetVpRob - 1 ||
              oppThreat >= targetVpRob - 0.8
            ) {
              endgameUrgency = 2.6;
            } else if (
              oppVisibleVp >= targetVpRob - 2 ||
              oppThreat >= targetVpRob - 1.8
            ) {
              endgameUrgency = 1.95;
            } else if (
              oppVisibleVp >= targetVpRob - 3 ||
              oppThreat >= targetVpRob - 2.8
            ) {
              endgameUrgency = 1.45;
            } else if (oppVisibleVp <= 3 && state.turn >= 16) {
              endgameUrgency = 0.65;
            }
          }

          hexScore +=
            (oppThreat * weights.robberLeaderVpWeight * endgameUrgency +
              pips * 1.4) *
            mult;

          // Master bottleneck check: paralyzing an opponent's ONLY source of Ore/Grain/Brick!
          if (difficulty === "master" && res && pips > 0) {
            const oProd = oppProdCache.get(b.ownerId);
            if (oProd && oProd[res] <= pips * mult) {
              hexScore += 10.0 * scMult * mult * Math.min(1.6, endgameUrgency);
            }
          }

          if (oppCards > 0) {
            bestVictimBonus = Math.max(
              bestVictimBonus,
              7 + Math.min(6, oppCards) + oppThreat * 1.15 * endgameUrgency
            );
          }
        }
      }
      hexScore += bestVictimBonus;
      if (hitsSelf) hexScore -= 130;

      if (hexScore > bestScore) {
        bestScore = hexScore;
        bestAction = act;
      }
    } else if (act.type === "MOVE_PIRATE") {
      const hNode = state.topology.hexes[act.hexId]!;
      if (difficulty === "master") {
        let selfShip = false;
        const seenOppIds: Record<string, true> = {};
        let oppShipScore = 0;
        let hasStealableOpp = false;
        for (const eId of hNode.sideEdgeIds) {
          const r = state.edges[eId];
          if (!r || r.type !== "ship") continue;
          if (r.ownerId === playerId) {
            selfShip = true;
            break;
          }
          if (seenOppIds[r.ownerId]) continue;
          seenOppIds[r.ownerId] = true;
          const opp = state.players.find((p) => p.id === r.ownerId)!;
          const oppThreat = estimatePublicPlayerThreatVp(state, r.ownerId);
          oppShipScore += 8 + oppThreat * weights.robberLeaderVpWeight * 0.85;
          if (getPlayerResourceCount(opp) > 0) hasStealableOpp = true;
        }
        const pirateScore = selfShip
          ? -200
          : oppShipScore === 0
            ? 1
            : oppShipScore + (hasStealableOpp ? 13 : -12);
        if (pirateScore > bestScore) {
          bestScore = pirateScore;
          bestAction = act;
        }
      } else {
        let pirateScore = 2;
        for (const eId of hNode.sideEdgeIds) {
          const r = state.edges[eId];
          if (!r || r.type !== "ship") continue;
          if (r.ownerId === playerId) {
            pirateScore -= 75;
          } else {
            const oppThreat = estimatePublicPlayerThreatVp(state, r.ownerId);
            pirateScore += 10 + oppThreat * weights.robberLeaderVpWeight * 0.85;
          }
        }
        if (pirateScore > bestScore) {
          bestScore = pirateScore;
          bestAction = act;
        }
      }
    }
  }
  return bestAction;
}

export function chooseStealResourceAction(
  state: CatanState,
  player: CatanPlayerState,
  difficulty: BotDifficulty,
  legalActions: CatanAction[],
  weights: CatanBotWeights,
  scarcity: Record<ResourceType, number>,
  myProd: Record<ResourceType, number>
): CatanAction {
  let bestAction = legalActions[0]!;
  let bestScore = -Infinity;
  const baseHandVal =
    difficulty === "master"
      ? evaluateHandStrategicValue(
          state,
          player,
          player.resources,
          weights,
          scarcity,
          myProd,
          true
        )
      : 0;

  for (const act of legalActions) {
    if (act.type === "STEAL_FROM_PLAYER") {
      const victim = state.players.find((p) => p.id === act.victimId)!;
      const victimVisVp = computePlayerVictoryPoints(state, victim.id, true);
      const threat = estimatePublicPlayerThreatVp(state, victim.id);
      const endgameMult =
        difficulty === "master" &&
        victimVisVp >= state.config.targetVictoryPoints - 3
          ? 1.55
          : 1.0;
      let s =
        threat * weights.robberLeaderVpWeight * endgameMult +
        Math.min(5, getPlayerResourceCount(victim));
      if (difficulty === "master") {
        const vProd = computePlayerProductionPips(state, victim.id, true);
        const vTotal = RESOURCES.reduce((acc, r) => acc + vProd[r], 0) || 1;
        for (const r of RESOURCES) {
          const prob = vProd[r] / vTotal;
          if (prob <= 0) continue;
          const hypoHand: ResourceMap = {
            ...player.resources,
            [r]: player.resources[r] + 1,
          };
          const handDelta = Math.max(
            0,
            evaluateHandStrategicValue(
              state,
              player,
              hypoHand,
              weights,
              scarcity,
              myProd,
              true
            ) - baseHandVal
          );
          s +=
            prob *
            (handDelta * 1.4 +
              (myProd[r] === 0 ? 4.5 * scarcity[r] : 1.5 * scarcity[r]));
        }
      }
      if (s > bestScore) {
        bestScore = s;
        bestAction = act;
      }
    }
  }
  return bestAction;
}
