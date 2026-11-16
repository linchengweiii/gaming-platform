import type {
  CardColor,
  CardEffect,
  SevenWondersAge,
  SevenWondersCard,
  WonderBoardDefinition,
  WonderId,
  WonderResourceMap,
  WonderSide,
} from "./types.ts";

export const ALL_WONDER_IDS: readonly WonderId[] = [
  "alexandria",
  "babylon",
  "ephesus",
  "giza",
  "halikarnassus",
  "olympia",
  "rhodes",
];

export const WONDER_BOARDS: Readonly<
  Record<WonderId, Readonly<Record<WonderSide, WonderBoardDefinition>>>
> = {
  alexandria: {
    A: {
      id: "alexandria",
      side: "A",
      name: "The Lighthouse of Alexandria",
      startingResource: "glass",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { stone: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { ore: 2 },
          effects: [
            {
              kind: "wildcard_resource",
              options: ["wood", "stone", "ore", "clay"],
            },
          ],
          summary: "1 Wood / Stone / Ore / Clay",
        },
        {
          stageNumber: 3,
          resourceCost: { glass: 2 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "alexandria",
      side: "B",
      name: "The Lighthouse of Alexandria",
      startingResource: "glass",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { clay: 2 },
          effects: [
            {
              kind: "wildcard_resource",
              options: ["wood", "stone", "ore", "clay"],
            },
          ],
          summary: "1 Wood / Stone / Ore / Clay",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 2 },
          effects: [
            {
              kind: "wildcard_resource",
              options: ["glass", "loom", "papyrus"],
            },
          ],
          summary: "1 Glass / Loom / Papyrus",
        },
        {
          stageNumber: 3,
          resourceCost: { stone: 3 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
  },
  babylon: {
    A: {
      id: "babylon",
      side: "A",
      name: "The Hanging Gardens of Babylon",
      startingResource: "clay",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { clay: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 3 },
          effects: [{ kind: "wildcard_science" }],
          summary: "1 Compass / Gear / Tablet",
        },
        {
          stageNumber: 3,
          resourceCost: { clay: 4 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "babylon",
      side: "B",
      name: "The Hanging Gardens of Babylon",
      startingResource: "clay",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { clay: 1, loom: 1 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 2, glass: 1 },
          effects: [{ kind: "play_seventh_card" }],
          summary: "Play 7th card each Age",
        },
        {
          stageNumber: 3,
          resourceCost: { clay: 3, papyrus: 1 },
          effects: [{ kind: "wildcard_science" }],
          summary: "1 Compass / Gear / Tablet",
        },
      ],
    },
  },
  ephesus: {
    A: {
      id: "ephesus",
      side: "A",
      name: "The Temple of Artemis at Ephesus",
      startingResource: "papyrus",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { stone: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 2 },
          effects: [{ kind: "coins", coins: 9 }],
          summary: "+9 Coins",
        },
        {
          stageNumber: 3,
          resourceCost: { papyrus: 2 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "ephesus",
      side: "B",
      name: "The Temple of Artemis at Ephesus",
      startingResource: "papyrus",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { stone: 2 },
          effects: [
            { kind: "vp", points: 2 },
            { kind: "coins", coins: 4 },
          ],
          summary: "+2 VP & +4 Coins",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 2 },
          effects: [
            { kind: "vp", points: 3 },
            { kind: "coins", coins: 4 },
          ],
          summary: "+3 VP & +4 Coins",
        },
        {
          stageNumber: 3,
          resourceCost: { papyrus: 1, loom: 1, glass: 1 },
          effects: [
            { kind: "vp", points: 5 },
            { kind: "coins", coins: 4 },
          ],
          summary: "+5 VP & +4 Coins",
        },
      ],
    },
  },
  giza: {
    A: {
      id: "giza",
      side: "A",
      name: "The Pyramids of Giza",
      startingResource: "stone",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { stone: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 3 },
          effects: [{ kind: "vp", points: 5 }],
          summary: "+5 VP",
        },
        {
          stageNumber: 3,
          resourceCost: { stone: 4 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "giza",
      side: "B",
      name: "The Pyramids of Giza",
      startingResource: "stone",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { wood: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { stone: 3 },
          effects: [{ kind: "vp", points: 5 }],
          summary: "+5 VP",
        },
        {
          stageNumber: 3,
          resourceCost: { clay: 3 },
          effects: [{ kind: "vp", points: 5 }],
          summary: "+5 VP",
        },
        {
          stageNumber: 4,
          resourceCost: { stone: 4, papyrus: 1 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
  },
  halikarnassus: {
    A: {
      id: "halikarnassus",
      side: "A",
      name: "The Mausoleum of Halikarnassus",
      startingResource: "loom",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { clay: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { ore: 3 },
          effects: [{ kind: "build_from_discard" }],
          summary: "Build 1 card from discard free",
        },
        {
          stageNumber: 3,
          resourceCost: { loom: 2 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "halikarnassus",
      side: "B",
      name: "The Mausoleum of Halikarnassus",
      startingResource: "loom",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { ore: 2 },
          effects: [
            { kind: "vp", points: 2 },
            { kind: "build_from_discard" },
          ],
          summary: "+2 VP & Build 1 from discard",
        },
        {
          stageNumber: 2,
          resourceCost: { clay: 3 },
          effects: [
            { kind: "vp", points: 1 },
            { kind: "build_from_discard" },
          ],
          summary: "+1 VP & Build 1 from discard",
        },
        {
          stageNumber: 3,
          resourceCost: { glass: 1, papyrus: 1, loom: 1 },
          effects: [{ kind: "build_from_discard" }],
          summary: "Build 1 from discard free",
        },
      ],
    },
  },
  olympia: {
    A: {
      id: "olympia",
      side: "A",
      name: "The Statue of Zeus in Olympia",
      startingResource: "wood",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { wood: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { stone: 2 },
          effects: [{ kind: "free_build_per_age" }],
          summary: "1 free structure per Age",
        },
        {
          stageNumber: 3,
          resourceCost: { ore: 2 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "olympia",
      side: "B",
      name: "The Statue of Zeus in Olympia",
      startingResource: "wood",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { wood: 2 },
          effects: [{ kind: "raw_trade_both_discount" }],
          summary: "1-coin raw trade Left & Right",
        },
        {
          stageNumber: 2,
          resourceCost: { stone: 2 },
          effects: [{ kind: "vp", points: 5 }],
          summary: "+5 VP",
        },
        {
          stageNumber: 3,
          resourceCost: { ore: 2, loom: 1 },
          effects: [{ kind: "copy_neighbor_guild" }],
          summary: "Copy best neighbor Guild",
        },
      ],
    },
  },
  rhodes: {
    A: {
      id: "rhodes",
      side: "A",
      name: "The Colossus of Rhodes",
      startingResource: "ore",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { wood: 2 },
          effects: [{ kind: "vp", points: 3 }],
          summary: "+3 VP",
        },
        {
          stageNumber: 2,
          resourceCost: { clay: 3 },
          effects: [{ kind: "shields", shields: 2 }],
          summary: "+2 Shields",
        },
        {
          stageNumber: 3,
          resourceCost: { ore: 4 },
          effects: [{ kind: "vp", points: 7 }],
          summary: "+7 VP",
        },
      ],
    },
    B: {
      id: "rhodes",
      side: "B",
      name: "The Colossus of Rhodes",
      startingResource: "ore",
      stages: [
        {
          stageNumber: 1,
          resourceCost: { stone: 3 },
          effects: [
            { kind: "shields", shields: 1 },
            { kind: "vp", points: 3 },
            { kind: "coins", coins: 3 },
          ],
          summary: "+1 Shield, +3 VP & +3 Coins",
        },
        {
          stageNumber: 2,
          resourceCost: { ore: 4 },
          effects: [
            { kind: "shields", shields: 1 },
            { kind: "vp", points: 4 },
            { kind: "coins", coins: 4 },
          ],
          summary: "+1 Shield, +4 VP & +4 Coins",
        },
      ],
    },
  },
};

export function getWonderBoardDefinition(
  wonderId: WonderId,
  side: WonderSide
): WonderBoardDefinition {
  return WONDER_BOARDS[wonderId][side];
}

interface CardSpec {
  readonly templateId: string;
  readonly name: string;
  readonly age: SevenWondersAge;
  readonly color: CardColor;
  readonly copiesAtPlayers: readonly (3 | 4 | 5 | 6 | 7)[];
  readonly coinCost?: number;
  readonly resourceCost?: Partial<WonderResourceMap>;
  readonly freeFromChains?: readonly string[];
  readonly chainsTo?: readonly string[];
  readonly effects: readonly CardEffect[];
}

function expandCardSpecs(specs: readonly CardSpec[]): SevenWondersCard[] {
  return specs.flatMap((spec) =>
    spec.copiesAtPlayers.map((minPlayers, copyIdx) => ({
      id: `sw-a${spec.age}-${spec.templateId}-${minPlayers}p-${copyIdx + 1}`,
      templateId: spec.templateId,
      name: spec.name,
      age: spec.age,
      color: spec.color,
      minPlayers,
      coinCost: spec.coinCost ?? 0,
      resourceCost: spec.resourceCost ?? {},
      freeFromChains: spec.freeFromChains ?? [],
      chainsTo: spec.chainsTo ?? [],
      effects: spec.effects,
    }))
  );
}

const AGE_I_SPECS: readonly CardSpec[] = [
  // Brown (Raw Materials)
  {
    templateId: "lumber_yard",
    name: "Lumber Yard",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3, 4],
    effects: [{ kind: "resources", options: ["wood"] }],
  },
  {
    templateId: "stone_pit",
    name: "Stone Pit",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3, 5],
    effects: [{ kind: "resources", options: ["stone"] }],
  },
  {
    templateId: "clay_pool",
    name: "Clay Pool",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3, 5],
    effects: [{ kind: "resources", options: ["clay"] }],
  },
  {
    templateId: "ore_vein",
    name: "Ore Vein",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3, 4],
    effects: [{ kind: "resources", options: ["ore"] }],
  },
  {
    templateId: "tree_farm",
    name: "Tree Farm",
    age: 1,
    color: "brown",
    copiesAtPlayers: [6],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["wood", "clay"] }],
  },
  {
    templateId: "excavation",
    name: "Excavation",
    age: 1,
    color: "brown",
    copiesAtPlayers: [4],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["stone", "clay"] }],
  },
  {
    templateId: "clay_pit",
    name: "Clay Pit",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["clay", "ore"] }],
  },
  {
    templateId: "timber_yard",
    name: "Timber Yard",
    age: 1,
    color: "brown",
    copiesAtPlayers: [3],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["stone", "wood"] }],
  },
  {
    templateId: "forest_cave",
    name: "Forest Cave",
    age: 1,
    color: "brown",
    copiesAtPlayers: [5],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["wood", "ore"] }],
  },
  {
    templateId: "mine",
    name: "Mine",
    age: 1,
    color: "brown",
    copiesAtPlayers: [6],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["ore", "stone"] }],
  },

  // Gray (Manufactured Goods)
  {
    templateId: "loom_1",
    name: "Loom",
    age: 1,
    color: "gray",
    copiesAtPlayers: [3, 6],
    effects: [{ kind: "resources", options: ["loom"] }],
  },
  {
    templateId: "glassworks_1",
    name: "Glassworks",
    age: 1,
    color: "gray",
    copiesAtPlayers: [3, 6],
    effects: [{ kind: "resources", options: ["glass"] }],
  },
  {
    templateId: "press_1",
    name: "Press",
    age: 1,
    color: "gray",
    copiesAtPlayers: [3, 6],
    effects: [{ kind: "resources", options: ["papyrus"] }],
  },

  // Blue (Civilian Structures)
  {
    templateId: "pawnshop",
    name: "Pawnshop",
    age: 1,
    color: "blue",
    copiesAtPlayers: [4, 7],
    effects: [{ kind: "vp", points: 3 }],
  },
  {
    templateId: "baths",
    name: "Baths",
    age: 1,
    color: "blue",
    copiesAtPlayers: [3, 7],
    resourceCost: { stone: 1 },
    chainsTo: ["Aqueduct"],
    effects: [{ kind: "vp", points: 3 }],
  },
  {
    templateId: "altar",
    name: "Altar",
    age: 1,
    color: "blue",
    copiesAtPlayers: [3, 5],
    chainsTo: ["Temple"],
    effects: [{ kind: "vp", points: 2 }],
  },
  {
    templateId: "theater",
    name: "Theater",
    age: 1,
    color: "blue",
    copiesAtPlayers: [3, 6],
    chainsTo: ["Statue"],
    effects: [{ kind: "vp", points: 2 }],
  },

  // Yellow (Commercial Structures)
  {
    templateId: "tavern",
    name: "Tavern",
    age: 1,
    color: "yellow",
    copiesAtPlayers: [4, 5, 7],
    effects: [{ kind: "coins", coins: 5 }],
  },
  {
    templateId: "east_trading_post",
    name: "East Trading Post",
    age: 1,
    color: "yellow",
    copiesAtPlayers: [3, 7],
    chainsTo: ["Forum"],
    effects: [{ kind: "trade_discount", rawRight: true }],
  },
  {
    templateId: "west_trading_post",
    name: "West Trading Post",
    age: 1,
    color: "yellow",
    copiesAtPlayers: [3, 7],
    chainsTo: ["Forum"],
    effects: [{ kind: "trade_discount", rawLeft: true }],
  },
  {
    templateId: "marketplace",
    name: "Marketplace",
    age: 1,
    color: "yellow",
    copiesAtPlayers: [3, 6],
    chainsTo: ["Caravansery"],
    effects: [{ kind: "trade_discount", manufacturedBoth: true }],
  },

  // Red (Military Structures)
  {
    templateId: "stockade",
    name: "Stockade",
    age: 1,
    color: "red",
    copiesAtPlayers: [3, 7],
    resourceCost: { wood: 1 },
    effects: [{ kind: "shields", shields: 1 }],
  },
  {
    templateId: "barracks",
    name: "Barracks",
    age: 1,
    color: "red",
    copiesAtPlayers: [3, 5],
    resourceCost: { ore: 1 },
    effects: [{ kind: "shields", shields: 1 }],
  },
  {
    templateId: "guard_tower",
    name: "Guard Tower",
    age: 1,
    color: "red",
    copiesAtPlayers: [3, 4],
    resourceCost: { clay: 1 },
    effects: [{ kind: "shields", shields: 1 }],
  },

  // Green (Scientific Structures)
  {
    templateId: "apothecary",
    name: "Apothecary",
    age: 1,
    color: "green",
    copiesAtPlayers: [3, 5],
    resourceCost: { loom: 1 },
    chainsTo: ["Stables", "Dispensary"],
    effects: [{ kind: "science", symbol: "compass" }],
  },
  {
    templateId: "workshop",
    name: "Workshop",
    age: 1,
    color: "green",
    copiesAtPlayers: [3, 7],
    resourceCost: { glass: 1 },
    chainsTo: ["Archery Range", "Laboratory"],
    effects: [{ kind: "science", symbol: "gear" }],
  },
  {
    templateId: "scriptorium",
    name: "Scriptorium",
    age: 1,
    color: "green",
    copiesAtPlayers: [3, 4],
    resourceCost: { papyrus: 1 },
    chainsTo: ["Courthouse", "Library"],
    effects: [{ kind: "science", symbol: "tablet" }],
  },
];

const AGE_II_SPECS: readonly CardSpec[] = [
  // Brown
  {
    templateId: "sawmill",
    name: "Sawmill",
    age: 2,
    color: "brown",
    copiesAtPlayers: [3, 4],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["wood"], count: 2 }],
  },
  {
    templateId: "quarry",
    name: "Quarry",
    age: 2,
    color: "brown",
    copiesAtPlayers: [3, 4],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["stone"], count: 2 }],
  },
  {
    templateId: "brickyard",
    name: "Brickyard",
    age: 2,
    color: "brown",
    copiesAtPlayers: [3, 4],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["clay"], count: 2 }],
  },
  {
    templateId: "foundry",
    name: "Foundry",
    age: 2,
    color: "brown",
    copiesAtPlayers: [3, 4],
    coinCost: 1,
    effects: [{ kind: "resources", options: ["ore"], count: 2 }],
  },

  // Gray
  {
    templateId: "loom_2",
    name: "Loom",
    age: 2,
    color: "gray",
    copiesAtPlayers: [3, 5],
    effects: [{ kind: "resources", options: ["loom"] }],
  },
  {
    templateId: "glassworks_2",
    name: "Glassworks",
    age: 2,
    color: "gray",
    copiesAtPlayers: [3, 5],
    effects: [{ kind: "resources", options: ["glass"] }],
  },
  {
    templateId: "press_2",
    name: "Press",
    age: 2,
    color: "gray",
    copiesAtPlayers: [3, 5],
    effects: [{ kind: "resources", options: ["papyrus"] }],
  },

  // Blue
  {
    templateId: "aqueduct",
    name: "Aqueduct",
    age: 2,
    color: "blue",
    copiesAtPlayers: [3, 7],
    resourceCost: { stone: 3 },
    freeFromChains: ["Baths"],
    effects: [{ kind: "vp", points: 5 }],
  },
  {
    templateId: "temple",
    name: "Temple",
    age: 2,
    color: "blue",
    copiesAtPlayers: [3, 6],
    resourceCost: { wood: 1, clay: 1, glass: 1 },
    freeFromChains: ["Altar"],
    chainsTo: ["Pantheon"],
    effects: [{ kind: "vp", points: 3 }],
  },
  {
    templateId: "statue",
    name: "Statue",
    age: 2,
    color: "blue",
    copiesAtPlayers: [3, 7],
    resourceCost: { wood: 1, ore: 2 },
    freeFromChains: ["Theater"],
    chainsTo: ["Gardens"],
    effects: [{ kind: "vp", points: 4 }],
  },
  {
    templateId: "courthouse",
    name: "Courthouse",
    age: 2,
    color: "blue",
    copiesAtPlayers: [3, 5],
    resourceCost: { clay: 2, loom: 1 },
    freeFromChains: ["Scriptorium"],
    effects: [{ kind: "vp", points: 4 }],
  },

  // Yellow
  {
    templateId: "forum",
    name: "Forum",
    age: 2,
    color: "yellow",
    copiesAtPlayers: [3, 6, 7],
    resourceCost: { clay: 2 },
    freeFromChains: ["East Trading Post", "West Trading Post"],
    chainsTo: ["Haven"],
    effects: [{ kind: "resources", options: ["glass", "loom", "papyrus"] }],
  },
  {
    templateId: "caravansery",
    name: "Caravansery",
    age: 2,
    color: "yellow",
    copiesAtPlayers: [3, 5, 6],
    resourceCost: { wood: 2 },
    freeFromChains: ["Marketplace"],
    chainsTo: ["Lighthouse"],
    effects: [{ kind: "resources", options: ["wood", "stone", "ore", "clay"] }],
  },
  {
    templateId: "vineyard",
    name: "Vineyard",
    age: 2,
    color: "yellow",
    copiesAtPlayers: [3, 6],
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["brown"],
        includeSelf: true,
        includeNeighbors: true,
        coinsPerMatch: 1,
        vpPerMatch: 0,
      },
    ],
  },
  {
    templateId: "bazar",
    name: "Bazar",
    age: 2,
    color: "yellow",
    copiesAtPlayers: [4, 7],
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["gray"],
        includeSelf: true,
        includeNeighbors: true,
        coinsPerMatch: 2,
        vpPerMatch: 0,
      },
    ],
  },

  // Red
  {
    templateId: "walls",
    name: "Walls",
    age: 2,
    color: "red",
    copiesAtPlayers: [3, 7],
    resourceCost: { stone: 3 },
    chainsTo: ["Fortifications"],
    effects: [{ kind: "shields", shields: 2 }],
  },
  {
    templateId: "training_ground",
    name: "Training Ground",
    age: 2,
    color: "red",
    copiesAtPlayers: [4, 6, 7],
    resourceCost: { wood: 1, ore: 2 },
    chainsTo: ["Circus"],
    effects: [{ kind: "shields", shields: 2 }],
  },
  {
    templateId: "stables",
    name: "Stables",
    age: 2,
    color: "red",
    copiesAtPlayers: [3, 5],
    resourceCost: { ore: 1, clay: 1, wood: 1 },
    freeFromChains: ["Apothecary"],
    effects: [{ kind: "shields", shields: 2 }],
  },
  {
    templateId: "archery_range",
    name: "Archery Range",
    age: 2,
    color: "red",
    copiesAtPlayers: [3, 6],
    resourceCost: { wood: 2, ore: 1 },
    freeFromChains: ["Workshop"],
    effects: [{ kind: "shields", shields: 2 }],
  },

  // Green
  {
    templateId: "dispensary",
    name: "Dispensary",
    age: 2,
    color: "green",
    copiesAtPlayers: [3, 4],
    resourceCost: { ore: 2, glass: 1 },
    freeFromChains: ["Apothecary"],
    chainsTo: ["Lodge", "Arena"],
    effects: [{ kind: "science", symbol: "compass" }],
  },
  {
    templateId: "laboratory",
    name: "Laboratory",
    age: 2,
    color: "green",
    copiesAtPlayers: [3, 5],
    resourceCost: { clay: 2, papyrus: 1 },
    freeFromChains: ["Workshop"],
    chainsTo: ["Siege Workshop", "Observatory"],
    effects: [{ kind: "science", symbol: "gear" }],
  },
  {
    templateId: "library",
    name: "Library",
    age: 2,
    color: "green",
    copiesAtPlayers: [3, 6],
    resourceCost: { stone: 2, loom: 1 },
    freeFromChains: ["Scriptorium"],
    chainsTo: ["Senate", "University"],
    effects: [{ kind: "science", symbol: "tablet" }],
  },
  {
    templateId: "school",
    name: "School",
    age: 2,
    color: "green",
    copiesAtPlayers: [3, 7],
    resourceCost: { wood: 1, papyrus: 1 },
    chainsTo: ["Academy", "Study"],
    effects: [{ kind: "science", symbol: "tablet" }],
  },
];

const AGE_III_NON_GUILD_SPECS: readonly CardSpec[] = [
  // Blue
  {
    templateId: "pantheon",
    name: "Pantheon",
    age: 3,
    color: "blue",
    copiesAtPlayers: [3, 6],
    resourceCost: { clay: 2, ore: 1, papyrus: 1, loom: 1, glass: 1 },
    freeFromChains: ["Temple"],
    effects: [{ kind: "vp", points: 7 }],
  },
  {
    templateId: "gardens",
    name: "Gardens",
    age: 3,
    color: "blue",
    copiesAtPlayers: [3, 4],
    resourceCost: { wood: 1, clay: 2 },
    freeFromChains: ["Statue"],
    effects: [{ kind: "vp", points: 5 }],
  },
  {
    templateId: "town_hall",
    name: "Town Hall",
    age: 3,
    color: "blue",
    copiesAtPlayers: [3, 5, 6],
    resourceCost: { glass: 1, ore: 1, stone: 2 },
    effects: [{ kind: "vp", points: 6 }],
  },
  {
    templateId: "palace",
    name: "Palace",
    age: 3,
    color: "blue",
    copiesAtPlayers: [3, 7],
    resourceCost: {
      glass: 1,
      papyrus: 1,
      loom: 1,
      clay: 1,
      wood: 1,
      ore: 1,
      stone: 1,
    },
    effects: [{ kind: "vp", points: 8 }],
  },
  {
    templateId: "senate",
    name: "Senate",
    age: 3,
    color: "blue",
    copiesAtPlayers: [3, 5],
    resourceCost: { wood: 2, stone: 1, ore: 1 },
    freeFromChains: ["Library"],
    effects: [{ kind: "vp", points: 6 }],
  },

  // Yellow
  {
    templateId: "haven",
    name: "Haven",
    age: 3,
    color: "yellow",
    copiesAtPlayers: [3, 4],
    resourceCost: { loom: 1, ore: 1, wood: 1 },
    freeFromChains: ["Forum"],
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["brown"],
        includeSelf: true,
        includeNeighbors: false,
        coinsPerMatch: 1,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "lighthouse",
    name: "Lighthouse",
    age: 3,
    color: "yellow",
    copiesAtPlayers: [3, 6],
    resourceCost: { glass: 1, stone: 1 },
    freeFromChains: ["Caravansery"],
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["yellow"],
        includeSelf: true,
        includeNeighbors: false,
        coinsPerMatch: 1,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "chamber_of_commerce",
    name: "Chamber of Commerce",
    age: 3,
    color: "yellow",
    copiesAtPlayers: [4, 6],
    resourceCost: { clay: 2, papyrus: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["gray"],
        includeSelf: true,
        includeNeighbors: false,
        coinsPerMatch: 2,
        vpPerMatch: 2,
      },
    ],
  },
  {
    templateId: "arena",
    name: "Arena",
    age: 3,
    color: "yellow",
    copiesAtPlayers: [3, 5, 7],
    resourceCost: { stone: 2, ore: 1 },
    freeFromChains: ["Dispensary"],
    effects: [
      {
        kind: "per_wonder_stage_reward",
        includeSelf: true,
        includeNeighbors: false,
        coinsPerStage: 3,
        vpPerStage: 1,
      },
    ],
  },

  // Red
  {
    templateId: "fortifications",
    name: "Fortifications",
    age: 3,
    color: "red",
    copiesAtPlayers: [3, 7],
    resourceCost: { ore: 3, stone: 1 },
    freeFromChains: ["Walls"],
    effects: [{ kind: "shields", shields: 3 }],
  },
  {
    templateId: "circus",
    name: "Circus",
    age: 3,
    color: "red",
    copiesAtPlayers: [4, 5, 6],
    resourceCost: { stone: 3, ore: 1 },
    freeFromChains: ["Training Ground"],
    effects: [{ kind: "shields", shields: 3 }],
  },
  {
    templateId: "arsenal",
    name: "Arsenal",
    age: 3,
    color: "red",
    copiesAtPlayers: [3, 4, 7],
    resourceCost: { wood: 2, ore: 1, loom: 1 },
    effects: [{ kind: "shields", shields: 3 }],
  },
  {
    templateId: "siege_workshop",
    name: "Siege Workshop",
    age: 3,
    color: "red",
    copiesAtPlayers: [3, 5],
    resourceCost: { clay: 3, wood: 1 },
    freeFromChains: ["Laboratory"],
    effects: [{ kind: "shields", shields: 3 }],
  },

  // Green
  {
    templateId: "lodge",
    name: "Lodge",
    age: 3,
    color: "green",
    copiesAtPlayers: [3, 6],
    resourceCost: { clay: 2, loom: 1, papyrus: 1 },
    freeFromChains: ["Dispensary"],
    effects: [{ kind: "science", symbol: "compass" }],
  },
  {
    templateId: "observatory",
    name: "Observatory",
    age: 3,
    color: "green",
    copiesAtPlayers: [3, 7],
    resourceCost: { ore: 2, glass: 1, loom: 1 },
    freeFromChains: ["Laboratory"],
    effects: [{ kind: "science", symbol: "gear" }],
  },
  {
    templateId: "university",
    name: "University",
    age: 3,
    color: "green",
    copiesAtPlayers: [3, 4],
    resourceCost: { wood: 2, papyrus: 1, glass: 1 },
    freeFromChains: ["Library"],
    effects: [{ kind: "science", symbol: "tablet" }],
  },
  {
    templateId: "academy",
    name: "Academy",
    age: 3,
    color: "green",
    copiesAtPlayers: [3, 7],
    resourceCost: { stone: 3, glass: 1 },
    freeFromChains: ["School"],
    effects: [{ kind: "science", symbol: "compass" }],
  },
  {
    templateId: "study",
    name: "Study",
    age: 3,
    color: "green",
    copiesAtPlayers: [3, 5],
    resourceCost: { wood: 1, papyrus: 1, loom: 1 },
    freeFromChains: ["School"],
    effects: [{ kind: "science", symbol: "gear" }],
  },
];

const GUILD_SPECS: readonly CardSpec[] = [
  {
    templateId: "workers_guild",
    name: "Workers Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { ore: 2, clay: 1, stone: 1, wood: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["brown"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "craftsmens_guild",
    name: "Craftsmens Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { ore: 2, stone: 2 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["gray"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 2,
      },
    ],
  },
  {
    templateId: "traders_guild",
    name: "Traders Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { loom: 1, papyrus: 1, glass: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["yellow"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "philosophers_guild",
    name: "Philosophers Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { clay: 3, loom: 1, papyrus: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["green"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "spies_guild",
    name: "Spies Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { clay: 3, glass: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["red"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "magistrates_guild",
    name: "Magistrates Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { wood: 3, stone: 1, loom: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["blue"],
        includeSelf: false,
        includeNeighbors: true,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "shipowners_guild",
    name: "Shipowners Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { wood: 3, papyrus: 1, glass: 1 },
    effects: [
      {
        kind: "per_card_reward",
        targetColors: ["brown", "gray", "purple"],
        includeSelf: true,
        includeNeighbors: false,
        coinsPerMatch: 0,
        vpPerMatch: 1,
      },
    ],
  },
  {
    templateId: "strategists_guild",
    name: "Strategists Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { ore: 2, stone: 1, loom: 1 },
    effects: [
      {
        kind: "per_defeat_token_vp",
        includeNeighbors: true,
        vpPerToken: 1,
      },
    ],
  },
  {
    templateId: "scientists_guild",
    name: "Scientists Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { wood: 2, ore: 2, papyrus: 1 },
    effects: [{ kind: "wildcard_science" }],
  },
  {
    templateId: "builders_guild",
    name: "Builders Guild",
    age: 3,
    color: "purple",
    copiesAtPlayers: [3],
    resourceCost: { stone: 2, clay: 2, glass: 1 },
    effects: [
      {
        kind: "per_wonder_stage_reward",
        includeSelf: true,
        includeNeighbors: true,
        coinsPerStage: 0,
        vpPerStage: 1,
      },
    ],
  },
];

export const SEVEN_WONDERS_AGE_I_CARDS: readonly SevenWondersCard[] =
  expandCardSpecs(AGE_I_SPECS);

export const SEVEN_WONDERS_AGE_II_CARDS: readonly SevenWondersCard[] =
  expandCardSpecs(AGE_II_SPECS);

export const SEVEN_WONDERS_AGE_III_BASE_CARDS: readonly SevenWondersCard[] =
  expandCardSpecs(AGE_III_NON_GUILD_SPECS);

export const SEVEN_WONDERS_GUILD_CARDS: readonly SevenWondersCard[] =
  expandCardSpecs(GUILD_SPECS);
