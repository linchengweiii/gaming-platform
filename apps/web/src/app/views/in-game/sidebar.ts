import {
  COMMODITIES,
  type CatanState,
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
  computePlayerVictoryPoints,
  getPlayerActiveKnightStrength,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
} from "@gaming-platform/catan";
import type { SplendorState } from "@gaming-platform/splendor";
import type { AzulState } from "@gaming-platform/azul";
import type { SevenWondersState } from "@gaming-platform/seven-wonders";
import {
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "../../../catan-graphics.ts";
import {
  type SupportedLocale,
  getBotDifficultyMetaLocalized,
  getCatanCommodityTextLocalized,
  getCatanDisciplineTextLocalized,
  getCatanResourceTextLocalized,
  localizeEventLogMessage,
  t,
} from "../../../i18n/index.ts";
import { renderSplendorPlayerCard } from "../../../splendor-view.ts";
import { renderAzulPlayerCard } from "../../../azul-view.ts";
import { renderSevenWondersPlayerCard } from "../../../seven-wonders-view.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { ClientRoom } from "../../types.ts";
import { renderFullscreenSidebarHeaderPure } from "./overlays-and-modals.ts";
import type { InGameComputedContext } from "./view-state.ts";

function renderCatanPlayerCardPure(
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

function renderCatanBankSectionPure(
  state: CatanState,
  locale: SupportedLocale
): string {
  const isCk = Boolean(state.config.enableCitiesAndKnights);
  const playerName = (id: string | null): string =>
    escapeAttr(state.players.find((p) => p.id === id)?.name ?? "");
  const headTitle = t(
    locale,
    isCk ? "catan.bankAndProgressDecks" : "catan.bankSupplyAndAwards"
  );
  const headCount = isCk
    ? `${getCatanDisciplineTextLocalized("trade", locale).shortCode}${state.progressDecks.trade.length}·${getCatanDisciplineTextLocalized("politics", locale).shortCode}${state.progressDecks.politics.length}·${getCatanDisciplineTextLocalized("science", locale).shortCode}${state.progressDecks.science.length}`
    : escapeAttr(t(locale, "catan.devDeckCount", { count: state.devCardDeck.length }));
  const resourcePills = RESOURCES.map(
    (r) =>
      `<span class="res-pill res-${r}" title="${escapeAttr(
        t(locale, "catan.inBankTooltip", {
          label: getCatanResourceTextLocalized(r, locale).label,
          count: state.bank[r],
        })
      )}">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
  ).join("");
  const bankPills = isCk
    ? `${resourcePills}${COMMODITIES.map(
        (c) =>
          `<span class="res-pill res-${c}" title="${escapeAttr(
            t(locale, "catan.inBankTooltip", {
              label: getCatanCommodityTextLocalized(c, locale).label,
              count: state.commodityBank[c],
            })
          )}">${renderCommodityGlyphSvg(c)} ${state.commodityBank[c]}</span>`
      ).join("")}`
    : resourcePills;

  const middleAwardsHtml = isCk
    ? `${IMPROVEMENT_DISCIPLINES.map((disc) => {
        const m = state.metropolises[disc];
        const dText = getCatanDisciplineTextLocalized(disc, locale);
        return `<div class="ga-stat-row">
                        <span>${escapeAttr(t(locale, "catan.metroAward", { discipline: dText.label }))}</span>
                        <strong class="ga-num">${
                          m.ownerId
                            ? `${playerName(m.ownerId)} (${escapeAttr(t(locale, "catan.lvN", { lv: m.level }))})`
                            : escapeAttr(t(locale, "catan.unclaimedLv4"))
                        }</strong>
                      </div>`;
      }).join("")}
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.merchantAward"))}</span>
                      <strong class="ga-num">${
                        state.merchantOwnerId
                          ? playerName(state.merchantOwnerId)
                          : escapeAttr(t(locale, "catan.unclaimed"))
                      }</strong>
                    </div>`
    : `<div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.largestArmyAward"))}</span>
                      <strong class="ga-num">${
                        state.largestArmyOwnerId
                          ? `${playerName(state.largestArmyOwnerId)} (${state.largestArmySize})`
                          : escapeAttr(t(locale, "catan.unclaimed3Plus"))
                      }</strong>
                    </div>`;

  return `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>${escapeAttr(headTitle)}</span>
                    <span class="ga-num">${headCount}</span>
                  </div>
                  <div class="res-pills res-pills--bank"${isCk ? ' data-bank-mode="ck"' : ""}>
                    ${bankPills}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.longestRouteAward"))}</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${playerName(state.longestRoadOwnerId)} (${state.longestRoadLength})`
                          : escapeAttr(t(locale, "catan.unclaimed5Plus"))
                      }</strong>
                    </div>
                    ${middleAwardsHtml}
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>${escapeAttr(t(locale, "catan.harbormasterAward"))}</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${playerName(state.harbormasterOwnerId)} (${state.harbormasterPoints})`
                                : escapeAttr(t(locale, "catan.unclaimed3Plus"))
                            }</strong>
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              `;
}

export function renderInGameSidebarPure(
  room: ClientRoom,
  ctx: InGameComputedContext
): string {
  const { actingPlayerId, state, model, summaryInfo, isOwner } = ctx;
  const locale = model.locale;

  return `          <aside class="ga-sidebar">
            ${model.boardFullscreen ? renderFullscreenSidebarHeaderPure(locale) : ""}
            <div class="ga-standings-section">
              <div class="ga-sidebar__head">
                <span>${escapeAttr(t(locale, "inGame.standings", { count: state.players.length }))}</span>
                <span class="ga-num">${escapeAttr(
                  room.gameId === "catan"
                    ? t(locale, "inGame.targetVp", {
                        target: state.config.targetVictoryPoints,
                      })
                    : room.gameId === "splendor"
                      ? t(locale, "inGame.targetVp", {
                          target: state.config.targetPoints,
                        })
                      : room.gameId === "seven_wonders"
                        ? t(locale, "inGame.ageVp", { age: state.age })
                        : t(locale, "inGame.wall5x5")
                )}</span>
              </div>
              ${
                (room.offlinePlayerIds ?? []).length > 0
                  ? `<div class="ga-inline-summary__chips">
                      ${(room.offlinePlayerIds ?? [])
                        .map((offId) => {
                          const offP = state.players.find((sp: any) => sp.id === offId);
                          return offP
                            ? `<span class="ga-chip ga-chip--warn" title="${escapeAttr(t(locale, "common.offlineTooltip"))}">${escapeAttr(
                                t(locale, "inGame.playerOfflineChip", {
                                  name: offP.name,
                                })
                              )}</span>`
                            : "";
                        })
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="ga-standings-list">
                ${state.players
                  .map((p: any) =>
                    room.gameId === "catan"
                      ? renderCatanPlayerCardPure(
                          model.currentUserId,
                          state as CatanState,
                          p,
                          p.id === actingPlayerId,
                          Boolean(room.offlinePlayerIds?.includes(p.id)),
                          locale
                        )
                      : room.gameId === "splendor"
                        ? renderSplendorPlayerCard(
                            state as SplendorState,
                            p,
                            p.id === actingPlayerId,
                            locale
                          )
                        : room.gameId === "seven_wonders"
                          ? renderSevenWondersPlayerCard(
                              state as SevenWondersState,
                              p,
                              p.id === actingPlayerId,
                              locale
                            )
                          : renderAzulPlayerCard(
                              state as AzulState,
                              p,
                              p.id === actingPlayerId,
                              locale
                            )
                  )
                  .join("")}
              </div>
            </div>

            <div class="ga-sidebar__secondary">
              <div class="ga-inline-summary ga-settings-fold ${
                model.sidebarSettingsExpanded ? "is-open" : ""
              }" title="${escapeAttr(summaryInfo.ruleChips.join(" · "))}">
                <button
                  type="button"
                  id="btn-toggle-game-settings"
                  class="ga-settings-fold__btn"
                  aria-expanded="${model.sidebarSettingsExpanded ? "true" : "false"}"
                >
                  <span class="ga-settings-fold__title">${escapeAttr(t(locale, "inGame.gameSettings"))}</span>
                  <span class="ga-settings-fold__meta ga-num">
                    <span>${escapeAttr(summaryInfo.seatsLabel)} · T${state.turn}</span>
                    <svg class="ga-settings-fold__chev" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                </button>
                ${
                  model.sidebarSettingsExpanded
                    ? `
                      <div class="ga-settings-fold__body">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                          <strong style="font-size: var(--t-label); font-weight: 500; color: var(--ink);">${escapeAttr(summaryInfo.formatTitle)}</strong>
                          <span class="t-label muted ga-num">${escapeAttr(summaryInfo.targetLabel)}</span>
                        </div>
                        <div class="ga-inline-summary__chips">
                          ${summaryInfo.ruleChips
                            .map((chip) => `<span class="ga-chip">${escapeAttr(chip)}</span>`)
                            .join("")}
                        </div>
                      </div>
                    `
                    : ""
                }
                ${
                  room.status === "finished" && isOwner
                    ? `<div style="padding: 0 12px 10px;"><button type="button" id="btn-sidebar-edit-setup" class="btn btn--secondary btn--sm" style="width: 100%;">${escapeAttr(t(locale, "inGame.editSetupNextGame"))}</button></div>`
                    : ""
                }
              </div>

              ${
                room.gameId === "catan"
                  ? renderCatanBankSectionPure(state as CatanState, locale)
                  : ""
              }

              <div class="ga-log-section">
                <div class="ga-sidebar__head">
                  <span>${escapeAttr(t(locale, "inGame.matchLog"))}</span>
                  <span class="ga-num">${state.eventLog.length}</span>
                </div>
                <div class="event-log">
                  ${(() => {
                    const botById = new Map<string, any>();
                    for (const p of state.players ?? []) {
                      if (p?.isBot) botById.set(p.id, p);
                    }
                    const latestBotMoveId = model.showBotMoves
                      ? ctx.botMoveFeed.latestMove?.id ?? null
                      : null;
                    return [...state.eventLog]
                      .reverse()
                      .slice(0, 35)
                      .map((evt: any) => {
                        const bot = evt?.playerId
                          ? botById.get(evt.playerId)
                          : undefined;
                        const isLatestBot =
                          Boolean(latestBotMoveId) && evt?.id === latestBotMoveId;
                        const cls = bot
                          ? isLatestBot
                            ? "event-item event-item--bot event-item--latest-bot"
                            : "event-item event-item--bot"
                          : "event-item";
                        const styleAttr = bot?.color
                          ? ` style="--bot-accent: ${escapeAttr(bot.color)};"`
                          : "";
                        return `<div class="${cls}"${styleAttr}><strong>T${evt.turn}</strong> ${escapeAttr(
                          localizeEventLogMessage(evt.message, locale)
                        )}</div>`;
                      })
                      .join("");
                  })()}
                </div>
              </div>
            </div>
          </aside>`;
}
