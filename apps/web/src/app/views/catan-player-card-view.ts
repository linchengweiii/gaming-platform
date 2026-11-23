import {
  COMMODITIES,
  type CatanState,
  RESOURCES,
  computePlayerVictoryPoints,
  getPlayerActiveKnightStrength,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
} from "@gaming-platform/catan";
import {
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "../../catan-graphics.ts";
import {
  type SupportedLocale,
  getBotDifficultyMetaLocalized,
  getCatanCommodityTextLocalized,
  getCatanDisciplineTextLocalized,
  getCatanResourceTextLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeAttr } from "../helpers/html-and-dropdown.ts";

export function renderCatanPlayerCardPure(
  currentUserId: string,
  state: CatanState,
  p: CatanState["players"][number],
  isActing: boolean,
  isOffline = false,
  locale: SupportedLocale = "en"
): string {
  const visibleVp = computePlayerVictoryPoints(state, p.id, true);
  const totalVp = computePlayerVictoryPoints(state, p.id, false);
  const showPrivateHand = !p.handRedacted || state.phase === "GAME_OVER";
  const cardCount = getPlayerResourceCount(p);
  const safeLimit = getPlayerSafeHandLimit(state, p.id);
  const unplayedDevs = p.devCards.filter((c) => !c.played);
  const botBadge = p.isBot
    ? `${t(locale, "common.bot")} · ${
        getBotDifficultyMetaLocalized(p.botDifficulty ?? "smart", locale).badge
      }`
    : p.id === currentUserId
      ? t(locale, "common.youGuest")
      : t(locale, "common.guest");
  const offlineChip = isOffline
    ? `<span class="ga-chip ga-chip--warn" title="${escapeAttr(t(locale, "common.offlineTooltip"))}">${escapeAttr(t(locale, "common.offline"))}</span>`
    : "";

  const hiddenCardIconSvg = `<svg width="13" height="15" viewBox="0 0 14 16" aria-hidden="true"><rect x="1.5" y="1" width="11" height="14" rx="2.2" fill="#27272a" stroke="#a1a1aa" stroke-width="1.2"/><path d="M4.2 4.5h5.6M4.2 8h5.6M4.2 11.5h3.6" stroke="#fb923c" stroke-width="1.1" stroke-linecap="round"/></svg>`;
  const cardWord =
    cardCount === 1
      ? t(locale, "catan.cardOne")
      : t(locale, "catan.cardMany");

  const isCk = Boolean(state.config.enableCitiesAndKnights);
  const resourcePillsHtml = RESOURCES.map(
    (r) =>
      `<span class="res-pill res-${r}" title="${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
  ).join("");
  const goodPillsHtml = isCk
    ? `${resourcePillsHtml}${COMMODITIES.map(
        (c) =>
          `<span class="res-pill res-${c}" title="${escapeAttr(getCatanCommodityTextLocalized(c, locale).label)}">${renderCommodityGlyphSvg(c)} ${p.commodities[c]}</span>`
      ).join("")}`
    : resourcePillsHtml;

  let modeStatsHtml: string;
  if (isCk) {
    const activeStr = getPlayerActiveKnightStrength(state, p.id);
    const progCount = p.handRedacted
      ? p.hiddenProgressCardCount ?? 0
      : p.progressCards.length;
    const tCode = getCatanDisciplineTextLocalized("trade", locale).shortCode;
    const pCode = getCatanDisciplineTextLocalized("politics", locale).shortCode;
    const sCode = getCatanDisciplineTextLocalized("science", locale).shortCode;
    modeStatsHtml = `<span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statActiveKnightTitle"))}">⚔ <strong class="ga-num">${activeStr}</strong></span>
            <span class="player-stat-chip player-stat-chip--ck" title="${escapeAttr(t(locale, "catan.statCkLevelsTitle"))}">
              <span>${escapeAttr(tCode)} <strong class="ga-num">${p.cityImprovements.trade}</strong></span>
              <span class="player-stat-sep">·</span>
              <span>${escapeAttr(pCode)} <strong class="ga-num">${p.cityImprovements.politics}</strong></span>
              <span class="player-stat-sep">·</span>
              <span>${escapeAttr(sCode)} <strong class="ga-num">${p.cityImprovements.science}</strong></span>
            </span>
            <span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statProgressCardsTitle"))}">P <strong class="ga-num">${progCount}</strong></span>${
              p.defenderPoints > 0
                ? `\n            <span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statDefenderVpTitle"))}">🛡 <strong class="ga-num">${p.defenderPoints}</strong></span>`
                : ""
            }`;
  } else {
    modeStatsHtml = `<span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statKnightsPlayedTitle"))}">K <strong class="ga-num">${p.knightsPlayed}</strong></span>
            <span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statUnplayedDevsTitle"))}">D <strong class="ga-num">${unplayedDevs.length}</strong></span>`;
  }

  return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${escapeAttr(botBadge)}</span>
            ${offlineChip}
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${
            showPrivateHand
              ? `${totalVp} VP${totalVp !== visibleVp ? ` (${visibleVp})` : ""}`
              : `${visibleVp} VP`
          }</span>
        </div>

        <div class="player-card__hud-row">
          <div class="res-pills">
            ${
              showPrivateHand
                ? goodPillsHtml
                : `<span class="res-pill res-pill--hidden ga-num" title="${escapeAttr(t(locale, isCk ? "catan.hiddenGoodsTitle" : "catan.hiddenResourcesTitle"))}">${hiddenCardIconSvg} ${cardCount} ${escapeAttr(cardWord)}</span>`
            }
            <span class="ga-chip ga-num" title="${escapeAttr(t(locale, "catan.handSafeLimitTitle"))}">${cardCount}/${safeLimit}</span>
          </div>

          <div class="player-card__stats">
            <span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statLongestRouteTitle"))}">R <strong class="ga-num">${p.longestRoadLength}</strong></span>
            ${modeStatsHtml}
            ${
              state.config.enableHarbormaster
                ? `<span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statHarborPointsTitle"))}">H <strong class="ga-num">${p.harborPoints}</strong></span>`
                : ""
            }
            ${
              p.bonusVictoryPoints > 0
                ? `<span class="player-stat-chip" title="${escapeAttr(t(locale, "catan.statIslandBonusTitle"))}">+<strong class="ga-num">${p.bonusVictoryPoints}</strong></span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
}
