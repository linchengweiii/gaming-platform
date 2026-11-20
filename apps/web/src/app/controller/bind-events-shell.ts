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
} from "../helpers/room-queries.ts";
import { resetSubModesPure } from "../reducers/trade-and-draft-reducers.ts";
import type { SupportedGameId } from "../types.ts";
import {
  type AppRuntimeContext,
  clearActiveRoomIdFromStorage,
} from "./context.ts";
import { bindDropdownEventsOnRoot } from "./render-and-dropdowns.ts";

export function bindTutorialAndGuideEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;

  root.querySelectorAll("[data-start-tutorial]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gId = btn.getAttribute("data-start-tutorial") as SupportedGameId;
      if (gId) {
        ctx.startInteractiveTutorial(gId);
      }
    });
  });

  root.querySelectorAll("[data-open-guide]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gId = btn.getAttribute("data-open-guide") as SupportedGameId;
      if (gId) {
        ctx.model = { ...ctx.model, guideModalGameId: gId };
        ctx.render();
      }
    });
  });

  root.querySelector("#btn-close-guide")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, guideModalGameId: null };
    ctx.render();
  });

  root
    .querySelector("#btn-resume-from-guide")
    ?.addEventListener("click", () => {
      ctx.model = { ...ctx.model, guideModalGameId: null };
      ctx.render();
    });

  root
    .querySelector("#ga-guide-backdrop")
    ?.addEventListener("click", (ev) => {
      if (ev.target === ev.currentTarget) {
        ctx.model = { ...ctx.model, guideModalGameId: null };
        ctx.render();
      }
    });

  root
    .querySelector("#ga-guide-backdrop")
    ?.addEventListener("keydown", (ev: any) => {
      if (ev.key === "Escape") {
        ctx.model = { ...ctx.model, guideModalGameId: null };
        ctx.render();
      }
    });

  root.querySelector("#btn-tutorial-prev")?.addEventListener("click", () => {
    if (!ctx.model.activeTutorial) return;
    ctx.model = {
      ...ctx.model,
      activeTutorial: {
        ...ctx.model.activeTutorial,
        stepIndex: Math.max(0, ctx.model.activeTutorial.stepIndex - 1),
      },
    };
    ctx.render();
  });

  root.querySelector("#btn-tutorial-next")?.addEventListener("click", () => {
    if (!ctx.model.activeTutorial) return;
    const maxIdx = TUTORIAL_LESSONS[ctx.model.activeTutorial.gameId].length - 1;
    const nextIdx = Math.min(maxIdx, ctx.model.activeTutorial.stepIndex + 1);
    ctx.model = {
      ...ctx.model,
      activeTutorial: {
        ...ctx.model.activeTutorial,
        stepIndex: nextIdx,
        maxAutoStepIndex: Math.max(
          ctx.model.activeTutorial.maxAutoStepIndex,
          nextIdx
        ),
      },
    };
    ctx.render();
  });

  root.querySelector("#btn-tutorial-dismiss")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, activeTutorial: null };
    ctx.render();
  });

  root.querySelector("#btn-tutorial-exit")?.addEventListener("click", () => {
    ctx.navEpoch += 1;
    ctx.stopAutoPlay();
    const tutRoomId = ctx.model.activeTutorial?.roomId ?? null;
    if (tutRoomId) {
      ctx.roomLensCache.delete(tutRoomId);
    }
    const nextRooms = tutRoomId
      ? Object.fromEntries(
          Object.entries(ctx.model.rooms).filter(([id]) => id !== tutRoomId)
        )
      : ctx.model.rooms;
    const nextOrder = tutRoomId
      ? ctx.model.roomOrder.filter((id) => id !== tutRoomId)
      : ctx.model.roomOrder;
    const fallbackId = nextOrder[0] ?? "";
    ctx.model = resetSubModesPure({
      ...ctx.model,
      rooms: nextRooms,
      roomOrder: nextOrder,
      activeRoomId:
        ctx.model.activeRoomId === tutRoomId
          ? fallbackId
          : ctx.model.activeRoomId,
      activeTutorial: null,
      viewMode: "lobby",
    });
    clearActiveRoomIdFromStorage();
    ctx.syncUrlRoomHash(null);
    if (ctx.model.useServerBackend) {
      void ctx.fetchLobbyRooms();
    }
    ctx.render();
  });

  root
    .querySelector("#btn-tutorial-auto-step")
    ?.addEventListener("click", () => {
      const room = getActiveRoomPure(ctx.model);
      const rawState = getRoomStatePure(ctx.model, room);
      if (!rawState) return;
      const actingId = getActingPlayerIdPure(room.gameId, rawState);
      if (
        !actingId ||
        !canControlPlayerOnDevicePure(ctx.model, room, actingId)
      ) {
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
        ctx.model = {
          ...ctx.model,
          azulSelectedDraft: {
            source: rec.source,
            color: rec.color,
          },
        };
        ctx.render();
        return;
      }
      if (rec) {
        ctx.model = { ...ctx.model, azulSelectedDraft: null };
        ctx.dispatchUiAction(actingId, rec);
      }
    });
}

export function bindLocaleSelectorEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  root.querySelector("#sel-locale")?.addEventListener("change", (e) => {
    const nextLocale = (e.target as HTMLSelectElement).value as SupportedLocale;
    ctx.setLocale(nextLocale);
  });
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

  root
    .querySelector("#sel-user-identity")
    ?.addEventListener("change", (e) => {
      const selectedId = (e.target as HTMLSelectElement).value;
      ctx.switchActiveGuest(selectedId);
    });

  root
    .querySelector("#btn-edit-guest-name")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        editingGuestName: true,
        guestRenameDraft: ctx.model.currentUserName,
      };
      ctx.render();
      const inp = root.querySelector?.(
        "#inp-rename-guest"
      ) as HTMLInputElement | null;
      inp?.focus?.();
      inp?.select?.();
    });

  root
    .querySelector("#inp-rename-guest")
    ?.addEventListener("input", (e) => {
      ctx.model = {
        ...ctx.model,
        guestRenameDraft: (e.target as HTMLInputElement).value,
      };
    });

  root
    .querySelector("#inp-rename-guest")
    ?.addEventListener("keydown", (e: any) => {
      if (e.key === "Escape") {
        ctx.model = {
          ...ctx.model,
          editingGuestName: false,
          guestRenameDraft: "",
        };
        ctx.render();
      }
    });

  root
    .querySelector("#form-rename-guest")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      ctx.renameCurrentGuest(ctx.model.guestRenameDraft);
    });

  root
    .querySelector("#btn-cancel-guest-name")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        editingGuestName: false,
        guestRenameDraft: "",
      };
      ctx.render();
    });

  root.querySelector("#btn-add-guest")?.addEventListener("click", () => {
    ctx.openAddGuestView();
  });

  root.querySelector("#btn-sign-out")?.addEventListener("click", () => {
    ctx.syncUrlRoomHash(null);
    ctx.signOutGuest();
  });

  root.querySelectorAll("[data-copy-room-link]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const rId = btn.getAttribute("data-copy-room-link");
      if (rId) {
        ctx.copyRoomShareLink(rId);
      }
    });
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

  root
    .querySelector("#btn-start-solo-game")
    ?.addEventListener("click", () => {
      ctx.startSoloGameFromLogin(ctx.model.loginDraftName);
    });

  root
    .querySelector("#btn-start-offline-local")
    ?.addEventListener("click", () => {
      ctx.startOfflineLocalFromLogin(ctx.model.loginDraftName);
    });

  root
    .querySelector("#btn-cancel-add-guest")
    ?.addEventListener("click", () => {
      ctx.model = {
        ...ctx.model,
        addingAdditionalGuest: false,
        loginErrorMsg: "",
        viewMode: ctx.model.returnViewAfterAddGuest,
      };
      ctx.render();
    });

  root.querySelectorAll("[data-select-saved-guest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const guestId = btn.getAttribute("data-select-saved-guest")!;
      const found = ctx.model.deviceGuests.find((g) => g.id === guestId);
      if (found) {
        ctx.signInAsGuest(found.name, found.id);
      }
    });
  });

  root.querySelectorAll("[data-remove-saved-guest]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const guestId = btn.getAttribute("data-remove-saved-guest")!;
      ctx.removeDeviceGuest(guestId);
    });
  });
}

export function bindLobbyEvents(ctx: AppRuntimeContext): void {
  const { root } = ctx;
  bindCommonIdentityEvents(ctx);

  root.querySelectorAll("[data-lobby-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      const filter = el.getAttribute("data-lobby-filter") as SupportedGameId;
      ctx.model = {
        ...ctx.model,
        lobbyGameFilter: filter,
        createRoomGameId: filter,
      };
      ctx.render();
    });
  });

  root
    .querySelector("#sel-create-room-mode")
    ?.addEventListener("change", (e) => {
      ctx.model = {
        ...ctx.model,
        createRoomMode: (e.target as HTMLSelectElement).value as
          | "online"
          | "offline",
      };
      ctx.render();
    });

  root.querySelector("#btn-create-room")?.addEventListener("click", () => {
    ctx.createAndOpenRoom();
  });

  root.querySelectorAll("[data-join-room]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rId = btn.getAttribute("data-join-room")!;
      ctx.enterOrJoinRoom(rId);
    });
  });

  root.querySelectorAll("[data-start-room-direct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rId = btn.getAttribute("data-start-room-direct")!;
      ctx.startRoomMatch(rId);
    });
  });
}
