import type {
  WonderBoardDefinition,
  WonderId,
  WonderSide,
} from "../types.ts";

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
            { kind: "wildcard_resource", options: ["wood", "stone", "ore", "clay"] },
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
            { kind: "wildcard_resource", options: ["wood", "stone", "ore", "clay"] },
          ],
          summary: "1 Wood / Stone / Ore / Clay",
        },
        {
          stageNumber: 2,
          resourceCost: { wood: 2 },
          effects: [
            { kind: "wildcard_resource", options: ["glass", "loom", "papyrus"] },
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
