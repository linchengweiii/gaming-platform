import type { CatanAction, CatanState } from "@gaming-platform/catan";
import { CatanEngine } from "@gaming-platform/catan";
import type { SplendorAction, SplendorState } from "@gaming-platform/splendor";
import { GEM_COLORS, SplendorEngine } from "@gaming-platform/splendor";
import type {
  AzulAction,
  AzulDraftSource,
  AzulState,
  AzulTileColor,
} from "@gaming-platform/azul";
import { AzulEngine } from "@gaming-platform/azul";
import type {
  SevenWondersAction,
  SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { SevenWondersEngine } from "@gaming-platform/seven-wonders";
import { TUTORIAL_LESSONS } from "../config/tutorials-config.ts";
import type { TutorialGameId } from "./types.ts";

export function computeSuggestedTutorialStepIndexPure(
  gameId: TutorialGameId,
  currentIndex: number,
  state: any,
  humanPlayerId: string
): number {
  const lessons = TUTORIAL_LESSONS[gameId];
  const maxIdx = lessons.length - 1;
  if (!state || currentIndex >= maxIdx) return Math.min(currentIndex, maxIdx);

  if (gameId === "catan") {
    const cState = state as CatanState;
    if (cState.phase === "SETUP_SETTLEMENT_1" && currentIndex < 0) return 0;
    if (cState.phase === "SETUP_ROAD_1" && currentIndex === 0) return 1;
    if (
      (cState.phase === "SETUP_SETTLEMENT_2" ||
        cState.phase === "SETUP_ROAD_2") &&
      currentIndex <= 1
    ) {
      return 2;
    }
    if (cState.phase === "PRE_ROLL" && currentIndex <= 2) return 3;
    if (cState.phase === "MAIN_PHASE" && currentIndex === 3) return 4;
    const myRoutes = Object.values(cState.edges).filter(
      (e) => e.ownerId === humanPlayerId
    ).length;
    const myBuildings = Object.values(cState.buildings).filter(
      (b) => b.ownerId === humanPlayerId
    ).length;
    if ((cState.turn >= 2 || myRoutes + myBuildings >= 5) && currentIndex === 4) {
      return 5;
    }
    return currentIndex;
  }

  if (gameId === "splendor") {
    const sState = state as SplendorState;
    const me = sState.players.find((p) => p.id === humanPlayerId);
    if (!me) return currentIndex;
    if (
      currentIndex === 3 &&
      (me.points >= 3 ||
        me.purchasedCards.length >= 3 ||
        sState.finalRoundTriggered ||
        sState.phase === "GAME_OVER")
    ) {
      return 4;
    }
    if (currentIndex === 2 && me.purchasedCards.length >= 1) return 3;
    if (
      currentIndex === 1 &&
      (me.reservedCards.length >= 1 || sState.round >= 3)
    ) {
      return 2;
    }
    if (currentIndex === 0 && sState.round >= 2) return 1;
    return currentIndex;
  }

  if (gameId === "azul") {
    const aState = state as AzulState;
    const me = aState.players.find((p) => p.id === humanPlayerId);
    if (!me) return currentIndex;
    const activeId = aState.players[aState.activePlayerIndex]?.id;
    const myDraftedTiles =
      me.patternLines.reduce((s, l) => s + l.count, 0) + me.floorLine.length;
    const anyRowNearDone = aState.players.some((p) =>
      p.wall.some((row) => row.filter((c) => c !== null).length >= 3)
    );
    if (
      aState.phase === "GAME_OVER" ||
      ((aState.round >= 3 || anyRowNearDone) && currentIndex >= 3)
    ) {
      return 4;
    }
    if (aState.round >= 2 && currentIndex < 3) return 3;
    if (
      currentIndex === 1 &&
      activeId === humanPlayerId &&
      aState.centerPool.length > 0 &&
      (aState.centerHasFirstPlayerMarker || aState.turn >= 9)
    ) {
      return 2;
    }
    if (
      currentIndex === 0 &&
      myDraftedTiles > 0 &&
      (activeId === humanPlayerId || aState.turn >= 5)
    ) {
      return 1;
    }
    return currentIndex;
  }

  // seven_wonders
  const swState = state as SevenWondersState;
  const me = swState.players.find((p) => p.id === humanPlayerId);
  if (!me) return currentIndex;
  if (
    (swState.age >= 2 ||
      (swState.draftRound >= 4 && me.builtWonderStages >= 1)) &&
    currentIndex < 4
  ) {
    return 4;
  }
  if (currentIndex === 3 && me.builtWonderStages >= 1) return 4;
  if (swState.draftRound >= 4 && currentIndex < 3) return 3;
  if (swState.draftRound >= 3 && currentIndex < 2) return 2;
  if (swState.draftRound >= 2 && currentIndex === 0) return 1;
  return currentIndex;
}

export function chooseRecommendedTutorialActionPure(
  gameId: TutorialGameId,
  state: any,
  actingPlayerId: string,
  stepIndex = 0,
  azulSelectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null = null
): CatanAction | SplendorAction | AzulAction | SevenWondersAction | null {
  if (gameId === "catan") {
    const cState = state as CatanState;
    if (cState.phase === "MAIN_PHASE" && stepIndex === 4) {
      const legal = CatanEngine.getLegalActions(cState, actingPlayerId);
      const settle = legal.find((a) => a.type === "BUILD_SETTLEMENT");
      if (settle) return settle;
      const road = legal.find((a) => a.type === "BUILD_ROAD");
      if (road) return road;
      const maritime = legal.find((a) => a.type === "MARITIME_TRADE");
      if (maritime) return maritime;
    }
    return CatanEngine.chooseBotAction(cState, actingPlayerId);
  }

  if (gameId === "splendor") {
    const sState = state as SplendorState;
    const legal = SplendorEngine.getLegalActions(sState, actingPlayerId);
    if (stepIndex === 0 || sState.round === 1) {
      const threeGems = legal.find(
        (a) =>
          a.type === "TAKE_GEMS" &&
          GEM_COLORS.filter((c) => (a.gems[c] ?? 0) > 0).length === 3
      );
      if (threeGems) return threeGems;
    }
    if (stepIndex === 1) {
      const marketReserves = legal.filter(
        (a): a is Extract<SplendorAction, { type: "RESERVE_CARD" }> =>
          a.type === "RESERVE_CARD" && Boolean(a.cardId)
      );
      if (marketReserves.length > 0) {
        const allMarket = [
          ...sState.market[3],
          ...sState.market[2],
          ...sState.market[1],
        ];
        const sorted = [...marketReserves].sort((a, b) => {
          const ca = allMarket.find((c) => c.id === a.cardId);
          const cb = allMarket.find((c) => c.id === b.cardId);
          const sa = (ca ? (ca.tier === 2 ? 30 : ca.tier === 3 ? 20 : 5) + ca.points * 4 : 0);
          const sb = (cb ? (cb.tier === 2 ? 30 : cb.tier === 3 ? 20 : 5) + cb.points * 4 : 0);
          return sb - sa;
        });
        return sorted[0]!;
      }
    }
    if (stepIndex === 2) {
      const buyAct = legal.find((a) => a.type === "PURCHASE_CARD");
      if (buyAct) return buyAct;
    }
    return SplendorEngine.chooseBotAction(sState, actingPlayerId);
  }

  if (gameId === "azul") {
    const aState = state as AzulState;
    if (azulSelectedDraft) {
      const legal = AzulEngine.getLegalActions(aState, actingPlayerId).filter(
        (a) =>
          a.color === azulSelectedDraft.color &&
          a.source.kind === azulSelectedDraft.source.kind &&
          (a.source.kind === "center" ||
            (azulSelectedDraft.source.kind === "factory" &&
              a.source.factoryIndex === azulSelectedDraft.source.factoryIndex))
      );
      const me = aState.players.find((p) => p.id === actingPlayerId);
      const srcTiles =
        azulSelectedDraft.source.kind === "factory"
          ? aState.factories[azulSelectedDraft.source.factoryIndex] ?? []
          : aState.centerPool;
      const pickedCount = srcTiles.filter(
        (c) => c === azulSelectedDraft.color
      ).length;
      if (me && legal.length > 0) {
        const ranked = [...legal].sort((a, b) => {
          const scoreLine = (act: AzulAction): number => {
            if (act.targetLine === "floor") return -pickedCount * 6 - 10;
            const line = me.patternLines[act.targetLine]!;
            const space = line.capacity - line.count;
            const placed = Math.min(space, pickedCount);
            const overflow = Math.max(0, pickedCount - space);
            const completes = line.count + placed === line.capacity;
            return (
              placed * 4 -
              overflow * 6 +
              (completes ? 6 : -(space - placed) * 1.5)
            );
          };
          return scoreLine(b) - scoreLine(a);
        });
        return ranked[0]!;
      }
      if (legal[0]) return legal[0];
    }
    return AzulEngine.chooseBotAction(aState, actingPlayerId);
  }

  const swState = state as SevenWondersState;
  const swLegal = SevenWondersEngine.getLegalActions(swState, actingPlayerId);
  const swPlayer = swState.players.find((p) => p.id === actingPlayerId);
  if (stepIndex === 0 && swPlayer) {
    const freeResBuild = swLegal.find(
      (a) =>
        a.type === "SELECT_DRAFT_ACTION" &&
        a.kind === "build" &&
        (a.payment?.leftCoins ?? 0) + (a.payment?.rightCoins ?? 0) === 0 &&
        ["brown", "gray"].includes(
          swPlayer.hand.find((c) => c.id === a.cardId)?.color ?? ""
        )
    );
    if (freeResBuild) return freeResBuild;
  }
  if (stepIndex === 3) {
    const wonderBuild = swLegal.find(
      (a) => a.type === "SELECT_DRAFT_ACTION" && a.kind === "wonder"
    );
    if (wonderBuild) return wonderBuild;
  }
  return SevenWondersEngine.chooseBotAction(swState, actingPlayerId);
}
