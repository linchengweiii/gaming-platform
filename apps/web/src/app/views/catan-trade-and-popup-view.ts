import {
  type CatanAction,
  type CatanState,
  RESOURCES,
  TRADE_GOODS,
  type TradeGoodType,
  getPlayerGoodCount,
  getPlayerResourceCount,
  hasResources,
  isCommodityType,
} from "@gaming-platform/catan";
import {
  DISCIPLINE_META,
  renderActionPieceIconSvg,
  renderMiniResourceCardSvg,
  renderMiniTradeGoodCardSvg,
  renderRollDiceButtonGraphicSvg,
} from "../../catan-graphics.ts";
import {
  type SupportedLocale,
  getCatanResourceTextLocalized,
  getCatanTradeGoodLabelLocalized,
  t,
} from "../../i18n/index.ts";
import { DRAWN_ARROW_SVG, escapeAttr } from "../helpers/html-and-dropdown.ts";
import { canControlPlayerOnDevicePure } from "../helpers/room-queries.ts";
import type { AppModel, ClientRoom } from "../types.ts";
import { hasTradeGoodsForOfferPure } from "./catan-hud-view.ts";

function renderTradeOfferChipPure(
  isCk: boolean,
  good: TradeGoodType,
  amount: number,
  sign: "+" | "−",
  locale: SupportedLocale,
  ownedCount?: number
): string {
  const cardSvg = isCk
    ? renderMiniTradeGoodCardSvg(good, 30, 19)
    : renderMiniResourceCardSvg(good as (typeof RESOURCES)[number], 32, 20);
  const label = isCk
    ? getCatanTradeGoodLabelLocalized(good, locale)
    : getCatanResourceTextLocalized(good as (typeof RESOURCES)[number], locale)
        .label;
  const haveBadge =
    ownedCount !== undefined
      ? ` <span class="ga-trade-offer-have ${ownedCount < amount ? "is-short" : ""} ga-num">${escapeAttr(
          t(locale, "catan.trade.haveCount", { count: ownedCount })
        )}</span>`
      : "";
  return `<span class="map-yield-chip" title="${escapeAttr(label)}">${sign}${amount} ${cardSvg}<span>${escapeAttr(label)}</span>${haveBadge}</span>`;
}

export function renderActiveTradeOfferCardPure(
  model: Readonly<AppModel>,
  room: ClientRoom,
  state: CatanState,
  actingPlayer: CatanState["players"][number],
  canManageMyTrade = false
): string {
  const locale = model.locale;
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
    ? t(locale, "catan.trade.responding", { name: actingPlayer.name })
    : acceptedPartners.length > 0
      ? pendingResponders.length > 0
        ? t(locale, "catan.trade.selectOrWait")
        : t(locale, "catan.trade.selectToComplete")
      : t(locale, "catan.trade.awaitingResponse");

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
                ? t(locale, "catan.trade.accepted")
                : didDecline
                  ? t(locale, "catan.trade.declined")
                  : t(locale, "catan.trade.respondingEllipsis");
              return `<span class="${chipCls}" style="display: inline-flex; align-items: center; gap: 5px;">
                <span class="player-dot" style="background: ${op.color}; width: 7px; height: 7px;"></span>
                ${escapeAttr(op.name)} · ${escapeAttr(stateText)}
              </span>`;
            })
            .join("")}
        </div>`
    : "";

  const isCk = Boolean(state.config.enableCitiesAndKnights);
  const goodsList: readonly TradeGoodType[] = isCk ? TRADE_GOODS : RESOURCES;
  const getOfferGiveAmt = (g: TradeGoodType): number =>
    isCommodityType(g) ? offer.giveCommodities?.[g] ?? 0 : offer.give[g] ?? 0;
  const getOfferWantAmt = (g: TradeGoodType): number =>
    isCommodityType(g) ? offer.wantCommodities?.[g] ?? 0 : offer.want[g] ?? 0;

  const giveEntries = goodsList
    .map((g) => ({ good: g, amount: getOfferGiveAmt(g) }))
    .filter((entry) => entry.amount > 0);
  const wantEntries = goodsList
    .map((g) => ({ good: g, amount: getOfferWantAmt(g) }))
    .filter((entry) => entry.amount > 0);

  const exchangeHtml = canRespond
    ? `
        <div class="ga-trade-offer-side ga-trade-offer-side--gain">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.trade.youGet"))}
          </span>
          ${giveEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(isCk, good, amount, "+", locale)
            )
            .join("")}
        </div>
        ${DRAWN_ARROW_SVG}
        <div class="ga-trade-offer-side ga-trade-offer-side--cost">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.trade.youGive"))}
          </span>
          ${wantEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(
                isCk,
                good,
                amount,
                "−",
                locale,
                getPlayerGoodCount(actingPlayer, good)
              )
            )
            .join("")}
        </div>
      `
    : canManage
      ? `
        <div class="ga-trade-offer-side ga-trade-offer-side--cost">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.trade.youGive"))}
          </span>
          ${giveEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(isCk, good, amount, "−", locale)
            )
            .join("")}
        </div>
        ${DRAWN_ARROW_SVG}
        <div class="ga-trade-offer-side ga-trade-offer-side--gain">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.trade.youGet"))}
          </span>
          ${wantEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(isCk, good, amount, "+", locale)
            )
            .join("")}
        </div>
      `
      : `
        <div class="ga-trade-offer-side ga-trade-offer-side--cost">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--give"></span>${escapeAttr(t(locale, "catan.trade.gives"))}
          </span>
          ${giveEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(isCk, good, amount, "+", locale)
            )
            .join("")}
        </div>
        ${DRAWN_ARROW_SVG}
        <div class="ga-trade-offer-side ga-trade-offer-side--gain">
          <span class="ga-trade-offer-side__label">
            <span class="ga-res-row-dot ga-res-row-dot--want"></span>${escapeAttr(t(locale, "catan.trade.wants"))}
          </span>
          ${wantEntries
            .map(({ good, amount }) =>
              renderTradeOfferChipPure(isCk, good, amount, "−", locale)
            )
            .join("")}
        </div>
      `;

  const canAffordOfferWant = isCk
    ? hasTradeGoodsForOfferPure(actingPlayer, offer)
    : hasResources(actingPlayer.resources, offer.want);

  return `
      <div class="ga-trade-head">
        <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px;">
          <span class="player-dot" style="background: ${fromP.color}"></span>
          <strong style="font-size: var(--t-small); font-weight: 500;">${escapeAttr(
            t(locale, "catan.trade.offerTitle", { name: fromP.name })
          )}</strong>
          ${responderChipsHtml}
        </div>
        <span class="t-label muted">${escapeAttr(statusLabel)}</span>
      </div>

      <div class="ga-trade-offer-bar">
        <div class="ga-trade-offer-exchange">
          ${exchangeHtml}
        </div>
        <div class="ga-trade-offer-actions">
          ${
            canRespond
              ? `
                <button type="button" data-decline-trade="${actingPlayer.id}" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "catan.trade.decline"))}</button>
                <button type="button" data-accept-trade="${actingPlayer.id}" class="btn btn--primary btn--sm action-btn-graphic" ${
                  !canAffordOfferWant ? "disabled" : ""
                }>${renderActionPieceIconSvg("domestic_trade", actingPlayer.color, 16)} <span>${escapeAttr(t(locale, "catan.trade.accept"))}</span></button>
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
                        <span>${escapeAttr(t(locale, "catan.trade.tradeWith", { name: partner.name }))}</span>
                      </button>
                    `
                  )
                  .join("")}
                <button type="button" id="btn-cancel-domestic" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "catan.trade.cancelOffer"))}</button>
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
  const locale = model.locale;

  if (state.phase === "PRE_ROLL") {
    const canKnight = legalActions.some((a) => a.type === "PLAY_KNIGHT");
    const alchemistCard = state.config.enableCitiesAndKnights
      ? actingPlayer.progressCards.find((c) => c.type === "alchemist")
      : undefined;
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <button type="button" id="btn-roll-dice" class="btn btn--primary btn-roll-graphic">
            <span class="roll-dice-btn-graphic" style="display: inline-flex; align-items: center;">${renderRollDiceButtonGraphicSvg(32)}</span>
            <span>${escapeAttr(t(locale, "catan.decision.rollDice"))}</span>
          </button>
          ${
            canKnight
              ? `<button type="button" id="btn-play-knight" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("knight", actingPlayer.color, 18)}
                   <span>${escapeAttr(t(locale, "catan.decision.playKnight"))}</span>
                 </button>`
              : ""
          }${
            alchemistCard
              ? `<button type="button" data-play-progress-card="${alchemistCard.id}" class="btn btn--secondary action-btn-graphic">
                   ${renderActionPieceIconSvg("progress_card", DISCIPLINE_META.science.accent, 18)}
                   <span>${escapeAttr(t(locale, "catan.decision.alchemist"))}</span>
                 </button>`
              : ""
          }
        </div>
      `;
  }

  if (state.phase === "STEAL_RESOURCE") {
    return `
        <div class="map-decision-popup map-decision-popup--compact">
          <span class="action-prompt"><strong>${escapeAttr(t(locale, "catan.decision.stealPrompt"))}</strong></span>
          ${state.stealCandidates
            .map((vId) => {
              const victim = state.players.find((p) => p.id === vId)!;
              return `<button type="button" data-steal-victim="${vId}" class="btn btn--primary btn--sm action-btn-graphic">
                <span class="player-dot" style="background: ${victim.color}"></span>
                <span>${escapeAttr(victim.name)} (${getPlayerResourceCount(victim)})</span>
              </button>`;
            })
            .join("")}
        </div>
      `;
  }

  return "";
}
