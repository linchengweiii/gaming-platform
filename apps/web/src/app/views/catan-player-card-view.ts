import {
  COMMODITIES,
  type CatanState,
  RESOURCES,
  computePlayerVictoryPoints,
  getPlayerActiveKnightStrength,
  getPlayerResourceCount,
  getPlayerSafeHandLimit,
} from "@gaming-platform/catan";
import {
  COMMODITY_META,
  RESOURCE_META,
  renderCommodityGlyphSvg,
  renderResourceGlyphSvg,
} from "../../catan-graphics.ts";
import { BOT_DIFFICULTY_META } from "../../config/app-config.ts";
import { escapeAttr } from "../helpers/html-and-dropdown.ts";

export function renderCatanPlayerCardPure(
  currentUserId: string,
  state: CatanState,
  p: CatanState["players"][number],
  isActing: boolean,
  isOffline = false
): string {
  const visibleVp = computePlayerVictoryPoints(state, p.id, true);
  const totalVp = computePlayerVictoryPoints(state, p.id, false);
  const showPrivateHand = !p.handRedacted || state.phase === "GAME_OVER";
  const cardCount = getPlayerResourceCount(p);
  const safeLimit = getPlayerSafeHandLimit(state, p.id);
  const unplayedDevs = p.devCards.filter((c) => !c.played);
  const botBadge = p.isBot
    ? `Bot · ${BOT_DIFFICULTY_META[p.botDifficulty ?? "smart"].badge}`
    : p.id === currentUserId
      ? "You · Guest"
      : "Guest";
  const offlineChip = isOffline
    ? `<span class="ga-chip ga-chip--warn" title="Temporarily disconnected — waiting to reconnect">Offline</span>`
    : "";

  const hiddenCardIconSvg = `<svg width="13" height="15" viewBox="0 0 14 16" aria-hidden="true"><rect x="1.5" y="1" width="11" height="14" rx="2.2" fill="#27272a" stroke="#a1a1aa" stroke-width="1.2"/><path d="M4.2 4.5h5.6M4.2 8h5.6M4.2 11.5h3.6" stroke="#fb923c" stroke-width="1.1" stroke-linecap="round"/></svg>`;

  if (state.config.enableCitiesAndKnights) {
    const activeStr = getPlayerActiveKnightStrength(state, p.id);
    const progCount = p.handRedacted
      ? p.hiddenProgressCardCount ?? 0
      : p.progressCards.length;
    return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
            ${offlineChip}
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${
            showPrivateHand
              ? `${totalVp} VP${totalVp !== visibleVp ? ` (${visibleVp})` : ""}`
              : `${visibleVp} VP`
          }</span>
        </div>

        <div class="player-card__hud-row">
          <div class="res-pills">
            ${
              showPrivateHand
                ? `${RESOURCES.map(
                    (r) =>
                      `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
                  ).join("")}${COMMODITIES.map(
                    (c) =>
                      `<span class="res-pill res-${c}" title="${COMMODITY_META[c].label}">${renderCommodityGlyphSvg(c)} ${p.commodities[c]}</span>`
                  ).join("")}`
                : `<span class="res-pill res-pill--hidden ga-num" title="Hidden resource & commodity cards in hand">${hiddenCardIconSvg} ${cardCount} ${
                    cardCount === 1 ? "card" : "cards"
                  }</span>`
            }
            <span class="ga-chip ga-num" title="Cards in hand vs safe limit on 7">${cardCount}/${safeLimit}</span>
          </div>

          <div class="player-card__stats">
            <span class="player-stat-chip" title="Longest route">R <strong class="ga-num">${p.longestRoadLength}</strong></span>
            <span class="player-stat-chip" title="Active knight strength">⚔ <strong class="ga-num">${activeStr}</strong></span>
            <span class="player-stat-chip player-stat-chip--ck" title="Trade / Politics / Science levels">
              <span>T <strong class="ga-num">${p.cityImprovements.trade}</strong></span>
              <span class="player-stat-sep">·</span>
              <span>P <strong class="ga-num">${p.cityImprovements.politics}</strong></span>
              <span class="player-stat-sep">·</span>
              <span>S <strong class="ga-num">${p.cityImprovements.science}</strong></span>
            </span>
            <span class="player-stat-chip" title="Progress cards">P <strong class="ga-num">${progCount}</strong></span>
            ${
              p.defenderPoints > 0
                ? `<span class="player-stat-chip" title="Defender of Catan VP">🛡 <strong class="ga-num">${p.defenderPoints}</strong></span>`
                : ""
            }
            ${
              state.config.enableHarbormaster
                ? `<span class="player-stat-chip" title="Harbor points">H <strong class="ga-num">${p.harborPoints}</strong></span>`
                : ""
            }
            ${
              p.bonusVictoryPoints > 0
                ? `<span class="player-stat-chip" title="Island bonus">+<strong class="ga-num">${p.bonusVictoryPoints}</strong></span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  return `
      <div class="player-card ${isActing ? "active-turn" : ""}">
        <div class="player-header">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="player-dot" style="background: ${p.color}"></span>
            <strong class="player-card__name">${escapeAttr(p.name)}</strong>
            <span class="ga-chip">${botBadge}</span>
            ${offlineChip}
          </div>
          <span class="ga-chip ga-chip--warn ga-num">${
            showPrivateHand
              ? `${totalVp} VP${totalVp !== visibleVp ? ` (${visibleVp})` : ""}`
              : `${visibleVp} VP`
          }</span>
        </div>

        <div class="player-card__hud-row">
          <div class="res-pills">
            ${
              showPrivateHand
                ? RESOURCES.map(
                    (r) =>
                      `<span class="res-pill res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r)} ${p.resources[r]}</span>`
                  ).join("")
                : `<span class="res-pill res-pill--hidden ga-num" title="Hidden resource cards in hand">${hiddenCardIconSvg} ${cardCount} ${
                    cardCount === 1 ? "card" : "cards"
                  }</span>`
            }
            <span class="ga-chip ga-num" title="Cards in hand vs safe limit on 7">${cardCount}/${safeLimit}</span>
          </div>

          <div class="player-card__stats">
            <span class="player-stat-chip" title="Longest route">R <strong class="ga-num">${p.longestRoadLength}</strong></span>
            <span class="player-stat-chip" title="Knights played">K <strong class="ga-num">${p.knightsPlayed}</strong></span>
            <span class="player-stat-chip" title="Unplayed dev cards">D <strong class="ga-num">${unplayedDevs.length}</strong></span>
            ${
              state.config.enableHarbormaster
                ? `<span class="player-stat-chip" title="Harbor points">H <strong class="ga-num">${p.harborPoints}</strong></span>`
                : ""
            }
            ${
              p.bonusVictoryPoints > 0
                ? `<span class="player-stat-chip" title="Island bonus">+<strong class="ga-num">${p.bonusVictoryPoints}</strong></span>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
}
