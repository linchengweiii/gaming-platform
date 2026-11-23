import {
  type CardColor,
  type CardEffect,
  type ScienceSymbol,
  type SevenWondersCard,
  WONDER_RESOURCES,
  type WonderResource,
} from "@gaming-platform/seven-wonders";
import {
  type SupportedLocale,
  getSevenWondersCardColorTextLocalized,
  getSevenWondersResourceTextLocalized,
  t,
} from "../../i18n/index.ts";

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

function renderSwResourceIconSvg(
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
  compact = false,
  locale: SupportedLocale = "en"
): string {
  const meta = SW_RESOURCE_META[res];
  const resText = getSevenWondersResourceTextLocalized(res, locale);
  return `<span class="sw-res-pill ga-num" style="background:${meta.bg};border-color:${meta.border};color:${meta.ink};" title="${count} ${resText.label}">
    ${renderSwResourceIconSvg(res, compact ? 11 : 13)}
    <span>${count > 1 ? `${count} ` : ""}${compact ? resText.short : resText.label}</span>
  </span>`;
}

export function formatChoiceShortLabel(
  opts: readonly WonderResource[],
  locale: SupportedLocale = "en"
): string {
  if (opts.length === 4) return t(locale, "sw.anyRaw");
  if (opts.length === 3) return t(locale, "sw.anyGood");
  return opts
    .map((o) => getSevenWondersResourceTextLocalized(o, locale).short)
    .join("/");
}

export function summarizeCardEffectsHtml(
  card: SevenWondersCard,
  locale: SupportedLocale = "en"
): string {
  const parts: string[] = [];
  for (const ef of card.effects) {
    parts.push(renderEffectTokenHtml(ef, locale));
  }
  return parts.join(" ");
}

export function summarizeBuiltPillSuffix(
  card: SevenWondersCard,
  locale: SupportedLocale = "en"
): string {
  const tags: string[] = [];
  for (const ef of card.effects) {
    if (ef.kind === "resources") {
      const cnt = ef.count ?? 1;
      tags.push(
        ef.options.length === 1
          ? `${cnt > 1 ? cnt : ""}${getSevenWondersResourceTextLocalized(ef.options[0]!, locale).short}`
          : formatChoiceShortLabel(ef.options, locale)
      );
    } else if (ef.kind === "vp") {
      tags.push(`+${ef.points}VP`);
    } else if (ef.kind === "shields") {
      tags.push(`⚔${ef.shields}`);
    } else if (ef.kind === "science") {
      tags.push(
        ef.symbol === "compass"
          ? t(locale, "sw.compassShort")
          : ef.symbol === "gear"
            ? t(locale, "sw.gearShort")
            : t(locale, "sw.tabletShort")
      );
    } else if (ef.kind === "wildcard_science") {
      tags.push(t(locale, "sw.pillSciWild"));
    } else if (ef.kind === "trade_discount") {
      tags.push(
        ef.manufacturedBoth
          ? t(locale, "sw.pillDiscGood")
          : ef.rawLeft && ef.rawRight
            ? t(locale, "sw.pillDiscRaw")
            : ef.rawLeft
              ? t(locale, "sw.pillDiscWest")
              : t(locale, "sw.pillDiscEast")
      );
    } else if (ef.kind === "coins") {
      tags.push(`+${ef.coins}c`);
    } else if (ef.kind === "per_card_reward") {
      const parts: string[] = [];
      if (ef.coinsPerMatch > 0) parts.push(`+${ef.coinsPerMatch}c`);
      if (ef.vpPerMatch > 0) parts.push(`+${ef.vpPerMatch}VP`);
      if (parts.length > 0) {
        tags.push(t(locale, "sw.pillPerCard", { rewards: parts.join("/") }));
      }
    } else if (ef.kind === "per_wonder_stage_reward") {
      const parts: string[] = [];
      if (ef.coinsPerStage > 0) parts.push(`+${ef.coinsPerStage}c`);
      if (ef.vpPerStage > 0) parts.push(`+${ef.vpPerStage}VP`);
      if (parts.length > 0) {
        tags.push(t(locale, "sw.pillPerStage", { rewards: parts.join("/") }));
      }
    } else if (ef.kind === "per_defeat_token_vp") {
      tags.push(`+${ef.vpPerToken}VP/-1⚔`);
    }
  }
  return tags.length > 0 ? ` · ${tags.join(" ")}` : "";
}

function renderEffectTokenHtml(
  ef: CardEffect,
  locale: SupportedLocale = "en"
): string {
  if (ef.kind === "resources") {
    const count = ef.count ?? 1;
    if (ef.options.length === 1) {
      return renderSwResourceBadge(ef.options[0]!, count, true, locale);
    }
    const optionsLabel = ef.options
      .map((o) => getSevenWondersResourceTextLocalized(o, locale).label)
      .join(" / ");
    return `<span class="sw-effect-chip" title="${t(locale, "sw.producesChoiceTitle", { options: optionsLabel })}">
      ${formatChoiceShortLabel(ef.options, locale)}
    </span>`;
  }
  if (ef.kind === "vp") {
    return `<span class="sw-vp-badge ga-num">+${ef.points} ${t(locale, "common.vpUnit")}</span>`;
  }
  if (ef.kind === "shields") {
    return `<span class="sw-shield-badge ga-num">${renderSwShieldSvg(13)} +${ef.shields}</span>`;
  }
  if (ef.kind === "science") {
    const label =
      ef.symbol === "compass"
        ? t(locale, "sw.compass")
        : ef.symbol === "gear"
          ? t(locale, "sw.gear")
          : t(locale, "sw.tablet");
    return `<span class="sw-sci-badge" title="${t(locale, "sw.sciencePrefix", { label })}">${renderSwScienceIconSvg(ef.symbol, 14)} ${label}</span>`;
  }
  if (ef.kind === "wildcard_science") {
    return `<span class="sw-sci-badge" title="${t(locale, "sw.anyScienceTitle")}">${t(locale, "sw.anyScienceLabel")}</span>`;
  }
  if (ef.kind === "coins") {
    return `<span class="sw-coin-badge ga-num">${renderSwCoinSvg(13)} +${ef.coins}</span>`;
  }
  if (ef.kind === "trade_discount") {
    const dir = ef.manufacturedBoth
      ? t(locale, "sw.discGoodsBoth")
      : ef.rawLeft && ef.rawRight
        ? t(locale, "sw.discRawBoth")
        : ef.rawLeft
          ? t(locale, "sw.discRawWest")
          : t(locale, "sw.discRawEast");
    return `<span class="sw-effect-chip">${dir}</span>`;
  }
  if (ef.kind === "per_card_reward") {
    const scope =
      ef.includeSelf && ef.includeNeighbors
        ? t(locale, "sw.scopeAll")
        : ef.includeSelf
          ? t(locale, "sw.scopeOwn")
          : t(locale, "sw.scopeNeighbors");
    const target =
      locale === "en"
        ? ef.targetColors.join("/")
        : ef.targetColors
            .map((col) => getSevenWondersCardColorTextLocalized(col, locale).short)
            .join("/");
    const rewards: string[] = [];
    if (ef.coinsPerMatch > 0) rewards.push(`+${ef.coinsPerMatch}c`);
    if (ef.vpPerMatch > 0) rewards.push(`+${ef.vpPerMatch}VP`);
    return `<span class="sw-effect-chip ga-num">${rewards.join(" ")} / ${scope} ${target}</span>`;
  }
  if (ef.kind === "per_wonder_stage_reward") {
    const scope = ef.includeNeighbors
      ? t(locale, "sw.scopeAll")
      : t(locale, "sw.scopeOwn");
    const rewards: string[] = [];
    if (ef.coinsPerStage > 0) rewards.push(`+${ef.coinsPerStage}c`);
    if (ef.vpPerStage > 0) rewards.push(`+${ef.vpPerStage}VP`);
    return `<span class="sw-effect-chip ga-num">${t(locale, "sw.perStage", { rewards: rewards.join(" "), scope })}</span>`;
  }
  if (ef.kind === "per_defeat_token_vp") {
    return `<span class="sw-effect-chip ga-num">${t(locale, "sw.perDefeat", { vp: ef.vpPerToken })}</span>`;
  }
  if (ef.kind === "complete_wonder_vp") {
    return `<span class="sw-vp-badge ga-num">${t(locale, "sw.fullWonderVp", { vp: ef.points })}</span>`;
  }
  return "";
}

export function renderCostStripHtml(
  resourceCost: Partial<Record<WonderResource, number>>,
  coinCost = 0,
  locale: SupportedLocale = "en"
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
      chips.push(renderSwResourceBadge(res, amt, true, locale));
    }
  }
  if (chips.length === 0) {
    return `<span class="t-label muted">${t(locale, "common.free")}</span>`;
  }
  return chips.join(" ");
}
