import type { CatanState } from "@gaming-platform/catan";
import type { SevenWondersState } from "@gaming-platform/seven-wonders";
import { SevenWondersEngine } from "@gaming-platform/seven-wonders";
import { GAME_REFERENCE_GUIDES } from "../config/guides-config.ts";
import { TUTORIAL_LESSONS } from "../config/tutorials-config.ts";
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
  liftAbovePopup = false
): string {
  const lessons = TUTORIAL_LESSONS[gameId];
  const clamped = Math.max(0, Math.min(lessons.length - 1, stepIndex));
  const lesson = lessons[clamped]!;
  const isFinalFreePlayLesson = clamped >= lessons.length - 1;
  const gameTitle = GAME_REFERENCE_GUIDES[gameId].title;

  const contextualHint = (() => {
    if (gameId === "catan" && liveState) {
      const phase = (liveState as CatanState).phase;
      if (phase === "DISCARD_ON_SEVEN") {
        return "A 7 was rolled! Select half your hand in the dock below to discard (or click Perform step).";
      }
      if (phase === "MOVE_ROBBER_OR_PIRATE") {
        return "A 7 was rolled! Click any highlighted hex on the map to move the Robber (or click Perform step).";
      }
      if (phase === "STEAL_RESOURCE") {
        return "Choose an adjacent opponent settlement/city to steal 1 random card from (or click Perform step).";
      }
    }
    if (gameId === "seven_wonders" && clamped === 3 && liveState) {
      const sw = liveState as SevenWondersState;
      const human = sw.players.find((p) => !p.isBot);
      if (human) {
        if (human.builtWonderStages >= 1) {
          return "Stage 1 is already built! Build another structure or click Next → for endgame scoring tips.";
        }
        const canBuildWonderNow = SevenWondersEngine.getLegalActions(
          sw,
          human.id
        ).some((a) => a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder");
        if (!canBuildWonderNow) {
          return "Stage 1 still needs missing resources — build a resource/commerce card or sell for +3c first (or click Perform step).";
        }
      }
    }
    return lesson.actionHint;
  })();

  return `
    <div class="ga-tutorial-coach${liftAbovePopup ? " ga-tutorial-coach--lifted" : ""}" role="region" aria-label="${escapeHtml(gameTitle)} interactive tutorial">
      <div class="ga-tutorial-coach__top">
        <div style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="ga-chip ga-chip--accent ga-num">Tutorial ${clamped + 1}/${lessons.length}</span>
          <strong style="font-size:13px;font-weight:500;color:var(--ink);">${escapeHtml(lesson.title)}</strong>
        </div>
        <div style="display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;">
          <button type="button" id="btn-tutorial-prev" class="btn btn--secondary btn--sm" ${
            clamped === 0 ? "disabled" : ""
          }>← Prev</button>
          <button type="button" id="btn-tutorial-next" class="btn btn--secondary btn--sm" ${
            isFinalFreePlayLesson ? "disabled" : ""
          }>Next →</button>
          ${
            isFinalFreePlayLesson
              ? ""
              : `<button type="button" id="btn-tutorial-auto-step" class="btn btn--primary btn--sm" ${
                  !canPerformStepNow ? "disabled" : ""
                }>Perform step</button>`
          }
          <button type="button" data-open-guide="${gameId}" class="btn btn--secondary btn--sm">Rules sheet</button>
          <button type="button" id="btn-tutorial-dismiss" class="btn ${
            isFinalFreePlayLesson ? "btn--primary" : "btn--secondary"
          } btn--sm">Free play</button>
          <button type="button" id="btn-tutorial-exit" class="btn btn--secondary btn--sm">Exit tutorial</button>
        </div>
      </div>
      <div class="ga-tutorial-coach__body">
        <span>${escapeHtml(lesson.body)}</span>
        <span class="ga-tutorial-coach__hint">${escapeHtml(contextualHint)}</span>
      </div>
    </div>
  `;
}

function renderGameVisualReferenceHtml(gameId: TutorialGameId): string {
  if (gameId === "catan") {
    return renderCatanGuideVisualReferenceHtml();
  }
  return renderOtherGameVisualReferenceHtml(gameId);
}

export function renderReferenceGuideModalPure(
  activeGameId: TutorialGameId,
  inActiveMatch: boolean
): string {
  const guide = GAME_REFERENCE_GUIDES[activeGameId];

  return `
    <div class="ga-guide-backdrop" id="ga-guide-backdrop" role="dialog" aria-modal="true" aria-label="${escapeHtml(guide.title)} how to play">
      <div class="ga-guide-dialog">
        <div class="ga-guide-dialog__head">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-family:var(--font-display);font-size:18px;font-weight:500;">${escapeHtml(guide.title)} — How to play</strong>
            <span class="ga-chip">${escapeHtml(guide.playersBadge)}</span>
            <span class="ga-chip">${escapeHtml(guide.durationBadge)}</span>
          </div>
          <button type="button" id="btn-close-guide" class="btn btn--secondary btn--sm">Close</button>
        </div>

        <div class="ga-guide-objective">
          <span class="t-label muted">Goal</span>
          <p class="t-small" style="margin:2px 0 0;color:var(--ink);">${escapeHtml(guide.objective)}</p>
        </div>

        ${renderGameVisualReferenceHtml(activeGameId)}

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
          <span class="t-small muted">${
            inActiveMatch
              ? "Close this sheet anytime to resume your current match."
              : "Want a guided hands-on walkthrough on a live board?"
          }</span>
          <div style="display:inline-flex;gap:8px;">
            ${
              inActiveMatch
                ? `<button type="button" id="btn-resume-from-guide" class="btn btn--primary btn--sm">Resume match</button>`
                : `<button type="button" data-start-tutorial="${activeGameId}" class="btn btn--primary btn--sm">Launch interactive ${escapeHtml(
                    guide.title
                  )} tutorial</button>`
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
