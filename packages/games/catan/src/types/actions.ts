import type { EdgeId, HexId, VertexId } from "@gaming-platform/core";
import type {
  CommodityMap,
  CommodityType,
  ImprovementDiscipline,
  ResourceMap,
  ResourceType,
  TradeGoodMap,
  TradeGoodType,
} from "./domain.ts";

export interface ProgressCardPlayParams {
  /** Alchemist: chosen white & red dice values (1..6) */
  die1?: number;
  die2?: number;
  /** Engineer (city wall) or Intrigue (target opponent knight vertex) */
  vertexId?: VertexId;
  /** Smith: up to 2 knight vertices to promote */
  vertexIds?: VertexId[];
  /** Bishop or Merchant: target hex */
  hexId?: HexId;
  /** Inventor: two land hexes (excluding 2, 6, 8, 12) whose number tokens swap */
  hexId1?: HexId;
  hexId2?: HexId;
  /** Diplomat: open road edge to remove, plus optional edge to rebuild */
  edgeId?: EdgeId;
  rebuildEdgeId?: EdgeId;
  /** Spy, Deserter, or Master Merchant: targeted opponent ID */
  targetPlayerId?: string;
  /** Resource Monopoly or Commercial Harbor: resource type */
  resource?: ResourceType;
  /** Trade Monopoly: commodity type */
  commodity?: CommodityType;
  /** Merchant Fleet: resource or commodity for 2:1 bank rate this turn */
  good?: TradeGoodType;
}

export type CatanAction =
  | { type: "PLACE_SETUP_SETTLEMENT"; vertexId: VertexId }
  | { type: "PLACE_SETUP_EDGE"; edgeId: EdgeId; edgeKind: "road" | "ship" }
  | { type: "ROLL_DICE" }
  | { type: "SELECT_PILLAGED_CITY"; vertexId: VertexId }
  | { type: "SELECT_PROGRESS_DECK"; discipline: ImprovementDiscipline }
  | { type: "DISCARD_PROGRESS_CARD"; cardId: string }
  | { type: "SELECT_GOLD_RESOURCE"; resource: ResourceType }
  | {
      type: "DISCARD_CARDS";
      resources: Partial<ResourceMap>;
      commodities?: Partial<CommodityMap>;
    }
  | { type: "MOVE_ROBBER"; hexId: HexId }
  | { type: "MOVE_PIRATE"; hexId: HexId }
  | { type: "STEAL_FROM_PLAYER"; victimId: string }
  | { type: "BUILD_ROAD"; edgeId: EdgeId }
  | { type: "BUILD_SHIP"; edgeId: EdgeId }
  | { type: "MOVE_SHIP"; fromEdgeId: EdgeId; toEdgeId: EdgeId }
  | { type: "BUILD_SETTLEMENT"; vertexId: VertexId }
  | { type: "BUILD_CITY"; vertexId: VertexId }
  | { type: "BUILD_CITY_WALL"; vertexId: VertexId }
  | {
      type: "UPGRADE_CITY_IMPROVEMENT";
      discipline: ImprovementDiscipline;
      metropolisVertexId?: VertexId;
    }
  | { type: "BUILD_KNIGHT"; vertexId: VertexId }
  | { type: "PROMOTE_KNIGHT"; vertexId: VertexId }
  | { type: "ACTIVATE_KNIGHT"; vertexId: VertexId }
  | { type: "MOVE_KNIGHT"; fromVertexId: VertexId; toVertexId: VertexId }
  | {
      type: "CHASE_ROBBER_WITH_KNIGHT";
      vertexId: VertexId;
      hexId: HexId;
      targetKind?: "robber" | "pirate";
    }
  | {
      type: "PLAY_PROGRESS_CARD";
      cardId: string;
      params?: ProgressCardPlayParams;
    }
  | { type: "RESOLVE_DISPLACED_KNIGHT"; vertexId: VertexId }
  | { type: "SELECT_DESERTER_KNIGHT"; vertexId: VertexId }
  | { type: "PLACE_DESERTED_KNIGHT"; vertexId: VertexId }
  | { type: "SELECT_SPY_CARD"; stolenCardId: string }
  | {
      type: "SELECT_MASTER_MERCHANT_CARDS";
      resources: Partial<ResourceMap>;
      commodities?: Partial<CommodityMap>;
    }
  | {
      type: "GIVE_WEDDING_CARDS";
      resources: Partial<ResourceMap>;
      commodities?: Partial<CommodityMap>;
    }
  | {
      type: "OFFER_COMMERCIAL_HARBOR";
      targetPlayerId: string;
      resource: ResourceType;
    }
  | { type: "END_COMMERCIAL_HARBOR" }
  | { type: "RESPOND_COMMERCIAL_HARBOR"; commodity: CommodityType }
  | { type: "BUY_DEV_CARD" }
  | { type: "PLAY_KNIGHT" }
  | { type: "PLAY_ROAD_BUILDING" }
  | { type: "PLAY_YEAR_OF_PLENTY"; resource1: ResourceType; resource2: ResourceType }
  | { type: "PLAY_MONOPOLY"; resource: ResourceType }
  | {
      type: "MARITIME_TRADE";
      give: TradeGoodType;
      giveAmount: number;
      receive: TradeGoodType;
      receiveAmount?: number;
      giveMap?: Partial<TradeGoodMap>;
      receiveMap?: Partial<TradeGoodMap>;
    }
  | {
      type: "OFFER_DOMESTIC_TRADE";
      toPlayerId: string | null;
      give: Partial<ResourceMap>;
      want: Partial<ResourceMap>;
      giveCommodities?: Partial<CommodityMap>;
      wantCommodities?: Partial<CommodityMap>;
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
