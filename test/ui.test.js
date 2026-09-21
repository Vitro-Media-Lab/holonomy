import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

describe('the player is never told anything about the puzzle', () => {
  // The brief is explicit: no hint system, no tutorial text, no arrows. The
  // levels teach through construction. These are source-level guards because
  // the rule is about what CAN be shown, not about any one frame.
  const ui = read('src/game/ui.js');

  it('the player UI cannot read the needle, the target or the holonomy', () => {
    for (const leak of ['needle', 'wants', 'holonomy', 'turnSum', 'walker']) {
      expect(ui, `player UI touches ${leak}`).not.toMatch(new RegExp(`\b${leak}\b`));
    }
  });

  it('the debug panel starts hidden, because it prints the answer', () => {
    // `needle` and `wants` sit side by side in it: leave it up and you win by
    // watching two numbers match instead of reading the solid.
    const hud = read('src/game/hud.js');
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
    const sound = read('src/render/sound.js');
    expect(sound).toMatch(/rejected:/);
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
