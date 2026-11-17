import {
  GEM_COLORS,
  type GemColor,
  type SplendorState,
  totalTokens,
} from "@gaming-platform/splendor";
import {
  escapeSplendorHtml as escapeHtml,
  renderSplendorCardItem,
  renderSplendorGemToken,
} from "./gems-and-cards.ts";
import { renderSplendorNoblesRowHtml } from "./market-and-players.ts";

export function renderSplendorBoardView(
  state: SplendorState,
  draftGems: Partial<Record<GemColor, number>>,
  viewerPlayerId?: string | null,
  isViewerTurn = true
): string {
  const activePlayer = state.players[state.activePlayerIndex]!;
  const focusPlayer =
    (viewerPlayerId
      ? state.players.find((p) => p.id === viewerPlayerId)
      : null) ?? activePlayer;
  const canViewerActNow =
    isViewerTurn && focusPlayer.id === activePlayer.id;

  const draftEntries = GEM_COLORS.map((c) => [c, draftGems[c] ?? 0] as const).filter(
    ([, amt]) => amt > 0
  );
  const availableBankColors = GEM_COLORS.filter((c) => state.bank[c] > 0).length;
  const isTwoSameLegal =
    draftEntries.length === 1 &&
    draftEntries[0]![1] === 2 &&
    state.bank[draftEntries[0]![0]] >= 4;
  const isDistinctLegal =
    draftEntries.length > 0 &&
    draftEntries.length <= 3 &&
    draftEntries.every(([c, amt]) => amt === 1 && state.bank[c] >= 1) &&
    (draftEntries.length === Math.min(3, availableBankColors) ||
      totalTokens(focusPlayer.tokens) + draftEntries.length >= 10);
  const canConfirmGemDraft =
    canViewerActNow &&
    state.phase === "MAIN_ACTION" &&
    (isTwoSameLegal || isDistinctLegal);

  return `
    <div class="sp-board">
      ${
        state.finalRoundTriggered && state.phase !== "GAME_OVER"
          ? `<div class="ga-chip ga-chip--danger ga-num" style="align-self:center;padding:3px 12px;">
              Final round triggered — completing equal turns (tiebreaker: fewest purchased cards)
            </div>`
          : ""
      }

      ${renderSplendorNoblesRowHtml(state, focusPlayer, canViewerActNow)}

      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; align-items: center;">
        ${([3, 2, 1] as const)
          .map(
            (tier) => `
          <div class="sp-tier-row">
            <div class="sp-deck-card">
              <div class="t-label muted">Tier ${tier}</div>
              <div class="ga-num" style="font-family: var(--font-display); font-size: 22px; font-weight: 500;">${
                state.decks[tier].length
              }</div>
              <button type="button" data-sp-reserve-deck="${tier}" class="btn btn--secondary btn--sm" style="width: 100%; padding: 0 6px;" ${
                !canViewerActNow ||
                state.decks[tier].length === 0 ||
                focusPlayer.reservedCards.length >= 3 ||
                state.phase !== "MAIN_ACTION"
                  ? "disabled"
                  : ""
              }>Draw hold</button>
            </div>

            ${state.market[tier]
              .map((card) =>
                renderSplendorCardItem(
                  state,
                  focusPlayer,
                  canViewerActNow,
                  card,
                  true
                )
              )
              .join("")}
          </div>
        `
          )
          .join("")}
      </div>

      <div class="sp-bank-bar">
        <span class="t-label muted">Gem bank</span>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          ${GEM_COLORS.map((c) =>
            renderSplendorGemToken(
              c,
              state.bank[c],
              44,
              canViewerActNow ? `data-sp-gem="${c}"` : "",
              draftGems[c] ?? 0
            )
          ).join("")}
          ${renderSplendorGemToken("gold", state.bank.gold, 44)}
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span class="t-small muted ga-num">
            Draft: ${
              draftEntries.length === 0
                ? "none"
                : draftEntries.map(([c, n]) => `${n} ${c}`).join(", ")
            }${
              draftEntries.length > 0 &&
              totalTokens(focusPlayer.tokens) +
                draftEntries.reduce((s, [, n]) => s + n, 0) >
                10
                ? ` (return ${
                    totalTokens(focusPlayer.tokens) +
                    draftEntries.reduce((s, [, n]) => s + n, 0) -
                    10
                  } after)`
                : ""
            }
          </span>
          <button type="button" id="btn-sp-clear-gems" class="btn btn--secondary btn--sm" ${
            draftEntries.length === 0 ? "disabled" : ""
          }>Clear</button>
          <button type="button" id="btn-sp-take-gems" class="btn btn--primary btn--sm" ${
            !canConfirmGemDraft ? "disabled" : ""
          }>Take gems</button>
        </div>
      </div>

      ${
        focusPlayer.reservedCards.length > 0
          ? `<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center;">
              <span class="t-label muted">${escapeHtml(
                focusPlayer.name
              )} reserved (${focusPlayer.reservedCards.length}/3)</span>
              ${focusPlayer.reservedCards
                .map((card) =>
                  card.redacted
                    ? `<div class="sp-deck-card" style="justify-content:center;"><span class="t-label muted">Tier ${card.tier} secret hold</span></div>`
                    : renderSplendorCardItem(
                        state,
                        focusPlayer,
                        canViewerActNow,
                        card,
                        false
                      )
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;
}
