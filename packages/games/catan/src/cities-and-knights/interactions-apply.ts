import type { GameEvent } from "@gaming-platform/core";
import type {
  CommodityMap,
  CommodityType,
  ResourceMap,
} from "../types/domain.ts";
import type {
  CatanPlayerState,
  CatanState,
  PendingCkInteraction,
} from "../types/state.ts";
import {
  addResourcesPure,
  assertNonNegativeIntGoodMapPure,
  hasResources,
  subtractResourcesPure,
  totalResourceCount,
} from "../rules/helpers.ts";
import {
  addCommoditiesPure,
  hasCommodities,
  isCommodityType,
  isResourceType,
  pushCkEvent,
  subtractCommoditiesPure,
  totalCommodityCount,
  transferGoodBetweenPlayersPure,
} from "./helpers.ts";
import { applyCkKnightInteractionPure } from "./interactions-knights.ts";
import {
  type CkInteractionAction,
  getCommercialHarborEligibleTargetsPure,
} from "./interactions-legal.ts";

function transferCardBundlePure(
  players: readonly CatanPlayerState[],
  fromId: string,
  toId: string,
  resources: Partial<ResourceMap>,
  commodities: Partial<CommodityMap> | undefined
): CatanPlayerState[] {
  return players.map((p) => {
    if (p.id === fromId) {
      return {
        ...p,
        resources: subtractResourcesPure(p.resources, resources),
        commodities: subtractCommoditiesPure(p.commodities, commodities),
      };
    }
    if (p.id === toId) {
      return {
        ...p,
        resources: addResourcesPure(p.resources, resources),
        commodities: addCommoditiesPure(p.commodities, commodities),
      };
    }
    return p;
  });
}

export function applyCkInteractionActionPure(
  currentState: CatanState,
  playerId: string,
  action: CkInteractionAction
): { state: CatanState; events: GameEvent[] } {
  if (
    currentState.phase !== "CK_INTERACTION" ||
    !currentState.pendingCkInteraction
  ) {
    throw new Error("No active Cities & Knights interaction");
  }
  const pending = currentState.pendingCkInteraction;
  if (pending.actorId !== playerId) {
    throw new Error("Not your Cities & Knights choice");
  }
  const actor = currentState.players.find((p) => p.id === playerId)!;

  switch (action.type) {
    case "RESOLVE_DISPLACED_KNIGHT":
    case "SELECT_DESERTER_KNIGHT":
    case "PLACE_DESERTED_KNIGHT":
      return applyCkKnightInteractionPure(
        currentState,
        pending,
        actor,
        playerId,
        action
      );

    case "SELECT_SPY_CARD": {
      if (pending.kind !== "spy_choose_card") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      const victim = currentState.players.find(
        (p) => p.id === pending.targetPlayerId
      );
      const stolenCard = victim?.progressCards.find(
        (c) => c.id === action.stolenCardId
      );
      if (!victim || !stolenCard) {
        throw new Error("Selected Progress Card not found in target hand");
      }
      const nextPlayers = currentState.players.map((p) => {
        if (p.id === victim.id) {
          return {
            ...p,
            progressCards: p.progressCards.filter(
              (c) => c.id !== stolenCard.id
            ),
          };
        }
        if (p.id === playerId) {
          return { ...p, progressCards: [...p.progressCards, stolenCard] };
        }
        return p;
      });
      const updatedActor = nextPlayers.find((p) => p.id === playerId)!;
      const activePlayerId =
        currentState.players[currentState.activePlayerIndex]?.id;
      const mustDiscardImmediately =
        updatedActor.progressCards.length > 4 && playerId !== activePlayerId;
      const nextPendingDiscards =
        mustDiscardImmediately &&
        !currentState.pendingProgressDiscards.includes(playerId)
          ? [...currentState.pendingProgressDiscards, playerId]
          : currentState.pendingProgressDiscards;
      const logged = pushCkEvent(
        {
          ...currentState,
          players: nextPlayers,
          pendingCkInteraction: null,
          pendingProgressDiscards: nextPendingDiscards,
          phase:
            nextPendingDiscards.length > 0
              ? "PROGRESS_CARD_SELECTION"
              : "MAIN_PHASE",
        },
        [],
        "SPY_CARD_STOLEN",
        `${actor.name} stole 1 Progress Card from ${victim.name}.`,
        playerId,
        { targetPlayerId: victim.id }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "SELECT_MASTER_MERCHANT_CARDS": {
      if (pending.kind !== "master_merchant_choose_cards") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      assertNonNegativeIntGoodMapPure(action.resources, "Master Merchant resource");
      assertNonNegativeIntGoodMapPure(action.commodities, "Master Merchant commodity");
      const victim = currentState.players.find(
        (p) => p.id === pending.targetPlayerId
      );
      if (!victim) throw new Error("Master Merchant target not found");
      const totalSelected =
        totalResourceCount(action.resources) +
        totalCommodityCount(action.commodities);
      if (totalSelected !== pending.maxCards) {
        throw new Error(
          `Must select exactly ${pending.maxCards} card(s) (got ${totalSelected})`
        );
      }
      if (
        !hasResources(victim.resources, action.resources) ||
        !hasCommodities(victim.commodities, action.commodities)
      ) {
        throw new Error("Target player does not have selected cards");
      }
      const nextPlayers = transferCardBundlePure(
        currentState.players,
        victim.id,
        playerId,
        action.resources,
        action.commodities
      );
      const logged = pushCkEvent(
        {
          ...currentState,
          players: nextPlayers,
          pendingCkInteraction: null,
          phase: "MAIN_PHASE",
        },
        [],
        "MASTER_MERCHANT_COMPLETED",
        `${actor.name} took ${totalSelected} card(s) from ${victim.name} via Master Merchant.`,
        playerId,
        { targetPlayerId: victim.id, count: totalSelected }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "GIVE_WEDDING_CARDS": {
      if (pending.kind !== "wedding_give_cards") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      assertNonNegativeIntGoodMapPure(action.resources, "Wedding gift resource");
      assertNonNegativeIntGoodMapPure(action.commodities, "Wedding gift commodity");
      const totalGiven =
        totalResourceCount(action.resources) +
        totalCommodityCount(action.commodities);
      if (totalGiven !== pending.requiredCount) {
        throw new Error(
          `Must give exactly ${pending.requiredCount} card(s) (got ${totalGiven})`
        );
      }
      if (
        !hasResources(actor.resources, action.resources) ||
        !hasCommodities(actor.commodities, action.commodities)
      ) {
        throw new Error("You do not hold those cards to gift");
      }
      const nextPlayers = transferCardBundlePure(
        currentState.players,
        playerId,
        pending.initiatorId,
        action.resources,
        action.commodities
      );

      const nextGiverIdx = pending.remainingGiverIds.findIndex((gid) => {
        const g = nextPlayers.find((p) => p.id === gid);
        return (
          g &&
          totalResourceCount(g.resources) + totalCommodityCount(g.commodities) >
            0
        );
      });
      const nextInteraction: PendingCkInteraction | null =
        nextGiverIdx >= 0
          ? (() => {
              const nextGid = pending.remainingGiverIds[nextGiverIdx]!;
              const g = nextPlayers.find((p) => p.id === nextGid)!;
              const handSize =
                totalResourceCount(g.resources) +
                totalCommodityCount(g.commodities);
              return {
                kind: "wedding_give_cards",
                actorId: nextGid,
                initiatorId: pending.initiatorId,
                remainingGiverIds: pending.remainingGiverIds.slice(
                  nextGiverIdx + 1
                ),
                requiredCount: Math.min(2, handSize),
              };
            })()
          : null;

      const initiatorName =
        nextPlayers.find((p) => p.id === pending.initiatorId)?.name ?? "player";
      const logged = pushCkEvent(
        {
          ...currentState,
          players: nextPlayers,
          pendingCkInteraction: nextInteraction,
          phase: nextInteraction ? "CK_INTERACTION" : "MAIN_PHASE",
        },
        [],
        "WEDDING_GIFT_GIVEN",
        `${actor.name} gifted ${totalGiven} card(s) to ${initiatorName}.`,
        playerId,
        { toPlayerId: pending.initiatorId, count: totalGiven }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "OFFER_COMMERCIAL_HARBOR": {
      if (pending.kind !== "commercial_harbor_offer") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      if (!pending.eligibleTargetIds.includes(action.targetPlayerId)) {
        throw new Error("Target player is not eligible for Commercial Harbor");
      }
      if (
        !isResourceType(action.resource) ||
        actor.resources[action.resource] <= 0
      ) {
        throw new Error("You do not hold the offered resource");
      }
      const nextPending: PendingCkInteraction = {
        kind: "commercial_harbor_respond",
        actorId: action.targetPlayerId,
        initiatorId: playerId,
        offeredResource: action.resource,
        offeredPlayerIds: [...pending.offeredPlayerIds, action.targetPlayerId],
      };
      const targetName =
        currentState.players.find((p) => p.id === action.targetPlayerId)?.name ??
        "opponent";
      const logged = pushCkEvent(
        {
          ...currentState,
          pendingCkInteraction: nextPending,
          phase: "CK_INTERACTION",
        },
        [],
        "COMMERCIAL_HARBOR_OFFERED",
        `${actor.name} offered 1 ${action.resource} to ${targetName} via Commercial Harbor.`,
        playerId,
        { targetPlayerId: action.targetPlayerId, resource: action.resource }
      );
      return { state: logged.state, events: logged.emitted };
    }

    case "END_COMMERCIAL_HARBOR": {
      if (pending.kind !== "commercial_harbor_offer") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      return {
        state: {
          ...currentState,
          pendingCkInteraction: null,
          phase: "MAIN_PHASE",
        },
        events: [],
      };
    }

    case "RESPOND_COMMERCIAL_HARBOR": {
      if (pending.kind !== "commercial_harbor_respond") {
        throw new Error("Unexpected action for current C&K interaction");
      }
      const comm: CommodityType = action.commodity;
      if (!isCommodityType(comm) || actor.commodities[comm] <= 0) {
        throw new Error("You do not hold that commodity");
      }
      const pAfterGive = transferGoodBetweenPlayersPure(
        currentState.players,
        pending.initiatorId,
        playerId,
        pending.offeredResource,
        1
      );
      const pAfterRecv = transferGoodBetweenPlayersPure(
        pAfterGive,
        playerId,
        pending.initiatorId,
        comm,
        1
      );
      const intermediate: CatanState = {
        ...currentState,
        players: pAfterRecv,
      };
      const initiator = pAfterRecv.find((p) => p.id === pending.initiatorId)!;
      const initiatorHasRes = totalResourceCount(initiator.resources) > 0;
      const nextEligible = initiatorHasRes
        ? getCommercialHarborEligibleTargetsPure(
            intermediate,
            pending.initiatorId,
            pending.offeredPlayerIds
          )
        : [];
      const nextInteraction: PendingCkInteraction | null =
        nextEligible.length > 0
          ? {
              kind: "commercial_harbor_offer",
              actorId: pending.initiatorId,
              offeredPlayerIds: pending.offeredPlayerIds,
              eligibleTargetIds: nextEligible,
            }
          : null;

      const logged = pushCkEvent(
        {
          ...intermediate,
          pendingCkInteraction: nextInteraction,
          phase: nextInteraction ? "CK_INTERACTION" : "MAIN_PHASE",
        },
        [],
        "COMMERCIAL_HARBOR_SWAPPED",
        `${actor.name} traded 1 ${comm} for 1 ${pending.offeredResource} via Commercial Harbor.`,
        playerId,
        {
          initiatorId: pending.initiatorId,
          resource: pending.offeredResource,
          commodity: comm,
        }
      );
      return { state: logged.state, events: logged.emitted };
    }
  }
}
