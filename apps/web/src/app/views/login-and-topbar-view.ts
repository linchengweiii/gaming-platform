import { USER_PROFILES } from "../../config/app-config.ts";
import {
  BRAND_MARK_SVG,
  DRAWN_ARROW_SVG,
  escapeAttr,
  renderDropdown,
} from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import { getRoomListPure } from "../helpers/room-queries.ts";
import type { AppModel, DropdownOption } from "../types.ts";

export function renderLoginViewPure(model: Readonly<AppModel>): string {
  const enterAttr = model.loginHeroEnteredOnce ? "" : "data-enter";
  const heroTitle = model.addingAdditionalGuest
    ? "Add another guest on this computer."
    : "Enter Game Arena as a guest.";
  const heroLead = model.addingAdditionalGuest
    ? "Create a second guest profile on this computer to host another table or join an open room."
    : "Sign in as a guest to host an online table, represent multiple hosts on one computer, or play offline with local friends.";

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
            <span class="ga-chip ga-chip--ok">Guest access</span>
          </div>
        </div>
      </header>

      <main class="wrap ga-login-shell" ${enterAttr}>
        <div class="ga-login-copy">
          <h1 class="ga-lobby-hero__title">${heroTitle}</h1>
          <p class="t-lead muted">${heroLead}</p>
          <dl class="ga-lobby-stats">
            <div class="ga-lobby-stat">
              <dt>Board games</dt>
              <dd class="ga-num">4</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Seats per table</dt>
              <dd class="ga-num">2–7</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>Play modes</dt>
              <dd class="ga-num">Online · Local</dd>
            </div>
          </dl>
        </div>

        <form id="form-guest-login" class="ga-surface-card ga-login-card" novalidate>
          <div class="ga-section-bar">
            <h2>${model.addingAdditionalGuest ? "New guest profile" : "Guest sign-in"}</h2>
            <span class="ga-chip ga-chip--accent">Guest mode</span>
          </div>

          ${
            model.pendingInviteRoomId && !model.addingAdditionalGuest
              ? `<div class="ga-notice ga-notice--accent">
                   Joining room <strong class="ga-num">${escapeAttr(
                     formatRoomHashLabelPure(model.pendingInviteRoomId)
                   )}</strong> — enter your display name below to join directly.
                 </div>`
              : ""
          }

          <div class="ga-field">
            <label for="inp-guest-name">Guest display name</label>
            <input
              type="text"
              id="inp-guest-name"
              class="ga-input"
              maxlength="28"
              value="${escapeAttr(model.loginDraftName)}"
              placeholder="Enter your display name"
              autocomplete="nickname"
            />
          </div>

          ${
            model.loginErrorMsg
              ? `<div id="login-error" class="ga-login-error" role="alert">${escapeAttr(model.loginErrorMsg)}</div>`
              : ""
          }

          <div style="display: flex; flex-direction: column; gap: var(--s-2);">
            <button type="submit" id="btn-guest-login" class="btn btn--primary" style="width: 100%;">
              ${
                model.addingAdditionalGuest
                  ? "Save and switch guest"
                  : model.pendingInviteRoomId
                    ? `Join ${escapeAttr(formatRoomHashLabelPure(model.pendingInviteRoomId))}`
                    : "Continue as guest"
              }${DRAWN_ARROW_SVG}
            </button>

            ${
              !model.addingAdditionalGuest
                ? `
                  <button type="button" id="btn-start-solo-game" class="btn btn--secondary" style="width: 100%;">
                    Start solo game with bots
                  </button>
                  <button type="button" id="btn-start-offline-local" class="btn btn--secondary" style="width: 100%;">
                    Play offline with local friends
                  </button>
                `
                : `<button type="button" id="btn-cancel-add-guest" class="btn btn--secondary" style="width: 100%;">Cancel</button>`
            }
          </div>

          ${
            model.deviceGuests.length > 0
              ? `
                <div class="ga-saved-guests">
                  <span class="t-label muted">Guests on this computer</span>
                  <div class="ga-saved-guests__list">
                    ${model.deviceGuests
                      .map(
                        (g) => `
                          <span style="display: inline-flex; align-items: center; gap: 2px;">
                            <button type="button" data-select-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm">
                              ${escapeAttr(g.name)}
                            </button>
                            <button type="button" data-remove-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm" aria-label="Sign out and remove ${escapeAttr(g.name)}" title="Sign out and remove ${escapeAttr(g.name)}">×</button>
                          </span>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }

          <p class="t-small muted">
            Play solo against tabletop bots, pass and play offline with local friends, or add multiple guest profiles on one computer.
          </p>
        </form>
      </main>
    `;
}

export function renderTopbarUserSelectorPure(model: Readonly<AppModel>): string {
  const allRooms = getRoomListPure(model);
  const candidateProfiles: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly fallbackMeta: string;
  }> = [
    {
      id: model.currentUserId,
      name: model.currentUserName,
      fallbackMeta: "Active",
    },
    ...model.deviceGuests.map((g) => ({
      id: g.id,
      name: g.name,
      fallbackMeta: "Guest",
    })),
    ...(!model.useServerBackend && !model.staticHostOnly
      ? USER_PROFILES.map((u) => ({
          id: u.id,
          name: u.name,
          fallbackMeta: u.roleHint,
        }))
      : []),
  ];

  const options = candidateProfiles.reduce<{
    readonly seen: ReadonlySet<string>;
    readonly list: DropdownOption[];
  }>(
    (acc, candidate) => {
      if (!candidate.id || acc.seen.has(candidate.id)) {
        return acc;
      }
      const hostedCount = allRooms.filter(
        (r) => r.ownerId === candidate.id
      ).length;
      const nextSeen = new Set(acc.seen);
      nextSeen.add(candidate.id);
      return {
        seen: nextSeen,
        list: [
          ...acc.list,
          {
            value: candidate.id,
            label: candidate.name,
            meta:
              hostedCount > 0
                ? hostedCount === 1
                  ? "1 room"
                  : `${hostedCount} rooms`
                : candidate.fallbackMeta,
          },
        ],
      };
    },
    { seen: new Set<string>(), list: [] }
  ).list;

  return `
      <div class="ga-topbar-user-group" style="display: inline-flex; align-items: center; gap: 8px;">
        ${
          model.staticHostOnly
            ? `<span class="ga-chip ga-chip--ok">Solo and local play</span>`
            : model.useServerBackend && !model.serverReachable
              ? `<span class="ga-chip ga-chip--warn">Offline mode</span>`
              : ""
        }
        <label class="ga-inline-label" for="sel-user-identity-btn">Guest</label>
        ${
          model.editingGuestName
            ? `<form id="form-rename-guest" style="display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                 <input
                   type="text"
                   id="inp-rename-guest"
                   class="ga-input"
                   maxlength="28"
                   value="${escapeAttr(model.guestRenameDraft)}"
                   aria-label="Guest display name"
                   placeholder="Display name"
                   style="height: 30px; width: 144px; padding: 0 8px; font-size: 13px;"
                 />
                 <button type="submit" id="btn-save-guest-name" class="btn btn--primary btn--sm">Save</button>
                 <button type="button" id="btn-cancel-guest-name" class="btn btn--secondary btn--sm">Cancel</button>
               </form>`
            : `${renderDropdown({
                id: "sel-user-identity",
                value: model.currentUserId,
                size: "sm",
                inline: true,
                align: "end",
                title: "Switch between guest profiles on this computer",
                options,
              })}
              <button type="button" id="btn-edit-guest-name" class="btn btn--secondary btn--sm" title="Rename ${escapeAttr(model.currentUserName)}">Rename</button>`
        }
        <button type="button" id="btn-add-guest" class="btn btn--secondary btn--sm">New guest</button>
        <button type="button" id="btn-sign-out" class="btn btn--secondary btn--sm" title="End ${escapeAttr(model.currentUserName)}'s guest session and clean up their rooms">Sign out</button>
      </div>
    `;
}
