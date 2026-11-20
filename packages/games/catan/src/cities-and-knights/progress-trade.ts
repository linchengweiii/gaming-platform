import { TERRAIN_TO_RESOURCE } from "../config/costs-and-limits.ts";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import {
  type ProgressCardInstance,
  RESOURCES,
  TRADE_GOODS,
} from "../types/domain.ts";
import type {
  CatanPlayerState,
  CatanState,
  PendingCkInteraction,
} from "../types/state.ts";
import {
  type StateEventsPair,
  isCommodityType,
  isResourceType,
  pushCkEvent,
  totalCommodityCount,
  transferGoodBetweenPlayersPure,
} from "./helpers.ts";
import { getCommercialHarborEligibleTargetsPure } from "./interactions.ts";

export function applyTradeProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number
): StateEventsPair {
  const actor = stateAfterConsume.players.find((p) => p.id === playerId)!;

  switch (card.type) {
    case "merchant": {
      const hexId = params?.hexId;
      const tile = hexId ? stateAfterConsume.hexes[hexId] : undefined;
      const hNode = hexId ? stateAfterConsume.topology.hexes[hexId] : undefined;
      if (
        !hexId ||
        !tile ||
        !hNode ||
        !TERRAIN_TO_RESOURCE[tile.terrain] ||
        !hNode.cornerVertexIds.some(
          (vId) => stateAfterConsume.buildings[vId]?.ownerId === playerId
        )
      ) {
        throw new Error("Invalid Merchant hex");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        merchantHexId: hexId,
        merchantOwnerId: playerId,
      };
      const res = TERRAIN_TO_RESOURCE[tile.terrain]!;
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} placed the Merchant on ${tile.terrain} (+1 VP and 2:1 ${res} trade).`,
        playerId,
        { cardType: card.type, hexId }
      );
    }

    case "resource_monopoly": {
      const res = params?.resource;
      if (!res || !isResourceType(res)) {
        throw new Error("Invalid Resource Monopoly resource");
      }
      const taken = stateAfterConsume.players.reduce<{
        players: CatanPlayerState[];
        total: number;
      }>(
        (acc, opp) => {
          if (opp.id === playerId) return acc;
          const amt = Math.min(2, opp.resources[res]);
          if (amt <= 0) return acc;
          return {
            players: transferGoodBetweenPlayersPure(
              acc.players,
              opp.id,
              playerId,
              res,
              amt
            ),
            total: acc.total + amt,
          };
        },
        { players: stateAfterConsume.players, total: 0 }
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: taken.players,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Resource Monopoly on ${res} and collected ${taken.total} card(s).`,
        playerId,
        { cardType: card.type, resource: res, total: taken.total }
      );
    }

    case "trade_monopoly": {
      const comm = params?.commodity;
      if (!comm || !isCommodityType(comm)) {
        throw new Error("Invalid Trade Monopoly commodity");
      }
      const taken = stateAfterConsume.players.reduce<{
        players: CatanPlayerState[];
        total: number;
      }>(
        (acc, opp) => {
          if (opp.id === playerId) return acc;
          const amt = Math.min(1, opp.commodities[comm]);
          if (amt <= 0) return acc;
          return {
            players: transferGoodBetweenPlayersPure(
              acc.players,
              opp.id,
              playerId,
              comm,
              amt
            ),
            total: acc.total + amt,
          };
        },
        { players: stateAfterConsume.players, total: 0 }
      );
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: taken.players,
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Trade Monopoly on ${comm} and collected ${taken.total} card(s).`,
        playerId,
        { cardType: card.type, commodity: comm, total: taken.total }
      );
    }

    case "merchant_fleet": {
      const good = params?.good;
      if (!good || !(TRADE_GOODS as readonly string[]).includes(good)) {
        throw new Error("Invalid Merchant Fleet good");
      }
      const nextState: CatanState = {
        ...stateAfterConsume,
        players: stateAfterConsume.players.map((p) => {
          if (p.id !== playerId) return p;
          const prevGoods = [
            ...(p.activeTurnDiscounts.merchantFleetGoods ?? []),
            ...(p.activeTurnDiscounts.merchantFleetGood
              ? [p.activeTurnDiscounts.merchantFleetGood]
              : []),
          ];
          const nextGoods = Array.from(new Set([...prevGoods, good]));
          return {
            ...p,
            activeTurnDiscounts: {
              ...p.activeTurnDiscounts,
              merchantFleetGood: good,
              merchantFleetGoods: nextGoods,
            },
          };
        }),
      };
      return pushCkEvent(
        nextState,
        [],
        "PROGRESS_CARD_PLAYED",
        `${actor.name} played Merchant Fleet (2:1 bank trade on ${good} this turn).`,
        playerId,
        { cardType: card.type, good }
      );
    }

    case "master_merchant": {
      const targetPid = params?.targetPlayerId;
      const myVp = computeVpFn(stateAfterConsume, playerId, true);
      const victim = stateAfterConsume.players.find((p) => p.id === targetPid);
      if (
        !victim ||
        victim.id === playerId ||
        computeVpFn(stateAfterConsume, victim.id, true) <= myVp
      ) {
        throw new Error("Invalid Master Merchant target");
      }
      const targetHandTotal =
        RESOURCES.reduce<number>((s, r) => s + victim.resources[r], 0) +
        totalCommodityCount(victim.commodities);
      if (targetHandTotal <= 0) {
        return pushCkEvent(
          stateAfterConsume,
          [],
          "PROGRESS_CARD_PLAYED",
          `${actor.name} played Master Merchant on ${victim.name} (hand was empty).`,
          playerId,
          { cardType: card.type, targetPlayerId: victim.id, count: 0 }
        );
      }
      const pending: PendingCkInteraction = {
        kind: "master_merchant_choose_cards",
        actorId: playerId,
        targetPlayerId: victim.id,
        maxCards: Math.min(2, targetHandTotal),
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
        `${actor.name} played Master Merchant to inspect ${victim.name}'s hand and take up to ${pending.maxCards} card(s).`,
        playerId,
        { cardType: card.type, targetPlayerId: victim.id }
      );
    }

    case "commercial_harbor": {
      const actorHasResource = RESOURCES.some((r) => actor.resources[r] > 0);
      if (!actorHasResource) {
        throw new Error("Commercial Harbor requires at least 1 resource card");
      }
      const eligibleTargetIds = getCommercialHarborEligibleTargetsPure(
        stateAfterConsume,
        playerId,
        []
      );
      if (eligibleTargetIds.length === 0) {
        return pushCkEvent(
          stateAfterConsume,
          [],
          "PROGRESS_CARD_PLAYED",
          `${actor.name} played Commercial Harbor (no opponents held commodities to trade).`,
          playerId,
          { cardType: card.type, swaps: 0 }
        );
      }
      const pending: PendingCkInteraction = {
        kind: "commercial_harbor_offer",
        actorId: playerId,
        offeredPlayerIds: [],
        eligibleTargetIds,
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
        `${actor.name} played Commercial Harbor! Choose opponents to offer 1 resource for 1 commodity.`,
        playerId,
        { cardType: card.type }
      );
    }

    default:
      throw new Error(`Unsupported Trade Progress Card: ${card.type}`);
  }
}
