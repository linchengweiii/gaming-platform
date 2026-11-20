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

  const bannerPhaseLabel =
    room.gameId === "catan" &&
    state.phase === "SETUP_SETTLEMENT_2" &&
    (state as CatanState).config.enableCitiesAndKnights
      ? "Setup city 2"
      : formatPhaseLabel(state.phase);

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
              <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                ${
                  actingPlayer
                    ? `<span class="player-dot" style="background: ${actingPlayer.color}"></span>
                       <strong style="font-weight: 500;">Active turn: ${escapeAttr(actingPlayer.name)}${
                         mySeatedPlayer && actingPlayer.id === mySeatedPlayer.id
                           ? actingPlayer.name.includes("(You)")
                             ? ""
                             : " (You)"
                           : isMyTurn && !actingPlayer.isBot
                             ? actingPlayer.name.includes("(Local)")
                               ? ""
                               : " (Local)"
                             : ""
                       }</strong>`
                    : `<strong style="font-weight: 500;">Match complete</strong>`
                }
                <span class="ga-chip">${bannerPhaseLabel}</span>
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
                          <span class="ga-chip ga-chip--warn ga-num">Roll ${
                            state.lastRoll.total
                          }</span>
                        </span>`
                      : `<span class="ga-chip">Awaiting dice roll</span>`
                    : room.gameId === "splendor"
                      ? `<span class="ga-chip ga-num">Round ${state.round} · Target ${state.config.targetPoints}</span>`
                      : room.gameId === "seven_wonders"
                        ? `<span class="ga-chip ga-num">Age ${state.age} · Draft ${state.draftRound}/6</span>`
                        : `<span class="ga-chip ga-num">Round ${state.round} · Bag ${state.bag.length} · Lid ${state.discardLid.length}</span>`
                }
                <span class="ga-chip ${invariantCheck.valid ? "ga-chip--ok" : "ga-chip--danger"}">
                  ${
                    invariantCheck.valid
                      ? "Rules verified"
                      : `${invariantCheck.violations.length} rule errors`
                  }
                </span>
                ${
                  state.winnerId
                    ? `<span class="ga-chip ga-chip--warn">Winner: ${escapeAttr(
                        state.players.find((p: any) => p.id === state.winnerId)?.name ?? "Player"
                      )}</span>`
                    : ""
                }
              </div>

              <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 5px;">
                <button type="button" data-open-guide="${room.gameId}" class="btn btn--secondary btn--sm">Guide</button>${botBannerControlsHtml}
                ${
                  (room.gameId === "catan" || room.gameId === "seven_wonders") &&
                  controllableHumansCount >= 2
                    ? `<button type="button" id="btn-toggle-hand-privacy" class="btn btn--secondary btn--sm">
                        ${model.hidePassAndPlayHand ? "Show hand" : "Hide hand"}
                      </button>`
                    : ""
                }
                <button type="button" id="btn-undo" class="btn btn--secondary btn--sm ga-num" title="${
                  canUndo
                    ? "Undo your last reversible step in this turn"
                    : "Undo is only available during your turn before a random roll or card reveal"
                }" ${!canUndo ? "disabled" : ""}>Undo${
                  undoableSteps > 0 ? ` (${undoableSteps})` : ""
                }</button>
                <button type="button" id="btn-redo" class="btn btn--secondary btn--sm" ${
                  !canRedo ? "disabled" : ""
                }>Redo</button>
                ${
                  model.debugMode
                    ? `${
                        room.gameId === "catan" &&
                        state.phase.startsWith("SETUP_") &&
                        (!usesServer || isOwner)
                          ? `<button type="button" id="btn-finish-setup" class="btn btn--secondary btn--sm">Auto-place setup</button>`
                          : ""
                      }
                      <button type="button" id="btn-toggle-bot-response" class="btn btn--secondary btn--sm ${
                        (usesServer ? room.autoStepBots : model.autoRespondBotsToHuman)
                          ? "is-selected"
                          : ""
                      }">
                        Auto-bots: ${
                          (usesServer ? room.autoStepBots : model.autoRespondBotsToHuman)
                            ? "on"
                            : "off"
                        }
                      </button>
                      <button type="button" id="btn-step-bot" class="btn btn--secondary btn--sm" ${
                        state.phase === "GAME_OVER" ||
                        !actingPlayer ||
                        (!actingPlayer.isBot && !room.allBots)
                          ? "disabled"
                          : ""
                      }>Step bot</button>
                      <button type="button" id="btn-autoplay" class="btn ${
                        model.autoPlayBots ? "btn--primary" : "btn--secondary"
                      } btn--sm">
                        ${model.autoPlayBots ? "Pause sim" : "Auto-sim"}
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
                    ${renderCatanMapDiceHudPure(state as CatanState)}${
                      (state as CatanState).config.enableCitiesAndKnights
                        ? `\n                    ${renderCatanBarbarianHudPure(
                            state as CatanState,
                            handPlayer ?? mySeatedPlayer ?? actingPlayer
                          )}`
                        : ""
                    }
                    ${renderCatanMapZoomControlsPure(
                      state as CatanState,
                      model.catanMapViewport
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
                        isMyTurn
                      )
                    : room.gameId === "seven_wonders"
                      ? renderSevenWondersBoardView(
                          state as SevenWondersState,
                          effectiveViewerId ?? mySeatedPlayer?.id ?? actingPlayerId,
                          isMyTurn ? model.sevenWondersSelectedCardId : null,
                          sevenWondersLegalActions,
                          model.sevenWondersInspectedPlayerId,
                          controllableHumansCount >= 2 && model.hidePassAndPlayHand
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
                          isMyTurn
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
                            ? `Waiting for <strong>${escapeAttr(actingPlayer?.name ?? "active player")}</strong> (${formatPhaseLabel(state.phase)}).`
                            : `Spectating room — active turn: <strong>${escapeAttr(actingPlayer?.name ?? "player")}</strong> (${formatPhaseLabel(state.phase)}).`
                        }
                      </span>
                      <div style="display: inline-flex; gap: 6px;">
                        ${
                          localDeviceGuestForTurn
                            ? `<button type="button" id="btn-switch-turn-guest" data-switch-guest="${escapeAttr(localDeviceGuestForTurn.id)}" class="btn btn--primary btn--sm">Switch to ${escapeAttr(localDeviceGuestForTurn.name)}</button>`
                            : ""
                        }
                      </div>
                    </div>`
                  : room.gameId === "catan"
                    ? Boolean(handPlayer) &&
                      controllableHumansCount >= 2 &&
                      model.hidePassAndPlayHand
                      ? `<div class="action-buttons" style="justify-content: space-between;">
                          <span class="action-prompt">Pass device to <strong>${escapeAttr(handPlayer!.name)}</strong> and reveal their hand below to continue (${formatPhaseLabel(state.phase)}).</span>
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
                          actingPlayer
                        )
                      : room.gameId === "seven_wonders"
                        ? renderSevenWondersActionDock(
                            state as SevenWondersState,
                            actingPlayer,
                            model.sevenWondersSelectedCardId,
                            sevenWondersLegalActions,
                            effectiveViewerId ?? mySeatedPlayer?.id ?? null
                          )
                        : renderAzulActionDock(
                            state as AzulState,
                            actingPlayer,
                            model.azulSelectedDraft
                          )
              }
            </div>

            ${
              room.gameId === "catan"
                ? handPlayer
                  ? controllableHumansCount >= 2 && model.hidePassAndPlayHand
                    ? `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted"><strong>${escapeAttr(handPlayer.name)}'s</strong> hand is hidden while passing the screen.</span>
                        <button type="button" id="btn-reveal-hand" class="btn btn--secondary btn--sm">Show ${escapeAttr(handPlayer.name)}'s hand</button>
                      </div>
                    `
                    : renderCatanVisualHandTray(
                        state as CatanState,
                        handPlayer,
                        isMyTurn && actingPlayerId === handPlayer.id
                          ? CatanEngine.getLegalActions(state, handPlayer.id)
                          : []
                      )
                  : room.allBots && actingPlayer && !actingPlayer.handRedacted
                    ? renderCatanVisualHandTray(
                        state as CatanState,
                        actingPlayer,
                        isMyTurn
                          ? CatanEngine.getLegalActions(state, actingPlayer.id)
                          : []
                      )
                    : `
                      <div class="ga-hand-privacy-card">
                        <span class="t-small muted">Spectating table — player hands remain hidden until match completion.</span>
                      </div>
                    `
                : ""
            }
          </div>`;
}
