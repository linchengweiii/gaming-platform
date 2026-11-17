import {
  type CatanAction,
  type CatanState,
  RESOURCES,
  TRADE_GOODS,
  getPlayerResourceCount,
  hasResources,
  isCommodityType,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  renderActionPieceIconSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../catan-graphics.ts";
import { escapeAttr } from "../helpers/html-and-dropdown.ts";
import { canControlPlayerOnDevicePure } from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom } from "../types.ts";
import {
  hasTradeGoodsForOfferPure,
  renderResourceColumnHeadersPure,
  renderTradeGoodColumnHeadersPure,
} from "./catan-hud-view.ts";

export function renderActiveTradeOfferCardPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  canManageMyTrade = false
): string {
  const offer = state.activeTradeOffer!;
  const fromP = state.players.find((p) => p.id === offer.fromPlayerId)!;
  const isResponder = actingPlayer.id !== offer.fromPlayerId;
  const canRespond =
    isResponder &&
    (!actingPlayer.isBot || room.allBots) &&
    canControlPlayerOnDevicePure(model, room, actingPlayer.id);
  const canManage = !canRespond && canManageMyTrade;
  const acceptedIds = offer.acceptedBy ?? [];
  const acceptedPartners = acceptedIds
    .map((pid) => state.players.find((p) => p.id === pid))
    .filter((p): p is CatanState["players"][number] => Boolean(p));
  const targetedOpponents = state.players.filter(
    (p) =>
      p.id !== offer.fromPlayerId &&
      (offer.toPlayerId === null || offer.toPlayerId === p.id)
  );
  const pendingResponders = targetedOpponents.filter(
    (p) => !acceptedIds.includes(p.id) && !offer.declinedBy.includes(p.id)
  );

  const statusLabel = canRespond
    ? `${escapeAttr(actingPlayer.name)} responding`
    : acceptedPartners.length > 0
      ? pendingResponders.length > 0
        ? "Select partner now or wait for others"
        : "Select partner to complete trade"
      : "Awaiting player response";

  const responderChipsHtml = canManage
    ? `<div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 5px;">
          ${targetedOpponents
            .map((op) => {
              const didAccept = acceptedIds.includes(op.id);
              const didDecline = offer.declinedBy.includes(op.id);
              const chipCls = didAccept
                ? "ga-chip ga-chip--ok"
                : didDecline
                  ? "ga-chip"
                  : "ga-chip ga-chip--warn";
              const stateText = didAccept
                ? "Accepted"
                : didDecline
                  ? "Declined"
                  : "Responding...";
              return `<span class="${chipCls}" style="display: inline-flex; align-items: center; gap: 5px;">
                <span class="player-dot" style="background: ${op.color}; width: 7px; height: 7px;"></span>
                ${escapeAttr(op.name)} · ${stateText}
              </span>`;
            })
            .join("")}
        </div>`
    : "";

  const tradeOfferMatrixHtml = state.config.enableCitiesAndKnights
    ? `<div class="ga-res-matrix ga-res-matrix--ck">
        ${renderTradeGoodColumnHeadersPure(
          canRespond ? actingPlayer : canManage ? fromP : undefined
        )}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--give"></span>Gives
        </div>
        ${TRADE_GOODS.map((g) => {
          const amt = isCommodityType(g)
            ? offer.giveCommodities?.[g] ?? 0
            : offer.give[g] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-give" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `+${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--want"></span>Wants
        </div>
        ${TRADE_GOODS.map((g) => {
          const amt = isCommodityType(g)
            ? offer.wantCommodities?.[g] ?? 0
            : offer.want[g] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-want" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `−${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}
      </div>`
    : `<div class="ga-res-matrix">
        ${renderResourceColumnHeadersPure(
          canRespond
            ? actingPlayer.resources
            : canManage
              ? fromP.resources
              : undefined
        )}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--give"></span>Gives
        </div>
        ${RESOURCES.map((r) => {
          const amt = offer.give[r] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-give" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `+${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}

        <div class="ga-res-matrix__row-label">
          <span class="ga-res-row-dot ga-res-row-dot--want"></span>Wants
        </div>
        ${RESOURCES.map((r) => {
          const amt = offer.want[r] ?? 0;
          return `
            <div class="ga-res-cell ${amt > 0 ? "ga-res-cell--active-want" : ""}" style="justify-content: center;">
              <span class="ga-res-step-val">${amt > 0 ? `−${amt}` : "—"}</span>
            </div>
          `;
        }).join("")}
      </div>`;

  const canAffordOfferWant = state.config.enableCitiesAndKnights
    ? hasTradeGoodsForOfferPure(actingPlayer, offer)
    : hasResources(actingPlayer.resources, offer.want);

  return `
      <div class="ga-trade-head">
        <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${fromP.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(fromP.name)} trade offer</strong>
          ${responderChipsHtml}
        </div>
        <span class="t-label muted">${statusLabel}</span>
      </div>

      ${tradeOfferMatrixHtml}

      <div class="ga-trade-preview">
        <span class="t-label muted">Inspect the map above while deciding on this trade</span>
        <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto;">
          ${
            canRespond
              ? `
                <button type="button" data-decline-trade="${actingPlayer.id}" class="btn btn--secondary btn--sm">Decline</button>
                <button type="button" data-accept-trade="${actingPlayer.id}" class="btn btn--primary btn--sm action-btn-graphic" ${
                  !canAffordOfferWant
                    ? "disabled"
                    : ""
                }>${renderActionPieceIconSvg("domestic_trade", actingPlayer.color, 16)} <span>Accept</span></button>
              `
              : ""
          }
          ${
            canManage
              ? `
                ${acceptedPartners
                  .map(
                    (partner) => `
                      <button type="button" data-confirm-trade="${escapeAttr(partner.id)}" class="btn btn--primary btn--sm action-btn-graphic">
                        <span class="player-dot" style="background: ${partner.color}"></span>
                        <span>Trade with ${escapeAttr(partner.name)}</span>
                      </button>
                    `
                  )
                  .join("")}
                <button type="button" id="btn-cancel-domestic" class="btn btn--secondary btn--sm">Cancel offer</button>
              `
              : ""
          }
        </div>
      </div>
    `;
}

export function renderCatanMapDecisionPopupPure(
  model: Readonly<AppModel>,
  state: CatanState,
  actingPlayer: CatanState["players"][number] | null,
  legalActions: readonly CatanAction[]
): string {
  if (!actingPlayer || state.phase === "GAME_OVER" || model.autoPlayBots) {
    return "";
  }

  if (state.phase === "PRE_ROLL") {
    const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
    const alchemistCard = state.config.enableCitiesAndKnights
      ? actingPlayer.progressCards.find((c) => c.type === "alchemist")
      : undefined;
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn-roll-graphic">
            <span class="roll-dice-btn-graphic" style="display: inline-flex; align-items: center;">${renderRollDiceButtonGraphicSvg(32)}</span>
            <span>Roll dice</span>
          </button>
          ${
            canKnight
              ? `<button type="button" id="btn-play-knight" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("knight", actingPlayer.color, 18)}
                   <span>Play knight</span>
                 </button>`
              : ""
          }${
            alchemistCard
              ? `<button type="button" data-play-progress-card="${alchemistCard.id}" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("progress_card", DISCIPLINE_META.science.accent, 18)}
                   <span>Alchemist</span>
                 </button>`
              : ""
          }
        </div>
      `;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <span class="action-prompt"><strong>Steal 1 card:</strong></span>
          ${state.stealCandidates
            .map((vId) => {
              const victim = state.players.find((p) => p.id === vId)!;
              return `<button type="button" data-steal-victim="${vId}" class="btn btn--primary btn--sm action-btn-graphic">
                <span class="player-dot" style="background: ${victim.color}"></span>
                <span>${victim.name} (${getPlayerResourceCount(victim)})</span>
              </button>`;
            })
            .join("")}
        </div>
      `;
  }

  return "";
}
