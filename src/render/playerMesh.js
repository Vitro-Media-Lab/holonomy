import {
  Group, Mesh, Shape, ShapeGeometry, MeshBasicMaterial, Vector3,
  Line, LineBasicMaterial, BufferGeometry, CircleGeometry, DoubleSide,
} from 'three';
import { PALETTE } from './palette.js';
import { needleShape } from './marks.js';
import { orientOnTile } from './place.js';

// A flat chevron lying in the tile plane. Read from a fixed isometric camera,
// a flat shape says "which way am I pointing" far better than a standing cone.
function arrowShape() {
  const s = new Shape();
  s.moveTo(0, 0.46);
  s.lineTo(0.40, -0.30);
  s.lineTo(0, -0.08);
  s.lineTo(-0.40, -0.30);
  s.closePath();
  return s;
}

export function createPlayerMesh(surface) {
  const group = new Group();
  const scale = surface.meanTileRadius() * 1.3;

  // A dark plate under the arrow. Seen through two translucent faces and a
  // grid, a bare silhouette dissolves into the pattern behind it; this gives
  // it something to sit against.
  const backing = new Mesh(
    new CircleGeometry(scale * 0.52, 24),
    new MeshBasicMaterial({
      color: PALETTE.background, transparent: true, opacity: 0.3,
      side: DoubleSide, depthTest: false, depthWrite: false,
    })
  );
  backing.renderOrder = 999;
  group.add(backing);

  const geom = new ShapeGeometry(arrowShape());
  geom.scale(scale, scale, 1);

  // DoubleSide, or the whole thing vanishes the moment its tile turns away.
  // These are flat shapes lying in the tile plane with their front towards
  // the outside of the solid; seen through the solid you are looking at the
  // back of them, and a single-sided material culls that away entirely.
  const fill = new Mesh(geom, new MeshBasicMaterial({
    color: PALETTE.player, transparent: true,
    side: DoubleSide, depthTest: false, depthWrite: false,
  }));
  fill.renderOrder = 1000;
  group.add(fill);

  // An outline traced on the same points keeps the silhouette crisp when the
  // fill is knocked back for the far side.
  const pts = arrowShape().getPoints().map((p) => new Vector3(p.x * scale, p.y * scale, 0));
  pts.push(pts[0].clone());
  const outline = new Line(
    new BufferGeometry().setFromPoints(pts),
    new LineBasicMaterial({
      color: PALETTE.player, transparent: true, depthTest: false, depthWrite: false,
    })
  );
  outline.renderOrder = 1001;
  group.add(outline);

  // The needle the player is carrying, drawn over their own heading. It is
  // the same arrow the key and the slot use, so it is obvious it is the key.
  const needleGeom = new ShapeGeometry(needleShape());
  needleGeom.scale(scale * 0.58, scale * 0.58, 1);
  const needle = new Mesh(needleGeom, new MeshBasicMaterial({
    color: PALETTE.needle, transparent: true,
    side: DoubleSide, depthTest: false, depthWrite: false,
  }));
  needle.renderOrder = 1002;
  needle.visible = false;
  group.add(needle);

  group.userData = { fill, outline, needle, backing };
  return group;
}

const LIFT = 0.012;

/** Places the arrow on the walker's tile, pointing where the walker points. */
export function placePlayer(group, surface, walker) {
  orientOnTile(group, surface, walker.tile, walker.heading(), LIFT);
}

/**
 * Points the carried needle. It lives in the player's group but is rotated
 * out of it, because the whole design rests on the needle not turning when
 * the player does.
 */
export function setNeedle(group, surface, walker) {
  const mesh = group.userData.needle;
  mesh.visible = walker.needle !== null;
  if (!mesh.visible) return;

  const heading = walker.heading();
  const tile = surface.tile(walker.tile);
  const right = new Vector3().crossVectors(heading, tile.normal);
  const dir = walker.needleDirection();
  mesh.rotation.set(0, 0, Math.atan2(-dir.dot(right), dir.dot(heading)));
}

/**
 * On the far side the arrow is seen through two translucent layers and its
 * heading reads mirrored. Near and far must be TOLD APART, but the player may
 * never be hard to read: the rule is that you always know where you are and
 * which way both you and the needle point.
 */
export function setPlayerFacing(group, normal, toCamera) {
  const far = normal.dot(toCamera) < 0;
  const { fill, outline, needle, backing } = group.userData;
  fill.material.opacity = far ? 0.7 : 1.0;
  outline.material.opacity = 1.0;
  needle.material.opacity = far ? 0.85 : 1.0;
  // Knock the far side back harder, so it reads as behind without fading.
  backing.material.opacity = far ? 0.62 : 0.26;
}
