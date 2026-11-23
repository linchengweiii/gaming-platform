import type { SupportedLocale } from "../../i18n/index.ts";
import {
  TUTORIAL_LESSONS,
  chooseRecommendedTutorialActionPure,
} from "../../tutorials.ts";
import {
  canControlPlayerOnDevicePure,
  getActingPlayerIdPure,
  getActiveRoomPure,
  getRoomStatePure,
  removeRoomFromModelPure,
} from "../helpers/room-queries.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { SupportedGameId } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
} from "./context.ts";
import {
  onChange,
  onClick,
  onDataClick,
  patchModelAndRender,
} from "./dom-events.ts";
import { bindDropdownEventsOnRoot } from "./render-and-dropdowns.ts";

function bindTutorialAndGuideEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  const closeGuide = () => patchModelAndRender(ctx, { guideModalGameId: null });

  onDataClick(root, "data-start-tutorial", (gId) => {
    if (gId) ctx.startInteractiveTutorial(gId as SupportedGameId);
  });
  onDataClick(root, "data-open-guide", (gId) => {
    if (gId) patchModelAndRender(ctx, { guideModalGameId: gId as SupportedGameId });
  });
  onClick(root, "#btn-close-guide", closeGuide);
  onClick(root, "#btn-resume-from-guide", closeGuide);
  onClick(root, "#ga-guide-backdrop", (ev) => {
    if (ev.target === ev.currentTarget) closeGuide();
  });
  root.querySelector("#ga-guide-backdrop")?.addEventListener("keydown", (ev: any) => {
    if (ev.key === "Escape") closeGuide();
  });

  onClick(root, "#btn-tutorial-prev", () => {
    if (!ctx.model.activeTutorial) return;
    patchModelAndRender(ctx, {
      activeTutorial: {
        ...ctx.model.activeTutorial,
        stepIndex: Math.max(0, ctx.model.activeTutorial.stepIndex - 1),
      },
    });
  });

  onClick(root, "#btn-tutorial-next", () => {
    if (!ctx.model.activeTutorial) return;
    const maxIdx = TUTORIAL_LESSONS[ctx.model.activeTutorial.gameId].length - 1;
    const nextIdx = Math.min(maxIdx, ctx.model.activeTutorial.stepIndex + 1);
    patchModelAndRender(ctx, {
      activeTutorial: {
        ...ctx.model.activeTutorial,
        stepIndex: nextIdx,
        maxAutoStepIndex: Math.max(
          ctx.model.activeTutorial.maxAutoStepIndex,
          nextIdx
        ),
      },
    });
  });

  onClick(root, "#btn-tutorial-dismiss", () =>
    patchModelAndRender(ctx, { activeTutorial: null })
  );

  onClick(root, "#btn-tutorial-exit", () => {
    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    const tutRoomId = ctx.model.activeTutorial?.roomId ?? null;
    if (tutRoomId) ctx.roomLensCache.delete(tutRoomId);
    const afterRemove = tutRoomId
      ? removeRoomFromModelPure(ctx.model, tutRoomId)
      : ctx.model;
    ctx.model = resetSubModesPure({
      ...afterRemove,
      activeRoomId:
        ctx.model.activeRoomId === tutRoomId
          ? afterRemove.roomOrder[0] ?? ""
          : ctx.model.activeRoomId,
      activeTutorial: null,
      viewMode: "lobby",
    });
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);
    if (ctx.model.useServerBackend) void ctx.fetchLobbyRooms();
    ctx.render();
  });

  onClick(root, "#btn-tutorial-auto-step", () => {
    const room = getActiveRoomPure(ctx.model);
    const rawState = getRoomStatePure(ctx.model, room);
    if (!rawState) return;
    const actingId = getActingPlayerIdPure(room.gameId, rawState);
    if (!actingId || !canControlPlayerOnDevicePure(ctx.model, room, actingId)) {
      return;
    }
    const curStepIdx = ctx.model.activeTutorial?.stepIndex ?? 0;
    const rec = chooseRecommendedTutorialActionPure(
      room.gameId,
      rawState,
      actingId,
      curStepIdx,
      ctx.model.azulSelectedDraft
    );
    if (
      rec &&
      room.gameId === "azul" &&
      curStepIdx === 0 &&
      !ctx.model.azulSelectedDraft &&
      rec.type === "DRAFT_TILES"
    ) {
      patchModelAndRender(ctx, {
        azulSelectedDraft: { source: rec.source, color: rec.color },
      });
      return;
    }
    if (rec) {
      ctx.model = { ...ctx.model, azulSelectedDraft: null };
      ctx.dispatchUiAction(actingId, rec);
    }
  });
}

function bindLocaleSelectorEvents(ctx: AppRuntimeContext): void {
  onChange(ctx.root, "#sel-locale", (e) =>
    ctx.setLocale((e.target as HTMLSelectElement).value as SupportedLocale)
  );
}

export function bindCommonIdentityEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  bindDropdownEventsOnRoot(root);
  bindLocaleSelectorEvents(ctx);
  bindTutorialAndGuideEvents(ctx);

  root.querySelectorAll('[role="button"][tabindex="0"]').forEach((el) => {
    el.addEventListener("keydown", (ev: any) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault?.();
        (el as HTMLElement).click();
      }
    });
  });

  onChange(root, "#sel-user-identity", (e) =>
    ctx.switchActiveGuest((e.target as HTMLSelectElement).value)
  );

  onClick(root, "#btn-edit-guest-name", () => {
    patchModelAndRender(ctx, {
      editingGuestName: true,
      guestRenameDraft: ctx.model.currentUserName,
    });
    const inp = root.querySelector?.("#inp-rename-guest") as HTMLInputElement | null;
    inp?.focus?.();
    inp?.select?.();
  });

  const cancelRename = () =>
    patchModelAndRender(ctx, { editingGuestName: false, guestRenameDraft: "" });

  const renameInput = root.querySelector("#inp-rename-guest");
  renameInput?.addEventListener("input", (e) => {
    ctx.model = {
      ...ctx.model,
      guestRenameDraft: (e.target as HTMLInputElement).value,
    };
  });
  renameInput?.addEventListener("keydown", (e: any) => {
    if (e.key === "Escape") cancelRename();
  });
  root.querySelector("#form-rename-guest")?.addEventListener("submit", (e) => {
    e.preventDefault();
    ctx.renameCurrentGuest(ctx.model.guestRenameDraft);
  });
  onClick(root, "#btn-cancel-guest-name", cancelRename);
  onClick(root, "#btn-add-guest", () => ctx.openAddGuestView());
  onClick(root, "#btn-sign-out", () => {
    ctx.syncUrlRoomHash(null);
    ctx.signOutGuest();
  });
  onDataClick(root, "data-copy-room-link", (rId, _el, e) => {
    e.stopPropagation();
    if (rId) ctx.copyRoomShareLink(rId);
  });
}

export function bindLoginEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  bindDropdownEventsOnRoot(root);
  bindLocaleSelectorEvents(ctx);

  root.querySelector("#inp-guest-name")?.addEventListener("input", (e) => {
    ctx.model = {
      ...ctx.model,
      loginDraftName: (e.target as HTMLInputElement).value,
      loginErrorMsg: "",
    };
  });
  root.querySelector("#form-guest-login")?.addEventListener("submit", (e) => {
    e.preventDefault();
    ctx.signInAsGuest(ctx.model.loginDraftName);
  });
  onClick(root, "#btn-start-solo-game", () =>
    ctx.startSoloGameFromLogin(ctx.model.loginDraftName)
  );
  onClick(root, "#btn-start-offline-local", () =>
    ctx.startOfflineLocalFromLogin(ctx.model.loginDraftName)
  );
  onClick(root, "#btn-cancel-add-guest", () =>
    patchModelAndRender(ctx, {
      addingAdditionalGuest: false,
      loginErrorMsg: "",
      viewMode: ctx.model.returnViewAfterAddGuest,
    })
  );
  onDataClick(root, "data-select-saved-guest", (guestId) => {
    const found = ctx.model.deviceGuests.find((g) => g.id === guestId);
    if (found) ctx.signInAsGuest(found.name, found.id);
  });
  onDataClick(root, "data-remove-saved-guest", (guestId) =>
    ctx.removeDeviceGuest(guestId)
  );
}

export function bindLobbyEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  bindCommonIdentityEvents(ctx);

  onDataClick(root, "data-lobby-filter", (filter) =>
    patchModelAndRender(ctx, {
      lobbyGameFilter: filter as SupportedGameId,
      createRoomGameId: filter as SupportedGameId,
    })
  );
  onChange(root, "#sel-create-room-mode", (e) =>
    patchModelAndRender(ctx, {
      createRoomMode: (e.target as HTMLSelectElement).value as "online" | "offline",
    })
  );
  onClick(root, "#btn-create-room", () => ctx.createAndOpenRoom());
  onDataClick(root, "data-join-room", (rId) => ctx.enterOrJoinRoom(rId));
  onDataClick(root, "data-start-room-direct", (rId) => ctx.startRoomMatch(rId));
}

export function bindBackToLobbyEvent(ctx: AppRuntimeContext): void {
  onClick(ctx.root, "#btn-back-lobby", () => {
    ctx.exitRoomToLobby();
    ctx.render();
    if (ctx.model.useServerBackend) {
      void ctx.fetchLobbyRooms().then(() => ctx.renderPreservingFocus());
    }
  });
}
