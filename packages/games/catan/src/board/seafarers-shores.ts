import {
  type HexId,
  type RngState,
  buildHexBoardTopology,
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

interface NewShoresPreset {
  maxQ: number;
  mainIsland: readonly (readonly [number, number])[];
  foreignIslands: readonly {
    id: number;
    coords: readonly (readonly [number, number])[];
  }[];
  mainTerrains: readonly TerrainType[];
  mainNumbers: readonly number[];
  foreignTerrains: readonly TerrainType[];
  foreignNumbers: readonly number[];
  harbors: readonly HarborType[];
  pirateHex: readonly [number, number];
}

function buildSeafarersNewShoresBoardPure(
  config: CatanConfig,
  rng0: RngState,
  preset: NewShoresPreset
): readonly [GeneratedBoard, RngState] {
  const coords = buildElongatedMarineCoords(preset.maxQ);
  const topology = buildHexBoardTopology(coords);
  const mainIslandSet: ReadonlySet<HexId> = new Set(
    preset.mainIsland.map(([q, r]) => hexId(q, r))
  );
  const foreignIslandByHex = new Map<HexId, number>(
    preset.foreignIslands.flatMap(({ id, coords: list }) =>
      list.map(([q, r]) => [hexId(q, r), id] as const)
    )
  );

  const [mainTerrains, rng1] = shufflePure<TerrainType>(
    rng0,
    preset.mainTerrains
  );
  const [foreignTerrains, rng2] = shufflePure<TerrainType>(
    rng1,
    preset.foreignTerrains
  );

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    mainProductiveIds: HexId[];
    foreignProductiveIds: HexId[];
    mainIdx: number;
    foreignIdx: number;
    robberHexId: HexId;
  }>(
    (acc, { q, r }) => {
      const id = hexId(q, r);
      if (mainIslandSet.has(id)) {
        const terrain = mainTerrains[acc.mainIdx]!;
        const tile: HexTile = {
          id,
          q,
          r,
          terrain,
          numberToken: null,
          islandId: 1,
          allowSetupSettlement: true,
        };
        return {
          ...acc,
          hexes: { ...acc.hexes, [id]: tile },
          mainProductiveIds:
            terrain === "desert"
              ? acc.mainProductiveIds
              : [...acc.mainProductiveIds, id],
          mainIdx: acc.mainIdx + 1,
          robberHexId: terrain === "desert" ? id : acc.robberHexId,
        };
      }
      const foreignIslandId = foreignIslandByHex.get(id);
      if (foreignIslandId !== undefined) {
        const tile: HexTile = {
          id,
          q,
          r,
          terrain: foreignTerrains[acc.foreignIdx]!,
          numberToken: null,
          islandId: foreignIslandId,
          allowSetupSettlement: false,
        };
        return {
          ...acc,
          hexes: { ...acc.hexes, [id]: tile },
          foreignProductiveIds: [...acc.foreignProductiveIds, id],
          foreignIdx: acc.foreignIdx + 1,
        };
      }
      return {
        ...acc,
        hexes: {
          ...acc.hexes,
          [id]: {
            id,
            q,
            r,
            terrain: "sea",
            numberToken: null,
            islandId: 0,
            allowSetupSettlement: false,
          },
        },
      };
    },
    {
      hexes: {},
      mainProductiveIds: [],
      foreignProductiveIds: [],
      mainIdx: 0,
      foreignIdx: 0,
      robberHexId: hexId(-1, 0),
    }
  );

  const [mainAssignedHexes, rng3] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.mainProductiveIds,
    preset.mainNumbers,
    rng2,
    config.balancedNumbers
  );
  const [hexes, rng4] = assignBalancedNumbersPure(
    mainAssignedHexes,
    laidOut.foreignProductiveIds,
    preset.foreignNumbers,
    rng3,
    config.balancedNumbers
  );
  const [harbors, rng5] = placeCoastalHarborsPure(
    topology,
    hexes,
    preset.harbors,
    rng4
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(preset.pirateHex[0], preset.pirateHex[1]),
      fogPool: [],
    },
    rng5,
  ];
}

// Main island strictly separated by >= 1 sea hex from every offshore island
const NEW_SHORES_34_PRESET: NewShoresPreset = {
  maxQ: 4,
  mainIsland: [
    [-3, 0], [-3, 1], [-3, 2], [-2, 0], [-2, 1], [-2, 2],
    [-1, -1], [-1, 0], [-1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [1, -1],
  ],
  foreignIslands: [
    { id: 2, coords: [[3, -3], [4, -3], [4, -2]] },
    { id: 3, coords: [[3, 0], [4, 0], [3, 1]] },
    { id: 4, coords: [[0, 3], [1, 3]] },
  ],
  mainTerrains: [
    "forest", "forest", "forest", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "hills", "hills",
    "mountains", "mountains", "desert",
  ],
  mainNumbers: [2, 3, 4, 4, 5, 5, 6, 8, 9, 9, 10, 10, 11],
  foreignTerrains: [
    "gold", "gold", "mountains", "hills", "fields", "pasture", "forest", "mountains",
  ],
  foreignNumbers: [4, 5, 6, 8, 9, 10, 11, 12],
  harbors: STANDARD_HARBORS,
  pirateHex: [2, -1],
};

const NEW_SHORES_56_PRESET: NewShoresPreset = {
  maxQ: 5,
  mainIsland: [
    [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1],
    [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0],
    [-3, 1], [-2, 1], [-1, 1], [0, 1],
    [-3, 2], [-2, 2], [-1, 2], [0, 2],
  ],
  foreignIslands: [
    { id: 2, coords: [[3, -3], [4, -3], [3, -2]] },
    { id: 3, coords: [[5, -2], [5, -1], [5, 0], [4, 0]] },
    { id: 4, coords: [[3, 2], [2, 3], [1, 3]] },
  ],
  mainTerrains: [
    "forest", "forest", "forest", "forest",
    "pasture", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "fields",
    "hills", "hills", "hills",
    "mountains", "mountains", "mountains",
    "desert", "desert",
  ],
  mainNumbers: STANDARD_NUMBERS,
  foreignTerrains: [
    "gold", "gold", "gold", "mountains", "mountains",
    "hills", "hills", "fields", "pasture", "forest",
  ],
  foreignNumbers: [4, 5, 6, 8, 9, 9, 10, 10, 11, 12],
  harbors: BIG_ISLAND_HARBORS,
  pirateHex: [2, 0],
};

export function generateSeafarersNewShoresBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersNewShoresBoardPure(config, rng0, NEW_SHORES_34_PRESET);
}

export function generateSeafarersNewShores56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSeafarersNewShoresBoardPure(config, rng0, NEW_SHORES_56_PRESET);
}
