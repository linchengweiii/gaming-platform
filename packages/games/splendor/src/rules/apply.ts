import type { GameEvent } from "@gaming-platform/core";
import {
  ALL_TOKEN_COLORS,
  GEM_COLORS,
  SPLENDOR_DOUBLE_GEM_MIN_BANK,
  SPLENDOR_HAND_TOKEN_LIMIT,
  SPLENDOR_MAX_DISTINCT_GEMS,
  SPLENDOR_MAX_RESERVED_CARDS,
} from "../config.ts";
import type {
  CardTier,
  SplendorAction,
  SplendorCard,
  SplendorPlayerState,
  SplendorState,
  TokenColor,
} from "../types.ts";
import {
  addTokenMaps,
  appendSplendorEvent,
  computeCardPurchasePayment,
  findMarketCardLocation,
  incrementGemBonus,
  replacePlayerAt,
  subtractTokenMaps,
  takeMarketCardAndRefill,
  totalTokens,
} from "./helpers.ts";
import {
  finishTurnTransition,
  resolveNoblesAndAdvanceTurn,
  resolvePostMainAction,
} from "./turn-flow.ts";
import { getSplendorLegalActions } from "./legal-actions.ts";

function validateTokenCounts(
  payload: unknown,
  allowedColors: readonly string[],
  invalidPayloadMsg: string,
  colorErrPrefix: string,
  qtyErrPrefix: string
): void {
  if (!payload || typeof payload !== "object") {
    throw new Error(invalidPayloadMsg);
  }
  for (const [key, rawVal] of Object.entries(payload)) {
    if (!allowedColors.includes(key)) {
      throw new Error(`${colorErrPrefix}: ${key}`);
    }
    if (
      rawVal !== undefined &&
      (typeof rawVal !== "number" || !Number.isInteger(rawVal) || rawVal < 0)
    ) {
      throw new Error(`${qtyErrPrefix} ${key}`);
    }
  }
}

function withUpdatedActivePlayer(
  state: SplendorState,
  updatedPlayer: SplendorPlayerState,
  patch: Partial<SplendorState>
): SplendorState {
  return {
    ...state,
    ...patch,
    players: replacePlayerAt(
      state.players,
      state.activePlayerIndex,
      updatedPlayer
    ),
  };
}

export function applySplendorAction(
  currentState: SplendorState,
  playerId: string,
  action: SplendorAction
): { state: SplendorState; events: GameEvent[] } {
  if (currentState.phase === "GAME_OVER") {
    throw new Error("Game is already over");
  }
  const player = currentState.players[currentState.activePlayerIndex]!;
  if (player.id !== playerId) {
    throw new Error("Not your turn");
  }
  if (!action || typeof action !== "object") {
    throw new Error("Invalid Splendor action");
  }

  switch (action.type) {
    case "TAKE_GEMS": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot take gems now");
      }
      validateTokenCounts(
        action.gems,
        GEM_COLORS,
        "Invalid gem selection",
        "Invalid gem color",
        "Invalid gem quantity for"
      );
      const entries = GEM_COLORS.map(
        (c) => [c, action.gems[c] ?? 0] as const
      ).filter(([, amt]) => amt > 0);
      if (entries.length === 0) {
        throw new Error("Must select at least 1 gem");
      }

      let delta: Partial<Record<TokenColor, number>>;
      let summary: string;
      if (entries.length === 1 && entries[0]![1] === 2) {
        const [color] = entries[0]!;
        if (currentState.bank[color] < SPLENDOR_DOUBLE_GEM_MIN_BANK) {
          throw new Error(`Cannot take 2 ${color} when bank has fewer than 4`);
        }
        delta = { [color]: 2 };
        summary = `2 ${color} tokens`;
      } else {
        const availableInBank = GEM_COLORS.filter(
          (c) => currentState.bank[c] > 0
        ).length;
        const maxDistinct = Math.min(SPLENDOR_MAX_DISTINCT_GEMS, availableInBank);
        if (
          entries.length > SPLENDOR_MAX_DISTINCT_GEMS ||
          entries.some(([, amt]) => amt !== 1)
        ) {
          throw new Error("Can only take 1 each of up to 3 different gem colors");
        }
        if (
          entries.length < maxDistinct &&
          totalTokens(player.tokens) + entries.length < SPLENDOR_HAND_TOKEN_LIMIT
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
        delta = Object.fromEntries(entries) as Partial<Record<TokenColor, number>>;
        summary = entries.map(([c]) => c).join(", ");
      }

      const afterTake = withUpdatedActivePlayer(
        currentState,
        { ...player, tokens: addTokenMaps(player.tokens, delta) },
        { bank: subtractTokenMaps(currentState.bank, delta) }
      );
      const logged = appendSplendorEvent(
        afterTake,
        [],
        "GEMS_TAKEN",
        `${player.name} took ${summary}.`,
        playerId
      );
      return resolvePostMainAction(logged.state, logged.events);
    }

    case "RESERVE_CARD": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot reserve card now");
      }
      if (player.reservedCards.length >= SPLENDOR_MAX_RESERVED_CARDS) {
        throw new Error("Cannot hold more than 3 reserved cards");
      }
      if (action.cardId && action.deckTier) {
        throw new Error("Cannot specify both cardId and deckTier when reserving");
      }

      const drawSelection = (): {
        card: SplendorCard;
        market: Record<CardTier, SplendorCard[]>;
        decks: Record<CardTier, SplendorCard[]>;
        fromDeck: boolean;
      } => {
        if (action.cardId) {
          const loc = findMarketCardLocation(currentState.market, action.cardId);
          if (!loc) throw new Error("Target card to reserve not found");
          return {
            ...takeMarketCardAndRefill(
              currentState.market,
              currentState.decks,
              loc.tier,
              loc.index
            ),
            fromDeck: false,
          };
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
            fromDeck: true,
          };
        }
        throw new Error("Target card to reserve not found");
      };

      const { card: rawReservedCard, market, decks, fromDeck } = drawSelection();
      const reservedCard: SplendorCard = fromDeck
        ? { ...rawReservedCard, reservedFromDeck: true }
        : rawReservedCard;
      const gotGold = currentState.bank.gold > 0;
      const goldDelta = gotGold ? { gold: 1 } : {};
      const afterReserve = withUpdatedActivePlayer(
        currentState,
        {
          ...player,
          reservedCards: [...player.reservedCards, reservedCard],
          tokens: addTokenMaps(player.tokens, goldDelta),
        },
        { market, decks, bank: subtractTokenMaps(currentState.bank, goldDelta) }
      );
      const reserveDesc = fromDeck
        ? `blind-reserved from the Tier ${reservedCard.tier} deck`
        : `reserved a Tier ${reservedCard.tier} ${reservedCard.bonus} card (${reservedCard.points} VP)`;
      const logged = appendSplendorEvent(
        afterReserve,
        [],
        "CARD_RESERVED",
        `${player.name} ${reserveDesc}${gotGold ? " and took 1 Gold joker" : ""}.`,
        playerId
      );
      return resolvePostMainAction(logged.state, logged.events);
    }

    case "PURCHASE_CARD": {
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot purchase card now");
      }

      const marketLoc = findMarketCardLocation(currentState.market, action.cardId);
      const reservedIdx = marketLoc
        ? -1
        : player.reservedCards.findIndex((c) => c.id === action.cardId);
      const targetCard = marketLoc
        ? currentState.market[marketLoc.tier][marketLoc.index]!
        : reservedIdx !== -1
          ? player.reservedCards[reservedIdx]!
          : null;
      if (!targetCard || targetCard.redacted) {
        throw new Error(
          `Card ${action.cardId} not found in market or reserved hand`
        );
      }

      const { affordable, payment } = computeCardPurchasePayment(
        player,
        targetCard
      );
      if (!affordable) throw new Error("Cannot afford this card");

      const marketUpdate = marketLoc
        ? takeMarketCardAndRefill(
            currentState.market,
            currentState.decks,
            marketLoc.tier,
            marketLoc.index
          )
        : { market: currentState.market, decks: currentState.decks };

      const afterPurchase = withUpdatedActivePlayer(
        currentState,
        {
          ...player,
          tokens: subtractTokenMaps(player.tokens, payment),
          reservedCards: marketLoc
            ? player.reservedCards
            : player.reservedCards.filter((_, idx) => idx !== reservedIdx),
          purchasedCards: [...player.purchasedCards, targetCard],
          bonuses: incrementGemBonus(player.bonuses, targetCard.bonus),
          points: player.points + targetCard.points,
        },
        {
          bank: addTokenMaps(currentState.bank, payment),
          market: marketUpdate.market,
          decks: marketUpdate.decks,
        }
      );

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
      validateTokenCounts(
        action.tokens,
        ALL_TOKEN_COLORS,
        "Invalid token return payload",
        "Invalid token color",
        "Invalid return amount for"
      );
      const excess = totalTokens(player.tokens) - SPLENDOR_HAND_TOKEN_LIMIT;
      for (const color of ALL_TOKEN_COLORS) {
        const amt = action.tokens[color] ?? 0;
        if (player.tokens[color] < amt) {
          throw new Error(`Invalid return amount for ${color}`);
        }
      }
      const returnSum = totalTokens(action.tokens);
      if (returnSum <= 0 || returnSum > excess) {
        throw new Error(`Must return between 1 and ${excess} tokens`);
      }

      const updatedPlayer: SplendorPlayerState = {
        ...player,
        tokens: subtractTokenMaps(player.tokens, action.tokens),
      };
      const afterReturn = withUpdatedActivePlayer(currentState, updatedPlayer, {
        bank: addTokenMaps(currentState.bank, action.tokens),
      });
      const logged = appendSplendorEvent(
        afterReturn,
        [],
        "TOKENS_RETURNED",
        `${player.name} returned ${returnSum} excess token(s).`,
        playerId
      );
      if (totalTokens(updatedPlayer.tokens) > SPLENDOR_HAND_TOKEN_LIMIT) {
        return { state: logged.state, events: [...logged.events] };
      }
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
      const afterNoble = withUpdatedActivePlayer(
        currentState,
        {
          ...player,
          nobles: [...player.nobles, noble],
          points: player.points + noble.points,
        },
        {
          nobles: currentState.nobles.filter((n) => n.id !== action.nobleId),
          eligibleNobleIds: [],
        }
      );
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
      if (currentState.phase !== "MAIN_ACTION") {
        throw new Error("Cannot pass turn in current phase");
      }
      const legal = getSplendorLegalActions(currentState, playerId);
      if (!legal.every((a) => a.type === "PASS_TURN")) {
        throw new Error("Cannot pass turn while legal actions are available");
      }
      const logged = appendSplendorEvent(
        currentState,
        [],
        "TURN_PASSED",
        `${player.name} passed.`,
        playerId
      );
      return resolveNoblesAndAdvanceTurn(logged.state, logged.events);
    }

    default:
      throw new Error(
        `Unknown Splendor action type: ${String((action as { type?: unknown }).type)}`
      );
  }
}
