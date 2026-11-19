import type { EdgeId, GameEvent, HexId } from "@gaming-platform/core";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import { type ProgressCardInstance, RESOURCES } from "../types/domain.ts";
import type { CatanState, PendingCkInteraction } from "../types/state.ts";
import {
  type StateEventsPair,
  pushCkEvent,
  totalCommodityCount,
} from "./helpers.ts";
import { applyPoliticsBoardProgressCardPure } from "./progress-politics-board.ts";

export function applyPoliticsProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
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
    case "warlord":
    case "bishop":
    case "intrigue":
    case "deserter":
    case "diplomat":
      return applyPoliticsBoardProgressCardPure(
        stateAfterConsume,
        playerId,
        card,
        params,
        getLegalRoadEdgesFn,
        getLegalRobberHexesFn,
        revealAdjacentFogFn
      );

    case "saboteur": {
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const pendingDiscards = stateAfterConsume.players.reduce<
        Record<string, number>
      >((acc, opp) => {
        if (opp.id === playerId) return acc;
        if (computeVpFn(stateAfterConsume, opp.id, true) < myVp) return acc;
        const handTotal =
          RESOURCES.reduce<number>((s, r) => s + opp.resources[r], 0) +
          totalCommodityCount(opp.commodities);
        const drop = Math.floor(handTotal / 2);
        return drop > 0 ? { ...acc, [opp.id]: drop } : acc;
      }, {});

      const nextState: CatanState = {
        ...stateAfterConsume,
        pendingDiscards,
        phaseAfterDiscard: "MAIN_PHASE",
        phase:
          Object.keys(pendingDiscards).length > 0
            ? "DISCARD_ON_SEVEN"
            : "MAIN_PHASE",
      };
      return pushCkEvent(
        nextState,
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
      const pending: PendingCkInteraction = {
        kind: "spy_choose_card",
        actorId: playerId,
        targetPlayerId: victim.id,
      };
      const nextState: CatanState = {
        ...stateAfterConsume,
        phase: "CK_INTERACTION",
        pendingCkInteraction: pending,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Spy against ${victim.name} to inspect and take 1 Progress Card.`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id }
      );
    }

    case "wedding": {
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const n = stateAfterConsume.players.length;
      const orderedGivers = Array.from({ length: Math.max(0, n - 1) }, (_, i) => {
        const idx = (stateAfterConsume.activePlayerIndex + 1 + i) % n;
        return stateAfterConsume.players[idx]!;
      }).filter((opp) => {
        if (opp.id === playerId) return false;
        if (computeVpFn(stateAfterConsume, opp.id, true) <= myVp) return false;
        const handCount =
          RESOURCES.reduce<number>((s, r) => s + opp.resources[r], 0) +
          totalCommodityCount(opp.commodities);
        return handCount > 0;
      });

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
      const firstHandCount =
        RESOURCES.reduce<number>((s, r) => s + firstGiver.resources[r], 0) +
        totalCommodityCount(firstGiver.commodities);
      const pending: PendingCkInteraction = {
        kind: "wedding_give_cards",
        actorId: firstGiver.id,
        initiatorId: playerId,
        remainingGiverIds: orderedGivers.slice(1).map((p) => p.id),
        requiredCount: Math.min(2, firstHandCount),
      };
      const nextState: CatanState = {
        ...stateAfterConsume,
        phase: "CK_INTERACTION",
        pendingCkInteraction: pending,
      };
      return pushCkEvent(
        nextState,
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
