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
  type SupportedLocale,
  getSevenWondersCardNameLocalized,
  t,
} from "../../i18n/index.ts";
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
  passLabel: string,
  locale: SupportedLocale = "en"
): string {
  if (state.phase === "GAME_OVER") {
    return renderScorepadHtml(state, locale);
  }

  if (isInspectingOther) {
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;">
          <span class="t-small muted">${t(locale, "sw.inspectingCiv", {
            name: `<strong>${escapeHtml(player.name)}</strong>`,
            count: player.handRedacted
              ? (player.hiddenHandCount ?? 0)
              : player.hand.length,
          })}</span>
          <button type="button" data-sw-inspect-player="${escapeHtml(viewerPlayer.id)}" class="btn btn--primary btn--sm">${t(locale, "sw.returnToHand", { name: escapeHtml(viewerPlayer.name) })}</button>
        </div>
      `;
  }

  if (hideHandForPassAndPlay) {
    const privacyText =
      state.phase === "HALIKARNASSUS_PICK" &&
      state.halikarnassusQueue[0] === player.id
        ? t(locale, "sw.privacyHalikarnassus", {
            name: `<strong>${escapeHtml(player.name)}</strong>`,
          })
        : t(locale, "sw.privacyDraftHand", {
            name: `<strong>${escapeHtml(player.name)}</strong>`,
          });
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small muted">${privacyText}</span>
          <button type="button" id="btn-reveal-hand" class="btn btn--secondary btn--sm">${t(locale, "inGame.showPlayerHand", { name: escapeHtml(player.name) })}</button>
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
            <strong style="font-size:13px;font-weight:500;">${t(locale, "sw.halikarnassusTitle")}</strong>
            <button type="button" data-sw-skip-discard="true" class="btn btn--secondary btn--sm">${t(locale, "common.skip")}</button>
          </div>
          <div class="sw-cards-row">
            ${discardOptions
              .map((act) => {
                const card = state.discardPile.find((c) => c.id === act.cardId);
                if (!card) return "";
                const cMeta = SW_CARD_COLOR_META[card.color];
                const cardName = getSevenWondersCardNameLocalized(
                  card.name,
                  locale
                );
                return `
                  <div class="sw-card is-affordable" style="border-color:${cMeta.border};">
                    <div class="sw-card__head" style="background:${cMeta.headerBg};">
                      <span class="sw-card__title">${escapeHtml(cardName)}</span>
                      <span class="t-label" style="color:${cMeta.accent};">${t(locale, "common.free")}</span>
                    </div>
                    <div class="sw-card__body">
                      <div class="sw-card__effects">${summarizeCardEffectsHtml(card, locale)}</div>
                      ${computeImmediateCardPreviewHtml(state, focusIdx, card, locale)}
                      <button type="button" data-sw-discard-pick="${card.id}" class="btn btn--primary btn--sm" style="width:100%;">${t(locale, "sw.buildFree")}</button>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
  }

  if (player.handRedacted) {
    const canUnselectInspected = canPlayerUnselectDraftPick(state, player.id);
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small muted">${t(locale, "sw.viewingEmpire", {
            name: escapeHtml(player.name),
            count: player.hiddenHandCount ?? 0,
          })}</span>
          ${
            canUnselectInspected
              ? `<button type="button" id="btn-sw-unselect-pick" data-sw-unselect-player="${escapeHtml(player.id)}" class="btn btn--secondary btn--sm">${t(locale, "sw.changePlayerPick", { name: escapeHtml(player.name) })}</button>`
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
    const lockedKindLabel =
      lockedChoice?.kind === "build"
        ? t(locale, "sw.kind.build")
        : lockedChoice?.kind === "wonder"
          ? t(locale, "sw.kind.wonder")
          : lockedChoice?.kind === "discard"
            ? t(locale, "sw.kind.discard")
            : "";
    const detail = lockedCard
      ? ` (${escapeHtml(getSevenWondersCardNameLocalized(lockedCard.name, locale))} — ${lockedKindLabel})`
      : "";
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small">
            ${t(locale, "sw.pickLockedBanner", {
              locked: `<strong>${t(locale, "sw.pickLockedPrefix", { name: escapeHtml(player.name), detail })}</strong>`,
            })}
          </span>
          <button type="button" id="btn-sw-unselect-pick" data-sw-unselect-player="${escapeHtml(player.id)}" class="btn btn--secondary btn--sm">${t(locale, "sw.changePick")}</button>
        </div>
      `;
  }

  if (
    state.phase === "SEVENTH_CARD_PLAY" &&
    state.seventhCardQueue[0] !== player.id
  ) {
    const babylonPlayer = state.players.find(
      (p) => p.id === state.seventhCardQueue[0]
    );
    return `
        <div class="sw-hand-section" style="flex-direction:row;align-items:center;justify-content:space-between;padding:14px 16px;flex-wrap:wrap;gap:10px;">
          <span class="t-small muted">${t(locale, "sw.waitingBabylon", {
            name: `<strong>${escapeHtml(babylonPlayer?.name ?? t(locale, "sw.babylonFallback"))}</strong>`,
          })}</span>
        </div>
      `;
  }

  const canAct = legalActions.length > 0;
  const waitingForHalikarnassus =
    state.phase === "HALIKARNASSUS_PICK" &&
    state.halikarnassusQueue[0] !== player.id;
  const halikarnassusPlayer = waitingForHalikarnassus
    ? state.players.find((p) => p.id === state.halikarnassusQueue[0])
    : null;

  return `
      <div class="sw-hand-section">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <strong style="font-size:13px;font-weight:500;">${t(locale, "sw.draftHandTitle", { name: escapeHtml(player.name), count: player.hand.length })}</strong>
            <span class="t-label muted">${
              waitingForHalikarnassus
                ? t(locale, "sw.waitingHalikarnassus", {
                    name: escapeHtml(
                      halikarnassusPlayer?.name ??
                        t(locale, "sw.halikarnassusFallback")
                    ),
                  })
                : state.phase === "SEVENTH_CARD_PLAY"
                  ? t(locale, "sw.babylonSeventhHint")
                  : state.draftRound === 6 && state.phase === "AGE_DRAFT"
                    ? hasWonderStageEffect(player, "play_seventh_card")
                      ? t(locale, "sw.finalPickBabylon")
                      : t(locale, "sw.finalPickNormal")
                    : passLabel
            }</span>
          </div>
          <span class="t-label muted">${
            canAct
              ? t(locale, "sw.selectActionHint")
              : t(locale, "sw.waitingActivePlayer")
          }</span>
        </div>

        <div class="sw-cards-row">
          ${player.hand
            .map((card) => {
              const cMeta = SW_CARD_COLOR_META[card.color];
              const cardName = getSevenWondersCardNameLocalized(
                card.name,
                locale
              );
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
                ? `<span class="ga-chip">${t(locale, "common.owned")}</span>`
                : !canAct
                  ? ""
                  : isChainFree
                    ? `<span class="ga-chip ga-chip--ok">${t(locale, "sw.chainFree")}</span>`
                    : freeOlympiaBuild && normalBuilds.length > 0
                      ? `<span class="ga-chip ga-chip--ok ga-num">${t(locale, "sw.zeusOrPrice", { price: totalCoinPrice })}</span>`
                      : normalBuilds.length > 0
                        ? totalCoinPrice === 0
                          ? `<span class="ga-chip ga-chip--ok">${t(locale, "common.free")}</span>`
                          : `<span class="ga-chip ga-chip--warn ga-num">${totalCoinPrice}c${hasMultipleBuildChoices ? " ▾" : ""}</span>`
                        : freeOlympiaBuild
                          ? `<span class="ga-chip ga-chip--ok">${t(locale, "sw.zeusFree")}</span>`
                          : `<span class="ga-chip">${t(locale, "common.locked")}</span>`;

              const buildWord = t(locale, "sw.build");
              const buildLabel = isChainFree
                ? t(locale, "sw.chain")
                : freeOlympiaBuild && normalBuilds.length === 0
                  ? t(locale, "sw.zeusFree")
                  : hasMultipleBuildChoices
                    ? `${buildWord} (${totalCoinPrice}c ▾)`
                    : totalCoinPrice > 0
                      ? `${buildWord} (${totalCoinPrice}c)`
                      : buildWord;

              const primaryWonder = wonderActs[0] ?? null;
              const wonderTradeCoins = primaryWonder?.payment
                ? primaryWonder.payment.leftCoins +
                  primaryWonder.payment.rightCoins
                : 0;
              const wonderWord = t(locale, "sw.wonder");
              const wonderLabel = !primaryWonder
                ? wonderWord
                : hasMultipleWonderChoices
                  ? `${wonderWord} (${wonderTradeCoins}c ▾)`
                  : wonderTradeCoins > 0
                    ? `${wonderWord} (${wonderTradeCoins}c)`
                    : wonderWord;

              return `
                <div class="sw-card ${primaryBuild ? "is-affordable" : ""} ${
                  isSelected ? "is-selected" : ""
                }" data-sw-select-card="${card.id}" style="border-color:${
                  isSelected ? "var(--action)" : cMeta.border
                };">
                  <div class="sw-card__head" style="background:${cMeta.headerBg};">
                    <span class="sw-card__title" title="${escapeHtml(cardName)}">${escapeHtml(cardName)}</span>
                    ${statusBadge}
                  </div>
                  <div class="sw-card__body">
                    <div class="sw-card__effects">
                      ${summarizeCardEffectsHtml(card, locale)}
                    </div>
                    ${isDup ? "" : computeImmediateCardPreviewHtml(state, focusIdx, card, locale)}
                    <div class="sw-card__cost">
                      <span class="t-label muted">${t(locale, "sw.costLabel")}</span>
                      ${renderCostStripHtml(card.resourceCost, card.coinCost, locale)}
                    </div>
                    ${
                      card.chainsTo.length > 0
                        ? `<div class="t-label muted" title="${t(locale, "sw.chainsToTitle")}">${t(locale, "sw.chainsTo", {
                            targets: escapeHtml(
                              card.chainsTo
                                .map((n) =>
                                  getSevenWondersCardNameLocalized(n, locale)
                                )
                                .join(", ")
                            ),
                          })}</div>`
                        : ""
                    }
                    <div class="sw-card__actions">
                      <button type="button" data-sw-quick-build="${card.id}" class="btn ${
                        primaryBuild ? "btn--primary" : "btn--secondary"
                      } btn--sm" ${!canAct || !primaryBuild ? "disabled" : ""}>${buildLabel}</button>
                      <button type="button" data-sw-quick-wonder="${card.id}" class="btn btn--secondary btn--sm" title="${t(locale, "sw.tuckWonderTitle", { stage: player.builtWonderStages + 1 })}" ${!canAct || !primaryWonder ? "disabled" : ""}>${wonderLabel}</button>
                      <button type="button" data-sw-quick-discard="${card.id}" class="btn btn--secondary btn--sm" title="${t(locale, "sw.sellCardTitle")}" ${
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
