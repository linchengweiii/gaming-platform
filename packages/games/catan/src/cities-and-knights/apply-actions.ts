import type { EdgeId, HexId } from "@gaming-platform/core";
import type { ProgressCardPlayParams } from "../types/actions.ts";
import type { ProgressCardInstance } from "../types/domain.ts";
import type { CatanState } from "../types/state.ts";
import type { StateEventsPair } from "./helpers.ts";
import { applyPoliticsProgressCardPure } from "./progress-politics.ts";
import { applyScienceProgressCardPure } from "./progress-science.ts";
import { applyTradeProgressCardPure } from "./progress-trade.ts";

/**
 * Purely executes any non-Alchemist `MAIN_PHASE` Progress Card.
 */
export function applyMainPhaseProgressCardPure(
  stateAfterConsume: CatanState,
  playerId: string,
  card: ProgressCardInstance,
  params: ProgressCardPlayParams | undefined,
  computeVpFn: (s: CatanState, pid: string, visibleOnly?: boolean) => number,
  getLegalRoadEdgesFn: (s: CatanState, pid: string) => EdgeId[],
  getLegalRobberHexesFn: (s: CatanState, pid: string) => HexId[]
): StateEventsPair {
  switch (card.type) {
    case "mining":
    case "irrigation":
    case "crane":
    case "medicine":
    case "engineer":
    case "road_building":
    case "smith":
    case "inventor":
      return applyScienceProgressCardPure(
        stateAfterConsume,
        playerId,
        card,
        params
      );

    case "warlord":
    case "bishop":
    case "intrigue":
    case "deserter":
    case "diplomat":
    case "saboteur":
    case "spy":
    case "wedding":
      return applyPoliticsProgressCardPure(
        stateAfterConsume,
        playerId,
        card,
        params,
        computeVpFn,
        getLegalRoadEdgesFn,
        getLegalRobberHexesFn
      );

    case "merchant":
    case "resource_monopoly":
    case "trade_monopoly":
    case "merchant_fleet":
    case "master_merchant":
    case "commercial_harbor":
      return applyTradeProgressCardPure(
        stateAfterConsume,
        playerId,
        card,
        params,
        computeVpFn
      );

    default:
      throw new Error(`Unsupported Progress Card in MAIN_PHASE: ${card.type}`);
  }
}
