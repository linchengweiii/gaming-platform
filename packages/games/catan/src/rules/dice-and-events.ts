import { type GameEvent, roll2d6Pure } from "@gaming-platform/core";
import {
  downgradePillagedCityPure,
  drawProgressCardForPlayerPure,
  resolveEventDieRollPure,
} from "../cities-and-knights/barbarians.ts";
import {
  consumePlayerProgressCardPure,
  rollEventDiePure,
} from "../cities-and-knights/helpers.ts";
import { getPlayerVulnerableCities } from "../cities-and-knights/improvements.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  recalculateAwardsPure,
} from "./awards-and-vp.ts";
import {
  type StateWithEvents,
  addResourcesPure,
  appendCatanEvent,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  omitRecordKey,
  totalResourceCount,
  updatePlayerById,
} from "./helpers.ts";
import { distributeRollResourcesPure } from "./production.ts";

/**
 * Shared continuation after resolving the Event Die (and any pillage / deck / progress-discard interrupts).
 */
export function continuePostEventDieRollPure(
  state: CatanState,
  emitted: readonly GameEvent[]
): StateWithEvents {
  if (state.pendingPillageSelections.length > 0) {
    return {
      state: recalculateAwardsPure({
        ...state,
        phase: "BARBARIAN_PILLAGE_SELECTION",
      }),
      emitted: emitted.slice(),
    };
  }

  if (
    state.pendingDefenderDeckPicks.length > 0 ||
    state.pendingProgressDiscards.length > 0
  ) {
    return {
      state: recalculateAwardsPure({
        ...state,
        phase: "PROGRESS_CARD_SELECTION",
      }),
      emitted: emitted.slice(),
    };
  }

  const activePlayer = state.players[state.activePlayerIndex]!;
  const winCheck = checkAndAssignWinnerPure(state, activePlayer.id);
  if (winCheck.won) {
    return {
      state: { ...winCheck.state, pendingRollResolution: null },
      emitted: emitted.slice(),
    };
  }

  const roll = winCheck.state.pendingRollResolution;
  if (!roll) {
    return {
      state: { ...winCheck.state, phase: "MAIN_PHASE" },
      emitted: emitted.slice(),
    };
  }

  const clearedRollState: CatanState = {
    ...winCheck.state,
    pendingRollResolution: null,
  };

  if (roll.total === 7) {
    const pendingDiscards = clearedRollState.players.reduce<
      Record<string, number>
    >((acc, p) => {
      const count = getPlayerResourceCount(p);
      const safeLimit = getPlayerSafeHandLimit(clearedRollState, p.id);
      return count > safeLimit
        ? { ...acc, [p.id]: Math.floor(count / 2) }
        : acc;
    }, {});

    const canMoveRobber =
      !clearedRollState.config.enableCitiesAndKnights ||
      clearedRollState.barbarianAttacksCount >= 1;
    const postSevenPhase = canMoveRobber
      ? ("MOVE_ROBBER_OR_PIRATE" as const)
      : ("MAIN_PHASE" as const);

    const sevenState: CatanState = {
      ...clearedRollState,
      pendingDiscards,
      phaseAfterRobber: "MAIN_PHASE",
      phaseAfterDiscard: postSevenPhase,
      phase:
        Object.keys(pendingDiscards).length > 0
          ? "DISCARD_ON_SEVEN"
          : postSevenPhase,
    };

    if (!canMoveRobber) {
      return appendCatanEvent(
        sevenState,
        emitted,
        "ROBBER_DORMANT",
        "The Robber stays on the desert until the first Barbarian attack."
      );
    }

    return { state: sevenState, emitted: emitted.slice() };
  }

  const distributed = distributeRollResourcesPure(
    clearedRollState,
    roll.total,
    emitted
  );
  return {
    state: {
      ...distributed.state,
      phase:
        Object.keys(distributed.state.pendingGoldPicks).length > 0
          ? "GOLD_RESOURCE_SELECTION"
          : "MAIN_PHASE",
    },
    emitted: distributed.emitted,
  };
}

export function applyRollDicePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "PRE_ROLL" || activePlayer.id !== playerId) {
    throw new Error("Cannot roll dice now");
  }

  if (!currentState.config.enableCitiesAndKnights) {
    const [roll, nextRngState] = roll2d6Pure(currentState.rngState);
    const rolledState: CatanState = {
      ...currentState,
      rngState: nextRngState,
      lastRoll: roll,
    };

    const logged = appendCatanEvent(
      rolledState,
      [],
      "DICE_ROLLED",
      `${player.name} rolled ${roll.total} (${roll.die1} + ${roll.die2}).`,
      playerId,
      roll
    );

    if (roll.total === 7) {
      const pendingDiscards = logged.state.players.reduce<
        Record<string, number>
      >((acc, p) => {
        const count = totalResourceCount(p.resources);
        const safeLimit = getPlayerSafeHandLimit(logged.state, p.id);
        return count > safeLimit
          ? { ...acc, [p.id]: Math.floor(count / 2) }
          : acc;
      }, {});

      return {
        state: {
          ...logged.state,
          pendingDiscards,
          phaseAfterRobber: "MAIN_PHASE",
          phaseAfterDiscard: "MOVE_ROBBER_OR_PIRATE",
          phase:
            Object.keys(pendingDiscards).length > 0
              ? "DISCARD_ON_SEVEN"
              : "MOVE_ROBBER_OR_PIRATE",
        },
        events: logged.emitted,
      };
    }

    const distributed = distributeRollResourcesPure(
      logged.state,
      roll.total,
      logged.emitted
    );
    return {
      state: {
        ...distributed.state,
        phase:
          Object.keys(distributed.state.pendingGoldPicks).length > 0
            ? "GOLD_RESOURCE_SELECTION"
            : "MAIN_PHASE",
      },
      events: distributed.emitted,
    };
  }

  // Cities & Knights: roll White + Red dice + Event Die
  const [roll, rngAfter2d6] = roll2d6Pure(currentState.rngState);
  const [eventFace, rngAfterEvent] = rollEventDiePure(rngAfter2d6);
  const fullRoll = { ...roll, eventFace };
  const eventLabel =
    eventFace === "barbarian"
      ? "Barbarian Ship"
      : `${eventFace[0]!.toUpperCase()}${eventFace.slice(1)} Gate`;

  const rolledCkState: CatanState = {
    ...currentState,
    rngState: rngAfterEvent,
    lastRoll: fullRoll,
    pendingRollResolution: roll,
  };

  const loggedRoll = appendCatanEvent(
    rolledCkState,
    [],
    "DICE_ROLLED",
    `${player.name} rolled ${roll.total} (${roll.die1} + red ${roll.die2} · ${eventLabel}).`,
    playerId,
    fullRoll
  );

  const eventResolved = resolveEventDieRollPure(
    loggedRoll.state,
    eventFace,
    roll.die2,
    loggedRoll.emitted
  );
  const continued = continuePostEventDieRollPure(
    eventResolved.state,
    eventResolved.emitted
  );
  return { state: continued.state, events: continued.emitted };
}

export function applySelectPillagedCityPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "SELECT_PILLAGED_CITY" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "BARBARIAN_PILLAGE_SELECTION" ||
    currentState.pendingPillageSelections[0] !== playerId
  ) {
    throw new Error("Not your turn to choose a pillaged city");
  }
  const vulnerable = getPlayerVulnerableCities(currentState, playerId);
  if (!vulnerable.includes(action.vertexId)) {
    throw new Error("Selected vertex is not a vulnerable city you own");
  }

  const downgraded = downgradePillagedCityPure(currentState, action.vertexId);
  const nextSelections = downgraded.pendingPillageSelections.slice(1);
  const logged = appendCatanEvent(
    { ...downgraded, pendingPillageSelections: nextSelections },
    [],
    "CITY_PILLAGED",
    `${player.name}'s city was pillaged to a settlement.`,
    playerId,
    { vertexId: action.vertexId }
  );
  const continued = continuePostEventDieRollPure(logged.state, logged.emitted);
  return { state: continued.state, events: continued.emitted };
}

export function applySelectProgressDeckPure(
  currentState: CatanState,
  playerId: string,
  action: Extract<CatanAction, { type: "SELECT_PROGRESS_DECK" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "PROGRESS_CARD_SELECTION" ||
    currentState.pendingDefenderDeckPicks[0] !== playerId
  ) {
    throw new Error("Not your turn to select a Progress Card deck");
  }
  const nextPicks = currentState.pendingDefenderDeckPicks.slice(1);
  const drawn = drawProgressCardForPlayerPure(
    { ...currentState, pendingDefenderDeckPicks: nextPicks },
    playerId,
    action.discipline,
    []
  );
  const continued = continuePostEventDieRollPure(drawn.state, drawn.emitted);
  return { state: continued.state, events: continued.emitted };
}

export function applyDiscardProgressCardPure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "DISCARD_PROGRESS_CARD" }>
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "PROGRESS_CARD_SELECTION" ||
    currentState.pendingProgressDiscards[0] !== playerId
  ) {
    throw new Error("Not your turn to discard a Progress Card");
  }
  const consumed = consumePlayerProgressCardPure(
    currentState,
    playerId,
    action.cardId
  );
  const updatedPlayer = consumed.state.players.find((p) => p.id === playerId)!;
  const nextDiscards =
    updatedPlayer.progressCards.length <= 4
      ? consumed.state.pendingProgressDiscards.slice(1)
      : consumed.state.pendingProgressDiscards;

  const logged = appendCatanEvent(
    { ...consumed.state, pendingProgressDiscards: nextDiscards },
    [],
    "PROGRESS_CARD_DISCARDED",
    `${player.name} returned 1 Progress Card to the bottom of the ${consumed.card.discipline} stack.`,
    playerId,
    { discipline: consumed.card.discipline }
  );

  if (logged.state.pendingRollResolution) {
    const continued = continuePostEventDieRollPure(
      logged.state,
      logged.emitted
    );
    return { state: continued.state, events: continued.emitted };
  }

  return {
    state: {
      ...logged.state,
      phase:
        nextDiscards.length > 0 ? "PROGRESS_CARD_SELECTION" : "MAIN_PHASE",
    },
    events: logged.emitted,
  };
}

export function applySelectGoldResourcePure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "SELECT_GOLD_RESOURCE" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "GOLD_RESOURCE_SELECTION") {
    throw new Error("Not in gold resource selection phase");
  }
  const remaining = currentState.pendingGoldPicks[playerId] ?? 0;
  if (remaining <= 0) {
    throw new Error("Player has no pending gold resource picks");
  }

  const picked =
    currentState.bank[action.resource] > 0
      ? (() => {
          const withPick: CatanState = {
            ...currentState,
            bank: {
              ...currentState.bank,
              [action.resource]: currentState.bank[action.resource] - 1,
            },
            players: updatePlayerById(currentState.players, playerId, (p) => ({
              ...p,
              resources: addResourcesPure(p.resources, {
                [action.resource]: 1,
              }),
            })),
          };
          const goldSuffix =
            !currentState.config.enableCitiesAndKnights ||
            currentState.config.enableSeafarers
              ? " from the Gold River."
              : " (Aqueduct).";
          return appendCatanEvent(
            withPick,
            [],
            "GOLD_RESOURCE_PICKED",
            `${player.name} chose 1 ${action.resource}${goldSuffix}`,
            playerId,
            { resource: action.resource }
          );
        })()
      : { state: currentState, emitted: [] as GameEvent[] };

  const nextPendingGoldPicks =
    remaining - 1 <= 0
      ? omitRecordKey(picked.state.pendingGoldPicks, playerId)
      : { ...picked.state.pendingGoldPicks, [playerId]: remaining - 1 };

  return {
    state: {
      ...picked.state,
      pendingGoldPicks: nextPendingGoldPicks,
      phase:
        Object.keys(nextPendingGoldPicks).length === 0
          ? "MAIN_PHASE"
          : picked.state.phase,
    },
    events: picked.emitted,
  };
}
