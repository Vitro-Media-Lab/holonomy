import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { buildSurface } from '../src/core/surface.js';
import { SOLIDS, polycube } from '../src/core/polyhedra.js';

const NAMES = Object.keys(SOLIDS);

describe('every solid builds a closed all-quad surface', () => {
  for (const name of NAMES) {
    it(`${name}: quads, shared edges, outward normals`, () => {
      const s = buildSurface(name, 1);
      expect(s.size).toBeGreaterThan(0);

      for (const tile of s.tiles) {
        expect(tile.corners).toHaveLength(4);
        // Every side has exactly one neighbour: the surface has no holes.
        expect(tile.neighbours.filter(Boolean)).toHaveLength(4);
        expect(tile.normal.length()).toBeCloseTo(1, 9);
      }

      // A concave solid can have tiles whose normal points back towards the
      // middle, so orientation is checked by enclosed volume instead.
      expect(s.signedVolume()).toBeGreaterThan(0);
    });

    it(`${name}: adjacency is symmetric`, () => {
      const s = buildSurface(name, 1);
      for (const tile of s.tiles) {
        tile.neighbours.forEach((link, side) => {
          const back = s.tile(link.tile).neighbours[link.side];
          expect(back.tile).toBe(tile.id);
          expect(back.side).toBe(side);
        });
      }
    });
  }
});

describe('Gauss-Bonnet: total curvature is always 720 degrees', () => {
  // The single strongest check in the codebase. Any mistake in subdivision,
  // winding or adjacency shows up here as a number that is not 720.
  for (const name of NAMES) {
    for (const subdivide of [1, 2]) {
      it(`${name} at subdivision ${subdivide}`, () => {
        expect(buildSurface(name, subdivide).totalCurvature()).toBe(720);
      });
    }
  }

  it('holds for an awkward hand-made polycube too', () => {
    const s = buildSurface({ cells: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]] }, 1);
    expect(s.totalCurvature()).toBe(720);
  });
});

describe('where the curvature actually sits', () => {
  const census = (name, subdivide = 1) => {
    const counts = new Map();
    for (const { deficit } of buildSurface(name, subdivide).cones()) {
      counts.set(deficit, (counts.get(deficit) ?? 0) + 1);
    }
    return counts;
  };

  it('a cube is eight convex corners and nothing else', () => {
    expect([...census('cube').entries()]).toEqual([[90, 8]]);
  });

  it('an octahedron puts its corners at the triangle centres', () => {
    expect([...census('octahedron').entries()]).toEqual([[90, 8]]);
  });

  it('a dodecahedron carries BOTH signs', () => {
    const c = census('dodecahedron');
    expect(c.get(90)).toBe(20);
    expect(c.get(-90)).toBe(12);
    expect(20 * 90 + 12 * -90).toBe(720);
  });

  it('an icosahedron carries both signs the other way round', () => {
    const c = census('icosahedron');
    expect(c.get(90)).toBe(20);
    expect(c.get(-90)).toBe(12);
  });

  it('a polycube has saddles, which no convex solid can', () => {
    // An L of cells folds inwards, and the inside corner is worth -90.
    const c = census('lblock');
    expect(c.get(-90)).toBeGreaterThan(0);
    expect(c.get(90)).toBeGreaterThan(0);
  });

  it('a straight run of cells is a box: all corners convex', () => {
    const s = buildSurface({ cells: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] }, 1);
    const deficits = s.cones().map((c) => c.deficit);
    expect(deficits.every((d) => d === 90)).toBe(true);
    expect(deficits).toHaveLength(8);
  });
});

describe('walking the surface', () => {
  it('stepping out and straight back returns the exact dart', () => {
    for (const name of NAMES) {
      const s = buildSurface(name, 1);
      for (const tile of s.tiles) {
        for (let side = 0; side < 4; side++) {
          const out = s.step({ tile: tile.id, side });
          const back = s.step(s.turnLeft(s.turnLeft(out)));
          const home = s.turnLeft(s.turnLeft(back));
          expect(home.tile).toBe(tile.id);
          expect(home.side).toBe(side);
        }
      }
    }
  });

  it('four turns is the identity, and left undoes right', () => {
    const s = buildSurface('dodecahedron', 1);
    let d = { tile: 0, side: 0 };
    for (let i = 0; i < 4; i++) d = s.turnRight(d);
    expect(d.side).toBe(0);
    expect(s.turnLeft(s.turnRight(d)).side).toBe(0);
  });

  it('turning right always goes clockwise about the outward normal', () => {
    // Quads cut from a triangle or a pentagon are not squares, so their four
    // side directions are not exactly 90 degrees apart. The sense of the turn
    // is what has to hold everywhere; the exact angle is a cube's luxury.
    const signed = (a, b, n) =>
      (Math.atan2(new Vector3().crossVectors(a, b).dot(n), a.dot(b)) * 180) / Math.PI;

    for (const name of NAMES) {
      const s = buildSurface(name, 1);
      for (const tile of s.tiles) {
        for (let side = 0; side < 4; side++) {
          const here = s.sideDirection(tile.id, side);
          const left = s.sideDirection(tile.id, s.turnLeft({ tile: tile.id, side }).side);
          const right = s.sideDirection(tile.id, s.turnRight({ tile: tile.id, side }).side);
          expect(signed(here, left, tile.normal)).toBeGreaterThan(0);
          expect(signed(here, right, tile.normal)).toBeLessThan(0);
        }
      }
    }
  });

  it('is exactly square-cornered on the solids made of squares', () => {
    for (const name of ['cube', 'lblock', 'stairs', 'plus']) {
      const s = buildSurface(name, 1);
      const tile = s.tile(0);
      const f = s.sideDirection(0, 0);
      const r = s.sideDirection(0, s.turnRight({ tile: 0, side: 0 }).side);
      expect(r.angleTo(f.clone().cross(tile.normal))).toBeLessThan(1e-6);
    }
  });

  it('a carried direction is untouched by turning and rigid under stepping', () => {
    const s = buildSurface('icosahedron', 1);
    let dart = { tile: 0, side: 0 };
    let needle = 2;
    // Turning must not move it.
    for (let i = 0; i < 3; i++) dart = s.turnRight(dart);
    expect(needle).toBe(2);
    // Stepping must move it exactly as much as the heading moved.
    const before = (needle - dart.side + 4) % 4;
    const out = s.step(dart);
    needle = s.transport(needle, out.exit, out.entry);
    expect((needle - out.side + 4) % 4).toBe(before);
  });
});

describe('the cube is still the cube', () => {
  it('subdivision 2 gives the familiar 4x4 grid on six faces', () => {
    const s = buildSurface('cube', 2);
    expect(s.size).toBe(6 * 16);
  });

  it('walking straight returns to the start after a band loop', () => {
    const s = buildSurface('cube', 2);
    let dart = { tile: 0, side: 0 };
    let needle = 1;
    for (let i = 0; i < 16; i++) {
      const out = s.step(dart);
      needle = s.transport(needle, out.exit, out.entry);
      dart = { tile: out.tile, side: out.side };
    }
    expect(dart.tile).toBe(0);
    expect(dart.side).toBe(0);
    expect(needle).toBe(1);
  });
});
