import type {
  CommodityType,
  EventDieFace,
  ImprovementDiscipline,
  KnightLevel,
  ProgressCardType,
  ResourceMap,
  TerrainType,
} from "../types/domain.ts";

export const DISCIPLINE_TO_COMMODITY: Record<
  ImprovementDiscipline,
  CommodityType
> = {
  trade: "cloth",
  politics: "coin",
  science: "paper",
};

export const COMMODITY_TO_DISCIPLINE: Record<
  CommodityType,
  ImprovementDiscipline
> = {
  cloth: "trade",
  coin: "politics",
  paper: "science",
};

export const TERRAIN_TO_COMMODITY: Record<TerrainType, CommodityType | null> = {
  hills: null,
  forest: "paper",
  pasture: "cloth",
  fields: null,
  mountains: "coin",
  desert: null,
  sea: null,
  gold: null,
  fog: null,
};

export const BARBARIAN_TRACK_STEPS = 7;

export const EVENT_DIE_FACES: readonly EventDieFace[] = [
  "barbarian",
  "barbarian",
  "barbarian",
  "trade",
  "politics",
  "science",
];

export const MEDICINE_CITY_COST: ResourceMap = {
  brick: 0,
  lumber: 0,
  wool: 0,
  grain: 1,
  ore: 2,
};

export const CK_THRESHOLDS = {
  metropolisLevel: 4,
  maxImprovementLevel: 5,
  tradingHouseLevel: 3,
  fortressPoliticsLevel: 3,
  aqueductScienceLevel: 3,
  maxProgressHandSize: 4,
  progressDeckSizePerDiscipline: 18,
} as const;

export const KNIGHT_LEVEL_STRENGTH: Record<KnightLevel, number> = {
  1: 1,
  2: 2,
  3: 3,
};

export interface ProgressCardMetadata {
  readonly type: ProgressCardType;
  readonly discipline: ImprovementDiscipline;
  readonly title: string;
  readonly copies: number;
  readonly phase: "PRE_ROLL" | "MAIN_PHASE" | "IMMEDIATE_VP";
  readonly description: string;
}

export const PROGRESS_CARD_CATALOG: Readonly<
  Record<ProgressCardType, ProgressCardMetadata>
> = {
  // Science (18)
  printer: {
    type: "printer",
    discipline: "science",
    title: "Printer",
    copies: 1,
    phase: "IMMEDIATE_VP",
    description: "+1 Victory Point! Revealed immediately upon draw.",
  },
  engineer: {
    type: "engineer",
    discipline: "science",
    title: "Engineer",
    copies: 1,
    phase: "MAIN_PHASE",
    description: "Build 1 City Wall on one of your unwalled cities for free.",
  },
  alchemist: {
    type: "alchemist",
    discipline: "science",
    title: "Alchemist",
    copies: 2,
    phase: "PRE_ROLL",
    description:
      "Play before rolling: choose the exact white and red number dice values.",
  },
  crane: {
    type: "crane",
    discipline: "science",
    title: "Crane",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Your next City Improvement this turn costs 1 fewer commodity.",
  },
  inventor: {
    type: "inventor",
    discipline: "science",
    title: "Inventor",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Swap the number tokens of any two land hexes (except 2, 6, 8, and 12).",
  },
  irrigation: {
    type: "irrigation",
    discipline: "science",
    title: "Irrigation",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Collect 2 Grain for each Fields hex adjacent to at least one of your buildings.",
  },
  medicine: {
    type: "medicine",
    discipline: "science",
    title: "Medicine",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Your next City upgrade this turn costs 2 Ore and 1 Grain (1 Ore + 1 Grain discount).",
  },
  mining: {
    type: "mining",
    discipline: "science",
    title: "Mining",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Collect 2 Ore for each Mountains hex adjacent to at least one of your buildings.",
  },
  road_building: {
    type: "road_building",
    discipline: "science",
    title: "Road Building",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Build up to 2 Roads or Ships immediately for free.",
  },
  smith: {
    type: "smith",
    discipline: "science",
    title: "Smith",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Promote up to 2 of your Knights by 1 level each for free.",
  },

  // Politics (18)
  constitution: {
    type: "constitution",
    discipline: "politics",
    title: "Constitution",
    copies: 1,
    phase: "IMMEDIATE_VP",
    description: "+1 Victory Point! Revealed immediately upon draw.",
  },
  bishop: {
    type: "bishop",
    discipline: "politics",
    title: "Bishop",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Move the Robber and draw 1 random card from every opponent adjacent to that hex.",
  },
  deserter: {
    type: "deserter",
    discipline: "politics",
    title: "Deserter",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "An opponent's Knight deserts; place one of your Knights of up to that level.",
  },
  diplomat: {
    type: "diplomat",
    discipline: "politics",
    title: "Diplomat",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Remove any open-ended road; if it was yours, you may place it elsewhere for free.",
  },
  intrigue: {
    type: "intrigue",
    discipline: "politics",
    title: "Intrigue",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Displace an opponent's Knight touching one of your roads or ships.",
  },
  saboteur: {
    type: "saboteur",
    discipline: "politics",
    title: "Saboteur",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Every opponent with at least as many VP as you discards half their hand.",
  },
  spy: {
    type: "spy",
    discipline: "politics",
    title: "Spy",
    copies: 3,
    phase: "MAIN_PHASE",
    description:
      "Inspect an opponent's Progress Cards and take 1 of your choice.",
  },
  warlord: {
    type: "warlord",
    discipline: "politics",
    title: "Warlord",
    copies: 2,
    phase: "MAIN_PHASE",
    description: "Activate all of your Knights on the board for free.",
  },
  wedding: {
    type: "wedding",
    discipline: "politics",
    title: "Wedding",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Each opponent with more VP than you gives you up to 2 cards from their hand.",
  },

  // Trade (18)
  merchant: {
    type: "merchant",
    discipline: "trade",
    title: "Merchant",
    copies: 6,
    phase: "MAIN_PHASE",
    description:
      "Place the Merchant adjacent to your building: +1 VP and 2:1 bank trade for that hex's resource.",
  },
  resource_monopoly: {
    type: "resource_monopoly",
    discipline: "trade",
    title: "Resource Monopoly",
    copies: 4,
    phase: "MAIN_PHASE",
    description:
      "Name 1 resource; each opponent gives you up to 2 of that resource.",
  },
  trade_monopoly: {
    type: "trade_monopoly",
    discipline: "trade",
    title: "Trade Monopoly",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Name 1 commodity; each opponent gives you up to 1 of that commodity.",
  },
  merchant_fleet: {
    type: "merchant_fleet",
    discipline: "trade",
    title: "Merchant Fleet",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Trade 1 chosen resource or commodity at 2:1 with the bank for the rest of this turn.",
  },
  master_merchant: {
    type: "master_merchant",
    discipline: "trade",
    title: "Master Merchant",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Choose an opponent with more VP than you and draw 2 cards from their hand.",
  },
  commercial_harbor: {
    type: "commercial_harbor",
    discipline: "trade",
    title: "Commercial Harbor",
    copies: 2,
    phase: "MAIN_PHASE",
    description:
      "Exchange 1 resource from your hand for 1 commodity from each opponent holding commodities.",
  },
};
