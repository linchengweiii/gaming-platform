import type { SevenWondersState } from "../types.ts";

export function getSevenWondersPlayerView(
  state: SevenWondersState,
  viewerPlayerId: string | null
): SevenWondersState {
  if (state.phase === "GAME_OVER") {
    return state;
  }

  const canInspectDiscard =
    state.phase === "HALIKARNASSUS_PICK" &&
    viewerPlayerId !== null &&
    state.halikarnassusQueue[0] === viewerPlayerId;

  const redactedPlayers = state.players.map((p) => {
    if (viewerPlayerId && p.id === viewerPlayerId) {
      return {
        ...p,
        handRedacted: false,
        hiddenHandCount: p.hand.length,
      };
    }
    return {
      ...p,
      hand: [],
      seenHandsThisAge: [],
      tuckedWonderCardIds: p.tuckedWonderCardIds.map(
        (_, idx) => `hidden-tucked-${p.id}-${idx}`
      ),
      handRedacted: true,
      hiddenHandCount: p.hand.length,
    };
  });

  const redactedPending: Record<string, SevenWondersState["pendingChoices"][string]> =
    {};
  if (viewerPlayerId && state.pendingChoices[viewerPlayerId]) {
    redactedPending[viewerPlayerId] = state.pendingChoices[viewerPlayerId]!;
  }

  return {
    ...state,
    rngState: 0,
    players: redactedPlayers,
    pendingChoices: redactedPending,
    discardPile: canInspectDiscard ? state.discardPile : [],
    hiddenDiscardCount: state.discardPile.length,
    ageDecks: { 2: [], 3: [] },
  };
}
