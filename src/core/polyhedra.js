import { Vector3 } from 'three';

/**
 * Polyhedra as raw {vertices, faces}. Faces are wound counter-clockwise seen
 * from outside, which is what lets the surface builder give every tile a
 * consistent notion of "turn right".
 *
 * Convex solids are described by their vertices alone and the faces are found
 * by hull, so adding a new one means typing coordinates and nothing else.
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const EPS = 1e-9;

const key = (v) => `${v.x.toFixed(6)}|${v.y.toFixed(6)}|${v.z.toFixed(6)}`;

/** Every sign combination of the given magnitudes, skipping duplicate zeros. */
function signs(x, y, z) {
  const out = [];
  for (const sx of x === 0 ? [0] : [1, -1]) {
    for (const sy of y === 0 ? [0] : [1, -1]) {
      for (const sz of z === 0 ? [0] : [1, -1]) {
        out.push(new Vector3(sx * x, sy * y, sz * z));
      }
    }
  }
  return out;
}

/** All even (cyclic) rotations of a coordinate triple, with all sign flips. */
function cyclic(x, y, z) {
  return [...signs(x, y, z), ...signs(y, z, x), ...signs(z, x, y)];
}

function dedupe(points) {
  const seen = new Map();
  for (const p of points) if (!seen.has(key(p))) seen.set(key(p), p);
  return [...seen.values()];
}

/**
 * Faces of the convex hull of a point set, as index loops wound CCW from
 * outside. Every plane spanned by three vertices that leaves all the others
 * on one side is a face; the vertices lying on it are then sorted around its
 * normal. O(n^3), which for a solid of twenty-odd vertices is nothing.
 */
export function hullFaces(vertices) {
  const n = vertices.length;
  const faces = [];
  const seen = new Set();

  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const normal = new Vector3()
          .subVectors(vertices[b], vertices[a])
          .cross(new Vector3().subVectors(vertices[c], vertices[a]));
        if (normal.lengthSq() < EPS) continue;
        normal.normalize();

        const d = normal.dot(vertices[a]);
        let above = 0;
        let below = 0;
        const on = [];
        for (let i = 0; i < n; i++) {
          const s = normal.dot(vertices[i]) - d;
          if (s > 1e-7) above++;
          else if (s < -1e-7) below++;
          else on.push(i);
        }
        if (above && below) continue;
        // Make the normal point away from the solid.
        if (above) normal.negate();
        const plane = `${normal.x.toFixed(5)}|${normal.y.toFixed(5)}|${normal.z.toFixed(5)}`;
        if (seen.has(plane)) continue;
        seen.add(plane);
        faces.push(sortAround(on, vertices, normal));
      }
    }
  }
  return faces;
}

/** Orders coplanar vertex indices counter-clockwise seen from +normal. */
function sortAround(indices, vertices, normal) {
  const centre = new Vector3();
  indices.forEach((i) => centre.add(vertices[i]));
  centre.divideScalar(indices.length);

  const u = new Vector3().subVectors(vertices[indices[0]], centre).normalize();
  const w = new Vector3().crossVectors(normal, u);

  return [...indices].sort((p, q) => angle(p) - angle(q));

  function angle(i) {
    const r = new Vector3().subVectors(vertices[i], centre);
    return Math.atan2(r.dot(w), r.dot(u));
  }
}

function convex(points) {
  const vertices = dedupe(points);
  return { vertices, faces: hullFaces(vertices) };
}

export const tetrahedron = () =>
  convex([
    new Vector3(1, 1, 1), new Vector3(1, -1, -1),
    new Vector3(-1, 1, -1), new Vector3(-1, -1, 1),
  ]);

export const cube = () => convex(signs(1, 1, 1));

export const octahedron = () =>
  convex([...signs(1, 0, 0), ...signs(0, 1, 0), ...signs(0, 0, 1)]);

export const dodecahedron = () =>
  convex([...signs(1, 1, 1), ...cyclic(0, 1 / PHI, PHI)]);

export const icosahedron = () => convex(cyclic(0, 1, PHI));

/**
 * The boundary surface of a set of unit cells. Unlike the convex solids this
 * one can fold inwards, which is the whole reason it is here: a concave edge
 * brings negative curvature, and a vertex where five squares meet is worth
 * -90 degrees. Nothing convex can do that.
 *
 * @param cells integer [x, y, z] triples, each a unit cube
 */
export function polycube(cells) {
  const occupied = new Set(cells.map(([x, y, z]) => `${x}|${y}|${z}`));
  const has = (x, y, z) => occupied.has(`${x}|${y}|${z}`);

  const index = new Map();
  const vertices = [];
  const vertexAt = (x, y, z) => {
    const p = new Vector3(x, y, z);
    const k = key(p);
    if (!index.has(k)) {
      index.set(k, vertices.length);
      vertices.push(p);
    }
    return index.get(k);
  };

  // Local corner order per outward direction, counter-clockwise from outside.
  const FACES = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];

  const faces = [];
  for (const [x, y, z] of cells) {
    for (const { dir, corners } of FACES) {
      // A face is surface only where there is no neighbour behind it.
      if (has(x + dir[0], y + dir[1], z + dir[2])) continue;
      faces.push(corners.map(([dx, dy, dz]) => vertexAt(x + dx, y + dy, z + dz)));
    }
  }

  // Centre it, so the fixed camera frames it the same way as everything else.
  const centre = new Vector3();
  vertices.forEach((v) => centre.add(v));
  centre.divideScalar(vertices.length);
  vertices.forEach((v) => v.sub(centre));

  return { vertices, faces };
}

export const SOLIDS = {
  tetrahedron,
  cube,
  octahedron,
  dodecahedron,
  icosahedron,
  // A few polycubes worth walking on. Any cell list works.
  lblock: () => polycube([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 2, 0]]),
  stairs: () => polycube([[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [2, 2, 0]]),
  plus: () => polycube([
    [1, 1, 1], [0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 0], [1, 1, 2],
  ]),
};

/** Builds a named solid, or a custom one from an explicit cell list. */
export function makeSolid(spec) {
  if (typeof spec === 'string') {
    const build = SOLIDS[spec];
    if (!build) throw new Error(`unknown solid: ${spec}`);
    return build();
  }
  if (spec?.cells) return polycube(spec.cells);
  if (spec?.vertices) {
    const vertices = spec.vertices.map((v) => new Vector3(...v));
    return { vertices, faces: spec.faces ?? hullFaces(vertices) };
  }
  throw new Error('a solid needs a name, a cell list, or vertices');
}
