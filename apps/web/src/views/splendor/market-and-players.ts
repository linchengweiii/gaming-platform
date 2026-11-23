import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  type SplendorPlayerState,
  type SplendorState,
  getSplendorLegalActions,
  totalTokens,
} from "@gaming-platform/splendor";
import {
  type SupportedLocale,
  getBotDifficultyMetaLocalized,
  getSplendorGemTextLocalized,
  getSplendorNobleNameLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeHtml } from "../../app/helpers/html-and-dropdown.ts";
import { GEM_STYLES, renderSplendorGemToken } from "./gems-and-cards.ts";

export function renderSplendorNoblesRowHtml(
  state: SplendorState,
  focusPlayer: SplendorPlayerState,
  canViewerActNow: boolean,
  locale: SupportedLocale = "en"
): string {
  return `<div class="sp-nobles-row">
        <span class="t-label muted">${t(locale, "sp.noblesHeading")}</span>
        ${state.nobles
          .map((noble) => {
            const isEligibleChoice =
              canViewerActNow &&
              state.phase === "SELECT_NOBLE" &&
              state.eligibleNobleIds.includes(noble.id);

            const myMissing = GEM_COLORS.reduce(
              (sum, c) =>
                sum +
                Math.max(
                  0,
                  (noble.requirements[c] ?? 0) - focusPlayer.bonuses[c]
                ),
              0
            );
            const nearOpponent = state.players
              .filter((opp) => opp.id !== focusPlayer.id)
              .find((opp) => {
                const oppMiss = GEM_COLORS.reduce(
                  (sum, c) =>
                    sum +
                    Math.max(0, (noble.requirements[c] ?? 0) - opp.bonuses[c]),
                  0
                );
                return oppMiss <= 1;
              });

            return `
              <div ${
                isEligibleChoice
                  ? `data-sp-noble="${noble.id}" role="button" tabindex="0"`
                  : ""
              } class="sp-noble-card ${
                isEligibleChoice ? "clickable-target pulse-highlight" : ""
              }">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <strong style="font-size: var(--t-label); font-weight: 500;">${escapeHtml(getSplendorNobleNameLocalized(noble.id, noble.name, locale))}</strong>
                  <span class="ga-chip ga-chip--warn ga-num" style="height: 20px; padding: 0 6px;">+${noble.points}</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                  ${GEM_COLORS.filter((c) => (noble.requirements[c] ?? 0) > 0)
                    .map((c) => {
                      const req = noble.requirements[c] ?? 0;
                      const have = focusPlayer.bonuses[c];
                      const met = have >= req;
                      const st = GEM_STYLES[c];
                      const gText = getSplendorGemTextLocalized(c, locale);
                      return `<span class="ga-num" title="${t(locale, "sp.nobleReqTitle", { label: gText.label, have, req })}" style="
                        padding: 1px 6px;
                        border-radius: 4px;
                        background: ${st.bg};
                        border: 1.5px solid ${met ? "#4ade80" : st.border};
                        color: ${st.text};
                        font-size: 12px;
                        font-weight: 500;
                      ">${have}/${req}${gText.short[0]}</span>`;
                    })
                    .join("")}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;" class="ga-num">
                  <span class="${myMissing === 0 ? "t-label" : "muted"}">${
                    myMissing === 0
                      ? t(locale, "sp.nobleReady")
                      : t(locale, "sp.nobleNeed", { count: myMissing })
                  }</span>
                  ${
                    nearOpponent
                      ? `<span style="color:#fca5a5;">${t(locale, "sp.nobleNearOpp", { name: escapeHtml(nearOpponent.name) })}</span>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("")}
      </div>`;
}

export function renderSplendorPlayerCard(
  state: SplendorState,
  p: SplendorState["players"][number],
  isActing: boolean,
  locale: SupportedLocale = "en"
): string {
  const seatBadge = p.isBot
    ? `${t(locale, "common.bot")} · ${getBotDifficultyMetaLocalized(p.botDifficulty ?? "smart", locale).badge}`
    : t(locale, "common.human");
  const reservedSummary =
    p.reservedCards.length === 0
      ? t(locale, "sp.noReservedCards")
      : p.reservedCards
          .map((c) => {
            if (c.redacted) return t(locale, "sp.blindDeck", { tier: c.tier });
            const costStr = GEM_COLORS.filter((col) => c.cost[col] > 0)
              .map(
                (col) =>
                  `${c.cost[col]}${getSplendorGemTextLocalized(col, locale).short[0]}`
              )
              .join(" ");
            return t(locale, "sp.reservedCardSummary", {
              tier: c.tier,
              short: getSplendorGemTextLocalized(c.bonus, locale).short,
              pts: c.points,
              cost: costStr,
            });
          })
          .join(" · ");

  return `
    <div class="player-card ${isActing ? "active-turn" : ""}">
      <div class="player-header">
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
          <span class="player-dot" style="background: ${p.color}"></span>
          <strong class="player-card__name">${escapeHtml(p.name)}</strong>
          <span class="ga-chip">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.points}/${state.config.targetPoints} ${t(locale, "common.vpUnit")}</span>
      </div>

      <div style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
        ${ALL_TOKEN_COLORS.map((c) => {
          const st = GEM_STYLES[c];
          const gText = getSplendorGemTextLocalized(c, locale);
          return `<span class="ga-num" title="${t(locale, "sp.tokensTooltip", { label: gText.label })}" style="
            padding: 2px 7px;
            border-radius: 999px;
            background: ${st.bg};
            border: 1px solid ${st.border};
            color: ${st.text};
            font-size: 11px;
            font-weight: 500;
          ">${gText.short[0]}${p.tokens[c]}</span>`;
        }).join("")}
        <span class="ga-chip ga-num" title="${t(locale, "sp.tokensInHandTitle")}">${totalTokens(p.tokens)}/10</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          ${GEM_COLORS.map((c) => {
            const st = GEM_STYLES[c];
            const gText = getSplendorGemTextLocalized(c, locale);
            return `<span class="ga-num" title="${t(locale, "sp.permDiscountTooltip", { label: gText.label })}" style="
              padding: 2px 6px;
              border-radius: 5px;
              background: ${st.bg};
              border: 1px solid ${st.border};
              color: ${st.text};
              font-size: 11px;
              font-weight: 500;
            ">+${p.bonuses[c]}${gText.short[0]}</span>`;
          }).join("")}
        </div>
        <span class="t-label muted ga-num" title="${escapeHtml(reservedSummary)}">${t(locale, "sp.playerStats", { cards: p.purchasedCards.length, hold: p.reservedCards.length, nobles: p.nobles.length })}</span>
      </div>
    </div>
  `;
}

export function renderSplendorActionDock(
  state: SplendorState,
  actingPlayer: SplendorState["players"][number] | null,
  locale: SupportedLocale = "en"
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-prompt">
      ${t(locale, "sp.winsSplendor", {
        complete: `<strong>${t(locale, "inGame.matchComplete")}.</strong>`,
        winner: escapeHtml(winner?.name ?? t(locale, "common.player")),
        pts: winner?.points ?? 0,
        cards: winner?.purchasedCards.length ?? 0,
      })}
    </div>`;
  }

  if (state.phase === "RETURN_TOKENS") {
    const excess = totalTokens(actingPlayer.tokens) - 10;
    return `<div class="sub-modal">
      <div class="action-prompt">${t(
        locale,
        excess === 1 ? "sp.tokenLimitPromptOne" : "sp.tokenLimitPromptMany",
        {
          prefix: `<strong>${t(locale, "sp.tokenLimitPrefix")}</strong>`,
          name: escapeHtml(actingPlayer.name),
          excess,
        }
      )}</div>
      <div class="action-buttons">
        ${ALL_TOKEN_COLORS.filter((c) => actingPlayer.tokens[c] > 0)
          .map((c) => {
            const gLabel = getSplendorGemTextLocalized(c, locale).label;
            return `<button type="button" data-sp-return-one="${c}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderSplendorGemToken(c, actingPlayer.tokens[c], 22, "", 0, "in hand", locale)}
                <span>${t(locale, "sp.returnOneGem", { label: locale === "en" ? gLabel.toLowerCase() : gLabel })}</span>
              </button>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  if (state.phase === "SELECT_NOBLE") {
    return `<div class="action-buttons">
      <span class="action-prompt">${t(locale, "sp.qualifiesNobles", {
        prefix: `<strong>${t(locale, "sp.qualifiesNoblesPrefix", { name: escapeHtml(actingPlayer.name) })}</strong>`,
      })}</span>
    </div>`;
  }

  const finalRoundPrefix = state.finalRoundTriggered
    ? `<strong style="color:#fca5a5;">${t(locale, "sp.finalRoundPrefix")}</strong> `
    : "";
  const canPassStalemate = getSplendorLegalActions(state, actingPlayer.id).some(
    (a) => a.type === "PASS_TURN"
  );
  if (canPassStalemate) {
    return `<div class="action-buttons" style="justify-content: space-between;">
      <span class="action-prompt">${finalRoundPrefix}${t(locale, "sp.noActionsPrompt", {
        name: `<strong>${escapeHtml(actingPlayer.name)}:</strong>`,
      })}</span>
      <button type="button" id="btn-sp-pass-turn" class="btn btn--primary btn--sm">${t(locale, "sp.passTurn")}</button>
    </div>`;
  }

  return `<div class="action-buttons">
    <span class="action-prompt">${finalRoundPrefix}${t(locale, "sp.mainPrompt", {
      name: `<strong>${t(locale, "sp.toActPrefix", { name: escapeHtml(actingPlayer.name) })}</strong>`,
    })}</span>
  </div>`;
}
