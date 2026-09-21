import { describe, it, expect } from 'vitest';
import { buildSurface } from '../src/core/surface.js';
import { SOLIDS } from '../src/core/polyhedra.js';
import { Walker } from '../src/core/walker.js';

const NAMES = Object.keys(SOLIDS);

/** Tiles touching a mesh vertex, and where that vertex sits in each. */
function fan(surface, vertex) {
  const out = [];
  for (const tile of surface.tiles) {
    const corner = tile.corners.indexOf(vertex);
    if (corner >= 0) out.push({ tile: tile.id, corner });
  }
  return out;
}

/**
 * Walks the tightest possible loop around one mesh vertex: visit every tile
 * touching it, always leaving by the side that starts at that vertex.
 */
function loopAroundVertex(surface, vertex) {
  const ring = fan(surface, vertex);
  const start = ring[0];
  const walker = new Walker(surface, { tile: start.tile, side: start.corner });
  walker.carry(start.corner);

  for (let i = 0; i < ring.length; i++) {
    const out = walker.step();
    // Face the side of the new tile that starts at the same vertex.
    const corner = surface.tile(out.tile).corners.indexOf(vertex);
    expect(corner).toBeGreaterThanOrEqual(0);
    for (let guard = 0; guard < 4 && walker.side !== corner; guard++) walker.turnLeft();
    expect(walker.side).toBe(corner);
  }
  return walker;
}

describe('holonomy is the curvature the loop encloses', () => {
  for (const name of NAMES) {
    it(`${name}: a loop round one cone reads that cone exactly`, () => {
      const surface = buildSurface(name, 1);
      let checked = 0;

      for (const [vertex, deficit] of surface.curvature) {
        const walker = loopAroundVertex(surface, vertex);
        // Back where it started, every time.
        expect(walker.tile).toBe(fan(surface, vertex)[0].tile);
        expect(Math.abs(walker.holonomy())).toBe(Math.abs(deficit));
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  }

  it('a flat vertex is genuinely free to walk around', () => {
    // Degree 4: four tiles, no bend. Circling it must change nothing.
    const surface = buildSurface('cube', 2);
    const flat = [...surface.curvature.entries()].filter(([, k]) => k === 0);
    expect(flat.length).toBeGreaterThan(0);

    for (const [vertex] of flat.slice(0, 12)) {
      const ring = fan(surface, vertex);
      const walker = loopAroundVertex(surface, vertex);
      expect(walker.holonomy()).toBe(0);
      // And the needle comes back pointing exactly where it set out.
      expect(walker.needle).toBe(ring[0].corner);
    }
  });

  it('saddles turn you the opposite way to corners', () => {
    // The dodecahedron has both. Circling each the same way must disagree
    // in sign, which is the thing a cube can never offer.
    const surface = buildSurface('dodecahedron', 1);
    const signs = new Map();
    for (const [vertex, deficit] of surface.curvature) {
      if (deficit === 0) continue;
      const h = loopAroundVertex(surface, vertex).holonomy();
      if (!signs.has(deficit)) signs.set(deficit, h);
      expect(signs.get(deficit)).toBe(h);
    }
    expect(signs.size).toBe(2);
    expect(Math.sign(signs.get(90))).toBe(-Math.sign(signs.get(-90)));
  });
});

describe('the rules that make the needle worth anything', () => {
  for (const name of NAMES) {
    it(`${name}: turning on the spot never moves the needle`, () => {
      const surface = buildSurface(name, 1);
      const walker = new Walker(surface, { tile: 0, side: 0 });
      walker.carry(2);
      for (let i = 0; i < 9; i++) walker.turnRight();
      expect(walker.needle).toBe(2);
      expect(walker.holonomy()).toBe(0);
    });

    it(`${name}: out and straight back changes nothing`, () => {
      const surface = buildSurface(name, 1);
      const walker = new Walker(surface, { tile: 0, side: 0 });
      walker.carry(1);
      walker.step();
      walker.turnLeft(); walker.turnLeft();
      walker.step();
      walker.turnLeft(); walker.turnLeft();
      expect(walker.tile).toBe(0);
      expect(walker.side).toBe(0);
      expect(walker.needle).toBe(1);
      expect(walker.holonomy()).toBe(0);
    });
  }

  it('the needle and the holonomy reading never disagree', () => {
    // If these two ever part company, one of them is lying to the player.
    for (const name of NAMES) {
      const surface = buildSurface(name, 1);
      const walker = new Walker(surface, { tile: 0, side: 0 });
      walker.carry(0);
      let seed = 4242;
      const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

      for (let i = 0; i < 400; i++) {
        const roll = rand();
        if (roll < 0.25) walker.turnLeft();
        else if (roll < 0.5) walker.turnRight();
        else walker.step();

        const ref = walker.reference[walker.tile];
        const drift = (((walker.needle - ref) % 4) + 4) % 4;
        const spawnOffset = 0; // needle started level with the spawn heading
        expect(drift * 90).toBe(((walker.holonomy() + 360) % 360) + spawnOffset);
      }
    }
  });
});

describe('the cube still behaves exactly as it always did', () => {
  const surface = buildSurface('cube', 2);

  it('a band loop is sixteen steps and costs no rotation', () => {
    const walker = new Walker(surface, { tile: 0, side: 0 });
    walker.carry(1);
    for (let i = 0; i < 16; i++) walker.step();
    expect(walker.tile).toBe(0);
    expect(walker.side).toBe(0);
    expect(walker.needle).toBe(1);
    expect(walker.holonomy()).toBe(0);
  });

  it('undo restores tile, heading and needle together', () => {
    const walker = new Walker(surface, { tile: 0, side: 0 });
    walker.carry(1);
    walker.step(); walker.step();
    const snap = walker.snapshot();
    walker.turnRight(); walker.step(); walker.step(); walker.turnLeft();
    walker.restore(snap);
    expect(walker.snapshot()).toEqual(snap);
  });
});
