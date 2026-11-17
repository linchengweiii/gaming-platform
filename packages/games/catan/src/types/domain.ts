import type { EdgeId, HexId, VertexId } from "@gaming-platform/core";

export const RESOURCES = ["brick", "lumber", "wool", "grain", "ore"] as const;
export type ResourceType = (typeof RESOURCES)[number];

export type ResourceMap = Record<ResourceType, number>;

export const COMMODITIES = ["paper", "cloth", "coin"] as const;
export type CommodityType = (typeof COMMODITIES)[number];

export type CommodityMap = Record<CommodityType, number>;

export const TRADE_GOODS = [
  "brick",
  "lumber",
  "wool",
  "grain",
  "ore",
  "paper",
  "cloth",
  "coin",
] as const;
export type TradeGoodType = ResourceType | CommodityType;
export type TradeGoodMap = Record<TradeGoodType, number>;

export const IMPROVEMENT_DISCIPLINES = ["trade", "politics", "science"] as const;
export type ImprovementDiscipline = (typeof IMPROVEMENT_DISCIPLINES)[number];
export type CityImprovementMap = Record<ImprovementDiscipline, number>;

export type EventDieFace = "barbarian" | ImprovementDiscipline;

export type KnightLevel = 1 | 2 | 3;

export interface KnightPiece {
  ownerId: string;
  level: KnightLevel;
  active: boolean;
  activatedThisTurn: boolean;
  actedThisTurn: boolean;
  promotedThisTurn: boolean;
}

export interface MetropolisState {
  ownerId: string | null;
  vertexId: VertexId | null;
  level: number;
}

export type ProgressCardType =
  // Science (18)
  | "printer"
  | "alchemist"
  | "crane"
  | "engineer"
  | "inventor"
  | "irrigation"
  | "medicine"
  | "mining"
  | "road_building"
  | "smith"
  // Politics (18)
  | "constitution"
  | "bishop"
  | "deserter"
  | "diplomat"
  | "intrigue"
  | "saboteur"
  | "spy"
  | "warlord"
  | "wedding"
  // Trade (18)
  | "merchant"
  | "resource_monopoly"
  | "trade_monopoly"
  | "merchant_fleet"
  | "master_merchant"
  | "commercial_harbor";

export interface ProgressCardInstance {
  id: string;
  type: ProgressCardType;
  discipline: ImprovementDiscipline;
}

export interface ActiveTurnDiscounts {
  crane: boolean;
  medicine: boolean;
  merchantFleetGood: TradeGoodType | null;
}

export type TerrainType =
  | "hills"     // produces brick
  | "forest"    // produces lumber (+ paper for cities in C&K)
  | "pasture"   // produces wool (+ cloth for cities in C&K)
  | "fields"    // produces grain
  | "mountains" // produces ore (+ coin for cities in C&K)
  | "desert"    // produces nothing, initial robber
  | "sea"       // Seafarers: water hex for ships & pirate
  | "gold"      // Seafarers: produces player's choice of any resource
  | "fog";      // Seafarers: unexplored tile revealed when edge reached

export type HarborType = "generic" | ResourceType; // "generic" = 3:1, ResourceType = 2:1

export type DevCardType =
  | "knight"
  | "road_building"
  | "year_of_plenty"
  | "monopoly"
  | "victory_point";

export interface DevCardInstance {
  id: string;
  type: DevCardType;
  boughtOnTurn: number;
  played: boolean;
}

export type ScenarioId =
  | "standard"                  // Classic 3-4P 19-hex island (10 VP)
  | "cities_and_knights"        // Cities & Knights 3-4P 19-hex island (13 VP)
  | "big_island_5_6"            // 5-6P Extension 30-hex island + Special Building Phase (10 VP)
  | "cities_and_knights_5_6"    // Cities & Knights 5-6P Extension 30-hex island (13 VP)
  | "seafarers_new_shores"      // Seafarers: Main island + offshore Gold islands (+2 VP bonus, 12 VP)
  | "seafarers_new_shores_5_6"  // Seafarers 5-6P: Expanded main island + 3 offshore Gold islands (12 VP)
  | "seafarers_four_islands"    // Seafarers: 4 distinct islands across sea channels (12 VP)
  | "seafarers_six_islands_5_6" // Seafarers 5-6P: 6 distinct islands across sea channels (12 VP)
  | "seafarers_fog_islands"     // Seafarers: Unexplored fog tiles revealed on discovery (12 VP)
  | "seafarers_fog_islands_5_6";// Seafarers 5-6P: Twin home islands + 11-tile Fog Belt (12 VP)

export interface CatanConfig {
  scenarioId: ScenarioId;
  targetVictoryPoints: number;
  balancedNumbers: boolean;
  /** 5-6 Player Extension (expanded board, 24/resource & 18/commodity bank, Special Building Phase) */
  enable56PlayerExtension?: boolean;
  /** Automatically enabled for 5-6 players or *_5_6 presets, can be toggled */
  enableSpecialBuildingPhase: boolean;
  /** Automatically enabled on seafarers_* scenarios */
  enableSeafarers: boolean;
  /** Cities & Knights expansion (Commodities, Knights, Barbarians, City Improvements, Metropolises, Progress Cards) */
  enableCitiesAndKnights: boolean;
  /** Harbormaster variant (+2 VP for >= 3 harbor points) */
  enableHarbormaster: boolean;
  /** Cities & Knights City Walls variant (2 brick, +2 hand limit on 7 per wall, max 3) */
  enableCityWalls: boolean;
  /** Friendly Robber variant (cannot move Robber to hex of player with <= 2 visible VP) */
  enableFriendlyRobber: boolean;
  /** Optional explicit 0-based index of the player who starts Turn 1 & Snake Draft */
  startingPlayerIndex?: number;
  /** When true (and startingPlayerIndex is omitted), draws the starting player uniformly via SeededRNG */
  randomizeStartingPlayer?: boolean;
  /** Max turns before declaring highest-VP winner in bot simulations */
  maxTurns: number;
}

export interface HexTile {
  id: HexId;
  q: number;
  r: number;
  terrain: TerrainType;
  numberToken: number | null; // 2..12 (excluding 7), or null for desert/sea/fog
  /** Island group ID (1 = starting home island(s), 2+ = foreign islands for Seafarers bonus VP) */
  islandId: number;
  /** Whether this hex may be used for initial setup settlement placement */
  allowSetupSettlement: boolean;
}

export interface FogRevealTile {
  terrain: TerrainType;
  numberToken: number | null;
}

export interface Harbor {
  id: string;
  type: HarborType;
  edgeId: EdgeId;
  vertexIds: [VertexId, VertexId];
  seaHexId?: HexId;
}

export interface VertexBuilding {
  ownerId: string;
  type: "settlement" | "city";
  hasWall?: boolean;
  metropolis?: ImprovementDiscipline;
  /** True when a pillaged city turns into a settlement while player had 0 settlements in supply */
  borrowedCityPiece?: boolean;
}

export interface EdgeRoute {
  ownerId: string;
  type: "road" | "ship";
  builtOnTurn: number;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string | null; // null = open to any opponent
  give: Partial<ResourceMap>;
  want: Partial<ResourceMap>;
  giveCommodities?: Partial<CommodityMap>;
  wantCommodities?: Partial<CommodityMap>;
  acceptedBy: string[];
  declinedBy: string[];
}
