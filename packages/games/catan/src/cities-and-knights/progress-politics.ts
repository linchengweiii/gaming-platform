import { type EdgeId, type HexId, type RngState, pickPure } from "@gaming-platform/core";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import { type ProgressCardInstance, RESOURCES } from "../types/domain.ts";
import type { CatanPlayerState, CatanState } from "../types/state.ts";
import {
  type StateEventsPair,
  drawOneRandomHandGoodPure,
  pushCkEvent,
  totalCommodityCount,
  transferGoodBetweenPlayersPure,
} from "./helpers.ts";
import { applyPoliticsBoardProgressCardPure } from "./progress-politics-board.ts";

export function applyPoliticsProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
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
        getLegalRobberHexesFn
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
      const [stolenCard, nextRng] = pickPure(
        stateAfterConsume.rngState,
        victim.progressCards
      );
      const nextPlayers = stateAfterConsume.players.map((p) => {
        if (p.id === victim.id) {
          return {
            ...p,
            progressCards: p.progressCards.filter((c) => c.id !== stolenCard.id),
          };
        }
        if (p.id === playerId) {
          return {
            ...p,
            progressCards: [...p.progressCards, stolenCard],
          };
        }
        return p;
      });
      const updatedActor = nextPlayers.find((p) => p.id === playerId)!;
      const nextPendingDiscards =
        updatedActor.progressCards.length > 4 &&
        !stateAfterConsume.pendingProgressDiscards.includes(playerId)
          ? [...stateAfterConsume.pendingProgressDiscards, playerId]
          : stateAfterConsume.pendingProgressDiscards;

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: nextRng,
        players: nextPlayers,
        pendingProgressDiscards: nextPendingDiscards,
        phase:
          nextPendingDiscards.length > 0
            ? "PROGRESS_CARD_SELECTION"
            : stateAfterConsume.phase,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Spy and stole 1 Progress Card from ${victim.name}.`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id }
      );
    }

    case "wedding": {
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const leaders = stateAfterConsume.players.filter(
        (opp) =>
          opp.id !== playerId &&
          computeVpFn(stateAfterConsume, opp.id, true) > myVp
      );

      const gifted = leaders.reduce<{
        rngState: RngState;
        players: CatanPlayerState[];
        totalGained: number;
      }>(
        (acc, leader) => {
          const step1 = (() => {
            const curLeader = acc.players.find((p) => p.id === leader.id)!;
            const [g1, r1] = drawOneRandomHandGoodPure(acc.rngState, curLeader);
            if (!g1) return { rng: r1, players: acc.players, gained: 0 };
            return {
              rng: r1,
              players: transferGoodBetweenPlayersPure(
                acc.players,
                leader.id,
                playerId,
                g1,
                1
              ),
              gained: 1,
            };
          })();
          const curLeader2 = step1.players.find((p) => p.id === leader.id)!;
          const [g2, r2] = drawOneRandomHandGoodPure(step1.rng, curLeader2);
          if (!g2) {
            return {
              rngState: r2,
              players: step1.players,
              totalGained: acc.totalGained + step1.gained,
            };
          }
          return {
            rngState: r2,
            players: transferGoodBetweenPlayersPure(
              step1.players,
              leader.id,
              playerId,
              g2,
              1
            ),
            totalGained: acc.totalGained + step1.gained + 1,
          };
        },
        {
          rngState: stateAfterConsume.rngState,
          players: stateAfterConsume.players,
          totalGained: 0,
        }
      );

      const nextState: CatanState = {
        ...stateAfterConsume,
        rngState: gifted.rngState,
        players: gifted.players,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Wedding and received ${gifted.totalGained} gift card(s).`,
        playerId,
        { cardType: card.type, totalGained: gifted.totalGained }
      );
    }

    default:
      throw new Error(`Unsupported Politics Progress Card: ${card.type}`);
  }
}
