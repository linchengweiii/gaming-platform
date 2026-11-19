import { describe, expect, test } from "bun:test";
import { resolveEffectiveViewerIdPure } from "../../apps/server/src/index.ts";
import {
  CatanEngine,
  type CatanState,
  type PendingCkInteraction,
  getNextActingPlayerId,
} from "../../packages/games/catan/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import { createFakeDomRoot, readCombinedWebStyles } from "../server/helpers.ts";

function setupMainPhaseCatanApp(enableCitiesAndKnights = false) {
  const uiRoot = createFakeDomRoot();
  const uiApp = new MultiGamePlatformApp(uiRoot, {
    forceLocalMode: true,
  }) as any;
  uiApp.autoRespondBotsToHuman = false;
  uiApp.startOfflineLocalFromLogin("Alice");
  const room = uiApp.getActiveRoom();
  uiApp.addLocalFriendToRoom(room, "Bob");
  room.botCount = 1;
  room.startingPlayerMode = "first";
  if (enableCitiesAndKnights) {
    room.config.scenarioId = "cities_and_knights";
    room.config.enableCitiesAndKnights = true;
    room.config.enableCityWalls = true;
  }
  uiApp.rebuildRoomSeats(room);
  uiApp.startRoomMatch(room.roomId);
  uiApp.finishSetupWithBots();

  const aliceId = room.players[0]!.id as string;
  const bobId = room.players[1]!.id as string;
  uiApp.dispatch(aliceId, { type: "ROLL_DICE" });
  while (room.session.getState().phase !== "MAIN_PHASE") {
    const cur = room.session.getState();
    const actId = getNextActingPlayerId(cur)!;
    uiApp.dispatch(actId, CatanEngine.chooseBotAction(cur, actId)!);
  }
  return { uiRoot, uiApp, room, aliceId, bobId };
}

describe("@gaming-platform/catan - Web UI Layout Fixes & Multi-Step C&K Modals", () => {
  test("prevents Pass-and-Play hidden-hand sub-modal softlock and hides Build/End Turn HUD during active trade offers", () => {
    const { uiRoot, uiApp, room, aliceId, bobId } = setupMainPhaseCatanApp(false);
    const st = room.session.getState() as CatanState;

    // Give Alice and Bob resources so Alice can propose a trade
    st.players[0]!.resources.brick += 2;
    st.bank.brick -= 2;
    st.players[1]!.resources.ore += 2;
    st.bank.ore -= 2;

    // 1. Active trade offer hides Build Dock & End Turn HUD so controls never collide
    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: bobId,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(uiRoot.innerHTML).not.toContain('class="map-build-dock');
    expect(uiRoot.innerHTML).not.toContain('class="map-end-turn-hud"');

    // 2. When Pass-and-Play privacy screen is active, sub-modal MUST NOT cover #btn-reveal-hand
    uiApp.hidePassAndPlayHand = true;
    uiApp.render();
    expect(uiRoot.innerHTML).toContain('id="btn-reveal-hand"');
    expect(uiRoot.innerHTML).not.toContain('class="sub-modal');

    // Once revealed, the trade decision modal renders cleanly
    uiApp.hidePassAndPlayHand = false;
    uiApp.render();
    expect(uiRoot.innerHTML).toContain("sub-modal--trade-offer");
  });

  test("renders non-blocking harbor markers, transparent occupied rings, dev/progress card tooltips, and non-clipping CSS rules", () => {
    const css = readCombinedWebStyles();
    expect(css).toContain("bottom: -184px;");
    expect(css).toContain(".ga-res-matrix--ck");
    expect(css).toContain(".map-spot-popover--aligned");
    expect(css).toContain(".map-build-dock__panel");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain(".ga-topbar-user-group");
    expect(css).toContain(".ga-tutorial-coach--lifted");

    const { room, aliceId } = setupMainPhaseCatanApp(true);
    const st = room.session.getState() as CatanState;
    const aliceSettlementVertexId = Object.entries(st.buildings).find(
      ([, b]) => b.ownerId === aliceId && b.type === "settlement"
    )![0];
    const alice = st.players.find((p) => p.id === aliceId)!;
    alice.resources.grain += 2;
    alice.resources.ore += 3;

    const svg = renderCatanBoardSvg(st, aliceId, {
      buildMode: "city",
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
    });
    // Harbor markers never swallow clicks over sea hexes / Pirate ship
    expect(svg).toContain('class="harbor-marker" pointer-events="none"');
    // Occupied clickable vertex uses transparent glowing ring instead of opaque disc
    expect(svg).toContain(`data-vertex-id="${aliceSettlementVertexId}"`);
    expect(svg).toContain('fill="transparent" stroke="#fde047"');

    // Visual hand tray includes full title tooltips on Progress cards and concise "Play" button
    (alice.progressCards as any[]).push({
      id: "pc-test-spy",
      type: "spy",
      discipline: "politics",
      drawnOnTurn: 0,
      played: false,
    });
    const bob = st.players.find((p) => p.id !== aliceId)!;
    (bob.progressCards as any[]).push({
      id: "pc-bob-target",
      type: "alchemist",
      discipline: "science",
      drawnOnTurn: 0,
      played: false,
    });
    const trayHtml = renderCatanVisualHandTray(
      st,
      alice,
      CatanEngine.getLegalActions(st, aliceId)
    );
    expect(trayHtml).toContain("title=");
    expect(trayHtml).toContain(">Play</button>");
  });

  test("renders interactive controls for every CK_INTERACTION sub-phase modal", () => {
    const { uiRoot, uiApp, room, aliceId, bobId } = setupMainPhaseCatanApp(true);
    const st = room.session.getState() as CatanState;

    const bob = st.players.find((p) => p.id === bobId)!;
    bob.resources.brick = 1;
    bob.commodities.cloth = 1;
    (bob.progressCards as any[]).push({
      id: "pc-bob-1",
      type: "alchemist",
      discipline: "science",
      drawnOnTurn: 0,
      played: false,
    });
    const alice = st.players.find((p) => p.id === aliceId)!;
    alice.resources.lumber = 1;
    alice.commodities.paper = 1;

    const allVertices = Object.keys(st.topology.vertices);
    const v1 = allVertices[0]!;
    const v2 = allVertices[1]!;

    const scenarios: Array<{
      interaction: PendingCkInteraction;
      expectedSnippets: string[];
    }> = [
      {
        interaction: {
          kind: "displace_knight",
          actorId: aliceId,
          knight: {
            ownerId: aliceId,
            level: 1,
            active: true,
            activatedThisTurn: false,
            promotedThisTurn: false,
            actedThisTurn: false,
          },
          fromVertexId: v1,
          candidateVertexIds: [v2],
        },
        expectedSnippets: ["data-ck-retreat-vertex=", "Displaced Knight"],
      },
      {
        interaction: {
          kind: "deserter_choose_knight",
          actorId: bobId,
          initiatorId: aliceId,
          candidateVertexIds: [v1],
        },
        expectedSnippets: ["data-ck-deserter-pick=", "Deserter"],
      },
      {
        interaction: {
          kind: "deserter_place_knight",
          actorId: aliceId,
          targetPlayerId: bobId,
          vacatedVertexId: v1,
          knightLevel: 2,
          knightActive: true,
          candidateVertexIds: [v2],
        },
        expectedSnippets: ["data-ck-deserter-place=", "Deserter Recruit"],
      },
      {
        interaction: {
          kind: "spy_choose_card",
          actorId: aliceId,
          targetPlayerId: bobId,
        },
        expectedSnippets: ['data-ck-spy-card="pc-bob-1"', "Alchemist"],
      },
      {
        interaction: {
          kind: "master_merchant_choose_cards",
          actorId: aliceId,
          targetPlayerId: bobId,
          maxCards: 2,
        },
        expectedSnippets: ['id="btn-ck-mm-submit"', "Master Merchant"],
      },
      {
        interaction: {
          kind: "wedding_give_cards",
          actorId: aliceId,
          initiatorId: bobId,
          remainingGiverIds: [],
          requiredCount: 2,
        },
        expectedSnippets: ['id="btn-ck-wedding-submit"', "Wedding"],
      },
      {
        interaction: {
          kind: "commercial_harbor_offer",
          actorId: aliceId,
          offeredPlayerIds: [],
          eligibleTargetIds: [bobId],
        },
        expectedSnippets: [
          "data-ck-ch-offer=",
          'id="btn-ck-ch-end"',
          "Commercial Harbor",
        ],
      },
      {
        interaction: {
          kind: "commercial_harbor_respond",
          actorId: aliceId,
          initiatorId: bobId,
          offeredResource: "brick",
          offeredPlayerIds: [],
        },
        expectedSnippets: ["data-ck-ch-resp=", "Commercial Harbor"],
      },
    ];

    for (const { interaction, expectedSnippets } of scenarios) {
      const mutable = room.session.getState() as any;
      mutable.phase = "CK_INTERACTION";
      mutable.pendingCkInteraction = interaction;
      uiApp.render();
      for (const snippet of expectedSnippets) {
        expect(uiRoot.innerHTML).toContain(snippet);
      }
    }
  });

  test("keeps player hand tray unobstructed during incoming domestic and Commercial Harbor trades and resolves responder viewer accurately", () => {
    const css = readCombinedWebStyles();
    expect(css).toContain(
      ".ga-game-canvas .action-dock > .sub-modal.sub-modal--trade-offer"
    );
    expect(css).toContain(
      ".ga-game-canvas .action-dock > .sub-modal.sub-modal--keep-hand"
    );
    expect(css).toContain("bottom: 0;");
    expect(css).toContain(".ga-trade-offer-bar");

    // 1. Base Catan incoming domestic trade: responder sees You get / You give / (have N) AND full visual-hand-tray
    const { uiRoot, uiApp, room, aliceId, bobId } = setupMainPhaseCatanApp(false);
    const st = room.session.getState() as CatanState;
    for (const p of st.players) {
      for (const r of ["brick", "lumber", "wool", "grain", "ore"] as const) {
        st.bank[r] += p.resources[r];
        p.resources[r] = 0;
      }
    }
    st.players[0]!.resources.brick = 2;
    st.bank.brick -= 2;
    st.players[1]!.resources.ore = 3;
    st.bank.ore -= 3;

    uiApp.dispatch(aliceId, {
      type: "OFFER_DOMESTIC_TRADE",
      toPlayerId: bobId,
      give: { brick: 1 },
      want: { ore: 1 },
    });
    expect(uiRoot.innerHTML).toContain("sub-modal--trade-offer");
    expect(uiRoot.innerHTML).toContain("You get");
    expect(uiRoot.innerHTML).toContain("You give");
    expect(uiRoot.innerHTML).toContain("(have 3)");
    expect(uiRoot.innerHTML).toContain('class="visual-hand-tray"');
    expect(uiRoot.innerHTML.indexOf("sub-modal--trade-offer")).toBeLessThan(
      uiRoot.innerHTML.indexOf('class="visual-hand-tray"')
    );

    // 2. Cities & Knights Commercial Harbor response uses sub-modal--keep-hand and displays owned commodity counts
    const ck = setupMainPhaseCatanApp(true);
    const ckState = ck.room.session.getState() as CatanState;
    const ckAlice = ckState.players.find((p) => p.id === ck.aliceId)!;
    ckAlice.commodities.paper = 2;
    const mutableCk = ckState as any;
    mutableCk.phase = "CK_INTERACTION";
    mutableCk.pendingCkInteraction = {
      kind: "commercial_harbor_respond",
      actorId: ck.aliceId,
      initiatorId: ck.bobId,
      offeredResource: "brick",
      offeredPlayerIds: [],
    } satisfies PendingCkInteraction;
    ck.uiApp.render();
    expect(ck.uiRoot.innerHTML).toContain("sub-modal--keep-hand");
    expect(ck.uiRoot.innerHTML).toContain("Give Paper (×2)");
    expect(ck.uiRoot.innerHTML).toContain("visual-hand-tray");

    // 3. Server viewer resolution prioritizes the responder's own hand even when a local guest proposed the trade
    const resolvedViewer = resolveEffectiveViewerIdPure(
      {
        gameId: "catan",
        players: [
          { id: "host-1", name: "Host", color: "#e11d48", isBot: false },
          {
            id: "guest-local",
            name: "Local Guest",
            color: "#2563eb",
            isBot: false,
            controllerId: "host-1",
          },
        ],
      },
      "host-1",
      "host-1",
      {
        activeTradeOffer: { fromPlayerId: "guest-local" },
      }
    );
    expect(resolvedViewer).toBe("host-1");
  });
});
