import { renderAzulTile } from "../azul-view.ts";
import { type SupportedLocale, t } from "../i18n/index.ts";
import {
  renderSwCoinSvg,
  renderSwResourceBadge,
  renderSwScienceIconSvg,
  renderSwShieldSvg,
} from "../seven-wonders-view.ts";
import { renderSplendorGemToken } from "../splendor-view.ts";
import type { TutorialGameId } from "./types.ts";

function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderOtherGameVisualReferenceHtml(
  gameId: Exclude<TutorialGameId, "catan">,
  locale: SupportedLocale = "en"
): string {
  if (gameId === "splendor") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.sp.turnHeading"))}</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("emerald", 1, 24, "", 0, undefined, locale)}${renderSplendorGemToken("sapphire", 1, 24, "", 0, undefined, locale)}${renderSplendorGemToken("ruby", 1, 24, "", 0, undefined, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.sp.step1Title"))}</strong>
              <span>${esc(t(locale, "guideVis.sp.step1Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("diamond", 2, 26, "", 0, undefined, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.sp.step2Title"))}</strong>
              <span>${esc(t(locale, "guideVis.sp.step2Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderSplendorGemToken("gold", 1, 26, "", 0, undefined, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.sp.step3Title"))}</strong>
              <span>${esc(t(locale, "guideVis.sp.step3Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--accent ga-num">+VP</span></span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.sp.step4Title"))}</strong>
              <span>${esc(t(locale, "guideVis.sp.step4Desc"))}</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.sp.stacksLabel"))}</strong>
            <span class="t-label ga-num">${esc(t(locale, "guideVis.sp.stacksVal"))}</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.sp.limitsLabel"))}</strong>
            <span class="t-label ga-num">${esc(t(locale, "guideVis.sp.limitsVal"))}</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.sp.noblesLabel"))}</strong>
            <span class="ga-chip ga-chip--warn ga-num">${esc(t(locale, "guideVis.sp.noblesVal"))}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (gameId === "azul") {
    return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.az.phasesHeading"))}</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("blue", 22, false, false, "", false, locale)}${renderAzulTile("blue", 22, false, false, "", false, locale)}${renderAzulTile("yellow", 22, false, true, "", false, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.az.step1Title"))}</strong>
              <span>${esc(t(locale, "guideVis.az.step1Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("red", 22, false, false, "", false, locale)}${renderAzulTile("red", 22, false, false, "", false, locale)}${renderAzulTile("red", 22, false, false, "", true, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.az.step2Title"))}</strong>
              <span>${esc(t(locale, "guideVis.az.step2Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderAzulTile("teal", 22, false, false, "", false, locale)}${renderAzulTile("black", 22, false, false, "", false, locale)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.az.step3Title"))}</strong>
              <span>${esc(t(locale, "guideVis.az.step3Desc"))}</span>
            </div>
          </div>
        </div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.az.factoriesLabel"))}</strong>
            <span class="t-label ga-num">${esc(t(locale, "guideVis.az.factoriesVal"))}</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.az.rowColLabel"))}</strong>
            <span class="ga-chip ga-chip--ok ga-num">${esc(t(locale, "guideVis.az.rowColVal"))}</span>
          </div>
          <div class="ga-guide-recipe">
            <strong style="font-size:12px;">${esc(t(locale, "guideVis.az.colorLabel"))}</strong>
            <span class="ga-chip ga-chip--warn ga-num">${esc(t(locale, "guideVis.az.colorVal"))}</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="ga-guide-visual">
      <div class="ga-guide-section-label">${esc(t(locale, "guideVis.sw.turnHeading"))}</div>
      <div class="ga-guide-flow">
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwResourceBadge("wood", 1, true, locale)}${renderSwResourceBadge("glass", 1, true, locale)}</span>
          <div class="ga-guide-flow__copy">
            <strong>${esc(t(locale, "guideVis.sw.step1Title"))}</strong>
            <span>${esc(t(locale, "guideVis.sw.step1Desc"))}</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon"><span class="ga-chip ga-chip--warn">${esc(t(locale, "guideVis.sw.step2Chip"))}</span></span>
          <div class="ga-guide-flow__copy">
            <strong>${esc(t(locale, "guideVis.sw.step2Title"))}</strong>
            <span>${esc(t(locale, "guideVis.sw.step2Desc"))}</span>
          </div>
        </div>
        <div class="ga-guide-flow__step">
          <span class="ga-guide-flow__icon">${renderSwCoinSvg(20)}<span class="t-label ga-num" style="color:#fde047;">+3c</span></span>
          <div class="ga-guide-flow__copy">
            <strong>${esc(t(locale, "guideVis.sw.step3Title"))}</strong>
            <span>${esc(t(locale, "guideVis.sw.step3Desc"))}</span>
          </div>
        </div>
      </div>
      <div class="ga-guide-recipes">
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwShieldSvg(18)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.sw.militaryLabel"))}</strong></span>
          <span class="t-label ga-num">${esc(t(locale, "guideVis.sw.militaryVal"))}</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwScienceIconSvg("compass", 16)}${renderSwScienceIconSvg("gear", 16)}${renderSwScienceIconSvg("tablet", 16)}</span>
          <span class="t-label ga-num">${esc(t(locale, "guideVis.sw.scienceVal"))}</span>
        </div>
        <div class="ga-guide-recipe">
          <span class="ga-guide-recipe__left">${renderSwCoinSvg(17)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.sw.vpCategoriesLabel"))}</strong></span>
          <span class="t-label ga-num">${esc(t(locale, "guideVis.sw.vpCategoriesVal"))}</span>
        </div>
      </div>
    </div>
  `;
}
