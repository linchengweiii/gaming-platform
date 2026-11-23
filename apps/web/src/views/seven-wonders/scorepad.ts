import {
  type SevenWondersAction,
  type SevenWondersPlayerState,
  type SevenWondersState,
  canPlayerUnselectDraftPick,
  getPlayerShields,
  getWonderBoardDefinition,
} from "@gaming-platform/seven-wonders";
import {
  type SupportedLocale,
  getSevenWondersCardNameLocalized,
  getSevenWondersWonderNameLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeHtml } from "../../app/helpers/html-and-dropdown.ts";
import { renderSwCoinSvg, renderSwShieldSvg } from "./icons.ts";

export function renderScorepadHtml(
  state: SevenWondersState,
  locale: SupportedLocale = "en"
): string {
  const ranked = [...state.players].sort(
    (a, b) =>
      b.scoreBreakdown.totalVp - a.scoreBreakdown.totalVp ||
      b.coins - a.coins
  );

  const copiedGuildNotes = ranked
    .filter((p) => Boolean(p.scoreBreakdown.copiedGuildName))
    .map((p) =>
      t(locale, "sw.copiedGuildNote", {
        name: escapeHtml(p.name),
        guild: escapeHtml(
          getSevenWondersCardNameLocalized(
            p.scoreBreakdown.copiedGuildName!,
            locale
          )
        ),
      })
    );

  return `
    <div class="sw-scorepad-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:15px;font-weight:500;">${t(locale, "sw.scorepadTitle")}</strong>
        <span class="ga-chip ga-chip--ok">${t(locale, "sw.tiebreakerCoins")}</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="sw-scorepad-table ga-num">
          <thead>
            <tr>
              <th style="text-align:left;">${t(locale, "sw.colCivilization")}</th>
              <th>${t(locale, "sw.colMilitary")}</th>
              <th>${t(locale, "sw.colTreasury")}</th>
              <th>${t(locale, "sw.colWonder")}</th>
              <th>${t(locale, "sw.colCivilian")}</th>
              <th>${t(locale, "sw.colScience")}</th>
              <th>${t(locale, "sw.colCommerce")}</th>
              <th>${t(locale, "sw.colGuilds")}</th>
              <th>${t(locale, "sw.colTotalVp")}</th>
            </tr>
          </thead>
          <tbody>
            ${ranked
              .map((p, idx) => {
                const sb = p.scoreBreakdown;
                const wonderCompact = getSevenWondersWonderNameLocalized(
                  p.wonderId,
                  p.wonderSide,
                  locale,
                  true
                );
                const copiedName = sb.copiedGuildName;
                const copiedIsScience = copiedName === "Scientists Guild";
                const copiedLocalized = copiedName
                  ? getSevenWondersCardNameLocalized(copiedName, locale)
                  : "";
                const copiedTitle = copiedName
                  ? ` title="${t(locale, "sw.copiedGuildTitle", { guild: escapeHtml(copiedLocalized) })}"`
                  : "";
                return `
                  <tr class="${idx === 0 ? "is-winner" : ""}">
                    <td style="text-align:left;">
                      <div style="display:inline-flex;align-items:center;gap:6px;">
                        <span class="player-dot" style="background:${p.color}"></span>
                        <strong>${escapeHtml(p.name)}</strong>
                        <span class="t-label muted">(${escapeHtml(wonderCompact)} ${p.wonderSide})</span>
                      </div>
                    </td>
                    <td>${sb.militaryVp}</td>
                    <td>${sb.treasuryVp} <span class="muted">(${p.coins}c)</span></td>
                    <td>${sb.wonderVp}</td>
                    <td>${sb.civilianVp}</td>
                    <td${copiedIsScience ? copiedTitle : ""}>${sb.scientificVp}${copiedIsScience ? " *" : ""}</td>
                    <td>${sb.commercialVp}</td>
                    <td${copiedName && !copiedIsScience ? copiedTitle : ""}>${sb.guildVp}${copiedName && !copiedIsScience ? " *" : ""}</td>
                    <td><strong>${sb.totalVp}</strong></td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      ${
        copiedGuildNotes.length > 0
          ? `<div class="t-label muted" style="margin-top:8px;">* ${copiedGuildNotes.join(" · ")}</div>`
          : ""
      }
    </div>
  `;
}

export function renderSevenWondersActionDock(
  state: SevenWondersState,
  actingPlayer: SevenWondersPlayerState | null,
  selectedCardId: string | null,
  legalActions: readonly SevenWondersAction[],
  viewerPlayerId?: string | null,
  locale: SupportedLocale = "en"
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `
      <div class="action-buttons" style="justify-content:space-between;">
        <span class="action-prompt">${t(locale, "sw.eraComplete", {
          prefix: `<strong>${t(locale, "sw.eraCompletePrefix")}</strong>`,
          winner: escapeHtml(
            winner?.name ?? t(locale, "sw.civilizationFallback")
          ),
          vp: winner?.scoreBreakdown.totalVp ?? 0,
        })}</span>
        <button type="button" id="btn-goto-setup-finished" class="btn btn--primary btn--sm">${t(locale, "inGame.configureNextGame")}</button>
      </div>
    `;
  }

  if (
    viewerPlayerId &&
    canPlayerUnselectDraftPick(state, viewerPlayerId)
  ) {
    return `
      <div class="action-buttons" style="justify-content:space-between;">
        <span class="action-prompt">${t(locale, "sw.pickLockedDock", {
          prefix: `<strong>${t(locale, "sw.pickLockedDockPrefix")}</strong>`,
        })}</span>
        <button type="button" id="btn-sw-unselect-pick-dock" class="btn btn--secondary btn--sm">${t(locale, "sw.changePick")}</button>
      </div>
    `;
  }

  if (state.phase === "HALIKARNASSUS_PICK") {
    return `
      <div class="action-buttons">
        <span class="action-prompt">${t(locale, "sw.halikarnassusDock", {
          prefix: `<strong>${t(locale, "sw.halikarnassusDockPrefix", { name: escapeHtml(actingPlayer.name) })}</strong>`,
        })}</span>
      </div>
    `;
  }

  const selectedCard = selectedCardId
    ? actingPlayer.hand.find((c) => c.id === selectedCardId) ?? null
    : null;

  if (selectedCard) {
    const cardActions = legalActions.filter(
      (
        a
      ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" && a.cardId === selectedCard.id
    );
    const buildVariants = cardActions.filter((a) => a.kind === "build");
    const wonderVariants = cardActions.filter((a) => a.kind === "wonder");

    if (buildVariants.length > 1 || wonderVariants.length > 1) {
      const selectedCardName = getSevenWondersCardNameLocalized(
        selectedCard.name,
        locale
      );
      return `
        <div class="action-buttons" style="justify-content:space-between;flex-wrap:wrap;">
          <span class="action-prompt">${t(locale, "sw.choosePaymentOption", {
            card: `<strong>${escapeHtml(selectedCardName)}:</strong>`,
          })}</span>
          <div style="display:inline-flex;flex-wrap:wrap;gap:6px;">
            ${buildVariants
              .map((v, idx) => {
                const pay = v.payment ?? { leftCoins: 0, rightCoins: 0 };
                const lbl = v.useFreeBuild
                  ? t(locale, "sw.olympiaZeusFree")
                  : pay.leftCoins + pay.rightCoins === 0
                    ? `${t(locale, "sw.build")} (${selectedCard.coinCost}c)`
                    : t(locale, "sw.buildTradeVariant", {
                        left: pay.leftCoins,
                        right: pay.rightCoins,
                        bank:
                          selectedCard.coinCost > 0
                            ? t(locale, "sw.bankCoinSuffix", {
                                coins: selectedCard.coinCost,
                              })
                            : "",
                      });
                return `<button type="button" data-sw-variant-card="${selectedCard.id}" data-sw-variant-kind="build" data-sw-variant-idx="${idx}" class="btn btn--primary btn--sm ga-num">${lbl}</button>`;
              })
              .join("")}
            ${wonderVariants
              .map((v, idx) => {
                const pay = v.payment ?? { leftCoins: 0, rightCoins: 0 };
                const lbl =
                  pay.leftCoins + pay.rightCoins === 0
                    ? t(locale, "sw.wonderStageFree")
                    : t(locale, "sw.wonderTradeVariant", {
                        left: pay.leftCoins,
                        right: pay.rightCoins,
                      });
                return `<button type="button" data-sw-variant-card="${selectedCard.id}" data-sw-variant-kind="wonder" data-sw-variant-idx="${idx}" class="btn btn--secondary btn--sm ga-num">${lbl}</button>`;
              })
              .join("")}
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="action-buttons">
      <span class="action-prompt">${t(locale, "sw.mainDockPrompt", {
        name: `<strong>${escapeHtml(actingPlayer.name)}:</strong>`,
        age: state.age,
      })}</span>
    </div>
  `;
}

export function renderSevenWondersPlayerCard(
  state: SevenWondersState,
  p: SevenWondersPlayerState,
  isActing: boolean,
  locale: SupportedLocale = "en"
): string {
  const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
  const wonderCompact = getSevenWondersWonderNameLocalized(
    p.wonderId,
    p.wonderSide,
    locale,
    true
  );
  const shields = getPlayerShields(p);
  const isLocked = state.lockedPlayerIds.includes(p.id);
  const diffKey =
    p.botDifficulty === "easy"
      ? "sw.diff.easy"
      : p.botDifficulty === "normal"
        ? "sw.diff.normal"
        : p.botDifficulty === "master"
          ? "sw.diff.master"
          : "sw.diff.smart";
  const seatBadge = p.isBot
    ? `${t(locale, "common.bot")} · ${t(locale, diffKey)}`
    : t(locale, "common.human");
  const sci = p.scoreBreakdown.scienceCounts;

  return `
    <div class="player-card clickable-target ${isActing ? "active-turn" : ""}" data-sw-inspect-player="${escapeHtml(p.id)}" title="${t(locale, "sw.inspectEmpireTitle", { name: escapeHtml(p.name) })}">
      <div class="player-header">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="player-dot" style="background:${p.color}"></span>
          <strong style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
          <span class="ga-chip" style="height:22px;padding:0 8px;">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.scoreBreakdown.totalVp} ${t(locale, "common.vpUnit")}</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;">
        <span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(wonderCompact)} (${p.wonderSide})</span>
        ${
          state.phase === "AGE_DRAFT"
            ? isLocked
              ? `<span class="ga-chip ga-chip--ok" style="height:21px;padding:0 8px;">${t(locale, "common.ready")}</span>`
              : `<span class="ga-chip" style="height:21px;padding:0 8px;">${t(locale, "sw.drafting")}</span>`
            : ""
        }
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12px;" class="ga-num">
        <span class="ga-chip">${renderSwCoinSvg(11)} ${p.coins}</span>
        <span class="ga-chip">${renderSwShieldSvg(11)} ${shields}</span>
        <span class="ga-chip">${t(locale, "sw.stagesCount", { built: p.builtWonderStages, total: board.stages.length })}</span>
        <span class="ga-chip" title="${t(locale, "sw.sciShortTooltip")}">${t(locale, "sw.sciShort", { c: sci.compass, g: sci.gear, t: sci.tablet })}</span>
      </div>
    </div>
  `;
}
