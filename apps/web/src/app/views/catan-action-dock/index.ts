import type { CatanAction, CatanState } from "@gaming-platform/catan";
import type { AppModel, ClientRoom } from "../../types.ts";
import { renderCatanSetupAndPhaseDockPure } from "./discard-and-steal-modals.ts";
import { renderCatanMainDockButtonsPure } from "./dock-buttons.ts";
import {
  renderDevCardSubModalPure,
  renderDomesticTradeSubModalPure,
} from "./domestic-and-dev-modals.ts";
import {
  renderCityUpgradesSubModalPure,
  renderCkPhaseDockPure,
  renderProgressCardSubModalPure,
} from "./progress-and-ck-modals.ts";
import { renderMaritimeTradeSubModalPure } from "./trade-modals.ts";

export function renderCatanActionDockPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[],
  canCancelMyTrade = false
): string {
  if (actingPlayer) {
    const ckPhaseHtml = renderCkPhaseDockPure(model, state, actingPlayer);
    if (ckPhaseHtml !== null) {
      return ckPhaseHtml;
    }
  }

  const setupOrPhaseHtml = renderCatanSetupAndPhaseDockPure(
    model,
    room,
    state,
    actingPlayer,
    canCancelMyTrade
  );
  if (setupOrPhaseHtml !== null || !actingPlayer) {
    return setupOrPhaseHtml ?? "";
  }

  const subModalHtml = ((): string => {
    if (model.buildMode === "maritime_trade") {
      return renderMaritimeTradeSubModalPure(model, state, actingPlayer);
    }
    if (model.buildMode === "domestic_trade") {
      return renderDomesticTradeSubModalPure(model, state, actingPlayer);
    }
    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "city_upgrades"
    ) {
      return renderCityUpgradesSubModalPure(model, state, actingPlayer);
    }
    if (
      state.config.enableCitiesAndKnights &&
      model.buildMode === "progress_card" &&
      model.selectedProgressCardId
    ) {
      return renderProgressCardSubModalPure(
        model,
        state,
        actingPlayer,
        legalActions
      );
    }
    if (model.buildMode === "year_of_plenty" || model.buildMode === "monopoly") {
      return renderDevCardSubModalPure(model, state, actingPlayer);
    }
    return "";
  })();

  return renderCatanMainDockButtonsPure(
    model,
    state,
    actingPlayer,
    legalActions,
    subModalHtml
  );
}
