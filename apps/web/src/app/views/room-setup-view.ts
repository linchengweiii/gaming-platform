import {
  getBotDifficultyMetaLocalized,
  t,
} from "../../i18n/index.ts";
import { renderReferenceGuideModalPure } from "../../tutorials.ts";
import { DRAWN_ARROW_SVG, escapeAttr } from "../helpers/html-and-dropdown.ts";
import {
  getRoomBoundsPure,
  getRoomStatePure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom, DropdownOption } from "../types.ts";
import {
  renderRoomHeaderPure,
  renderSetupSummaryCardPure,
} from "./room-header-and-summary.ts";
import { renderRoomSetupControlsCardPure } from "./room-setup-controls.ts";

export function renderRoomSetupViewPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): {
  readonly html: string;
  readonly canEditSetup: boolean;
  readonly maxBots: number;
} {
  const locale = model.locale;
  const isOwner = Boolean(room.ownerId && room.ownerId === model.currentUserId);
  const isEditablePhase =
    room.status === "lobby" || room.status === "finished";
  const canEditSetup = isOwner && isEditablePhase;
  const bounds = getRoomBoundsPure(room);
  const humanCount = room.humanPlayers.length;
  const maxBots = room.allBots
    ? bounds.maxPlayers
    : Math.max(0, bounds.maxPlayers - humanCount);
  const minBots = room.allBots ? bounds.minPlayers : 0;

  const botCountOptions: DropdownOption[] = Array.from(
    { length: Math.max(0, maxBots - minBots + 1) },
    (_, idx) => {
      const b = minBots + idx;
      const totalP = room.allBots ? b : humanCount + b;
      return {
        value: String(b),
        label: room.allBots
          ? b === 1
            ? t(locale, "lobby.seatsBotsOnlyOne")
            : t(locale, "lobby.seatsBotsOnlyMany", { bots: b })
          : b === 0
            ? t(locale, "setup.zeroBotsLabel")
            : b === 1
              ? t(locale, "lobby.seatsBotsOnlyOne")
              : t(locale, "lobby.seatsBotsOnlyMany", { bots: b }),
        meta:
          locale === "en"
            ? `${totalP} ${totalP === 1 ? "player" : "players"}`
            : `${totalP} 位玩家`,
      };
    }
  );

  const effectiveStartingValue =
    room.startingPlayerMode === "first" && room.players[0]
      ? room.players[0].id
      : room.startingPlayerMode;

  const startingPlayerOptions: DropdownOption[] = [
    {
      value: "random",
      label: t(locale, "room.randomPlayer"),
      meta: t(locale, "room.fairDraw"),
    },
    ...room.players.map((p, idx) => ({
      value: p.id,
      label: t(locale, "room.seatWithName", { num: idx + 1, name: p.name }),
      meta: p.isBot
        ? t(locale, "common.bot")
        : p.id === room.ownerId
          ? t(locale, "common.host")
          : p.controllerId || room.isOfflineLocal
            ? t(locale, "common.localPlayer")
            : t(locale, "common.guest"),
    })),
  ];

  const enoughPlayersToStart = room.players.length >= bounds.minPlayers;
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const isSeatedHuman = room.humanPlayers.some(
    (p) => p.id === model.currentUserId
  );

  const neededPlayers = bounds.minPlayers - room.players.length;

  const html = `
      ${renderRoomHeaderPure(model, room, "setup")}

      <div class="ga-room-shell">
        ${
          canEditSetup
            ? renderRoomSetupControlsCardPure(
                room,
                bounds,
                humanCount,
                botCountOptions,
                effectiveStartingValue,
                startingPlayerOptions,
                locale
              )
            : renderSetupSummaryCardPure(model, room, isOwner)
        }

        <aside class="ga-surface-card">
          <div class="ga-section-bar">
            <h2>${escapeAttr(
              t(locale, "setup.tableSeats", {
                count: room.players.length,
                max: bounds.maxPlayers,
              })
            )}</h2>
            <span class="t-label muted">${escapeAttr(
              room.status === "lobby"
                ? t(locale, "common.preGame")
                : room.status === "in_progress"
                  ? t(locale, "common.inProgress")
                  : t(locale, "common.finished")
            )}</span>
          </div>

          ${
            !room.isOfflineLocal
              ? `<div class="ga-invite-bar">
                   <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                     <span class="t-label" style="color:var(--ink);font-weight:500;">${escapeAttr(
                       room.isPrivate
                         ? t(locale, "setup.privateInviteTitle")
                         : t(locale, "setup.publicInviteTitle")
                     )}</span>
                     <span class="t-label muted ga-num" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#room=${escapeAttr(
                       room.roomId
                     )}</span>
                   </div>
                   <button type="button" data-copy-room-link="${escapeAttr(
                     room.roomId
                   )}" class="btn btn--secondary btn--sm ga-num">${escapeAttr(
                     model.copiedRoomLinkId === room.roomId
                       ? t(locale, "common.copied")
                       : t(locale, "common.copyInviteLink")
                   )}</button>
                 </div>`
              : ""
          }

          <div class="ga-seat-list">
            ${room.players
              .map(
                (p, i) => `
              <div class="ga-seat-row">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="player-dot" style="background: ${p.color}"></span>
                  <span style="font-weight: 500;">${escapeAttr(
                    t(locale, "room.seatWithName", { num: i + 1, name: p.name })
                  )}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                  ${
                    p.id === room.ownerId
                      ? `<span class="ga-chip ga-chip--accent">${escapeAttr(t(locale, "common.owner"))}</span>`
                      : ""
                  }
                  ${
                    p.id === model.currentUserId
                      ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "common.you"))}</span>`
                      : ""
                  }
                  ${
                    room.offlinePlayerIds?.includes(p.id)
                      ? `<span class="ga-chip ga-chip--warn" title="${escapeAttr(t(locale, "common.offlineTooltip"))}">${escapeAttr(t(locale, "common.offline"))}</span>`
                      : ""
                  }
                  <span class="ga-chip">${escapeAttr(
                    p.isBot
                      ? `${t(locale, "common.bot")} · ${
                          getBotDifficultyMetaLocalized(
                            p.botDifficulty ?? room.botDifficulty,
                            locale
                          ).badge
                        }`
                      : p.controllerId ||
                          (room.isOfflineLocal && p.id !== room.ownerId)
                        ? t(locale, "common.localPlayer")
                        : t(locale, "common.guest")
                  )}</span>
                  ${
                    canEditSetup && !p.isBot && p.id !== room.ownerId
                      ? `<button type="button" data-remove-player="${escapeAttr(p.id)}" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.remove"))}</button>`
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>

          ${
            canEditSetup && !room.allBots
              ? `
                ${
                  room.humanPlayers.length < bounds.maxPlayers
                    ? `
                      <div class="ga-field" style="margin-top: var(--s-2);">
                        <label for="inp-local-friend-name">${escapeAttr(t(locale, "setup.addLocalFriendLabel"))}</label>
                        <div class="ga-local-friend-bar">
                          <input
                            type="text"
                            id="inp-local-friend-name"
                            class="ga-input"
                            maxlength="28"
                            value="${escapeAttr(model.localFriendDraftName)}"
                            placeholder="${escapeAttr(t(locale, "setup.friendPlaceholder"))}"
                          />
                          <button type="button" id="btn-add-local-friend" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "setup.addPlayer"))}</button>
                        </div>
                      </div>
                    `
                    : ""
                }
                <div class="ga-seat-bot-controls">
                  <span class="t-label muted">${t(locale, "setup.botsAdded", {
                    count: `<strong style="color: var(--ink);">${room.botCount}</strong>`,
                  })}</span>
                  <div style="display: inline-flex; gap: 6px;">
                    <button type="button" id="btn-seat-remove-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount <= 0 ? "disabled" : ""
                    }>${escapeAttr(t(locale, "setup.removeBot"))}</button>
                    <button type="button" id="btn-seat-add-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount >= maxBots ? "disabled" : ""
                    }>${escapeAttr(t(locale, "setup.addBot"))}</button>
                  </div>
                </div>
              `
              : ""
          }

          <div style="display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-2);">
            ${
              room.status === "in_progress"
                ? `
                  <p class="t-small muted">
                    ${escapeAttr(t(locale, "setup.returnActiveHint"))}
                  </p>
                  <button type="button" id="btn-return-active-game" class="btn btn--primary" style="width: 100%;">
                    ${escapeAttr(t(locale, "setup.returnActiveBtn"))}${DRAWN_ARROW_SVG}
                  </button>
                `
                : canEditSetup
                  ? `
                    <p class="t-small muted">
                      ${escapeAttr(
                        enoughPlayersToStart
                          ? t(locale, "setup.startLocksHint")
                          : t(locale, "setup.needMorePlayersHint", {
                              needed: neededPlayers,
                              neededWord:
                                neededPlayers === 1
                                  ? t(locale, "setup.playerOrBotOne")
                                  : t(locale, "setup.playerOrBotMany"),
                              min: bounds.minPlayers,
                            })
                      )}
                    </p>
                    <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;" ${
                      !enoughPlayersToStart ? "disabled" : ""
                    }>
                      ${escapeAttr(
                        room.status === "finished"
                          ? t(locale, "setup.startNextGame")
                          : t(locale, "lobby.startMatch")
                      )}${DRAWN_ARROW_SVG}
                    </button>
                    ${
                      hasMatchState
                        ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">${escapeAttr(t(locale, "setup.viewFinishedBoard"))}</button>`
                        : ""
                    }
                    ${
                      isSeatedHuman
                        ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">${escapeAttr(t(locale, "setup.leaveRoom"))}</button>`
                        : ""
                    }
                  `
                  : roomUsesServerPure(model, room)
                    ? `
                      <div class="ga-notice">
                        ${t(locale, "setup.waitingForHostNotice", {
                          host: `<strong>${escapeAttr(room.ownerName || t(locale, "common.theHost"))}</strong>`,
                        })}
                      </div>
                      ${
                        hasMatchState
                          ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">${escapeAttr(t(locale, "setup.viewFinishedBoard"))}</button>`
                          : ""
                      }
                      <button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">
                        ${escapeAttr(t(locale, "setup.leaveRoom"))}
                      </button>
                    `
                    : `
                      <p class="t-small muted">
                        ${escapeAttr(t(locale, "setup.enterBoardHint"))}
                      </p>
                      <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;">
                        ${escapeAttr(t(locale, "setup.enterBoardBtn"))}${DRAWN_ARROW_SVG}
                      </button>
                      ${
                        isSeatedHuman
                          ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">${escapeAttr(t(locale, "setup.leaveRoom"))}</button>`
                          : ""
                      }
                    `
            }
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:4px;border-top:1px solid var(--line);">
              <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.howToPlay"))}</button>
              <button type="button" data-start-tutorial="${room.gameId}" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.interactiveTutorial"))}</button>
            </div>
          </div>
        </aside>
      </div>
      ${
        model.guideModalGameId
          ? renderReferenceGuideModalPure(model.guideModalGameId, false, locale)
          : ""
      }
    `;

  return { html, canEditSetup, maxBots };
}
