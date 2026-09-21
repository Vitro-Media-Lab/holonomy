// Tank controls. Turning is an explicit act because orientation is the state
// the whole game is about, and because screen directions invert on the far
// side of the solid, where a screen-relative input would be a lie.
const BINDINGS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyC: 'camera',
  KeyM: 'mute',
  KeyN: 'next',
  KeyP: 'prev',
  KeyZ: 'undo',
  KeyR: 'reset',
  Backquote: 'hud',
  KeyT: 'trail',
};

export function createInput(target = window) {
  const queue = [];

  target.addEventListener('keydown', (e) => {
    const action = BINDINGS[e.code];
    if (!action) return;
    e.preventDefault();
    // OS key-repeat is not a deliberate input. Real presses are never dropped:
    // they queue up and play out in order once the step animation lands.
    if (e.repeat) return;
    queue.push(action);
  });

  return {
    take: () => queue.shift() ?? null,
    clear: () => { queue.length = 0; },
    get pending() { return queue.length; },
  };
}
