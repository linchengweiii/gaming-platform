import { describe, expect, test } from "bun:test";
import {
  SeededRNG,
  buildHexBoardTopology,
  computeLongestSimpleEdgePath,
  generateHexRadiusCoords,
  hexId,
} from "@gaming-platform/core";

describe("@gaming-platform/core", () => {
  test("SeededRNG is 100% deterministic for identical seeds", () => {
    const rng1 = new SeededRNG("catan-seed-42");
    const rng2 = new SeededRNG("catan-seed-42");

    const rolls1 = Array.from({ length: 25 }, () => rng1.roll2d6().total);
    const rolls2 = Array.from({ length: 25 }, () => rng2.roll2d6().total);
    expect(rolls1).toEqual(rolls2);

    const stateSnapshot = rng1.getState();
    const resumed = SeededRNG.fromState(stateSnapshot);
    expect(rng1.shuffle([1, 2, 3, 4, 5, 6])).toEqual(resumed.shuffle([1, 2, 3, 4, 5, 6]));
  });

  test("Standard radius-2 Catan hex grid has 19 hexes, 54 vertices, and 72 edges", () => {
    const coords = generateHexRadiusCoords(2);
    expect(coords.length).toBe(19);

    const topology = buildHexBoardTopology(coords);
    expect(topology.hexOrder.length).toBe(19);
    expect(topology.vertexOrder.length).toBe(54);
    expect(topology.edgeOrder.length).toBe(72);

    // Every hex has 6 corners and 6 sides
    for (const hId of topology.hexOrder) {
      const h = topology.hexes[hId]!;
      expect(h.cornerVertexIds.length).toBe(6);
      expect(h.sideEdgeIds.length).toBe(6);
    }

    // Every vertex has 2 or 3 incident edges and 1, 2, or 3 adjacent hexes
    for (const vId of topology.vertexOrder) {
      const v = topology.vertices[vId]!;
      expect(v.incidentEdgeIds.length).toBeGreaterThanOrEqual(2);
      expect(v.incidentEdgeIds.length).toBeLessThanOrEqual(3);
      expect(v.adjacentVertexIds.length).toBe(v.incidentEdgeIds.length);
      expect(v.adjacentHexIds.length).toBeGreaterThanOrEqual(1);
      expect(v.adjacentHexIds.length).toBeLessThanOrEqual(3);
    }
  });

  test("computeLongestSimpleEdgePath handles cycles, branches, and opponent vertex breaks", () => {
    const coords = generateHexRadiusCoords(2);
    const topology = buildHexBoardTopology(coords);
    const centerHex = topology.hexes[hexId(0, 0)]!;

    // All 6 edges around the center hex form a 6-edge cycle
    const ringEdges = [...centerHex.sideEdgeIds];
    const fullCycleResult = computeLongestSimpleEdgePath(topology, ringEdges, new Set());
    expect(fullCycleResult.length).toBe(6);

    // If an opponent builds a settlement on two opposite vertices of the ring,
    // the ring is split into two 3-edge segments!
    const blocked = new Set([centerHex.cornerVertexIds[0]!, centerHex.cornerVertexIds[3]!]);
    const brokenResult = computeLongestSimpleEdgePath(topology, ringEdges, blocked);
    expect(brokenResult.length).toBe(3);
  });
});
