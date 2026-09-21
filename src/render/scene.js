import {
  Scene, OrthographicCamera, WebGLRenderer, Color, Vector3, Quaternion, Group,
  Mesh, MeshBasicMaterial, DoubleSide,
  LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute,
} from 'three';
import { faceColours, PALETTE } from './palette.js';
import { trackViewport } from './viewport.js';

/**
 * Direction from the solid to the camera. Deliberately NOT (1, 1, 1).
 *
 * On the body diagonal a cube is degenerate: the near corner and the far
 * corner project to the same point, all three visible faces project to equal
 * rhombi, and the result is the tumbling-blocks illusion - a flat hexagon
 * that the eye refuses to read as a solid. Tilting off the diagonal separates
 * the two corners and gives the three axes unequal areas.
 *
 * The camera itself never moves, and never rotates. When the view follows the
 * player it is the solid that turns.
 */
export const TO_CAMERA = new Vector3(1.0, 1.22, 0.74).normalize();

/**
 * How much world the view must show. Every solid is normalised to a radius of
 * sqrt(3), so it spans 3.46 across, and this leaves a little air around it.
 */
export const VIEW_SPAN = 3.9;

/**
 * The orthographic box for a given aspect ratio.
 *
 * Sizing by height alone is fine on a desktop and wrong on a phone: at an
 * aspect of 0.45 a height-sized box is only 1.75 wide, half of what the solid
 * needs, so it gets cut off at both edges. Dividing by the smaller of the two
 * dimensions means the span is satisfied whichever way round the screen is.
 */
export function frustumFor(aspect) {
  const span = VIEW_SPAN / Math.min(1, aspect);
  return { width: span * aspect, height: span };
}

/**
 * Where the player's face is brought to: the top. NOT the camera axis.
 *
 * Turning a face flat-on to the camera would throw away the isometric view -
 * you would be looking straight down at one face and the solid would stop
 * looking like a solid. Bringing it to the top instead keeps the oblique
 * three-quarter view exactly as it was: three faces visible, unequal areas,
 * the player's face simply the most visible of them.
 */
const PRESENT = new Vector3(0, 1, 0);

export function createScene(canvas) {
  const scene = new Scene();
  scene.background = new Color(PALETTE.background);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.copy(TO_CAMERA).multiplyScalar(10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const { width, height } = frustumFor(w / h);
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // Keep the window size in CSS variables, then drive the renderer off what
  // the canvas actually measured. Reading the window in both places lets the
  // two disagree; measuring the element cannot.
  trackViewport();
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();

  return { scene, camera, renderer, resize, toCamera: TO_CAMERA.clone() };
}

export const isNearSide = (normal) => normal.dot(TO_CAMERA) > 0;

/**
 * How the solid must be turned to present a given face to the camera.
 *
 * A PURE FUNCTION OF THE FACE NORMAL, which is the whole safety property.
 * Nothing about the route, the heading or the previous orientation goes into
 * it, so a face always comes up looking the same. If this were allowed to
 * accumulate along the path, the world's own spin would be indistinguishable
 * from the rotation the surface hands the player, and the game would have no
 * way left to show its one idea.
 */
export function faceOrientation(normal) {
  const q = new Quaternion().setFromUnitVectors(normal, PRESENT);

  // Pick the spin about the top so faces do not arrive rolled to arbitrary
  // angles. Also a pure function of the normal, like everything here.
  const ref = Math.abs(normal.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const tangent = ref.clone().addScaledVector(normal, -ref.dot(normal));
  if (tangent.lengthSq() < 1e-9) return q;
  tangent.normalize().applyQuaternion(q);

  const toward = new Vector3(0, 0, 1);
  const angle = Math.atan2(
    new Vector3().crossVectors(tangent, toward).dot(PRESENT),
    tangent.dot(toward)
  );
  return new Quaternion().setFromAxisAngle(PRESENT, angle).multiply(q);
}

// Near tiles read solid, far ones read as glass you are looking through.
const STYLE = {
  near: { fill: 0.17, grid: 0.45, edge: 0.55 },
  far: { fill: 0.075, grid: 0.16, edge: 0.12 },
};
const SOLVED_FILL = 0.34;
const SOLVED_GRID = 0.9;

/**
 * Builds the translucent solid for any surface.
 *
 * Tiles are merged into one mesh whose colours carry their own alpha, so the
 * near/far treatment can be rewritten in place when the solid turns. Batching
 * by depth the way a fixed view allows would bake in an answer that stops
 * being true the moment the view follows the player.
 */
export function createSolid(surface) {
  const group = new Group();

  const fill = [];
  const grid = [];
  for (const tile of surface.tiles) {
    const [p0, p1, p2, p3] = tile.points;
    pushTri(fill, p0, p1, p2);
    pushTri(fill, p0, p2, p3);
    // Lift the grid a hair off the tile so it never z-fights with it.
    const lift = tile.normal.clone().multiplyScalar(0.003);
    for (let s = 0; s < 4; s++) {
      push(grid, tile.points[s].clone().add(lift));
      push(grid, tile.points[(s + 1) % 4].clone().add(lift));
    }
  }

  const edges = surface.structuralEdges();
  const edgePoints = [];
  for (const e of edges) { push(edgePoints, e.a); push(edgePoints, e.b); }

  const tileMesh = new Mesh(coloured(fill), new MeshBasicMaterial({
    vertexColors: true, transparent: true, side: DoubleSide, depthWrite: false,
  }));
  tileMesh.renderOrder = 10;

  const gridMesh = new LineSegments(coloured(grid), new LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
  }));
  gridMesh.renderOrder = 20;

  const edgeMesh = new LineSegments(coloured(edgePoints), new LineBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false,
  }));
  edgeMesh.renderOrder = 30;

  group.add(tileMesh, gridMesh, edgeMesh);

  const colours = faceColours(surface);
  const goal = new Color(PALETTE.needle);
  const edgeBase = new Color(PALETTE.player);
  const scratch = new Color();
  const rotated = new Vector3();

  /**
   * @param orientation the solid's current rotation, or null when fixed
   * @param solved      0 normal, 1 fully solved
   */
  group.userData.update = (orientation, solved) => {
    const tiles = tileMesh.geometry.attributes.color.array;
    const grids = gridMesh.geometry.attributes.color.array;

    surface.tiles.forEach((tile, i) => {
      rotated.copy(tile.normal);
      if (orientation) rotated.applyQuaternion(orientation);
      const near = isNearSide(rotated);
      const style = near ? STYLE.near : STYLE.far;

      scratch.set(colours.get(tile.face)).lerp(goal, solved);
      write(tiles, i * 6, 6, scratch, style.fill + (SOLVED_FILL - style.fill) * solved);
      write(grids, i * 8, 8, scratch, style.grid + (SOLVED_GRID - style.grid) * solved);
    });

    const edgeColours = edgeMesh.geometry.attributes.color.array;
    edges.forEach((edge, i) => {
      const visible = edge.tiles.some((id) => {
        rotated.copy(surface.tile(id).normal);
        if (orientation) rotated.applyQuaternion(orientation);
        return isNearSide(rotated);
      });
      scratch.copy(edgeBase).lerp(goal, solved);
      write(edgeColours, i * 2, 2, scratch, visible ? STYLE.near.edge : STYLE.far.edge);
    });

    tileMesh.geometry.attributes.color.needsUpdate = true;
    gridMesh.geometry.attributes.color.needsUpdate = true;
    edgeMesh.geometry.attributes.color.needsUpdate = true;
  };

  group.userData.update(null, 0);
  return group;
}

function write(array, firstVertex, count, colour, alpha) {
  for (let v = 0; v < count; v++) {
    const o = (firstVertex + v) * 4;
    array[o] = colour.r;
    array[o + 1] = colour.g;
    array[o + 2] = colour.b;
    array[o + 3] = alpha;
  }
}

function coloured(points) {
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(points, 3));
  geom.setAttribute('color', new Float32BufferAttribute(new Float32Array((points.length / 3) * 4), 4));
  return geom;
}

const push = (arr, v) => arr.push(v.x, v.y, v.z);
const pushTri = (arr, a, b, c) => { push(arr, a); push(arr, b); push(arr, c); };
