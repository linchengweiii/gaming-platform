import {
  renderActionPieceIconSvg,
  renderDevCardIllustrationSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniTradeGoodCardSvg,
} from "../catan-graphics.ts";
import { escapeHtml as esc } from "../app/helpers/html-and-dropdown.ts";
import { type SupportedLocale, t } from "../i18n/index.ts";

export function renderCatanGuideVisualReferenceHtml(
  locale: SupportedLocale = "en"
): string {
  const mini = (good: Parameters<typeof renderMiniTradeGoodCardSvg>[0]) =>
    renderMiniTradeGoodCardSvg(good, 28, 18);
  return `
      <div class="ga-guide-visual">
        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.catan.roundStructure"))}</div>
        <div class="ga-guide-flow">
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("knight", "#dc2626", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.catan.step0Title"))}</strong>
              <span>${esc(t(locale, "guideVis.catan.step0Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderDieSvg(3, 22)}${renderDieSvg(5, 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.catan.step1Title"))}</strong>
              <span>${esc(t(locale, "guideVis.catan.step1Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("maritime_trade", "#38bdf8", 22)}${renderActionPieceIconSvg("domestic_trade", "#fde047", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.catan.step2Title"))}</strong>
              <span>${esc(t(locale, "guideVis.catan.step2Desc"))}</span>
            </div>
          </div>
          <div class="ga-guide-flow__step">
            <span class="ga-guide-flow__icon">${renderActionPieceIconSvg("settlement", "#ff4a1f", 22)}${renderActionPieceIconSvg("city", "#ff4a1f", 22)}</span>
            <div class="ga-guide-flow__copy">
              <strong>${esc(t(locale, "guideVis.catan.step3Title"))}</strong>
              <span>${esc(t(locale, "guideVis.catan.step3Desc"))}</span>
            </div>
          </div>
        </div>

        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.catan.costsHeading"))}</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("road", "#ff4a1f", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.roadLimit"))}</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("ship", "#38bdf8", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.shipLimit"))}</strong></span>
            <span class="ga-guide-recipe__cards">${mini("lumber")}${mini("wool")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("settlement", "#ff4a1f", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.settleLimit"))}</strong></span>
            <span class="ga-guide-recipe__cards">${mini("brick")}${mini("lumber")}${mini("wool")}${mini("grain")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("city", "#ff4a1f", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.cityLimit"))}</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("grain")}<span class="t-label ga-num">3×</span>${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("dev_card", "#fbbf24", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.devCard"))}</strong></span>
            <span class="ga-guide-recipe__cards">${mini("wool")}${mini("grain")}${mini("ore")}</span>
          </div>
          <div class="ga-guide-recipe">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("wall", "#fde68a", 20)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.wallLimit"))}</strong></span>
            <span class="ga-guide-recipe__cards"><span class="t-label ga-num">2×</span>${mini("brick")}</span>
          </div>
        </div>

        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.catan.devDeckHeading"))}</div>
        <div class="ga-guide-dev-grid">
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">${esc(t(locale, "guideVis.catan.devKnight"))}</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×14</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("knight")}</div>
            <span class="ga-guide-dev-card__desc">${esc(t(locale, "guideVis.catan.devKnightDesc"))}</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">${esc(t(locale, "guideVis.catan.devRoadBuild"))}</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("road_building")}</div>
            <span class="ga-guide-dev-card__desc">${esc(t(locale, "guideVis.catan.devRoadBuildDesc"))}</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">${esc(t(locale, "guideVis.catan.devYop"))}</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("year_of_plenty")}</div>
            <span class="ga-guide-dev-card__desc">${esc(t(locale, "guideVis.catan.devYopDesc"))}</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">${esc(t(locale, "guideVis.catan.devMono"))}</strong>
              <span class="ga-chip ga-num" style="height:20px;padding:0 6px;">×2</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("monopoly")}</div>
            <span class="ga-guide-dev-card__desc">${esc(t(locale, "guideVis.catan.devMonoDesc"))}</span>
          </div>
          <div class="ga-guide-dev-card">
            <div class="ga-guide-dev-card__head">
              <strong style="font-size:11.5px;color:var(--ink);">${esc(t(locale, "guideVis.catan.devVp"))}</strong>
              <span class="ga-chip ga-chip--warn ga-num" style="height:20px;padding:0 6px;">×5</span>
            </div>
            <div class="ga-guide-dev-card__art">${renderDevCardIllustrationSvg("victory_point")}</div>
            <span class="ga-guide-dev-card__desc">${esc(t(locale, "guideVis.catan.devVpDesc"))}</span>
          </div>
        </div>

        <div class="ga-guide-section-label">${esc(t(locale, "guideVis.catan.ckHeading"))}</div>
        <div class="ga-guide-recipes">
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckForestTitle"))}">
            <span class="ga-guide-recipe__cards">${mini("lumber")}<span class="t-label muted">+</span>${mini("paper")}</span>
            <span class="t-label" style="color:#4ade80;">${esc(t(locale, "guideVis.catan.ckForestLabel"))}</span>
          </div>
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckPastureTitle"))}">
            <span class="ga-guide-recipe__cards">${mini("wool")}<span class="t-label muted">+</span>${mini("cloth")}</span>
            <span class="t-label" style="color:#a3e635;">${esc(t(locale, "guideVis.catan.ckPastureLabel"))}</span>
          </div>
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckMountainTitle"))}">
            <span class="ga-guide-recipe__cards">${mini("ore")}<span class="t-label muted">+</span>${mini("coin")}</span>
            <span class="t-label" style="color:#cbd5e1;">${esc(t(locale, "guideVis.catan.ckMountainLabel"))}</span>
          </div>
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckBarbTitle"))}">
            <span class="ga-guide-recipe__left">${renderEventDieSvg("barbarian", 22)}<strong style="font-size:12px;">${esc(t(locale, "guideVis.catan.ckBarbName"))}</strong></span>
            <span class="t-label ga-num">${esc(t(locale, "guideVis.catan.ckBarbRate"))}</span>
          </div>
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckGateTitle"))}">
            <span class="ga-guide-recipe__cards">${renderEventDieSvg("trade", 20)}${renderEventDieSvg("politics", 20)}${renderEventDieSvg("science", 20)}</span>
            <span class="t-label">${esc(t(locale, "guideVis.catan.ckGateLabel"))}</span>
          </div>
          <div class="ga-guide-recipe" title="${esc(t(locale, "guideVis.catan.ckKnightTitle"))}">
            <span class="ga-guide-recipe__left">${renderActionPieceIconSvg("knight_piece", "#38bdf8", 20)}${renderActionPieceIconSvg("metropolis", "#f59e0b", 20)}</span>
            <span class="t-label">${mini("wool")}${mini("ore")} · ${esc(t(locale, "guideVis.catan.ckActPrefix"))} ${mini("grain")}</span>
          </div>
        </div>
      </div>
    `;
}
