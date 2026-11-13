import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  type GemColor,
  type SplendorCard,
  type SplendorState,
  type TokenColor,
  computeCardPurchasePayment,
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

export function renderSplendorGemToken(
  color: TokenColor,
  count: number,
  size = 44,
  dataAttr = ""
): string {
  const st = GEM_STYLES[color];
  return `
    <div ${dataAttr} class="gem-chip ga-num ${dataAttr ? "clickable-target" : ""}" style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      background: ${st.bg};
      border: 2px solid ${st.border};
      color: ${st.text};
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 500;
      font-size: ${Math.max(13, Math.round(size * 0.34))}px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.38), inset 0 1.5px 3px rgba(255,255,255,0.3);
      opacity: ${count <= 0 ? "0.32" : "1"};
      user-select: none;
    " title="${st.label} (${count})">
      <span>${count}</span>
    </div>
  `;
}

function renderSplendorCardItem(
  state: SplendorState,
  card: SplendorCard,
  canReserve: boolean
): string {
  const activePlayer = state.players[state.activePlayerIndex]!;
  const { affordable } = computeCardPurchasePayment(activePlayer, card);
  const bonusStyle = GEM_STYLES[card.bonus];

  const tierBg: Record<1 | 2 | 3, string> = {
    1: "linear-gradient(155deg, #0d3b2e 0%, #18191b 88%)",
    2: "linear-gradient(155deg, #4b2a12 0%, #18191b 88%)",
    3: "linear-gradient(155deg, #173459 0%, #18191b 88%)",
  };

  const costsHtml = GEM_COLORS.filter((c) => card.cost[c] > 0)
    .map((c) => {
      const st = GEM_STYLES[c];
      return `
        <span class="ga-num" style="
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: ${st.bg};
          border: 1.5px solid ${st.border};
          color: ${st.text};
          font-size: 13px;
          font-weight: 500;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        ">${card.cost[c]}</span>
      `;
    })
    .join("");

  return `
    <div class="sp-dev-card ${affordable ? "is-affordable" : ""}" style="background: ${tierBg[card.tier]};">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="ga-num" style="font-family: var(--font-display); font-size: 20px; font-weight: 500; color: #fde047;">
          ${card.points > 0 ? card.points : ""}
        </span>
        <div style="
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: ${bonusStyle.bg};
          border: 1.5px solid ${bonusStyle.border};
        " title="Bonus: +1 ${bonusStyle.label}"></div>
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
          } btn--sm" style="flex: 1; padding: 0 8px;" ${
            !affordable || state.phase !== "MAIN_ACTION" ? "disabled" : ""
          }>Buy</button>
          ${
            canReserve
              ? `<button type="button" data-sp-reserve="${card.id}" class="btn btn--secondary btn--sm" style="padding: 0 8px;" ${
                  activePlayer.reservedCards.length >= 3 ||
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
  draftGems: Partial<Record<GemColor, number>>
): string {
  const activePlayer = state.players[state.activePlayerIndex]!;

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
      totalTokens(activePlayer.tokens) + draftEntries.length >= 10);
  const canConfirmGemDraft =
    state.phase === "MAIN_ACTION" && (isTwoSameLegal || isDistinctLegal);

  return `
    <div class="sp-board">
      <div class="sp-nobles-row">
        <span class="t-label muted">Royal nobles (+3 prestige)</span>
        ${state.nobles
          .map((noble) => {
            const isEligibleChoice =
              state.phase === "SELECT_NOBLE" &&
              state.eligibleNobleIds.includes(noble.id);
            return `
              <div ${
                isEligibleChoice ? `data-sp-noble="${noble.id}"` : ""
              } class="sp-noble-card ${
                isEligibleChoice ? "clickable-target pulse-highlight" : ""
              }">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                  <strong style="font-size: var(--t-label); font-weight: 500;">${noble.name}</strong>
                  <span class="ga-chip ga-chip--warn ga-num" style="height: 22px; padding: 0 7px;">+${noble.points}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                  ${GEM_COLORS.filter((c) => (noble.requirements[c] ?? 0) > 0)
                    .map((c) => {
                      const st = GEM_STYLES[c];
                      return `<span class="ga-num" style="
                        padding: 1px 7px;
                        border-radius: 4px;
                        background: ${st.bg};
                        border: 1px solid ${st.border};
                        color: ${st.text};
                        font-size: 13px;
                        font-weight: 500;
                      ">${noble.requirements[c]}</span>`;
                    })
                    .join("")}
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
                state.decks[tier].length === 0 ||
                activePlayer.reservedCards.length >= 3 ||
                state.phase !== "MAIN_ACTION"
                  ? "disabled"
                  : ""
              }>Draw hold</button>
            </div>

            ${state.market[tier]
              .map((card) => renderSplendorCardItem(state, card, true))
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
            renderSplendorGemToken(c, state.bank[c], 44, `data-sp-gem="${c}"`)
          ).join("")}
          ${renderSplendorGemToken("gold", state.bank.gold, 44)}
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <span class="t-small muted ga-num">
            Draft: ${
              draftEntries.length === 0
                ? "none"
                : draftEntries.map(([c, n]) => `${n} ${c}`).join(", ")
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
        activePlayer.reservedCards.length > 0
          ? `<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center;">
              <span class="t-label muted">${
                activePlayer.name
              } reserved (${activePlayer.reservedCards.length}/3)</span>
              ${activePlayer.reservedCards
                .map((card) => renderSplendorCardItem(state, card, false))
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
  return `
    <div class="player-card ${isActing ? "active-turn" : ""}">
      <div class="player-header">
        <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
          <span class="player-dot" style="background: ${p.color}"></span>
          <strong class="player-card__name">${p.name}</strong>
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
            return `<span class="ga-num" title="${st.label} mine bonus" style="
              padding: 1px 5px;
              border-radius: 4px;
              background: ${st.bg};
              border: 1px solid ${st.border};
              color: ${st.text};
              font-size: 11px;
              font-weight: 500;
            ">+${p.bonuses[c]}</span>`;
          }).join("")}
        </div>
        <span class="t-label muted ga-num">Hold ${p.reservedCards.length}/3 · Nobles ${p.nobles.length}</span>
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
      <strong>Match complete.</strong> ${winner?.name ?? "Player"} wins Splendor with ${
        winner?.points ?? 0
      } prestige points.
    </div>`;
  }

  if (state.phase === "RETURN_TOKENS") {
    const excess = totalTokens(actingPlayer.tokens) - 10;
    return `<div class="sub-modal">
      <div class="action-prompt"><strong>Token limit (10) exceeded.</strong> ${actingPlayer.name}, return ${excess} token${excess === 1 ? "" : "s"}:</div>
      <div class="action-buttons">
        ${ALL_TOKEN_COLORS.filter((c) => actingPlayer.tokens[c] > 0)
          .map(
            (c) =>
              `<button type="button" data-sp-return-one="${c}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderSplendorGemToken(c, actingPlayer.tokens[c], 22)}
                <span>Return 1 ${GEM_STYLES[c].label.toLowerCase()}</span>
              </button>`
          )
          .join("")}
      </div>
    </div>`;
  }

  if (state.phase === "SELECT_NOBLE") {
    return `<div class="action-buttons">
      <span class="action-prompt"><strong>${actingPlayer.name} qualifies for multiple nobles.</strong> Select one highlighted noble card above.</span>
    </div>`;
  }

  return `<div class="action-buttons">
    <span class="action-prompt"><strong>${actingPlayer.name} to act:</strong> Select gem tokens from the bank (3 distinct or 2 matching), or buy or hold a development card.</span>
  </div>`;
}
