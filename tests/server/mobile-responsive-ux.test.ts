import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AzulEngine } from "../../packages/games/azul/src/index.ts";
import { CatanEngine } from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { renderAzulBoardView } from "../../apps/web/src/azul-view.ts";
import {
  DEFAULT_CATAN_MAP_VIEWPORT,
  renderCatanBoardSvg,
} from "../../apps/web/src/catan-graphics.ts";
import { CATAN_MAP_VIEWPORT_CONFIG } from "../../apps/web/src/config/app-config.ts";
import { makePlayers } from "../parity/golden-store.ts";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

interface FakeNode {
  id: string;
  classes: Set<string>;
  attrs: Record<string, string>;
  listeners: Record<string, Array<{ fn: (e: any) => void; capture: boolean }>>;
  parent: FakeNode | null;
  children: FakeNode[];
  rect: { left: number; top: number; width: number; height: number };
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  addEventListener: (
    type: string,
    fn: (e: any) => void,
    opts?: boolean | { capture?: boolean; passive?: boolean }
  ) => void;
  dispatch: (type: string, extra?: Record<string, any>) => {
    defaultPrevented: boolean;
    propagationStopped: boolean;
  };
  getBoundingClientRect: () => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  closest: (sel: string) => FakeNode | null;
  querySelector: (sel: string) => FakeNode | null;
  querySelectorAll: (sel: string) => FakeNode[];
  classList: {
    add: (...c: string[]) => void;
    remove: (...c: string[]) => void;
    contains: (c: string) => boolean;
    toggle: (c: string, force?: boolean) => boolean;
  };
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
}

function makeFakeNode(opts: {
  id?: string;
  className?: string;
  rect?: { left: number; top: number; width: number; height: number };
  parent?: FakeNode | null;
}): FakeNode {
  const classes = new Set((opts.className ?? "").split(/\s+/).filter(Boolean));
  const attrs: Record<string, string> = {};
  const listeners: Record<
    string,
    Array<{ fn: (e: any) => void; capture: boolean }>
  > = {};

  const matchesSingle = (node: FakeNode, sel: string): boolean => {
    if (sel.startsWith("#")) return node.id === sel.slice(1);
    if (sel.startsWith(".")) return node.classes.has(sel.slice(1));
    return false;
  };
  const matches = (node: FakeNode, sel: string): boolean =>
    sel
      .split(",")
      .map((s) => s.trim())
      .some((part) => matchesSingle(node, part));

  const node: FakeNode = {
    id: opts.id ?? "",
    classes,
    attrs,
    listeners,
    parent: opts.parent ?? null,
    children: [],
    rect: opts.rect ?? { left: 0, top: 0, width: 375, height: 360 },
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    getAttribute(k) {
      return k in attrs ? attrs[k]! : null;
    },
    addEventListener(type, fn, rawOpts) {
      const capture =
        typeof rawOpts === "boolean" ? rawOpts : Boolean(rawOpts?.capture);
      listeners[type] = [...(listeners[type] ?? []), { fn, capture }];
    },
    dispatch(type, extra = {}) {
      let defaultPrevented = false;
      let propagationStopped = false;
      const ev = {
        type,
        target: node,
        currentTarget: node,
        button: 0,
        pointerId: 1,
        pointerType: "touch",
        clientX: 0,
        clientY: 0,
        preventDefault: () => {
          defaultPrevented = true;
        },
        stopPropagation: () => {
          propagationStopped = true;
        },
        ...extra,
      };
      for (const entry of listeners[type] ?? []) {
        entry.fn(ev);
      }
      return { defaultPrevented, propagationStopped };
    },
    getBoundingClientRect: () => node.rect,
    closest(sel) {
      let cur: FakeNode | null = node;
      while (cur) {
        if (matches(cur, sel)) return cur;
        cur = cur.parent;
      }
      return null;
    },
    querySelector(sel) {
      for (const ch of node.children) {
        if (matches(ch, sel)) return ch;
        const nested = ch.querySelector(sel);
        if (nested) return nested;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out: FakeNode[] = [];
      for (const ch of node.children) {
        if (matches(ch, sel)) out.push(ch);
        out.push(...ch.querySelectorAll(sel));
      }
      return out;
    },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => {
        const next = force !== undefined ? force : !classes.has(c);
        if (next) classes.add(c);
        else classes.delete(c);
        return next;
      },
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  };

  if (opts.parent) {
    opts.parent.children.push(node);
  }
  return node;
}

describe("Mobile & iPhone UX Support", () => {
  test("configures iOS Safari meta tags, mobile stylesheet cascade, and anti-zoom/safe-area CSS rules", () => {
    const indexHtml = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/public/index.html"),
      "utf8"
    );
    expect(indexHtml).toContain("viewport-fit=cover");
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable"');
    expect(indexHtml).toContain('name="format-detection" content="telephone=no"');

    const stylesCss = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/public/styles.css"),
      "utf8"
    );
    expect(stylesCss).toContain('./styles/mobile-shell.css');
    expect(stylesCss).toContain('./styles/mobile-catan.css');
    expect(stylesCss).toContain('./styles/mobile-other-games.css');

    const mobileShellCss = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/public/styles/mobile-shell.css"),
      "utf8"
    );
    expect(mobileShellCss).toContain("safe-area-inset-top");
    expect(mobileShellCss).toContain("safe-area-inset-bottom");
    expect(mobileShellCss).toContain("font-size: 16px");
    expect(mobileShellCss).toContain("touch-action: manipulation");
  });

  test("renders enlarged transparent touch hit targets on Catan SVG and semantic responsive hooks on Azul & board banner", () => {
    const catanState = CatanEngine.initGame(makePlayers(3), {}, "mobile-catan-seed");
    const svg = renderCatanBoardSvg(catanState, "p1", {
      buildMode: null,
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
    });
    expect(svg).toContain('r="18" fill="transparent"');

    const azulState = AzulEngine.initGame(makePlayers(2), {}, "mobile-azul-seed");
    const azulHtml = renderAzulBoardView(azulState, null);
    expect(azulHtml).toContain("az-factories-wrap");
    expect(azulHtml).toContain("az-wall-grid");
    expect(azulHtml).toContain("az-pattern-row");
    expect(azulHtml).toContain("az-pattern-line");
    expect(azulHtml).toContain("az-wall-row");
    expect(azulHtml).toContain("az-floor-bar");
    expect(azulHtml).toContain("az-tile");
  });

  test("uses touchDragThresholdPx for touch micro-drift taps and blocks iOS Safari gesture zoom on Catan map", () => {
    expect(CATAN_MAP_VIEWPORT_CONFIG.touchDragThresholdPx).toBeGreaterThan(
      CATAN_MAP_VIEWPORT_CONFIG.dragThresholdPx
    );

    const root = makeFakeNode({ id: "app" });
    const wrap = makeFakeNode({
      className: "board-svg-wrap",
      parent: root,
      rect: { left: 0, top: 0, width: 375, height: 360 },
    });
    const svg = makeFakeNode({
      className: "board-svg",
      parent: wrap,
      rect: { left: 0, top: 0, width: 375, height: 360 },
    });
    const zoomHud = makeFakeNode({
      className: "map-zoom-controls",
      parent: wrap,
    });

    const app = new MultiGamePlatformApp(root as any, {
      forceLocalMode: true,
      startAtLogin: false,
    }) as any;
    app.autoRespondBotsToHuman = false;
    app.enterOrJoinRoom("room-1");
    app.startRoomMatch("room-1");

    // 7px touch micro-drift is above mouse dragThresholdPx (5) but below touchDragThresholdPx (10) -> must NOT pan or suppress click
    wrap.dispatch("pointerdown", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 150,
      clientY: 150,
      target: svg,
    });
    wrap.dispatch("pointermove", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 157,
      clientY: 150,
      target: svg,
    });
    wrap.dispatch("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 157,
      clientY: 150,
      target: svg,
    });
    expect(app.catanMapViewport).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
    const tapClick = wrap.dispatch("click", { target: svg });
    expect(tapClick.propagationStopped).toBe(false);

    // 25px touch drag -> MUST pan and suppress synthetic trailing click
    wrap.dispatch("pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 150,
      clientY: 150,
      target: svg,
    });
    wrap.dispatch("pointermove", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 175,
      clientY: 150,
      target: svg,
    });
    wrap.dispatch("pointerup", {
      pointerId: 2,
      pointerType: "touch",
      clientX: 175,
      clientY: 150,
      target: svg,
    });
    expect(app.catanMapViewport.panX).not.toBe(0);
    const dragClick = wrap.dispatch("click", { target: svg });
    expect(dragClick.propagationStopped).toBe(true);

    // Safari gesturestart/gesturechange prevented on map SVG, allowed on HUD
    const mapGesture = wrap.dispatch("gesturestart", { target: svg });
    expect(mapGesture.defaultPrevented).toBe(true);
    const hudGesture = wrap.dispatch("gesturestart", { target: zoomHud });
    expect(hudGesture.defaultPrevented).toBe(false);
  });

  test("scrolls to top on view-mode transitions without jumping scroll during in-game renders", () => {
    const scrollCalls: Array<[number, number]> = [];
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      location: { hash: "", protocol: "http:", host: "localhost:3000" },
      scrollTo: (x: number, y: number) => {
        scrollCalls.push([x, y]);
      },
    };

    try {
      const root: any = {
        innerHTML: "",
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
      };
      const app = new MultiGamePlatformApp(root, {
        forceLocalMode: true,
        startAtLogin: false,
      }) as any;
      app.autoRespondBotsToHuman = false;
      expect(scrollCalls.length).toBe(0);

      // Lobby -> Room Setup triggers scroll-to-top
      app.enterOrJoinRoom("room-1");
      expect(scrollCalls.length).toBe(1);
      expect(scrollCalls[0]).toEqual([0, 0]);

      // Room Setup -> In-Game triggers scroll-to-top
      app.startRoomMatch("room-1");
      expect(scrollCalls.length).toBe(2);
      expect(root.innerHTML).toContain("board-banner__status");
      expect(root.innerHTML).toContain("board-banner__controls");

      // In-place re-render inside the same game must NOT reset scroll
      app.render();
      expect(scrollCalls.length).toBe(2);
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  });
});
