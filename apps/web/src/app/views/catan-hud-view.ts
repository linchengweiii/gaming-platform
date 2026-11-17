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
  COMMODITY_META,
  DISCIPLINE_META,
  RESOURCE_META,
  TRADE_GOOD_META,
  renderActionPieceIconSvg,
  renderDieSvg,
  renderEventDieSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
  renderResourceGlyphSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../catan-graphics.ts";

export function renderCostPipStripPure(cost: Partial<ResourceMap>): string {
  const pips = RESOURCES.flatMap((r) =>
    Array.from(
      { length: cost[r] ?? 0 },
      () =>
        `<span class="cost-pip res-${r}" title="${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${pips.join("")}</span>`;
}

export function renderResourceColumnHeadersPure(
  playerResources?: ResourceMap,
  showBank?: ResourceMap,
  tradeRatios?: Record<ResourceType, number>
): string {
  return `
      <div class="ga-res-matrix__row-label">Resource</div>
      ${RESOURCES.map((r) => {
        const ratio = tradeRatios?.[r];
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${RESOURCE_META[r].label}</span>
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
                  }" title="${ratio}:1 harbor rate">${ratio}:1</span>`
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
  tradeRatios?: Record<TradeGoodType, number>
): string {
  return `
      <div class="ga-res-matrix__row-label">Goods</div>
      ${TRADE_GOODS.map((g) => {
        const meta = TRADE_GOOD_META[g];
        const ratio = tradeRatios?.[g];
        const haveVal = player ? getPlayerGoodCount(player, g) : undefined;
        const bankVal = bankState ? getBankGoodCount(bankState, g) : undefined;
        return `
        <div class="ga-res-col-head">
          <div class="ga-res-col-head__top">
            <span>${meta.label}</span>
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
                  }" title="${ratio}:1 trade rate">${ratio}:1</span>`
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
  viewerPlayer?: CatanState["players"][number] | null
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
      return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="You have no unprotected cities on the island">Cities safe</span>`;
    }
    const contenderStrengths = state.players
      .filter((p) => getPlayerVulnerableCities(state, p.id).length > 0)
      .map((p) => getPlayerActiveKnightStrength(state, p.id));
    const minStr = Math.min(...contenderStrengths);
    const myStr = getPlayerActiveKnightStrength(state, viewerPlayer.id);
    if (myStr <= minStr) {
      return `<span class="ga-chip ga-chip--danger" style="height: 18px; padding: 0 5px; font-size: 10px;" title="Your active knights (${myStr}) tie for lowest among unprotected city owners — activate a knight before step 7!">At risk</span>`;
    }
    return `<span class="ga-chip ga-chip--ok" style="height: 18px; padding: 0 5px; font-size: 10px;" title="Another player with an unprotected city has fewer active knights (${minStr} vs your ${myStr})">Cities safe</span>`;
  })();

  const metroPills = IMPROVEMENT_DISCIPLINES.map((disc) => {
    const m = state.metropolises[disc];
    const dMeta = DISCIPLINE_META[disc];
    const owner = m.ownerId
      ? state.players.find((p) => p.id === m.ownerId)
      : undefined;
    return `<span class="ck-metro-pill" style="--metro-accent: ${dMeta.accent};" title="${
      dMeta.label
    } Metropolis (+2 VP): ${
      owner ? `${owner.name} (Lv ${m.level})` : "Unclaimed (reach Lv 4)"
    }">
      ${
        owner
          ? `<span class="player-dot" style="background: ${owner.color}; width: 6px; height: 6px;"></span>`
          : ""
      }
      <span>${dMeta.shortCode}</span>
    </span>`;
  }).join("");

  return `
    <div class="map-barbarian-hud">
      <div class="map-barbarian-hud__top">
        <span class="map-barbarian-hud__title">Fleet ${state.barbarianPosition}/${BARBARIAN_TRACK_STEPS}</span>
        <div style="display: inline-flex; align-items: center; gap: 4px;">
          ${personalRiskHtml}
          <span class="ga-chip ${
            isSafe ? "ga-chip--ok" : "ga-chip--danger"
          } ga-num" style="height: 19px; padding: 0 6px; font-size: 10.5px;" title="Total active knight strength (${defStrength}) vs total island cities (${barbStrength})">
            ⚔ ${defStrength} vs 🏰 ${barbStrength}
          </span>
        </div>
      </div>
      <div class="barb-track-bar" aria-hidden="true">${stepDots}</div>
      <div class="map-barbarian-hud__metros">
        <span class="t-label muted" style="font-size: 10.5px;">Metropolises</span>
        <div style="display: inline-flex; gap: 4px;">${metroPills}</div>
      </div>
    </div>
  `;
}

export function renderCatanMapDiceHudPure(state: CatanState): string {
  if (!state.lastRoll) {
    return `
        <div class="map-dice-hud">
          <div class="map-dice-hud__row">
            ${renderRollDiceButtonGraphicSvg(28)}
            <span class="t-label muted">Roll dice to produce</span>
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
      ? "7 rolled · robber dormant until 1st attack"
      : "7 rolled · robber active";
  const yieldsHtml = isSeven
    ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#ef4444", 18)} ${sevenLabel}</span>`
    : prodEntries.length > 0 || commEntries.length > 0 || rollStats.goldHexes > 0
      ? [
          ...prodEntries.map(
            (r) =>
              `<span class="map-yield-chip" title="${RESOURCE_META[r].label} hex produced">${renderMiniResourceCardSvg(r, 36, 23)}${
                (rollStats.producedByRes[r] ?? 0) > 1
                  ? ` ×${rollStats.producedByRes[r]}`
                  : ""
              }</span>`
          ),
          ...commEntries.map(
            (c) =>
              `<span class="map-yield-chip" title="${COMMODITY_META[c].label} commodity produced">${renderMiniTradeGoodCardSvg(c, 36, 23)}</span>`
          ),
          rollStats.goldHexes > 0
            ? `<span class="map-yield-chip">${renderActionPieceIconSvg("year_of_plenty", "#facc15", 18)} Gold ×${rollStats.goldHexes}</span>`
            : "",
        ]
          .filter(Boolean)
          .join("")
      : rollStats.blockedHexes > 0
        ? `<span class="map-yield-chip">${renderActionPieceIconSvg("robber", "#f87171", 16)} Blocked by robber</span>`
        : `<span class="t-label muted">No matching island hex</span>`;

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

export function renderMissingCostBadgePure(
  have: ResourceMap,
  cost: ResourceMap
): string {
  const missing = RESOURCES.flatMap((r) =>
    Array.from(
      { length: Math.max(0, (cost[r] ?? 0) - (have[r] ?? 0)) },
      () =>
        `<span class="cost-pip res-${r}" title="Need ${RESOURCE_META[r].label}">${renderResourceGlyphSvg(r, 11)}</span>`
    )
  );
  return `<span class="cost-pip-strip">${missing.join("")}</span>`;
}
