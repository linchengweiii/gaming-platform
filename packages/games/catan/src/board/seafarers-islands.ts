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
  BIG_ISLAND_NUMBERS,
  STANDARD_HARBORS,
} from "../config/scenarios-config.ts";
import type {
  CatanConfig,
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

interface IslandsPreset {
  getCoords: () => AxialCoord[];
  islands: readonly (readonly (readonly [number, number])[])[];
  terrainCopiesEach: number;
  landNumbers: readonly number[];
  harbors: readonly HarborType[];
  pirateHex: readonly [number, number];
}

const ISLAND_TERRAINS: readonly TerrainType[] = [
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
];

function buildSeafarersIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState,
  preset: IslandsPreset
): readonly [GeneratedBoard, RngState] {
  const coords = preset.getCoords();
  const topology = buildHexBoardTopology(coords);
  const islandMap: ReadonlyMap<HexId, number> = new Map(
    preset.islands.flatMap((list, idx) =>
      list.map(([q, r]) => [hexId(q, r), idx + 1] as const)
    )
  );
  const terrainDeck = ISLAND_TERRAINS.flatMap((t) =>
    Array.from({ length: preset.terrainCopiesEach }, () => t)
  );
  const [landTerrains, rng1] = shufflePure<TerrainType>(rng0, terrainDeck);

  const rawHexes: Record<HexId, HexTile> = {};
  const productiveIds: HexId[] = [];
  let landIdx = 0;

  for (const { q, r } of coords) {
    const id = hexId(q, r);
    const islandId = islandMap.get(id) ?? 0;
    if (islandId > 0) {
      rawHexes[id] = {
        id,
        q,
        r,
        terrain: landTerrains[landIdx++]!,
        numberToken: null,
        islandId,
        allowSetupSettlement: true,
      };
      productiveIds.push(id);
    } else {
      rawHexes[id] = {
        id,
        q,
        r,
        terrain: "sea",
        numberToken: null,
        islandId: 0,
        allowSetupSettlement: false,
      };
    }
  }

  const [hexes, rng2] = assignBalancedNumbersPure(
    rawHexes,
    productiveIds,
    preset.landNumbers,
    rng1,
    config.balancedNumbers
  );
  const [harbors, rng3] = placeCoastalHarborsPure(
    topology,
    hexes,
    preset.harbors,
    rng2
  );

  return [
    {
      topology,
      hexes,
      harbors,
      // No desert hex on this map: official Seafarers rule starts the Robber off-board
      robberHexId: "",
      pirateHexId: hexId(preset.pirateHex[0], preset.pirateHex[1]),
      fogPool: [],
    },
    rng3,
  ];
}

// Symmetric 5-hex islands strictly separated by >= 1 sea hex (|dq|>=2 or |dr|>=2)
const FOUR_ISLANDS_PRESET: IslandsPreset = {
  getCoords: () => generateHexRadiusCoords(3),
  islands: [
    [[0, -3], [-1, -2], [0, -2], [-1, -1], [-2, -1]],
    [[2, -3], [3, -3], [2, -2], [3, -2], [3, -1]],
    [[-3, 1], [-3, 2], [-3, 3], [-2, 2], [-2, 3]],
    [[0, 2], [0, 3], [1, 1], [1, 2], [2, 1]],
  ],
  terrainCopiesEach: 4,
  landNumbers: [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 5, 9,
  ],
  harbors: STANDARD_HARBORS,
  pirateHex: [0, 0],
};

const SIX_ISLANDS_56_PRESET: IslandsPreset = {
  getCoords: () => buildElongatedMarineCoords(6),
  islands: [
    [[-1, -2], [0, -2], [0, -3], [-2, -1], [-1, -1]],
    [[2, -3], [3, -3], [4, -3], [2, -2], [3, -2]],
    [[6, -3], [5, -2], [6, -2], [5, -1], [6, -1]],
    [[-3, 1], [-2, 1], [-3, 2], [-2, 2], [-3, 3]],
    [[0, 2], [1, 2], [0, 3], [1, 3], [1, 1]],
    [[4, 1], [5, 1], [3, 2], [4, 2], [3, 3]],
  ],
  terrainCopiesEach: 6,
  landNumbers: [...BIG_ISLAND_NUMBERS, 4, 9],
  harbors: [...BIG_ISLAND_HARBORS, "generic"],
  pirateHex: [1, -1],
};

export function generateSeafarersFourIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersIslandsBoardPure(config, rng0, FOUR_ISLANDS_PRESET);
}

export function generateSeafarersSixIslands56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersIslandsBoardPure(config, rng0, SIX_ISLANDS_56_PRESET);
}
