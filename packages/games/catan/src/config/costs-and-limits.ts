import type { ResourceMap, ResourceType, TerrainType } from "../types/domain.ts";

export const BUILDING_COSTS: Record<
  "road" | "ship" | "settlement" | "city" | "devCard" | "cityWall" | "knight" | "activateKnight",
  ResourceMap
> = {
  road: { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 },
  ship: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 },
  city: { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 },
  devCard: { brick: 0, lumber: 0, wool: 1, grain: 1, ore: 1 },
  cityWall: { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 0 },
  knight: { brick: 0, lumber: 0, wool: 1, grain: 0, ore: 1 },
  activateKnight: { brick: 0, lumber: 0, wool: 0, grain: 1, ore: 0 },
};

export const TERRAIN_TO_RESOURCE: Record<TerrainType, ResourceType | null> = {
  hills: "brick",
  forest: "lumber",
  pasture: "wool",
  fields: "grain",
  mountains: "ore",
  desert: null,
  sea: null,
  gold: null, // handled via GOLD_RESOURCE_SELECTION
  fog: null,
};

export const NUMBER_TOKEN_PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

export const DEV_CARD_DECK_COUNTS = {
  standard: {
    knights: 14,
    progressEach: 2,
    victoryPoints: 5,
  },
  expanded56: {
    knights: 20,
    progressEach: 3,
    victoryPoints: 5,
  },
} as const;

export const BANK_LIMITS = {
  standardPerResource: 19,
  expandedPerResource: 24,
  standardPerCommodity: 12,
  expandedPerCommodity: 18,
} as const;

export const DEFAULT_PIECE_LIMITS = {
  roads: 15,
  ships: 15,
  settlements: 5,
  cities: 4,
  cityWalls: 3,
  basicKnights: 2,
  strongKnights: 2,
  mightyKnights: 2,
} as const;

export const SAFE_HAND_LIMIT_BASE = 7;
export const CITY_WALL_SAFE_HAND_BONUS = 2;

export const AWARD_THRESHOLDS = {
  longestRoadMinLength: 5,
  largestArmyMinSize: 3,
  harbormasterMinPoints: 3,
} as const;

export const DEFAULT_MAX_TURNS = 400;

export const PLAYER_COLORS = [
  "#e63946", // Red
  "#2563eb", // Blue
  "#f59e0b", // Orange
  "#10b981", // Green (or White/Emerald for visibility)
  "#8b5cf6", // Purple / Brown-5P
  "#ec4899", // Rose / 6P
  "#06b6d4", // Cyan / 7P
];
