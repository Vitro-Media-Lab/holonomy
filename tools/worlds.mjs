// Builds the curriculum: five levels per solid, escalating.
//
// Difficulty is made of measured things, not guesses:
//   tax     extra steps the needle costs over merely arriving
//   demand  a quarter turn (one cone) or a half turn (two)
//   gap     how much worse the lazy answer is than the best one
//   par     how long the best answer is
//
// Crucially the ladder is calibrated PER WORLD. The same units mean different
// things on different solids: a dodecahedron tops out around a tax of 4
// because its cones sit close together and rotation is cheap, while an
// octahedron reaches 10. A fixed band would make one world impossible and the
// next trivial, so each world is spread across its own achievable range.
import { writeFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import {
  analyse, survey, costFrom, naiveArrival, routeFamilies, quartersBetween,
} from '../src/game/solve.js';
import { buildSurface } from '../src/core/surface.js';

const asDegrees = (q) => (q === 3 ? -90 : q * 90);

/** One number for how hard a level is, from things that were measured. */
const difficulty = (c) =>
  c.tax * 2 + (c.demand === 180 ? 4 : 0) + c.gap * 1.5 + c.par * 0.4;

const WORLDS = [
  { key: 'C', solids: new Array(5).fill('cube'), subdivide: 2 },
  { key: 'T', solids: new Array(5).fill('tetrahedron'), subdivide: 2 },
  { key: 'O', solids: new Array(5).fill('octahedron'), subdivide: 2 },
  { key: 'D', solids: new Array(5).fill('dodecahedron'), subdivide: 1 },
  // Complex shapes last. Ordered by MEASURED difficulty, not by how gnarled
  // they look: `plus`, whose vertices are worth a whole half turn each, tops
  // out easier than `stairs`, because curvature that dense makes rotation
  // cheap to pick up. The wildest-looking solid is the forgiving one, so it
  // goes in the middle where the shape can be shown off without a spike.
  { key: 'P', solids: ['lblock', 'lblock', 'plus', 'stairs', 'stairs'], subdivide: 1 },
];

/** Rung 1 and 2 ask for one cone. From rung 3 a level may ask for two. */
const ALLOWS_HALF_TURN = [false, false, true, true, true];

function spawnSpread(surface, wanted = 6) {
  const seen = new Set();
  const out = [];
  for (const tile of surface.tiles) {
    if (seen.has(tile.face)) continue;
    seen.add(tile.face);
    out.push(tile.id);
    if (out.length >= wanted) break;
  }
  return out;
}

/** Every playable arrangement on a solid, priced with the cheap metrics. */
function candidates(solid, subdivide) {
  const surface = buildSurface(solid, subdivide);
  const found = [];

  for (const spawnTile of spawnSpread(surface)) {
    const spawn = { tile: spawnTile, side: 0 };
    const keyTile = surface.step(spawn).tile;
    if (keyTile === spawnTile) continue;

    for (let keyNeedle = 0; keyNeedle < 4; keyNeedle++) {
      const make = (slotTile, slotNeedle) => ({
        id: 'probe', surface: { solid, subdivide }, spawn,
        tiles: [
          { tile: keyTile, type: 'key', needle: keyNeedle },
          { tile: slotTile, type: 'slot', needle: slotNeedle },
        ],
      });

      // The slot never changes how the player may move, so one sweep prices
      // every slot on the solid at once.
      let sweep;
      try { sweep = survey(parseLevel(make(keyTile === 0 ? 1 : 0, 0))); } catch { continue; }

      for (const [slotTile, byNeedle] of sweep) {
        if (slotTile === keyTile || slotTile === spawnTile) continue;
        const reach = Math.min(...byNeedle.values());
        const cheapest = [...byNeedle.entries()].find(([, v]) => v === reach)[0];

        for (const [slotNeedle, par] of byNeedle) {
          const tax = par - reach;
          if (tax === 0 || par < 4) continue;
          found.push({
            solid, subdivide, spawn, keyTile, slotTile, slotNeedle,
            par, reach, tax,
            demand: asDegrees(quartersBetween(cheapest, slotNeedle)),
            json: make(slotTile, slotNeedle),
          });
        }
      }
    }
  }
  return found;
}

/** Spread a sample evenly over the (demand, tax) space rather than by luck. */
function stratify(pool, wanted) {
  const buckets = new Map();
  for (const c of pool) {
    const k = `${c.demand}|${c.tax}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  }
  const perBucket = Math.max(2, Math.ceil(wanted / buckets.size));
  const out = [];
  for (const list of buckets.values()) {
    const stride = Math.max(1, Math.floor(list.length / perBucket));
    for (let i = 0; i < list.length && out.length < wanted * 2; i += stride) out.push(list[i]);
  }
  return out;
}

/** The expensive measurements, run only on the stratified sample. */
function deepen(candidate) {
  try {
    const level = parseLevel(candidate.json);
    const a = analyse(level);
    if (!a.solvable || a.steps !== candidate.par) return null;
    const arrival = naiveArrival(level, 34);
    if (!arrival) return null;
    const lazy = arrival.steps + costFrom(level, arrival.state, 34);
    if (!isFinite(lazy)) return null;
    const fams = routeFamilies(level);
    const opt = Math.min(...fams.values());
    return {
      ...candidate,
      gap: lazy - a.steps,
      lazy,
      routes: [...fams.values()].filter((v) => v === opt).length,
    };
  } catch { return null; }
}

function buildWorld(world) {
  const pools = new Map();
  const measured = new Map();

  for (const solid of new Set(world.solids)) {
    const pool = candidates(solid, world.subdivide);
    pools.set(solid, pool);
    // A solid used for only one rung has to carry that rung on its own, so
    // it gets looked at harder.
    const rungs = world.solids.filter((s) => s === solid).length;
    const sample = stratify(pool, rungs === 1 ? 340 : 190);
    const deep = [];
    for (const c of sample) {
      const full = deepen(c);
      if (full) deep.push(full);
    }
    deep.sort((a, b) => difficulty(a) - difficulty(b));
    measured.set(solid, deep);
  }

  const chosen = [];
  const usedSlot = new Set();
  const usedSpawn = new Set();

  for (let rung = 0; rung < 5; rung++) {
    const solid = world.solids[rung];
    const deep = measured.get(solid);
    if (!deep?.length) { console.log(`  ${world.key}${rung + 1}  nothing measured`); continue; }

    const eligible = deep.filter((c) =>
      (ALLOWS_HALF_TURN[rung] || c.demand !== 180)
      && !usedSlot.has(`${solid}|${c.slotTile}`)
      && difficulty(c) > (chosen.at(-1) ? difficulty(chosen.at(-1)) : -Infinity));

    // The hardest arrangements on a solid are rare, and a stratified sample
    // can walk straight past them. When it does, go back to the full pool and
    // deepen the most promising ones by their cheap score alone.
    if (!eligible.length) {
      const floor = chosen.at(-1) ? difficulty(chosen.at(-1)) : -Infinity;
      const hunt = pools.get(solid)
        .filter((c) => (ALLOWS_HALF_TURN[rung] || c.demand !== 180)
          && !usedSlot.has(`${solid}|${c.slotTile}`))
        .sort((a, b) => difficulty({ ...b, gap: 0 }) - difficulty({ ...a, gap: 0 }))
        .slice(0, 900);
      for (const c of hunt) {
        const full = deepen(c);
        if (full && difficulty(full) > floor) { eligible.push(full); break; }
      }
    }

    if (!eligible.length) { console.log(`  ${world.key}${rung + 1}  no candidate harder than the last`); continue; }

    // Walk up this world's own difficulty range, not some fixed scale.
    const want = [0.1, 0.32, 0.55, 0.78, 0.97][rung];
    const target = eligible[Math.min(eligible.length - 1, Math.floor(want * eligible.length))];

    // Among near-equals prefer a fresh starting point, so a world does not
    // play as five variations on one walk. The last two rungs also want real
    // optimisation depth: a finale where blundering ties par is a weak one.
    const near = eligible.filter((c) => Math.abs(difficulty(c) - difficulty(target)) <= 2);
    const fresh = near.filter((c) => !usedSpawn.has(c.spawn.tile));
    const shortlist = fresh.length ? fresh : near;
    const best = rung >= 3
      ? shortlist.reduce((a, b) => (b.gap > a.gap ? b : a), shortlist[0]) ?? target
      : shortlist[0] ?? target;

    usedSlot.add(`${solid}|${best.slotTile}`);
    usedSpawn.add(best.spawn.tile);
    chosen.push({ id: `${world.key}${rung + 1}`, rung, ...best });

    console.log(
      `  ${`${world.key}${rung + 1}`.padEnd(3)} ${solid.padEnd(13)}`
      + ` reach ${String(best.reach).padStart(2)}  par ${String(best.par).padStart(2)}`
      + `  tax +${String(best.tax).padStart(2)}  demands ${String(best.demand).padStart(4)}`
      + `  gap +${String(best.gap).padStart(2)}`
      + `  difficulty ${difficulty(best).toFixed(1).padStart(5)}`
    );
  }
  return chosen;
}

const manifest = [];
const intent = [];

for (const world of WORLDS) {
  console.log(`\n=== ${world.key}: ${[...new Set(world.solids)].join(' / ')} ===`);
  for (const level of buildWorld(world)) {
    const file = `public/levels/${level.id.toLowerCase()}.json`;
    writeFileSync(file, JSON.stringify({
      id: level.id,
      surface: level.json.surface,
      par: level.par,
      spawn: level.spawn,
      tiles: level.json.tiles,
    }, null, 2) + '\n');
    manifest.push(level.id.toLowerCase());
    intent.push({
      id: level.id,
      world: world.key,
      rung: level.rung + 1,
      solid: level.solid,
      demand: level.demand === 180 ? 180 : [90, -90],
      tax: [Math.max(1, level.tax - 1), level.tax + 1],
      gap: [Math.max(0, level.gap - 2), level.gap + 2],
      difficulty: Number(difficulty(level).toFixed(1)),
      element: null,
    });
  }
}

writeFileSync('public/levels/manifest.json',
  JSON.stringify({ block: 'worlds', levels: manifest }, null, 2) + '\n');
writeFileSync('design/progression.json',
  JSON.stringify({ block: 'worlds', levels: intent }, null, 2) + '\n');

console.log(`\n${manifest.length} levels written`);
