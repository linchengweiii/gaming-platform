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
import type {
  CatanConfig,
  FogRevealTile,
  HexTile,
  TerrainType,
} from "../types/domain.ts";
import {
  type GeneratedBoard,
  assignBalancedNumbersPure,
  buildElongatedMarineCoords,
  placeCoastalHarborsPure,
} from "./helpers.ts";

export function generateSeafarersFogIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  const westIsland: ReadonlySet<HexId> = new Set<HexId>([
    hexId(-3, 0),
    hexId(-3, 1),
    hexId(-3, 2),
    hexId(-3, 3),
    hexId(-2, 0),
    hexId(-2, 1),
    hexId(-2, 2),
    hexId(-2, 3),
  ]);
  const eastIsland: ReadonlySet<HexId> = new Set<HexId>([
    hexId(3, -3),
    hexId(3, -2),
    hexId(3, -1),
    hexId(3, 0),
    hexId(2, -3),
    hexId(2, -2),
    hexId(2, -1),
    hexId(2, 0),
  ]);
  // Central fog belt along q = 0 (7 hexes), strictly separated from west (q <= -2) and east (q >= 2) by sea channels
  const fogBelt: ReadonlySet<HexId> = new Set<HexId>([
    hexId(0, -3),
    hexId(0, -2),
    hexId(0, -1),
    hexId(0, 0),
    hexId(0, 1),
    hexId(0, 2),
    hexId(0, 3),
  ]);

  const [startTerrains, rng1] = shufflePure<TerrainType>(rng0, [
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
    "hills",
    "mountains",
    "mountains",
    "mountains",
    "desert",
  ]);
  const startNumbers = [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11] as const;

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
      if (fogBelt.has(id)) {
        const fogTile: HexTile = {
          id,
          q,
          r,
          terrain: "fog",
          numberToken: null,
          islandId: 3,
          allowSetupSettlement: false,
        };
        return { ...acc, hexes: { ...acc.hexes, [id]: fogTile } };
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
      return { ...acc, hexes: { ...acc.hexes, [id]: seaTile } };
    },
    { hexes: {}, productiveIds: [], idx: 0, robberHexId: hexId(-2, 1) }
  );

  const [hexes, rng2] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.productiveIds,
    startNumbers,
    rng1,
    config.balancedNumbers
  );

  const [fogPool, rng3] = shufflePure<FogRevealTile>(rng2, [
    { terrain: "gold", numberToken: 6 },
    { terrain: "gold", numberToken: 8 },
    { terrain: "mountains", numberToken: 5 },
    { terrain: "fields", numberToken: 9 },
    { terrain: "forest", numberToken: 4 },
    { terrain: "hills", numberToken: 10 },
    { terrain: "pasture", numberToken: 11 },
  ]);

  const [harbors, rng4] = placeCoastalHarborsPure(
    topology,
    hexes,
    STANDARD_HARBORS,
    rng3
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(-1, -1),
      fogPool,
    },
    rng4,
  ];
}

export function generateSeafarersFogIslands56BoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = buildElongatedMarineCoords(6);
  const topology = buildHexBoardTopology(coords);

  const westIsland: ReadonlySet<HexId> = new Set<HexId>([
    hexId(-2, -1),
    hexId(-3, 0),
    hexId(-2, 0),
    hexId(-3, 1),
    hexId(-2, 1),
    hexId(-1, 1),
    hexId(-3, 2),
    hexId(-2, 2),
    hexId(-1, 2),
    hexId(-3, 3),
    hexId(-2, 3),
  ]);
  const eastIsland: ReadonlySet<HexId> = new Set<HexId>([
    hexId(5, -3),
    hexId(6, -3),
    hexId(4, -2),
    hexId(5, -2),
    hexId(6, -2),
    hexId(4, -1),
    hexId(5, -1),
    hexId(6, -1),
    hexId(5, 0),
    hexId(6, 0),
    hexId(5, 1),
  ]);
  const fogBelt: ReadonlySet<HexId> = new Set<HexId>([
    hexId(1, -2),
    hexId(2, -2),
    hexId(0, -1),
    hexId(1, -1),
    hexId(2, -1),
    hexId(1, 0),
    hexId(2, 0),
    hexId(1, 1),
    hexId(2, 1),
    hexId(1, 2),
    hexId(2, 2),
  ]);

  const [startTerrains, rng1] = shufflePure<TerrainType>(rng0, [
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
    "desert",
    "desert",
  ]);
  const startNumbers = [
    ...STANDARD_NUMBERS,
    5,
    9,
  ] as const;

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
      if (fogBelt.has(id)) {
        const fogTile: HexTile = {
          id,
          q,
          r,
          terrain: "fog",
          numberToken: null,
          islandId: 3,
          allowSetupSettlement: false,
        };
        return { ...acc, hexes: { ...acc.hexes, [id]: fogTile } };
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
      return { ...acc, hexes: { ...acc.hexes, [id]: seaTile } };
    },
    { hexes: {}, productiveIds: [], idx: 0, robberHexId: hexId(-2, 1) }
  );

  const [hexes, rng2] = assignBalancedNumbersPure(
    laidOut.hexes,
    laidOut.productiveIds,
    startNumbers,
    rng1,
    config.balancedNumbers
  );

  const [fogPool, rng3] = shufflePure<FogRevealTile>(rng2, [
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
  ]);

  const [harbors, rng4] = placeCoastalHarborsPure(
    topology,
    hexes,
    BIG_ISLAND_HARBORS,
    rng3
  );

  return [
    {
      topology,
      hexes,
      harbors,
      robberHexId: laidOut.robberHexId,
      pirateHexId: hexId(0, -2),
      fogPool,
    },
    rng4,
  ];
}
