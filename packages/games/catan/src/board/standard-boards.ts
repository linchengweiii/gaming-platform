import {
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
import type { CatanConfig } from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildSingleIslandHexes,
  placeCoastalHarborsPure,
} from "./helpers.ts";

export function generateStandardBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = generateHexRadiusCoords(2);
  const topology = buildHexBoardTopology(coords);
  const [shuffledTerrains, rng1] = shufflePure(rng0, STANDARD_TERRAINS);
  const { hexes: rawHexes, productiveIds, robberHexId } = buildSingleIslandHexes(
    coords,
    shuffledTerrains
  );
  const [hexes, rng2] = assignBalancedNumbersPure(
    rawHexes,
    productiveIds,
    STANDARD_NUMBERS,
    rng1,
    config.balancedNumbers
  );
  const [harbors, rng3] = placeCoastalHarborsPure(
    topology,
    hexes,
    STANDARD_HARBORS,
    rng2
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId,
      pirateHexId: null,
      fogPool: [],
    },
    rng3,
  ];
}

export function generateBigIslandBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = [...generateHexRadiusCoords(2), ...BIG_ISLAND_EXTRA_COORDS];
  const topology = buildHexBoardTopology(coords);
  const [shuffledTerrains, rng1] = shufflePure(rng0, BIG_ISLAND_TERRAINS);
  const { hexes: rawHexes, productiveIds, robberHexId } = buildSingleIslandHexes(
    coords,
    shuffledTerrains
  );
  const [hexes, rng2] = assignBalancedNumbersPure(
    rawHexes,
    productiveIds,
    BIG_ISLAND_NUMBERS,
    rng1,
    config.balancedNumbers
  );
  const [harbors, rng3] = placeCoastalHarborsPure(
    topology,
    hexes,
    BIG_ISLAND_HARBORS,
    rng2
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId,
      pirateHexId: null,
      fogPool: [],
    },
    rng3,
  ];
}
