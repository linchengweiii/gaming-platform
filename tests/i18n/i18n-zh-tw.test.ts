import { describe, expect, test } from "bun:test";
import { AzulEngine } from "../../packages/games/azul/src/index.ts";
import {
  CatanEngine,
  PROGRESS_CARD_CATALOG,
  SELECTABLE_SCENARIO_IDS,
  type ProgressCardType,
} from "../../packages/games/catan/src/index.ts";
import {
  ALL_WONDER_IDS,
  SEVEN_WONDERS_AGE_I_CARDS,
  SEVEN_WONDERS_AGE_II_CARDS,
  SEVEN_WONDERS_AGE_III_BASE_CARDS,
  SEVEN_WONDERS_GUILD_CARDS,
  SevenWondersEngine,
} from "../../packages/games/seven-wonders/src/index.ts";
import {
  SPLENDOR_NOBLES,
  SplendorEngine,
} from "../../packages/games/splendor/src/index.ts";
import { MultiGamePlatformApp } from "../../apps/web/src/app.ts";
import { LOCALE_STORAGE_KEY } from "../../apps/web/src/config/app-config.ts";
import {
  EN_MESSAGES,
  SUPPORTED_LOCALES,
  ZH_TW_MESSAGES,
  detectBrowserLocale,
  getAzulTileLabelLocalized,
  getCatanProgressCardTextLocalized,
  getCatanScenarioTextLocalized,
  getGameReferenceGuideLocalized,
  getSevenWondersCardNameLocalized,
  getSevenWondersWonderNameLocalized,
  getSplendorNobleNameLocalized,
  getTutorialLessonsLocalized,
  localizeEventLogMessage,
  normalizeLocale,
  t,
} from "../../apps/web/src/i18n/index.ts";
import {
  renderCatanBoardSvg,
  renderCatanVisualHandTray,
} from "../../apps/web/src/catan-graphics.ts";
import { renderAzulBoardView } from "../../apps/web/src/azul-view.ts";
import { renderSevenWondersBoardView } from "../../apps/web/src/views/seven-wonders/board-view.ts";
import { renderScorepadHtml } from "../../apps/web/src/views/seven-wonders/scorepad.ts";
import { renderSplendorBoardView } from "../../apps/web/src/splendor-view.ts";
import {
  renderReferenceGuideModalPure,
  renderTutorialCoachBannerPure,
} from "../../apps/web/src/tutorials/guide-modal.ts";

function makeRootMock() {
  return {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
}

function makePlayers(count: number) {
  const colors = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b"];
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: colors[i % colors.length]!,
    isBot: i > 0,
    botDifficulty: "smart" as const,
  }));
}

function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

describe("i18n framework & Traditional Chinese (zh-TW) localization", () => {
  test("maintains 1:1 key and placeholder parity between EN_MESSAGES and ZH_TW_MESSAGES", () => {
    const enKeys = Object.keys(EN_MESSAGES).sort();
    const zhKeys = Object.keys(ZH_TW_MESSAGES).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain("en");
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain("zh-TW");

    for (const key of enKeys as Array<keyof typeof EN_MESSAGES>) {
      const enVal = EN_MESSAGES[key];
      const zhVal = ZH_TW_MESSAGES[key];
      expect(enVal.trim().length).toBeGreaterThan(0);
      expect(zhVal.trim().length).toBeGreaterThan(0);
      expect(extractPlaceholders(zhVal)).toEqual(extractPlaceholders(enVal));
    }
  });

  test("normalizes and detects Traditional Chinese and fallback locales accurately", () => {
    expect(normalizeLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeLocale("zh-HK")).toBe("zh-TW");
    expect(normalizeLocale("zh-MO")).toBe("zh-TW");
    expect(normalizeLocale("zh-Hant")).toBe("zh-TW");
    expect(normalizeLocale("zh_Hant_TW")).toBe("zh-TW");
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();

    expect(detectBrowserLocale(["zh-Hant-TW", "en-US"])).toBe("zh-TW");
    expect(detectBrowserLocale(["ja-JP", "zh-HK"])).toBe("zh-TW");
    expect(detectBrowserLocale(["en-US", "zh-TW"])).toBe("en");
    expect(detectBrowserLocale(["fr-FR", "de-DE"])).toBe("en");
    expect(detectBrowserLocale([])).toBe("en");

    expect(t("zh-TW", "lobby.openCount", { count: 4 })).toBe("4 間開放");
    expect(t("en", "lobby.openCount", { count: 4 })).toBe("4 open");
  });

  test("covers all domain catalogs (Catan scenarios & C&K progress, Splendor nobles, Azul tiles, 7 Wonders cards & wonders, tutorials, guides)", () => {
    for (const scId of SELECTABLE_SCENARIO_IDS) {
      const zh = getCatanScenarioTextLocalized(scId, "zh-TW");
      expect(zh.name.length).toBeGreaterThan(0);
      expect(zh.subtitle.length).toBeGreaterThan(0);
      expect(zh.description.length).toBeGreaterThan(0);
    }

    for (const cardType of Object.keys(
      PROGRESS_CARD_CATALOG
    ) as ProgressCardType[]) {
      const zh = getCatanProgressCardTextLocalized(cardType, "zh-TW");
      expect(zh.title.length).toBeGreaterThan(0);
      expect(zh.description.length).toBeGreaterThan(0);
    }

    for (const noble of SPLENDOR_NOBLES) {
      const zh = getSplendorNobleNameLocalized(noble.id, noble.name, "zh-TW");
      expect(zh).not.toBe(noble.name);
    }

    for (const color of ["blue", "yellow", "red", "black", "teal"] as const) {
      expect(getAzulTileLabelLocalized(color, "zh-TW").length).toBeGreaterThan(0);
    }

    for (const wId of ALL_WONDER_IDS) {
      const zhFull = getSevenWondersWonderNameLocalized(wId, "A", "zh-TW", false);
      const zhShort = getSevenWondersWonderNameLocalized(wId, "A", "zh-TW", true);
      expect(zhFull.length).toBeGreaterThan(0);
      expect(zhShort.length).toBeGreaterThan(0);
    }

    const allSwCards = [
      ...SEVEN_WONDERS_AGE_I_CARDS,
      ...SEVEN_WONDERS_AGE_II_CARDS,
      ...SEVEN_WONDERS_AGE_III_BASE_CARDS,
      ...SEVEN_WONDERS_GUILD_CARDS,
    ];
    const uniqueCardNames = Array.from(new Set(allSwCards.map((c) => c.name)));
    for (const name of uniqueCardNames) {
      const zh = getSevenWondersCardNameLocalized(name, "zh-TW");
      expect(zh).not.toBe(name);
    }

    for (const gameId of [
      "catan",
      "splendor",
      "azul",
      "seven_wonders",
    ] as const) {
      const enLessons = getTutorialLessonsLocalized(gameId, "en");
      const zhLessons = getTutorialLessonsLocalized(gameId, "zh-TW");
      expect(zhLessons.length).toBe(enLessons.length);
      expect(zhLessons[0]!.title).not.toBe(enLessons[0]!.title);

      const enGuide = getGameReferenceGuideLocalized(gameId, "en");
      const zhGuide = getGameReferenceGuideLocalized(gameId, "zh-TW");
      expect(zhGuide.sections.length).toBe(enGuide.sections.length);
      expect(zhGuide.title).not.toBe(enGuide.title);
    }
  });

  test("switches app locale dynamically across Login, Lobby, Setup, and Tutorials", () => {
    const loginRoot = makeRootMock();
    const loginApp = MultiGamePlatformApp(loginRoot as any, {
      forceLocalMode: true,
      startAtLogin: true,
    });
    expect(loginRoot.innerHTML).toContain("Enter Game Arena as a guest.");
    expect(loginRoot.innerHTML).toContain(`id="sel-locale"`);

    loginApp.setLocale("zh-TW");
    expect(loginApp.locale).toBe("zh-TW");
    expect(loginRoot.innerHTML).toContain("以訪客身分進入桌遊競技場。");
    expect(loginRoot.innerHTML).toContain("以訪客身分繼續");
    expect(loginRoot.innerHTML).toContain("繁體中文");

    const lobbyRoot = makeRootMock();
    const app = MultiGamePlatformApp(lobbyRoot as any, {
      forceLocalMode: true,
      startAtLogin: false,
      locale: "zh-TW",
    });
    expect(lobbyRoot.innerHTML).toContain("卡坦島");
    expect(lobbyRoot.innerHTML).toContain("璀璨寶石");
    expect(lobbyRoot.innerHTML).toContain("花磚物語");
    expect(lobbyRoot.innerHTML).toContain("七大奇蹟");
    expect(lobbyRoot.innerHTML).toContain("桌遊競技場");

    app.enterOrJoinRoom("room-1");
    expect(lobbyRoot.innerHTML).toContain("對戰設定");
    expect(lobbyRoot.innerHTML).toContain("卡坦島劇本");
    expect(lobbyRoot.innerHTML).toContain("開始對戰");

    app.setLocale("en");
    expect(lobbyRoot.innerHTML).toContain("Match configuration");
    expect(lobbyRoot.innerHTML).toContain("Catan scenario");
  });

  test("persists locale to localStorage and syncs document.documentElement.lang and document.title", () => {
    const store = new Map<string, string>();
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;

    const fakeDoc = {
      documentElement: { lang: "en", hasAttribute: () => false },
      title: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const fakeWin = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
      location: {
        protocol: "http:",
        hostname: "localhost",
        origin: "http://localhost:3000",
        pathname: "/",
        hash: "",
      },
      navigator: { languages: ["en-US"], language: "en-US" },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    (globalThis as any).window = fakeWin;
    (globalThis as any).document = fakeDoc;

    try {
      const root = makeRootMock();
      const app = MultiGamePlatformApp(root as any, {
        forceLocalMode: true,
        startAtLogin: true,
      });
      expect(app.locale).toBe("en");
      expect(fakeDoc.documentElement.lang).toBe("en");

      app.setLocale("zh-TW");
      expect(store.get(LOCALE_STORAGE_KEY)).toBe("zh-TW");
      expect(fakeDoc.documentElement.lang).toBe("zh-TW");
      expect(fakeDoc.title).toContain("桌遊競技場");

      // New app instance should restore saved locale automatically
      const root2 = makeRootMock();
      const app2 = MultiGamePlatformApp(root2 as any, {
        forceLocalMode: true,
        startAtLogin: true,
      });
      expect(app2.locale).toBe("zh-TW");
      expect(root2.innerHTML).toContain("以訪客身分進入桌遊競技場。");
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });

  test("renders Traditional Chinese across Catan SVG/Hand, Splendor, Azul, 7 Wonders, Guides, and Event Logs", () => {
    // Catan SVG & Hand Tray
    const catanState = CatanEngine.initGame(
      makePlayers(4),
      { scenarioId: "seafarers_new_shores", enableHarbormaster: true },
      "i18n-catan-seed"
    );
    const catanSvgZh = renderCatanBoardSvg(catanState, "p1", {
      buildMode: null,
      setupEdgeKind: "road",
      robberOrPirateMode: "robber",
      selectedMoveFromEdgeId: null,
      locale: "zh-TW",
    });
    expect(catanSvgZh).toContain("任意");

    const catanHandZh = renderCatanVisualHandTray(
      catanState,
      {
        ...catanState.players[0]!,
        resources: { brick: 2, lumber: 1, wool: 1, grain: 0, ore: 1 },
      },
      CatanEngine.getLegalActions(catanState, "p1"),
      "zh-TW"
    );
    expect(catanHandZh).toContain("手牌");
    expect(catanHandZh).toContain("磚塊");
    expect(catanHandZh).toContain("木材");

    // Splendor
    const splendorState = SplendorEngine.initGame(
      makePlayers(3),
      {},
      "i18n-splendor-seed"
    );
    const splendorZh = renderSplendorBoardView(
      splendorState,
      { emerald: 1 },
      "p1",
      true,
      "zh-TW"
    );
    expect(splendorZh).toContain("皇室貴族（+3 聲望）");
    expect(splendorZh).toContain("寶石銀行");
    expect(splendorZh).toContain("拿取寶石");
    expect(splendorZh).toContain("祖母綠");

    // Azul
    const azulState = AzulEngine.initGame(makePlayers(3), {}, "i18n-azul-seed");
    const azulZh = renderAzulBoardView(azulState, null, "p1", true, "zh-TW");
    expect(azulZh).toContain("中央區");
    expect(azulZh).toContain("瓷磚牆");
    expect(azulZh).toContain("地板區");

    // 7 Wonders
    const swState = SevenWondersEngine.initGame(
      makePlayers(3),
      {},
      "i18n-sw-seed"
    );
    const swZh = renderSevenWondersBoardView(
      swState,
      "p1",
      null,
      SevenWondersEngine.getLegalActions(swState, "p1"),
      null,
      false,
      "zh-TW"
    );
    expect(swZh).toContain("時代 I");
    expect(swZh).toContain("第 1/6 輪");
    expect(swZh).toContain("← 西鄰");
    expect(swZh).toContain("東鄰 →");
    expect(swZh).toContain("費用：");

    const swScorepadZh = renderScorepadHtml(swState, "zh-TW");
    expect(swScorepadZh).toContain("古代文明最終計分表");
    expect(swScorepadZh).toContain("軍事");
    expect(swScorepadZh).toContain("總分");

    // Reference Guide Modal (including visual diagrams) & Tutorial Banner
    const catanGuideZh = renderReferenceGuideModalPure("catan", true, "zh-TW");
    expect(catanGuideZh).toContain("卡坦島 — 玩法說明");
    expect(catanGuideZh).toContain("回合流程（輪到你時）");
    expect(catanGuideZh).toContain("建築費用與單人棋子上限");

    const tutorialZh = renderTutorialCoachBannerPure(
      "catan",
      0,
      true,
      catanState,
      false,
      "zh-TW"
    );
    expect(tutorialZh).toContain("教學 1/");
    expect(tutorialZh).toContain("示範此步");

    // Event log localization (UI layer only, without mutating engine state)
    expect(localizeEventLogMessage("Alice rolled 8 (5+3).", "zh-TW")).toBe(
      "Alice 擲出 8（5+3）."
    );
    expect(
      localizeEventLogMessage("Alice built a settlement.", "zh-TW")
    ).toContain("Alice 建造了村莊");
    expect(
      localizeEventLogMessage("Bob took 3 gems.", "zh-TW")
    ).toContain("Bob");
    expect(localizeEventLogMessage("Alice rolled 8 (5+3).", "en")).toBe(
      "Alice rolled 8 (5+3)."
    );
  });
});
