import {
  type CommodityType,
  type DevCardType,
  type EventDieFace,
  type ImprovementDiscipline,
  type ResourceType,
  type TradeGoodType,
  isCommodityType,
} from "@gaming-platform/catan";

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

export function renderEventDieSvg(
  eventFace: EventDieFace,
  size = 28
): string {
  const glyph = (() => {
    switch (eventFace) {
      case "barbarian":
        return `
          <path d="M6,17.5 L22,17.5 L19,21.5 L9,21.5 Z" fill="#18191b" />
          <line x1="14" y1="17.5" x2="14" y2="6" stroke="#18191b" stroke-width="1.8" />
          <path d="M14.5,6.8 Q21,10.5 21,16 L14.5,16 Z" fill="#18191b" />
          <path d="M13.5,8.5 Q8,11.5 8,16 L13.5,16 Z" fill="#3f3f46" />
        `;
      case "trade":
        return `
          <circle cx="14" cy="14" r="7.2" fill="#f59e0b" stroke="#78350f" stroke-width="1.4" />
          <circle cx="14" cy="14" r="4.1" fill="#fef08a" />
          <text x="14" y="16.8" text-anchor="middle" font-family="Sora, sans-serif" font-size="8.2" font-weight="700" fill="#78350f">T</text>
        `;
      case "politics":
        return `
          <path d="M7.5,20.5 V9.5 H10.2 V11.8 H12.8 V9.5 H15.2 V11.8 H17.8 V9.5 H20.5 V20.5 Z" fill="#2563eb" stroke="#1e3a8a" stroke-width="1.2" stroke-linejoin="round" />
          <rect x="12.2" y="15.2" width="3.6" height="5.3" rx="1.4" fill="#dbeafe" />
        `;
      case "science":
        return `
          <circle cx="14" cy="14" r="7.2" fill="#10b981" stroke="#064e3b" stroke-width="1.3" />
          <path d="M14,8.5 L18,18.5 M14,8.5 L10,18.5 M11.2,15.5 H16.8" fill="none" stroke="#ecfdf5" stroke-width="1.7" stroke-linecap="round" />
        `;
    }
  })();

  const borderStroke =
    eventFace === "barbarian"
      ? "#18191b"
      : eventFace === "trade"
        ? "#d97706"
        : eventFace === "politics"
          ? "#2563eb"
          : "#059669";

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true" class="catan-die-svg catan-event-die-svg">
      <rect x="1" y="2.4" width="26" height="25" rx="6" fill="#27272a" opacity="0.62" />
      <rect x="1" y="1" width="26" height="25" rx="6" fill="#fffbeb" stroke="${borderStroke}" stroke-width="1.7" />
      <rect x="2.6" y="2.4" width="22.8" height="22.2" rx="4.6" fill="none" stroke="#ffffff" stroke-width="1.1" opacity="0.9" />
      ${glyph}
    </svg>
  `;
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

export function renderMiniTradeGoodCardSvg(
  good: TradeGoodType,
  width = 56,
  height = 36
): string {
  const baseSvg = isCommodityType(good)
    ? renderCommodityCardIllustrationSvg(good)
    : renderResourceCardIllustrationSvg(good);
  return baseSvg
    .replace('width="76"', `width="${width}"`)
    .replace('height="48"', `height="${height}"`);
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
 * Renders a framed scenic SVG vignette for a Cities & Knights Commodity Card.
 */
export function renderCommodityCardIllustrationSvg(
  commodity: CommodityType
): string {
  switch (commodity) {
    case "paper":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#052e16" />
          <path d="M0,38 Q26,26 54,34 T80,32 L80,52 L0,52 Z" fill="#14532d" />
          <polygon points="8,38 18,16 28,38" fill="#15803d" opacity="0.65" />
          <polygon points="54,38 64,17 74,38" fill="#16a34a" opacity="0.65" />
          <rect x="22" y="9" width="36" height="34" rx="3" fill="#fef3c7" stroke="#86efac" stroke-width="1.4" />
          <line x1="29" y1="18" x2="51" y2="18" stroke="#14532d" stroke-width="2" stroke-linecap="round" />
          <line x1="29" y1="25" x2="51" y2="25" stroke="#14532d" stroke-width="2" stroke-linecap="round" />
          <line x1="29" y1="32" x2="43" y2="32" stroke="#14532d" stroke-width="2" stroke-linecap="round" />
          <circle cx="53" cy="36" r="5" fill="#16a34a" stroke="#dcfce7" stroke-width="1.1" />
        </svg>
      `;
    case "cloth":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#1a2e05" />
          <path d="M0,32 Q28,18 56,28 T80,26 L80,52 L0,52 Z" fill="#4d7c0f" />
          <path d="M0,41 Q36,32 80,40 L80,52 L0,52 Z" fill="#365314" />
          <path d="M16,15 C28,9 38,21 50,15 C56,12 62,14 64,16 V37 C54,41 44,30 32,36 C24,40 18,38 16,36 Z"
                fill="#fef3c7" stroke="#bef264" stroke-width="1.5" />
          <path d="M22,22 C32,18 42,27 56,21" fill="none" stroke="#65a30d" stroke-width="1.7" stroke-dasharray="3,2.5" />
          <path d="M22,30 C32,26 42,35 56,29" fill="none" stroke="#365314" stroke-width="1.7" />
        </svg>
      `;
    case "coin":
      return `
        <svg viewBox="0 0 80 52" width="76" height="48" aria-hidden="true">
          <rect width="80" height="52" rx="6" fill="#0f172a" />
          <polygon points="6,46 24,14 42,46" fill="#334155" opacity="0.85" />
          <polygon points="38,46 58,12 76,46" fill="#475569" opacity="0.85" />
          <circle cx="31" cy="29" r="11.5" fill="#cbd5e1" stroke="#f8fafc" stroke-width="1.3" />
          <circle cx="47" cy="23.5" r="12.5" fill="#facc15" stroke="#ffffff" stroke-width="1.5" />
          <circle cx="47" cy="23.5" r="8.2" fill="none" stroke="#92400e" stroke-width="1.3" />
          <polygon points="47,18 49,22 53,22.5 50,25.5 50.8,29.5 47,27.5 43.2,29.5 44,25.5 41,22.5 45,22" fill="#92400e" />
        </svg>
      `;
  }
}

/**
 * Renders a discipline-themed SVG vignette for a Cities & Knights Progress Card.
 */
export function renderProgressCardIllustrationSvg(
  discipline: ImprovementDiscipline
): string {
  switch (discipline) {
    case "trade":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#2b1908" />
          <line x1="60" y1="7" x2="60" y2="36" stroke="#fbbf24" stroke-width="2.2" />
          <line x1="36" y1="14" x2="84" y2="14" stroke="#fde68a" stroke-width="2" stroke-linecap="round" />
          <circle cx="36" cy="26" r="6.5" fill="#f59e0b" stroke="#fef08a" stroke-width="1.2" />
          <circle cx="84" cy="26" r="6.5" fill="#facc15" stroke="#fef08a" stroke-width="1.2" />
          <rect x="49" y="34" width="22" height="3.5" rx="1.5" fill="#f59e0b" />
        </svg>
      `;
    case "politics":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#122142" />
          <line x1="36" y1="35" x2="84" y2="9" stroke="#93c5fd" stroke-width="2.2" stroke-linecap="round" />
          <line x1="84" y1="35" x2="36" y2="9" stroke="#93c5fd" stroke-width="2.2" stroke-linecap="round" />
          <path d="M48,8 H72 V21 C72,30 60,36.5 60,36.5 C60,36.5 48,30 48,21 Z" fill="#2563eb" stroke="#bfdbfe" stroke-width="1.6" />
          <polygon points="60,13 62.5,19 69,19.5 64,23.5 65.5,30 60,26.5 54.5,30 56,23.5 51,19.5 57.5,19" fill="#fde047" />
        </svg>
      `;
    case "science":
      return `
        <svg viewBox="0 0 120 44" width="116" height="42" aria-hidden="true">
          <rect width="120" height="44" rx="6" fill="#092b22" />
          <circle cx="60" cy="22" r="13" fill="none" stroke="#34d399" stroke-width="1.8" stroke-dasharray="4,2.5" />
          <path d="M60,9 L70,34 M60,9 L50,34 M53,26 H67" fill="none" stroke="#ecfdf5" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="60" cy="9" r="3" fill="#fde047" />
        </svg>
      `;
  }
}
