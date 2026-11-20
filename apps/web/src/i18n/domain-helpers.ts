import type { AzulTileColor } from "@gaming-platform/azul";
import {
  type CommodityType,
  type DevCardType,
  type ImprovementDiscipline,
  PROGRESS_CARD_CATALOG,
  type ProgressCardType,
  type ResourceType,
  SCENARIO_CATALOG,
  SELECTABLE_SCENARIO_IDS,
  type ScenarioId,
  type TerrainType,
  type TradeGoodType,
  isCommodityType,
} from "@gaming-platform/catan";
import type { BotDifficulty } from "@gaming-platform/core";
import {
  type CardColor,
  type WonderId,
  type WonderResource,
  getWonderBoardDefinition,
} from "@gaming-platform/seven-wonders";
import type { TokenColor } from "@gaming-platform/splendor";
import type { DropdownOption, SupportedGameId } from "../app/types.ts";
import {
  BOT_DIFFICULTY_META,
  GAME_TITLE_BY_ID,
  TUTORIAL_GAME_SHORT_TITLE_BY_ID,
} from "../config/app-config.ts";
import {
  COMMODITY_META,
  DEV_CARD_META,
  DISCIPLINE_META,
  RESOURCE_META,
  TERRAIN_META,
  TRADE_GOOD_META,
} from "../config/catan-palette-config.ts";
import { GAME_REFERENCE_GUIDES } from "../config/guides-config.ts";
import { TUTORIAL_LESSONS } from "../config/tutorials-config.ts";
import type {
  GameReferenceGuide,
  TutorialGameId,
  TutorialLesson,
} from "../tutorials/types.ts";
import { AZUL_TILE_STYLES } from "../views/azul/tiles-and-factories.ts";
import {
  SW_CARD_COLOR_META,
  SW_RESOURCE_META,
} from "../views/seven-wonders/icons.ts";
import { GEM_STYLES } from "../views/splendor/gems-and-cards.ts";
import {
  ZH_TW_BOT_DIFFICULTY_META,
  ZH_TW_CATAN_COMMODITIES,
  ZH_TW_CATAN_DEV_CARDS,
  ZH_TW_CATAN_DISCIPLINES,
  ZH_TW_CATAN_PROGRESS_CARDS,
  ZH_TW_CATAN_RESOURCES,
  ZH_TW_CATAN_SCENARIOS,
  ZH_TW_CATAN_TERRAINS,
  ZH_TW_GAME_TITLES,
} from "./locales/zh-TW/domain-catan.ts";
import {
  ZH_TW_AZUL_TILES,
  ZH_TW_SPLENDOR_GEMS,
  ZH_TW_SPLENDOR_NOBLES,
  ZH_TW_SW_CARD_COLORS,
  ZH_TW_SW_CARD_NAMES,
  ZH_TW_SW_RESOURCES,
  ZH_TW_SW_STAGE_SUMMARIES,
  ZH_TW_SW_WONDERS,
} from "./locales/zh-TW/domain-other-games.ts";
import { ZH_TW_GAME_REFERENCE_GUIDES } from "./locales/zh-TW/guides.ts";
import { ZH_TW_TUTORIAL_LESSONS } from "./locales/zh-TW/tutorials.ts";
import { t } from "./translator.ts";
import type { SupportedLocale } from "./types.ts";

export function getGameTitleLocalized(
  gameId: SupportedGameId,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") return ZH_TW_GAME_TITLES[gameId];
  return GAME_TITLE_BY_ID[gameId];
}

export function getGameShortTitleLocalized(
  gameId: SupportedGameId,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") return ZH_TW_GAME_TITLES[gameId];
  return TUTORIAL_GAME_SHORT_TITLE_BY_ID[gameId];
}

export function getSetupGameDropdownOptionsLocalized(
  locale: SupportedLocale
): DropdownOption[] {
  return [
    {
      value: "catan",
      label: getGameTitleLocalized("catan", locale),
      meta: t(locale, "lobby.seatsRange", { range: "2–6" }),
    },
    {
      value: "splendor",
      label: getGameTitleLocalized("splendor", locale),
      meta: t(locale, "lobby.seatsRange", { range: "2–4" }),
    },
    {
      value: "azul",
      label: getGameTitleLocalized("azul", locale),
      meta: t(locale, "lobby.seatsRange", { range: "2–4" }),
    },
    {
      value: "seven_wonders",
      label: getGameTitleLocalized("seven_wonders", locale),
      meta: t(locale, "lobby.seatsRange", { range: "3–7" }),
    },
  ];
}

export function getBotDifficultyMetaLocalized(
  difficulty: BotDifficulty,
  locale: SupportedLocale
): { readonly label: string; readonly badge: string; readonly desc: string } {
  if (locale === "zh-TW") return ZH_TW_BOT_DIFFICULTY_META[difficulty];
  return BOT_DIFFICULTY_META[difficulty];
}

export function getCatanScenarioTextLocalized(
  scenarioId: ScenarioId,
  locale: SupportedLocale
): { readonly name: string; readonly subtitle: string; readonly description: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_SCENARIOS[scenarioId];
  const sc = SCENARIO_CATALOG[scenarioId];
  return { name: sc.name, subtitle: sc.subtitle, description: sc.description };
}

export function getCatanScenarioDropdownOptionsLocalized(
  locale: SupportedLocale
): DropdownOption[] {
  return SELECTABLE_SCENARIO_IDS.map((id) => {
    const sc = SCENARIO_CATALOG[id];
    const localized = getCatanScenarioTextLocalized(id, locale);
    return {
      value: sc.id,
      label: localized.name,
      meta: t(locale, "lobby.seatsRange", {
        range: `${sc.minPlayers}–${sc.maxPlayers}`,
      }),
    };
  });
}

export function getCatanTerrainLabelLocalized(
  terrain: TerrainType,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") return ZH_TW_CATAN_TERRAINS[terrain];
  return TERRAIN_META[terrain].label;
}

export function getCatanResourceTextLocalized(
  resource: ResourceType,
  locale: SupportedLocale
): { readonly label: string; readonly subtitle: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_RESOURCES[resource];
  const m = RESOURCE_META[resource];
  return { label: m.label, subtitle: m.subtitle };
}

export function getCatanCommodityTextLocalized(
  commodity: CommodityType,
  locale: SupportedLocale
): { readonly label: string; readonly subtitle: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_COMMODITIES[commodity];
  const m = COMMODITY_META[commodity];
  return { label: m.label, subtitle: m.subtitle };
}

export function getCatanTradeGoodLabelLocalized(
  good: TradeGoodType,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") {
    return isCommodityType(good)
      ? ZH_TW_CATAN_COMMODITIES[good].label
      : ZH_TW_CATAN_RESOURCES[good].label;
  }
  return TRADE_GOOD_META[good].label;
}

export function getCatanDevCardTextLocalized(
  devType: DevCardType,
  locale: SupportedLocale
): { readonly title: string; readonly category: string; readonly rule: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_DEV_CARDS[devType];
  const m = DEV_CARD_META[devType];
  return { title: m.title, category: m.category, rule: m.rule };
}

export function getCatanDisciplineTextLocalized(
  discipline: ImprovementDiscipline,
  locale: SupportedLocale
): {
  readonly label: string;
  readonly shortCode: string;
  readonly perkTitle: string;
  readonly perkRule: string;
} {
  if (locale === "zh-TW") return ZH_TW_CATAN_DISCIPLINES[discipline];
  const m = DISCIPLINE_META[discipline];
  return {
    label: m.label,
    shortCode: m.shortCode,
    perkTitle: m.perkTitle,
    perkRule: m.perkRule,
  };
}

export function getCatanProgressCardTextLocalized(
  cardType: ProgressCardType,
  locale: SupportedLocale
): { readonly title: string; readonly description: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_PROGRESS_CARDS[cardType];
  const c = PROGRESS_CARD_CATALOG[cardType];
  return { title: c.title, description: c.description };
}

export function getSplendorGemTextLocalized(
  color: TokenColor,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } {
  if (locale === "zh-TW") return ZH_TW_SPLENDOR_GEMS[color];
  const s = GEM_STYLES[color];
  return { label: s.label, short: s.short };
}

export function getSplendorNobleNameLocalized(
  nobleId: string,
  fallbackName: string,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") {
    return ZH_TW_SPLENDOR_NOBLES[nobleId] ?? fallbackName;
  }
  return fallbackName;
}

export function getAzulTileLabelLocalized(
  color: AzulTileColor,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") return ZH_TW_AZUL_TILES[color];
  return AZUL_TILE_STYLES[color].label;
}

export function getSevenWondersResourceTextLocalized(
  res: WonderResource,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } {
  if (locale === "zh-TW") return ZH_TW_SW_RESOURCES[res];
  const m = SW_RESOURCE_META[res];
  return { label: m.label, short: m.short };
}

export function getSevenWondersCardColorTextLocalized(
  color: CardColor,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } {
  if (locale === "zh-TW") return ZH_TW_SW_CARD_COLORS[color];
  const m = SW_CARD_COLOR_META[color];
  return { label: m.label, short: m.short };
}

export function getSevenWondersWonderNameLocalized(
  wonderId: WonderId,
  wonderSide: "A" | "B",
  locale: SupportedLocale,
  compact = false
): string {
  if (locale === "zh-TW") {
    const w = ZH_TW_SW_WONDERS[wonderId];
    return compact ? w.short : w.full;
  }
  const fullName = getWonderBoardDefinition(wonderId, wonderSide).name;
  return compact ? fullName.replace(/^The /, "") : fullName;
}

export function getSevenWondersStageSummaryLocalized(
  summary: string,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") {
    return ZH_TW_SW_STAGE_SUMMARIES[summary] ?? summary;
  }
  return summary;
}

export function getSevenWondersCardNameLocalized(
  englishName: string,
  locale: SupportedLocale
): string {
  if (locale === "zh-TW") {
    return ZH_TW_SW_CARD_NAMES[englishName] ?? englishName;
  }
  return englishName;
}

export function getTutorialLessonsLocalized(
  gameId: TutorialGameId,
  locale: SupportedLocale
): readonly TutorialLesson[] {
  if (locale === "zh-TW") return ZH_TW_TUTORIAL_LESSONS[gameId];
  return TUTORIAL_LESSONS[gameId];
}

export function getGameReferenceGuideLocalized(
  gameId: TutorialGameId,
  locale: SupportedLocale
): GameReferenceGuide {
  if (locale === "zh-TW") return ZH_TW_GAME_REFERENCE_GUIDES[gameId];
  return GAME_REFERENCE_GUIDES[gameId];
}
