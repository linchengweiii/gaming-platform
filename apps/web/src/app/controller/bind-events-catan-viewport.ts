import type { CatanState } from "@gaming-platform/catan";
import {
  type CatanBoardViewBox,
  type CatanMapViewport,
  clampCatanMapViewportPure,
  formatCatanMapViewBoxPure,
  formatCatanZoomPercentPure,
  getCatanBoardViewBox,
  isDefaultCatanMapViewportPure,
  panCatanMapByPixelsPure,
  resetCatanMapViewportPure,
  screenToSvgPointPure,
  stepCatanMapZoomPure,
  zoomCatanMapAtPointPure,
} from "../../catan-graphics.ts";
import { CATAN_MAP_VIEWPORT_CONFIG } from "../../config/app-config.ts";
import { findActiveRoomPure, getRoomStatePure } from "../helpers/room-queries.ts";
import type { AppRuntimeContext } from "./context.ts";
import { alignCatanSpotPopoverToSvg } from "./render-and-dropdowns.ts";

const MAP_HUD_EXCLUSION_SELECTOR = [
  ".map-zoom-controls",
  ".map-spot-popover",
  ".map-build-dock",
  ".map-end-turn-hud",
  ".map-decision-popup",
  ".ga-tutorial-coach",
  ".map-dice-hud",
  ".map-barbarian-hud",
].join(", ");

function isTargetInsideMapHud(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const closestFn = (target as { closest?: (sel: string) => unknown }).closest;
  if (typeof closestFn !== "function") return false;
  return Boolean(closestFn.call(target, MAP_HUD_EXCLUSION_SELECTOR));
}

function applyCatanViewportToDom(
  ctx: AppRuntimeContext,
  baseVb: CatanBoardViewBox,
  nextViewport: CatanMapViewport
): CatanMapViewport {
  const clamped = clampCatanMapViewportPure(nextViewport, baseVb);
  ctx.model = {
    ...ctx.model,
    catanMapViewport: clamped,
  };

  const { root } = ctx;
  const svg = root.querySelector(".board-svg") as SVGSVGElement | null;
  if (svg && typeof svg.setAttribute === "function") {
    svg.setAttribute("viewBox", formatCatanMapViewBoxPure(baseVb, clamped));
  }

  const btnOut = root.querySelector(
    "#btn-map-zoom-out"
  ) as HTMLButtonElement | null;
  const btnReset = root.querySelector(
    "#btn-map-zoom-reset"
  ) as HTMLButtonElement | null;
  const btnIn = root.querySelector(
    "#btn-map-zoom-in"
  ) as HTMLButtonElement | null;

  if (btnOut) {
    btnOut.disabled = clamped.zoom <= CATAN_MAP_VIEWPORT_CONFIG.minZoom + 1e-4;
  }
  if (btnIn) {
    btnIn.disabled = clamped.zoom >= CATAN_MAP_VIEWPORT_CONFIG.maxZoom - 1e-4;
  }
  if (btnReset) {
    btnReset.textContent = formatCatanZoomPercentPure(clamped.zoom);
    btnReset.disabled = isDefaultCatanMapViewportPure(clamped);
  }

  alignCatanSpotPopoverToSvg(root);
  return clamped;
}

export function bindCatanMapViewportEvents(
  ctx: AppRuntimeContext,
  state: CatanState
): void {
  const { root } = ctx;
  const baseVb = getCatanBoardViewBox(state);

  root.querySelector("#btn-map-zoom-in")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = stepCatanMapZoomPure(ctx.model.catanMapViewport, 1, baseVb);
    applyCatanViewportToDom(ctx, baseVb, next);
  });

  root.querySelector("#btn-map-zoom-out")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = stepCatanMapZoomPure(ctx.model.catanMapViewport, -1, baseVb);
    applyCatanViewportToDom(ctx, baseVb, next);
  });

  root.querySelector("#btn-map-zoom-reset")?.addEventListener("click", (e) => {
    e.stopPropagation();
    applyCatanViewportToDom(ctx, baseVb, resetCatanMapViewportPure());
  });

  const wrap = root.querySelector(".board-svg-wrap") as HTMLElement | null;
  const svg = wrap?.querySelector(".board-svg") as SVGSVGElement | null;
  if (!wrap || !svg) return;

  const activePointers = new Map<number, { clientX: number; clientY: number }>();
  let dragStart = { clientX: 0, clientY: 0 };
  let isDragging = false;
  let capturedPointerId: number | null = null;
  let suppressNextClick = false;
  let suppressResetTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleClickSuppressionClear = (): void => {
    if (suppressResetTimer) clearTimeout(suppressResetTimer);
    suppressResetTimer = setTimeout(() => {
      suppressNextClick = false;
      suppressResetTimer = null;
    }, 0);
  };

  const cleanupDragState = (): void => {
    activePointers.clear();
    isDragging = false;
    capturedPointerId = null;
    wrap.classList?.remove("is-panning");
    if (suppressResetTimer) {
      clearTimeout(suppressResetTimer);
      suppressResetTimer = null;
    }
  };
  ctx.cleanupViewportDrag = cleanupDragState;

  wrap.addEventListener(
    "click",
    (e) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      if (suppressResetTimer) {
        clearTimeout(suppressResetTimer);
        suppressResetTimer = null;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  wrap.addEventListener(
    "wheel",
    (e) => {
      if (isTargetInsideMapHud(e.target)) return;
      if (typeof svg.getBoundingClientRect !== "function") return;
      const svgRect = svg.getBoundingClientRect();
      if (svgRect.width <= 0 || svgRect.height <= 0) return;

      e.preventDefault();
      const rawDelta =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * 300
            : e.deltaY;
      const clampedDelta = Math.max(
        -CATAN_MAP_VIEWPORT_CONFIG.maxWheelDelta,
        Math.min(CATAN_MAP_VIEWPORT_CONFIG.maxWheelDelta, rawDelta)
      );
      if (Math.abs(clampedDelta) < 0.01) return;

      const sensitivity = e.ctrlKey
        ? CATAN_MAP_VIEWPORT_CONFIG.pinchWheelSensitivity
        : CATAN_MAP_VIEWPORT_CONFIG.wheelZoomSensitivity;
      const factor = Math.exp(-clampedDelta * sensitivity);
      const anchor = screenToSvgPointPure(
        baseVb,
        ctx.model.catanMapViewport,
        svgRect,
        e.clientX,
        e.clientY
      );
      const next = zoomCatanMapAtPointPure(
        ctx.model.catanMapViewport,
        ctx.model.catanMapViewport.zoom * factor,
        anchor.x,
        anchor.y,
        baseVb
      );
      applyCatanViewportToDom(ctx, baseVb, next);
    },
    { passive: false }
  );

  const preventSafariGesture = (e: Event): void => {
    if (isTargetInsideMapHud(e.target)) return;
    e.preventDefault();
  };
  wrap.addEventListener("gesturestart", preventSafariGesture, { passive: false });
  wrap.addEventListener("gesturechange", preventSafariGesture, { passive: false });

  wrap.addEventListener("pointerdown", (e) => {
    if (isTargetInsideMapHud(e.target)) return;
    if (typeof e.button === "number" && e.button !== 0) return;

    const ptr = { clientX: e.clientX, clientY: e.clientY };
    activePointers.set(e.pointerId, ptr);
    if (activePointers.size === 1) {
      dragStart = ptr;
      isDragging = false;
    } else if (activePointers.size === 2) {
      isDragging = true;
      wrap.classList?.add("is-panning");
    }
  });

  wrap.addEventListener("pointermove", (e) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    if (typeof svg.getBoundingClientRect !== "function") return;
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) return;

    const nextPtr = { clientX: e.clientX, clientY: e.clientY };

    if (activePointers.size === 1) {
      if (!isDragging) {
        const dist = Math.hypot(
          nextPtr.clientX - dragStart.clientX,
          nextPtr.clientY - dragStart.clientY
        );
        const threshold =
          e.pointerType === "touch"
            ? CATAN_MAP_VIEWPORT_CONFIG.touchDragThresholdPx
            : CATAN_MAP_VIEWPORT_CONFIG.dragThresholdPx;
        if (dist < threshold) {
          return;
        }
        isDragging = true;
        wrap.classList?.add("is-panning");
        try {
          wrap.setPointerCapture?.(e.pointerId);
          capturedPointerId = e.pointerId;
        } catch {
          // Ignore synthetic pointer capture errors
        }
      }

      const dx = nextPtr.clientX - prev.clientX;
      const dy = nextPtr.clientY - prev.clientY;
      activePointers.set(e.pointerId, nextPtr);
      const panned = panCatanMapByPixelsPure(
        ctx.model.catanMapViewport,
        dx,
        dy,
        baseVb,
        svgRect
      );
      applyCatanViewportToDom(ctx, baseVb, panned);
      return;
    }

    if (activePointers.size === 2) {
      const entries = Array.from(activePointers.entries());
      const other = entries.find(([id]) => id !== e.pointerId)?.[1];
      activePointers.set(e.pointerId, nextPtr);
      if (!other) return;

      const prevDist = Math.hypot(
        prev.clientX - other.clientX,
        prev.clientY - other.clientY
      );
      const nextDist = Math.hypot(
        nextPtr.clientX - other.clientX,
        nextPtr.clientY - other.clientY
      );
      const prevMidX = (prev.clientX + other.clientX) / 2;
      const prevMidY = (prev.clientY + other.clientY) / 2;
      const nextMidX = (nextPtr.clientX + other.clientX) / 2;
      const nextMidY = (nextPtr.clientY + other.clientY) / 2;

      let nextVp = ctx.model.catanMapViewport;
      if (prevDist > 1 && nextDist > 1) {
        const anchor = screenToSvgPointPure(
          baseVb,
          nextVp,
          svgRect,
          prevMidX,
          prevMidY
        );
        nextVp = zoomCatanMapAtPointPure(
          nextVp,
          nextVp.zoom * (nextDist / prevDist),
          anchor.x,
          anchor.y,
          baseVb
        );
      }
      nextVp = panCatanMapByPixelsPure(
        nextVp,
        nextMidX - prevMidX,
        nextMidY - prevMidY,
        baseVb,
        svgRect
      );
      applyCatanViewportToDom(ctx, baseVb, nextVp);
    }
  });

  const endPointer = (e: PointerEvent): void => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (capturedPointerId === e.pointerId) {
      try {
        wrap.releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignore synthetic release errors
      }
      capturedPointerId = null;
    }
    if (activePointers.size === 0) {
      if (isDragging) {
        suppressNextClick = true;
        scheduleClickSuppressionClear();
      }
      isDragging = false;
      wrap.classList?.remove("is-panning");
    } else if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0]!;
      dragStart = remaining;
    }
  };

  wrap.addEventListener("pointerup", endPointer);
  wrap.addEventListener("pointercancel", endPointer);
  wrap.addEventListener("pointerleave", (e) => {
    if (!isDragging && activePointers.has(e.pointerId)) {
      activePointers.delete(e.pointerId);
    }
  });
}

export function registerGlobalCatanMapShortcuts(ctx: AppRuntimeContext): void {
  if (typeof document === "undefined") return;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
    if (!ctx.model.isAuthenticated || ctx.model.viewMode !== "in_game") return;
    if (ctx.root.querySelector(".ga-dropdown.is-open")) return;

    const room = findActiveRoomPure(ctx.model);
    if (!room || room.gameId !== "catan") return;
    const rawState = getRoomStatePure(ctx.model, room) as CatanState | null;
    if (!rawState) return;

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      const baseVb = getCatanBoardViewBox(rawState);
      const next = stepCatanMapZoomPure(ctx.model.catanMapViewport, 1, baseVb);
      applyCatanViewportToDom(ctx, baseVb, next);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      const baseVb = getCatanBoardViewBox(rawState);
      const next = stepCatanMapZoomPure(ctx.model.catanMapViewport, -1, baseVb);
      applyCatanViewportToDom(ctx, baseVb, next);
    } else if (e.key === "0") {
      e.preventDefault();
      const baseVb = getCatanBoardViewBox(rawState);
      applyCatanViewportToDom(ctx, baseVb, resetCatanMapViewportPure());
    }
  });
}
