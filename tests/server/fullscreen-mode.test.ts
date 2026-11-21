import { describe, expect, test } from "bun:test";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { createFakeDomRoot, readCombinedWebStyles } from "./helpers.ts";

function makeDocumentHarness(opts?: {
  readonly supportFullscreenApi?: boolean;
  readonly rejectRequestFullscreen?: boolean;
}) {
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const bodyClasses = new Set<string>();
  let fullscreenEl: any = null;
  let requestCalls = 0;
  let exitCalls = 0;

  const doc: any = {
    title: "",
    get fullscreenElement() {
      return fullscreenEl;
    },
    fullscreenEnabled: opts?.supportFullscreenApi ?? true,
    documentElement: {
      lang: "en",
      hasAttribute: () => false,
      requestFullscreen:
        opts?.supportFullscreenApi === false
          ? undefined
          : () => {
              requestCalls += 1;
              if (opts?.rejectRequestFullscreen) {
                return Promise.reject(new Error("Fullscreen denied"));
              }
              fullscreenEl = doc.documentElement;
              return Promise.resolve();
            },
    },
    exitFullscreen:
      opts?.supportFullscreenApi === false
        ? undefined
        : () => {
            exitCalls += 1;
            fullscreenEl = null;
            return Promise.resolve();
          },
    body: {
      classList: {
        add: (...cs: string[]) => cs.forEach((c) => bodyClasses.add(c)),
        remove: (...cs: string[]) => cs.forEach((c) => bodyClasses.delete(c)),
        contains: (c: string) => bodyClasses.has(c),
        toggle: (c: string, force?: boolean) => {
          const next = force !== undefined ? force : !bodyClasses.has(c);
          if (next) bodyClasses.add(c);
          else bodyClasses.delete(c);
          return next;
        },
      },
    },
    addEventListener: (type: string, fn: (e: any) => void) => {
      listeners[type] = [...(listeners[type] ?? []), fn];
    },
    removeEventListener: (type: string, fn: (e: any) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
  };

  const dispatchDoc = (type: string, extra: Record<string, any> = {}) => {
    let defaultPrevented = false;
    const ev = {
      type,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: null,
      preventDefault: () => {
        defaultPrevented = true;
      },
      get defaultPrevented() {
        return defaultPrevented;
      },
      ...extra,
    };
    for (const fn of listeners[type] ?? []) {
      fn(ev);
    }
    return ev;
  };

  return {
    doc,
    bodyClasses,
    dispatchDoc,
    setFullscreenElement: (el: any) => {
      fullscreenEl = el;
    },
    getStats: () => ({ requestCalls, exitCalls }),
  };
}

describe("In-Game Full Screen / Focus Board Mode", () => {
  test("includes responsive full screen CSS rules for desktop, mobile, and slide-over info drawer", () => {
    const cssText = readCombinedWebStyles();
    expect(cssText).toContain(".ga-game-canvas.is-fullscreen");
    expect(cssText).toContain(".ga-game-canvas.is-fullscreen .ga-nav--room");
    expect(cssText).toContain(".ga-game-canvas.is-fullscreen .ga-bot-feed");
    expect(cssText).toContain(".ga-game-canvas.is-fullscreen .ga-sidebar");
    expect(cssText).toContain(
      ".ga-game-canvas.is-fullscreen.is-fullscreen-sidebar-open .ga-sidebar"
    );
    expect(cssText).toContain("body.ga-body--fullscreen");
    expect(cssText).toContain("bottom: -152px;");
    expect(cssText).toContain("max-height: none;");
  });

  test("toggles full screen mode and slide-over info drawer cleanly across Catan, Splendor, Azul, and 7 Wonders with en & zh-TW localization", () => {
    const root = createFakeDomRoot();
    const app = MultiGamePlatformApp(root, {
      forceLocalMode: true,
      startAtLogin: false,
    });
    app.autoRespondBotsToHuman = false;

    // Outside active game, attempting to enter fullscreen stays false
    app.setBoardFullscreen(true);
    expect(app.boardFullscreen).toBe(false);

    const gameRoomIds = [
      { roomId: "room-1", gameId: "catan" },
      { roomId: "room-3", gameId: "splendor" },
      { roomId: "room-4", gameId: "azul" },
      { roomId: "room-5", gameId: "seven_wonders" },
    ] as const;

    for (const { roomId, gameId } of gameRoomIds) {
      const room = app.rooms.get(roomId)!;
      room.ownerId = app.currentUserId;
      room.ownerName = app.currentUserName;
      room.humanPlayers = [
        {
          id: app.currentUserId,
          name: app.currentUserName,
          color: "#e11d48",
          isBot: false,
        },
      ];
      app.rebuildRoomSeats(room);
      app.enterOrJoinRoom(roomId);
      app.startRoomMatch(roomId);

      // Default mode preserves exact class="ga-game-canvas" and renders Full screen button
      expect(app.boardFullscreen).toBe(false);
      expect(root.innerHTML).toContain('class="ga-game-canvas"');
      expect(root.innerHTML).toContain('id="btn-toggle-fullscreen"');
      expect(root.innerHTML).toContain('aria-pressed="false"');
      expect(root.innerHTML).toContain("Full screen");
      expect(root.innerHTML).not.toContain('id="btn-toggle-fullscreen-sidebar"');
      if (gameId === "catan") {
        expect(root.innerHTML).toContain('id="btn-map-fullscreen"');
      }

      // Enter Full Screen
      app.toggleBoardFullscreen();
      expect(app.boardFullscreen).toBe(true);
      expect(app.fullscreenSidebarOpen).toBe(false);
      expect(root.innerHTML).toContain('class="ga-game-canvas is-fullscreen"');
      expect(root.innerHTML).toContain('aria-pressed="true"');
      expect(root.innerHTML).toContain("Exit full screen");
      expect(root.innerHTML).toContain('id="btn-toggle-fullscreen-sidebar"');
      expect(root.innerHTML).toContain('class="ga-fullscreen-drawer-head"');
      expect(root.innerHTML).not.toContain('id="ga-fullscreen-sidebar-backdrop"');

      // Open slide-over Match Info drawer
      app.toggleFullscreenSidebar();
      expect(app.fullscreenSidebarOpen).toBe(true);
      expect(root.innerHTML).toContain(
        'class="ga-game-canvas is-fullscreen is-fullscreen-sidebar-open"'
      );
      expect(root.innerHTML).toContain('id="ga-fullscreen-sidebar-backdrop"');

      // Check Traditional Chinese labels
      app.setLocale("zh-TW");
      expect(root.innerHTML).toContain("離開全螢幕");
      expect(root.innerHTML).toContain("資訊");
      expect(root.innerHTML).toContain("對戰資訊");
      app.setLocale("en");

      // Exit Full Screen also resets sidebar drawer
      app.toggleBoardFullscreen();
      expect(app.boardFullscreen).toBe(false);
      expect(app.fullscreenSidebarOpen).toBe(false);
      expect(root.innerHTML).toContain('class="ga-game-canvas"');
    }
  });

  test("syncs Browser Fullscreen API, handles Escape & F keyboard shortcuts, and auto-exits when leaving game", async () => {
    const prevDocument = (globalThis as any).document;
    const harness = makeDocumentHarness({ supportFullscreenApi: true });
    (globalThis as any).document = harness.doc;

    try {
      let guideCloseClicks = 0;
      const root: any = {
        innerHTML: "",
        querySelector: (sel: string) => {
          if (sel === "#btn-close-guide" && root.innerHTML.includes('id="btn-close-guide"')) {
            return {
              click: () => {
                guideCloseClicks += 1;
                (app as any).render();
              },
            };
          }
          return null;
        },
        querySelectorAll: () => [],
        addEventListener: () => {},
      };

      const app = MultiGamePlatformApp(root, {
        forceLocalMode: true,
        startAtLogin: false,
      });
      app.autoRespondBotsToHuman = false;
      app.enterOrJoinRoom("room-1");
      app.startRoomMatch("room-1");

      // Press F to enter full screen
      const fEnterEv = harness.dispatchDoc("keydown", { key: "f" });
      expect(fEnterEv.defaultPrevented).toBe(true);
      await Promise.resolve();
      expect(app.boardFullscreen).toBe(true);
      expect(harness.bodyClasses.has("ga-body--fullscreen")).toBe(true);
      expect(harness.getStats().requestCalls).toBe(1);

      // Typing 'f' inside an input does NOT toggle fullscreen
      const inputEv = harness.dispatchDoc("keydown", {
        key: "f",
        target: { tagName: "INPUT" },
      });
      expect(inputEv.defaultPrevented).toBe(false);
      expect(app.boardFullscreen).toBe(true);

      // Escape closes Info drawer first without leaving fullscreen
      app.toggleFullscreenSidebar();
      expect(app.fullscreenSidebarOpen).toBe(true);
      const escDrawerEv = harness.dispatchDoc("keydown", { key: "Escape" });
      expect(escDrawerEv.defaultPrevented).toBe(true);
      expect(app.fullscreenSidebarOpen).toBe(false);
      expect(app.boardFullscreen).toBe(true);

      // If browser exits native fullscreen externally (e.g., OS Esc), app exits fullscreen cleanly
      harness.setFullscreenElement(null);
      harness.dispatchDoc("fullscreenchange");
      expect(app.boardFullscreen).toBe(false);
      expect(harness.bodyClasses.has("ga-body--fullscreen")).toBe(false);

      // Re-enter fullscreen, then leave active game -> auto-exits fullscreen & native API
      app.toggleBoardFullscreen();
      await Promise.resolve();
      expect(app.boardFullscreen).toBe(true);
      expect(harness.getStats().requestCalls).toBe(2);

      app.leaveActiveRoom();
      expect(app.viewMode).toBe("lobby");
      expect(app.boardFullscreen).toBe(false);
      expect(app.fullscreenSidebarOpen).toBe(false);
      expect(harness.bodyClasses.has("ga-body--fullscreen")).toBe(false);
      expect(harness.getStats().exitCalls).toBeGreaterThanOrEqual(1);
      expect(guideCloseClicks).toBe(0);
    } finally {
      (globalThis as any).document = prevDocument;
    }
  });

  test("falls back gracefully to viewport full screen when Browser Fullscreen API is unavailable or rejected", async () => {
    const prevDocument = (globalThis as any).document;
    const harness = makeDocumentHarness({
      supportFullscreenApi: true,
      rejectRequestFullscreen: true,
    });
    (globalThis as any).document = harness.doc;

    try {
      const root = createFakeDomRoot();
      const app = MultiGamePlatformApp(root, {
        forceLocalMode: true,
        startAtLogin: false,
      });
      app.autoRespondBotsToHuman = false;
      app.enterOrJoinRoom("room-1");
      app.startRoomMatch("room-1");

      app.toggleBoardFullscreen();
      await Promise.resolve();
      await Promise.resolve();

      // Still active in viewport fullscreen even though native requestFullscreen rejected
      expect(app.boardFullscreen).toBe(true);
      expect(harness.bodyClasses.has("ga-body--fullscreen")).toBe(true);

      // Escape still exits viewport fullscreen cleanly
      harness.dispatchDoc("keydown", { key: "Escape" });
      expect(app.boardFullscreen).toBe(false);
      expect(harness.bodyClasses.has("ga-body--fullscreen")).toBe(false);
    } finally {
      (globalThis as any).document = prevDocument;
    }
  });
});
