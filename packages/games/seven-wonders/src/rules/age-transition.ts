import type { GameEvent } from "@gaming-platform/core";
import {
  SEVEN_WONDERS_MILITARY_DEFEAT_POINTS,
  SEVEN_WONDERS_MILITARY_VICTORY_POINTS_BY_AGE,
  SEVEN_WONDERS_PASS_DIRECTION_BY_AGE,
  SEVEN_WONDERS_TURNS_PER_AGE,
} from "../config/game-config.ts";
import type { SevenWondersPlayerState, SevenWondersState } from "../types.ts";
import {
  appendSwEvent,
  dealHandsToPlayers,
  getLeftNeighborIndex,
  getPlayerShields,
  getRightNeighborIndex,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "./helpers.ts";
import { refreshAllPlayerScores } from "./scoring.ts";

export function resolveEndOfAgeOrFinish(
  state: SevenWondersState,
  incomingEvents: readonly GameEvent[]
): { state: SevenWondersState; events: GameEvent[] } {
  let eventLog = [...state.eventLog];
  let batch = [...incomingEvents];
  const n = state.players.length;
  const victoryPointsForAge =
    SEVEN_WONDERS_MILITARY_VICTORY_POINTS_BY_AGE[state.age];

  const shieldsByIndex = state.players.map((p) => getPlayerShields(p));

  const updatedAfterWar: SevenWondersPlayerState[] = state.players.map(
    (p, idx) => {
      const leftIdx = getLeftNeighborIndex(idx, n);
      const rightIdx = getRightNeighborIndex(idx, n);
      const myShields = shieldsByIndex[idx]!;
      const newTokens = [...p.militaryTokens];

      for (const oppIdx of [leftIdx, rightIdx]) {
        const oppShields = shieldsByIndex[oppIdx]!;
        const opp = state.players[oppIdx]!;
        if (myShields > oppShields) {
          newTokens.push({
            age: state.age,
            points: victoryPointsForAge,
            opponentId: opp.id,
          });
        } else if (myShields < oppShields) {
          newTokens.push({
            age: state.age,
            points: SEVEN_WONDERS_MILITARY_DEFEAT_POINTS,
            opponentId: opp.id,
          });
        }
      }

      return {
        ...p,
        militaryTokens: newTokens,
      };
    }
  );

  const warSummary = updatedAfterWar
    .map((p, idx) => `${p.name} (${shieldsByIndex[idx]} shields)`)
    .join(", ");
  ({ eventLog, batch } = appendSwEvent(
    eventLog,
    batch,
    state.turn,
    "MILITARY_CONFLICT",
    `Age ${state.age} military conflicts resolved: ${warSummary}.`
  ));

  if (state.age < 3) {
    const nextAge = (state.age + 1) as 2 | 3;
    const nextPass = SEVEN_WONDERS_PASS_DIRECTION_BY_AGE[nextAge];
    const dealtPlayers = refreshAllPlayerScores(
      dealHandsToPlayers(updatedAfterWar, state.ageDecks[nextAge])
    );

    ({ eventLog, batch } = appendSwEvent(
      eventLog,
      batch,
      state.turn + 1,
      "AGE_START",
      `Age ${nextAge === 2 ? "II" : "III"} begins (passing ${
        nextPass === "clockwise" ? "clockwise" : "counter-clockwise"
      }).`
    ));

    return {
      state: {
        ...state,
        phase: "AGE_DRAFT",
        age: nextAge,
        draftRound: 1,
        turn: state.turn + 1,
        passDirection: nextPass,
        players: dealtPlayers,
        pendingChoices: {},
        lockedPlayerIds: [],
        seventhCardQueue: [],
        halikarnassusQueue: [],
        eventLog,
      },
      events: batch,
    };
  }

  // End of Age III -> GAME_OVER!
  const finalPlayers = refreshAllPlayerScores(updatedAfterWar);
  const ranked = [...finalPlayers].sort(
    (a, b) =>
      b.scoreBreakdown.totalVp - a.scoreBreakdown.totalVp ||
      b.coins - a.coins
  );
  const winner = ranked[0]!;

  ({ eventLog, batch } = appendSwEvent(
    eventLog,
    batch,
    state.turn,
    "GAME_OVER",
    `Era complete! ${winner.name} triumphs with ${winner.scoreBreakdown.totalVp} Victory Points (${winner.coins} treasury coins).`,
    winner.id
  ));

  return {
    state: {
      ...state,
      phase: "GAME_OVER",
      players: finalPlayers,
      pendingChoices: {},
      lockedPlayerIds: [],
      seventhCardQueue: [],
      halikarnassusQueue: [],
      winnerId: winner.id,
      eventLog,
    },
    events: batch,
  };
}

export function advancePostTurnQueuesOrNextRound(
  state: SevenWondersState,
  incomingEvents: readonly GameEvent[]
): { state: SevenWondersState; events: GameEvent[] } {
  let eventLog = [...state.eventLog];
  let batch = [...incomingEvents];

  // 1. If we just finished round 6 (players still hold 1 remaining 7th card):
  // Check Babylon B2 (`play_seventh_card`) vs discarding remaining 7th cards BEFORE Halikarnassus!
  if (
    state.draftRound === SEVEN_WONDERS_TURNS_PER_AGE &&
    state.seventhCardQueue.length === 0 &&
    state.players.some((p) => p.hand.length > 0)
  ) {
    const seventhPlayers: string[] = [];
    let nextDiscardPile = [...state.discardPile];
    const updatedPlayers = state.players.map((p) => {
      if (p.hand.length === 0) return p;
      if (hasWonderStageEffect(p, "play_seventh_card")) {
        seventhPlayers.push(p.id);
        return p;
      }
      nextDiscardPile = [...nextDiscardPile, ...p.hand];
      return { ...p, hand: [] };
    });

    if (seventhPlayers.length > 0) {
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        state.turn,
        "BABYLON_SEVENTH_CARD",
        `Hanging Gardens of Babylon activates — playing the 7th card of Age ${state.age}.`,
        seventhPlayers[0]
      ));
      return {
        state: {
          ...state,
          phase: "SEVENTH_CARD_PLAY",
          players: refreshAllPlayerScores(updatedPlayers),
          discardPile: nextDiscardPile,
          seventhCardQueue: seventhPlayers,
          eventLog,
        },
        events: batch,
      };
    }

    state = {
      ...state,
      players: refreshAllPlayerScores(updatedPlayers),
      discardPile: nextDiscardPile,
      eventLog,
    };
  }

  if (state.seventhCardQueue.length > 0) {
    return {
      state: {
        ...state,
        phase: "SEVENTH_CARD_PLAY",
        eventLog,
      },
      events: batch,
    };
  }

  // 2. Halikarnassus free build from discard pile (only if discardPile has at least 1 non-duplicate card for that player)
  const validHalikarnassusQueue = state.halikarnassusQueue.filter((pid) => {
    const pl = state.players.find((x) => x.id === pid);
    return Boolean(
      pl &&
        state.discardPile.length > 0 &&
        state.discardPile.some((c) => !hasDuplicateCardName(pl, c.name))
    );
  });

  if (validHalikarnassusQueue.length > 0) {
    return {
      state: {
        ...state,
        phase: "HALIKARNASSUS_PICK",
        halikarnassusQueue: validHalikarnassusQueue,
        eventLog,
      },
      events: batch,
    };
  }

  // 3. End of Round 6 -> Resolve Military & Next Age / Game Over
  if (state.draftRound >= SEVEN_WONDERS_TURNS_PER_AGE) {
    return resolveEndOfAgeOrFinish(
      {
        ...state,
        halikarnassusQueue: [],
        eventLog,
      },
      batch
    );
  }

  // 4. Otherwise rotate hands and advance draftRound (1..5 -> 2..6)
  const n = state.players.length;
  const handsSnapshot = state.players.map((p) => p.hand);
  const rotatedPlayers = state.players.map((p, idx) => {
    // Clockwise means player i passes hand to (i + 1) % n -> so player idx receives from (idx - 1 + n) % n!
    // Counter-clockwise means player i passes hand to (i - 1 + n) % n -> so player idx receives from (idx + 1) % n!
    const senderIdx =
      state.passDirection === "clockwise"
        ? getLeftNeighborIndex(idx, n)
        : getRightNeighborIndex(idx, n);
    const nextHand = handsSnapshot[senderIdx]!;
    return {
      ...p,
      hand: nextHand,
      seenHandsThisAge: [...(p.seenHandsThisAge ?? []), nextHand],
    };
  });

  return {
    state: {
      ...state,
      phase: "AGE_DRAFT",
      draftRound: state.draftRound + 1,
      turn: state.turn + 1,
      players: refreshAllPlayerScores(rotatedPlayers),
      pendingChoices: {},
      lockedPlayerIds: [],
      halikarnassusQueue: [],
      eventLog,
    },
    events: batch,
  };
}
