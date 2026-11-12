import {
  AZUL_WALL_PATTERN,
  type AzulDraftSource,
  type AzulState,
  type AzulTileColor,
  FLOOR_PENALTIES,
  canPlaceColorOnPatternLine,
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

export function renderAzulTile(
  color: AzulTileColor,
  size = 30,
  selected = false,
  faded = false,
  dataAttrs = ""
): string {
  const st = AZUL_TILE_STYLES[color];
  return `
    <div ${dataAttrs} class="${dataAttrs ? "clickable-target" : ""}" style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 6px;
      background: ${st.bg};
      border: ${selected ? "2px solid #ffffff" : `1.5px solid ${st.border}`};
      box-shadow: ${
        selected
          ? "0 0 10px rgba(255, 74, 31, 0.65), inset 0 1px 3px rgba(255,255,255,0.5)"
          : "0 2px 5px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3)"
      };
      color: ${color === "yellow" ? "#422006" : "#ffffff"};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: ${Math.max(13, Math.round(size * 0.48))}px;
      font-weight: 500;
      opacity: ${faded ? "0.22" : "1"};
      user-select: none;
    " title="${st.label}">
      <span aria-hidden="true">${st.symbol}</span>
    </div>
  `;
}

export function renderAzulBoardView(
  state: AzulState,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null
): string {
  const activePlayer = state.players[state.activePlayerIndex]!;

  const factoriesHtml = state.factories
    .map((tiles, fIdx) => {
      const isSelectedFactory =
        selectedDraft?.source.kind === "factory" &&
        selectedDraft.source.factoryIndex === fIdx;

      return `
        <div class="az-factory ${isSelectedFactory ? "is-selected" : ""}">
          <span class="ga-num" style="position: absolute; top: -10px; font-size: 13px; background: var(--bg); padding: 1px 7px; border-radius: 99px; border: 1px solid var(--line-strong); color: var(--muted);">
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
                      `data-azul-factory="${fIdx}" data-azul-color="${c}"`
                    );
                  })
                  .join("")
          }
        </div>
      `;
    })
    .join("");

  const isCenterSelected = selectedDraft?.source.kind === "center";
  const centerPoolHtml = `
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
              font-size: 13px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
            " title="First player marker (-1 floor penalty)">1st</div>`
          : ""
      }
      ${state.centerPool
        .map((c) =>
          renderAzulTile(
            c,
            31,
            isCenterSelected && selectedDraft?.color === c,
            false,
            `data-azul-center="true" data-azul-color="${c}"`
          )
        )
        .join("")}
    </div>
  `;

  const patternRowsHtml = ([0, 1, 2, 3, 4] as const)
    .map((row) => {
      const line = activePlayer.patternLines[row];
      const canPlaceHere =
        selectedDraft &&
        state.phase === "FACTORY_OFFER" &&
        canPlaceColorOnPatternLine(activePlayer, row, selectedDraft.color);

      const slots: string[] = [];
      for (let s = line.capacity - 1; s >= 0; s--) {
        const isFilled = s < line.count && line.color !== null;
        if (isFilled) {
          slots.push(renderAzulTile(line.color!, 28));
        } else {
          slots.push(`
            <div style="
              width: 28px;
              height: 28px;
              border-radius: 5px;
              background: var(--bg);
              border: 1.5px solid ${canPlaceHere ? "var(--action)" : "var(--line-strong)"};
            "></div>
          `);
        }
      }

      const wallCells = ([0, 1, 2, 3, 4] as const)
        .map((col) => {
          const templateColor = AZUL_WALL_PATTERN[row]![col]!;
          const placed = activePlayer.wall[row]![col];
          return renderAzulTile(templateColor, 28, placed !== null, placed === null);
        })
        .join("");

      return `
        <div style="display: flex; align-items: center; gap: 10px;">
          <div ${
            canPlaceHere ? `data-azul-target-line="${row}"` : ""
          } class="${
            canPlaceHere ? "clickable-target pulse-highlight" : ""
          }" style="
            width: 176px;
            display: flex;
            justify-content: flex-end;
            gap: 4px;
            padding: 3px 6px;
            border-radius: 6px;
            border: 1.5px solid ${canPlaceHere ? "var(--action)" : "transparent"};
            background: ${canPlaceHere ? "rgba(255, 74, 31, 0.12)" : "transparent"};
          ">
            ${slots.join("")}
          </div>

          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" style="color: var(--muted); flex: none;">
            <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>

          <div style="display: flex; gap: 4px; background: var(--bg); padding: 4px 6px; border-radius: 6px; border: 1px solid var(--line);">
            ${wallCells}
          </div>
        </div>
      `;
    })
    .join("");

  const canPlaceFloor = Boolean(selectedDraft && state.phase === "FACTORY_OFFER");
  const floorSlotsHtml = FLOOR_PENALTIES.map((pen, idx) => {
    const tok = activePlayer.floorLine[idx];
    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
        <span class="ga-num" style="font-size: 13px; color: #fca5a5;">${pen}</span>
        ${
          tok === "first_player"
            ? `<div class="ga-num" style="width: 28px; height: 28px; border-radius: 5px; background: #fef3c7; border: 1.5px solid #d97706; color: #78350f; font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center;">1st</div>`
            : tok
              ? renderAzulTile(tok, 28)
              : `<div style="width: 28px; height: 28px; border-radius: 5px; background: var(--bg); border: 1px dashed var(--line-strong);"></div>`
        }
      </div>
    `;
  }).join("");

  return `
    <div class="az-board">
      <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: center;">
        ${factoriesHtml}
      </div>
      ${centerPoolHtml}

      <div class="az-palace-card" style="border-color: ${activePlayer.color};">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="player-dot" style="background: ${activePlayer.color}"></span>
            <strong style="font-weight: 500;">${activePlayer.name} mosaic wall</strong>
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${activePlayer.score} pts</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 5px;">
          ${patternRowsHtml}
        </div>

        <div ${
          canPlaceFloor ? `data-azul-target-line="floor"` : ""
        } class="${
          canPlaceFloor ? "clickable-target pulse-highlight" : ""
        }" style="
          margin-top: 4px;
          padding: 8px 10px;
          border-radius: 8px;
          background: var(--bg);
          border: 1.5px solid ${canPlaceFloor ? "var(--action)" : "var(--line)"};
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        ">
          <span class="t-label" style="color: #fca5a5;">
            Floor line ${canPlaceFloor ? "(select to place here)" : ""}
          </span>
          <div style="display: flex; gap: 6px;">
            ${floorSlotsHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

const AZUL_DIFF_BADGE: Record<string, string> = {
  easy: "Easy",
  normal: "Normal",
  smart: "Smart",
  master: "Master",
};

export function renderAzulPlayerCard(
  _state: AzulState,
  p: AzulState["players"][number],
  isActing: boolean
): string {
  const seatBadge = p.isBot
    ? `Bot · ${AZUL_DIFF_BADGE[p.botDifficulty ?? "smart"] ?? "Smart"}`
    : "Human";
  const miniWall = ([0, 1, 2, 3, 4] as const)
    .map((r) =>
      ([0, 1, 2, 3, 4] as const)
        .map((c) => {
          const template = AZUL_WALL_PATTERN[r]![c]!;
          const filled = p.wall[r]![c] !== null;
          return renderAzulTile(template, 16, filled, !filled);
        })
        .join("")
    )
    .map((rowHtml) => `<div style="display: flex; gap: 2px;">${rowHtml}</div>`)
    .join("");

  return `
    <div class="player-card ${isActing ? "active-turn" : ""}">
      <div class="player-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${p.color}"></span>
          <strong style="font-weight: 500;">${p.name}</strong>
          <span class="ga-chip">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.score} pts</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <div class="ga-stat-list">
          <div>Rows completed: <strong class="ga-num">${p.completedRows}/5</strong></div>
          <div>Floor tiles: <strong class="ga-num">${p.floorLine.length}/7</strong></div>
          <div class="ga-num">
            Lines: ${p.patternLines
              .map((l) => `${l.count}/${l.capacity}`)
              .join(" · ")}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; padding: 4px; background: var(--surface); border-radius: 6px; border: 1px solid var(--line);">
          ${miniWall}
        </div>
      </div>
    </div>
  `;
}

export function renderAzulActionDock(
  state: AzulState,
  actingPlayer: AzulState["players"][number] | null,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `<div class="action-prompt">
      <strong>Match complete.</strong> ${winner?.name ?? "Player"} wins Azul with ${
        winner?.score ?? 0
      } points.
    </div>`;
  }

  if (!selectedDraft) {
    return `<div class="action-buttons">
      <span class="action-prompt"><strong>${actingPlayer.name} to act (step 1 of 2):</strong> Select a tile color from any factory display (F1–F${state.factories.length}) or the center pool.</span>
    </div>`;
  }

  const srcName =
    selectedDraft.source.kind === "factory"
      ? `Factory ${selectedDraft.source.factoryIndex + 1}`
      : "Center pool";

  return `<div class="action-buttons">
    ${renderAzulTile(selectedDraft.color, 24, true)}
    <span class="action-prompt"><strong>Step 2 of 2:</strong> Drafted from ${srcName}. Click a highlighted pattern row (1–5) or the floor line.</span>
    <button type="button" id="btn-azul-cancel-draft" class="btn btn--secondary btn--sm">Cancel selection</button>
  </div>`;
}
