import type {
  GemColor,
  SplendorState,
  TokenColor,
} from "@gaming-platform/splendor";
import type {
  AzulState,
  AzulTargetLine,
  AzulTileColor,
} from "@gaming-platform/azul";
import {
  type SevenWondersAction,
  SevenWondersEngine,
  type SevenWondersState,
} from "@gaming-platform/seven-wonders";
import { extractInviteRoomHashFromLocationPure } from "../helpers/room-hash-and-links.ts";
import { toggleSplendorDraftGemPure } from "../reducers/trade-and-draft-reducers.ts";
import type { AppRuntimeContext } from "./context.ts";

export function bindSplendorEvents(
  ctx: AppRuntimeContext,
  state: SplendorState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  root.querySelectorAll("[data-sp-gem]").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.phase !== "MAIN_ACTION") return;
      const color = el.getAttribute("data-sp-gem") as GemColor;
      if (state.bank[color] <= 0) return;

      ctx.model = {
        ...ctx.model,
        splendorDraftGems: toggleSplendorDraftGemPure(
          ctx.model.splendorDraftGems,
          state,
          color
        ),
      };
      ctx.render();
    });
  });

  root.querySelector("#btn-sp-clear-gems")?.addEventListener("click", () => {
    ctx.model = { ...ctx.model, splendorDraftGems: {} };
    ctx.render();
  });

  root.querySelector("#btn-sp-take-gems")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, {
      type: "TAKE_GEMS",
      gems: { ...ctx.model.splendorDraftGems },
    });
  });

  root.querySelectorAll("[data-sp-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-sp-buy")!;
      ctx.dispatch(actingPlayerId, { type: "PURCHASE_CARD", cardId });
    });
  });

  root.querySelectorAll("[data-sp-reserve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-sp-reserve")!;
      ctx.dispatch(actingPlayerId, { type: "RESERVE_CARD", cardId });
    });
  });

  root.querySelectorAll("[data-sp-reserve-deck]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const deckTier = Number(
        btn.getAttribute("data-sp-reserve-deck")
      ) as 1 | 2 | 3;
      ctx.dispatch(actingPlayerId, { type: "RESERVE_CARD", deckTier });
    });
  });

  root.querySelectorAll("[data-sp-return-one]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = btn.getAttribute("data-sp-return-one") as TokenColor;
      ctx.dispatch(actingPlayerId, {
        type: "RETURN_TOKENS",
        tokens: { [c]: 1 },
      });
    });
  });

  root.querySelectorAll("[data-sp-noble]").forEach((el) => {
    el.addEventListener("click", () => {
      const nobleId = el.getAttribute("data-sp-noble")!;
      ctx.dispatch(actingPlayerId, { type: "SELECT_NOBLE", nobleId });
    });
  });

  root.querySelector("#btn-sp-pass-turn")?.addEventListener("click", () => {
    ctx.dispatch(actingPlayerId, { type: "PASS_TURN" });
  });
}

export function bindAzulEvents(
  ctx: AppRuntimeContext,
  _state: AzulState,
  actingPlayerId: string
): void {
  const { root } = ctx;

  root.querySelectorAll("[data-azul-factory]").forEach((el) => {
    el.addEventListener("click", () => {
      const factoryIndex = Number(el.getAttribute("data-azul-factory"));
      const color = el.getAttribute("data-azul-color") as AzulTileColor;
      ctx.model = {
        ...ctx.model,
        azulInspectedPlayerId: null,
        azulSelectedDraft: {
          source: { kind: "factory", factoryIndex },
          color,
        },
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-azul-center]").forEach((el) => {
    el.addEventListener("click", () => {
      const color = el.getAttribute("data-azul-color") as AzulTileColor;
      ctx.model = {
        ...ctx.model,
        azulInspectedPlayerId: null,
        azulSelectedDraft: {
          source: { kind: "center" },
          color,
        },
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-azul-target-line]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!ctx.model.azulSelectedDraft) return;
      const raw = el.getAttribute("data-azul-target-line")!;
      const targetLine: AzulTargetLine =
        raw === "floor" ? "floor" : (Number(raw) as 0 | 1 | 2 | 3 | 4);
      ctx.dispatch(actingPlayerId, {
        type: "DRAFT_TILES",
        source: ctx.model.azulSelectedDraft.source,
        color: ctx.model.azulSelectedDraft.color,
        targetLine,
      });
    });
  });

  root
    .querySelector("#btn-azul-cancel-draft")
    ?.addEventListener("click", () => {
      ctx.model = { ...ctx.model, azulSelectedDraft: null };
      ctx.render();
    });
}

export function bindSevenWondersEvents(
  ctx: AppRuntimeContext,
  state: SevenWondersState,
  actingPlayerId: string
): void {
  const { root } = ctx;
  const legalActions = SevenWondersEngine.getLegalActions(
    state,
    actingPlayerId
  );

  root.querySelectorAll("[data-sw-select-card]").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const cardId = cardEl.getAttribute("data-sw-select-card")!;
      ctx.model = {
        ...ctx.model,
        sevenWondersSelectedCardId:
          ctx.model.sevenWondersSelectedCardId === cardId ? null : cardId,
      };
      ctx.render();
    });
  });

  root.querySelectorAll("[data-sw-quick-build]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const cardId = btn.getAttribute("data-sw-quick-build")!;
      const buildActs = legalActions.filter(
        (
          a
        ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
          a.type === "SELECT_DRAFT_ACTION" &&
          a.kind === "build" &&
          a.cardId === cardId
      );
      if (buildActs.length > 1) {
        ctx.model = { ...ctx.model, sevenWondersSelectedCardId: cardId };
        ctx.render();
        return;
      }
      const preferred = buildActs[0] ?? null;
      if (preferred) {
        ctx.dispatchUiAction(actingPlayerId, preferred);
      }
    });
  });

  root.querySelectorAll("[data-sw-quick-wonder]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const cardId = btn.getAttribute("data-sw-quick-wonder")!;
      const wonderActs = legalActions.filter(
        (
          a
        ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
          a.type === "SELECT_DRAFT_ACTION" &&
          a.kind === "wonder" &&
          a.cardId === cardId
      );
      if (wonderActs.length > 1) {
        ctx.model = { ...ctx.model, sevenWondersSelectedCardId: cardId };
        ctx.render();
        return;
      }
      const wonderAct = wonderActs[0] ?? null;
      if (wonderAct) {
        ctx.dispatchUiAction(actingPlayerId, wonderAct);
      }
    });
  });

  root.querySelectorAll("[data-sw-quick-discard]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const cardId = btn.getAttribute("data-sw-quick-discard")!;
      const discardAct = legalActions.find(
        (
          a
        ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
          a.type === "SELECT_DRAFT_ACTION" &&
          a.kind === "discard" &&
          a.cardId === cardId
      );
      if (discardAct) {
        ctx.dispatchUiAction(actingPlayerId, discardAct);
      }
    });
  });

  root.querySelectorAll("[data-sw-variant-card]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-sw-variant-card")!;
      const kind = (btn.getAttribute("data-sw-variant-kind") ?? "build") as
        | "build"
        | "wonder";
      const idx = Number(btn.getAttribute("data-sw-variant-idx") ?? "0");
      const variants = legalActions.filter(
        (
          a
        ): a is Extract<SevenWondersAction, { type: "SELECT_DRAFT_ACTION" }> =>
          a.type === "SELECT_DRAFT_ACTION" &&
          a.kind === kind &&
          a.cardId === cardId
      );
      const chosen = variants[idx];
      if (chosen) {
        ctx.dispatchUiAction(actingPlayerId, chosen);
      }
    });
  });

  root.querySelectorAll("[data-sw-discard-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cardId = btn.getAttribute("data-sw-discard-pick")!;
      ctx.dispatchUiAction(actingPlayerId, {
        type: "BUILD_FROM_DISCARD",
        cardId,
      });
    });
  });

  root.querySelectorAll("[data-sw-skip-discard]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ctx.dispatchUiAction(actingPlayerId, { type: "SKIP_DISCARD_BUILD" });
    });
  });
}

export function registerWindowHashChangeListener(ctx: AppRuntimeContext): void {
  if (
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
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
        ctx.model = { ...ctx.model, pendingInviteRoomId: nextInvite };
        ctx.render();
      }
    });
  }
}
