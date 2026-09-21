import { Group, Quaternion } from 'three';
import './style.css';
import { createScene, createSolid, faceOrientation } from './render/scene.js';
import { createPlayerMesh, placePlayer, setPlayerFacing, setNeedle } from './render/playerMesh.js';
import { createMarks } from './render/marks.js';
import { createTrail } from './render/trail.js';
import { createInput } from './game/input.js';
import { createTouch } from './game/touch.js';
import { createHud } from './game/hud.js';
import { createUI } from './game/ui.js';
import { createSound } from './render/sound.js';
import { parseLevel } from './game/level.js';
import { createGame } from './game/game.js';

/** How long the win is allowed to sit before the next level loads. */
const SAVOUR_MS = 1400;
/** How fast the solid turns to bring the player's face round. */
const TURN_EASE = 0.12;

const canvas = document.getElementById('view');
const { scene, camera, renderer, toCamera } = createScene(canvas);

const world = new Group();
scene.add(world);

const hud = createHud();
const input = createInput();
const sound = createSound();

// Resolved against the deployed base, not the server root, so the same build
// serves from a custom domain and from a project path on github.io.
const base = import.meta.env.BASE_URL;
const manifest = await (await fetch(`${base}levels/manifest.json`)).json();
const ui = createUI(manifest.levels.length, (action) => handle(action));

let index = 0;
let level, game, solid, marks, playerMesh, trail;
let rejectedAt = -Infinity;
let solvedTint = 0;
let advanceAt = Infinity;

// The camera is still bolted down. When the view follows the player it is the
// solid that turns, to a pose decided solely by which face they stand on.
let follow = true;
const targetPose = new Quaternion();
let lastFace = -1;

/** Frees the GPU resources of everything under a group before dropping it. */
function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
  group.clear();
}

function redrawTrail() {
  trail.clear();
  trail.push(game.walker.tile);
}

let loadToken = 0;

async function loadLevel(i) {
  // N is a key people mash. Without this, two overlapping fetches can resolve
  // out of order and land you on a level you did not ask for.
  const token = ++loadToken;
  const next = ((i % manifest.levels.length) + manifest.levels.length) % manifest.levels.length;
  const json = await (await fetch(`${base}levels/${manifest.levels[next]}.json`)).json();
  if (token !== loadToken) return;
  index = next;

  level = parseLevel(json);
  game = createGame(level);

  disposeGroup(world);
  solid = createSolid(level.surface);
  marks = createMarks(level);
  playerMesh = createPlayerMesh(level.surface);
  trail = createTrail(level.surface);
  world.add(solid, marks.group, playerMesh, trail.mesh);

  redrawTrail();
  lastFace = -1;
  world.quaternion.copy(poseFor(game.walker.tile));
  rejectedAt = -Infinity;
  solvedTint = 0;
  advanceAt = Infinity;
  input.clear();
}

/** Where the solid must sit to show the face this tile belongs to. */
function poseFor(tileId) {
  if (!follow) return new Quaternion();
  return faceOrientation(level.surface.tile(tileId).normal);
}

function handle(action) {
  // A tap can land before the first level has finished fetching.
  if (!game) return;
  ui.noteInput();
  if (action === 'hud') { hud.toggle(); return; }
  if (action === 'camera') { follow = !follow; return; }
  if (action === 'mute') { sound.toggle(); return; }
  if (action === 'trail') { trail.toggle(); return; }
  if (action === 'next') { loadLevel(index + 1); return; }
  if (action === 'prev') { loadLevel(index - 1); return; }

  const before = game.walker.tile;
  const events = game.act(action);

  // One voice per action, and it is the most important thing that happened.
  // A step that also opens the slot should not announce itself as a footfall.
  const RANKED = ['moved', 'undone', 'blocked', 'mirrored', 'picked-up', 'rejected', 'solved'];
  const loudest = RANKED.filter((name) => events.includes(name)).pop();
  if (loudest) {
    sound.play(loudest === 'moved' ? 'step' : loudest === 'picked-up' ? 'pickup' : loudest);
    if (loudest !== 'moved') ui.flash(loudest);
  }

  if (events.includes('rejected')) rejectedAt = performance.now();
  if (events.includes('solved')) advanceAt = performance.now() + SAVOUR_MS;

  if (events.includes('reset')) { redrawTrail(); advanceAt = Infinity; }
  else if (events.includes('moved')) trail.push(game.walker.tile);
  // Undoing a turn must not eat a tile off the trail; only undoing a step does.
  else if (events.includes('undone') && before !== game.walker.tile) trail.pop();
}

// Gestures feed the very same actions the keyboard does, so there is one
// set of rules and one input path however the game is being played.
createTouch(canvas, (action) => handle(action), () => ui.useTouch());

await loadLevel(0);

function frame(now) {
  // One queued input per frame, so a burst of presses plays out in order.
  const action = input.take();
  if (action) handle(action);

  // Undo and reset both un-win the level, so the pending advance has to go
  // with them. Deriving it from the live status covers every way back.
  if (game.status !== 'solved') advanceAt = Infinity;

  // Solving carries you onward by itself. Nothing to find, nothing to press.
  if (now >= advanceAt) {
    advanceAt = Infinity;
    loadLevel(index + 1);
  }

  // Only recompute the pose when the player changes face. Walking across a
  // face never turns the solid, and turning on the spot never turns it at all.
  const face = follow ? level.surface.faceOf(game.walker.tile) : -1;
  if (face !== lastFace) {
    lastFace = face;
    targetPose.copy(poseFor(game.walker.tile));
  }
  world.quaternion.slerp(targetPose, TURN_EASE);

  // Ease the solid towards the goal colour while solved, and straight back
  // on reset, so a win reads from across the screen and not just underfoot.
  const target = game.status === 'solved' ? 1 : 0;
  solvedTint += (target - solvedTint) * 0.12;
  if (Math.abs(target - solvedTint) < 0.002) solvedTint = target;
  solid.userData.update(world.quaternion, solvedTint);

  placePlayer(playerMesh, level.surface, game.walker);
  setPlayerFacing(
    playerMesh,
    game.walker.normal.clone().applyQuaternion(world.quaternion),
    toCamera
  );
  setNeedle(playerMesh, level.surface, game.walker);
  marks.update(game, now, rejectedAt, world.quaternion);
  hud.update(game);
  ui.update(game, index);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
