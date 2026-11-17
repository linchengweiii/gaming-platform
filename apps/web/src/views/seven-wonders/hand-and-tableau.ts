import {
  type SevenWondersAction,
  type SevenWondersPlayerState,
  type SevenWondersState,
  canPlayerBuildViaChain,
  canPlayerUnselectDraftPick,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "@gaming-platform/seven-wonders";
import {
  SW_CARD_COLOR_META,
  escapeSwHtml as escapeHtml,
  renderCostStripHtml,
  summarizeCardEffectsHtml,
} from "./icons.ts";
import { computeImmediateCardPreviewHtml } from "./neighbors-and-wonder.ts";
import { renderScorepadHtml } from "./scorepad.ts";

export function renderHandOrResolutionHtml(
  state: SevenWondersState,
  viewerPlayer: SevenWondersPlayerState,
  player: SevenWondersPlayerState,
  focusIdx: number,
  isInspectingOther: boolean,
  selectedCardId: string | null,
  legalActions: readonly SevenWondersAction[],
  hideHandForPassAndPlay: boolean,
  passLabel: string
): string {
  if (state.phase === "GAME_OVER") {
    return renderScorepadHtml(state);
  }

  if (isInspectingOther) {
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;">
          <span class="t-small muted">Inspecting <strong>${escapeHtml(player.name)}</strong>'s civilization (${
            player.handRedacted
              ? (player.hiddenHandCount ?? 0)
              : player.hand.length
          } secret cards in hand).</span>
          <button type="button" data-sw-inspect-player="${escapeHtml(viewerPlayer.id)}" class="btn btn--primary btn--sm">Return to ${escapeHtml(viewerPlayer.name)}'s hand</button>
        </div>
      `;
  }

  if (
    state.phase === "HALIKARNASSUS_PICK" &&
    state.halikarnassusQueue[0] === player.id
  ) {
    const discardOptions = (() => {
      const seenNames = new Set<string>();
      return legalActions.filter(
        (a): a is Extract<SevenWondersAction, { type: "BUILD_FROM_DISCARD" }> => {
          if (a.type !== "BUILD_FROM_DISCARD") return false;
          const c = state.discardPile.find((x) => x.id === a.cardId);
          if (!c || seenNames.has(c.name)) return false;
          seenNames.add(c.name);
          return true;
        }
      );
    })();
    return `
        <div class="sw-hand-section">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong style="font-size:13px;font-weight:500;">Mausoleum of Halikarnassus — Build 1 discarded structure for free</strong>
            <button type="button" data-sw-skip-discard="true" class="btn btn--secondary btn--sm">Skip</button>
          </div>
          <div class="sw-cards-row">
            ${discardOptions
              .map((act) => {
                const card = state.discardPile.find((c) => c.id === act.cardId);
                if (!card) return "";
                const cMeta = SW_CARD_COLOR_META[card.color];
                return `
                  <div class="sw-card is-affordable" style="border-color:${cMeta.border};">
                    <div class="sw-card__head" style="background:${cMeta.headerBg};">
                      <span class="sw-card__title">${escapeHtml(card.name)}</span>
                      <span class="t-label" style="color:${cMeta.accent};">Free</span>
                    </div>
                    <div class="sw-card__body">
                      <div class="sw-card__effects">${summarizeCardEffectsHtml(card)}</div>
                      ${computeImmediateCardPreviewHtml(state, focusIdx, card)}
                      <button type="button" data-sw-discard-pick="${card.id}" class="btn btn--primary btn--sm" style="width:100%;">Build free</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
  }

  if (hideHandForPassAndPlay) {
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small muted"><strong>${escapeHtml(player.name)}'s</strong> draft hand is hidden while passing the screen.</span>
          <button type="button" id="btn-reveal-hand" class="btn btn--secondary btn--sm">Show ${escapeHtml(player.name)}'s hand</button>
        </div>
      `;
  }

  if (player.handRedacted) {
    const canUnselectInspected = canPlayerUnselectDraftPick(state, player.id);
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small muted">Viewing ${escapeHtml(player.name)}'s empire — ${player.hiddenHandCount ?? 0} secret cards in hand.</span>
          ${
            canUnselectInspected
              ? `<button type="button" id="btn-sw-unselect-pick" data-sw-unselect-player="${escapeHtml(player.id)}" class="btn btn--secondary btn--sm">Change ${escapeHtml(player.name)}'s pick</button>`
              : ""
          }
        </div>
      `;
  }

  const canUnselectLockedPick = canPlayerUnselectDraftPick(state, player.id);
  if (canUnselectLockedPick) {
    const lockedChoice = state.pendingChoices[player.id];
    const lockedCard = lockedChoice
      ? player.hand.find((c) => c.id === lockedChoice.cardId)
      : null;
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small">
            <strong>${escapeHtml(player.name)} draft pick locked${
              lockedCard
                ? ` (${escapeHtml(lockedCard.name)} — ${lockedChoice?.kind})`
                : ""
            }</strong> · Waiting for remaining civilizations to choose before simultaneous reveal.
          </span>
          <button type="button" id="btn-sw-unselect-pick" data-sw-unselect-player="${escapeHtml(player.id)}" class="btn btn--secondary btn--sm">Change pick</button>
        </div>
      `;
  }

  const canAct = legalActions.length > 0;

  return `
      <div class="sw-hand-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <strong style="font-size:13px;font-weight:500;">${escapeHtml(player.name)}'s Draft Hand (${player.hand.length} cards)</strong>
            <span class="t-label muted">${
              state.phase === "SEVENTH_CARD_PLAY"
                ? "Babylon bonus 7th card — build, tuck, or sell"
                : state.draftRound === 6 && state.phase === "AGE_DRAFT"
                  ? hasWonderStageEffect(player, "play_seventh_card")
                    ? "Final draft pick — Babylon will also play your 7th card!"
                    : "Final pick of this Age — unchosen 7th card will be discarded"
                  : passLabel
            }</span>
          </div>
          <span class="t-label muted">Select Build, Wonder stage, or Sell +3c</span>
        </div>

        <div class="sw-cards-row">
          ${player.hand
            .map((card) => {
              const cMeta = SW_CARD_COLOR_META[card.color];
              const isSelected = selectedCardId === card.id;
              const isDup = hasDuplicateCardName(player, card.name);
              const isChainFree = !isDup && canPlayerBuildViaChain(player, card);

              const buildActs = legalActions.filter(
                (
                  a
                ): a is Extract<
                  SevenWondersAction,
                  { type: "SELECT_DRAFT_ACTION" }
                > =>
                  a.type === "SELECT_DRAFT_ACTION" &&
                  a.kind === "build" &&
                  a.cardId === card.id
              );
              const normalBuilds = buildActs.filter((a) => !a.useFreeBuild);
              const freeOlympiaBuild = buildActs.find((a) => a.useFreeBuild);
              const wonderActs = legalActions.filter(
                (
                  a
                ): a is Extract<
                  SevenWondersAction,
                  { type: "SELECT_DRAFT_ACTION" }
                > =>
                  a.type === "SELECT_DRAFT_ACTION" &&
                  a.kind === "wonder" &&
                  a.cardId === card.id
              );

              const primaryBuild = normalBuilds[0] ?? freeOlympiaBuild ?? null;
              const minTradeCoins = primaryBuild?.payment
                ? primaryBuild.payment.leftCoins + primaryBuild.payment.rightCoins
                : 0;
              const totalCoinPrice =
                isChainFree || primaryBuild?.useFreeBuild
                  ? 0
                  : card.coinCost + minTradeCoins;

              const hasMultipleBuildChoices = buildActs.length > 1;
              const hasMultipleWonderChoices = wonderActs.length > 1;

              const statusBadge = isDup
                ? `<span class="ga-chip">Owned</span>`
                : isChainFree
                  ? `<span class="ga-chip ga-chip--ok">Chain free</span>`
                  : freeOlympiaBuild && normalBuilds.length > 0
                    ? `<span class="ga-chip ga-chip--ok ga-num">${totalCoinPrice}c / Zeus 0c</span>`
                    : normalBuilds.length > 0
                      ? totalCoinPrice === 0
                        ? `<span class="ga-chip ga-chip--ok">Free</span>`
                        : `<span class="ga-chip ga-chip--warn ga-num">${totalCoinPrice}c${hasMultipleBuildChoices ? " ▾" : ""}</span>`
                      : freeOlympiaBuild
                        ? `<span class="ga-chip ga-chip--ok">Zeus free</span>`
                        : `<span class="ga-chip">Locked</span>`;

              const buildLabel = isChainFree
                ? "Chain"
                : freeOlympiaBuild && normalBuilds.length === 0
                  ? "Zeus free"
                  : hasMultipleBuildChoices
                    ? `Build (${totalCoinPrice}c ▾)`
                    : totalCoinPrice > 0
                      ? `Build (${totalCoinPrice}c)`
                      : "Build";

              const primaryWonder = wonderActs[0] ?? null;
              const wonderTradeCoins = primaryWonder?.payment
                ? primaryWonder.payment.leftCoins +
                  primaryWonder.payment.rightCoins
                : 0;
              const wonderLabel = !primaryWonder
                ? "Wonder"
                : hasMultipleWonderChoices
                  ? `Wonder (${wonderTradeCoins}c ▾)`
                  : wonderTradeCoins > 0
                    ? `Wonder (${wonderTradeCoins}c)`
                    : "Wonder";

              return `
                <div class="sw-card ${primaryBuild ? "is-affordable" : ""} ${
                  isSelected ? "is-selected" : ""
                }" data-sw-select-card="${card.id}" style="border-color:${
                  isSelected ? "var(--action)" : cMeta.border
                };">
                  <div class="sw-card__head" style="background:${cMeta.headerBg};">
                    <span class="sw-card__title" title="${escapeHtml(card.name)}">${escapeHtml(card.name)}</span>
                    ${statusBadge}
                  </div>
                  <div class="sw-card__body">
                    <div class="sw-card__effects">
                      ${summarizeCardEffectsHtml(card)}
                    </div>
                    ${computeImmediateCardPreviewHtml(state, focusIdx, card)}
                    <div class="sw-card__cost">
                      <span class="t-label muted">Cost:</span>
                      ${renderCostStripHtml(card.resourceCost, card.coinCost)}
                    </div>
                    ${
                      card.chainsTo.length > 0
                        ? `<div class="t-label muted" title="Unlocks free construction in next Age">Chains → ${escapeHtml(card.chainsTo.join(", "))}</div>`
                        : ""
                    }
                    <div class="sw-card__actions">
                      <button type="button" data-sw-quick-build="${card.id}" class="btn ${
                        primaryBuild ? "btn--primary" : "btn--secondary"
                      } btn--sm" ${!canAct || !primaryBuild ? "disabled" : ""}>${buildLabel}</button>
                      <button type="button" data-sw-quick-wonder="${card.id}" class="btn btn--secondary btn--sm" title="Tuck card to build Wonder Stage ${
                        player.builtWonderStages + 1
                      }" ${!canAct || !primaryWonder ? "disabled" : ""}>${wonderLabel}</button>
                      <button type="button" data-sw-quick-discard="${card.id}" class="btn btn--secondary btn--sm" title="Sell card to bank for +3 coins" ${
                        !canAct ? "disabled" : ""
                      }>+3c</button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
}
