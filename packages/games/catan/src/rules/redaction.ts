import { emptyCommodities } from "../cities-and-knights/helpers.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { emptyResources, getPlayerResourceCount } from "./helpers.ts";

function redactPlayerForViewer(
  state: CatanState,
  player: CatanPlayerState,
  viewerPlayerId: string | null
): CatanPlayerState {
  if (player.id === viewerPlayerId) {
    return player;
  }
  const pending = state.pendingCkInteraction;
  // Spy allows the active Spy player to inspect the target's Progress Cards
  const revealProgressCards = Boolean(
    pending &&
      pending.kind === "spy_choose_card" &&
      pending.actorId === viewerPlayerId &&
      pending.targetPlayerId === player.id
  );
  // Master Merchant allows the active player to inspect the target's resources & commodities
  const revealGoodsHand = Boolean(
    pending &&
      pending.kind === "master_merchant_choose_cards" &&
      pending.actorId === viewerPlayerId &&
      pending.targetPlayerId === player.id
  );
  return {
    ...player,
    ...(revealGoodsHand
      ? { handRedacted: false }
      : {
          hiddenResourceCount: getPlayerResourceCount(player),
          handRedacted: true,
          resources: emptyResources(),
          commodities: emptyCommodities(),
        }),
    ...(revealProgressCards
      ? {}
      : {
          hiddenProgressCardCount:
            typeof player.hiddenProgressCardCount === "number"
              ? player.hiddenProgressCardCount
              : player.progressCards.length,
          progressCards: [],
        }),
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
  const redactedPendingCk = (() => {
    const p = state.pendingCkInteraction;
    if (!p) return null;
    if (p.kind === "commercial_harbor_offer" && p.actorId !== viewerPlayerId) {
      return { ...p, eligibleTargetIds: [] };
    }
    if (
      p.kind === "commercial_harbor_respond" &&
      p.actorId !== viewerPlayerId &&
      p.initiatorId !== viewerPlayerId
    ) {
      return {
        ...p,
        offeredResource: "brick" as const,
        offeredResourceRedacted: true,
      };
    }
    return p;
  })();

  return {
    ...state,
    rngState: 0,
    pendingCkInteraction: redactedPendingCk,
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
    players: state.players.map((p) =>
      redactPlayerForViewer(state, p, viewerPlayerId)
    ),
    eventLog: state.eventLog.map((evt) => {
      if (evt.type === "CARDS_DISCARDED" && evt.playerId !== viewerPlayerId) {
        const { payload: _hidden, ...rest } = evt;
        return rest;
      }
      if (evt.type === "COMMERCIAL_HARBOR_OFFERED") {
        const targetId = (evt.payload as { targetPlayerId?: string } | undefined)
          ?.targetPlayerId;
        if (evt.playerId !== viewerPlayerId && targetId !== viewerPlayerId) {
          const actorName =
            state.players.find((p) => p.id === evt.playerId)?.name ?? "A player";
          const targetName =
            state.players.find((p) => p.id === targetId)?.name ?? "an opponent";
          const { payload: _hidden, ...rest } = evt;
          return {
            ...rest,
            message: `${actorName} offered 1 resource to ${targetName} via Commercial Harbor.`,
          };
        }
      }
      if (evt.type === "COMMERCIAL_HARBOR_SWAPPED") {
        const initId = (evt.payload as { initiatorId?: string } | undefined)
          ?.initiatorId;
        if (evt.playerId !== viewerPlayerId && initId !== viewerPlayerId) {
          const actorName =
            state.players.find((p) => p.id === evt.playerId)?.name ?? "A player";
          const { payload: _hidden, ...rest } = evt;
          return {
            ...rest,
            message: `${actorName} completed a Commercial Harbor swap.`,
          };
        }
      }
      return evt;
    }),
  };
}
