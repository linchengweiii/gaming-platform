import {
  type AxialCoord,
  type EdgeId,
  type HexBoardTopology,
  type HexId,
  type RngState,
  type VertexId,
  axialDistance,
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
} from "../types/domain.ts";

export interface GeneratedBoard {
  topology: HexBoardTopology;
  hexes: Record<HexId, HexTile>;
  harbors: Harbor[];
  robberHexId: HexId;
  pirateHexId: HexId | null;
  fogPool: FogRevealTile[];
}

const EXPANDED_56_BY_STANDARD: Partial<Record<ScenarioId, ScenarioId>> = {
  standard: "big_island_5_6",
  cities_and_knights: "cities_and_knights_5_6",
  seafarers_new_shores: "seafarers_new_shores_5_6",
  seafarers_four_islands: "seafarers_six_islands_5_6",
  seafarers_fog_islands: "seafarers_fog_islands_5_6",
};

const STANDARD_34_BY_EXPANDED: Partial<Record<ScenarioId, ScenarioId>> =
  Object.fromEntries(
    Object.entries(EXPANDED_56_BY_STANDARD).map(([std, exp]) => [exp, std])
  );

export function toStandard34ScenarioId(scenarioId: ScenarioId): ScenarioId {
  return STANDARD_34_BY_EXPANDED[scenarioId] ?? scenarioId;
}

export function toExpanded56ScenarioId(scenarioId: ScenarioId): ScenarioId {
  return EXPANDED_56_BY_STANDARD[scenarioId] ?? scenarioId;
}

export function toBaseMapScenarioId(scenarioId: ScenarioId): ScenarioId {
  const std = toStandard34ScenarioId(scenarioId);
  return std === "cities_and_knights" ? "standard" : std;
}

export function isExpanded56Scenario(scenarioId: ScenarioId): boolean {
  return Boolean(SCENARIO_CATALOG[scenarioId]?.is56PlayerPreset);
}

function countAdjacentRedConflicts(
  productiveHexes: readonly HexTile[],
  candidateNumbers: readonly number[]
): number {
  let conflicts = 0;
  for (let i = 0; i < productiveHexes.length; i++) {
    const n1 = candidateNumbers[i]!;
    if (n1 !== 6 && n1 !== 8) continue;
    const h1 = productiveHexes[i]!;
    for (let j = i + 1; j < productiveHexes.length; j++) {
      const n2 = candidateNumbers[j]!;
      if ((n2 === 6 || n2 === 8) && axialDistance(h1, productiveHexes[j]!) === 1) {
        conflicts++;
      }
    }
  }
  return conflicts;
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
  let [bestAssignment, curRng] = shufflePure(rngState, numbersPool);
  let bestConflicts = Infinity;

  if (balanced) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const [candidate, nextRng] = shufflePure(curRng, numbersPool);
      curRng = nextRng;
      const conflicts = countAdjacentRedConflicts(productiveHexes, candidate);
      if (conflicts < bestConflicts) {
        bestAssignment = candidate;
        bestConflicts = conflicts;
      }
      if (conflicts === 0) break;
    }
  }

  const updatedHexes: Record<HexId, HexTile> = { ...hexes };
  for (let idx = 0; idx < productiveIds.length; idx++) {
    const id = productiveIds[idx]!;
    updatedHexes[id] = {
      ...updatedHexes[id]!,
      numberToken: bestAssignment[idx] ?? 5,
    };
  }

  return [updatedHexes, curRng];
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

  let sumX = 0;
  let sumY = 0;
  for (const eId of candidateEdgeIds) {
    const e = topology.edges[eId]!;
    sumX += e.midX;
    sumY += e.midY;
  }
  const centerX = candidateEdgeIds.length > 0 ? sumX / candidateEdgeIds.length : 0;
  const centerY = candidateEdgeIds.length > 0 ? sumY / candidateEdgeIds.length : 0;

  const sortedCandidates = [...candidateEdgeIds].sort((a, b) => {
    const ea = topology.edges[a]!;
    const eb = topology.edges[b]!;
    return (
      Math.atan2(ea.midY - centerY, ea.midX - centerX) -
      Math.atan2(eb.midY - centerY, eb.midX - centerX)
    );
  });

  const [shuffledTypes, nextRng] = shufflePure(rngState, harborTypes);
  const targetCount = Math.min(shuffledTypes.length, sortedCandidates.length);
  if (targetCount === 0) return [[], nextRng];

  const stride = sortedCandidates.length / targetCount;
  const usedVertices = new Set<VertexId>();
  const usedSeaHexes = new Set<HexId>();
  const harbors: Harbor[] = [];

  const getSeaHex = (eId: EdgeId): HexId | undefined =>
    topology.edges[eId]!.adjacentHexIds.find(
      (id) => hexes[id]?.terrain === "sea"
    );

  const pickEdge = (
    startIdx: number,
    avoidSharedSea: boolean
  ): EdgeId | undefined => {
    for (let offset = 0; offset < sortedCandidates.length; offset++) {
      const eId = sortedCandidates[(startIdx + offset) % sortedCandidates.length]!;
      const edge = topology.edges[eId]!;
      if (usedVertices.has(edge.v1) || usedVertices.has(edge.v2)) continue;
      if (avoidSharedSea) {
        const sea = getSeaHex(eId);
        if (sea && usedSeaHexes.has(sea)) continue;
      }
      return eId;
    }
    return undefined;
  };

  for (let i = 0; i < targetCount; i++) {
    const startIdx = Math.floor(i * stride);
    const chosenEdgeId = pickEdge(startIdx, true) ?? pickEdge(startIdx, false);
    if (!chosenEdgeId) continue;

    const edge = topology.edges[chosenEdgeId]!;
    const seaHex = getSeaHex(chosenEdgeId);
    usedVertices.add(edge.v1);
    usedVertices.add(edge.v2);
    if (seaHex) usedSeaHexes.add(seaHex);
    harbors.push({
      id: `harbor-${i + 1}`,
      type: shuffledTypes[i]!,
      edgeId: chosenEdgeId,
      vertexIds: [edge.v1, edge.v2],
    });
  }

  return [harbors, nextRng];
}

export function buildElongatedMarineCoords(maxQ: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let r = -3; r <= 3; r++) {
    const minQ = Math.max(-3, -3 - r);
    const upperQ = Math.min(maxQ, maxQ - r);
    for (let q = minQ; q <= upperQ; q++) {
      out.push({ q, r });
    }
  }
  return out;
}

export function createDevCardDeckPure(
  isExpanded: boolean,
  rngState: RngState
): readonly [DevCardType[], RngState] {
  const counts = isExpanded
    ? DEV_CARD_DECK_COUNTS.expanded56
    : DEV_CARD_DECK_COUNTS.standard;

  const deck: DevCardType[] = [
    ...Array<DevCardType>(counts.knights).fill("knight"),
    ...Array<DevCardType>(counts.victoryPoints).fill("victory_point"),
    ...Array.from({ length: counts.progressEach }, (): DevCardType[] => [
      "road_building",
      "year_of_plenty",
      "monopoly",
    ]).flat(),
  ];

  return shufflePure(rngState, deck);
}
