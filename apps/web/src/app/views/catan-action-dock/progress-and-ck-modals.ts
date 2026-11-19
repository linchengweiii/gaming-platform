import {
  COMMODITIES,
  type CatanAction,
  type CatanState,
  IMPROVEMENT_DISCIPLINES,
  PROGRESS_CARD_CATALOG,
  RESOURCES,
  TERRAIN_TO_RESOURCE,
  TRADE_GOODS,
  canPlayerUpgradeDiscipline,
  getLegalPromoteKnightVertices,
  getPlayerVulnerableCities,
} from "@gaming-platform/catan";
import {
  COMMODITY_META,
  DISCIPLINE_META,
  RESOURCE_META,
  TRADE_GOOD_META,
  renderActionPieceIconSvg,
  renderCommodityGlyphSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
} from "../../../catan-graphics.ts";
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
  const pColor = actingPlayer.color;

  if (state.phase === "BARBARIAN_PILLAGE_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Barbarian raid:</strong> Resolving city downgrade...</span></div>`;
    }
    const vulnerableCities = getPlayerVulnerableCities(state, actingPlayer.id);
    return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Barbarians breached Catan · ${escapeAttr(actingPlayer.name)}:</strong> Choose 1 city to downgrade to a settlement</span>
            <span class="ga-chip ga-chip--danger ga-num">${vulnerableCities.length} vulnerable</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${vulnerableCities
              .map((vId, idx) => {
                const vNode = state.topology.vertices[vId];
                const adjRes = (vNode?.adjacentHexIds ?? [])
                  .map((hId) => {
                    const t = state.hexes[hId];
                    const r = t ? TERRAIN_TO_RESOURCE[t.terrain] : null;
                    return r && t?.numberToken
                      ? `${RESOURCE_META[r].label} #${t.numberToken}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" · ");
                return `<button type="button" data-pillage-city="${vId}" class="btn btn--secondary btn--sm action-btn-graphic">
                  ${renderActionPieceIconSvg("city", "#ef4444", 16)}
                  <span>City #${idx + 1}${adjRes ? ` (${adjRes})` : ""}</span>
                </button>`;
              })
              .join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("robber", "#ef4444", 20)}
          <span class="action-prompt"><strong>Barbarian raid:</strong> Click a pulsing city on the map or pick below.</span>
        </div>`;
  }

  if (state.phase === "PROGRESS_CARD_SELECTION") {
    if (model.autoPlayBots) {
      return `<div class="action-buttons"><span class="action-prompt"><strong>Progress cards:</strong> Resolving selection...</span></div>`;
    }
    const isDefenderPick = state.pendingDefenderDeckPicks.includes(
      actingPlayer.id
    );
    if (isDefenderPick) {
      return `
        <div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <span class="action-prompt"><strong>Tied Defender of Catan · ${escapeAttr(actingPlayer.name)}:</strong> Draw 1 free Progress Card</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;">
            ${IMPROVEMENT_DISCIPLINES.map((disc) => {
              const dMeta = DISCIPLINE_META[disc];
              const left = state.progressDecks[disc].length;
              return `<button type="button" data-select-progress-deck="${disc}" class="btn btn--secondary btn--sm action-btn-graphic" style="justify-content: space-between;" ${
                left <= 0 ? "disabled" : ""
              }>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                  <span>${dMeta.label}</span>
                </span>
                <span class="ga-chip ga-num">${left} left</span>
              </button>`;
            }).join("")}
          </div>
        </div>
        <div class="action-buttons">
          ${renderActionPieceIconSvg("progress_card", pColor, 20)}
          <span class="action-prompt"><strong>Defender reward:</strong> Choose Trade, Politics, or Science deck below.</span>
        </div>`;
    }

    return `
      <div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <span class="action-prompt"><strong>Progress hand limit (max 4) · ${escapeAttr(actingPlayer.name)}:</strong> Discard 1 Progress Card</span>
          <span class="ga-chip ga-chip--warn ga-num">${actingPlayer.progressCards.length}/4 held</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${actingPlayer.progressCards
            .map((card) => {
              const cat = PROGRESS_CARD_CATALOG[card.type];
              const dMeta = DISCIPLINE_META[card.discipline];
              return `<button type="button" data-discard-progress-card="${card.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                ${renderActionPieceIconSvg("progress_card", dMeta.accent, 16)}
                <span>Discard ${cat.title}</span>
              </button>`;
            })
            .join("")}
        </div>
      </div>
      <div class="action-buttons">
        ${renderActionPieceIconSvg("progress_card", pColor, 20)}
        <span class="action-prompt"><strong>Hand limit:</strong> Choose 1 Progress Card to return to the bottom of its deck.</span>
      </div>`;
  }

  return null;
}

export function renderCityUpgradesSubModalPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number]
): string {
  return `<div class="sub-modal sub-modal--trade">
        <div class="ga-trade-head">
          <div style="display: inline-flex; align-items: center; gap: 7px;">
            ${renderActionPieceIconSvg("city_upgrade", "#fbbf24", 18)}
            <strong style="font-size: var(--t-small); font-weight: 500;">City improvements${
              actingPlayer.activeTurnDiscounts.crane
                ? " · Crane discount (−1 commodity)"
                : ""
            }</strong>
          </div>
          <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
        </div>
        <div class="ck-upgrades-grid">
          ${IMPROVEMENT_DISCIPLINES.map((disc) => {
            const dMeta = DISCIPLINE_META[disc];
            const cur = actingPlayer.cityImprovements[disc];
            const check = canPlayerUpgradeDiscipline(state, actingPlayer, disc);
            const perkLabel =
              disc === "trade"
                ? "Lv 3 Trading House: 2:1 all commodities"
                : disc === "politics"
                  ? "Lv 3 Fortress: promote Lv 3 Mighty Knights"
                  : "Lv 3 Aqueduct: +1 free card on dry non-7 roll";
            const metro = state.metropolises[disc];
            const metroHolder = metro.ownerId
              ? state.players.find((p) => p.id === metro.ownerId)?.name
              : null;
            const metroHint = metroHolder
              ? metro.ownerId === actingPlayer.id
                ? `You hold Metropolis (Lv ${metro.level})`
                : metro.level < 5
                  ? `Held by ${escapeAttr(metroHolder)} (snipe at Lv ${metro.level + 1})`
                  : `Locked by ${escapeAttr(metroHolder)} (Lv 5)`
              : "Unclaimed +2 VP Metropolis at Lv 4";
            const selectedMetroVId =
              model.selectedMetropolisVertexId &&
              check.eligibleMetropolisVertices.includes(
                model.selectedMetropolisVertexId
              )
                ? model.selectedMetropolisVertexId
                : check.eligibleMetropolisVertices[0] ?? null;

            return `<div class="ck-upgrade-col" style="--disc-accent: ${dMeta.accent}; --disc-border: ${dMeta.border};">
              <div class="ck-upgrade-col__top">
                <strong style="color: ${dMeta.accent}; font-size: 12px;">${dMeta.label}</strong>
                <span class="ga-chip ga-num">Lv ${cur}/5</span>
              </div>
              <div class="ck-upgrade-col__perk ${cur >= 3 ? "is-unlocked" : ""}">
                <div>${perkLabel}</div>
                <div class="muted" style="font-size: 10.5px; margin-top: 2px;">${metroHint}</div>
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
                            }" style="cursor: pointer;">City #${idx + 1}</button>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
              <div class="ck-upgrade-col__foot">
                ${
                  cur >= 5
                    ? `<span class="ga-chip ga-chip--ok" style="width: 100%; justify-content: center;">Max level 5</span>`
                    : `<span class="t-label ga-num" style="display: inline-flex; align-items: center; gap: 4px;">
                        ${renderCommodityGlyphSvg(check.costCommodity, 13)}
                        ${actingPlayer.commodities[check.costCommodity]}/${check.costAmount}
                      </span>
                      <button type="button" data-upgrade-discipline="${disc}" data-metro-vertex="${selectedMetroVId ?? ""}" class="btn btn--primary btn--sm" ${
                        !check.allowed ? "disabled" : ""
                      }>
                        ${
                          check.claimsMetropolis
                            ? `Crown Lv ${check.nextLevel}`
                            : `Lv ${check.nextLevel}`
                        }
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
  const card = actingPlayer.progressCards.find(
    (c) => c.id === model.selectedProgressCardId
  );
  if (!card) return "";
  const cat = PROGRESS_CARD_CATALOG[card.type];
  const dMeta = DISCIPLINE_META[card.discipline];
  const matchingActions = legalActions.filter(
    (a): a is Extract<CatanAction, { type: "PLAY_PROGRESS_CARD" }> =>
      a.type === "PLAY_PROGRESS_CARD" && a.cardId === card.id
  );

  const controlsHtml = ((): string => {
    if (
      card.type === "resource_monopoly" ||
      card.type === "commercial_harbor"
    ) {
      const availRes = RESOURCES.filter((r) =>
        matchingActions.some((a) => a.params?.resource === r)
      );
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${availRes
                .map(
                  (r) =>
                    `<button type="button" data-prog-res="${r}" class="btn btn--secondary btn--sm action-btn-graphic">
                      ${renderMiniResourceCardSvg(r, 32, 20)}
                      <span>${RESOURCE_META[r].label}</span>
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
                    <span>${COMMODITY_META[c].label}</span>
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
                    <span>2:1 ${TRADE_GOOD_META[g].label}</span>
                  </button>`
              ).join("")}
            </div>`;
    }
    if (
      card.type === "spy" ||
      card.type === "master_merchant" ||
      card.type === "deserter"
    ) {
      if (card.type === "deserter" && model.deserterTargetPlayerId) {
        const targetOpp = state.players.find(
          (o) => o.id === model.deserterTargetPlayerId
        );
        return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
                <span class="t-small muted">Target <strong>${escapeAttr(targetOpp?.name ?? "opponent")}</strong> selected — click any highlighted open intersection on your road network to place the deserted knight:</span>
                <button type="button" data-deserter-reset="true" class="btn btn--secondary btn--sm">Change target</button>
              </div>`;
      }
      const opps = state.players.filter((opp) =>
        matchingActions.some((a) => a.params?.targetPlayerId === opp.id)
      );
      return `<div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${opps
                .map(
                  (opp) =>
                    `<button type="button" data-prog-opp="${opp.id}" class="btn btn--secondary btn--sm action-btn-graphic">
                      <span class="player-dot" style="background: ${opp.color}"></span>
                      <span>Target ${escapeAttr(opp.name)}</span>
                    </button>`
                )
                .join("")}
            </div>`;
    }
    if (card.type === "inventor") {
      return `<div class="t-small muted">
              ${
                model.inventorHex1
                  ? `1st tile selected (<strong>#${state.hexes[model.inventorHex1]?.numberToken}</strong>) — now click a 2nd highlighted tile on the map to swap numbers.`
                  : "Click any 2 highlighted number tiles on the map above (excluding 2, 6, 8, 12) to swap their tokens."
              }
            </div>`;
    }
    if (card.type === "smith") {
      const promotable = getLegalPromoteKnightVertices(
        state,
        actingPlayer.id,
        true
      );
      return `<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
              <span class="t-small muted">${
                model.smithVertex1
                  ? "1st knight selected — click a 2nd knight on the map or confirm 1 promotion:"
                  : "Click up to 2 highlighted knights on the map to promote for free."
              }</span>
              ${
                model.smithVertex1 || promotable.length === 1
                  ? `<button type="button" id="btn-exec-smith-single" class="btn btn--primary btn--sm">Promote selected knight</button>`
                  : ""
              }
            </div>`;
    }
    return `<div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            <span class="t-small muted">Click a highlighted target on the map above, or choose directly:</span>
            ${matchingActions
              .slice(0, 6)
              .map((act, idx) => {
                const label = act.params?.hexId
                  ? `${state.hexes[act.params.hexId]?.terrain ?? "Hex"} #${state.hexes[act.params.hexId]?.numberToken ?? ""}`
                  : act.params?.vertexId
                    ? `Spot #${idx + 1}`
                    : act.params?.edgeId
                      ? `Road #${idx + 1}`
                      : `Option #${idx + 1}`;
                return `<button type="button" data-prog-action-idx="${idx}" class="btn btn--secondary btn--sm">${escapeAttr(label.trim())}</button>`;
              })
              .join("")}
          </div>`;
  })();

  return `<div class="sub-modal sub-modal--trade">
          <div class="ga-trade-head">
            <div style="display: inline-flex; align-items: center; gap: 7px;">
              ${renderActionPieceIconSvg("progress_card", dMeta.accent, 18)}
              <strong style="font-size: var(--t-small); font-weight: 500;">${cat.title} — ${escapeAttr(cat.description)}</strong>
            </div>
            <button type="button" data-close-submodal="true" class="btn btn--secondary btn--sm">Close</button>
          </div>
          ${controlsHtml}
        </div>`;
}
