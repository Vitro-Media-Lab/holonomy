// Does a single gate make a corner handed? Build the same level twice, once
// wanting +90 and once wanting -90, then try every gate placement and look
// for one that splits their cost.
import { parseLevel } from '../src/game/level.js';
import { analyse } from '../src/game/solve.js';
import { dir } from '../src/core/dirs.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);

const KEY = { face: '+Y', u: 1, v: 1, needle: '+X' };
const SLOT = { face: '+Y', u: 1, v: 2 };
const SPAWN = { face: '+Y', u: 1, v: 0, forward: '+Z' };

// On +Y, +X rotated +90 about the face normal is -Z; rotated -90 is +Z.
const BUDGET = Number(process.argv[2] ?? 26);
const build = (wants, gate) => parseLevel({
  id: 'probe', shape: 'cube', gridN: 4, budget: BUDGET, spawn: SPAWN,
  tiles: [
    { face: KEY.face, u: KEY.u, v: KEY.v, type: 'key', needle: KEY.needle },
    { face: SLOT.face, u: SLOT.u, v: SLOT.v, type: 'slot', needle: wants },
    ...(gate ? [gate] : []),
  ],
});

const cost = (level) => { const a = analyse(level); return a.solvable ? a.steps : Infinity; };

const baseCW = cost(build('-Z'));
const baseCCW = cost(build('+Z'));
console.log(`=== no gate (budget ${BUDGET}) ===`);
console.log(`  slot wants -Z (one way round):    ${baseCW} steps`);
console.log(`  slot wants +Z (the other way):    ${baseCCW} steps`);
console.log(`  difference: ${Math.abs(baseCW - baseCCW)}  <- the cube cannot tell them apart\n`);

let best = null;
for (const face of FACES) {
  for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
    if (face === KEY.face && ((u === KEY.u && v === KEY.v) || (u === SLOT.u && v === SLOT.v)
      || (u === SPAWN.u && v === SPAWN.v))) continue;
    for (const d of tangents(face)) {
      const gate = { face, u, v, type: 'gate', direction: d };
      let a, b;
      try { a = cost(build('-Z', gate)); b = cost(build('+Z', gate)); } catch { continue; }
      if (!isFinite(a) && !isFinite(b)) continue;
      const split = Math.abs(a - b);
      if (!best || split > best.split || (split === best.split && Math.min(a, b) < best.min)) {
        best = { gate, a, b, split, min: Math.min(a, b) };
      }
    }
  }
}

console.log('=== best single gate ===');
console.log(`  gate on ${best.gate.face} (${best.gate.u},${best.gate.v}) pointing ${best.gate.direction}`);
console.log(`  slot wants -Z:  ${best.a === Infinity ? 'UNSOLVABLE' : best.a + ' steps'}`);
console.log(`  slot wants +Z:  ${best.b === Infinity ? 'UNSOLVABLE' : best.b + ' steps'}`);
console.log(`  the gate splits the two handednesses by ${best.split === Infinity ? 'everything' : best.split + ' steps'}`);
