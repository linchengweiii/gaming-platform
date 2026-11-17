import type { EdgeId, HexId } from "@gaming-platform/core";
import { TERRAIN_TO_RESOURCE } from "../config/costs-and-limits.ts";
import type { CatanAction } from "../types/actions.ts";
import {
  COMMODITIES,
  type ProgressCardType,
  RESOURCES,
  TRADE_GOODS,
} from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import { totalCommodityCount } from "./helpers.ts";
import {
  getDiplomatRemovableRoadEdges,
  getLegalActivateKnightVertices,
  getLegalPromoteKnightVertices,
} from "./knights.ts";

/**
 * Generates legal `PLAY_PROGRESS_CARD` actions for `player` in `PRE_ROLL` or `MAIN_PHASE`.
 */
export function getLegalProgressCardActions(
  state: CatanState,
  player: CatanPlayerState,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalShipEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
): CatanAction[] {
  if (!state.config.enableCitiesAndKnights || player.progressCards.length === 0) {
    return [];
  }

  if (state.phase === "PRE_ROLL") {
    const alchemistCards = player.progressCards.filter(
      (c) => c.type === "alchemist"
    );
    if (alchemistCards.length === 0) return [];
    const firstCard = alchemistCards[0]!;
    // Canonical die1 + die2 pairs covering all totals 2..12 and red-die thresholds
    const dicePairs: Array<[number, number]> = [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 4],
      [4, 5],
      [5, 5],
      [5, 6],
      [6, 6],
      [6, 1],
      [5, 1],
      [4, 2],
      [5, 3],
    ];
    return dicePairs.map(([die1, die2]) => ({
      type: "PLAY_PROGRESS_CARD" as const,
      cardId: firstCard.id,
      params: { die1, die2 },
    }));
  }

  if (state.phase !== "MAIN_PHASE") {
    return [];
  }

  const myVp = computeVpFn(state, player.id, true);
  const seenTypes = new Set<ProgressCardType>();

  return player.progressCards.flatMap((card): CatanAction[] => {
    if (seenTypes.has(card.type)) return [];
    seenTypes.add(card.type);

    switch (card.type) {
      case "mining":
      case "irrigation":
      case "saboteur":
      case "wedding":
        return [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "crane":
        return player.activeTurnDiscounts.crane
          ? []
          : [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "medicine":
        return player.activeTurnDiscounts.medicine
          ? []
          : [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }];

      case "road_building": {
        const hasSpots =
          getLegalRoadEdgesFn(state, player.id).length > 0 ||
          getLegalShipEdgesFn(state, player.id).length > 0;
        return hasSpots
          ? [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }]
          : [];
      }

      case "warlord": {
        const inactive = getLegalActivateKnightVertices(state, player.id);
        return inactive.length > 0
          ? [{ type: "PLAY_PROGRESS_CARD", cardId: card.id }]
          : [];
      }

      case "engineer": {
        if (player.cityWallsRemaining <= 0) return [];
        return Object.entries(state.buildings)
          .filter(
            ([, b]) => b.ownerId === player.id && b.type === "city" && !b.hasWall
          )
          .map(([vertexId]) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { vertexId },
          }));
      }

      case "smith": {
        const promotable = getLegalPromoteKnightVertices(
          state,
          player.id,
          true
        );
        if (promotable.length === 0) return [];
        if (promotable.length === 1) {
          return [
            {
              type: "PLAY_PROGRESS_CARD",
              cardId: card.id,
              params: { vertexIds: [promotable[0]!] },
            },
          ];
        }
        const pairs = promotable.flatMap((v1, idx) =>
          promotable.slice(idx + 1).flatMap((v2) => {
            const k1 = state.knights[v1]!;
            const k2 = state.knights[v2]!;
            if (
              k1.level === 1 &&
              k2.level === 1 &&
              player.strongKnightsRemaining < 2
            ) {
              return [];
            }
            if (
              k1.level === 2 &&
              k2.level === 2 &&
              player.mightyKnightsRemaining < 2
            ) {
              return [];
            }
            return [
              {
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { vertexIds: [v1, v2] },
              },
            ];
          })
        );
        const singles = promotable.map((v1) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { vertexIds: [v1] },
        }));
        return pairs.length > 0 ? [...pairs, ...singles] : singles;
      }

      case "inventor": {
        const swappableHexes = state.topology.hexOrder.filter((hId) => {
          const t = state.hexes[hId]!;
          return (
            t.numberToken !== null &&
            t.numberToken !== 2 &&
            t.numberToken !== 6 &&
            t.numberToken !== 8 &&
            t.numberToken !== 12 &&
            t.terrain !== "sea" &&
            t.terrain !== "fog"
          );
        });
        if (swappableHexes.length < 2) return [];
        return swappableHexes.flatMap((h1, idx) =>
          swappableHexes.slice(idx + 1).map((h2) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { hexId1: h1, hexId2: h2 },
          }))
        );
      }

      case "bishop": {
        if (state.barbarianAttacksCount < 1) return [];
        return getLegalRobberHexesFn(state, player.id).map((hexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { hexId },
        }));
      }

      case "intrigue": {
        const targetKnights = Object.entries(state.knights)
          .filter(([vId, k]) => {
            if (k.ownerId === player.id) return false;
            const vNode = state.topology.vertices[vId];
            return Boolean(
              vNode?.incidentEdgeIds.some(
                (eId) => state.edges[eId]?.ownerId === player.id
              )
            );
          })
          .map(([vId]) => vId);
        return targetKnights.map((vertexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { vertexId },
        }));
      }

      case "deserter": {
        const opponentsWithKnights = state.players.filter(
          (opp) =>
            opp.id !== player.id &&
            Object.values(state.knights).some((k) => k.ownerId === opp.id)
        );
        if (opponentsWithKnights.length === 0) return [];
        const ownSpots = state.topology.vertexOrder.filter((vId) => {
          if (state.buildings[vId] || state.knights[vId]) return false;
          const vNode = state.topology.vertices[vId]!;
          return vNode.incidentEdgeIds.some(
            (eId) => state.edges[eId]?.ownerId === player.id
          );
        });
        return opponentsWithKnights.flatMap((opp) =>
          ownSpots.length > 0
            ? ownSpots.map((placeVertexId) => ({
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { targetPlayerId: opp.id, placeVertexId },
              }))
            : [
                {
                  type: "PLAY_PROGRESS_CARD" as const,
                  cardId: card.id,
                  params: { targetPlayerId: opp.id },
                },
              ]
        );
      }

      case "diplomat": {
        const openEdges = getDiplomatRemovableRoadEdges(state);
        if (openEdges.length === 0) return [];
        const ownRebuilds = getLegalRoadEdgesFn(state, player.id);
        return openEdges.flatMap((edgeId) => {
          const isOwn = state.edges[edgeId]?.ownerId === player.id;
          if (isOwn && ownRebuilds.length > 0) {
            return [
              {
                type: "PLAY_PROGRESS_CARD" as const,
                cardId: card.id,
                params: { edgeId },
              },
              ...ownRebuilds
                .filter((rId) => rId !== edgeId)
                .map((rebuildEdgeId) => ({
                  type: "PLAY_PROGRESS_CARD" as const,
                  cardId: card.id,
                  params: { edgeId, rebuildEdgeId },
                })),
            ];
          }
          return [
            {
              type: "PLAY_PROGRESS_CARD" as const,
              cardId: card.id,
              params: { edgeId },
            },
          ];
        });
      }

      case "spy": {
        return state.players
          .filter((opp) => {
            if (opp.id === player.id) return false;
            const count = opp.handRedacted
              ? opp.hiddenProgressCardCount ?? 0
              : opp.progressCards.length;
            return count > 0;
          })
          .map((opp) => ({
            type: "PLAY_PROGRESS_CARD" as const,
            cardId: card.id,
            params: { targetPlayerId: opp.id },
          }));
      }

      case "merchant": {
        const adjacentResourceHexes = state.topology.hexOrder.filter((hId) => {
          const tile = state.hexes[hId]!;
          if (!TERRAIN_TO_RESOURCE[tile.terrain]) return false;
          const hNode = state.topology.hexes[hId]!;
          return hNode.cornerVertexIds.some(
            (vId) => state.buildings[vId]?.ownerId === player.id
          );
        });
        return adjacentResourceHexes.map((hexId) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { hexId },
        }));
      }

      case "resource_monopoly": {
        return RESOURCES.map((resource) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { resource },
        }));
      }

      case "trade_monopoly": {
        return COMMODITIES.map((commodity) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { commodity },
        }));
      }

      case "merchant_fleet": {
        return TRADE_GOODS.map((good) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { good },
        }));
      }

      case "master_merchant": {
        const leadersWithCards = state.players.filter((opp) => {
          if (opp.id === player.id) return false;
          if (computeVpFn(state, opp.id, true) <= myVp) return false;
          const handCount = opp.handRedacted
            ? opp.hiddenResourceCount ?? 0
            : RESOURCES.reduce<number>((s, r) => s + opp.resources[r], 0) +
              totalCommodityCount(opp.commodities);
          return handCount > 0;
        });
        return leadersWithCards.map((opp) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { targetPlayerId: opp.id },
        }));
      }

      case "commercial_harbor": {
        const myAvailResources = RESOURCES.filter(
          (r) => player.resources[r] > 0
        );
        if (myAvailResources.length === 0) return [];
        return myAvailResources.map((resource) => ({
          type: "PLAY_PROGRESS_CARD" as const,
          cardId: card.id,
          params: { resource },
        }));
      }

      default:
        return [];
    }
  });
}
