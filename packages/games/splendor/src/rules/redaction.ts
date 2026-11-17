import type { CardTier, SplendorCard, SplendorState } from "../types.ts";
import { emptyGemMap } from "./helpers.ts";

export function getSplendorActingPlayerId(state: SplendorState): string | null {
  if (state.phase === "GAME_OVER") return null;
  return state.players[state.activePlayerIndex]?.id ?? null;
}

export function getSplendorPlayerView(
  state: SplendorState,
  viewerPlayerId: string | null
): SplendorState {
  if (state.phase === "GAME_OVER") {
    return state;
  }

  const redactDeck = (
    tier: CardTier,
    cards: readonly SplendorCard[]
  ): SplendorCard[] =>
    cards.map((_, idx) => ({
      id: `hidden-deck-t${tier}-${idx}`,
      tier,
      bonus: "onyx",
      points: 0,
      cost: emptyGemMap(),
      redacted: true,
    }));

  return {
    ...state,
    rngState: 0,
    decks: {
      1: redactDeck(1, state.decks[1]),
      2: redactDeck(2, state.decks[2]),
      3: redactDeck(3, state.decks[3]),
    },
    players: state.players.map((p) => {
      if (viewerPlayerId && p.id === viewerPlayerId) {
        return p;
      }
      return {
        ...p,
        reservedCards: p.reservedCards.map((c, idx) =>
          c.reservedFromDeck
            ? {
                id: `hidden-reserve-${p.id}-${idx}`,
                tier: c.tier,
                bonus: "onyx",
                points: 0,
                cost: emptyGemMap(),
                reservedFromDeck: true,
                redacted: true,
              }
            : c
        ),
      };
    }),
  };
}
