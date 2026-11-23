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

const GAME_SEAT_RANGES: readonly [SupportedGameId, string][] = [
  ["catan", "2–6"],
  ["splendor", "2–4"],
  ["azul", "2–4"],
  ["seven_wonders", "3–7"],
];

export const getGameTitleLocalized = (
  gameId: SupportedGameId,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_GAME_TITLES[gameId] : GAME_TITLE_BY_ID[gameId];

export const getGameShortTitleLocalized = (
  gameId: SupportedGameId,
  locale: SupportedLocale
): string =>
  locale === "zh-TW"
    ? ZH_TW_GAME_TITLES[gameId]
    : TUTORIAL_GAME_SHORT_TITLE_BY_ID[gameId];

export const getSetupGameDropdownOptionsLocalized = (
  locale: SupportedLocale
): DropdownOption[] =>
  GAME_SEAT_RANGES.map(([value, range]) => ({
    value,
    label: getGameTitleLocalized(value, locale),
    meta: t(locale, "lobby.seatsRange", { range }),
  }));

export const getBotDifficultyMetaLocalized = (
  difficulty: BotDifficulty,
  locale: SupportedLocale
): { readonly label: string; readonly badge: string; readonly desc: string } =>
  locale === "zh-TW"
    ? ZH_TW_BOT_DIFFICULTY_META[difficulty]
    : BOT_DIFFICULTY_META[difficulty];

export function getCatanScenarioTextLocalized(
  scenarioId: ScenarioId,
  locale: SupportedLocale
): { readonly name: string; readonly subtitle: string; readonly description: string } {
  if (locale === "zh-TW") return ZH_TW_CATAN_SCENARIOS[scenarioId];
  const { name, subtitle, description } = SCENARIO_CATALOG[scenarioId];
  return { name, subtitle, description };
}

export const getCatanScenarioDropdownOptionsLocalized = (
  locale: SupportedLocale
): DropdownOption[] =>
  SELECTABLE_SCENARIO_IDS.map((id) => {
    const sc = SCENARIO_CATALOG[id];
    return {
      value: sc.id,
      label: getCatanScenarioTextLocalized(id, locale).name,
      meta: t(locale, "lobby.seatsRange", {
        range: `${sc.minPlayers}–${sc.maxPlayers}`,
      }),
    };
  });

export const getCatanTerrainLabelLocalized = (
  terrain: TerrainType,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_CATAN_TERRAINS[terrain] : TERRAIN_META[terrain].label;

export const getCatanResourceTextLocalized = (
  resource: ResourceType,
  locale: SupportedLocale
): { readonly label: string; readonly subtitle: string } =>
  locale === "zh-TW"
    ? ZH_TW_CATAN_RESOURCES[resource]
    : { label: RESOURCE_META[resource].label, subtitle: RESOURCE_META[resource].subtitle };

export const getCatanCommodityTextLocalized = (
  commodity: CommodityType,
  locale: SupportedLocale
): { readonly label: string; readonly subtitle: string } =>
  locale === "zh-TW"
    ? ZH_TW_CATAN_COMMODITIES[commodity]
    : {
        label: COMMODITY_META[commodity].label,
        subtitle: COMMODITY_META[commodity].subtitle,
      };

export const getCatanTradeGoodLabelLocalized = (
  good: TradeGoodType,
  locale: SupportedLocale
): string =>
  locale === "zh-TW"
    ? isCommodityType(good)
      ? ZH_TW_CATAN_COMMODITIES[good].label
      : ZH_TW_CATAN_RESOURCES[good].label
    : (isCommodityType(good) ? COMMODITY_META[good] : RESOURCE_META[good]).label;

export const getCatanDevCardTextLocalized = (
  devType: DevCardType,
  locale: SupportedLocale
): { readonly title: string; readonly category: string; readonly rule: string } =>
  locale === "zh-TW"
    ? ZH_TW_CATAN_DEV_CARDS[devType]
    : {
        title: DEV_CARD_META[devType].title,
        category: DEV_CARD_META[devType].category,
        rule: DEV_CARD_META[devType].rule,
      };

export function getCatanDisciplineTextLocalized(
  discipline: ImprovementDiscipline,
  locale: SupportedLocale
): {
  readonly label: string;
  readonly shortCode: string;
} {
  if (locale === "zh-TW") return ZH_TW_CATAN_DISCIPLINES[discipline];
  const { label, shortCode } = DISCIPLINE_META[discipline];
  return { label, shortCode };
}

export const getCatanProgressCardTextLocalized = (
  cardType: ProgressCardType,
  locale: SupportedLocale
): { readonly title: string; readonly description: string } =>
  locale === "zh-TW"
    ? ZH_TW_CATAN_PROGRESS_CARDS[cardType]
    : {
        title: PROGRESS_CARD_CATALOG[cardType].title,
        description: PROGRESS_CARD_CATALOG[cardType].description,
      };

export const getSplendorGemTextLocalized = (
  color: TokenColor,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } =>
  locale === "zh-TW"
    ? ZH_TW_SPLENDOR_GEMS[color]
    : { label: GEM_STYLES[color].label, short: GEM_STYLES[color].short };

export const getSplendorNobleNameLocalized = (
  nobleId: string,
  fallbackName: string,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_SPLENDOR_NOBLES[nobleId] ?? fallbackName : fallbackName;

export const getAzulTileLabelLocalized = (
  color: AzulTileColor,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_AZUL_TILES[color] : AZUL_TILE_STYLES[color].label;

export const getSevenWondersResourceTextLocalized = (
  res: WonderResource,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } =>
  locale === "zh-TW"
    ? ZH_TW_SW_RESOURCES[res]
    : { label: SW_RESOURCE_META[res].label, short: SW_RESOURCE_META[res].short };

export const getSevenWondersCardColorTextLocalized = (
  color: CardColor,
  locale: SupportedLocale
): { readonly label: string; readonly short: string } =>
  locale === "zh-TW"
    ? ZH_TW_SW_CARD_COLORS[color]
    : { label: SW_CARD_COLOR_META[color].label, short: SW_CARD_COLOR_META[color].short };

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

export const getSevenWondersStageSummaryLocalized = (
  summary: string,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_SW_STAGE_SUMMARIES[summary] ?? summary : summary;

export const getSevenWondersCardNameLocalized = (
  englishName: string,
  locale: SupportedLocale
): string =>
  locale === "zh-TW" ? ZH_TW_SW_CARD_NAMES[englishName] ?? englishName : englishName;

export const getTutorialLessonsLocalized = (
  gameId: TutorialGameId,
  locale: SupportedLocale
): readonly TutorialLesson[] =>
  locale === "zh-TW" ? ZH_TW_TUTORIAL_LESSONS[gameId] : TUTORIAL_LESSONS[gameId];

export const getGameReferenceGuideLocalized = (
  gameId: TutorialGameId,
  locale: SupportedLocale
): GameReferenceGuide =>
  locale === "zh-TW"
    ? ZH_TW_GAME_REFERENCE_GUIDES[gameId]
    : GAME_REFERENCE_GUIDES[gameId];
