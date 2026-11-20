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
  type SupportedLocale,
  getAzulTileLabelLocalized,
  getBotDifficultyMetaLocalized,
  t,
} from "../../i18n/index.ts";
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
  takesFirstMarker: boolean,
  locale: SupportedLocale = "en"
): string {
  const ptsUnit = t(locale, "common.ptsUnit");
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
          slots.push(renderAzulTile(line.color!, 28, false, false, "", false, locale));
        } else {
          slots.push(`
            <div class="az-slot-empty" style="
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
          ? `<span class="ga-chip ga-chip--ok ga-num" style="height:19px;padding:0 5px;font-size:11px;">+${wallGain} ${ptsUnit}</span>`
          : `<span class="ga-chip ga-num" style="height:19px;padding:0 5px;font-size:11px;">${line.count + placed}/${line.capacity}</span>`;
        const penChip =
          floorPen > 0
            ? `<span class="ga-chip ga-chip--danger ga-num" style="height:19px;padding:0 5px;font-size:11px;">${t(locale, "az.floorPenChip", { pen: floorPen })}</span>`
            : "";
        previewBadgeHtml = `<div class="az-row-badge" style="display:inline-flex;gap:3px;min-width:92px;justify-content:flex-end;">${gainChip}${penChip}</div>`;
      } else {
        previewBadgeHtml = `<div class="az-row-badge" style="min-width:92px;text-align:right;"><span class="t-label muted ga-num">${line.count}/${line.capacity}</span></div>`;
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
            isPreviewTarget,
            locale
          );
        })
        .join("");

      return `
        <div class="az-pattern-row" style="display: flex; align-items: center; gap: 8px;">
          ${previewBadgeHtml}
          <div ${
            canPlaceHere ? `data-azul-target-line="${row}"` : ""
          } class="az-pattern-line ${
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

          <svg class="az-row-arrow" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true" style="color: var(--muted); flex: none;">
            <path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>

          <div class="az-wall-row" style="display: flex; gap: 4px; background: var(--bg); padding: 4px 6px; border-radius: 6px; border: 1px solid var(--line);">
            ${wallCells}
          </div>

          <span class="az-row-progress ga-num ${
            rowWallFilled === 5 ? "ga-chip ga-chip--ok" : "t-label muted"
          }" style="min-width:44px;text-align:center;font-size:11px;" title="${t(locale, "az.rowBonusTitle")}">
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
      return `<span class="az-col-cell ga-num" style="width:28px;text-align:center;font-size:10px;color:${
        filled === 5 ? "#4ade80" : "var(--muted)"
      };" title="${t(locale, "az.colBonusTitle", { col: col + 1, filled })}">${
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
    const label = getAzulTileLabelLocalized(color, locale);
    return `<span class="ga-chip ${
      cnt === 5 ? "ga-chip--ok" : ""
    } ga-num" style="height:20px;padding:0 6px;font-size:11px;" title="${t(locale, "az.colorBonusTitle", { label, count: cnt })}">${st.symbol} ${cnt}/5${cnt === 5 ? " +10" : ""}</span>`;
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
              ? renderAzulTile(tok, 28, false, false, "", false, locale)
              : `<div class="az-slot-empty" style="width: 28px; height: 28px; border-radius: 5px; background: var(--bg); border: 1px dashed var(--line-strong);"></div>`
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
            <strong style="font-weight: 500;">${t(locale, "az.mosaicWall", { name: escapeHtml(focusPlayer.name) })}</strong>
            <span class="ga-chip ga-chip--warn ga-num">${focusPlayer.score} ${ptsUnit}</span>
          </div>
          ${boardTabsHtml}
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <span class="t-label muted">${t(locale, "az.bonusesSummary")}</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">${colorBonusChipsHtml}</div>
        </div>

        <div class="az-wall-grid" style="display: flex; flex-direction: column; gap: 5px;">
          ${patternRowsHtml}
          <div class="az-col-footer" style="display:flex;align-items:center;gap:8px;">
            <div class="az-row-badge" style="min-width:92px;"></div>
            <div class="az-pattern-line az-col-footer__label t-label muted" style="width:172px;text-align:right;">${t(locale, "az.colPlus7")}</div>
            <div class="az-row-arrow" style="width:14px;"></div>
            <div class="az-wall-row az-col-footer__cells" style="display:flex;gap:4px;padding:0 6px;">${colProgressHtml}</div>
            <div class="az-row-progress" style="min-width:44px;"></div>
          </div>
        </div>

        <div ${
          canPlaceFloor ? `data-azul-target-line="floor"` : ""
        } class="az-floor-bar ${
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
            ${t(locale, "az.floorLine")} ${
              canPlaceFloor
                ? t(locale, "az.floorPlaceAll", { pen: floorDirectPen })
                : ""
            }
          </span>
          <div class="az-floor-slots" style="display: flex; gap: 6px;">
            ${floorSlotsHtml}
          </div>
        </div>
      </div>`;
}

export function renderAzulPlayerCard(
  _state: AzulState,
  p: AzulState["players"][number],
  isActing: boolean,
  locale: SupportedLocale = "en"
): string {
  const seatBadge = p.isBot
    ? `${t(locale, "common.bot")} · ${getBotDifficultyMetaLocalized(p.botDifficulty ?? "smart", locale).badge}`
    : t(locale, "common.human");
  const miniWall = ([0, 1, 2, 3, 4] as const)
    .map((r) =>
      ([0, 1, 2, 3, 4] as const)
        .map((c) => {
          const template = AZUL_WALL_PATTERN[r]![c]!;
          const filled = p.wall[r]![c] !== null;
          return renderAzulTile(template, 15, filled, !filled, "", false, locale);
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
        return `<span class="ga-chip ga-num" style="height:20px;padding:0 6px;font-size:10.5px;opacity:0.65;" title="${t(locale, "az.rowEmptyTitle", { row: idx + 1, cap: l.capacity })}">0/${l.capacity}</span>`;
      }
      const st = AZUL_TILE_STYLES[l.color];
      const label = getAzulTileLabelLocalized(l.color, locale);
      return `<span class="ga-num" title="${t(locale, "az.rowFilledTitle", { row: idx + 1, count: l.count, cap: l.capacity, label })}" style="
        display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 6px;border-radius:5px;
        background:${st.bg};border:1px solid ${st.border};color:${l.color === "yellow" ? "#422006" : "#fff"};font-size:10.5px;font-weight:500;
      ">${st.symbol}${l.count}/${l.capacity}</span>`;
    })
    .join("");

  return `
    <div class="player-card clickable-target ${isActing ? "active-turn" : ""}" data-azul-inspect-player="${escapeHtml(p.id)}" title="${t(locale, "az.inspectPalaceTitle", { name: escapeHtml(p.name) })}">
      <div class="player-header">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          <span class="player-dot" style="background: ${p.color}"></span>
          <strong style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.name)}</strong>
          <span class="ga-chip">${seatBadge}</span>
        </div>
        <span class="ga-chip ga-chip--warn ga-num">${p.score} ${t(locale, "common.ptsUnit")}</span>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <div class="ga-stat-list" style="gap:5px;">
          <div class="ga-num" style="font-size:11px;">
            ${t(locale, "az.playerCardStats", { rows: p.completedRows, cols: p.completedCols, sets: p.completedColorSets })}
          </div>
          <div class="ga-num" style="font-size:11px;">
            ${t(locale, "az.playerCardFloor", {
              len: p.floorLine.length,
              pen: curFloorPenalty > 0 ? ` (-${curFloorPenalty})` : "",
              first: holdsFirst ? t(locale, "az.firstShort") : "",
            })}
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
  selectedDraft: { source: AzulDraftSource; color: AzulTileColor } | null,
  locale: SupportedLocale = "en"
): string {
  if (state.phase === "GAME_OVER" || !actingPlayer) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    const rowsCount = winner?.completedRows ?? 0;
    return `<div class="action-prompt">
      ${t(locale, rowsCount === 1 ? "az.winsAzulOne" : "az.winsAzulMany", {
        complete: `<strong>${t(locale, "inGame.matchComplete")}.</strong>`,
        winner: escapeHtml(winner?.name ?? t(locale, "common.player")),
        score: winner?.score ?? 0,
        rows: rowsCount,
      })}
    </div>`;
  }

  if (!selectedDraft) {
    return `<div class="action-buttons">
      <span class="action-prompt">${t(locale, "az.step1Prompt", {
        prefix: `<strong>${t(locale, "az.step1Prefix", { name: escapeHtml(actingPlayer.name) })}</strong>`,
        factories: state.factories.length,
      })}</span>
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
      ? t(locale, "az.factoryN", { num: selectedDraft.source.factoryIndex + 1 })
      : t(locale, "az.centerPool");
  const colorLabel = getAzulTileLabelLocalized(selectedDraft.color, locale);

  return `<div class="action-buttons">
    ${renderAzulTile(selectedDraft.color, 24, true, false, "", false, locale)}
    <span class="action-prompt">${t(locale, "az.step2Prompt", {
      prefix: `<strong>${t(locale, "az.step2Prefix")}</strong>`,
      tiles: `<strong>${count}× ${colorLabel}</strong>`,
      source: srcName,
      marker: takesFirst
        ? firstMarkerPenalty > 0
          ? t(locale, "az.firstMarkerWithPen", { pen: firstMarkerPenalty })
          : t(locale, "az.firstMarkerNoPen")
        : "",
    })}</span>
    <button type="button" id="btn-azul-cancel-draft" class="btn btn--secondary btn--sm">${t(locale, "az.cancelSelection")}</button>
  </div>`;
}
