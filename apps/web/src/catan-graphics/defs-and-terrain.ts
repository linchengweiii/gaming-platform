import type { CatanState, TerrainType } from "@gaming-platform/catan";
import { getPolygonPoints } from "./geometry.ts";

export function renderOceanWavesIllustration(
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
export function renderTerrainIllustration(
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

export function renderBoardDefsAndChartHeaderPart(
  state: CatanState,
  vbX: number,
  vbY: number,
  vbW: number,
  vbH: number,
  cameraViewBoxStr?: string
): string {
  const topo = state.topology;
  const hexSize = topo.hexSize;
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

  const activeViewBox = cameraViewBoxStr ?? `${vbX} ${vbY} ${vbW} ${vbH}`;

  // IMPORTANT: filterUnits="userSpaceOnUse" prevents SVG objectBoundingBox clipping on vertical (x1===x2) or horizontal edges!
  return `
    <svg class="board-svg" viewBox="${activeViewBox}" xmlns="http://www.w3.org/2000/svg">
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
  `;
}
