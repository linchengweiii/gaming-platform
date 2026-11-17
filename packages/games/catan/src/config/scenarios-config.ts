import type { AxialCoord } from "@gaming-platform/core";
import type { HarborType, ScenarioId, TerrainType } from "../types/domain.ts";

export interface ScenarioDescriptor {
  id: ScenarioId;
  name: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTargetVp: number;
  enableSeafarers: boolean;
  enableCitiesAndKnights?: boolean;
  enableSpecialBuildingPhase: boolean;
  is56PlayerPreset?: boolean;
}

export const SCENARIO_CATALOG: Record<ScenarioId, ScenarioDescriptor> = {
  standard: {
    id: "standard",
    name: "Standard Catan (Base Game)",
    subtitle: "3–6 Players • 19 / 30 Hexes • 10 VP",
    description:
      "The classic island of Catan with 19 terrain hexes (auto-expands to the 30-hex Big Island for 5–6 players), harbors, Longest Road, and Largest Army.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 10,
    enableSeafarers: false,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: false,
    is56PlayerPreset: false,
  },
  big_island_5_6: {
    id: "big_island_5_6",
    name: "5–6 Player Extension (Big Island)",
    subtitle: "5–6 Players • 30 Hexes • Special Building Phase",
    description:
      "Expanded 30-hex island with 11 harbors, larger resource bank & dev deck, and between-turn Special Building Phase.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 10,
    enableSeafarers: false,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: true,
    is56PlayerPreset: true,
  },
  cities_and_knights: {
    id: "cities_and_knights",
    name: "Cities & Knights",
    subtitle: "3–6 Players • Knights & Barbarians • Metropolises • 13 VP",
    description:
      "Defend Catan from the Barbarian fleet! Collect Paper, Cloth, and Coin to upgrade Trade, Politics, and Science toward 3 Metropolises, muster Knights, and play Progress Cards.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 13,
    enableSeafarers: false,
    enableCitiesAndKnights: true,
    enableSpecialBuildingPhase: false,
    is56PlayerPreset: false,
  },
  cities_and_knights_5_6: {
    id: "cities_and_knights_5_6",
    name: "Cities & Knights (5–6 Player Extension)",
    subtitle: "5–6 Players • 30 Hexes • Knights, Metropolises & Special Building • 13 VP",
    description:
      "Expanded 30-hex Cities & Knights island for up to 6 players with 18 per commodity, larger resource bank, Barbarian fleet, 3 Metropolises, and between-turn Special Building Phase.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 13,
    enableSeafarers: false,
    enableCitiesAndKnights: true,
    enableSpecialBuildingPhase: true,
    is56PlayerPreset: true,
  },
  seafarers_new_shores: {
    id: "seafarers_new_shores",
    name: "Seafarers: Heading for New Shores",
    subtitle: "3–6 Players • Ships & Pirate • Gold Islands • 12 VP",
    description:
      "Start on the main island, build ships across the sea to colonize gold-rich offshore islands, and earn +2 Bonus VP per new island settled!",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: false,
    is56PlayerPreset: false,
  },
  seafarers_new_shores_5_6: {
    id: "seafarers_new_shores_5_6",
    name: "Seafarers: Heading for New Shores (5–6P)",
    subtitle: "5–6 Players • 51-Hex Marine Map • 3 Gold Islands • 12 VP",
    description:
      "Expanded 51-hex marine map! Start on the 20-hex home island, sail across open sea channels to colonize 3 gold-rich offshore islands (+2 Bonus VP each), with Special Building Phase.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: true,
    is56PlayerPreset: true,
  },
  seafarers_four_islands: {
    id: "seafarers_four_islands",
    name: "Seafarers: The Four Islands",
    subtitle: "3–6 Players • Archipelago • Ships & Pirate • 12 VP",
    description:
      "Fertile islands separated by sea channels (expands to Six Islands for 5–6 players). Start on up to two home islands and sail to settle foreign islands for +2 Bonus VP each.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: false,
    is56PlayerPreset: false,
  },
  seafarers_six_islands_5_6: {
    id: "seafarers_six_islands_5_6",
    name: "Seafarers: The Six Islands (5–6P)",
    subtitle: "5–6 Players • 6-Island Archipelago • Ships & Pirate • 12 VP",
    description:
      "Official 5–6 player counterpart to Four Islands: six fertile 5-hex islands separated by sea channels across a 58-hex ocean. Settle foreign islands for +2 Bonus VP each!",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: true,
    is56PlayerPreset: true,
  },
  seafarers_fog_islands: {
    id: "seafarers_fog_islands",
    name: "Seafarers: The Fog Islands",
    subtitle: "3–6 Players • Exploration • Mystery Fog Hexes • 12 VP",
    description:
      "Sail into the uncharted central fog bank! Reaching a fog edge reveals hidden terrain, number tokens, and free discovery resources.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: false,
    is56PlayerPreset: false,
  },
  seafarers_fog_islands_5_6: {
    id: "seafarers_fog_islands_5_6",
    name: "Seafarers: The Fog Islands (5–6P)",
    subtitle: "5–6 Players • Twin Home Islands • 11-Hex Fog Belt • 12 VP",
    description:
      "Expanded 58-hex archipelago with twin 11-hex East & West home islands separated by an uncharted 11-tile central fog belt hiding gold, resources, and discovery rewards.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableCitiesAndKnights: false,
    enableSpecialBuildingPhase: true,
    is56PlayerPreset: true,
  },
};

export const SCENARIO_METADATA = SCENARIO_CATALOG;

export const SELECTABLE_SCENARIO_IDS: readonly ScenarioId[] = [
  "standard",
  "seafarers_new_shores",
  "seafarers_four_islands",
  "seafarers_fog_islands",
];

export const STANDARD_TERRAINS: readonly TerrainType[] = [
  "forest",
  "forest",
  "forest",
  "forest",
  "pasture",
  "pasture",
  "pasture",
  "pasture",
  "fields",
  "fields",
  "fields",
  "fields",
  "hills",
  "hills",
  "hills",
  "mountains",
  "mountains",
  "mountains",
  "desert",
];

export const STANDARD_NUMBERS: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

export const STANDARD_HARBORS: readonly HarborType[] = [
  "generic",
  "brick",
  "generic",
  "lumber",
  "generic",
  "wool",
  "grain",
  "generic",
  "ore",
];

export const BIG_ISLAND_EXTRA_COORDS: readonly AxialCoord[] = [
  { q: 0, r: -3 },
  { q: 1, r: -3 },
  { q: 2, r: -3 },
  { q: 3, r: -3 },
  { q: 3, r: -2 },
  { q: 3, r: -1 },
  { q: 3, r: 0 },
  { q: 2, r: 1 },
  { q: 1, r: 2 },
  { q: 0, r: 3 },
  { q: -1, r: 3 },
];

export const BIG_ISLAND_TERRAINS: readonly TerrainType[] = [
  ...STANDARD_TERRAINS,
  "forest",
  "forest",
  "pasture",
  "pasture",
  "fields",
  "fields",
  "hills",
  "hills",
  "mountains",
  "mountains",
  "desert",
];

export const BIG_ISLAND_NUMBERS: readonly number[] = [
  ...STANDARD_NUMBERS,
  2,
  3,
  4,
  5,
  6,
  8,
  9,
  10,
  11,
  12,
];

export const BIG_ISLAND_HARBORS: readonly HarborType[] = [
  ...STANDARD_HARBORS,
  "generic",
  "wool",
];
