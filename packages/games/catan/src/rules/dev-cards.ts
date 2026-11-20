import type { GameEvent } from "@gaming-platform/core";
import { BUILDING_COSTS } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import type { DevCardInstance, ResourceMap } from "../types/domain.ts";
import { isResourceType } from "../cities-and-knights/helpers.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  recalculateAwardsPure,
} from "./awards-and-vp.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  assertCanBuildInCurrentPhase,
  canPlayDevCard,
  hasResources,
  markFirstPlayableDevCardUsed,
  subtractResourcesPure,
  totalResourceCount,
  updatePlayerById,
} from "./helpers.ts";
import { getLegalRoadEdges, getLegalShipEdges } from "./network.ts";

export function applyBuyDevCardPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  assertCanBuildInCurrentPhase(currentState, playerId);
  if (currentState.devCardDeck.length === 0) {
    throw new Error("Development card deck is empty");
  }
  if (!hasResources(player.resources, BUILDING_COSTS.devCard)) {
    throw new Error("Insufficient resources for development card");
  }

  const cardType = currentState.devCardDeck[currentState.devCardDeck.length - 1]!;
  const nextDeck = currentState.devCardDeck.slice(0, -1);
  const newCard: DevCardInstance = {
    id: `dev-${currentState.turn}-${player.devCards.length}-${nextDeck.length}`,
    type: cardType,
    boughtOnTurn: currentState.turn,
    played: false,
  };

  const boughtState: CatanState = {
    ...currentState,
    bank: addResourcesPure(currentState.bank, BUILDING_COSTS.devCard),
    devCardDeck: nextDeck,
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      resources: subtractResourcesPure(p.resources, BUILDING_COSTS.devCard),
      devCards: [...p.devCards, newCard],
    })),
  };

  const logged = appendCatanEvent(
    boughtState,
    [],
    "DEV_CARD_BOUGHT",
    `${player.name} bought a Development Card.`,
    playerId
  );
  const checked = checkAndAssignWinnerPure(logged.state, playerId);
  return { state: checked.state, events: logged.emitted };
}

export function applyPlayKnightPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (
    (currentState.phase !== "PRE_ROLL" &&
      currentState.phase !== "MAIN_PHASE") ||
    activePlayer.id !== playerId
  ) {
    throw new Error("Cannot play Knight right now");
  }
  if (currentState.phase === "MAIN_PHASE" && currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  if (!canPlayDevCard(currentState, player, "knight")) {
    throw new Error("No playable Knight card");
  }

  const nextKnightsCount = player.knightsPlayed + 1;
  const playedState: CatanState = {
    ...currentState,
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      devCards: markFirstPlayableDevCardUsed(
        p.devCards,
        "knight",
        currentState.turn
      ),
      hasPlayedDevCardThisTurn: true,
      knightsPlayed: nextKnightsCount,
    })),
  };

  const logged = appendCatanEvent(
    playedState,
    [],
    "KNIGHT_PLAYED",
    `${player.name} played a Knight (${nextKnightsCount} total).`,
    playerId
  );
  const returnPhase: "PRE_ROLL" | "MAIN_PHASE" =
    currentState.phase === "PRE_ROLL" ? "PRE_ROLL" : "MAIN_PHASE";
  const awarded = recalculateAwardsPure(logged.state);
  return {
    state: {
      ...awarded,
      phaseAfterRobber: returnPhase,
      phase: "MOVE_ROBBER_OR_PIRATE",
    },
    events: logged.emitted,
  };
}

export function applyPlayRoadBuildingPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Cannot play Road Building right now");
  }
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  if (!canPlayDevCard(currentState, player, "road_building")) {
    throw new Error("No playable Road Building card");
  }

  const availablePieces = player.roadsRemaining + player.shipsRemaining;
  const availableSpots =
    getLegalRoadEdges(currentState, playerId, null).length +
    getLegalShipEdges(currentState, playerId, null).length;
  const freeRoadsRemaining =
    availableSpots > 0 ? Math.min(2, availablePieces) : 0;
  if (freeRoadsRemaining <= 0) {
    throw new Error(
      "No legal road or ship placements available for Road Building"
    );
  }

  const playedState: CatanState = {
    ...currentState,
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      devCards: markFirstPlayableDevCardUsed(
        p.devCards,
        "road_building",
        currentState.turn
      ),
      hasPlayedDevCardThisTurn: true,
    })),
    freeRoadsRemaining,
    phase: freeRoadsRemaining > 0 ? "ROAD_BUILDING_DEV" : currentState.phase,
  };

  const logged = appendCatanEvent(
    playedState,
    [],
    "ROAD_BUILDING_PLAYED",
    `${player.name} played Road Building!`,
    playerId
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyPlayYearOfPlentyPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PLAY_YEAR_OF_PLENTY" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Cannot play Year of Plenty right now");
  }
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  if (!canPlayDevCard(currentState, player, "year_of_plenty")) {
    throw new Error("No playable Year of Plenty card");
  }
  if (
    !isResourceType(action.resource1) ||
    !isResourceType(action.resource2)
  ) {
    throw new Error("Invalid resource selected for Year of Plenty");
  }
  const totalBankResources = totalResourceCount(currentState.bank);
  if (totalBankResources <= 0) {
    throw new Error("Bank has no resources remaining");
  }
  const singleBankCardOnly =
    action.resource1 === action.resource2 &&
    totalBankResources === 1 &&
    currentState.bank[action.resource1] === 1;
  if (action.resource1 === action.resource2) {
    if (!singleBankCardOnly && currentState.bank[action.resource1] < 2) {
      throw new Error(`Bank does not have 2 ${action.resource1}`);
    }
  } else {
    if (
      currentState.bank[action.resource1] < 1 ||
      currentState.bank[action.resource2] < 1
    ) {
      throw new Error("Bank does not have requested resources");
    }
  }

  const delta: Partial<ResourceMap> =
    action.resource1 === action.resource2
      ? { [action.resource1]: singleBankCardOnly ? 1 : 2 }
      : { [action.resource1]: 1, [action.resource2]: 1 };

  const playedState: CatanState = {
    ...currentState,
    bank: subtractResourcesPure(currentState.bank, delta),
    players: updatePlayerById(currentState.players, playerId, (p) => ({
      ...p,
      devCards: markFirstPlayableDevCardUsed(
        p.devCards,
        "year_of_plenty",
        currentState.turn
      ),
      hasPlayedDevCardThisTurn: true,
      resources: addResourcesPure(p.resources, delta),
    })),
  };

  const logged = appendCatanEvent(
    playedState,
    [],
    "YEAR_OF_PLENTY_PLAYED",
    `${player.name} played Year of Plenty and took ${action.resource1} + ${action.resource2}.`,
    playerId,
    { resource1: action.resource1, resource2: action.resource2 }
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyPlayMonopolyPure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "PLAY_MONOPOLY" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Cannot play Monopoly right now");
  }
  if (currentState.activeTradeOffer) {
    throw new Error("Resolve the active domestic trade offer first");
  }
  if (!canPlayDevCard(currentState, player, "monopoly")) {
    throw new Error("No playable Monopoly card");
  }
  if (!isResourceType(action.resource)) {
    throw new Error("Invalid resource selected for Monopoly");
  }

  const totalClaimed = currentState.players.reduce<number>(
    (sum, other) =>
      other.id === playerId ? sum : sum + other.resources[action.resource],
    0
  );

  const nextPlayers = currentState.players.map((other) => {
    if (other.id === playerId) {
      return {
        ...other,
        devCards: markFirstPlayableDevCardUsed(
          other.devCards,
          "monopoly",
          currentState.turn
        ),
        hasPlayedDevCardThisTurn: true,
        resources: addResourcesPure(other.resources, {
          [action.resource]: totalClaimed,
        }),
      };
    }
    if (other.resources[action.resource] === 0) {
      return other;
    }
    return {
      ...other,
      resources: {
        ...other.resources,
        [action.resource]: 0,
      },
    };
  });

  const playedState: CatanState = {
    ...currentState,
    players: nextPlayers,
  };
  const logged = appendCatanEvent(
    playedState,
    [],
    "MONOPOLY_PLAYED",
    `${player.name} played Monopoly on ${action.resource.toUpperCase()} and collected ${totalClaimed} cards!`,
    playerId,
    { resource: action.resource, totalClaimed }
  );
  return { state: logged.state, events: logged.emitted };
}
