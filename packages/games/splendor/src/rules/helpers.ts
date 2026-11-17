import type { GameEvent } from "@gaming-platform/core";
import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  SPLENDOR_CARD_TIERS,
  SPLENDOR_GEM_COUNTS_BY_PLAYER,
} from "../config.ts";
import type {
  CardTier,
  GemColor,
  GemMap,
  SplendorCard,
  SplendorNoble,
  SplendorPlayerState,
  SplendorState,
  TokenColor,
  TokenMap,
} from "../types.ts";

export const CARD_TIERS: readonly CardTier[] = SPLENDOR_CARD_TIERS;

export function emptyGemMap(): GemMap {
  return { emerald: 0, diamond: 0, sapphire: 0, onyx: 0, ruby: 0 };
}

export function emptyTokenMap(): TokenMap {
  return { emerald: 0, diamond: 0, sapphire: 0, onyx: 0, ruby: 0, gold: 0 };
}

export function totalTokens(tokens: Partial<TokenMap>): number {
  return ALL_TOKEN_COLORS.reduce((sum, c) => sum + (tokens[c] ?? 0), 0);
}

export function getInitialGemBankCount(playerCount: number): number {
  return SPLENDOR_GEM_COUNTS_BY_PLAYER[playerCount] ?? 7;
}

export function addTokenMaps(
  base: TokenMap,
  deltas: Partial<Record<TokenColor, number>>
): TokenMap {
  return {
    emerald: base.emerald + (deltas.emerald ?? 0),
    diamond: base.diamond + (deltas.diamond ?? 0),
    sapphire: base.sapphire + (deltas.sapphire ?? 0),
    onyx: base.onyx + (deltas.onyx ?? 0),
    ruby: base.ruby + (deltas.ruby ?? 0),
    gold: base.gold + (deltas.gold ?? 0),
  };
}

export function subtractTokenMaps(
  base: TokenMap,
  deltas: Partial<Record<TokenColor, number>>
): TokenMap {
  return {
    emerald: base.emerald - (deltas.emerald ?? 0),
    diamond: base.diamond - (deltas.diamond ?? 0),
    sapphire: base.sapphire - (deltas.sapphire ?? 0),
    onyx: base.onyx - (deltas.onyx ?? 0),
    ruby: base.ruby - (deltas.ruby ?? 0),
    gold: base.gold - (deltas.gold ?? 0),
  };
}

export function incrementGemBonus(bonuses: GemMap, color: GemColor): GemMap {
  return { ...bonuses, [color]: bonuses[color] + 1 };
}

export function replacePlayerAt(
  players: readonly SplendorPlayerState[],
  index: number,
  updated: SplendorPlayerState
): SplendorPlayerState[] {
  return players.map((p, idx) => (idx === index ? updated : p));
}

export function appendSplendorEvent(
  state: SplendorState,
  events: readonly GameEvent[],
  type: string,
  message: string,
  playerId?: string
): { state: SplendorState; events: GameEvent[] } {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
  };
  return {
    state: { ...state, eventLog: [...state.eventLog, evt] },
    events: [...events, evt],
  };
}

/**
 * Computes whether `player` can afford `card`, and the exact token payment required
 * (using permanent bonuses first, then color tokens, then Gold jokers).
 */
export function computeCardPurchasePayment(
  player: SplendorPlayerState,
  card: SplendorCard
): { affordable: boolean; payment: TokenMap; goldShortfall: number } {
  const { coloredPayment, goldNeeded } = GEM_COLORS.reduce<{
    coloredPayment: GemMap;
    goldNeeded: number;
  }>(
    (acc, color) => {
      const discounted = Math.max(0, card.cost[color] - player.bonuses[color]);
      const payColor = Math.min(player.tokens[color], discounted);
      return {
        coloredPayment: { ...acc.coloredPayment, [color]: payColor },
        goldNeeded: acc.goldNeeded + (discounted - payColor),
      };
    },
    { coloredPayment: emptyGemMap(), goldNeeded: 0 }
  );

  return {
    affordable: goldNeeded <= player.tokens.gold,
    payment: { ...coloredPayment, gold: goldNeeded },
    goldShortfall: Math.max(0, goldNeeded - player.tokens.gold),
  };
}

export function qualifiesForNoble(
  player: SplendorPlayerState,
  noble: SplendorNoble
): boolean {
  return GEM_COLORS.every(
    (color) => player.bonuses[color] >= (noble.requirements[color] ?? 0)
  );
}

export function takeMarketCardAndRefill(
  market: Record<CardTier, SplendorCard[]>,
  decks: Record<CardTier, SplendorCard[]>,
  tier: CardTier,
  cardIndex: number
): {
  card: SplendorCard;
  market: Record<CardTier, SplendorCard[]>;
  decks: Record<CardTier, SplendorCard[]>;
} {
  const tierMarket = market[tier];
  const tierDeck = decks[tier];
  const card = tierMarket[cardIndex]!;
  const withoutCard = tierMarket.filter((_, idx) => idx !== cardIndex);
  const drawn = tierDeck.length > 0 ? tierDeck[tierDeck.length - 1]! : null;
  const nextTierMarket = drawn ? [...withoutCard, drawn] : withoutCard;
  const nextTierDeck = drawn ? tierDeck.slice(0, -1) : tierDeck;

  return {
    card,
    market: { ...market, [tier]: nextTierMarket },
    decks: { ...decks, [tier]: nextTierDeck },
  };
}

export function findMarketCardLocation(
  market: Record<CardTier, SplendorCard[]>,
  cardId: string
): { tier: CardTier; index: number } | null {
  for (const tier of CARD_TIERS) {
    const index = market[tier].findIndex((c) => c.id === cardId);
    if (index !== -1) {
      return { tier, index };
    }
  }
  return null;
}
