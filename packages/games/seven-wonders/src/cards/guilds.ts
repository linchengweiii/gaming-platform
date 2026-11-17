import type { SevenWondersCard } from "../types.ts";
import { type CardSpec, expandCardSpecs } from "./helpers.ts";

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

export const SEVEN_WONDERS_GUILD_CARDS: readonly SevenWondersCard[] =
  expandCardSpecs(GUILD_SPECS);
