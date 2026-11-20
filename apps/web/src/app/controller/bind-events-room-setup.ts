import type { BotDifficulty } from "@gaming-platform/core";
import { type ScenarioId, toBaseMapScenarioId } from "@gaming-platform/catan";
import { clampBotMoveThrottleMsPure } from "../../config/app-config.ts";
import {
  getRoomStatePure,
  rebuildRoomSeatsPure,
  updateRoomInModelPure,
} from "../helpers/room-queries.ts";
import type { ClientRoom, SupportedGameId } from "../types.ts";
import { bindCommonIdentityEvents } from "./bind-events-shell.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
  saveBotMoveThrottleMsToStorage,
} from "./context.ts";

export function bindRoomSetupEvents(
  ctx: AppRuntimeContext,
  room: ClientRoom,
  canEditSetup: boolean,
  maxBots: number,
  _bounds: { minPlayers: number; maxPlayers: number }
): void {
  const { root } = ctx;
  bindCommonIdentityEvents(ctx);

  root.querySelector("#btn-back-lobby")?.addEventListener("click", () => {
    ctx.exitRoomToLobby();
    if (ctx.model.useServerBackend) {
      ctx.render();
      void ctx.fetchLobbyRooms().then(() => ctx.renderPreservingFocus());
    } else {
      ctx.render();
    }
  });

  root.querySelector("#btn-leave-room")?.addEventListener("click", () => {
    ctx.leaveActiveRoom();
  });

  root.querySelector("#tab-game-page")?.addEventListener("click", () => {
    const latest = ctx.model.rooms[room.roomId] ?? room;
    if (getRoomStatePure(ctx.model, latest)) {
      ctx.model = {
        ...ctx.model,
        inspectingSetupDuringMatch: false,
        viewMode: "in_game",
      };
      ctx.render();
    }
  });

  root
    .querySelector("#btn-return-active-game")
    ?.addEventListener("click", () => {
      const latest = ctx.model.rooms[room.roomId] ?? room;
      if (getRoomStatePure(ctx.model, latest)) {
        ctx.model = {
          ...ctx.model,
          inspectingSetupDuringMatch: false,
          viewMode: "in_game",
        };
        ctx.render();
      }
    });

  if (canEditSetup) {
    root
      .querySelector("#inp-local-friend-name")
      ?.addEventListener("input", (e) => {
        ctx.model = {
          ...ctx.model,
          localFriendDraftName: (e.target as HTMLInputElement).value,
        };
      });

    root
      .querySelector("#inp-local-friend-name")
      ?.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") {
          e.preventDefault();
          const latest = ctx.model.rooms[room.roomId] ?? room;
          ctx.addLocalFriendToRoom(latest, ctx.model.localFriendDraftName);
        }
      });

    root
      .querySelector("#btn-add-local-friend")
      ?.addEventListener("click", () => {
        const latest = ctx.model.rooms[room.roomId] ?? room;
        ctx.addLocalFriendToRoom(latest, ctx.model.localFriendDraftName);
      });

    root.querySelectorAll("[data-remove-player]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-remove-player")!;
        const latest = ctx.model.rooms[room.roomId] ?? room;
        ctx.removePlayerFromRoom(latest, targetId);
      });
    });

    root.querySelectorAll("[data-setup-visibility]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nextPrivate =
          btn.getAttribute("data-setup-visibility") === "private";
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          isPrivate: nextPrivate,
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });
    });

    root.querySelector("#setup-sel-game")?.addEventListener("change", (e) => {
      const nextGame = (e.target as HTMLSelectElement).value as SupportedGameId;
      ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => {
        const gameChanged = r.gameId !== nextGame;
        return rebuildRoomSeatsPure({
          ...r,
          gameId: nextGame,
          ...(gameChanged
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
        });
      });
      const latest = ctx.model.rooms[room.roomId];
      if (latest) ctx.pushServerRoomSetup(latest);
      ctx.render();
    });

    root
      .querySelector("#setup-sel-wonderside")
      ?.addEventListener("change", (e) => {
        const nextSide = (e.target as HTMLSelectElement).value as
          | "random"
          | "day"
          | "night";
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          config: {
            ...r.config,
            wonderSideMode: nextSide,
          },
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-sel-scenario")
      ?.addEventListener("change", (e) => {
        const nextScenario = toBaseMapScenarioId(
          (e.target as HTMLSelectElement).value as ScenarioId
        );
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) =>
          rebuildRoomSeatsPure({
            ...r,
            config: {
              ...r.config,
              scenarioId: nextScenario,
              enable56PlayerExtension: undefined,
            },
          })
        );
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root.querySelector("#setup-sel-bots")?.addEventListener("change", (e) => {
      const nextBots = Number((e.target as HTMLSelectElement).value);
      ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) =>
        rebuildRoomSeatsPure({ ...r, botCount: nextBots })
      );
      const latest = ctx.model.rooms[room.roomId];
      if (latest) ctx.pushServerRoomSetup(latest);
      ctx.render();
    });

    root
      .querySelector("#btn-seat-remove-bot")
      ?.addEventListener("click", () => {
        const current = ctx.model.rooms[room.roomId] ?? room;
        if (current.botCount > 0) {
          ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) =>
            rebuildRoomSeatsPure({ ...r, botCount: r.botCount - 1 })
          );
          const latest = ctx.model.rooms[room.roomId];
          if (latest) ctx.pushServerRoomSetup(latest);
          ctx.render();
        }
      });

    root.querySelector("#btn-seat-add-bot")?.addEventListener("click", () => {
      const current = ctx.model.rooms[room.roomId] ?? room;
      if (current.botCount < maxBots) {
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) =>
          rebuildRoomSeatsPure({ ...r, botCount: r.botCount + 1 })
        );
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      }
    });

    root
      .querySelector("#setup-sel-starting-player")
      ?.addEventListener("change", (e) => {
        const nextStart = (e.target as HTMLSelectElement).value;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          startingPlayerMode: nextStart,
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-sel-bot-difficulty")
      ?.addEventListener("change", (e) => {
        const nextDiff = (e.target as HTMLSelectElement).value as BotDifficulty;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) =>
          rebuildRoomSeatsPure({ ...r, botDifficulty: nextDiff })
        );
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-sel-bot-pace")
      ?.addEventListener("change", (e) => {
        const nextDelayMs = clampBotMoveThrottleMsPure(
          Number((e.target as HTMLSelectElement).value)
        );
        saveBotMoveThrottleMsToStorage(nextDelayMs);
        ctx.model = updateRoomInModelPure(
          { ...ctx.model, botMoveThrottleMs: nextDelayMs },
          room.roomId,
          (r) => ({ ...r, botStepDelayMs: nextDelayMs })
        );
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-chk-citiesknights")
      ?.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          config: {
            ...r.config,
            scenarioId: toBaseMapScenarioId(r.config.scenarioId),
            enable56PlayerExtension: undefined,
            enableCitiesAndKnights: checked,
            enableCityWalls: checked,
          },
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-chk-harbormaster")
      ?.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          config: { ...r.config, enableHarbormaster: checked },
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-chk-citywalls")
      ?.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          config: { ...r.config, enableCityWalls: checked },
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });

    root
      .querySelector("#setup-chk-friendlyrobber")
      ?.addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        ctx.model = updateRoomInModelPure(ctx.model, room.roomId, (r) => ({
          ...r,
          config: { ...r.config, enableFriendlyRobber: checked },
        }));
        const latest = ctx.model.rooms[room.roomId];
        if (latest) ctx.pushServerRoomSetup(latest);
        ctx.render();
      });
  }

  root.querySelector("#btn-launch-match")?.addEventListener("click", () => {
    ctx.startRoomMatch(room.roomId);
  });
}
