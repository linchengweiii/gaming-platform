import type { GameEvent, VertexId } from "@gaming-platform/core";
import {
  BARBARIAN_TRACK_STEPS,
  PROGRESS_CARD_CATALOG,
} from "../config/cities-knights-config.ts";
import {
  type EventDieFace,
  IMPROVEMENT_DISCIPLINES,
  type ImprovementDiscipline,
  type ProgressCardInstance,
  type ProgressCardType,
} from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { type StateEventsPair, pushCkEvent } from "./helpers.ts";
import { getPlayerVulnerableCities } from "./improvements.ts";
import {
  getBarbarianStrength,
  getPlayerActiveKnightStrength,
} from "./knights.ts";

/**
 * Purely downgrades a vulnerable city at `vertexId` to a settlement after a Barbarian victory.
 * Handles physical piece conservation when `settlementsRemaining === 0` via `borrowedCityPiece`.
 */
export function downgradePillagedCityPure(
  state: CatanState,
  vertexId: VertexId
): CatanState {
  const b = state.buildings[vertexId];
  if (!b || b.type !== "city" || b.metropolis) {
    return state;
  }

  const owner = state.players.find((p) => p.id === b.ownerId);
  if (!owner) return state;

  const hadWall = Boolean(b.hasWall);
  const useRegularSettlement = owner.settlementsRemaining > 0;

  const nextBuildings: CatanState["buildings"] = {
    ...state.buildings,
    [vertexId]: {
      ownerId: b.ownerId,
      type: "settlement",
      ...(useRegularSettlement ? {} : { borrowedCityPiece: true }),
    },
  };

  const nextPlayers = state.players.map((p) => {
    if (p.id !== b.ownerId) return p;
    return {
      ...p,
      settlementsRemaining: useRegularSettlement
        ? p.settlementsRemaining - 1
        : p.settlementsRemaining,
      citiesRemaining: useRegularSettlement
        ? p.citiesRemaining + 1
        : p.citiesRemaining,
      cityWallsRemaining: hadWall
        ? p.cityWallsRemaining + 1
        : p.cityWallsRemaining,
    };
  });

  return {
    ...state,
    buildings: nextBuildings,
    players: nextPlayers,
  };
}

/**
 * Draws the top card of `discipline` for `playerId`.
 * Revealed VP cards (`printer`, `constitution`) score immediately; normal cards enter `progressCards`
 * and queue `pendingProgressDiscards` if the player exceeds the 4-card hand limit.
 */
export function drawProgressCardForPlayerPure(
  state: CatanState,
  playerId: string,
  discipline: ImprovementDiscipline,
  emitted: readonly GameEvent[]
): StateEventsPair {
  const deck = state.progressDecks[discipline];
  if (deck.length === 0) {
    return { state, emitted: emitted.slice() };
  }

  const [drawnType, ...restDeck] = deck as [ProgressCardType, ...ProgressCardType[]];

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return { state, emitted: emitted.slice() };
  }

  const nextDecks = {
    ...state.progressDecks,
    [discipline]: restDeck,
  };

  if (drawnType === "printer" || drawnType === "constitution") {
    const title = PROGRESS_CARD_CATALOG[drawnType].title;
    const nextState: CatanState = {
      ...state,
      progressDecks: nextDecks,
      players: state.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              publicProgressVpCards: [...p.publicProgressVpCards, drawnType],
            }
          : p
      ),
    };
    return pushCkEvent(
      nextState,
      emitted,
      "PROGRESS_VP_REVEALED",
      `${player.name} drew ${title} (${discipline}) and gained +1 Victory Point!`,
      playerId,
      { discipline, cardType: drawnType }
    );
  }

  const cardInstance: ProgressCardInstance = {
    id: `prog-${state.turn}-${state.eventLog.length}-${playerId}-${player.progressCards.length}`,
    type: drawnType,
    discipline,
  };

  const nextPlayerCards = [...player.progressCards, cardInstance];
  const activePlayerId = state.players[state.activePlayerIndex]?.id;
  // Official C&K: non-active players exceeding 4 cards discard immediately; the active player may hold >4 until end of turn.
  const mustDiscardImmediately =
    nextPlayerCards.length > 4 && playerId !== activePlayerId;
  const nextPendingDiscards =
    mustDiscardImmediately && !state.pendingProgressDiscards.includes(playerId)
      ? [...state.pendingProgressDiscards, playerId]
      : state.pendingProgressDiscards;

  const nextState: CatanState = {
    ...state,
    progressDecks: nextDecks,
    pendingProgressDiscards: nextPendingDiscards,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, progressCards: nextPlayerCards } : p
    ),
  };

  return pushCkEvent(
    nextState,
    emitted,
    "PROGRESS_CARD_DRAWN",
    `${player.name} drew 1 ${discipline} Progress Card.`,
    playerId,
    { discipline }
  );
}

/**
 * Resolves the Event Die (`barbarian` vs `trade` / `politics` / `science`) prior to 2d6 production.
 */
export function resolveEventDieRollPure(
  state: CatanState,
  eventFace: EventDieFace,
  redDie: number,
  emitted: readonly GameEvent[]
): StateEventsPair {
  if (eventFace !== "barbarian") {
    const n = state.players.length;
    const startIdx = state.activePlayerIndex;
    const orderedPlayers = Array.from(
      { length: n },
      (_, offset) => state.players[(startIdx + offset) % n]!
    );

    return orderedPlayers.reduce<StateEventsPair>(
      (acc, p) => {
        const level = p.cityImprovements[eventFace];
        // Official C&K flip-chart caliper numbers: Level 1 -> [1,2], ..., Level 5 -> [1..6]
        if (level >= 1 && redDie <= level + 1) {
          return drawProgressCardForPlayerPure(
            acc.state,
            p.id,
            eventFace,
            acc.emitted
          );
        }
        return acc;
      },
      { state, emitted: emitted.slice() }
    );
  }

  const nextPos = state.barbarianPosition + 1;
  if (nextPos < BARBARIAN_TRACK_STEPS) {
    const advancedState: CatanState = {
      ...state,
      barbarianPosition: nextPos,
    };
    return pushCkEvent(
      advancedState,
      emitted,
      "BARBARIAN_ADVANCED",
      `Barbarian fleet advanced to ${nextPos}/${BARBARIAN_TRACK_STEPS}.`
    );
  }

  // Barbarian Attack! Order players clockwise starting from activePlayerIndex for tie-break picks & pillage selections.
  const barbarianStrength = getBarbarianStrength(state);
  const numPlayers = state.players.length;
  const startIdx = state.activePlayerIndex;
  const contributions = Array.from({ length: numPlayers }, (_, offset) => {
    const p = state.players[(startIdx + offset) % numPlayers]!;
    return {
      player: p,
      strength: getPlayerActiveKnightStrength(state, p.id),
      vulnerableCities: getPlayerVulnerableCities(state, p.id),
    };
  });
  const defenderStrength = contributions.reduce<number>(
    (s, c) => s + c.strength,
    0
  );

  // All knights deactivate after the battle
  const deactivatedKnights = Object.fromEntries(
    Object.entries(state.knights).map(([vId, k]) => [
      vId,
      { ...k, active: false },
    ])
  );

  const basePostBattle: CatanState = {
    ...state,
    barbarianPosition: 0,
    barbarianAttacksCount: state.barbarianAttacksCount + 1,
    knights: deactivatedKnights,
  };

  if (barbarianStrength === 0 || defenderStrength >= barbarianStrength) {
    const maxContribution = Math.max(0, ...contributions.map((c) => c.strength));
    const topContributors =
      maxContribution > 0
        ? contributions.filter((c) => c.strength === maxContribution)
        : [];

    if (topContributors.length === 1) {
      const hero = topContributors[0]!.player;
      const summary = `Catan defeated the Barbarians (${defenderStrength} vs ${barbarianStrength})! ${hero.name} earned Defender of Catan (+1 VP).`;
      const heroState: CatanState = {
        ...basePostBattle,
        players: basePostBattle.players.map((p) =>
          p.id === hero.id ? { ...p, defenderPoints: p.defenderPoints + 1 } : p
        ),
      };
      return pushCkEvent(
        heroState,
        emitted,
        "BARBARIAN_DEFEATED",
        summary,
        hero.id,
        { barbarianStrength, defenderStrength, defenderId: hero.id }
      );
    }

    if (topContributors.length > 1) {
      const hasAnyDeck = IMPROVEMENT_DISCIPLINES.some(
        (d) => basePostBattle.progressDecks[d].length > 0
      );
      const tiedIds = hasAnyDeck
        ? topContributors.map((c) => c.player.id)
        : [];
      const names = topContributors.map((c) => c.player.name).join(", ");
      const summary = `Catan defeated the Barbarians (${defenderStrength} vs ${barbarianStrength})! Top defenders (${names}) each draw 1 Progress Card.`;
      const tiedState: CatanState = {
        ...basePostBattle,
        pendingDefenderDeckPicks: tiedIds,
      };
      return pushCkEvent(
        tiedState,
        emitted,
        "BARBARIAN_DEFEATED",
        summary,
        undefined,
        {
          barbarianStrength,
          defenderStrength,
          tiedIds,
        }
      );
    }

    const summary = `The Barbarian fleet landed (${defenderStrength} vs ${barbarianStrength}), finding no cities to plunder.`;
    return pushCkEvent(basePostBattle, emitted, "BARBARIAN_DEFEATED", summary);
  }

  // Barbarians Win! Players with >= 1 vulnerable city who contributed the LEAST lose 1 city.
  const vulnerableEntries = contributions.filter(
    (c) => c.vulnerableCities.length > 0
  );

  if (vulnerableEntries.length === 0) {
    const summary = `Barbarians overpowered Catan (${barbarianStrength} vs ${defenderStrength}), but all cities are protected by Metropolises!`;
    return pushCkEvent(basePostBattle, emitted, "BARBARIAN_VICTORY", summary);
  }

  const minStrength = Math.min(...vulnerableEntries.map((c) => c.strength));
  const losers = vulnerableEntries.filter((c) => c.strength === minStrength);

  const pillageResolved = losers.reduce<{
    state: CatanState;
    pendingSelections: string[];
    pillagedNames: string[];
  }>(
    (acc, entry) => {
      if (entry.vulnerableCities.length === 1) {
        return {
          state: downgradePillagedCityPure(acc.state, entry.vulnerableCities[0]!),
          pendingSelections: acc.pendingSelections,
          pillagedNames: [...acc.pillagedNames, entry.player.name],
        };
      }
      return {
        state: acc.state,
        pendingSelections: [...acc.pendingSelections, entry.player.id],
        pillagedNames: [...acc.pillagedNames, entry.player.name],
      };
    },
    { state: basePostBattle, pendingSelections: [], pillagedNames: [] }
  );

  const summary = `Barbarians pillaged Catan (${barbarianStrength} vs ${defenderStrength})! ${pillageResolved.pillagedNames.join(", ")} lost a City.`;
  const finalBarbState: CatanState = {
    ...pillageResolved.state,
    pendingPillageSelections: pillageResolved.pendingSelections,
  };

  return pushCkEvent(
    finalBarbState,
    emitted,
    "BARBARIAN_VICTORY",
    summary,
    undefined,
    {
      barbarianStrength,
      defenderStrength,
    }
  );
}
