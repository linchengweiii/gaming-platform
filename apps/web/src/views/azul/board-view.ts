import type {
  AzulDraftSource,
  AzulState,
  AzulTileColor,
} from "@gaming-platform/azul";
import { renderAzulPalaceCardHtml } from "./player-board.ts";
import {
  renderAzulCenterPoolHtml,
  renderAzulFactoriesHtml,
} from "./tiles-and-factories.ts";

export function renderAzulBoardView(
  state: AzulState,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null,
  viewerPlayerId?: string | null,
  isViewerTurn = true
): string {
  const activePlayer = state.players[state.activePlayerIndex]!;
  const fallbackFocus =
    state.phase === "GAME_OVER" && state.winnerId
      ? state.players.find((p) => p.id === state.winnerId) ?? activePlayer
      : activePlayer;
  const focusPlayer =
    (viewerPlayerId
      ? state.players.find((p) => p.id === viewerPlayerId)
      : null) ?? fallbackFocus;
  const canViewerActNow =
    isViewerTurn &&
    focusPlayer.id === activePlayer.id &&
    state.phase === "FACTORY_OFFER";

  const draftedCount = selectedDraft
    ? (selectedDraft.source.kind === "factory"
        ? state.factories[selectedDraft.source.factoryIndex] ?? []
        : state.centerPool
      ).filter((c) => c === selectedDraft.color).length
    : 0;
  const takesFirstMarker = Boolean(
    selectedDraft &&
      selectedDraft.source.kind === "center" &&
      state.centerHasFirstPlayerMarker
  );

  const factoriesHtml = renderAzulFactoriesHtml(
    state,
    selectedDraft,
    isViewerTurn
  );
  const centerPoolHtml = renderAzulCenterPoolHtml(
    state,
    selectedDraft,
    isViewerTurn
  );
  const palaceCardHtml = renderAzulPalaceCardHtml(
    state,
    focusPlayer,
    selectedDraft,
    canViewerActNow,
    draftedCount,
    takesFirstMarker
  );

  return `
    <div class="az-board">
      <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: center;">
        ${factoriesHtml}
      </div>
      ${centerPoolHtml}
${palaceCardHtml}
    </div>
  `;
}
