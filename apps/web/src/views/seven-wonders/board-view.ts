import {
  type SevenWondersAction,
  type SevenWondersState,
  getLeftNeighborIndex,
  getPlayerShields,
  getPlayerTradeRates,
  getRightNeighborIndex,
} from "@gaming-platform/seven-wonders";
import { renderHandOrResolutionHtml } from "./hand-and-tableau.ts";
import {
  renderEmpireCardHtml,
  renderNeighborPanelHtml,
} from "./neighbors-and-wonder.ts";

export function renderSevenWondersBoardView(
  state: SevenWondersState,
  viewerPlayerId: string | null,
  selectedCardId: string | null,
  legalActions: readonly SevenWondersAction[],
  inspectedPlayerId?: string | null,
  hideHandForPassAndPlay = false
): string {
  const viewerIdx = (() => {
    if (viewerPlayerId) {
      const idx = state.players.findIndex((p) => p.id === viewerPlayerId);
      if (idx >= 0) return idx;
    }
    return 0;
  })();

  const focusIdx = (() => {
    if (inspectedPlayerId) {
      const idx = state.players.findIndex((p) => p.id === inspectedPlayerId);
      if (idx >= 0) return idx;
    }
    return viewerIdx;
  })();

  const viewerPlayer = state.players[viewerIdx]!;
  const player = state.players[focusIdx]!;
  const isInspectingOther = focusIdx !== viewerIdx;

  const leftNeighbor =
    state.players[getLeftNeighborIndex(focusIdx, state.players.length)]!;
  const rightNeighbor =
    state.players[getRightNeighborIndex(focusIdx, state.players.length)]!;
  const rates = getPlayerTradeRates(player);
  const myShields = getPlayerShields(player);

  const passLabel =
    state.phase === "SEVENTH_CARD_PLAY"
      ? "Bonus 7th card play — no hand pass"
      : state.passDirection === "clockwise"
        ? "Pass clockwise (East → You → West)"
        : "Pass counter-clockwise (West → You → East)";
  const ageRoman = state.age === 1 ? "I" : state.age === 2 ? "II" : "III";

  const handOrResolutionHtml = renderHandOrResolutionHtml(
    state,
    viewerPlayer,
    player,
    focusIdx,
    isInspectingOther,
    selectedCardId,
    legalActions,
    hideHandForPassAndPlay,
    passLabel
  );

  return `
    <div class="sw-board">
      <div class="sw-top-grid">
        ${renderNeighborPanelHtml(
          leftNeighbor,
          "left",
          myShields,
          rates.rawLeft,
          rates.manufacturedLeft
        )}

        <div class="sw-age-banner">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <span class="ga-chip ga-chip--accent ga-num">Age ${ageRoman}</span>
            <span class="ga-chip ga-num">Draft ${state.draftRound}/6</span>
          </div>
          <div class="t-label muted" style="text-align:center;">${passLabel}</div>
          <div class="t-label muted ga-num">Discards: ${
            state.hiddenDiscardCount ?? state.discardPile.length
          }</div>
        </div>

        ${renderNeighborPanelHtml(
          rightNeighbor,
          "right",
          myShields,
          rates.rawRight,
          rates.manufacturedRight
        )}
      </div>

      ${renderEmpireCardHtml(state, player, focusIdx, myShields)}

      ${handOrResolutionHtml}
    </div>
  `;
}
