import {
  getBankGoodCount,
  getPlayerGoodCount,
  hasCommodities,
  totalCommodityCount,
} from "../cities-and-knights/helpers.ts";
import {
  getPlayerGoodTradeRatios,
  getPlayerVulnerableCities,
} from "../cities-and-knights/improvements.ts";
import {
  getLegalChaseRobberActions,
  getLegalMoveKnightActions,
} from "../cities-and-knights/knights.ts";
import { getCkInteractionLegalActionsPure } from "../cities-and-knights/interactions-legal.ts";
import { getLegalProgressCardActions } from "../cities-and-knights/legal-actions.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
  TRADE_GOODS,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { getBuildActionsPure } from "./building.ts";
import {
  canPlayDevCard,
  getPlayerResourceCount,
  hasResources,
  totalResourceCount,
} from "./helpers.ts";
import {
  getLegalMoveShipActions,
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
} from "./network.ts";
import { generateDiscardActions } from "./discard.ts";
import {
  getLegalPirateHexes,
  getLegalRobberHexes,
} from "./robber-pirate.ts";

/**
 * Returns all legal actions for `playerId` in the current `state`.
 */
export function getCatanLegalActions(
  state: CatanState,
  playerId: string
): CatanAction[] {
  if (state.phase === "GAME_OVER") return [];

  const activePlayer = state.players[state.activePlayerIndex]!;

  // Multi-player asynchronous phases
  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    if (state.pendingPillageSelections[0] !== playerId) return [];
    return getPlayerVulnerableCities(state, playerId).map((vertexId) => ({
      type: "SELECT_PILLAGED_CITY",
      vertexId,
    }));
  }

  if (state.phase === "PROGRESS_CARD_SELECTION") {
    if (state.pendingDefenderDeckPicks.length > 0) {
      if (state.pendingDefenderDeckPicks[0] !== playerId) return [];
      const avail = IMPROVEMENT_DISCIPLINES.filter(
        (d) => state.progressDecks[d].length > 0
      );
      const list = avail.length > 0 ? avail : IMPROVEMENT_DISCIPLINES;
      return list.map((discipline) => ({
        type: "SELECT_PROGRESS_DECK",
        discipline,
      }));
    }
    if (state.pendingProgressDiscards[0] !== playerId) return [];
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return [];
    return player.progressCards.map((c) => ({
      type: "DISCARD_PROGRESS_CARD",
      cardId: c.id,
    }));
  }

  if (state.phase === "DISCARD_ON_SEVEN") {
    const needed = state.pendingDiscards[playerId] ?? 0;
    if (needed <= 0) return [];
    const player = state.players.find((p) => p.id === playerId)!;
    return generateDiscardActions(
      player,
      needed,
      state.config.enableCitiesAndKnights
    );
  }

  if (state.phase === "GOLD_RESOURCE_SELECTION") {
    const needed = state.pendingGoldPicks[playerId] ?? 0;
    if (needed <= 0) return [];
    const available = RESOURCES.filter((r) => state.bank[r] > 0);
    if (available.length === 0) {
      return [{ type: "SELECT_GOLD_RESOURCE", resource: "grain" }];
    }
    return available.map((r) => ({ type: "SELECT_GOLD_RESOURCE", resource: r }));
  }

  if (state.phase === "CK_INTERACTION") {
    return getCkInteractionLegalActionsPure(state, playerId);
  }

  // If there is an active domestic trade offer and a non-active player is responding
  if (
    state.phase === "MAIN_PHASE" &&
    state.activeTradeOffer &&
    playerId !== activePlayer.id
  ) {
    const offer = state.activeTradeOffer;
    const accepted = offer.acceptedBy ?? [];
    if (
      (offer.toPlayerId === null || offer.toPlayerId === playerId) &&
      !offer.declinedBy.includes(playerId) &&
      !accepted.includes(playerId)
    ) {
      const responder = state.players.find((p) => p.id === playerId);
      if (!responder) return [];
      const canAccept =
        hasResources(responder.resources, offer.want) &&
        hasCommodities(responder.commodities, offer.wantCommodities);
      return canAccept
        ? [
            { type: "ACCEPT_DOMESTIC_TRADE", offerId: offer.id },
            { type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id },
          ]
        : [{ type: "DECLINE_DOMESTIC_TRADE", offerId: offer.id }];
    }
    return [];
  }

  // Special Building Phase (5-6 Player Extension)
  if (state.phase === "SPECIAL_BUILDING") {
    if (state.specialBuildPlayerIndex === null) return [];
    const sbPlayer = state.players[state.specialBuildPlayerIndex]!;
    if (sbPlayer.id !== playerId) return [];
    return [
      ...getBuildActionsPure(state, sbPlayer),
      { type: "END_SPECIAL_BUILD" },
    ];
  }

  // All remaining phases require `playerId === activePlayer.id`
  if (activePlayer.id !== playerId) {
    return [];
  }

  switch (state.phase) {
    case "SETUP_SETTLEMENT_1":
    case "SETUP_SETTLEMENT_2": {
      return getLegalSettlementVertices(state, playerId, true).map(
        (vertexId) => ({
          type: "PLACE_SETUP_SETTLEMENT",
          vertexId,
        })
      );
    }

    case "SETUP_ROAD_1":
    case "SETUP_ROAD_2": {
      const anchor = state.lastSetupSettlementVertexId;
      const roadActions: CatanAction[] = getLegalRoadEdges(
        state,
        playerId,
        anchor
      ).map((edgeId) => ({
        type: "PLACE_SETUP_EDGE",
        edgeId,
        edgeKind: "road",
      }));
      const shipActions: CatanAction[] = getLegalShipEdges(
        state,
        playerId,
        anchor
      ).map((edgeId) => ({
        type: "PLACE_SETUP_EDGE",
        edgeId,
        edgeKind: "ship",
      }));
      return [...roadActions, ...shipActions];
    }

    case "PRE_ROLL": {
      const progressPreRoll = getLegalProgressCardActions(state, activePlayer);
      return [
        { type: "ROLL_DICE" as const },
        ...(canPlayDevCard(state, activePlayer, "knight")
          ? [{ type: "PLAY_KNIGHT" as const }]
          : []),
        ...progressPreRoll,
      ];
    }

    case "MOVE_ROBBER_OR_PIRATE": {
      const robberActions: CatanAction[] = getLegalRobberHexes(
        state,
        playerId
      ).map((hexId) => ({ type: "MOVE_ROBBER", hexId }));
      const pirateActions: CatanAction[] = getLegalPirateHexes(
        state,
        playerId
      ).map(
        (hexId) => ({
          type: "MOVE_PIRATE",
          hexId,
        })
      );
      return [...robberActions, ...pirateActions];
    }

    case "STEAL_RESOURCE": {
      return state.stealCandidates.map((victimId) => ({
        type: "STEAL_FROM_PLAYER",
        victimId,
      }));
    }

    case "ROAD_BUILDING_DEV": {
      const roads: CatanAction[] = getLegalRoadEdges(state, playerId, null).map(
        (edgeId) => ({ type: "BUILD_ROAD", edgeId })
      );
      const ships: CatanAction[] = getLegalShipEdges(state, playerId, null).map(
        (edgeId) => ({ type: "BUILD_SHIP", edgeId })
      );
      return [...roads, ...ships];
    }

    case "MAIN_PHASE": {
      if (state.activeTradeOffer) {
        const offer = state.activeTradeOffer;
        const wantTotalCount =
          totalResourceCount(offer.want) +
          totalCommodityCount(offer.wantCommodities);
        const confirmActions: CatanAction[] = (offer.acceptedBy ?? [])
          .filter((pid) => {
            const partner = state.players.find((p) => p.id === pid);
            if (
              !partner ||
              !hasResources(activePlayer.resources, offer.give) ||
              !hasCommodities(activePlayer.commodities, offer.giveCommodities)
            ) {
              return false;
            }
            return partner.handRedacted
              ? getPlayerResourceCount(partner) >= wantTotalCount
              : hasResources(partner.resources, offer.want) &&
                  hasCommodities(partner.commodities, offer.wantCommodities);
          })
          .map((partnerId) => ({
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: offer.id,
            partnerId,
          }));
        return [...confirmActions, { type: "CANCEL_DOMESTIC_TRADE" }];
      }

      const buildActions = getBuildActionsPure(state, activePlayer);
      const moveShipActions = getLegalMoveShipActions(state, playerId);
      const moveKnightActions = getLegalMoveKnightActions(state, playerId);
      const chaseRobberActions = getLegalChaseRobberActions(
        state,
        playerId,
        getLegalRobberHexes(state, playerId),
        getLegalPirateHexes(state, playerId)
      );
      const progressCardActions = getLegalProgressCardActions(
        state,
        activePlayer
      );

      const knightActions: CatanAction[] = canPlayDevCard(
        state,
        activePlayer,
        "knight"
      )
        ? [{ type: "PLAY_KNIGHT" }]
        : [];

      const roadBuildingActions: CatanAction[] =
        canPlayDevCard(state, activePlayer, "road_building") &&
        (getLegalRoadEdges(state, playerId, null).length > 0 ||
          getLegalShipEdges(state, playerId, null).length > 0)
          ? [{ type: "PLAY_ROAD_BUILDING" }]
          : [];

      const yearOfPlentyActions: CatanAction[] = canPlayDevCard(
        state,
        activePlayer,
        "year_of_plenty"
      )
        ? (() => {
            const avail = RESOURCES.filter((r) => state.bank[r] > 0);
            if (avail.length === 1 && state.bank[avail[0]!] === 1) {
              return [
                {
                  type: "PLAY_YEAR_OF_PLENTY" as const,
                  resource1: avail[0]!,
                  resource2: avail[0]!,
                },
              ];
            }
            return avail.flatMap((r1, i) =>
              avail
                .slice(i)
                .filter((r2) => !(r1 === r2 && state.bank[r1] < 2))
                .map((r2) => ({
                  type: "PLAY_YEAR_OF_PLENTY" as const,
                  resource1: r1,
                  resource2: r2,
                }))
            );
          })()
        : [];

      const monopolyActions: CatanAction[] = canPlayDevCard(
        state,
        activePlayer,
        "monopoly"
      )
        ? RESOURCES.map((resource) => ({ type: "PLAY_MONOPOLY", resource }))
        : [];

      const allowedGoods: readonly TradeGoodType[] = state.config
        .enableCitiesAndKnights
        ? TRADE_GOODS
        : RESOURCES;
      const goodRatios = getPlayerGoodTradeRatios(state, playerId);
      const maritimeActions: CatanAction[] = allowedGoods.flatMap((give) => {
        const ratio = goodRatios[give];
        if (getPlayerGoodCount(activePlayer, give) < ratio) return [];
        return allowedGoods
          .filter(
            (receive) =>
              receive !== give && getBankGoodCount(state, receive) > 0
          )
          .map((receive) => ({
            type: "MARITIME_TRADE" as const,
            give,
            giveAmount: ratio,
            receive,
          }));
      });

      return [
        ...buildActions,
        ...moveShipActions,
        ...moveKnightActions,
        ...chaseRobberActions,
        ...progressCardActions,
        ...knightActions,
        ...roadBuildingActions,
        ...yearOfPlentyActions,
        ...monopolyActions,
        ...maritimeActions,
        { type: "END_TURN" },
      ];
    }

    default:
      return [];
  }
}
