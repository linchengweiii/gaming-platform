import type { EdgeId, GameEvent, HexId, RngState } from "@gaming-platform/core";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import type { ProgressCardInstance } from "../types/domain.ts";
import type {
  CatanPlayerState,
  CatanState,
  PendingCkInteraction,
} from "../types/state.ts";
import {
  type StateEventsPair,
  drawOneRandomHandGoodPure,
  pushCkEvent,
  transferGoodBetweenPlayersPure,
} from "./helpers.ts";
import {
  getDiplomatRemovableRoadEdges,
  prepareDisplaceKnightPure,
} from "./knights.ts";

export function applyPoliticsBoardProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[],
  revealAdjacentFogFn: (
    s: CatanState,
    pid: string,
    edgeId: EdgeId,
    emitted: readonly GameEvent[]
  ) => { readonly state: CatanState; readonly emitted: GameEvent[] }
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
          (eId) =>
            stateAfterConsume.edges[eId]?.ownerId === playerId &&
            stateAfterConsume.edges[eId]?.type === "road"
        )
      ) {
        throw new Error("Invalid Intrigue target knight");
      }
      const withoutTarget: CatanState = {
        ...stateAfterConsume,
        knights: Object.fromEntries(
          Object.entries(stateAfterConsume.knights).filter(([k]) => k !== vId)
        ),
      };
      const prep = prepareDisplaceKnightPure(withoutTarget, targetKnight, vId);
      const nextState: CatanState =
        prep.candidateVertexIds.length > 0
          ? {
              ...withoutTarget,
              phase: "CK_INTERACTION",
              pendingCkInteraction: {
                kind: "displace_knight",
                actorId: targetKnight.ownerId,
                knight: targetKnight,
                fromVertexId: vId,
                candidateVertexIds: prep.candidateVertexIds,
              },
            }
          : {
              ...withoutTarget,
              players: prep.playersIfRemoved,
            };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        prep.candidateVertexIds.length > 0
          ? `${actor.name} played Intrigue and displaced an opposing Knight (awaiting retreat choice).`
          : `${actor.name} played Intrigue and removed an opposing Knight with nowhere to retreat.`,
        playerId,
        { cardType: card.type, vertexId: vId }
      );
    }

    case "deserter": {
      const targetPid = params?.targetPlayerId;
      if (!targetPid || targetPid === playerId) {
        throw new Error("Invalid Deserter target player");
      }
      const oppKnightVertices = Object.entries(stateAfterConsume.knights)
        .filter(([, k]) => k.ownerId === targetPid)
        .map(([vId]) => vId);
      if (oppKnightVertices.length === 0) {
        throw new Error("Target opponent has no knights on the board");
      }
      const pending: PendingCkInteraction = {
        kind: "deserter_choose_knight",
        actorId: targetPid,
        initiatorId: playerId,
        candidateVertexIds: oppKnightVertices,
      };
      const nextState: CatanState = {
        ...stateAfterConsume,
        phase: "CK_INTERACTION",
        pendingCkInteraction: pending,
      };
      const targetName =
        stateAfterConsume.players.find((p) => p.id === targetPid)?.name ??
        "an opponent";
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Deserter against ${targetName} (${targetName} must choose a Knight to desert).`,
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
        rebuildId !== edgeId &&
        getLegalRoadEdgesFn(afterRemove, playerId).includes(rebuildId);

      const rebuiltState: CatanState =
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

      const logged = pushCkEvent(
        rebuiltState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Diplomat.`,
        playerId,
        { cardType: card.type, edgeId, rebuildEdgeId: canRebuild ? rebuildId : undefined }
      );
      if (canRebuild && rebuildId) {
        return revealAdjacentFogFn(logged.state, playerId, rebuildId, logged.emitted);
      }
      return logged;
    }

    default:
      throw new Error(
        `Unsupported Politics Board Progress Card: ${card.type}`
      );
  }
}
