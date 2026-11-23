import { axialNeighbors, hexId, hexToPixel } from "@gaming-platform/core";
import type { CatanState } from "@gaming-platform/catan";
import type { SupportedLocale } from "../i18n/types.ts";
import {
  type CatanMapViewport,
  computeCatanCameraViewBoxPure,
} from "./viewport.ts";

export interface CatanBoardSvgOptions {
  buildMode: string | null;
  setupEdgeKind: "road" | "ship";
  robberOrPirateMode: "robber" | "pirate";
  selectedMoveFromEdgeId: string | null;
  selectedMoveKnightFromVertexId?: string | null;
  selectedChaseKnightVertexId?: string | null;
  progressTargetHexIds?: readonly string[];
  progressTargetVertexIds?: readonly string[];
  progressTargetEdgeIds?: readonly string[];
  selectedSpot?: { kind: "edge" | "vertex" | "hex"; id: string } | null;
  viewport?: CatanMapViewport | null;
  locale?: SupportedLocale;
}

export interface OuterOceanHexNode {
  id: string;
  q: number;
  r: number;
  centerX: number;
  centerY: number;
}

/**
 * Pure hex color tint/shade helper for 3D wooden game pieces.
 * Positive `amount` mixes toward white; negative `amount` mixes toward black.
 */
export function shadeHexColor(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return hex;
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  if (amount >= 0) {
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    const f = 1 + amount;
    r = Math.round(r * f);
    g = Math.round(g * f);
    b = Math.round(b * f);
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getPolygonPoints(
  centerX: number,
  centerY: number,
  size: number
): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = ((60 * i - 90) * Math.PI) / 180;
    const x = (centerX + size * Math.cos(angleRad)).toFixed(2);
    const y = (centerY + size * Math.sin(angleRad)).toFixed(2);
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
}

export function getHexCornerCoords(
  centerX: number,
  centerY: number,
  size: number
): Array<{ x: number; y: number }> {
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angleRad = ((60 * i - 90) * Math.PI) / 180;
    corners.push({
      x: centerX + size * Math.cos(angleRad),
      y: centerY + size * Math.sin(angleRad),
    });
  }
  return corners;
}

export function computeOuterOceanHexes(
  state: CatanState
): Map<string, OuterOceanHexNode> {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const outerOceanHexes = new Map<string, OuterOceanHexNode>();
  for (const hId of topo.hexOrder) {
    const hNode = topo.hexes[hId]!;
    for (const nb of axialNeighbors({ q: hNode.q, r: hNode.r })) {
      const nbId = hexId(nb.q, nb.r);
      if (!topo.hexes[nbId] && !outerOceanHexes.has(nbId)) {
        const pt = hexToPixel(nb.q, nb.r, hexSize);
        outerOceanHexes.set(nbId, {
          id: nbId,
          q: nb.q,
          r: nb.r,
          centerX: pt.x,
          centerY: pt.y,
        });
      }
    }
  }
  return outerOceanHexes;
}

export function getCatanBoardViewBox(
  state: CatanState,
  precomputedOuterOceanHexes?: ReadonlyMap<string, OuterOceanHexNode>
): {
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
} {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const outerOceanHexes =
    precomputedOuterOceanHexes ?? computeOuterOceanHexes(state);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const vId of topo.vertexOrder) {
    const v = topo.vertices[vId]!;
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  for (const oceanHex of outerOceanHexes.values()) {
    for (const c of getHexCornerCoords(
      oceanHex.centerX,
      oceanHex.centerY,
      hexSize
    )) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
  }

  const pad = 28;
  return {
    vbX: Math.floor(minX - pad),
    vbY: Math.floor(minY - pad),
    vbW: Math.ceil(maxX - minX + pad * 2),
    vbH: Math.ceil(maxY - minY + pad * 2),
  };
}

export function getBoardSpotSvgCoords(
  state: CatanState,
  spot: { kind: "edge" | "vertex" | "hex"; id: string }
): { x: number; y: number } {
  const vb = getCatanBoardViewBox(state);
  if (spot.kind === "edge") {
    const e = state.topology.edges[spot.id];
    if (e) return { x: e.midX, y: e.midY };
  } else if (spot.kind === "vertex") {
    const v = state.topology.vertices[spot.id];
    if (v) return { x: v.x, y: v.y };
  } else {
    const h = state.topology.hexes[spot.id];
    if (h) return { x: h.centerX, y: h.centerY };
  }
  return { x: vb.vbX + vb.vbW / 2, y: vb.vbY + vb.vbH / 2 };
}

export function getBoardSpotPercentPosition(
  state: CatanState,
  spot: { kind: "edge" | "vertex" | "hex"; id: string },
  viewport?: CatanMapViewport | null
): { xPct: number; yPct: number } {
  const vb = computeCatanCameraViewBoxPure(
    getCatanBoardViewBox(state),
    viewport
  );
  const { x, y } = getBoardSpotSvgCoords(state, spot);
  const rawX = ((x - vb.vbX) / Math.max(1, vb.vbW)) * 100;
  const rawY = ((y - vb.vbY) / Math.max(1, vb.vbH)) * 100;
  return {
    xPct: Math.max(16, Math.min(84, rawX)),
    yPct: Math.max(18, Math.min(82, rawY)),
  };
}
