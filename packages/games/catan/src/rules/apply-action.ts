import type { GameEvent } from "@gaming-platform/core";
import { applyCkInteractionActionPure } from "../cities-and-knights/interactions.ts";
import type { CatanAction } from "../types/actions.ts";
import type { CatanState } from "../types/state.ts";
import {
  applyBuildRoadPure,
  applyBuildShipPure,
  applyMoveShipPure,
} from "./building-routes.ts";
import {
  applyBuildCityPure,
  applyBuildCityWallPure,
  applyBuildSettlementPure,
} from "./building.ts";
import {
  applyPlayProgressCardPure,
  applyUpgradeCityImprovementPure,
} from "./ck-improvements-progress.ts";
import {
  applyActivateKnightPure,
  applyBuildKnightPure,
  applyChaseRobberWithKnightPure,
  applyMoveKnightPure,
  applyPromoteKnightPure,
} from "./ck-knights-actions.ts";
import {
  applyBuyDevCardPure,
  applyPlayKnightPure,
  applyPlayMonopolyPure,
  applyPlayRoadBuildingPure,
  applyPlayYearOfPlentyPure,
} from "./dev-cards.ts";
import {
  applyDiscardProgressCardPure,
  applyRollDicePure,
  applySelectGoldResourcePure,
  applySelectPillagedCityPure,
  applySelectProgressDeckPure,
} from "./dice-and-events.ts";
import { applyDiscardCardsPure } from "./discard.ts";
import { applyMaritimeTradePure } from "./maritime-trading.ts";
import {
  applyMovePiratePure,
  applyMoveRobberPure,
  applyStealFromPlayerPure,
} from "./robber-pirate.ts";
import {
  applyPlaceSetupEdgePure,
  applyPlaceSetupSettlementPure,
} from "./setup-draft.ts";
import { applyEndSpecialBuildPure } from "./special-build.ts";
import {
  applyAcceptDomesticTradePure,
  applyCancelDomesticTradePure,
  applyConfirmDomesticTradePure,
  applyDeclineDomesticTradePure,
  applyOfferDomesticTradePure,
} from "./trading.ts";
import { applyEndTurnPure } from "./turn-flow.ts";

/**
 * Purely applies `action` by `playerId` to `currentState`, returning a new state and emitted events.
 */
export function applyCatanAction(
  currentState: CatanState,
  playerId: string,
  action: CatanAction
): { state: CatanState; events: GameEvent[] } {
  const player = currentState.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error(`Unknown player "${playerId}"`);
  }

  const activePlayer = currentState.players[currentState.activePlayerIndex]!;

  switch (action.type) {
    case "PLACE_SETUP_SETTLEMENT":
      return applyPlaceSetupSettlementPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "PLACE_SETUP_EDGE":
      return applyPlaceSetupEdgePure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "ROLL_DICE":
      return applyRollDicePure(currentState, player, activePlayer, playerId);
    case "SELECT_PILLAGED_CITY":
      return applySelectPillagedCityPure(currentState, player, playerId, action);
    case "SELECT_PROGRESS_DECK":
      return applySelectProgressDeckPure(currentState, playerId, action);
    case "DISCARD_PROGRESS_CARD":
      return applyDiscardProgressCardPure(
        currentState,
        player,
        playerId,
        action
      );
    case "SELECT_GOLD_RESOURCE":
      return applySelectGoldResourcePure(currentState, player, playerId, action);
    case "DISCARD_CARDS":
      return applyDiscardCardsPure(currentState, player, playerId, action);
    case "MOVE_ROBBER":
      return applyMoveRobberPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "MOVE_PIRATE":
      return applyMovePiratePure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "STEAL_FROM_PLAYER":
      return applyStealFromPlayerPure(
        currentState,
        activePlayer,
        playerId,
        action
      );
    case "BUILD_ROAD":
      return applyBuildRoadPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "BUILD_SHIP":
      return applyBuildShipPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "MOVE_SHIP":
      return applyMoveShipPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "BUILD_SETTLEMENT":
      return applyBuildSettlementPure(currentState, player, playerId, action);
    case "BUILD_CITY":
      return applyBuildCityPure(currentState, player, playerId, action);
    case "BUILD_CITY_WALL":
      return applyBuildCityWallPure(currentState, player, playerId, action);
    case "UPGRADE_CITY_IMPROVEMENT":
      return applyUpgradeCityImprovementPure(
        currentState,
        player,
        playerId,
        action
      );
    case "BUILD_KNIGHT":
      return applyBuildKnightPure(currentState, player, playerId, action);
    case "PROMOTE_KNIGHT":
      return applyPromoteKnightPure(currentState, player, playerId, action);
    case "ACTIVATE_KNIGHT":
      return applyActivateKnightPure(currentState, player, playerId, action);
    case "MOVE_KNIGHT":
      return applyMoveKnightPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "CHASE_ROBBER_WITH_KNIGHT":
      return applyChaseRobberWithKnightPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "PLAY_PROGRESS_CARD":
      return applyPlayProgressCardPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "RESOLVE_DISPLACED_KNIGHT":
    case "SELECT_DESERTER_KNIGHT":
    case "PLACE_DESERTED_KNIGHT":
    case "SELECT_SPY_CARD":
    case "SELECT_MASTER_MERCHANT_CARDS":
    case "GIVE_WEDDING_CARDS":
    case "OFFER_COMMERCIAL_HARBOR":
    case "END_COMMERCIAL_HARBOR":
    case "RESPOND_COMMERCIAL_HARBOR":
      return applyCkInteractionActionPure(currentState, playerId, action);
    case "BUY_DEV_CARD":
      return applyBuyDevCardPure(currentState, player, playerId);
    case "PLAY_KNIGHT":
      return applyPlayKnightPure(currentState, player, activePlayer, playerId);
    case "PLAY_ROAD_BUILDING":
      return applyPlayRoadBuildingPure(
        currentState,
        player,
        activePlayer,
        playerId
      );
    case "PLAY_YEAR_OF_PLENTY":
      return applyPlayYearOfPlentyPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "PLAY_MONOPOLY":
      return applyPlayMonopolyPure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "MARITIME_TRADE":
      return applyMaritimeTradePure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "OFFER_DOMESTIC_TRADE":
      return applyOfferDomesticTradePure(
        currentState,
        player,
        activePlayer,
        playerId,
        action
      );
    case "ACCEPT_DOMESTIC_TRADE":
      return applyAcceptDomesticTradePure(
        currentState,
        player,
        playerId,
        action
      );
    case "DECLINE_DOMESTIC_TRADE":
      return applyDeclineDomesticTradePure(
        currentState,
        player,
        playerId,
        action
      );
    case "CONFIRM_DOMESTIC_TRADE":
      return applyConfirmDomesticTradePure(
        currentState,
        player,
        playerId,
        action
      );
    case "CANCEL_DOMESTIC_TRADE":
      return applyCancelDomesticTradePure(currentState, player, playerId);
    case "END_TURN":
      return applyEndTurnPure(currentState, player, activePlayer, playerId);
    case "END_SPECIAL_BUILD":
      return applyEndSpecialBuildPure(currentState, playerId);
    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }
}
