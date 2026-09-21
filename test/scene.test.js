import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  TO_CAMERA, isNearSide, createSolid, faceOrientation, frustumFor, VIEW_SPAN,
} from '../src/render/scene.js';
import { Walker } from '../src/core/walker.js';
import { buildSurface } from '../src/core/surface.js';
import { SOLIDS } from '../src/core/polyhedra.js';
import { faceColours } from '../src/render/palette.js';

/** Where a point lands on the view plane, under orthographic projection. */
const project = (v) => v.clone().addScaledVector(TO_CAMERA, -v.dot(TO_CAMERA));

describe('the camera is not on the body diagonal', () => {
  it('separates the near and far corners of a cube', () => {
    // On (1, 1, 1) this separation is exactly zero: both ends of the body
    // diagonal land on the same pixel and the cube reads as a flat hexagon.
    const near = project(new Vector3(1, 1, 1));
    const far = project(new Vector3(-1, -1, -1));
    expect(near.distanceTo(far)).toBeGreaterThan(0.4);
  });

  it('gives the three axes visibly unequal projected areas', () => {
    const areas = [TO_CAMERA.x, TO_CAMERA.y, TO_CAMERA.z].map(Math.abs).sort();
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i] - areas[i - 1]).toBeGreaterThan(0.05);
    }
  });

  it('shows three faces of a cube and hides three', () => {
    const surface = buildSurface('cube', 2);
    const faces = new Map();
    for (const tile of surface.tiles) faces.set(tile.face, tile.normal);
    const near = [...faces.values()].filter(isNearSide);
    expect(faces.size).toBe(6);
    expect(near).toHaveLength(3);
  });
});

describe('the solid renders on every shape', () => {
  for (const name of Object.keys(SOLIDS)) {
    it(`${name}: builds geometry and never hides every tile`, () => {
      const surface = buildSurface(name, 1);
      const group = createSolid(surface);
      expect(group.children.length).toBeGreaterThan(0);

      const near = surface.tiles.filter((t) => isNearSide(t.normal));
      expect(near.length).toBeGreaterThan(0);
      expect(near.length).toBeLessThan(surface.size);

      // The solid must be able to show a win, and to be re-lit as it turns.
      expect(() => group.userData.update(null, 1)).not.toThrow();
      expect(() => group.userData.update(null, 0)).not.toThrow();
      expect(() => group.userData.update(faceOrientation(surface.tile(0).normal), 0))
        .not.toThrow();
    });
  }

  it('draws the solid own edges, not every tile boundary', () => {
    const surface = buildSurface('cube', 2);
    // A cube has twelve edges however finely its faces are diced.
    expect(surface.structuralEdges()).toHaveLength(12 * 4);
  });
});

describe('the view follows the player without lying to them', () => {
  const CAM = TO_CAMERA;

  const UP = new Vector3(0, 1, 0);

  it('brings the face it is given round to the top', () => {
    for (const name of Object.keys(SOLIDS)) {
      const surface = buildSurface(name, 1);
      for (const tile of surface.tiles) {
        const posed = tile.normal.clone().applyQuaternion(faceOrientation(tile.normal));
        expect(posed.angleTo(UP)).toBeLessThan(1e-6);
      }
    }
  });

  it('KEEPS THE ISOMETRIC VIEW: a cube still shows three faces, not one', () => {
    // Posing a face flat-on to the camera would leave one face filling the
    // screen and the solid would stop reading as a solid. The player's face
    // goes to the top instead, and the oblique view survives untouched.
    const surface = buildSurface('cube', 2);
    for (const tile of surface.tiles) {
      const pose = faceOrientation(tile.normal);
      const faces = new Map();
      for (const t of surface.tiles) {
        faces.set(t.face, t.normal.clone().applyQuaternion(pose));
      }
      expect([...faces.values()].filter(isNearSide)).toHaveLength(3);
    }
  });

  it('puts the player on the best-lit face of the three', () => {
    const surface = buildSurface('cube', 2);
    const tile = surface.tile(0);
    const pose = faceOrientation(tile.normal);
    const mine = tile.normal.clone().applyQuaternion(pose).dot(TO_CAMERA);
    for (const other of surface.tiles) {
      const d = other.normal.clone().applyQuaternion(pose).dot(TO_CAMERA);
      expect(d).toBeLessThanOrEqual(mine + 1e-9);
    }
  });

  it('copes with a face pointing straight down', () => {
    const away = UP.clone().negate();
    const posed = away.clone().applyQuaternion(faceOrientation(away));
    expect(posed.angleTo(UP)).toBeLessThan(1e-6);
  });

  it('is a pure function of the normal: same face, same pose, always', () => {
    // The safety property. If the pose could drift with the route, the
    // world's own spin would be indistinguishable from the rotation the
    // surface hands the player, and the game would have nothing left to show.
    // Compared component-wise: Quaternion.angleTo runs through acos, which
    // turns a 1e-16 error in the dot product into about 1e-8 of angle.
    const surface = buildSurface('dodecahedron', 1);
    for (const tile of surface.tiles) {
      const a = faceOrientation(tile.normal);
      const b = faceOrientation(tile.normal.clone());
      expect([a.x, a.y, a.z, a.w]).toEqual([b.x, b.y, b.z, b.w]);
    }
  });

  it('gives every tile of one face the same pose', () => {
    const surface = buildSurface('cube', 2);
    const byFace = new Map();
    for (const tile of surface.tiles) {
      const pose = faceOrientation(tile.normal);
      if (!byFace.has(tile.face)) byFace.set(tile.face, pose);
      // Walking across a face must not turn the solid at all.
      expect(byFace.get(tile.face).angleTo(pose)).toBeLessThan(1e-6);
    }
    expect(byFace.size).toBe(6);
  });

  it('leaves a corner loop looking identical, so the needle is the only news', () => {
    const surface = buildSurface('cube', 2);

    // The three tiles meeting at one corner of the cube.
    const [corner] = [...surface.curvature.entries()].find(([, k]) => k === 90);
    const ring = surface.tiles
      .map((t) => ({ tile: t.id, at: t.corners.indexOf(corner) }))
      .filter((t) => t.at >= 0);
    expect(ring).toHaveLength(3);

    const walker = new Walker(surface, { tile: ring[0].tile, side: ring[0].at });
    walker.carry(ring[0].at);
    const startTile = walker.tile;
    const startNeedle = walker.needle;
    const before = faceOrientation(surface.tile(startTile).normal);

    for (let i = 0; i < ring.length; i++) {
      const out = walker.step();
      const at = surface.tile(out.tile).corners.indexOf(corner);
      while (walker.side !== at) walker.turnLeft();
    }

    // Back on the tile it set out from, and the solid presents it identically.
    expect(walker.tile).toBe(startTile);
    const after = faceOrientation(surface.tile(walker.tile).normal);
    expect(before.angleTo(after)).toBeLessThan(1e-6);

    // So the quarter turn the player can see is the geometry, not the camera.
    expect(Math.abs(walker.holonomy())).toBe(90);
    expect(walker.needle).not.toBe(startNeedle);
  });
});

describe('nothing flat is ever culled away', () => {
  it('every flat mark is double sided, so it survives being seen from behind', async () => {
    // These lie in the tile plane facing outwards. Seen through the solid you
    // are looking at their BACK, and a single-sided material deletes them.
    // That is what hid the key, the slot and the player on the far side.
    const { DoubleSide } = await import('three');
    const { createMarks } = await import('../src/render/marks.js');
    const { createPlayerMesh } = await import('../src/render/playerMesh.js');
    const { parseLevel } = await import('../src/game/level.js');

    const level = parseLevel({
      id: 'T',
      surface: { solid: 'cube', subdivide: 2 },
      budget: 20,
      spawn: { tile: 25, side: 1 },
      tiles: [
        { tile: 26, type: 'key', needle: 1 },
        { tile: 22, type: 'slot', needle: 1 },
        { tile: 30, type: 'wall' },
        { tile: 31, type: 'gate', direction: 0 },
        { tile: 32, type: 'mirror', axis: 0 },
      ],
    });

    const groups = [createMarks(level).group, createPlayerMesh(level.surface)];
    let checked = 0;
    for (const group of groups) {
      group.traverse((o) => {
        if (o.type !== 'Mesh') return;
        checked++;
        expect(o.material.side, `${o.type} #${o.id} is single sided`).toBe(DoubleSide);
      });
    }
    expect(checked).toBeGreaterThan(5);
  });

  it('the key stays visible when its tile faces away from the camera', async () => {
    const { createMarks } = await import('../src/render/marks.js');
    const { parseLevel } = await import('../src/game/level.js');
    const { createGame } = await import('../src/game/game.js');

    const surface = buildSurface('cube', 2);
    // Put the key on a tile that the fixed view cannot see the front of.
    const hidden = surface.tiles.find((t) => !isNearSide(t.normal));
    const level = parseLevel({
      id: 'T',
      surface: { solid: 'cube', subdivide: 2 },
      budget: 20,
      spawn: { tile: 25, side: 1 },
      tiles: [
        { tile: hidden.id, type: 'key', needle: 1 },
        { tile: 22, type: 'slot', needle: 1 },
      ],
    });

    const marks = createMarks(level);
    marks.update(createGame(level), 0, -Infinity, null);

    const key = marks.group.children.find((c) => c.type === 'Mesh' && c.renderOrder === 600);
    expect(key.visible).toBe(true);
    // Knocked back so you know it is round the back, never switched off.
    expect(key.material.opacity).toBeGreaterThan(0.3);
    expect(key.material.opacity).toBeLessThan(1);
  });
});

describe('faces are told apart by colour on every solid', () => {
  it('a cube still comes out as the axis pairing it always was', () => {
    const surface = buildSurface('cube', 2);
    const colours = faceColours(surface);
    const counts = new Map();
    for (const c of colours.values()) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect([...counts.values()].sort()).toEqual([2, 2, 2]);
    expect(clashes(surface, colours)).toBe(0);
  });

  it('no solid comes out as one flat colour', () => {
    // Tinting by dominant axis made a tetrahedron and an octahedron 100% red,
    // because their normals are all (1,1,1)-ish and every component ties.
    for (const name of Object.keys(SOLIDS)) {
      const surface = buildSurface(name, 1);
      const colours = faceColours(surface);
      const counts = new Map();
      for (const c of colours.values()) counts.set(c, (counts.get(c) ?? 0) + 1);
      const worst = Math.max(...counts.values()) / colours.size;
      expect(worst, `${name} is ${Math.round(worst * 100)}% one colour`).toBeLessThan(0.7);
    }
  });

  it('most borders separate two different colours', () => {
    // Three hues cannot always be perfect: a tetrahedron's faces all touch,
    // so it needs four. The point is that the repeats are rare.
    for (const name of Object.keys(SOLIDS)) {
      const surface = buildSurface(name, 1);
      const colours = faceColours(surface);
      const { bad, total } = clashDetail(surface, colours);
      expect(bad / total, `${name} repeats on ${bad}/${total} borders`).toBeLessThan(0.35);
    }
  });
});

function clashDetail(surface, colours) {
  const seen = new Set();
  let bad = 0;
  let total = 0;
  for (const tile of surface.tiles) {
    for (const side of tile.neighbours) {
      const other = surface.tile(side.tile).face;
      if (other === tile.face) continue;
      const key = `${Math.min(tile.face, other)}:${Math.max(tile.face, other)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total++;
      if (colours.get(tile.face) === colours.get(other)) bad++;
    }
  }
  return { bad, total };
}

const clashes = (surface, colours) => clashDetail(surface, colours).bad;

describe('the solid fits on the screen, whatever shape the screen is', () => {
  // A phone in portrait was the case this got wrong: sizing the view box by
  // height alone left it half as wide as the solid, cut off at both edges.
  const NEEDED = 2 * Math.sqrt(3);   // every solid is normalised to this span

  const SCREENS = [
    ['desktop', 1920, 1080], ['laptop', 1440, 900], ['tablet', 768, 1024],
    ['iPhone portrait', 390, 844], ['android portrait', 360, 800],
    ['very tall', 852, 2000], ['phone sideways', 844, 390],
    ['square', 800, 800],
  ];

  for (const [label, w, h] of SCREENS) {
    it(`${label} ${w}x${h} shows the whole solid`, () => {
      const { width, height } = frustumFor(w / h);
      expect(width, 'cropped left and right').toBeGreaterThanOrEqual(NEEDED);
      expect(height, 'cropped top and bottom').toBeGreaterThanOrEqual(NEEDED);
    });
  }

  it('never wastes the screen: one dimension is always a snug fit', () => {
    for (const [, w, h] of SCREENS) {
      const { width, height } = frustumFor(w / h);
      expect(Math.min(width, height)).toBeCloseTo(VIEW_SPAN, 9);
    }
  });
});
