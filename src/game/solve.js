import { canTurn, canStep, needleAfterArriving } from './rules.js';

/**
 * Exhaustive search over the whole game state, used for authoring rather than
 * play. Turning is free, so this is a 0-1 BFS: turns go on the front of the
 * deque, steps on the back. That makes "shortest" mean shortest in steps,
 * which is the only cost the game charges.
 *
 * It knows nothing about the solid, so a dodecahedron audits exactly the way
 * a cube does.
 */
const encode = (s) => `${s.tile}|${s.side}|${s.hasKey ? 1 : 0}|${s.needle ?? '-'}`;

function initial(level) {
  return arrive(level, { ...level.spawn, hasKey: false, needle: null });
}

/** Applies whatever the tile under the player does on arrival. */
function arrive(level, s) {
  const t = level.at(s.tile);
  if (t?.type === 'key' && !s.hasKey) {
    return { ...s, hasKey: true, needle: t.needle };
  }
  const flipped = needleAfterArriving(level, s, s.needle);
  return flipped === s.needle ? s : { ...s, needle: flipped };
}

const isSolved = (level, s) => {
  const t = level.at(s.tile);
  return !!(t?.type === 'slot' && s.hasKey && s.needle === t.needle);
};

/** Reached the slot carrying the key, whichever way the needle points. */
const atSlotWithKey = (level, s) => level.at(s.tile)?.type === 'slot' && s.hasKey;

function successors(level, s) {
  const out = [];
  const surface = level.surface;

  if (canTurn(level, s)) {
    out.push({ cost: 0, action: 'left', state: { ...s, side: surface.turnLeft(s).side } });
    out.push({ cost: 0, action: 'right', state: { ...s, side: surface.turnRight(s).side } });
  }

  const stepped = surface.step(s);
  if (stepped && canStep(level, s, stepped)) {
    const needle = s.needle === null
      ? null
      : surface.transport(s.needle, stepped.exit, stepped.entry);
    out.push({
      cost: 1,
      action: 'forward',
      state: arrive(level, { tile: stepped.tile, side: stepped.side, hasKey: s.hasKey, needle }),
    });
  }
  return out;
}

/**
 * Searches the level once and reports everything an author needs: whether it
 * is solvable, in how many steps, and - the number that decides whether a
 * level teaches anything - how many steps it takes to reach the slot with the
 * key while ignoring the needle entirely.
 */
export function analyse(level) {
  const start = initial(level);
  const dist = new Map([[encode(start), 0]]);
  const via = new Map([[encode(start), null]]);
  const deque = [start];

  let best = null;
  let bestIgnoringNeedle = null;

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(encode(s));
    if (d > level.budget) continue;

    if (best === null && isSolved(level, s)) best = { steps: d, path: trace(via, s) };
    if (bestIgnoringNeedle === null && atSlotWithKey(level, s)) bestIgnoringNeedle = d;

    for (const { cost, action, state } of successors(level, s)) {
      const k = encode(state);
      const nd = d + cost;
      if (nd > level.budget) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      via.set(k, { prev: s, action });
      if (cost === 0) deque.unshift(state); else deque.push(state);
    }
  }

  return {
    solvable: best !== null,
    steps: best?.steps ?? null,
    path: best?.path ?? null,
    // The cost of arriving correctly, minus the cost of merely arriving.
    // If this is zero, the orientation gate is doing no work at all.
    detourCost: best && bestIgnoringNeedle !== null ? best.steps - bestIgnoringNeedle : null,
    shortestToSlot: bestIgnoringNeedle,
    statesExplored: dist.size,
  };
}

function trace(via, end) {
  const actions = [];
  let cur = end;
  for (let guard = 0; guard < 10000; guard++) {
    const step = via.get(encode(cur));
    if (!step) break;
    actions.push(step.action);
    cur = step.prev;
  }
  return actions.reverse();
}

/**
 * How the needle would land if the player simply walked to the slot the
 * cheapest way. The gap between that and what the slot wants is the level.
 */
export function needleOnShortestRoutes(level) {
  const start = initial(level);
  const dist = new Map([[encode(start), 0]]);
  const deque = [start];
  const arrivals = new Map();
  let shortest = Infinity;

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(encode(s));
    if (d > level.budget || d > shortest) continue;

    if (atSlotWithKey(level, s)) {
      shortest = Math.min(shortest, d);
      if (d === shortest) arrivals.set(s.needle, Math.min(arrivals.get(s.needle) ?? Infinity, d));
    }

    for (const { cost, state } of successors(level, s)) {
      const k = encode(state);
      const nd = d + cost;
      if (nd > level.budget) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      if (cost === 0) deque.unshift(state); else deque.push(state);
    }
  }
  return { shortest, arrivals };
}

/**
 * How many genuinely different routes reach the optimum, grouped by the first
 * face of the original solid the route leaves the spawn face for. Going round
 * the left side and going round the right side are two routes in any sense a
 * player cares about, and this is what tells an author whether a level has
 * one answer or four.
 */
export function routeFamilies(level) {
  const start = { ...initial(level), exit: null };
  const key = (s) => `${encode(s)}|${s.exit ?? '-'}`;

  const dist = new Map([[key(start), 0]]);
  const deque = [start];
  const best = new Map();

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(key(s));
    if (d > level.budget) continue;

    if (isSolved(level, s) && s.exit !== null) {
      if (!best.has(s.exit) || best.get(s.exit) > d) best.set(s.exit, d);
    }

    const spawnFace = level.surface.faceOf(level.spawn.tile);
    for (const { cost, state } of successors(level, s)) {
      const face = level.surface.faceOf(state.tile);
      const exit = s.exit ?? (face === spawnFace ? null : face);
      const next = { ...state, exit };
      const k = key(next);
      const nd = d + cost;
      if (nd > level.budget) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      if (cost === 0) deque.unshift(next); else deque.push(next);
    }
  }
  return best;
}

/** The needle direction `from` becomes after turning `quarters` to the left. */
export const turnedBy = (from, quarters) => (((from + quarters) % 4) + 4) % 4;

/** How far round, in quarter turns, b is from a. */
export const quartersBetween = (a, b) => (((b - a) % 4) + 4) % 4;

/**
 * Cheapest number of steps from an arbitrary state to a solved one. Used to
 * price what a player actually does when they guess: walk at the slot, get
 * refused, then go and find the rotation they are missing.
 */
export function costFrom(level, start, cap = 60) {
  const dist = new Map([[encode(start), 0]]);
  const deque = [start];

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(encode(s));
    if (d > cap) continue;
    if (isSolved(level, s)) return d;

    for (const { cost, state } of successors(level, s)) {
      const k = encode(state);
      const nd = d + cost;
      if (nd > cap) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      if (cost === 0) deque.unshift(state); else deque.push(state);
    }
  }
  return Infinity;
}

/** The state a player is in after dashing at the slot the cheapest way. */
export function naiveArrival(level, cap = 60) {
  const start = initial(level);
  const dist = new Map([[encode(start), 0]]);
  const deque = [start];

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(encode(s));
    if (d > cap) continue;
    if (atSlotWithKey(level, s)) return { state: s, steps: d };

    for (const { cost, state } of successors(level, s)) {
      const k = encode(state);
      const nd = d + cost;
      if (nd > cap) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      if (cost === 0) deque.unshift(state); else deque.push(state);
    }
  }
  return null;
}

/**
 * One sweep of the whole reachable state space from the spawn.
 *
 * Where the SLOT sits does not affect how the player may move - it only
 * decides which states count as won - so a single sweep prices every possible
 * slot placement at once. That turns level searching from one search per
 * candidate into one search per starting arrangement.
 *
 * @returns withKey: tile -> (needle -> fewest steps to stand there holding it)
 */
export function survey(level, cap = 40) {
  const start = initial(level);
  const dist = new Map([[encode(start), 0]]);
  const deque = [start];
  const withKey = new Map();

  while (deque.length) {
    const s = deque.shift();
    const d = dist.get(encode(s));
    if (d > cap) continue;

    if (s.hasKey && s.needle !== null) {
      if (!withKey.has(s.tile)) withKey.set(s.tile, new Map());
      const byNeedle = withKey.get(s.tile);
      if (!byNeedle.has(s.needle) || byNeedle.get(s.needle) > d) byNeedle.set(s.needle, d);
    }

    for (const { cost, state } of successors(level, s)) {
      const k = encode(state);
      const nd = d + cost;
      if (nd > cap) continue;
      if (dist.has(k) && dist.get(k) <= nd) continue;
      dist.set(k, nd);
      if (cost === 0) deque.unshift(state); else deque.push(state);
    }
  }
  return withKey;
}
