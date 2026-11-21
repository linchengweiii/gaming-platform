import { findActiveRoomPure, getRoomStatePure } from "../helpers/room-queries.ts";
import type { AppRuntimeContext } from "./context.ts";
import { alignCatanSpotPopoverToSvg } from "./render-and-dropdowns.ts";

function isActiveInGameSession(ctx: AppRuntimeContext): boolean {
  if (!ctx.model.isAuthenticated || ctx.model.viewMode !== "in_game") {
    return false;
  }
  const room = findActiveRoomPure(ctx.model);
  return Boolean(room && getRoomStatePure(ctx.model, room));
}

function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function requestNativeFullscreen(): {
  readonly activeNow: boolean;
  readonly promise: Promise<boolean>;
} {
  if (typeof document === "undefined") {
    return { activeNow: false, promise: Promise.resolve(false) };
  }
  if (getFullscreenElement()) {
    return { activeNow: true, promise: Promise.resolve(true) };
  }
  const docEl = document.documentElement as
    | (HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      })
    | null;
  if (!docEl) return { activeNow: false, promise: Promise.resolve(false) };
  const reqFn =
    typeof docEl.requestFullscreen === "function"
      ? () => docEl.requestFullscreen()
      : typeof docEl.webkitRequestFullscreen === "function"
        ? () => docEl.webkitRequestFullscreen!()
        : null;
  if (!reqFn) return { activeNow: false, promise: Promise.resolve(false) };
  try {
    const result = reqFn();
    const activeNow = Boolean(getFullscreenElement());
    const promise = Promise.resolve(result).then(
      () => true,
      () => false
    );
    return { activeNow, promise };
  } catch {
    return { activeNow: false, promise: Promise.resolve(false) };
  }
}

function exitNativeFullscreen(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (!getFullscreenElement()) return Promise.resolve();
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const exitFn =
    typeof doc.exitFullscreen === "function"
      ? () => doc.exitFullscreen()
      : typeof doc.webkitExitFullscreen === "function"
        ? () => doc.webkitExitFullscreen!()
        : null;
  if (!exitFn) return Promise.resolve();
  try {
    return Promise.resolve(exitFn()).then(
      () => {},
      () => {}
    );
  } catch {
    return Promise.resolve();
  }
}

export function attachFullscreenActions(ctx: AppRuntimeContext): {
  readonly registerGlobalListeners: () => void;
} {
  let nativeFullscreenOwned = false;

  const exitNativeFullscreenIfOwned = (): void => {
    const hadOwnership = nativeFullscreenOwned;
    nativeFullscreenOwned = false;
    if (hadOwnership || getFullscreenElement()) {
      void exitNativeFullscreen();
    }
  };

  const setBoardFullscreen = (enabled: boolean): void => {
    const nextEnabled = Boolean(enabled) && isActiveInGameSession(ctx);
    const prevEnabled = ctx.model.boardFullscreen;
    const nextSidebarOpen = nextEnabled ? ctx.model.fullscreenSidebarOpen : false;

    if (
      prevEnabled === nextEnabled &&
      ctx.model.fullscreenSidebarOpen === nextSidebarOpen
    ) {
      return;
    }

    ctx.model = {
      ...ctx.model,
      boardFullscreen: nextEnabled,
      fullscreenSidebarOpen: nextSidebarOpen,
    };

    if (nextEnabled) {
      const req = requestNativeFullscreen();
      if (req.activeNow) {
        nativeFullscreenOwned = true;
      }
      void req.promise.then((entered) => {
        if (entered && ctx.model.boardFullscreen) {
          nativeFullscreenOwned = true;
        } else if (!entered) {
          nativeFullscreenOwned = false;
        }
      });
    } else {
      exitNativeFullscreenIfOwned();
    }

    ctx.render();
    alignCatanSpotPopoverToSvg(ctx.root);
  };

  const toggleBoardFullscreen = (): void => {
    setBoardFullscreen(!ctx.model.boardFullscreen);
  };

  const toggleFullscreenSidebar = (): void => {
    if (!ctx.model.boardFullscreen) return;
    ctx.model = {
      ...ctx.model,
      fullscreenSidebarOpen: !ctx.model.fullscreenSidebarOpen,
    };
    ctx.render();
  };

  ctx.setBoardFullscreen = setBoardFullscreen;
  ctx.toggleBoardFullscreen = toggleBoardFullscreen;
  ctx.toggleFullscreenSidebar = toggleFullscreenSidebar;
  ctx.exitNativeFullscreenIfOwned = exitNativeFullscreenIfOwned;

  const registerGlobalListeners = (): void => {
    if (typeof document !== "undefined") {
      const handleFullscreenChange = (): void => {
        const fsEl = getFullscreenElement();
        if (fsEl) {
          if (ctx.model.boardFullscreen) {
            nativeFullscreenOwned = true;
          }
        } else if (nativeFullscreenOwned) {
          nativeFullscreenOwned = false;
          if (ctx.model.boardFullscreen) {
            ctx.model = {
              ...ctx.model,
              boardFullscreen: false,
              fullscreenSidebarOpen: false,
            };
            ctx.render();
          }
        }
        alignCatanSpotPopoverToSvg(ctx.root);
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      document.addEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );

      document.addEventListener("keydown", (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toUpperCase();
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target?.isContentEditable
        ) {
          return;
        }
        if (!isActiveInGameSession(ctx)) return;
        if (ctx.root.querySelector(".ga-dropdown.is-open")) return;
        if (ctx.model.guideModalGameId) return;

        if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          ctx.toggleBoardFullscreen();
        } else if (e.key === "Escape" && ctx.model.boardFullscreen) {
          e.preventDefault();
          if (ctx.model.fullscreenSidebarOpen) {
            ctx.toggleFullscreenSidebar();
          } else {
            ctx.setBoardFullscreen(false);
          }
        }
      });
    }

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("resize", () => {
        if (isActiveInGameSession(ctx)) {
          alignCatanSpotPopoverToSvg(ctx.root);
        }
      });
    }
  };

  return { registerGlobalListeners };
}
