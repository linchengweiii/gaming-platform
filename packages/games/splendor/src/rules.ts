import {
  type GameEvent,
  type InvariantCheckResult,
  type PlayerDescriptor,
  SeededRNG,
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

export function emptyGemMap(): GemMap {
  return { emerald: 0, diamond: 0, sapphire: 0, onyx: 0, ruby: 0 };
}

export function emptyTokenMap(): TokenMap {
  return { emerald: 0, diamond: 0, sapphire: 0, onyx: 0, ruby: 0, gold: 0 };
}

export function totalTokens(tokens: Partial<TokenMap>): number {
  let sum = 0;
  for (const c of ALL_TOKEN_COLORS) {
    sum += tokens[c] ?? 0;
  }
  return sum;
}

export function getInitialGemBankCount(playerCount: number): number {
  if (playerCount === 2) return 4;
  if (playerCount === 3) return 5;
  return 7;
}

/**
 * Computes whether `player` can afford `card`, and the exact token payment required
 * (using permanent bonuses first, then color tokens, then Gold jokers).
 */
export function computeCardPurchasePayment(
  player: SplendorPlayerState,
  card: SplendorCard
): { affordable: boolean; payment: TokenMap; goldShortfall: number } {
  const payment = emptyTokenMap();
  let goldNeeded = 0;

  for (const color of GEM_COLORS) {
    const discounted = Math.max(0, card.cost[color] - player.bonuses[color]);
    const payColor = Math.min(player.tokens[color], discounted);
    payment[color] = payColor;
    goldNeeded += discounted - payColor;
  }

  payment.gold = goldNeeded;
  return {
    affordable: goldNeeded <= player.tokens.gold,
    payment,
    goldShortfall: Math.max(0, goldNeeded - player.tokens.gold),
  };
}

export function qualifiesForNoble(
  player: SplendorPlayerState,
  noble: SplendorNoble
): boolean {
  for (const color of GEM_COLORS) {
    const req = noble.requirements[color] ?? 0;
    if (player.bonuses[color] < req) {
      return false;
    }
  }
  return true;
}

export function initSplendorGame(
  players: readonly PlayerDescriptor[],
  config?: Partial<SplendorConfig>,
  seed: number | string = Date.now()
): SplendorState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Splendor requires 2 to 4 players");
  }

  const rng = new SeededRNG(seed);
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

  const tier1All = rng.shuffle(SPLENDOR_CARDS.filter((c) => c.tier === 1));
  const tier2All = rng.shuffle(SPLENDOR_CARDS.filter((c) => c.tier === 2));
  const tier3All = rng.shuffle(SPLENDOR_CARDS.filter((c) => c.tier === 3));

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

  const nobles = rng.shuffle(SPLENDOR_NOBLES).slice(0, players.length + 1);

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

  const startingPlayerIndex =
    typeof resolvedConfig.startingPlayerIndex === "number" &&
    Number.isFinite(resolvedConfig.startingPlayerIndex)
      ? ((Math.trunc(resolvedConfig.startingPlayerIndex) % playerStates.length) +
          playerStates.length) %
        playerStates.length
      : resolvedConfig.randomizeStartingPlayer
        ? rng.nextInt(0, playerStates.length - 1)
        : 0;

  return {
    gameId: "splendor",
    config: resolvedConfig,
    rngState: rng.getState(),
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
    if (excess <= 0) return [];
    return generateTokenReturnActions(activePlayer.tokens, excess);
  }

  // MAIN_ACTION phase
  const actions: SplendorAction[] = [];

  // 1. PURCHASE_CARD (from market or reserved hand)
  for (const tier of [1, 2, 3] as const) {
    for (const card of state.market[tier]) {
      if (computeCardPurchasePayment(activePlayer, card).affordable) {
        actions.push({ type: "PURCHASE_CARD", cardId: card.id });
      }
    }
  }
  for (const card of activePlayer.reservedCards) {
    if (computeCardPurchasePayment(activePlayer, card).affordable) {
      actions.push({ type: "PURCHASE_CARD", cardId: card.id });
    }
  }

  // 2. TAKE_GEMS:
  // (a) 2 of the same color (requires >= 4 in bank)
  for (const color of GEM_COLORS) {
    if (state.bank[color] >= 4) {
      actions.push({ type: "TAKE_GEMS", gems: { [color]: 2 } });
    }
  }
  // (b) Up to 3 different colors available in bank
  const availableColors = GEM_COLORS.filter((c) => state.bank[c] > 0);
  if (availableColors.length >= 3) {
    for (let i = 0; i < availableColors.length; i++) {
      for (let j = i + 1; j < availableColors.length; j++) {
        for (let k = j + 1; k < availableColors.length; k++) {
          actions.push({
            type: "TAKE_GEMS",
            gems: {
              [availableColors[i]!]: 1,
              [availableColors[j]!]: 1,
              [availableColors[k]!]: 1,
            },
          });
        }
      }
    }
  } else if (availableColors.length === 2) {
    actions.push({
      type: "TAKE_GEMS",
      gems: {
        [availableColors[0]!]: 1,
        [availableColors[1]!]: 1,
      },
    });
  } else if (availableColors.length === 1) {
    actions.push({
      type: "TAKE_GEMS",
      gems: {
        [availableColors[0]!]: 1,
      },
    });
  }

  // 3. RESERVE_CARD (if player holds < 3 reserved cards)
  if (activePlayer.reservedCards.length < 3) {
    for (const tier of [1, 2, 3] as const) {
      for (const card of state.market[tier]) {
        actions.push({ type: "RESERVE_CARD", cardId: card.id });
      }
      if (state.decks[tier].length > 0) {
        actions.push({ type: "RESERVE_CARD", deckTier: tier });
      }
    }
  }

  if (actions.length === 0) {
    actions.push({ type: "PASS_TURN" });
  }

  return actions;
}

function generateTokenReturnActions(
  hand: TokenMap,
  excess: number
): Array<{ type: "RETURN_TOKENS"; tokens: Partial<TokenMap> }> {
  const results: Array<{ type: "RETURN_TOKENS"; tokens: Partial<TokenMap> }> = [];
  const seen = new Set<string>();

  // Generate combinations of `excess` tokens to return (excess is at most 3)
  function backtrack(idx: number, rem: number, current: Partial<TokenMap>): void {
    if (rem === 0) {
      const key = JSON.stringify(current);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ type: "RETURN_TOKENS", tokens: { ...current } });
      }
      return;
    }
    if (idx >= ALL_TOKEN_COLORS.length) return;
    const color = ALL_TOKEN_COLORS[idx]!;
    const maxTake = Math.min(hand[color], rem);
    for (let take = maxTake; take >= 0; take--) {
      if (take > 0) {
        current[color] = take;
      } else {
        delete current[color];
      }
      backtrack(idx + 1, rem - take, current);
      delete current[color];
    }
  }

  backtrack(0, excess, {});
  return results;
}

function pushEvent(
  state: SplendorState,
  emitted: GameEvent[],
  type: string,
  message: string,
  playerId?: string
): void {
  const evt: GameEvent = {
    id: `evt-${state.eventLog.length}`,
    timestamp: state.eventLog.length,
    turn: state.turn,
    playerId,
    type,
    message,
  };
  state.eventLog.push(evt);
  emitted.push(evt);
}

export function applySplendorAction(
  currentState: SplendorState,
  playerId: string,
  action: SplendorAction
): { state: SplendorState; events: GameEvent[] } {
  const state = structuredClone(currentState);
  const emitted: GameEvent[] = [];
  const player = state.players[state.activePlayerIndex]!;

  if (player.id !== playerId) {
    throw new Error("Not your turn");
  }

  switch (action.type) {
    case "TAKE_GEMS": {
      if (state.phase !== "MAIN_ACTION") {
        throw new Error("Cannot take gems now");
      }
      const entries = GEM_COLORS.map((c) => [c, action.gems[c] ?? 0] as const).filter(
        ([, amt]) => amt > 0
      );
      if (entries.length === 0) {
        throw new Error("Must select at least 1 gem");
      }

      if (entries.length === 1 && entries[0]![1] === 2) {
        const [color] = entries[0]!;
        if (state.bank[color] < 4) {
          throw new Error(`Cannot take 2 ${color} when bank has fewer than 4`);
        }
        state.bank[color] -= 2;
        player.tokens[color] += 2;
        pushEvent(
          state,
          emitted,
          "GEMS_TAKEN",
          `${player.name} took 2 ${color} tokens.`,
          playerId
        );
      } else {
        const availableInBank = GEM_COLORS.filter((c) => state.bank[c] > 0).length;
        const maxDistinct = Math.min(3, availableInBank);
        if (entries.length > 3 || entries.some(([, amt]) => amt !== 1)) {
          throw new Error("Can only take 1 each of up to 3 different gem colors");
        }
        if (entries.length < maxDistinct && totalTokens(player.tokens) + entries.length < 10) {
          // Allow taking fewer than 3 if bank has fewer than 3 colors
          throw new Error(`Must take ${maxDistinct} different gem colors when available`);
        }
        for (const [color] of entries) {
          if (state.bank[color] < 1) {
            throw new Error(`Bank has no ${color} tokens`);
          }
          state.bank[color] -= 1;
          player.tokens[color] += 1;
        }
        pushEvent(
          state,
          emitted,
          "GEMS_TAKEN",
          `${player.name} took ${entries.map(([c]) => c).join(", ")}.`,
          playerId
        );
      }

      resolvePostMainAction(state, player, emitted);
      break;
    }

    case "RESERVE_CARD": {
      if (state.phase !== "MAIN_ACTION") {
        throw new Error("Cannot reserve card now");
      }
      if (player.reservedCards.length >= 3) {
        throw new Error("Cannot hold more than 3 reserved cards");
      }

      let reservedCard: SplendorCard | null = null;
      if (action.cardId) {
        for (const tier of [1, 2, 3] as const) {
          const idx = state.market[tier].findIndex((c) => c.id === action.cardId);
          if (idx !== -1) {
            reservedCard = state.market[tier][idx]!;
            state.market[tier].splice(idx, 1);
            if (state.decks[tier].length > 0) {
              state.market[tier].push(state.decks[tier].pop()!);
            }
            break;
          }
        }
      } else if (action.deckTier) {
        const deck = state.decks[action.deckTier];
        if (!deck || deck.length === 0) {
          throw new Error(`Tier ${action.deckTier} deck is empty`);
        }
        reservedCard = deck.pop()!;
      }

      if (!reservedCard) {
        throw new Error("Target card to reserve not found");
      }

      player.reservedCards.push(reservedCard);
      let gotGold = false;
      if (state.bank.gold > 0) {
        state.bank.gold -= 1;
        player.tokens.gold += 1;
        gotGold = true;
      }

      pushEvent(
        state,
        emitted,
        "CARD_RESERVED",
        `${player.name} reserved a Tier ${reservedCard.tier} card${gotGold ? " and took 1 Gold joker" : ""}.`,
        playerId
      );

      resolvePostMainAction(state, player, emitted);
      break;
    }

    case "PURCHASE_CARD": {
      if (state.phase !== "MAIN_ACTION") {
        throw new Error("Cannot purchase card now");
      }

      let targetCard: SplendorCard | null = null;
      let fromMarketTier: CardTier | null = null;
      let marketIdx = -1;
      let reservedIdx = -1;

      for (const tier of [1, 2, 3] as const) {
        const idx = state.market[tier].findIndex((c) => c.id === action.cardId);
        if (idx !== -1) {
          targetCard = state.market[tier][idx]!;
          fromMarketTier = tier;
          marketIdx = idx;
          break;
        }
      }

      if (!targetCard) {
        reservedIdx = player.reservedCards.findIndex((c) => c.id === action.cardId);
        if (reservedIdx !== -1) {
          targetCard = player.reservedCards[reservedIdx]!;
        }
      }

      if (!targetCard) {
        throw new Error(`Card ${action.cardId} not found in market or reserved hand`);
      }

      const { affordable, payment } = computeCardPurchasePayment(player, targetCard);
      if (!affordable) {
        throw new Error("Cannot afford this card");
      }

      // Pay tokens back to bank
      for (const color of ALL_TOKEN_COLORS) {
        player.tokens[color] -= payment[color];
        state.bank[color] += payment[color];
      }

      if (fromMarketTier !== null) {
        state.market[fromMarketTier].splice(marketIdx, 1);
        if (state.decks[fromMarketTier].length > 0) {
          state.market[fromMarketTier].push(state.decks[fromMarketTier].pop()!);
        }
      } else {
        player.reservedCards.splice(reservedIdx, 1);
      }

      player.purchasedCards.push(targetCard);
      player.bonuses[targetCard.bonus] += 1;
      player.points += targetCard.points;

      pushEvent(
        state,
        emitted,
        "CARD_PURCHASED",
        `${player.name} purchased a Tier ${targetCard.tier} ${targetCard.bonus} card (+${targetCard.points} VP).`,
        playerId
      );

      resolvePostMainAction(state, player, emitted);
      break;
    }

    case "RETURN_TOKENS": {
      if (state.phase !== "RETURN_TOKENS") {
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
      for (const color of ALL_TOKEN_COLORS) {
        const amt = action.tokens[color] ?? 0;
        player.tokens[color] -= amt;
        state.bank[color] += amt;
      }

      pushEvent(
        state,
        emitted,
        "TOKENS_RETURNED",
        `${player.name} returned ${excess} excess token(s) to stay at 10.`,
        playerId
      );

      resolveNoblesAndAdvanceTurn(state, player, emitted);
      break;
    }

    case "SELECT_NOBLE": {
      if (state.phase !== "SELECT_NOBLE") {
        throw new Error("Not in noble selection phase");
      }
      if (!state.eligibleNobleIds.includes(action.nobleId)) {
        throw new Error(`Noble ${action.nobleId} is not eligible`);
      }
      const idx = state.nobles.findIndex((n) => n.id === action.nobleId);
      const noble = state.nobles[idx]!;
      state.nobles.splice(idx, 1);
      player.nobles.push(noble);
      player.points += noble.points;
      state.eligibleNobleIds = [];

      pushEvent(
        state,
        emitted,
        "NOBLE_VISITED",
        `👑 Noble ${noble.name} visited ${player.name} (+${noble.points} VP)!`,
        playerId
      );

      finishTurnTransition(state, player, emitted);
      break;
    }

    case "PASS_TURN": {
      pushEvent(state, emitted, "TURN_PASSED", `${player.name} passed.`, playerId);
      resolveNoblesAndAdvanceTurn(state, player, emitted);
      break;
    }
  }

  return { state, events: emitted };
}

function resolvePostMainAction(
  state: SplendorState,
  player: SplendorPlayerState,
  emitted: GameEvent[]
): void {
  if (totalTokens(player.tokens) > 10) {
    state.phase = "RETURN_TOKENS";
    return;
  }
  resolveNoblesAndAdvanceTurn(state, player, emitted);
}

function resolveNoblesAndAdvanceTurn(
  state: SplendorState,
  player: SplendorPlayerState,
  emitted: GameEvent[]
): void {
  const matching = state.nobles.filter((n) => qualifiesForNoble(player, n));
  if (matching.length === 1) {
    const noble = matching[0]!;
    state.nobles = state.nobles.filter((n) => n.id !== noble.id);
    player.nobles.push(noble);
    player.points += noble.points;
    pushEvent(
      state,
      emitted,
      "NOBLE_VISITED",
      `👑 Noble ${noble.name} visited ${player.name} (+${noble.points} VP)!`,
      player.id
    );
    finishTurnTransition(state, player, emitted);
  } else if (matching.length > 1) {
    state.eligibleNobleIds = matching.map((n) => n.id);
    state.phase = "SELECT_NOBLE";
  } else {
    finishTurnTransition(state, player, emitted);
  }
}

function finishTurnTransition(
  state: SplendorState,
  player: SplendorPlayerState,
  emitted: GameEvent[]
): void {
  if (player.points >= state.config.targetPoints) {
    state.finalRoundTriggered = true;
  }

  const startIdx = state.startingPlayerIndex ?? 0;
  const nextIdx = (state.activePlayerIndex + 1) % state.players.length;
  const isLastPlayerInRound = nextIdx === startIdx;
  if (
    (state.finalRoundTriggered && isLastPlayerInRound) ||
    state.turn >= state.config.maxTurns
  ) {
    // Determine winner: highest points, tie-broken by fewest purchased cards!
    const sorted = [...state.players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.purchasedCards.length - b.purchasedCards.length;
    });
    const winner = sorted[0]!;
    state.winnerId = winner.id;
    state.phase = "GAME_OVER";
    pushEvent(
      state,
      emitted,
      "GAME_OVER",
      `🏆 ${winner.name} wins Splendor with ${winner.points} Prestige Points (${winner.purchasedCards.length} cards)!`,
      winner.id
    );
    return;
  }

  state.activePlayerIndex = nextIdx;
  state.turn += 1;
  if (state.activePlayerIndex === startIdx) {
    state.round += 1;
  }
  state.phase = "MAIN_ACTION";
}

export function checkSplendorInvariants(state: SplendorState): InvariantCheckResult {
  const violations: string[] = [];
  const expectedGemTotal = getInitialGemBankCount(state.players.length);

  for (const color of GEM_COLORS) {
    if (state.bank[color] < 0) {
      violations.push(`Negative bank ${color}: ${state.bank[color]}`);
    }
    let playerSum = 0;
    for (const p of state.players) {
      if (p.tokens[color] < 0) {
        violations.push(`Player ${p.id} has negative ${color}`);
      }
      playerSum += p.tokens[color];
    }
    if (state.bank[color] + playerSum !== expectedGemTotal) {
      violations.push(
        `Token conservation violated for ${color}: ${state.bank[color]} + ${playerSum} !== ${expectedGemTotal}`
      );
    }
  }

  const goldSum =
    state.bank.gold + state.players.reduce((s, p) => s + p.tokens.gold, 0);
  if (goldSum !== 5) {
    violations.push(`Gold conservation violated: ${goldSum} !== 5`);
  }

  for (const p of state.players) {
    if (p.reservedCards.length > 3) {
      violations.push(`Player ${p.id} has > 3 reserved cards`);
    }
    if (state.phase !== "RETURN_TOKENS" && totalTokens(p.tokens) > 10) {
      violations.push(`Player ${p.id} holds ${totalTokens(p.tokens)} > 10 tokens outside RETURN_TOKENS phase`);
    }
    const calcPoints =
      p.purchasedCards.reduce((s, c) => s + c.points, 0) +
      p.nobles.reduce((s, n) => s + n.points, 0);
    if (p.points !== calcPoints) {
      violations.push(`Player ${p.id} points mismatch: ${p.points} !== ${calcPoints}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
