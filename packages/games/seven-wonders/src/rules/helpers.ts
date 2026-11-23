import type { GameEvent } from "@gaming-platform/core";
import { SEVEN_WONDERS_HAND_SIZE } from "../config/game-config.ts";
import { getWonderBoardDefinition } from "../config/wonders-config.ts";
import {
  RAW_RESOURCES,
  type SevenWondersAge,
  type SevenWondersCard,
  type SevenWondersPlayerState,
  type WonderResource,
  type WonderResourceMap,
} from "../types.ts";

export function emptyWonderResourceMap(): WonderResourceMap {
  return {
    wood: 0,
    stone: 0,
    ore: 0,
    clay: 0,
    glass: 0,
    loom: 0,
    papyrus: 0,
  };
}

export function isRawResource(res: WonderResource): boolean {
  return (RAW_RESOURCES as readonly string[]).includes(res);
}

export function getLeftNeighborIndex(playerIndex: number, count: number): number {
  return (playerIndex - 1 + count) % count;
}

export function getRightNeighborIndex(playerIndex: number, count: number): number {
  return (playerIndex + 1) % count;
}

export function hasWonderStageEffect(
  player: Pick<SevenWondersPlayerState, "wonderId" | "wonderSide" | "builtWonderStages">,
  effectKind: string
): boolean {
  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  return board.stages
    .slice(0, player.builtWonderStages)
    .some((st) => st.effects.some((ef) => ef.kind === effectKind));
}

export function canPlayerBuildViaChain(
  player: Pick<SevenWondersPlayerState, "tableau">,
  card: SevenWondersCard
): boolean {
  if (card.freeFromChains.length === 0) return false;
  const ownedNames = new Set(player.tableau.map((c) => c.name));
  return card.freeFromChains.some((prereq) => ownedNames.has(prereq));
}

export function hasDuplicateCardName(
  player: Pick<SevenWondersPlayerState, "tableau">,
  cardName: string
): boolean {
  return player.tableau.some((c) => c.name === cardName);
}

export function canPlayerUseOlympiaFreeBuild(
  player: Pick<
    SevenWondersPlayerState,
    "wonderId" | "wonderSide" | "builtWonderStages" | "usedFreeBuildInAge"
  >,
  age: SevenWondersAge
): boolean {
  return (
    hasWonderStageEffect(player, "free_build_per_age") &&
    !player.usedFreeBuildInAge[age]
  );
}

export function getPlayerShields(player: SevenWondersPlayerState): number {
  let shields = 0;
  for (const card of player.tableau) {
    for (const ef of card.effects) {
      if (ef.kind === "shields") shields += ef.shields;
    }
  }
  const board = getWonderBoardDefinition(player.wonderId, player.wonderSide);
  for (const st of board.stages.slice(0, player.builtWonderStages)) {
    for (const ef of st.effects) {
      if (ef.kind === "shields") shields += ef.shields;
    }
  }
  return shields;
}

export function dealHandsToPlayers(
  players: readonly SevenWondersPlayerState[],
  deck: readonly SevenWondersCard[]
): SevenWondersPlayerState[] {
  return players.map((p, idx) => {
    const dealtHand = deck.slice(
      idx * SEVEN_WONDERS_HAND_SIZE,
      (idx + 1) * SEVEN_WONDERS_HAND_SIZE
    );
    return {
      ...p,
      hand: dealtHand,
      seenHandsThisAge: [dealtHand],
    };
  });
}

export function appendSwEvent(
  eventLog: readonly GameEvent[],
  batch: readonly GameEvent[],
  turn: number,
  type: string,
  message: string,
  playerId?: string
): { readonly eventLog: GameEvent[]; readonly batch: GameEvent[] } {
  const evt: GameEvent = {
    id: `evt-${eventLog.length}`,
    timestamp: eventLog.length,
    turn,
    playerId,
    type,
    message,
  };
  return {
    eventLog: [...eventLog, evt],
    batch: [...batch, evt],
  };
}
