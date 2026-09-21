/**
 * Touch controls, which are the tank controls by another name.
 *
 * The temptation on a touchscreen is to let a swipe mean "go that way on
 * screen". That would break the game: which way is screen-left depends on
 * where you are on the solid, and the whole point is that your heading is a
 * thing you own and change deliberately. So every gesture here is
 * body-relative, like steering rather than dragging:
 *
 *   tap, or swipe up    step forward
 *   swipe left / right  turn ninety degrees
 *   swipe down          undo
 */

export const TAP_MAX_DISTANCE = 18;   // px: a finger never lands perfectly still
export const TAP_MAX_TIME = 450;      // ms: longer than this is a rest, not a tap
export const SWIPE_MIN_DISTANCE = 26; // px: below this the direction is noise

/**
 * What a finger movement means. Pure, so it can be tested without a browser.
 * Screen y grows downwards, so a negative dy is an upward swipe.
 *
 * @returns an action name, or null for a gesture too small to trust
 */
export function classify(dx, dy, dt) {
  const distance = Math.hypot(dx, dy);

  if (distance < TAP_MAX_DISTANCE) {
    return dt <= TAP_MAX_TIME ? 'forward' : null;
  }
  // Between a tap and a swipe is a smudge. Guessing there gets it wrong in
  // the worst way: a step that costs par when the player meant to turn.
  if (distance < SWIPE_MIN_DISTANCE) return null;

  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'forward' : 'undo';
}

/** Wires gestures on an element to the same actions the keyboard emits. */
export function createTouch(target, onAction, onFirstTouch) {
  let start = null;
  let announced = false;

  const begin = (event) => {
    // A second finger means a pinch or a stray palm, not a move.
    if (event.touches.length !== 1) { start = null; return; }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, time: performance.now() };
    if (!announced) { announced = true; onFirstTouch?.(); }
  };

  const end = (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const action = classify(
      touch.clientX - start.x,
      touch.clientY - start.y,
      performance.now() - start.time
    );
    start = null;
    if (action) onAction(action);
  };

  const cancel = () => { start = null; };

  target.addEventListener('touchstart', begin, { passive: true });
  target.addEventListener('touchend', end, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });

  return () => {
    target.removeEventListener('touchstart', begin);
    target.removeEventListener('touchend', end);
    target.removeEventListener('touchcancel', cancel);
  };
}
