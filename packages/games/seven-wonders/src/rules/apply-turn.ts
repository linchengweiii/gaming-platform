import type { GameEvent } from "@gaming-platform/core";
import { SEVEN_WONDERS_DISCARD_COINS } from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import type {
  SevenWondersAction,
  SevenWondersAge,
  SevenWondersCard,
  SevenWondersPlayerState,
  SevenWondersState,
} from "../types.ts";
import { advancePostTurnQueuesOrNextRound } from "./age-transition.ts";
import {
  appendSwEvent,
  canPlayerBuildViaChain,
  getLeftNeighborIndex,
  getRightNeighborIndex,
} from "./helpers.ts";
import {
  canPlayerUnselectDraftPick,
  getSevenWondersLegalActions,
} from "./legal-actions.ts";
import {
  evaluateImmediateCardCoins,
  refreshAllPlayerScores,
} from "./scoring.ts";

function applySingleChoiceEffectsToTables(
  players: readonly SevenWondersPlayerState[],
  choicesByPlayerId: Readonly<
    Record<string, NonNullable<SevenWondersState["pendingChoices"][string]>>
  >,
  age: SevenWondersAge,
  discardPile: readonly SevenWondersCard[],
  turn: number,
  initialEventLog: readonly GameEvent[],
  initialBatch: readonly GameEvent[]
): {
  readonly players: SevenWondersPlayerState[];
  readonly discardPile: SevenWondersCard[];
  readonly halikarnassusTriggered: string[];
  readonly eventLog: GameEvent[];
  readonly batch: GameEvent[];
} {
  const n = players.length;
  let eventLog = [...initialEventLog];
  let batch = [...initialBatch];
  let nextDiscard = [...discardPile];
  const halikarnassusTriggered: string[] = [];

  // Step 1: Deduct card coin costs + neighbor trade payments, credit neighbors, and place cards/stages
  const coinDeltas = players.map(() => 0);
  const builtCardThisStep: (SevenWondersCard | null)[] = players.map(() => null);
  const builtWonderStageThisStep: (number | null)[] = players.map(() => null);

  const afterPlacement = players.map((p, idx) => {
    const ch = choicesByPlayerId[p.id];
    if (!ch) return p;

    const card = p.hand.find((c) => c.id === ch.cardId)!;
    const remainingHand = p.hand.filter((c) => c.id !== ch.cardId);
    const leftIdx = getLeftNeighborIndex(idx, n);
    const rightIdx = getRightNeighborIndex(idx, n);

    if (ch.payment.leftCoins > 0) {
      coinDeltas[idx]! -= ch.payment.leftCoins;
      coinDeltas[leftIdx]! += ch.payment.leftCoins;
    }
    if (ch.payment.rightCoins > 0) {
      coinDeltas[idx]! -= ch.payment.rightCoins;
      coinDeltas[rightIdx]! += ch.payment.rightCoins;
    }

    if (ch.kind === "build") {
      const viaChain = canPlayerBuildViaChain(p, card);
      if (!viaChain && !ch.useFreeBuild && card.coinCost > 0) {
        coinDeltas[idx]! -= card.coinCost;
      }
      builtCardThisStep[idx] = card;
      return {
        ...p,
        hand: remainingHand,
        tableau: [...p.tableau, card],
        usedFreeBuildInAge: ch.useFreeBuild
          ? { ...p.usedFreeBuildInAge, [age]: true }
          : p.usedFreeBuildInAge,
      };
    }

    if (ch.kind === "wonder") {
      const nextStageCount = p.builtWonderStages + 1;
      builtWonderStageThisStep[idx] = nextStageCount;
      return {
        ...p,
        hand: remainingHand,
        builtWonderStages: nextStageCount,
        tuckedWonderCardIds: [...p.tuckedWonderCardIds, card.id],
      };
    }

    // ch.kind === "discard"
    coinDeltas[idx]! += SEVEN_WONDERS_DISCARD_COINS;
    nextDiscard = [...nextDiscard, card];
    return {
      ...p,
      hand: remainingHand,
    };
  });

  // Step 2: Evaluate immediate coin grants from newly built cards & Wonder stages AFTER all structures entered play
  afterPlacement.forEach((p, idx) => {
    const builtCard = builtCardThisStep[idx];
    if (builtCard) {
      const gained = evaluateImmediateCardCoins(afterPlacement, idx, builtCard);
      coinDeltas[idx]! += gained;
      const ch = choicesByPlayerId[p.id]!;
      const tradePaid = ch.payment.leftCoins + ch.payment.rightCoins;
      const suffix = ch.useFreeBuild
        ? " (Olympia free build)"
        : canPlayerBuildViaChain(players[idx]!, builtCard)
          ? " (free chain)"
          : tradePaid > 0
            ? ` (${tradePaid}c neighbor trade)`
            : "";
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "BUILD_STRUCTURE",
        `${p.name} built ${builtCard.name}${suffix}.`,
        p.id
      ));
    }

    const stageNum = builtWonderStageThisStep[idx];
    if (stageNum !== null) {
      const board = getWonderBoardDefinition(p.wonderId, p.wonderSide);
      const stDef = board.stages[stageNum - 1]!;
      for (const ef of stDef.effects) {
        if (ef.kind === "coins") {
          coinDeltas[idx]! += ef.coins;
        }
        if (ef.kind === "build_from_discard") {
          halikarnassusTriggered.push(p.id);
        }
      }
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "BUILD_WONDER_STAGE",
        `${p.name} completed ${board.name} Stage ${stageNum} (${stDef.summary}).`,
        p.id
      ));
    }

    const ch = choicesByPlayerId[p.id];
    if (ch?.kind === "discard") {
      ({ eventLog, batch } = appendSwEvent(
        eventLog,
        batch,
        turn,
        "DISCARD_FOR_COINS",
        `${p.name} sold a card for +${SEVEN_WONDERS_DISCARD_COINS} coins.`,
        p.id
      ));
    }
  });

  const withCoins = afterPlacement.map((p, idx) => ({
    ...p,
    coins: p.coins + coinDeltas[idx]!,
  }));

  return {
    players: refreshAllPlayerScores(withCoins),
    discardPile: nextDiscard,
    halikarnassusTriggered,
    eventLog,
    batch,
  };
}

export function applySevenWondersAction(
  state: SevenWondersState,
  playerId: string,
  action: SevenWondersAction
): { state: SevenWondersState; events: GameEvent[] } {
  if (state.phase === "GAME_OVER") {
    throw new Error("Game is already over");
  }

  if (action.type === "UNSELECT_DRAFT_ACTION") {
    if (!canPlayerUnselectDraftPick(state, playerId)) {
      throw new Error(
        `Player ${playerId} does not have an unrevealed draft pick to unlock`
      );
    }
    const { [playerId]: _removed, ...nextPending } = state.pendingChoices;
    return {
      state: {
        ...state,
        pendingChoices: nextPending,
        lockedPlayerIds: state.lockedPlayerIds.filter((pid) => pid !== playerId),
      },
      events: [],
    };
  }

  const legal = getSevenWondersLegalActions(state, playerId);
  const matched = legal.find((cand) => {
    if (cand.type !== action.type) return false;
    if (cand.type === "SKIP_DISCARD_BUILD" && action.type === "SKIP_DISCARD_BUILD") {
      return true;
    }
    if (cand.type === "BUILD_FROM_DISCARD" && action.type === "BUILD_FROM_DISCARD") {
      return cand.cardId === action.cardId;
    }
    if (cand.type === "SELECT_DRAFT_ACTION" && action.type === "SELECT_DRAFT_ACTION") {
      const aPay = action.payment ?? { leftCoins: 0, rightCoins: 0 };
      const cPay = cand.payment ?? { leftCoins: 0, rightCoins: 0 };
      return (
        cand.kind === action.kind &&
        cand.cardId === action.cardId &&
        cPay.leftCoins === aPay.leftCoins &&
        cPay.rightCoins === aPay.rightCoins &&
        Boolean(cand.useFreeBuild) === Boolean(action.useFreeBuild)
      );
    }
    return false;
  });

  if (!matched) {
    throw new Error(
      `Illegal 7 Wonders action ${JSON.stringify(action)} for player ${playerId} in phase ${state.phase}`
    );
  }

  if (state.phase === "HALIKARNASSUS_PICK") {
    const pIdx = state.players.findIndex((p) => p.id === playerId);
    const player = state.players[pIdx]!;
    const remainingQueue = state.halikarnassusQueue.slice(1);

    if (action.type === "SKIP_DISCARD_BUILD") {
      const { eventLog, batch } = appendSwEvent(
        state.eventLog,
        [],
        state.turn,
        "HALIKARNASSUS_SKIP",
        `${player.name} skipped building from the discard pile.`,
        playerId
      );
      return advancePostTurnQueuesOrNextRound(
        {
          ...state,
          halikarnassusQueue: remainingQueue,
          eventLog,
        },
        batch
      );
    }

    if (action.type === "BUILD_FROM_DISCARD") {
      const cardIdx = state.discardPile.findIndex((c) => c.id === action.cardId);
      const card = state.discardPile[cardIdx]!;
      const nextDiscard = state.discardPile.filter((_, idx) => idx !== cardIdx);
      const updatedPlayersPrelim = state.players.map((p, idx) =>
        idx === pIdx ? { ...p, tableau: [...p.tableau, card] } : p
      );
      const gainedCoins = evaluateImmediateCardCoins(
        updatedPlayersPrelim,
        pIdx,
        card
      );
      const updatedPlayers = refreshAllPlayerScores(
        updatedPlayersPrelim.map((p, idx) =>
          idx === pIdx ? { ...p, coins: p.coins + gainedCoins } : p
        )
      );
      const { eventLog, batch } = appendSwEvent(
        state.eventLog,
        [],
        state.turn,
        "HALIKARNASSUS_BUILD",
        `${player.name} rescued ${card.name} from the discard pile for free!`,
        playerId
      );

      return advancePostTurnQueuesOrNextRound(
        {
          ...state,
          players: updatedPlayers,
          discardPile: nextDiscard,
          halikarnassusQueue: remainingQueue,
          eventLog,
        },
        batch
      );
    }
  }

  if (action.type !== "SELECT_DRAFT_ACTION") {
    throw new Error(`Expected SELECT_DRAFT_ACTION during ${state.phase}`);
  }

  const choice = {
    kind: action.kind,
    cardId: action.cardId,
    payment: action.payment ?? { leftCoins: 0, rightCoins: 0 },
    useFreeBuild: action.useFreeBuild,
  };

  if (state.phase === "SEVENTH_CARD_PLAY") {
    const applied = applySingleChoiceEffectsToTables(
      state.players,
      { [playerId]: choice },
      state.age,
      state.discardPile,
      state.turn,
      state.eventLog,
      []
    );
    return advancePostTurnQueuesOrNextRound(
      {
        ...state,
        players: applied.players,
        discardPile: applied.discardPile,
        seventhCardQueue: state.seventhCardQueue.slice(1),
        halikarnassusQueue: [
          ...state.halikarnassusQueue,
          ...applied.halikarnassusTriggered,
        ],
        eventLog: applied.eventLog,
      },
      applied.batch
    );
  }

  // state.phase === "AGE_DRAFT"
  const nextPending = {
    ...state.pendingChoices,
    [playerId]: choice,
  };
  const nextLocked = state.lockedPlayerIds.includes(playerId)
    ? state.lockedPlayerIds
    : [...state.lockedPlayerIds, playerId];

  // Wait until all players have locked in their simultaneous draft pick
  if (Object.keys(nextPending).length < state.players.length) {
    return {
      state: {
        ...state,
        pendingChoices: nextPending,
        lockedPlayerIds: nextLocked,
      },
      events: [],
    };
  }

  // All players have chosen — resolve simultaneous reveal!
  const resolved = applySingleChoiceEffectsToTables(
    state.players,
    nextPending,
    state.age,
    state.discardPile,
    state.turn,
    state.eventLog,
    []
  );

  return advancePostTurnQueuesOrNextRound(
    {
      ...state,
      players: resolved.players,
      discardPile: resolved.discardPile,
      pendingChoices: {},
      lockedPlayerIds: [],
      halikarnassusQueue: [
        ...state.halikarnassusQueue,
        ...resolved.halikarnassusTriggered,
      ],
      eventLog: resolved.eventLog,
    },
    resolved.batch
  );
}
