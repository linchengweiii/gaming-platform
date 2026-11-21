import type { AppModel, ClientRoom } from "../../types.ts";
import { renderRoomHeaderPure } from "../room-header-and-summary.ts";
import { renderInGameBoardStagePure } from "./board-stage.ts";
import { renderInGameSidebarPure } from "./sidebar.ts";
import { computeInGameViewStatePure } from "./view-state.ts";

export function renderInGameViewPure(
  rawModel: Readonly<AppModel>,
  room: ClientRoom,
  rawState: any
): {
  readonly model: AppModel;
  readonly html: string;
  readonly state: any;
  readonly actingPlayerId: string | null;
  readonly canCancelMyTrade: boolean;
} {
  const ctx = computeInGameViewStatePure(rawModel, room, rawState);
  const boardStageHtml = renderInGameBoardStagePure(room, ctx);
  const sidebarHtml = renderInGameSidebarPure(room, ctx);

  const isFullscreen = ctx.model.boardFullscreen;
  const isFullscreenSidebarOpen = isFullscreen && ctx.model.fullscreenSidebarOpen;
  const canvasClasses = isFullscreen
    ? isFullscreenSidebarOpen
      ? "ga-game-canvas is-fullscreen is-fullscreen-sidebar-open"
      : "ga-game-canvas is-fullscreen"
    : "ga-game-canvas";
  const sidebarBackdropHtml = isFullscreenSidebarOpen
    ? `\n          <div id="ga-fullscreen-sidebar-backdrop" class="ga-fullscreen-sidebar-backdrop" aria-hidden="true"></div>`
    : "";

  const html = `
      <div class="${canvasClasses}">
        ${renderRoomHeaderPure(ctx.model, room, "game")}

        <div class="ga-room-shell ga-room-shell--game">
${boardStageHtml}${sidebarBackdropHtml}

${sidebarHtml}
        </div>
        ${ctx.guideModalHtml}
      </div>
    `;

  return {
    model: ctx.model,
    html,
    state: ctx.state,
    actingPlayerId: ctx.actingPlayerId,
    canCancelMyTrade: ctx.canCancelMyTrade,
  };
}
