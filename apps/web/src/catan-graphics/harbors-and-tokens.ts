import {
  type CatanState,
  type CommodityType,
  NUMBER_TOKEN_PIPS,
  type ResourceType,
  TERRAIN_TO_RESOURCE,
  type TradeGoodType,
  isCommodityType,
} from "@gaming-platform/catan";
import { RESOURCE_META } from "../config/catan-palette-config.ts";
import { renderTerrainIllustration } from "./defs-and-terrain.ts";
import { type CatanBoardSvgOptions, getPolygonPoints } from "./geometry.ts";

export function renderResourceGlyphSvg(
  resource: ResourceType,
  size = 14
): string {
  switch (resource) {
    case "brick":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="9" width="6.5" height="4" rx="0.9" fill="currentColor"/><rect x="8.5" y="9" width="6.5" height="4" rx="0.9" fill="currentColor" opacity="0.82"/><rect x="4.5" y="4" width="7" height="4" rx="0.9" fill="currentColor"/></svg>`;
    case "lumber":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.5 13,8.5 3,8.5" fill="currentColor"/><polygon points="8,5 13.8,11.8 2.2,11.8" fill="currentColor" opacity="0.86"/><rect x="6.7" y="11.8" width="2.6" height="2.8" rx="0.5" fill="currentColor"/></svg>`;
    case "wool":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.6" cy="9.2" r="3.4" fill="currentColor"/><circle cx="9.8" cy="9.2" r="3.4" fill="currentColor"/><circle cx="7.8" cy="6.2" r="3.3" fill="currentColor"/><circle cx="12.2" cy="8.2" r="2" fill="currentColor" opacity="0.7"/></svg>`;
    case "grain":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2V2.6M5 7c1.6 0 2.5 1 3 2.5M11 7c-1.6 0-2.5 1-3 2.5M5.4 4.1c1.3.2 2.1 1 2.6 2.2M10.6 4.1c-1.3.2-2.1 1-2.6 2.2" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
    case "ore":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><polygon points="1.6,13.2 6.2,4.2 10.4,13.2" fill="currentColor" opacity="0.78"/><polygon points="6.2,13.2 10.8,2.8 14.6,13.2" fill="currentColor"/></svg>`;
  }
}

/**
 * Inline `<g>` version of resource icon for embedding directly inside board SVG (e.g. 2:1 harbor medallions).
 */
export function renderBoardHarborGlyph(resource: ResourceType): string {
  switch (resource) {
    case "brick":
      return `
        <g transform="translate(-7, -7)">
          <rect x="1" y="8.5" width="5.8" height="3.6" rx="0.8" fill="#c2410c" />
          <rect x="7.6" y="8.5" width="5.8" height="3.6" rx="0.8" fill="#9a3412" />
          <rect x="4.2" y="3.8" width="6.2" height="3.6" rx="0.8" fill="#ea580c" />
        </g>
      `;
    case "lumber":
      return `
        <g transform="translate(-7, -7.5)">
          <polygon points="7,1.5 11.8,8 2.2,8" fill="#15803d" />
          <polygon points="7,4.8 12.6,11.2 1.4,11.2" fill="#166534" />
          <rect x="5.8" y="11.2" width="2.4" height="2.6" fill="#78350f" />
        </g>
      `;
    case "wool":
      return `
        <g transform="translate(-7, -7)">
          <circle cx="5" cy="8.5" r="3.1" fill="#f8fafc" stroke="#64748b" stroke-width="0.8" />
          <circle cx="8.8" cy="8.5" r="3.1" fill="#ffffff" stroke="#64748b" stroke-width="0.8" />
          <circle cx="6.9" cy="5.8" r="3" fill="#ffffff" stroke="#64748b" stroke-width="0.8" />
          <circle cx="11" cy="7.6" r="1.9" fill="#1e293b" />
        </g>
      `;
    case "grain":
      return `
        <g transform="translate(-7, -7.5)">
          <path d="M7 13.2V2.4M4.3 6.6c1.4 0 2.2.9 2.7 2.2M9.7 6.6c-1.4 0-2.2.9-2.7 2.2M4.7 3.9c1.2.2 1.9.9 2.3 2M9.3 3.9c-1.2.2-1.9.9-2.3 2" fill="none" stroke="#b45309" stroke-width="1.6" stroke-linecap="round" />
        </g>
      `;
    case "ore":
      return `
        <g transform="translate(-7, -7)">
          <polygon points="1.4,12.2 5.6,4 9.4,12.2" fill="#64748b" />
          <polygon points="5.4,12.2 9.8,2.6 13.4,12.2" fill="#334155" />
          <polygon points="9.8,2.6 11.4,6.2 9.2,7.2 8.2,5.8" fill="#e2e8f0" />
        </g>
      `;
  }
}

export function renderCommodityGlyphSvg(
  commodity: CommodityType,
  size = 14
): string {
  switch (commodity) {
    case "paper":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h7l2.5 2.5v8.5h-9.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 7h5M5.5 9.8h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    case "cloth":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5c2.2-1.4 4.4 1.4 6.6 0s4.4 0 4.4 0v7c-2.2 1.2-4.4-1.2-6.6 0s-4.4 0-4.4 0z" fill="currentColor" opacity="0.88"/></svg>`;
    case "coin":
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg>`;
  }
}

export function renderTradeGoodGlyphSvg(
  good: TradeGoodType,
  size = 14
): string {
  return isCommodityType(good)
    ? renderCommodityGlyphSvg(good, size)
    : renderResourceGlyphSvg(good, size);
}

export function buildHexAndHarborParts(
  state: CatanState,
  clickableHexes: ReadonlySet<string>,
  options: CatanBoardSvgOptions
): readonly string[] {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const parts: string[] = [];

  // 1. Render Board Hex Tiles with Clipped Scenic Dioramas
  for (let idx = 0; idx < topo.hexOrder.length; idx++) {
    const hId = topo.hexOrder[idx]!;
    const hNode = topo.hexes[hId]!;
    const tile = state.hexes[hId]!;
    const isClickable = clickableHexes.has(hId);
    const isLand = tile.terrain !== "sea" && tile.terrain !== "fog";
    const isRobbed = state.robberHexId === hId;
    const justProduced =
      Boolean(tile.numberToken) &&
      state.lastRoll?.total === tile.numberToken &&
      !isRobbed;

    const bevelPts = getPolygonPoints(
      hNode.centerX,
      hNode.centerY,
      hexSize - 0.5
    );
    const innerPts = getPolygonPoints(
      hNode.centerX,
      hNode.centerY,
      isLand ? hexSize - 2.6 : hexSize - 0.6
    );

    parts.push(
      `<g class="${isClickable ? "clickable-target" : "spot-hex-group"}" data-hex-id="${hId}" data-spot-hex="${hId}">`
    );

    if (isLand) {
      parts.push(
        `<polygon points="${bevelPts}" fill="#fde68a" stroke="#451a03" stroke-width="1.2" />`
      );
    }

    parts.push(
      `<polygon points="${innerPts}" fill="url(#grad-${tile.terrain})" />`
    );
    parts.push(
      `<g clip-path="url(#catan-hex-clip-${idx})">${renderTerrainIllustration(
        tile.terrain,
        hNode.centerX,
        hNode.centerY,
        idx + 1
      )}</g>`
    );

    parts.push(
      `<polygon points="${innerPts}" fill="none" stroke="${
        isClickable
          ? "#fde047"
          : justProduced
            ? "#fbbf24"
            : isLand
              ? "rgba(254, 243, 199, 0.55)"
              : "rgba(125, 211, 252, 0.22)"
      }" stroke-width="${isClickable ? 3.4 : justProduced ? 2.8 : 1.1}" />`
    );

    if (tile.numberToken) {
      const isRed = tile.numberToken === 6 || tile.numberToken === 8;
      const pips = NUMBER_TOKEN_PIPS[tile.numberToken] ?? 0;
      const tokenCy = hNode.centerY + 9;
      const pipSpacing = 4.6;
      const pipStartX = hNode.centerX - ((pips - 1) * pipSpacing) / 2;

      const pipCircles: string[] = [];
      for (let p = 0; p < pips; p++) {
        pipCircles.push(
          `<circle cx="${(pipStartX + p * pipSpacing).toFixed(2)}" cy="${
            tokenCy + 13.8
          }" r="1.65" fill="${isRed ? "#dc2626" : "#334155"}" />`
        );
      }

      const rolledMatch =
        Boolean(tile.numberToken) && state.lastRoll?.total === tile.numberToken;
      const producedRes = TERRAIN_TO_RESOURCE[tile.terrain];
      const isSelectedHex =
        options.selectedSpot?.kind === "hex" &&
        options.selectedSpot.id === hId;

      parts.push(`
        <g filter="url(#piece-shadow)">
          ${
            justProduced
              ? `<circle class="pulse-highlight" cx="${hNode.centerX}" cy="${tokenCy}" r="27" fill="rgba(251, 191, 36, 0.24)" stroke="#fde047" stroke-width="2.8" />`
              : rolledMatch && isRobbed
                ? `<circle cx="${hNode.centerX}" cy="${tokenCy}" r="26" fill="rgba(220, 38, 38, 0.2)" stroke="#f87171" stroke-width="2.2" stroke-dasharray="4,3" />`
                : ""
          }
          ${
            isSelectedHex
              ? `<circle cx="${hNode.centerX}" cy="${tokenCy}" r="29" fill="none" stroke="#38bdf8" stroke-width="2.8" />`
              : ""
          }
          <!-- 3D turned-disc lower edge -->
          <circle cx="${hNode.centerX}" cy="${tokenCy + 1.9}" r="21.5" fill="#92400e" />
          <circle cx="${hNode.centerX}" cy="${tokenCy}" r="21.5" fill="url(#grad-chit-ivory)" stroke="${
            justProduced
              ? "#f59e0b"
              : isRobbed
                ? "#991b1b"
                : isRed
                  ? "#dc2626"
                  : "#b45309"
          }" stroke-width="${justProduced ? "3" : "2.2"}" />
          <circle cx="${hNode.centerX}" cy="${tokenCy}" r="18.4" fill="none" stroke="${
            isRed ? "rgba(220, 38, 38, 0.28)" : "rgba(180, 83, 9, 0.28)"
          }" stroke-width="1" />
          <text x="${hNode.centerX}" y="${
            tokenCy + 5.2
          }" text-anchor="middle" font-family="Sora, system-ui, sans-serif" font-size="${
            isRed ? "22.5" : "20.5"
          }" font-weight="700" fill="${
            isRed ? "#dc2626" : "#18191b"
          }">${tile.numberToken}</text>
          ${pipCircles.join("")}
          ${
            justProduced
              ? `<g transform="translate(${hNode.centerX}, ${hNode.centerY - 26})">
                   <rect x="-26" y="-9.5" width="52" height="17" rx="8.5" fill="#18191b" stroke="#fde047" stroke-width="1.5" />
                   ${
                     producedRes
                       ? `<g transform="translate(-14, -1.5) scale(0.85)">${renderBoardHarborGlyph(producedRes)}</g>
                          <text x="6" y="2.2" text-anchor="middle" font-family="Martian Mono, monospace" font-size="8.5" font-weight="700" fill="#fde047">YIELD</text>`
                       : `<text x="0" y="2.2" text-anchor="middle" font-family="Martian Mono, monospace" font-size="8.5" font-weight="700" fill="#fde047">+GOLD</text>`
                   }
                 </g>`
              : rolledMatch && isRobbed
                ? `<g transform="translate(${hNode.centerX}, ${hNode.centerY - 26})">
                     <rect x="-26" y="-9" width="52" height="16" rx="8" fill="#450a0a" stroke="#f87171" stroke-width="1.3" />
                     <text x="0" y="2.2" text-anchor="middle" font-family="Martian Mono, monospace" font-size="8.2" font-weight="700" fill="#fecaca">BLOCKED</text>
                   </g>`
                : ""
          }
        </g>
      `);
    }

    if (
      state.config.enableSeafarers &&
      tile.islandId > 1 &&
      !tile.allowSetupSettlement &&
      tile.terrain !== "fog"
    ) {
      parts.push(`
        <g transform="translate(${hNode.centerX + 20}, ${hNode.centerY - 26})">
          <rect x="-15" y="-8" width="30" height="14" rx="7" fill="#18191b" stroke="#fbbf24" stroke-width="1.1" opacity="0.88" />
          <text x="0" y="2" text-anchor="middle" font-family="Martian Mono, monospace" font-size="8.5" font-weight="600" fill="#fde047">+2VP</text>
        </g>
      `);
    }

    if (isRobbed) {
      const rx = hNode.centerX - 24;
      const ry = hNode.centerY + 4;
      parts.push(`
        <g transform="translate(${rx}, ${ry})" filter="url(#piece-shadow)">
          <ellipse cx="0" cy="10.5" rx="9.8" ry="4.2" fill="#090a0b" stroke="#e2e8f0" stroke-width="1.2" />
          <ellipse cx="0" cy="8.8" rx="8.2" ry="3" fill="#27272a" />
          <path d="M-7,8.5 C-6.2,-2.5 -3,-4.5 0,-4.5 C3,-4.5 6.2,-2.5 7,8.5 Z" fill="#18191b" stroke="#e2e8f0" stroke-width="1.15" />
          <path d="M-4.5,7.2 C-4,-1 -1.8,-3 0,-3" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.3" stroke-linecap="round" />
          <ellipse cx="0" cy="-4.2" rx="5.6" ry="1.8" fill="#3f3f46" stroke="#cbd5e1" stroke-width="0.9" />
          <circle cx="0" cy="-9.5" r="5.2" fill="#27272a" stroke="#f8fafc" stroke-width="1.2" />
          <circle cx="-1.6" cy="-11" r="1.5" fill="rgba(255,255,255,0.45)" />
        </g>
      `);
    }

    if (state.pirateHexId === hId) {
      const px = hNode.centerX;
      const py = hNode.centerY + 5;
      parts.push(`
        <g transform="translate(${px}, ${py})" filter="url(#piece-shadow)">
          <ellipse cx="0" cy="11.5" rx="16" ry="4" fill="rgba(186, 230, 253, 0.35)" />
          <path d="M-15,3.5 L15,3.5 L10.5,10.5 L-10.5,10.5 Z" fill="#18191b" stroke="#fbbf24" stroke-width="1.3" />
          <line x1="0" y1="3.5" x2="0" y2="-15" stroke="#fde68a" stroke-width="1.5" />
          <path d="M0,-13.5 Q11,-8 12.5,1.5 L0,1.5 Z" fill="#27272a" stroke="#f8fafc" stroke-width="1" />
          <path d="M-1,-11 Q-9,-6 -9.5,1.5 L-1,1.5 Z" fill="#18191b" stroke="#cbd5e1" stroke-width="0.9" />
          <circle cx="5.2" cy="-5.2" r="2" fill="#f8fafc" />
          <line x1="2.8" y1="-2.2" x2="7.6" y2="-4.2" stroke="#f87171" stroke-width="1.2" />
          <line x1="2.8" y1="-4.2" x2="7.6" y2="-2.2" stroke="#f87171" stroke-width="1.2" />
        </g>
      `);
    }

    if (state.config.enableCitiesAndKnights && state.merchantHexId === hId) {
      const merchantOwner = state.players.find(
        (p) => p.id === state.merchantOwnerId
      );
      const mColor = merchantOwner?.color ?? "#f59e0b";
      const mx = hNode.centerX + 24;
      const my = hNode.centerY + 4;
      parts.push(`
        <g transform="translate(${mx}, ${my})" filter="url(#piece-shadow)">
          <ellipse cx="0" cy="10.5" rx="9.5" ry="4" fill="#451a03" stroke="#fde047" stroke-width="1.3" />
          <polygon points="-7.5,9.5 0,-11.5 7.5,9.5" fill="${mColor}" stroke="#fef08a" stroke-width="1.4" stroke-linejoin="round" />
          <circle cx="0" cy="-12.5" r="3.4" fill="#fde047" stroke="#78350f" stroke-width="1" />
          <rect x="-9" y="1" width="18" height="8.5" rx="3" fill="#18191b" stroke="#fbbf24" stroke-width="0.9" />
          <text x="0" y="7" text-anchor="middle" font-family="Martian Mono, monospace" font-size="6.6" font-weight="700" fill="#fde047">2:1</text>
        </g>
      `);
    }

    if (isClickable) {
      parts.push(
        `<circle class="pulse-highlight" cx="${hNode.centerX}" cy="${hNode.centerY}" r="27" fill="rgba(253, 224, 71, 0.22)" stroke="#fde047" stroke-width="2.6" />`
      );
    }
    parts.push(`</g>`);
  }

  // 1b. Multi-layered Sandy Beaches, Turquoise Shoals & Surf Foam along Coastlines
  for (const eId of topo.edgeOrder) {
    const eNode = topo.edges[eId]!;
    const landCount = eNode.adjacentHexIds.filter((id) => {
      const t = state.hexes[id]?.terrain;
      return t && t !== "sea" && t !== "fog";
    }).length;
    if (landCount === 1) {
      parts.push(`
        <g pointer-events="none" stroke-linecap="round">
          <line x1="${eNode.x1}" y1="${eNode.y1}" x2="${eNode.x2}" y2="${eNode.y2}"
                stroke="rgba(56, 189, 248, 0.34)" stroke-width="7.5" />
          <line x1="${eNode.x1}" y1="${eNode.y1}" x2="${eNode.x2}" y2="${eNode.y2}"
                stroke="#fde68a" stroke-width="3.6" />
          <line x1="${eNode.x1}" y1="${eNode.y1}" x2="${eNode.x2}" y2="${eNode.y2}"
                stroke="rgba(240, 249, 255, 0.82)" stroke-width="1.5" stroke-dasharray="5.5,4.5" />
        </g>
      `);
    }
  }

  // 2. Render Harbors with Timber Plank Jetties & Resource Emblem Medallions
  for (const harbor of state.harbors) {
    const eNode = topo.edges[harbor.edgeId];
    if (!eNode) continue;
    const adjHexId = eNode.adjacentHexIds.find(
      (id) => state.hexes[id]?.terrain !== "sea"
    );
    const adjSeaHexId = eNode.adjacentHexIds.find(
      (id) => state.hexes[id]?.terrain === "sea"
    );
    const landHex = adjHexId ? topo.hexes[adjHexId] : null;
    const dx = landHex ? eNode.midX - landHex.centerX : 0;
    const dy = landHex ? eNode.midY - landHex.centerY : 0;
    const buoyOffset = adjSeaHexId ? 0.56 : 0.72;
    const bx = Number((eNode.midX + dx * buoyOffset).toFixed(2));
    const by = Number((eNode.midY + dy * buoyOffset).toFixed(2));

    const isGeneric = harbor.type === "generic";
    const ratioText = isGeneric ? "3:1" : "2:1";
    const subLabel =
      harbor.type === "generic" ? "Any" : RESOURCE_META[harbor.type].label;
    const strokeAccent =
      harbor.type === "generic" ? "#b45309" : RESOURCE_META[harbor.type].accent;
    const badgeW = isGeneric ? 46 : 58;

    parts.push(`
      <g filter="url(#piece-shadow)" class="harbor-marker" pointer-events="none">
        <!-- Timber pier pilings to coastal vertices -->
        <line x1="${bx}" y1="${by}" x2="${eNode.x1}" y2="${eNode.y1}" stroke="#451a03" stroke-width="5.2" stroke-linecap="round" />
        <line x1="${bx}" y1="${by}" x2="${eNode.x1}" y2="${eNode.y1}" stroke="#b45309" stroke-width="2.6" stroke-dasharray="2.5,2.5" />
        <line x1="${bx}" y1="${by}" x2="${eNode.x2}" y2="${eNode.y2}" stroke="#451a03" stroke-width="5.2" stroke-linecap="round" />
        <line x1="${bx}" y1="${by}" x2="${eNode.x2}" y2="${eNode.y2}" stroke="#b45309" stroke-width="2.6" stroke-dasharray="2.5,2.5" />
        <circle cx="${eNode.x1}" cy="${eNode.y1}" r="2.8" fill="#fde68a" stroke="#451a03" stroke-width="1" />
        <circle cx="${eNode.x2}" cy="${eNode.y2}" r="2.8" fill="#fde68a" stroke="#451a03" stroke-width="1" />

        <!-- Harbor buoy wake & merchant trade medallion -->
        <ellipse cx="${bx}" cy="${by + 11}" rx="${badgeW * 0.48}" ry="5" fill="rgba(186, 230, 253, 0.32)" />
        <rect x="${bx - badgeW / 2}" y="${by - 14}" width="${badgeW}" height="28" rx="9"
              fill="#fffbeb" stroke="${strokeAccent}" stroke-width="2" />
        ${
          harbor.type === "generic"
            ? `<text x="${bx}" y="${by + 1}" text-anchor="middle" font-family="Sora, system-ui, sans-serif" font-size="11.5" font-weight="700" fill="#18191b">3:1</text>
               <text x="${bx}" y="${by + 10}" text-anchor="middle" font-family="Figtree, system-ui, sans-serif" font-size="7.8" font-weight="600" fill="#78350f">${subLabel}</text>`
            : `<g transform="translate(${bx - 14}, ${by - 1})">${renderBoardHarborGlyph(harbor.type)}</g>
               <text x="${bx + 8}" y="${by + 1}" text-anchor="middle" font-family="Sora, system-ui, sans-serif" font-size="11" font-weight="700" fill="#18191b">${ratioText}</text>
               <text x="${bx + 8}" y="${by + 9.8}" text-anchor="middle" font-family="Figtree, system-ui, sans-serif" font-size="7.5" font-weight="600" fill="#78350f">${subLabel}</text>`
        }
      </g>
    `);
  }

  return parts;
}
