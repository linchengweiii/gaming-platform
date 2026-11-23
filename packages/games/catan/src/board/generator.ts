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
  BIG_ISLAND_EXTRA_COORDS,
  BIG_ISLAND_HARBORS,
  BIG_ISLAND_NUMBERS,
  BIG_ISLAND_TERRAINS,
  STANDARD_HARBORS,
  STANDARD_NUMBERS,
  STANDARD_TERRAINS,
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
  placeCoastalHarborsPure,
} from "./helpers.ts";
import {
  generateSeafarersFogIslands56BoardPure,
  generateSeafarersFogIslandsBoardPure,
} from "./seafarers-fog.ts";
import {
  generateSeafarersFourIslandsBoardPure,
  generateSeafarersSixIslands56BoardPure,
} from "./seafarers-islands.ts";
import {
  generateSeafarersNewShores56BoardPure,
  generateSeafarersNewShoresBoardPure,
} from "./seafarers-shores.ts";

function buildSingleIslandBoardPure(
  config: CatanConfig,
  rng0: RngState,
  coords: readonly AxialCoord[],
  terrains: readonly TerrainType[],
  numbers: readonly number[],
  harborsDeck: readonly HarborType[]
): readonly [GeneratedBoard, RngState] {
  const topology = buildHexBoardTopology(coords);
  const [shuffledTerrains, rng1] = shufflePure(rng0, terrains);

  const rawHexes: Record<HexId, HexTile> = {};
  const productiveIds: HexId[] = [];
  let robberHexId = hexId(0, 0);
  for (let i = 0; i < coords.length; i++) {
    const { q, r } = coords[i]!;
    const id = hexId(q, r);
    const terrain = shuffledTerrains[i]!;
    rawHexes[id] = {
      id,
      q,
      r,
      terrain,
      numberToken: null,
      islandId: 1,
      allowSetupSettlement: true,
    };
    if (terrain === "desert") robberHexId = id;
    else productiveIds.push(id);
  }

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

function generateBigIslandBoardPure(
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

export function generateCatanBoardPure(
  config: CatanConfig,
  rngState: RngState
): readonly [GeneratedBoard, RngState] {
  const use56 = Boolean(config.enable56PlayerExtension);
  switch (config.scenarioId) {
    case "big_island_5_6":
    case "cities_and_knights_5_6":
      return generateBigIslandBoardPure(config, rngState);
    case "seafarers_new_shores_5_6":
      return generateSeafarersNewShores56BoardPure(config, rngState);
    case "seafarers_six_islands_5_6":
      return generateSeafarersSixIslands56BoardPure(config, rngState);
    case "seafarers_fog_islands_5_6":
      return generateSeafarersFogIslands56BoardPure(config, rngState);
    case "seafarers_new_shores":
      return use56
        ? generateSeafarersNewShores56BoardPure(config, rngState)
        : generateSeafarersNewShoresBoardPure(config, rngState);
    case "seafarers_four_islands":
      return use56
        ? generateSeafarersSixIslands56BoardPure(config, rngState)
        : generateSeafarersFourIslandsBoardPure(config, rngState);
    case "seafarers_fog_islands":
      return use56
        ? generateSeafarersFogIslands56BoardPure(config, rngState)
        : generateSeafarersFogIslandsBoardPure(config, rngState);
    case "cities_and_knights":
    case "standard":
    default:
      return use56
        ? generateBigIslandBoardPure(config, rngState)
        : buildSingleIslandBoardPure(
            config,
            rngState,
            generateHexRadiusCoords(2),
            STANDARD_TERRAINS,
            STANDARD_NUMBERS,
            STANDARD_HARBORS
          );
  }
}
