import { Vector3 } from 'three';
import { buildSurface } from '../core/surface.js';
import { dir, DIR_NAMES } from '../core/dirs.js';

export const TILE_TYPES = ['floor', 'wall', 'key', 'slot', 'gate', 'mirror'];

/**
 * A level is a surface plus a handful of marked tiles.
 *
 * Tiles are named by index, which is stable for a given solid and
 * subdivision, and directions by side index 0-3. Both also accept the
 * human forms - a world point for a tile, an axis name or vector for a
 * direction - so a cube level stays readable by hand while an editor on a
 * dodecahedron can emit plain numbers.
 */
export function parseLevel(json) {
  const spec = json.surface ?? { solid: 'cube', subdivide: 2 };
  const surface = buildSurface(spec.solid ?? spec, spec.subdivide ?? 2);
  const problems = [];

  const resolveTile = (t, where) => {
    if (Number.isInteger(t?.tile)) {
      if (t.tile < 0 || t.tile >= surface.size) {
        problems.push(`${where}: tile ${t.tile} is not on this surface`);
        return 0;
      }
      return t.tile;
    }
    if (Array.isArray(t?.at)) return surface.nearestTile(new Vector3(...t.at));
    problems.push(`${where}: needs a tile index or an "at" point`);
    return 0;
  };

  const resolveSide = (value, tile, where) => {
    if (Number.isInteger(value)) {
      if (value < 0 || value > 3) problems.push(`${where}: side ${value} is not 0-3`);
      return ((value % 4) + 4) % 4;
    }
    if (typeof value === 'string' && DIR_NAMES.includes(value)) {
      return surface.nearestSide(tile, dir(value));
    }
    if (Array.isArray(value)) {
      return surface.nearestSide(tile, new Vector3(...value).normalize());
    }
    problems.push(`${where}: needs a side 0-3, an axis name, or a vector`);
    return 0;
  };

  const spawnTile = resolveTile(json.spawn, 'spawn');
  const spawn = {
    tile: spawnTile,
    side: resolveSide(json.spawn?.side ?? json.spawn?.forward, spawnTile, 'spawn'),
  };

  const marks = new Map();
  for (const t of json.tiles ?? []) {
    const where = `tile ${t.tile ?? JSON.stringify(t.at)}`;
    if (!TILE_TYPES.includes(t.type)) problems.push(`${where}: unknown type ${t.type}`);
    const id = resolveTile(t, where);
    const entry = { ...t, tile: id };

    if (t.type === 'key' || t.type === 'slot') {
      entry.needle = resolveSide(t.needle, id, `${where} needle`);
    }
    if (t.type === 'gate') {
      entry.direction = resolveSide(t.direction, id, `${where} gate direction`);
    }
    if (t.type === 'mirror') {
      entry.axis = resolveSide(t.axis, id, `${where} mirror axis`);
    }
    if (marks.has(id)) problems.push(`${where}: two marks on the same tile`);
    marks.set(id, entry);
  }

  const count = (type) => [...marks.values()].filter((t) => t.type === type).length;
  if (count('key') !== 1) problems.push(`expected exactly one key, found ${count('key')}`);
  if (count('slot') !== 1) problems.push(`expected exactly one slot, found ${count('slot')}`);
  if (marks.get(spawn.tile)?.type === 'wall') problems.push('spawn is inside a wall');

  if (problems.length) {
    throw new Error(`level ${json.id} is not playable:\n  - ${problems.join('\n  - ')}`);
  }

  return {
    id: json.id,
    surface,
    solid: spec.solid ?? spec,
    subdivide: spec.subdivide ?? 2,
    // par is what a level is worth beating; limit is a wall, and most
    // levels should not have one. A wall makes failure the feedback; par
    // makes insight the feedback, and lets two players compare answers.
    par: json.par ?? json.budget ?? null,
    limit: json.limit ?? Infinity,
    get budget() { return this.limit; },
    spawn,
    marks,
    at(tile) { return marks.get(tile) ?? null; },
    isWall(tile) { return marks.get(tile)?.type === 'wall'; },
    all() { return [...marks.values()]; },
  };
}

/** Back to JSON, for the editor's dump. Indices, so it reloads identically. */
export function serializeLevel(level) {
  return {
    id: level.id,
    surface: { solid: level.solid, subdivide: level.subdivide },
    par: level.par ?? undefined,
    limit: level.limit === Infinity ? undefined : level.limit,
    spawn: { tile: level.spawn.tile, side: level.spawn.side },
    tiles: level.all()
      .filter((t) => t.type !== 'floor')
      .map((t) => ({
        tile: t.tile,
        type: t.type,
        ...(t.needle !== undefined ? { needle: t.needle } : {}),
        ...(t.direction !== undefined ? { direction: t.direction } : {}),
        ...(t.axis !== undefined ? { axis: t.axis } : {}),
      })),
  };
}
