import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classify, TAP_MAX_DISTANCE, SWIPE_MIN_DISTANCE } from '../src/game/touch.js';

const read = (p) => readFileSync(p, 'utf8');

describe('the player is never told anything about the puzzle', () => {
  // The brief is explicit: no hint system, no tutorial text, no arrows. The
  // levels teach through construction. These are source-level guards because
  // the rule is about what CAN be shown, not about any one frame.
  const ui = read('src/game/ui.js');

  // Every guard carries a sample it MUST match. Without that a typo turns the
  // whole check into a no-op that passes forever - the first version of this
  // built its patterns in a template literal, where \b is a backspace
  // character rather than a word boundary, so it matched nothing and proved
  // nothing while reporting green.
  const LEAKS = [
    ['the needle', /\.needle\b/, 'if (game.walker.needle === 2) {}'],
    ['the target', /slot\.needle|\bwants\b/, 'const w = slot.needle;'],
    ['holonomy', /\bholonomy\b/, 'const h = w.holonomy();'],
    ['accumulated turns', /\bturnSum\b/, 'const t = w.turnSum;'],
    ['the walker', /\bwalker\s*\./, 'game.walker.tile'],
  ];

  it('every guard is capable of failing', () => {
    for (const [what, pattern, sample] of LEAKS) {
      expect(pattern.test(sample), `the guard for ${what} matches nothing`).toBe(true);
    }
  });

  it('the player UI cannot read the needle, the target or the holonomy', () => {
    for (const [what, pattern] of LEAKS) {
      expect(ui, `player UI reads ${what}`).not.toMatch(pattern);
    }
  });

  it('the debug panel does read them, which is why it stays hidden', () => {
    // Also proves the guards are aimed at something that really exists.
    const hud = read('src/game/hud.js');
    expect(LEAKS.some(([, pattern]) => pattern.test(hud))).toBe(true);
    expect(hud).toMatch(/let visible = false/);
    expect(hud).toMatch(/style\.display = 'none'/);
  });

  it('shows only level, cost, par and best', () => {
    expect(ui).toMatch(/u-level/);
    expect(ui).toMatch(/u-steps/);
    expect(ui).toMatch(/u-par/);
    expect(ui).toMatch(/u-best/);
  });
});

describe('feedback says that something happened, never what was wrong', () => {
  it('a refusal has a sound and a pulse and no words', () => {
    expect(read('src/render/sound.js')).toMatch(/rejected:/);
    const css = read('src/style.css');
    expect(css).toMatch(/data-flash='rejected'/);
    expect(css).toMatch(/@keyframes refuse/);
  });

  it('every event the game emits has a voice', () => {
    const sound = read('src/render/sound.js');
    const game = read('src/game/game.js');
    const emitted = [...game.matchAll(/events\.push\('([a-z-]+)'\)/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(3);
    const main = read('src/main.js');
    for (const event of emitted) {
      const named = event === 'picked-up' ? 'pickup' : event;
      expect(sound + main, `no feedback for "${event}"`).toMatch(new RegExp(named));
    }
  });

  it('sound survives a browser that refuses it', () => {
    // Private windows throw on localStorage and can refuse AudioContext.
    const sound = read('src/render/sound.js');
    expect(sound).toMatch(/catch/);
    expect(sound).toMatch(/if \(!audio\) return/);
  });
});

describe('touch gestures are the tank controls, not screen directions', () => {
  // Screen-left depends on where you are standing on the solid. If a swipe
  // meant "go that way on screen" the game would be lying about its own
  // geometry, so every gesture is body-relative instead.
  const far = SWIPE_MIN_DISTANCE + 20;

  it('a tap steps forward', () => {
    expect(classify(0, 0, 80)).toBe('forward');
    expect(classify(4, -3, 200)).toBe('forward');
  });

  it('a long press is not a tap', () => {
    expect(classify(2, 2, 1200)).toBe(null);
  });

  it('swiping up steps forward, swiping down undoes', () => {
    expect(classify(0, -far, 150)).toBe('forward');
    expect(classify(0, far, 150)).toBe('undo');
  });

  it('swiping sideways turns, and never walks', () => {
    expect(classify(far, 0, 150)).toBe('right');
    expect(classify(-far, 0, 150)).toBe('left');
  });

  it('uses the dominant axis when a swipe is diagonal', () => {
    expect(classify(far, -far * 0.4, 150)).toBe('right');
    expect(classify(far * 0.4, -far, 150)).toBe('forward');
  });

  it('ignores a smudge between a tap and a swipe', () => {
    // Guessing here gets it wrong in the worst way: a step that costs par
    // when the player meant to turn.
    const smudge = (TAP_MAX_DISTANCE + SWIPE_MIN_DISTANCE) / 2;
    expect(classify(smudge, 0, 150)).toBe(null);
  });

  it('never turns a gesture into two moves', () => {
    const actions = new Set();
    for (let dx = -60; dx <= 60; dx += 3) {
      for (let dy = -60; dy <= 60; dy += 3) {
        const a = classify(dx, dy, 200);
        if (a) actions.add(a);
      }
    }
    expect([...actions].sort()).toEqual(['forward', 'left', 'right', 'undo']);
  });
});

describe('the mobile viewport', () => {
  const css = read('src/style.css');
  const scene = read('src/render/scene.js');
  const viewport = read('src/render/viewport.js');

  it('sizes the canvas from the measured window, not from vh units', () => {
    // 100vh is the height with the URL bar HIDDEN, so it is too tall while
    // the bar is showing and the bottom of the game sits under it.
    expect(css).toMatch(/#view\s*\{[^}]*--app-width/);
    expect(css).toMatch(/#view\s*\{[^}]*--app-height/);
  });

  it('measures the visual viewport, which is what is actually on screen', () => {
    expect(viewport).toMatch(/visualViewport/);
    // A toolbar sliding away scrolls the visual viewport without resizing it.
    expect(viewport).toMatch(/addEventListener\('scroll'/);
    expect(viewport).toMatch(/orientationchange/);
  });

  it('drives the renderer off the canvas, so CSS and WebGL cannot disagree', () => {
    expect(scene).toMatch(/ResizeObserver/);
    expect(scene).toMatch(/canvas\.clientWidth/);
    expect(scene).not.toMatch(/canvas\.clientWidth \|\| window\.innerWidth/);
  });

  it('lets the button row wrap instead of running off the screen', () => {
    // Six buttons at full size are wider than a 360px phone.
    expect(css).toMatch(/\.ui-touch\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.ui-touch\s*\{[^}]*max-width/);
  });

  it('keeps the interface clear of notches and home indicators', () => {
    expect(css).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(css).toMatch(/env\(safe-area-inset-top\)/);
  });
});
