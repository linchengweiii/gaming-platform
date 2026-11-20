import type { AzulTileColor } from "@gaming-platform/azul";
import type {
  CardColor,
  WonderId,
  WonderResource,
} from "@gaming-platform/seven-wonders";
import type { TokenColor } from "@gaming-platform/splendor";

export const ZH_TW_SPLENDOR_GEMS: Readonly<
  Record<TokenColor, { readonly label: string; readonly short: string }>
> = {
  emerald: { label: "祖母綠", short: "綠" },
  diamond: { label: "鑽石", short: "白" },
  sapphire: { label: "藍寶石", short: "藍" },
  onyx: { label: "黑瑪瑙", short: "黑" },
  ruby: { label: "紅寶石", short: "紅" },
  gold: { label: "黃金百搭", short: "金" },
};

export const ZH_TW_SPLENDOR_NOBLES: Readonly<Record<string, string>> = {
  "noble-1": "凱薩琳·德·美第奇",
  "noble-2": "奧地利的伊麗莎白",
  "noble-3": "卡斯提亞的伊莎貝拉一世",
  "noble-4": "尼可洛·馬基維利",
  "noble-5": "蘇萊曼大帝",
  "noble-6": "布列塔尼的安妮",
  "noble-7": "查理五世",
  "noble-8": "法蘭索瓦一世",
  "noble-9": "亨利八世",
  "noble-10": "瑪麗·斯圖亞特",
};

export const ZH_TW_AZUL_TILES: Readonly<Record<AzulTileColor, string>> = {
  blue: "鈷藍",
  yellow: "琥珀黃",
  red: "陶紅",
  black: "黑曜石",
  teal: "藍綠花磚",
};

export const ZH_TW_SW_RESOURCES: Readonly<
  Record<WonderResource, { readonly label: string; readonly short: string }>
> = {
  wood: { label: "木材", short: "木" },
  stone: { label: "石材", short: "石" },
  ore: { label: "礦石", short: "礦" },
  clay: { label: "黏土", short: "土" },
  glass: { label: "玻璃", short: "玻" },
  loom: { label: "織布", short: "布" },
  papyrus: { label: "莎草紙", short: "紙" },
};

export const ZH_TW_SW_CARD_COLORS: Readonly<
  Record<CardColor, { readonly label: string; readonly short: string }>
> = {
  brown: { label: "原料", short: "棕" },
  gray: { label: "製品", short: "灰" },
  blue: { label: "市政", short: "藍" },
  yellow: { label: "商業", short: "黃" },
  red: { label: "軍事", short: "紅" },
  green: { label: "科技", short: "綠" },
  purple: { label: "公會", short: "紫" },
};

export const ZH_TW_SW_WONDERS: Readonly<
  Record<WonderId, { readonly full: string; readonly short: string }>
> = {
  alexandria: { full: "亞歷山大燈塔", short: "亞歷山大燈塔" },
  babylon: { full: "巴比倫空中花園", short: "巴比倫空中花園" },
  ephesus: { full: "以弗所阿耳忒彌斯神廟", short: "以弗所神廟" },
  giza: { full: "吉薩金字塔", short: "吉薩金字塔" },
  halikarnassus: { full: "摩索拉斯陵墓", short: "摩索拉斯陵墓" },
  olympia: { full: "奧林匹亞宙斯神像", short: "奧林匹亞神像" },
  rhodes: { full: "羅德島太陽神銅像", short: "羅德島巨像" },
};

export const ZH_TW_SW_STAGE_SUMMARIES: Readonly<Record<string, string>> = {
  "+3 VP": "+3 分",
  "+5 VP": "+5 分",
  "+7 VP": "+7 分",
  "+9 Coins": "+9 金幣",
  "+2 Shields": "+2 軍力",
  "1 Wood / Stone / Ore / Clay": "任選 1 木／石／礦／土",
  "1 Glass / Loom / Papyrus": "任選 1 玻／布／紙",
  "1 Compass / Gear / Tablet": "任選 1 圓規／齒輪／石板",
  "Play 7th card each Age": "每時代可打出第 7 張牌",
  "+2 VP & +4 Coins": "+2 分與 +4 金幣",
  "+3 VP & +4 Coins": "+3 分與 +4 金幣",
  "+5 VP & +4 Coins": "+5 分與 +4 金幣",
  "Build 1 card from discard free": "從棄牌堆免費建造 1 張牌",
  "+2 VP & Build 1 from discard": "+2 分並從棄牌堆免費建 1 張",
  "+1 VP & Build 1 from discard": "+1 分並從棄牌堆免費建 1 張",
  "Build 1 from discard free": "從棄牌堆免費建造 1 張牌",
  "1 free structure per Age": "每時代可免費建造 1 棟建築",
  "1-coin raw trade Left & Right": "向左右鄰國購買原料皆只要 1 金幣",
  "Copy best neighbor Guild": "複製鄰國最高分的紫色公會",
  "+1 Shield, +3 VP & +3 Coins": "+1 軍力、+3 分與 +3 金幣",
  "+1 Shield, +4 VP & +4 Coins": "+1 軍力、+4 分與 +4 金幣",
};

export const ZH_TW_SW_CARD_NAMES: Readonly<Record<string, string>> = {
  // Age I
  "Lumber Yard": "伐木場",
  "Stone Pit": "採石場",
  "Clay Pool": "黏土池",
  "Ore Vein": "礦脈",
  "Tree Farm": "林場",
  "Excavation": "開採地",
  "Clay Pit": "黏土坑",
  "Timber Yard": "木材場",
  "Forest Cave": "林間洞穴",
  "Mine": "礦坑",
  "Loom": "織布機",
  "Glassworks": "玻璃廠",
  "Press": "造紙廠",
  "Pawnshop": "當鋪",
  "Baths": "浴場",
  "Altar": "祭壇",
  "Theater": "劇院",
  "Tavern": "酒館",
  "East Trading Post": "東方貿易站",
  "West Trading Post": "西方貿易站",
  "Marketplace": "市集",
  "Stockade": "柵欄",
  "Barracks": "兵營",
  "Guard Tower": "瞭望塔",
  "Apothecary": "藥房",
  "Workshop": "工坊",
  "Scriptorium": "繕寫室",
  // Age II
  "Sawmill": "鋸木廠",
  "Quarry": "採石坑",
  "Brickyard": "磚窯",
  "Foundry": "鑄造廠",
  "Aqueduct": "引水道",
  "Temple": "神殿",
  "Statue": "雕像",
  "Courthouse": "法院",
  "Forum": "廣場",
  "Caravansery": "商隊驛站",
  "Vineyard": "葡萄園",
  "Bazar": "巴札市集",
  "Walls": "城牆",
  "Training Ground": "訓練場",
  "Stables": "馬廄",
  "Archery Range": "射箭場",
  "Dispensary": "醫務室",
  "Laboratory": "實驗室",
  "Library": "圖書館",
  "School": "學校",
  // Age III
  "Pantheon": "萬神殿",
  "Gardens": "花園",
  "Town Hall": "市政廳",
  "Palace": "皇宮",
  "Senate": "元老院",
  "Haven": "海港",
  "Lighthouse": "燈塔",
  "Chamber of Commerce": "商會",
  "Arena": "競技場",
  "Fortifications": "防禦工事",
  "Circus": "馬戲場",
  "Arsenal": "兵工廠",
  "Siege Workshop": "攻城工坊",
  "Lodge": "會所",
  "Observatory": "天文台",
  "University": "大學",
  "Academy": "學院",
  "Study": "書房",
  // Guilds
  "Workers Guild": "工人公會",
  "Craftsmens Guild": "工匠公會",
  "Traders Guild": "商人公會",
  "Philosophers Guild": "哲學家公會",
  "Spies Guild": "間諜公會",
  "Magistrates Guild": "治安官公會",
  "Shipowners Guild": "船主公會",
  "Strategists Guild": "戰略家公會",
  "Scientists Guild": "科學家公會",
  "Builders Guild": "建築師公會",
};
