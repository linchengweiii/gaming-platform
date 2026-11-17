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
  STANDARD_HARBORS,
  STANDARD_NUMBERS,
} from "../config/scenarios-config.ts";
import type { CatanConfig, HexTile, TerrainType } from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildElongatedMarineCoords,
  placeCoastalHarborsPure,
} from "./helpers.ts";

export function generateSeafarersNewShoresBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  const mainIslandSet: ReadonlySet<HexId> = new Set<HexId>([
    hexId(-1, 0),
    hexId(0, 0),
    hexId(-1, 1),
    hexId(0, 1),
    hexId(0, -1),
    hexId(1, -1),
    hexId(-2, 0),
    hexId(-2, 1),
    hexId(-2, 2),
    hexId(-1, 2),
    hexId(-1, -1),
    hexId(1, 0),
    hexId(-3, 1),
    hexId(-3, 2),
  ]);
  const island2Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(2, -3),
    hexId(3, -3),
    hexId(3, -2),
  ]);
  const island3Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(3, 0),
    hexId(2, 1),
    hexId(1, 2),
  ]);
  const island4Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(-1, 3),
    hexId(0, 3),
  ]);

  const [mainTerrains, rng1] = shufflePure<TerrainType>(rng0, [
    "forest",
    "forest",
    "forest",
    "pasture",
    "pasture",
    "pasture",
    "fields",
    "fields",
    "fields",
    "hills",
    "hills",
    "mountains",
    "mountains",
    "desert",
  ]);
  const mainNumbers = [2, 3, 4, 4, 5, 5, 6, 8, 9, 9, 10, 10, 11] as const;

  const [foreignTerrains, rng2] = shufflePure<TerrainType>(rng1, [
    "gold",
    "gold",
    "mountains",
    "hills",
    "fields",
    "pasture",
    "forest",
    "mountains",
  ]);
  const [foreignNumbers, rng3] = shufflePure(rng2, [
    4, 5, 6, 8, 9, 10, 11, 12,
  ]);

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    mainProductiveIds: HexId[];
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
          hexes: { ...acc.hexes, [id]: tile },
          mainProductiveIds:
            terrain === "desert"
              ? acc.mainProductiveIds
              : [...acc.mainProductiveIds, id],
          mainIdx: acc.mainIdx + 1,
          foreignIdx: acc.foreignIdx,
          robberHexId: terrain === "desert" ? id : acc.robberHexId,
        };
      }
      if (island2Set.has(id) || island3Set.has(id) || island4Set.has(id)) {
        const islandId = island2Set.has(id) ? 2 : island3Set.has(id) ? 3 : 4;
        const tile: HexTile = {
          id,
          q,
          r,
          terrain: foreignTerrains[acc.foreignIdx]!,
          numberToken: foreignNumbers[acc.foreignIdx]!,
          islandId,
          allowSetupSettlement: false,
        };
        return {
          ...acc,
          hexes: { ...acc.hexes, [id]: tile },
          foreignIdx: acc.foreignIdx + 1,
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
    {
      hexes: {},
      mainProductiveIds: [],
      mainIdx: 0,
      foreignIdx: 0,
      robberHexId: hexId(-1, 0),
    }
  );

  const [hexes, rng4] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.mainProductiveIds,
    mainNumbers,
    rng3,
    config.balancedNumbers
  );
  const [harbors, rng5] = placeCoastalHarborsPure(
    topology,
    hexes,
    STANDARD_HARBORS,
    rng4
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(2, -1),
      fogPool: [],
    },
    rng5,
  ];
}

export function generateSeafarersNewShores56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = buildElongatedMarineCoords(5);
  const topology = buildHexBoardTopology(coords);

  const mainIslandSet: ReadonlySet<HexId> = new Set<HexId>([
    hexId(-1, -2),
    hexId(0, -2),
    hexId(1, -2),
    hexId(-2, -1),
    hexId(-1, -1),
    hexId(0, -1),
    hexId(1, -1),
    hexId(-3, 0),
    hexId(-2, 0),
    hexId(-1, 0),
    hexId(0, 0),
    hexId(1, 0),
    hexId(-3, 1),
    hexId(-2, 1),
    hexId(-1, 1),
    hexId(0, 1),
    hexId(-3, 2),
    hexId(-2, 2),
    hexId(-1, 2),
    hexId(0, 2),
  ]);
  const island2Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(3, -3),
    hexId(4, -3),
    hexId(3, -2),
  ]);
  const island3Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(5, -2),
    hexId(5, -1),
    hexId(5, 0),
    hexId(4, 0),
  ]);
  const island4Set: ReadonlySet<HexId> = new Set<HexId>([
    hexId(3, 2),
    hexId(2, 3),
    hexId(1, 3),
  ]);

  const [mainTerrains, rng1] = shufflePure<TerrainType>(rng0, [
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
    "mountains",
    "mountains",
    "mountains",
    "desert",
    "desert",
  ]);
  const mainNumbers = STANDARD_NUMBERS;

  const [foreignTerrains, rng2] = shufflePure<TerrainType>(rng1, [
    "gold",
    "gold",
    "gold",
    "mountains",
    "mountains",
    "hills",
    "hills",
    "fields",
    "pasture",
    "forest",
  ]);
  const [foreignNumbers, rng3] = shufflePure(rng2, [
    4, 5, 6, 8, 9, 9, 10, 10, 11, 12,
  ]);

  const laidOut = coords.reduce<{
    hexes: Record<HexId, HexTile>;
    mainProductiveIds: HexId[];
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
          hexes: { ...acc.hexes, [id]: tile },
          mainProductiveIds:
            terrain === "desert"
              ? acc.mainProductiveIds
              : [...acc.mainProductiveIds, id],
          mainIdx: acc.mainIdx + 1,
          foreignIdx: acc.foreignIdx,
          robberHexId: terrain === "desert" ? id : acc.robberHexId,
        };
      }
      if (island2Set.has(id) || island3Set.has(id) || island4Set.has(id)) {
        const islandId = island2Set.has(id) ? 2 : island3Set.has(id) ? 3 : 4;
        const tile: HexTile = {
          id,
          q,
          r,
          terrain: foreignTerrains[acc.foreignIdx]!,
          numberToken: foreignNumbers[acc.foreignIdx]!,
          islandId,
          allowSetupSettlement: false,
        };
        return {
          ...acc,
          hexes: { ...acc.hexes, [id]: tile },
          foreignIdx: acc.foreignIdx + 1,
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
    {
      hexes: {},
      mainProductiveIds: [],
      mainIdx: 0,
      foreignIdx: 0,
      robberHexId: hexId(-1, 0),
    }
  );

  const [hexes, rng4] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.mainProductiveIds,
    mainNumbers,
    rng3,
    config.balancedNumbers
  );
  const [harbors, rng5] = placeCoastalHarborsPure(
    topology,
    hexes,
    BIG_ISLAND_HARBORS,
    rng4
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(2, 0),
      fogPool: [],
    },
    rng5,
  ];
}
