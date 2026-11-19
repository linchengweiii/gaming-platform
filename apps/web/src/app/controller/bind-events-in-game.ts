import type { CatanState } from "@gaming-platform/catan";
import type { SplendorState } from "@gaming-platform/splendor";
import type { AzulState } from "@gaming-platform/azul";
import {
  type SevenWondersState,
  canPlayerUnselectDraftPick,
} from "@gaming-platform/seven-wonders";
import {
  canControlPlayerOnDevicePure,
  getRoomStatePure,
} from "../helpers/room-queries.ts";
import type { ClientRoom } from "../types.ts";
import {
  bindCatanEvents,
  bindReadOnlyCatanSpotInspect,
} from "./bind-events-catan.ts";
import {
  bindAzulEvents,
  bindSevenWondersEvents,
  bindSplendorEvents,
} from "./bind-events-other-games.ts";
import { bindCommonIdentityEvents } from "./bind-events-shell.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
} from "./context.ts";

export function bindInGameEvents(
  ctx: AppRuntimeContext,
  room: ClientRoom,
  state: any,
  actingPlayerId: string | null,
  canCancelMyTrade = false
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

  root.querySelector("#tab-setup-page")?.addEventListener("click", () => {
    ctx.stopAutoPlay();
    ctx.model = {
      ...ctx.model,
      inspectingSetupDuringMatch: room.status === "in_progress",
      viewMode: "room_setup",
    };
    ctx.render();
  });

  root
    .querySelector("#btn-toggle-game-settings")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        sidebarSettingsExpanded: !ctx.model.sidebarSettingsExpanded,
      };
      ctx.render();
    });

  root
    .querySelector("#btn-sidebar-edit-setup")
    ?.addEventListener("click", () => {
      ctx.stopAutoPlay();
      ctx.model = {
        ...ctx.model,
        inspectingSetupDuringMatch: room.status === "in_progress",
        viewMode: "room_setup",
      };
      ctx.render();
    });

  root
    .querySelector("#btn-goto-setup-finished")
    ?.addEventListener("click", () => {
      ctx.stopAutoPlay();
      ctx.model = {
        ...ctx.model,
        inspectingSetupDuringMatch: false,
        viewMode: "room_setup",
      };
      ctx.render();
    });

  root.querySelector("#btn-undo")?.addEventListener("click", () => {
    ctx.undoMatch();
  });

  root.querySelector("#btn-redo")?.addEventListener("click", () => {
    ctx.redoMatch();
  });

  root.querySelector("#btn-finish-setup")?.addEventListener("click", () => {
    ctx.finishSetupWithBots();
  });

  root
    .querySelector("#btn-toggle-bot-response")
    ?.addEventListener("click", () => {
      ctx.toggleAutoRespondBots();
    });

  root.querySelector("#btn-step-bot")?.addEventListener("click", () => {
    ctx.stepOneBotMove(true);
  });

  root.querySelector("#btn-autoplay")?.addEventListener("click", () => {
    ctx.toggleAutoPlay();
  });

  root
    .querySelector("#btn-toggle-hand-privacy")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        hidePassAndPlayHand: !ctx.model.hidePassAndPlayHand,
      };
      ctx.render();
    });

  root.querySelector("#btn-reveal-hand")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, hidePassAndPlayHand: false };
    ctx.render();
  });

  root
    .querySelector("#btn-switch-turn-guest")
    ?.addEventListener("click", (e) => {
      const gid = (e.currentTarget as HTMLElement).getAttribute(
        "data-switch-guest"
      );
      if (gid) {
        ctx.switchActiveGuest(gid);
      }
    });

  if (room.gameId === "azul") {
    root.querySelectorAll("[data-azul-inspect-player]").forEach((el) => {
      el.addEventListener("click", () => {
        const pid = el.getAttribute("data-azul-inspect-player")!;
        ctx.model = {
          ...ctx.model,
          azulInspectedPlayerId:
            ctx.model.azulInspectedPlayerId === pid ? null : pid,
        };
        ctx.render();
      });
    });
  }

  if (room.gameId === "seven_wonders") {
    root.querySelectorAll("[data-sw-inspect-player]").forEach((el) => {
      el.addEventListener("click", () => {
        const pid = el.getAttribute("data-sw-inspect-player")!;
        ctx.model = {
          ...ctx.model,
          sevenWondersInspectedPlayerId:
            ctx.model.sevenWondersInspectedPlayerId === pid ? null : pid,
        };
        ctx.render();
      });
    });

    const handleUnselectSwPick = (ev?: any) => {
      const swRaw = (getRoomStatePure(ctx.model, room) ??
        state) as SevenWondersState;
      const explicitId = ev?.currentTarget?.getAttribute?.(
        "data-sw-unselect-player"
      ) as string | null;
      if (
        explicitId &&
        canControlPlayerOnDevicePure(ctx.model, room, explicitId) &&
        canPlayerUnselectDraftPick(swRaw, explicitId)
      ) {
        ctx.dispatchUiAction(explicitId, { type: "UNSELECT_DRAFT_ACTION" });
        return;
      }
      const lockedLocal = [...swRaw.players]
        .reverse()
        .find(
          (p) =>
            !p.isBot &&
            canControlPlayerOnDevicePure(ctx.model, room, p.id) &&
            canPlayerUnselectDraftPick(swRaw, p.id)
        );
      if (lockedLocal) {
        ctx.dispatchUiAction(lockedLocal.id, { type: "UNSELECT_DRAFT_ACTION" });
      }
    };
    root
      .querySelector("#btn-sw-unselect-pick")
      ?.addEventListener("click", handleUnselectSwPick);
    root
      .querySelector("#btn-sw-unselect-pick-dock")
      ?.addEventListener("click", handleUnselectSwPick);
  }

  if (!actingPlayerId) return;

  const controllableHumansCount = room.players.filter(
    (p) => !p.isBot && canControlPlayerOnDevicePure(ctx.model, room, p.id)
  ).length;
  const isPassAndPlayHandHidden =
    (room.gameId === "catan" || room.gameId === "seven_wonders") &&
    controllableHumansCount >= 2 &&
    ctx.model.hidePassAndPlayHand;

  if (
    !canControlPlayerOnDevicePure(ctx.model, room, actingPlayerId) ||
    isPassAndPlayHandHidden
  ) {
    if (canCancelMyTrade && state.activeTradeOffer) {
      root.querySelectorAll("[data-confirm-trade]").forEach((confirmBtn) => {
        confirmBtn.addEventListener("click", () => {
          const partnerId = confirmBtn.getAttribute("data-confirm-trade")!;
          ctx.dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
            type: "CONFIRM_DOMESTIC_TRADE",
            offerId: state.activeTradeOffer.id,
            partnerId,
          });
        });
      });
      root.querySelectorAll("#btn-cancel-domestic").forEach((cancelBtn) => {
        cancelBtn.addEventListener("click", () => {
          ctx.dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
            type: "CANCEL_DOMESTIC_TRADE",
          });
        });
      });
    }
    if (room.gameId === "catan") {
      bindReadOnlyCatanSpotInspect(ctx);
    }
    return;
  }

  if (room.gameId === "splendor") {
    bindSplendorEvents(ctx, state as SplendorState, actingPlayerId);
    return;
  }

  if (room.gameId === "azul") {
    bindAzulEvents(ctx, state as AzulState, actingPlayerId);
    return;
  }

  if (room.gameId === "seven_wonders") {
    bindSevenWondersEvents(ctx, state as SevenWondersState, actingPlayerId);
    return;
  }

  bindCatanEvents(ctx, state as CatanState, actingPlayerId);
}
