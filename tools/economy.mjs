// Two design questions, priced.
import { readFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { analyse, costFrom, naiveArrival } from '../src/game/solve.js';
import { buildSurface } from '../src/core/surface.js';

const surface = buildSurface('cube', 2);
const build = (spawn, keyTile, keyNeedle, slotTile, slotNeedle, budget = 40) => parseLevel({
  id: 'probe', surface: { solid: 'cube', subdivide: 2 }, budget, spawn,
  tiles: [
    { tile: keyTile, type: 'key', needle: keyNeedle },
    { tile: slotTile, type: 'slot', needle: slotNeedle },
  ],
});

// --- 1. Is the walk from spawn to key part of the puzzle, or just distance?
// The needle does not exist until the key is picked up, so nothing that
// happens before that can touch it. If the tax is the same wherever the
// player starts, the first leg is carrying no puzzle at all.
console.log('=== 1. does WHERE THE PLAYER STARTS change the puzzle? ===');
console.log('    key and slot fixed; only the spawn moves\n');
console.log('  spawn   solve   reach   orientation tax');

const KEY = 26, SLOT = 60;
const taxes = new Set();
for (const tile of [25, 0, 12, 40, 70, 90]) {
  const a = analyse(build({ tile, side: 0 }, KEY, 1, SLOT, 1));
  if (!a.solvable) continue;
  taxes.add(a.detourCost);
  console.log(
    `  ${String(tile).padStart(5)}   ${String(a.steps).padStart(5)}`
    + `   ${String(a.shortestToSlot).padStart(5)}   ${String(a.detourCost).padStart(10)}`
  );
}
console.log(taxes.size === 1
  ? `\n  tax is ${[...taxes][0]} from every start: the first leg is pure distance.`
  : `\n  tax varies (${[...taxes].join(', ')}): the first leg does carry something.`);

// --- 2. How much better is playing well than blundering?
console.log('\n=== 2. is there anything to compete over? ===');
console.log('    lazy = dash at the slot, get refused, then go and fix it\n');
console.log('  level  best  lazy   gap');
for (const n of ['l1', 'l2', 'l3', 's1', 's2', 's3']) {
  const raw = JSON.parse(readFileSync(`public/levels/${n}.json`, 'utf8'));
  raw.budget = 60;
  const lv = parseLevel(raw);
  const best = analyse(lv).steps;
  const arrival = naiveArrival(lv);
  const lazy = arrival ? arrival.steps + costFrom(lv, arrival.state) : Infinity;
  console.log(`  ${raw.id.padEnd(5)}  ${String(best).padStart(4)}  ${String(lazy).padStart(4)}  ${String(lazy - best).padStart(4)}`);
}

// --- 3. Can levels be built where being clever actually pays?
console.log('\n=== 3. hunting for levels where cleverness beats blundering ===\n');
const spawn = { tile: 25, side: 1 };
let found = [];
for (let slot = 0; slot < surface.size; slot += 1) {
  if (slot === KEY || slot === spawn.tile) continue;
  for (let sn = 0; sn < 4; sn++) {
    let lv;
    try { lv = build(spawn, KEY, 1, slot, sn, 34); } catch { continue; }
    const a = analyse(lv);
    if (!a.solvable || a.detourCost <= 0) continue;
    const arrival = naiveArrival(lv, 34);
    if (!arrival) continue;
    const lazy = arrival.steps + costFrom(lv, arrival.state, 34);
    if (!isFinite(lazy)) continue;
    found.push({ slot, sn, best: a.steps, lazy, gap: lazy - a.steps, reach: a.shortestToSlot });
  }
}
found.sort((a, b) => b.gap - a.gap || a.best - b.best);
console.log(`  ${found.length} playable placements measured`);
const histogram = new Map();
for (const f of found) histogram.set(f.gap, (histogram.get(f.gap) ?? 0) + 1);
console.log('  gap between lazy and best:');
for (const [gap, n] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`    ${String(gap).padStart(2)} steps : ${String(n).padStart(4)} placements ${'#'.repeat(Math.ceil(n / 8))}`);
}
console.log('\n  deepest found:');
found.slice(0, 5).forEach((f) => console.log(
  `    slot ${String(f.slot).padStart(2)} needle ${f.sn}`
  + `   reach ${f.reach}  best ${f.best}  lazy ${f.lazy}  gap +${f.gap}`
));
