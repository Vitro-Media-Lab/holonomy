// Replays each level's optimal route through the REAL game rules, not the
// solver's model, and reports whether it actually wins.
import { readFileSync } from 'node:fs';
import { parseLevel } from '../src/game/level.js';
import { createGame } from '../src/game/game.js';
import { analyse } from '../src/game/solve.js';

const KEYS = { forward: 'W', left: 'A', right: 'D' };
let bad = 0;

for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  if (!raw.spawn || !Array.isArray(raw.tiles)) continue;

  const level = parseLevel(raw);
  const a = analyse(level);

  if (!a.solvable) {
    console.log(`${level.id.padEnd(3)} ${'NOT SOLVABLE'.padEnd(12)} budget ${level.budget}`);
    bad++;
    continue;
  }

  // Play it for real: same createGame the browser runs.
  const game = createGame(level);
  const faces = new Set([level.surface.faceOf(game.walker.tile)]);
  for (const action of a.path) {
    game.act(action);
    faces.add(level.surface.faceOf(game.walker.tile));
  }

  const won = game.status === 'solved' && game.steps <= level.budget;
  if (!won) bad++;

  console.log(
    `${level.id.padEnd(3)} ${(won ? 'SOLVED' : 'FAILED').padEnd(7)}`
    + ` ${String(level.solid).padEnd(13)}`
    + ` steps ${String(game.steps).padStart(2)}/${String(level.budget).padEnd(2)}`
    + ` faces ${faces.size}`
    + `   ${a.path.map((x) => KEYS[x]).join(' ')}`
  );
}

console.log(bad ? `\n${bad} level(s) do not win` : '\nevery level wins when played');
process.exit(bad ? 1 : 0);
