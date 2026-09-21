// Checks a built level against the design intent declared for it, so a level
// cannot silently drift away from the lesson it exists to teach.
//   node tools/audit.mjs public/levels/*.json
import { readFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { createGame } from '../src/game/game.js';
import {
  analyse, needleOnShortestRoutes, routeFamilies, turnedBy, quartersBetween,
  costFrom, naiveArrival,
} from '../src/game/solve.js';

const intent = JSON.parse(readFileSync(new URL('../design/progression.json', import.meta.url)));
const byId = new Map(intent.levels.map((l) => [l.id, l]));

/** Quarter turns as a signed angle: 3 quarters left is 90 degrees right. */
const asDegrees = (quarters) => (quarters === 3 ? -90 : quarters * 90);

let failures = 0;

for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  // Globbing the levels directory also catches the manifest. Not a level,
  // not a failure.
  if (!raw.spawn || !Array.isArray(raw.tiles)) {
    console.log(`
${file}  skipped (not a level)`);
    continue;
  }
  const problems = [];
  let level;
  try {
    level = parseLevel(raw);
  } catch (e) {
    console.log(`\n${file}\n  UNPLAYABLE: ${e.message}`);
    failures++;
    continue;
  }

  const spec = byId.get(level.id);
  const a = analyse(level);
  const fast = needleOnShortestRoutes(level);
  const slot = level.all().find((t) => t.type === 'slot');
  const arriving = [...fast.arrivals.keys()];
  const demand = arriving.length
    ? asDegrees(quartersBetween(arriving[0], slot.needle))
    : null;

  if (!a.solvable) problems.push('not solvable within its own budget');
  if (a.detourCost === 0) problems.push('orientation costs nothing: the gate is doing no work');

  if (spec) {
    const wanted = Array.isArray(spec.demand) ? spec.demand : [spec.demand];
    if (!wanted.includes(demand)) {
      problems.push(`demands ${demand} deg, intent allows ${wanted.join(' or ')}`);
    }
    if (a.detourCost < spec.tax[0] || a.detourCost > spec.tax[1]) {
      problems.push(`orientation tax ${a.detourCost} outside intended ${spec.tax[0]}-${spec.tax[1]}`);
    }
    const hasElement = level.all().some((t) => t.type === spec.element);
    if (spec.element && !hasElement) problems.push(`intent requires a ${spec.element}, none present`);
    if (!spec.element && level.all().some((t) => t.type === 'mirror')) {
      problems.push('mirror present before the element is introduced');
    }

    // Where handedness IS the lesson, check the level asks for the dear sign
    // rather than merely asking for some quarter turn.
    if (spec.handed === 'expensive' && demand !== null) {
      const flipped = structuredClone(raw);
      const st = flipped.tiles.find((t) => t.type === 'slot');
      st.needle = turnedBy(arriving[0], demand > 0 ? 3 : 1);
      const other = analyse(parseLevel(flipped));
      const otherCost = other.solvable ? other.steps : Infinity;
      if (!(a.steps > otherCost)) {
        problems.push(`asks for the cheap handedness (${a.steps} vs ${otherCost} the other way)`);
      }
    }
  } else {
    problems.push('no design intent declared for this id');
  }

  // Zero slack means any step off an optimal route is fatal. That is the
  // whole "no recovery" promise, so check the naive dash at the slot is not
  // itself the start of a winning route.
  const zeroSlack = a.steps === level.limit;
  let recovery = 'n/a';
  if (zeroSlack && a.path) {
    const g = createGame(level);
    let touchedEarly = false;
    for (const act of a.path.slice(0, -1)) {
      g.act(act);
      if (g.tile?.type === 'slot') touchedEarly = true;
    }
    recovery = touchedEarly ? 'RECOVERABLE' : 'none (as intended)';
    if (touchedEarly) problems.push('the naive dash at the slot is on the optimal route: recovery exists');
  }

  // Optimisation depth: how much worse is blundering than playing well?
  // Zero means par is decoration, because you hit it by accident.
  const arrival = naiveArrival(level, 40);
  const lazy = arrival ? arrival.steps + costFrom(level, arrival.state, 40) : Infinity;
  const gap = isFinite(lazy) ? lazy - a.steps : Infinity;
  if (level.par !== null && level.par !== a.steps) {
    problems.push(`par is ${level.par} but the best route is ${a.steps}`);
  }

  const fams = routeFamilies(level);
  const opt = Math.min(...fams.values());
  const tied = [...fams.entries()].filter(([, c]) => c === opt).map(([t]) => t);

  console.log(
    `\n${file}  [${level.id}]  ${problems.length ? 'FAIL' : 'ok'}`
    + `\n  ${level.solid} / subdivide ${level.subdivide} / ${level.surface.size} tiles`
    + `
  reach ${a.shortestToSlot}  par ${a.steps}  lazy ${lazy}  GAP +${gap}`
    + `  tax +${a.detourCost}  demands ${demand} deg`
    + `
  routes tied at par: ${tied.length}`
    + (level.limit === Infinity
        ? '  |  no wall'
        : `  |  wall at ${level.limit}, recovery: ${recovery}`)
  );
  problems.forEach((p) => console.log(`  - ${p}`));
  if (problems.length) failures++;
}

console.log(`\n${failures ? `${failures} level(s) failed audit` : 'all levels match their declared intent'}`);
process.exit(failures ? 1 : 0);
