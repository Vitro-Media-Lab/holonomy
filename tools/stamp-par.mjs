// Stamps each level with its par (the best possible) and its optimisation
// depth (how much worse the lazy answer is). Par is what a player competes
// against; the gap is whether competing is worth anything at all.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { analyse, costFrom, naiveArrival } from '../src/game/solve.js';

const KEEP_WALL = new Set(['L2']);   // its lesson is "no recovery"

for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (!raw.spawn || !Array.isArray(raw.tiles)) continue;

  // Measure with no wall in the way, so par is the true best.
  const open = parseLevel({ ...raw, budget: undefined, limit: undefined, par: undefined });
  const a = analyse(open);
  if (!a.solvable) { console.log(`${raw.id}: NOT SOLVABLE`); continue; }

  const arrival = naiveArrival(open);
  const lazy = arrival ? arrival.steps + costFrom(open, arrival.state) : Infinity;

  const next = { ...raw };
  delete next.budget;
  next.par = a.steps;
  if (KEEP_WALL.has(raw.id)) next.limit = a.steps;
  else delete next.limit;

  // Keep the keys in a readable order.
  const ordered = {
    id: next.id, surface: next.surface, par: next.par,
    ...(next.limit !== undefined ? { limit: next.limit } : {}),
    spawn: next.spawn, tiles: next.tiles,
  };
  writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');

  console.log(
    `${raw.id.padEnd(3)} par ${String(a.steps).padStart(2)}`
    + `  lazy ${String(lazy).padStart(2)}  gap +${lazy - a.steps}`
    + `  tax +${a.detourCost}`
    + (KEEP_WALL.has(raw.id) ? '   [wall kept]' : '')
  );
}
