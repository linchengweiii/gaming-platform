import type {
  BotDifficulty,
  EdgeId,
  GameEvent,
  HexBoardTopology,
  HexId,
  VertexId,
} from "@gaming-platform/core";
import type {
  ActiveTurnDiscounts,
  CatanConfig,
  CityImprovementMap,
  CommodityMap,
  DevCardInstance,
  DevCardType,
  EdgeRoute,
  EventDieFace,
  FogRevealTile,
  Harbor,
  HexTile,
  ImprovementDiscipline,
  KnightLevel,
  KnightPiece,
  MetropolisState,
  ProgressCardInstance,
  ProgressCardType,
  ResourceMap,
  ResourceType,
  TradeOffer,
  VertexBuilding,
} from "./domain.ts";

export type TurnPhase =
  | "SETUP_SETTLEMENT_1"
  | "SETUP_ROAD_1"
  | "SETUP_SETTLEMENT_2"
  | "SETUP_ROAD_2"
  | "PRE_ROLL"
  | "BARBARIAN_PILLAGE_SELECTION"
  | "PROGRESS_CARD_SELECTION"
  | "GOLD_RESOURCE_SELECTION"
  | "DISCARD_ON_SEVEN"
  | "MOVE_ROBBER_OR_PIRATE"
  | "STEAL_RESOURCE"
  | "ROAD_BUILDING_DEV"
  | "CK_INTERACTION"
  | "MAIN_PHASE"
  | "SPECIAL_BUILDING"
  | "GAME_OVER";

export type PendingCkInteraction =
  | {
      kind: "displace_knight";
      actorId: string;
      knight: KnightPiece;
      fromVertexId: VertexId;
      candidateVertexIds: VertexId[];
    }
  | {
      kind: "deserter_choose_knight";
      actorId: string;
      initiatorId: string;
      candidateVertexIds: VertexId[];
    }
  | {
      kind: "deserter_place_knight";
      actorId: string;
      targetPlayerId: string;
      vacatedVertexId: VertexId;
      knightLevel: KnightLevel;
      knightActive: boolean;
      candidateVertexIds: VertexId[];
    }
  | {
      kind: "spy_choose_card";
      actorId: string;
      targetPlayerId: string;
    }
  | {
      kind: "master_merchant_choose_cards";
      actorId: string;
      targetPlayerId: string;
      maxCards: number;
    }
  | {
      kind: "wedding_give_cards";
      actorId: string;
      initiatorId: string;
      remainingGiverIds: string[];
      requiredCount: number;
    }
  | {
      kind: "commercial_harbor_offer";
      actorId: string;
      offeredPlayerIds: string[];
      eligibleTargetIds: string[];
    }
  | {
      kind: "commercial_harbor_respond";
      actorId: string;
      initiatorId: string;
      offeredResource: ResourceType;
      offeredResourceRedacted?: boolean;
      offeredPlayerIds: string[];
    };

export interface CatanPlayerState {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  resources: ResourceMap;
  commodities: CommodityMap;
  /** Total resource + commodity cards in hand when exact counts are redacted from another viewer. */
  hiddenResourceCount?: number;
  /** True when this player's exact resources, commodities, and unplayed dev/progress cards are redacted. */
  handRedacted?: boolean;
  devCards: DevCardInstance[];
  progressCards: ProgressCardInstance[];
  hiddenProgressCardCount?: number;
  publicProgressVpCards: Array<"printer" | "constitution">;
  cityImprovements: CityImprovementMap;
  defenderPoints: number;
  basicKnightsRemaining: number;
  strongKnightsRemaining: number;
  mightyKnightsRemaining: number;
  activeTurnDiscounts: ActiveTurnDiscounts;
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

export interface BarbarianAttackSummary {
  turn: number;
  barbarianStrength: number;
  defenderStrength: number;
  outcome: "defenders_won" | "barbarians_won";
  summary: string;
}

export interface CatanState {
  gameId: "catan";
  config: CatanConfig;
  rngState: number;
  turn: number;
  phase: TurnPhase;
  /** Phase to return to after resolving ROBBER / STEAL (e.g. PRE_ROLL if Knight played before roll, or MAIN_PHASE) */
  phaseAfterRobber: "PRE_ROLL" | "MAIN_PHASE";
  /** Phase to transition to once all pending discards complete */
  phaseAfterDiscard: "MOVE_ROBBER_OR_PIRATE" | "MAIN_PHASE";
  /** 0-based seat index of the player who begins snake draft and Turn 1 */
  startingPlayerIndex: number;
  activePlayerIndex: number;
  /** Used during SPECIAL_BUILDING phase to track which player is currently building between turns */
  specialBuildPlayerIndex: number | null;
  /** Used during SETUP phases to remember the last placed settlement/city vertex so the road/ship attaches to it */
  lastSetupSettlementVertexId: VertexId | null;
  players: CatanPlayerState[];
  bank: ResourceMap;
  commodityBank: CommodityMap;
  devCardDeck: DevCardType[];
  progressDecks: Record<ImprovementDiscipline, ProgressCardType[]>;
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  buildings: Record<VertexId, VertexBuilding>;
  edges: Record<EdgeId, EdgeRoute>;
  knights: Record<VertexId, KnightPiece>;
  metropolises: Record<ImprovementDiscipline, MetropolisState>;
  barbarianPosition: number;
  barbarianAttacksCount: number;
  lastBarbarianAttackResult: BarbarianAttackSummary | null;
  merchantHexId: HexId | null;
  merchantOwnerId: string | null;
  robberHexId: HexId;
  pirateHexId: HexId | null;
  /** Pool of hidden tiles for Seafarers Fog Islands */
  fogPool: FogRevealTile[];
  /** Last dice roll */
  lastRoll: {
    die1: number;
    die2: number;
    total: number;
    eventFace?: EventDieFace;
  } | null;
  /** Deferred 2d6 resolution while Event Die choices (pillage / progress deck / progress discard) resolve */
  pendingRollResolution: { die1: number; die2: number; total: number } | null;
  /** Players who must choose which vulnerable city is pillaged after a Barbarian victory */
  pendingPillageSelections: string[];
  /** Tied top defenders who must choose a Progress Card deck after defeating the Barbarians */
  pendingDefenderDeckPicks: string[];
  /** Players holding >4 Progress Cards who must discard down to 4 */
  pendingProgressDiscards: string[];
  /** Players who still need to discard half their cards on a 7 (or Saboteur) */
  pendingDiscards: Record<string, number>;
  /** Players who still need to choose free Gold River or Aqueduct resources */
  pendingGoldPicks: Record<string, number>;
  /** Eligible victim player IDs when stealing after moving Robber or Pirate */
  stealCandidates: string[];
  /** Remaining free roads/ships during Road Building card */
  freeRoadsRemaining: number;
  /** Pending multi-step Cities & Knights player choice interaction */
  pendingCkInteraction: PendingCkInteraction | null;
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
