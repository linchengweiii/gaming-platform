import { PROGRESS_CARD_CATALOG } from "../config/cities-knights-config.ts";
import { getLegalRoadEdges, getLegalShipEdges } from "../rules/network.ts";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import type {
  KnightLevel,
  ProgressCardInstance,
  ResourceType,
} from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { type StateEventsPair, pushCkEvent } from "./helpers.ts";
import {
  canPromoteKnightAtVertex,
  returnKnightToSupplyPure,
  takeKnightFromSupplyPure,
} from "./knights.ts";

export function applyScienceProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined
): StateEventsPair {
  const actor = stateAfterConsume.players.find((p) => p.id === playerId)!;
  const cardTitle = PROGRESS_CARD_CATALOG[card.type].title;

  switch (card.type) {
    case "mining":
    case "irrigation": {
      const targetTerrain = card.type === "mining" ? "mountains" : "fields";
      const targetRes: ResourceType = card.type === "mining" ? "ore" : "grain";
      const matchingHexCount = stateAfterConsume.topology.hexOrder.filter(
        (hId) => {
          const tile = stateAfterConsume.hexes[hId]!;
          if (tile.terrain !== targetTerrain) return false;
          const hNode = stateAfterConsume.topology.hexes[hId]!;
          return hNode.cornerVertexIds.some(
            (vId) => stateAfterConsume.buildings[vId]?.ownerId === playerId
          );
        }
      ).length;
      const gained = Math.min(
        stateAfterConsume.bank[targetRes],
        matchingHexCount * 2
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        bank: {
          ...stateAfterConsume.bank,
          [targetRes]: stateAfterConsume.bank[targetRes] - gained,
        },
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                resources: {
                  ...p.resources,
                  [targetRes]: p.resources[targetRes] + gained,
                },
              }
            : p
        ),
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played ${cardTitle} and collected ${gained} ${targetRes}.`,
        playerId,
        { cardType: card.type, gained }
      );
    }

    case "crane":
    case "medicine": {
      const discountKey = card.type;
      if (actor.activeTurnDiscounts[discountKey]) {
        throw new Error(`${cardTitle} discount is already active this turn`);
      }
      return pushCkEvent(
        {
          ...stateAfterConsume,
          players: stateAfterConsume.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  activeTurnDiscounts: {
                    ...p.activeTurnDiscounts,
                    [discountKey]: true,
                  },
                }
              : p
          ),
        },
        [],
        "PROGRESS_CARD_PLAYED",
        discountKey === "crane"
          ? `${actor.name} played Crane (-1 commodity on next City Improvement this turn).`
          : `${actor.name} played Medicine (next City costs 2 Ore + 1 Grain this turn).`,
        playerId,
        { cardType: card.type }
      );
    }

    case "engineer": {
      const vId = params?.vertexId;
      const b = vId ? stateAfterConsume.buildings[vId] : undefined;
      if (
        !vId ||
        !b ||
        b.ownerId !== playerId ||
        b.type !== "city" ||
        b.hasWall ||
        actor.cityWallsRemaining <= 0
      ) {
        throw new Error("Invalid Engineer target city");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        buildings: {
          ...stateAfterConsume.buildings,
          [vId]: { ...b, hasWall: true },
        },
        players: stateAfterConsume.players.map((p) =>
          p.id === playerId
            ? { ...p, cityWallsRemaining: p.cityWallsRemaining - 1 }
            : p
        ),
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Engineer and built a free City Wall.`,
        playerId,
        { cardType: card.type, vertexId: vId }
      );
    }

    case "road_building": {
      const availablePieces = actor.roadsRemaining + actor.shipsRemaining;
      const availableSpots =
        getLegalRoadEdges(stateAfterConsume, playerId, null).length +
        getLegalShipEdges(stateAfterConsume, playerId, null).length;
      const freeRoadsRemaining =
        availableSpots > 0 ? Math.min(2, availablePieces) : 0;
      const nextState: CatanState = {
        ...stateAfterConsume,
        freeRoadsRemaining,
        phase: freeRoadsRemaining > 0 ? "ROAD_BUILDING_DEV" : "MAIN_PHASE",
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        freeRoadsRemaining > 0
          ? `${actor.name} played Road Building (up to ${freeRoadsRemaining} free road(s)/ship(s)).`
          : `${actor.name} played Road Building (no legal road/ship spots available).`,
        playerId,
        { cardType: card.type }
      );
    }

    case "smith": {
      const rawTargets = params?.vertexIds ?? [];
      if (rawTargets.length === 0 || rawTargets.length > 2) {
        throw new Error("Smith requires 1 or 2 promotable knights");
      }
      const uniqueTargets = Array.from(new Set(rawTargets));
      if (uniqueTargets.length !== rawTargets.length) {
        throw new Error("Smith target vertices must be distinct");
      }
      const promoted = uniqueTargets.reduce<CatanState>((acc, vId) => {
        const curPlayer = acc.players.find((p) => p.id === playerId)!;
        if (!canPromoteKnightAtVertex(acc, curPlayer, vId, false)) {
          throw new Error(`Knight at ${vId} cannot be promoted with Smith`);
        }
        const k = acc.knights[vId]!;
        const nextLevel = (k.level + 1) as KnightLevel;
        return {
          ...acc,
          knights: {
            ...acc.knights,
            [vId]: { ...k, level: nextLevel, promotedThisTurn: true },
          },
          players: acc.players.map((p) =>
            p.id === playerId
              ? takeKnightFromSupplyPure(
                  returnKnightToSupplyPure(p, k.level),
                  nextLevel
                )
              : p
          ),
        };
      }, stateAfterConsume);

      return pushCkEvent(
        promoted,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Smith and promoted ${uniqueTargets.length} Knight(s) for free.`,
        playerId,
        { cardType: card.type, vertexIds: uniqueTargets }
      );
    }

    case "inventor": {
      const h1 = params?.hexId1;
      const h2 = params?.hexId2;
      const t1 = h1 ? stateAfterConsume.hexes[h1] : undefined;
      const t2 = h2 ? stateAfterConsume.hexes[h2] : undefined;
      const forbidden = new Set([2, 6, 8, 12]);
      if (
        !h1 ||
        !h2 ||
        h1 === h2 ||
        !t1 ||
        !t2 ||
        t1.numberToken === null ||
        t2.numberToken === null ||
        forbidden.has(t1.numberToken) ||
        forbidden.has(t2.numberToken)
      ) {
        throw new Error("Invalid Inventor hex pair");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        hexes: {
          ...stateAfterConsume.hexes,
          [h1]: { ...t1, numberToken: t2.numberToken },
          [h2]: { ...t2, numberToken: t1.numberToken },
        },
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Inventor and swapped number tokens #${t1.numberToken} and #${t2.numberToken}.`,
        playerId,
        { cardType: card.type, hexId1: h1, hexId2: h2 }
      );
    }

    default:
      throw new Error(`Unsupported Science Progress Card: ${card.type}`);
  }
}
