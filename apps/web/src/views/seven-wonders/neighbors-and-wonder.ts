import {
  MANUFACTURED_GOODS,
  RAW_RESOURCES,
  type SevenWondersCard,
  type SevenWondersPlayerState,
  type SevenWondersState,
  WONDER_RESOURCES,
  computeAffordablePaymentsPure,
  computeSevenWondersScoreBreakdown,
  getLeftNeighborIndex,
  getNeighborTradableProfile,
  getOwnResourceProfile,
  getPlayerShields,
  getRightNeighborIndex,
  getWonderBoardDefinition,
  hasDuplicateCardName,
} from "@gaming-platform/seven-wonders";
import {
  type SupportedLocale,
  getSevenWondersCardColorTextLocalized,
  getSevenWondersCardNameLocalized,
  getSevenWondersResourceTextLocalized,
  getSevenWondersStageSummaryLocalized,
  getSevenWondersWonderNameLocalized,
  t,
} from "../../i18n/index.ts";
import {
  SW_CARD_COLOR_META,
  escapeSwHtml as escapeHtml,
  formatChoiceShortLabel,
  renderCostStripHtml,
  renderSwCoinSvg,
  renderSwResourceBadge,
  renderSwShieldSvg,
  summarizeBuiltPillSuffix,
} from "./icons.ts";

export function computeImmediateCardPreviewHtml(
  state: SevenWondersState,
  playerIndex: number,
  card: SevenWondersCard,
  locale: SupportedLocale = "en"
): string {
  const players = state.players;
  const player = players[playerIndex]!;
  if (hasDuplicateCardName(player, card.name)) {
    return "";
  }
  const left = players[getLeftNeighborIndex(playerIndex, players.length)]!;
  const right = players[getRightNeighborIndex(playerIndex, players.length)]!;

  // Immediate coins
  let coinsNow = 0;
  for (const ef of card.effects) {
    if (ef.kind === "coins") coinsNow += ef.coins;
    if (ef.kind === "per_card_reward" && ef.coinsPerMatch > 0) {
      const targetSet = new Set(ef.targetColors);
      let cnt = 0;
      if (ef.includeSelf) {
        cnt +=
          player.tableau.filter((c) => targetSet.has(c.color)).length +
          (targetSet.has(card.color) ? 1 : 0);
      }
      if (ef.includeNeighbors) {
        cnt += left.tableau.filter((c) => targetSet.has(c.color)).length;
        cnt += right.tableau.filter((c) => targetSet.has(c.color)).length;
      }
      coinsNow += cnt * ef.coinsPerMatch;
    }
    if (ef.kind === "per_wonder_stage_reward" && ef.coinsPerStage > 0) {
      let st = 0;
      if (ef.includeSelf) st += player.builtWonderStages;
      if (ef.includeNeighbors) {
        st += left.builtWonderStages + right.builtWonderStages;
      }
      coinsNow += st * ef.coinsPerStage;
    }
  }

  const simPlayers = players.map((p, idx) =>
    idx === playerIndex
      ? { ...p, tableau: [...p.tableau, card] }
      : p
  );
  const before = computeSevenWondersScoreBreakdown(players, playerIndex);
  const after = computeSevenWondersScoreBreakdown(simPlayers, playerIndex);
  const nonCoinVpDelta =
    after.totalVp -
    after.treasuryVp -
    (before.totalVp - before.treasuryVp);
  const sciDelta = after.scientificVp - before.scientificVp;

  const shieldEf = card.effects.find((ef) => ef.kind === "shields");
  if (shieldEf && shieldEf.kind === "shields") {
    const myNow = getPlayerShields(player);
    const myNext = myNow + shieldEf.shields;
    const winLabel = t(locale, "sw.warWin");
    const loseLabel = t(locale, "sw.warLose");
    const tieLabel = t(locale, "sw.warTie");
    const fmtFlip = (oppSh: number, tag: string): string | null => {
      const prev = myNow > oppSh ? winLabel : myNow < oppSh ? loseLabel : tieLabel;
      const next = myNext > oppSh ? winLabel : myNext < oppSh ? loseLabel : tieLabel;
      return prev !== next ? `${tag}: ${prev}→${next}` : null;
    };
    const wFlip = fmtFlip(getPlayerShields(left), t(locale, "sw.dirW"));
    const eFlip = fmtFlip(getPlayerShields(right), t(locale, "sw.dirE"));
    const flips = [wFlip, eFlip].filter(Boolean).join(" · ");
    if (flips) {
      return `<div class="t-label ga-num" style="color:#fca5a5;">${escapeHtml(flips)}</div>`;
    }
  }

  if (card.color === "green" || sciDelta > 0) {
    const setsBefore = Math.min(
      before.scienceCounts.compass,
      before.scienceCounts.gear,
      before.scienceCounts.tablet
    );
    const setsAfter = Math.min(
      after.scienceCounts.compass,
      after.scienceCounts.gear,
      after.scienceCounts.tablet
    );
    return `<div class="t-label ga-num" style="color:#86efac;">${t(locale, "sw.nowSciVp", {
      vp: sciDelta,
      set: setsAfter > setsBefore ? t(locale, "sw.completesSet") : "",
    })}</div>`;
  }

  if (card.color === "yellow" || card.color === "purple") {
    if (nonCoinVpDelta > 0 || coinsNow > 0) {
      const bits: string[] = [];
      if (coinsNow > 0) bits.push(`+${coinsNow}c`);
      if (nonCoinVpDelta > 0) {
        bits.push(`+${nonCoinVpDelta} ${t(locale, "common.vpUnit")}`);
      }
      return `<div class="t-label ga-num" style="color:#fde047;">${t(locale, "sw.nowBits", { bits: bits.join(", ") })}</div>`;
    }
    const isScalingVpCard = card.effects.some(
      (ef) =>
        (ef.kind === "per_card_reward" && ef.vpPerMatch > 0) ||
        (ef.kind === "per_wonder_stage_reward" && ef.vpPerStage > 0) ||
        ef.kind === "per_defeat_token_vp"
    );
    if (isScalingVpCard) {
      return `<div class="t-label ga-num muted">${t(locale, "sw.nowZeroVp")}</div>`;
    }
  }

  return "";
}

export function renderNeighborPanelHtml(
  neighbor: SevenWondersPlayerState,
  direction: "left" | "right",
  myShields: number,
  rawRate: 1 | 2,
  mfgRate: 1 | 2,
  locale: SupportedLocale = "en"
): string {
  const oppShields = getPlayerShields(neighbor);
  const warDiff = myShields - oppShields;
  const warChip =
    warDiff > 0
      ? `<span class="ga-chip ga-chip--ok ga-num">${t(locale, "sw.warPlus", { diff: warDiff })}</span>`
      : warDiff < 0
        ? `<span class="ga-chip ga-chip--danger ga-num">${t(locale, "sw.warMinus", { diff: warDiff })}</span>`
        : `<span class="ga-chip ga-num">${t(locale, "sw.warTied")}</span>`;

  const board = getWonderBoardDefinition(neighbor.wonderId, neighbor.wonderSide);
  const wonderCompactName = getSevenWondersWonderNameLocalized(
    neighbor.wonderId,
    neighbor.wonderSide,
    locale,
    true
  );
  const defeatCount = neighbor.militaryTokens.filter((tk) => tk.points < 0).length;

  const tradable = getNeighborTradableProfile(neighbor);
  const tradableBadges: string[] = [];
  for (const r of [...RAW_RESOURCES, ...MANUFACTURED_GOODS]) {
    if (tradable.fixed[r] > 0) {
      tradableBadges.push(renderSwResourceBadge(r, tradable.fixed[r], true, locale));
    }
  }
  for (const ch of tradable.choices) {
    tradableBadges.push(
      `<span class="sw-effect-chip">${formatChoiceShortLabel(ch, locale)}</span>`
    );
  }

  const colorCounts = (
    ["brown", "gray", "yellow", "blue", "red", "green", "purple"] as const
  )
    .map((col) => {
      const cnt = neighbor.tableau.filter((c) => c.color === col).length;
      return cnt > 0
        ? `${getSevenWondersCardColorTextLocalized(col, locale).short}:${cnt}`
        : "";
    })
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="sw-neighbor-card clickable-target" data-sw-inspect-player="${escapeHtml(neighbor.id)}" title="${t(locale, "sw.inspectNeighborTitle", { name: escapeHtml(neighbor.name) })}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <div style="display:inline-flex;align-items:center;gap:6px;min-width:0;">
          <span class="t-label muted">${direction === "left" ? t(locale, "sw.westLabel") : t(locale, "sw.eastLabel")}</span>
          <span class="player-dot" style="background:${neighbor.color}"></span>
          <strong style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(neighbor.name)}</strong>
        </div>
        ${warChip}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;">
        <span class="muted">${escapeHtml(wonderCompactName)} (${neighbor.wonderSide}) · ${t(locale, "sw.stagesCount", { built: neighbor.builtWonderStages, total: board.stages.length })}</span>
        ${defeatCount > 0 ? `<span class="ga-num" style="color:#fca5a5;">${t(locale, "sw.defeatCount", { count: defeatCount })}</span>` : ""}
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px;">
        <span class="ga-chip ga-num">${renderSwCoinSvg(12)} ${neighbor.coins}</span>
        <span class="ga-chip ga-num">${renderSwShieldSvg(12)} ${oppShields}</span>
        <span class="ga-chip ga-num">${neighbor.scoreBreakdown.totalVp} ${t(locale, "common.vpUnit")}</span>
        <span class="t-label muted ga-num">${t(locale, "sw.tradeRate", { raw: rawRate, mfg: mfgRate })}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        ${tradableBadges.join("")}
        ${colorCounts ? `<span class="t-label muted ga-num" style="margin-left:auto;">${colorCounts}</span>` : ""}
      </div>
    </div>
  `;
}

export function renderEmpireCardHtml(
  state: SevenWondersState,
  player: SevenWondersPlayerState,
  focusIdx: number,
  myShields: number,
  locale: SupportedLocale = "en"
): string {
  const boardDef = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const wonderFullName = getSevenWondersWonderNameLocalized(
    player.wonderId,
    player.wonderSide,
    locale,
    false
  );
  const ownProfile = getOwnResourceProfile(player);
  const sci = player.scoreBreakdown.scienceCounts;

  const tableauGroups: { label: string; cards: SevenWondersCard[] }[] = [
    {
      label: t(locale, "sw.groupResources"),
      cards: player.tableau.filter(
        (c) => c.color === "brown" || c.color === "gray"
      ),
    },
    {
      label: t(locale, "sw.groupCommerce"),
      cards: player.tableau.filter((c) => c.color === "yellow"),
    },
    {
      label: t(locale, "sw.groupMilitary"),
      cards: player.tableau.filter((c) => c.color === "red"),
    },
    {
      label: t(locale, "sw.groupScience"),
      cards: player.tableau.filter((c) => c.color === "green"),
    },
    {
      label: t(locale, "sw.groupCivilianGuilds"),
      cards: player.tableau.filter(
        (c) => c.color === "blue" || c.color === "purple"
      ),
    },
  ];

  const wonderStagesHtml = boardDef.stages
    .map((st, idx) => {
      const isBuilt = idx < player.builtWonderStages;
      const isNext = idx === player.builtWonderStages;
      const nextPayments = isNext
        ? computeAffordablePaymentsPure(
            state.players,
            focusIdx,
            st.resourceCost,
            0
          )
        : [];
      return `
        <div class="sw-wonder-stage ${isBuilt ? "is-built" : isNext ? "is-next" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span class="t-label ${isBuilt ? "" : "muted"}">${t(locale, "sw.stageN", { num: st.stageNumber })}</span>
            ${
              isBuilt
                ? `<span class="ga-chip ga-chip--ok" style="height:20px;padding:0 6px;">${t(locale, "sw.built")}</span>`
                : isNext && nextPayments.length > 0
                  ? `<span class="ga-chip ga-chip--warn ga-num" style="height:20px;padding:0 6px;">${t(locale, "common.ready")}${
                      nextPayments[0]!.leftCoins + nextPayments[0]!.rightCoins > 0
                        ? ` (${nextPayments[0]!.leftCoins + nextPayments[0]!.rightCoins}c${nextPayments.length > 1 ? " ▾" : ""})`
                        : ""
                    }</span>`
                  : ""
            }
          </div>
          <div style="font-size:12px;font-weight:500;color:var(--ink);">${escapeHtml(getSevenWondersStageSummaryLocalized(st.summary, locale))}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;">
            ${renderCostStripHtml(st.resourceCost, 0, locale)}
          </div>
        </div>
      `;
    })
    .join("");

  const ownFixedBadges = WONDER_RESOURCES.filter((r) => ownProfile.fixed[r] > 0)
    .map((r) => renderSwResourceBadge(r, ownProfile.fixed[r], true, locale))
    .join("");
  const ownChoiceBadges = ownProfile.choices
    .map((opts) => {
      const optionsLabel = opts
        .map((o) => getSevenWondersResourceTextLocalized(o, locale).label)
        .join(" / ");
      return `<span class="sw-effect-chip" title="${t(locale, "sw.producesChoiceTitle", { options: optionsLabel })}">${formatChoiceShortLabel(opts, locale)}</span>`;
    })
    .join("");

  const empireTabsHtml =
    state.players.length > 1
      ? `<div style="display:inline-flex;gap:4px;flex-wrap:wrap;">
          ${state.players
            .map(
              (p) => `
              <button type="button" data-sw-inspect-player="${escapeHtml(p.id)}" class="btn ${
                p.id === player.id ? "btn--primary" : "btn--secondary"
              } btn--sm" style="height:23px;padding:0 7px;font-size:11px;">
                ${escapeHtml(p.name)}
              </button>
            `
            )
            .join("")}
        </div>`
      : "";

  return `<div class="sw-empire-card" style="border-color:${player.color};">
        <div class="sw-empire-header">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="player-dot" style="background:${player.color}"></span>
            <strong style="font-size:14px;font-weight:500;">${escapeHtml(wonderFullName)}</strong>
            <span class="ga-chip">${t(locale, "sw.sideLabel", { side: player.wonderSide })}</span>
            <span class="t-label muted">${t(locale, "sw.outputLabel")}</span>
            ${ownFixedBadges}
            ${ownChoiceBadges}
          </div>

          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span class="ga-chip ga-num">${renderSwCoinSvg(13)} ${player.coins}c</span>
            <span class="ga-chip ga-num">${renderSwShieldSvg(13)} ${myShields}</span>
            <span class="ga-chip ga-num" title="${t(locale, "sw.sciTooltip")}">${t(locale, "sw.sciShort", { c: sci.compass, g: sci.gear, t: sci.tablet })}</span>
            <span class="ga-chip ga-chip--warn ga-num">${player.scoreBreakdown.totalVp} ${t(locale, "common.vpUnit")}</span>
            ${empireTabsHtml}
          </div>
        </div>

        <div class="sw-wonder-stages-row">
          ${wonderStagesHtml}
        </div>

        <div class="sw-tableau-grid">
          ${tableauGroups
            .map(
              (grp) => `
              <div class="sw-tableau-col">
                <div class="t-label muted">${escapeHtml(grp.label)} (${grp.cards.length})</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                  ${
                    grp.cards.length === 0
                      ? `<span class="t-label muted" style="opacity:0.5;">—</span>`
                      : grp.cards
                          .map((c) => {
                            const cm = SW_CARD_COLOR_META[c.color];
                            const suffix = summarizeBuiltPillSuffix(c, locale);
                            const cardName = getSevenWondersCardNameLocalized(
                              c.name,
                              locale
                            );
                            return `<span class="sw-built-pill" style="border-color:${cm.border};background:${cm.headerBg};" title="${escapeHtml(cardName)}${escapeHtml(suffix)}">
                              <span>${escapeHtml(cardName)}${escapeHtml(suffix)}</span>
                            </span>`;
                          })
                          .join("")
                  }
                </div>
              </div>
            `
            )
            .join("")}
        </div>
      </div>`;
}
