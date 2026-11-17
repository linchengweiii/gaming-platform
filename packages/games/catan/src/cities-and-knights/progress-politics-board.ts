import type { EdgeId, HexId, RngState } from "@gaming-platform/core";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import type { KnightLevel, ProgressCardInstance } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  type StateEventsPair,
  drawOneRandomHandGoodPure,
  pushCkEvent,
  transferGoodBetweenPlayersPure,
} from "./helpers.ts";
import {
  displaceKnightAtVertexPure,
  getDiplomatRemovableRoadEdges,
  returnKnightToSupplyPure,
  takeKnightFromSupplyPure,
} from "./knights.ts";

export function applyPoliticsBoardProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
): StateEventsPair {
  const actor = stateAfterConsume.players.find((p) => p.id === playerId)!;

  switch (card.type) {
    case "warlord": {
      const nextKnights = Object.fromEntries(
        Object.entries(stateAfterConsume.knights).map(([vId, k]) => [
          vId,
          k.ownerId === playerId && !k.active
            ? { ...k, active: true, activatedThisTurn: true }
            : k,
        ])
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: nextKnights,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Warlord and activated all of their Knights!`,
        playerId,
        { cardType: card.type }
      );
    }

    case "bishop": {
      if (stateAfterConsume.barbarianAttacksCount < 1) {
        throw new Error(
          "Cannot play Bishop before the first Barbarian attack"
        );
      }
      const hexId = params?.hexId;
      const legal = getLegalRobberHexesFn(stateAfterConsume, playerId);
      if (!hexId || !legal.includes(hexId)) {
        throw new Error("Illegal Bishop robber hex");
      }
      const hNode = stateAfterConsume.topology.hexes[hexId]!;
      const victimIds = Array.from(
        new Set(
          hNode.cornerVertexIds
            .map((vId) => stateAfterConsume.buildings[vId]?.ownerId)
            .filter((oid): oid is string => Boolean(oid && oid !== playerId))
        )
      );

      const bishopStolen = victimIds.reduce<{
        rngState: RngState;
        players: CatanPlayerState[];
        count: number;
      }>(
        (acc, vid) => {
          const victim = acc.players.find((p) => p.id === vid)!;
          const [drawn, nextRng] = drawOneRandomHandGoodPure(
            acc.rngState,
            victim
          );
          if (!drawn) return { ...acc, rngState: nextRng };
          return {
            rngState: nextRng,
            players: transferGoodBetweenPlayersPure(
              acc.players,
              vid,
              playerId,
              drawn,
              1
            ),
            count: acc.count + 1,
          };
        },
        {
          rngState: stateAfterConsume.rngState,
          players: stateAfterConsume.players,
          count: 0,
        }
      );

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: bishopStolen.rngState,
        robberHexId: hexId,
        players: bishopStolen.players,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Bishop, moved the Robber, and drew ${bishopStolen.count} card(s).`,
        playerId,
        { cardType: card.type, hexId, stolenCount: bishopStolen.count }
      );
    }

    case "intrigue": {
      const vId = params?.vertexId;
      const targetKnight = vId ? stateAfterConsume.knights[vId] : undefined;
      const vNode = vId ? stateAfterConsume.topology.vertices[vId] : undefined;
      if (
        !vId ||
        !targetKnight ||
        targetKnight.ownerId === playerId ||
        !vNode?.incidentEdgeIds.some(
          (eId) => stateAfterConsume.edges[eId]?.ownerId === playerId
        )
      ) {
        throw new Error("Invalid Intrigue target knight");
      }
      const displaced = displaceKnightAtVertexPure(stateAfterConsume, vId);
      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: displaced.knights,
        players: displaced.players,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Intrigue and displaced an opposing Knight.`,
        playerId,
        { cardType: card.type, vertexId: vId }
      );
    }

    case "deserter": {
      const targetPid = params?.targetPlayerId;
      if (!targetPid || targetPid === playerId) {
        throw new Error("Invalid Deserter target player");
      }
      const oppKnights = Object.entries(stateAfterConsume.knights).filter(
        ([, k]) => k.ownerId === targetPid
      );
      if (oppKnights.length === 0) {
        throw new Error("Target opponent has no knights on the board");
      }
      // Opponent loses their lowest-level (preferring inactive) knight
      const [desertVertexId, desertKnight] = [...oppKnights].sort(
        ([, a], [, b]) =>
          a.level !== b.level
            ? a.level - b.level
            : Number(a.active) - Number(b.active)
      )[0]!;

      const withoutDeserted = Object.fromEntries(
        Object.entries(stateAfterConsume.knights).filter(
          ([vId]) => vId !== desertVertexId
        )
      );
      const withReturnedSupply = stateAfterConsume.players.map((p) =>
        p.id === targetPid
          ? returnKnightToSupplyPure(p, desertKnight.level)
          : p
      );

      const actorUpdated = withReturnedSupply.find((p) => p.id === playerId)!;
      const chosenLevel: KnightLevel | null = (() => {
        const candidates: KnightLevel[] =
          desertKnight.level === 3
            ? [3, 2, 1]
            : desertKnight.level === 2
              ? [2, 1]
              : [1];
        for (const lvl of candidates) {
          if (
            lvl === 3 &&
            actorUpdated.mightyKnightsRemaining > 0 &&
            actorUpdated.cityImprovements.politics >= 3
          ) {
            return 3;
          }
          if (lvl === 2 && actorUpdated.strongKnightsRemaining > 0) {
            return 2;
          }
          if (lvl === 1 && actorUpdated.basicKnightsRemaining > 0) {
            return 1;
          }
        }
        return null;
      })();

      const placeVId = params?.placeVertexId;
      const canPlaceAtSpot = Boolean(
        chosenLevel &&
          placeVId &&
          !stateAfterConsume.buildings[placeVId] &&
          !withoutDeserted[placeVId] &&
          stateAfterConsume.topology.vertices[placeVId]?.incidentEdgeIds.some(
            (eId) => stateAfterConsume.edges[eId]?.ownerId === playerId
          )
      );

      const nextKnights =
        canPlaceAtSpot && placeVId && chosenLevel
          ? {
              ...withoutDeserted,
              [placeVId]: {
                ownerId: playerId,
                level: chosenLevel,
                active: desertKnight.active,
                activatedThisTurn: desertKnight.active,
                actedThisTurn: false,
                promotedThisTurn: false,
              },
            }
          : withoutDeserted;

      const finalPlayers =
        canPlaceAtSpot && chosenLevel
          ? withReturnedSupply.map((p) =>
              p.id === playerId ? takeKnightFromSupplyPure(p, chosenLevel) : p
            )
          : withReturnedSupply;

      const nextState: CatanState = {
        ...stateAfterConsume,
        knights: nextKnights,
        players: finalPlayers,
      };
      const targetName =
        stateAfterConsume.players.find((p) => p.id === targetPid)?.name ??
        "an opponent";
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Deserter against ${targetName}!`,
        playerId,
        { cardType: card.type, targetPlayerId: targetPid }
      );
    }

    case "diplomat": {
      const edgeId = params?.edgeId;
      const removable = getDiplomatRemovableRoadEdges(stateAfterConsume);
      if (!edgeId || !removable.includes(edgeId)) {
        throw new Error("Invalid Diplomat road edge");
      }
      const removedRoute = stateAfterConsume.edges[edgeId]!;
      const withoutEdge = Object.fromEntries(
        Object.entries(stateAfterConsume.edges).filter(([k]) => k !== edgeId)
      );
      const afterRemove: CatanState = {
        ...stateAfterConsume,
        edges: withoutEdge,
        players: stateAfterConsume.players.map((p) =>
          p.id === removedRoute.ownerId
            ? { ...p, roadsRemaining: p.roadsRemaining + 1 }
            : p
        ),
      };

      const rebuildId = params?.rebuildEdgeId;
      const canRebuild =
        removedRoute.ownerId === playerId &&
        rebuildId &&
        getLegalRoadEdgesFn(afterRemove, playerId).includes(rebuildId);

      const finalState: CatanState =
        canRebuild && rebuildId
          ? {
              ...afterRemove,
              edges: {
                ...afterRemove.edges,
                [rebuildId]: {
                  ownerId: playerId,
                  type: "road",
                  builtOnTurn: afterRemove.turn,
                },
              },
              players: afterRemove.players.map((p) =>
                p.id === playerId
                  ? { ...p, roadsRemaining: p.roadsRemaining - 1 }
                  : p
              ),
            }
          : afterRemove;

      return pushCkEvent(
        finalState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Diplomat.`,
        playerId,
        { cardType: card.type, edgeId, rebuildEdgeId: rebuildId }
      );
    }

    default:
      throw new Error(
        `Unsupported Politics Board Progress Card: ${card.type}`
      );
  }
}
