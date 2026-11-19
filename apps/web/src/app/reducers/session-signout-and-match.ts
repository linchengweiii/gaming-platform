import {
  type MatchSession,
  createMatchSession,
} from "@gaming-platform/core";
import {
  CatanEngine,
  getNextActingPlayerId,
  isExpanded56Scenario,
} from "@gaming-platform/catan";
import { TUTORIAL_SEEDS } from "../../tutorials.ts";
import { DEFAULT_CATAN_MAP_VIEWPORT } from "../../catan-graphics/viewport.ts";
import { TUTORIAL_GAME_SHORT_TITLE_BY_ID } from "../../config/app-config.ts";
import {
  getEngineForGamePure,
  getRoomBoundsPure,
  rebuildRoomSeatsPure,
  setRoomInModelPure,
} from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom, SupportedGameId } from "../types.ts";
import { createLocalRoomPure } from "./room-sync-reducers.ts";
import { resetSubModesPure } from "./trade-and-draft-reducers.ts";

export {
  renameGuestInModelPure,
  signOutGuestFromModelPure,
} from "./guest-profile-reducers.ts";

export function startOfflineRoomMatchPure(
  model: Readonly<AppModel>,
  roomId: string
): { readonly started: boolean; readonly model: AppModel } {
  const existing = model.rooms[roomId];
  if (!existing) return { started: false, model };

  const rebuilt = rebuildRoomSeatsPure(existing);
  const bounds = getRoomBoundsPure(rebuilt);
  if (rebuilt.players.length < bounds.minPlayers) {
    return { started: false, model: setRoomInModelPure(model, rebuilt) };
  }

  const engine = getEngineForGamePure(rebuilt.gameId);
  const startSpec = ((): {
    startingPlayerIndex: number | undefined;
    randomizeStartingPlayer: boolean;
  } => {
    if (rebuilt.startingPlayerMode === "first") {
      return { startingPlayerIndex: 0, randomizeStartingPlayer: false };
    }
    if (rebuilt.startingPlayerMode === "random") {
      return { startingPlayerIndex: undefined, randomizeStartingPlayer: true };
    }
    const idx = rebuilt.players.findIndex(
      (p) => p.id === rebuilt.startingPlayerMode
    );
    return idx >= 0
      ? { startingPlayerIndex: idx, randomizeStartingPlayer: false }
      : { startingPlayerIndex: undefined, randomizeStartingPlayer: true };
  })();

  const engineConfig =
    rebuilt.gameId === "catan"
      ? {
          scenarioId: rebuilt.config.scenarioId,
          enable56PlayerExtension: Boolean(
            rebuilt.players.length >= 5 ||
              isExpanded56Scenario(rebuilt.config.scenarioId)
          ),
          enableHarbormaster: rebuilt.config.enableHarbormaster,
          enableCityWalls: rebuilt.config.enableCityWalls,
          enableFriendlyRobber: rebuilt.config.enableFriendlyRobber,
          enableCitiesAndKnights: rebuilt.config.enableCitiesAndKnights,
          startingPlayerIndex: startSpec.startingPlayerIndex,
          randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
        }
      : rebuilt.gameId === "seven_wonders"
        ? {
            wonderSideMode: rebuilt.config.wonderSideMode ?? "random",
            startingPlayerIndex: startSpec.startingPlayerIndex,
            randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
          }
        : {
            startingPlayerIndex: startSpec.startingPlayerIndex,
            randomizeStartingPlayer: startSpec.randomizeStartingPlayer,
          };

  const matchSeed =
    rebuilt.matchCounter === 0
      ? rebuilt.seed
      : `${rebuilt.seed}-g${rebuilt.matchCounter}`;
  const initialState = engine.initGame(
    rebuilt.players,
    engineConfig,
    matchSeed
  );
  const session = createMatchSession(engine, initialState, true);

  const startedRoom: ClientRoom = {
    ...rebuilt,
    matchCounter: rebuilt.matchCounter + 1,
    session,
    status: "in_progress",
  };

  return {
    started: true,
    model: resetSubModesPure(
      setRoomInModelPure(
        {
          ...model,
          activeRoomId: roomId,
          viewMode: "in_game",
          catanMapViewport: DEFAULT_CATAN_MAP_VIEWPORT,
        },
        startedRoom
      )
    ),
  };
}

export function startInteractiveTutorialPure(
  model: Readonly<AppModel>,
  gameId: SupportedGameId,
  nowMs: number = Date.now()
): { readonly model: AppModel; readonly roomId: string } {
  const cleanedRooms = Object.fromEntries(
    Object.entries(model.rooms).filter(
      ([, r]) => !(r.isOfflineLocal && r.name.endsWith("— Guided Tutorial"))
    )
  );
  const cleanedOrder = model.roomOrder.filter((id) => id in cleanedRooms);
  const cleanedModel: AppModel = {
    ...model,
    rooms: cleanedRooms,
    roomOrder: cleanedOrder,
  };
  const created = createLocalRoomPure(
    cleanedModel,
    {
      name: `${TUTORIAL_GAME_SHORT_TITLE_BY_ID[gameId]} — Guided Tutorial`,
      gameId,
      ownerId: model.currentUserId,
      ownerName: model.currentUserName,
      isOfflineLocal: true,
      botCount: 3,
      botDifficulty: "normal",
      startingPlayerMode: "first",
      scenarioId: "standard",
      wonderSideMode: "day",
      customSeed: TUTORIAL_SEEDS[gameId],
    },
    nowMs
  );
  const started = startOfflineRoomMatchPure(created.model, created.room.roomId);
  return {
    roomId: created.room.roomId,
    model: {
      ...started.model,
      guideModalGameId: null,
      activeTutorial: {
        roomId: created.room.roomId,
        gameId,
        stepIndex: 0,
        maxAutoStepIndex: 0,
      },
    },
  };
}

export function stepSetupBotsRecursive(
  session: MatchSession<any, any, any>,
  remainingGuard: number
): void {
  if (remainingGuard <= 0) return;
  const state = session.getState();
  if (!state.phase.startsWith("SETUP_")) return;
  const actorId = getNextActingPlayerId(state);
  if (!actorId) return;
  const action = CatanEngine.chooseBotAction(state, actorId);
  if (!action) return;
  session.dispatch(actorId, action);
  stepSetupBotsRecursive(session, remainingGuard - 1);
}
