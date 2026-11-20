import type { BotDifficulty } from "@gaming-platform/core";
import {
  SCENARIO_CATALOG,
  toBaseMapScenarioId,
} from "@gaming-platform/catan";
import { getBotMoveThrottlePresetPure } from "../../config/app-config.ts";
import {
  type SupportedLocale,
  getBotDifficultyMetaLocalized,
  getCatanScenarioDropdownOptionsLocalized,
  getCatanScenarioTextLocalized,
  getSetupGameDropdownOptionsLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeAttr, renderDropdown } from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import type { ClientRoom, DropdownOption } from "../types.ts";
import { getBotPaceDropdownOptionsPure } from "./in-game/bot-move-feed.ts";

export function renderRoomSetupControlsCardPure(
  room: ClientRoom,
  bounds: { minPlayers: number; maxPlayers: number },
  humanCount: number,
  botCountOptions: DropdownOption[],
  effectiveStartingValue: string,
  startingPlayerOptions: DropdownOption[],
  locale: SupportedLocale = "en"
): string {
  return `
      <div class="ga-surface-card">
        <div class="ga-section-bar">
          <h2>${escapeAttr(t(locale, "setup.heading"))}</h2>
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="ga-chip ga-num">${escapeAttr(
              t(locale, "lobby.roomTitle", {
                hash: formatRoomHashLabelPure(room.roomId),
              })
            )}</span>
            <span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "setup.ownerEditable"))}</span>
          </div>
        </div>

        ${
          room.status === "finished"
            ? `<div class="ga-notice ga-notice--accent">
                 ${escapeAttr(t(locale, "setup.finishedNotice"))}
               </div>`
            : ""
        }

        <div class="ga-field">
          <label>${escapeAttr(t(locale, "setup.visibilityLabel"))}</label>
          <div class="ga-seg-switch" role="group" aria-label="${escapeAttr(t(locale, "setup.visibilityLabel"))}">
            <button
              type="button"
              id="setup-vis-public"
              data-setup-visibility="public"
              class="ga-seg-switch__btn ${!room.isPrivate ? "is-active" : ""}"
              aria-pressed="${!room.isPrivate ? "true" : "false"}"
            >
              <span class="ga-seg-switch__title">${escapeAttr(t(locale, "common.public"))}</span>
              <span class="ga-seg-switch__meta">${escapeAttr(t(locale, "setup.publicMeta"))}</span>
            </button>
            <button
              type="button"
              id="setup-vis-private"
              data-setup-visibility="private"
              class="ga-seg-switch__btn ${room.isPrivate ? "is-active" : ""}"
              aria-pressed="${room.isPrivate ? "true" : "false"}"
            >
              <span class="ga-seg-switch__title">${escapeAttr(t(locale, "common.private"))}</span>
              <span class="ga-seg-switch__meta">${escapeAttr(t(locale, "setup.privateMeta"))}</span>
            </button>
          </div>
          <p class="t-small muted">${escapeAttr(
            room.isPrivate
              ? t(locale, "setup.privateHint")
              : t(locale, "setup.publicHint")
          )}</p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-game-btn">${escapeAttr(t(locale, "setup.boardGameLabel"))}</label>
          ${renderDropdown({
            id: "setup-sel-game",
            value: room.gameId,
            options: getSetupGameDropdownOptionsLocalized(locale),
          })}
        </div>

        ${
          room.gameId === "seven_wonders"
            ? `
          <div class="ga-field">
            <label for="setup-sel-wonderside-btn">${escapeAttr(t(locale, "setup.wonderBoardsLabel"))}</label>
            ${renderDropdown({
              id: "setup-sel-wonderside",
              value: room.config.wonderSideMode ?? "random",
              options: [
                {
                  value: "random",
                  label: t(locale, "setup.wonderRandomLabel"),
                  meta: t(locale, "setup.wonderRandomMeta"),
                },
                {
                  value: "day",
                  label: t(locale, "setup.wonderDayLabel"),
                  meta: t(locale, "setup.wonderDayMeta"),
                },
                {
                  value: "night",
                  label: t(locale, "setup.wonderNightLabel"),
                  meta: t(locale, "setup.wonderNightMeta"),
                },
              ],
            })}
            <p class="t-small muted">${escapeAttr(t(locale, "setup.wonderHint"))}</p>
          </div>
        `
            : ""
        }

        ${
          room.gameId === "catan"
            ? (() => {
                const mapScenarioId = toBaseMapScenarioId(room.config.scenarioId);
                return `
          <div class="ga-field">
            <label for="setup-sel-scenario-btn">${escapeAttr(t(locale, "setup.catanScenarioLabel"))}</label>
            ${renderDropdown({
              id: "setup-sel-scenario",
              value: mapScenarioId,
              options: getCatanScenarioDropdownOptionsLocalized(locale),
            })}
            <p class="t-small muted">${escapeAttr(
              getCatanScenarioTextLocalized(mapScenarioId, locale).description
            )}${
              room.players.length >= 5
                ? escapeAttr(t(locale, "setup.catan56Auto"))
                : ""
            }</p>
          </div>
        `;
              })()
            : ""
        }

        <div class="ga-field">
          <label for="setup-sel-bots-btn">${escapeAttr(t(locale, "setup.botsToAddLabel"))}</label>
          ${renderDropdown({
            id: "setup-sel-bots",
            value: String(room.botCount),
            options: botCountOptions,
          })}
          <p class="t-small muted">
            ${
              room.allBots
                ? escapeAttr(
                    t(locale, "setup.botsAllSeatedHint", {
                      bots: room.botCount,
                      min: bounds.minPlayers,
                      max: bounds.maxPlayers,
                    })
                  )
                : t(locale, "setup.botsMixHint", {
                    humans: humanCount,
                    humansWord:
                      humanCount === 1
                        ? t(locale, "lobby.wordHumanOne")
                        : t(locale, "lobby.wordHumanMany"),
                    bots: room.botCount,
                    botsWord:
                      room.botCount === 1
                        ? t(locale, "lobby.wordBotOne")
                        : t(locale, "lobby.wordBotMany"),
                    totalStrong: `<strong>${escapeAttr(
                      t(locale, "setup.totalPlayersStrong", {
                        total: room.players.length,
                        playersWord:
                          room.players.length === 1
                            ? t(locale, "lobby.wordPlayerOne")
                            : t(locale, "lobby.wordPlayerMany"),
                      })
                    )}</strong>`,
                    min: bounds.minPlayers,
                    max: bounds.maxPlayers,
                  })
            }
          </p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-starting-player-btn">${escapeAttr(t(locale, "setup.startingPlayerLabel"))}</label>
          ${renderDropdown({
            id: "setup-sel-starting-player",
            value: startingPlayerOptions.some(
              (o) => o.value === effectiveStartingValue
            )
              ? effectiveStartingValue
              : "random",
            options: startingPlayerOptions,
          })}
          <p class="t-small muted">${escapeAttr(t(locale, "setup.startingPlayerHint"))}</p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-bot-difficulty-btn">${escapeAttr(t(locale, "setup.botStrengthLabel"))}</label>
          ${renderDropdown({
            id: "setup-sel-bot-difficulty",
            value: room.botDifficulty,
            options: (
              ["easy", "normal", "smart", "master"] as BotDifficulty[]
            ).map((d) => {
              const meta = getBotDifficultyMetaLocalized(d, locale);
              return {
                value: d,
                label: meta.label,
                meta: meta.badge,
              };
            }),
          })}
          <p class="t-small muted">${escapeAttr(
            getBotDifficultyMetaLocalized(room.botDifficulty, locale).desc
          )}</p>
        </div>

        ${
          room.botCount > 0 || room.allBots
            ? (() => {
                const pacePreset = getBotMoveThrottlePresetPure(
                  room.botStepDelayMs
                );
                return `
        <div class="ga-field">
          <label for="setup-sel-bot-pace-btn">${escapeAttr(t(locale, "botFeed.paceLabel"))}</label>
          ${renderDropdown({
            id: "setup-sel-bot-pace",
            value: String(pacePreset.delayMs),
            options: getBotPaceDropdownOptionsPure(locale),
          })}
          <p class="t-small muted">${escapeAttr(t(locale, `botFeed.presetDesc.${pacePreset.id}`))}</p>
        </div>`;
              })()
            : ""
        }

        ${
          room.gameId === "catan"
            ? (() => {
                const ckChecked =
                  room.config.enableCitiesAndKnights ||
                  Boolean(
                    SCENARIO_CATALOG[room.config.scenarioId]
                      .enableCitiesAndKnights
                  );
                return `
        <div>
          <label class="ga-check-row" for="setup-chk-citiesknights">
            <span>${escapeAttr(t(locale, "setup.chkCk"))}</span>
            <input type="checkbox" id="setup-chk-citiesknights" ${
              ckChecked ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-harbormaster">
            <span>${escapeAttr(t(locale, "setup.chkHarbormaster"))}</span>
            <input type="checkbox" id="setup-chk-harbormaster" ${
              room.config.enableHarbormaster ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-citywalls">
            <span>${escapeAttr(t(locale, "setup.chkCityWalls"))}</span>
            <input type="checkbox" id="setup-chk-citywalls" ${
              room.config.enableCityWalls || ckChecked ? "checked" : ""
            } ${ckChecked ? "disabled" : ""} />
          </label>
          <label class="ga-check-row" for="setup-chk-friendlyrobber">
            <span>${escapeAttr(t(locale, "setup.chkFriendlyRobber"))}</span>
            <input type="checkbox" id="setup-chk-friendlyrobber" ${
              room.config.enableFriendlyRobber ? "checked" : ""
            } />
          </label>
        </div>
        `;
              })()
            : ""
        }
      </div>
    `;
}
