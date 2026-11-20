import type { CatanState } from "@gaming-platform/catan";
import type { SevenWondersState } from "@gaming-platform/seven-wonders";
import { SevenWondersEngine } from "@gaming-platform/seven-wonders";
import {
  type SupportedLocale,
  getGameReferenceGuideLocalized,
  getTutorialLessonsLocalized,
  t,
} from "../i18n/index.ts";
import { renderCatanGuideVisualReferenceHtml } from "./guide-visuals-catan.ts";
import { renderOtherGameVisualReferenceHtml } from "./guide-visuals-other.ts";
import type { TutorialGameId } from "./types.ts";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderTutorialCoachBannerPure(
  gameId: TutorialGameId,
  stepIndex: number,
  canPerformStepNow: boolean,
  liveState?: any,
  liftAbovePopup = false,
  locale: SupportedLocale = "en"
): string {
  const lessons = getTutorialLessonsLocalized(gameId, locale);
  const clamped = Math.max(0, Math.min(lessons.length - 1, stepIndex));
  const lesson = lessons[clamped]!;
  const isFinalFreePlayLesson = clamped >= lessons.length - 1;
  const gameTitle = getGameReferenceGuideLocalized(gameId, locale).title;

  const contextualHint = (() => {
    if (gameId === "catan" && liveState) {
      const phase = (liveState as CatanState).phase;
      if (phase === "DISCARD_ON_SEVEN") {
        return t(locale, "tutorial.catanHintDiscard");
      }
      if (phase === "MOVE_ROBBER_OR_PIRATE") {
        return t(locale, "tutorial.catanHintRobber");
      }
      if (phase === "STEAL_RESOURCE") {
        return t(locale, "tutorial.catanHintSteal");
      }
    }
    if (gameId === "seven_wonders" && clamped === 3 && liveState) {
      const sw = liveState as SevenWondersState;
      const human = sw.players.find((p) => !p.isBot);
      if (human) {
        if (human.builtWonderStages >= 1) {
          return t(locale, "tutorial.swHintStageBuilt");
        }
        const canBuildWonderNow = SevenWondersEngine.getLegalActions(
          sw,
          human.id
        ).some((a) => a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder");
        if (!canBuildWonderNow) {
          return t(locale, "tutorial.swHintStageMissing");
        }
      }
    }
    return lesson.actionHint;
  })();

  return `
    <div class="ga-tutorial-coach${liftAbovePopup ? " ga-tutorial-coach--lifted" : ""}" role="region" aria-label="${escapeHtml(
      t(locale, "tutorial.ariaLabel", { game: gameTitle })
    )}">
      <div class="ga-tutorial-coach__top">
        <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="ga-chip ga-chip--accent ga-num">${escapeHtml(
            t(locale, "tutorial.stepChip", {
              current: clamped + 1,
              total: lessons.length,
            })
          )}</span>
          <strong style="font-size:13px;font-weight:500;color:var(--ink);">${escapeHtml(lesson.title)}</strong>
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <button type="button" id="btn-tutorial-prev" class="btn btn--secondary btn--sm" ${
            clamped === 0 ? "disabled" : ""
          }>${escapeHtml(t(locale, "tutorial.prev"))}</button>
          <button type="button" id="btn-tutorial-next" class="btn btn--secondary btn--sm" ${
            isFinalFreePlayLesson ? "disabled" : ""
          }>${escapeHtml(t(locale, "tutorial.next"))}</button>
          ${
            isFinalFreePlayLesson
              ? ""
              : `<button type="button" id="btn-tutorial-auto-step" class="btn btn--primary btn--sm" ${
                  !canPerformStepNow ? "disabled" : ""
                }>${escapeHtml(t(locale, "tutorial.performStep"))}</button>`
          }
          <button type="button" data-open-guide="${gameId}" class="btn btn--secondary btn--sm">${escapeHtml(t(locale, "tutorial.rulesSheet"))}</button>
          <button type="button" id="btn-tutorial-dismiss" class="btn ${
            isFinalFreePlayLesson ? "btn--primary" : "btn--secondary"
          } btn--sm">${escapeHtml(t(locale, "tutorial.freePlay"))}</button>
          <button type="button" id="btn-tutorial-exit" class="btn btn--secondary btn--sm">${escapeHtml(t(locale, "tutorial.exit"))}</button>
        </div>
      </div>
      <div class="ga-tutorial-coach__body">
        <span>${escapeHtml(lesson.body)}</span>
        <span class="ga-tutorial-coach__hint">${escapeHtml(contextualHint)}</span>
      </div>
    </div>
  `;
}

function renderGameVisualReferenceHtml(
  gameId: TutorialGameId,
  locale: SupportedLocale
): string {
  if (gameId === "catan") {
    return renderCatanGuideVisualReferenceHtml(locale);
  }
  return renderOtherGameVisualReferenceHtml(gameId, locale);
}

export function renderReferenceGuideModalPure(
  activeGameId: TutorialGameId,
  inActiveMatch: boolean,
  locale: SupportedLocale = "en"
): string {
  const guide = getGameReferenceGuideLocalized(activeGameId, locale);

  return `
    <div class="ga-guide-backdrop" id="ga-guide-backdrop" tabindex="-1" role="dialog" aria-modal="true" aria-label="${escapeHtml(
      t(locale, "guide.dialogAria", { game: guide.title })
    )}">
      <div class="ga-guide-dialog">
        <div class="ga-guide-dialog__head">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-family:var(--font-display);font-size:18px;font-weight:500;">${escapeHtml(
              t(locale, "guide.title", { game: guide.title })
            )}</strong>
            <span class="ga-chip">${escapeHtml(guide.playersBadge)}</span>
            <span class="ga-chip">${escapeHtml(guide.durationBadge)}</span>
          </div>
          <button type="button" id="btn-close-guide" class="btn btn--secondary btn--sm">${escapeHtml(t(locale, "common.close"))}</button>
        </div>

        <div class="ga-guide-objective">
          <span class="t-label muted">${escapeHtml(t(locale, "guide.goal"))}</span>
          <p class="t-small" style="margin:2px 0 0;color:var(--ink);">${escapeHtml(guide.objective)}</p>
        </div>

        ${renderGameVisualReferenceHtml(activeGameId, locale)}

        <div class="ga-guide-grid">
          ${guide.sections
            .map(
              (sec) => `
              <div class="ga-guide-card">
                <strong style="font-size:13px;font-weight:500;color:var(--ink);">${escapeHtml(sec.heading)}</strong>
                <ul class="ga-guide-list">
                  ${sec.items
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join("")}
                </ul>
              </div>
            `
            )
            .join("")}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--line);">
          <span class="t-small muted">${escapeHtml(
            inActiveMatch
              ? t(locale, "guide.footerInMatch")
              : t(locale, "guide.footerOutOfMatch")
          )}</span>
          <div style="display:inline-flex;gap:8px;">
            ${
              inActiveMatch
                ? `<button type="button" id="btn-resume-from-guide" class="btn btn--primary btn--sm">${escapeHtml(t(locale, "guide.resumeMatch"))}</button>`
                : `<button type="button" data-start-tutorial="${activeGameId}" class="btn btn--primary btn--sm">${escapeHtml(
                    t(locale, "guide.launchTutorial", { game: guide.title })
                  )}</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
