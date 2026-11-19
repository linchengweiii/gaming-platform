import {
  type SevenWondersAction,
  type SevenWondersPlayerState,
  type SevenWondersState,
  canPlayerUnselectDraftPick,
  getPlayerShields,
  getWonderBoardDefinition,
} from "@gaming-platform/seven-wonders";
import {
  escapeSwHtml as escapeHtml,
  renderSwCoinSvg,
  renderSwShieldSvg,
} from "./icons.ts";

export function renderScorepadHtml(state: SevenWondersState): string {
  const ranked = [...state.players].sort(
    (a, b) =>
      b.scoreBreakdown.totalVp - a.scoreBreakdown.totalVp ||
      b.coins - a.coins
  );

  const copiedGuildNotes = ranked
    .filter((p) => Boolean(p.scoreBreakdown.copiedGuildName))
    .map(
      (p) =>
        `${escapeHtml(p.name)} copied ${escapeHtml(p.scoreBreakdown.copiedGuildName!)} via Olympia B3`
    );

  return `
    <div class="sw-scorepad-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="font-size:15px;font-weight:500;">Ancient Era Final Scorepad</strong>
        <span class="ga-chip ga-chip--ok">Tiebreaker: Treasury coins</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="sw-scorepad-table ga-num">
          <thead>
            <tr>
              <th style="text-align:left;">Civilization</th>
              <th>Military</th>
              <th>Treasury</th>
              <th>Wonder</th>
              <th>Civilian</th>
              <th>Science</th>
              <th>Commerce</th>
              <th>Guilds</th>
              <th>Total VP</th>
            </tr>
          </thead>
          <tbody>
            ${ranked
              .map((p, idx) => {
                const sb = p.scoreBreakdown;
                const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
                const copiedName = sb.copiedGuildName;
                const copiedIsScience = copiedName === "Scientists Guild";
                const copiedTitle = copiedName
                  ? ` title="Includes copied ${escapeHtml(copiedName)} (Olympia B3)"`
                  : "";
                return `
                  <tr class="${idx === 0 ? "is-winner" : ""}">
                    <td style="text-align:left;">
                      <div style="display:inline-flex;align-items:center;gap:6px;">
                        <span class="player-dot" style="background:${p.color}"></span>
                        <strong>${escapeHtml(p.name)}</strong>
                        <span class="t-label muted">(${escapeHtml(board.name.replace(/^The /, ""))} ${p.wonderSide})</span>
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
  viewerPlayerId?: string | null
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `
      <div class="action-buttons" style="justify-content:space-between;">
        <span class="action-prompt"><strong>Ancient Era complete.</strong> ${escapeHtml(
          winner?.name ?? "Civilization"
        )} wins 7 Wonders with ${
          winner?.scoreBreakdown.totalVp ?? 0
        } VP!</span>
        <button type="button" id="btn-goto-setup-finished" class="btn btn--primary btn--sm">Configure next game</button>
      </div>
    `;
  }

  if (
    viewerPlayerId &&
    canPlayerUnselectDraftPick(state, viewerPlayerId)
  ) {
    return `
      <div class="action-buttons" style="justify-content:space-between;">
        <span class="action-prompt"><strong>Pick locked in.</strong> Waiting for remaining civilizations before simultaneous reveal.</span>
        <button type="button" id="btn-sw-unselect-pick-dock" class="btn btn--secondary btn--sm">Change pick</button>
      </div>
    `;
  }

  if (state.phase === "HALIKARNASSUS_PICK") {
    return `
      <div class="action-buttons">
        <span class="action-prompt"><strong>${escapeHtml(
          actingPlayer.name
        )} (Halikarnassus):</strong> Choose any discarded card above to build for free, or skip.</span>
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
      return `
        <div class="action-buttons" style="justify-content:space-between;flex-wrap:wrap;">
          <span class="action-prompt"><strong>${escapeHtml(selectedCard.name)}:</strong> Choose payment / action option:</span>
          <div style="display:inline-flex;flex-wrap:wrap;gap:6px;">
            ${buildVariants
              .map((v, idx) => {
                const pay = v.payment ?? { leftCoins: 0, rightCoins: 0 };
                const lbl = v.useFreeBuild
                  ? "Olympia Zeus free (0c)"
                  : pay.leftCoins + pay.rightCoins === 0
                    ? `Build (${selectedCard.coinCost}c)`
                    : `Build (${pay.leftCoins}c West · ${pay.rightCoins}c East${
                        selectedCard.coinCost > 0
                          ? ` + ${selectedCard.coinCost}c bank`
                          : ""
                      })`;
                return `<button type="button" data-sw-variant-card="${selectedCard.id}" data-sw-variant-kind="build" data-sw-variant-idx="${idx}" class="btn btn--primary btn--sm ga-num">${lbl}</button>`;
              })
              .join("")}
            ${wonderVariants
              .map((v, idx) => {
                const pay = v.payment ?? { leftCoins: 0, rightCoins: 0 };
                const lbl =
                  pay.leftCoins + pay.rightCoins === 0
                    ? "Wonder Stage (0c)"
                    : `Wonder (${pay.leftCoins}c West · ${pay.rightCoins}c East)`;
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
      <span class="action-prompt"><strong>${escapeHtml(
        actingPlayer.name
      )}:</strong> Pick 1 card from your Age ${state.age} hand above to Build, tuck under your Wonder, or Sell for +3 coins.</span>
    </div>
  `;
}

const SW_DIFF_LABEL: Readonly<Record<string, string>> = {
  easy: "Casual",
  normal: "Balanced",
  smart: "Tactical",
  master: "Grandmaster",
};

export function renderSevenWondersPlayerCard(
  state: SevenWondersState,
  p: SevenWondersPlayerState,
  isActing: boolean
): string {
  const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
  const shields = getPlayerShields(p);
  const isLocked = state.lockedPlayerIds.includes(p.id);
  const seatBadge = p.isBot
    ? `Bot · ${SW_DIFF_LABEL[p.botDifficulty] ?? "Tactical"}`
    : "Human";
  const sci = p.scoreBreakdown.scienceCounts;

  return `
    <div class="player-card clickable-target ${isActing ? "active-turn" : ""}" data-sw-inspect-player="${escapeHtml(p.id)}" title="Click to inspect ${escapeHtml(p.name)}'s empire">
      <div class="player-header">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="player-dot" style="background:${p.color}"></span>
          <strong style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
          <span class="ga-chip" style="height:22px;padding:0 8px;">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.scoreBreakdown.totalVp} VP</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;">
        <span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
          board.name.replace(/^The /, "")
        )} (${p.wonderSide})</span>
        ${
          state.phase === "AGE_DRAFT"
            ? isLocked
              ? `<span class="ga-chip ga-chip--ok" style="height:21px;padding:0 8px;">Ready</span>`
              : `<span class="ga-chip" style="height:21px;padding:0 8px;">Drafting</span>`
            : ""
        }
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12px;" class="ga-num">
        <span class="ga-chip">${renderSwCoinSvg(11)} ${p.coins}</span>
        <span class="ga-chip">${renderSwShieldSvg(11)} ${shields}</span>
        <span class="ga-chip">Stages ${p.builtWonderStages}/${board.stages.length}</span>
        <span class="ga-chip" title="Compass / Gear / Tablet">Sci ${sci.compass}/${sci.gear}/${sci.tablet}</span>
      </div>
    </div>
  `;
}
