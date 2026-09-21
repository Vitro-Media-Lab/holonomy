// Finds levels worth competing over: ones where the lazy answer is much
// worse than the best. Without that gap a par is decoration, because you
// hit it by blundering.
import { writeFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { analyse, costFrom, naiveArrival, routeFamilies } from '../src/game/solve.js';
import { buildSurface } from '../src/core/surface.js';

const CAP = 30;

function search(solid, subdivide, id, file) {
  const surface = buildSurface(solid, subdivide);
  const spawn = { tile: 0, side: 0 };
  const keyTile = surface.step(spawn).tile;
  let best = null;

  for (let slot = 0; slot < surface.size; slot++) {
    if (slot === keyTile || slot === spawn.tile) continue;
    for (let sn = 0; sn < 4; sn++) {
      const json = {
        id, surface: { solid, subdivide }, spawn,
        tiles: [
          { tile: keyTile, type: 'key', needle: 0 },
          { tile: slot, type: 'slot', needle: sn },
        ],
      };
      let lv;
      try { lv = parseLevel(json); } catch { continue; }
      const a = analyse(lv);
      if (!a.solvable || a.detourCost <= 0 || a.steps > CAP - 6) continue;

      const arrival = naiveArrival(lv, CAP);
      if (!arrival) continue;
      const lazy = arrival.steps + costFrom(lv, arrival.state, CAP);
      if (!isFinite(lazy)) continue;

      const gap = lazy - a.steps;
      const score = gap * 100 - a.steps;
      if (!best || score > best.score) {
        const fams = routeFamilies(lv);
        const opt = Math.min(...fams.values());
        best = {
          json, score, gap, par: a.steps, lazy, reach: a.shortestToSlot,
          tax: a.detourCost,
          tied: [...fams.values()].filter((c) => c === opt).length,
        };
      }
    }
  }

  if (!best) { console.log(`${solid}: nothing found`); return; }
  best.json.par = best.par;
  writeFileSync(file, JSON.stringify(
    { id: best.json.id, surface: best.json.surface, par: best.par,
      spawn: best.json.spawn, tiles: best.json.tiles }, null, 2) + '\n');
  console.log(
    `${id}  ${solid.padEnd(13)} -> ${file}`
    + `   reach ${best.reach}  par ${best.par}  lazy ${best.lazy}`
    + `  GAP +${best.gap}  tax +${best.tax}  routes ${best.tied}`
  );
}

search('cube', 2, 'O1', 'public/levels/o1.json');
search('lblock', 1, 'O2', 'public/levels/o2.json');
search('dodecahedron', 1, 'O3', 'public/levels/o3.json');
