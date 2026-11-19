import {
  type AxialCoord,
  type EdgeId,
  type HexBoardTopology,
  type HexId,
  type RngState,
  type SeededRNG,
  type VertexId,
  axialDistance,
  hexId,
  shufflePure,
} from "@gaming-platform/core";
import { DEV_CARD_DECK_COUNTS } from "../config/costs-and-limits.ts";
import { SCENARIO_CATALOG } from "../config/scenarios-config.ts";
import type {
  DevCardType,
  FogRevealTile,
  Harbor,
  HarborType,
  HexTile,
  ScenarioId,
  TerrainType,
} from "../types/domain.ts";

export interface GeneratedBoard {
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  robberHexId: HexId;
  pirateHexId: HexId | null;
  fogPool: FogRevealTile[];
}

export function toBaseMapScenarioId(scenarioId: ScenarioId): ScenarioId {
  switch (scenarioId) {
    case "seafarers_new_shores":
    case "seafarers_new_shores_5_6":
      return "seafarers_new_shores";
    case "seafarers_four_islands":
    case "seafarers_six_islands_5_6":
      return "seafarers_four_islands";
    case "seafarers_fog_islands":
    case "seafarers_fog_islands_5_6":
      return "seafarers_fog_islands";
    default:
      return "standard";
  }
}

export function isExpanded56Scenario(scenarioId: ScenarioId): boolean {
  return Boolean(SCENARIO_CATALOG[scenarioId]?.is56PlayerPreset);
}

export function toExpanded56ScenarioId(scenarioId: ScenarioId): ScenarioId {
  switch (scenarioId) {
    case "standard":
      return "big_island_5_6";
    case "cities_and_knights":
      return "cities_and_knights_5_6";
    case "seafarers_new_shores":
      return "seafarers_new_shores_5_6";
    case "seafarers_four_islands":
      return "seafarers_six_islands_5_6";
    case "seafarers_fog_islands":
      return "seafarers_fog_islands_5_6";
    default:
      return scenarioId;
  }
}

export function toStandard34ScenarioId(scenarioId: ScenarioId): ScenarioId {
  switch (scenarioId) {
    case "big_island_5_6":
      return "standard";
    case "cities_and_knights_5_6":
      return "cities_and_knights";
    case "seafarers_new_shores_5_6":
      return "seafarers_new_shores";
    case "seafarers_six_islands_5_6":
      return "seafarers_four_islands";
    case "seafarers_fog_islands_5_6":
      return "seafarers_fog_islands";
    default:
      return scenarioId;
  }
}

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
export function assignBalancedNumbersPure(
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
export function placeCoastalHarborsPure(
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
    usedSeaHexes: ReadonlySet<HexId>;
    harbors: Harbor[];
  }>(
    (acc, i) => {
      const startIdx = Math.floor(i * stride);
      const getSeaHex = (eId: EdgeId): HexId | undefined =>
        topology.edges[eId]!.adjacentHexIds.find(
          (id) => hexes[id]?.terrain === "sea"
        );
      // Prefer a coastal edge whose adjacent sea hex does not already host an opposite-shore harbor
      const chosenEdgeId: EdgeId | undefined =
        offsets
          .map(
            (offset) =>
              sortedCandidates[(startIdx + offset) % sortedCandidates.length]!
          )
          .find((eId) => {
            const edge = topology.edges[eId]!;
            const sea = getSeaHex(eId);
            return (
              !acc.usedVertices.has(edge.v1) &&
              !acc.usedVertices.has(edge.v2) &&
              (!sea || !acc.usedSeaHexes.has(sea))
            );
          }) ??
        offsets
          .map(
            (offset) =>
              sortedCandidates[(startIdx + offset) % sortedCandidates.length]!
          )
          .find((eId) => {
            const edge = topology.edges[eId]!;
            return (
              !acc.usedVertices.has(edge.v1) && !acc.usedVertices.has(edge.v2)
            );
          });

      if (!chosenEdgeId) {
        return acc;
      }

      const edge = topology.edges[chosenEdgeId]!;
      const seaHex = getSeaHex(chosenEdgeId);
      const harbor: Harbor = {
        id: `harbor-${i + 1}`,
        type: shuffledTypes[i]!,
        edgeId: chosenEdgeId,
        vertexIds: [edge.v1, edge.v2],
        seaHexId: seaHex,
      };
      return {
        usedVertices: new Set([...acc.usedVertices, edge.v1, edge.v2]),
        usedSeaHexes: seaHex
          ? new Set([...acc.usedSeaHexes, seaHex])
          : acc.usedSeaHexes,
        harbors: [...acc.harbors, harbor],
      };
    },
    { usedVertices: new Set<VertexId>(), usedSeaHexes: new Set<HexId>(), harbors: [] }
  );

  return [harbors, nextRng];
}

export function buildSingleIslandHexes(
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

export function buildElongatedMarineCoords(maxQ: number): AxialCoord[] {
  const rows = [-3, -2, -1, 0, 1, 2, 3] as const;
  return rows.flatMap((r) => {
    const minQ = Math.max(-3, -3 - r);
    const upperQ = Math.min(maxQ, maxQ - r);
    return Array.from({ length: Math.max(0, upperQ - minQ + 1) }, (_, idx) => ({
      q: minQ + idx,
      r,
    }));
  });
}

export function createDevCardDeckPure(
  isExpanded: boolean,
  rngState: RngState
): readonly [DevCardType[], RngState] {
  const counts = isExpanded
    ? DEV_CARD_DECK_COUNTS.expanded56
    : DEV_CARD_DECK_COUNTS.standard;

  const deck: DevCardType[] = [
    ...Array.from({ length: counts.knights }, (): DevCardType => "knight"),
    ...Array.from(
      { length: counts.victoryPoints },
      (): DevCardType => "victory_point"
    ),
    ...Array.from({ length: counts.progressEach }, (): DevCardType[] => [
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
