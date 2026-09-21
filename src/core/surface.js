import { Vector3 } from 'three';
import { makeSolid } from './polyhedra.js';

/**
 * A walkable surface: any polyhedron cut into four-sided tiles.
 *
 * Every tile has four sides however odd the solid, which is what lets one
 * movement model serve all of them. Curvature stops being "the cube has
 * corners" and becomes "a mesh vertex where the number of tiles is not four":
 *   3 tiles -> +90 degrees   (a convex corner)
 *   4 tiles ->   0           (flat, walk straight over it)
 *   5 tiles -> -90 degrees   (a saddle)
 * Sum that over every vertex of a closed surface and you always get 720.
 * That identity is the engine's own check that a solid was built correctly.
 */

const EPS = 1e-6;
const vkey = (v) => `${v.x.toFixed(5)}|${v.y.toFixed(5)}|${v.z.toFixed(5)}`;
const ekey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** The cube's corner distance. Every solid is scaled to match, so the fixed
 *  camera frames them all alike and the existing cube is left untouched. */
const TARGET_RADIUS = Math.sqrt(3);

/**
 * One step of quad subdivision: every n-gon becomes n quads, joined at a new
 * face centre. No smoothing, so faces stay flat and tiles stay planar.
 * Applied once it makes any mesh all-quad; applied again it just refines.
 */
function quadSubdivide({ vertices, faces, faceOf }) {
  const out = vertices.map((v) => v.clone());
  const index = new Map(out.map((v, i) => [vkey(v), i]));

  const add = (v) => {
    const k = vkey(v);
    if (!index.has(k)) {
      index.set(k, out.length);
      out.push(v);
    }
    return index.get(k);
  };

  const edgePoint = new Map();
  const midpoint = (a, b) => {
    const k = ekey(a, b);
    if (!edgePoint.has(k)) {
      edgePoint.set(k, add(new Vector3().addVectors(vertices[a], vertices[b]).multiplyScalar(0.5)));
    }
    return edgePoint.get(k);
  };

  const quads = [];
  const tags = [];
  for (const [f, face] of faces.entries()) {
    const centre = new Vector3();
    face.forEach((i) => centre.add(vertices[i]));
    const centreIndex = add(centre.divideScalar(face.length));

    const n = face.length;
    for (let i = 0; i < n; i++) {
      quads.push([
        face[i],
        midpoint(face[i], face[(i + 1) % n]),
        centreIndex,
        midpoint(face[(i + n - 1) % n], face[i]),
      ]);
      // Remember which face of the original solid this tile came from. It is
      // what "which way round did you go" means once tiles are the atoms.
      tags.push(faceOf ? faceOf[f] : f);
    }
  }
  return { vertices: out, faces: quads, faceOf: tags };
}

/**
 * @param spec       a solid name, {cells}, or {vertices, faces}
 * @param subdivide  how many times to quad-subdivide. 1 makes any solid
 *                   all-quad; each further step quarters every tile.
 *                   A cube at 2 is the familiar 4x4 grid per face.
 */
export function buildSurface(spec, subdivide = 2) {
  const solid = makeSolid(spec);
  let mesh = { ...solid, faceOf: solid.faces.map((_, i) => i) };
  for (let i = 0; i < subdivide; i++) mesh = quadSubdivide(mesh);

  const bad = mesh.faces.find((f) => f.length !== 4);
  if (bad) {
    throw new Error(
      'surface is not all-quad; subdivide at least once for non-quad solids'
    );
  }

  normalise(mesh.vertices);
  return indexSurface(mesh);
}

/** Centres the solid and scales it so every solid frames the same way. */
function normalise(vertices) {
  const centre = new Vector3();
  vertices.forEach((v) => centre.add(v));
  centre.divideScalar(vertices.length);

  let radius = 0;
  vertices.forEach((v) => {
    v.sub(centre);
    radius = Math.max(radius, v.length());
  });
  if (radius > EPS) vertices.forEach((v) => v.multiplyScalar(TARGET_RADIUS / radius));
}

function indexSurface({ vertices, faces, faceOf }) {
  const tiles = faces.map((corners, id) => {
    const points = corners.map((i) => vertices[i]);
    const centre = new Vector3();
    points.forEach((p) => centre.add(p));
    centre.divideScalar(4);

    // Corners are wound counter-clockwise seen from outside, so this points
    // out of the solid. Everything downstream depends on that being true.
    const normal = new Vector3()
      .subVectors(points[2], points[0])
      .cross(new Vector3().subVectors(points[3], points[1]))
      .normalize();

    return {
      id,
      face: faceOf ? faceOf[id] : id,
      corners, points, centre, normal,
      neighbours: new Array(4).fill(null),
    };
  });

  // Side i of a tile is the edge from corner i to corner i+1. On a closed
  // surface every such edge is shared by exactly two tiles.
  const edges = new Map();
  tiles.forEach((tile) => {
    for (let side = 0; side < 4; side++) {
      const a = tile.corners[side];
      const b = tile.corners[(side + 1) % 4];
      const k = ekey(a, b);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push({ tile: tile.id, side });
    }
  });

  for (const [k, uses] of edges) {
    if (uses.length !== 2) {
      throw new Error(`edge ${k} is shared by ${uses.length} tiles, not 2`);
    }
    const [p, q] = uses;
    tiles[p.tile].neighbours[p.side] = { tile: q.tile, side: q.side };
    tiles[q.tile].neighbours[q.side] = { tile: p.tile, side: p.side };
  }

  // Curvature lives at the mesh vertices: a quarter turn per missing tile.
  const degree = new Map();
  faces.forEach((f) => f.forEach((i) => degree.set(i, (degree.get(i) ?? 0) + 1)));
  const curvature = new Map();
  for (const [i, d] of degree) curvature.set(i, (4 - d) * 90);

  return new Surface(tiles, vertices, curvature);
}

export class Surface {
  constructor(tiles, vertices, curvature) {
    this.tiles = tiles;
    this.vertices = vertices;
    this.curvature = curvature;
  }

  get size() {
    return this.tiles.length;
  }

  tile(id) {
    return this.tiles[id];
  }

  /** Which face of the original solid a tile was cut from. */
  faceOf(id) {
    return this.tiles[id].face;
  }

  /**
   * Volume enclosed by the surface, from the divergence theorem. Positive
   * means every tile is wound the same way round and facing outwards.
   * On a concave solid a tile's normal can point back towards the middle, so
   * this is the test that still works when "points away from the centre"
   * stops being true.
   */
  signedVolume() {
    let v = 0;
    for (const tile of this.tiles) {
      const [a, b, c, d] = tile.points;
      v += a.dot(new Vector3().crossVectors(b, c));
      v += a.dot(new Vector3().crossVectors(c, d));
    }
    return v / 6;
  }

  /** Total curvature. Always 720 degrees for a closed surface, every time. */
  totalCurvature() {
    let sum = 0;
    for (const k of this.curvature.values()) sum += k;
    return sum;
  }

  /** Mesh vertices that actually bend the surface, with their sign. */
  cones() {
    return [...this.curvature.entries()]
      .filter(([, k]) => k !== 0)
      .map(([i, k]) => ({ point: this.vertices[i], deficit: k }));
  }

  /** Mean distance from a tile's centre to its corners: how big it draws. */
  tileRadius(id) {
    const tile = this.tiles[id];
    return tile.points.reduce((a, p) => a + p.distanceTo(tile.centre), 0) / 4;
  }

  /** Typical tile size across the whole surface, for sizing marks once. */
  meanTileRadius() {
    let sum = 0;
    for (const tile of this.tiles) sum += this.tileRadius(tile.id);
    return sum / this.tiles.length;
  }

  /** Edges between tiles cut from different faces: the solid's own edges. */
  structuralEdges() {
    const out = [];
    const seen = new Set();
    for (const tile of this.tiles) {
      for (let side = 0; side < 4; side++) {
        const link = tile.neighbours[side];
        if (this.tiles[link.tile].face === tile.face) continue;
        const k = tile.id < link.tile ? `${tile.id}:${side}` : `${link.tile}:${link.side}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          a: tile.points[side],
          b: tile.points[(side + 1) % 4],
          tiles: [tile.id, link.tile],
        });
      }
    }
    return out;
  }

  /** World direction from a tile's centre towards the middle of side `s`. */
  sideDirection(id, s) {
    const tile = this.tiles[id];
    const a = tile.points[s];
    const b = tile.points[(s + 1) % 4];
    return new Vector3().addVectors(a, b).multiplyScalar(0.5).sub(tile.centre).normalize();
  }

  /**
   * Walk through the side the dart faces. You enter the next tile by one of
   * its sides and carry on across it, which is the whole edge-crossing rule
   * for every solid at once.
   */
  step({ tile, side }) {
    const link = this.tiles[tile].neighbours[side];
    if (!link) return null;
    return {
      tile: link.tile,
      side: (link.side + 2) % 4,
      exit: side,
      entry: link.side,
    };
  }

  /**
   * Carries a direction across that same step. The step is a rigid motion, so
   * every direction turns by the same amount the heading did; a direction
   * carried this way is never touched by the player turning on the spot.
   */
  transport(direction, exit, entry) {
    return (((direction - exit + entry + 2) % 4) + 4) % 4;
  }

  /** Counter-clockwise seen from outside is a left turn. */
  turnLeft({ tile, side }) {
    return { tile, side: (side + 1) % 4 };
  }

  turnRight({ tile, side }) {
    return { tile, side: (side + 3) % 4 };
  }

  /** Nearest tile to a world point. Used to port hand-written levels over. */
  nearestTile(point) {
    let best = -1;
    let bestDist = Infinity;
    for (const tile of this.tiles) {
      const d = tile.centre.distanceToSquared(point);
      if (d < bestDist) {
        bestDist = d;
        best = tile.id;
      }
    }
    return best;
  }

  /** The side of `tile` pointing most nearly along a world direction. */
  nearestSide(id, direction) {
    let best = 0;
    let bestDot = -Infinity;
    for (let s = 0; s < 4; s++) {
      const d = this.sideDirection(id, s).dot(direction);
      if (d > bestDot) {
        bestDot = d;
        best = s;
      }
    }
    return best;
  }
}
