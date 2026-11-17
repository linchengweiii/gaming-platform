import {
  AZUL_COLORS,
  type AzulDraftSource,
  type AzulPlayerState,
  type AzulState,
  type AzulTileColor,
  FLOOR_PENALTIES,
  getWallColumnForColor,
  scoreWallPlacement,
} from "@gaming-platform/azul";

export const AZUL_TILE_STYLES: Record<
  AzulTileColor,
  { bg: string; border: string; symbol: string; label: string }
> = {
  blue: {
    bg: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
    border: "#93c5fd",
    symbol: "❖",
    label: "Cobalt blue",
  },
  yellow: {
    bg: "linear-gradient(135deg, #fde047 0%, #ca8a04 100%)",
    border: "#fef9c3",
    symbol: "☀",
    label: "Amber gold",
  },
  red: {
    bg: "linear-gradient(135deg, #f87171 0%, #b91c1c 100%)",
    border: "#fecaca",
    symbol: "✿",
    label: "Terracotta red",
  },
  black: {
    bg: "linear-gradient(135deg, #334155 0%, #0f172a 100%)",
    border: "#94a3b8",
    symbol: "✦",
    label: "Obsidian",
  },
  teal: {
    bg: "linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)",
    border: "#99f6e4",
    symbol: "❈",
    label: "Azulejo teal",
  },
};

export function escapeAzulHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function computeMarginalFloorPenaltyUi(
  currentFloorLen: number,
  addedItems: number
): number {
  let pen = 0;
  for (let i = 0; i < addedItems; i++) {
    const slot = currentFloorLen + i;
    if (slot < FLOOR_PENALTIES.length) {
      pen += Math.abs(FLOOR_PENALTIES[slot]!);
    }
  }
  return pen;
}

export function computeProjectedLineWallGainUi(
  player: AzulPlayerState,
  targetRow: number,
  color: AzulTileColor
): number {
  const baseWall = player.wall.map((r) => [...r]);
  let baseRoundPts = 0;
  for (let r = 0; r < 5; r++) {
    const line = player.patternLines[r]!;
    if (r !== targetRow && line.color && line.count === line.capacity) {
      const col = getWallColumnForColor(r, line.color);
      baseWall[r]![col] = line.color;
      baseRoundPts += scoreWallPlacement(baseWall, r, col);
    }
  }

  const afterWall = player.wall.map((r) => [...r]);
  let afterRoundPts = 0;
  for (let r = 0; r < 5; r++) {
    const line = player.patternLines[r]!;
    if (r === targetRow) {
      const col = getWallColumnForColor(r, color);
      afterWall[r]![col] = color;
      afterRoundPts += scoreWallPlacement(afterWall, r, col);
    } else if (line.color && line.count === line.capacity) {
      const col = getWallColumnForColor(r, line.color);
      afterWall[r]![col] = line.color;
      afterRoundPts += scoreWallPlacement(afterWall, r, col);
    }
  }

  return afterRoundPts - baseRoundPts;
}

export function renderAzulTile(
  color: AzulTileColor,
  size = 30,
  selected = false,
  faded = false,
  dataAttrs = "",
  targetPreview = false
): string {
  const st = AZUL_TILE_STYLES[color];
  const a11yAttrs = dataAttrs ? `role="button" tabindex="0"` : "";
  return `
    <div ${dataAttrs} ${a11yAttrs} class="${dataAttrs ? "clickable-target" : ""}" style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 6px;
      background: ${st.bg};
      border: ${
        targetPreview
          ? "2px dashed #ff4a1f"
          : selected
            ? "2px solid #ffffff"
            : `1.5px solid ${st.border}`
      };
      box-shadow: ${
        selected || targetPreview
          ? "0 0 10px rgba(255, 74, 31, 0.65), inset 0 1px 3px rgba(255,255,255,0.5)"
          : "0 2px 5px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)"
      };
      color: ${color === "yellow" ? "#422006" : "#ffffff"};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.max(13, Math.round(size * 0.48))}px;
      font-weight: 500;
      opacity: ${targetPreview ? "0.82" : faded ? "0.22" : "1"};
      user-select: none;
    " title="${st.label}">
      <span aria-hidden="true">${st.symbol}</span>
    </div>
  `;
}

export function renderAzulFactoriesHtml(
  state: AzulState,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null,
  isViewerTurn: boolean
): string {
  return state.factories
    .map((tiles, fIdx) => {
      const isSelectedFactory =
        selectedDraft?.source.kind === "factory" &&
        selectedDraft.source.factoryIndex === fIdx;

      return `
        <div class="az-factory ${isSelectedFactory ? "is-selected" : ""}">
          <span class="ga-num" style="position: absolute; top: -10px; font-size: 12px; background: var(--bg); padding: 1px 7px; border-radius: 99px; border: 1px solid var(--line-strong); color: var(--muted);">
            F${fIdx + 1}
          </span>
          ${
            tiles.length === 0
              ? `<span class="muted" style="grid-column: span 2; grid-row: span 2; text-align: center; font-size: var(--t-label);">Empty</span>`
              : tiles
                  .map((c) => {
                    const isPicked =
                      isSelectedFactory && selectedDraft?.color === c;
                    return renderAzulTile(
                      c,
                      31,
                      isPicked,
                      false,
                      isViewerTurn
                        ? `data-azul-factory="${fIdx}" data-azul-color="${c}"`
                        : ""
                    );
                  })
                  .join("")
          }
        </div>
      `;
    })
    .join("");
}

export function renderAzulCenterPoolHtml(
  state: AzulState,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null,
  isViewerTurn: boolean
): string {
  const isCenterSelected = selectedDraft?.source.kind === "center";
  const centerGroupsHtml = AZUL_COLORS.map((color) => {
    const cnt = state.centerPool.filter((c) => c === color).length;
    if (cnt === 0) return "";
    const isPicked = isCenterSelected && selectedDraft?.color === color;
    const st = AZUL_TILE_STYLES[color];
    return `
      <div ${
        isViewerTurn ? `data-azul-center="true" data-azul-color="${color}"` : ""
      } class="${
        isViewerTurn ? "clickable-target" : ""
      }" style="
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 3px 6px;
        border-radius: 7px;
        border: 1.5px solid ${isPicked ? "var(--action)" : "var(--line-strong)"};
        background: ${isPicked ? "rgba(255,74,31,0.14)" : "rgba(24,25,27,0.55)"};
      " title="Draft all ${cnt} ${st.label} tile(s) from Center pool">
        ${Array.from({ length: Math.min(cnt, 3) }, () =>
          renderAzulTile(color, 26, isPicked)
        ).join("")}
        <span class="ga-num" style="font-size:12px;font-weight:500;padding-left:2px;">×${cnt}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="az-center-pool ${isCenterSelected ? "is-selected" : ""}">
      <span class="t-label muted" style="width: 100%; text-align: center;">
        Center pool (${state.centerPool.length} tiles)
      </span>
      ${
        state.centerHasFirstPlayerMarker
          ? `<div class="ga-num" style="
              width: 31px;
              height: 31px;
              border-radius: 6px;
              background: #fef3c7;
              border: 1.5px solid #d97706;
              color: #78350f;
              font-weight: 500;
              font-size: 12px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
            " title="First player marker (-1 floor slot, acts first next round)">1st</div>`
          : ""
      }
      ${
        state.centerPool.length === 0 && !state.centerHasFirstPlayerMarker
          ? `<span class="t-label muted">Empty</span>`
          : centerGroupsHtml
      }
    </div>
  `;
}
