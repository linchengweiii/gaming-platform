import { describe, expect, test } from "bun:test";
import type { CatanState } from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  DEFAULT_CATAN_MAP_VIEWPORT,
  formatCatanMapViewBoxPure,
  getCatanBoardViewBox,
  screenToSvgPointPure,
} from "../../apps/web/src/catan-graphics.ts";
import { CATAN_MAP_VIEWPORT_CONFIG } from "../../apps/web/src/config/app-config.ts";

function expectNear(actual: number, expected: number, eps = 1e-3): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

interface FakeEl {
  id: string;
  className: string;
  textContent: string;
  disabled: boolean;
  attrs: Record<string, string>;
  style: Record<string, string>;
  listeners: Record<string, Array<{ fn: (e: any) => void; capture: boolean }>>;
  classes: Set<string>;
  rect: { left: number; top: number; width: number; height: number };
  parent: FakeEl | null;
  children: FakeEl[];
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  addEventListener: (
    type: string,
    fn: (e: any) => void,
    opts?: boolean | { capture?: boolean; passive?: boolean }
  ) => void;
  dispatch: (type: string, ev?: Record<string, any>) => any;
  getBoundingClientRect: () => {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  closest: (sel: string) => FakeEl | null;
  querySelector: (sel: string) => FakeEl | null;
  querySelectorAll: (sel: string) => FakeEl[];
  classList: {
    add: (...c: string[]) => void;
    remove: (...c: string[]) => void;
    contains: (c: string) => boolean;
    toggle: (c: string, force?: boolean) => boolean;
  };
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
}

function makeFakeEl(opts: {
  id?: string;
  className?: string;
  attrs?: Record<string, string>;
  rect?: { left: number; top: number; width: number; height: number };
  parent?: FakeEl | null;
}): FakeEl {
  const classes = new Set((opts.className ?? "").split(/\s+/).filter(Boolean));
  const attrs: Record<string, string> = { ...(opts.attrs ?? {}) };
  const listeners: Record<
    string,
    Array<{ fn: (e: any) => void; capture: boolean }>
  > = {};
  const matchesSingle = (el: FakeEl, sel: string): boolean => {
    if (sel.startsWith("#")) return el.id === sel.slice(1);
    if (sel.startsWith(".")) return el.classes.has(sel.slice(1));
    const attrMatch = sel.match(/^\[([^\]]+)\]$/);
    if (attrMatch) return attrMatch[1]! in el.attrs;
    return false;
  };
  const matchesSelector = (el: FakeEl, sel: string): boolean =>
    sel
      .split(",")
      .map((s) => s.trim())
      .some((part) => matchesSingle(el, part));

  const el: FakeEl = {
    id: opts.id ?? "",
    className: opts.className ?? "",
    textContent: "",
    disabled: false,
    attrs,
    style: {},
    listeners,
    classes,
    rect: opts.rect ?? { left: 0, top: 0, width: 800, height: 600 },
    parent: opts.parent ?? null,
    children: [],
    setAttribute(k, v) {
      el.attrs[k] = String(v);
    },
    getAttribute(k) {
      return k in el.attrs ? el.attrs[k]! : null;
    },
    addEventListener(type, fn, rawOpts) {
      const capture =
        typeof rawOpts === "boolean" ? rawOpts : Boolean(rawOpts?.capture);
      el.listeners[type] = [...(el.listeners[type] ?? []), { fn, capture }];
    },
    dispatch(type, extra = {}) {
      let stopped = false;
      let prevented = false;
      const ev = {
        type,
        target: el,
        currentTarget: el,
        button: 0,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        deltaY: 0,
        deltaMode: 0,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault: () => {
          prevented = true;
        },
        stopPropagation: () => {
          stopped = true;
        },
        get defaultPrevented() {
          return prevented;
        },
        get propagationStopped() {
          return stopped;
        },
        ...extra,
      };
      const chain: FakeEl[] = [];
      let cur: FakeEl | null = el;
      while (cur) {
        chain.unshift(cur);
        cur = cur.parent;
      }
      for (const node of chain) {
        if (stopped) break;
        ev.currentTarget = node;
        for (const l of node.listeners[type] ?? []) {
          if (l.capture) l.fn(ev);
        }
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        if (stopped) break;
        const node = chain[i]!;
        ev.currentTarget = node;
        for (const l of node.listeners[type] ?? []) {
          if (!l.capture) l.fn(ev);
        }
      }
      return ev;
    },
    getBoundingClientRect() {
      return el.rect;
    },
    closest(sel) {
      let cur: FakeEl | null = el;
      while (cur) {
        if (matchesSelector(cur, sel)) return cur;
        cur = cur.parent;
      }
      return null;
    },
    querySelector(sel) {
      const stack = [...el.children];
      while (stack.length > 0) {
        const node = stack.shift()!;
        if (matchesSelector(node, sel)) return node;
        stack.push(...node.children);
      }
      return null;
    },
    querySelectorAll(sel) {
      const found: FakeEl[] = [];
      const stack = [...el.children];
      while (stack.length > 0) {
        const node = stack.shift()!;
        if (matchesSelector(node, sel)) found.push(node);
        stack.push(...node.children);
      }
      return found;
    },
    classList: {
      add: (...cs) => cs.forEach((c) => el.classes.add(c)),
      remove: (...cs) => cs.forEach((c) => el.classes.delete(c)),
      contains: (c) => el.classes.has(c),
      toggle: (c, force) => {
        const next = force !== undefined ? force : !el.classes.has(c);
        if (next) el.classes.add(c);
        else el.classes.delete(c);
        return next;
      },
    },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  };
  if (opts.parent) opts.parent.children.push(el);
  return el;
}

function buildInteractiveDomHarness() {
  const rootEl = makeFakeEl({ id: "app" });
  const wrapEl = makeFakeEl({
    className: "board-svg-wrap",
    rect: { left: 0, top: 0, width: 800, height: 600 },
    parent: rootEl,
  });
  const svgEl = makeFakeEl({
    className: "board-svg",
    rect: { left: 0, top: 0, width: 800, height: 600 },
    parent: wrapEl,
  });
  const hexEl = makeFakeEl({
    className: "spot-hex-group",
    attrs: { "data-spot-hex": "0,0" },
    parent: svgEl,
  });
  const controlsEl = makeFakeEl({
    className: "map-zoom-controls",
    parent: wrapEl,
  });
  const btnOut = makeFakeEl({ id: "btn-map-zoom-out", parent: controlsEl });
  const btnReset = makeFakeEl({ id: "btn-map-zoom-reset", parent: controlsEl });
  const btnIn = makeFakeEl({ id: "btn-map-zoom-in", parent: controlsEl });

  const appRoot: any = {
    innerHTML: "",
    querySelector: (sel: string) => rootEl.querySelector(sel),
    querySelectorAll: (sel: string) => rootEl.querySelectorAll(sel),
    addEventListener: rootEl.addEventListener,
  };
  const uiApp = new MultiGamePlatformApp(appRoot, {
    forceLocalMode: true,
  }) as any;
  uiApp.autoRespondBotsToHuman = false;
  uiApp.startSoloGameFromLogin("Alice");
  const room = uiApp.getActiveRoom();
  room.startingPlayerMode = "first";
  uiApp.startRoomMatch(room.roomId);

  const state = room.session.getState() as CatanState;
  const baseVb = getCatanBoardViewBox(state);
  svgEl.setAttribute(
    "viewBox",
    formatCatanMapViewBoxPure(baseVb, DEFAULT_CATAN_MAP_VIEWPORT)
  );

  return { uiApp, room, state, baseVb, wrapEl, svgEl, hexEl, btnOut, btnReset, btnIn };
}

describe("@gaming-platform/catan - Interactive DOM Map Zoom & Pan Controls", () => {
  test("supports zoom buttons, cursor-anchored wheel zoom, drag pan with click suppression, short click pass-through, and HUD exclusion", () => {
    const { uiApp, baseVb, wrapEl, svgEl, hexEl, btnOut, btnReset, btnIn } =
      buildInteractiveDomHarness();

    // 1. Click Zoom In button
    btnIn.dispatch("click");
    expectNear(
      uiApp.catanMapViewport.zoom,
      1 + CATAN_MAP_VIEWPORT_CONFIG.zoomStep,
      1e-4
    );
    expect(btnReset.textContent).toBe("125%");
    expect(btnReset.disabled).toBe(false);

    // 2. Wheel zoom anchored at (600, 200)
    const vpBeforeWheel = { ...uiApp.catanMapViewport };
    const worldBeforeWheel = screenToSvgPointPure(
      baseVb,
      vpBeforeWheel,
      svgEl.rect,
      600,
      200
    );
    const wheelEv = svgEl.dispatch("wheel", {
      deltaY: -120,
      clientX: 600,
      clientY: 200,
    });
    expect(wheelEv.defaultPrevented).toBe(true);
    expect(uiApp.catanMapViewport.zoom).toBeGreaterThan(vpBeforeWheel.zoom);
    const worldAfterWheel = screenToSvgPointPure(
      baseVb,
      uiApp.catanMapViewport,
      svgEl.rect,
      600,
      200
    );
    expectNear(worldAfterWheel.x, worldBeforeWheel.x, 0.2);
    expectNear(worldAfterWheel.y, worldBeforeWheel.y, 0.2);
    expect(svgEl.getAttribute("viewBox")).toBe(
      formatCatanMapViewBoxPure(baseVb, uiApp.catanMapViewport)
    );

    // 3. Drag on hex pans map and suppresses synthetic click
    let hexClicks = 0;
    hexEl.addEventListener("click", () => {
      hexClicks += 1;
    });
    const panBeforeDrag = uiApp.catanMapViewport.panX;
    hexEl.dispatch("pointerdown", { pointerId: 7, clientX: 400, clientY: 300 });
    hexEl.dispatch("pointermove", { pointerId: 7, clientX: 460, clientY: 320 });
    expect(wrapEl.classList.contains("is-panning")).toBe(true);
    expect(uiApp.catanMapViewport.panX).toBeLessThan(panBeforeDrag);
    hexEl.dispatch("pointerup", { pointerId: 7, clientX: 460, clientY: 320 });
    expect(wrapEl.classList.contains("is-panning")).toBe(false);
    hexEl.dispatch("click");
    expect(hexClicks).toBe(0);

    // 4. Short click (< drag threshold) delivers click without panning
    const panBeforeShortClick = uiApp.catanMapViewport.panX;
    hexEl.dispatch("pointerdown", { pointerId: 8, clientX: 400, clientY: 300 });
    hexEl.dispatch("pointermove", { pointerId: 8, clientX: 402, clientY: 301 });
    hexEl.dispatch("pointerup", { pointerId: 8, clientX: 402, clientY: 301 });
    expectNear(uiApp.catanMapViewport.panX, panBeforeShortClick, 1e-4);
    hexEl.dispatch("click");
    expect(hexClicks).toBe(1);

    // 5. Pointerdown on HUD controls does not pan map
    const panBeforeHudDrag = uiApp.catanMapViewport.panX;
    btnIn.dispatch("pointerdown", { pointerId: 9, clientX: 760, clientY: 30 });
    btnIn.dispatch("pointermove", { pointerId: 9, clientX: 700, clientY: 90 });
    btnIn.dispatch("pointerup", { pointerId: 9, clientX: 700, clientY: 90 });
    expectNear(uiApp.catanMapViewport.panX, panBeforeHudDrag, 1e-4);

    // 6. Reset button restores 100% centered view
    btnReset.dispatch("click");
    expect(uiApp.catanMapViewport).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
    expect(btnReset.textContent).toBe("100%");
    expect(btnReset.disabled).toBe(true);
    expect(btnOut.disabled).toBe(true);
  });

  test("supports two-finger pinch zoom and remains active during GAME_OVER", () => {
    const { uiApp, room, wrapEl, svgEl, btnIn } = buildInteractiveDomHarness();

    // Two-finger pinch out increases zoom
    svgEl.dispatch("pointerdown", { pointerId: 11, clientX: 350, clientY: 300 });
    svgEl.dispatch("pointerdown", { pointerId: 12, clientX: 450, clientY: 300 });
    expect(wrapEl.classList.contains("is-panning")).toBe(true);
    svgEl.dispatch("pointermove", { pointerId: 12, clientX: 550, clientY: 300 });
    expect(uiApp.catanMapViewport.zoom).toBeGreaterThan(1.5);
    svgEl.dispatch("pointerup", { pointerId: 11, clientX: 350, clientY: 300 });
    svgEl.dispatch("pointerup", { pointerId: 12, clientX: 550, clientY: 300 });
    expect(wrapEl.classList.contains("is-panning")).toBe(false);

    // Reset and enter GAME_OVER -> zoom controls still work!
    uiApp.catanMapViewport = { ...DEFAULT_CATAN_MAP_VIEWPORT };
    const mutable = room.session.getState() as any;
    mutable.phase = "GAME_OVER";
    mutable.winnerId = room.players[0]!.id;
    // Clear existing listeners on fake elements before re-render binding
    btnIn.listeners = {};
    wrapEl.listeners = {};
    uiApp.render();

    btnIn.dispatch("click");
    expectNear(
      uiApp.catanMapViewport.zoom,
      1 + CATAN_MAP_VIEWPORT_CONFIG.zoomStep,
      1e-4
    );
  });
});
