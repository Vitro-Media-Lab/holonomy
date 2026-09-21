// Authoring aid: brute-force candidate levels and report which ones make the
// needle actually cost something, and by how much rotation. Not shipped.
import { parseLevel } from '../src/game/level.js';
import { analyse, needleOnShortestRoutes } from '../src/game/solve.js';
import { dir, dirName } from '../src/core/dirs.js';
import { signedAngle } from '../src/core/player.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);

const results = [];

for (let ku = 0; ku < 4; ku++) {
  for (let kv = 0; kv < 4; kv++) {
    for (const kn of tangents('+Y')) {
      for (const sf of FACES) {
        for (let su = 0; su < 4; su++) {
          for (let sv = 0; sv < 4; sv++) {
            if (sf === '+Y' && su === ku && sv === kv) continue;
            for (const sn of tangents(sf)) {
              const json = {
                id: 'probe', shape: 'cube', gridN: 4, budget: 40,
                spawn: { face: '+Y', u: 1, v: 1, forward: '+Z' },
                tiles: [
                  { face: '+Y', u: ku, v: kv, type: 'key', needle: kn },
                  { face: sf, u: su, v: sv, type: 'slot', needle: sn },
                ],
              };
              let level;
              try { level = parseLevel(json); } catch { continue; }
              const a = analyse(level);
              if (!a.solvable || a.detourCost <= 0) continue;

              const fast = needleOnShortestRoutes(level);
              const arriving = [...fast.arrivals.keys()];
              // How far round the fastest arrival is from what the slot wants.
              const turns = arriving.map((n) =>
                Math.abs(signedAngle(dir(n), dir(sn), dir(sf))));
              results.push({
                json, steps: a.steps, detour: a.detourCost, reach: a.shortestToSlot,
                rotation: Math.min(...turns), arriving,
              });
            }
          }
        }
      }
    }
  }
}

const ninety = results.filter((r) => r.rotation === 90);
console.log(`candidates: ${results.length} total, ${ninety.length} needing exactly 90 degrees\n`);
console.log('--- best 90-degree levels (cheap to reach, real cost to solve) ---');
ninety
  .sort((x, y) => (y.detour - x.detour) || (x.steps - y.steps) || (x.reach - y.reach))
  .slice(0, 10)
  .forEach((r) => {
    const k = r.json.tiles[0], s = r.json.tiles[1];
    console.log(
      `key +Y(${k.u},${k.v}) needle ${k.needle} -> slot ${s.face}(${s.u},${s.v}) wants ${s.needle}`.padEnd(62),
      `reach ${String(r.reach).padStart(2)}  solve ${String(r.steps).padStart(2)}  detour +${r.detour}  fastest arrives ${r.arriving.join('/')}`
    );
  });
