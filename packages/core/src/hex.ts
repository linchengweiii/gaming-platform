/**
 * Axial Hex Grid Topology & Pure Functional Graph Primitives (Pointy-Top Hexagons).
 *
 * Provides canonical IDs for Hexes, Vertices (corners), and Edges (sides),
 * exact 2D pixel coordinates for rendering, and pure functional graph algorithms
 * such as Longest Simple Path (for Catan Longest Road / Longest Trade Route).
 */

export type HexId = string; // "{q},{r}"
export type VertexDir = "N" | "S";
export type VertexId = string; // "{q},{r}:{N|S}"
export type EdgeDir = "NE" | "E" | "SE";
export type EdgeId = string; // "{q},{r}:{NE|E|SE}"

export interface AxialCoord {
  q: number;
  r: number;
}

export interface HexNode {
  id: HexId;
  q: number;
  r: number;
  centerX: number;
  centerY: number;
  /** 6 canonical vertex IDs in clockwise order starting from Top (N, NE, SE, S, SW, NW) */
  cornerVertexIds: [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId];
  /** 6 canonical edge IDs in clockwise order starting from Top-Right (NE, E, SE, SW, W, NW) */
  sideEdgeIds: [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId];
}

export interface VertexNode {
  id: VertexId;
  q: number;
  r: number;
  dir: VertexDir;
  x: number;
  y: number;
  adjacentHexIds: HexId[];
  adjacentVertexIds: VertexId[];
  incidentEdgeIds: EdgeId[];
}

export interface EdgeNode {
  id: EdgeId;
  q: number;
  r: number;
  dir: EdgeDir;
  v1: VertexId;
  v2: VertexId;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  angleDeg: number;
  adjacentHexIds: HexId[];
}

export interface HexBoardTopology {
  hexSize: number;
  hexes: Record<HexId, HexNode>;
  vertices: Record<VertexId, VertexNode>;
  edges: Record<EdgeId, EdgeNode>;
  hexOrder: HexId[];
  vertexOrder: VertexId[];
  edgeOrder: EdgeId[];
}

const SQRT3 = Math.sqrt(3);

const AXIAL_DIRECTIONS: readonly AxialCoord[] = [
  { q: 1, r: -1 }, // 0: NE
  { q: 1, r: 0 }, // 1: E
  { q: 0, r: 1 }, // 2: SE
  { q: -1, r: 1 }, // 3: SW
  { q: -1, r: 0 }, // 4: W
  { q: 0, r: -1 }, // 5: NW
];

function pushUnique<T>(items: T[], candidate: T): void {
  if (!items.includes(candidate)) items.push(candidate);
}

export function hexId(q: number, r: number): HexId {
  return `${q},${r}`;
}

function vertexId(q: number, r: number, dir: VertexDir): VertexId {
  return `${q},${r}:${dir}`;
}

function edgeId(q: number, r: number, dir: EdgeDir): EdgeId {
  return `${q},${r}:${dir}`;
}

export function axialDistance(a: AxialCoord, b: AxialCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -(a.q + a.r) - -(b.q + b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function axialNeighbors(coord: AxialCoord): AxialCoord[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

/**
 * Generates all axial coordinates inside a regular hexagonal radius `radius`.
 * Radius 2 produces the standard 19 hexes of Catan.
 */
export function generateHexRadiusCoords(radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let r = -radius; r <= radius; r++) {
    const qMin = Math.max(-radius, -r - radius);
    const qMax = Math.min(radius, -r + radius);
    for (let q = qMin; q <= qMax; q++) {
      out.push({ q, r });
    }
  }
  return out;
}

/**
 * Computes pixel center of a pointy-top hex `(q, r)`.
 */
export function hexToPixel(
  q: number,
  r: number,
  hexSize = 56
): { x: number; y: number } {
  return { x: hexSize * SQRT3 * (q + r / 2), y: hexSize * 1.5 * r };
}

function vertexToPixel(
  q: number,
  r: number,
  dir: VertexDir,
  hexSize = 56
): { x: number; y: number } {
  const center = hexToPixel(q, r, hexSize);
  return { x: center.x, y: dir === "N" ? center.y - hexSize : center.y + hexSize };
}

function getHexCornerVertexIds(
  q: number,
  r: number
): [VertexId, VertexId, VertexId, VertexId, VertexId, VertexId] {
  return [
    vertexId(q, r, "N"),
    vertexId(q + 1, r - 1, "S"),
    vertexId(q, r + 1, "N"),
    vertexId(q, r, "S"),
    vertexId(q - 1, r + 1, "N"),
    vertexId(q, r - 1, "S"),
  ];
}

function getHexSideEdgeIds(
  q: number,
  r: number
): [EdgeId, EdgeId, EdgeId, EdgeId, EdgeId, EdgeId] {
  return [
    edgeId(q, r, "NE"),
    edgeId(q, r, "E"),
    edgeId(q, r, "SE"),
    edgeId(q - 1, r + 1, "NE"),
    edgeId(q - 1, r, "E"),
    edgeId(q, r - 1, "SE"),
  ];
}

function createVertexNode(vId: VertexId, hexSize: number): VertexNode {
  const [coordPart, dirPart] = vId.split(":");
  const [vqStr, vrStr] = coordPart!.split(",");
  const vq = Number(vqStr);
  const vr = Number(vrStr);
  const vDir = dirPart as VertexDir;
  const pos = vertexToPixel(vq, vr, vDir, hexSize);
  return {
    id: vId,
    q: vq,
    r: vr,
    dir: vDir,
    x: Number(pos.x.toFixed(3)),
    y: Number(pos.y.toFixed(3)),
    adjacentHexIds: [],
    adjacentVertexIds: [],
    incidentEdgeIds: [],
  };
}

function createEdgeNode(
  eId: EdgeId,
  vA: VertexId,
  vB: VertexId,
  vertices: Readonly<Record<VertexId, VertexNode>>
): EdgeNode {
  const [coordPart, dirPart] = eId.split(":");
  const [eqStr, erStr] = coordPart!.split(",");
  const eq = Number(eqStr);
  const er = Number(erStr);
  const eDir = dirPart as EdgeDir;

  // Canonical endpoint ordering (N first, then S)
  const v1 = vA.endsWith(":N") ? vA : vB;
  const v2 = vA.endsWith(":N") ? vB : vA;
  const node1 = vertices[v1]!;
  const node2 = vertices[v2]!;
  const midX = Number(((node1.x + node2.x) / 2).toFixed(3));
  const midY = Number(((node1.y + node2.y) / 2).toFixed(3));
  const angleDeg = Number(
    ((Math.atan2(node2.y - node1.y, node2.x - node1.x) * 180) / Math.PI).toFixed(2)
  );

  return {
    id: eId,
    q: eq,
    r: er,
    dir: eDir,
    v1,
    v2,
    x1: node1.x,
    y1: node1.y,
    x2: node2.x,
    y2: node2.y,
    midX,
    midY,
    angleDeg,
    adjacentHexIds: [],
  };
}

/**
 * Builds the complete, canonical board topology (hexes, vertices, edges, and
 * adjacency maps) from a list of axial hex coordinates via pure reduction.
 */
export function buildHexBoardTopology(
  coords: readonly AxialCoord[],
  hexSize = 56
): HexBoardTopology {
  const hexes: Record<HexId, HexNode> = {};
  const vertices: Record<VertexId, VertexNode> = {};
  const edges: Record<EdgeId, EdgeNode> = {};
  const hexOrder: HexId[] = [];
  const vertexOrder: VertexId[] = [];
  const edgeOrder: EdgeId[] = [];

  for (const { q, r } of coords) {
    const hId = hexId(q, r);
    const { x: centerX, y: centerY } = hexToPixel(q, r, hexSize);
    const cornerVertexIds = getHexCornerVertexIds(q, r);
    const sideEdgeIds = getHexSideEdgeIds(q, r);

    hexes[hId] = { id: hId, q, r, centerX, centerY, cornerVertexIds, sideEdgeIds };
    hexOrder.push(hId);

    for (const vId of cornerVertexIds) {
      let vNode = vertices[vId];
      if (!vNode) {
        vNode = createVertexNode(vId, hexSize);
        vertices[vId] = vNode;
        vertexOrder.push(vId);
      }
      pushUnique(vNode.adjacentHexIds, hId);
    }

    for (let sideIdx = 0; sideIdx < 6; sideIdx++) {
      const eId = sideEdgeIds[sideIdx]!;
      const vA = cornerVertexIds[sideIdx]!;
      const vB = cornerVertexIds[(sideIdx + 1) % 6]!;
      let eNode = edges[eId];
      if (!eNode) {
        eNode = createEdgeNode(eId, vA, vB, vertices);
        edges[eId] = eNode;
        edgeOrder.push(eId);
      }
      pushUnique(eNode.adjacentHexIds, hId);

      const vANode = vertices[vA]!;
      const vBNode = vertices[vB]!;
      pushUnique(vANode.adjacentVertexIds, vB);
      pushUnique(vANode.incidentEdgeIds, eId);
      pushUnique(vBNode.adjacentVertexIds, vA);
      pushUnique(vBNode.incidentEdgeIds, eId);
    }
  }

  return { hexSize, hexes, vertices, edges, hexOrder, vertexOrder, edgeOrder };
}

function pickLongerPath(
  bestSoFar: readonly EdgeId[],
  candidate: readonly EdgeId[]
): readonly EdgeId[] {
  return candidate.length > bestSoFar.length ? candidate : bestSoFar;
}

/**
 * Computes the Longest Simple Edge Path for a player's network of edges (roads/ships)
 * using pure immutable recursive search (zero mutable visited sets or backtracking stacks).
 */
export function computeLongestSimpleEdgePath(
  topology: HexBoardTopology,
  playerEdgeIds: readonly EdgeId[],
  blockedVertices: ReadonlySet<VertexId>,
  canTransitionEdgePair?: (
    prevEdge: EdgeId,
    nextEdge: EdgeId,
    sharedVertex: VertexId
  ) => boolean
): { length: number; bestPath: EdgeId[] } {
  if (playerEdgeIds.length === 0) {
    return { length: 0, bestPath: [] };
  }

  const ownedSet: ReadonlySet<EdgeId> = new Set<EdgeId>(playerEdgeIds);

  const exploreFrom = (
    currentEdgeId: EdgeId,
    currentVertexId: VertexId,
    visitedEdges: ReadonlySet<EdgeId>,
    currentPath: readonly EdgeId[],
    bestSoFar: readonly EdgeId[]
  ): readonly EdgeId[] => {
    const nextBest = pickLongerPath(bestSoFar, currentPath);
    if (blockedVertices.has(currentVertexId)) {
      return nextBest;
    }
    const vNode = topology.vertices[currentVertexId];
    if (!vNode) {
      return nextBest;
    }

    return vNode.incidentEdgeIds.reduce<readonly EdgeId[]>(
      (bestAcc, nextEdgeId) => {
        if (!ownedSet.has(nextEdgeId) || visitedEdges.has(nextEdgeId)) {
          return bestAcc;
        }
        if (
          canTransitionEdgePair &&
          !canTransitionEdgePair(currentEdgeId, nextEdgeId, currentVertexId)
        ) {
          return bestAcc;
        }
        const nextEdge = topology.edges[nextEdgeId]!;
        const nextVertexId =
          nextEdge.v1 === currentVertexId ? nextEdge.v2 : nextEdge.v1;
        return exploreFrom(
          nextEdgeId,
          nextVertexId,
          new Set<EdgeId>([...visitedEdges, nextEdgeId]),
          [...currentPath, nextEdgeId],
          bestAcc
        );
      },
      nextBest
    );
  };

  const longestPath = playerEdgeIds.reduce<readonly EdgeId[]>(
    (bestAcc, startEdgeId) => {
      const edge = topology.edges[startEdgeId];
      if (!edge) return bestAcc;
      const initialVisited: ReadonlySet<EdgeId> = new Set<EdgeId>([startEdgeId]);
      const initialPath: readonly EdgeId[] = [startEdgeId];
      const afterV1 = exploreFrom(startEdgeId, edge.v1, initialVisited, initialPath, bestAcc);
      return exploreFrom(startEdgeId, edge.v2, initialVisited, initialPath, afterV1);
    },
    []
  );

  return { length: longestPath.length, bestPath: [...longestPath] };
}
