import type { RngState } from "@gaming-platform/core";
import { computePlayerVictoryPoints } from "../rules/awards-and-vp.ts";
import { getPlayerResourceCount, omitRecordKey } from "../rules/helpers.ts";
import {
  getLegalRoadEdges,
  revealAdjacentFogHexesPure,
} from "../rules/network.ts";
import { getLegalRobberHexes } from "../rules/robber-pirate.ts";
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

export function applyPoliticsProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined
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
      return pushCkEvent(
        { ...stateAfterConsume, knights: nextKnights },
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
      const legal = getLegalRobberHexes(stateAfterConsume, playerId);
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

      return pushCkEvent(
        {
          ...stateAfterConsume,
          rngState: bishopStolen.rngState,
          robberHexId: hexId,
          players: bishopStolen.players,
        },
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
      const withoutTarget: CatanState = {
        ...stateAfterConsume,
        knights: omitRecordKey(stateAfterConsume.knights, vId),
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
      const targetName =
        stateAfterConsume.players.find((p) => p.id === targetPid)?.name ??
        "an opponent";
      return pushCkEvent(
        {
          ...stateAfterConsume,
          phase: "CK_INTERACTION",
          pendingCkInteraction: pending,
        },
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
      const afterRemove: CatanState = {
        ...stateAfterConsume,
        edges: omitRecordKey(stateAfterConsume.edges, edgeId),
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
        getLegalRoadEdges(afterRemove, playerId, null).includes(rebuildId);
      if (rebuildId !== undefined && !canRebuild) {
        throw new Error("Invalid Diplomat rebuild road edge");
      }

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
        {
          cardType: card.type,
          edgeId,
          rebuildEdgeId: canRebuild ? rebuildId : undefined,
        }
      );
      if (canRebuild && rebuildId) {
        return revealAdjacentFogHexesPure(
          logged.state,
          rebuildId,
          playerId,
          logged.emitted
        );
      }
      return logged;
    }

    case "saboteur": {
      const myVp = computePlayerVictoryPoints(stateAfterConsume, playerId, true);
      const pendingDiscards = stateAfterConsume.players.reduce<
        Record<string, number>
      >((acc, opp) => {
        if (opp.id === playerId) return acc;
        if (computePlayerVictoryPoints(stateAfterConsume, opp.id, true) < myVp)
          return acc;
        const drop = Math.floor(getPlayerResourceCount(opp) / 2);
        return drop > 0 ? { ...acc, [opp.id]: drop } : acc;
      }, {});

      return pushCkEvent(
        {
          ...stateAfterConsume,
          pendingDiscards,
          phaseAfterDiscard: "MAIN_PHASE",
          phase:
            Object.keys(pendingDiscards).length > 0
              ? "DISCARD_ON_SEVEN"
              : "MAIN_PHASE",
        },
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Saboteur!`,
        playerId,
        { cardType: card.type }
      );
    }

    case "spy": {
      const targetPid = params?.targetPlayerId;
      const victim = stateAfterConsume.players.find((p) => p.id === targetPid);
      if (!victim || victim.id === playerId || victim.progressCards.length === 0) {
        throw new Error("Invalid Spy target player");
      }
      return pushCkEvent(
        {
          ...stateAfterConsume,
          phase: "CK_INTERACTION",
          pendingCkInteraction: {
            kind: "spy_choose_card",
            actorId: playerId,
            targetPlayerId: victim.id,
          },
        },
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Spy against ${victim.name} to inspect and take 1 Progress Card.`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id }
      );
    }

    case "wedding": {
      const myVp = computePlayerVictoryPoints(stateAfterConsume, playerId, true);
      const n = stateAfterConsume.players.length;
      const orderedGivers = Array.from({ length: Math.max(0, n - 1) }, (_, i) => {
        const idx = (stateAfterConsume.activePlayerIndex + 1 + i) % n;
        return stateAfterConsume.players[idx]!;
      }).filter(
        (opp) =>
          opp.id !== playerId &&
          computePlayerVictoryPoints(stateAfterConsume, opp.id, true) > myVp &&
          getPlayerResourceCount(opp) > 0
      );

      if (orderedGivers.length === 0) {
        return pushCkEvent(
          stateAfterConsume,
          [],
          "PROGRESS_CARD_PLAYED",
          `${actor.name} played Wedding (no leaders held cards to gift).`,
          playerId,
          { cardType: card.type }
        );
      }

      const firstGiver = orderedGivers[0]!;
      return pushCkEvent(
        {
          ...stateAfterConsume,
          phase: "CK_INTERACTION",
          pendingCkInteraction: {
            kind: "wedding_give_cards",
            actorId: firstGiver.id,
            initiatorId: playerId,
            remainingGiverIds: orderedGivers.slice(1).map((p) => p.id),
            requiredCount: Math.min(2, getPlayerResourceCount(firstGiver)),
          },
        },
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Wedding! Leaders must each gift up to 2 cards.`,
        playerId,
        { cardType: card.type }
      );
    }

    default:
      throw new Error(`Unsupported Politics Progress Card: ${card.type}`);
  }
}
