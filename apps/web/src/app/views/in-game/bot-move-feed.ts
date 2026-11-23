import {
  BOT_MOVE_THROTTLE_PRESETS,
  clampBotMoveThrottleMsPure,
  formatBotThrottleShortPure,
  getBotMoveThrottlePresetPure,
  getNextBotMoveThrottlePresetPure,
} from "../../../config/app-config.ts";
import {
  type SupportedLocale,
  localizeEventLogMessage,
  t,
} from "../../../i18n/index.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel, ClientRoom, SupportedGameId } from "../../types.ts";

interface BotMoveEntry {
  readonly id: string;
  readonly turn: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly playerColor: string;
  readonly type: string;
  readonly categoryLabel: string;
  readonly message: string;
  readonly isSinceHuman: boolean;
}

export interface BotMoveFeedSummary {
  readonly hasBots: boolean;
  readonly latestMove: BotMoveEntry | null;
  readonly latestSimultaneousBatch: readonly BotMoveEntry[];
  readonly recentMoves: readonly BotMoveEntry[];
  readonly sinceHumanCount: number;
  readonly totalBotMoves: number;
}

const NON_ACTION_EVENT_TYPES = new Set<string>([
  "GAME_STARTED",
  "GAME_INIT",
  "TURN_STARTED",
  "GAME_OVER",
  "GAME_OVER_MAX_TURNS",
  "FINAL_ROUND_TRIGGERED",
  "AGE_START",
  "MILITARY_CONFLICT",
  "ENDGAME_BONUS",
]);

const MAX_RECENT_BOT_MOVES = 10;

export function classifyBotEventCategoryPure(eventType: string): string {
  const t = String(eventType || "").toUpperCase();
  if (t.startsWith("SETUP_")) return "Setup";
  if (t === "DICE_ROLLED") return "Roll";
  if (
    t === "ROAD_BUILT" ||
    t === "SHIP_BUILT" ||
    t === "SHIP_MOVED" ||
    t === "SETTLEMENT_BUILT" ||
    t === "CITY_BUILT" ||
    t === "CITY_WALL_BUILT" ||
    t === "BUILD_STRUCTURE"
  ) {
    return "Build";
  }
  if (t === "BUILD_WONDER_STAGE") return "Wonder";
  if (t === "DISCARD_FOR_COINS") return "Sell";
  if (
    t === "HALIKARNASSUS_BUILD" ||
    t === "HALIKARNASSUS_SKIP" ||
    t === "BABYLON_SEVENTH_CARD"
  ) {
    return "Power";
  }
  if (
    t === "MARITIME_TRADE" ||
    t.startsWith("DOMESTIC_TRADE_") ||
    t.startsWith("COMMERCIAL_HARBOR_")
  ) {
    return "Trade";
  }
  if (
    t === "DEV_CARD_BOUGHT" ||
    t === "KNIGHT_PLAYED" ||
    t === "ROAD_BUILDING_PLAYED" ||
    t === "YEAR_OF_PLENTY_PLAYED" ||
    t === "MONOPOLY_PLAYED"
  ) {
    return "Dev";
  }
  if (
    t === "ROBBER_MOVED" ||
    t === "PIRATE_MOVED" ||
    t === "RESOURCE_STOLEN" ||
    t === "ROBBER_CHASED" ||
    t === "PIRATE_CHASED"
  ) {
    return "Robber";
  }
  if (t === "CARDS_DISCARDED" || t === "PROGRESS_CARD_DISCARDED") {
    return "Discard";
  }
  if (t.startsWith("KNIGHT_") || t.includes("DESERTER")) return "Knight";
  if (
    t === "CITY_IMPROVEMENT_UPGRADED" ||
    t.startsWith("PROGRESS_CARD_") ||
    t.includes("MERCHANT") ||
    t.includes("SPY") ||
    t.includes("WEDDING") ||
    t.includes("INVENTOR") ||
    t.includes("DIPLOMAT") ||
    t.includes("BISHOP") ||
    t.includes("INTRIGUE") ||
    t.includes("SABOTEUR")
  ) {
    return "C&K";
  }
  if (
    t === "GOLD_RESOURCE_PICKED" ||
    t === "FOG_HEX_REVEALED" ||
    t === "NEW_ISLAND_BONUS"
  ) {
    return "Explore";
  }
  if (t === "GEMS_TAKEN") return "Gems";
  if (t === "CARD_PURCHASED") return "Buy";
  if (t === "CARD_RESERVED") return "Reserve";
  if (t === "TOKENS_RETURNED") return "Return";
  if (t === "NOBLE_VISITED") return "Noble";
  if (t === "TURN_PASSED" || t === "SPECIAL_BUILDING_STARTED") return "Turn";
  if (t === "TILES_DRAFTED") return "Draft";
  if (t === "WALL_TILED") return "Wall";
  return "Move";
}

export function extractBotMoveFeedPure(
  gameId: SupportedGameId,
  state: any
): BotMoveFeedSummary {
  const players: readonly any[] = Array.isArray(state?.players)
    ? state.players
    : [];
  const botById = new Map<string, any>();
  const humanIds = new Set<string>();
  for (const p of players) {
    if (!p?.id) continue;
    if (p.isBot) {
      botById.set(p.id, p);
    } else {
      humanIds.add(p.id);
    }
  }

  if (botById.size === 0) {
    return {
      hasBots: false,
      latestMove: null,
      latestSimultaneousBatch: [],
      recentMoves: [],
      sinceHumanCount: 0,
      totalBotMoves: 0,
    };
  }

  const eventLog: readonly any[] = Array.isArray(state?.eventLog)
    ? state.eventLog
    : [];

  let lastHumanEventIndex = -1;
  for (let i = eventLog.length - 1; i >= 0; i--) {
    const evt = eventLog[i];
    if (
      evt &&
      typeof evt.playerId === "string" &&
      humanIds.has(evt.playerId) &&
      !NON_ACTION_EVENT_TYPES.has(String(evt.type ?? ""))
    ) {
      lastHumanEventIndex = i;
      break;
    }
  }

  const allBotMoves: BotMoveEntry[] = [];
  for (let i = 0; i < eventLog.length; i++) {
    const evt = eventLog[i];
    if (!evt || typeof evt.playerId !== "string") continue;
    const bot = botById.get(evt.playerId);
    if (!bot) continue;
    const evtType = String(evt.type ?? "");
    if (NON_ACTION_EVENT_TYPES.has(evtType)) continue;
    const msg = String(evt.message ?? "").trim();
    if (!msg) continue;

    allBotMoves.push({
      id: String(evt.id ?? `bot-evt-${i}`),
      turn: typeof evt.turn === "number" ? evt.turn : 0,
      playerId: bot.id,
      playerName: String(bot.name ?? "Bot"),
      playerColor: String(bot.color ?? "#38bdf8"),
      type: evtType,
      categoryLabel: classifyBotEventCategoryPure(evtType),
      message: msg,
      isSinceHuman: i > lastHumanEventIndex,
    });
  }

  const latestMove =
    allBotMoves.length > 0 ? allBotMoves[allBotMoves.length - 1]! : null;
  const recentMoves = [...allBotMoves]
    .reverse()
    .slice(0, MAX_RECENT_BOT_MOVES);
  const sinceHumanCount = allBotMoves.reduce(
    (sum, m) => sum + (m.isSinceHuman ? 1 : 0),
    0
  );

  const latestSimultaneousBatch: readonly BotMoveEntry[] = (() => {
    if (gameId !== "seven_wonders" || !latestMove) return [];
    const simultaneousTypes = new Set([
      "BUILD_STRUCTURE",
      "BUILD_WONDER_STAGE",
      "DISCARD_FOR_COINS",
    ]);
    if (!simultaneousTypes.has(latestMove.type)) return [];
    const sameTurn = allBotMoves.filter(
      (m) => m.turn === latestMove.turn && simultaneousTypes.has(m.type)
    );
    return sameTurn.length > 1 ? sameTurn : [];
  })();

  return {
    hasBots: true,
    latestMove,
    latestSimultaneousBatch,
    recentMoves,
    sinceHumanCount,
    totalBotMoves: allBotMoves.length,
  };
}

function getEffectiveBotThrottleMsPure(
  model: Readonly<AppModel>,
  room: ClientRoom
): number {
  return clampBotMoveThrottleMsPure(
    room.botStepDelayMs ?? model.botMoveThrottleMs
  );
}

export function renderBotBannerControlsPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  hasBots: boolean,
  canAdjustRoomPace: boolean
): string {
  if (!hasBots) return "";
  const locale = model.locale;
  const effectiveDelayMs = getEffectiveBotThrottleMsPure(model, room);
  const preset = getBotMoveThrottlePresetPure(effectiveDelayMs);
  const nextPreset = getNextBotMoveThrottlePresetPure(effectiveDelayMs);
  const presetLabel = t(locale, `botFeed.preset.${preset.id}`);
  const nextPresetLabel = t(locale, `botFeed.preset.${nextPreset.id}`);
  const delayShort = formatBotThrottleShortPure(effectiveDelayMs);
  const paceTitle = canAdjustRoomPace
    ? t(locale, "botFeed.paceTitleCanAdjust", {
        label: presetLabel,
        short: delayShort,
        nextLabel: nextPresetLabel,
        nextShort: nextPreset.shortLabel,
      })
    : t(locale, "botFeed.paceTitleReadOnly", {
        label: presetLabel,
        short: delayShort,
      });

  return `
                <button type="button" id="btn-toggle-bot-moves" class="btn btn--secondary btn--sm ${
                  model.showBotMoves ? "is-selected" : ""
                }" aria-pressed="${model.showBotMoves ? "true" : "false"}" title="${escapeAttr(t(locale, "botFeed.toggleTitle"))}">${escapeAttr(
                  t(locale, "botFeed.botMovesBtn", {
                    state: model.showBotMoves
                      ? t(locale, "botFeed.stateOn")
                      : t(locale, "botFeed.stateOff"),
                  })
                )}</button>
                <button type="button" id="btn-cycle-bot-pace" class="btn btn--secondary btn--sm ga-num" title="${escapeAttr(
                  paceTitle
                )}" ${!canAdjustRoomPace ? "disabled" : ""}>${escapeAttr(
                  t(locale, "botFeed.paceBtn", {
                    label: presetLabel,
                    short: delayShort,
                  })
                )}</button>`;
}

export function renderBotMoveFeedBarPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: any,
  actingPlayer: any,
  feed: BotMoveFeedSummary
): string {
  if (!feed.hasBots || !model.showBotMoves) return "";
  const locale = model.locale;

  const effectiveDelayMs = getEffectiveBotThrottleMsPure(model, room);
  const delayShort = formatBotThrottleShortPure(effectiveDelayMs);
  const isBotActingNow = Boolean(
    state?.phase !== "GAME_OVER" && actingPlayer && actingPlayer.isBot
  );
  const hasMultipleRecent = feed.recentMoves.length > 1;
  const isExpanded = hasMultipleRecent && model.botFeedHistoryExpanded;

  const primaryContentHtml = (() => {
    if (!feed.latestMove) {
      return `
            <span class="ga-bot-feed__dot ${isBotActingNow ? "is-live" : ""}" style="background: ${
              isBotActingNow && actingPlayer?.color
                ? escapeAttr(actingPlayer.color)
                : "#64748b"
            }"></span>
            <span class="ga-bot-feed__tag">${escapeAttr(t(locale, "botFeed.tag"))}</span>
            <span class="ga-bot-feed__msg ga-bot-feed__msg--muted">${
              isBotActingNow
                ? escapeAttr(
                    t(locale, "botFeed.choosingMove", {
                      name: actingPlayer.name,
                    })
                  )
                : escapeAttr(t(locale, "botFeed.idleHint"))
            }</span>`;
    }

    if (feed.latestSimultaneousBatch.length > 1) {
      const items = feed.latestSimultaneousBatch
        .map(
          (m) =>
            `<span class="ga-bot-feed__sim-item"><span class="player-dot" style="background: ${escapeAttr(
              m.playerColor
            )}; width: 8px; height: 8px;"></span><span>${escapeAttr(
              localizeEventLogMessage(m.message, locale)
            )}</span></span>`
        )
        .join(`<span class="ga-bot-feed__sep" aria-hidden="true">·</span>`);
      return `
            <span class="ga-bot-feed__turn ga-num">T${feed.latestMove.turn}</span>
            <span class="ga-bot-feed__tag">${escapeAttr(t(locale, "botFeed.reveal"))}</span>
            <span class="ga-bot-feed__msg ga-bot-feed__msg--sim">${items}</span>`;
    }

    const m = feed.latestMove;
    const msg = localizeEventLogMessage(m.message, locale);
    return `
            <span class="ga-bot-feed__dot ${isBotActingNow ? "is-live" : ""}" style="background: ${escapeAttr(
              m.playerColor
            )}"></span>
            <span class="ga-bot-feed__turn ga-num">T${m.turn}</span>
            <span class="ga-bot-feed__tag">${escapeAttr(m.categoryLabel)}</span>
            <span class="ga-bot-feed__msg" title="${escapeAttr(msg)}">${escapeAttr(msg)}</span>`;
  })();

  const historyDrawerHtml = isExpanded
    ? `
          <div class="ga-bot-feed__drawer" role="region" aria-label="${escapeAttr(t(locale, "botFeed.recentAria"))}">
            <div class="ga-bot-feed__drawer-head">
              <span>${escapeAttr(
                t(locale, "botFeed.recentHeading", {
                  count: feed.recentMoves.length,
                  since:
                    feed.sinceHumanCount > 0
                      ? t(locale, "botFeed.sinceLastMove", {
                          count: feed.sinceHumanCount,
                        })
                      : "",
                })
              )}</span>
              <button type="button" id="btn-close-bot-feed-history" class="ga-bot-feed__drawer-close" aria-label="${escapeAttr(t(locale, "botFeed.closeAria"))}">${escapeAttr(t(locale, "common.close"))}</button>
            </div>
            <div class="ga-bot-feed__drawer-list">
              ${feed.recentMoves
                .map(
                  (entry, idx) => `
                <div class="ga-bot-feed__row ${
                  idx === 0 ? "is-latest" : ""
                } ${entry.isSinceHuman ? "is-new" : ""}">
                  <span class="player-dot" style="background: ${escapeAttr(
                    entry.playerColor
                  )}; width: 8px; height: 8px;"></span>
                  <span class="ga-bot-feed__turn ga-num">T${entry.turn}</span>
                  <span class="ga-bot-feed__tag">${escapeAttr(entry.categoryLabel)}</span>
                  <span class="ga-bot-feed__row-msg">${escapeAttr(
                    localizeEventLogMessage(entry.message, locale)
                  )}</span>
                  ${
                    entry.isSinceHuman
                      ? `<span class="ga-bot-feed__new-pill">${escapeAttr(t(locale, "botFeed.newPill"))}</span>`
                      : ""
                  }
                </div>`
                )
                .join("")}
            </div>
          </div>`
    : "";

  const recentBtnLabel =
    feed.sinceHumanCount > 1
      ? t(locale, "botFeed.newCountBtn", { count: feed.sinceHumanCount })
      : t(locale, "botFeed.historyBtn", { count: feed.recentMoves.length });

  return `
        <div class="ga-bot-feed ${isBotActingNow ? "is-acting" : ""} ${
          isExpanded ? "is-expanded" : ""
        }" role="status" aria-live="polite" data-bot-feed-game="${escapeAttr(room.gameId)}">
          <div class="ga-bot-feed__bar">
            <div class="ga-bot-feed__main">
              ${primaryContentHtml}
            </div>
            <div class="ga-bot-feed__actions">
              ${
                isBotActingNow
                  ? `<span class="ga-bot-feed__pace ga-num" title="${escapeAttr(
                      t(locale, "botFeed.nextStepTitle", { short: delayShort })
                    )}">${escapeAttr(actingPlayer.name)} · ${delayShort}</span>`
                  : ""
              }
              ${
                hasMultipleRecent
                  ? `<button type="button" id="btn-toggle-bot-feed-history" class="ga-bot-feed__btn ga-num ${
                      isExpanded ? "is-open" : ""
                    }" aria-expanded="${isExpanded ? "true" : "false"}" title="${escapeAttr(t(locale, "botFeed.viewRecentTitle"))}">${escapeAttr(recentBtnLabel)}</button>`
                  : ""
              }
              <button type="button" id="btn-hide-bot-moves" class="ga-bot-feed__btn ga-bot-feed__btn--hide" aria-label="${escapeAttr(t(locale, "botFeed.hideAria"))}" title="${escapeAttr(t(locale, "botFeed.hideTitle"))}">×</button>
            </div>
          </div>
          ${historyDrawerHtml}
        </div>`;
}

export function getBotPaceDropdownOptionsPure(
  locale: SupportedLocale = "en"
): Array<{
  value: string;
  label: string;
  meta: string;
}> {
  return BOT_MOVE_THROTTLE_PRESETS.map((p) => ({
    value: String(p.delayMs),
    label: t(locale, "botFeed.paceOptionLabel", {
      label: t(locale, `botFeed.preset.${p.id}`),
      short: p.shortLabel,
    }),
    meta: p.id === "normal" ? t(locale, "botFeed.defaultMeta") : p.shortLabel,
  }));
}
