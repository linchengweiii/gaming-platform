import { hexId } from "@gaming-platform/core";
import type { CatanState } from "@gaming-platform/catan";
import {
  renderBoardDefsAndChartHeaderPart,
  renderOceanWavesIllustration,
} from "./defs-and-terrain.ts";
import {
  type CatanBoardSvgOptions,
  type OuterOceanHexNode,
  computeOuterOceanHexes,
  getHexCornerCoords,
  getPolygonPoints,
} from "./geometry.ts";
import { buildHexAndHarborParts } from "./harbors-and-tokens.ts";
import {
  buildEdgesAndVerticesParts,
  computeClickableBoardTargets,
} from "./overlays-svg.ts";

function buildOceanAndShelfParts(
  state: CatanState,
  outerOceanHexes: ReadonlyMap<string, OuterOceanHexNode>
): readonly string[] {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const parts: string[] = [];

  const neighborDirs = [
    { dq: 1, dr: -1 },
    { dq: 1, dr: 0 },
    { dq: 0, dr: 1 },
    { dq: -1, dr: 1 },
    { dq: -1, dr: 0 },
    { dq: 0, dr: -1 },
  ];

  let oceanIdx = 0;
  const perimeterSegments: string[] = [];
  for (const oceanHex of outerOceanHexes.values()) {
    oceanIdx++;
    const waterPts = getPolygonPoints(
      oceanHex.centerX,
      oceanHex.centerY,
      hexSize + 0.5
    );
    const outerCorners = getHexCornerCoords(
      oceanHex.centerX,
      oceanHex.centerY,
      hexSize + 3.5
    );

    for (let side = 0; side < 6; side++) {
      const d = neighborDirs[side]!;
      const nbKey = hexId(oceanHex.q + d.dq, oceanHex.r + d.dr);
      if (!topo.hexes[nbKey] && !outerOceanHexes.has(nbKey)) {
        const c1 = outerCorners[side]!;
        const c2 = outerCorners[(side + 1) % 6]!;
        perimeterSegments.push(
          `<line x1="${c1.x.toFixed(2)}" y1="${c1.y.toFixed(2)}" x2="${c2.x.toFixed(2)}" y2="${c2.y.toFixed(2)}" />`
        );
      }
    }

    parts.push(`
      <g class="ocean-frame-hex" data-ocean-hex-id="${oceanHex.id}">
        <polygon points="${waterPts}" fill="url(#grad-ocean-frame)" stroke="rgba(125, 211, 252, 0.14)" stroke-width="0.9" />
        ${renderOceanWavesIllustration(
          oceanHex.centerX,
          oceanHex.centerY,
          oceanIdx,
          true
        )}
      </g>
    `);
  }

  if (perimeterSegments.length > 0) {
    parts.push(`
      <g pointer-events="none" stroke-linecap="round">
        <g stroke="#451a03" stroke-width="7.5">${perimeterSegments.join("")}</g>
        <g stroke="#b45309" stroke-width="4.2">${perimeterSegments.join("")}</g>
        <g stroke="#fde68a" stroke-width="1.3" opacity="0.78">${perimeterSegments.join("")}</g>
      </g>
    `);
  }

  parts.push(`<g pointer-events="none" filter="url(#island-shelf-shadow)">`);
  for (const hId of topo.hexOrder) {
    const tile = state.hexes[hId]!;
    if (tile.terrain === "sea" || tile.terrain === "fog") continue;
    const hNode = topo.hexes[hId]!;
    const lagoonPts = getPolygonPoints(
      hNode.centerX,
      hNode.centerY,
      hexSize + 4.5
    );
    const cliffPts = getPolygonPoints(
      hNode.centerX,
      hNode.centerY + 4.2,
      hexSize - 0.5
    );
    parts.push(
      `<polygon points="${lagoonPts}" fill="rgba(56, 189, 248, 0.2)" />`
    );
    parts.push(`<polygon points="${cliffPts}" fill="#451a03" />`);
  }
  parts.push(`</g>`);

  return parts;
}

export function renderCatanBoardSvg(
  state: CatanState,
  actingPlayerId: string | null,
  options: CatanBoardSvgOptions
): string {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const outerOceanHexes = computeOuterOceanHexes(state);

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
  const vbX = Math.floor(minX - pad);
  const vbY = Math.floor(minY - pad);
  const vbW = Math.ceil(maxX - minX + pad * 2);
  const vbH = Math.ceil(maxY - minY + pad * 2);

  const targets = computeClickableBoardTargets(state, actingPlayerId, options);

  const parts: string[] = [
    renderBoardDefsAndChartHeaderPart(state, vbX, vbY, vbW, vbH),
    ...buildOceanAndShelfParts(state, outerOceanHexes),
    ...buildHexAndHarborParts(state, targets.clickableHexes, options),
    ...buildEdgesAndVerticesParts(state, actingPlayerId, targets, options),
    `</svg>`,
  ];
  return parts.join("\n");
}
