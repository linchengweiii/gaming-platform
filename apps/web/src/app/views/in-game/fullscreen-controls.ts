import { type SupportedLocale, t } from "../../../i18n/index.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";

const FULLSCREEN_ENTER_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const FULLSCREEN_EXIT_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const FULLSCREEN_INFO_SVG = `<svg class="ga-fullscreen-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 2.5v11" stroke="currentColor" stroke-width="1.4"/></svg>`;

export function renderFullscreenBannerControlsPure(
  model: Readonly<AppModel>,
  locale: SupportedLocale
): string {
  const isFullscreen = model.boardFullscreen;
  const label = isFullscreen
    ? t(locale, "inGame.fullscreenExit")
    : t(locale, "inGame.fullscreenEnter");
  const title = isFullscreen
    ? t(locale, "inGame.fullscreenExitTitle")
    : t(locale, "inGame.fullscreenEnterTitle");
  const iconSvg = isFullscreen ? FULLSCREEN_EXIT_SVG : FULLSCREEN_ENTER_SVG;

  const infoBtnHtml = isFullscreen
    ? `<button type="button" id="btn-toggle-fullscreen-sidebar" class="btn btn--secondary btn--sm ga-btn-fullscreen-info${
        model.fullscreenSidebarOpen ? " is-selected" : ""
      }" aria-expanded="${
        model.fullscreenSidebarOpen ? "true" : "false"
      }" title="${escapeAttr(
        t(locale, "inGame.fullscreenInfoTitle")
      )}">${FULLSCREEN_INFO_SVG}<span>${escapeAttr(
        t(locale, "inGame.fullscreenInfo")
      )}</span></button>`
    : "";

  const toggleBtnHtml = `<button type="button" id="btn-toggle-fullscreen" data-toggle-fullscreen="true" class="btn btn--secondary btn--sm ga-btn-fullscreen${
    isFullscreen ? " is-selected" : ""
  }" aria-pressed="${isFullscreen ? "true" : "false"}" title="${escapeAttr(
    title
  )}">${iconSvg}<span>${escapeAttr(label)}</span></button>`;

  return `${infoBtnHtml}${toggleBtnHtml}`;
}

export function renderFullscreenSidebarHeaderPure(
  locale: SupportedLocale
): string {
  return `<div class="ga-fullscreen-drawer-head">
              <span class="ga-fullscreen-drawer-head__title">${escapeAttr(
                t(locale, "inGame.fullscreenDrawerTitle")
              )}</span>
              <button type="button" id="btn-close-fullscreen-sidebar" class="btn btn--secondary btn--sm ga-fullscreen-drawer-head__close" aria-label="${escapeAttr(
                t(locale, "inGame.fullscreenDrawerCloseAria")
              )}">×</button>
            </div>`;
}

export function renderMapFullscreenButtonPure(
  isFullscreen: boolean,
  locale: SupportedLocale
): string {
  const label = isFullscreen
    ? t(locale, "inGame.fullscreenExit")
    : t(locale, "inGame.fullscreenEnter");
  const title = isFullscreen
    ? t(locale, "inGame.fullscreenExitTitle")
    : t(locale, "inGame.fullscreenEnterTitle");
  const iconSvg = isFullscreen ? FULLSCREEN_EXIT_SVG : FULLSCREEN_ENTER_SVG;
  return `<span class="map-zoom-divider" aria-hidden="true"></span><button type="button" id="btn-map-fullscreen" data-toggle-fullscreen="true" class="map-zoom-btn map-zoom-btn--fullscreen${
    isFullscreen ? " is-active" : ""
  }" aria-label="${escapeAttr(label)}" aria-pressed="${
    isFullscreen ? "true" : "false"
  }" title="${escapeAttr(title)}">${iconSvg}</button>`;
}
