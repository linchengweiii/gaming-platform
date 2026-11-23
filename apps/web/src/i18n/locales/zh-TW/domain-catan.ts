import type { BotDifficulty } from "@gaming-platform/core";
import type {
  CommodityType,
  DevCardType,
  ImprovementDiscipline,
  ProgressCardType,
  ResourceType,
  ScenarioId,
  TerrainType,
} from "@gaming-platform/catan";
import type { SupportedGameId } from "../../../app/types.ts";

export const ZH_TW_GAME_TITLES: Readonly<Record<SupportedGameId, string>> = {
  catan: "卡坦島",
  splendor: "璀璨寶石",
  azul: "花磚物語",
  seven_wonders: "七大奇蹟",
};

export const ZH_TW_BOT_DIFFICULTY_META: Readonly<
  Record<BotDifficulty, { readonly label: string; readonly badge: string; readonly desc: string }>
> = {
  easy: {
    label: "休閒",
    badge: "簡單",
    desc: "決策較為寬鬆，玩家交易較容易成交。",
  },
  normal: {
    label: "平衡",
    badge: "普通",
    desc: "穩定的資源產出與標準港口運用。",
  },
  smart: {
    label: "戰術",
    badge: "聰明",
    desc: "追蹤稀缺資源、搭配港口與反制強盜。",
  },
  master: {
    label: "大師",
    badge: "大師",
    desc: "進階權重評估、領先者封鎖交易與多港口連動。",
  },
};

export const ZH_TW_CATAN_SCENARIOS: Readonly<
  Record<
    ScenarioId,
    { readonly name: string; readonly subtitle: string; readonly description: string }
  >
> = {
  standard: {
    name: "標準卡坦島（基本版）",
    subtitle: "3–6 人 • 19 / 30 格 • 10 分",
    description:
      "經典的 19 格卡坦島地圖（5–6 人時自動擴展為 30 格大島嶼），包含港口、最長道路與最大軍隊。",
  },
  big_island_5_6: {
    name: "5–6 人擴充（大島嶼）",
    subtitle: "5–6 人 • 30 格 • 特別建設階段",
    description:
      "擴展為 30 格的大島嶼，擁有 11 座港口、更大的銀行與發展卡庫，以及回合間的特別建設階段。",
  },
  cities_and_knights: {
    name: "城市與騎士",
    subtitle: "3–6 人 • 騎士與蠻族 • 大都會 • 13 分",
    description:
      "抵禦蠻族艦隊入侵！收集紙張、布料與錢幣以升級貿易、政治與科學並爭奪三大都會、招募騎士與打出進度卡。",
  },
  cities_and_knights_5_6: {
    name: "城市與騎士（5–6 人擴充）",
    subtitle: "5–6 人 • 30 格 • 騎士、大都會與特別建設 • 13 分",
    description:
      "支援最多 6 人的 30 格城市與騎士大島嶼，含每種商品 18 張、蠻族艦隊、三大都會與特別建設階段。",
  },
  seafarers_new_shores: {
    name: "航海家：航向新岸",
    subtitle: "3–6 人 • 船隻與海盜 • 黃金群島 • 12 分",
    description:
      "從主島出發，造船橫渡海洋殖民富含黃金的外海小島，每定居一座新島即可獲得 +2 額外勝利點數！",
  },
  seafarers_new_shores_5_6: {
    name: "航海家：航向新岸（5–6 人）",
    subtitle: "5–6 人 • 51 格海域 • 3 座黃金島 • 12 分",
    description:
      "擴展的 51 格海域地圖！從 20 格主島出航殖民 3 座黃金外島（各 +2 額外分數），附帶特別建設階段。",
  },
  seafarers_four_islands: {
    name: "航海家：四島群島",
    subtitle: "3–6 人 • 群島 • 船隻與海盜 • 12 分",
    description:
      "由水道隔開的豐饒群島（5–6 人自動擴展為六島）。可在最多兩座本島開局，航向異島殖民每座 +2 額外分數。",
  },
  seafarers_six_islands_5_6: {
    name: "航海家：六島群島（5–6 人）",
    subtitle: "5–6 人 • 六島群島 • 船隻與海盜 • 12 分",
    description:
      "四島群島的官方 5–6 人版本：58 格海域上分布六座豐饒五格小島，開拓外島每座獲得 +2 額外勝利點數！",
  },
  seafarers_fog_islands: {
    name: "航海家：迷霧之島",
    subtitle: "3–6 人 • 探索 • 未知迷霧格 • 12 分",
    description:
      "駛入未知的中央迷霧區！每當航線觸及迷霧格，立即翻開隱藏地形、數字圓片並獲得探索獎勵資源。",
  },
  seafarers_fog_islands_5_6: {
    name: "航海家：迷霧之島（5–6 人）",
    subtitle: "5–6 人 • 東西雙主島 • 11 格迷霧帶 • 12 分",
    description:
      "58 格擴展海域，東西各有一座 11 格主島，中間隔著隱藏黃金、資源與探索獎勵的 11 格中央迷霧帶。",
  },
};

export const ZH_TW_CATAN_TERRAINS: Readonly<Record<TerrainType, string>> = {
  forest: "森林",
  hills: "丘陵",
  pasture: "牧場",
  fields: "農田",
  mountains: "山脈",
  desert: "沙漠",
  sea: "海洋",
  gold: "黃金河",
  fog: "未知迷霧",
};

export const ZH_TW_CATAN_RESOURCES: Readonly<
  Record<ResourceType, { readonly label: string; readonly subtitle: string }>
> = {
  brick: { label: "磚塊", subtitle: "紅土丘陵" },
  lumber: { label: "木材", subtitle: "林木森林" },
  wool: { label: "羊毛", subtitle: "綿羊牧場" },
  grain: { label: "小麥", subtitle: "麥穗農田" },
  ore: { label: "礦石", subtitle: "鐵礦山脈" },
};

export const ZH_TW_CATAN_COMMODITIES: Readonly<
  Record<CommodityType, { readonly label: string; readonly subtitle: string }>
> = {
  paper: { label: "紙張", subtitle: "森林城市" },
  cloth: { label: "布料", subtitle: "牧場城市" },
  coin: { label: "錢幣", subtitle: "山脈城市" },
};

export const ZH_TW_CATAN_DEV_CARDS: Readonly<
  Record<
    DevCardType,
    { readonly title: string; readonly category: string; readonly rule: string }
  >
> = {
  knight: {
    title: "騎士卡",
    category: "軍隊",
    rule: "移動強盜或海盜，並從相鄰玩家搶奪 1 張手牌。",
  },
  road_building: {
    title: "道路建設",
    category: "進度",
    rule: "在盤面上免費放置最多 2 條道路或船隻。",
  },
  year_of_plenty: {
    title: "豐收之年",
    category: "進度",
    rule: "直接從銀行任拿 2 張資源卡。",
  },
  monopoly: {
    title: "壟斷",
    category: "進度",
    rule: "指定 1 種資源，所有對手須交出該種全部資源卡。",
  },
  victory_point: {
    title: "勝利點數",
    category: "+1 分",
    rule: "立即計入你的勝利點數目標。",
  },
};

export const ZH_TW_CATAN_DISCIPLINES: Readonly<
  Record<
    ImprovementDiscipline,
    {
      readonly label: string;
      readonly shortCode: string;
    }
  >
> = {
  trade: { label: "貿易", shortCode: "貿" },
  politics: { label: "政治", shortCode: "政" },
  science: { label: "科學", shortCode: "科" },
};

export const ZH_TW_CATAN_PROGRESS_CARDS: Readonly<
  Record<ProgressCardType, { readonly title: string; readonly description: string }>
> = {
  printer: {
    title: "印刷機",
    description: "+1 勝利點數！抽到時立即亮出計分。",
  },
  engineer: {
    title: "工程師",
    description: "在你的一座無城牆城市下方免費建造 1 座城牆。",
  },
  alchemist: {
    title: "煉金術士",
    description: "擲骰前打出：自行指定白骰與紅骰的點數。",
  },
  crane: {
    title: "起重機",
    description: "本回合下一次城市升級可少付 1 張商品。",
  },
  inventor: {
    title: "發明家",
    description: "交換任兩塊陸地地形的數字圓片（不含 2、6、8、12）。",
  },
  irrigation: {
    title: "灌溉",
    description: "每塊與你建築相鄰的農田地形為你帶來 2 張小麥。",
  },
  medicine: {
    title: "醫學",
    description: "本回合下一次升級城市只需 2 礦石與 1 小麥（減免 1 礦 1 麥）。",
  },
  mining: {
    title: "採礦",
    description: "每塊與你建築相鄰的山脈地形為你帶來 2 張礦石。",
  },
  road_building: {
    title: "道路建設",
    description: "立即免費建造最多 2 條道路或船隻。",
  },
  smith: {
    title: "鐵匠",
    description: "免費將你最多 2 位騎士各晉升 1 級。",
  },
  constitution: {
    title: "憲法",
    description: "+1 勝利點數！抽到時立即亮出計分。",
  },
  bishop: {
    title: "主教",
    description: "移動強盜，並向每位相鄰該板塊的對手各隨機抽 1 張牌。",
  },
  deserter: {
    title: "逃兵",
    description: "令一名對手的騎士叛逃，並放置一位同級以下的己方騎士。",
  },
  diplomat: {
    title: "外交官",
    description: "移除任一條末端道路；若是自己的，可免費移至他處。",
  },
  intrigue: {
    title: "陰謀",
    description: "驅離一名與你道路或船隻相鄰的對手騎士。",
  },
  saboteur: {
    title: "破壞者",
    description: "每位勝利點數不少於你的對手皆須棄掉一半手牌。",
  },
  spy: {
    title: "間諜",
    description: "檢視一名對手的進度卡並任選 1 張據為己有。",
  },
  warlord: {
    title: "軍閥",
    description: "免費啟動你盤面上所有的騎士。",
  },
  wedding: {
    title: "婚禮",
    description: "每位勝利點數高於你的對手皆須贈予你最多 2 張手牌。",
  },
  merchant: {
    title: "商人",
    description: "將商人置於相鄰你建築的地形：+1 分且該資源享 2:1 銀行交易。",
  },
  resource_monopoly: {
    title: "資源壟斷",
    description: "指定 1 種資源；每位對手最多交給你 2 張該資源。",
  },
  trade_monopoly: {
    title: "貿易壟斷",
    description: "指定 1 種商品；每位對手最多交給你 1 張該商品。",
  },
  merchant_fleet: {
    title: "商船隊",
    description: "本回合剩餘時間內，指定 1 種資源或商品可 2:1 與銀行交易。",
  },
  master_merchant: {
    title: "大商人",
    description: "指定一位勝利點數高於你的對手，檢視其手牌並拿取 2 張。",
  },
  commercial_harbor: {
    title: "商業港",
    description: "以手上 1 張資源與每位持有商品的對手交換 1 張商品。",
  },
};
