import {
  SCENARIO_CATALOG,
  isExpanded56Scenario,
} from "@gaming-platform/catan";
import { BOT_DIFFICULTY_META } from "../../config/app-config.ts";
import { BRAND_MARK_SVG, escapeAttr } from "../helpers/html-and-dropdown.ts";
import { formatRoomHashLabelPure } from "../helpers/room-hash-and-links.ts";
import { getRoomStatePure } from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom } from "../types.ts";
import { renderTopbarUserSelectorPure } from "./login-and-topbar-view.ts";

export function renderRoomHeaderPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  activeTab: "setup" | "game"
): string {
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const hashLabel = formatRoomHashLabelPure(room.roomId);
  const isCopied = model.copiedRoomLinkId === room.roomId;
  const statusChip =
    room.status === "in_progress"
      ? `<span class="ga-chip ga-chip--warn">In progress</span>`
      : room.status === "finished"
        ? `<span class="ga-chip ga-chip--ok">Finished</span>`
        : `<span class="ga-chip">Pre-game</span>`;

  return `
      <header class="ga-nav ga-nav--room">
        <div class="ga-nav__inner">
          <div class="ga-nav__left">
            <button type="button" id="btn-back-lobby" class="ga-brand">
              ${BRAND_MARK_SVG}
              <div class="ga-brand__meta">
                <span class="ga-num">Room ${escapeAttr(hashLabel)}</span>
                <span class="ga-brand__sub">Host: ${escapeAttr(room.ownerName || "Host")} · Back to lobby</span>
              </div>
            </button>

            <div class="ga-tabs" role="navigation" aria-label="Room pages">
              <button type="button" id="tab-setup-page" class="ga-tab ${
                activeTab === "setup" ? "is-active" : ""
              }">Setup</button>
              <button type="button" id="tab-game-page" class="ga-tab ${
                activeTab === "game" ? "is-active" : ""
              }" ${!hasMatchState ? "disabled" : ""}>Game</button>
            </div>

            ${statusChip}
            ${
              room.isOfflineLocal
                ? `<span class="ga-chip ga-chip--ok">Offline local</span>`
                : `<button type="button" id="btn-copy-room-link" data-copy-room-link="${escapeAttr(
                    room.roomId
                  )}" class="btn btn--secondary btn--sm ga-num" title="Copy shareable invite link (${escapeAttr(
                    hashLabel
                  )})">${isCopied ? "Copied ✓" : "Share link"}</button>`
            }
          </div>

          <div class="ga-toolbar">
            ${renderTopbarUserSelectorPure(model)}
          </div>
        </div>
      </header>
    `;
}

export function getStartingPlayerSummaryLabelPure(
  room: ClientRoom,
  state: any
): string {
  if (state && typeof state.startingPlayerIndex === "number") {
    const starter = state.players?.[state.startingPlayerIndex];
    if (starter) {
      return `First turn: ${starter.name}`;
    }
  }
  if (room.startingPlayerMode === "random") {
    return "First turn: Random player";
  }
  if (room.startingPlayerMode === "first") {
    return `First turn: ${room.players[0]?.name ?? "Seat 1"}`;
  }
  const chosen = room.players.find((p) => p.id === room.startingPlayerMode);
  return `First turn: ${chosen?.name ?? "Random player"}`;
}

export function getRoomSetupSummaryDataPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): {
  gameTitle: string;
  formatTitle: string;
  formatDescription: string;
  targetLabel: string;
  seatsLabel: string;
  seatsSubLabel: string;
  ruleChips: string[];
} {
  const state = getRoomStatePure(model, room);
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const botCount = room.players.length - humanCount;
  const diffLabel = BOT_DIFFICULTY_META[room.botDifficulty].label.toLowerCase();
  const seatsLabel = `${room.players.length} ${room.players.length === 1 ? "player" : "players"}`;
  const seatsSubLabel = room.allBots
    ? `All-bot simulation (${diffLabel})`
    : `${humanCount} ${humanCount === 1 ? "human" : "humans"}, ${botCount} ${diffLabel} ${botCount === 1 ? "bot" : "bots"}`;
  const firstTurnChip = getStartingPlayerSummaryLabelPure(room, state);
  const modeLabel = room.isOfflineLocal
    ? "Offline pass and play"
    : "Online multiplayer";

  if (room.gameId === "splendor") {
    const pts = state?.config?.targetPoints ?? 15;
    return {
      gameTitle: "Splendor",
      formatTitle: "Renaissance gem market",
      formatDescription:
        "Draft gem tokens, purchase tier 1–3 development cards, and attract noble patrons.",
      targetLabel: `${pts} prestige points`,
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        "90 development cards",
        "10-token limit",
      ],
    };
  }

  if (room.gameId === "azul") {
    return {
      gameTitle: "Azul",
      formatTitle: "Evora palace mosaic",
      formatDescription:
        "Draft ceramic tiles from factory displays onto pattern lines to tile a 5×5 wall.",
      targetLabel: "Complete 1 horizontal row",
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        "100 ceramic tiles",
        "5×5 mosaic wall",
      ],
    };
  }

  if (room.gameId === "seven_wonders") {
    const sideMode = room.config.wonderSideMode ?? "random";
    const wonderChip =
      sideMode === "day"
        ? "Wonder Side A (Day)"
        : sideMode === "night"
          ? "Wonder Side B (Night)"
          : "Random Day/Night Wonders";
    return {
      gameTitle: "7 Wonders",
      formatTitle: "Ancient world drafting",
      formatDescription:
        "Draft cards simultaneously across three Ages, trade with West and East neighbors, wage military conflicts, and raise your Wonder.",
      targetLabel: "Highest VP after Age III",
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        "Simultaneous drafting",
        wonderChip,
        "3 Ages · 6 picks/Age",
      ],
    };
  }

  const sc = SCENARIO_CATALOG[room.config.scenarioId];
  const isCk = Boolean(
    sc.enableCitiesAndKnights || room.config.enableCitiesAndKnights
  );
  const is56Active = Boolean(
    room.players.length >= 5 ||
      isExpanded56Scenario(room.config.scenarioId)
  );
  const targetVp =
    state?.config?.targetVictoryPoints ??
    (isCk && !sc.enableCitiesAndKnights
      ? Math.max(13, sc.defaultTargetVp + (sc.enableSeafarers ? 2 : 3))
      : sc.defaultTargetVp);
  const expansionChips = [
    is56Active ? "5–6P Extension (expanded map & bank)" : "",
    isCk
      ? "Cities & Knights (Metropolises, Knights & Progress)"
      : "",
    sc.enableSeafarers ? "Seafarers ships and islands" : "",
    sc.enableSpecialBuildingPhase || is56Active ? "Special building phase" : "",
    room.config.enableHarbormaster ? "Harbormaster (+2 VP)" : "",
    room.config.enableCityWalls || isCk
      ? "City walls (+2 safe hand)"
      : "",
    room.config.enableFriendlyRobber ? "Friendly robber" : "",
  ].filter(Boolean);
  const ruleChips: string[] = [
    modeLabel,
    firstTurnChip,
    ...(expansionChips.length > 0 ? expansionChips : ["Standard island rules"]),
  ];

  return {
    gameTitle: "Settlers of Catan",
    formatTitle: sc.name,
    formatDescription: sc.description,
    targetLabel: `${targetVp} victory points`,
    seatsLabel,
    seatsSubLabel,
    ruleChips,
  };
}

export function renderSetupSummaryCardPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  isOwner: boolean
): string {
  const info = getRoomSetupSummaryDataPure(model, room);
  const badgeLabel =
    room.status === "in_progress"
      ? "Match active"
      : `Joined as ${escapeAttr(model.currentUserName)}`;
  const noticeCopy =
    room.status === "in_progress"
      ? "A match is currently underway. Table setup unlocks once the game concludes."
      : `Hosted by <strong>${escapeAttr(room.ownerName || "Room host")}</strong>. Review the match setup summary below while waiting for the host to start.`;

  return `
      <div class="ga-surface-card ga-setup-summary">
        <div class="ga-section-bar">
          <h2>Setup summary</h2>
          <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">${badgeLabel}</span>
        </div>

        <div class="ga-notice">
          ${noticeCopy}
        </div>

        <div class="ga-summary-grid">
          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Board game</span>
            <span class="ga-summary-cell__value">${info.gameTitle}</span>
            <span class="ga-summary-cell__sub">Host: ${escapeAttr(room.ownerName || "Host")}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Victory target</span>
            <span class="ga-summary-cell__value ga-num">${info.targetLabel}</span>
            <span class="ga-summary-cell__sub ga-num">Room ${escapeAttr(formatRoomHashLabelPure(room.roomId))}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Scenario and format</span>
            <span class="ga-summary-cell__value">${info.formatTitle}</span>
            <span class="ga-summary-cell__sub">${info.formatDescription}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">Seats and control</span>
            <span class="ga-summary-cell__value ga-num">${info.seatsLabel}</span>
            <span class="ga-summary-cell__sub">${info.seatsSubLabel}</span>
          </div>
        </div>

        <div class="ga-summary-rules">
          <span class="ga-summary-cell__label">Active rules and expansions</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${info.ruleChips
              .map((chip) => `<span class="ga-chip ga-chip--accent">${escapeAttr(chip)}</span>`)
              .join("")}
          </div>
        </div>
      </div>
    `;
}
