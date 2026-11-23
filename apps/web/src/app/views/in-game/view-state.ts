import { type CatanAction, CatanEngine } from "@gaming-platform/catan";
import {
  type SevenWondersAction,
  SevenWondersEngine,
  type SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { computeSuggestedTutorialStepIndexPure } from "../../../tutorials.ts";
import {
  canControlPlayerOnDevicePure,
  getActingPlayerIdPure,
  getEngineForGamePure,
  roomUsesServerPure,
} from "../../helpers/room-queries.ts";
import type { AppModel, ClientRoom, GuestSession } from "../../types.ts";
import { getRoomSetupSummaryDataPure } from "../room-header-and-summary.ts";
import {
  type BotMoveFeedSummary,
  extractBotMoveFeedPure,
} from "./bot-move-feed.ts";
import {
  computeCkBoardOptionsPure,
  computeInGameOverlayHtmlPure,
} from "./overlays-and-modals.ts";

export interface InGameComputedContext {
  readonly usesServer: boolean;
  readonly actingPlayerId: string | null;
  readonly isMyTurn: boolean;
  readonly controllableHumansCount: number;
  readonly effectiveViewerId: string | null;
  readonly state: any;
  readonly model: AppModel;
  readonly actingPlayer: any;
  readonly invariantCheck: { valid: boolean; violations: readonly string[] };
  readonly mySeatedPlayer: any;
  readonly handPlayer: any;
  readonly localDeviceGuestForTurn: GuestSession | undefined;
  readonly canCancelMyTrade: boolean;
  readonly summaryInfo: ReturnType<typeof getRoomSetupSummaryDataPure>;
  readonly isOwner: boolean;
  readonly undoableSteps: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly catanLegalActions: readonly CatanAction[];
  readonly boardActingPlayerId: string | null;
  readonly ckBoardOptions: Record<string, any>;
  readonly sevenWondersLegalActions: readonly SevenWondersAction[];
  readonly botMoveFeed: BotMoveFeedSummary;
  readonly catanDecisionPopupHtml: string;
  readonly tutorialCoachHtml: string;
  readonly guideModalHtml: string;
}

export function computeInGameViewStatePure(
  rawModel: Readonly<AppModel>,
  room: ClientRoom,
  rawState: any
): InGameComputedContext {
  const usesServer = roomUsesServerPure(rawModel, room);
  const engine = getEngineForGamePure(room.gameId);
  const baseActingPlayerId = usesServer
    ? room.remoteActingPlayerId ?? getActingPlayerIdPure(room.gameId, rawState)
    : getActingPlayerIdPure(room.gameId, rawState);
  const actingPlayerId = ((): string | null => {
    if (
      room.gameId === "seven_wonders" &&
      rawState.phase === "AGE_DRAFT" &&
      Array.isArray(rawState.lockedPlayerIds)
    ) {
      const meRaw = rawState.players.find(
        (p: any) =>
          p.id === rawModel.currentUserId &&
          !p.isBot &&
          !rawState.lockedPlayerIds.includes(p.id) &&
          canControlPlayerOnDevicePure(rawModel, room, p.id)
      );
      if (meRaw) return meRaw.id;
      const unlockedControllable = rawState.players.find(
        (p: any) =>
          !p.isBot &&
          !rawState.lockedPlayerIds.includes(p.id) &&
          canControlPlayerOnDevicePure(rawModel, room, p.id)
      );
      if (unlockedControllable) return unlockedControllable.id;
    }
    return baseActingPlayerId;
  })();
  const isMyTurn = canControlPlayerOnDevicePure(
    rawModel,
    room,
    actingPlayerId
  );
  const clearedTurnModel: AppModel = !isMyTurn
    ? {
        ...rawModel,
        buildMode: null,
        mapBuildMenuExpanded: false,
        selectedMoveFromEdgeId: null,
        selectedMoveKnightFromVertexId: null,
        selectedChaseKnightVertexId: null,
        sevenWondersSelectedCardId: null,
      }
    : rawModel;

  const controllableHumans = rawState.players.filter(
    (p: any) =>
      !p.isBot && canControlPlayerOnDevicePure(clearedTurnModel, room, p.id)
  );
  const controllableHumansCount = controllableHumans.length;
  const rawActingPlayer =
    rawState.players.find((p: any) => p.id === actingPlayerId) ?? null;

  const effectiveViewerId = ((): string | null => {
    if (rawState.phase === "GAME_OVER") return null;
    if (
      controllableHumansCount >= 2 &&
      clearedTurnModel.hidePassAndPlayHand
    ) {
      return null;
    }
    if (isMyTurn && rawActingPlayer && !rawActingPlayer.isBot) {
      return rawActingPlayer.id;
    }
    if (controllableHumansCount === 1) {
      return controllableHumans[0]!.id;
    }
    if (controllableHumansCount >= 2) {
      const offerFromId = rawState.activeTradeOffer?.fromPlayerId;
      if (
        offerFromId &&
        controllableHumans.some((p: any) => p.id === offerFromId)
      ) {
        return offerFromId;
      }
      const primarySeat = controllableHumans.find(
        (p: any) => p.id === clearedTurnModel.currentUserId
      );
      return primarySeat ? primarySeat.id : controllableHumans[0]!.id;
    }
    return null;
  })();

  const state: any = engine.getPlayerView(rawState, effectiveViewerId);

  const model: AppModel = (() => {
    const tut = clearedTurnModel.activeTutorial;
    if (!tut || tut.roomId !== room.roomId) return clearedTurnModel;
    const prevMaxAuto = tut.maxAutoStepIndex ?? tut.stepIndex;
    const nextStep = computeSuggestedTutorialStepIndexPure(
      room.gameId,
      prevMaxAuto,
      state,
      effectiveViewerId ?? clearedTurnModel.currentUserId
    );
    if (nextStep <= prevMaxAuto) return clearedTurnModel;
    return {
      ...clearedTurnModel,
      activeTutorial: {
        ...tut,
        stepIndex: nextStep,
        maxAutoStepIndex: nextStep,
      },
    };
  })();

  const actingPlayer =
    state.players.find((p: any) => p.id === actingPlayerId) ?? null;
  const invariantCheck = engine.checkInvariants(state);

  const mySeatedPlayer =
    state.players.find((p: any) => p.id === model.currentUserId) ?? null;
  const handPlayer =
    state.phase === "GAME_OVER"
      ? mySeatedPlayer ??
        state.players.find((p: any) => p.id === state.winnerId) ??
        state.players[0]
      : controllableHumansCount >= 2 && model.hidePassAndPlayHand
        ? isMyTurn && actingPlayer && !actingPlayer.isBot
          ? actingPlayer
          : mySeatedPlayer ?? controllableHumans[0]
        : effectiveViewerId
          ? state.players.find((p: any) => p.id === effectiveViewerId) ?? null
          : null;

  const localDeviceGuestForTurn =
    !isMyTurn && actingPlayerId
      ? model.deviceGuests.find((g) => g.id === actingPlayerId)
      : undefined;

  const offerProposer =
    room.gameId === "catan" && state.activeTradeOffer
      ? state.players.find(
          (p: any) => p.id === state.activeTradeOffer!.fromPlayerId
        )
      : null;
  const canCancelMyTrade =
    room.gameId === "catan" &&
    Boolean(
      state.activeTradeOffer &&
        offerProposer &&
        (!offerProposer.isBot || room.allBots) &&
        canControlPlayerOnDevicePure(
          model,
          room,
          state.activeTradeOffer.fromPlayerId
        )
    );

  const summaryInfo = getRoomSetupSummaryDataPure(model, room);
  const isOwner = Boolean(room.ownerId && room.ownerId === model.currentUserId);
  const localUndoTargetId = ((): string | null => {
    if (!room.session) return null;
    if (isMyTurn && actingPlayerId && room.session.canPlayerUndo(actingPlayerId)) {
      return actingPlayerId;
    }
    if (room.gameId === "seven_wonders" && rawState.phase === "AGE_DRAFT") {
      const log = room.session.getActionLog();
      const last = log[log.length - 1];
      if (
        last &&
        canControlPlayerOnDevicePure(model, room, last.playerId) &&
        room.session.canPlayerUndo(last.playerId)
      ) {
        return last.playerId;
      }
    }
    return null;
  })();
  const undoableSteps = usesServer
    ? isMyTurn || room.gameId === "seven_wonders"
      ? room.undoableSteps
      : 0
    : localUndoTargetId && room.session
      ? room.session.getUndoableStepCount(localUndoTargetId)
      : 0;
  const canUndo = undoableSteps > 0;
  const canRedo = usesServer
    ? isMyTurn && room.canRedo
    : Boolean(
        isMyTurn &&
          actingPlayerId &&
          room.session?.canPlayerRedo(actingPlayerId)
      );

  const isPassAndPlayHandHidden =
    controllableHumansCount >= 2 && model.hidePassAndPlayHand;
  const isActiveInputAllowed = isMyTurn && !isPassAndPlayHandHidden;

  const catanLegalActions =
    room.gameId === "catan" && actingPlayerId && isActiveInputAllowed
      ? CatanEngine.getLegalActions(state, actingPlayerId)
      : [];
  const boardActingPlayerId = isActiveInputAllowed ? actingPlayerId : null;
  const ckBoardOptions = computeCkBoardOptionsPure(
    room,
    state,
    model,
    isActiveInputAllowed,
    actingPlayer
  );

  const sevenWondersLegalActions =
    room.gameId === "seven_wonders" && actingPlayerId && isActiveInputAllowed
      ? SevenWondersEngine.getLegalActions(
          state as SevenWondersState,
          actingPlayerId
        )
      : [];

  const overlays = computeInGameOverlayHtmlPure(
    model,
    room,
    state,
    isActiveInputAllowed,
    actingPlayerId,
    actingPlayer,
    catanLegalActions
  );

  const botMoveFeed = extractBotMoveFeedPure(room.gameId, state);

  return {
    usesServer,
    actingPlayerId,
    isMyTurn,
    controllableHumansCount,
    effectiveViewerId,
    state,
    model,
    actingPlayer,
    invariantCheck,
    mySeatedPlayer,
    handPlayer,
    localDeviceGuestForTurn,
    canCancelMyTrade,
    summaryInfo,
    isOwner,
    undoableSteps,
    canUndo,
    canRedo,
    catanLegalActions,
    boardActingPlayerId,
    ckBoardOptions,
    sevenWondersLegalActions,
    botMoveFeed,
    ...overlays,
  };
}
