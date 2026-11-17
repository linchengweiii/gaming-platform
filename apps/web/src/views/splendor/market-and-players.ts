import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  type SplendorPlayerState,
  type SplendorState,
  getSplendorLegalActions,
  totalTokens,
} from "@gaming-platform/splendor";
import {
  GEM_STYLES,
  escapeSplendorHtml as escapeHtml,
  renderSplendorGemToken,
} from "./gems-and-cards.ts";

export function renderSplendorNoblesRowHtml(
  state: SplendorState,
  focusPlayer: SplendorPlayerState,
  canViewerActNow: boolean
): string {
  return `<div class="sp-nobles-row">
        <span class="t-label muted">Royal nobles (+3 prestige)</span>
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
                  <strong style="font-size: var(--t-label); font-weight: 500;">${escapeHtml(noble.name)}</strong>
                  <span class="ga-chip ga-chip--warn ga-num" style="height: 20px; padding: 0 6px;">+${noble.points}</span>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                  ${GEM_COLORS.filter((c) => (noble.requirements[c] ?? 0) > 0)
                    .map((c) => {
                      const req = noble.requirements[c] ?? 0;
                      const have = focusPlayer.bonuses[c];
                      const met = have >= req;
                      const st = GEM_STYLES[c];
                      return `<span class="ga-num" title="${st.label}: you have ${have}/${req} bonuses" style="
                        padding: 1px 6px;
                        border-radius: 4px;
                        background: ${st.bg};
                        border: 1.5px solid ${met ? "#4ade80" : st.border};
                        color: ${st.text};
                        font-size: 12px;
                        font-weight: 500;
                      ">${have}/${req}${st.short[0]}</span>`;
                    })
                    .join("")}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;" class="ga-num">
                  <span class="${myMissing === 0 ? "t-label" : "muted"}">${
                    myMissing === 0 ? "Ready!" : `You need ${myMissing}`
                  }</span>
                  ${
                    nearOpponent
                      ? `<span style="color:#fca5a5;">${escapeHtml(nearOpponent.name)}: ≤1 away</span>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("")}
      </div>`;
}

const DIFF_BADGE: Record<string, string> = {
  easy: "Easy",
  normal: "Normal",
  smart: "Smart",
  master: "Master",
};

export function renderSplendorPlayerCard(
  state: SplendorState,
  p: SplendorState["players"][number],
  isActing: boolean
): string {
  const seatBadge = p.isBot
    ? `Bot · ${DIFF_BADGE[p.botDifficulty ?? "smart"] ?? "Smart"}`
    : "Human";
  const reservedSummary =
    p.reservedCards.length === 0
      ? "No reserved cards"
      : p.reservedCards
          .map((c) => {
            if (c.redacted) return `Tier ${c.tier} (blind deck)`;
            const costStr = GEM_COLORS.filter((col) => c.cost[col] > 0)
              .map((col) => `${c.cost[col]}${GEM_STYLES[col].short[0]}`)
              .join(" ");
            return `Tier ${c.tier} +1 ${GEM_STYLES[c.bonus].short} (${c.points} VP · cost ${costStr})`;
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
        <span class="ga-chip ga-chip--warn ga-num">${p.points}/${state.config.targetPoints} VP</span>
      </div>

      <div style="display: flex; gap: 5px; flex-wrap: wrap; align-items: center;">
        ${ALL_TOKEN_COLORS.map((c) => {
          const st = GEM_STYLES[c];
          return `<span class="ga-num" title="${st.label} tokens" style="
            padding: 2px 7px;
            border-radius: 999px;
            background: ${st.bg};
            border: 1px solid ${st.border};
            color: ${st.text};
            font-size: 11px;
            font-weight: 500;
          ">${st.short[0]}${p.tokens[c]}</span>`;
        }).join("")}
        <span class="ga-chip ga-num" title="Tokens in hand">${totalTokens(p.tokens)}/10</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
          ${GEM_COLORS.map((c) => {
            const st = GEM_STYLES[c];
            return `<span class="ga-num" title="${st.label} permanent discount" style="
              padding: 2px 6px;
              border-radius: 5px;
              background: ${st.bg};
              border: 1px solid ${st.border};
              color: ${st.text};
              font-size: 11px;
              font-weight: 500;
            ">+${p.bonuses[c]}${st.short[0]}</span>`;
          }).join("")}
        </div>
        <span class="t-label muted ga-num" title="${escapeHtml(reservedSummary)}">Cards ${p.purchasedCards.length} · Hold ${p.reservedCards.length}/3 · Nobles ${p.nobles.length}</span>
      </div>
    </div>
  `;
}

export function renderSplendorActionDock(
  state: SplendorState,
  actingPlayer: SplendorState["players"][number] | null
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-prompt">
      <strong>Match complete.</strong> ${escapeHtml(winner?.name ?? "Player")} wins Splendor with ${
        winner?.points ?? 0
      } prestige points (${winner?.purchasedCards.length ?? 0} purchased cards).
    </div>`;
  }

  if (state.phase === "RETURN_TOKENS") {
    const excess = totalTokens(actingPlayer.tokens) - 10;
    return `<div class="sub-modal">
      <div class="action-prompt"><strong>Token limit (10) exceeded.</strong> ${escapeHtml(actingPlayer.name)}, click to return ${excess} more token${excess === 1 ? "" : "s"}:</div>
      <div class="action-buttons">
        ${ALL_TOKEN_COLORS.filter((c) => actingPlayer.tokens[c] > 0)
          .map(
            (c) =>
              `<button type="button" data-sp-return-one="${c}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderSplendorGemToken(c, actingPlayer.tokens[c], 22, "", 0, "in hand")}
                <span>Return 1 ${GEM_STYLES[c].label.toLowerCase()}</span>
              </button>`
          )
          .join("")}
      </div>
    </div>`;
  }

  if (state.phase === "SELECT_NOBLE") {
    return `<div class="action-buttons">
      <span class="action-prompt"><strong>${escapeHtml(actingPlayer.name)} qualifies for multiple nobles.</strong> Select one highlighted noble card above.</span>
    </div>`;
  }

  const canPassStalemate = getSplendorLegalActions(state, actingPlayer.id).some(
    (a) => a.type === "PASS_TURN"
  );
  if (canPassStalemate) {
    return `<div class="action-buttons" style="justify-content: space-between;">
      <span class="action-prompt">${
        state.finalRoundTriggered ? `<strong style="color:#fca5a5;">Final round!</strong> ` : ""
      }<strong>${escapeHtml(actingPlayer.name)}:</strong> No gems, holds, or purchases are currently available.</span>
      <button type="button" id="btn-sp-pass-turn" class="btn btn--primary btn--sm">Pass turn</button>
    </div>`;
  }

  return `<div class="action-buttons">
    <span class="action-prompt">${
      state.finalRoundTriggered ? `<strong style="color:#fca5a5;">Final round!</strong> ` : ""
    }<strong>${escapeHtml(actingPlayer.name)} to act:</strong> Select gem tokens from the bank (3 distinct or 2 matching), or buy or hold a development card.</span>
  </div>`;
}
