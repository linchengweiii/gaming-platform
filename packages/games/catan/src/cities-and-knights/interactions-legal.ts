import type { CatanAction } from "../types/actions.ts";
import {
  COMMODITIES,
  type CommodityMap,
  RESOURCES,
  type ResourceMap,
  TRADE_GOODS,
  type TradeGoodType,
} from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import { isResourceType, totalCommodityCount } from "./helpers.ts";

export type CkInteractionAction = Extract<
  CatanAction,
  | { type: "RESOLVE_DISPLACED_KNIGHT" }
  | { type: "SELECT_DESERTER_KNIGHT" }
  | { type: "PLACE_DESERTED_KNIGHT" }
  | { type: "SELECT_SPY_CARD" }
  | { type: "SELECT_MASTER_MERCHANT_CARDS" }
  | { type: "GIVE_WEDDING_CARDS" }
  | { type: "OFFER_COMMERCIAL_HARBOR" }
  | { type: "END_COMMERCIAL_HARBOR" }
  | { type: "RESPOND_COMMERCIAL_HARBOR" }
>;

function enumerateGoodBundleCombosPure(
  resources: ResourceMap,
  commodities: CommodityMap,
  count: number
): Array<{
  resources: Partial<ResourceMap>;
  commodities?: Partial<CommodityMap>;
}> {
  if (count <= 0) return [];
  const heldGoods = TRADE_GOODS.filter((g) =>
    isResourceType(g) ? resources[g] > 0 : commodities[g] > 0
  );
  const toBundle = (
    picks: readonly TradeGoodType[]
  ): {
    resources: Partial<ResourceMap>;
    commodities?: Partial<CommodityMap>;
  } => {
    const resMap: Partial<ResourceMap> = {};
    const commMap: Partial<CommodityMap> = {};
    let hasComm = false;
    for (const g of picks) {
      if (isResourceType(g)) {
        resMap[g] = (resMap[g] ?? 0) + 1;
      } else {
        commMap[g] = (commMap[g] ?? 0) + 1;
        hasComm = true;
      }
    }
    return hasComm
      ? { resources: resMap, commodities: commMap }
      : { resources: resMap };
  };

  if (count === 1) {
    return heldGoods.map((g) => toBundle([g]));
  }

  const combos: Array<{
    resources: Partial<ResourceMap>;
    commodities?: Partial<CommodityMap>;
  }> = [];
  for (let i = 0; i < heldGoods.length; i++) {
    const g1 = heldGoods[i]!;
    const cnt1 = isResourceType(g1) ? resources[g1] : commodities[g1];
    for (let j = i; j < heldGoods.length; j++) {
      const g2 = heldGoods[j]!;
      if (i === j && cnt1 < 2) continue;
      combos.push(toBundle([g1, g2]));
    }
  }
  return combos;
}

export function getCommercialHarborEligibleTargetsPure(
  state: CatanState,
  initiatorId: string,
  offeredPlayerIds: readonly string[]
): string[] {
  return state.players
    .filter(
      (opp) =>
        opp.id !== initiatorId &&
        !offeredPlayerIds.includes(opp.id) &&
        totalCommodityCount(opp.commodities) > 0
    )
    .map((opp) => opp.id);
}

export function getCkInteractionLegalActionsPure(
  state: CatanState,
  playerId: string
): CatanAction[] {
  if (state.phase !== "CK_INTERACTION" || !state.pendingCkInteraction) {
    return [];
  }
  const pending = state.pendingCkInteraction;
  if (pending.actorId !== playerId) return [];

  switch (pending.kind) {
    case "displace_knight":
      return pending.candidateVertexIds.map((vertexId) => ({
        type: "RESOLVE_DISPLACED_KNIGHT",
        vertexId,
      }));

    case "deserter_choose_knight":
      return pending.candidateVertexIds.map((vertexId) => ({
        type: "SELECT_DESERTER_KNIGHT",
        vertexId,
      }));

    case "deserter_place_knight":
      return pending.candidateVertexIds.map((vertexId) => ({
        type: "PLACE_DESERTED_KNIGHT",
        vertexId,
      }));

    case "spy_choose_card": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      if (!target) return [];
      return target.progressCards.map((c) => ({
        type: "SELECT_SPY_CARD",
        stolenCardId: c.id,
      }));
    }

    case "master_merchant_choose_cards": {
      const target = state.players.find((p) => p.id === pending.targetPlayerId);
      if (!target) return [];
      return enumerateGoodBundleCombosPure(
        target.resources,
        target.commodities,
        pending.maxCards
      ).map((b) => ({
        type: "SELECT_MASTER_MERCHANT_CARDS",
        resources: b.resources,
        ...(b.commodities ? { commodities: b.commodities } : {}),
      }));
    }

    case "wedding_give_cards": {
      const actor = state.players.find((p) => p.id === playerId);
      if (!actor) return [];
      return enumerateGoodBundleCombosPure(
        actor.resources,
        actor.commodities,
        pending.requiredCount
      ).map((b) => ({
        type: "GIVE_WEDDING_CARDS",
        resources: b.resources,
        ...(b.commodities ? { commodities: b.commodities } : {}),
      }));
    }

    case "commercial_harbor_offer": {
      const actor = state.players.find((p) => p.id === playerId);
      if (!actor) return [{ type: "END_COMMERCIAL_HARBOR" }];
      const availRes = RESOURCES.filter((r) => actor.resources[r] > 0);
      const offerActs: CatanAction[] = pending.eligibleTargetIds.flatMap(
        (targetPlayerId) =>
          availRes.map((resource) => ({
            type: "OFFER_COMMERCIAL_HARBOR" as const,
            targetPlayerId,
            resource,
          }))
      );
      return [...offerActs, { type: "END_COMMERCIAL_HARBOR" }];
    }

    case "commercial_harbor_respond": {
      const actor = state.players.find((p) => p.id === playerId);
      if (!actor) return [];
      return COMMODITIES.filter((c) => actor.commodities[c] > 0).map(
        (commodity) => ({
          type: "RESPOND_COMMERCIAL_HARBOR",
          commodity,
        })
      );
    }
  }
}
