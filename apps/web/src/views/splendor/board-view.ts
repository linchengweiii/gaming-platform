import {
  GEM_COLORS,
  type GemColor,
  type SplendorState,
  totalTokens,
} from "@gaming-platform/splendor";
import {
  type SupportedLocale,
  getSplendorGemTextLocalized,
  t,
} from "../../i18n/index.ts";
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
  isViewerTurn = true,
  locale: SupportedLocale = "en"
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

  const draftItemsText =
    draftEntries.length === 0
      ? t(locale, "sp.draftNone")
      : draftEntries
          .map(
            ([c, n]) =>
              `${n} ${locale === "en" ? c : getSplendorGemTextLocalized(c, locale).label}`
          )
          .join(", ");

  return `
    <div class="sp-board">
      ${
        state.finalRoundTriggered && state.phase !== "GAME_OVER"
          ? `<div class="ga-chip ga-chip--danger ga-num" style="align-self:center;padding:3px 12px;">
              ${t(locale, "sp.finalRoundBanner")}
            </div>`
          : ""
      }

      ${renderSplendorNoblesRowHtml(state, focusPlayer, canViewerActNow, locale)}

      <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; align-items: center;">
        ${([3, 2, 1] as const)
          .map(
            (tier) => `
          <div class="sp-tier-row">
            <div class="sp-deck-card">
              <div class="t-label muted">${t(locale, "sp.tierN", { tier })}</div>
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
              }>${t(locale, "sp.drawHold")}</button>
            </div>

            ${state.market[tier]
              .map((card) =>
                renderSplendorCardItem(
                  state,
                  focusPlayer,
                  canViewerActNow,
                  card,
                  true,
                  locale
                )
              )
              .join("")}
          </div>
        `
          )
          .join("")}
      </div>

      <div class="sp-bank-bar">
        <span class="t-label muted">${t(locale, "sp.gemBank")}</span>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          ${GEM_COLORS.map((c) =>
            renderSplendorGemToken(
              c,
              state.bank[c],
              44,
              canViewerActNow ? `data-sp-gem="${c}"` : "",
              draftGems[c] ?? 0,
              "in bank",
              locale
            )
          ).join("")}
          ${renderSplendorGemToken("gold", state.bank.gold, 44, "", 0, "in bank", locale)}
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span class="t-small muted ga-num">
            ${t(locale, "sp.draftPrefix", { items: draftItemsText })}${
              draftEntries.length > 0 &&
              totalTokens(focusPlayer.tokens) +
                draftEntries.reduce((s, [, n]) => s + n, 0) >
                10
                ? t(locale, "sp.returnAfter", {
                    count:
                      totalTokens(focusPlayer.tokens) +
                      draftEntries.reduce((s, [, n]) => s + n, 0) -
                      10,
                  })
                : ""
            }
          </span>
          <button type="button" id="btn-sp-clear-gems" class="btn btn--secondary btn--sm" ${
            draftEntries.length === 0 ? "disabled" : ""
          }>${t(locale, "common.clear")}</button>
          <button type="button" id="btn-sp-take-gems" class="btn btn--primary btn--sm" ${
            !canConfirmGemDraft ? "disabled" : ""
          }>${t(locale, "sp.takeGems")}</button>
        </div>
      </div>

      ${
        focusPlayer.reservedCards.length > 0
          ? `<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center;">
              <span class="t-label muted">${t(locale, "sp.reservedHeading", {
                name: escapeHtml(focusPlayer.name),
                count: focusPlayer.reservedCards.length,
              })}</span>
              ${focusPlayer.reservedCards
                .map((card) =>
                  card.redacted
                    ? `<div class="sp-deck-card" style="justify-content:center;"><span class="t-label muted">${t(locale, "sp.secretHold", { tier: card.tier })}</span></div>`
                    : renderSplendorCardItem(
                        state,
                        focusPlayer,
                        canViewerActNow,
                        card,
                        false,
                        locale
                      )
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `;
}
