// Existence proofs for the design matrix: which rotation demands are
// constructible on a 4x4 cube, and whether a gate really makes them handed.
import { parseLevel } from '../src/game/level.js';
import { analyse, needleOnShortestRoutes } from '../src/game/solve.js';
import { createGame } from '../src/game/game.js';
import { dir, dirName } from '../src/core/dirs.js';
import { signedAngle } from '../src/core/player.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);

const mk = (tiles, budget = 40, spawn = { face: '+Y', u: 1, v: 0, forward: '+Z' }) =>
  parseLevel({ id: 'probe', shape: 'cube', gridN: 4, budget, spawn, tiles });

// --- 1. how much rotation can a level actually demand? --------------------
const buckets = new Map();
for (let ku = 0; ku < 4; ku++) for (let kv = 0; kv < 4; kv++)
  for (const kn of tangents('+Y'))
    for (const sf of FACES) for (let su = 0; su < 4; su++) for (let sv = 0; sv < 4; sv++) {
      if (sf === '+Y' && su === ku && sv === kv) continue;
      for (const sn of tangents(sf)) {
        let level;
        try {
          level = mk([
            { face: '+Y', u: ku, v: kv, type: 'key', needle: kn },
            { face: sf, u: su, v: sv, type: 'slot', needle: sn },
          ]);
        } catch { continue; }
        const a = analyse(level);
        if (!a.solvable) continue;
        const fast = needleOnShortestRoutes(level);
        const arriving = [...fast.arrivals.keys()];
        if (!arriving.length) continue;
        const rot = signedAngle(dir(arriving[0]), dir(sn), dir(sf));
        const b = buckets.get(rot) ?? { n: 0, minDetour: Infinity, maxDetour: 0 };
        b.n++;
        b.minDetour = Math.min(b.minDetour, a.detourCost);
        b.maxDetour = Math.max(b.maxDetour, a.detourCost);
        buckets.set(rot, b);
      }
    }

console.log('=== what a level can demand of the needle (no gates) ===');
[...buckets.entries()].sort((a, b) => a[0] - b[0]).forEach(([rot, b]) => {
  console.log(
    `  ${String(rot).padStart(4)}deg  ${String(b.n).padStart(5)} levels   `
    + `extra steps over just arriving: ${b.minDetour} to ${b.maxDetour}`
  );
});
console.log('\n  note: there is no "+270". Asking for 270 is asking for -90.');
console.log('  Handedness is the only thing separating them, and nothing');
console.log('  on an open cube distinguishes the two. That is the gate\'s job.\n');
