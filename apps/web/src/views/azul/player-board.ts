import {
  AZUL_COLORS,
  AZUL_WALL_PATTERN,
  type AzulDraftSource,
  type AzulPlayerState,
  type AzulState,
  type AzulTileColor,
  FLOOR_PENALTIES,
  canPlaceColorOnPatternLine,
  getWallColumnForColor,
} from "@gaming-platform/azul";
import {
  AZUL_TILE_STYLES,
  computeMarginalFloorPenaltyUi,
  computeProjectedLineWallGainUi,
  escapeAzulHtml as escapeHtml,
  renderAzulTile,
} from "./tiles-and-factories.ts";

export function renderAzulPalaceCardHtml(
  state: AzulState,
  focusPlayer: AzulPlayerState,
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null,
  canViewerActNow: boolean,
  draftedCount: number,
  takesFirstMarker: boolean
): string {
  const patternRowsHtml = ([0, 1, 2, 3, 4] as const)
    .map((row) => {
      const line = focusPlayer.patternLines[row]!;
      const canPlaceHere = Boolean(
        canViewerActNow &&
          selectedDraft &&
          canPlaceColorOnPatternLine(focusPlayer, row, selectedDraft.color)
      );

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

      const targetCol =
        canPlaceHere && selectedDraft
          ? getWallColumnForColor(row, selectedDraft.color)
          : -1;

      let previewBadgeHtml = "";
      if (canPlaceHere && selectedDraft && draftedCount > 0) {
        const space = line.capacity - line.count;
        const placed = Math.min(space, draftedCount);
        const overflow = draftedCount - placed + (takesFirstMarker ? 1 : 0);
        const completes = line.count + placed === line.capacity;
        const wallGain = completes
          ? computeProjectedLineWallGainUi(focusPlayer, row, selectedDraft.color)
          : 0;
        const floorPen =
          overflow > 0
            ? computeMarginalFloorPenaltyUi(
                focusPlayer.floorLine.length,
                overflow
              )
            : 0;

        const gainChip = completes
          ? `<span class="ga-chip ga-chip--ok ga-num" style="height:19px;padding:0 5px;font-size:11px;">+${wallGain} pts</span>`
          : `<span class="ga-chip ga-num" style="height:19px;padding:0 5px;font-size:11px;">${line.count + placed}/${line.capacity}</span>`;
        const penChip =
          floorPen > 0
            ? `<span class="ga-chip ga-chip--danger ga-num" style="height:19px;padding:0 5px;font-size:11px;">-${floorPen} flr</span>`
            : "";
        previewBadgeHtml = `<div style="display:inline-flex;gap:3px;min-width:92px;justify-content:flex-end;">${gainChip}${penChip}</div>`;
      } else {
        previewBadgeHtml = `<div style="min-width:92px;text-align:right;"><span class="t-label muted ga-num">${line.count}/${line.capacity}</span></div>`;
      }

      const rowWallFilled = focusPlayer.wall[row]!.filter(
        (c) => c !== null
      ).length;
      const wallCells = ([0, 1, 2, 3, 4] as const)
        .map((col) => {
          const templateColor = AZUL_WALL_PATTERN[row]![col]!;
          const placed = focusPlayer.wall[row]![col];
          const isPreviewTarget = placed === null && col === targetCol;
          return renderAzulTile(
            templateColor,
            28,
            placed !== null,
            placed === null,
            "",
            isPreviewTarget
          );
        })
        .join("");

      return `
        <div style="display: flex; align-items: center; gap: 8px;">
          ${previewBadgeHtml}
          <div ${
            canPlaceHere ? `data-azul-target-line="${row}"` : ""
          } class="${
            canPlaceHere ? "clickable-target pulse-highlight" : ""
          }" style="
            width: 172px;
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

          <span class="ga-num ${
            rowWallFilled === 5 ? "ga-chip ga-chip--ok" : "t-label muted"
          }" style="min-width:44px;text-align:center;font-size:11px;" title="Complete horizontal row: +2 endgame bonus (triggers final round)">
            ${rowWallFilled === 5 ? "+2 ✓" : `${rowWallFilled}/5`}
          </span>
        </div>
      `;
    })
    .join("");

  const colProgressHtml = ([0, 1, 2, 3, 4] as const)
    .map((col) => {
      const filled = ([0, 1, 2, 3, 4] as const).filter(
        (r) => focusPlayer.wall[r]![col] !== null
      ).length;
      return `<span class="ga-num" style="width:28px;text-align:center;font-size:10px;color:${
        filled === 5 ? "#4ade80" : "var(--muted)"
      };" title="Column ${col + 1}: ${filled}/5 tiles (+7 endgame bonus)">${
        filled === 5 ? "+7" : `${filled}/5`
      }</span>`;
    })
    .join("");

  const colorBonusChipsHtml = AZUL_COLORS.map((color) => {
    const cnt = ([0, 1, 2, 3, 4] as const).reduce<number>(
      (sum, r) =>
        sum +
        ([0, 1, 2, 3, 4] as const).filter(
          (c) => focusPlayer.wall[r]![c] === color
        ).length,
      0
    );
    const st = AZUL_TILE_STYLES[color];
    return `<span class="ga-chip ${
      cnt === 5 ? "ga-chip--ok" : ""
    } ga-num" style="height:20px;padding:0 6px;font-size:11px;" title="${st.label}: ${cnt}/5 on wall (+10 endgame bonus)">${st.symbol} ${cnt}/5${cnt === 5 ? " +10" : ""}</span>`;
  }).join("");

  const canPlaceFloor = Boolean(canViewerActNow && selectedDraft);
  const floorDirectPen =
    canPlaceFloor && draftedCount > 0
      ? computeMarginalFloorPenaltyUi(
          focusPlayer.floorLine.length,
          draftedCount + (takesFirstMarker ? 1 : 0)
        )
      : 0;

  const floorSlotsHtml = FLOOR_PENALTIES.map((pen, idx) => {
    const tok = focusPlayer.floorLine[idx];
    return `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
        <span class="ga-num" style="font-size: 12px; color: #fca5a5;">${pen}</span>
        ${
          tok === "first_player"
            ? `<div class="ga-num" style="width: 28px; height: 28px; border-radius: 5px; background: #fef3c7; border: 1.5px solid #d97706; color: #78350f; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center;">1st</div>`
            : tok
              ? renderAzulTile(tok, 28)
              : `<div style="width: 28px; height: 28px; border-radius: 5px; background: var(--bg); border: 1px dashed var(--line-strong);"></div>`
        }
      </div>
    `;
  }).join("");

  const boardTabsHtml =
    state.players.length > 1
      ? `<div style="display:inline-flex;gap:4px;flex-wrap:wrap;">
          ${state.players
            .map(
              (p) => `
              <button type="button" data-azul-inspect-player="${escapeHtml(p.id)}" class="btn ${
                p.id === focusPlayer.id ? "btn--primary" : "btn--secondary"
              } btn--sm" style="height:24px;padding:0 8px;font-size:11px;">
                ${escapeHtml(p.name)}
              </button>
            `
            )
            .join("")}
        </div>`
      : "";

  return `
      <div class="az-palace-card" style="border-color: ${focusPlayer.color};">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="player-dot" style="background: ${focusPlayer.color}"></span>
            <strong style="font-weight: 500;">${escapeHtml(focusPlayer.name)} mosaic wall</strong>
            <span class="ga-chip ga-chip--warn ga-num">${focusPlayer.score} pts</span>
          </div>
          ${boardTabsHtml}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="t-label muted">Bonuses: Row +2 · Col +7 · 5-of-a-color +10</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${colorBonusChipsHtml}</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 5px;">
          ${patternRowsHtml}
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="min-width:92px;"></div>
            <div style="width:172px;text-align:right;" class="t-label muted">Col +7:</div>
            <div style="width:14px;"></div>
            <div style="display:flex;gap:4px;padding:0 6px;">${colProgressHtml}</div>
            <div style="min-width:44px;"></div>
          </div>
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
            Floor line ${
              canPlaceFloor
                ? `(place all here: -${floorDirectPen} pts)`
                : ""
            }
          </span>
          <div style="display: flex; gap: 6px;">
            ${floorSlotsHtml}
          </div>
        </div>
      </div>`;
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
          return renderAzulTile(template, 15, filled, !filled);
        })
        .join("")
    )
    .map((rowHtml) => `<div style="display: flex; gap: 2px;">${rowHtml}</div>`)
    .join("");

  const curFloorPenalty = FLOOR_PENALTIES.slice(
    0,
    Math.min(p.floorLine.length, FLOOR_PENALTIES.length)
  ).reduce((sum, pen) => sum + Math.abs(pen), 0);
  const holdsFirst = p.floorLine.includes("first_player");

  const coloredLinesHtml = p.patternLines
    .map((l, idx) => {
      if (!l.color || l.count === 0) {
        return `<span class="ga-chip ga-num" style="height:20px;padding:0 6px;font-size:10.5px;opacity:0.65;" title="Row ${idx + 1}: empty (0/${l.capacity})">0/${l.capacity}</span>`;
      }
      const st = AZUL_TILE_STYLES[l.color];
      return `<span class="ga-num" title="Row ${idx + 1}: ${l.count}/${l.capacity} ${st.label}" style="
        display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 6px;border-radius:5px;
        background:${st.bg};border:1px solid ${st.border};color:${l.color === "yellow" ? "#422006" : "#fff"};font-size:10.5px;font-weight:500;
      ">${st.symbol}${l.count}/${l.capacity}</span>`;
    })
    .join("");

  return `
    <div class="player-card clickable-target ${isActing ? "active-turn" : ""}" data-azul-inspect-player="${escapeHtml(p.id)}" title="Click to inspect ${escapeHtml(p.name)}'s palace wall">
      <div class="player-header">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span class="player-dot" style="background: ${p.color}"></span>
          <strong style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</strong>
          <span class="ga-chip">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.score} pts</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <div class="ga-stat-list" style="gap:5px;">
          <div class="ga-num" style="font-size:11px;">
            Rows ${p.completedRows}/5 · Cols ${p.completedCols}/5 · Sets ${p.completedColorSets}/5
          </div>
          <div class="ga-num" style="font-size:11px;">
            Floor ${p.floorLine.length}/7${curFloorPenalty > 0 ? ` (-${curFloorPenalty})` : ""}${holdsFirst ? " · 1st" : ""}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${coloredLinesHtml}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 2px; padding: 5px; background: var(--surface); border-radius: 7px; border: 1px solid var(--line);">
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
    const rowsCount = winner?.completedRows ?? 0;
    return `<div class="action-prompt">
      <strong>Match complete.</strong> ${escapeHtml(winner?.name ?? "Player")} wins Azul with ${
        winner?.score ?? 0
      } points (${rowsCount} completed horizontal ${rowsCount === 1 ? "row" : "rows"}).
    </div>`;
  }

  if (!selectedDraft) {
    return `<div class="action-buttons">
      <span class="action-prompt"><strong>${escapeHtml(actingPlayer.name)} to act (step 1 of 2):</strong> Select a tile color from any factory display (F1–F${state.factories.length}) or the center pool.</span>
    </div>`;
  }

  const srcTiles =
    selectedDraft.source.kind === "factory"
      ? state.factories[selectedDraft.source.factoryIndex] ?? []
      : state.centerPool;
  const count = srcTiles.filter((c) => c === selectedDraft.color).length;
  const takesFirst =
    selectedDraft.source.kind === "center" && state.centerHasFirstPlayerMarker;
  const firstMarkerPenalty = takesFirst
    ? computeMarginalFloorPenaltyUi(actingPlayer.floorLine.length, 1)
    : 0;

  const srcName =
    selectedDraft.source.kind === "factory"
      ? `Factory ${selectedDraft.source.factoryIndex + 1}`
      : "Center pool";

  return `<div class="action-buttons">
    ${renderAzulTile(selectedDraft.color, 24, true)}
    <span class="action-prompt"><strong>Step 2 of 2:</strong> Drafting <strong>${count}× ${AZUL_TILE_STYLES[selectedDraft.color].label}</strong> from ${srcName}${
      takesFirst
        ? firstMarkerPenalty > 0
          ? ` (+ 1st marker, -${firstMarkerPenalty} floor)`
          : " (+ 1st marker)"
        : ""
    }. Click a highlighted pattern row (1–5) or the floor line.</span>
    <button type="button" id="btn-azul-cancel-draft" class="btn btn--secondary btn--sm">Cancel selection</button>
  </div>`;
}
