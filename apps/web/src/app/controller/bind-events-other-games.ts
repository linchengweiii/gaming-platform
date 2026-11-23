import type {
  GemColor,
  SplendorState,
  TokenColor,
} from "@gaming-platform/splendor";
import type { AzulTargetLine, AzulTileColor } from "@gaming-platform/azul";
import {
  type SevenWondersAction,
  SevenWondersEngine,
  type SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { extractInviteRoomHashFromLocationPure } from "../helpers/room-hash-and-links.ts";
import { toggleSplendorDraftGemPure } from "../reducers/trade-and-draft-reducers.ts";
import type { AppRuntimeContext } from "./context.ts";
import { onClick, onDataClick, patchModelAndRender } from "./dom-events.ts";

export function bindSplendorEvents(
  ctx: AppRuntimeContext,
  state: SplendorState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  onDataClick(root, "data-sp-gem", (rawColor) => {
    const color = rawColor as GemColor;
    if (state.phase !== "MAIN_ACTION" || state.bank[color] <= 0) return;
    patchModelAndRender(ctx, {
      splendorDraftGems: toggleSplendorDraftGemPure(
        ctx.model.splendorDraftGems,
        state,
        color
      ),
    });
  });

  onClick(root, "#btn-sp-clear-gems", () =>
    patchModelAndRender(ctx, { splendorDraftGems: {} })
  );
  onClick(root, "#btn-sp-take-gems", () =>
    ctx.dispatch(actingPlayerId, {
      type: "TAKE_GEMS",
      gems: { ...ctx.model.splendorDraftGems },
    })
  );
  onDataClick(root, "data-sp-buy", (cardId) =>
    ctx.dispatch(actingPlayerId, { type: "PURCHASE_CARD", cardId })
  );
  onDataClick(root, "data-sp-reserve", (cardId) =>
    ctx.dispatch(actingPlayerId, { type: "RESERVE_CARD", cardId })
  );
  onDataClick(root, "data-sp-reserve-deck", (tier) =>
    ctx.dispatch(actingPlayerId, {
      type: "RESERVE_CARD",
      deckTier: Number(tier) as 1 | 2 | 3,
    })
  );
  onDataClick(root, "data-sp-return-one", (c) =>
    ctx.dispatch(actingPlayerId, {
      type: "RETURN_TOKENS",
      tokens: { [c as TokenColor]: 1 },
    })
  );
  onDataClick(root, "data-sp-noble", (nobleId) =>
    ctx.dispatch(actingPlayerId, { type: "SELECT_NOBLE", nobleId })
  );
  onClick(root, "#btn-sp-pass-turn", () =>
    ctx.dispatch(actingPlayerId, { type: "PASS_TURN" })
  );
}

export function bindAzulEvents(
  ctx: AppRuntimeContext,
  actingPlayerId: string
): void {
  const { root } = ctx;

  onDataClick(root, "data-azul-factory", (rawIdx, el) =>
    patchModelAndRender(ctx, {
      azulInspectedPlayerId: null,
      azulSelectedDraft: {
        source: { kind: "factory", factoryIndex: Number(rawIdx) },
        color: el.getAttribute("data-azul-color") as AzulTileColor,
      },
    })
  );
  onDataClick(root, "data-azul-center", (_v, el) =>
    patchModelAndRender(ctx, {
      azulInspectedPlayerId: null,
      azulSelectedDraft: {
        source: { kind: "center" },
        color: el.getAttribute("data-azul-color") as AzulTileColor,
      },
    })
  );
  onDataClick(root, "data-azul-target-line", (raw) => {
    if (!ctx.model.azulSelectedDraft) return;
    const targetLine: AzulTargetLine =
      raw === "floor" ? "floor" : (Number(raw) as 0 | 1 | 2 | 3 | 4);
    ctx.dispatch(actingPlayerId, {
      type: "DRAFT_TILES",
      source: ctx.model.azulSelectedDraft.source,
      color: ctx.model.azulSelectedDraft.color,
      targetLine,
    });
  });
  onClick(root, "#btn-azul-cancel-draft", () =>
    patchModelAndRender(ctx, { azulSelectedDraft: null })
  );
}

export function bindSevenWondersEvents(
  ctx: AppRuntimeContext,
  state: SevenWondersState,
  actingPlayerId: string
): void {
  const { root } = ctx;
  const legalActions = SevenWondersEngine.getLegalActions(state, actingPlayerId);
  const findDraftActions = (
    cardId: string,
    kind: "build" | "wonder" | "discard"
  ) =>
    legalActions.filter(
      (a): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
        a.type === "SELECT_DRAFT_ACTION" &&
        a.kind === kind &&
        a.cardId === cardId
    );

  onDataClick(root, "data-sw-select-card", (cardId) =>
    patchModelAndRender(ctx, {
      sevenWondersSelectedCardId:
        ctx.model.sevenWondersSelectedCardId === cardId ? null : cardId,
    })
  );

  for (const [attr, kind] of [
    ["data-sw-quick-build", "build"],
    ["data-sw-quick-wonder", "wonder"],
    ["data-sw-quick-discard", "discard"],
  ] as const) {
    onDataClick(root, attr, (cardId, _el, ev) => {
      ev.stopPropagation();
      const matches = findDraftActions(cardId, kind);
      if (kind !== "discard" && matches.length > 1) {
        patchModelAndRender(ctx, { sevenWondersSelectedCardId: cardId });
        return;
      }
      if (matches[0]) ctx.dispatchUiAction(actingPlayerId, matches[0]);
    });
  }

  onDataClick(root, "data-sw-variant-card", (cardId, btn) => {
    const kind = (btn.getAttribute("data-sw-variant-kind") ?? "build") as
      | "build"
      | "wonder";
    const idx = Number(btn.getAttribute("data-sw-variant-idx") ?? "0");
    const chosen = findDraftActions(cardId, kind)[idx];
    if (chosen) ctx.dispatchUiAction(actingPlayerId, chosen);
  });

  onDataClick(root, "data-sw-discard-pick", (cardId) =>
    ctx.dispatchUiAction(actingPlayerId, { type: "BUILD_FROM_DISCARD", cardId })
  );
  onDataClick(root, "data-sw-skip-discard", () =>
    ctx.dispatchUiAction(actingPlayerId, { type: "SKIP_DISCARD_BUILD" })
  );
}

export function registerWindowHashChangeListener(ctx: AppRuntimeContext): void {
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function"
  ) {
    return;
  }
  window.addEventListener("hashchange", () => {
    const nextInvite = extractInviteRoomHashFromLocationPure(
      window.location?.search ?? "",
      window.location?.hash ?? ""
    );
    if (!nextInvite) return;
    if (ctx.model.isAuthenticated && ctx.model.viewMode !== "login") {
      if (
        nextInvite !== ctx.model.activeRoomId ||
        ctx.model.viewMode === "lobby"
      ) {
        ctx.enterOrJoinRoom(nextInvite);
      }
    } else {
      patchModelAndRender(ctx, { pendingInviteRoomId: nextInvite });
    }
  });
}
