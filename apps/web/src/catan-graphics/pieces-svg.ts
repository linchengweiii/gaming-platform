import type { CatanState } from "@gaming-platform/catan";
import { DISCIPLINE_META } from "../config/catan-palette-config.ts";
import {
  type SupportedLocale,
  getCatanDisciplineTextLocalized,
} from "../i18n/index.ts";
import { shadeHexColor } from "./geometry.ts";

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
  | "knight_piece"
  | "promote_knight"
  | "activate_knight"
  | "move_knight"
  | "chase_robber"
  | "city_upgrade"
  | "metropolis"
  | "progress_card"
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
    case "knight_piece":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="${dark}" stroke="#fde68a" stroke-width="1.5"/>
        <path d="M8,8 H16 V13 C16,16.8 12,18.8 12,18.8 C12,18.8 8,16.8 8,13 Z" fill="${playerColor}" stroke="#ffffff" stroke-width="1.2"/>
        <polygon points="12,4.5 14,7.5 10,7.5" fill="#fde047"/>
      </svg>`;
    case "promote_knight":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5,7 H17.5 V13 C17.5,17.5 12,20.5 12,20.5 C12,20.5 6.5,17.5 6.5,13 Z" fill="${playerColor}" stroke="#fde68a" stroke-width="1.4"/>
        <path d="M8.5,11.5 L12,8 L15.5,11.5 M8.5,15 L12,11.5 L15.5,15" fill="none" stroke="#fde047" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "activate_knight":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" fill="rgba(250, 204, 21, 0.2)" stroke="#fde047" stroke-width="1.8"/>
        <path d="M8,8 H16 V13 C16,16.8 12,18.8 12,18.8 C12,18.8 8,16.8 8,13 Z" fill="${playerColor}" stroke="#fde68a" stroke-width="1.3"/>
      </svg>`;
    case "move_knight":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5,7.5 H13.5 V12.5 C13.5,16.2 9,18.8 9,18.8 C9,18.8 4.5,16.2 4.5,12.5 Z" fill="${playerColor}" stroke="#fde68a" stroke-width="1.3"/>
        <path d="M14.5,12 H21.5 M18.5,8.8 L21.8,12 L18.5,15.2" fill="none" stroke="#fde047" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "chase_robber":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9.5" cy="8" r="3.4" fill="#27272a" stroke="#f8fafc" stroke-width="1.2"/>
        <path d="M5,19 C5.6,12.5 7.5,11.5 9.5,11.5 C11.5,11.5 13.4,12.5 14,19 Z" fill="#18191b" stroke="#e2e8f0" stroke-width="1.2"/>
        <path d="M14.5,10.5 H21.5 M18.5,7.5 L21.8,10.5 L18.5,13.5" fill="none" stroke="#f87171" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "city_upgrade":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" fill="#1e293b" stroke="#fbbf24" stroke-width="1.5"/>
        <line x1="3.5" y1="9" x2="20.5" y2="9" stroke="#fbbf24" stroke-width="1.2"/>
        <path d="M8.5,16 L12,11.5 L15.5,16" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    case "metropolis":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3,20 V10 L7,6 L12,2.5 L17,6 L21,10 V20 H15.5 V14 A3.5,3.5 0 0,0 8.5,14 V20 Z" fill="#f59e0b" stroke="#fef08a" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`;
    case "progress_card":
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="2.5" width="16" height="19" rx="3" fill="#092b22" stroke="#34d399" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fde047" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="1.6" fill="#fde047"/>
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

export function renderEdgeRoutePiecePart(
  state: CatanState,
  eId: string,
  isClickable: boolean
): string | null {
  const route = state.edges[eId];
  if (!route) return null;
  const eNode = state.topology.edges[eId]!;
  const owner = state.players.find((p) => p.id === route.ownerId);
  const baseColor = owner?.color ?? "#ffffff";
  const lightTint = shadeHexColor(baseColor, 0.34);
  const darkShade = shadeHexColor(baseColor, -0.34);

  if (route.type === "road") {
    const edgeLen = Math.hypot(eNode.x2 - eNode.x1, eNode.y2 - eNode.y1);
    const plankLen = Math.max(25, Number((edgeLen * 0.78).toFixed(2)));
    return `
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
        `;
  }

  return `
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
        `;
}

export function renderVertexBuildingAndKnightParts(
  state: CatanState,
  vId: string,
  isClickable: boolean,
  locale: SupportedLocale = "en"
): readonly string[] {
  const vNode = state.topology.vertices[vId]!;
  const building = state.buildings[vId];
  const parts: string[] = [];

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

      if (state.config.enableCitiesAndKnights && building.metropolis) {
        const dMeta = DISCIPLINE_META[building.metropolis];
        const dText = getCatanDisciplineTextLocalized(
          building.metropolis,
          locale
        );
        parts.push(`
            <g transform="translate(${vx}, ${vy})">
              <path d="M-16,10.5 V-9.5 L-9,-18 L0,-23 L9,-18 L16,-9.5 V10.5 H12.2 V-6.5 L0,-15.5 L-12.2,-6.5 V10.5 Z"
                    fill="#f59e0b" stroke="#fef08a" stroke-width="1.35" stroke-linejoin="round" />
              <circle cx="0" cy="-21.5" r="7.2" fill="${dMeta.bg}" stroke="${dMeta.border}" stroke-width="1.7" />
              <text x="0" y="-18.7" text-anchor="middle" font-family="Sora, system-ui, sans-serif" font-size="8.4" font-weight="700" fill="#ffffff">${dText.shortCode}</text>
            </g>
          `);
      }
    }

    parts.push(`</g>`);
  }

  if (state.config.enableCitiesAndKnights && state.knights[vId]) {
    const knight = state.knights[vId]!;
    const kOwner = state.players.find((p) => p.id === knight.ownerId);
    const kColor = kOwner?.color ?? "#ffffff";
    const kDark = shadeHexColor(kColor, -0.3);
    const vx = vNode.x;
    const vy = vNode.y;
    const pipOffsets =
      knight.level === 1
        ? [0]
        : knight.level === 2
          ? [-3.5, 3.5]
          : [-5.5, 0, 5.5];

    parts.push(`
        <g class="${
          isClickable ? "clickable-target" : "spot-vertex-group"
        } catan-knight-piece" data-vertex-id="${vId}" data-spot-vertex="${vId}" filter="url(#piece-shadow)" transform="translate(${vx}, ${vy})">
          ${
            knight.active
              ? `<circle cx="0" cy="0" r="15.2" fill="rgba(250, 204, 21, 0.24)" stroke="#fde047" stroke-width="2.2" />`
              : `<circle cx="0" cy="0" r="13.5" fill="rgba(15, 23, 42, 0.55)" stroke="#64748b" stroke-width="1.4" stroke-dasharray="3,2" />`
          }
          <circle cx="0" cy="1.2" r="11.5" fill="${kDark}" stroke="#18191b" stroke-width="1.7" />
          <circle cx="0" cy="0" r="11.2" fill="${kColor}" stroke="${
            knight.active ? "#fef08a" : "#cbd5e1"
          }" stroke-width="1.6" />
          <path d="M-5.8,-5.5 H5.8 V0.5 C5.8,5.2 0,8 0,8 C0,8 -5.8,5.2 -5.8,0.5 Z"
                fill="${knight.active ? "#18191b" : "#334155"}" stroke="${
                  knight.active ? "#fde047" : "#94a3b8"
                }" stroke-width="1.2" />
          ${pipOffsets
            .map(
              (px) =>
                `<circle cx="${px}" cy="-1.2" r="1.55" fill="${
                  knight.active ? "#fde047" : "#cbd5e1"
                }" />`
            )
            .join("")}
          ${
            knight.active
              ? `<polygon points="0,-14.8 3.2,-9.8 -3.2,-9.8" fill="#fde047" stroke="#78350f" stroke-width="0.9" />`
              : ""
          }
        </g>
      `);
  }

  return parts;
}
