import {
  GEM_COLORS,
  type SplendorCard,
  type SplendorPlayerState,
  type SplendorState,
  type TokenColor,
  computeCardPurchasePayment,
} from "@gaming-platform/splendor";
import {
  type SupportedLocale,
  getSplendorGemTextLocalized,
  t,
} from "../../i18n/index.ts";

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

export function escapeSplendorHtml(raw: string): string {
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
  locationHint = "in bank",
  locale: SupportedLocale = "en"
): string {
  const st = GEM_STYLES[color];
  const gemText = getSplendorGemTextLocalized(color, locale);
  const localizedLocation =
    locationHint === "in bank"
      ? t(locale, "sp.inBank")
      : locationHint === "in hand"
        ? t(locale, "sp.inHand")
        : locationHint;
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
    " title="${gemText.label} (${count} ${localizedLocation}${isPicked ? t(locale, "sp.selectedSuffix", { count: selectedCount }) : ""})">
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

export function renderSplendorCardItem(
  state: SplendorState,
  focusPlayer: SplendorPlayerState,
  canViewerActNow: boolean,
  card: SplendorCard,
  canReserve: boolean,
  locale: SupportedLocale = "en"
): string {
  const { affordable, payment } = computeCardPurchasePayment(
    focusPlayer,
    card
  );
  const goldUsed = payment.gold ?? 0;
  const bonusStyle = GEM_STYLES[card.bonus];
  const bonusText = getSplendorGemTextLocalized(card.bonus, locale);

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
      const cText = getSplendorGemTextLocalized(c, locale);
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
          ? t(locale, "sp.costDiscountTitle", {
              label: cText.label,
              net,
              raw,
              bonus,
            })
          : `${cText.label}: ${raw}`;

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
      ? `<span class="ga-chip ga-chip--ok ga-num" style="height:18px;padding:0 5px;font-size:10px;">${t(locale, "common.free")}</span>`
      : affordable
        ? goldUsed > 0
          ? `<span class="ga-chip ga-chip--warn ga-num" style="height:18px;padding:0 5px;font-size:10px;" title="${t(locale, "sp.spendsGoldTitle", { count: goldUsed })}">${t(locale, "sp.goldChip", { count: goldUsed })}</span>`
          : `<span class="ga-chip ga-chip--ok ga-num" style="height:18px;padding:0 5px;font-size:10px;">${t(locale, "common.ready")}</span>`
        : `<span class="ga-chip ga-num" style="height:18px;padding:0 5px;font-size:10px;">${t(locale, "sp.needCount", { count: netMissingAfterGold })}</span>`;

  const buyLabel =
    affordable && goldUsed > 0
      ? t(locale, "sp.buyWithGold", { count: goldUsed })
      : t(locale, "sp.buy");

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
        " title="${t(locale, "sp.permanentDiscountTitle", { label: bonusText.label })}">${bonusText.short[0]}</div>
      </div>

      <div class="muted" style="font-size: var(--t-label);">
        ${t(locale, "sp.tierN", { tier: card.tier })} ${"·".repeat(card.tier)}
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
                } title="${t(locale, "sp.holdTitle")}">${t(locale, "sp.hold")}</button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}
