import {
  getCatanScenarioTextLocalized,
  getGameShortTitleLocalized,
  getGameTitleLocalized,
  t,
} from "../../i18n/index.ts";
import { renderReferenceGuideModalPure } from "../../tutorials.ts";
import {
  BRAND_MARK_SVG,
  escapeAttr,
  renderDropdown,
} from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import { getRoomBoundsPure, getRoomListPure } from "../helpers/room-queries.ts";
import type {
  AppModel,
  ClientRoom,
  DropdownOption,
  SupportedGameId,
} from "../types.ts";
import { renderTopbarUserSelectorPure } from "./login-and-topbar-view.ts";

export function renderLobbyViewPure(model: Readonly<AppModel>): string {
  const locale = model.locale;
  const allRooms = getRoomListPure(model);
  const isUserInRoom = (r: ClientRoom): boolean =>
    Boolean(
      (r.ownerId && r.ownerId === model.currentUserId) ||
        r.humanPlayers.some((p) => p.id === model.currentUserId)
    );
  const isVisibleLobbyRoom = (r: ClientRoom): boolean =>
    r.isPrivate
      ? isUserInRoom(r)
      : r.status === "lobby" || r.status === "finished" || isUserInRoom(r);
  const countOpenForGame = (g: SupportedGameId): number =>
    allRooms.filter(
      (r) =>
        r.gameId === g &&
        r.status === "lobby" &&
        (!r.isPrivate || isUserInRoom(r))
    ).length;

  const roomsList = allRooms
    .filter((r) => r.gameId === model.lobbyGameFilter && isVisibleLobbyRoom(r))
    .sort((a, b) => {
      const aOpen = a.status === "lobby" ? 0 : 1;
      const bOpen = b.status === "lobby" ? 0 : 1;
      return aOpen - bOpen;
    });

  const effectiveMode: "online" | "offline" =
    !model.useServerBackend || !model.serverReachable
      ? "offline"
      : model.createRoomMode;
  const modeOptions: DropdownOption[] =
    model.useServerBackend && model.serverReachable
      ? [
          {
            value: "online",
            label: t(locale, "common.onlineRoom"),
            meta: t(locale, "lobby.modeOnlineMeta"),
          },
          {
            value: "offline",
            label: t(locale, "common.offlineLocal"),
            meta: t(locale, "lobby.modeOfflineMeta"),
          },
        ]
      : [
          {
            value: "offline",
            label: t(locale, "common.offlineLocal"),
            meta: t(locale, "lobby.modeOfflineMeta"),
          },
        ];

  const renderOpenBadge = (g: SupportedGameId, range: string): string => {
    const cnt = countOpenForGame(g);
    const seats = t(locale, "lobby.seatsRange", { range });
    return cnt > 0
      ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span class="ga-chip ga-chip--ok ga-num">${escapeAttr(
          t(locale, "lobby.openCount", { count: cnt })
        )}</span><span class="ga-chip">${escapeAttr(seats)}</span></span>`
      : `<span class="ga-chip">${escapeAttr(seats)}</span>`;
  };

  const selectedGameTitle = getGameTitleLocalized(model.lobbyGameFilter, locale);
  const createRoomBtnLabel = t(locale, "lobby.createRoomBtn", {
    game: selectedGameTitle,
  });

  return `
      <header class="ga-nav">
        <div class="ga-nav__inner">
          <div class="ga-brand" role="banner">
            ${BRAND_MARK_SVG}
            <div class="ga-brand__meta">
              <span>${escapeAttr(t(locale, "brand.name"))}</span>
              <span class="ga-brand__sub">${escapeAttr(t(locale, "brand.subtitle"))}</span>
            </div>
          </div>
          <div class="ga-toolbar">
            ${renderTopbarUserSelectorPure(model)}
          </div>
        </div>
      </header>

      <div class="wrap ga-lobby-shell">
        <div style="display: flex; flex-direction: column; gap: var(--s-3);">
          <div class="ga-filter-grid">
            <div class="game-select-card ${
              model.lobbyGameFilter === "catan" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="catan">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">${escapeAttr(getGameTitleLocalized("catan", locale))}</span>
                  ${renderOpenBadge("catan", "2–6")}
                </div>
                <span class="game-select-card__desc">${escapeAttr(t(locale, "lobby.descCatan"))}</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="catan" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.tutorial"))}</button>
                <button type="button" data-open-guide="catan" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.rules"))}</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "splendor" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="splendor">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">${escapeAttr(getGameTitleLocalized("splendor", locale))}</span>
                  ${renderOpenBadge("splendor", "2–4")}
                </div>
                <span class="game-select-card__desc">${escapeAttr(t(locale, "lobby.descSplendor"))}</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="splendor" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.tutorial"))}</button>
                <button type="button" data-open-guide="splendor" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.rules"))}</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "azul" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="azul">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">${escapeAttr(getGameTitleLocalized("azul", locale))}</span>
                  ${renderOpenBadge("azul", "2–4")}
                </div>
                <span class="game-select-card__desc">${escapeAttr(t(locale, "lobby.descAzul"))}</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="azul" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.tutorial"))}</button>
                <button type="button" data-open-guide="azul" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.rules"))}</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "seven_wonders" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="seven_wonders">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">${escapeAttr(getGameTitleLocalized("seven_wonders", locale))}</span>
                  ${renderOpenBadge("seven_wonders", "3–7")}
                </div>
                <span class="game-select-card__desc">${escapeAttr(t(locale, "lobby.descSevenWonders"))}</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="seven_wonders" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.tutorial"))}</button>
                <button type="button" data-open-guide="seven_wonders" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.rules"))}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="ga-surface-card">
          <div class="ga-section-bar">
            <div style="display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h2>${escapeAttr(t(locale, "lobby.openRooms"))}</h2>
              <span class="ga-chip ga-num">${escapeAttr(selectedGameTitle)} · ${roomsList.length}</span>
            </div>
            <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${renderDropdown({
                id: "sel-create-room-mode",
                value: effectiveMode,
                size: "sm",
                inline: true,
                align: "end",
                title: t(locale, "lobby.chooseModeTitle"),
                options: modeOptions,
              })}
              <button type="button" id="btn-create-room" class="btn btn--primary btn--sm">
                ${escapeAttr(createRoomBtnLabel)}
              </button>
            </div>
          </div>

          ${
            roomsList.length === 0
              ? `
                <div class="ga-empty-rooms">
                  <p class="t-body" style="color: var(--ink); font-weight: 500;">${escapeAttr(
                    t(locale, "lobby.emptyRoomsTitle", {
                      game: selectedGameTitle,
                    })
                  )}</p>
                  <p class="t-small muted">${t(locale, "lobby.emptyRoomsHint", {
                    cta: `<strong>${escapeAttr(createRoomBtnLabel)}</strong>`,
                  })}</p>
                </div>
              `
              : `
                <div class="rooms-grid">
                  ${roomsList
                    .map((r) => {
                      const isOwner = Boolean(
                        r.ownerId && r.ownerId === model.currentUserId
                      );
                      const isJoinedGuest =
                        !isOwner &&
                        r.humanPlayers.some(
                          (p) => p.id === model.currentUserId
                        );
                      const hashLabel = formatRoomHashLabelPure(r.roomId);
                      const isCopied = model.copiedRoomLinkId === r.roomId;
                      const gameBadge =
                        r.gameId === "catan"
                          ? `${getGameShortTitleLocalized("catan", locale)} · ${
                              getCatanScenarioTextLocalized(
                                r.config.scenarioId,
                                locale
                              ).name
                            }`
                          : getGameTitleLocalized(r.gameId, locale);
                      const statusBadge =
                        r.status === "lobby"
                          ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "common.open"))}</span>`
                          : r.status === "in_progress"
                            ? `<span class="ga-chip ga-chip--warn">${escapeAttr(t(locale, "common.inProgress"))}</span>`
                            : `<span class="ga-chip">${escapeAttr(t(locale, "common.finished"))}</span>`;
                      const modeChip = r.isOfflineLocal
                        ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "common.offlineLocal"))}</span>`
                        : `<span class="ga-chip">${escapeAttr(t(locale, "common.onlineRoom"))}</span>`;
                      const hostChipLabel = isOwner
                        ? t(locale, "lobby.ownerYouEditable")
                        : t(locale, "lobby.hostLabel", { name: r.ownerName });
                      const humanCount = r.players.filter(
                        (p) => !p.isBot
                      ).length;
                      const botCount = r.players.length - humanCount;
                      const seatSummary =
                        humanCount === 0
                          ? botCount === 1
                            ? t(locale, "lobby.seatsBotsOnlyOne")
                            : t(locale, "lobby.seatsBotsOnlyMany", {
                                bots: botCount,
                              })
                          : t(locale, "lobby.seatsSummary", {
                              total: r.players.length,
                              playersWord:
                                r.players.length === 1
                                  ? t(locale, "lobby.wordPlayerOne")
                                  : t(locale, "lobby.wordPlayerMany"),
                              humans: humanCount,
                              humansWord:
                                humanCount === 1
                                  ? t(locale, "lobby.wordHumanOne")
                                  : t(locale, "lobby.wordHumanMany"),
                              bots: botCount,
                              botsWord:
                                botCount === 1
                                  ? t(locale, "lobby.wordBotOne")
                                  : t(locale, "lobby.wordBotMany"),
                            });
                      const bounds = getRoomBoundsPure(r);
                      const canDirectStart =
                        isOwner && r.players.length >= bounds.minPlayers;

                      return `
                        <div class="room-card ${isOwner ? "owned-by-me" : ""}">
                          <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                              <span class="room-card__title ga-num">${escapeAttr(
                                t(locale, "lobby.roomTitle", { hash: hashLabel })
                              )}</span>
                              ${statusBadge}
                            </div>
                            <div class="room-card__meta">
                              ${modeChip}
                              ${
                                r.isPrivate
                                  ? `<span class="ga-chip ga-chip--warn">${escapeAttr(t(locale, "lobby.privateLinkOnly"))}</span>`
                                  : ""
                              }
                              <span class="ga-chip">${escapeAttr(gameBadge)}</span>
                              <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">
                                ${escapeAttr(hostChipLabel)}
                              </span>
                              ${
                                isJoinedGuest
                                  ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "lobby.joined"))}</span>`
                                  : ""
                              }
                            </div>
                            <div class="room-card__seats">
                              ${escapeAttr(seatSummary)}: ${r.players
                                .map((p) => escapeAttr(p.name))
                                .join(", ")}
                            </div>
                          </div>

                          <div class="room-card__actions">
                            ${
                              r.status === "lobby" || r.status === "finished"
                                ? `<button type="button" data-join-room="${escapeAttr(r.roomId)}" class="btn ${
                                    isOwner
                                      ? "btn--primary"
                                      : "btn--secondary"
                                  } btn--sm" style="flex: 1;">
                                    ${escapeAttr(
                                      isOwner
                                        ? r.status === "finished"
                                          ? t(locale, "lobby.configureRematch")
                                          : t(locale, "lobby.configureSetup")
                                        : isJoinedGuest
                                          ? t(locale, "lobby.openRoom")
                                          : t(locale, "lobby.joinRoom")
                                    )}
                                  </button>
                                  ${
                                    !r.isOfflineLocal
                                      ? `<button type="button" data-copy-room-link="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm ga-num" title="${escapeAttr(
                                          t(locale, "lobby.copyRoomLinkTitle", {
                                            hash: hashLabel,
                                          })
                                        )}">${escapeAttr(
                                          isCopied
                                            ? t(locale, "common.copied")
                                            : t(locale, "common.copyLink")
                                        )}</button>`
                                      : ""
                                  }
                                  ${
                                    isOwner
                                      ? `<button type="button" data-start-room-direct="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm" ${
                                          !canDirectStart ? "disabled" : ""
                                        }>${escapeAttr(t(locale, "lobby.startMatch"))}</button>`
                                      : ""
                                  }`
                                : `<button type="button" data-join-room="${escapeAttr(r.roomId)}" class="btn ${
                                    isOwner || isJoinedGuest
                                      ? "btn--primary"
                                      : "btn--secondary"
                                  } btn--sm" style="flex: 1;">
                                    ${escapeAttr(
                                      isOwner || isJoinedGuest
                                        ? t(locale, "lobby.rejoinMatch")
                                        : t(locale, "lobby.spectate")
                                    )}
                                  </button>`
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `
          }
        </div>
      </div>
      ${
        model.guideModalGameId
          ? renderReferenceGuideModalPure(model.guideModalGameId, false, locale)
          : ""
      }
    `;
}
