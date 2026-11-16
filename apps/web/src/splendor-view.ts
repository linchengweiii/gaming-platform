import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  type GemColor,
  type SplendorCard,
  type SplendorPlayerState,
  type SplendorState,
  type TokenColor,
  computeCardPurchasePayment,
  getSplendorLegalActions,
  totalTokens,
} from "@gaming-platform/splendor";

export const GEM_STYLES: Record<
  TokenColor,
  { bg: string; border: string; text: string; label: string; short: string }
> = {
  emerald: {
    bg: "radial-gradient(circle at 32% 32%, #4ade80, #15803d 65%, #052e16)",
    border: "#86efac",
    text: "#ffffff",
    label: "Emerald",
    short: "Eme",
  },
  diamond: {
    bg: "radial-gradient(circle at 32% 32%, #ffffff, #cbd5e1 65%, #64748b)",
    border: "#f8fafc",
    text: "#18191b",
    label: "Diamond",
    short: "Dia",
  },
  sapphire: {
    bg: "radial-gradient(circle at 32% 32%, #60a5fa, #1d4ed8 65%, #172554)",
    border: "#93c5fd",
    text: "#ffffff",
    label: "Sapphire",
    short: "Sap",
  },
  onyx: {
    bg: "radial-gradient(circle at 32% 32%, #64748b, #1e293b 65%, #090b0d)",
    border: "#94a3b8",
    text: "#f8fafc",
    label: "Onyx",
    short: "Ony",
  },
  ruby: {
    bg: "radial-gradient(circle at 32% 32%, #f87171, #dc2626 65%, #450a0a)",
    border: "#fca5a5",
    text: "#ffffff",
    label: "Ruby",
    short: "Rub",
  },
  gold: {
    bg: "radial-gradient(circle at 32% 32%, #fef08a, #eab308 65%, #713f12)",
    border: "#fde047",
    text: "#18191b",
    label: "Gold joker",
    short: "Gld",
  },
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSplendorGemToken(
  color: TokenColor,
  count: number,
  size = 44,
  dataAttr = "",
  selectedCount = 0,
  locationHint = "in bank"
): string {
  const st = GEM_STYLES[color];
  const isPicked = selectedCount > 0;
  const a11yAttr = dataAttr ? `role="button" tabindex="0"` : "";
  return `
    <div ${dataAttr} ${a11yAttr} class="gem-chip ga-num ${dataAttr ? "clickable-target" : ""} ${
      isPicked ? "is-selected" : ""
    }" style="
      position: relative;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${st.bg};
      border: ${isPicked ? "2.5px solid #ff4a1f" : `2px solid ${st.border}`};
      color: ${st.text};
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      font-size: ${Math.max(13, Math.round(size * 0.34))}px;
      box-shadow: ${
        isPicked
          ? "0 0 0 3px rgba(255, 74, 31, 0.35), 0 4px 10px rgba(0,0,0,0.45)"
          : "0 4px 10px rgba(0,0,0,0.38), inset 0 1.5px 3px rgba(255,255,255,0.3)"
      };
      opacity: ${count <= 0 && !isPicked ? "0.32" : "1"};
      user-select: none;
    " title="${st.label} (${count} ${locationHint}${isPicked ? `, +${selectedCount} selected` : ""})">
      <span>${count}</span>
      ${
        isPicked
          ? `<span class="ga-num" style="
              position: absolute;
              top: -6px;
              right: -6px;
              min-width: 19px;
              height: 19px;
              padding: 0 4px;
              border-radius: 999px;
              background: #ff4a1f;
              color: #ffffff;
              font-size: 11px;
              font-weight: 600;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: 1.5px solid #18191b;
            ">+${selectedCount}</span>`
          : ""
      }
    </div>
  `;
}

function renderSplendorCardItem(
  state: SplendorState,
  focusPlayer: SplendorPlayerState,
  canViewerActNow: boolean,
  card: SplendorCard,
  canReserve: boolean
): string {
  const { affordable, payment } = computeCardPurchasePayment(
    focusPlayer,
    card
  );
  const goldUsed = payment.gold ?? 0;
  const bonusStyle = GEM_STYLES[card.bonus];

  const tierBg: Record<1 | 2 | 3, string> = {
    1: "linear-gradient(155deg, #0d3b2e 0%, #18191b 88%)",
    2: "linear-gradient(155deg, #4b2a12 0%, #18191b 88%)",
    3: "linear-gradient(155deg, #173459 0%, #18191b 88%)",
  };

  let totalNetTokensNeeded = 0;
  let totalMissingBeforeGold = 0;

  const costsHtml = GEM_COLORS.filter((c) => card.cost[c] > 0)
    .map((c) => {
      const st = GEM_STYLES[c];
      const raw = card.cost[c];
      const bonus = focusPlayer.bonuses[c];
      const net = Math.max(0, raw - bonus);
      totalNetTokensNeeded += net;
      const missingColor = Math.max(0, net - focusPlayer.tokens[c]);
      totalMissingBeforeGold += missingColor;

      const coveredByBonus = net === 0;
      const discounted = bonus > 0 && net > 0;
      const labelTitle =
        bonus > 0
          ? `${st.label}: ${net} net (${raw} cost − ${bonus} bonus)`
          : `${st.label}: ${raw}`;

      return `
        <span class="ga-num" title="${labelTitle}" style="
          min-width: 24px;
          height: 24px;
          padding: 0 ${discounted ? "5px" : "0"};
          border-radius: 999px;
          background: ${st.bg};
          border: 1.5px solid ${coveredByBonus ? "#4ade80" : st.border};
          color: ${st.text};
          font-size: 12px;
          font-weight: 500;
          opacity: ${coveredByBonus ? "0.48" : "1"};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 1px;
        ">${coveredByBonus ? `0/${raw}` : discounted ? `${net}/${raw}` : raw}</span>
      `;
    })
    .join("");

  const netMissingAfterGold = Math.max(
    0,
    totalMissingBeforeGold - focusPlayer.tokens.gold
  );

  const readinessChip =
    totalNetTokensNeeded === 0
      ? `<span class="ga-chip ga-chip--ok ga-num" style="height:18px;padding:0 5px;font-size:10px;">Free</span>`
      : affordable
        ? goldUsed > 0
          ? `<span class="ga-chip ga-chip--warn ga-num" style="height:18px;padding:0 5px;font-size:10px;" title="Spends ${goldUsed} Gold joker token(s)">${goldUsed} Gold</span>`
          : `<span class="ga-chip ga-chip--ok ga-num" style="height:18px;padding:0 5px;font-size:10px;">Ready</span>`
        : `<span class="ga-chip ga-num" style="height:18px;padding:0 5px;font-size:10px;">Need ${netMissingAfterGold}</span>`;

  const buyLabel =
    affordable && goldUsed > 0 ? `Buy (${goldUsed}G)` : "Buy";

  return `
    <div class="sp-dev-card ${affordable ? "is-affordable" : ""}" style="background: ${tierBg[card.tier]};">
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
        <span class="ga-num" style="font-family: var(--font-display); font-size: 20px; font-weight: 500; color: #fde047; min-width: 16px;">
          ${card.points > 0 ? card.points : ""}
        </span>
        ${readinessChip}
        <div class="ga-num" style="
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: ${bonusStyle.bg};
          border: 1.5px solid ${bonusStyle.border};
          color: ${bonusStyle.text};
          font-size: 11px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        " title="Permanent discount: +1 ${bonusStyle.label}">${bonusStyle.short[0]}</div>
      </div>

      <div class="muted" style="font-size: var(--t-label);">
        Tier ${card.tier} ${"·".repeat(card.tier)}
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
          ${costsHtml}
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" data-sp-buy="${card.id}" class="btn ${
            affordable ? "btn--primary" : "btn--secondary"
          } btn--sm" style="flex: 1; padding: 0 6px;" ${
            !canViewerActNow || !affordable || state.phase !== "MAIN_ACTION"
              ? "disabled"
              : ""
          }>${buyLabel}</button>
          ${
            canReserve
              ? `<button type="button" data-sp-reserve="${card.id}" class="btn btn--secondary btn--sm" style="padding: 0 8px;" ${
                  !canViewerActNow ||
                  focusPlayer.reservedCards.length >= 3 ||
                  state.phase !== "MAIN_ACTION"
                    ? "disabled"
                    : ""
                } title="Reserve card and take 1 gold">Hold</button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

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

      <div class="sp-nobles-row">
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
      </div>

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

      <div style="display: flex; gap: 3px; flex-wrap: wrap; align-items: center;">
        ${ALL_TOKEN_COLORS.map((c) => {
          const st = GEM_STYLES[c];
          return `<span class="ga-num" title="${st.label} tokens" style="
            padding: 1px 5px;
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

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
        <div style="display: flex; gap: 3px; flex-wrap: wrap;">
          ${GEM_COLORS.map((c) => {
            const st = GEM_STYLES[c];
            return `<span class="ga-num" title="${st.label} permanent discount" style="
              padding: 1px 5px;
              border-radius: 4px;
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
