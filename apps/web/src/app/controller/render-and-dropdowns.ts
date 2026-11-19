import {
  findActiveRoomPure,
  getActiveRoomPure,
  getRoomStatePure,
  roomUsesServerPure,
} from "../helpers/room-queries.ts";
import { renderInGameViewPure } from "../views/in-game/index.ts";
import { renderLobbyViewPure } from "../views/lobby-view.ts";
import { renderLoginViewPure } from "../views/login-and-topbar-view.ts";
import { renderRoomSetupViewPure } from "../views/room-setup-view.ts";
import { bindInGameEvents } from "./bind-events-in-game.ts";
import { bindRoomSetupEvents } from "./bind-events-room-setup.ts";
import { bindLobbyEvents, bindLoginEvents } from "./bind-events-shell.ts";
import type { AppRuntimeContext } from "./context.ts";

export function closeDropdownElement(dd: HTMLElement): void {
  dd.classList.remove("is-open");
  const trigger = dd.querySelector(
    ".ga-dropdown__trigger"
  ) as HTMLButtonElement | null;
  const menu = dd.querySelector(".ga-dropdown__menu") as HTMLElement | null;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  if (menu) menu.hidden = true;
}

export function registerGlobalDropdownDismiss(root: HTMLElement): void {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerdown", (e) => {
    const target = e.target as Node | null;
    root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
      if (!target || !dd.contains(target)) {
        closeDropdownElement(dd as HTMLElement);
      }
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      root.querySelectorAll(".ga-dropdown.is-open").forEach((dd) => {
        const trigger = dd.querySelector(
          ".ga-dropdown__trigger"
        ) as HTMLButtonElement | null;
        closeDropdownElement(dd as HTMLElement);
        trigger?.focus();
      });
    }
  });
}

export function bindDropdownEventsOnRoot(root: HTMLElement): void {
  root.querySelectorAll("[data-dropdown-root]").forEach((el) => {
    const dd = el as HTMLElement;
    const selectEl = dd.querySelector(
      ".ga-dropdown__native"
    ) as HTMLSelectElement | null;
    const trigger = dd.querySelector(
      ".ga-dropdown__trigger"
    ) as HTMLButtonElement | null;
    const menu = dd.querySelector(".ga-dropdown__menu") as HTMLElement | null;
    const valueSpan = dd.querySelector(
      ".ga-dropdown__value"
    ) as HTMLElement | null;
    const metaSpan = dd.querySelector(
      ".ga-dropdown__label-group .ga-dropdown__meta"
    ) as HTMLElement | null;

    if (!selectEl || !trigger || !menu) return;

    const options = Array.from(
      menu.querySelectorAll(".ga-dropdown__option")
    ) as HTMLButtonElement[];

    const openMenu = (focusSelected = false) => {
      if (trigger.disabled) return;
      root.querySelectorAll(".ga-dropdown.is-open").forEach((other) => {
        if (other !== dd) closeDropdownElement(other as HTMLElement);
      });
      dd.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      if (focusSelected) {
        const activeOpt =
          options.find((o) => o.getAttribute("aria-selected") === "true") ??
          options[0];
        activeOpt?.focus();
      }
    };

    trigger.addEventListener("click", () => {
      if (trigger.disabled) return;
      if (dd.classList.contains("is-open")) {
        closeDropdownElement(dd);
      } else {
        openMenu(false);
      }
    });

    trigger.addEventListener("keydown", (e) => {
      if (trigger.disabled) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(true);
      }
    });

    menu.addEventListener("keydown", (e) => {
      const idx = options.indexOf(
        document.activeElement as HTMLButtonElement
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = options[(idx + 1 + options.length) % options.length];
        next?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = options[(idx - 1 + options.length) % options.length];
        prev?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        options[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        options[options.length - 1]?.focus();
      } else if (e.key === "Tab") {
        closeDropdownElement(dd);
      }
    });

    options.forEach((optBtn) => {
      optBtn.addEventListener("click", () => {
        const nextVal = optBtn.getAttribute("data-dropdown-value") ?? "";
        const nextLabel = optBtn.getAttribute("data-dropdown-label") ?? "";
        const nextMeta = optBtn.getAttribute("data-dropdown-meta") ?? "";

        selectEl.value = nextVal;
        if (valueSpan) valueSpan.textContent = nextLabel;
        if (metaSpan) {
          metaSpan.textContent = nextMeta;
          metaSpan.hidden = !nextMeta;
        }
        options.forEach((o) =>
          o.setAttribute("aria-selected", o === optBtn ? "true" : "false")
        );
        closeDropdownElement(dd);
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  });
}

export function attachRenderHandlers(ctx: AppRuntimeContext): void {
  const { root } = ctx;

  const renderPreservingFocus = (): void => {
    const activeEl =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    if (
      activeEl &&
      (activeEl.id === "inp-create-room-name" ||
        activeEl.id === "setup-room-name" ||
        activeEl.id === "inp-guest-name" ||
        activeEl.id === "inp-rename-guest" ||
        activeEl.id === "inp-local-friend-name")
    ) {
      return;
    }
    ctx.render();
  };

  const render = (): void => {
    const activeRoom = getActiveRoomPure(ctx.model);
    const inActiveGame =
      ctx.model.isAuthenticated &&
      ctx.model.viewMode === "in_game" &&
      Boolean(activeRoom && getRoomStatePure(ctx.model, activeRoom));
    if (typeof document !== "undefined" && document.body?.classList) {
      document.body.classList.toggle("ga-body--in-game", inActiveGame);
    }

    if (!ctx.model.isAuthenticated || ctx.model.viewMode === "login") {
      ctx.scheduleOnlineBotWatchdogIfNeeded();
      root.innerHTML = renderLoginViewPure(ctx.model);
      bindLoginEvents(ctx);
      ctx.model = { ...ctx.model, loginHeroEnteredOnce: true };
      return;
    }
    if (ctx.model.viewMode === "lobby") {
      ctx.scheduleOnlineBotWatchdogIfNeeded();
      root.innerHTML = renderLobbyViewPure(ctx.model);
      bindLobbyEvents(ctx);
      ctx.model = { ...ctx.model, lobbyHeroEnteredOnce: true };
      return;
    }
    if (ctx.model.viewMode === "room_setup") {
      ctx.scheduleOnlineBotWatchdogIfNeeded();
      const room = findActiveRoomPure(ctx.model);
      if (!room) {
        ctx.model = { ...ctx.model, activeRoomId: "", viewMode: "lobby" };
        root.innerHTML = renderLobbyViewPure(ctx.model);
        bindLobbyEvents(ctx);
        return;
      }
      const setupRendered = renderRoomSetupViewPure(ctx.model, room);
      root.innerHTML = setupRendered.html;
      bindRoomSetupEvents(
        ctx,
        room,
        setupRendered.canEditSetup,
        setupRendered.maxBots,
        setupRendered.bounds
      );
      return;
    }

    const room = findActiveRoomPure(ctx.model);
    if (!room) {
      ctx.model = { ...ctx.model, activeRoomId: "", viewMode: "lobby" };
      ctx.scheduleOnlineBotWatchdogIfNeeded();
      root.innerHTML = renderLobbyViewPure(ctx.model);
      bindLobbyEvents(ctx);
      return;
    }
    const rawState = getRoomStatePure(ctx.model, room);
    const usesServer = roomUsesServerPure(ctx.model, room);
    if (!rawState) {
      if (usesServer) {
        ctx.model = { ...ctx.model, viewMode: "room_setup" };
        ctx.scheduleOnlineBotWatchdogIfNeeded();
        const setupRendered = renderRoomSetupViewPure(ctx.model, room);
        root.innerHTML = setupRendered.html;
        bindRoomSetupEvents(
          ctx,
          room,
          setupRendered.canEditSetup,
          setupRendered.maxBots,
          setupRendered.bounds
        );
      } else {
        ctx.startRoomMatch(room.roomId);
      }
      return;
    }

    const inGameRendered = renderInGameViewPure(ctx.model, room, rawState);
    ctx.model = inGameRendered.model;
    root.innerHTML = inGameRendered.html;
    bindInGameEvents(
      ctx,
      room,
      inGameRendered.state,
      inGameRendered.actingPlayerId,
      inGameRendered.canCancelMyTrade
    );
    ctx.scheduleOnlineBotWatchdogIfNeeded();
  };

  ctx.renderPreservingFocus = renderPreservingFocus;
  ctx.render = render;
}
