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
  COMMODITY_META,
  DISCIPLINE_META,
  RESOURCE_META,
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "../../../catan-graphics.ts";
import { renderSplendorPlayerCard } from "../../../splendor-view.ts";
import { renderAzulPlayerCard } from "../../../azul-view.ts";
import { renderSevenWondersPlayerCard } from "../../../seven-wonders-view.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { ClientRoom } from "../../types.ts";
import { renderCatanPlayerCardPure } from "../catan-player-card-view.ts";
import type { InGameComputedContext } from "./view-state.ts";

export function renderInGameSidebarPure(
  room: ClientRoom,
  ctx: InGameComputedContext
): string {
  const { actingPlayerId, state, model, summaryInfo, isOwner } = ctx;

  return `          <aside class="ga-sidebar">
            <div class="ga-standings-section">
              <div class="ga-sidebar__head">
                <span>Standings (${state.players.length})</span>
                <span class="ga-num">${
                  room.gameId === "catan"
                    ? `Target ${state.config.targetVictoryPoints} VP`
                    : room.gameId === "splendor"
                      ? `Target ${state.config.targetPoints} VP`
                      : room.gameId === "seven_wonders"
                        ? `Age ${state.age}/3 · VP`
                        : `5×5 wall`
                }</span>
              </div>
              ${
                (room.offlinePlayerIds ?? []).length > 0
                  ? `<div class="ga-inline-summary__chips">
                      ${(room.offlinePlayerIds ?? [])
                        .map((offId) => {
                          const offP = state.players.find((sp: any) => sp.id === offId);
                          return offP
                            ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">${escapeAttr(offP.name)}: Offline</span>`
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
                          Boolean(room.offlinePlayerIds?.includes(p.id))
                        )
                      : room.gameId === "splendor"
                        ? renderSplendorPlayerCard(
                            state as SplendorState,
                            p,
                            p.id === actingPlayerId
                          )
                        : room.gameId === "seven_wonders"
                           ? renderSevenWondersPlayerCard(
                              state as SevenWondersState,
                              p,
                              p.id === actingPlayerId
                            )
                          : renderAzulPlayerCard(
                              state as AzulState,
                              p,
                              p.id === actingPlayerId
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
                  <span class="ga-settings-fold__title">Game settings</span>
                  <span class="ga-settings-fold__meta ga-num">
                    <span>${summaryInfo.seatsLabel} · T${state.turn}</span>
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
                          <strong style="font-size: var(--t-label); font-weight: 500; color: var(--ink);">${summaryInfo.formatTitle}</strong>
                          <span class="t-label muted ga-num">${summaryInfo.targetLabel}</span>
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
                    ? `<div style="padding: 0 12px 10px;"><button type="button" id="btn-sidebar-edit-setup" class="btn btn--secondary btn--sm" style="width: 100%;">Edit setup for next game</button></div>`
                    : ""
                }
              </div>

              ${
                room.gameId === "catan"
                  ? (state as CatanState).config.enableCitiesAndKnights
                    ? `
                <div class="ga-bank-section">
                  <div class="ga-sidebar__head">
                    <span>Bank & progress decks</span>
                    <span class="ga-num">T${state.progressDecks.trade.length}·P${state.progressDecks.politics.length}·S${state.progressDecks.science.length}</span>
                  </div>
                  <div class="res-pills res-pills--bank" data-bank-mode="ck">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}: ${state.bank[r]} in bank">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}${COMMODITIES.map(
                      (c) =>
                        `<span class="res-pill res-${c}" title="${COMMODITY_META[c].label}: ${state.commodityBank[c]} in bank">${renderCommodityGlyphSvg(c)} ${state.commodityBank[c]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>Longest route (+2 VP)</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name
                            } (${state.longestRoadLength})`
                          : "Unclaimed (5+)"
                      }</strong>
                    </div>
                    ${IMPROVEMENT_DISCIPLINES.map((disc) => {
                      const m = state.metropolises[disc];
                      const dMeta = DISCIPLINE_META[disc];
                      return `<div class="ga-stat-row">
                        <span>${dMeta.label} Metro (+2 VP)</span>
                        <strong class="ga-num">${
                          m.ownerId
                            ? `${
                                state.players.find((p: any) => p.id === m.ownerId)
                                  ?.name
                              } (Lv ${m.level})`
                            : "Unclaimed (Lv 4)"
                        }</strong>
                      </div>`;
                    }).join("")}
                    <div class="ga-stat-row">
                      <span>Merchant (+1 VP)</span>
                      <strong class="ga-num">${
                        state.merchantOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.merchantOwnerId
                              )?.name
                            }`
                          : "Unclaimed"
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>Harbormaster (+2 VP)</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name
                                  } (${state.harbormasterPoints})`
                                : "Unclaimed (3+)"
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
                    <span>Bank supply and awards</span>
                    <span class="ga-num">Dev deck: ${state.devCardDeck.length}</span>
                  </div>
                  <div class="res-pills res-pills--bank">
                    ${RESOURCES.map(
                      (r) =>
                        `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}: ${state.bank[r]} in bank">${renderResourceGlyphSvg(r)} ${state.bank[r]}</span>`
                    ).join("")}
                  </div>
                  <div class="ga-stat-list ga-stat-list--compact">
                    <div class="ga-stat-row">
                      <span>Longest route (+2 VP)</span>
                      <strong class="ga-num">${
                        state.longestRoadOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.longestRoadOwnerId
                              )?.name
                            } (${state.longestRoadLength})`
                          : "Unclaimed (5+)"
                      }</strong>
                    </div>
                    <div class="ga-stat-row">
                      <span>Largest army (+2 VP)</span>
                      <strong class="ga-num">${
                        state.largestArmyOwnerId
                          ? `${
                              state.players.find(
                                (p: any) => p.id === state.largestArmyOwnerId
                              )?.name
                            } (${state.largestArmySize})`
                          : "Unclaimed (3+)"
                      }</strong>
                    </div>
                    ${
                      state.config.enableHarbormaster
                        ? `<div class="ga-stat-row">
                            <span>Harbormaster (+2 VP)</span>
                            <strong class="ga-num">${
                              state.harbormasterOwnerId
                                ? `${
                                    state.players.find(
                                      (p: any) => p.id === state.harbormasterOwnerId
                                    )?.name
                                  } (${state.harbormasterPoints})`
                                : "Unclaimed (3+)"
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
                  <span>Match log</span>
                  <span class="ga-num">${state.eventLog.length}</span>
                </div>
                <div class="event-log">
                  ${[...state.eventLog]
                    .reverse()
                    .slice(0, 35)
                    .map(
                      (evt: any) =>
                        `<div class="event-item"><strong>T${evt.turn}</strong> ${escapeAttr(evt.message)}</div>`
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </aside>`;
}
