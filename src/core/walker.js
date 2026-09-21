import { Vector3 } from 'three';

/**
 * The player, as a dart: which tile they stand on and which of its four sides
 * they face. Turning is arithmetic on the side index; walking hands the dart
 * to the surface and takes back whatever comes out.
 *
 * Nothing here knows what solid it is on. That is the point.
 */

export const normalizeDeg = (d) => {
  const x = ((d % 360) + 360) % 360;
  return x > 180 ? x - 360 : x === 0 ? 0 : x;
};

export function makeDart(tile, side) {
  return { tile, side };
}

export class Walker {
  constructor(surface, spawn) {
    this.surface = surface;
    this.reset(spawn);
  }

  reset(spawn) {
    this.spawn = { ...spawn };
    this.dart = { ...spawn };
    this.needle = null;
    this.turnSum = 0;
    this.reference = buildReference(this.surface, spawn);
  }

  get tile() { return this.dart.tile; }
  get side() { return this.dart.side; }
  get normal() { return this.surface.tile(this.dart.tile).normal; }
  get centre() { return this.surface.tile(this.dart.tile).centre; }

  /** World-space heading, for drawing and for nothing else. */
  heading() {
    return this.surface.sideDirection(this.dart.tile, this.dart.side);
  }

  /** World-space needle, or null when empty-handed. */
  needleDirection() {
    if (this.needle === null) return null;
    return this.surface.sideDirection(this.dart.tile, this.needle);
  }

  /**
   * Take up a carried direction. From here on the surface owns which way it
   * points: it is carried across every edge and is untouched by turning,
   * because turning is a fact about the player and not about the ground.
   */
  carry(side) {
    this.needle = side;
  }

  drop() {
    this.needle = null;
  }

  turnLeft() {
    this.dart = this.surface.turnLeft(this.dart);
    this.turnSum = normalizeDeg(this.turnSum + 90);
  }

  turnRight() {
    this.dart = this.surface.turnRight(this.dart);
    this.turnSum = normalizeDeg(this.turnSum - 90);
  }

  /**
   * Walk one tile. `blocked` may refuse the destination, in which case
   * nothing moves at all. Every step crosses an edge between two tiles, so
   * the needle is carried on every step; on a flat stretch that carrying just
   * happens to change nothing.
   */
  step(blocked) {
    const out = this.surface.step(this.dart);
    if (!out) return null;
    if (blocked && blocked(out)) return null;
    if (this.needle !== null) {
      this.needle = this.surface.transport(this.needle, out.exit, out.entry);
    }
    this.dart = { tile: out.tile, side: out.side };
    return out;
  }

  snapshot() {
    return { dart: { ...this.dart }, needle: this.needle, turnSum: this.turnSum };
  }

  restore(snap) {
    this.dart = { ...snap.dart };
    this.needle = snap.needle;
    this.turnSum = snap.turnSum;
  }

  /**
   * Net rotation handed to the player by the surface since spawn, in degrees.
   * Zero for any route that encloses no curvature; one quarter turn per
   * cone the route wraps, whichever way the solid bends there.
   */
  holonomy() {
    const ref = this.reference[this.dart.tile];
    const turned = (((this.dart.side - ref) % 4) + 4) % 4;
    return normalizeDeg(turned * 90 - this.turnSum);
  }
}

/**
 * A reference heading on every tile, carried out from the spawn along a
 * breadth-first tree. An arbitrary but stable choice of "no rotation yet"
 * everywhere, which is what makes a live holonomy reading possible before
 * the player has closed their loop.
 */
function buildReference(surface, spawn) {
  const ref = new Array(surface.size).fill(null);
  ref[spawn.tile] = spawn.side;

  const queue = [spawn.tile];
  while (queue.length) {
    const tile = queue.shift();
    for (let side = 0; side < 4; side++) {
      const out = surface.step({ tile, side });
      if (!out || ref[out.tile] !== null) continue;
      ref[out.tile] = surface.transport(ref[tile], out.exit, out.entry);
      queue.push(out.tile);
    }
  }
  return ref;
}

/** Signed angle from a to b about n, in degrees. Rendering and tests only. */
export function signedAngle(a, b, n) {
  const sin = new Vector3().crossVectors(a, b).dot(n);
  return normalizeDeg((Math.atan2(sin, a.dot(b)) * 180) / Math.PI);
}
