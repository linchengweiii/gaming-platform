import type { BotDifficulty, GameEvent } from "@gaming-platform/core";

export const RAW_RESOURCES = ["wood", "stone", "ore", "clay"] as const;
export type RawResource = (typeof RAW_RESOURCES)[number];

export const MANUFACTURED_GOODS = ["glass", "loom", "papyrus"] as const;
export type ManufacturedGood = (typeof MANUFACTURED_GOODS)[number];

export const WONDER_RESOURCES = [
  "wood",
  "stone",
  "ore",
  "clay",
  "glass",
  "loom",
  "papyrus",
] as const;
export type WonderResource = RawResource | ManufacturedGood;

export type WonderResourceMap = Record<WonderResource, number>;

export type ScienceSymbol = "compass" | "gear" | "tablet";
export type ScienceMap = Record<ScienceSymbol, number>;

export type SevenWondersAge = 1 | 2 | 3;

export type CardColor =
  | "brown"
  | "gray"
  | "blue"
  | "yellow"
  | "red"
  | "green"
  | "purple";

export type WonderSide = "A" | "B";

export type WonderId =
  | "alexandria"
  | "babylon"
  | "ephesus"
  | "giza"
  | "halikarnassus"
  | "olympia"
  | "rhodes";

export type PassDirection = "clockwise" | "counter_clockwise";

export type ResourceProductionChoice = readonly WonderResource[];

export type CardEffect =
  | { readonly kind: "resources"; readonly options: ResourceProductionChoice; readonly count?: number }
  | { readonly kind: "vp"; readonly points: number }
  | { readonly kind: "shields"; readonly shields: number }
  | { readonly kind: "science"; readonly symbol: ScienceSymbol }
  | { readonly kind: "coins"; readonly coins: number }
  | {
      readonly kind: "trade_discount";
      readonly rawLeft?: boolean;
      readonly rawRight?: boolean;
      readonly manufacturedBoth?: boolean;
    }
  | {
      readonly kind: "per_card_reward";
      readonly targetColors: readonly CardColor[];
      readonly includeSelf: boolean;
      readonly includeNeighbors: boolean;
      readonly coinsPerMatch: number;
      readonly vpPerMatch: number;
    }
  | {
      readonly kind: "per_wonder_stage_reward";
      readonly includeSelf: boolean;
      readonly includeNeighbors: boolean;
      readonly coinsPerStage: number;
      readonly vpPerStage: number;
    }
  | {
      readonly kind: "per_defeat_token_vp";
      readonly includeNeighbors: boolean;
      readonly vpPerToken: number;
    }
  | {
      readonly kind: "complete_wonder_vp";
      readonly points: number;
    }
  | {
      readonly kind: "wildcard_science";
    };

export interface SevenWondersCard {
  readonly id: string;
  readonly templateId: string;
  readonly name: string;
  readonly age: SevenWondersAge;
  readonly color: CardColor;
  readonly minPlayers: 3 | 4 | 5 | 6 | 7;
  readonly coinCost: number;
  readonly resourceCost: Partial<WonderResourceMap>;
  readonly freeFromChains: readonly string[];
  readonly chainsTo: readonly string[];
  readonly effects: readonly CardEffect[];
}

export type WonderStageEffect =
  | { readonly kind: "vp"; readonly points: number }
  | { readonly kind: "coins"; readonly coins: number }
  | { readonly kind: "shields"; readonly shields: number }
  | { readonly kind: "wildcard_resource"; readonly options: ResourceProductionChoice }
  | { readonly kind: "wildcard_science" }
  | { readonly kind: "free_build_per_age" }
  | { readonly kind: "play_seventh_card" }
  | { readonly kind: "build_from_discard" }
  | { readonly kind: "raw_trade_both_discount" }
  | { readonly kind: "copy_neighbor_guild" };

export interface WonderStageDefinition {
  readonly stageNumber: number;
  readonly resourceCost: Partial<WonderResourceMap>;
  readonly effects: readonly WonderStageEffect[];
  readonly summary: string;
}

export interface WonderBoardDefinition {
  readonly id: WonderId;
  readonly side: WonderSide;
  readonly name: string;
  readonly startingResource: WonderResource;
  readonly stages: readonly WonderStageDefinition[];
}

export interface NeighborPayment {
  readonly leftCoins: number;
  readonly rightCoins: number;
}

export type DraftMoveKind = "build" | "wonder" | "discard";

export interface DraftChoice {
  readonly kind: DraftMoveKind;
  readonly cardId: string;
  readonly payment: NeighborPayment;
  readonly useFreeBuild?: boolean;
}

export interface MilitaryToken {
  readonly age: SevenWondersAge;
  readonly points: -1 | 1 | 3 | 5;
  readonly opponentId: string;
}

export interface SevenWondersScoreBreakdown {
  readonly militaryVp: number;
  readonly treasuryVp: number;
  readonly wonderVp: number;
  readonly civilianVp: number;
  readonly scientificVp: number;
  readonly commercialVp: number;
  readonly guildVp: number;
  readonly totalVp: number;
  readonly coinsTiebreaker: number;
  readonly scienceCounts: ScienceMap;
  readonly copiedGuildName?: string | null;
}

export interface SevenWondersPlayerState {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly isBot: boolean;
  readonly botDifficulty: BotDifficulty;
  readonly wonderId: WonderId;
  readonly wonderSide: WonderSide;
  readonly startingResource: WonderResource;
  readonly coins: number;
  readonly builtWonderStages: number;
  readonly tuckedWonderCardIds: readonly string[];
  readonly tableau: readonly SevenWondersCard[];
  readonly hand: readonly SevenWondersCard[];
  readonly seenHandsThisAge?: readonly (readonly SevenWondersCard[])[];
  readonly handRedacted?: boolean;
  readonly hiddenHandCount?: number;
  readonly militaryTokens: readonly MilitaryToken[];
  readonly usedFreeBuildInAge: Readonly<Record<SevenWondersAge, boolean>>;
  readonly scoreBreakdown: SevenWondersScoreBreakdown;
}

export type SevenWondersPhase =
  | "AGE_DRAFT"
  | "SEVENTH_CARD_PLAY"
  | "HALIKARNASSUS_PICK"
  | "GAME_OVER";

export interface SevenWondersConfig {
  readonly wonderSideMode: "random" | "day" | "night";
  readonly startingPlayerIndex?: number;
  readonly randomizeStartingPlayer: boolean;
}

export interface SevenWondersState {
  readonly gameId: "seven_wonders";
  readonly config: SevenWondersConfig;
  readonly phase: SevenWondersPhase;
  readonly age: SevenWondersAge;
  readonly draftRound: number; // 1..6 within each age
  readonly turn: number;
  readonly passDirection: PassDirection;
  readonly startingPlayerIndex: number;
  readonly players: readonly SevenWondersPlayerState[];
  readonly pendingChoices: Readonly<Record<string, DraftChoice>>;
  readonly lockedPlayerIds: readonly string[];
  readonly seventhCardQueue: readonly string[];
  readonly halikarnassusQueue: readonly string[];
  readonly discardPile: readonly SevenWondersCard[];
  readonly hiddenDiscardCount?: number;
  readonly ageDecks: Readonly<Record<2 | 3, readonly SevenWondersCard[]>>;
  readonly rngState: number;
  readonly winnerId: string | null;
  readonly eventLog: readonly GameEvent[];
}

export type SevenWondersAction =
  | {
      readonly type: "SELECT_DRAFT_ACTION";
      readonly kind: DraftMoveKind;
      readonly cardId: string;
      readonly payment?: NeighborPayment;
      readonly useFreeBuild?: boolean;
    }
  | {
      readonly type: "UNSELECT_DRAFT_ACTION";
    }
  | {
      readonly type: "BUILD_FROM_DISCARD";
      readonly cardId: string;
    }
  | {
      readonly type: "SKIP_DISCARD_BUILD";
    };
