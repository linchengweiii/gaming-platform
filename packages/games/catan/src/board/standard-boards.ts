import {
  type AxialCoord,
  type RngState,
  buildHexBoardTopology,
  generateHexRadiusCoords,
  shufflePure,
} from "@gaming-platform/core";
import {
  BIG_ISLAND_EXTRA_COORDS,
  BIG_ISLAND_HARBORS,
  BIG_ISLAND_NUMBERS,
  BIG_ISLAND_TERRAINS,
  STANDARD_HARBORS,
  STANDARD_NUMBERS,
  STANDARD_TERRAINS,
} from "../config/scenarios-config.ts";
import type { CatanConfig, HarborType, TerrainType } from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildSingleIslandHexes,
  placeCoastalHarborsPure,
} from "./helpers.ts";

function buildSingleIslandBoardPure(
  config: CatanConfig,
  rng0: RngState,
  coords: AxialCoord[],
  terrains: readonly TerrainType[],
  numbers: readonly number[],
  harborsDeck: readonly HarborType[]
): readonly [GeneratedBoard, RngState] {
  const topology = buildHexBoardTopology(coords);
  const [shuffledTerrains, rng1] = shufflePure(rng0, terrains);
  const { hexes: rawHexes, productiveIds, robberHexId } = buildSingleIslandHexes(
    coords,
    shuffledTerrains
  );
  const [hexes, rng2] = assignBalancedNumbersPure(
    rawHexes,
    productiveIds,
    numbers,
    rng1,
    config.balancedNumbers
  );
  const [harbors, rng3] = placeCoastalHarborsPure(
    topology,
    hexes,
    harborsDeck,
    rng2
  );

  return [
    { topology, hexes, harbors, robberHexId, pirateHexId: null, fogPool: [] },
    rng3,
  ];
}

export function generateStandardBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSingleIslandBoardPure(
    config,
    rng0,
    generateHexRadiusCoords(2),
    STANDARD_TERRAINS,
    STANDARD_NUMBERS,
    STANDARD_HARBORS
  );
}

export function generateBigIslandBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  return buildSingleIslandBoardPure(
    config,
    rng0,
    [...generateHexRadiusCoords(2), ...BIG_ISLAND_EXTRA_COORDS],
    BIG_ISLAND_TERRAINS,
    BIG_ISLAND_NUMBERS,
    BIG_ISLAND_HARBORS
  );
}
