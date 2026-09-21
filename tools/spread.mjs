// What does each solid actually offer? Set the ladder from this, not guesses.
import { parseLevel } from '../src/game/level.js';
import { survey, costFrom, naiveArrival, routeFamilies, analyse, quartersBetween } from '../src/game/solve.js';
import { buildSurface } from '../src/core/surface.js';

const asDegrees = (q) => (q === 3 ? -90 : q * 90);
const SOLIDS = [['cube',2],['tetrahedron',2],['octahedron',2],['dodecahedron',1],['lblock',1],['stairs',1],['plus',1]];

for (const [solid, subdivide] of SOLIDS) {
  const surface = buildSurface(solid, subdivide);
  const seenFace = new Set();
  const spawns = [];
  for (const t of surface.tiles) {
    if (seenFace.has(t.face)) continue;
    seenFace.add(t.face); spawns.push(t.id);
    if (spawns.length >= 4) break;
  }

  const all = [];
  for (const spawnTile of spawns) {
    const spawn = { tile: spawnTile, side: 0 };
    const keyTile = surface.step(spawn).tile;
    for (let keyNeedle = 0; keyNeedle < 4; keyNeedle++) {
      const make = (slotTile, slotNeedle) => ({
        id: 'p', surface: { solid, subdivide }, spawn,
        tiles: [{ tile: keyTile, type: 'key', needle: keyNeedle },
                { tile: slotTile, type: 'slot', needle: slotNeedle }],
      });
      let sweep;
      try { sweep = survey(parseLevel(make(keyTile === 0 ? 1 : 0, 0))); } catch { continue; }
      for (const [slotTile, byNeedle] of sweep) {
        if (slotTile === keyTile || slotTile === spawnTile) continue;
        const reach = Math.min(...byNeedle.values());
        const cheapest = [...byNeedle.entries()].find(([, v]) => v === reach)[0];
        for (const [slotNeedle, par] of byNeedle) {
          const tax = par - reach;
          if (tax === 0) continue;
          all.push({ par, tax, demand: asDegrees(quartersBetween(cheapest, slotNeedle)), json: make(slotTile, slotNeedle) });
        }
      }
    }
  }

  // Gap and route count are expensive; sample them.
  const sample = all.filter((_, i) => i % Math.max(1, Math.floor(all.length / 220)) === 0).slice(0, 220);
  const gaps = new Map(); const routes = new Map();
  for (const c of sample) {
    try {
      const lv = parseLevel(c.json);
      const arr = naiveArrival(lv, 34);
      if (!arr) continue;
      const lazy = arr.steps + costFrom(lv, arr.state, 34);
      if (!isFinite(lazy)) continue;
      const g = lazy - analyse(lv).steps;
      gaps.set(g, (gaps.get(g) ?? 0) + 1);
      const f = routeFamilies(lv); const o = Math.min(...f.values());
      const r = [...f.values()].filter((v) => v === o).length;
      routes.set(r, (routes.get(r) ?? 0) + 1);
    } catch { /* skip */ }
  }

  const hist = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ');
  const byDemand = new Map();
  for (const c of all) byDemand.set(c.demand, (byDemand.get(c.demand) ?? 0) + 1);
  const taxes = all.map((c) => c.tax);
  const pars = all.map((c) => c.par);

  console.log(`\n${solid} (sub ${subdivide}, ${surface.size} tiles) — ${all.length} placements`);
  console.log(`  demand   ${hist(byDemand)}`);
  console.log(`  tax      ${Math.min(...taxes)}..${Math.max(...taxes)}`);
  console.log(`  par      ${Math.min(...pars)}..${Math.max(...pars)}`);
  console.log(`  gap      ${hist(gaps)}   (sampled ${sample.length})`);
  console.log(`  routes   ${hist(routes)}`);
}
