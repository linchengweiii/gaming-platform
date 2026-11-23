import {
  SCENARIO_CATALOG,
  isExpanded56Scenario,
} from "@gaming-platform/catan";
import {
  type SupportedLocale,
  getBotDifficultyMetaLocalized,
  getCatanScenarioTextLocalized,
  getGameTitleLocalized,
  t,
} from "../../i18n/index.ts";
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
  const locale = model.locale;
  const hasMatchState = Boolean(getRoomStatePure(model, room));
  const hashLabel = formatRoomHashLabelPure(room.roomId);
  const isCopied = model.copiedRoomLinkId === room.roomId;
  const statusChip =
    room.status === "in_progress"
      ? `<span class="ga-chip ga-chip--warn">${escapeAttr(t(locale, "common.inProgress"))}</span>`
      : room.status === "finished"
        ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "common.finished"))}</span>`
        : `<span class="ga-chip">${escapeAttr(t(locale, "common.preGame"))}</span>`;

  return `
      <header class="ga-nav ga-nav--room">
        <div class="ga-nav__inner">
          <div class="ga-nav__left">
            <button type="button" id="btn-back-lobby" class="ga-brand">
              ${BRAND_MARK_SVG}
              <div class="ga-brand__meta">
                <span class="ga-num">${escapeAttr(t(locale, "lobby.roomTitle", { hash: hashLabel }))}</span>
                <span class="ga-brand__sub">${escapeAttr(
                  t(locale, "room.backToLobbySub", {
                    host: room.ownerName || t(locale, "common.host"),
                  })
                )}</span>
              </div>
            </button>

            <div class="ga-tabs" role="navigation" aria-label="${escapeAttr(t(locale, "room.pagesAria"))}">
              <button type="button" id="tab-setup-page" class="ga-tab ${
                activeTab === "setup" ? "is-active" : ""
              }">${escapeAttr(t(locale, "room.tabSetup"))}</button>
              <button type="button" id="tab-game-page" class="ga-tab ${
                activeTab === "game" ? "is-active" : ""
              }" ${!hasMatchState ? "disabled" : ""}>${escapeAttr(t(locale, "room.tabGame"))}</button>
            </div>

            ${statusChip}
            ${
              room.isOfflineLocal
                ? `<span class="ga-chip ga-chip--ok">${escapeAttr(t(locale, "common.offlineLocal"))}</span>${
                    room.isPrivate
                      ? `<span class="ga-chip ga-chip--warn">${escapeAttr(t(locale, "common.private"))}</span>`
                      : ""
                  }`
                : `<span class="ga-chip ${
                    room.isPrivate ? "ga-chip--warn" : ""
                  }">${escapeAttr(
                    room.isPrivate
                      ? t(locale, "common.private")
                      : t(locale, "common.public")
                  )}</span>
                   <button type="button" id="btn-copy-room-link" data-copy-room-link="${escapeAttr(
                     room.roomId
                   )}" class="btn btn--secondary btn--sm ga-num" title="${escapeAttr(
                     t(locale, "room.shareLinkTitle", { hash: hashLabel })
                   )}">${escapeAttr(
                     isCopied
                       ? t(locale, "common.copied")
                       : t(locale, "common.shareLink")
                   )}</button>`
            }
          </div>

          <div class="ga-toolbar">
            ${renderTopbarUserSelectorPure(model)}
          </div>
        </div>
      </header>
    `;
}

function getStartingPlayerSummaryLabelPure(
  room: ClientRoom,
  state: any,
  locale: SupportedLocale = "en"
): string {
  if (state && typeof state.startingPlayerIndex === "number") {
    const starter = state.players?.[state.startingPlayerIndex];
    if (starter) {
      return t(locale, "room.firstTurn", { name: starter.name });
    }
  }
  if (room.startingPlayerMode === "random") {
    return t(locale, "room.firstTurn", {
      name: t(locale, "room.randomPlayer"),
    });
  }
  if (room.startingPlayerMode === "first") {
    return t(locale, "room.firstTurn", {
      name: room.players[0]?.name ?? t(locale, "room.seatN", { num: 1 }),
    });
  }
  const chosen = room.players.find((p) => p.id === room.startingPlayerMode);
  return t(locale, "room.firstTurn", {
    name: chosen?.name ?? t(locale, "room.randomPlayer"),
  });
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
  const locale = model.locale;
  const state = getRoomStatePure(model, room);
  const humanCount = room.players.filter((p) => !p.isBot).length;
  const botCount = room.players.length - humanCount;
  const diffMeta = getBotDifficultyMetaLocalized(room.botDifficulty, locale);
  const diffLabel =
    locale === "en" ? diffMeta.label.toLowerCase() : diffMeta.label;
  const seatsLabel =
    locale === "en"
      ? `${room.players.length} ${room.players.length === 1 ? "player" : "players"}`
      : `${room.players.length} 位玩家`;
  const seatsSubLabel = room.allBots
    ? t(locale, "room.allBotSim", { diff: diffLabel })
    : t(locale, "room.seatsControlSub", {
        humans: humanCount,
        humansWord:
          humanCount === 1
            ? t(locale, "lobby.wordHumanOne")
            : t(locale, "lobby.wordHumanMany"),
        bots: botCount,
        diff: diffLabel,
        botsWord:
          botCount === 1
            ? t(locale, "lobby.wordBotOne")
            : t(locale, "lobby.wordBotMany"),
      });
  const firstTurnChip = getStartingPlayerSummaryLabelPure(room, state, locale);
  const modeLabel = room.isOfflineLocal
    ? t(locale, "room.modeOfflinePassAndPlay")
    : room.isPrivate
      ? t(locale, "room.modeOnlinePrivate")
      : t(locale, "room.modeOnlinePublic");

  if (room.gameId === "splendor") {
    const pts = state?.config?.targetPoints ?? 15;
    return {
      gameTitle: getGameTitleLocalized("splendor", locale),
      formatTitle: t(locale, "format.splendorTitle"),
      formatDescription: t(locale, "format.splendorDesc"),
      targetLabel: t(locale, "format.splendorTarget", { pts }),
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        t(locale, "format.splendorChipCards"),
        t(locale, "format.splendorChipLimit"),
      ],
    };
  }

  if (room.gameId === "azul") {
    return {
      gameTitle: getGameTitleLocalized("azul", locale),
      formatTitle: t(locale, "format.azulTitle"),
      formatDescription: t(locale, "format.azulDesc"),
      targetLabel: t(locale, "format.azulTarget"),
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        firstTurnChip,
        t(locale, "format.azulChipTiles"),
        t(locale, "format.azulChipWall"),
      ],
    };
  }

  if (room.gameId === "seven_wonders") {
    const sideMode = room.config.wonderSideMode ?? "random";
    const wonderChip =
      sideMode === "day"
        ? t(locale, "format.swChipDay")
        : sideMode === "night"
          ? t(locale, "format.swChipNight")
          : t(locale, "format.swChipRandom");
    return {
      gameTitle: getGameTitleLocalized("seven_wonders", locale),
      formatTitle: t(locale, "format.swTitle"),
      formatDescription: t(locale, "format.swDesc"),
      targetLabel: t(locale, "format.swTarget"),
      seatsLabel,
      seatsSubLabel,
      ruleChips: [
        modeLabel,
        t(locale, "format.swChipSimul"),
        wonderChip,
        t(locale, "format.swChipAges"),
      ],
    };
  }

  const sc = SCENARIO_CATALOG[room.config.scenarioId];
  const scText = getCatanScenarioTextLocalized(room.config.scenarioId, locale);
  const isCk = Boolean(
    sc.enableCitiesAndKnights || room.config.enableCitiesAndKnights
  );
  const is56Active = Boolean(
    room.players.length >= 5 || isExpanded56Scenario(room.config.scenarioId)
  );
  const targetVp =
    state?.config?.targetVictoryPoints ??
    (isCk && !sc.enableCitiesAndKnights
      ? Math.max(13, sc.defaultTargetVp + (sc.enableSeafarers ? 2 : 3))
      : sc.defaultTargetVp);
  const expansionChips = [
    is56Active ? t(locale, "format.catanChip56") : "",
    isCk ? t(locale, "format.catanChipCk") : "",
    sc.enableSeafarers ? t(locale, "format.catanChipSeafarers") : "",
    sc.enableSpecialBuildingPhase || is56Active
      ? t(locale, "format.catanChipSpecialBuild")
      : "",
    room.config.enableHarbormaster
      ? t(locale, "format.catanChipHarbormaster")
      : "",
    room.config.enableCityWalls || isCk
      ? t(locale, "format.catanChipCityWalls")
      : "",
    room.config.enableFriendlyRobber
      ? t(locale, "format.catanChipFriendlyRobber")
      : "",
  ].filter(Boolean);
  const ruleChips: string[] = [
    modeLabel,
    firstTurnChip,
    ...(expansionChips.length > 0
      ? expansionChips
      : [t(locale, "format.catanChipStandard")]),
  ];

  return {
    gameTitle: getGameTitleLocalized("catan", locale),
    formatTitle: scText.name,
    formatDescription: scText.description,
    targetLabel: t(locale, "format.catanTarget", { vp: targetVp }),
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
  const locale = model.locale;
  const info = getRoomSetupSummaryDataPure(model, room);
  const badgeLabel =
    room.status === "in_progress"
      ? t(locale, "room.summaryMatchActive")
      : t(locale, "room.summaryJoinedAs", { name: model.currentUserName });
  const noticeCopy =
    room.status === "in_progress"
      ? escapeAttr(t(locale, "room.summaryActiveNotice"))
      : t(locale, "room.summaryGuestNotice", {
          host: `<strong>${escapeAttr(room.ownerName || t(locale, "common.roomHost"))}</strong>`,
        });

  return `
      <div class="ga-surface-card ga-setup-summary">
        <div class="ga-section-bar">
          <h2>${escapeAttr(t(locale, "room.summaryHeading"))}</h2>
          <span class="ga-chip ${isOwner ? "ga-chip--accent" : ""}">${escapeAttr(badgeLabel)}</span>
        </div>

        <div class="ga-notice">
          ${noticeCopy}
        </div>

        <div class="ga-summary-grid">
          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">${escapeAttr(t(locale, "room.summaryBoardGame"))}</span>
            <span class="ga-summary-cell__value">${escapeAttr(info.gameTitle)}</span>
            <span class="ga-summary-cell__sub">${escapeAttr(
              t(locale, "lobby.hostLabel", {
                name: room.ownerName || t(locale, "common.host"),
              })
            )}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">${escapeAttr(t(locale, "room.summaryVictoryTarget"))}</span>
            <span class="ga-summary-cell__value ga-num">${escapeAttr(info.targetLabel)}</span>
            <span class="ga-summary-cell__sub ga-num">${escapeAttr(
              t(locale, "lobby.roomTitle", {
                hash: formatRoomHashLabelPure(room.roomId),
              })
            )}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">${escapeAttr(t(locale, "room.summaryScenarioFormat"))}</span>
            <span class="ga-summary-cell__value">${escapeAttr(info.formatTitle)}</span>
            <span class="ga-summary-cell__sub">${escapeAttr(info.formatDescription)}</span>
          </div>

          <div class="ga-summary-cell">
            <span class="ga-summary-cell__label">${escapeAttr(t(locale, "room.summarySeatsControl"))}</span>
            <span class="ga-summary-cell__value ga-num">${escapeAttr(info.seatsLabel)}</span>
            <span class="ga-summary-cell__sub">${escapeAttr(info.seatsSubLabel)}</span>
          </div>
        </div>

        <div class="ga-summary-rules">
          <span class="ga-summary-cell__label">${escapeAttr(t(locale, "room.summaryActiveRules"))}</span>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${info.ruleChips
              .map(
                (chip) =>
                  `<span class="ga-chip ga-chip--accent">${escapeAttr(chip)}</span>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
}
