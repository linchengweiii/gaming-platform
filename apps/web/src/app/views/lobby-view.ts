import { SCENARIO_CATALOG } from "@gaming-platform/catan";
import { renderReferenceGuideModalPure } from "../../tutorials.ts";
import { GAME_TITLE_BY_ID } from "../../config/app-config.ts";
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
          { value: "online", label: "Online room", meta: "Live sync" },
          {
            value: "offline",
            label: "Offline local",
            meta: "Solo & friends",
          },
        ]
      : [
          {
            value: "offline",
            label: "Offline local",
            meta: "Solo & friends",
          },
        ];

  const renderOpenBadge = (g: SupportedGameId, seats: string): string => {
    const cnt = countOpenForGame(g);
    return cnt > 0
      ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span class="ga-chip ga-chip--ok ga-num">${cnt} open</span><span class="ga-chip">${seats}</span></span>`
      : `<span class="ga-chip">${seats}</span>`;
  };

  return `
      <header class="ga-nav">
        <div class="ga-nav__inner">
          <div class="ga-brand" role="banner">
            ${BRAND_MARK_SVG}
            <div class="ga-brand__meta">
              <span>Game Arena</span>
              <span class="ga-brand__sub">Online and local tabletop rooms</span>
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
                  <span class="game-select-card__title">Settlers of Catan</span>
                  ${renderOpenBadge("catan", "2–6P")}
                </div>
                <span class="game-select-card__desc">Base island, 5–6 player extension, Seafarers, Cities &amp; Knights, and Harbormaster.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="catan" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="catan" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "splendor" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="splendor">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">Splendor</span>
                  ${renderOpenBadge("splendor", "2–4P")}
                </div>
                <span class="game-select-card__desc">Draft gem tokens, acquire mine cards across three tiers, and earn 15 prestige points.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="splendor" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="splendor" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "azul" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="azul">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">Azul</span>
                  ${renderOpenBadge("azul", "2–4P")}
                </div>
                <span class="game-select-card__desc">Draft ceramic tiles from factory displays to score rows and columns on a 5×5 wall.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="azul" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="azul" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>

            <div class="game-select-card ${
              model.lobbyGameFilter === "seven_wonders" ? "selected" : ""
            }">
              <button type="button" class="game-select-card__main" data-lobby-filter="seven_wonders">
                <div class="game-select-card__top">
                  <span class="game-select-card__title">7 Wonders</span>
                  ${renderOpenBadge("seven_wonders", "3–7P")}
                </div>
                <span class="game-select-card__desc">Draft structures across three Ages, trade with neighbors, wage war, and build your Wonder.</span>
              </button>
              <div class="game-select-card__actions">
                <button type="button" data-start-tutorial="seven_wonders" class="btn btn--secondary btn--sm">Tutorial</button>
                <button type="button" data-open-guide="seven_wonders" class="btn btn--secondary btn--sm">Rules</button>
              </div>
            </div>
          </div>
        </div>

        <div class="ga-surface-card">
          <div class="ga-section-bar">
            <div style="display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h2>Open rooms</h2>
              <span class="ga-chip ga-num">${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} · ${roomsList.length}</span>
            </div>
            <div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${renderDropdown({
                id: "sel-create-room-mode",
                value: effectiveMode,
                size: "sm",
                inline: true,
                align: "end",
                title: "Choose online multiplayer or offline local table",
                options: modeOptions,
              })}
              <button type="button" id="btn-create-room" class="btn btn--primary btn--sm">
                + Create ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} room
              </button>
            </div>
          </div>

          ${
            roomsList.length === 0
              ? `
                <div class="ga-empty-rooms">
                  <p class="t-body" style="color: var(--ink); font-weight: 500;">No open ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} rooms right now.</p>
                  <p class="t-small muted">Click <strong>+ Create ${escapeAttr(GAME_TITLE_BY_ID[model.lobbyGameFilter])} room</strong> above to open a room with a shareable invite link.</p>
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
                          ? `Catan · ${SCENARIO_CATALOG[r.config.scenarioId].name}`
                          : r.gameId === "splendor"
                            ? "Splendor"
                            : r.gameId === "seven_wonders"
                              ? "7 Wonders"
                              : "Azul";
                      const statusBadge =
                        r.status === "lobby"
                          ? `<span class="ga-chip ga-chip--ok">Open</span>`
                          : r.status === "in_progress"
                            ? `<span class="ga-chip ga-chip--warn">In progress</span>`
                            : `<span class="ga-chip">Finished</span>`;
                      const modeChip = r.isOfflineLocal
                        ? `<span class="ga-chip ga-chip--ok">Offline local</span>`
                        : `<span class="ga-chip">Online room</span>`;
                      const hostChipLabel = isOwner
                        ? "Owner: You · editable"
                        : `Host: ${escapeAttr(r.ownerName)}`;
                      const humanCount = r.players.filter(
                        (p) => !p.isBot
                      ).length;
                      const botCount = r.players.length - humanCount;
                      const seatSummary =
                        humanCount === 0
                          ? `${botCount} ${botCount === 1 ? "bot" : "bots"}`
                          : `${r.players.length} ${r.players.length === 1 ? "player" : "players"} (${humanCount} ${humanCount === 1 ? "human" : "humans"}, ${botCount} ${botCount === 1 ? "bot" : "bots"})`;
                      const bounds = getRoomBoundsPure(r);
                      const canDirectStart =
                        isOwner && r.players.length >= bounds.minPlayers;

                      return `
                        <div class="room-card ${isOwner ? "owned-by-me" : ""}">
                          <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                              <span class="room-card__title ga-num">Room ${escapeAttr(hashLabel)}</span>
                              ${statusBadge}
                            </div>
                            <div class="room-card__meta">
                              ${modeChip}
                              ${
                                r.isPrivate
                                  ? `<span class="ga-chip ga-chip--warn">Private · Link only</span>`
                                  : ""
                              }
                              <span class="ga-chip">${gameBadge}</span>
                              <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">
                                ${hostChipLabel}
                              </span>
                              ${
                                isJoinedGuest
                                  ? `<span class="ga-chip ga-chip--ok">Joined</span>`
                                  : ""
                              }
                            </div>
                            <div class="room-card__seats">
                              ${seatSummary}: ${r.players
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
                                    ${
                                      isOwner
                                        ? r.status === "finished"
                                          ? "Configure rematch"
                                          : "Configure setup"
                                        : isJoinedGuest
                                          ? "Open room"
                                          : "Join room"
                                    }
                                  </button>
                                  ${
                                    !r.isOfflineLocal
                                      ? `<button type="button" data-copy-room-link="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm ga-num" title="Copy direct invite link for Room ${escapeAttr(hashLabel)}">${isCopied ? "Copied ✓" : "Copy link"}</button>`
                                      : ""
                                  }
                                  ${
                                    isOwner
                                      ? `<button type="button" data-start-room-direct="${escapeAttr(r.roomId)}" class="btn btn--secondary btn--sm" ${
                                          !canDirectStart ? "disabled" : ""
                                        }>Start match</button>`
                                      : ""
                                  }`
                                : `<button type="button" data-join-room="${escapeAttr(r.roomId)}" class="btn ${
                                    isOwner || isJoinedGuest
                                      ? "btn--primary"
                                      : "btn--secondary"
                                  } btn--sm" style="flex: 1;">
                                    ${
                                      isOwner || isJoinedGuest
                                        ? "Rejoin match"
                                        : "Spectate"
                                    }
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
          ? renderReferenceGuideModalPure(model.guideModalGameId, false)
          : ""
      }
    `;
}
