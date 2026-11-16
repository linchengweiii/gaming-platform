import {
  type CardColor,
  type CardEffect,
  MANUFACTURED_GOODS,
  RAW_RESOURCES,
  type ScienceSymbol,
  type SevenWondersAction,
  type SevenWondersCard,
  type SevenWondersPlayerState,
  type SevenWondersState,
  WONDER_RESOURCES,
  type WonderResource,
  canPlayerBuildViaChain,
  canPlayerUnselectDraftPick,
  computeAffordablePaymentsPure,
  computeSevenWondersScoreBreakdown,
  getLeftNeighborIndex,
  getNeighborTradableProfile,
  getOwnResourceProfile,
  getPlayerShields,
  getPlayerTradeRates,
  getRightNeighborIndex,
  getWonderBoardDefinition,
  hasDuplicateCardName,
  hasWonderStageEffect,
} from "@gaming-platform/seven-wonders";

export const SW_RESOURCE_META: Readonly<
  Record<
    WonderResource,
    {
      readonly label: string;
      readonly short: string;
      readonly bg: string;
      readonly border: string;
      readonly ink: string;
    }
  >
> = {
  wood: {
    label: "Wood",
    short: "Wd",
    bg: "#3f2a1d",
    border: "#a16207",
    ink: "#fef3c7",
  },
  stone: {
    label: "Stone",
    short: "St",
    bg: "#334155",
    border: "#94a3b8",
    ink: "#f8fafc",
  },
  ore: {
    label: "Ore",
    short: "Or",
    bg: "#1e293b",
    border: "#64748b",
    ink: "#e2e8f0",
  },
  clay: {
    label: "Clay",
    short: "Cl",
    bg: "#5c2418",
    border: "#ea580c",
    ink: "#ffedd5",
  },
  glass: {
    label: "Glass",
    short: "Gl",
    bg: "#0f3d4c",
    border: "#38bdf8",
    ink: "#e0f2fe",
  },
  loom: {
    label: "Loom",
    short: "Lm",
    bg: "#4c1d2f",
    border: "#f43f5e",
    ink: "#ffe4e6",
  },
  papyrus: {
    label: "Papyrus",
    short: "Pa",
    bg: "#42371b",
    border: "#eab308",
    ink: "#fef9c3",
  },
};

export const SW_CARD_COLOR_META: Readonly<
  Record<
    CardColor,
    {
      readonly label: string;
      readonly short: string;
      readonly headerBg: string;
      readonly border: string;
      readonly accent: string;
    }
  >
> = {
  brown: {
    label: "Raw material",
    short: "Br",
    headerBg: "linear-gradient(135deg, #52301c 0%, #2a1a11 100%)",
    border: "#a16207",
    accent: "#fbbf24",
  },
  gray: {
    label: "Manufactured",
    short: "Gr",
    headerBg: "linear-gradient(135deg, #3f4854 0%, #20252c 100%)",
    border: "#94a3b8",
    accent: "#e2e8f0",
  },
  blue: {
    label: "Civilian",
    short: "Bl",
    headerBg: "linear-gradient(135deg, #1d4ed8 0%, #172554 100%)",
    border: "#60a5fa",
    accent: "#93c5fd",
  },
  yellow: {
    label: "Commerce",
    short: "Yl",
    headerBg: "linear-gradient(135deg, #a16207 0%, #422006 100%)",
    border: "#facc15",
    accent: "#fde047",
  },
  red: {
    label: "Military",
    short: "Rd",
    headerBg: "linear-gradient(135deg, #991b1b 0%, #450a0a 100%)",
    border: "#f87171",
    accent: "#fca5a5",
  },
  green: {
    label: "Science",
    short: "Gn",
    headerBg: "linear-gradient(135deg, #166534 0%, #052e16 100%)",
    border: "#4ade80",
    accent: "#86efac",
  },
  purple: {
    label: "Guild",
    short: "Pu",
    headerBg: "linear-gradient(135deg, #581c87 0%, #2e1065 100%)",
    border: "#c084fc",
    accent: "#e9d5ff",
  },
};

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderSwResourceIconSvg(
  res: WonderResource,
  size = 14
): string {
  const paths: Record<WonderResource, string> = {
    wood: `<path d="M2 9.5h12M3.5 6.5h9M5 3.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
    stone: `<polygon points="3,12 5,4 11,4 13,12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
    ore: `<polygon points="8,2.5 13,6.5 11,13 5,13 3,6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
    clay: `<rect x="2.5" y="4.5" width="11" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" stroke-width="1.2"/>`,
    glass: `<path d="M6 2.5h4M7 2.5v3l-3 4.8a1.5 1.5 0 0 0 1.3 2.2h5.4A1.5 1.5 0 0 0 12 10.3L9 5.5v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    loom: `<path d="M3 4h10v8H3zM3 7h10M6.5 4v8M9.5 4v8" fill="none" stroke="currentColor" stroke-width="1.3"/>`,
    papyrus: `<path d="M4 3.5h7a1.5 1.5 0 0 1 1.5 1.5v7.5H5.5A1.5 1.5 0 0 1 4 11V3.5zM6.5 6.5h4M6.5 9h4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`,
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="flex: none;">${paths[res]}</svg>`;
}

export function renderSwScienceIconSvg(
  sym: ScienceSymbol,
  size = 15
): string {
  if (sym === "compass") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5L4 13.5M8 2.5l4 11M5.2 9.5h5.6" fill="none" stroke="#86efac" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  if (sym === "gear") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="none" stroke="#86efac" stroke-width="1.5"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4" stroke="#86efac" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="9" height="11" rx="1.5" fill="none" stroke="#86efac" stroke-width="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3.5" stroke="#86efac" stroke-width="1.3" stroke-linecap="round"/></svg>`;
}

export function renderSwShieldSvg(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2L3 4.2v4.1c0 3.1 2.1 5.1 5 6.2 2.9-1.1 5-3.1 5-6.2V4.2L8 2z" fill="#dc2626" stroke="#fca5a5" stroke-width="1.3"/></svg>`;
}

export function renderSwCoinSvg(size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.8" fill="#eab308" stroke="#fef08a" stroke-width="1.3"/><circle cx="8" cy="8" r="3.3" fill="none" stroke="#713f12" stroke-width="1"/></svg>`;
}

export function renderSwResourceBadge(
  res: WonderResource,
  count = 1,
  compact = false
): string {
  const meta = SW_RESOURCE_META[res];
  return `<span class="sw-res-pill ga-num" style="background:${meta.bg};border-color:${meta.border};color:${meta.ink};" title="${count} ${meta.label}">
    ${renderSwResourceIconSvg(res, compact ? 11 : 13)}
    <span>${count > 1 ? `${count} ` : ""}${compact ? meta.short : meta.label}</span>
  </span>`;
}

function formatChoiceShortLabel(opts: readonly WonderResource[]): string {
  if (opts.length === 4) return "Any Raw";
  if (opts.length === 3) return "Any Good";
  return opts.map((o) => SW_RESOURCE_META[o].short).join("/");
}

function summarizeCardEffectsHtml(card: SevenWondersCard): string {
  const parts: string[] = [];
  for (const ef of card.effects) {
    parts.push(renderEffectTokenHtml(ef));
  }
  return parts.join(" ");
}

function summarizeBuiltPillSuffix(card: SevenWondersCard): string {
  const tags: string[] = [];
  for (const ef of card.effects) {
    if (ef.kind === "resources") {
      const cnt = ef.count ?? 1;
      tags.push(
        ef.options.length === 1
          ? `${cnt > 1 ? cnt : ""}${SW_RESOURCE_META[ef.options[0]!].short}`
          : formatChoiceShortLabel(ef.options)
      );
    } else if (ef.kind === "vp") {
      tags.push(`+${ef.points}VP`);
    } else if (ef.kind === "shields") {
      tags.push(`⚔${ef.shields}`);
    } else if (ef.kind === "science") {
      tags.push(
        ef.symbol === "compass" ? "Cmp" : ef.symbol === "gear" ? "Gear" : "Tab"
      );
    } else if (ef.kind === "wildcard_science") {
      tags.push("Sci*");
    } else if (ef.kind === "trade_discount") {
      tags.push(
        ef.manufacturedBoth
          ? "1c Good"
          : ef.rawLeft && ef.rawRight
            ? "1c Raw"
            : ef.rawLeft
              ? "1c←W"
              : "1c→E"
      );
    } else if (ef.kind === "coins") {
      tags.push(`+${ef.coins}c`);
    } else if (ef.kind === "per_card_reward") {
      const parts: string[] = [];
      if (ef.coinsPerMatch > 0) parts.push(`+${ef.coinsPerMatch}c`);
      if (ef.vpPerMatch > 0) parts.push(`+${ef.vpPerMatch}VP`);
      if (parts.length > 0) tags.push(`${parts.join("/")}/card`);
    } else if (ef.kind === "per_wonder_stage_reward") {
      const parts: string[] = [];
      if (ef.coinsPerStage > 0) parts.push(`+${ef.coinsPerStage}c`);
      if (ef.vpPerStage > 0) parts.push(`+${ef.vpPerStage}VP`);
      if (parts.length > 0) tags.push(`${parts.join("/")}/stg`);
    } else if (ef.kind === "per_defeat_token_vp") {
      tags.push(`+${ef.vpPerToken}VP/-1⚔`);
    }
  }
  return tags.length > 0 ? ` · ${tags.join(" ")}` : "";
}

function renderEffectTokenHtml(ef: CardEffect): string {
  if (ef.kind === "resources") {
    const count = ef.count ?? 1;
    if (ef.options.length === 1) {
      return renderSwResourceBadge(ef.options[0]!, count, true);
    }
    return `<span class="sw-effect-chip" title="Produces 1 of ${ef.options.map((o) => SW_RESOURCE_META[o].label).join(" / ")}">
      ${formatChoiceShortLabel(ef.options)}
    </span>`;
  }
  if (ef.kind === "vp") {
    return `<span class="sw-vp-badge ga-num">+${ef.points} VP</span>`;
  }
  if (ef.kind === "shields") {
    return `<span class="sw-shield-badge ga-num">${renderSwShieldSvg(13)} +${ef.shields}</span>`;
  }
  if (ef.kind === "science") {
    const label =
      ef.symbol === "compass"
        ? "Compass"
        : ef.symbol === "gear"
          ? "Gear"
          : "Tablet";
    return `<span class="sw-sci-badge" title="Science: ${label}">${renderSwScienceIconSvg(ef.symbol, 14)} ${label}</span>`;
  }
  if (ef.kind === "wildcard_science") {
    return `<span class="sw-sci-badge" title="Any 1 Science symbol">Compass / Gear / Tablet</span>`;
  }
  if (ef.kind === "coins") {
    return `<span class="sw-coin-badge ga-num">${renderSwCoinSvg(13)} +${ef.coins}</span>`;
  }
  if (ef.kind === "trade_discount") {
    const dir = ef.manufacturedBoth
      ? "1c Goods L&R"
      : ef.rawLeft && ef.rawRight
        ? "1c Raw L&R"
        : ef.rawLeft
          ? "1c Raw ← West"
          : "1c Raw East →";
    return `<span class="sw-effect-chip">${dir}</span>`;
  }
  if (ef.kind === "per_card_reward") {
    const scope =
      ef.includeSelf && ef.includeNeighbors
        ? "L+You+R"
        : ef.includeSelf
          ? "own"
          : "L+R";
    const target = ef.targetColors.join("/");
    const rewards: string[] = [];
    if (ef.coinsPerMatch > 0) rewards.push(`+${ef.coinsPerMatch}c`);
    if (ef.vpPerMatch > 0) rewards.push(`+${ef.vpPerMatch}VP`);
    return `<span class="sw-effect-chip ga-num">${rewards.join(" ")} / ${scope} ${target}</span>`;
  }
  if (ef.kind === "per_wonder_stage_reward") {
    const scope = ef.includeNeighbors ? "L+You+R" : "own";
    const rewards: string[] = [];
    if (ef.coinsPerStage > 0) rewards.push(`+${ef.coinsPerStage}c`);
    if (ef.vpPerStage > 0) rewards.push(`+${ef.vpPerStage}VP`);
    return `<span class="sw-effect-chip ga-num">${rewards.join(" ")} / ${scope} stage</span>`;
  }
  if (ef.kind === "per_defeat_token_vp") {
    return `<span class="sw-effect-chip ga-num">+${ef.vpPerToken}VP / L+R defeat</span>`;
  }
  if (ef.kind === "complete_wonder_vp") {
    return `<span class="sw-vp-badge ga-num">+${ef.points} VP full wonder</span>`;
  }
  return "";
}

function computeImmediateCardPreviewHtml(
  state: SevenWondersState,
  playerIndex: number,
  card: SevenWondersCard
): string {
  const players = state.players;
  const player = players[playerIndex]!;
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
    const fmtFlip = (oppSh: number, tag: string): string | null => {
      const prev = myNow > oppSh ? "Win" : myNow < oppSh ? "Lose" : "Tie";
      const next = myNext > oppSh ? "Win" : myNext < oppSh ? "Lose" : "Tie";
      return prev !== next ? `${tag}: ${prev}→${next}` : null;
    };
    const wFlip = fmtFlip(getPlayerShields(left), "W");
    const eFlip = fmtFlip(getPlayerShields(right), "E");
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
    return `<div class="t-label ga-num" style="color:#86efac;">Now: +${sciDelta} sci VP${
      setsAfter > setsBefore ? " (completes set!)" : ""
    }</div>`;
  }

  if (card.color === "yellow" || card.color === "purple") {
    if (nonCoinVpDelta > 0 || coinsNow > 0) {
      const bits: string[] = [];
      if (coinsNow > 0) bits.push(`+${coinsNow}c`);
      if (nonCoinVpDelta > 0) bits.push(`+${nonCoinVpDelta} VP`);
      return `<div class="t-label ga-num" style="color:#fde047;">Now: ${bits.join(", ")}</div>`;
    }
    const isScalingVpCard = card.effects.some(
      (ef) =>
        (ef.kind === "per_card_reward" && ef.vpPerMatch > 0) ||
        (ef.kind === "per_wonder_stage_reward" && ef.vpPerStage > 0) ||
        ef.kind === "per_defeat_token_vp"
    );
    if (isScalingVpCard) {
      return `<div class="t-label ga-num muted">Now: +0 VP</div>`;
    }
  }

  return "";
}

function renderCostStripHtml(
  resourceCost: Partial<Record<WonderResource, number>>,
  coinCost = 0
): string {
  const chips: string[] = [];
  if (coinCost > 0) {
    chips.push(
      `<span class="sw-coin-badge ga-num">${renderSwCoinSvg(12)} ${coinCost}</span>`
    );
  }
  for (const res of WONDER_RESOURCES) {
    const amt = resourceCost[res] ?? 0;
    if (amt > 0) {
      chips.push(renderSwResourceBadge(res, amt, true));
    }
  }
  if (chips.length === 0) {
    return `<span class="t-label muted">Free</span>`;
  }
  return chips.join(" ");
}

function renderNeighborPanelHtml(
  neighbor: SevenWondersPlayerState,
  direction: "left" | "right",
  myShields: number,
  rawRate: 1 | 2,
  mfgRate: 1 | 2
): string {
  const oppShields = getPlayerShields(neighbor);
  const warDiff = myShields - oppShields;
  const warChip =
    warDiff > 0
      ? `<span class="ga-chip ga-chip--ok ga-num">War +${warDiff}</span>`
      : warDiff < 0
        ? `<span class="ga-chip ga-chip--danger ga-num">War ${warDiff}</span>`
        : `<span class="ga-chip ga-num">War tied</span>`;

  const board = getWonderBoardDefinition(neighbor.wonderId, neighbor.wonderSide);
  const defeatCount = neighbor.militaryTokens.filter((t) => t.points < 0).length;

  const tradable = getNeighborTradableProfile(neighbor);
  const tradableBadges: string[] = [];
  for (const r of [...RAW_RESOURCES, ...MANUFACTURED_GOODS]) {
    if (tradable.fixed[r] > 0) {
      tradableBadges.push(renderSwResourceBadge(r, tradable.fixed[r], true));
    }
  }
  for (const ch of tradable.choices) {
    tradableBadges.push(
      `<span class="sw-effect-chip">${formatChoiceShortLabel(ch)}</span>`
    );
  }

  const colorCounts = (
    ["brown", "gray", "yellow", "blue", "red", "green", "purple"] as const
  )
    .map((col) => {
      const cnt = neighbor.tableau.filter((c) => c.color === col).length;
      return cnt > 0 ? `${SW_CARD_COLOR_META[col].short}:${cnt}` : "";
    })
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="sw-neighbor-card clickable-target" data-sw-inspect-player="${escapeHtml(neighbor.id)}" title="Click to inspect ${escapeHtml(neighbor.name)}'s full city &amp; wonder">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <div style="display:inline-flex;align-items:center;gap:6px;min-width:0;">
          <span class="t-label muted">${direction === "left" ? "← West" : "East →"}</span>
          <span class="player-dot" style="background:${neighbor.color}"></span>
          <strong style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(neighbor.name)}</strong>
        </div>
        ${warChip}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;">
        <span class="muted">${escapeHtml(board.name.replace(/^The /, ""))} (${neighbor.wonderSide}) · Stages ${neighbor.builtWonderStages}/${board.stages.length}</span>
        ${defeatCount > 0 ? `<span class="ga-num" style="color:#fca5a5;">-${defeatCount} defeat</span>` : ""}
      </div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:12px;">
        <span class="ga-chip ga-num">${renderSwCoinSvg(12)} ${neighbor.coins}</span>
        <span class="ga-chip ga-num">${renderSwShieldSvg(12)} ${oppShields}</span>
        <span class="ga-chip ga-num">${neighbor.scoreBreakdown.totalVp} VP</span>
        <span class="t-label muted ga-num">Rate: ${rawRate}c raw · ${mfgRate}c good</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        ${tradableBadges.join("")}
        ${colorCounts ? `<span class="t-label muted ga-num" style="margin-left:auto;">${colorCounts}</span>` : ""}
      </div>
    </div>
  `;
}

function renderScorepadHtml(state: SevenWondersState): string {
  const ranked = [...state.players].sort(
    (a, b) =>
      b.scoreBreakdown.totalVp - a.scoreBreakdown.totalVp ||
      b.coins - a.coins
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
                    <td>${sb.scientificVp}</td>
                    <td>${sb.commercialVp}</td>
                    <td>${sb.guildVp}${sb.copiedGuildName ? ` *` : ""}</td>
                    <td><strong>${sb.totalVp}</strong></td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderSevenWondersBoardView(
  state: SevenWondersState,
  viewerPlayerId: string | null,
  selectedCardId: string | null,
  legalActions: readonly SevenWondersAction[],
  inspectedPlayerId?: string | null,
  hideHandForPassAndPlay = false
): string {
  const viewerIdx = (() => {
    if (viewerPlayerId) {
      const idx = state.players.findIndex((p) => p.id === viewerPlayerId);
      if (idx >= 0) return idx;
    }
    return 0;
  })();

  const focusIdx = (() => {
    if (inspectedPlayerId) {
      const idx = state.players.findIndex((p) => p.id === inspectedPlayerId);
      if (idx >= 0) return idx;
    }
    return viewerIdx;
  })();

  const viewerPlayer = state.players[viewerIdx]!;
  const player = state.players[focusIdx]!;
  const isInspectingOther = focusIdx !== viewerIdx;

  const leftNeighbor =
    state.players[getLeftNeighborIndex(focusIdx, state.players.length)]!;
  const rightNeighbor =
    state.players[getRightNeighborIndex(focusIdx, state.players.length)]!;
  const rates = getPlayerTradeRates(player);
  const myShields = getPlayerShields(player);
  const boardDef = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const ownProfile = getOwnResourceProfile(player);
  const sci = player.scoreBreakdown.scienceCounts;

  const passLabel =
    state.phase === "SEVENTH_CARD_PLAY"
      ? "Bonus 7th card play — no hand pass"
      : state.passDirection === "clockwise"
        ? "Pass clockwise (West → You → East)"
        : "Pass counter-clockwise (East → You → West)";
  const ageRoman = state.age === 1 ? "I" : state.age === 2 ? "II" : "III";

  const tableauGroups: { label: string; cards: SevenWondersCard[] }[] = [
    {
      label: "Resources & Goods",
      cards: player.tableau.filter(
        (c) => c.color === "brown" || c.color === "gray"
      ),
    },
    {
      label: "Commerce",
      cards: player.tableau.filter((c) => c.color === "yellow"),
    },
    {
      label: "Military",
      cards: player.tableau.filter((c) => c.color === "red"),
    },
    {
      label: "Science",
      cards: player.tableau.filter((c) => c.color === "green"),
    },
    {
      label: "Civilian & Guilds",
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
            <span class="t-label ${isBuilt ? "" : "muted"}">Stage ${st.stageNumber}</span>
            ${
              isBuilt
                ? `<span class="ga-chip ga-chip--ok" style="height:20px;padding:0 6px;">Built</span>`
                : isNext && nextPayments.length > 0
                  ? `<span class="ga-chip ga-chip--warn ga-num" style="height:20px;padding:0 6px;">Ready${
                      nextPayments[0]!.leftCoins + nextPayments[0]!.rightCoins > 0
                        ? ` (${nextPayments[0]!.leftCoins + nextPayments[0]!.rightCoins}c${nextPayments.length > 1 ? " ▾" : ""})`
                        : ""
                    }</span>`
                  : ""
            }
          </div>
          <div style="font-size:12px;font-weight:500;color:var(--ink);">${escapeHtml(st.summary)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:3px;">
            ${renderCostStripHtml(st.resourceCost, 0)}
          </div>
        </div>
      `;
    })
    .join("");

  const handOrResolutionHtml = (() => {
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
  })();

  const ownFixedBadges = WONDER_RESOURCES.filter((r) => ownProfile.fixed[r] > 0)
    .map((r) => renderSwResourceBadge(r, ownProfile.fixed[r], true))
    .join("");
  const ownChoiceBadges = ownProfile.choices
    .map(
      (opts) =>
        `<span class="sw-effect-chip" title="Produces 1 of ${opts.map((o) => SW_RESOURCE_META[o].label).join(" / ")}">${formatChoiceShortLabel(opts)}</span>`
    )
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

  return `
    <div class="sw-board">
      <div class="sw-top-grid">
        ${renderNeighborPanelHtml(
          leftNeighbor,
          "left",
          myShields,
          rates.rawLeft,
          rates.manufacturedLeft
        )}

        <div class="sw-age-banner">
          <div style="display:inline-flex;align-items:center;gap:8px;">
            <span class="ga-chip ga-chip--accent ga-num">Age ${ageRoman}</span>
            <span class="ga-chip ga-num">Draft ${state.draftRound}/6</span>
          </div>
          <div class="t-label muted" style="text-align:center;">${passLabel}</div>
          <div class="t-label muted ga-num">Discards: ${
            state.hiddenDiscardCount ?? state.discardPile.length
          }</div>
        </div>

        ${renderNeighborPanelHtml(
          rightNeighbor,
          "right",
          myShields,
          rates.rawRight,
          rates.manufacturedRight
        )}
      </div>

      <div class="sw-empire-card" style="border-color:${player.color};">
        <div class="sw-empire-header">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="player-dot" style="background:${player.color}"></span>
            <strong style="font-size:14px;font-weight:500;">${escapeHtml(boardDef.name)}</strong>
            <span class="ga-chip">Side ${player.wonderSide}</span>
            <span class="t-label muted">Output:</span>
            ${ownFixedBadges}
            ${ownChoiceBadges}
          </div>

          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span class="ga-chip ga-num">${renderSwCoinSvg(13)} ${player.coins}c</span>
            <span class="ga-chip ga-num">${renderSwShieldSvg(13)} ${myShields}</span>
            <span class="ga-chip ga-num" title="Science symbols (Compass / Gear / Tablet)">Sci ${sci.compass}/${sci.gear}/${sci.tablet}</span>
            <span class="ga-chip ga-chip--warn ga-num">${player.scoreBreakdown.totalVp} VP</span>
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
                            const suffix = summarizeBuiltPillSuffix(c);
                            return `<span class="sw-built-pill" style="border-color:${cm.border};background:${cm.headerBg};" title="${escapeHtml(c.name)}${escapeHtml(suffix)}">
                              <span>${escapeHtml(c.name)}${escapeHtml(suffix)}</span>
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
      </div>

      ${handOrResolutionHtml}
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
      <div class="player-card-header">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="player-dot" style="background:${p.color}"></span>
          <strong style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</strong>
          <span class="ga-chip" style="height:20px;padding:0 6px;">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.scoreBreakdown.totalVp} VP</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:12px;">
        <span class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
          board.name.replace(/^The /, "")
        )} (${p.wonderSide})</span>
        ${
          state.phase === "AGE_DRAFT"
            ? isLocked
              ? `<span class="ga-chip ga-chip--ok" style="height:19px;padding:0 6px;">Ready</span>`
              : `<span class="ga-chip" style="height:19px;padding:0 6px;">Drafting</span>`
            : ""
        }
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:12px;" class="ga-num">
        <span class="ga-chip">${renderSwCoinSvg(11)} ${p.coins}</span>
        <span class="ga-chip">${renderSwShieldSvg(11)} ${shields}</span>
        <span class="ga-chip">Stages ${p.builtWonderStages}/${board.stages.length}</span>
        <span class="ga-chip" title="Compass / Gear / Tablet">Sci ${sci.compass}/${sci.gear}/${sci.tablet}</span>
      </div>
    </div>
  `;
}
