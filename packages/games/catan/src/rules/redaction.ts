import { emptyCommodities } from "../cities-and-knights/helpers.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { emptyResources, getPlayerResourceCount } from "./helpers.ts";

function redactPlayerForViewer(
  player: CatanPlayerState,
  viewerPlayerId: string | null
): CatanPlayerState {
  if (player.id === viewerPlayerId) {
    return player;
  }
  return {
    ...player,
    hiddenResourceCount: getPlayerResourceCount(player),
    hiddenProgressCardCount:
      typeof player.hiddenProgressCardCount === "number"
        ? player.hiddenProgressCardCount
        : player.progressCards.length,
    handRedacted: true,
    resources: emptyResources(),
    commodities: emptyCommodities(),
    progressCards: [],
    devCards: player.devCards.map((c) =>
      c.played ? c : { ...c, type: "knight" }
    ),
  };
}

export function getCatanPlayerViewPure(
  state: CatanState,
  viewerPlayerId: string | null
): CatanState {
  if (state.phase === "GAME_OVER") {
    return state;
  }
  return {
    ...state,
    rngState: 0,
    devCardDeck: state.devCardDeck.map(() => "knight"),
    progressDecks: {
      trade: state.progressDecks.trade.map(() => "merchant"),
      politics: state.progressDecks.politics.map(() => "spy"),
      science: state.progressDecks.science.map(() => "mining"),
    },
    fogPool: state.fogPool.map(() => ({
      terrain: "fog",
      numberToken: null,
    })),
    players: state.players.map((p) => redactPlayerForViewer(p, viewerPlayerId)),
    eventLog: state.eventLog.map((evt) => {
      if (evt.type === "CARDS_DISCARDED" && evt.playerId !== viewerPlayerId) {
        const { payload: _hidden, ...rest } = evt;
        return rest;
      }
      return evt;
    }),
  };
}
