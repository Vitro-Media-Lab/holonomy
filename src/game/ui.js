/**
 * Everything the player is shown.
 *
 * The rule the whole design rests on is that the levels teach through their
 * construction: no hints, no tutorial, no arrows pointing the way. Nothing
 * here says anything about a puzzle. It says which level you are on, what it
 * has cost you so far, what it is worth, and which keys exist. A refusal gets
 * a pulse and no explanation, exactly as the brief asks.
 */

const CONTROLS = [
  ['W', 'step'], ['A D', 'turn'], ['Z', 'undo'], ['R', 'restart'],
  ['N P', 'level'], ['C', 'view'], ['M', 'sound'],
];

export function createUI(levelCount, parent = document.body) {
  const root = document.createElement('div');
  root.className = 'ui';
  root.innerHTML = `
    <div class="ui-progress"><span class="ui-level" id="u-level"></span><span class="ui-dots" id="u-dots"></span></div>
    <div class="ui-score">
      <div class="ui-steps"><b id="u-steps">0</b><u id="u-par"></u></div>
      <div class="ui-best" id="u-best"></div>
    </div>
    <div class="ui-keys" id="u-keys">${CONTROLS
      .map(([k, what]) => `<span><kbd>${k.split(' ').join('</kbd><kbd>')}</kbd>${what}</span>`)
      .join('')}</div>
    <div class="ui-result" id="u-result"><b id="u-result-steps"></b><i id="u-result-note"></i></div>
  `;
  parent.appendChild(root);

  const el = {
    level: root.querySelector('#u-level'),
    dots: root.querySelector('#u-dots'),
    steps: root.querySelector('#u-steps'),
    par: root.querySelector('#u-par'),
    best: root.querySelector('#u-best'),
    keys: root.querySelector('#u-keys'),
    result: root.querySelector('#u-result'),
    resultSteps: root.querySelector('#u-result-steps'),
    resultNote: root.querySelector('#u-result-note'),
  };

  el.dots.innerHTML = Array.from({ length: levelCount }, () => '<i></i>').join('');
  const dots = [...el.dots.querySelectorAll('i')];

  // Per-player convenience only. Private windows and blocked site data both
  // throw, and the game has to carry on regardless.
  const bestKey = (id) => `surface-walker:best:${id}`;
  const readBest = (id) => {
    try {
      const v = Number(localStorage.getItem(bestKey(id)));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch { return null; }
  };
  const writeBest = (id, value) => {
    try { localStorage.setItem(bestKey(id), String(value)); } catch { /* fine */ }
  };

  let moves = 0;
  let recorded = null;
  let beatBest = false;

  return {
    /** Fades the key list once the player has clearly got the hang of it. */
    noteInput() {
      moves++;
      if (moves === 12) el.keys.dataset.faded = 'yes';
    },

    /** A one-shot flourish for something that just happened. */
    flash(kind) {
      root.dataset.flash = kind;
      clearTimeout(root._flashTimer);
      root._flashTimer = setTimeout(() => { root.dataset.flash = ''; }, 420);
    },

    update(game, index) {
      const id = game.level.id;
      const par = game.level.par;
      const solved = game.status === 'solved';

      if (!solved) { recorded = null; beatBest = false; }
      if (solved && recorded !== id) {
        recorded = id;
        const previous = readBest(id);
        beatBest = previous === null || game.steps < previous;
        if (beatBest) writeBest(id, game.steps);
      }

      el.level.textContent = id;
      dots.forEach((d, i) => { d.dataset.on = i === index ? 'now' : i < index ? 'done' : ''; });

      el.steps.textContent = String(game.steps);
      el.par.textContent = par === null ? '' : `/${par}`;
      const mark = readBest(id);
      el.best.textContent = mark === null ? '' : `best ${mark}`;

      const overPar = par !== null && game.steps > par;
      root.dataset.state = solved
        ? (overPar ? 'over' : 'par')
        : game.remaining <= 0 && game.level.limit !== Infinity ? 'stuck' : 'playing';

      // The result sits up while the level holds, so a score is never missed.
      el.result.dataset.show = solved ? 'yes' : '';
      if (solved) {
        el.resultSteps.textContent = par === null ? `${game.steps}` : `${game.steps} / ${par}`;
        el.resultNote.textContent = beatBest ? 'best' : overPar ? `par ${par}` : 'par';
        el.resultNote.dataset.kind = beatBest ? 'best' : overPar ? 'over' : 'par';
      }
    },
  };
}
