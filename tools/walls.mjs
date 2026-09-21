// How sparingly can walls be used before the rest of the design has any grip?
// Greedily add the wall that most separates the two handednesses, and see how
// many it takes before +90 and -90 stop costing the same.
import { parseLevel } from '../src/game/level.js';
import { analyse } from '../src/game/solve.js';
import { dir } from '../src/core/dirs.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const BUDGET = 16;
const SPAWN = { face: '+Y', u: 1, v: 0, forward: '+Z' };
const FIXED = [
  { face: '+Y', u: 1, v: 1, type: 'key', needle: '+X' },
];
const SLOT = { face: '+Y', u: 1, v: 2, type: 'slot' };

const build = (wants, walls) => parseLevel({
  id: 'probe', shape: 'cube', gridN: 4, budget: BUDGET, spawn: SPAWN,
  tiles: [...FIXED, { ...SLOT, needle: wants }, ...walls],
});
const cost = (lv) => { const a = analyse(lv); return a.solvable ? a.steps : Infinity; };
const score = (walls) => {
  let a, b;
  try { a = cost(build('-Z', walls)); b = cost(build('+Z', walls)); } catch { return null; }
  if (a === Infinity && b === Infinity) return null;
  return { a, b, split: a === Infinity || b === Infinity ? 99 : Math.abs(a - b) };
};

const taken = new Set(['+Y|1|0', '+Y|1|1', '+Y|1|2']);
const walls = [];
console.log(`budget ${BUDGET}. key +Y(1,1) needle +X, slot +Y(1,2).\n`);
console.log('walls   cost wanting -Z   cost wanting +Z   split');

let s = score(walls);
console.log(`  ${String(walls.length).padStart(2)}    ${String(s.a).padStart(9)}        ${String(s.b).padStart(9)}        ${s.split}`);

for (let round = 0; round < 10 && s.split === 0; round++) {
  let best = null;
  for (const face of FACES) {
    for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
      const k = `${face}|${u}|${v}`;
      if (taken.has(k)) continue;
      const trial = [...walls, { face, u, v, type: 'wall' }];
      const sc = score(trial);
      if (!sc) continue;
      // Prefer a real split; otherwise prefer whatever raises the cheaper cost.
      const rank = sc.split * 1000 + Math.min(sc.a === Infinity ? 99 : sc.a, sc.b === Infinity ? 99 : sc.b);
      if (!best || rank > best.rank) best = { rank, k, wall: { face, u, v, type: 'wall' }, sc };
    }
  }
  if (!best) break;
  walls.push(best.wall);
  taken.add(best.k);
  s = best.sc;
  console.log(
    `  ${String(walls.length).padStart(2)}    ${String(s.a).padStart(9)}        ${String(s.b).padStart(9)}        ${s.split === 99 ? 'total' : s.split}`
    + `   <- wall ${best.wall.face}(${best.wall.u},${best.wall.v})`
  );
}
