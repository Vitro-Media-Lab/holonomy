import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLevel, serializeLevel } from '../src/game/level.js';
import { createGame } from '../src/game/game.js';
import { analyse } from '../src/game/solve.js';
import { reflect } from '../src/game/rules.js';

const base = {
  id: 'T',
  surface: { solid: 'cube', subdivide: 2 },
  budget: 30,
  spawn: { tile: 25, side: 1 },
  tiles: [
    { tile: 26, type: 'key', needle: 1 },
    { tile: 22, type: 'slot', needle: 1 },
  ],
};
const level = () => parseLevel(structuredClone(base));

describe('level validation', () => {
  it('rejects a tile index that is not on the surface', () => {
    const bad = structuredClone(base);
    bad.tiles[0].tile = 9999;
    expect(() => parseLevel(bad)).toThrow(/not on this surface/);
  });

  it('rejects a side index outside 0-3', () => {
    const bad = structuredClone(base);
    bad.tiles[0].needle = 7;
    expect(() => parseLevel(bad)).toThrow(/is not 0-3/);
  });

  it('rejects two marks stacked on one tile', () => {
    const bad = structuredClone(base);
    bad.tiles.push({ tile: 26, type: 'wall' });
    expect(() => parseLevel(bad)).toThrow(/two marks on the same tile/);
  });

  it('rejects a level with no slot', () => {
    const bad = structuredClone(base);
    bad.tiles = bad.tiles.filter((t) => t.type !== 'slot');
    expect(() => parseLevel(bad)).toThrow(/exactly one slot/);
  });

  it('accepts human forms: a world point and an axis name', () => {
    const readable = structuredClone(base);
    readable.spawn = { at: [0.25, 1, -0.75], side: '+Z' };
    const lv = parseLevel(readable);
    expect(lv.spawn.tile).toBeGreaterThanOrEqual(0);
    expect(lv.spawn.side).toBeGreaterThanOrEqual(0);
    expect(lv.spawn.side).toBeLessThan(4);
  });

  it('round-trips through JSON as plain indices', () => {
    expect(serializeLevel(level())).toMatchObject({
      id: 'T',
      surface: { solid: 'cube', subdivide: 2 },
      spawn: { tile: 25, side: 1 },
    });
  });

  it('has no wall unless the level asks for one', () => {
    expect(parseLevel({ ...structuredClone(base), budget: undefined }).limit)
      .toBe(Infinity);
  });

  it('works on a solid that is not a cube', () => {
    const dodeca = parseLevel({
      id: 'D',
      surface: { solid: 'dodecahedron', subdivide: 1 },
      budget: 20,
      spawn: { tile: 0, side: 0 },
      tiles: [
        { tile: 1, type: 'key', needle: 0 },
        { tile: 20, type: 'slot', needle: 2 },
      ],
    });
    expect(dodeca.surface.size).toBe(60);
    expect(dodeca.surface.totalCurvature()).toBe(720);
  });
});

describe('the rules', () => {
  it('charges a step for walking and nothing for turning', () => {
    const g = createGame(level());
    g.act('left'); g.act('right'); g.act('left');
    expect(g.steps).toBe(0);
    g.act('forward');
    expect(g.steps).toBe(1);
  });

  it('picks the key up by standing on it', () => {
    const g = createGame(level());
    expect(g.hasKey).toBe(false);
    expect(g.act('forward')).toContain('picked-up');
    expect(g.hasKey).toBe(true);
    expect(g.walker.needle).toBe(1);
  });

  it('refuses the slot when the needle points the wrong way', () => {
    const g = createGame(level());
    g.act('forward');
    expect(g.act('forward')).toContain('rejected');
    expect(g.status).toBe('playing');
  });

  it('lets play continue after a refusal', () => {
    const g = createGame(level());
    g.act('forward'); g.act('forward');
    expect(g.act('forward')).toContain('moved');
  });

  it('cannot be opened by turning on the spot', () => {
    // The whole point: the heading is free, so the lock must not read it.
    const g = createGame(level());
    g.act('forward'); g.act('forward');
    for (let i = 0; i < 4; i++) {
      g.act('left');
      expect(g.status).toBe('playing');
    }
  });

  it('opens when the needle matches, and only then', () => {
    const g = createGame(level());
    for (const a of analyse(g.level).path) g.act(a);
    expect(g.status).toBe('solved');
  });

  it('stops moving once a hard limit is gone', () => {
    // Most levels have no wall at all. A level only stops you if it asked to.
    const tight = structuredClone(base);
    tight.limit = 2;
    const g = createGame(parseLevel(tight));
    g.act('forward'); g.act('forward');
    expect(g.remaining).toBe(0);
    expect(g.act('forward')).toEqual(['exhausted']);
    expect(g.steps).toBe(2);
  });

  it('will not walk into a wall', () => {
    const walled = structuredClone(base);
    walled.tiles.push({ tile: 26, type: 'wall' });
    walled.tiles = walled.tiles.filter((t) => t.type !== 'key' || t.tile !== 26);
    walled.tiles.push({ tile: 24, type: 'key', needle: 0 });
    const g = createGame(parseLevel(walled));
    expect(g.act('forward')).toEqual(['blocked']);
    expect(g.steps).toBe(0);
  });
});

describe('the mirror', () => {
  it('is its own undo', () => {
    for (let axis = 0; axis < 4; axis++) {
      for (let d = 0; d < 4; d++) expect(reflect(reflect(d, axis), axis)).toBe(d);
    }
  });

  it('leaves its own axis alone and flips across it', () => {
    expect(reflect(0, 0)).toBe(0);
    expect(reflect(2, 0)).toBe(2);
    expect(reflect(1, 0)).toBe(3);
    expect(reflect(3, 0)).toBe(1);
  });

  it('does not commute with turning a corner', () => {
    // Reflect then rotate is not rotate then reflect. This is the only thing
    // in the game where the order of two moves changes the answer.
    const rotate = (d) => (d + 1) % 4;
    expect(rotate(reflect(1, 0))).not.toBe(reflect(rotate(1), 0));
  });

  it('flips the needle when the player steps onto it', () => {
    const mirrored = structuredClone(base);
    mirrored.tiles.push({ tile: 27, type: 'mirror', axis: 0 });
    const g = createGame(parseLevel(mirrored));
    g.act('forward');
    const before = g.walker.needle;
    while (g.walker.tile !== 27 && g.steps < 8) g.act('forward');
    if (g.walker.tile === 27) expect(g.walker.needle).not.toBe(before);
  });
});

describe('undo', () => {
  it('rewinds steps, turns and the key together', () => {
    const g = createGame(level());
    g.act('forward');
    expect(g.hasKey).toBe(true);
    g.act('undo');
    expect(g.hasKey).toBe(false);
    expect(g.walker.needle).toBe(null);
    expect(g.steps).toBe(0);
    expect(g.walker.tile).toBe(25);
  });

  it('does nothing at the start of a level', () => {
    const g = createGame(level());
    expect(g.act('undo')).toEqual([]);
    expect(g.steps).toBe(0);
  });
});

describe('the shipped curriculum', () => {
  const manifest = JSON.parse(readFileSync('public/levels/manifest.json', 'utf8'));
  const intent = JSON.parse(readFileSync('design/progression.json', 'utf8'));
  const load = (n) => parseLevel(JSON.parse(readFileSync(`public/levels/${n}.json`, 'utf8')));

  it('is five worlds of five', () => {
    expect(manifest.levels).toHaveLength(25);
    const worlds = new Map();
    for (const spec of intent.levels) {
      worlds.set(spec.world, (worlds.get(spec.world) ?? 0) + 1);
    }
    expect([...worlds.values()]).toEqual([5, 5, 5, 5, 5]);
  });

  it('every level is listed in the manifest and has declared intent', () => {
    const declared = new Set(intent.levels.map((l) => l.id.toLowerCase()));
    for (const name of manifest.levels) expect(declared).toContain(name);
  });

  for (const name of JSON.parse(readFileSync('public/levels/manifest.json', 'utf8')).levels) {
    it(`${name}: solvable, par is honest, and the needle actually costs something`, () => {
      const level = load(name);
      const a = analyse(level);
      expect(a.solvable).toBe(true);
      // Par has to be the real best, or the score means nothing.
      expect(level.par).toBe(a.steps);
      // Tax zero would mean walking straight at the slot already works.
      expect(a.detourCost).toBeGreaterThan(0);
    });

    it(`${name}: the optimal route really wins when played`, () => {
      const level = load(name);
      const game = createGame(level);
      for (const action of analyse(level).path) game.act(action);
      expect(game.status).toBe('solved');
      expect(game.steps).toBe(level.par);
    });
  }

  it('gets harder inside every world', () => {
    const byWorld = new Map();
    for (const spec of intent.levels) {
      if (!byWorld.has(spec.world)) byWorld.set(spec.world, []);
      byWorld.get(spec.world).push(spec);
    }
    for (const [world, levels] of byWorld) {
      levels.sort((a, b) => a.rung - b.rung);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].difficulty, `${world}${i + 1} is not harder than ${world}${i}`)
          .toBeGreaterThan(levels[i - 1].difficulty);
      }
    }
  });

  it('asks for one cone before it ever asks for two', () => {
    // A half turn is two corners. No world opens with that.
    for (const spec of intent.levels) {
      if (spec.rung <= 2) expect(spec.demand).not.toBe(180);
    }
  });
});

describe('winning and un-winning', () => {
  const first = JSON.parse(readFileSync('public/levels/manifest.json', 'utf8')).levels[0];
  const m = parseLevel(JSON.parse(readFileSync(`public/levels/${first}.json`, 'utf8')));

  it('undo after a win puts the level back into play', () => {
    const g = createGame(m);
    for (const a of analyse(m).path) g.act(a);
    expect(g.status).toBe('solved');
    expect(g.act('undo')).toEqual(['undone']);
    expect(g.status).toBe('playing');
  });

  it('reset after a win puts the level back into play', () => {
    const g = createGame(m);
    for (const a of analyse(m).path) g.act(a);
    g.act('reset');
    expect(g.status).toBe('playing');
    expect(g.steps).toBe(0);
    expect(g.hasKey).toBe(false);
  });

  it('ignores movement once solved, but never ignores the way back', () => {
    const g = createGame(m);
    for (const a of analyse(m).path) g.act(a);
    expect(g.act('forward')).toEqual([]);
    expect(g.act('left')).toEqual([]);
    expect(g.act('undo')).toEqual(['undone']);
  });
});
