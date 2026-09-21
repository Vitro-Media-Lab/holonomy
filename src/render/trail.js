import { Mesh, BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, Color } from 'three';
import { PALETTE } from './palette.js';

const MAX = 64;
const SHRINK = 0.62;
const LIFT = 0.006;

/**
 * The tiles walked this attempt, fading with age. Drawn through the solid so
 * a loop is visible as a loop even when half of it is round the back - which
 * is the whole point of being able to see it at all.
 */
export function createTrail(surface) {
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX * 6 * 3), 3));
  geom.setAttribute('color', new Float32BufferAttribute(new Float32Array(MAX * 6 * 4), 4));

  const mesh = new Mesh(
    geom,
    new MeshBasicMaterial({
      vertexColors: true, transparent: true, depthTest: false, depthWrite: false,
    })
  );
  mesh.renderOrder = 500;
  mesh.frustumCulled = false;

  const visited = [];
  const tint = new Color(PALETTE.needle);
  let visible = true;

  function rebuild() {
    const pos = geom.attributes.position.array;
    const col = geom.attributes.color.array;
    let p = 0;
    let c = 0;

    visited.forEach((id, i) => {
      // Newest tile is brightest; the tail thins out towards nothing.
      const age = (i + 1) / visited.length;
      const alpha = 0.06 + 0.34 * age * age;
      const tile = surface.tile(id);
      const lift = tile.normal.clone().multiplyScalar(LIFT);
      const corner = (k) => tile.points[k].clone()
        .sub(tile.centre).multiplyScalar(SHRINK).add(tile.centre).add(lift);

      const [a, b, d, e] = [corner(0), corner(1), corner(2), corner(3)];
      for (const v of [a, b, d, a, d, e]) {
        pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
        col[c++] = tint.r; col[c++] = tint.g; col[c++] = tint.b; col[c++] = alpha;
      }
    });

    // Collapse unused slots rather than leaving stale quads on screen.
    while (p < pos.length) pos[p++] = 0;
    while (c < col.length) col[c++] = 0;
    geom.attributes.position.needsUpdate = true;
    geom.attributes.color.needsUpdate = true;
  }

  return {
    mesh,
    push(tileId) {
      visited.push(tileId);
      if (visited.length > MAX) visited.shift();
      rebuild();
    },
    pop() { visited.pop(); rebuild(); },
    clear() { visited.length = 0; rebuild(); },
    toggle() { visible = !visible; mesh.visible = visible; },
  };
}
