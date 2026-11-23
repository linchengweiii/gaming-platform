import type { GameEvent } from "@gaming-platform/core";
import type { KnightLevel } from "../types/domain.ts";
import type {
  CatanPlayerState,
  CatanState,
  PendingCkInteraction,
} from "../types/state.ts";
import {
  checkAndAssignWinnerPure,
  recalculateAwardsPure,
} from "../rules/awards-and-vp.ts";
import { pushCkEvent } from "./helpers.ts";
import type { CkInteractionAction } from "./interactions-legal.ts";
import {
  getLegalKnightPlacementVerticesPure,
  returnKnightToSupplyPure,
  takeKnightFromSupplyPure,
} from "./knights.ts";

function finalizeToMainAndCheckActiveWinner(
  state: CatanState,
  events: GameEvent[]
): { state: CatanState; events: GameEvent[] } {
  const activeId = state.players[state.activePlayerIndex]!.id;
  const checked = checkAndAssignWinnerPure(
    { ...state, pendingCkInteraction: null, phase: "MAIN_PHASE" },
    activeId
  );
  return { state: checked.state, events };
}

export function applyCkKnightInteractionPure(
  currentState: CatanState,
  pending: PendingCkInteraction,
  actor: CatanPlayerState,
  playerId: string,
  action: Extract<
    CkInteractionAction,
    | { type: "RESOLVE_DISPLACED_KNIGHT" }
    | { type: "SELECT_DESERTER_KNIGHT" }
    | { type: "PLACE_DESERTED_KNIGHT" }
  >
): { state: CatanState; events: GameEvent[] } {
  switch (action.type) {
    case "RESOLVE_DISPLACED_KNIGHT": {
      if (pending.kind !== "displace_knight") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      if (!pending.candidateVertexIds.includes(action.vertexId)) {
        throw new Error(`Illegal knight retreat vertex ${action.vertexId}`);
      }
      const nextState: CatanState = {
        ...currentState,
        knights: {
          ...currentState.knights,
          [action.vertexId]: pending.knight,
        },
        pendingCkInteraction: null,
        phase: "MAIN_PHASE",
      };
      const logged = pushCkEvent(
        nextState,
        [],
        "KNIGHT_RETREATED",
        `${actor.name} retreated their displaced Knight.`,
        playerId,
        { vertexId: action.vertexId }
      );
      return finalizeToMainAndCheckActiveWinner(logged.state, logged.emitted);
    }

    case "SELECT_DESERTER_KNIGHT": {
      if (pending.kind !== "deserter_choose_knight") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      if (!pending.candidateVertexIds.includes(action.vertexId)) {
        throw new Error(`Illegal deserter knight vertex ${action.vertexId}`);
      }
      const desertKnight = currentState.knights[action.vertexId];
      if (!desertKnight || desertKnight.ownerId !== playerId) {
        throw new Error("Chosen vertex does not contain your knight");
      }
      const withoutDeserted = Object.fromEntries(
        Object.entries(currentState.knights).filter(
          ([vId]) => vId !== action.vertexId
        )
      );
      const withReturnedSupply = currentState.players.map((p) =>
        p.id === playerId ? returnKnightToSupplyPure(p, desertKnight.level) : p
      );
      const afterRemove: CatanState = recalculateAwardsPure({
        ...currentState,
        knights: withoutDeserted,
        players: withReturnedSupply,
      });

      // Official C&K FAQ: Deserter allows placing a matching (or next lower available) knight
      // WITHOUT requiring a Fortress (Politics Lv 3) for a Mighty Knight.
      const initiator = afterRemove.players.find(
        (p) => p.id === pending.initiatorId
      )!;
      const candidates: KnightLevel[] =
        desertKnight.level === 3
          ? [3, 2, 1]
          : desertKnight.level === 2
            ? [2, 1]
            : [1];
      const chosenLevel: KnightLevel | null =
        candidates.find((lvl) =>
          lvl === 3
            ? initiator.mightyKnightsRemaining > 0
            : lvl === 2
              ? initiator.strongKnightsRemaining > 0
              : initiator.basicKnightsRemaining > 0
        ) ?? null;

      const placeCandidates = chosenLevel
        ? getLegalKnightPlacementVerticesPure(afterRemove, pending.initiatorId)
        : [];
      const logged = pushCkEvent(
        afterRemove,
        [],
        "DESERTER_KNIGHT_REMOVED",
        `${actor.name}'s Level ${desertKnight.level} Knight deserted!`,
        playerId,
        { vertexId: action.vertexId, level: desertKnight.level }
      );

      if (chosenLevel && placeCandidates.length > 0) {
        const nextPending: PendingCkInteraction = {
          kind: "deserter_place_knight",
          actorId: pending.initiatorId,
          targetPlayerId: playerId,
          vacatedVertexId: action.vertexId,
          knightLevel: chosenLevel,
          knightActive: desertKnight.active,
          candidateVertexIds: placeCandidates,
        };
        return {
          state: {
            ...logged.state,
            phase: "CK_INTERACTION",
            pendingCkInteraction: nextPending,
          },
          events: logged.emitted,
        };
      }
      return finalizeToMainAndCheckActiveWinner(logged.state, logged.emitted);
    }

    case "PLACE_DESERTED_KNIGHT": {
      if (pending.kind !== "deserter_place_knight") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      if (!pending.candidateVertexIds.includes(action.vertexId)) {
        throw new Error(`Illegal deserted knight placement ${action.vertexId}`);
      }
      // Official C&K FAQ: an active knight gained via Deserter MAY act on the same turn.
      const placedState: CatanState = {
        ...currentState,
        knights: {
          ...currentState.knights,
          [action.vertexId]: {
            ownerId: playerId,
            level: pending.knightLevel,
            active: pending.knightActive,
            activatedThisTurn: false,
            actedThisTurn: false,
            promotedThisTurn: false,
          },
        },
        players: currentState.players.map((p) =>
          p.id === playerId
            ? takeKnightFromSupplyPure(p, pending.knightLevel)
            : p
        ),
        pendingCkInteraction: null,
        phase: "MAIN_PHASE",
      };
      const logged = pushCkEvent(
        placedState,
        [],
        "DESERTER_KNIGHT_PLACED",
        `${actor.name} recruited the deserted Level ${pending.knightLevel} Knight!`,
        playerId,
        { vertexId: action.vertexId, level: pending.knightLevel }
      );
      return finalizeToMainAndCheckActiveWinner(logged.state, logged.emitted);
    }
  }
}
