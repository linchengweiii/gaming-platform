import type { GameEvent } from "@gaming-platform/core";
import type { CatanAction } from "../types/actions.ts";
import type { CatanState } from "../types/state.ts";
import { checkAndAssignWinnerPure } from "./awards-and-vp.ts";
import { getBuildActionsPure } from "./building.ts";
import { advanceToNextPlayerTurnPure } from "./turn-flow.ts";

export function getSpecialBuildingLegalActions(
  state: CatanState,
  playerId: string
): CatanAction[] {
  if (state.specialBuildPlayerIndex === null) return [];
  const sbPlayer = state.players[state.specialBuildPlayerIndex]!;
  if (sbPlayer.id !== playerId) return [];

  return [
    ...getBuildActionsPure(state, sbPlayer),
    { type: "END_SPECIAL_BUILD" },
  ];
}

export function applyEndSpecialBuildPure(
  currentState: CatanState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "SPECIAL_BUILDING" ||
    currentState.specialBuildPlayerIndex === null ||
    currentState.players[currentState.specialBuildPlayerIndex]?.id !== playerId
  ) {
    throw new Error("Not your Special Building turn");
  }

  const checked = checkAndAssignWinnerPure(currentState, playerId);
  if (checked.won) {
    return { state: checked.state, events: [] };
  }

  const nextSbIndex =
    ((checked.state.specialBuildPlayerIndex ?? 0) + 1) %
    checked.state.players.length;
  if (nextSbIndex === checked.state.activePlayerIndex) {
    const advanced = advanceToNextPlayerTurnPure(
      { ...checked.state, specialBuildPlayerIndex: null },
      []
    );
    return { state: advanced.state, events: advanced.emitted };
  }

  return {
    state: {
      ...checked.state,
      specialBuildPlayerIndex: nextSbIndex,
    },
    events: [],
  };
}
