/**
 * Legality, in one place. The game and the solver both import these, because
 * a level pipeline is only trustworthy if the thing that verifies a level and
 * the thing that plays it cannot disagree about what is legal.
 *
 * Everything here is arithmetic on a side index 0-3, so it holds on any solid.
 */

/** A gate holds your heading: you may not turn while standing on one. */
export function canTurn(level, dart) {
  return level.at(dart.tile)?.type !== 'gate';
}

/**
 * A gate is a one-way passage. You enter it going its way and you leave it
 * going its way, so a route through a gate can never be walked backwards.
 */
export function canStep(level, from, to) {
  const target = level.at(to.tile);
  if (target?.type === 'wall') return false;

  const here = level.at(from.tile);
  if (here?.type === 'gate' && from.side !== here.direction) return false;
  if (target?.type === 'gate' && to.side !== target.direction) return false;

  return true;
}

/**
 * A mirror flips the needle across its own axis. It is not a rotation: it
 * reverses sense. A solid made only of convex corners can hand out rotation
 * freely but has no way at all to hand out a SIGN, and this is what supplies
 * one. Reflecting, turning a corner, then reflecting back gives the inverse
 * turn - which also means order matters, as nothing else here does.
 *
 * Across four directions the reflection is just (2a - d).
 */
export function reflect(needle, axis) {
  return (((2 * axis - needle) % 4) + 4) % 4;
}

/** What the tile you just arrived on does to the needle you are carrying. */
export function needleAfterArriving(level, dart, needle) {
  const t = level.at(dart.tile);
  if (t?.type === 'mirror' && needle !== null) return reflect(needle, t.axis);
  return needle;
}
