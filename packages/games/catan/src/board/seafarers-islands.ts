import {
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
import type { CatanConfig, HexTile, TerrainType } from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildElongatedMarineCoords,
  placeCoastalHarborsPure,
} from "./helpers.ts";

export function generateSeafarersFourIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  // Four symmetric 5-hex islands strictly separated by >= 1 sea hex (|dq|>=2 or |dr|>=2)
  const island1Coords = [
    hexId(0, -3),
    hexId(-1, -2),
    hexId(0, -2),
    hexId(-1, -1),
    hexId(-2, -1),
  ] as const;
  const island2Coords = [
    hexId(2, -3),
    hexId(3, -3),
    hexId(2, -2),
    hexId(3, -2),
    hexId(3, -1),
  ] as const;
  const island3Coords = [
    hexId(-3, 1),
    hexId(-3, 2),
    hexId(-3, 3),
    hexId(-2, 2),
    hexId(-2, 3),
  ] as const;
  const island4Coords = [
    hexId(0, 2),
    hexId(0, 3),
    hexId(1, 1),
    hexId(1, 2),
    hexId(2, 1),
  ] as const;

  const islandMap: ReadonlyMap<HexId, number> = new Map<HexId, number>([
    ...island1Coords.map((id) => [id, 1] as const),
    ...island2Coords.map((id) => [id, 2] as const),
    ...island3Coords.map((id) => [id, 3] as const),
    ...island4Coords.map((id) => [id, 4] as const),
  ]);

  const [landTerrains, rng1] = shufflePure<TerrainType>(rng0, [
    "forest",
    "forest",
    "forest",
    "forest",
    "pasture",
    "pasture",
    "pasture",
    "pasture",
    "fields",
    "fields",
    "fields",
    "fields",
    "hills",
    "hills",
    "hills",
    "hills",
    "mountains",
    "mountains",
    "mountains",
    "mountains",
  ]);
  const landNumbers = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 5, 9,
  ] as const;

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    productiveIds: HexId[];
    landIdx: number;
  }>(
    (acc, { q, r }) => {
      const id = hexId(q, r);
      const islandId = islandMap.get(id) ?? 0;
      if (islandId > 0) {
        const tile: HexTile = {
          id,
          q,
          r,
          terrain: landTerrains[acc.landIdx]!,
          numberToken: null,
          islandId,
          allowSetupSettlement: true,
        };
        return {
          hexes: { ...acc.hexes, [id]: tile },
          productiveIds: [...acc.productiveIds, id],
          landIdx: acc.landIdx + 1,
        };
      }
      const seaTile: HexTile = {
        id,
        q,
        r,
        terrain: "sea",
        numberToken: null,
        islandId: 0,
        allowSetupSettlement: false,
      };
      return {
        ...acc,
        hexes: { ...acc.hexes, [id]: seaTile },
      };
    },
    { hexes: {}, productiveIds: [], landIdx: 0 }
  );

  const [hexes, rng2] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.productiveIds,
    landNumbers,
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
      robberHexId: island1Coords[0],
      pirateHexId: hexId(0, 0),
      fogPool: [],
    },
    rng3,
  ];
}

export function generateSeafarersSixIslands56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = buildElongatedMarineCoords(6);
  const topology = buildHexBoardTopology(coords);

  const island1Coords = [
    hexId(-1, -2),
    hexId(0, -2),
    hexId(0, -3),
    hexId(-2, -1),
    hexId(-1, -1),
  ] as const;
  const island2Coords = [
    hexId(2, -3),
    hexId(3, -3),
    hexId(4, -3),
    hexId(2, -2),
    hexId(3, -2),
  ] as const;
  const island3Coords = [
    hexId(6, -3),
    hexId(5, -2),
    hexId(6, -2),
    hexId(5, -1),
    hexId(6, -1),
  ] as const;
  const island4Coords = [
    hexId(-3, 1),
    hexId(-2, 1),
    hexId(-3, 2),
    hexId(-2, 2),
    hexId(-3, 3),
  ] as const;
  const island5Coords = [
    hexId(0, 2),
    hexId(1, 2),
    hexId(0, 3),
    hexId(1, 3),
    hexId(1, 1),
  ] as const;
  const island6Coords = [
    hexId(4, 1),
    hexId(5, 1),
    hexId(3, 2),
    hexId(4, 2),
    hexId(3, 3),
  ] as const;

  const islandMap: ReadonlyMap<HexId, number> = new Map<HexId, number>([
    ...island1Coords.map((id) => [id, 1] as const),
    ...island2Coords.map((id) => [id, 2] as const),
    ...island3Coords.map((id) => [id, 3] as const),
    ...island4Coords.map((id) => [id, 4] as const),
    ...island5Coords.map((id) => [id, 5] as const),
    ...island6Coords.map((id) => [id, 6] as const),
  ]);

  const [landTerrains, rng1] = shufflePure<TerrainType>(rng0, [
    "forest",
    "forest",
    "forest",
    "forest",
    "forest",
    "forest",
    "pasture",
    "pasture",
    "pasture",
    "pasture",
    "pasture",
    "pasture",
    "fields",
    "fields",
    "fields",
    "fields",
    "fields",
    "fields",
    "hills",
    "hills",
    "hills",
    "hills",
    "hills",
    "hills",
    "mountains",
    "mountains",
    "mountains",
    "mountains",
    "mountains",
    "mountains",
  ]);
  const landNumbers = [
    ...BIG_ISLAND_NUMBERS,
    4,
    9,
  ] as const;

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    productiveIds: HexId[];
    landIdx: number;
  }>(
    (acc, { q, r }) => {
      const id = hexId(q, r);
      const islandId = islandMap.get(id) ?? 0;
      if (islandId > 0) {
        const tile: HexTile = {
          id,
          q,
          r,
          terrain: landTerrains[acc.landIdx]!,
          numberToken: null,
          islandId,
          allowSetupSettlement: true,
        };
        return {
          hexes: { ...acc.hexes, [id]: tile },
          productiveIds: [...acc.productiveIds, id],
          landIdx: acc.landIdx + 1,
        };
      }
      const seaTile: HexTile = {
        id,
        q,
        r,
        terrain: "sea",
        numberToken: null,
        islandId: 0,
        allowSetupSettlement: false,
      };
      return {
        ...acc,
        hexes: { ...acc.hexes, [id]: seaTile },
      };
    },
    { hexes: {}, productiveIds: [], landIdx: 0 }
  );

  const [hexes, rng2] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.productiveIds,
    landNumbers,
    rng1,
    config.balancedNumbers
  );
  const [harbors, rng3] = placeCoastalHarborsPure(
    topology,
    hexes,
    [...BIG_ISLAND_HARBORS, "generic"],
    rng2
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: island1Coords[0],
      pirateHexId: hexId(1, -1),
      fogPool: [],
    },
    rng3,
  ];
}
