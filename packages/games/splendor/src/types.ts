import type { BotDifficulty, GameEvent } from "@gaming-platform/core";

export const GEM_COLORS = [
  "emerald",
  "diamond",
  "sapphire",
  "onyx",
  "ruby",
] as const;

export type GemColor = (typeof GEM_COLORS)[number];
export type TokenColor = GemColor | "gold";

export const ALL_TOKEN_COLORS: readonly TokenColor[] = [...GEM_COLORS, "gold"];

export type GemMap = Record<GemColor, number>;
export type TokenMap = Record<TokenColor, number>;

export type CardTier = 1 | 2 | 3;

export interface SplendorCard {
  id: string;
  tier: CardTier;
  bonus: GemColor;
  points: number;
  cost: GemMap;
}

export interface SplendorNoble {
  id: string;
  name: string;
  points: number; // Always 3 in standard Splendor
  requirements: Partial<GemMap>;
}

export interface SplendorConfig {
  targetPoints: number; // Default 15
  maxTurns: number;
  startingPlayerIndex?: number;
  randomizeStartingPlayer?: boolean;
}

export type SplendorPhase =
  | "MAIN_ACTION"
  | "RETURN_TOKENS"
  | "SELECT_NOBLE"
  | "GAME_OVER";

export interface SplendorPlayerState {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  tokens: TokenMap;
  bonuses: GemMap;
  purchasedCards: SplendorCard[];
  reservedCards: SplendorCard[];
  nobles: SplendorNoble[];
  points: number;
}

export interface SplendorState {
  gameId: "splendor";
  config: SplendorConfig;
  rngState: number;
  turn: number;
  round: number;
  phase: SplendorPhase;
  startingPlayerIndex: number;
  activePlayerIndex: number;
  players: SplendorPlayerState[];
  bank: TokenMap;
  decks: Record<CardTier, SplendorCard[]>;
  market: Record<CardTier, SplendorCard[]>;
  nobles: SplendorNoble[];
  eligibleNobleIds: string[];
  finalRoundTriggered: boolean;
  winnerId: string | null;
  eventLog: GameEvent[];
}

export type SplendorAction =
  | { type: "TAKE_GEMS"; gems: Partial<GemMap> }
  | { type: "RESERVE_CARD"; cardId?: string; deckTier?: CardTier }
  | { type: "PURCHASE_CARD"; cardId: string }
  | { type: "RETURN_TOKENS"; tokens: Partial<TokenMap> }
  | { type: "SELECT_NOBLE"; nobleId: string }
  | { type: "PASS_TURN" }; // Fallback only if player is completely locked out of moves
