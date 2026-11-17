import type {
  CommodityType,
  DevCardType,
  ImprovementDiscipline,
  ResourceType,
  TerrainType,
  TradeGoodType,
} from "@gaming-platform/catan";

export const PLAYER_PALETTE: readonly string[] = [
  "#ff4a1f",
  "#38bdf8",
  "#fde047",
  "#4ade80",
  "#c084fc",
  "#f472b6",
];

export const TERRAIN_META: Readonly<
  Record<
    TerrainType,
    {
      readonly label: string;
      readonly gradientId: string;
      readonly accent: string;
    }
  >
> = {
  forest: { label: "Forest", gradientId: "grad-forest", accent: "#16a34a" },
  hills: { label: "Hills", gradientId: "grad-hills", accent: "#ea580c" },
  pasture: { label: "Pasture", gradientId: "grad-pasture", accent: "#65a30d" },
  fields: { label: "Fields", gradientId: "grad-fields", accent: "#eab308" },
  mountains: {
    label: "Mountains",
    gradientId: "grad-mountains",
    accent: "#64748b",
  },
  desert: { label: "Desert", gradientId: "grad-desert", accent: "#d97706" },
  sea: { label: "Sea", gradientId: "grad-sea", accent: "#0284c7" },
  gold: { label: "Gold River", gradientId: "grad-gold", accent: "#eab308" },
  fog: { label: "Uncharted Fog", gradientId: "grad-fog", accent: "#1e3a52" },
};

export const HARBOR_GENERIC_META = {
  ratioText: "3:1",
  subLabel: "Any",
  strokeAccent: "#b45309",
  pierBaseStroke: "#451a03",
  pierPlankStroke: "#b45309",
  medallionFill: "#fffbeb",
} as const;

export const PIECE_SHADE_CONFIG = {
  actionLight: 0.35,
  actionDark: -0.32,
  routeLight: 0.34,
  routeDark: -0.34,
  roofLight: 0.36,
  wallShadow: -0.28,
  knightDark: -0.3,
} as const;

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  brick: "Brick",
  lumber: "Lumber",
  wool: "Wool",
  grain: "Grain",
  ore: "Ore",
};

export const RESOURCE_META: Record<
  ResourceType,
  {
    label: string;
    subtitle: string;
    accent: string;
    bgTop: string;
    bgBottom: string;
    border: string;
  }
> = {
  brick: {
    label: "Brick",
    subtitle: "Clay hills",
    accent: "#ea580c",
    bgTop: "#7c2d12",
    bgBottom: "#3b1106",
    border: "#fb923c",
  },
  lumber: {
    label: "Lumber",
    subtitle: "Timber forest",
    accent: "#16a34a",
    bgTop: "#14532d",
    bgBottom: "#052814",
    border: "#4ade80",
  },
  wool: {
    label: "Wool",
    subtitle: "Sheep pasture",
    accent: "#65a30d",
    bgTop: "#365314",
    bgBottom: "#172606",
    border: "#a3e635",
  },
  grain: {
    label: "Grain",
    subtitle: "Wheat fields",
    accent: "#eab308",
    bgTop: "#854d0e",
    bgBottom: "#3d1d05",
    border: "#facc15",
  },
  ore: {
    label: "Ore",
    subtitle: "Iron mountains",
    accent: "#64748b",
    bgTop: "#334155",
    bgBottom: "#0f172a",
    border: "#94a3b8",
  },
};

export const DEV_CARD_META: Record<
  DevCardType,
  {
    title: string;
    category: string;
    rule: string;
    accent: string;
    border: string;
  }
> = {
  knight: {
    title: "Knight",
    category: "Army",
    rule: "Move the robber or pirate and steal 1 card from an adjacent player.",
    accent: "#dc2626",
    border: "#f87171",
  },
  road_building: {
    title: "Road building",
    category: "Progress",
    rule: "Place 2 free roads or ships on the board.",
    accent: "#0284c7",
    border: "#38bdf8",
  },
  year_of_plenty: {
    title: "Year of plenty",
    category: "Progress",
    rule: "Take any 2 resource cards directly from the bank.",
    accent: "#16a34a",
    border: "#4ade80",
  },
  monopoly: {
    title: "Monopoly",
    category: "Progress",
    rule: "Name 1 resource; every opponent gives you all cards of that type.",
    accent: "#b45309",
    border: "#f59e0b",
  },
  victory_point: {
    title: "Victory point",
    category: "+1 VP",
    rule: "Counts immediately toward your victory point target.",
    accent: "#d97706",
    border: "#fbbf24",
  },
};

export const COMMODITY_META: Record<
  CommodityType,
  {
    label: string;
    subtitle: string;
    accent: string;
    bgTop: string;
    bgBottom: string;
    border: string;
  }
> = {
  paper: {
    label: "Paper",
    subtitle: "Forest city",
    accent: "#16a34a",
    bgTop: "#14532d",
    bgBottom: "#052814",
    border: "#4ade80",
  },
  cloth: {
    label: "Cloth",
    subtitle: "Pasture city",
    accent: "#65a30d",
    bgTop: "#365314",
    bgBottom: "#172606",
    border: "#a3e635",
  },
  coin: {
    label: "Coin",
    subtitle: "Mountain city",
    accent: "#64748b",
    bgTop: "#334155",
    bgBottom: "#0f172a",
    border: "#94a3b8",
  },
};

export const TRADE_GOOD_META: Record<
  TradeGoodType,
  {
    label: string;
    subtitle: string;
    accent: string;
    bgTop: string;
    bgBottom: string;
    border: string;
  }
> = {
  ...RESOURCE_META,
  ...COMMODITY_META,
};

export const DISCIPLINE_META: Record<
  ImprovementDiscipline,
  {
    label: string;
    shortCode: string;
    commodity: CommodityType;
    perkTitle: string;
    perkRule: string;
    accent: string;
    border: string;
    bg: string;
  }
> = {
  trade: {
    label: "Trade",
    shortCode: "T",
    commodity: "cloth",
    perkTitle: "Trading House",
    perkRule: "Lv 3: Trade all commodities 2:1 with the bank",
    accent: "#f59e0b",
    border: "#fbbf24",
    bg: "#2b1908",
  },
  politics: {
    label: "Politics",
    shortCode: "P",
    commodity: "coin",
    perkTitle: "Fortress",
    perkRule: "Lv 3: Promote Strong Knights to Mighty Knights (Lv 3)",
    accent: "#3b82f6",
    border: "#60a5fa",
    bg: "#122142",
  },
  science: {
    label: "Science",
    shortCode: "S",
    commodity: "paper",
    perkTitle: "Aqueduct",
    perkRule: "Lv 3: Gain 1 free resource on non-7 zero-yield rolls",
    accent: "#10b981",
    border: "#34d399",
    bg: "#092b22",
  },
};
