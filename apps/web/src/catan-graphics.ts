import { axialNeighbors, hexId, hexToPixel } from "@gaming-platform/core";
import {
  type CatanAction,
  type CatanPlayerState,
  type CatanState,
  type DevCardType,
  NUMBER_TOKEN_PIPS,
  RESOURCES,
  type ResourceType,
  TERRAIN_TO_RESOURCE,
  type TerrainType,
  getLegalMoveShipActions,
  getLegalPirateHexes,
  getLegalRoadEdges,
  getLegalRobberHexes,
  getLegalSettlementVertices,
  getLegalShipEdges,
  getPlayerSafeHandLimit,
  totalResourceCount,
} from "@gaming-platform/catan";

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  brick: "Brick",
  lumber: "Lumber",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore",
};

/**
 * Pure hex color tint/shade helper for 3D wooden game pieces.
 * Positive `amount` mixes toward white; negative `amount` mixes toward black.
 */
function shadeHexColor(hex: string, amount: number): string {
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
function renderBoardHarborGlyph(resource: ResourceType): string {
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

export const RESOURCE_META: Record<
  ResourceType,
  {
    label: string;
    subtitle: string;
    accent: string;
    bgTop: string;
    bgBottom: string;
    border: string;
  }
> = {
  brick: {
    label: "Brick",
    subtitle: "Clay hills",
    accent: "#ea580c",
    bgTop: "#7c2d12",
    bgBottom: "#3b1106",
    border: "#fb923c",
  },
  lumber: {
    label: "Lumber",
    subtitle: "Timber forest",
    accent: "#16a34a",
    bgTop: "#14532d",
    bgBottom: "#052814",
    border: "#4ade80",
  },
  wool: {
    label: "Wool",
    subtitle: "Sheep pasture",
    accent: "#65a30d",
    bgTop: "#365314",
    bgBottom: "#172606",
    border: "#a3e635",
  },
  grain: {
    label: "Grain",
    subtitle: "Wheat fields",
    accent: "#eab308",
    bgTop: "#854d0e",
    bgBottom: "#3d1d05",
    border: "#facc15",
  },
  ore: {
    label: "Ore",
    subtitle: "Iron mountains",
    accent: "#64748b",
    bgTop: "#334155",
    bgBottom: "#0f172a",
    border: "#94a3b8",
  },
};

export const DEV_CARD_META: Record<
  DevCardType,
  {
    title: string;
    category: string;
    rule: string;
    accent: string;
    border: string;
  }
> = {
  knight: {
    title: "Knight",
    category: "Army",
    rule: "Move the robber or pirate and steal 1 card from an adjacent player.",
    accent: "#dc2626",
    border: "#f87171",
  },
  road_building: {
    title: "Road building",
    category: "Progress",
    rule: "Place 2 free roads or ships on the board.",
    accent: "#0284c7",
    border: "#38bdf8",
  },
  year_of_plenty: {
    title: "Year of plenty",
    category: "Progress",
    rule: "Take any 2 resource cards directly from the bank.",
    accent: "#16a34a",
    border: "#4ade80",
  },
  monopoly: {
    title: "Monopoly",
    category: "Progress",
    rule: "Name 1 resource; every opponent gives you all cards of that type.",
    accent: "#b45309",
    border: "#f59e0b",
  },
  victory_point: {
    title: "Victory point",
    category: "+1 VP",
    rule: "Counts immediately toward your victory point target.",
    accent: "#d97706",
    border: "#fbbf24",
  },
};

function getPolygonPoints(
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

function getHexCornerCoords(
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

function renderOceanWavesIllustration(
  cx: number,
  cy: number,
  variantSeed: number,
  isOuterFrame: boolean
): string {
  const shift = ((variantSeed % 5) - 2) * 3.5;
  const flip = variantSeed % 2 === 0 ? 1 : -1;
  return `
    <g transform="translate(${cx}, ${cy})" pointer-events="none">
      <path d="M${-26 + shift},-15 Q${-14 + shift},${-21 * flip * 0.25 - 15} ${-2 + shift},-15 T${22 + shift},-15"
            fill="none" stroke="rgba(186, 230, 253, 0.26)" stroke-width="1.6" stroke-linecap="round" />
      <path d="M${-30 - shift * 0.6},1 Q${-16 - shift * 0.6},-4.5 ${-2 - shift * 0.6},1 T${26 - shift * 0.6},1"
            fill="none" stroke="rgba(125, 211, 252, 0.22)" stroke-width="1.5" stroke-linecap="round" />
      <path d="M${-20 + shift * 0.5},17 Q${-8 + shift * 0.5},12 ${4 + shift * 0.5},17 T${24 + shift * 0.5},17"
            fill="none" stroke="rgba(224, 242, 254, 0.2)" stroke-width="1.3" stroke-linecap="round" />
      ${
        isOuterFrame && variantSeed % 6 === 1
          ? `<g opacity="0.42">
               <circle cx="0" cy="0" r="13.5" fill="none" stroke="#bae6fd" stroke-width="0.9" stroke-dasharray="2.2,2.2" />
               <circle cx="0" cy="0" r="9.5" fill="none" stroke="#7dd3fc" stroke-width="0.7" />
               <polygon points="0,-16 2.6,-2.6 16,0 2.6,2.6 0,16 -2.6,2.6 -16,0 -2.6,-2.6" fill="#e0f2fe" />
               <polygon points="0,-10 1.6,-1.6 10,0 1.6,1.6 0,10 -1.6,1.6 -10,0 -1.6,-1.6" fill="#fbbf24" opacity="0.85" />
             </g>`
          : ""
      }
    </g>
  `;
}

/**
 * Helper to draw a two-tone pine tree at `(tx, ty)` with scale `s`.
 */
function renderPineTree(tx: number, ty: number, s = 1): string {
  return `
    <g transform="translate(${tx}, ${ty}) scale(${s})">
      <ellipse cx="0" cy="11.5" rx="7.5" ry="2.6" fill="#022c22" opacity="0.48" />
      <rect x="-1.6" y="6.5" width="3.2" height="5.2" rx="0.6" fill="#5c2d16" />
      <polygon points="-8.5,7.5 0,-5.5 0,7.5" fill="#16a34a" />
      <polygon points="0,7.5 0,-5.5 8.5,7.5" fill="#065f46" />
      <polygon points="-7,1.8 0,-10.5 0,1.8" fill="#22c55e" />
      <polygon points="0,1.8 0,-10.5 7,1.8" fill="#047857" />
      <polygon points="-5,-3.5 0,-14.5 0,-3.5" fill="#4ade80" />
      <polygon points="0,-3.5 0,-14.5 5,-3.5" fill="#059669" />
    </g>
  `;
}

/**
 * Helper to draw a detailed grazing sheep at `(sx, sy)` with scale `s` and optional horizontal flip.
 */
function renderSheep(sx: number, sy: number, s = 1, flipX = false): string {
  const dir = flipX ? -1 : 1;
  return `
    <g transform="translate(${sx}, ${sy}) scale(${dir * s}, ${s})">
      <ellipse cx="0" cy="5.5" rx="7.5" ry="2.3" fill="#1a2e05" opacity="0.42" />
      <line x1="-3.5" y1="2.5" x2="-3.5" y2="5.6" stroke="#1e293b" stroke-width="1.3" stroke-linecap="round" />
      <line x1="2.8" y1="2.5" x2="2.8" y2="5.6" stroke="#1e293b" stroke-width="1.3" stroke-linecap="round" />
      <circle cx="-3.6" cy="0.8" r="3.9" fill="#e2e8f0" />
      <circle cx="2.2" cy="1" r="3.8" fill="#f8fafc" />
      <circle cx="-0.8" cy="-1.6" r="4.1" fill="#ffffff" />
      <circle cx="4.8" cy="-0.2" r="2.5" fill="#1e293b" />
      <ellipse cx="3.8" cy="-1.8" rx="1.6" ry="0.8" transform="rotate(-24 3.8 -1.8)" fill="#334155" />
      <circle cx="5.5" cy="-0.6" r="0.55" fill="#ffffff" />
    </g>
  `;
}

/**
 * Renders a full-bleed scenic biome diorama inside each hex (clipped to the hex face).
 * Composed around `(0, 9)` so the central number token sits cleanly in the terrain clearing.
 */
function renderTerrainIllustration(
  terrain: TerrainType,
  cx: number,
  cy: number,
  seedIdx = 0
): string {
  switch (terrain) {
    case "forest":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Sunlit woodland glade & deep moss -->
          <path d="M-54,-14 Q-18,-36 16,-24 T54,-10 L54,58 L-54,58 Z" fill="#064e3b" opacity="0.55" />
          <ellipse cx="0" cy="-6" rx="34" ry="20" fill="#15803d" opacity="0.36" />
          <path d="M-52,22 Q-12,8 22,20 T54,18 L54,58 L-52,58 Z" fill="#052e16" opacity="0.58" />
          <!-- Distant misty treeline -->
          <polygon points="-26,-28 -18,-46 -10,-28" fill="#065f46" opacity="0.7" />
          <polygon points="-8,-30 1,-50 10,-30" fill="#047857" opacity="0.75" />
          <polygon points="10,-27 19,-45 28,-27" fill="#065f46" opacity="0.7" />
          <!-- Main conifer grove framing the clearing -->
          ${renderPineTree(-25, -18, 0.96)}
          ${renderPineTree(25, -17, 0.98)}
          ${renderPineTree(-11, -26, 1.05)}
          ${renderPineTree(11, -25, 1.02)}
          ${renderPineTree(-33, 5, 0.88)}
          ${renderPineTree(33, 7, 0.86)}
          <!-- Foreground stacked timber logs with cut end-grain -->
          <g transform="translate(18, 29)">
            <rect x="-12" y="0" width="17" height="4.8" rx="2.2" fill="#78350f" stroke="#451a03" stroke-width="0.8" />
            <circle cx="5" cy="2.4" r="2.2" fill="#fde68a" stroke="#78350f" stroke-width="0.7" />
            <rect x="-9" y="-3.8" width="16" height="4.5" rx="2.1" fill="#92400e" stroke="#451a03" stroke-width="0.8" />
            <circle cx="7" cy="-1.5" r="2.1" fill="#fef3c7" stroke="#78350f" stroke-width="0.7" />
          </g>
        </g>
      `;

    case "hills":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Warm clay ridges in three depth planes -->
          <path d="M-52,-12 Q-24,-40 2,-20 Q26,-38 52,-10 L52,58 L-52,58 Z" fill="#9a3412" opacity="0.78" />
          <path d="M-54,4 Q-26,-24 -2,-4 Q22,-22 54,6 L54,58 L-54,58 Z" fill="#c2410c" opacity="0.72" />
          <!-- Sunlit ridge highlights -->
          <path d="M-40,-10 Q-22,-32 -4,-14" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" opacity="0.65" />
          <path d="M4,-14 Q24,-33 42,-10" fill="none" stroke="#fed7aa" stroke-width="2" stroke-linecap="round" opacity="0.6" />
          <!-- Terraced terracotta quarry benches (left flank) -->
          <path d="M-38,-2 L-18,-2 L-15,4 L-36,4 Z" fill="#7c2d12" stroke="#fdba74" stroke-width="0.7" />
          <path d="M-35,4 L-16,4 L-13,10 L-33,10 Z" fill="#431407" opacity="0.7" />
          <!-- Stacked kiln-fired bricks (upper center & right flank) -->
          <g transform="translate(-8, -28)">
            <rect x="-8" y="3" width="8" height="4" rx="0.8" fill="#ea580c" stroke="#ffedd5" stroke-width="0.7" />
            <rect x="1" y="3" width="8" height="4" rx="0.8" fill="#c2410c" stroke="#fed7aa" stroke-width="0.7" />
            <rect x="-3.5" y="-1.6" width="8" height="4" rx="0.8" fill="#f97316" stroke="#ffedd5" stroke-width="0.7" />
          </g>
          <g transform="translate(26, -6) scale(0.9)">
            <rect x="-8" y="3" width="8" height="4" rx="0.8" fill="#ea580c" stroke="#fed7aa" stroke-width="0.7" />
            <rect x="1" y="3" width="8" height="4" rx="0.8" fill="#9a3412" stroke="#fed7aa" stroke-width="0.7" />
            <rect x="-3.5" y="-1.6" width="8" height="4" rx="0.8" fill="#fb923c" stroke="#ffedd5" stroke-width="0.7" />
          </g>
          <!-- Foreground ochre badlands -->
          <path d="M-54,28 Q-14,16 18,30 T54,26 L54,58 L-54,58 Z" fill="#431407" opacity="0.52" />
        </g>
      `;

    case "pasture":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Rolling sunlit clover hills -->
          <path d="M-54,-16 Q-18,-38 18,-20 T54,-14 L54,58 L-54,58 Z" fill="#4d7c0f" opacity="0.7" />
          <path d="M-54,4 Q-16,-16 22,2 T54,0 L54,58 L-54,58 Z" fill="#3f6212" opacity="0.68" />
          <path d="M-54,26 Q-8,14 28,28 T54,24 L54,58 L-54,58 Z" fill="#365314" opacity="0.72" />
          <!-- Split-rail wooden paddock fence -->
          <g stroke="#fef3c7" stroke-width="1.2" stroke-linecap="round" opacity="0.78">
            <line x1="-26" y1="-26" x2="-26" y2="-18" stroke="#78350f" stroke-width="1.8" />
            <line x1="-10" y1="-29" x2="-10" y2="-21" stroke="#78350f" stroke-width="1.8" />
            <line x1="8" y1="-28" x2="8" y2="-20" stroke="#78350f" stroke-width="1.8" />
            <line x1="24" y1="-24" x2="24" y2="-16" stroke="#78350f" stroke-width="1.8" />
            <path d="M-28,-24 Q-9,-28 26,-22" fill="none" stroke="#fde68a" stroke-width="1.2" />
            <path d="M-28,-21 Q-9,-25 26,-19" fill="none" stroke="#fcd34d" stroke-width="1.1" />
          </g>
          <!-- Grazing sheep flock -->
          ${renderSheep(-18, -15, 0.96, false)}
          ${renderSheep(14, -17, 0.92, true)}
          ${renderSheep(-29, 8, 0.84, false)}
          ${renderSheep(28, 10, 0.86, true)}
        </g>
      `;

    case "fields":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Terraced golden wheat contours -->
          <path d="M-54,-14 Q-16,-34 22,-18 T54,-12 L54,58 L-54,58 Z" fill="#ca8a04" opacity="0.65" />
          <path d="M-48,-8 Q-12,-24 26,-10" fill="none" stroke="#fef08a" stroke-width="1.8" opacity="0.65" />
          <path d="M-50,0 Q-12,-16 30,-2" fill="none" stroke="#fde047" stroke-width="1.8" opacity="0.6" />
          <path d="M-50,8 Q-10,-8 34,6" fill="none" stroke="#a16207" stroke-width="1.8" opacity="0.55" />
          <path d="M-54,24 Q-12,12 24,26 T54,22 L54,58 L-54,58 Z" fill="#854d0e" opacity="0.58" />
          <!-- Miniature timber windmill on upper-left knoll -->
          <g transform="translate(-19, -24)">
            <polygon points="-4.5,9 -2.6,-3 2.6,-3 4.5,9" fill="#fef3c7" stroke="#78350f" stroke-width="0.9" />
            <polygon points="-3.6,-3 0,-7.5 3.6,-3" fill="#b91c1c" stroke="#451a03" stroke-width="0.7" />
            <line x1="-8.5" y1="-8.5" x2="8.5" y2="3.5" stroke="#78350f" stroke-width="1.3" />
            <line x1="6" y1="-10" x2="-6" y2="5" stroke="#78350f" stroke-width="1.3" />
            <rect x="1.5" y="-2" width="5.5" height="2.2" transform="rotate(35 1.5 -2)" fill="#fffbeb" opacity="0.88" />
            <rect x="-7" y="-7.8" width="5.5" height="2.2" transform="rotate(35 -7 -7.8)" fill="#fffbeb" opacity="0.88" />
          </g>
          <!-- Swaying ripe wheat sheaves & golden hay bales -->
          <g transform="translate(15, -20)">
            <line x1="-6" y1="8" x2="-7" y2="-6" stroke="#fef08a" stroke-width="1.8" stroke-linecap="round" />
            <ellipse cx="-7" cy="-6" rx="2.4" ry="4.8" fill="#fde047" stroke="#a16207" stroke-width="0.7" />
            <line x1="0" y1="8" x2="0" y2="-9" stroke="#fef08a" stroke-width="2" stroke-linecap="round" />
            <ellipse cx="0" cy="-9" rx="2.6" ry="5.2" fill="#fef08a" stroke="#a16207" stroke-width="0.7" />
            <line x1="6" y1="8" x2="7" y2="-6" stroke="#fef08a" stroke-width="1.8" stroke-linecap="round" />
            <ellipse cx="7" cy="-6" rx="2.4" ry="4.8" fill="#fde047" stroke="#a16207" stroke-width="0.7" />
          </g>
          <g transform="translate(27, 8)">
            <ellipse cx="0" cy="0" rx="6.5" ry="4.2" fill="#facc15" stroke="#854d0e" stroke-width="0.9" />
            <circle cx="3" cy="0" r="2.2" fill="#fde047" stroke="#854d0e" stroke-width="0.7" />
          </g>
        </g>
      `;

    case "mountains":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Alpine granite massif with sunlit left facets & slate shadow right facets -->
          <polygon points="-44,12 -20,-34 -2,12" fill="#475569" />
          <polygon points="-20,-34 -2,12 -20,12" fill="#1e293b" />
          <polygon points="-20,-34 -27,-19 -20,-15 -13,-20" fill="#f8fafc" />
          <polygon points="-20,-34 -20,-15 -13,-20" fill="#cbd5e1" />

          <polygon points="-10,14 16,-39 42,14" fill="#64748b" />
          <polygon points="16,-39 42,14 16,14" fill="#0f172a" opacity="0.72" />
          <polygon points="16,-39 7,-20 16,-15 24,-21" fill="#ffffff" />
          <polygon points="16,-39 16,-15 24,-21" fill="#cbd5e1" />

          <polygon points="-38,22 -24,-4 -8,22" fill="#334155" />
          <!-- Timbered iron-mine portal on left crag -->
          <g transform="translate(-27, 8)">
            <rect x="-5.5" y="-5" width="11" height="9" rx="1" fill="#0f172a" />
            <path d="M-6.5,4 V-5.5 H6.5 V4" fill="none" stroke="#b45309" stroke-width="2.1" stroke-linejoin="round" />
          </g>
          <!-- Shimmering iron-ore crystal cluster on right crag -->
          <g transform="translate(28, 7)">
            <polygon points="-5,6 -1,-5 3,6" fill="#94a3b8" stroke="#e2e8f0" stroke-width="0.7" />
            <polygon points="0,7 5,-3 8,7" fill="#cbd5e1" stroke="#ffffff" stroke-width="0.7" />
          </g>
          <path d="M-54,26 Q-14,18 20,28 T54,24 L54,58 L-54,58 Z" fill="#0f172a" opacity="0.55" />
        </g>
      `;

    case "desert":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Wind-sculpted Sahara sand dunes with sunlit/shadowed crests -->
          <path d="M-54,-8 Q-20,-32 8,-14 T54,-18 L54,58 L-54,58 Z" fill="#d97706" opacity="0.58" />
          <path d="M-54,8 Q-12,-14 22,6 T54,2 L54,58 L-54,58 Z" fill="#b45309" opacity="0.62" />
          <path d="M-44,-10 Q-18,-28 8,-14" fill="none" stroke="#fef3c7" stroke-width="1.8" opacity="0.75" />
          <path d="M-36,6 Q-8,-11 22,6" fill="none" stroke="#fde68a" stroke-width="1.8" opacity="0.7" />
          <!-- Shimmering turquoise oasis pool & palm/cactus -->
          <ellipse cx="14" cy="14" rx="14" ry="5.5" fill="#fde68a" />
          <ellipse cx="14" cy="14" rx="11" ry="4" fill="#0ea5e9" />
          <ellipse cx="12" cy="13.2" rx="5" ry="1.6" fill="#7dd3fc" opacity="0.75" />
          <!-- Saguaro cacti -->
          <g transform="translate(-8, -18)">
            <line x1="0" y1="12" x2="0" y2="-6" stroke="#15803d" stroke-width="3.4" stroke-linecap="round" />
            <path d="M-5.5,1 Q-5.5,6 0,6" fill="none" stroke="#15803d" stroke-width="2.4" stroke-linecap="round" />
            <path d="M5.5,-1 Q5.5,4 0,4" fill="none" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" />
          </g>
          <g transform="translate(26, 8) scale(0.82)">
            <line x1="0" y1="10" x2="0" y2="-6" stroke="#166534" stroke-width="3.2" stroke-linecap="round" />
            <path d="M-5,0 Q-5,4.5 0,4.5" fill="none" stroke="#166534" stroke-width="2.2" stroke-linecap="round" />
          </g>
        </g>
      `;

    case "sea":
      return renderOceanWavesIllustration(cx, cy, seedIdx, false);

    case "gold":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Canyon riverbanks & turquoise rapids -->
          <path d="M-54,-12 Q-18,-30 18,-16 T54,-10 L54,58 L-54,58 Z" fill="#a16207" opacity="0.62" />
          <path d="M-42,-28 Q-12,-8 4,-16 T42,-6" fill="none" stroke="#0284c7" stroke-width="11" stroke-linecap="round" />
          <path d="M-42,-28 Q-12,-8 4,-16 T42,-6" fill="none" stroke="#38bdf8" stroke-width="6.5" stroke-linecap="round" />
          <path d="M-36,-26 Q-10,-9 4,-16 T36,-7" fill="none" stroke="#e0f2fe" stroke-width="1.8" stroke-dasharray="5,4" stroke-linecap="round" />
          <!-- Faceted alluvial gold nuggets -->
          <polygon points="-24,-10 -17,-18 -10,-11 -16,-6" fill="#fde047" stroke="#92400e" stroke-width="0.9" />
          <polygon points="14,-20 22,-28 29,-20 22,-15" fill="#fef08a" stroke="#92400e" stroke-width="0.9" />
          <polygon points="24,8 30,2 35,8 30,12" fill="#facc15" stroke="#92400e" stroke-width="0.8" />
        </g>
      `;

    case "fog":
      return `
        <g transform="translate(${cx}, ${cy})" pointer-events="none">
          <!-- Layered sea mist banks & uncharted compass tracks -->
          <ellipse cx="-14" cy="-14" rx="26" ry="11" fill="rgba(186, 230, 253, 0.2)" />
          <ellipse cx="14" cy="-4" rx="28" ry="12" fill="rgba(224, 242, 254, 0.22)" />
          <ellipse cx="-6" cy="14" rx="26" ry="11" fill="rgba(125, 211, 252, 0.18)" />
          <circle cx="0" cy="0" r="16" fill="rgba(15, 23, 42, 0.45)" stroke="rgba(186, 230, 253, 0.45)" stroke-width="1.1" stroke-dasharray="3,2.5" />
          <text x="0" y="6" text-anchor="middle" font-family="Sora, system-ui, sans-serif" font-size="17" font-weight="600" fill="#e0f2fe">?</text>
        </g>
      `;
  }
}

export function renderDieSvg(value: number, size = 28): string {
  const pipCoords: Record<number, Array<[number, number]>> = {
    1: [[14, 14]],
    2: [
      [8, 8],
      [20, 20],
    ],
    3: [
      [8, 8],
      [14, 14],
      [20, 20],
    ],
    4: [
      [8, 8],
      [20, 8],
      [8, 20],
      [20, 20],
    ],
    5: [
      [8, 8],
      [20, 8],
      [14, 14],
      [8, 20],
      [20, 20],
    ],
    6: [
      [8, 7],
      [20, 7],
      [8, 14],
      [20, 14],
      [8, 21],
      [20, 21],
    ],
  };
  const pips = pipCoords[value] ?? pipCoords[1]!;
  const isCrimson = value === 1 || value === 4;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true" class="catan-die-svg">
      <rect x="1" y="2.4" width="26" height="25" rx="6" fill="#78350f" opacity="0.62" />
      <rect x="1" y="1" width="26" height="25" rx="6" fill="#fffbeb" stroke="#d97706" stroke-width="1.6" />
      <rect x="2.6" y="2.4" width="22.8" height="22.2" rx="4.6" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.9" />
      ${pips
        .map(
          ([x, y]) => `
            <circle cx="${x}" cy="${y + 0.6}" r="2.6" fill="rgba(180, 83, 9, 0.28)" />
            <circle cx="${x}" cy="${y}" r="2.4" fill="${
              isCrimson ? "#dc2626" : "#18191b"
            }" />
          `
        )
        .join("")}
    </svg>
  `;
}

/**
 * Sculpted 3D twin-dice graphic embedded directly inside the Roll Dice button.
 */
export function renderRollDiceButtonGraphicSvg(size = 34): string {
  const w = Math.round(size * 1.48);
  return `
    <svg width="${w}" height="${size}" viewBox="0 0 52 35" aria-hidden="true" class="roll-dice-btn-graphic">
      <!-- Motion arc -->
      <path d="M3,26 Q14,4 32,7" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.4" stroke-dasharray="2.5,2.5" stroke-linecap="round" />
      <!-- Left tilted ivory die (showing 4 crimson pips) -->
      <g transform="translate(14, 18) rotate(-13)">
        <rect x="-10.5" y="-9" width="21" height="20.5" rx="4.6" fill="#78350f" opacity="0.55" />
        <rect x="-10.5" y="-10.5" width="21" height="20.5" rx="4.6" fill="#fffbeb" stroke="#f59e0b" stroke-width="1.4" />
        <circle cx="-5" cy="-5" r="1.95" fill="#dc2626" />
        <circle cx="5" cy="-5" r="1.95" fill="#dc2626" />
        <circle cx="-5" cy="4.5" r="1.95" fill="#dc2626" />
        <circle cx="5" cy="4.5" r="1.95" fill="#dc2626" />
      </g>
      <!-- Right overlapping amber-rimmed die (showing 6 ebony pips) -->
      <g transform="translate(35.5, 17.5) rotate(11)">
        <rect x="-10.5" y="-8.8" width="21" height="20.5" rx="4.6" fill="#451a03" opacity="0.58" />
        <rect x="-10.5" y="-10.5" width="21" height="20.5" rx="4.6" fill="#fef3c7" stroke="#d97706" stroke-width="1.4" />
        <circle cx="-5" cy="-5.8" r="1.8" fill="#18191b" />
        <circle cx="5" cy="-5.8" r="1.8" fill="#18191b" />
        <circle cx="-5" cy="-0.2" r="1.8" fill="#18191b" />
        <circle cx="5" cy="-0.2" r="1.8" fill="#18191b" />
        <circle cx="-5" cy="5.4" r="1.8" fill="#18191b" />
        <circle cx="5" cy="5.4" r="1.8" fill="#18191b" />
      </g>
    </svg>
  `;
}

export type ActionGraphicKind =
  | "road"
  | "ship"
  | "move_ship"
  | "settlement"
  | "city"
  | "wall"
  | "dev_card"
  | "maritime_trade"
  | "domestic_trade"
  | "knight"
  | "road_building"
  | "year_of_plenty"
  | "monopoly"
  | "robber"
  | "pirate"
  | "end_turn";

/**
 * Renders a crisp 3D-shaded mini piece/action SVG icon for buttons and on-map spot popovers.
 */
export function renderActionPieceIconSvg(
  kind: ActionGraphicKind,
  playerColor = "#fb923c",
  size = 20
): string {
  const light = shadeHexColor(playerColor, 0.35);
  const dark = shadeHexColor(playerColor, -0.32);

  switch (kind) {
    case "road":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <g transform="translate(12,12) rotate(-28)">
          <rect x="-10" y="-4.2" width="20" height="8.4" rx="2.6" fill="${dark}" stroke="#18191b" stroke-width="1.5"/>
          <rect x="-9" y="-3.3" width="18" height="5.6" rx="1.8" fill="${playerColor}"/>
          <rect x="-7.5" y="-2.5" width="15" height="1.8" rx="0.9" fill="${light}" opacity="0.88"/>
        </g>
      </svg>`;
    case "ship":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3,15.5 L21,15.5 L17.5,20 L6.5,20 Z" fill="${playerColor}" stroke="#18191b" stroke-width="1.3"/>
        <line x1="12" y1="15.5" x2="12" y2="4" stroke="#fde68a" stroke-width="1.5"/>
        <path d="M12.5,4.5 Q20,8.5 20,14.5 L12.5,14.5 Z" fill="#fffbeb" stroke="#18191b" stroke-width="1"/>
        <path d="M11.5,6.5 Q5.5,9.5 5.5,14.5 L11.5,14.5 Z" fill="${light}" stroke="#18191b" stroke-width="1"/>
      </svg>`;
    case "move_ship":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2,16.5 L16,16.5 L13.5,20 L4.5,20 Z" fill="${playerColor}" stroke="#18191b" stroke-width="1.2"/>
        <path d="M9.5,6 Q15.5,9.5 15.5,15.5 L9.5,15.5 Z" fill="#fffbeb" stroke="#18191b" stroke-width="1"/>
        <path d="M16,9 H22 M19.5,6 L22.5,9 L19.5,12" fill="none" stroke="#fde047" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "settlement":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,3.5 20.5,11 19.5,11 19.5,20 4.5,20 4.5,11 3.5,11" fill="${playerColor}" stroke="#18191b" stroke-width="1.5" stroke-linejoin="round"/>
        <polygon points="12,3.5 3.8,11 12,11" fill="${light}"/>
        <polygon points="12,11 19.5,11 19.5,20 12,20" fill="${dark}" opacity="0.65"/>
        <rect x="7" y="14" width="3.5" height="6" rx="1" fill="#18191b" opacity="0.8"/>
        <rect x="13.8" y="13" width="3.2" height="3.2" rx="0.6" fill="#fef08a" stroke="#18191b" stroke-width="0.8"/>
      </svg>`;
    case "city":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="3,20 3,9 7.8,3 12.5,9 12.5,12 17,8 21,12 21,20" fill="${playerColor}" stroke="#18191b" stroke-width="1.5" stroke-linejoin="round"/>
        <polygon points="3,9 7.8,3 12.5,9" fill="${light}"/>
        <rect x="12.5" y="12" width="8.5" height="8" fill="${dark}" opacity="0.6"/>
        <rect x="6" y="10.5" width="3.2" height="4.2" rx="1.2" fill="#fef08a" stroke="#18191b" stroke-width="0.8"/>
        <rect x="15" y="13.5" width="3.2" height="3.8" rx="1.2" fill="#fef08a" stroke="#18191b" stroke-width="0.8"/>
      </svg>`;
    case "wall":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3,20 V7 H6.5 V10 H10 V7 H14 V10 H17.5 V7 H21 V20 Z" fill="#fde68a" stroke="#451a03" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="9.5" y="13.5" width="5" height="6.5" rx="2.2" fill="#451a03"/>
      </svg>`;
    case "dev_card":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="2.5" width="16" height="19" rx="3" fill="#2c1d07" stroke="#fbbf24" stroke-width="1.5"/>
        <polygon points="12,6.2 13.6,10.2 17.8,10.5 14.5,13.2 15.6,17.4 12,15.1 8.4,17.4 9.5,13.2 6.2,10.5 10.4,10.2" fill="#fde047"/>
      </svg>`;
    case "maritime_trade":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="6" r="2.3" fill="none" stroke="#38bdf8" stroke-width="1.7"/>
        <line x1="12" y1="8.3" x2="12" y2="19.5" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="8" y1="11.5" x2="16" y2="11.5" stroke="#bae6fd" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M5.5,15 C5.5,19 9,20.5 12,20.5 C15,20.5 18.5,19 18.5,15" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`;
    case "domestic_trade":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4,8.5 H18.5 L15,5" fill="none" stroke="#fde047" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20,15.5 H5.5 L9,19" fill="none" stroke="#4ade80" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "knight":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6,4 H18 V12 C18,17.5 12,21 12,21 C12,21 6,17.5 6,12 Z" fill="#dc2626" stroke="#fde68a" stroke-width="1.5"/>
        <path d="M12,4.5 V20.2 M6.5,11.5 H17.5" stroke="#fde68a" stroke-width="1.4"/>
      </svg>`;
    case "road_building":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3,18 Q9,8 14,12 T21,6" fill="none" stroke="#fde68a" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M3,18 Q9,8 14,12 T21,6" fill="none" stroke="#b45309" stroke-width="2.2" stroke-dasharray="3,2.5" stroke-linecap="round"/>
      </svg>`;
    case "year_of_plenty":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="13" r="4.5" fill="#facc15" stroke="#fef08a" stroke-width="1"/>
        <circle cx="15.5" cy="11" r="4.5" fill="#4ade80" stroke="#dcfce7" stroke-width="1"/>
      </svg>`;
    case "monopoly":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="12" y1="4" x2="12" y2="20" stroke="#fbbf24" stroke-width="1.8"/>
        <line x1="5" y1="8.5" x2="19" y2="8.5" stroke="#fde68a" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M3,15.5 Q5.5,19 8,15.5 Z" fill="#fbbf24"/>
        <path d="M16,15.5 Q18.5,19 21,15.5 Z" fill="#fbbf24"/>
      </svg>`;
    case "robber":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="7" r="4" fill="#27272a" stroke="#f8fafc" stroke-width="1.3"/>
        <path d="M6.5,19.5 C7.2,11.5 9.5,10.5 12,10.5 C14.5,10.5 16.8,11.5 17.5,19.5 Z" fill="#18191b" stroke="#e2e8f0" stroke-width="1.3"/>
      </svg>`;
    case "pirate":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3,16 L21,16 L17.5,20.5 L6.5,20.5 Z" fill="#18191b" stroke="#fbbf24" stroke-width="1.3"/>
        <path d="M12,4.5 Q19.5,8.5 19.5,15 L12,15 Z" fill="#27272a" stroke="#f8fafc" stroke-width="1.1"/>
      </svg>`;
    case "end_turn":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5,12 H18.5 M13.5,7 L19,12 L13.5,17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }
}

/**
 * Compact illustrated resource card SVG at custom size for the 5-column aligned trade grid,
 * incoming trade popups, and on-map dice production HUD.
 */
export function renderMiniResourceCardSvg(
  resource: ResourceType,
  width = 56,
  height = 36
): string {
  return renderResourceCardIllustrationSvg(resource)
    .replace('width="76"', `width="${width}"`)
    .replace('height="48"', `height="${height}"`);
}

export function getCatanBoardViewBox(state: CatanState): {
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
} {
  const topo = state.topology;
  const hexSize = topo.hexSize;
  const outerOceanHexes = new Map<
    string,
    { centerX: number; centerY: number }
  >();
  for (const hId of topo.hexOrder) {
    const hNode = topo.hexes[hId]!;
    for (const nb of axialNeighbors({ q: hNode.q, r: hNode.r })) {
      const nbId = hexId(nb.q, nb.r);
      if (!topo.hexes[nbId] && !outerOceanHexes.has(nbId)) {
        const pt = hexToPixel(nb.q, nb.r, hexSize);
        outerOceanHexes.set(nbId, { centerX: pt.x, centerY: pt.y });
      }
    }
  }

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

export function getBoardSpotPercentPosition(
  state: CatanState,
  spot: { kind: "edge" | "vertex" | "hex"; id: string }
): { xPct: number; yPct: number } {
  const vb = getCatanBoardViewBox(state);
  let x = vb.vbX + vb.vbW / 2;
  let y = vb.vbY + vb.vbH / 2;

  if (spot.kind === "edge") {
    const e = state.topology.edges[spot.id];
    if (e) {
      x = e.midX;
      y = e.midY;
    }
  } else if (spot.kind === "vertex") {
    const v = state.topology.vertices[spot.id];
    if (v) {
      x = v.x;
      y = v.y;
    }
  } else {
    const h = state.topology.hexes[spot.id];
    if (h) {
      x = h.centerX;
      y = h.centerY;
    }
  }

  const rawX = ((x - vb.vbX) / Math.max(1, vb.vbW)) * 100;
  const rawY = ((y - vb.vbY) / Math.max(1, vb.vbH)) * 100;
  return {
    xPct: Math.max(16, Math.min(84, rawX)),
    yPct: Math.max(18, Math.min(82, rawY)),
  };
}

export function renderCatanBoardSvg(
  state: CatanState,
  actingPlayerId: string | null,
  options: {
    buildMode: string | null;
    setupEdgeKind: "road" | "ship";
    robberOrPirateMode: "robber" | "pirate";
    selectedMoveFromEdgeId: string | null;
    selectedSpot?: { kind: "edge" | "vertex" | "hex"; id: string } | null;
  }
): string {
  const topo = state.topology;
  const hexSize = topo.hexSize;

  // Surrounding outer ocean ring hexes so every island sits in real ocean water
  const outerOceanHexes = new Map<
    string,
    { id: string; q: number; r: number; centerX: number; centerY: number }
  >();
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

  const clickableHexes = new Set<string>();
  const clickableVertices = new Set<string>();
  const clickableEdges = new Set<string>();

  if (actingPlayerId) {
    if (
      state.phase === "SETUP_SETTLEMENT_1" ||
      state.phase === "SETUP_SETTLEMENT_2"
    ) {
      getLegalSettlementVertices(state, actingPlayerId, true).forEach((v) =>
        clickableVertices.add(v)
      );
    } else if (
      state.phase === "SETUP_ROAD_1" ||
      state.phase === "SETUP_ROAD_2"
    ) {
      const anchor = state.lastSetupSettlementVertexId;
      if (options.setupEdgeKind === "ship" && state.config.enableSeafarers) {
        getLegalShipEdges(state, actingPlayerId, anchor).forEach((e) =>
          clickableEdges.add(e)
        );
      } else {
        getLegalRoadEdges(state, actingPlayerId, anchor).forEach((e) =>
          clickableEdges.add(e)
        );
      }
    } else if (state.phase === "MOVE_ROBBER_OR_PIRATE") {
      if (
        options.robberOrPirateMode === "pirate" &&
        state.config.enableSeafarers
      ) {
        getLegalPirateHexes(state).forEach((h) => clickableHexes.add(h));
      } else {
        getLegalRobberHexes(state, actingPlayerId).forEach((h) =>
          clickableHexes.add(h)
        );
      }
    } else if (state.phase === "ROAD_BUILDING_DEV") {
      getLegalRoadEdges(state, actingPlayerId, null).forEach((e) =>
        clickableEdges.add(e)
      );
      getLegalShipEdges(state, actingPlayerId, null).forEach((e) =>
        clickableEdges.add(e)
      );
    } else if (
      state.phase === "MAIN_PHASE" ||
      state.phase === "SPECIAL_BUILDING"
    ) {
      if (options.buildMode === "settlement") {
        getLegalSettlementVertices(state, actingPlayerId, false).forEach((v) =>
          clickableVertices.add(v)
        );
      } else if (options.buildMode === "city") {
        for (const [vId, b] of Object.entries(state.buildings)) {
          if (b.ownerId === actingPlayerId && b.type === "settlement") {
            clickableVertices.add(vId);
          }
        }
      } else if (options.buildMode === "wall") {
        for (const [vId, b] of Object.entries(state.buildings)) {
          if (
            b.ownerId === actingPlayerId &&
            b.type === "city" &&
            !b.hasWall
          ) {
            clickableVertices.add(vId);
          }
        }
      } else if (options.buildMode === "road") {
        getLegalRoadEdges(state, actingPlayerId, null).forEach((e) =>
          clickableEdges.add(e)
        );
      } else if (options.buildMode === "ship") {
        getLegalShipEdges(state, actingPlayerId, null).forEach((e) =>
          clickableEdges.add(e)
        );
      } else if (options.buildMode === "move_ship") {
        const moves = getLegalMoveShipActions(state, actingPlayerId);
        if (!options.selectedMoveFromEdgeId) {
          moves.forEach((m) => clickableEdges.add(m.fromEdgeId));
        } else {
          moves
            .filter((m) => m.fromEdgeId === options.selectedMoveFromEdgeId)
            .forEach((m) => clickableEdges.add(m.toEdgeId));
        }
      }
    }
  }

  // Build hex clipPaths for clean full-bleed biome dioramas
  const clipDefs: string[] = [];
  topo.hexOrder.forEach((hId, idx) => {
    const hNode = topo.hexes[hId]!;
    const tile = state.hexes[hId]!;
    const isLand = tile.terrain !== "sea" && tile.terrain !== "fog";
    const clipPts = getPolygonPoints(
      hNode.centerX,
      hNode.centerY,
      isLand ? hexSize - 2.6 : hexSize - 0.6
    );
    clipDefs.push(
      `<clipPath id="catan-hex-clip-${idx}"><polygon points="${clipPts}" /></clipPath>`
    );
  });

  const parts: string[] = [];
  // IMPORTANT: filterUnits="userSpaceOnUse" prevents SVG objectBoundingBox clipping on vertical (x1===x2) or horizontal edges!
  parts.push(`
    <svg class="board-svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="piece-shadow" filterUnits="userSpaceOnUse" x="-2500" y="-2500" width="5000" height="5000">
          <feDropShadow dx="0" dy="2.4" stdDeviation="2.1" flood-color="#000000" flood-opacity="0.6" />
        </filter>
        <filter id="island-shelf-shadow" filterUnits="userSpaceOnUse" x="-2500" y="-2500" width="5000" height="5000">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#02131f" flood-opacity="0.72" />
        </filter>
        <radialGradient id="grad-forest" cx="50%" cy="32%" r="72%">
          <stop offset="0%" stop-color="#16a34a" />
          <stop offset="58%" stop-color="#15803d" />
          <stop offset="100%" stop-color="#064e3b" />
        </radialGradient>
        <radialGradient id="grad-hills" cx="50%" cy="30%" r="72%">
          <stop offset="0%" stop-color="#fb923c" />
          <stop offset="52%" stop-color="#ea580c" />
          <stop offset="100%" stop-color="#7c2d12" />
        </radialGradient>
        <radialGradient id="grad-pasture" cx="50%" cy="30%" r="72%">
          <stop offset="0%" stop-color="#a3e635" />
          <stop offset="55%" stop-color="#65a30d" />
          <stop offset="100%" stop-color="#365314" />
        </radialGradient>
        <radialGradient id="grad-fields" cx="50%" cy="28%" r="72%">
          <stop offset="0%" stop-color="#fef08a" />
          <stop offset="52%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#a16207" />
        </radialGradient>
        <radialGradient id="grad-mountains" cx="50%" cy="28%" r="72%">
          <stop offset="0%" stop-color="#94a3b8" />
          <stop offset="55%" stop-color="#475569" />
          <stop offset="100%" stop-color="#1e293b" />
        </radialGradient>
        <radialGradient id="grad-desert" cx="50%" cy="30%" r="72%">
          <stop offset="0%" stop-color="#fde68a" />
          <stop offset="58%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#b45309" />
        </radialGradient>
        <radialGradient id="grad-sea" cx="50%" cy="50%" r="74%">
          <stop offset="0%" stop-color="#0284c7" />
          <stop offset="65%" stop-color="#0369a1" />
          <stop offset="100%" stop-color="#075985" />
        </radialGradient>
        <radialGradient id="grad-ocean-frame" cx="50%" cy="50%" r="78%">
          <stop offset="0%" stop-color="#0369a1" />
          <stop offset="70%" stop-color="#075985" />
          <stop offset="100%" stop-color="#0c4a6e" />
        </radialGradient>
        <radialGradient id="grad-gold" cx="50%" cy="32%" r="70%">
          <stop offset="0%" stop-color="#fef08a" />
          <stop offset="55%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#92400e" />
        </radialGradient>
        <radialGradient id="grad-fog" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#1e3a52" />
          <stop offset="100%" stop-color="#0b1926" />
        </radialGradient>
        <radialGradient id="grad-chit-ivory" cx="42%" cy="32%" r="70%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="65%" stop-color="#fffbeb" />
          <stop offset="100%" stop-color="#fde68a" />
        </radialGradient>
        ${clipDefs.join("\n")}
      </defs>

      <!-- Subtle nautical chart rings behind the archipelago -->
      <g pointer-events="none" opacity="0.22">
        <circle cx="0" cy="0" r="${Math.round(Math.min(vbW, vbH) * 0.44)}" fill="none" stroke="#7dd3fc" stroke-width="0.9" stroke-dasharray="6,6" />
        <circle cx="0" cy="0" r="${Math.round(Math.min(vbW, vbH) * 0.34)}" fill="none" stroke="#38bdf8" stroke-width="0.7" />
      </g>
  `);

  // 0. Render Outer Ocean Frame Ring + Seamless Perimeter Maritime Bevel
  // Neighbor directions matching clockwise corner edges 0..5: NE, E, SE, SW, W, NW
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

  // Outer carved teak & brass board frame border along perimeter edges
  if (perimeterSegments.length > 0) {
    parts.push(`
      <g pointer-events="none" stroke-linecap="round">
        <g stroke="#451a03" stroke-width="7.5">${perimeterSegments.join("")}</g>
        <g stroke="#b45309" stroke-width="4.2">${perimeterSegments.join("")}</g>
        <g stroke="#fde68a" stroke-width="1.3" opacity="0.78">${perimeterSegments.join("")}</g>
      </g>
    `);
  }

  // 0b. Render 3D Island Landmass Extrusion & Turquoise Lagoon Reef Halo
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
      // Warm die-cut wooden/parchment tile rim
      parts.push(
        `<polygon points="${bevelPts}" fill="#fde68a" stroke="#451a03" stroke-width="1.2" />`
      );
    }

    // Base biome fill + clipped diorama scene
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

    // Crisp inner tile bevel highlight (or golden harvest glow when rolled!)
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

    // Large, high-contrast turned-ivory number token medallion
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

    // Foreign Island bonus badge
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

    // Sculpted Turned-Wood Obsidian Robber Pawn
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

    // Sculpted Black-Brigantine Pirate Ship
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
    const landHex = adjHexId ? topo.hexes[adjHexId] : null;
    const dx = landHex ? eNode.midX - landHex.centerX : 0;
    const dy = landHex ? eNode.midY - landHex.centerY : 0;
    const bx = Number((eNode.midX + dx * 0.72).toFixed(2));
    const by = Number((eNode.midY + dy * 0.72).toFixed(2));

    const isGeneric = harbor.type === "generic";
    const ratioText = isGeneric ? "3:1" : "2:1";
    const subLabel =
      harbor.type === "generic" ? "Any" : RESOURCE_META[harbor.type].label;
    const strokeAccent =
      harbor.type === "generic" ? "#b45309" : RESOURCE_META[harbor.type].accent;
    const badgeW = isGeneric ? 46 : 58;

    parts.push(`
      <g filter="url(#piece-shadow)" class="harbor-marker">
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

  // 3. Render 3D Beveled Wooden Roads & Seafarers Caravel Ships + Clickable Edges
  // NOTE: Roads are rendered as 2D rotated planks (<rect>) + userSpaceOnUse shadow so vertical edges (x1 === x2) NEVER clip or disappear!
  for (const eId of topo.edgeOrder) {
    const eNode = topo.edges[eId]!;
    const route = state.edges[eId];
    const isClickable = clickableEdges.has(eId);

    if (route) {
      const owner = state.players.find((p) => p.id === route.ownerId);
      const baseColor = owner?.color ?? "#ffffff";
      const lightTint = shadeHexColor(baseColor, 0.34);
      const darkShade = shadeHexColor(baseColor, -0.34);

      if (route.type === "road") {
        const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
        const plankLen = Math.max(25, Number((edgeLen * 0.78).toFixed(2)));
        parts.push(`
          <g class="catan-road-piece" data-road-edge-id="${eId}" data-spot-edge="${eId}"
             transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})"
             filter="url(#piece-shadow)">
            <!-- White contrast halo + dark timber outline -->
            <rect x="${(-plankLen / 2 - 0.8).toFixed(2)}" y="-6.2" width="${(plankLen + 1.6).toFixed(2)}" height="12.4" rx="3.8"
                  fill="#ffffff" opacity="0.65" />
            <rect x="${(-plankLen / 2).toFixed(2)}" y="-5.6" width="${plankLen}" height="11.2" rx="3.2"
                  fill="${darkShade}" stroke="#18191b" stroke-width="1.9" />
            <!-- Main painted wooden plank -->
            <rect x="${(-plankLen / 2 + 1).toFixed(2)}" y="-4.6" width="${(plankLen - 2).toFixed(2)}" height="7.6" rx="2.2"
                  fill="${baseColor}" />
            <!-- Top specular bevel -->
            <rect x="${(-plankLen / 2 + 2.4).toFixed(2)}" y="-3.7" width="${(plankLen - 4.8).toFixed(2)}" height="2.2" rx="1"
                  fill="${lightTint}" opacity="0.88" />
          </g>
        `);
      } else {
        parts.push(`
          <g transform="translate(${eNode.midX}, ${eNode.midY})" class="catan-ship-piece ${
            isClickable ? "clickable-target" : ""
          }" data-edge-id="${eId}" data-spot-edge="${eId}" filter="url(#piece-shadow)">
            <ellipse cx="0" cy="8.2" rx="13" ry="3.4" fill="rgba(224, 242, 254, 0.5)" />
            <path d="M-11.5,1.8 L11.5,1.8 L7.5,7.8 L-7.5,7.8 Z" fill="${darkShade}" stroke="#18191b" stroke-width="1.5" />
            <path d="M-10.2,2.2 L10.2,2.2 L7.2,5.6 L-7.2,5.6 Z" fill="${baseColor}" />
            <line x1="0" y1="2" x2="0" y2="-11.5" stroke="#451a03" stroke-width="1.6" />
            <path d="M0.5,-10.5 Q9.5,-5.5 9.5,1 L0.5,1 Z" fill="#fffbeb" stroke="#18191b" stroke-width="1.1" />
            <path d="M-0.5,-8.5 Q-7.5,-4.5 -7.5,1 L-0.5,1 Z" fill="${lightTint}" stroke="#18191b" stroke-width="1" />
            <polygon points="0,-11.5 5.5,-10 0,-8.5" fill="${baseColor}" />
          </g>
        `);
      }
    }

    const isSelectedEdge =
      options.selectedSpot?.kind === "edge" && options.selectedSpot.id === eId;

    if (isClickable) {
      const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
      const hitLen = Math.max(24, Number((edgeLen * 0.76).toFixed(2)));
      parts.push(`
        <g class="clickable-target pulse-highlight" data-edge-id="${eId}" data-spot-edge="${eId}">
          <g transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})">
            <rect x="${(-hitLen / 2).toFixed(2)}" y="-6" width="${hitLen}" height="12" rx="5"
                  fill="#fde047" opacity="0.58" stroke="#18191b" stroke-width="1.3" />
          </g>
          <circle cx="${eNode.midX}" cy="${eNode.midY}" r="7.8" fill="#fde047" stroke="#18191b" stroke-width="1.8" />
        </g>
      `);
    } else if (
      actingPlayerId &&
      (state.phase === "MAIN_PHASE" || state.phase === "SPECIAL_BUILDING")
    ) {
      const hasLandOrShipSpot = eNode.adjacentHexIds.some((id) => {
        const t = state.hexes[id]?.terrain;
        return t && (t !== "sea" || state.config.enableSeafarers);
      });
      if (hasLandOrShipSpot) {
        const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
        const hitLen = Math.max(24, Number((edgeLen * 0.72).toFixed(2)));
        parts.push(`
          <g class="spot-hit-target ${isSelectedEdge ? "is-selected-spot" : ""}" data-spot-edge="${eId}">
            <g transform="translate(${eNode.midX}, ${eNode.midY}) rotate(${eNode.angleDeg})">
              <rect x="${(-hitLen / 2).toFixed(2)}" y="-7" width="${hitLen}" height="14" rx="6"
                    fill="${isSelectedEdge ? "rgba(56, 189, 248, 0.38)" : "transparent"}"
                    stroke="${isSelectedEdge ? "#38bdf8" : "transparent"}" stroke-width="2" />
            </g>
            ${
              isSelectedEdge
                ? `<circle cx="${eNode.midX}" cy="${eNode.midY}" r="8.5" fill="#38bdf8" stroke="#18191b" stroke-width="1.8" />`
                : ""
            }
          </g>
        `);
      }
    }
  }

  // 4. Render 3D Isometric Settlements, Fortified Cities & Bastion City Walls + Clickable Vertices
  for (const vId of topo.vertexOrder) {
    const vNode = topo.vertices[vId]!;
    const building = state.buildings[vId];
    const isClickable = clickableVertices.has(vId);

    if (building) {
      const owner = state.players.find((p) => p.id === building.ownerId);
      const baseColor = owner?.color ?? "#ffffff";
      const roofLight = shadeHexColor(baseColor, 0.36);
      const wallShadow = shadeHexColor(baseColor, -0.28);
      const vx = vNode.x;
      const vy = vNode.y;

      parts.push(
        `<g class="${
          isClickable ? "clickable-target" : "spot-vertex-group"
        }" data-vertex-id="${vId}" data-spot-vertex="${vId}" filter="url(#piece-shadow)">`
      );

      if (building.hasWall) {
        // Sculpted stone rampart bastion with 4 corner turrets
        parts.push(`
          <g transform="translate(${vx}, ${vy})">
            <rect x="-16" y="-14" width="32" height="27" rx="6" fill="rgba(24, 25, 27, 0.72)" stroke="#fde68a" stroke-width="2.4" />
            <circle cx="-15" cy="-13" r="3.2" fill="#fde68a" stroke="#78350f" stroke-width="1" />
            <circle cx="15" cy="-13" r="3.2" fill="#fde68a" stroke="#78350f" stroke-width="1" />
            <circle cx="-15" cy="12" r="3.2" fill="#fde68a" stroke="#78350f" stroke-width="1" />
            <circle cx="15" cy="12" r="3.2" fill="#fde68a" stroke="#78350f" stroke-width="1" />
          </g>
        `);
      }

      if (building.type === "settlement") {
        // 3D Isometric Wooden Homestead
        parts.push(`
          <g transform="translate(${vx}, ${vy})">
            <!-- Contrast rim -->
            <polygon points="0,-13 11.5,-3.5 11.5,9.5 -11.5,9.5 -11.5,-3.5"
                     fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linejoin="round" opacity="0.72" />
            <!-- Left sunlit wall & right shaded wall -->
            <polygon points="-10.5,-3 0,-3 0,8.8 -10.5,8.8" fill="${baseColor}" />
            <polygon points="0,-3 10.5,-3 10.5,8.8 0,8.8" fill="${wallShadow}" />
            <!-- Left sunlit roof & right roof slope -->
            <polygon points="0,-12.2 -11.2,-2.8 0,-2.8" fill="${roofLight}" />
            <polygon points="0,-12.2 11.2,-2.8 0,-2.8" fill="${baseColor}" />
            <!-- Timber outline + arched doorway & warm window -->
            <polygon points="0,-12.2 11.2,-2.8 10.5,-2.8 10.5,8.8 -10.5,8.8 -10.5,-2.8 -11.2,-2.8"
                     fill="none" stroke="#18191b" stroke-width="1.9" stroke-linejoin="round" />
            <line x1="0" y1="-12.2" x2="0" y2="8.8" stroke="#18191b" stroke-width="1.1" opacity="0.45" />
            <path d="M-6.8,8.8 V3.4 A2.1,2.1 0 0,1 -2.6,3.4 V8.8 Z" fill="#18191b" opacity="0.78" />
            <rect x="3.2" y="1.2" width="3.8" height="3.8" rx="0.7" fill="#fef08a" stroke="#18191b" stroke-width="0.9" />
          </g>
        `);
      } else {
        // 3D Isometric Fortified Citadel / City
        parts.push(`
          <g transform="translate(${vx}, ${vy})">
            <!-- Stone plinth & contrast halo -->
            <polygon points="-13.5,10 -13.5,-6.5 -6,-16 1.5,-6.5 13.5,-6.5 13.5,10"
                     fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linejoin="round" opacity="0.82" />
            <!-- Left watchtower body & spire -->
            <rect x="-12.8" y="-6.5" width="13.2" height="16.2" fill="${baseColor}" />
            <polygon points="-13.5,-6.5 -6.2,-16 1.2,-6.5" fill="${roofLight}" />
            <polygon points="-6.2,-16 1.2,-6.5 -6.2,-6.5" fill="${baseColor}" />
            <!-- Right grand hall -->
            <rect x="0.4" y="-2.5" width="12.4" height="12.2" fill="${wallShadow}" />
            <polygon points="-0.2,-2.5 6.6,-8.5 13.4,-2.5" fill="${roofLight}" />
            <!-- Crisp architectural outline -->
            <polygon points="-12.8,9.7 -12.8,-6.5 -6.2,-16 0.4,-7.5 0.4,-2.5 6.6,-8.5 12.8,-2.5 12.8,9.7"
                     fill="none" stroke="#18191b" stroke-width="1.85" stroke-linejoin="round" />
            <!-- Glowing cathedral windows & gate -->
            <rect x="-8.4" y="-3.2" width="3.8" height="5.2" rx="1.8" fill="#fef08a" stroke="#18191b" stroke-width="0.9" />
            <rect x="4.6" y="0.5" width="4" height="4.8" rx="1.8" fill="#fef08a" stroke="#18191b" stroke-width="0.9" />
            <rect x="-8.2" y="4.2" width="3.6" height="5.5" rx="1" fill="#18191b" opacity="0.78" />
          </g>
        `);
      }

      parts.push(`</g>`);
    }

    const isSelectedVertex =
      options.selectedSpot?.kind === "vertex" &&
      options.selectedSpot.id === vId;

    if (isClickable) {
      parts.push(`
        <g class="clickable-target pulse-highlight" data-vertex-id="${vId}" data-spot-vertex="${vId}">
          <circle cx="${vNode.x}" cy="${vNode.y}" r="11.2" fill="rgba(253, 224, 71, 0.9)" stroke="#18191b" stroke-width="2.2" />
          <circle cx="${vNode.x}" cy="${vNode.y}" r="4.2" fill="#18191b" opacity="0.7" />
        </g>
      `);
    } else if (
      actingPlayerId &&
      (state.phase === "MAIN_PHASE" || state.phase === "SPECIAL_BUILDING")
    ) {
      const touchesLand = vNode.adjacentHexIds.some(
        (id) => state.hexes[id]?.terrain !== "sea"
      );
      if (touchesLand) {
        parts.push(`
          <g class="spot-hit-target ${isSelectedVertex ? "is-selected-spot" : ""}" data-spot-vertex="${vId}">
            <circle cx="${vNode.x}" cy="${vNode.y}" r="11.5"
                    fill="${isSelectedVertex ? "rgba(56, 189, 248, 0.35)" : "transparent"}"
                    stroke="${isSelectedVertex ? "#38bdf8" : "transparent"}" stroke-width="2.2" />
          </g>
        `);
      }
    }
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

/**
 * Renders a framed scenic SVG vignette for a Catan Resource Card.
 */
export function renderResourceCardIllustrationSvg(
  resource: ResourceType
): string {
  switch (resource) {
    case "brick":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#431407" />
          <path d="M0,34 Q22,12 44,28 T80,22 L80,52 L0,52 Z" fill="#9a3412" />
          <path d="M0,42 Q30,28 80,38 L80,52 L0,52 Z" fill="#7c2d12" />
          <rect x="12" y="26" width="24" height="11" rx="2" fill="#ea580c" stroke="#ffedd5" stroke-width="1.2" />
          <rect x="40" y="26" width="24" height="11" rx="2" fill="#c2410c" stroke="#fed7aa" stroke-width="1.2" />
          <rect x="25" y="13" width="26" height="11" rx="2" fill="#f97316" stroke="#ffffff" stroke-width="1.2" />
        </svg>
      `;
    case "lumber":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#052e16" />
          <path d="M0,38 Q26,26 54,34 T80,32 L80,52 L0,52 Z" fill="#14532d" />
          <polygon points="10,36 23,9 36,36" fill="#15803d" stroke="#86efac" stroke-width="1" />
          <polygon points="28,36 42,6 56,36" fill="#16a34a" stroke="#bbf7d0" stroke-width="1.1" />
          <polygon points="48,36 60,12 72,36" fill="#059669" stroke="#6ee7b7" stroke-width="1" />
          <rect x="20" y="34" width="38" height="9" rx="4.2" fill="#78350f" stroke="#fde68a" stroke-width="1.1" />
          <circle cx="57" cy="38.5" r="3.8" fill="#fef3c7" stroke="#78350f" stroke-width="1" />
        </svg>
      `;
    case "wool":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#1a2e05" />
          <path d="M0,32 Q28,18 56,28 T80,26 L80,52 L0,52 Z" fill="#4d7c0f" />
          <path d="M0,41 Q36,32 80,40 L80,52 L0,52 Z" fill="#365314" />
          <line x1="25" y1="34" x2="25" y2="43" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
          <line x1="41" y1="34" x2="41" y2="43" stroke="#0f172a" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="26" cy="27" r="10.5" fill="#e2e8f0" />
          <circle cx="40" cy="27.5" r="10.5" fill="#f8fafc" />
          <circle cx="33" cy="19.5" r="10" fill="#ffffff" />
          <circle cx="51" cy="23.5" r="6.2" fill="#1e293b" />
          <circle cx="53" cy="22" r="1.5" fill="#ffffff" />
        </svg>
      `;
    case "grain":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#422006" />
          <path d="M0,36 Q28,24 58,34 T80,32 L80,52 L0,52 Z" fill="#a16207" />
          <line x1="22" y1="45" x2="27" y2="12" stroke="#fde047" stroke-width="2.6" stroke-linecap="round" />
          <ellipse cx="27" cy="15" rx="5" ry="9" fill="#facc15" stroke="#fef08a" stroke-width="1" />
          <line x1="40" y1="45" x2="40" y2="8" stroke="#fef08a" stroke-width="3" stroke-linecap="round" />
          <ellipse cx="40" cy="12" rx="5.6" ry="10" fill="#fde047" stroke="#ffffff" stroke-width="1.1" />
          <line x1="58" y1="45" x2="53" y2="12" stroke="#fde047" stroke-width="2.6" stroke-linecap="round" />
          <ellipse cx="53" cy="15" rx="5" ry="9" fill="#facc15" stroke="#fef08a" stroke-width="1" />
        </svg>
      `;
    case "ore":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#0f172a" />
          <polygon points="6,46 26,10 46,46" fill="#475569" stroke="#cbd5e1" stroke-width="1.1" />
          <polygon points="26,10 20,22 26,25 32,21" fill="#f8fafc" />
          <polygon points="28,46 50,6 72,46" fill="#64748b" stroke="#f8fafc" stroke-width="1.2" />
          <polygon points="50,6 43,20 50,23 57,19" fill="#ffffff" />
          <polygon points="36,42 44,26 54,32 48,46" fill="#38bdf8" opacity="0.72" />
        </svg>
      `;
  }
}

/**
 * Renders a bespoke SVG emblem vignette for each Catan Development Card.
 */
export function renderDevCardIllustrationSvg(devType: DevCardType): string {
  switch (devType) {
    case "knight":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#2a1215" />
          <line x1="34" y1="36" x2="86" y2="8" stroke="#cbd5e1" stroke-width="2.4" stroke-linecap="round" />
          <line x1="86" y1="36" x2="34" y2="8" stroke="#cbd5e1" stroke-width="2.4" stroke-linecap="round" />
          <path d="M47,9 H73 V22 C73,31 60,37 60,37 C60,37 47,31 47,22 Z" fill="#dc2626" stroke="#fde68a" stroke-width="1.6" />
          <path d="M60,9 V36.5 M47.5,21 H72.5" stroke="#fde68a" stroke-width="1.5" />
        </svg>
      `;
    case "road_building":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#0c2438" />
          <path d="M14,36 Q42,14 64,24 T106,10" fill="none" stroke="#fde68a" stroke-width="8" stroke-linecap="round" />
          <path d="M14,36 Q42,14 64,24 T106,10" fill="none" stroke="#b45309" stroke-width="4.5" stroke-dasharray="6,4" stroke-linecap="round" />
        </svg>
      `;
    case "year_of_plenty":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#0b2918" />
          <circle cx="44" cy="22" r="10" fill="#facc15" stroke="#fef08a" stroke-width="1.3" />
          <circle cx="62" cy="18" r="9" fill="#4ade80" stroke="#dcfce7" stroke-width="1.2" />
          <circle cx="76" cy="24" r="9.5" fill="#fb923c" stroke="#ffedd5" stroke-width="1.2" />
        </svg>
      `;
    case "monopoly":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#2b1908" />
          <line x1="60" y1="8" x2="60" y2="36" stroke="#fbbf24" stroke-width="2.2" />
          <line x1="36" y1="15" x2="84" y2="15" stroke="#fde68a" stroke-width="2" stroke-linecap="round" />
          <path d="M30,27 Q36,34 42,27 Z" fill="#fbbf24" />
          <path d="M78,27 Q84,34 90,27 Z" fill="#fbbf24" />
          <line x1="36" y1="15" x2="32" y2="27" stroke="#fde68a" stroke-width="1.1" />
          <line x1="36" y1="15" x2="40" y2="27" stroke="#fde68a" stroke-width="1.1" />
          <line x1="84" y1="15" x2="80" y2="27" stroke="#fde68a" stroke-width="1.1" />
          <line x1="84" y1="15" x2="88" y2="27" stroke="#fde68a" stroke-width="1.1" />
          <rect x="50" y="34" width="20" height="3.5" rx="1.5" fill="#f59e0b" />
        </svg>
      `;
    case "victory_point":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#2c1d07" />
          <path d="M42,33 C34,26 36,13 46,9" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" />
          <path d="M78,33 C86,26 84,13 74,9" fill="none" stroke="#fbbf24" stroke-width="2.4" stroke-linecap="round" />
          <polygon points="60,8 63.5,16.5 72.5,17 65.5,22.8 67.8,31.5 60,26.8 52.2,31.5 54.5,22.8 47.5,17 56.5,16.5" fill="#fde047" stroke="#f59e0b" stroke-width="1" />
        </svg>
      `;
  }
}

/**
 * Renders the visual tabletop Card Hand tray for the active/human player in Catan.
 */
export function renderCatanVisualHandTray(
  state: CatanState,
  player: CatanPlayerState,
  legalActions: CatanAction[]
): string {
  const safeLimit = getPlayerSafeHandLimit(state, player.id);
  const totalRes = totalResourceCount(player.resources);
  const unplayedDevs = player.devCards.filter((c) => !c.played);

  const devGroups = new Map<
    DevCardType,
    { total: number; playableNow: boolean; boughtThisTurn: number }
  >();
  for (const c of unplayedDevs) {
    const existing = devGroups.get(c.type) ?? {
      total: 0,
      playableNow: false,
      boughtThisTurn: 0,
    };
    existing.total++;
    if (c.boughtOnTurn === state.turn) {
      existing.boughtThisTurn++;
    }
    devGroups.set(c.type, existing);
  }

  const canPlayKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
  const canPlayRoadBuild = legalActions.some(
    (a) => a.type === "PLAY_ROAD_BUILDING"
  );
  const canPlayYoP = legalActions.some((a) => a.type === "PLAY_YEAR_OF_PLENTY");
  const canPlayMonopoly = legalActions.some((a) => a.type === "PLAY_MONOPOLY");

  return `
    <div class="visual-hand-tray">
      <div class="hand-tray-header">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${player.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${player.name} hand</strong>
          <span class="ga-chip ${totalRes > safeLimit ? "ga-chip--danger" : "ga-chip--ok"} ga-num">
            ${totalRes}/${safeLimit} resources
          </span>
          <span class="ga-chip ga-num">
            ${unplayedDevs.length} dev ${unplayedDevs.length === 1 ? "card" : "cards"}
          </span>
        </div>
        <div class="muted">
          Select a resource card to trade or discard, or play a development card
        </div>
      </div>

      <div class="hand-cards-scroll">
        <div class="hand-section-cards">
          ${RESOURCES.map((res) => {
            const count = player.resources[res];
            const meta = RESOURCE_META[res];
            const hasCards = count > 0;
            const stackAttr =
              count >= 3 ? 'data-stack="3"' : count === 2 ? 'data-stack="2"' : "";
            return `
              <div class="playing-card resource-playing-card ${
                hasCards ? "has-cards" : "empty-card"
              }"
                   data-hand-res-card="${res}" ${stackAttr}
                   style="--card-top: ${meta.bgTop}; --card-bottom: ${
                     meta.bgBottom
                   }; --card-border: ${meta.border}; --card-accent: ${meta.accent};">
                <div class="playing-card-top">
                  <span class="playing-card-glyph">${renderResourceGlyphSvg(res)}</span>
                  <span class="playing-card-count ${hasCards ? "active" : ""}">×${count}</span>
                </div>
                <div class="playing-card-art">
                  ${renderResourceCardIllustrationSvg(res)}
                </div>
                <div class="playing-card-footer">
                  <div class="playing-card-title">${meta.label}</div>
                  <div class="playing-card-sub">${meta.subtitle}</div>
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <div class="hand-divider"></div>

        <div class="hand-section-cards">
          ${
            devGroups.size === 0
              ? `<div class="empty-dev-placeholder">
                   <strong style="color: var(--ink); font-weight: 500;">No development cards</strong>
                   <span>Cost: 1 wool, 1 grain, 1 ore</span>
                 </div>`
              : Array.from(devGroups.entries())
                  .map(([devType, info]) => {
                    const meta = DEV_CARD_META[devType];
                    let canPlayThis = false;
                    let playBtnId = "";
                    if (devType === "knight" && canPlayKnight) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-knight";
                    } else if (
                      devType === "road_building" &&
                      canPlayRoadBuild
                    ) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-roadbuild";
                    } else if (devType === "year_of_plenty" && canPlayYoP) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-yop";
                    } else if (devType === "monopoly" && canPlayMonopoly) {
                      canPlayThis = true;
                      playBtnId = "btn-hand-play-mono";
                    }

                    return `
                      <div class="playing-card dev-playing-card ${
                        canPlayThis ? "playable-dev-card" : ""
                      }"
                           style="--card-border: ${meta.border}; --card-accent: ${meta.accent};">
                        <div class="playing-card-top">
                          <span class="ga-chip" style="height: 22px; padding: 0 8px;">${
                            meta.category
                          }</span>
                          <span class="playing-card-count active">×${info.total}</span>
                        </div>
                        <div class="playing-card-art">
                          ${renderDevCardIllustrationSvg(devType)}
                        </div>
                        <div class="dev-card-title">${meta.title}</div>
                        <div class="dev-card-rule">${meta.rule}</div>
                        <div class="dev-card-action">
                          ${
                            devType === "victory_point"
                              ? `<span class="ga-chip ga-chip--warn" style="width: 100%; justify-content: center;">+1 VP active</span>`
                              : canPlayThis
                                ? `<button id="${playBtnId}" type="button" class="btn btn--primary btn--sm" style="width: 100%;">Play ${meta.title.toLowerCase()}</button>`
                                : info.boughtThisTurn === info.total
                                  ? `<span class="ga-chip" style="width: 100%; justify-content: center;">Bought this turn</span>`
                                  : `<span class="ga-chip" style="width: 100%; justify-content: center;">Play on your turn</span>`
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join("")
          }
        </div>
      </div>
    </div>
  `;
}
