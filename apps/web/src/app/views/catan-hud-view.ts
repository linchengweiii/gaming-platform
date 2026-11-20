import {
  BARBARIAN_TRACK_STEPS,
  COMMODITIES,
  type CatanState,
  type CommodityMap,
  type CommodityType,
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
  type ResourceMap,
  type ResourceType,
  TERRAIN_TO_COMMODITY,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  type TradeGoodType,
  getBarbarianStrength,
  getBankGoodCount,
  getPlayerActiveKnightStrength,
  getPlayerGoodCount,
  getPlayerVulnerableCities,
  getTotalActiveKnightStrength,
  hasCommodities,
  hasResources,
} from "@gaming-platform/catan";
import {
  type CatanMapViewport,
  DISCIPLINE_META,
  clampCatanMapViewportPure,
  formatCatanZoomPercentPure,
  getCatanBoardViewBox,
  isDefaultCatanMapViewportPure,
  renderActionPieceIconSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
  renderResourceGlyphSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../catan-graphics.ts";
import { CATAN_MAP_VIEWPORT_CONFIG } from "../../config/app-config.ts";
import {
  type SupportedLocale,
  getCatanCommodityTextLocalized,
  getCatanDisciplineTextLocalized,
  getCatanResourceTextLocalized,
  getCatanTradeGoodLabelLocalized,
  t,
} from "../../i18n/index.ts";
import { escapeAttr } from "../helpers/html-and-dropdown.ts";

export function renderCostPipStripPure(
  cost: Partial<ResourceMap>,
  locale: SupportedLocale = "en"
): string {
  const pips = RESOURCES.flatMap((r) =>
    Array.from(
      { length: cost[r] ?? 0 },
      () =>
        `<span class="cost-pip res-${r}" title="${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${pips.join("")}</span>`;
}

export function renderResourceColumnHeadersPure(
  playerResources?: ResourceMap,
  showBank?: ResourceMap,
  tradeRatios?: Record<ResourceType, number>,
  locale: SupportedLocale = "en"
): string {
  return `
      <div class="ga-res-matrix__row-label">${escapeAttr(t(locale, "catan.colResource"))}</div>
      ${RESOURCES.map((r) => {
        const ratio = tradeRatios?.[r];
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
            ${
              playerResources
                ? `<span class="ga-res-col-head__have">×${playerResources[r]}</span>`
                : showBank
                  ? `<span class="ga-res-col-head__have">${showBank[r]}</span>`
                  : ""
            }
          </div>
          <div class="ga-res-col-head__card-wrap">
            ${renderMiniResourceCardSvg(r, 48, 30)}
            ${
              ratio !== undefined
                ? `<span class="ga-res-col-head__rate ${
                    ratio < 4 ? "is-port" : ""
                  }" title="${escapeAttr(t(locale, "catan.harborRateTitle", { ratio }))}">${ratio}:1</span>`
                : ""
            }
          </div>
        </div>
      `;
      }).join("")}
    `;
}

export function renderTradeGoodColumnHeadersPure(
  player?: Pick<CatanState["players"][number], "resources" | "commodities">,
  bankState?: Pick<CatanState, "bank" | "commodityBank">,
  tradeRatios?: Record<TradeGoodType, number>,
  locale: SupportedLocale = "en"
): string {
  return `
      <div class="ga-res-matrix__row-label">${escapeAttr(t(locale, "catan.colGoods"))}</div>
      ${TRADE_GOODS.map((g) => {
        const label = getCatanTradeGoodLabelLocalized(g, locale);
        const ratio = tradeRatios?.[g];
        const haveVal = player ? getPlayerGoodCount(player, g) : undefined;
        const bankVal = bankState ? getBankGoodCount(bankState, g) : undefined;
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${escapeAttr(label)}</span>
            ${
              haveVal !== undefined
                ? `<span class="ga-res-col-head__have">×${haveVal}</span>`
                : bankVal !== undefined
                  ? `<span class="ga-res-col-head__have">${bankVal}</span>`
                  : ""
            }
          </div>
          <div class="ga-res-col-head__card-wrap">
            ${renderMiniTradeGoodCardSvg(g, 42, 26)}
            ${
              ratio !== undefined
                ? `<span class="ga-res-col-head__rate ${
                    ratio < 4 ? "is-port" : ""
                  }" title="${escapeAttr(t(locale, "catan.tradeRateTitle", { ratio }))}">${ratio}:1</span>`
                : ""
            }
          </div>
        </div>
      `;
      }).join("")}
    `;
}

export function hasTradeGoodsForOfferPure(
  player: Pick<CatanState["players"][number], "resources" | "commodities">,
  offer: {
    readonly want: Partial<ResourceMap>;
    readonly wantCommodities?: Partial<CommodityMap>;
  }
): boolean {
  return (
    hasResources(player.resources, offer.want) &&
    hasCommodities(player.commodities, offer.wantCommodities)
  );
}

export function renderCatanBarbarianHudPure(
  state: CatanState,
  viewerPlayer?: CatanState["players"][number] | null,
  locale: SupportedLocale = "en"
): string {
  if (!state.config.enableCitiesAndKnights) {
    return "";
  }
  const defStrength = getTotalActiveKnightStrength(state);
  const barbStrength = getBarbarianStrength(state);
  const isSafe = defStrength >= barbStrength;
  const stepDots = Array.from({ length: BARBARIAN_TRACK_STEPS + 1 }, (_, i) => {
    const isHere = i === state.barbarianPosition;
    const isAttack = i === BARBARIAN_TRACK_STEPS;
    return `<span class="barb-track-dot ${isHere ? "is-ship" : ""} ${
      isAttack ? "is-target" : ""
    }"></span>`;
  }).join("");

  const personalRiskHtml = (() => {
    if (!viewerPlayer || isSafe || barbStrength === 0) return "";
    const myVulnCities = getPlayerVulnerableCities(state, viewerPlayer.id);
    if (myVulnCities.length === 0) {
      return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="${escapeAttr(t(locale, "catan.citiesSafeNoneTitle"))}">${escapeAttr(t(locale, "catan.citiesSafe"))}</span>`;
    }
    const contenderStrengths = state.players
      .filter((p) => getPlayerVulnerableCities(state, p.id).length > 0)
      .map((p) => getPlayerActiveKnightStrength(state, p.id));
    const minStr = Math.min(...contenderStrengths);
    const myStr = getPlayerActiveKnightStrength(state, viewerPlayer.id);
    if (myStr <= minStr) {
      return `<span class="ga-chip ga-chip--danger" style="height: 18px; padding: 0 5px; font-size: 10px;" title="${escapeAttr(t(locale, "catan.atRiskTitle", { myStr }))}">${escapeAttr(t(locale, "catan.atRisk"))}</span>`;
    }
    return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="${escapeAttr(t(locale, "catan.citiesSafeOtherTitle", { minStr, myStr }))}">${escapeAttr(t(locale, "catan.citiesSafe"))}</span>`;
  })();

  const metroPills = IMPROVEMENT_DISCIPLINES.map((disc) => {
    const m = state.metropolises[disc];
    const dMeta = DISCIPLINE_META[disc];
    const dText = getCatanDisciplineTextLocalized(disc, locale);
    const owner = m.ownerId
      ? state.players.find((p) => p.id === m.ownerId)
      : undefined;
    const holderText = owner
      ? `${owner.name} (${t(locale, "catan.lvN", { lv: m.level })})`
      : t(locale, "catan.metroUnclaimedHint");
    return `<span class="ck-metro-pill" style="--metro-accent: ${dMeta.accent};" title="${escapeAttr(
      t(locale, "catan.metroTooltip", {
        discipline: dText.label,
        holder: holderText,
      })
    )}">
      ${
        owner
          ? `<span class="player-dot" style="background: ${owner.color}; width: 6px; height: 6px;"></span>`
          : ""
      }
      <span>${escapeAttr(dText.shortCode)}</span>
    </span>`;
  }).join("");

  return `
    <div class="map-barbarian-hud">
      <div class="map-barbarian-hud__top">
        <span class="map-barbarian-hud__title">${escapeAttr(
          t(locale, "catan.fleetTrack", {
            pos: state.barbarianPosition,
            max: BARBARIAN_TRACK_STEPS,
          })
        )}</span>
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          ${personalRiskHtml}
          <span class="ga-chip ${
            isSafe ? "ga-chip--ok" : "ga-chip--danger"
          } ga-num" style="height: 19px; padding: 0 6px; font-size: 10.5px;" title="${escapeAttr(
            t(locale, "catan.knightVsCityTitle", {
              def: defStrength,
              barb: barbStrength,
            })
          )}">
            ⚔ ${defStrength} vs 🏰 ${barbStrength}
          </span>
        </div>
      </div>
      <div class="barb-track-bar" aria-hidden="true">${stepDots}</div>
      <div class="map-barbarian-hud__metros">
        <span class="t-label muted" style="font-size: 10.5px;">${escapeAttr(t(locale, "catan.metropolises"))}</span>
        <div style="display: inline-flex; gap: 4px;">${metroPills}</div>
      </div>
    </div>
  `;
}

export function renderCatanMapDiceHudPure(
  state: CatanState,
  locale: SupportedLocale = "en"
): string {
  if (!state.lastRoll) {
    return `
        <div class="map-dice-hud">
          <div class="map-dice-hud__row">
            ${renderRollDiceButtonGraphicSvg(28)}
            <span class="t-label muted">${escapeAttr(t(locale, "catan.rollDiceToProduce"))}</span>
          </div>
        </div>
      `;
  }

  const { die1, die2, total, eventFace } = state.lastRoll;
  const isSeven = total === 7;
  const rollStats = isSeven
    ? {
        producedByRes: {} as Partial<Record<ResourceType, number>>,
        producedByComm: {} as Partial<Record<CommodityType, number>>,
        goldHexes: 0,
        blockedHexes: 0,
      }
    : state.topology.hexOrder.reduce<{
        readonly producedByRes: Partial<Record<ResourceType, number>>;
        readonly producedByComm: Partial<Record<CommodityType, number>>;
        readonly goldHexes: number;
        readonly blockedHexes: number;
      }>(
        (acc, hId) => {
          const tile = state.hexes[hId]!;
          if (tile.numberToken !== total) return acc;
          if (state.robberHexId === hId) {
            return { ...acc, blockedHexes: acc.blockedHexes + 1 };
          }
          if (tile.terrain === "gold") {
            return { ...acc, goldHexes: acc.goldHexes + 1 };
          }
          const res = TERRAIN_TO_RESOURCE[tile.terrain];
          if (!res) return acc;
          const comm = state.config.enableCitiesAndKnights
            ? TERRAIN_TO_COMMODITY[tile.terrain]
            : null;
          const hasAdjacentCity =
            Boolean(comm) &&
            state.topology.hexes[hId]!.cornerVertexIds.some(
              (vId) => state.buildings[vId]?.type === "city"
            );
          return {
            ...acc,
            producedByRes: {
              ...acc.producedByRes,
              [res]: (acc.producedByRes[res] ?? 0) + 1,
            },
            producedByComm:
              comm && hasAdjacentCity
                ? {
                    ...acc.producedByComm,
                    [comm]: (acc.producedByComm[comm] ?? 0) + 1,
                  }
                : acc.producedByComm,
          };
        },
        { producedByRes: {}, producedByComm: {}, goldHexes: 0, blockedHexes: 0 }
      );

  const prodEntries = RESOURCES.filter(
    (r) => (rollStats.producedByRes[r] ?? 0) > 0
  );
  const commEntries = state.config.enableCitiesAndKnights
    ? COMMODITIES.filter((c) => (rollStats.producedByComm[c] ?? 0) > 0)
    : [];
  const sevenLabel =
    state.config.enableCitiesAndKnights && state.barbarianAttacksCount < 1
      ? t(locale, "catan.sevenRobberDormant")
      : t(locale, "catan.sevenRobberActive");
  const yieldsHtml = isSeven
    ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#ef4444", 18)} ${escapeAttr(sevenLabel)}</span>`
    : prodEntries.length > 0 || commEntries.length > 0 || rollStats.goldHexes > 0
      ? [
          ...prodEntries.map(
            (r) =>
              `<span class="map-yield-chip" title="${escapeAttr(
                t(locale, "catan.hexProducedTitle", {
                  label: getCatanResourceTextLocalized(r, locale).label,
                })
              )}">${renderMiniResourceCardSvg(r, 36, 23)}${
                (rollStats.producedByRes[r] ?? 0) > 1
                  ? ` ×${rollStats.producedByRes[r]}`
                  : ""
              }</span>`
          ),
          ...commEntries.map(
            (c) =>
              `<span class="map-yield-chip" title="${escapeAttr(
                t(locale, "catan.commodityProducedTitle", {
                  label: getCatanCommodityTextLocalized(c, locale).label,
                })
              )}">${renderMiniTradeGoodCardSvg(c, 36, 23)}</span>`
          ),
          rollStats.goldHexes > 0
            ? `<span class="map-yield-chip">${renderActionPieceIconSvg("year_of_plenty", "#facc15", 18)} ${escapeAttr(t(locale, "catan.goldCount", { count: rollStats.goldHexes }))}</span>`
            : "",
        ]
          .filter(Boolean)
          .join("")
      : rollStats.blockedHexes > 0
        ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#f87171", 16)} ${escapeAttr(t(locale, "catan.blockedByRobber"))}</span>`
        : `<span class="t-label muted">${escapeAttr(t(locale, "catan.noMatchingHex"))}</span>`;

  const eventDieHtml =
    state.config.enableCitiesAndKnights && eventFace
      ? `\n          ${renderEventDieSvg(eventFace, 34)}`
      : "";

  return `
      <div class="map-dice-hud ${isSeven ? "map-dice-hud--seven" : "map-dice-hud--rolled"}">
        <div class="map-dice-hud__row">
          ${renderDieSvg(die1, 34)}
          ${renderDieSvg(die2, 34)}${eventDieHtml}
          <span class="map-dice-hud__total ${isSeven ? "map-dice-hud__total--seven" : ""}">= ${total}</span>
        </div>
        <div class="map-dice-hud__yields">
          ${yieldsHtml}
        </div>
      </div>
    `;
}

export function renderCatanMapZoomControlsPure(
  state: CatanState,
  viewport: CatanMapViewport,
  locale: SupportedLocale = "en"
): string {
  const baseVb = getCatanBoardViewBox(state);
  const clamped = clampCatanMapViewportPure(viewport, baseVb);
  const atMin = clamped.zoom <= CATAN_MAP_VIEWPORT_CONFIG.minZoom + 1e-4;
  const atMax = clamped.zoom >= CATAN_MAP_VIEWPORT_CONFIG.maxZoom - 1e-4;
  const isDefault = isDefaultCatanMapViewportPure(clamped);
  const belowClass = state.config.enableCitiesAndKnights
    ? "map-zoom-controls--below-barbarian"
    : "";

  return `
    <div class="map-zoom-controls ${belowClass}" role="group" aria-label="${escapeAttr(t(locale, "catan.zoomControlsAria"))}">
      <button type="button" id="btn-map-zoom-out" class="map-zoom-btn" aria-label="${escapeAttr(t(locale, "catan.zoomOutAria"))}" title="${escapeAttr(t(locale, "catan.zoomOutTitle"))}" ${
        atMin ? "disabled" : ""
      }>−</button>
      <button type="button" id="btn-map-zoom-reset" class="map-zoom-btn map-zoom-btn--reset ga-num" aria-label="${escapeAttr(t(locale, "catan.zoomResetAria"))}" title="${escapeAttr(t(locale, "catan.zoomResetTitle"))}" ${
        isDefault ? "disabled" : ""
      }>${formatCatanZoomPercentPure(clamped.zoom)}</button>
      <button type="button" id="btn-map-zoom-in" class="map-zoom-btn" aria-label="${escapeAttr(t(locale, "catan.zoomInAria"))}" title="${escapeAttr(t(locale, "catan.zoomInTitle"))}" ${
        atMax ? "disabled" : ""
      }>+</button>
    </div>
  `;
}

export function renderMissingCostBadgePure(
  have: ResourceMap,
  cost: ResourceMap,
  locale: SupportedLocale = "en"
): string {
  const missing = RESOURCES.flatMap((r) =>
    Array.from(
      { length: Math.max(0, (cost[r] ?? 0) - (have[r] ?? 0)) },
      () =>
        `<span class="cost-pip res-${r}" title="${escapeAttr(
          t(locale, "catan.needResourceTitle", {
            label: getCatanResourceTextLocalized(r, locale).label,
          })
        )}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${missing.join("")}</span>`;
}
