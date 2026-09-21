// Finds a playable level on any solid, using the same measurements the cube
// levels were chosen by. Solid-agnostic, because the engine is.
import { writeFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { analyse, needleOnShortestRoutes, routeFamilies, quartersBetween } from '../src/game/solve.js';
import { buildSurface } from '../src/core/surface.js';

const asDegrees = (q) => (q === 3 ? -90 : q * 90);

function search({ id, solid, subdivide, wantTax = 3, maxSolve = 16 }) {
  const surface = buildSurface(solid, subdivide);
  const spawn = { tile: 0, side: 0 };
  const keyTile = surface.step(spawn).tile;

  let best = null;
  for (let slot = 0; slot < surface.size; slot++) {
    if (slot === keyTile || slot === spawn.tile) continue;
    for (let needle = 0; needle < 4; needle++) {
      const json = {
        id, surface: { solid, subdivide }, budget: 40, spawn,
        tiles: [
          { tile: keyTile, type: 'key', needle: 0 },
          { tile: slot, type: 'slot', needle },
        ],
      };
      let level;
      try { level = parseLevel(json); } catch { continue; }
      const a = analyse(level);
      if (!a.solvable || a.detourCost < wantTax || a.steps > maxSolve) continue;

      const fast = needleOnShortestRoutes(level);
      const arriving = [...fast.arrivals.keys()];
      if (!arriving.length) continue;
      const demand = asDegrees(quartersBetween(arriving[0], needle));
      if (Math.abs(demand) !== 90) continue;

      json.budget = a.steps + 1;
      const tight = parseLevel(json);
      const fams = routeFamilies(tight);
      const opt = Math.min(...fams.values());
      const tied = [...fams.values()].filter((c) => c === opt).length;

      const score = a.detourCost * 10 - a.steps;
      if (!best || score > best.score) {
        best = { json, score, steps: a.steps, reach: a.shortestToSlot, tax: a.detourCost, demand, tied, tiles: surface.size };
      }
    }
  }
  return best;
}

const jobs = [
  { id: 'S1', solid: 'octahedron', subdivide: 2, file: 'public/levels/s1.json' },
  { id: 'S2', solid: 'dodecahedron', subdivide: 1, file: 'public/levels/s2.json' },
  { id: 'S3', solid: 'lblock', subdivide: 1, file: 'public/levels/s3.json' },
];

for (const job of jobs) {
  const found = search(job);
  if (!found) { console.log(`${job.solid}: nothing found`); continue; }
  writeFileSync(job.file, JSON.stringify(found.json, null, 2) + '\n');
  console.log(
    `${job.solid.padEnd(13)} ${String(found.tiles).padStart(3)} tiles  ->  ${job.file}`
    + `   reach ${found.reach}  solve ${found.steps}  tax +${found.tax}`
    + `  demands ${found.demand}  routes ${found.tied}`
  );
}
