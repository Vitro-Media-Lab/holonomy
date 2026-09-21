// Search for levels matching the teaching intent declared in the matrix.
import { parseLevel } from '../src/game/level.js';
import { createGame } from '../src/game/game.js';
import { analyse, routeFamilies, needleOnShortestRoutes } from '../src/game/solve.js';
import { signedAngle } from '../src/core/player.js';
import { dir } from '../src/core/dirs.js';

const FACES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
const tangents = (f) => FACES.filter((d) => dir(d).dot(dir(f)) === 0);
const SPAWN = { face: '+Y', u: 1, v: 0, forward: '+Z' };
const KEY = { face: '+Y', u: 1, v: 1, type: 'key', needle: '+X' };

function probe(slotFace, su, sv, sn, budget, walls = []) {
  const json = {
    id: 'probe', shape: 'cube', gridN: 4, budget, spawn: SPAWN,
    tiles: [KEY, { face: slotFace, u: su, v: sv, type: 'slot', needle: sn }, ...walls],
  };
  let level; try { level = parseLevel(json); } catch { return null; }
  const a = analyse(level);
  if (!a.solvable) return null;
  // What the level actually demands of the needle, which is the thing the
  // matrix pins per level. Searching without checking it picked a 180.
  const fast = needleOnShortestRoutes(level);
  const arriving = [...fast.arrivals.keys()];
  const slot = level.all().find((t) => t.type === 'slot');
  const demand = arriving.length
    ? signedAngle(dir(arriving[0]), slot.needle, slot.faceN) : null;
  return { json, a, level, demand };
}

/**
 * With zero slack, a level only keeps its "no recovery" promise if the
 * optimal route does not itself pass through the slot on the way. Otherwise
 * the naive dash at the goal is the start of the winning line after all.
 */
function noRecovery(level, path) {
  const g = createGame(level);
  for (const act of path.slice(0, -1)) {
    g.act(act);
    if (g.tile?.type === 'slot') return false;
  }
  return true;
}

// --- L2: two ways round, the short one unfixable -------------------------
console.log('=== L2 candidates: slot on +Z, budget == optimal, no slack ===');
const l2 = [];
for (const sf of ['+Z', '+X', '-Z'])
for (let su = 0; su < 4; su++) for (let sv = 0; sv < 4; sv++)
  for (const sn of tangents(sf)) {
    const loose = probe(sf, su, sv, sn, 40);
    if (!loose) continue;
    const { a } = loose;
    if (a.detourCost < 3 || a.steps < 8 || a.steps > 14) continue;
    if (Math.abs(loose.demand) !== 90) continue;
    // Re-price with no slack at all: this is what makes it unrecoverable.
    const tight = probe(sf, su, sv, sn, a.steps);
    if (!tight) continue;
    if (!noRecovery(tight.level, tight.a.path)) continue;
    const fams = routeFamilies(tight.level);
    const opt = Math.min(...fams.values());
    const tied = [...fams.values()].filter((c) => c === opt).length;
    if (fams.size < 2) continue;
    l2.push({ sf, su, sv, sn, steps: a.steps, reach: a.shortestToSlot, tax: a.detourCost, fams: fams.size, tied, demand: loose.demand });
  }
l2.sort((x, y) => (x.tied - y.tied) || (y.tax - x.tax) || (x.steps - y.steps));
l2.slice(0, 6).forEach((r) =>
  console.log(`  slot ${r.sf}(${r.su},${r.sv}) wants ${r.sn}  reach ${r.reach}  solve ${r.steps}  tax +${r.tax}  demands ${r.demand}  families ${r.fams}, ${r.tied} tied`));

// --- L3: three different ways, all correct -------------------------------
console.log('\n=== L3 candidates: slot on -Y, three routes tied at the optimum ===');
const l3 = [];
for (let su = 0; su < 4; su++) for (let sv = 0; sv < 4; sv++)
  for (const sn of tangents('-Y')) {
    const loose = probe('-Y', su, sv, sn, 30);
    if (!loose) continue;
    const { a } = loose;
    const tight = probe('-Y', su, sv, sn, a.steps);
    const fams = routeFamilies(tight.level);
    const opt = Math.min(...fams.values());
    const tied = [...fams.entries()].filter(([, c]) => c === opt);
    if (tied.length < 3) continue;
    if (Math.abs(loose.demand) !== 90) continue;
    l3.push({ su, sv, sn, steps: a.steps, tax: a.detourCost, tied: tied.map(([f]) => f) });
  }
l3.sort((x, y) => (y.tied.length - x.tied.length) || (y.tax - x.tax));
l3.slice(0, 6).forEach((r) =>
  console.log(`  slot -Y(${r.su},${r.sv}) wants ${r.sn}  solve ${r.steps}  tax +${r.tax}  ${r.tied.length} tied routes via ${r.tied.join(', ')}`));
