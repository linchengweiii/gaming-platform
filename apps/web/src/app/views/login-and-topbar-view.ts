import { USER_PROFILES } from "../../config/app-config.ts";
import {
  type SupportedLocale,
  getLocaleDropdownOptions,
  t,
} from "../../i18n/index.ts";
import {
  BRAND_MARK_SVG,
  DRAWN_ARROW_SVG,
  escapeAttr,
  renderDropdown,
} from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import { getRoomListPure } from "../helpers/room-queries.ts";
import type { AppModel, DropdownOption } from "../types.ts";

const LOCALE_GLOBE_SVG = `<svg class="ga-locale-picker__icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.3"/><ellipse cx="8" cy="8" rx="2.9" ry="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M2.2 6h11.6M2.2 10h11.6" stroke="currentColor" stroke-width="1.2"/></svg>`;

function renderLocaleSwitcherPure(locale: SupportedLocale): string {
  return `<div class="ga-locale-picker" aria-label="${escapeAttr(t(locale, "locale.ariaLabel"))}">${LOCALE_GLOBE_SVG}${renderDropdown({
    id: "sel-locale",
    value: locale,
    size: "sm",
    inline: true,
    align: "end",
    title: t(locale, "locale.switchTitle"),
    options: getLocaleDropdownOptions(),
  })}</div>`;
}

export function renderLoginViewPure(model: Readonly<AppModel>): string {
  const locale = model.locale;
  const enterAttr = model.loginHeroEnteredOnce ? "" : "data-enter";
  const heroTitle = model.addingAdditionalGuest
    ? t(locale, "login.heroTitleAddGuest")
    : t(locale, "login.heroTitleDefault");
  const heroLead = model.addingAdditionalGuest
    ? t(locale, "login.heroLeadAddGuest")
    : t(locale, "login.heroLeadDefault");

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
            <span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "login.guestAccess"))}</span>
            ${renderLocaleSwitcherPure(locale)}
          </div>
        </div>
      </header>

      <main class="wrap ga-login-shell" ${enterAttr}>
        <div class="ga-login-copy">
          <h1 class="ga-lobby-hero__title">${escapeAttr(heroTitle)}</h1>
          <p class="t-lead muted">${escapeAttr(heroLead)}</p>
          <dl class="ga-lobby-stats">
            <div class="ga-lobby-stat">
              <dt>${escapeAttr(t(locale, "login.statGames"))}</dt>
              <dd class="ga-num">4</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>${escapeAttr(t(locale, "login.statSeats"))}</dt>
              <dd class="ga-num">2–7</dd>
            </div>
            <div class="ga-lobby-stat">
              <dt>${escapeAttr(t(locale, "login.statModes"))}</dt>
              <dd class="ga-num">${escapeAttr(t(locale, "login.statModesValue"))}</dd>
            </div>
          </dl>
        </div>

        <form id="form-guest-login" class="ga-surface-card ga-login-card" novalidate>
          <div class="ga-section-bar">
            <h2>${escapeAttr(
              model.addingAdditionalGuest
                ? t(locale, "login.cardTitleAddGuest")
                : t(locale, "login.cardTitleSignIn")
            )}</h2>
            <span class="ga-chip ga-chip--accent">${escapeAttr(t(locale, "login.guestMode"))}</span>
          </div>

          ${
            model.pendingInviteRoomId && !model.addingAdditionalGuest
              ? `<div class="ga-notice ga-notice--accent">
                   ${t(locale, "login.joiningRoomNotice", {
                     roomHash: `<strong class="ga-num">${escapeAttr(
                       formatRoomHashLabelPure(model.pendingInviteRoomId)
                     )}</strong>`,
                   })}
                 </div>`
              : ""
          }

          <div class="ga-field">
            <label for="inp-guest-name">${escapeAttr(t(locale, "login.displayNameLabel"))}</label>
            <input
              type="text"
              id="inp-guest-name"
              class="ga-input"
              maxlength="28"
              value="${escapeAttr(model.loginDraftName)}"
              placeholder="${escapeAttr(t(locale, "login.displayNamePlaceholder"))}"
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
                  ? escapeAttr(t(locale, "login.submitAddGuest"))
                  : model.pendingInviteRoomId
                    ? escapeAttr(
                        t(locale, "login.submitJoinRoom", {
                          roomHash: formatRoomHashLabelPure(
                            model.pendingInviteRoomId
                          ),
                        })
                      )
                    : escapeAttr(t(locale, "login.submitContinue"))
              }${DRAWN_ARROW_SVG}
            </button>

            ${
              !model.addingAdditionalGuest
                ? `
                  <button type="button" id="btn-start-solo-game" class="btn btn--secondary" style="width: 100%;">
                    ${escapeAttr(t(locale, "login.startSolo"))}
                  </button>
                  <button type="button" id="btn-start-offline-local" class="btn btn--secondary" style="width: 100%;">
                    ${escapeAttr(t(locale, "login.startOfflineLocal"))}
                  </button>
                `
                : `<button type="button" id="btn-cancel-add-guest" class="btn btn--secondary" style="width: 100%;">${escapeAttr(t(locale, "common.cancel"))}</button>`
            }
          </div>

          ${
            model.deviceGuests.length > 0
              ? `
                <div class="ga-saved-guests">
                  <span class="t-label muted">${escapeAttr(t(locale, "login.savedGuestsHeading"))}</span>
                  <div class="ga-saved-guests__list">
                    ${model.deviceGuests
                      .map((g) => {
                        const removeLabel = t(
                          locale,
                          "login.removeSavedGuestLabel",
                          { name: g.name }
                        );
                        return `
                          <span style="display: inline-flex; align-items: center; gap: 2px;">
                            <button type="button" data-select-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm">
                              ${escapeAttr(g.name)}
                            </button>
                            <button type="button" data-remove-saved-guest="${escapeAttr(g.id)}" class="btn btn--secondary btn--sm" aria-label="${escapeAttr(removeLabel)}" title="${escapeAttr(removeLabel)}">×</button>
                          </span>
                        `;
                      })
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }

          <p class="t-small muted">
            ${escapeAttr(t(locale, "login.footerHint"))}
          </p>
        </form>
      </main>
    `;
}

export function renderTopbarUserSelectorPure(model: Readonly<AppModel>): string {
  const locale = model.locale;
  const allRooms = getRoomListPure(model);
  const candidateProfiles: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly fallbackMeta: string;
  }> = [
    {
      id: model.currentUserId,
      name: model.currentUserName,
      fallbackMeta: t(locale, "common.active"),
    },
    ...model.deviceGuests.map((g) => ({
      id: g.id,
      name: g.name,
      fallbackMeta: t(locale, "common.guest"),
    })),
    ...(!model.useServerBackend && !model.staticHostOnly
      ? USER_PROFILES.map((u) => ({
          id: u.id,
          name: u.name,
          fallbackMeta:
            u.id === "p1" ? t(locale, "common.host") : t(locale, "common.guest"),
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
                  ? t(locale, "topbar.roomsHostedOne")
                  : t(locale, "topbar.roomsHostedMany", { count: hostedCount })
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
            ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "topbar.soloLocalChip"))}</span>`
            : model.useServerBackend && !model.serverReachable
              ? `<span class="ga-chip ga-chip--warn">${escapeAttr(t(locale, "topbar.offlineModeChip"))}</span>`
              : ""
        }
        <label class="ga-inline-label" for="sel-user-identity-btn">${escapeAttr(t(locale, "common.guest"))}</label>
        ${
          model.editingGuestName
            ? `<form id="form-rename-guest" style="display: inline-flex; align-items: center; gap: 4px; margin: 0;">
                 <input
                   type="text"
                   id="inp-rename-guest"
                   class="ga-input"
                   maxlength="28"
                   value="${escapeAttr(model.guestRenameDraft)}"
                   aria-label="${escapeAttr(t(locale, "login.displayNameLabel"))}"
                   placeholder="${escapeAttr(t(locale, "topbar.displayNamePlaceholder"))}"
                   style="height: 30px; width: 144px; padding: 0 8px; font-size: 13px;"
                 />
                 <button type="submit" id="btn-save-guest-name" class="btn btn--primary btn--sm">${escapeAttr(t(locale, "common.save"))}</button>
                 <button type="button" id="btn-cancel-guest-name" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.cancel"))}</button>
               </form>`
            : `${renderDropdown({
                id: "sel-user-identity",
                value: model.currentUserId,
                size: "sm",
                inline: true,
                align: "end",
                title: t(locale, "topbar.switchGuestTitle"),
                options,
              })}
              <button type="button" id="btn-edit-guest-name" class="btn btn--secondary btn--sm" title="${escapeAttr(
                t(locale, "topbar.renameTitle", { name: model.currentUserName })
              )}">${escapeAttr(t(locale, "topbar.rename"))}</button>`
        }
        <button type="button" id="btn-add-guest" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "topbar.newGuest"))}</button>
        <button type="button" id="btn-sign-out" class="btn btn--secondary btn--sm" title="${escapeAttr(
          t(locale, "topbar.signOutTitle", { name: model.currentUserName })
        )}">${escapeAttr(t(locale, "topbar.signOut"))}</button>
        ${renderLocaleSwitcherPure(locale)}
      </div>
    `;
}
