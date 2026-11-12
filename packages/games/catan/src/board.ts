import {
  type AxialCoord,
  type HexBoardTopology,
  type HexId,
  SeededRNG,
  axialDistance,
  buildHexBoardTopology,
  generateHexRadiusCoords,
  hexId,
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

const STANDARD_TERRAINS: TerrainType[] = [
  "forest", "forest", "forest", "forest",
  "pasture", "pasture", "pasture", "pasture",
  "fields", "fields", "fields", "fields",
  "hills", "hills", "hills",
  "mountains", "mountains", "mountains",
  "desert",
];

const STANDARD_NUMBERS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

const STANDARD_HARBORS: HarborType[] = [
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

const BIG_ISLAND_EXTRA_COORDS: AxialCoord[] = [
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

const BIG_ISLAND_TERRAINS: TerrainType[] = [
  ...STANDARD_TERRAINS,
  "forest", "forest",
  "pasture", "pasture",
  "fields", "fields",
  "hills", "hills",
  "mountains", "mountains",
  "desert",
];

const BIG_ISLAND_NUMBERS: number[] = [
  ...STANDARD_NUMBERS,
  2, 3, 4, 5, 6, 8, 9, 10, 11, 12,
];

const BIG_ISLAND_HARBORS: HarborType[] = [
  ...STANDARD_HARBORS,
  "generic",
  "wool",
];

/**
 * Assigns number tokens to productive land hexes while trying to avoid adjacent 6/8 red tokens.
 */
function assignBalancedNumbers(
  productiveHexes: HexTile[],
  numbersPool: readonly number[],
  rng: SeededRNG,
  balanced: boolean
): void {
  let bestAssignment = rng.shuffle(numbersPool);

  if (balanced) {
    let bestRedConflicts = Infinity;
    for (let attempt = 0; attempt < 60; attempt++) {
      const candidate = rng.shuffle(numbersPool);
      let conflicts = 0;
      for (let i = 0; i < productiveHexes.length; i++) {
        const n1 = candidate[i]!;
        if (n1 !== 6 && n1 !== 8) continue;
        for (let j = i + 1; j < productiveHexes.length; j++) {
          const n2 = candidate[j]!;
          if (n2 !== 6 && n2 !== 8) continue;
          const h1 = productiveHexes[i]!;
          const h2 = productiveHexes[j]!;
          if (axialDistance(h1, h2) === 1) {
            conflicts++;
          }
        }
      }
      if (conflicts < bestRedConflicts) {
        bestRedConflicts = conflicts;
        bestAssignment = candidate;
        if (conflicts === 0) break;
      }
    }
  }

  for (let i = 0; i < productiveHexes.length; i++) {
    productiveHexes[i]!.numberToken = bestAssignment[i] ?? 5;
  }
}

/**
 * Places harbors evenly along coastal edges of starting islands (`islandId === 1` or setup-eligible land).
 */
function placeCoastalHarbors(
  topology: HexBoardTopology,
  hexes: Record<HexId, HexTile>,
  harborTypes: readonly HarborType[],
  rng: SeededRNG
): Harbor[] {
  // Find all edges that border at least one setup-eligible land hex AND either open void or a sea hex
  const candidateEdgeIds: string[] = [];
  for (const eId of topology.edgeOrder) {
    const edge = topology.edges[eId]!;
    const adjHexes = edge.adjacentHexIds.map((id) => hexes[id]!).filter(Boolean);
    const hasSetupLand = adjHexes.some(
      (h) => h.allowSetupSettlement && h.terrain !== "sea" && h.terrain !== "fog"
    );
    if (!hasSetupLand) continue;

    const isCoastal =
      adjHexes.length === 1 || adjHexes.some((h) => h.terrain === "sea");
    if (isCoastal) {
      candidateEdgeIds.push(eId);
    }
  }

  // Sort candidate edges clockwise by angle around the center of the setup land hexes
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const eId of candidateEdgeIds) {
    const e = topology.edges[eId]!;
    sumX += e.midX;
    sumY += e.midY;
    count++;
  }
  const centerX = count > 0 ? sumX / count : 0;
  const centerY = count > 0 ? sumY / count : 0;

  candidateEdgeIds.sort((a, b) => {
    const ea = topology.edges[a]!;
    const eb = topology.edges[b]!;
    const angA = Math.atan2(ea.midY - centerY, ea.midX - centerX);
    const angB = Math.atan2(eb.midY - centerY, eb.midX - centerX);
    return angA - angB;
  });

  const shuffledTypes = rng.shuffle(harborTypes);
  const targetCount = Math.min(shuffledTypes.length, candidateEdgeIds.length);
  const usedVertices = new Set<string>();
  const harbors: Harbor[] = [];

  const stride = candidateEdgeIds.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const startIdx = Math.floor(i * stride);
    let chosenEdgeId: string | null = null;
    for (let offset = 0; offset < candidateEdgeIds.length; offset++) {
      const idx = (startIdx + offset) % candidateEdgeIds.length;
      const eId = candidateEdgeIds[idx]!;
      const edge = topology.edges[eId]!;
      if (!usedVertices.has(edge.v1) && !usedVertices.has(edge.v2)) {
        chosenEdgeId = eId;
        break;
      }
    }
    if (!chosenEdgeId) continue;

    const edge = topology.edges[chosenEdgeId]!;
    usedVertices.add(edge.v1);
    usedVertices.add(edge.v2);
    const seaHex = edge.adjacentHexIds.find((id) => hexes[id]?.terrain === "sea");

    harbors.push({
      id: `harbor-${i + 1}`,
      type: shuffledTypes[i]!,
      edgeId: chosenEdgeId,
      vertexIds: [edge.v1, edge.v2],
      seaHexId: seaHex,
    });
  }

  return harbors;
}

export interface GeneratedBoard {
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  robberHexId: HexId;
  pirateHexId: HexId | null;
  fogPool: FogRevealTile[];
}

export function generateCatanBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  switch (config.scenarioId) {
    case "big_island_5_6":
      return generateBigIslandBoard(config, rng);
    case "seafarers_new_shores":
      return generateSeafarersNewShoresBoard(config, rng);
    case "seafarers_four_islands":
      return generateSeafarersFourIslandsBoard(config, rng);
    case "seafarers_fog_islands":
      return generateSeafarersFogIslandsBoard(config, rng);
    case "standard":
    default:
      return generateStandardBoard(config, rng);
  }
}

function generateStandardBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  const coords = generateHexRadiusCoords(2);
  const topology = buildHexBoardTopology(coords);
  const shuffledTerrains = rng.shuffle(STANDARD_TERRAINS);

  const hexes: Record<HexId, HexTile> = {};
  const productiveHexes: HexTile[] = [];
  let robberHexId = hexId(0, 0);

  for (let i = 0; i < coords.length; i++) {
    const { q, r } = coords[i]!;
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
    hexes[id] = tile;
    if (terrain === "desert") {
      robberHexId = id;
    } else {
      productiveHexes.push(tile);
    }
  }

  assignBalancedNumbers(productiveHexes, STANDARD_NUMBERS, rng, config.balancedNumbers);
  const harbors = placeCoastalHarbors(topology, hexes, STANDARD_HARBORS, rng);

  return {
    topology,
    hexes,
    harbors,
    robberHexId,
    pirateHexId: null,
    fogPool: [],
  };
}

function generateBigIslandBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  const coords = [...generateHexRadiusCoords(2), ...BIG_ISLAND_EXTRA_COORDS];
  const topology = buildHexBoardTopology(coords);
  const shuffledTerrains = rng.shuffle(BIG_ISLAND_TERRAINS);

  const hexes: Record<HexId, HexTile> = {};
  const productiveHexes: HexTile[] = [];
  let robberHexId = hexId(0, 0);

  for (let i = 0; i < coords.length; i++) {
    const { q, r } = coords[i]!;
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
    hexes[id] = tile;
    if (terrain === "desert") {
      robberHexId = id;
    } else {
      productiveHexes.push(tile);
    }
  }

  assignBalancedNumbers(productiveHexes, BIG_ISLAND_NUMBERS, rng, config.balancedNumbers);
  const harbors = placeCoastalHarbors(topology, hexes, BIG_ISLAND_HARBORS, rng);

  return {
    topology,
    hexes,
    harbors,
    robberHexId,
    pirateHexId: null,
    fogPool: [],
  };
}

/**
 * Seafarers Scenario 1: Heading for New Shores
 * Radius-3 map (37 hexes):
 * - Main home island (14 land hexes on the West/Center, islandId = 1, allowSetupSettlement = true)
 * - 3 Offshore foreign islands on the East/North/South ring (8 land hexes including 2 Gold River hexes,
 *   islandId = 2, 3, 4, allowSetupSettlement = false -> +2 Bonus VP when settled!)
 * - 15 Sea hexes separating the main island from the offshore islands.
 */
function generateSeafarersNewShoresBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  // Main island (14 coords on West/Center)
  const mainIslandSet = new Set<HexId>([
    hexId(-1, 0), hexId(0, 0), hexId(-1, 1), hexId(0, 1), hexId(0, -1), hexId(1, -1),
    hexId(-2, 0), hexId(-2, 1), hexId(-2, 2), hexId(-1, 2), hexId(-1, -1), hexId(1, 0),
    hexId(-3, 1), hexId(-3, 2),
  ]);

  // 3 offshore islands on the East/North/South outer ring
  const island2Set = new Set<HexId>([hexId(2, -3), hexId(3, -3), hexId(3, -2)]);
  const island3Set = new Set<HexId>([hexId(3, 0), hexId(2, 1), hexId(1, 2)]);
  const island4Set = new Set<HexId>([hexId(-1, 3), hexId(0, 3)]);

  const mainTerrains = rng.shuffle<TerrainType>([
    "forest", "forest", "forest",
    "pasture", "pasture", "pasture",
    "fields", "fields", "fields",
    "hills", "hills",
    "mountains", "mountains",
    "desert",
  ]);
  const mainNumbers = [2, 3, 4, 4, 5, 5, 6, 8, 9, 9, 10, 10, 11];

  const foreignTerrains = rng.shuffle<TerrainType>([
    "gold", "gold", "mountains", "hills", "fields", "pasture", "forest", "mountains",
  ]);
  const foreignNumbers = rng.shuffle([4, 5, 6, 8, 9, 10, 11, 12]);

  const hexes: Record<HexId, HexTile> = {};
  const mainProductive: HexTile[] = [];
  let mainIdx = 0;
  let foreignIdx = 0;
  let robberHexId = hexId(-1, 0);
  let pirateHexId = hexId(2, -1);

  for (const { q, r } of coords) {
    const id = hexId(q, r);
    if (mainIslandSet.has(id)) {
      const terrain = mainTerrains[mainIdx++]!;
      const tile: HexTile = {
        id,
        q,
        r,
        terrain,
        numberToken: null,
        islandId: 1,
        allowSetupSettlement: true,
      };
      hexes[id] = tile;
      if (terrain === "desert") {
        robberHexId = id;
      } else {
        mainProductive.push(tile);
      }
    } else if (island2Set.has(id) || island3Set.has(id) || island4Set.has(id)) {
      const islandId = island2Set.has(id) ? 2 : island3Set.has(id) ? 3 : 4;
      const terrain = foreignTerrains[foreignIdx]!;
      const numberToken = foreignNumbers[foreignIdx]!;
      foreignIdx++;
      hexes[id] = {
        id,
        q,
        r,
        terrain,
        numberToken,
        islandId,
        allowSetupSettlement: false,
      };
    } else {
      hexes[id] = {
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

  assignBalancedNumbers(mainProductive, mainNumbers, rng, config.balancedNumbers);
  const harbors = placeCoastalHarbors(topology, hexes, STANDARD_HARBORS, rng);

  return {
    topology,
    hexes,
    harbors,
    robberHexId,
    pirateHexId,
    fogPool: [],
  };
}

/**
 * Seafarers Scenario 2: The Four Islands
 * Radius-3 map (37 hexes) split by sea channels (`q === 0` or `r === 0`) into 4 distinct islands!
 * Players may build setup settlements on any island; settling on a new island after setup grants +2 VP.
 */
function generateSeafarersFourIslandsBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  const island1Coords = [
    hexId(-2, -1), hexId(-1, -1), hexId(-2, 0), hexId(-1, -2), hexId(-3, 0),
  ];
  const island2Coords = [
    hexId(1, -2), hexId(2, -2), hexId(1, -3), hexId(2, -3), hexId(3, -3), hexId(2, -1),
  ];
  const island3Coords = [
    hexId(-3, 2), hexId(-2, 2), hexId(-3, 3), hexId(-2, 3), hexId(-1, 2), hexId(-2, 1),
  ];
  const island4Coords = [
    hexId(1, 1), hexId(2, 1), hexId(1, 2), hexId(2, 0), hexId(3, 0),
  ];

  const islandMap = new Map<HexId, number>();
  island1Coords.forEach((id) => islandMap.set(id, 1));
  island2Coords.forEach((id) => islandMap.set(id, 2));
  island3Coords.forEach((id) => islandMap.set(id, 3));
  island4Coords.forEach((id) => islandMap.set(id, 4));

  const landTerrains = rng.shuffle<TerrainType>([
    "forest", "forest", "forest", "forest", "forest",
    "pasture", "pasture", "pasture", "pasture", "pasture",
    "fields", "fields", "fields", "fields",
    "hills", "hills", "hills", "hills",
    "mountains", "mountains", "mountains", "mountains",
  ]);
  const landNumbers = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 4, 5, 9, 10,
  ];

  const hexes: Record<HexId, HexTile> = {};
  const productive: HexTile[] = [];
  let landIdx = 0;

  for (const { q, r } of coords) {
    const id = hexId(q, r);
    const islandId = islandMap.get(id) ?? 0;
    if (islandId > 0) {
      const terrain = landTerrains[landIdx++]!;
      const tile: HexTile = {
        id,
        q,
        r,
        terrain,
        numberToken: null,
        islandId,
        allowSetupSettlement: true,
      };
      hexes[id] = tile;
      productive.push(tile);
    } else {
      hexes[id] = {
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

  assignBalancedNumbers(productive, landNumbers, rng, config.balancedNumbers);
  const harbors = placeCoastalHarbors(topology, hexes, STANDARD_HARBORS, rng);

  return {
    topology,
    hexes,
    harbors,
    robberHexId: island1Coords[0]!,
    pirateHexId: hexId(0, 0),
    fogPool: [],
  };
}

/**
 * Seafarers Scenario 3: The Fog Islands
 * Two starting islands on the West & East edges separated by a mystery fog belt in the center.
 * Building a road or ship adjacent to a `fog` hex reveals its terrain + number token and awards 1 resource!
 */
function generateSeafarersFogIslandsBoard(config: CatanConfig, rng: SeededRNG): GeneratedBoard {
  const coords = generateHexRadiusCoords(3);
  const topology = buildHexBoardTopology(coords);

  const westIsland = new Set<HexId>([
    hexId(-3, 0), hexId(-3, 1), hexId(-3, 2), hexId(-3, 3),
    hexId(-2, 0), hexId(-2, 1), hexId(-2, 2), hexId(-2, 3),
  ]);
  const eastIsland = new Set<HexId>([
    hexId(3, -3), hexId(3, -2), hexId(3, -1), hexId(3, 0),
    hexId(2, -3), hexId(2, -2), hexId(2, -1), hexId(2, 0),
  ]);
  const fogBelt = new Set<HexId>([
    hexId(0, -2), hexId(0, -1), hexId(0, 0), hexId(0, 1), hexId(0, 2),
    hexId(-1, 0), hexId(1, 0),
  ]);

  const startTerrains = rng.shuffle<TerrainType>([
    "forest", "forest", "forest",
    "pasture", "pasture", "pasture",
    "fields", "fields", "fields",
    "hills", "hills", "hills",
    "mountains", "mountains", "mountains",
    "desert",
  ]);
  const startNumbers = [3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11];

  const hexes: Record<HexId, HexTile> = {};
  const productive: HexTile[] = [];
  let idx = 0;
  let robberHexId = hexId(-2, 1);

  for (const { q, r } of coords) {
    const id = hexId(q, r);
    if (westIsland.has(id) || eastIsland.has(id)) {
      const terrain = startTerrains[idx++]!;
      const tile: HexTile = {
        id,
        q,
        r,
        terrain,
        numberToken: null,
        islandId: westIsland.has(id) ? 1 : 2,
        allowSetupSettlement: true,
      };
      hexes[id] = tile;
      if (terrain === "desert") {
        robberHexId = id;
      } else {
        productive.push(tile);
      }
    } else if (fogBelt.has(id)) {
      hexes[id] = {
        id,
        q,
        r,
        terrain: "fog",
        numberToken: null,
        islandId: 3,
        allowSetupSettlement: false,
      };
    } else {
      hexes[id] = {
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

  assignBalancedNumbers(productive, startNumbers, rng, config.balancedNumbers);

  const fogPool: FogRevealTile[] = rng.shuffle<FogRevealTile>([
    { terrain: "gold", numberToken: 6 },
    { terrain: "gold", numberToken: 8 },
    { terrain: "mountains", numberToken: 5 },
    { terrain: "fields", numberToken: 9 },
    { terrain: "forest", numberToken: 4 },
    { terrain: "hills", numberToken: 10 },
    { terrain: "pasture", numberToken: 11 },
  ]);

  const harbors = placeCoastalHarbors(topology, hexes, STANDARD_HARBORS, rng);

  return {
    topology,
    hexes,
    harbors,
    robberHexId,
    pirateHexId: hexId(-1, -1),
    fogPool,
  };
}

/**
 * Generates the shuffled Development Card deck for the given player count / scenario.
 * Base (25 cards): 14 Knights, 5 VP, 2 Road Building, 2 Year of Plenty, 2 Monopoly.
 * 5–6 Player Extension (34 cards): 20 Knights, 5 VP, 3 Road Building, 3 Year of Plenty, 3 Monopoly.
 */
export function createDevCardDeck(isExpanded: boolean, rng: SeededRNG): DevCardType[] {
  const deck: DevCardType[] = [];
  const knights = isExpanded ? 20 : 14;
  const progressEach = isExpanded ? 3 : 2;
  const vps = 5;

  for (let i = 0; i < knights; i++) deck.push("knight");
  for (let i = 0; i < vps; i++) deck.push("victory_point");
  for (let i = 0; i < progressEach; i++) {
    deck.push("road_building");
    deck.push("year_of_plenty");
    deck.push("monopoly");
  }

  return rng.shuffle(deck);
}
