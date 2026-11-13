import {
  type GameEvent,
  type InvariantCheckResult,
  type PlayerDescriptor,
  createRngState,
  nextIntPure,
  shufflePure,
} from "@gaming-platform/core";
import { SPLENDOR_CARDS, SPLENDOR_NOBLES } from "./cards.ts";
import {
  ALL_TOKEN_COLORS,
  type CardTier,
  GEM_COLORS,
  type GemColor,
  type GemMap,
  type SplendorAction,
  type SplendorCard,
  type SplendorConfig,
  type SplendorNoble,
  type SplendorPlayerState,
  type SplendorState,
  type TokenColor,
  type TokenMap,
} from "./types.ts";

const CARD_TIERS: readonly CardTier[] = [1, 2, 3];

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
  if (playerCount === 2) return 4;
  if (playerCount === 3) return 5;
  return 7;
}

function addTokenMaps(
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

function subtractTokenMaps(
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

function incrementGemBonus(bonuses: GemMap, color: GemColor): GemMap {
  return { ...bonuses, [color]: bonuses[color] + 1 };
}

function replacePlayerAt(
  players: readonly SplendorPlayerState[],
  index: number,
  updated: SplendorPlayerState
): SplendorPlayerState[] {
  return players.map((p, idx) => (idx === index ? updated : p));
}

function appendSplendorEvent(
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

export function initSplendorGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<SplendorConfig>,
  seed: number | string = Date.now()
): SplendorState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Splendor requires 2 to 4 players");
  }

  const rng0 = createRngState(seed);
  const resolvedConfig: SplendorConfig = {
    targetPoints: config?.targetPoints ?? 15,
    maxTurns: config?.maxTurns ?? 300,
    startingPlayerIndex: config?.startingPlayerIndex,
    randomizeStartingPlayer: config?.randomizeStartingPlayer,
  };

  const gemCount = getInitialGemBankCount(players.length);
  const bank: TokenMap = {
    emerald: gemCount,
    diamond: gemCount,
    sapphire: gemCount,
    onyx: gemCount,
    ruby: gemCount,
    gold: 5,
  };

  const [tier1All, rng1] = shufflePure(
    rng0,
    SPLENDOR_CARDS.filter((c) => c.tier === 1)
  );
  const [tier2All, rng2] = shufflePure(
    rng1,
    SPLENDOR_CARDS.filter((c) => c.tier === 2)
  );
  const [tier3All, rng3] = shufflePure(
    rng2,
    SPLENDOR_CARDS.filter((c) => c.tier === 3)
  );
  const [shuffledNobles, rng4] = shufflePure(rng3, SPLENDOR_NOBLES);

  const market: Record<CardTier, SplendorCard[]> = {
    1: tier1All.slice(0, 4),
    2: tier2All.slice(0, 4),
    3: tier3All.slice(0, 4),
  };

  const decks: Record<CardTier, SplendorCard[]> = {
    1: tier1All.slice(4),
    2: tier2All.slice(4),
    3: tier3All.slice(4),
  };

  const nobles = shuffledNobles.slice(0, players.length + 1);

  const playerStates: SplendorPlayerState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: Boolean(p.isBot),
    botDifficulty: p.botDifficulty ?? "smart",
    tokens: emptyTokenMap(),
    bonuses: emptyGemMap(),
    purchasedCards: [],
    reservedCards: [],
    nobles: [],
    points: 0,
  }));

  const [startingPlayerIndex, finalRngState] =
    typeof resolvedConfig.startingPlayerIndex === "number" &&
    Number.isFinite(resolvedConfig.startingPlayerIndex)
      ? [
          ((Math.trunc(resolvedConfig.startingPlayerIndex) %
            playerStates.length) +
            playerStates.length) %
            playerStates.length,
          rng4,
        ]
      : resolvedConfig.randomizeStartingPlayer
        ? nextIntPure(rng4, 0, playerStates.length - 1)
        : [0, rng4];

  return {
    gameId: "splendor",
    config: resolvedConfig,
    rngState: finalRngState,
    turn: 1,
    round: 1,
    phase: "MAIN_ACTION",
    startingPlayerIndex,
    activePlayerIndex: startingPlayerIndex,
    players: playerStates,
    bank,
    decks,
    market,
    nobles,
    eligibleNobleIds: [],
    finalRoundTriggered: false,
    winnerId: null,
    eventLog: [
      {
        id: "evt-0",
        timestamp: 0,
        turn: 1,
        type: "GAME_STARTED",
        message: `Splendor started with ${players.length} players (${playerStates[startingPlayerIndex]!.name} goes first · ${gemCount} gems/color, ${nobles.length} Nobles, Target: ${resolvedConfig.targetPoints} Prestige).`,
      },
    ],
  };
}

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
    const excess = totalTokens(activePlayer.tokens) - 10;
    return excess <= 0
      ? []
      : generateTokenReturnActions(activePlayer.tokens, excess);
  }

  const marketPurchases: SplendorAction[] = CARD_TIERS.flatMap((tier) =>
    state.market[tier]
      .filter((card) => computeCardPurchasePayment(activePlayer, card).affordable)
      .map((card): SplendorAction => ({ type: "PURCHASE_CARD", cardId: card.id }))
  );

  const reservedPurchases: SplendorAction[] = activePlayer.reservedCards
    .filter((card) => computeCardPurchasePayment(activePlayer, card).affordable)
    .map((card): SplendorAction => ({ type: "PURCHASE_CARD", cardId: card.id }));

  const doubleGemTakes: SplendorAction[] = GEM_COLORS.filter(
    (color) => state.bank[color] >= 4
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
    activePlayer.reservedCards.length < 3
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

function takeMarketCardAndRefill(
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

function findMarketCardLocation(
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

export function applySplendorAction(
  currentState: SplendorState,
  playerId: string,
  action: SplendorAction
): { state: SplendorState; events: GameEvent[] } {
  const player = currentState.players[currentState.activePlayerIndex]!;
  if (player.id !== playerId) {
    throw new Error("Not your turn");
  }

  switch (action.type) {
    case "TAKE_GEMS": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot take gems now");
      }
      const entries = GEM_COLORS.map(
        (c) => [c, action.gems[c] ?? 0] as const
      ).filter(([, amt]) => amt > 0);
      if (entries.length === 0) {
        throw new Error("Must select at least 1 gem");
      }

      if (entries.length === 1 && entries[0]![1] === 2) {
        const [color] = entries[0]!;
        if (currentState.bank[color] < 4) {
          throw new Error(`Cannot take 2 ${color} when bank has fewer than 4`);
        }
        const delta = { [color]: 2 };
        const updatedPlayer: SplendorPlayerState = {
          ...player,
          tokens: addTokenMaps(player.tokens, delta),
        };
        const afterTake: SplendorState = {
          ...currentState,
          bank: subtractTokenMaps(currentState.bank, delta),
          players: replacePlayerAt(
            currentState.players,
            currentState.activePlayerIndex,
            updatedPlayer
          ),
        };
        const logged = appendSplendorEvent(
          afterTake,
          [],
          "GEMS_TAKEN",
          `${player.name} took 2 ${color} tokens.`,
          playerId
        );
        return resolvePostMainAction(logged.state, logged.events);
      }

      const availableInBank = GEM_COLORS.filter(
        (c) => currentState.bank[c] > 0
      ).length;
      const maxDistinct = Math.min(3, availableInBank);
      if (entries.length > 3 || entries.some(([, amt]) => amt !== 1)) {
        throw new Error("Can only take 1 each of up to 3 different gem colors");
      }
      if (
        entries.length < maxDistinct &&
        totalTokens(player.tokens) + entries.length < 10
      ) {
        throw new Error(
          `Must take ${maxDistinct} different gem colors when available`
        );
      }
      for (const [color] of entries) {
        if (currentState.bank[color] < 1) {
          throw new Error(`Bank has no ${color} tokens`);
        }
      }

      const delta = Object.fromEntries(entries) as Partial<
        Record<TokenColor, number>
      >;
      const updatedPlayer: SplendorPlayerState = {
        ...player,
        tokens: addTokenMaps(player.tokens, delta),
      };
      const afterTake: SplendorState = {
        ...currentState,
        bank: subtractTokenMaps(currentState.bank, delta),
        players: replacePlayerAt(
          currentState.players,
          currentState.activePlayerIndex,
          updatedPlayer
        ),
      };
      const logged = appendSplendorEvent(
        afterTake,
        [],
        "GEMS_TAKEN",
        `${player.name} took ${entries.map(([c]) => c).join(", ")}.`,
        playerId
      );
      return resolvePostMainAction(logged.state, logged.events);
    }

    case "RESERVE_CARD": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot reserve card now");
      }
      if (player.reservedCards.length >= 3) {
        throw new Error("Cannot hold more than 3 reserved cards");
      }

      const drawSelection = (): {
        card: SplendorCard;
        market: Record<CardTier, SplendorCard[]>;
        decks: Record<CardTier, SplendorCard[]>;
      } => {
        if (action.cardId) {
          const loc = findMarketCardLocation(
            currentState.market,
            action.cardId
          );
          if (!loc) {
            throw new Error("Target card to reserve not found");
          }
          return takeMarketCardAndRefill(
            currentState.market,
            currentState.decks,
            loc.tier,
            loc.index
          );
        }
        if (action.deckTier) {
          const deck = currentState.decks[action.deckTier];
          if (!deck || deck.length === 0) {
            throw new Error(`Tier ${action.deckTier} deck is empty`);
          }
          return {
            card: deck[deck.length - 1]!,
            market: currentState.market,
            decks: {
              ...currentState.decks,
              [action.deckTier]: deck.slice(0, -1),
            },
          };
        }
        throw new Error("Target card to reserve not found");
      };

      const { card: reservedCard, market, decks } = drawSelection();
      const gotGold = currentState.bank.gold > 0;
      const goldDelta = gotGold ? { gold: 1 } : {};
      const updatedPlayer: SplendorPlayerState = {
        ...player,
        reservedCards: [...player.reservedCards, reservedCard],
        tokens: addTokenMaps(player.tokens, goldDelta),
      };
      const afterReserve: SplendorState = {
        ...currentState,
        market,
        decks,
        bank: subtractTokenMaps(currentState.bank, goldDelta),
        players: replacePlayerAt(
          currentState.players,
          currentState.activePlayerIndex,
          updatedPlayer
        ),
      };
      const logged = appendSplendorEvent(
        afterReserve,
        [],
        "CARD_RESERVED",
        `${player.name} reserved a Tier ${reservedCard.tier} card${gotGold ? " and took 1 Gold joker" : ""}.`,
        playerId
      );
      return resolvePostMainAction(logged.state, logged.events);
    }

    case "PURCHASE_CARD": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot purchase card now");
      }

      const marketLoc = findMarketCardLocation(
        currentState.market,
        action.cardId
      );
      const reservedIdx = marketLoc
        ? -1
        : player.reservedCards.findIndex((c) => c.id === action.cardId);

      const targetCard = marketLoc
        ? currentState.market[marketLoc.tier][marketLoc.index]!
        : reservedIdx !== -1
          ? player.reservedCards[reservedIdx]!
          : null;

      if (!targetCard) {
        throw new Error(
          `Card ${action.cardId} not found in market or reserved hand`
        );
      }

      const { affordable, payment } = computeCardPurchasePayment(
        player,
        targetCard
      );
      if (!affordable) {
        throw new Error("Cannot afford this card");
      }

      const marketUpdate = marketLoc
        ? takeMarketCardAndRefill(
            currentState.market,
            currentState.decks,
            marketLoc.tier,
            marketLoc.index
          )
        : {
            market: currentState.market,
            decks: currentState.decks,
          };

      const nextReservedCards = marketLoc
        ? player.reservedCards
        : player.reservedCards.filter((_, idx) => idx !== reservedIdx);

      const updatedPlayer: SplendorPlayerState = {
        ...player,
        tokens: subtractTokenMaps(player.tokens, payment),
        reservedCards: nextReservedCards,
        purchasedCards: [...player.purchasedCards, targetCard],
        bonuses: incrementGemBonus(player.bonuses, targetCard.bonus),
        points: player.points + targetCard.points,
      };

      const afterPurchase: SplendorState = {
        ...currentState,
        bank: addTokenMaps(currentState.bank, payment),
        market: marketUpdate.market,
        decks: marketUpdate.decks,
        players: replacePlayerAt(
          currentState.players,
          currentState.activePlayerIndex,
          updatedPlayer
        ),
      };

      const logged = appendSplendorEvent(
        afterPurchase,
        [],
        "CARD_PURCHASED",
        `${player.name} purchased a Tier ${targetCard.tier} ${targetCard.bonus} card (+${targetCard.points} VP).`,
        playerId
      );
      return resolvePostMainAction(logged.state, logged.events);
    }

    case "RETURN_TOKENS": {
      if (currentState.phase !== "RETURN_TOKENS") {
        throw new Error("Not in token return phase");
      }
      const excess = totalTokens(player.tokens) - 10;
      const returnSum = totalTokens(action.tokens);
      if (returnSum !== excess) {
        throw new Error(`Must return exactly ${excess} tokens`);
      }
      for (const color of ALL_TOKEN_COLORS) {
        const amt = action.tokens[color] ?? 0;
        if (amt < 0 || player.tokens[color] < amt) {
          throw new Error(`Invalid return amount for ${color}`);
        }
      }

      const updatedPlayer: SplendorPlayerState = {
        ...player,
        tokens: subtractTokenMaps(player.tokens, action.tokens),
      };
      const afterReturn: SplendorState = {
        ...currentState,
        bank: addTokenMaps(currentState.bank, action.tokens),
        players: replacePlayerAt(
          currentState.players,
          currentState.activePlayerIndex,
          updatedPlayer
        ),
      };
      const logged = appendSplendorEvent(
        afterReturn,
        [],
        "TOKENS_RETURNED",
        `${player.name} returned ${excess} excess token(s) to stay at 10.`,
        playerId
      );
      return resolveNoblesAndAdvanceTurn(logged.state, logged.events);
    }

    case "SELECT_NOBLE": {
      if (currentState.phase !== "SELECT_NOBLE") {
        throw new Error("Not in noble selection phase");
      }
      if (!currentState.eligibleNobleIds.includes(action.nobleId)) {
        throw new Error(`Noble ${action.nobleId} is not eligible`);
      }
      const noble = currentState.nobles.find((n) => n.id === action.nobleId)!;
      const updatedPlayer: SplendorPlayerState = {
        ...player,
        nobles: [...player.nobles, noble],
        points: player.points + noble.points,
      };
      const afterNoble: SplendorState = {
        ...currentState,
        nobles: currentState.nobles.filter((n) => n.id !== action.nobleId),
        eligibleNobleIds: [],
        players: replacePlayerAt(
          currentState.players,
          currentState.activePlayerIndex,
          updatedPlayer
        ),
      };
      const logged = appendSplendorEvent(
        afterNoble,
        [],
        "NOBLE_VISITED",
        `👑 Noble ${noble.name} visited ${player.name} (+${noble.points} VP)!`,
        playerId
      );
      return finishTurnTransition(logged.state, logged.events);
    }

    case "PASS_TURN": {
      const logged = appendSplendorEvent(
        currentState,
        [],
        "TURN_PASSED",
        `${player.name} passed.`,
        playerId
      );
      return resolveNoblesAndAdvanceTurn(logged.state, logged.events);
    }
  }
}

function resolvePostMainAction(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const activePlayer = state.players[state.activePlayerIndex]!;
  if (totalTokens(activePlayer.tokens) > 10) {
    return {
      state: { ...state, phase: "RETURN_TOKENS" },
      events: [...events],
    };
  }
  return resolveNoblesAndAdvanceTurn(state, events);
}

function resolveNoblesAndAdvanceTurn(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const player = state.players[state.activePlayerIndex]!;
  const matching = state.nobles.filter((n) => qualifiesForNoble(player, n));
  if (matching.length === 1) {
    const noble = matching[0]!;
    const updatedPlayer: SplendorPlayerState = {
      ...player,
      nobles: [...player.nobles, noble],
      points: player.points + noble.points,
    };
    const withNoble: SplendorState = {
      ...state,
      nobles: state.nobles.filter((n) => n.id !== noble.id),
      players: replacePlayerAt(
        state.players,
        state.activePlayerIndex,
        updatedPlayer
      ),
    };
    const logged = appendSplendorEvent(
      withNoble,
      events,
      "NOBLE_VISITED",
      `👑 Noble ${noble.name} visited ${player.name} (+${noble.points} VP)!`,
      player.id
    );
    return finishTurnTransition(logged.state, logged.events);
  }

  if (matching.length > 1) {
    return {
      state: {
        ...state,
        eligibleNobleIds: matching.map((n) => n.id),
        phase: "SELECT_NOBLE",
      },
      events: [...events],
    };
  }

  return finishTurnTransition(state, events);
}

function finishTurnTransition(
  state: SplendorState,
  events: readonly GameEvent[]
): { state: SplendorState; events: GameEvent[] } {
  const player = state.players[state.activePlayerIndex]!;
  const finalRoundTriggered =
    state.finalRoundTriggered || player.points >= state.config.targetPoints;

  const startIdx = state.startingPlayerIndex ?? 0;
  const nextIdx = (state.activePlayerIndex + 1) % state.players.length;
  const isLastPlayerInRound = nextIdx === startIdx;

  if (
    (finalRoundTriggered && isLastPlayerInRound) ||
    state.turn >= state.config.maxTurns
  ) {
    const sorted = [...state.players].sort((a, b) =>
      b.points !== a.points
        ? b.points - a.points
        : a.purchasedCards.length - b.purchasedCards.length
    );
    const winner = sorted[0]!;
    const finishedState: SplendorState = {
      ...state,
      finalRoundTriggered,
      winnerId: winner.id,
      phase: "GAME_OVER",
    };
    return appendSplendorEvent(
      finishedState,
      events,
      "GAME_OVER",
      `🏆 ${winner.name} wins Splendor with ${winner.points} Prestige Points (${winner.purchasedCards.length} cards)!`,
      winner.id
    );
  }

  return {
    state: {
      ...state,
      finalRoundTriggered,
      activePlayerIndex: nextIdx,
      turn: state.turn + 1,
      round: nextIdx === startIdx ? state.round + 1 : state.round,
      phase: "MAIN_ACTION",
    },
    events: [...events],
  };
}

export function checkSplendorInvariants(
  state: SplendorState
): InvariantCheckResult {
  const expectedGemTotal = getInitialGemBankCount(state.players.length);

  const gemViolations = GEM_COLORS.flatMap((color) => {
    const bankNeg =
      state.bank[color] < 0
        ? [`Negative bank ${color}: ${state.bank[color]}`]
        : [];
    const playerNegs = state.players
      .filter((p) => p.tokens[color] < 0)
      .map((p) => `Player ${p.id} has negative ${color}`);
    const playerSum = state.players.reduce((s, p) => s + p.tokens[color], 0);
    const conservation =
      state.bank[color] + playerSum !== expectedGemTotal
        ? [
            `Token conservation violated for ${color}: ${state.bank[color]} + ${playerSum} !== ${expectedGemTotal}`,
          ]
        : [];
    return [...bankNeg, ...playerNegs, ...conservation];
  });

  const goldSum =
    state.bank.gold + state.players.reduce((s, p) => s + p.tokens.gold, 0);
  const goldViolations =
    goldSum !== 5 ? [`Gold conservation violated: ${goldSum} !== 5`] : [];

  const playerViolations = state.players.flatMap((p) => {
    const reservedErr =
      p.reservedCards.length > 3
        ? [`Player ${p.id} has > 3 reserved cards`]
        : [];
    const tokenLimitErr =
      state.phase !== "RETURN_TOKENS" && totalTokens(p.tokens) > 10
        ? [
            `Player ${p.id} holds ${totalTokens(p.tokens)} > 10 tokens outside RETURN_TOKENS phase`,
          ]
        : [];
    const calcPoints =
      p.purchasedCards.reduce((s, c) => s + c.points, 0) +
      p.nobles.reduce((s, n) => s + n.points, 0);
    const pointsErr =
      p.points !== calcPoints
        ? [`Player ${p.id} points mismatch: ${p.points} !== ${calcPoints}`]
        : [];
    return [...reservedErr, ...tokenLimitErr, ...pointsErr];
  });

  const violations = [...gemViolations, ...goldViolations, ...playerViolations];
  return {
    valid: violations.length === 0,
    violations,
  };
}
