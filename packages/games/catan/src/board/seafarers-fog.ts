import {
  type AxialCoord,
  type HexId,
  type RngState,
  buildHexBoardTopology,
  generateHexRadiusCoords,
  hexId,
  shufflePure,
} from "@gaming-platform/core";
import {
  BIG_ISLAND_HARBORS,
  STANDARD_HARBORS,
  STANDARD_NUMBERS,
} from "../config/scenarios-config.ts";
import type {
  CatanConfig,
  FogRevealTile,
  HarborType,
  HexTile,
  TerrainType,
} from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildElongatedMarineCoords,
  placeCoastalHarborsPure,
} from "./helpers.ts";

interface FogIslandsPreset {
  getCoords: () => AxialCoord[];
  westIsland: readonly (readonly [number, number])[];
  eastIsland: readonly (readonly [number, number])[];
  fogBelt: readonly (readonly [number, number])[];
  startTerrains: readonly TerrainType[];
  startNumbers: readonly number[];
  fogDeck: readonly FogRevealTile[];
  harbors: readonly HarborType[];
  pirateHex: readonly [number, number];
}

function buildSeafarersFogBoardPure(
  config: CatanConfig,
  rng0: RngState,
  preset: FogIslandsPreset
): readonly [GeneratedBoard, RngState] {
  const coords = preset.getCoords();
  const topology = buildHexBoardTopology(coords);
  const toSet = (list: readonly (readonly [number, number])[]): ReadonlySet<HexId> =>
    new Set(list.map(([q, r]) => hexId(q, r)));
  const westIsland = toSet(preset.westIsland);
  const eastIsland = toSet(preset.eastIsland);
  const fogBelt = toSet(preset.fogBelt);

  const [startTerrains, rng1] = shufflePure<TerrainType>(
    rng0,
    preset.startTerrains
  );

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    productiveIds: HexId[];
    idx: number;
    robberHexId: HexId;
  }>(
    (acc, { q, r }) => {
      const id = hexId(q, r);
      if (westIsland.has(id) || eastIsland.has(id)) {
        const terrain = startTerrains[acc.idx]!;
        const tile: HexTile = {
          id,
          q,
          r,
          terrain,
          numberToken: null,
          islandId: westIsland.has(id) ? 1 : 2,
          allowSetupSettlement: true,
        };
        return {
          hexes: { ...acc.hexes, [id]: tile },
          productiveIds:
            terrain === "desert"
              ? acc.productiveIds
              : [...acc.productiveIds, id],
          idx: acc.idx + 1,
          robberHexId: terrain === "desert" ? id : acc.robberHexId,
        };
      }
      const isFog = fogBelt.has(id);
      return {
        ...acc,
        hexes: {
          ...acc.hexes,
          [id]: {
            id,
            q,
            r,
            terrain: isFog ? "fog" : "sea",
            numberToken: null,
            islandId: isFog ? 3 : 0,
            allowSetupSettlement: false,
          },
        },
      };
    },
    { hexes: {}, productiveIds: [], idx: 0, robberHexId: hexId(-2, 1) }
  );

  const [hexes, rng2] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.productiveIds,
    preset.startNumbers,
    rng1,
    config.balancedNumbers
  );
  const [fogPool, rng3] = shufflePure<FogRevealTile>(rng2, preset.fogDeck);
  const [harbors, rng4] = placeCoastalHarborsPure(
    topology,
    hexes,
    preset.harbors,
    rng3
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(preset.pirateHex[0], preset.pirateHex[1]),
      fogPool,
    },
    rng4,
  ];
}

// Central fog belt along q = 0 (7 hexes), strictly separated from west (q <= -2) and east (q >= 2) by sea channels
const FOG_ISLANDS_34_PRESET: FogIslandsPreset = {
  getCoords: () => generateHexRadiusCoords(3),
  westIsland: [
    [-3, 0], [-3, 1], [-3, 2], [-3, 3], [-2, 0], [-2, 1], [-2, 2], [-2, 3],
  ],
  eastIsland: [
    [3, -3], [3, -2], [3, -1], [3, 0], [2, -3], [2, -2], [2, -1], [2, 0],
  ],
  fogBelt: [[0, -3], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [0, 3]],
  startTerrains: [
    "forest", "forest", "forest", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "hills", "hills", "hills",
    "mountains", "mountains", "mountains", "desert",
  ],
  startNumbers: [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11],
  fogDeck: [
    { terrain: "gold", numberToken: 6 },
    { terrain: "gold", numberToken: 8 },
    { terrain: "mountains", numberToken: 5 },
    { terrain: "fields", numberToken: 9 },
    { terrain: "forest", numberToken: 4 },
    { terrain: "hills", numberToken: 10 },
    { terrain: "pasture", numberToken: 11 },
  ],
  harbors: STANDARD_HARBORS,
  pirateHex: [-1, -1],
};

const FOG_ISLANDS_56_PRESET: FogIslandsPreset = {
  getCoords: () => buildElongatedMarineCoords(6),
  westIsland: [
    [-2, -1], [-3, 0], [-2, 0], [-3, 1], [-2, 1], [-1, 1],
    [-3, 2], [-2, 2], [-1, 2], [-3, 3], [-2, 3],
  ],
  eastIsland: [
    [5, -3], [6, -3], [4, -2], [5, -2], [6, -2], [4, -1],
    [5, -1], [6, -1], [5, 0], [6, 0], [5, 1],
  ],
  fogBelt: [
    [1, -2], [2, -2], [0, -1], [1, -1], [2, -1],
    [1, 0], [2, 0], [1, 1], [2, 1], [1, 2], [2, 2],
  ],
  startTerrains: [
    "forest", "forest", "forest", "forest",
    "pasture", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "fields",
    "hills", "hills", "hills", "hills",
    "mountains", "mountains", "mountains", "mountains",
    "desert", "desert",
  ],
  startNumbers: [...STANDARD_NUMBERS, 5, 9],
  fogDeck: [
    { terrain: "gold", numberToken: 6 },
    { terrain: "gold", numberToken: 8 },
    { terrain: "gold", numberToken: 5 },
    { terrain: "mountains", numberToken: 5 },
    { terrain: "mountains", numberToken: 9 },
    { terrain: "fields", numberToken: 9 },
    { terrain: "fields", numberToken: 4 },
    { terrain: "forest", numberToken: 4 },
    { terrain: "forest", numberToken: 10 },
    { terrain: "hills", numberToken: 10 },
    { terrain: "pasture", numberToken: 11 },
  ],
  harbors: BIG_ISLAND_HARBORS,
  pirateHex: [0, -2],
};

export function generateSeafarersFogIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersFogBoardPure(config, rng0, FOG_ISLANDS_34_PRESET);
}

export function generateSeafarersFogIslands56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersFogBoardPure(config, rng0, FOG_ISLANDS_56_PRESET);
}
