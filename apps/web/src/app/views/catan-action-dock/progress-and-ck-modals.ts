import {
  COMMODITIES,
  type CatanAction,
  type CatanState,
  IMPROVEMENT_DISCIPLINES,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  canPlayerUpgradeDiscipline,
  getLegalPromoteKnightVertices,
  getPlayerVulnerableCities,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  renderActionPieceIconSvg,
  renderCommodityGlyphSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
import {
  getCatanCommodityTextLocalized,
  getCatanDisciplineTextLocalized,
  getCatanProgressCardTextLocalized,
  getCatanResourceTextLocalized,
  getCatanTerrainLabelLocalized,
  getCatanTradeGoodLabelLocalized,
  t,
} from "../../../i18n/index.ts";
import { escapeAttr } from "../../helpers/html-and-dropdown.ts";
import type { AppModel } from "../../types.ts";
import { renderCkInteractionDockPure } from "./ck-interaction-modal.ts";

export function renderCkPhaseDockPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string | null {
  const interactionHtml = renderCkInteractionDockPure(
    model,
    state,
    actingPlayer
  );
  if (interactionHtml !== null) {
    return interactionHtml;
  }
  const locale = model.locale;
  const pColor = actingPlayer.color;

  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt">${t(
        locale,
        "catan.ck.raidResolving",
        { prefix: `<strong>${escapeAttr(t(locale, "catan.ck.raidPrefix"))}</strong>` }
      )}</span></div>`;
    }
    const vulnerableCities = getPlayerVulnerableCities(state, actingPlayer.id);
    return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.breachedHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.breachedPrefix", { name: actingPlayer.name }))}</strong>`,
            })}</span>
            <span class="ga-chip ga-chip--danger ga-num">${escapeAttr(
              t(locale, "catan.ck.vulnerableCount", {
                count: vulnerableCities.length,
              })
            )}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${vulnerableCities
              .map((vId, idx) => {
                const vNode = state.topology.vertices[vId];
                const adjRes = (vNode?.adjacentHexIds ?? [])
                  .map((hId) => {
                    const tile = state.hexes[hId];
                    const r = tile ? TERRAIN_TO_RESOURCE[tile.terrain] : null;
                    return r && tile?.numberToken
                      ? `${getCatanResourceTextLocalized(r, locale).label} #${tile.numberToken}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" · ");
                return `<button type="button" data-pillage-city="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("city", "#ef4444", 16)}
                  <span>${escapeAttr(t(locale, "catan.ck.cityNum", { num: idx + 1 }))}${adjRes ? ` (${escapeAttr(adjRes)})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", "#ef4444", 20)}
          <span class="action-prompt">${t(locale, "catan.ck.raidPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.raidPrefix"))}</strong>`,
          })}</span>
        </div>`;
  }

  if (state.phase === "PROGRESS_CARD_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt">${t(
        locale,
        "catan.ck.progressResolving",
        { prefix: `<strong>${escapeAttr(t(locale, "catan.ck.progressPrefix"))}</strong>` }
      )}</span></div>`;
    }
    const isDefenderPick = state.pendingDefenderDeckPicks.includes(
      actingPlayer.id
    );
    if (isDefenderPick) {
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt">${t(locale, "catan.ck.tiedDefenderHead", {
              prefix: `<strong>${escapeAttr(t(locale, "catan.ck.tiedDefenderPrefix", { name: actingPlayer.name }))}</strong>`,
            })}</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
            ${IMPROVEMENT_DISCIPLINES.map((disc) => {
              const dMeta = DISCIPLINE_META[disc];
              const dText = getCatanDisciplineTextLocalized(disc, locale);
              const left = state.progressDecks[disc].length;
              return `<button type="button" data-select-progress-deck="${disc}" class="btn btn--secondary btn--sm action-btn-graphic" style="justify-content: space-between;" ${
                left <= 0 ? "disabled" : ""
              }>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                  <span>${escapeAttr(dText.label)}</span>
                </span>
                <span class="ga-chip ga-num">${escapeAttr(t(locale, "catan.phase.leftCount", { rem: left }))}</span>
              </button>`;
            }).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt">${t(locale, "catan.ck.defenderPrompt", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.defenderPrefix"))}</strong>`,
          })}</span>
        </div>`;
    }

    return `
      <div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <span class="action-prompt">${t(locale, "catan.ck.handLimitHead", {
            prefix: `<strong>${escapeAttr(t(locale, "catan.ck.handLimitPrefix", { name: actingPlayer.name }))}</strong>`,
          })}</span>
          <span class="ga-chip ga-chip--warn ga-num">${escapeAttr(
            t(locale, "catan.ck.heldOf4", {
              count: actingPlayer.progressCards.length,
            })
          )}</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${actingPlayer.progressCards
            .map((card) => {
              const cat = getCatanProgressCardTextLocalized(card.type, locale);
              const dMeta = DISCIPLINE_META[card.discipline];
              return `<button type="button" data-discard-progress-card="${card.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                <span>${escapeAttr(t(locale, "catan.ck.discardCardBtn", { title: cat.title }))}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="action-buttons">
        ${renderActionPieceIconSvg("progress_card", pColor, 20)}
        <span class="action-prompt">${t(locale, "catan.ck.handLimitPrompt", {
          prefix: `<strong>${escapeAttr(t(locale, "catan.ck.handLimitShortPrefix"))}</strong>`,
        })}</span>
      </div>`;
  }

  return null;
}

export function renderCityUpgradesSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  const locale = model.locale;
  return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 18)}
            <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(
              t(locale, "catan.ck.cityImprovementsTitle")
            )}${
              actingPlayer.activeTurnDiscounts.crane
                ? escapeAttr(t(locale, "catan.ck.craneDiscountSuffix"))
                : ""
            }</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
        </div>
        <div class="ck-upgrades-grid">
          ${IMPROVEMENT_DISCIPLINES.map((disc) => {
            const dMeta = DISCIPLINE_META[disc];
            const dText = getCatanDisciplineTextLocalized(disc, locale);
            const cur = actingPlayer.cityImprovements[disc];
            const check = canPlayerUpgradeDiscipline(state, actingPlayer, disc);
            const perkLabel =
              disc === "trade"
                ? t(locale, "catan.ck.perkTrade")
                : disc === "politics"
                  ? t(locale, "catan.ck.perkPolitics")
                  : t(locale, "catan.ck.perkScience");
            const metro = state.metropolises[disc];
            const metroHolder = metro.ownerId
              ? state.players.find((p) => p.id === metro.ownerId)?.name
              : null;
            const metroHint = metroHolder
              ? metro.ownerId === actingPlayer.id
                ? t(locale, "catan.ck.youHoldMetro", { lv: metro.level })
                : metro.level < 5
                  ? t(locale, "catan.ck.heldBySnipe", {
                      name: metroHolder,
                      nextLv: metro.level + 1,
                    })
                  : t(locale, "catan.ck.lockedByLv5", { name: metroHolder })
              : t(locale, "catan.ck.unclaimedMetroLv4");
            const selectedMetroVId =
              model.selectedMetropolisVertexId &&
              check.eligibleMetropolisVertices.includes(
                model.selectedMetropolisVertexId
              )
                ? model.selectedMetropolisVertexId
                : check.eligibleMetropolisVertices[0] ?? null;

            return `<div class="ck-upgrade-col" style="--disc-accent: ${dMeta.accent}; --disc-border: ${dMeta.border};">
              <div class="ck-upgrade-col__top">
                <strong style="color: ${dMeta.accent}; font-size: 12px;">${escapeAttr(dText.label)}</strong>
                <span class="ga-chip ga-num">Lv ${cur}/5</span>
              </div>
              <div class="ck-upgrade-col__perk ${cur >= 3 ? "is-unlocked" : ""}">
                <div>${escapeAttr(perkLabel)}</div>
                <div class="muted" style="font-size: 10.5px; margin-top: 2px;">${escapeAttr(metroHint)}</div>
              </div>
              ${
                check.claimsMetropolis &&
                check.eligibleMetropolisVertices.length > 1
                  ? `<div style="display: flex; gap: 4px; flex-wrap: wrap;">
                      ${check.eligibleMetropolisVertices
                        .map(
                          (vId, idx) =>
                            `<button type="button" data-select-metro-city="${vId}" class="ga-chip ${
                              selectedMetroVId === vId ? "ga-chip--warn" : ""
                            }" style="cursor: pointer;">${escapeAttr(t(locale, "catan.ck.cityNum", { num: idx + 1 }))}</button>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="ck-upgrade-col__foot">
                ${
                  cur >= 5
                    ? `<span class="ga-chip ga-chip--ok" style="width: 100%; justify-content: center;">${escapeAttr(t(locale, "catan.ck.maxLevel5"))}</span>`
                    : `<span class="t-label ga-num" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${renderCommodityGlyphSvg(check.costCommodity, 13)}
                        ${actingPlayer.commodities[check.costCommodity]}/${check.costAmount}
                      </span>
                      <button type="button" data-upgrade-discipline="${disc}" data-metro-vertex="${selectedMetroVId ?? ""}" class="btn btn--primary btn--sm" ${
                        !check.allowed ? "disabled" : ""
                      }>
                        ${escapeAttr(
                          check.claimsMetropolis
                            ? t(locale, "catan.ck.crownLv", { lv: check.nextLevel })
                            : t(locale, "catan.lvN", { lv: check.nextLevel })
                        )}
                      </button>`
                }
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
}

export function renderProgressCardSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  legalActions: readonly CatanAction[]
): string {
  const locale = model.locale;
  const card = actingPlayer.progressCards.find(
    (c) => c.id === model.selectedProgressCardId
  );
  if (!card) return "";
  const cat = getCatanProgressCardTextLocalized(card.type, locale);
  const dMeta = DISCIPLINE_META[card.discipline];
  const matchingActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
      a.type === "PLAY_PROGRESS_CARD" && a.cardId === card.id
  );

  const controlsHtml = ((): string => {
    if (card.type === "resource_monopoly") {
      const availRes = RESOURCES.filter((r) =>
        matchingActions.some((a) => a.params?.resource === r)
      );
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${availRes
                .map(
                  (r) =>
                    `<button type="button" data-prog-res="${r}" class="btn btn--secondary btn--sm action-btn-graphic">
                      ${renderMiniResourceCardSvg(r, 32, 20)}
                      <span>${escapeAttr(getCatanResourceTextLocalized(r, locale).label)}</span>
                    </button>`
                )
                .join("")}
            </div>`;
    }
    if (card.type === "trade_monopoly") {
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${COMMODITIES.map(
                (c) =>
                  `<button type="button" data-prog-comm="${c}" class="btn btn--secondary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(c, 32, 20)}
                    <span>${escapeAttr(getCatanCommodityTextLocalized(c, locale).label)}</span>
                  </button>`
              ).join("")}
            </div>`;
    }
    if (card.type === "merchant_fleet") {
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${TRADE_GOODS.map(
                (g) =>
                  `<button type="button" data-prog-good="${g}" class="btn btn--secondary btn--sm action-btn-graphic">
                    ${renderMiniTradeGoodCardSvg(g, 30, 19)}
                    <span>2:1 ${escapeAttr(getCatanTradeGoodLabelLocalized(g, locale))}</span>
                  </button>`
              ).join("")}
            </div>`;
    }
    if (
      card.type === "spy" ||
      card.type === "master_merchant" ||
      card.type === "deserter"
    ) {
      const opps = state.players.filter((opp) =>
        matchingActions.some((a) => a.params?.targetPlayerId === opp.id)
      );
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${opps
                .map(
                  (opp) =>
                    `<button type="button" data-prog-opp="${opp.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                      <span class="player-dot" style="background: ${opp.color}"></span>
                      <span>${escapeAttr(t(locale, "catan.ck.targetOpp", { name: opp.name }))}</span>
                    </button>`
                )
                .join("")}
            </div>`;
    }
    if (card.type === "inventor") {
      return `<div class="t-small muted">
              ${
                model.inventorHex1
                  ? t(locale, "catan.ck.inventorFirstSelected", {
                      token: `<strong>#${state.hexes[model.inventorHex1]?.numberToken}</strong>`,
                    })
                  : escapeAttr(t(locale, "catan.ck.inventorPrompt"))
              }
            </div>`;
    }
    if (card.type === "smith") {
      const promotable = getLegalPromoteKnightVertices(
        state,
        actingPlayer.id,
        false
      );
      return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              <span class="t-small muted">${escapeAttr(
                model.smithVertex1
                  ? t(locale, "catan.ck.smithFirstSelected")
                  : t(locale, "catan.ck.smithPrompt")
              )}</span>
              ${
                model.smithVertex1 || promotable.length === 1
                  ? `<button type="button" id="btn-exec-smith-single" class="btn btn--primary btn--sm">${escapeAttr(t(locale, "catan.ck.promoteSelectedKnight"))}</button>`
                  : ""
              }
            </div>`;
    }
    return `<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            <span class="t-small muted">${escapeAttr(t(locale, "catan.ck.pickHighlightedOrBelow"))}</span>
            ${matchingActions
              .slice(0, 6)
              .map((act, idx) => {
                const hexTile = act.params?.hexId
                  ? state.hexes[act.params.hexId]
                  : undefined;
                const label = act.params?.hexId
                  ? `${hexTile ? (locale === "en" ? hexTile.terrain : getCatanTerrainLabelLocalized(hexTile.terrain, locale)) : "Hex"} #${hexTile?.numberToken ?? ""}`
                  : act.params?.vertexId
                    ? t(locale, "catan.ck.spotNum", { num: idx + 1 })
                    : act.params?.edgeId
                      ? t(locale, "catan.ck.roadNum", { num: idx + 1 })
                      : t(locale, "catan.ck.optionNum", { num: idx + 1 });
                return `<button type="button" data-prog-action-idx="${idx}" class="btn btn--secondary btn--sm">${escapeAttr(label.trim())}</button>`;
              })
              .join("")}
          </div>`;
  })();

  return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <div style="display: inline-flex; align-items: center; gap: 7px;">
              ${renderActionPieceIconSvg("progress_card", dMeta.accent, 18)}
              <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(cat.title)} — ${escapeAttr(cat.description)}</strong>
            </div>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.close"))}</button>
          </div>
          ${controlsHtml}
        </div>`;
}
