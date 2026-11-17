import type { SeededRNG } from "@gaming-platform/core";
import {
  type CatanAction,
  CatanEngine,
  type CatanState,
  RESOURCES,
  emptyResources,
  hasResources,
} from "@gaming-platform/catan";

/**
 * Chooses a human-mimic action:
 * Simulates human UI click patterns (diverse vertex/edge clicks including vertical E edges,
 * domestic trade offers/accepts/cancels, maritime trades, dev card plays, and exploratory builds).
 */
export function chooseHumanMimicCatanAction(
  state: CatanState,
  actorId: string,
  rng: SeededRNG
): { playerId: string; action: CatanAction; isDomesticTrade?: boolean } | null {
  // If there is an active domestic trade offer, mimic responders accepting/declining and proposer selecting who to trade with
  if (state.activeTradeOffer) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    if (
      accepted.length > 0 &&
      (actorId === offer.fromPlayerId || rng.nextFloat() < 0.35)
    ) {
      if (rng.nextFloat() < 0.9) {
        return {
          playerId: offer.fromPlayerId,
          action: {
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: offer.id,
            partnerId: rng.pick(accepted),
          },
          isDomesticTrade: true,
        };
      }
      return {
        playerId: offer.fromPlayerId,
        action: { type: "CANCEL_DOMESTIC_TRADE" },
        isDomesticTrade: true,
      };
    }
    if (actorId !== offer.fromPlayerId) {
      const responder = state.players.find((p) => p.id === actorId);
      if (
        responder &&
        hasResources(responder.resources, offer.want) &&
        rng.nextFloat() < 0.65
      ) {
        return {
          playerId: responder.id,
          action: { type: "ACCEPT_DOMESTIC_TRADE", offerId: offer.id },
          isDomesticTrade: true,
        };
      }
      return {
        playerId: actorId,
        action: { type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id },
        isDomesticTrade: true,
      };
    }
    return {
      playerId: offer.fromPlayerId,
      action: { type: "CANCEL_DOMESTIC_TRADE" },
      isDomesticTrade: true,
    };
  }

  const legal = CatanEngine.getLegalActions(state, actorId);
  if (legal.length === 0) return null;

  // During setup road placement, intentionally prefer vertical E edges 60% of the time when available to stress-test vertical roads
  if (state.phase === "SETUP_ROAD_1" || state.phase === "SETUP_ROAD_2") {
    const verticalSetupEdges = legal.filter(
      (a) =>
        a.type === "PLACE_SETUP_EDGE" &&
        state.topology.edges[a.edgeId]?.dir === "E"
    );
    if (verticalSetupEdges.length > 0 && rng.nextFloat() < 0.6) {
      return {
        playerId: actorId,
        action: rng.pick(verticalSetupEdges),
      };
    }
    return {
      playerId: actorId,
      action: rng.pick(legal),
    };
  }

  // During MAIN_PHASE, mimic human behavior:
  // 1. Sometimes propose a domestic trade offer to other players
  if (state.phase === "MAIN_PHASE") {
    const actor = state.players.find((p) => p.id === actorId)!;
    const ownedRes = RESOURCES.filter((r) => actor.resources[r] > 0);
    if (ownedRes.length > 0 && rng.nextFloat() < 0.08) {
      const giveRes = rng.pick(ownedRes);
      const wantRes = rng.pick(RESOURCES.filter((r) => r !== giveRes));
      const give = emptyResources();
      const want = emptyResources();
      give[giveRes] = 1;
      want[wantRes] = 1;
      return {
        playerId: actorId,
        action: {
          type: "OFFER_DOMESTIC_TRADE",
          toPlayerId: null,
          give,
          want,
        },
        isDomesticTrade: true,
      };
    }

    // 2. Prioritize building settlements, cities, roads (especially vertical E edges), dev cards, or playing dev cards
    const highValueActions = legal.filter(
      (a) =>
        a.type === "BUILD_CITY" ||
        a.type === "BUILD_SETTLEMENT" ||
        a.type === "BUILD_ROAD" ||
        a.type === "BUILD_SHIP" ||
        a.type === "BUILD_CITY_WALL" ||
        a.type === "BUY_DEV_CARD" ||
        a.type === "PLAY_KNIGHT" ||
        a.type === "PLAY_ROAD_BUILDING" ||
        a.type === "PLAY_YEAR_OF_PLENTY" ||
        a.type === "PLAY_MONOPOLY"
    );
    if (highValueActions.length > 0 && rng.nextFloat() < 0.85) {
      return {
        playerId: actorId,
        action: rng.pick(highValueActions),
      };
    }

    // 3. Otherwise maritime trade, move ship, or end turn
    const nonEndActions = legal.filter((a) => a.type !== "END_TURN");
    if (nonEndActions.length > 0 && rng.nextFloat() < 0.35) {
      return {
        playerId: actorId,
        action: rng.pick(nonEndActions),
      };
    }

    const endTurn = legal.find((a) => a.type === "END_TURN");
    if (endTurn) {
      return { playerId: actorId, action: endTurn };
    }
  }

  // For any other phase (PRE_ROLL, DISCARD_ON_SEVEN, MOVE_ROBBER_OR_PIRATE, STEAL_RESOURCE, etc.), pick randomly among legal human choices
  return {
    playerId: actorId,
    action: rng.pick(legal),
  };
}
