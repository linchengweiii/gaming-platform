import type { BotDifficulty } from "@gaming-platform/core";
import { type ScenarioId, toBaseMapScenarioId } from "@gaming-platform/catan";
import { clampBotMoveThrottleMsPure } from "../../config/app-config.ts";
import {
  getRoomStatePure,
  rebuildRoomSeatsPure,
  updateRoomInModelPure,
} from "../helpers/room-queries.ts";
import type { ClientRoom, SupportedGameId } from "../types.ts";
import {
  bindBackToLobbyEvent,
  bindCommonIdentityEvents,
} from "./bind-events-shell.ts";
import {
  type AppRuntimeContext,
  saveBotMoveThrottleMsToStorage,
} from "./context.ts";
import {
  onChange,
  onClick,
  onDataClick,
  patchModelAndRender,
} from "./dom-events.ts";

export function bindRoomSetupEvents(
  ctx: AppRuntimeContext,
  room: ClientRoom,
  canEditSetup: boolean,
  maxBots: number,
  _bounds: { minPlayers: number; maxPlayers: number }
): void {
  const { root } = ctx;
  bindCommonIdentityEvents(ctx);
  bindBackToLobbyEvent(ctx);
  onClick(root, "#btn-leave-room", () => ctx.leaveActiveRoom());

  const returnToActiveGame = (): void => {
    const latest = ctx.model.rooms[room.roomId] ?? room;
    if (getRoomStatePure(ctx.model, latest)) {
      patchModelAndRender(ctx, {
        inspectingSetupDuringMatch: false,
        viewMode: "in_game",
      });
    }
  };
  onClick(root, "#tab-game-page", returnToActiveGame);
  onClick(root, "#btn-return-active-game", returnToActiveGame);

  if (canEditSetup) {
    const updateRoomAndSync = (
      updater: (r: ClientRoom) => ClientRoom,
      modelBase = ctx.model
    ): void => {
      ctx.model = updateRoomInModelPure(modelBase, room.roomId, updater);
      const latest = ctx.model.rooms[room.roomId];
      if (latest) ctx.pushServerRoomSetup(latest);
      ctx.render();
    };

    const addLocalFriend = (): void => {
      const latest = ctx.model.rooms[room.roomId] ?? room;
      ctx.addLocalFriendToRoom(latest, ctx.model.localFriendDraftName);
    };
    const friendInput = root.querySelector("#inp-local-friend-name");
    friendInput?.addEventListener("input", (e) => {
      ctx.model = {
        ...ctx.model,
        localFriendDraftName: (e.target as HTMLInputElement).value,
      };
    });
    friendInput?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") {
        e.preventDefault();
        addLocalFriend();
      }
    });
    onClick(root, "#btn-add-local-friend", addLocalFriend);

    onDataClick(root, "data-remove-player", (targetId) =>
      ctx.removePlayerFromRoom(ctx.model.rooms[room.roomId] ?? room, targetId)
    );
    onDataClick(root, "data-setup-visibility", (vis) =>
      updateRoomAndSync((r) => ({ ...r, isPrivate: vis === "private" }))
    );

    onChange(root, "#setup-sel-game", (e) => {
      const nextGame = (e.target as HTMLSelectElement).value as SupportedGameId;
      updateRoomAndSync((r) =>
        rebuildRoomSeatsPure({
          ...r,
          gameId: nextGame,
          ...(r.gameId !== nextGame
            ? {
                status: "lobby" as const,
                session: null,
                remoteState: null,
                remoteActingPlayerId: null,
                canUndo: false,
                undoableSteps: 0,
                canRedo: false,
                step: 0,
              }
            : {}),
          botCount:
            nextGame === "seven_wonders" && r.botCount < 2 ? 3 : r.botCount,
        })
      );
    });

    onChange(root, "#setup-sel-wonderside", (e) => {
      const wonderSideMode = (e.target as HTMLSelectElement).value as
        | "random"
        | "day"
        | "night";
      updateRoomAndSync((r) => ({ ...r, config: { ...r.config, wonderSideMode } }));
    });

    onChange(root, "#setup-sel-scenario", (e) => {
      const scenarioId = toBaseMapScenarioId(
        (e.target as HTMLSelectElement).value as ScenarioId
      );
      updateRoomAndSync((r) =>
        rebuildRoomSeatsPure({
          ...r,
          config: { ...r.config, scenarioId, enable56PlayerExtension: undefined },
        })
      );
    });

    onChange(root, "#setup-sel-bots", (e) => {
      const botCount = Number((e.target as HTMLSelectElement).value);
      updateRoomAndSync((r) => rebuildRoomSeatsPure({ ...r, botCount }));
    });
    onClick(root, "#btn-seat-remove-bot", () => {
      const current = ctx.model.rooms[room.roomId] ?? room;
      if (current.botCount > 0) {
        updateRoomAndSync((r) =>
          rebuildRoomSeatsPure({ ...r, botCount: r.botCount - 1 })
        );
      }
    });
    onClick(root, "#btn-seat-add-bot", () => {
      const current = ctx.model.rooms[room.roomId] ?? room;
      if (current.botCount < maxBots) {
        updateRoomAndSync((r) =>
          rebuildRoomSeatsPure({ ...r, botCount: r.botCount + 1 })
        );
      }
    });

    onChange(root, "#setup-sel-starting-player", (e) => {
      const startingPlayerMode = (e.target as HTMLSelectElement).value;
      updateRoomAndSync((r) => ({ ...r, startingPlayerMode }));
    });
    onChange(root, "#setup-sel-bot-difficulty", (e) => {
      const botDifficulty = (e.target as HTMLSelectElement).value as BotDifficulty;
      updateRoomAndSync((r) => rebuildRoomSeatsPure({ ...r, botDifficulty }));
    });
    onChange(root, "#setup-sel-bot-pace", (e) => {
      const nextDelayMs = clampBotMoveThrottleMsPure(
        Number((e.target as HTMLSelectElement).value)
      );
      saveBotMoveThrottleMsToStorage(nextDelayMs);
      updateRoomAndSync((r) => ({ ...r, botStepDelayMs: nextDelayMs }), {
        ...ctx.model,
        botMoveThrottleMs: nextDelayMs,
      });
    });

    onChange(root, "#setup-chk-citiesknights", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      updateRoomAndSync((r) => ({
        ...r,
        config: {
          ...r.config,
          scenarioId: toBaseMapScenarioId(r.config.scenarioId),
          enable56PlayerExtension: undefined,
          enableCitiesAndKnights: checked,
          enableCityWalls: checked,
        },
      }));
    });

    const bindConfigCheckbox = (
      selector: string,
      key: "enableHarbormaster" | "enableCityWalls" | "enableFriendlyRobber"
    ) =>
      onChange(root, selector, (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        updateRoomAndSync((r) => ({
          ...r,
          config: { ...r.config, [key]: checked },
        }));
      });
    bindConfigCheckbox("#setup-chk-harbormaster", "enableHarbormaster");
    bindConfigCheckbox("#setup-chk-citywalls", "enableCityWalls");
    bindConfigCheckbox("#setup-chk-friendlyrobber", "enableFriendlyRobber");
  }

  onClick(root, "#btn-launch-match", () => ctx.startRoomMatch(room.roomId));
}
