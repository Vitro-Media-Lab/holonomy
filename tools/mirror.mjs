// Does one mirror do what no gate could: make the two handednesses cost
// different amounts, and make ORDER matter?
import { parseLevel } from '../src/game/level.js';
import { analyse } from '../src/game/solve.js';
import { dir, dirName } from '../src/core/dirs.js';
import { reflect } from '../src/game/rules.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);
const BUDGET = Number(process.argv[2] ?? 14);

const SPAWN = { face: '+Y', u: 1, v: 0, forward: '+Z' };
const build = (wants, extra) => parseLevel({
  id: 'probe', shape: 'cube', gridN: 4, budget: BUDGET, spawn: SPAWN,
  tiles: [
    { face: '+Y', u: 1, v: 1, type: 'key', needle: '+X' },
    { face: '+Y', u: 1, v: 2, type: 'slot', needle: wants },
    ...(extra ? [extra] : []),
  ],
});
const cost = (lv) => { const a = analyse(lv); return a.solvable ? a.steps : Infinity; };
const show = (x) => (x === Infinity ? 'unsolvable' : `${x} steps`);

console.log(`=== budget ${BUDGET}, no mirror ===`);
console.log(`  wants -Z: ${show(cost(build('-Z')))}      wants +Z: ${show(cost(build('+Z')))}`);

let best = null;
for (const face of FACES) {
  for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
    if (face === '+Y' && u === 1 && v <= 2) continue;
    for (const ax of tangents(face)) {
      const m = { face, u, v, type: 'mirror', axis: ax };
      let a, b;
      try { a = cost(build('-Z', m)); b = cost(build('+Z', m)); } catch { continue; }
      if (a === Infinity && b === Infinity) continue;
      const split = a === Infinity || b === Infinity ? Infinity : Math.abs(a - b);
      if (!best || split > best.split) best = { m, a, b, split };
    }
  }
}
console.log(`\n=== best single mirror ===`);
console.log(`  mirror on ${best.m.face} (${best.m.u},${best.m.v}) axis ${best.m.axis}`);
console.log(`  wants -Z: ${show(best.a)}      wants +Z: ${show(best.b)}`);
console.log(`  split: ${best.split === Infinity ? 'total' : best.split + ' steps'}`);

console.log('\n=== does order matter? (needle +X, mirror axis +X, corner = +90 about +Y) ===');
const n = dir('+X');
const axis = dir('+X');
const rot90 = (v) => dir(dirName(v) === '+X' ? '-Z' : dirName(v) === '-Z' ? '-X' : dirName(v) === '-X' ? '+Z' : '+X');
console.log(`  mirror then corner: ${dirName(rot90(reflect(n, axis)))}`);
console.log(`  corner then mirror: ${dirName(reflect(rot90(n), axis))}`);
