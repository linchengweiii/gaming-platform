import {
  COMMODITIES,
  type CatanState,
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
} from "@gaming-platform/catan";
import type { SplendorState } from "@gaming-platform/splendor";
import type { AzulState } from "@gaming-platform/azul";
import type { SevenWondersState } from "@gaming-platform/seven-wonders";
import {
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "../../../catan-graphics.ts";
import {
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
import { renderCatanPlayerCardPure } from "../catan-player-card-view.ts";
import { extractBotMoveFeedPure } from "./bot-move-feed.ts";
import type { InGameComputedContext } from "./view-state.ts";

export function renderInGameSidebarPure(
  room: ClientRoom,
  ctx: InGameComputedContext
): string {
  const { actingPlayerId, state, model, summaryInfo, isOwner } = ctx;
  const locale = model.locale;

  return `          <aside class="ga-sidebar">
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
                  ? (state as CatanState).config.enableCitiesAndKnights
                    ? `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>${escapeAttr(t(locale, "catan.bankAndProgressDecks"))}</span>
                    <span class="ga-num">${getCatanDisciplineTextLocalized("trade", locale).shortCode}${state.progressDecks.trade.length}·${getCatanDisciplineTextLocalized("politics", locale).shortCode}${state.progressDecks.politics.length}·${getCatanDisciplineTextLocalized("science", locale).shortCode}${state.progressDecks.science.length}</span>
                  </div>
                  <div class="res-pills res-pills--bank" data-bank-mode="ck">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${escapeAttr(
                          t(locale, "catan.inBankTooltip", {
                            label: getCatanResourceTextLocalized(r, locale).label,
                            count: state.bank[r],
                          })
                        )}">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}${COMMODITIES.map(
                      (c) =>
                        `<span class="res-pill res-${c}" title="${escapeAttr(
                          t(locale, "catan.inBankTooltip", {
                            label: getCatanCommodityTextLocalized(c, locale).label,
                            count: state.commodityBank[c],
                          })
                        )}">${renderCommodityGlyphSvg(c)} ${state.commodityBank[c]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.longestRouteAward"))}</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${escapeAttr(
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name ?? ""
                            )} (${state.longestRoadLength})`
                          : escapeAttr(t(locale, "catan.unclaimed5Plus"))
                      }</strong>
                    </div>
                    ${IMPROVEMENT_DISCIPLINES.map((disc) => {
                      const m = state.metropolises[disc];
                      const dText = getCatanDisciplineTextLocalized(disc, locale);
                      return `<div class="ga-stat-row">
                        <span>${escapeAttr(t(locale, "catan.metroAward", { discipline: dText.label }))}</span>
                        <strong class="ga-num">${
                          m.ownerId
                            ? `${escapeAttr(
                                state.players.find((p: any) => p.id === m.ownerId)
                                  ?.name ?? ""
                              )} (${escapeAttr(t(locale, "catan.lvN", { lv: m.level }))})`
                            : escapeAttr(t(locale, "catan.unclaimedLv4"))
                        }</strong>
                      </div>`;
                    }).join("")}
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.merchantAward"))}</span>
                      <strong class="ga-num">${
                        state.merchantOwnerId
                          ? `${escapeAttr(
                              state.players.find(
                                (p: any) => p.id === state.merchantOwnerId
                              )?.name ?? ""
                            )}`
                          : escapeAttr(t(locale, "catan.unclaimed"))
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>${escapeAttr(t(locale, "catan.harbormasterAward"))}</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${escapeAttr(
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name ?? ""
                                  )} (${state.harbormasterPoints})`
                                : escapeAttr(t(locale, "catan.unclaimed3Plus"))
                            }</strong>
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              `
                    : `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>${escapeAttr(t(locale, "catan.bankSupplyAndAwards"))}</span>
                    <span class="ga-num">${escapeAttr(t(locale, "catan.devDeckCount", { count: state.devCardDeck.length }))}</span>
                  </div>
                  <div class="res-pills res-pills--bank">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${escapeAttr(
                          t(locale, "catan.inBankTooltip", {
                            label: getCatanResourceTextLocalized(r, locale).label,
                            count: state.bank[r],
                          })
                        )}">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.longestRouteAward"))}</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${escapeAttr(
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name ?? ""
                            )} (${state.longestRoadLength})`
                          : escapeAttr(t(locale, "catan.unclaimed5Plus"))
                      }</strong>
                    </div>
                    <div class="ga-stat-row">
                      <span>${escapeAttr(t(locale, "catan.largestArmyAward"))}</span>
                      <strong class="ga-num">${
                        state.largestArmyOwnerId
                          ? `${escapeAttr(
                              state.players.find(
                                (p: any) => p.id === state.largestArmyOwnerId
                              )?.name ?? ""
                            )} (${state.largestArmySize})`
                          : escapeAttr(t(locale, "catan.unclaimed3Plus"))
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>${escapeAttr(t(locale, "catan.harbormasterAward"))}</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${escapeAttr(
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name ?? ""
                                  )} (${state.harbormasterPoints})`
                                : escapeAttr(t(locale, "catan.unclaimed3Plus"))
                            }</strong>
                          </div>`
                        : ""
                    }
                  </div>
                </div>
              `
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
                      ? extractBotMoveFeedPure(room.gameId, state).latestMove?.id ??
                        null
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
