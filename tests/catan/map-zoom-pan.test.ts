import { describe, expect, test } from "bun:test";
import {
  CatanEngine,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  DEFAULT_CATAN_MAP_VIEWPORT,
  clampCatanMapViewportPure,
  computeCatanCameraViewBoxPure,
  computeSvgPixelScalePure,
  formatCatanMapViewBoxPure,
  formatCatanZoomPercentPure,
  getBoardSpotPercentPosition,
  getCatanBoardViewBox,
  isDefaultCatanMapViewportPure,
  panCatanMapByPixelsPure,
  renderCatanBoardSvg,
  resetCatanMapViewportPure,
  screenToSvgPointPure,
  stepCatanMapZoomPure,
  zoomCatanMapAtPointPure,
} from "../../apps/web/src/catan-graphics.ts";
import { CATAN_MAP_VIEWPORT_CONFIG } from "../../apps/web/src/config/app-config.ts";
import { createFakeDomRoot, readCombinedWebStyles } from "../server/helpers.ts";

function expectNear(actual: number, expected: number, eps = 1e-3): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
}

function setupInteractiveCatanApp(enableCitiesAndKnights = false) {
  const uiRoot = createFakeDomRoot();
  const uiApp = new MultiGamePlatformApp(uiRoot, {
    forceLocalMode: true,
  }) as any;
  uiApp.autoRespondBotsToHuman = false;
  uiApp.startSoloGameFromLogin("Alice");
  const room = uiApp.getActiveRoom();
  room.startingPlayerMode = "first";
  if (enableCitiesAndKnights) {
    room.config.scenarioId = "cities_and_knights";
    room.config.enableCitiesAndKnights = true;
    room.config.enableCityWalls = true;
  }
  uiApp.startRoomMatch(room.roomId);
  return { uiRoot, uiApp, room };
}

describe("@gaming-platform/catan - Map Zoom & Pan Viewport Math", () => {
  const baseVb = { vbX: -300, vbY: -250, vbW: 600, vbH: 500 };

  test("default viewport preserves exact integer base viewBox and identifies default state", () => {
    expect(DEFAULT_CATAN_MAP_VIEWPORT).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(isDefaultCatanMapViewportPure(DEFAULT_CATAN_MAP_VIEWPORT)).toBe(true);
    expect(isDefaultCatanMapViewportPure({ zoom: 1.25, panX: 0, panY: 0 })).toBe(
      false
    );
    expect(isDefaultCatanMapViewportPure({ zoom: 1, panX: 15, panY: 0 })).toBe(
      false
    );

    const cam = computeCatanCameraViewBoxPure(baseVb, DEFAULT_CATAN_MAP_VIEWPORT);
    expect(cam).toEqual(baseVb);
    expect(formatCatanMapViewBoxPure(baseVb, DEFAULT_CATAN_MAP_VIEWPORT)).toBe(
      "-300 -250 600 500"
    );
    expect(formatCatanZoomPercentPure(1)).toBe("100%");
    expect(formatCatanZoomPercentPure(1.5)).toBe("150%");
  });

  test("clamps zoom within [minZoom, maxZoom] and bounds pan so camera never leaves the map", () => {
    const lowZoom = clampCatanMapViewportPure(
      { zoom: 0.2, panX: 9999, panY: -9999 },
      baseVb
    );
    expect(lowZoom.zoom).toBe(CATAN_MAP_VIEWPORT_CONFIG.minZoom);
    expect(Math.abs(lowZoom.panX)).toBeLessThanOrEqual(
      baseVb.vbW * CATAN_MAP_VIEWPORT_CONFIG.panOverflowRatio + 0.001
    );
    expect(Math.abs(lowZoom.panY)).toBeLessThanOrEqual(
      baseVb.vbH * CATAN_MAP_VIEWPORT_CONFIG.panOverflowRatio + 0.001
    );

    const highZoom = clampCatanMapViewportPure(
      { zoom: 99, panX: 9999, panY: -9999 },
      baseVb
    );
    expect(highZoom.zoom).toBe(CATAN_MAP_VIEWPORT_CONFIG.maxZoom);
    expect(Math.abs(highZoom.panX)).toBeLessThanOrEqual(
      baseVb.vbW * CATAN_MAP_VIEWPORT_CONFIG.maxPanCenterRatio + 0.001
    );
    expect(Math.abs(highZoom.panY)).toBeLessThanOrEqual(
      baseVb.vbH * CATAN_MAP_VIEWPORT_CONFIG.maxPanCenterRatio + 0.001
    );

    const nanGuard = clampCatanMapViewportPure(
      { zoom: Number.NaN, panX: Number.POSITIVE_INFINITY, panY: Number.NaN },
      baseVb
    );
    expect(nanGuard).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
  });

  test("stepCatanMapZoomPure increments/decrements cleanly and resetCatanMapViewportPure restores default", () => {
    const z1 = stepCatanMapZoomPure(DEFAULT_CATAN_MAP_VIEWPORT, 1, baseVb);
    expectNear(z1.zoom, 1 + CATAN_MAP_VIEWPORT_CONFIG.zoomStep, 1e-4);

    const z2 = stepCatanMapZoomPure(z1, 1, baseVb);
    expectNear(z2.zoom, 1 + CATAN_MAP_VIEWPORT_CONFIG.zoomStep * 2, 1e-4);

    const zBack = stepCatanMapZoomPure(z2, -1, baseVb);
    expectNear(zBack.zoom, z1.zoom, 1e-4);

    const zFloor = stepCatanMapZoomPure(DEFAULT_CATAN_MAP_VIEWPORT, -1, baseVb);
    expect(zFloor.zoom).toBe(CATAN_MAP_VIEWPORT_CONFIG.minZoom);

    expect(resetCatanMapViewportPure()).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
  });

  test("zoomCatanMapAtPointPure keeps the SVG world point pinned under the cursor pixel", () => {
    const svgRect = { left: 100, top: 50, width: 1000, height: 500 };
    const startVp = { zoom: 1, panX: 0, panY: 0 };
    const cursorX = 720;
    const cursorY = 180;

    const worldBefore = screenToSvgPointPure(
      baseVb,
      startVp,
      svgRect,
      cursorX,
      cursorY
    );
    const zoomedVp = zoomCatanMapAtPointPure(
      startVp,
      2.0,
      worldBefore.x,
      worldBefore.y,
      baseVb
    );
    const worldAfter = screenToSvgPointPure(
      baseVb,
      zoomedVp,
      svgRect,
      cursorX,
      cursorY
    );

    expectNear(zoomedVp.zoom, 2.0, 1e-4);
    expectNear(worldAfter.x, worldBefore.x, 1e-2);
    expectNear(worldAfter.y, worldBefore.y, 1e-2);
  });

  test("panCatanMapByPixelsPure translates pointer drag 1:1 into world pan and clamps to edges", () => {
    const svgRect = { left: 0, top: 0, width: 1200, height: 1000 };
    const startVp = { zoom: 2, panX: 0, panY: 0 };
    const scale = computeSvgPixelScalePure(baseVb, startVp, svgRect);
    expectNear(scale, 4, 1e-4);

    const panned = panCatanMapByPixelsPure(startVp, 80, 40, baseVb, svgRect);
    expectNear(panned.panX, -20, 1e-3);
    expectNear(panned.panY, -10, 1e-3);

    const clamped = panCatanMapByPixelsPure(
      startVp,
      100_000,
      -100_000,
      baseVb,
      svgRect
    );
    expect(Math.abs(clamped.panX)).toBeLessThanOrEqual(
      baseVb.vbW * CATAN_MAP_VIEWPORT_CONFIG.maxPanCenterRatio + 0.001
    );
    expect(Math.abs(clamped.panY)).toBeLessThanOrEqual(
      baseVb.vbH * CATAN_MAP_VIEWPORT_CONFIG.maxPanCenterRatio + 0.001
    );
  });
});

describe("@gaming-platform/catan - SVG, Popover & Web UI Zoom/Pan Integration", () => {
  test("renderCatanBoardSvg applies camera viewBox while keeping nautical chart rings world-fixed and updating spot popover percent", () => {
    const state = CatanEngine.initGame(
      [
        { id: "p1", name: "Alice", color: "#e11d48", isBot: false },
        { id: "p2", name: "Bot 1", color: "#2563eb", isBot: true },
        { id: "p3", name: "Bot 2", color: "#16a34a", isBot: true },
      ],
      { scenarioId: "standard" },
      "zoom-svg-seed"
    );
    const baseVb = getCatanBoardViewBox(state);
    const baseOpts = {
      buildMode: null,
      setupEdgeKind: "road" as const,
      robberOrPirateMode: "robber" as const,
      selectedMoveFromEdgeId: null,
    };

    const svgDefault = renderCatanBoardSvg(state, "p1", baseOpts);
    const svgExplicitDefault = renderCatanBoardSvg(state, "p1", {
      ...baseOpts,
      viewport: DEFAULT_CATAN_MAP_VIEWPORT,
    });
    expect(svgExplicitDefault).toBe(svgDefault);

    const zoomedVp = { zoom: 2, panX: 40, panY: -30 };
    const svgZoomed = renderCatanBoardSvg(state, "p1", {
      ...baseOpts,
      viewport: zoomedVp,
    });
    const expectedVb = formatCatanMapViewBoxPure(baseVb, zoomedVp);
    expect(svgZoomed).toContain(`viewBox="${expectedVb}"`);
    const expectedRingR = Math.round(Math.min(baseVb.vbW, baseVb.vbH) * 0.44);
    expect(svgZoomed).toContain(`r="${expectedRingR}"`);

    const sampleHexId = state.topology.hexOrder[0]!;
    const posDefault = getBoardSpotPercentPosition(state, {
      kind: "hex",
      id: sampleHexId,
    });
    const posZoomed = getBoardSpotPercentPosition(
      state,
      { kind: "hex", id: sampleHexId },
      zoomedVp
    );
    expect(
      posZoomed.xPct !== posDefault.xPct || posZoomed.yPct !== posDefault.yPct
    ).toBe(true);
  });

  test("renders map zoom controls on Catan (with C&K offset), omits them on non-Catan games, and includes required CSS", () => {
    const css = readCombinedWebStyles();
    expect(css).toContain(".map-zoom-controls");
    expect(css).toContain(".map-zoom-controls--below-barbarian");
    expect(css).toContain(".board-svg-wrap.is-panning");
    expect(css).toContain("touch-action: none;");

    const { uiRoot, uiApp } = setupInteractiveCatanApp(false);
    expect(uiRoot.innerHTML).toContain('class="map-zoom-controls "');
    expect(uiRoot.innerHTML).toContain('id="btn-map-zoom-out"');
    expect(uiRoot.innerHTML).toContain('id="btn-map-zoom-reset"');
    expect(uiRoot.innerHTML).toContain('id="btn-map-zoom-in"');
    expect(uiRoot.innerHTML).toContain(">100%<");
    expect(uiRoot.innerHTML).not.toContain("map-zoom-controls--below-barbarian");

    const ck = setupInteractiveCatanApp(true);
    expect(ck.uiRoot.innerHTML).toContain("map-barbarian-hud");
    expect(ck.uiRoot.innerHTML).toContain("map-zoom-controls--below-barbarian");

    uiApp.enterOrJoinRoom("room-3");
    uiApp.startRoomMatch("room-3");
    expect(uiRoot.innerHTML).not.toContain("map-zoom-controls");
  });

  test("persists zoom & pan across game turns/actions and resets cleanly on new match or room exit", () => {
    const { uiRoot, uiApp, room } = setupInteractiveCatanApp(false);
    uiApp.finishSetupWithBots();
    const aliceId = room.players[0]!.id as string;

    uiApp.catanMapViewport = { zoom: 1.75, panX: 35, panY: -20 };
    uiApp.render();
    expect(uiRoot.innerHTML).toContain(">175%<");

    uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
    while (room.session.getState().phase !== "MAIN_PHASE") {
      const cur = room.session.getState();
      const actId = getNextActingPlayerId(cur)!;
      uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
    }
    expectNear(uiApp.catanMapViewport.zoom, 1.75, 1e-4);
    expectNear(uiApp.catanMapViewport.panX, 35, 1e-4);
    expect(uiRoot.innerHTML).toContain(">175%<");

    uiApp.dispatch(aliceId, { type: "END_TURN" });
    expectNear(uiApp.catanMapViewport.zoom, 1.75, 1e-4);
    expect(uiRoot.innerHTML).toContain('id="btn-map-zoom-in"');

    uiApp.startRoomMatch(room.roomId);
    expect(uiApp.catanMapViewport).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
    expect(uiRoot.innerHTML).toContain(">100%<");

    uiApp.catanMapViewport = { zoom: 2, panX: 25, panY: 25 };
    uiApp.leaveActiveRoom();
    expect(uiApp.catanMapViewport).toEqual(DEFAULT_CATAN_MAP_VIEWPORT);
  });
});
