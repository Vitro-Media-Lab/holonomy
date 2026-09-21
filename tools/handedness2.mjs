// For a fixed key, price every possible demand the slot could make.
// If the two 90-degree demands ever differ in price, handedness is designable.
import { parseLevel } from '../src/game/level.js';
import { analyse } from '../src/game/solve.js';
import { dir, dirName } from '../src/core/dirs.js';
import { signedAngle } from '../src/core/player.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);
const BUDGET = 18;

const build = (slot) => parseLevel({
  id: 'p', shape: 'cube', gridN: 4, budget: BUDGET,
  spawn: { face: '+Y', u: 1, v: 0, forward: '+Z' },
  tiles: [{ face: '+Y', u: 1, v: 1, type: 'key', needle: '+X' }, slot],
});
const cost = (lv) => { const a = analyse(lv); return a.solvable ? a.steps : Infinity; };

let asymmetric = 0, total = 0;
const examples = [];

for (const face of FACES) {
  for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) {
    if (face === '+Y' && u === 1 && v <= 1) continue;
    const priced = tangents(face).map((n) => ({
      needle: n,
      cost: cost(build({ face, u, v, type: 'slot', needle: n })),
    }));
    // Reference: whichever needle is cheapest to deliver here.
    const cheapest = priced.reduce((a, b) => (b.cost < a.cost ? b : a));
    const plus = priced.find((p) => signedAngle(dir(cheapest.needle), dir(p.needle), dir(face)) === 90);
    const minus = priced.find((p) => signedAngle(dir(cheapest.needle), dir(p.needle), dir(face)) === -90);
    if (!plus || !minus) continue;
    total++;
    if (plus.cost !== minus.cost) {
      asymmetric++;
      if (examples.length < 8) {
        examples.push(`  slot ${face}(${u},${v}): +90 costs ${plus.cost}, -90 costs ${minus.cost}`
          + `  (baseline ${cheapest.cost} for ${cheapest.needle})`);
      }
    }
  }
}

console.log(`slots examined: ${total}`);
console.log(`slots where the two handednesses cost DIFFERENT amounts: ${asymmetric}`);
console.log(`  = ${(100 * asymmetric / total).toFixed(1)}% of placements\n`);
examples.forEach((e) => console.log(e));
