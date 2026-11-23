import { CATAN_MAP_VIEWPORT_CONFIG } from "../config/app-config.ts";

export interface CatanMapViewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface CatanBoardViewBox {
  readonly vbX: number;
  readonly vbY: number;
  readonly vbW: number;
  readonly vbH: number;
}

interface ViewportRectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_CATAN_MAP_VIEWPORT: CatanMapViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

const VIEWPORT_EPSILON = 1e-4;

function normalizeZero(n: number): number {
  return Math.abs(n) < VIEWPORT_EPSILON ? 0 : n;
}

export function isDefaultCatanMapViewportPure(
  viewport?: CatanMapViewport | null
): boolean {
  if (!viewport) return true;
  return (
    Math.abs(viewport.zoom - DEFAULT_CATAN_MAP_VIEWPORT.zoom) < VIEWPORT_EPSILON &&
    Math.abs(viewport.panX) < VIEWPORT_EPSILON &&
    Math.abs(viewport.panY) < VIEWPORT_EPSILON
  );
}

export function resetCatanMapViewportPure(): CatanMapViewport {
  return { ...DEFAULT_CATAN_MAP_VIEWPORT };
}

export function clampCatanMapViewportPure(
  viewport: Partial<CatanMapViewport> | null | undefined,
  baseVb: CatanBoardViewBox
): CatanMapViewport {
  const { minZoom, maxZoom, panOverflowRatio, maxPanCenterRatio } =
    CATAN_MAP_VIEWPORT_CONFIG;
  const rawZoom = viewport?.zoom;
  const zoom =
    typeof rawZoom === "number" && Number.isFinite(rawZoom)
      ? Math.max(minZoom, Math.min(maxZoom, rawZoom))
      : DEFAULT_CATAN_MAP_VIEWPORT.zoom;

  const camW = Math.max(1, baseVb.vbW) / zoom;
  const camH = Math.max(1, baseVb.vbH) / zoom;
  const maxPanX = Math.min(
    baseVb.vbW * maxPanCenterRatio,
    Math.max(0, (baseVb.vbW - camW) / 2) + baseVb.vbW * panOverflowRatio
  );
  const maxPanY = Math.min(
    baseVb.vbH * maxPanCenterRatio,
    Math.max(0, (baseVb.vbH - camH) / 2) + baseVb.vbH * panOverflowRatio
  );

  const rawPanX = viewport?.panX;
  const rawPanY = viewport?.panY;
  const panX =
    typeof rawPanX === "number" && Number.isFinite(rawPanX)
      ? normalizeZero(Math.max(-maxPanX, Math.min(maxPanX, rawPanX)))
      : 0;
  const panY =
    typeof rawPanY === "number" && Number.isFinite(rawPanY)
      ? normalizeZero(Math.max(-maxPanY, Math.min(maxPanY, rawPanY)))
      : 0;

  return {
    zoom: Math.abs(zoom - 1) < VIEWPORT_EPSILON ? 1 : zoom,
    panX,
    panY,
  };
}

export function computeCatanCameraViewBoxPure(
  baseVb: CatanBoardViewBox,
  viewport?: CatanMapViewport | null
): CatanBoardViewBox {
  const clamped = clampCatanMapViewportPure(viewport, baseVb);
  if (isDefaultCatanMapViewportPure(clamped)) {
    return baseVb;
  }
  const vbW = baseVb.vbW / clamped.zoom;
  const vbH = baseVb.vbH / clamped.zoom;
  const vbX = baseVb.vbX + (baseVb.vbW - vbW) / 2 + clamped.panX;
  const vbY = baseVb.vbY + (baseVb.vbH - vbH) / 2 + clamped.panY;
  return { vbX, vbY, vbW, vbH };
}

export function formatCatanMapViewBoxPure(
  baseVb: CatanBoardViewBox,
  viewport?: CatanMapViewport | null
): string {
  const clamped = clampCatanMapViewportPure(viewport, baseVb);
  if (isDefaultCatanMapViewportPure(clamped)) {
    return `${baseVb.vbX} ${baseVb.vbY} ${baseVb.vbW} ${baseVb.vbH}`;
  }
  const cam = computeCatanCameraViewBoxPure(baseVb, clamped);
  return `${cam.vbX.toFixed(2)} ${cam.vbY.toFixed(2)} ${cam.vbW.toFixed(2)} ${cam.vbH.toFixed(2)}`;
}

export function computeSvgPixelScalePure(
  baseVb: CatanBoardViewBox,
  viewport: CatanMapViewport | null | undefined,
  svgRect: ViewportRectLike
): number {
  const cam = computeCatanCameraViewBoxPure(baseVb, viewport);
  if (svgRect.width <= 0 || svgRect.height <= 0) {
    return 1;
  }
  return Math.min(
    svgRect.width / Math.max(1, cam.vbW),
    svgRect.height / Math.max(1, cam.vbH)
  );
}

export function screenToSvgPointPure(
  baseVb: CatanBoardViewBox,
  viewport: CatanMapViewport | null | undefined,
  svgRect: ViewportRectLike,
  clientX: number,
  clientY: number
): { readonly x: number; readonly y: number } {
  const cam = computeCatanCameraViewBoxPure(baseVb, viewport);
  const scale = computeSvgPixelScalePure(baseVb, viewport, svgRect);
  const camCenterX = cam.vbX + cam.vbW / 2;
  const camCenterY = cam.vbY + cam.vbH / 2;
  if (scale <= 0 || svgRect.width <= 0 || svgRect.height <= 0) {
    return { x: camCenterX, y: camCenterY };
  }
  const dxPx = clientX - (svgRect.left + svgRect.width / 2);
  const dyPx = clientY - (svgRect.top + svgRect.height / 2);
  return {
    x: camCenterX + dxPx / scale,
    y: camCenterY + dyPx / scale,
  };
}

export function stepCatanMapZoomPure(
  viewport: CatanMapViewport | null | undefined,
  direction: 1 | -1,
  baseVb: CatanBoardViewBox
): CatanMapViewport {
  const current = clampCatanMapViewportPure(viewport, baseVb);
  const { zoomStep, minZoom, maxZoom } = CATAN_MAP_VIEWPORT_CONFIG;
  const snapped =
    Math.round((current.zoom + direction * zoomStep) / zoomStep) * zoomStep;
  const nextZoom = Math.max(minZoom, Math.min(maxZoom, Number(snapped.toFixed(4))));
  return clampCatanMapViewportPure(
    {
      zoom: nextZoom,
      panX: current.panX,
      panY: current.panY,
    },
    baseVb
  );
}

export function zoomCatanMapAtPointPure(
  viewport: CatanMapViewport | null | undefined,
  targetZoom: number,
  anchorSvgX: number,
  anchorSvgY: number,
  baseVb: CatanBoardViewBox
): CatanMapViewport {
  const current = clampCatanMapViewportPure(viewport, baseVb);
  const { minZoom, maxZoom } = CATAN_MAP_VIEWPORT_CONFIG;
  const nextZoom = Number.isFinite(targetZoom)
    ? Math.max(minZoom, Math.min(maxZoom, targetZoom))
    : current.zoom;
  if (Math.abs(nextZoom - current.zoom) < VIEWPORT_EPSILON) {
    return current;
  }
  const baseCenterX = baseVb.vbX + baseVb.vbW / 2;
  const baseCenterY = baseVb.vbY + baseVb.vbH / 2;
  const currentCenterX = baseCenterX + current.panX;
  const currentCenterY = baseCenterY + current.panY;
  const zoomRatio = 1 - current.zoom / nextZoom;
  const nextPanX = current.panX + (anchorSvgX - currentCenterX) * zoomRatio;
  const nextPanY = current.panY + (anchorSvgY - currentCenterY) * zoomRatio;
  return clampCatanMapViewportPure(
    {
      zoom: nextZoom,
      panX: nextPanX,
      panY: nextPanY,
    },
    baseVb
  );
}

export function panCatanMapByPixelsPure(
  viewport: CatanMapViewport | null | undefined,
  deltaPxX: number,
  deltaPxY: number,
  baseVb: CatanBoardViewBox,
  svgRect: ViewportRectLike
): CatanMapViewport {
  const current = clampCatanMapViewportPure(viewport, baseVb);
  const scale = computeSvgPixelScalePure(baseVb, current, svgRect);
  if (scale <= 0) {
    return current;
  }
  return clampCatanMapViewportPure(
    {
      zoom: current.zoom,
      panX: current.panX - deltaPxX / scale,
      panY: current.panY - deltaPxY / scale,
    },
    baseVb
  );
}

export function formatCatanZoomPercentPure(zoom: number): string {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return `${Math.round(safe * 100)}%`;
}
