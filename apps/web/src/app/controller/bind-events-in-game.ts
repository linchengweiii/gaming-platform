import type { CatanState } from "@gaming-platform/catan";
import type { SplendorState } from "@gaming-platform/splendor";
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
import { bindCatanMapViewportEvents } from "./bind-events-catan-viewport.ts";
import {
  bindAzulEvents,
  bindSevenWondersEvents,
  bindSplendorEvents,
} from "./bind-events-other-games.ts";
import {
  bindBackToLobbyEvent,
  bindCommonIdentityEvents,
} from "./bind-events-shell.ts";
import type { AppRuntimeContext } from "./context.ts";
import { onClick, onDataClick, patchModelAndRender } from "./dom-events.ts";

export function bindInGameEvents(
  ctx: AppRuntimeContext,
  room: ClientRoom,
  state: any,
  actingPlayerId: string | null,
  canCancelMyTrade = false
): void {
  const { root } = ctx;
  bindCommonIdentityEvents(ctx);
  bindBackToLobbyEvent(ctx);

  const openSetupPage = (inspectingDuringMatch: boolean): void => {
    ctx.stopAutoPlay();
    patchModelAndRender(ctx, {
      inspectingSetupDuringMatch: inspectingDuringMatch,
      viewMode: "room_setup",
    });
  };
  onClick(root, "#tab-setup-page", () =>
    openSetupPage(room.status === "in_progress")
  );
  onClick(root, "#btn-sidebar-edit-setup", () =>
    openSetupPage(room.status === "in_progress")
  );
  onClick(root, "#btn-goto-setup-finished", () => openSetupPage(false));

  onClick(root, "#btn-toggle-game-settings", () =>
    patchModelAndRender(ctx, {
      sidebarSettingsExpanded: !ctx.model.sidebarSettingsExpanded,
    })
  );
  onClick(root, "#btn-undo", () => ctx.undoMatch());
  onClick(root, "#btn-redo", () => ctx.redoMatch());
  onClick(root, "#btn-finish-setup", () => ctx.finishSetupWithBots());
  onClick(root, "#btn-toggle-bot-response", () => ctx.toggleAutoRespondBots());
  onClick(root, "#btn-step-bot", () => ctx.stepOneBotMove(true));
  onClick(root, "#btn-autoplay", () => ctx.toggleAutoPlay());
  onClick(root, "#btn-toggle-bot-moves", () => ctx.toggleShowBotMoves());
  onClick(root, "#btn-hide-bot-moves", () => {
    if (ctx.model.showBotMoves) ctx.toggleShowBotMoves();
  });
  onClick(root, "#btn-cycle-bot-pace", () => ctx.cycleBotMoveThrottle());
  onClick(root, "#btn-toggle-bot-feed-history", () =>
    ctx.toggleBotFeedHistory()
  );
  onClick(root, "#btn-close-bot-feed-history", () => {
    if (ctx.model.botFeedHistoryExpanded) ctx.toggleBotFeedHistory();
  });

  onDataClick(root, "data-toggle-fullscreen", (_v, _el, e) => {
    e.stopPropagation();
    ctx.toggleBoardFullscreen();
  });
  onClick(root, "#btn-toggle-fullscreen-sidebar", () =>
    ctx.toggleFullscreenSidebar()
  );
  const closeFullscreenSidebar = () => {
    if (ctx.model.fullscreenSidebarOpen) ctx.toggleFullscreenSidebar();
  };
  onClick(root, "#btn-close-fullscreen-sidebar", closeFullscreenSidebar);
  onClick(root, "#ga-fullscreen-sidebar-backdrop", closeFullscreenSidebar);

  onClick(root, "#btn-toggle-hand-privacy", () =>
    patchModelAndRender(ctx, {
      hidePassAndPlayHand: !ctx.model.hidePassAndPlayHand,
    })
  );
  onClick(root, "#btn-reveal-hand", () =>
    patchModelAndRender(ctx, { hidePassAndPlayHand: false })
  );
  onClick(root, "#btn-switch-turn-guest", (e) => {
    const gid = (e.currentTarget as HTMLElement).getAttribute(
      "data-switch-guest"
    );
    if (gid) ctx.switchActiveGuest(gid);
  });

  if (room.gameId === "azul") {
    onDataClick(root, "data-azul-inspect-player", (pid) =>
      patchModelAndRender(ctx, {
        azulInspectedPlayerId:
          ctx.model.azulInspectedPlayerId === pid ? null : pid,
      })
    );
  }

  if (room.gameId === "seven_wonders") {
    onDataClick(root, "data-sw-inspect-player", (pid) =>
      patchModelAndRender(ctx, {
        sevenWondersInspectedPlayerId:
          ctx.model.sevenWondersInspectedPlayerId === pid ? null : pid,
      })
    );

    const handleUnselectSwPick = (ev?: any) => {
      const swRaw = (getRoomStatePure(ctx.model, room) ??
        state) as SevenWondersState;
      const explicitId = ev?.currentTarget?.getAttribute?.(
        "data-sw-unselect-player"
      ) as string | null;
      const canUnselect = (id: string | null): id is string =>
        Boolean(
          id &&
            canControlPlayerOnDevicePure(ctx.model, room, id) &&
            canPlayerUnselectDraftPick(swRaw, id)
        );
      if (canUnselect(explicitId)) {
        ctx.dispatchUiAction(explicitId, { type: "UNSELECT_DRAFT_ACTION" });
        return;
      }
      const lockedLocal = [...swRaw.players]
        .reverse()
        .find((p) => !p.isBot && canUnselect(p.id));
      if (lockedLocal) {
        ctx.dispatchUiAction(lockedLocal.id, { type: "UNSELECT_DRAFT_ACTION" });
      }
    };
    onClick(root, "#btn-sw-unselect-pick", handleUnselectSwPick);
    onClick(root, "#btn-sw-unselect-pick-dock", handleUnselectSwPick);
  }

  if (room.gameId === "catan") {
    bindCatanMapViewportEvents(ctx, state as CatanState);
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
      onDataClick(root, "data-confirm-trade", (partnerId) =>
        ctx.dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
          type: "CONFIRM_DOMESTIC_TRADE",
          offerId: state.activeTradeOffer.id,
          partnerId,
        })
      );
      root.querySelectorAll("#btn-cancel-domestic").forEach((btn) =>
        btn.addEventListener("click", () =>
          ctx.dispatchUiAction(state.activeTradeOffer.fromPlayerId, {
            type: "CANCEL_DOMESTIC_TRADE",
          })
        )
      );
    }
    if (room.gameId === "catan") bindReadOnlyCatanSpotInspect(ctx);
    return;
  }

  if (room.gameId === "splendor") {
    bindSplendorEvents(ctx, state as SplendorState, actingPlayerId);
  } else if (room.gameId === "azul") {
    bindAzulEvents(ctx, actingPlayerId);
  } else if (room.gameId === "seven_wonders") {
    bindSevenWondersEvents(ctx, state as SevenWondersState, actingPlayerId);
  } else {
    bindCatanEvents(ctx, state as CatanState, actingPlayerId);
  }
}
