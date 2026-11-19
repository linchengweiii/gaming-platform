import type { GameEvent, VertexId } from "@gaming-platform/core";
import { applyMainPhaseProgressCardPure } from "../cities-and-knights/apply-actions.ts";
import { resolveEventDieRollPure } from "../cities-and-knights/barbarians.ts";
import {
  addCommoditiesPure,
  consumePlayerProgressCardPure,
  rollEventDiePure,
  subtractCommoditiesPure,
} from "../cities-and-knights/helpers.ts";
import { canPlayerUpgradeDiscipline } from "../cities-and-knights/improvements.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  type CommodityMap,
  IMPROVEMENT_DISCIPLINES,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  computePlayerVictoryPoints,
  recalculateAwardsPure,
} from "./awards-and-vp.ts";
import { continuePostEventDieRollPure } from "./dice-and-events.ts";
import {
  appendCatanEvent,
  assertCanBuildInCurrentPhase,
  updatePlayerById,
} from "./helpers.ts";
import {
  getLegalRoadEdges,
  getLegalShipEdges,
  revealAdjacentFogHexesPure,
} from "./network.ts";
import { getLegalRobberHexes } from "./robber-pirate.ts";

export function applyUpgradeCityImprovementPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "UPGRADE_CITY_IMPROVEMENT" }>
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (
    !(IMPROVEMENT_DISCIPLINES as readonly string[]).includes(action.discipline)
  ) {
    throw new Error(`Invalid city improvement discipline: ${String(action.discipline)}`);
  }
  const check = canPlayerUpgradeDiscipline(
    currentState,
    player,
    action.discipline
  );
  if (!check.allowed) {
    throw new Error(
      `Cannot upgrade ${action.discipline} city improvement right now`
    );
  }

  const currentMetro = currentState.metropolises[action.discipline];
  const metroTransition = (() => {
    if (check.claimsMetropolis) {
      if (
        action.metropolisVertexId !== undefined &&
        !check.eligibleMetropolisVertices.includes(action.metropolisVertexId)
      ) {
        throw new Error(
          `Vertex ${action.metropolisVertexId} is not an eligible non-metropolis city`
        );
      }
      const targetVId =
        action.metropolisVertexId ?? check.eligibleMetropolisVertices[0];
      if (!targetVId) {
        throw new Error(
          "Must select an eligible non-metropolis city for the new Metropolis"
        );
      }

      const clearedOldBuildings: CatanState["buildings"] =
        currentMetro.vertexId && currentState.buildings[currentMetro.vertexId]
          ? (() => {
              const prevB = currentState.buildings[currentMetro.vertexId]!;
              const withoutMetro = {
                ownerId: prevB.ownerId,
                type: prevB.type,
                ...(prevB.hasWall ? { hasWall: true } : {}),
              };
              return {
                ...currentState.buildings,
                [currentMetro.vertexId]: withoutMetro,
              };
            })()
          : currentState.buildings;

      const nextTargetB = clearedOldBuildings[targetVId]!;
      return {
        buildings: {
          ...clearedOldBuildings,
          [targetVId]: {
            ...nextTargetB,
            metropolis: action.discipline,
          },
        },
        metropolises: {
          ...currentState.metropolises,
          [action.discipline]: {
            ownerId: playerId,
            vertexId: targetVId,
            level: check.nextLevel,
          },
        },
        claimedTargetVId: targetVId,
      };
    }

    if (currentMetro.ownerId === playerId) {
      return {
        buildings: currentState.buildings,
        metropolises: {
          ...currentState.metropolises,
          [action.discipline]: {
            ...currentMetro,
            level: check.nextLevel,
          },
        },
        claimedTargetVId: null as VertexId | null,
      };
    }

    return {
      buildings: currentState.buildings,
      metropolises: currentState.metropolises,
      claimedTargetVId: null as VertexId | null,
    };
  })();

  const payment: Partial<CommodityMap> = {
    [check.costCommodity]: check.costAmount,
  };
  const improvedState: CatanState = {
    ...currentState,
    commodityBank: addCommoditiesPure(currentState.commodityBank, payment),
    buildings: metroTransition.buildings,
    metropolises: metroTransition.metropolises,
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      commodities: subtractCommoditiesPure(p.commodities, payment),
      cityImprovements: {
        ...p.cityImprovements,
        [action.discipline]: check.nextLevel,
      },
      activeTurnDiscounts: {
        ...p.activeTurnDiscounts,
        crane: false,
      },
    })),
  };

  const disciplineLabel =
    action.discipline.charAt(0).toUpperCase() + action.discipline.slice(1);
  const metroSuffix = metroTransition.claimedTargetVId
    ? ` and crowned the ${disciplineLabel} Metropolis (+2 VP)!`
    : ".";
  const logged = appendCatanEvent(
    improvedState,
    [],
    "CITY_IMPROVEMENT_UPGRADED",
    `${player.name} upgraded ${disciplineLabel} to Level ${check.nextLevel}${metroSuffix}`,
    playerId,
    {
      discipline: action.discipline,
      level: check.nextLevel,
      metropolisVertexId: metroTransition.claimedTargetVId,
    }
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyPlayProgressCardPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }>
): { state: CatanState; events: GameEvent[] } {
  if (!currentState.config.enableCitiesAndKnights) {
    throw new Error("Cities & Knights is not enabled");
  }
  if (activePlayer.id !== playerId) {
    throw new Error("Not your turn");
  }
  const cardInHand = player.progressCards.find((c) => c.id === action.cardId);
  if (!cardInHand) {
    throw new Error(`Progress card ${action.cardId} not in hand`);
  }

  if (currentState.phase === "PRE_ROLL") {
    if (cardInHand.type !== "alchemist") {
      throw new Error("Only Alchemist can be played before rolling the dice");
    }
    const die1 = action.params?.die1;
    const die2 = action.params?.die2;
    if (
      typeof die1 !== "number" ||
      typeof die2 !== "number" ||
      !Number.isInteger(die1) ||
      !Number.isInteger(die2) ||
      die1 < 1 ||
      die1 > 6 ||
      die2 < 1 ||
      die2 > 6
    ) {
      throw new Error("Alchemist requires valid die1 and die2 (1-6)");
    }

    const consumed = consumePlayerProgressCardPure(
      currentState,
      playerId,
      action.cardId
    );
    const [eventFace, nextRngState] = rollEventDiePure(
      consumed.state.rngState
    );
    const total = die1 + die2;
    const rolledState: CatanState = {
      ...consumed.state,
      rngState: nextRngState,
      lastRoll: { die1, die2, total, eventFace },
      pendingRollResolution: { die1, die2, total },
    };
    const loggedAlch = appendCatanEvent(
      rolledState,
      [],
      "PROGRESS_CARD_PLAYED",
      `${player.name} played Alchemist and chose dice ${die1} + ${die2} = ${total}!`,
      playerId,
      { cardType: "alchemist", die1, die2 }
    );
    const loggedRoll = appendCatanEvent(
      loggedAlch.state,
      loggedAlch.emitted,
      "DICE_ROLLED",
      `${player.name} rolled ${die1} + ${die2} = ${total} [${eventFace.toUpperCase()}].`,
      playerId,
      { die1, die2, total, eventFace }
    );
    const eventResolved = resolveEventDieRollPure(
      loggedRoll.state,
      eventFace,
      die2,
      loggedRoll.emitted
    );
    const finalized = continuePostEventDieRollPure(
      eventResolved.state,
      eventResolved.emitted
    );
    return { state: finalized.state, events: finalized.emitted };
  }

  if (currentState.phase !== "MAIN_PHASE") {
    throw new Error(`Cannot play Progress Card during ${currentState.phase}`);
  }
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }

  const consumed = consumePlayerProgressCardPure(
    currentState,
    playerId,
    action.cardId
  );
  const applied = applyMainPhaseProgressCardPure(
    consumed.state,
    playerId,
    consumed.card,
    action.params,
    computePlayerVictoryPoints,
    (s, pid) => getLegalRoadEdges(s, pid, null),
    (s, pid) => getLegalShipEdges(s, pid, null),
    getLegalRobberHexes,
    (s, pid, edgeId, emitted) =>
      revealAdjacentFogHexesPure(s, edgeId, pid, emitted)
  );

  const awardedState = recalculateAwardsPure(applied.state);
  if (
    awardedState.phase === "MAIN_PHASE" ||
    awardedState.phase === "ROAD_BUILDING_DEV"
  ) {
    const checked = checkAndAssignWinnerPure(awardedState, playerId);
    return { state: checked.state, events: applied.emitted };
  }
  return { state: awardedState, events: applied.emitted };
}
