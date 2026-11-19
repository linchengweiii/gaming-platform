import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  SPLENDOR_DOUBLE_GEM_MIN_BANK,
  SPLENDOR_HAND_TOKEN_LIMIT,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import type {
  GemColor,
  GemMap,
  SplendorAction,
  SplendorState,
  TokenMap,
} from "../types.ts";
import {
  CARD_TIERS,
  computeCardPurchasePayment,
  totalTokens,
} from "./helpers.ts";

function threeColorCombinations(
  colors: readonly GemColor[]
): Array<Partial<GemMap>> {
  return colors.flatMap((c1, i) =>
    colors
      .slice(i + 1)
      .flatMap((c2, jOffset) =>
        colors
          .slice(i + 1 + jOffset + 1)
          .map((c3) => ({ [c1]: 1, [c2]: 1, [c3]: 1 }))
      )
  );
}

function generateTokenReturnActions(
  hand: TokenMap,
  excess: number
): Array<{ type: "RETURN_TOKENS"; tokens: Partial<TokenMap> }> {
  const enumerate = (
    idx: number,
    rem: number,
    current: Partial<TokenMap>
  ): Array<Partial<TokenMap>> => {
    if (rem === 0) {
      return [current];
    }
    if (idx >= ALL_TOKEN_COLORS.length) {
      return [];
    }
    const color = ALL_TOKEN_COLORS[idx]!;
    const maxTake = Math.min(hand[color], rem);
    const takeCounts = Array.from(
      { length: maxTake + 1 },
      (_, step) => maxTake - step
    );
    return takeCounts.flatMap((take) =>
      enumerate(
        idx + 1,
        rem - take,
        take > 0 ? { ...current, [color]: take } : current
      )
    );
  };

  const uniqueByKey = enumerate(0, excess, {}).reduce<{
    seen: ReadonlySet<string>;
    items: Array<{ type: "RETURN_TOKENS"; tokens: Partial<TokenMap> }>;
  }>(
    (acc, combo) => {
      const key = JSON.stringify(combo);
      if (acc.seen.has(key)) return acc;
      return {
        seen: new Set([...acc.seen, key]),
        items: [...acc.items, { type: "RETURN_TOKENS", tokens: combo }],
      };
    },
    { seen: new Set<string>(), items: [] }
  );

  return uniqueByKey.items;
}

export function getSplendorLegalActions(
  state: SplendorState,
  playerId: string
): SplendorAction[] {
  if (state.phase === "GAME_OVER") return [];
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (activePlayer.id !== playerId) return [];

  if (state.phase === "SELECT_NOBLE") {
    return state.eligibleNobleIds.map((nobleId) => ({
      type: "SELECT_NOBLE",
      nobleId,
    }));
  }

  if (state.phase === "RETURN_TOKENS") {
    const excess = totalTokens(activePlayer.tokens) - SPLENDOR_HAND_TOKEN_LIMIT;
    return excess <= 0
      ? []
      : generateTokenReturnActions(activePlayer.tokens, excess);
  }

  const marketPurchases: SplendorAction[] = CARD_TIERS.flatMap((tier) =>
    state.market[tier]
      .filter(
        (card) =>
          !card.redacted &&
          computeCardPurchasePayment(activePlayer, card).affordable
      )
      .map((card): SplendorAction => ({ type: "PURCHASE_CARD", cardId: card.id }))
  );

  const reservedPurchases: SplendorAction[] = activePlayer.reservedCards
    .filter(
      (card) =>
        !card.redacted &&
        computeCardPurchasePayment(activePlayer, card).affordable
    )
    .map((card): SplendorAction => ({ type: "PURCHASE_CARD", cardId: card.id }));

  const doubleGemTakes: SplendorAction[] = GEM_COLORS.filter(
    (color) => state.bank[color] >= SPLENDOR_DOUBLE_GEM_MIN_BANK
  ).map((color): SplendorAction => ({ type: "TAKE_GEMS", gems: { [color]: 2 } }));

  const availableColors = GEM_COLORS.filter((c) => state.bank[c] > 0);
  const distinctGemTakes: SplendorAction[] =
    availableColors.length >= 3
      ? threeColorCombinations(availableColors).map(
          (gems): SplendorAction => ({ type: "TAKE_GEMS", gems })
        )
      : availableColors.length === 2
        ? [
            {
              type: "TAKE_GEMS",
              gems: {
                [availableColors[0]!]: 1,
                [availableColors[1]!]: 1,
              },
            },
          ]
        : availableColors.length === 1
          ? [
              {
                type: "TAKE_GEMS",
                gems: { [availableColors[0]!]: 1 },
              },
            ]
          : [];

  const reserveActions: SplendorAction[] =
    activePlayer.reservedCards.length < SPLENDOR_MAX_RESERVED_CARDS
      ? CARD_TIERS.flatMap((tier) => [
          ...state.market[tier].map(
            (card): SplendorAction => ({ type: "RESERVE_CARD", cardId: card.id })
          ),
          ...(state.decks[tier].length > 0
            ? [{ type: "RESERVE_CARD" as const, deckTier: tier }]
            : []),
        ])
      : [];

  const actions: SplendorAction[] = [
    ...marketPurchases,
    ...reservedPurchases,
    ...doubleGemTakes,
    ...distinctGemTakes,
    ...reserveActions,
  ];

  return actions.length > 0 ? actions : [{ type: "PASS_TURN" }];
}
