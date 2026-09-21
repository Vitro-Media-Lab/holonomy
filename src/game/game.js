import { Walker } from '../core/walker.js';
import { canTurn, canStep, needleAfterArriving } from './rules.js';

/**
 * The rules, with no rendering in them so they can be solved and tested
 * headlessly, on any solid.
 *
 * Two of them carry the whole design:
 *  - turning is free, walking costs a step. Turning is a fact about the
 *    player; only the ground can turn the needle.
 *  - the slot reads the needle, never the heading. The heading is whatever
 *    you last pressed; the needle is the one thing only the route can set.
 */
export function createGame(level) {
  const walker = new Walker(level.surface, level.spawn);
  const history = [];

  let hasKey = false;
  let steps = 0;
  let status = 'playing';

  const tile = () => level.at(walker.tile);

  const snapshot = () => ({ walker: walker.snapshot(), hasKey, steps, status });

  function restore(s) {
    walker.restore(s.walker);
    hasKey = s.hasKey;
    steps = s.steps;
    status = s.status;
  }

  function reset() {
    walker.reset(level.spawn);
    hasKey = false;
    steps = 0;
    status = 'playing';
    history.length = 0;
  }

  /** Called after every arrival. Returns the events the arrival produced. */
  function arrive() {
    const events = [];
    const t = tile();
    if (!t) return events;

    if (t.type === 'key' && !hasKey) {
      hasKey = true;
      walker.carry(t.needle);
      events.push('picked-up');
    }

    const flipped = needleAfterArriving(level, walker.dart, walker.needle);
    if (walker.needle !== null && flipped !== walker.needle) {
      walker.carry(flipped);
      events.push('mirrored');
    }

    if (t.type === 'slot' && hasKey) {
      if (walker.needle === t.needle) {
        status = 'solved';
        events.push('solved');
      } else {
        // Never explained, never punished. You are simply not let in.
        events.push('rejected');
      }
    }
    return events;
  }

  function act(action) {
    if (action === 'reset') { reset(); return ['reset']; }
    if (action === 'undo') {
      if (!history.length) return [];
      restore(history.pop());
      return ['undone'];
    }
    if (status === 'solved') return [];

    if (action === 'left' || action === 'right') {
      if (!canTurn(level, walker.dart)) return ['blocked'];
      history.push(snapshot());
      if (action === 'left') walker.turnLeft(); else walker.turnRight();
      return ['turned'];
    }

    if (action === 'forward') {
      if (steps >= level.limit) return ['exhausted'];
      const before = snapshot();
      const from = walker.dart;
      const moved = walker.step((next) => !canStep(level, from, next));
      if (!moved) return ['blocked'];
      history.push(before);
      steps++;
      return ['moved', ...arrive()];
    }

    return [];
  }

  reset();

  return {
    level,
    walker,
    act,
    get hasKey() { return hasKey; },
    get steps() { return steps; },
    get remaining() { return level.limit - steps; },
    /** Steps over par, or under it. Negative is a better answer than par. */
    get overPar() { return level.par === null ? null : steps - level.par; },
    get status() { return status; },
    get tile() { return tile(); },
    get canUndo() { return history.length > 0; },
  };
}
