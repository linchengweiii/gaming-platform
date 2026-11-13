import {
  type AxialCoord,
  type EdgeId,
  type HexBoardTopology,
  type HexId,
  type RngState,
  type SeededRNG,
  type VertexId,
  axialDistance,
  buildHexBoardTopology,
  generateHexRadiusCoords,
  hexId,
  shufflePure,
} from "@gaming-platform/core";
import type {
  CatanConfig,
  DevCardType,
  FogRevealTile,
  Harbor,
  HarborType,
  HexTile,
  ScenarioId,
  TerrainType,
} from "./types.ts";

export interface ScenarioDescriptor {
  id: ScenarioId;
  name: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTargetVp: number;
  enableSeafarers: boolean;
  enableSpecialBuildingPhase: boolean;
}

export const SCENARIO_CATALOG: Record<ScenarioId, ScenarioDescriptor> = {
  standard: {
    id: "standard",
    name: "Standard Catan (Base Game)",
    subtitle: "3–4 Players • 19 Hexes • 10 VP",
    description:
      "The classic island of Catan with 19 terrain hexes, 9 harbors, Longest Road, and Largest Army.",
    minPlayers: 2,
    maxPlayers: 4,
    defaultTargetVp: 10,
    enableSeafarers: false,
    enableSpecialBuildingPhase: false,
  },
  big_island_5_6: {
    id: "big_island_5_6",
    name: "5–6 Player Extension (Big Island)",
    subtitle: "3–6 Players • 30 Hexes • Special Building Phase",
    description:
      "Expanded 30-hex island with 11 harbors, larger resource bank & dev deck, and between-turn Special Building Phase.",
    minPlayers: 2,
    maxPlayers: 6,
    defaultTargetVp: 10,
    enableSeafarers: false,
    enableSpecialBuildingPhase: true,
  },
  seafarers_new_shores: {
    id: "seafarers_new_shores",
    name: "Seafarers: Heading for New Shores",
    subtitle: "3–4 Players • Ships & Pirate • Gold Islands • 12 VP",
    description:
      "Start on the main island, build ships across the sea to colonize gold-rich offshore islands, and earn +2 Bonus VP per new island settled!",
    minPlayers: 2,
    maxPlayers: 4,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableSpecialBuildingPhase: false,
  },
  seafarers_four_islands: {
    id: "seafarers_four_islands",
    name: "Seafarers: The Four Islands",
    subtitle: "3–4 Players • Archipelago • Ships & Pirate • 12 VP",
    description:
      "Four fertile islands separated by sea channels. Start on up to two home islands and sail to settle foreign islands for +2 Bonus VP each.",
    minPlayers: 2,
    maxPlayers: 4,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableSpecialBuildingPhase: false,
  },
  seafarers_fog_islands: {
    id: "seafarers_fog_islands",
    name: "Seafarers: The Fog Islands",
    subtitle: "3–4 Players • Exploration • Mystery Fog Hexes • 12 VP",
    description:
      "Sail into the uncharted central fog bank! Reaching a fog edge reveals hidden terrain, number tokens, and free discovery resources.",
    minPlayers: 2,
    maxPlayers: 4,
    defaultTargetVp: 12,
    enableSeafarers: true,
    enableSpecialBuildingPhase: false,
  },
};

const STANDARD_TERRAINS: readonly TerrainType[] = [
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
];

const STANDARD_NUMBERS: readonly number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

const STANDARD_HARBORS: readonly HarborType[] = [
  "generic",
  "brick",
  "generic",
  "lumber",
  "generic",
  "wool",
  "grain",
  "generic",
  "ore",
];

const BIG_ISLAND_EXTRA_COORDS: readonly AxialCoord[] = [
  { q: 0, r: -3 },
  { q: 1, r: -3 },
  { q: 2, r: -3 },
  { q: 3, r: -3 },
  { q: 3, r: -2 },
  { q: 3, r: -1 },
  { q: 3, r: 0 },
  { q: 2, r: 1 },
  { q: 1, r: 2 },
  { q: 0, r: 3 },
  { q: -1, r: 3 },
];

const BIG_ISLAND_TERRAINS: readonly TerrainType[] = [
  ...STANDARD_TERRAINS,
  "forest",
  "forest",
  "pasture",
  "pasture",
  "fields",
  "fields",
  "hills",
  "hills",
  "mountains",
  "mountains",
  "desert",
];

const BIG_ISLAND_NUMBERS: readonly number[] = [
  ...STANDARD_NUMBERS,
  2,
  3,
  4,
  5,
  6,
  8,
  9,
  10,
  11,
  12,
];

const BIG_ISLAND_HARBORS: readonly HarborType[] = [
  ...STANDARD_HARBORS,
  "generic",
  "wool",
];

function countAdjacentRedConflicts(
  productiveHexes: readonly HexTile[],
  candidateNumbers: readonly number[]
): number {
  return productiveHexes.reduce((outerSum, h1, i) => {
    const n1 = candidateNumbers[i]!;
    if (n1 !== 6 && n1 !== 8) {
      return outerSum;
    }
    const innerConflicts = productiveHexes
      .slice(i + 1)
      .filter((h2, offset) => {
        const n2 = candidateNumbers[i + 1 + offset]!;
        return (n2 === 6 || n2 === 8) && axialDistance(h1, h2) === 1;
      }).length;
    return outerSum + innerConflicts;
  }, 0);
}

/**
 * Pure number-token assignment returning updated `hexes` map and `rngState` without mutating inputs.
 */
function assignBalancedNumbersPure(
  hexes: Readonly<Record<HexId, HexTile>>,
  productiveIds: readonly HexId[],
  numbersPool: readonly number[],
  rngState: RngState,
  balanced: boolean
): readonly [Record<HexId, HexTile>, RngState] {
  const productiveHexes = productiveIds.map((id) => hexes[id]!);
  const [initialAssignment, rngAfterInitial] = shufflePure(
    rngState,
    numbersPool
  );

  const searchBalanced = (
    attempt: number,
    bestAssignment: readonly number[],
    bestConflicts: number,
    curRng: RngState
  ): readonly [readonly number[], RngState] => {
    if (!balanced || attempt >= 60) {
      return [bestAssignment, curRng];
    }
    const [candidate, nextRng] = shufflePure(curRng, numbersPool);
    const conflicts = countAdjacentRedConflicts(productiveHexes, candidate);
    const nextBest =
      conflicts < bestConflicts ? candidate : bestAssignment;
    const nextMinConflicts = Math.min(bestConflicts, conflicts);
    if (conflicts === 0) {
      return [candidate, nextRng];
    }
    return searchBalanced(attempt + 1, nextBest, nextMinConflicts, nextRng);
  };

  const [chosenNumbers, finalRng] = searchBalanced(
    0,
    initialAssignment,
    Infinity,
    rngAfterInitial
  );

  const updatedHexes = productiveIds.reduce<Record<HexId, HexTile>>(
    (acc, id, idx) => ({
      ...acc,
      [id]: {
        ...acc[id]!,
        numberToken: chosenNumbers[idx] ?? 5,
      },
    }),
    { ...hexes }
  );

  return [updatedHexes, finalRng];
}

/**
 * Pure harbor placement along coastal edges of setup-eligible land hexes.
 */
function placeCoastalHarborsPure(
  topology: HexBoardTopology,
  hexes: Readonly<Record<HexId, HexTile>>,
  harborTypes: readonly HarborType[],
  rngState: RngState
): readonly [Harbor[], RngState] {
  const candidateEdgeIds = topology.edgeOrder.filter((eId) => {
    const edge = topology.edges[eId]!;
    const adjHexes = edge.adjacentHexIds
      .map((id) => hexes[id])
      .filter((h): h is HexTile => Boolean(h));
    const hasSetupLand = adjHexes.some(
      (h) =>
        h.allowSetupSettlement && h.terrain !== "sea" && h.terrain !== "fog"
    );
    if (!hasSetupLand) return false;
    return adjHexes.length === 1 || adjHexes.some((h) => h.terrain === "sea");
  });

  const { sumX, sumY } = candidateEdgeIds.reduce(
    (acc, eId) => {
      const e = topology.edges[eId]!;
      return { sumX: acc.sumX + e.midX, sumY: acc.sumY + e.midY };
    },
    { sumX: 0, sumY: 0 }
  );
  const count = candidateEdgeIds.length;
  const centerX = count > 0 ? sumX / count : 0;
  const centerY = count > 0 ? sumY / count : 0;

  const sortedCandidates = [...candidateEdgeIds].sort((a, b) => {
    const ea = topology.edges[a]!;
    const eb = topology.edges[b]!;
    const angA = Math.atan2(ea.midY - centerY, ea.midX - centerX);
    const angB = Math.atan2(eb.midY - centerY, eb.midX - centerX);
    return angA - angB;
  });

  const [shuffledTypes, nextRng] = shufflePure(rngState, harborTypes);
  const targetCount = Math.min(shuffledTypes.length, sortedCandidates.length);
  if (targetCount === 0) {
    return [[], nextRng];
  }

  const stride = sortedCandidates.length / targetCount;
  const indices = Array.from({ length: targetCount }, (_, i) => i);
  const offsets = Array.from(
    { length: sortedCandidates.length },
    (_, offset) => offset
  );

  const { harbors } = indices.reduce<{
    usedVertices: ReadonlySet<VertexId>;
    harbors: Harbor[];
  }>(
    (acc, i) => {
      const startIdx = Math.floor(i * stride);
      const chosenEdgeId: EdgeId | undefined = offsets
        .map((offset) => sortedCandidates[(startIdx + offset) % sortedCandidates.length]!)
        .find((eId) => {
          const edge = topology.edges[eId]!;
          return !acc.usedVertices.has(edge.v1) && !acc.usedVertices.has(edge.v2);
        });

      if (!chosenEdgeId) {
        return acc;
      }

      const edge = topology.edges[chosenEdgeId]!;
      const seaHex = edge.adjacentHexIds.find(
        (id) => hexes[id]?.terrain === "sea"
      );
      const harbor: Harbor = {
        id: `harbor-${i + 1}`,
        type: shuffledTypes[i]!,
        edgeId: chosenEdgeId,
        vertexIds: [edge.v1, edge.v2],
        seaHexId: seaHex,
      };
      return {
        usedVertices: new Set([...acc.usedVertices, edge.v1, edge.v2]),
        harbors: [...acc.harbors, harbor],
      };
    },
    { usedVertices: new Set<VertexId>(), harbors: [] }
  );

  return [harbors, nextRng];
}

export interface GeneratedBoard {
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  robberHexId: HexId;
  pirateHexId: HexId | null;
  fogPool: FogRevealTile[];
}

function buildSingleIslandHexes(
  coords: readonly AxialCoord[],
  shuffledTerrains: readonly TerrainType[]
): {
  hexes: Record<HexId, HexTile>;
  productiveIds: HexId[];
  robberHexId: HexId;
} {
  return coords.reduce<{
    hexes: Record<HexId, HexTile>;
    productiveIds: HexId[];
    robberHexId: HexId;
  }>(
    (acc, { q, r }, i) => {
      const id = hexId(q, r);
      const terrain = shuffledTerrains[i]!;
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
        productiveIds:
          terrain === "desert" ? acc.productiveIds : [...acc.productiveIds, id],
        robberHexId: terrain === "desert" ? id : acc.robberHexId,
      };
    },
    { hexes: {}, productiveIds: [], robberHexId: hexId(0, 0) }
  );
}

function generateStandardBoardPure(
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

function generateBigIslandBoardPure(
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

function generateSeafarersNewShoresBoardPure(
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

function generateSeafarersFourIslandsBoardPure(
  config: CatanConfig,
  rng0: RngState
): readonly [GeneratedBoard, RngState] {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  const island1Coords = [
    hexId(-2, -1),
    hexId(-1, -1),
    hexId(-2, 0),
    hexId(-1, -2),
    hexId(-3, 0),
  ] as const;
  const island2Coords = [
    hexId(1, -2),
    hexId(2, -2),
    hexId(1, -3),
    hexId(2, -3),
    hexId(3, -3),
    hexId(2, -1),
  ] as const;
  const island3Coords = [
    hexId(-3, 2),
    hexId(-2, 2),
    hexId(-3, 3),
    hexId(-2, 3),
    hexId(-1, 2),
    hexId(-2, 1),
  ] as const;
  const island4Coords = [
    hexId(1, 1),
    hexId(2, 1),
    hexId(1, 2),
    hexId(2, 0),
    hexId(3, 0),
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
    "forest",
    "pasture",
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
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 4, 5, 9, 10,
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

function generateSeafarersFogIslandsBoardPure(
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
  const fogBelt: ReadonlySet<HexId> = new Set<HexId>([
    hexId(0, -2),
    hexId(0, -1),
    hexId(0, 0),
    hexId(0, 1),
    hexId(0, 2),
    hexId(-1, 0),
    hexId(1, 0),
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

export function generateCatanBoardPure(
  config: CatanConfig,
  rngState: RngState
): readonly [GeneratedBoard, RngState] {
  switch (config.scenarioId) {
    case "big_island_5_6":
      return generateBigIslandBoardPure(config, rngState);
    case "seafarers_new_shores":
      return generateSeafarersNewShoresBoardPure(config, rngState);
    case "seafarers_four_islands":
      return generateSeafarersFourIslandsBoardPure(config, rngState);
    case "seafarers_fog_islands":
      return generateSeafarersFogIslandsBoardPure(config, rngState);
    case "standard":
    default:
      return generateStandardBoardPure(config, rngState);
  }
}

export function generateCatanBoard(
  config: CatanConfig,
  rng: SeededRNG
): GeneratedBoard {
  // Delegate through `rng.shuffle` / `fromState` parity by advancing `rng`
  const [board, nextState] = generateCatanBoardPure(config, rng.getState());
  while (rng.getState() !== nextState) {
    rng.nextFloat();
  }
  return board;
}

export function createDevCardDeckPure(
  isExpanded: boolean,
  rngState: RngState
): readonly [DevCardType[], RngState] {
  const knights = isExpanded ? 20 : 14;
  const progressEach = isExpanded ? 3 : 2;
  const vps = 5;

  const deck: DevCardType[] = [
    ...Array.from({ length: knights }, (): DevCardType => "knight"),
    ...Array.from({ length: vps }, (): DevCardType => "victory_point"),
    ...Array.from({ length: progressEach }, (): DevCardType[] => [
      "road_building",
      "year_of_plenty",
      "monopoly",
    ]).flat(),
  ];

  return shufflePure(rngState, deck);
}

export function createDevCardDeck(
  isExpanded: boolean,
  rng: SeededRNG
): DevCardType[] {
  const [deck, nextState] = createDevCardDeckPure(isExpanded, rng.getState());
  while (rng.getState() !== nextState) {
    rng.nextFloat();
  }
  return deck;
}
