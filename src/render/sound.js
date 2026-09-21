/**
 * Tiny synthesised feedback. No files, no licences, nothing to credit.
 *
 * The brief calls for a refusal to be "a pulse, a sound" and to never explain
 * itself, so these say only THAT something happened, never what was wrong.
 */

const VOICES = {
  // A footfall: barely there, so a long route does not become a drum solo.
  step: { freq: 180, to: 150, time: 0.05, gain: 0.035, type: 'sine' },
  // Picking the key up: two notes going up. Something gained.
  pickup: { freq: 520, to: 780, time: 0.12, gain: 0.07, type: 'triangle' },
  // Refused: low, short, flat. Not a buzzer, not a punishment.
  rejected: { freq: 170, to: 110, time: 0.18, gain: 0.09, type: 'sine' },
  // Nothing there to walk into.
  blocked: { freq: 90, to: 80, time: 0.06, gain: 0.05, type: 'sine' },
  // The mirror turning what you carry.
  mirrored: { freq: 660, to: 440, time: 0.14, gain: 0.05, type: 'triangle' },
  // Opened.
  solved: { freq: 523, to: 1046, time: 0.5, gain: 0.09, type: 'triangle' },
  undone: { freq: 300, to: 220, time: 0.07, gain: 0.04, type: 'sine' },
};

export function createSound() {
  let ctx = null;
  let muted = read();

  function read() {
    try { return localStorage.getItem('surface-walker:muted') === '1'; } catch { return false; }
  }
  function persist() {
    try { localStorage.setItem('surface-walker:muted', muted ? '1' : '0'); } catch { /* fine */ }
  }

  /** Browsers refuse audio until the player has actually pressed something. */
  function wake() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function play(name) {
    const voice = VOICES[name];
    if (!voice || muted) return;
    const audio = wake();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume().catch(() => {});

    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = voice.type;
    osc.frequency.setValueAtTime(voice.freq, now);
    osc.frequency.exponentialRampToValueAtTime(voice.to, now + voice.time);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(voice.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.time);

    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + voice.time + 0.02);
  }

  return {
    play,
    get muted() { return muted; },
    toggle() { muted = !muted; persist(); if (!muted) play('pickup'); return muted; },
  };
}
