import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import type { SevenWondersAction, SevenWondersState } from "../types.ts";
import { computeAffordablePaymentsPure } from "./commerce.ts";
import {
  canPlayerBuildViaChain,
  canPlayerUseOlympiaFreeBuild,
  hasDuplicateCardName,
} from "./helpers.ts";

export function getSevenWondersActingPlayerId(
  state: SevenWondersState
): string | null {
  if (state.phase === "GAME_OVER") return null;
  if (state.phase === "HALIKARNASSUS_PICK") {
    return state.halikarnassusQueue[0] ?? null;
  }
  if (state.phase === "SEVENTH_CARD_PLAY") {
    return state.seventhCardQueue[0] ?? null;
  }

  // In AGE_DRAFT, prioritize human seats that haven't locked in yet so humans act smoothly,
  // otherwise follow seat order starting from startingPlayerIndex.
  const n = state.players.length;
  for (let offset = 0; offset < n; offset++) {
    const p = state.players[(state.startingPlayerIndex + offset) % n]!;
    if (
      !p.isBot &&
      !state.lockedPlayerIds.includes(p.id) &&
      !state.pendingChoices[p.id]
    ) {
      return p.id;
    }
  }
  for (let offset = 0; offset < n; offset++) {
    const p = state.players[(state.startingPlayerIndex + offset) % n]!;
    if (!state.lockedPlayerIds.includes(p.id) && !state.pendingChoices[p.id]) {
      return p.id;
    }
  }
  return null;
}

export function canPlayerUnselectDraftPick(
  state: SevenWondersState,
  playerId: string
): boolean {
  return (
    state.phase === "AGE_DRAFT" &&
    state.lockedPlayerIds.includes(playerId) &&
    state.players.some((p) => p.id === playerId)
  );
}

export function getSevenWondersLegalActions(
  state: SevenWondersState,
  playerId: string
): SevenWondersAction[] {
  if (state.phase === "GAME_OVER") return [];

  const pIdx = state.players.findIndex((p) => p.id === playerId);
  if (pIdx < 0) return [];
  const player = state.players[pIdx]!;

  if (state.phase === "HALIKARNASSUS_PICK") {
    if (state.halikarnassusQueue[0] !== playerId) return [];
    const buildableCards = state.discardPile.filter(
      (c) => !hasDuplicateCardName(player, c.name)
    );
    const seenIds = new Set<string>();
    const actions: SevenWondersAction[] = [];
    for (const card of buildableCards) {
      if (!seenIds.has(card.id)) {
        seenIds.add(card.id);
        actions.push({ type: "BUILD_FROM_DISCARD", cardId: card.id });
      }
    }
    actions.push({ type: "SKIP_DISCARD_BUILD" });
    return actions;
  }

  if (state.phase === "SEVENTH_CARD_PLAY") {
    if (state.seventhCardQueue[0] !== playerId) return [];
  } else if (state.phase === "AGE_DRAFT") {
    if (state.lockedPlayerIds.includes(playerId) || state.pendingChoices[playerId]) {
      return [];
    }
  }

  if (player.hand.length === 0) return [];

  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  const nextWonderStage =
    player.builtWonderStages < board.stages.length
      ? board.stages[player.builtWonderStages]!
      : null;
  const wonderPayments = nextWonderStage
    ? computeAffordablePaymentsPure(
        state.players,
        pIdx,
        nextWonderStage.resourceCost,
        0
      )
    : [];
  const canFreeBuild = canPlayerUseOlympiaFreeBuild(player, state.age);

  const actions: SevenWondersAction[] = [];

  for (const card of player.hand) {
    // 1. Build structure (if not duplicate name)
    if (!hasDuplicateCardName(player, card.name)) {
      if (canPlayerBuildViaChain(player, card)) {
        actions.push({
          type: "SELECT_DRAFT_ACTION",
          kind: "build",
          cardId: card.id,
          payment: { leftCoins: 0, rightCoins: 0 },
        });
      } else {
        const payments = computeAffordablePaymentsPure(
          state.players,
          pIdx,
          card.resourceCost,
          card.coinCost
        );
        for (const pay of payments) {
          actions.push({
            type: "SELECT_DRAFT_ACTION",
            kind: "build",
            cardId: card.id,
            payment: pay,
          });
        }
        if (
          canFreeBuild &&
          (payments.length === 0 ||
            card.coinCost > 0 ||
            payments[0]!.leftCoins + payments[0]!.rightCoins > 0)
        ) {
          actions.push({
            type: "SELECT_DRAFT_ACTION",
            kind: "build",
            cardId: card.id,
            payment: { leftCoins: 0, rightCoins: 0 },
            useFreeBuild: true,
          });
        }
      }
    }

    // 2. Build next Wonder stage
    if (nextWonderStage && wonderPayments.length > 0) {
      for (const pay of wonderPayments) {
        actions.push({
          type: "SELECT_DRAFT_ACTION",
          kind: "wonder",
          cardId: card.id,
          payment: pay,
        });
      }
    }

    // 3. Discard for +3 coins (always legal!)
    actions.push({
      type: "SELECT_DRAFT_ACTION",
      kind: "discard",
      cardId: card.id,
      payment: { leftCoins: 0, rightCoins: 0 },
    });
  }

  return actions;
}
