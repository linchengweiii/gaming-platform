import type {
  BotDifficulty,
  EdgeId,
  GameEvent,
  HexBoardTopology,
  HexId,
  VertexId,
} from "@gaming-platform/core";

export const RESOURCES = ["brick", "lumber", "wool", "grain", "ore"] as const;
export type ResourceType = (typeof RESOURCES)[number];

export type ResourceMap = Record<ResourceType, number>;

export type TerrainType =
  | "hills"     // produces brick
  | "forest"    // produces lumber
  | "pasture"   // produces wool
  | "fields"    // produces grain
  | "mountains" // produces ore
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
  | "standard"              // Classic 3-4P 19-hex island (10 VP)
  | "big_island_5_6"        // 5-6P Extension 30-hex island + Special Building Phase (10 VP)
  | "seafarers_new_shores"  // Seafarers: Main island + offshore Gold islands (+2 VP bonus, 12 VP)
  | "seafarers_four_islands"// Seafarers: 4 distinct islands across sea channels (12 VP)
  | "seafarers_fog_islands"; // Seafarers: Unexplored fog tiles revealed on discovery (12 VP)

export interface CatanConfig {
  scenarioId: ScenarioId;
  targetVictoryPoints: number;
  balancedNumbers: boolean;
  /** Automatically enabled for 5-6 players or big_island_5_6, can be toggled */
  enableSpecialBuildingPhase: boolean;
  /** Automatically enabled on seafarers_* scenarios */
  enableSeafarers: boolean;
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
  acceptedBy: string[];
  declinedBy: string[];
}

export type TurnPhase =
  | "SETUP_SETTLEMENT_1"
  | "SETUP_ROAD_1"
  | "SETUP_SETTLEMENT_2"
  | "SETUP_ROAD_2"
  | "PRE_ROLL"
  | "GOLD_RESOURCE_SELECTION"
  | "DISCARD_ON_SEVEN"
  | "MOVE_ROBBER_OR_PIRATE"
  | "STEAL_RESOURCE"
  | "ROAD_BUILDING_DEV"
  | "MAIN_PHASE"
  | "SPECIAL_BUILDING"
  | "GAME_OVER";

export interface CatanPlayerState {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  resources: ResourceMap;
  /** Total resource cards in hand when exact resource counts are redacted from another viewer. */
  hiddenResourceCount?: number;
  /** True when this player's exact resources and unplayed dev cards are redacted from the viewer. */
  handRedacted?: boolean;
  devCards: DevCardInstance[];
  knightsPlayed: number;
  roadsRemaining: number;
  shipsRemaining: number;
  settlementsRemaining: number;
  citiesRemaining: number;
  cityWallsRemaining: number;
  longestRoadLength: number;
  harborPoints: number;
  /** Seafarers bonus VP tokens (e.g., +2 VP for settling on a new island) */
  bonusVictoryPoints: number;
  /** Which island IDs this player has already settled on */
  settledIslandIds: number[];
  /** Which islands were settled during initial setup */
  homeIslandIds: number[];
  hasPlayedDevCardThisTurn: boolean;
  hasMovedShipThisTurn: boolean;
}

export interface CatanState {
  gameId: "catan";
  config: CatanConfig;
  rngState: number;
  turn: number;
  phase: TurnPhase;
  /** Phase to return to after resolving ROBBER / STEAL (e.g. PRE_ROLL if Knight played before roll, or MAIN_PHASE) */
  phaseAfterRobber: "PRE_ROLL" | "MAIN_PHASE";
  /** 0-based seat index of the player who begins snake draft and Turn 1 */
  startingPlayerIndex: number;
  activePlayerIndex: number;
  /** Used during SPECIAL_BUILDING phase to track which player is currently building between turns */
  specialBuildPlayerIndex: number | null;
  /** Used during SETUP phases to remembers the last placed settlement vertex so the road/ship attaches to it */
  lastSetupSettlementVertexId: VertexId | null;
  players: CatanPlayerState[];
  bank: ResourceMap;
  devCardDeck: DevCardType[];
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  buildings: Record<VertexId, VertexBuilding>;
  edges: Record<EdgeId, EdgeRoute>;
  robberHexId: HexId;
  pirateHexId: HexId | null;
  /** Pool of hidden tiles for Seafarers Fog Islands */
  fogPool: FogRevealTile[];
  /** Last dice roll */
  lastRoll: { die1: number; die2: number; total: number } | null;
  /** Players who still need to discard half their cards on a 7 */
  pendingDiscards: Record<string, number>;
  /** Players who still need to choose free gold river resources */
  pendingGoldPicks: Record<string, number>;
  /** Eligible victim player IDs when stealing after moving Robber or Pirate */
  stealCandidates: string[];
  /** Remaining free roads/ships during Road Building dev card */
  freeRoadsRemaining: number;
  /** Active domestic trade offer */
  activeTradeOffer: TradeOffer | null;
  /** Special awards */
  longestRoadOwnerId: string | null;
  longestRoadLength: number;
  largestArmyOwnerId: string | null;
  largestArmySize: number;
  harbormasterOwnerId: string | null;
  harbormasterPoints: number;
  winnerId: string | null;
  eventLog: GameEvent[];
}

export type CatanAction =
  | { type: "PLACE_SETUP_SETTLEMENT"; vertexId: VertexId }
  | { type: "PLACE_SETUP_EDGE"; edgeId: EdgeId; edgeKind: "road" | "ship" }
  | { type: "ROLL_DICE" }
  | { type: "SELECT_GOLD_RESOURCE"; resource: ResourceType }
  | { type: "DISCARD_CARDS"; resources: Partial<ResourceMap> }
  | { type: "MOVE_ROBBER"; hexId: HexId }
  | { type: "MOVE_PIRATE"; hexId: HexId }
  | { type: "STEAL_FROM_PLAYER"; victimId: string }
  | { type: "BUILD_ROAD"; edgeId: EdgeId }
  | { type: "BUILD_SHIP"; edgeId: EdgeId }
  | { type: "MOVE_SHIP"; fromEdgeId: EdgeId; toEdgeId: EdgeId }
  | { type: "BUILD_SETTLEMENT"; vertexId: VertexId }
  | { type: "BUILD_CITY"; vertexId: VertexId }
  | { type: "BUILD_CITY_WALL"; vertexId: VertexId }
  | { type: "BUY_DEV_CARD" }
  | { type: "PLAY_KNIGHT" }
  | { type: "PLAY_ROAD_BUILDING" }
  | { type: "PLAY_YEAR_OF_PLENTY"; resource1: ResourceType; resource2: ResourceType }
  | { type: "PLAY_MONOPOLY"; resource: ResourceType }
  | {
      type: "MARITIME_TRADE";
      give: ResourceType;
      giveAmount: number;
      receive: ResourceType;
      receiveAmount?: number;
      giveMap?: Partial<ResourceMap>;
      receiveMap?: Partial<ResourceMap>;
    }
  | {
      type: "OFFER_DOMESTIC_TRADE";
      toPlayerId: string | null;
      give: Partial<ResourceMap>;
      want: Partial<ResourceMap>;
    }
  | { type: "ACCEPT_DOMESTIC_TRADE"; offerId: string }
  | { type: "DECLINE_DOMESTIC_TRADE"; offerId: string }
  | {
      type: "CONFIRM_DOMESTIC_TRADE";
      offerId: string;
      partnerId: string;
    }
  | { type: "CANCEL_DOMESTIC_TRADE" }
  | { type: "END_TURN" }
  | { type: "END_SPECIAL_BUILD" };

export const BUILDING_COSTS: Record<
  "road" | "ship" | "settlement" | "city" | "devCard" | "cityWall",
  ResourceMap
> = {
  road: { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0 },
  ship: { brick: 0, lumber: 1, wool: 1, grain: 0, ore: 0 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 },
  city: { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3 },
  devCard: { brick: 0, lumber: 0, wool: 1, grain: 1, ore: 1 },
  cityWall: { brick: 2, lumber: 0, wool: 0, grain: 0, ore: 0 },
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
