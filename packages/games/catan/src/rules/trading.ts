import type { GameEvent } from "@gaming-platform/core";
import {
  addCommoditiesPure,
  hasCommodities,
  subtractCommoditiesPure,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  addResourcesPure,
  appendCatanEvent,
  assertNonNegativeIntGoodMapPure,
  hasResources,
  subtractResourcesPure,
  totalResourceCount,
} from "./helpers.ts";

export function applyOfferDomesticTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  activePlayer: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "OFFER_DOMESTIC_TRADE" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || activePlayer.id !== playerId) {
    throw new Error("Can only offer domestic trade on your main phase");
  }
  assertNonNegativeIntGoodMapPure(action.give, "Trade give resource");
  assertNonNegativeIntGoodMapPure(action.want, "Trade want resource");
  assertNonNegativeIntGoodMapPure(action.giveCommodities, "Trade give commodity");
  assertNonNegativeIntGoodMapPure(action.wantCommodities, "Trade want commodity");
  const giveCommTotal = totalCommodityCount(action.giveCommodities);
  const wantCommTotal = totalCommodityCount(action.wantCommodities);
  if (
    !currentState.config.enableCitiesAndKnights &&
    (giveCommTotal > 0 || wantCommTotal > 0)
  ) {
    throw new Error("Commodities are only available in Cities & Knights");
  }
  if (
    totalResourceCount(action.give) + giveCommTotal <= 0 ||
    totalResourceCount(action.want) + wantCommTotal <= 0
  ) {
    throw new Error("Domestic trade must give and want at least 1 card");
  }
  if (
    !hasResources(player.resources, action.give) ||
    !hasCommodities(player.commodities, action.giveCommodities)
  ) {
    throw new Error("You do not have the offered resources");
  }

  const offerId = `offer-${currentState.turn}-${currentState.eventLog.length}`;
  const baseOffer = {
    id: offerId,
    fromPlayerId: playerId,
    toPlayerId: action.toPlayerId,
    give: action.give,
    want: action.want,
    ...(giveCommTotal > 0
      ? { giveCommodities: action.giveCommodities }
      : {}),
    ...(wantCommTotal > 0
      ? { wantCommodities: action.wantCommodities }
      : {}),
    acceptedBy: [] as string[],
    declinedBy: [] as string[],
  };

  const loggedOffer = appendCatanEvent(
    currentState,
    [],
    "DOMESTIC_TRADE_OFFERED",
    `${player.name} offered a trade to ${action.toPlayerId ? currentState.players.find((p) => p.id === action.toPlayerId)?.name : "all players"}.`,
    playerId,
    baseOffer
  );

  // Automatically decline for any targeted player who does not hold the requested resources/commodities
  const otherPlayers = loggedOffer.state.players.filter(
    (p) => p.id !== playerId
  );
  const targetedPlayers =
    action.toPlayerId !== null
      ? otherPlayers.filter((p) => p.id === action.toPlayerId)
      : otherPlayers;
  const autoDeclinedBy = targetedPlayers
    .filter(
      (p) =>
        !hasResources(p.resources, action.want) ||
        !hasCommodities(p.commodities, action.wantCommodities)
    )
    .map((p) => p.id);

  const allDeclined =
    targetedPlayers.length === 0 ||
    targetedPlayers.every((p) => autoDeclinedBy.includes(p.id));

  if (allDeclined) {
    const clearedOfferState: CatanState = {
      ...loggedOffer.state,
      activeTradeOffer: null,
    };
    const loggedDeclined = appendCatanEvent(
      clearedOfferState,
      loggedOffer.emitted,
      "DOMESTIC_TRADE_DECLINED",
      "Trade offer declined.",
      playerId
    );
    return { state: loggedDeclined.state, events: loggedDeclined.emitted };
  }

  return {
    state: {
      ...loggedOffer.state,
      activeTradeOffer: {
        ...baseOffer,
        declinedBy: autoDeclinedBy,
      },
    },
    events: loggedOffer.emitted,
  };
}

export function applyAcceptDomesticTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "ACCEPT_DOMESTIC_TRADE" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
    throw new Error("No active domestic trade offer");
  }
  const offer = currentState.activeTradeOffer;
  if (offer.id !== action.offerId) {
    throw new Error("Mismatched trade offer ID");
  }
  if (offer.fromPlayerId === playerId) {
    throw new Error("Cannot accept your own trade offer");
  }
  if (offer.toPlayerId !== null && offer.toPlayerId !== playerId) {
    throw new Error("This trade offer is for another player");
  }

  const proposer = currentState.players.find(
    (p) => p.id === offer.fromPlayerId
  )!;
  if (
    !hasResources(proposer.resources, offer.give) ||
    !hasCommodities(proposer.commodities, offer.giveCommodities)
  ) {
    throw new Error("Proposer no longer has offered resources");
  }
  if (
    !hasResources(player.resources, offer.want) ||
    !hasCommodities(player.commodities, offer.wantCommodities)
  ) {
    throw new Error("You do not have the requested resources");
  }

  const prevAccepted = offer.acceptedBy ?? [];
  const nextAccepted = prevAccepted.includes(playerId)
    ? prevAccepted
    : [...prevAccepted, playerId];
  const nextDeclined = offer.declinedBy.filter((id) => id !== playerId);

  const acceptedState: CatanState = {
    ...currentState,
    activeTradeOffer: {
      ...offer,
      acceptedBy: nextAccepted,
      declinedBy: nextDeclined,
    },
  };

  const logged = appendCatanEvent(
    acceptedState,
    [],
    "DOMESTIC_TRADE_ACCEPTED",
    `${player.name} accepted ${proposer.name}'s trade offer.`,
    playerId,
    { offerId: offer.id, acceptorId: playerId }
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyDeclineDomesticTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
    throw new Error("No active trade offer");
  }
  const offer = currentState.activeTradeOffer;
  const accepted = offer.acceptedBy ?? [];
  const nextDeclined =
    !offer.declinedBy.includes(playerId) && !accepted.includes(playerId)
      ? [...offer.declinedBy, playerId]
      : offer.declinedBy;

  const otherPlayers = currentState.players.filter(
    (p) => p.id !== offer.fromPlayerId
  );
  const targetedPlayers =
    offer.toPlayerId !== null
      ? otherPlayers.filter((p) => p.id === offer.toPlayerId)
      : otherPlayers;
  const everyoneResponded = targetedPlayers.every(
    (p) => nextDeclined.includes(p.id) || accepted.includes(p.id)
  );

  const declinedState: CatanState = {
    ...currentState,
    activeTradeOffer:
      everyoneResponded && accepted.length === 0
        ? null
        : {
            ...offer,
            declinedBy: nextDeclined,
          },
  };

  const logged = appendCatanEvent(
    declinedState,
    [],
    "DOMESTIC_TRADE_DECLINED",
    `${player.name} declined the trade offer.`,
    playerId
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyConfirmDomesticTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string,
  action: Extract<CatanAction, { type: "CONFIRM_DOMESTIC_TRADE" }>
): { state: CatanState; events: GameEvent[] } {
  if (currentState.phase !== "MAIN_PHASE" || !currentState.activeTradeOffer) {
    throw new Error("No active domestic trade offer");
  }
  const offer = currentState.activeTradeOffer;
  if (offer.id !== action.offerId) {
    throw new Error("Mismatched trade offer ID");
  }
  if (offer.fromPlayerId !== playerId) {
    throw new Error(
      "Only the player who offered the trade can select the trade partner"
    );
  }
  const accepted = offer.acceptedBy ?? [];
  if (!accepted.includes(action.partnerId)) {
    throw new Error("Selected player has not accepted this trade offer");
  }

  const partner = currentState.players.find((p) => p.id === action.partnerId);
  if (!partner) {
    throw new Error("Selected trade partner not found");
  }
  if (
    !hasResources(player.resources, offer.give) ||
    !hasCommodities(player.commodities, offer.giveCommodities)
  ) {
    throw new Error("You no longer have the offered resources");
  }
  if (
    !hasResources(partner.resources, offer.want) ||
    !hasCommodities(partner.commodities, offer.wantCommodities)
  ) {
    throw new Error("Selected partner no longer has the requested resources");
  }

  const nextPlayers = currentState.players.map((p) => {
    if (p.id === playerId) {
      return {
        ...p,
        resources: addResourcesPure(
          subtractResourcesPure(p.resources, offer.give),
          offer.want
        ),
        commodities: addCommoditiesPure(
          subtractCommoditiesPure(p.commodities, offer.giveCommodities),
          offer.wantCommodities
        ),
      };
    }
    if (p.id === partner.id) {
      return {
        ...p,
        resources: subtractResourcesPure(
          addResourcesPure(p.resources, offer.give),
          offer.want
        ),
        commodities: subtractCommoditiesPure(
          addCommoditiesPure(p.commodities, offer.giveCommodities),
          offer.wantCommodities
        ),
      };
    }
    return p;
  });

  const confirmedState: CatanState = {
    ...currentState,
    players: nextPlayers,
    activeTradeOffer: null,
  };

  const logged = appendCatanEvent(
    confirmedState,
    [],
    "DOMESTIC_TRADE_COMPLETED",
    `${player.name} traded with ${partner.name}.`,
    playerId,
    { ...offer, partnerId: partner.id }
  );
  return { state: logged.state, events: logged.emitted };
}

export function applyCancelDomesticTradePure(
  currentState: CatanState,
  player: CatanPlayerState,
  playerId: string
): { state: CatanState; events: GameEvent[] } {
  if (
    !currentState.activeTradeOffer ||
    currentState.activeTradeOffer.fromPlayerId !== playerId
  ) {
    throw new Error("No trade offer to cancel");
  }
  const cancelledState: CatanState = {
    ...currentState,
    activeTradeOffer: null,
  };
  const logged = appendCatanEvent(
    cancelledState,
    [],
    "DOMESTIC_TRADE_CANCELLED",
    `${player.name} cancelled their trade offer.`,
    playerId
  );
  return { state: logged.state, events: logged.emitted };
}
