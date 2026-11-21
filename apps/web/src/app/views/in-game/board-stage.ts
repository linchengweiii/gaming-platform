import { CatanEngine, type CatanState } from "@gaming-platform/catan";
import type { SplendorState } from "@gaming-platform/splendor";
import type { AzulState } from "@gaming-platform/azul";
import {
  type SevenWondersState,
  canPlayerUnselectDraftPick,
} from "@gaming-platform/seven-wonders";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
  renderDieSvg,
  renderEventDieSvg,
} from "../../../catan-graphics.ts";
import { t } from "../../../i18n/index.ts";
import {
  renderSplendorActionDock,
  renderSplendorBoardView,
} from "../../../splendor-view.ts";
import {
  renderAzulActionDock,
  renderAzulBoardView,
} from "../../../azul-view.ts";
import {
  renderSevenWondersActionDock,
  renderSevenWondersBoardView,
} from "../../../seven-wonders-view.ts";
import {
  escapeAttr,
  formatPhaseLabel,
} from "../../helpers/html-and-dropdown.ts";
import type { ClientRoom } from "../../types.ts";
import { renderCatanMapBuildAndEndTurnHudPure } from "../catan-action-dock/dock-buttons.ts";
import { renderCatanActionDockPure } from "../catan-action-dock/index.ts";
import {
  renderCatanBarbarianHudPure,
  renderCatanMapDiceHudPure,
  renderCatanMapZoomControlsPure,
} from "../catan-hud-view.ts";
import { renderCatanSpotPopoverPure } from "../catan-spot-popover-view.ts";
import { renderActiveTradeOfferCardPure } from "../catan-trade-and-popup-view.ts";
import {
  extractBotMoveFeedPure,
  renderBotBannerControlsPure,
  renderBotMoveFeedBarPure,
} from "./bot-move-feed.ts";
import { renderFullscreenBannerControlsPure } from "./fullscreen-controls.ts";
import type { InGameComputedContext } from "./view-state.ts";

export function renderInGameBoardStagePure(
  room: ClientRoom,
  ctx: InGameComputedContext
): string {
  const {
    usesServer,
    actingPlayerId,
    isMyTurn,
    controllableHumansCount,
    effectiveViewerId,
    state,
    model,
    actingPlayer,
    invariantCheck,
    mySeatedPlayer,
    handPlayer,
    localDeviceGuestForTurn,
    canCancelMyTrade,
    isOwner,
    undoableSteps,
    canUndo,
    canRedo,
    catanLegalActions,
    boardActingPlayerId,
    ckBoardOptions,
    sevenWondersLegalActions,
    catanDecisionPopupHtml,
    tutorialCoachHtml,
  } = ctx;

  const locale = model.locale;
  const bannerPhaseLabel =
    room.gameId === "catan" &&
    state.phase === "SETUP_SETTLEMENT_2" &&
    (state as CatanState).config.enableCitiesAndKnights
      ? t(locale, "inGame.setupCity2")
      : formatPhaseLabel(state.phase, locale);

  const actingTag = actingPlayer
    ? mySeatedPlayer && actingPlayer.id === mySeatedPlayer.id
      ? actingPlayer.name.includes("(You)")
        ? ""
        : t(locale, "inGame.tagYou")
      : isMyTurn && !actingPlayer.isBot
        ? actingPlayer.name.includes("(Local)")
          ? ""
          : t(locale, "inGame.tagLocal")
        : ""
    : "";

  const botMoveFeed = extractBotMoveFeedPure(room.gameId, state);
  const canAdjustRoomPace = !usesServer || isOwner || Boolean(mySeatedPlayer);
  const botBannerControlsHtml = renderBotBannerControlsPure(
    model,
    room,
    botMoveFeed.hasBots,
    canAdjustRoomPace
  );
  const botMoveFeedBarHtml = renderBotMoveFeedBarPure(
    model,
    room,
    state,
    actingPlayer,
    botMoveFeed
  );

  return `          <div class="board-container ${
            room.gameId !== "catan" ? "board-container--neutral" : ""
          }">
            <div class="board-banner">
              <div class="board-banner__status" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                ${
                  actingPlayer
                    ? `<span class="player-dot" style="background: ${actingPlayer.color}"></span>
                       <strong style="font-weight: 500;">${escapeAttr(
                         t(locale, "inGame.activeTurn", {
                           name: actingPlayer.name,
                           tag: actingTag,
                         })
                       )}</strong>`
                    : `<strong style="font-weight: 500;">${escapeAttr(t(locale, "inGame.matchComplete"))}</strong>`
                }
                <span class="ga-chip">${escapeAttr(bannerPhaseLabel)}</span>
                ${
                  room.gameId === "catan"
                    ? state.lastRoll
                      ? `<span style="display: inline-flex; align-items: center; gap: 5px;">
                          ${renderDieSvg(state.lastRoll.die1, 22)}
                          ${renderDieSvg(state.lastRoll.die2, 22)}${
                            state.config.enableCitiesAndKnights &&
                            state.lastRoll.eventFace
                              ? `\n                          ${renderEventDieSvg(state.lastRoll.eventFace, 22)}`
                              : ""
                          }
                          <span class="ga-chip ga-chip--warn ga-num">${escapeAttr(
                            t(locale, "inGame.rollTotal", {
                              total: state.lastRoll.total,
                            })
                          )}</span>
                        </span>`
                      : `<span class="ga-chip">${escapeAttr(t(locale, "inGame.awaitingDiceRoll"))}</span>`
                    : room.gameId === "splendor"
                      ? `<span class="ga-chip ga-num">${escapeAttr(
                          t(locale, "inGame.splendorRoundTarget", {
                            round: state.round,
                            target: state.config.targetPoints,
                          })
                        )}</span>`
                      : room.gameId === "seven_wonders"
                        ? `<span class="ga-chip ga-num">${escapeAttr(
                            t(locale, "inGame.swAgeDraft", {
                              age: state.age,
                              draft: state.draftRound,
                            })
                          )}</span>`
                        : `<span class="ga-chip ga-num">${escapeAttr(
                            t(locale, "inGame.azulRoundBagLid", {
                              round: state.round,
                              bag: state.bag.length,
                              lid: state.discardLid.length,
                            })
                          )}</span>`
                }
                <span class="ga-chip ${invariantCheck.valid ? "ga-chip--ok" : "ga-chip--danger"}">
                  ${escapeAttr(
                    invariantCheck.valid
                      ? t(locale, "inGame.rulesVerified")
                      : t(locale, "inGame.ruleErrors", {
                          count: invariantCheck.violations.length,
                        })
                  )}
                </span>
                ${
                  state.winnerId
                    ? `<span class="ga-chip ga-chip--warn">${escapeAttr(
                        t(locale, "inGame.winnerChip", {
                          name:
                            state.players.find(
                              (p: any) => p.id === state.winnerId
                            )?.name ?? t(locale, "common.player"),
                        })
                      )}</span>`
                    : ""
                }
              </div>

              <div class="board-banner__controls" style="display: flex; flex-wrap: wrap; align-items: center; gap: 5px;">
                <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "common.guide"))}</button>${botBannerControlsHtml}
                ${
                  (room.gameId === "catan" || room.gameId === "seven_wonders") &&
                  controllableHumansCount >= 2
                    ? `<button type="button" id="btn-toggle-hand-privacy" class="btn btn--secondary btn--sm">
                        ${escapeAttr(
                          model.hidePassAndPlayHand
                            ? t(locale, "inGame.showHand")
                            : t(locale, "inGame.hideHand")
                        )}
                      </button>`
                    : ""
                }
                <button type="button" id="btn-undo" class="btn btn--secondary btn--sm ga-num" title="${escapeAttr(
                  canUndo
                    ? t(locale, "inGame.undoTitleEnabled")
                    : t(locale, "inGame.undoTitleDisabled")
                )}" ${!canUndo ? "disabled" : ""}>${escapeAttr(t(locale, "common.undo"))}${
                  undoableSteps > 0 ? ` (${undoableSteps})` : ""
                }</button>
                <button type="button" id="btn-redo" class="btn btn--secondary btn--sm" ${
                  !canRedo ? "disabled" : ""
                }>${escapeAttr(t(locale, "common.redo"))}</button>${renderFullscreenBannerControlsPure(
                  model,
                  locale
                )}
                ${
                  model.debugMode
                    ? `${
                        room.gameId === "catan" &&
                        state.phase.startsWith("SETUP_") &&
                        (!usesServer || isOwner)
                          ? `<button type="button" id="btn-finish-setup" class="btn btn--secondary btn--sm">${escapeAttr(t(locale, "inGame.autoPlaceSetup"))}</button>`
                          : ""
                      }
                      <button type="button" id="btn-toggle-bot-response" class="btn btn--secondary btn--sm ${
                        (usesServer ? room.autoStepBots : model.autoRespondBotsToHuman)
                          ? "is-selected"
                          : ""
                      }">
                        ${escapeAttr(
                          t(locale, "inGame.autoBots", {
                            state: (
                              usesServer
                                ? room.autoStepBots
                                : model.autoRespondBotsToHuman
                            )
                              ? t(locale, "common.on")
                              : t(locale, "common.off"),
                          })
                        )}
                      </button>
                      <button type="button" id="btn-step-bot" class="btn btn--secondary btn--sm" ${
                        state.phase === "GAME_OVER" ||
                        !actingPlayer ||
                        (!actingPlayer.isBot && !room.allBots)
                          ? "disabled"
                          : ""
                      }>${escapeAttr(t(locale, "inGame.stepBot"))}</button>
                      <button type="button" id="btn-autoplay" class="btn ${
                        model.autoPlayBots ? "btn--primary" : "btn--secondary"
                      } btn--sm">
                        ${escapeAttr(
                          model.autoPlayBots
                            ? t(locale, "inGame.pauseSim")
                            : t(locale, "inGame.autoSim")
                        )}
                      </button>`
                    : ""
                }
              </div>
            </div>
${botMoveFeedBarHtml}
            <div class="board-svg-wrap">
              ${tutorialCoachHtml}
              ${
                room.gameId === "catan"
                  ? `
                    ${renderCatanMapDiceHudPure(state as CatanState, locale)}${
                      (state as CatanState).config.enableCitiesAndKnights
                        ? `\n                    ${renderCatanBarbarianHudPure(
                            state as CatanState,
                            handPlayer ?? mySeatedPlayer ?? actingPlayer,
                            locale
                          )}`
                        : ""
                    }
                    ${renderCatanMapZoomControlsPure(
                      state as CatanState,
                      model.catanMapViewport,
                      locale,
                      model.boardFullscreen
                    )}
                    ${renderCatanBoardSvg(
                      state as CatanState,
                      boardActingPlayerId,
                      {
                        buildMode: isMyTurn ? model.buildMode : null,
                        setupEdgeKind: model.setupEdgeKind,
                        robberOrPirateMode: model.robberOrPirateMode,
                        selectedMoveFromEdgeId: isMyTurn
                          ? model.selectedMoveFromEdgeId
                          : null,
                        selectedSpot: model.selectedBoardSpot,
                        viewport: model.catanMapViewport,
                        locale,
                        ...ckBoardOptions,
                      }
                    )}
                    ${renderCatanSpotPopoverPure(
                      model,
                      state as CatanState,
                      isMyTurn ? actingPlayer : mySeatedPlayer ?? actingPlayer,
                      catanLegalActions
                    )}
                    ${
                      isMyTurn &&
                      !(controllableHumansCount >= 2 && model.hidePassAndPlayHand)
                        ? renderCatanMapBuildAndEndTurnHudPure(
                            model,
                            state as CatanState,
                            actingPlayer,
                            catanLegalActions
                          )
                        : ""
                    }
                    ${catanDecisionPopupHtml}
                  `
                  : room.gameId === "splendor"
                    ? renderSplendorBoardView(
                        state as SplendorState,
                        isMyTurn ? model.splendorDraftGems : {},
                        effectiveViewerId ?? mySeatedPlayer?.id ?? actingPlayerId,
                        isMyTurn,
                        locale
                      )
                    : room.gameId === "seven_wonders"
                      ? renderSevenWondersBoardView(
                          state as SevenWondersState,
                          effectiveViewerId ?? mySeatedPlayer?.id ?? actingPlayerId,
                          isMyTurn ? model.sevenWondersSelectedCardId : null,
                          sevenWondersLegalActions,
                          model.sevenWondersInspectedPlayerId,
                          controllableHumansCount >= 2 && model.hidePassAndPlayHand,
                          locale
                        )
                      : renderAzulBoardView(
                          state as AzulState,
                          isMyTurn ? model.azulSelectedDraft : null,
                          model.azulInspectedPlayerId ??
                            (state.phase === "GAME_OVER"
                              ? null
                              : effectiveViewerId ??
                                mySeatedPlayer?.id ??
                                null),
                          isMyTurn,
                          locale
                        )
              }
            </div>

            <div class="action-dock">
              ${
                state.phase !== "GAME_OVER" &&
                !isMyTurn &&
                !(
                  room.gameId === "seven_wonders" &&
                  (effectiveViewerId ?? mySeatedPlayer?.id) &&
                  canPlayerUnselectDraftPick(
                    state as SevenWondersState,
                    (effectiveViewerId ?? mySeatedPlayer?.id)!
                  )
                )
                  ? `${
                      room.gameId === "catan" &&
                      canCancelMyTrade &&
                      state.phase === "MAIN_PHASE" &&
                      Boolean((state as CatanState).activeTradeOffer) &&
                      actingPlayer
                        ? `<div class="sub-modal sub-modal--trade sub-modal--trade-offer">${renderActiveTradeOfferCardPure(
                            model,
                            room,
                            state as CatanState,
                            actingPlayer,
                            canCancelMyTrade
                          )}</div>`
                        : ""
                    }<div class="action-buttons" style="justify-content: space-between;">
                      <span class="action-prompt">
                        ${
                          mySeatedPlayer
                            ? t(locale, "inGame.waitingForPlayer", {
                                name: `<strong>${escapeAttr(actingPlayer?.name ?? t(locale, "common.activePlayerFallback"))}</strong>`,
                                phase: escapeAttr(formatPhaseLabel(state.phase, locale)),
                              })
                            : t(locale, "inGame.spectatingTurn", {
                                name: `<strong>${escapeAttr(actingPlayer?.name ?? t(locale, "common.playerFallback"))}</strong>`,
                                phase: escapeAttr(formatPhaseLabel(state.phase, locale)),
                              })
                        }
                      </span>
                      <div style="display: inline-flex; gap: 6px;">
                        ${
                          localDeviceGuestForTurn
                            ? `<button type="button" id="btn-switch-turn-guest" data-switch-guest="${escapeAttr(localDeviceGuestForTurn.id)}" class="btn btn--primary btn--sm">${escapeAttr(
                                t(locale, "inGame.switchToGuest", {
                                  name: localDeviceGuestForTurn.name,
                                })
                              )}</button>`
                            : ""
                        }
                      </div>
                    </div>`
                  : room.gameId === "catan"
                    ? Boolean(handPlayer) &&
                      controllableHumansCount >= 2 &&
                      model.hidePassAndPlayHand
                      ? `<div class="action-buttons" style="justify-content: space-between;">
                          <span class="action-prompt">${t(locale, "inGame.passDevicePrompt", {
                            name: `<strong>${escapeAttr(handPlayer!.name)}</strong>`,
                            phase: escapeAttr(formatPhaseLabel(state.phase, locale)),
                          })}</span>
                        </div>`
                      : renderCatanActionDockPure(
                          model,
                          room,
                          state as CatanState,
                          actingPlayer,
                          catanLegalActions,
                          canCancelMyTrade
                        )
                    : room.gameId === "splendor"
                       ? renderSplendorActionDock(
                          state as SplendorState,
                          actingPlayer,
                          locale
                        )
                      : room.gameId === "seven_wonders"
                        ? renderSevenWondersActionDock(
                            state as SevenWondersState,
                            actingPlayer,
                            model.sevenWondersSelectedCardId,
                            sevenWondersLegalActions,
                            effectiveViewerId ?? mySeatedPlayer?.id ?? null,
                            locale
                          )
                        : renderAzulActionDock(
                            state as AzulState,
                            actingPlayer,
                            model.azulSelectedDraft,
                            locale
                          )
              }
            </div>

            ${
              room.gameId === "catan"
                ? handPlayer
                  ? controllableHumansCount >= 2 && model.hidePassAndPlayHand
                    ? `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted">${t(locale, "inGame.handHiddenPrivacy", {
                          name: `<strong>${escapeAttr(handPlayer.name)}</strong>`,
                        })}</span>
                        <button type="button" id="btn-reveal-hand" class="btn btn--secondary btn--sm">${escapeAttr(
                          t(locale, "inGame.showPlayerHand", {
                            name: handPlayer.name,
                          })
                        )}</button>
                      </div>
                    `
                    : renderCatanVisualHandTray(
                        state as CatanState,
                        handPlayer,
                        isMyTurn && actingPlayerId === handPlayer.id
                          ? CatanEngine.getLegalActions(state, handPlayer.id)
                          : [],
                        locale
                      )
                  : room.allBots && actingPlayer && !actingPlayer.handRedacted
                    ? renderCatanVisualHandTray(
                        state as CatanState,
                        actingPlayer,
                        isMyTurn
                          ? CatanEngine.getLegalActions(state, actingPlayer.id)
                          : [],
                        locale
                      )
                    : `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted">${escapeAttr(t(locale, "inGame.spectatingHiddenHands"))}</span>
                      </div>
                    `
                : ""
            }
          </div>`;
}
