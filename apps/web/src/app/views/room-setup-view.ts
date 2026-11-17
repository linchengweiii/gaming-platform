import { renderReferenceGuideModalPure } from "../../tutorials.ts";
import { BOT_DIFFICULTY_META } from "../../config/app-config.ts";
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
  readonly bounds: { minPlayers: number; maxPlayers: number };
} {
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
          ? `${b} bots`
          : b === 0
            ? "0 bots (humans only)"
            : `${b} ${b === 1 ? "bot" : "bots"}`,
        meta: `${totalP} ${totalP === 1 ? "player" : "players"}`,
      };
    }
  );

  const effectiveStartingValue =
    room.startingPlayerMode === "first" && room.players[0]
      ? room.players[0].id
      : room.startingPlayerMode;

  const startingPlayerOptions: DropdownOption[] = [
    { value: "random", label: "Random player", meta: "Fair draw" },
    ...room.players.map((p, idx) => ({
      value: p.id,
      label: `Seat ${idx + 1} · ${p.name}`,
      meta: p.isBot
        ? "Bot"
        : p.id === room.ownerId
          ? "Host"
          : p.controllerId || room.isOfflineLocal
            ? "Local player"
            : "Guest",
    })),
  ];

  const enoughPlayersToStart = room.players.length >= bounds.minPlayers;
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const isSeatedHuman = room.humanPlayers.some(
    (p) => p.id === model.currentUserId
  );

  const editableFormCard = renderRoomSetupControlsCardPure(
    room,
    bounds,
    humanCount,
    botCountOptions,
    effectiveStartingValue,
    startingPlayerOptions
  );

  const html = `
      ${renderRoomHeaderPure(model, room, "setup")}

      <div class="ga-room-shell">
        ${canEditSetup ? editableFormCard : renderSetupSummaryCardPure(model, room, isOwner)}

        <aside class="ga-surface-card">
          <div class="ga-section-bar">
            <h2>Table seats (${room.players.length}/${bounds.maxPlayers})</h2>
            <span class="t-label muted">${
              room.status === "lobby"
                ? "Pre-game"
                : room.status === "in_progress"
                  ? "In progress"
                  : "Finished"
            }</span>
          </div>

          ${
            !room.isOfflineLocal
              ? `<div class="ga-invite-bar">
                   <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                     <span class="t-label" style="color:var(--ink);font-weight:500;">${
                       room.isPrivate
                         ? "Private room — players can only join via link"
                         : "Invite friends via direct link"
                     }</span>
                     <span class="t-label muted ga-num" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#room=${escapeAttr(
                       room.roomId
                     )}</span>
                   </div>
                   <button type="button" data-copy-room-link="${escapeAttr(
                     room.roomId
                   )}" class="btn btn--secondary btn--sm ga-num">${
                     model.copiedRoomLinkId === room.roomId
                       ? "Copied ✓"
                       : "Copy invite link"
                   }</button>
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
                  <span style="font-weight: 500;">Seat ${i + 1} · ${escapeAttr(p.name)}</span>
                </div>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                  ${
                    p.id === room.ownerId
                      ? `<span class="ga-chip ga-chip--accent">Owner</span>`
                      : ""
                  }
                  ${
                    p.id === model.currentUserId
                      ? `<span class="ga-chip ga-chip--ok">You</span>`
                      : ""
                  }
                  ${
                    room.offlinePlayerIds?.includes(p.id)
                      ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">Offline</span>`
                      : ""
                  }
                  <span class="ga-chip">${
                    p.isBot
                      ? `Bot · ${
                          BOT_DIFFICULTY_META[
                            p.botDifficulty ?? room.botDifficulty
                          ].badge
                        }`
                      : p.controllerId ||
                          (room.isOfflineLocal && p.id !== room.ownerId)
                        ? "Local player"
                        : "Guest"
                  }</span>
                  ${
                    canEditSetup && !p.isBot && p.id !== room.ownerId
                      ? `<button type="button" data-remove-player="${escapeAttr(p.id)}" class="btn btn--secondary btn--sm">Remove</button>`
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
                        <label for="inp-local-friend-name">Add local friend on this computer</label>
                        <div class="ga-local-friend-bar">
                          <input
                            type="text"
                            id="inp-local-friend-name"
                            class="ga-input"
                            maxlength="28"
                            value="${escapeAttr(model.localFriendDraftName)}"
                            placeholder="Friend's name"
                          />
                          <button type="button" id="btn-add-local-friend" class="btn btn--secondary btn--sm">Add player</button>
                        </div>
                      </div>
                    `
                    : ""
                }
                <div class="ga-seat-bot-controls">
                  <span class="t-label muted">Bots added: <strong style="color: var(--ink);">${room.botCount}</strong></span>
                  <div style="display: inline-flex; gap: 6px;">
                    <button type="button" id="btn-seat-remove-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount <= 0 ? "disabled" : ""
                    }>Remove bot</button>
                    <button type="button" id="btn-seat-add-bot" class="btn btn--secondary btn--sm" ${
                      room.botCount >= maxBots ? "disabled" : ""
                    }>Add bot</button>
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
                    Return to the active board to continue playing.
                  </p>
                  <button type="button" id="btn-return-active-game" class="btn btn--primary" style="width: 100%;">
                    Return to game board${DRAWN_ARROW_SVG}
                  </button>
                `
                : canEditSetup
                  ? `
                    <p class="t-small muted">
                      ${
                        enoughPlayersToStart
                          ? "Starting the match locks these rules until the game concludes."
                          : `Add ${bounds.minPlayers - room.players.length} more ${bounds.minPlayers - room.players.length === 1 ? "player or bot" : "players or bots"} to reach the ${bounds.minPlayers}-player minimum.`
                      }
                    </p>
                    <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;" ${
                      !enoughPlayersToStart ? "disabled" : ""
                    }>
                      ${
                        room.status === "finished"
                          ? "Start next game"
                          : "Start match"
                      }${DRAWN_ARROW_SVG}
                    </button>
                    ${
                      hasMatchState
                        ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">View finished board</button>`
                        : ""
                    }
                    ${
                      isSeatedHuman
                        ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">Leave room</button>`
                        : ""
                    }
                  `
                  : roomUsesServerPure(model, room)
                    ? `
                      <div class="ga-notice">
                        Waiting for <strong>${escapeAttr(room.ownerName || "the host")}</strong> to start the match. Your board opens automatically as soon as the game begins.
                      </div>
                      ${
                        hasMatchState
                          ? `<button type="button" id="btn-return-active-game" class="btn btn--secondary" style="width: 100%;">View finished board</button>`
                          : ""
                      }
                      <button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">
                        Leave room
                      </button>
                    `
                    : `
                      <p class="t-small muted">
                        Enter the board to play with the host's configured table rules.
                      </p>
                      <button type="button" id="btn-launch-match" class="btn btn--primary" style="width: 100%;">
                        Enter game board${DRAWN_ARROW_SVG}
                      </button>
                      ${
                        isSeatedHuman
                          ? `<button type="button" id="btn-leave-room" class="btn btn--secondary" style="width: 100%;">Leave room</button>`
                          : ""
                      }
                    `
            }
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:4px;border-top:1px solid var(--line);">
              <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">How to play</button>
              <button type="button" data-start-tutorial="${room.gameId}" class="btn btn--secondary btn--sm">Interactive tutorial</button>
            </div>
          </div>
        </aside>
      </div>
      ${
        model.guideModalGameId
          ? renderReferenceGuideModalPure(model.guideModalGameId, false)
          : ""
      }
    `;

  return { html, canEditSetup, maxBots, bounds };
}
