import type { GameEngine, GameEvent } from "@gaming-platform/core";
import { chooseCatanBotAction } from "./bot/choose.ts";
import { applyCatanAction } from "./rules/apply-action.ts";
import { checkCatanInvariants } from "./rules/invariants.ts";
import { getCatanLegalActions } from "./rules/legal-actions.ts";
import { getCatanPlayerViewPure } from "./rules/redaction.ts";
import { initCatanGame } from "./rules/setup-init.ts";
import { isCatanActionUndoable } from "./rules/turn-flow.ts";
import type { CatanAction } from "./types/actions.ts";
import type { CatanConfig } from "./types/domain.ts";
import type { CatanState } from "./types/state.ts";

export * from "./config/bot-config.ts";
export * from "./config/cities-knights-config.ts";
export * from "./config/costs-and-limits.ts";
export * from "./config/scenarios-config.ts";
export * from "./types/domain.ts";
export * from "./types/state.ts";
export * from "./types/actions.ts";

export { generateCatanBoardPure } from "./board/generator.ts";
export {
  isExpanded56Scenario,
  toBaseMapScenarioId,
  toExpanded56ScenarioId,
  toStandard34ScenarioId,
} from "./board/helpers.ts";

export { resolveEventDieRollPure } from "./cities-and-knights/barbarians.ts";
export {
  emptyCommodities,
  getBankGoodCount,
  getPlayerGoodCount,
  hasCommodities,
  isCommodityType,
  totalCommodityCount,
} from "./cities-and-knights/helpers.ts";
export {
  canPlayerUpgradeDiscipline,
  getEffectiveCityCost,
  getPlayerGoodTradeRatios,
  getPlayerVulnerableCities,
} from "./cities-and-knights/improvements.ts";
export {
  getBarbarianStrength,
  getDiplomatRemovableRoadEdges,
  getLegalActivateKnightVertices,
  getLegalBuildKnightVertices,
  getLegalChaseRobberActions,
  getLegalMoveKnightActions,
  getLegalPromoteKnightVertices,
  getPlayerActiveKnightStrength,
  getTotalActiveKnightStrength,
} from "./cities-and-knights/knights.ts";

export {
  computePlayerVictoryPoints,
  recalculateAwardsPure,
} from "./rules/awards-and-vp.ts";
export {
  emptyResources,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
  getPlayerTradeRatios,
  hasResources,
  totalResourceCount,
} from "./rules/helpers.ts";
export {
  getLegalMoveShipActions,
  getLegalRoadEdges,
  getLegalSettlementVertices,
  getLegalShipEdges,
} from "./rules/network.ts";
export { getCatanPlayerViewPure } from "./rules/redaction.ts";
export {
  getLegalPirateHexes,
  getLegalRobberHexes,
} from "./rules/robber-pirate.ts";
export { resolveDefaultConfig } from "./rules/setup-init.ts";
export { getNextActingPlayerId } from "./rules/turn-flow.ts";

/**
 * Catan implementation of the platform's pure `GameEngine` state-machine contract.
 */
export const CatanEngine: GameEngine<
  CatanState,
  CatanConfig,
  CatanAction,
  GameEvent,
  CatanState
> = {
  metadata: {
    id: "catan",
    name: "Settlers of Catan",
    description:
      "Trade, build, and settle the island of Catan! Includes Base Game, 5–6 Player Extension, Cities & Knights Expansion, Seafarers Expansion, Harbormaster, and City Walls.",
    minPlayers: 2,
    maxPlayers: 6,
    supportsBots: true,
  },
  initGame: initCatanGame,
  getLegalActions: getCatanLegalActions,
  applyAction: applyCatanAction,
  getPlayerView: getCatanPlayerViewPure,
  getWinner: (state) => state.winnerId,
  chooseBotAction: (state, playerId) =>
    chooseCatanBotAction(getCatanPlayerViewPure(state, playerId), playerId),
  checkInvariants: checkCatanInvariants,
  isActionUndoable: isCatanActionUndoable,
};
