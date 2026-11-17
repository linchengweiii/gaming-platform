import type { BotDifficulty } from "@gaming-platform/core";
import {
  SCENARIO_CATALOG,
  toBaseMapScenarioId,
} from "@gaming-platform/catan";
import {
  BOT_DIFFICULTY_META,
  SETUP_GAME_DROPDOWN_OPTIONS,
  getCatanScenarioDropdownOptions,
} from "../../config/app-config.ts";
import { escapeAttr, renderDropdown } from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import type { ClientRoom, DropdownOption } from "../types.ts";

export function renderRoomSetupControlsCardPure(
  room: ClientRoom,
  bounds: { minPlayers: number; maxPlayers: number },
  humanCount: number,
  botCountOptions: DropdownOption[],
  effectiveStartingValue: string,
  startingPlayerOptions: DropdownOption[]
): string {
  return `
      <div class="ga-surface-card">
        <div class="ga-section-bar">
          <h2>Match configuration</h2>
          <div style="display: inline-flex; align-items: center; gap: 6px;">
            <span class="ga-chip ga-num">Room ${escapeAttr(formatRoomHashLabelPure(room.roomId))}</span>
            <span class="ga-chip ga-chip--ok">Owner editable</span>
          </div>
        </div>

        ${
          room.status === "finished"
            ? `<div class="ga-notice ga-notice--accent">
                 The previous match has finished. Adjust any rules below and start the next game.
               </div>`
            : ""
        }

        <div class="ga-field">
          <label for="setup-sel-game-btn">Board game</label>
          ${renderDropdown({
            id: "setup-sel-game",
            value: room.gameId,
            options: [...SETUP_GAME_DROPDOWN_OPTIONS],
          })}
        </div>

        ${
          room.gameId === "seven_wonders"
            ? `
          <div class="ga-field">
            <label for="setup-sel-wonderside-btn">Wonder boards</label>
            ${renderDropdown({
              id: "setup-sel-wonderside",
              value: room.config.wonderSideMode ?? "random",
              options: [
                {
                  value: "random",
                  label: "Random Day (A) or Night (B)",
                  meta: "Official mix",
                },
                {
                  value: "day",
                  label: "Day side (A) — balanced classic",
                  meta: "3 stages",
                },
                {
                  value: "night",
                  label: "Night side (B) — asymmetric powers",
                  meta: "2–4 stages",
                },
              ],
            })}
            <p class="t-small muted">Choose symmetric 3-stage Day boards, asymmetric Night powers, or a random flip per seat.</p>
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
            <label for="setup-sel-scenario-btn">Catan scenario</label>
            ${renderDropdown({
              id: "setup-sel-scenario",
              value: mapScenarioId,
              options: getCatanScenarioDropdownOptions(),
            })}
            <p class="t-small muted">${
              SCENARIO_CATALOG[mapScenarioId].description
            }${
              room.players.length >= 5
                ? " (5–6 Player Extension active automatically.)"
                : ""
            }</p>
          </div>
        `;
              })()
            : ""
        }

        <div class="ga-field">
          <label for="setup-sel-bots-btn">Bots to add</label>
          ${renderDropdown({
            id: "setup-sel-bots",
            value: String(room.botCount),
            options: botCountOptions,
          })}
          <p class="t-small muted">
            ${
              room.allBots
                ? `${room.botCount} bots seated (${bounds.minPlayers}–${bounds.maxPlayers} players required).`
                : `${humanCount} ${humanCount === 1 ? "human" : "humans"} + ${room.botCount} ${room.botCount === 1 ? "bot" : "bots"} = <strong>${room.players.length} total ${room.players.length === 1 ? "player" : "players"}</strong> (${bounds.minPlayers}–${bounds.maxPlayers} required).`
            }
          </p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-starting-player-btn">Starting player</label>
          ${renderDropdown({
            id: "setup-sel-starting-player",
            value: startingPlayerOptions.some(
              (o) => o.value === effectiveStartingValue
            )
              ? effectiveStartingValue
              : "random",
            options: startingPlayerOptions,
          })}
          <p class="t-small muted">Any seated guest, local friend, or bot can take the opening turn.</p>
        </div>

        <div class="ga-field">
          <label for="setup-sel-bot-difficulty-btn">Bot strength</label>
          ${renderDropdown({
            id: "setup-sel-bot-difficulty",
            value: room.botDifficulty,
            options: (
              ["easy", "normal", "smart", "master"] as BotDifficulty[]
            ).map((d) => ({
              value: d,
              label: BOT_DIFFICULTY_META[d].label,
              meta: BOT_DIFFICULTY_META[d].badge,
            })),
          })}
          <p class="t-small muted">${BOT_DIFFICULTY_META[room.botDifficulty].desc}</p>
        </div>

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
            <span>Cities &amp; Knights (commodities, knights, metropolises &amp; progress cards)</span>
            <input type="checkbox" id="setup-chk-citiesknights" ${
              ckChecked ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-harbormaster">
            <span>Harbormaster (+2 VP at 3 harbor points)</span>
            <input type="checkbox" id="setup-chk-harbormaster" ${
              room.config.enableHarbormaster ? "checked" : ""
            } />
          </label>
          <label class="ga-check-row" for="setup-chk-citywalls">
            <span>City walls (+2 safe hand limit on 7)</span>
            <input type="checkbox" id="setup-chk-citywalls" ${
              room.config.enableCityWalls || ckChecked ? "checked" : ""
            } ${ckChecked ? "disabled" : ""} />
          </label>
          <label class="ga-check-row" for="setup-chk-friendlyrobber">
            <span>Friendly robber (protects players at 2 VP or below)</span>
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
