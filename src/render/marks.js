import {
  Group, Mesh, Shape, ShapeGeometry, MeshBasicMaterial, Vector3,
  Line, LineBasicMaterial, BufferGeometry, DoubleSide, RingGeometry,
  Float32BufferAttribute,
} from 'three';
import { axisColor, PALETTE } from './palette.js';
import { isNearSide } from './scene.js';
import { orientOnTile } from './place.js';

/**
 * One arrow shape, used for the key, for the slot, and for the needle in the
 * player's hands. Same silhouette everywhere, so "this thing has a direction
 * and the direction matters" needs saying exactly once, without words.
 */
export function needleShape() {
  const s = new Shape();
  s.moveTo(0, 0.44);
  s.lineTo(0.28, 0.08);
  s.lineTo(0.12, 0.08);
  s.lineTo(0.12, -0.42);
  s.lineTo(-0.12, -0.42);
  s.lineTo(-0.12, 0.08);
  s.lineTo(-0.28, 0.08);
  s.closePath();
  return s;
}

export function arrowGeometry(scale) {
  const geom = new ShapeGeometry(needleShape());
  geom.scale(scale, scale, 1);
  return geom;
}

function arrowOutline(scale) {
  const pts = needleShape().getPoints(4)
    .map((p) => new Vector3(p.x * scale, p.y * scale, 0));
  pts.push(pts[0].clone());
  return new BufferGeometry().setFromPoints(pts);
}

/**
 * Builds every mark the level needs. Walls are the parts of the shell that
 * went solid: the solid is glass where you may walk and opaque where you may
 * not, which is one less rule to explain.
 */
export function createMarks(level) {
  const group = new Group();
  const surface = level.surface;
  const scale = surface.meanTileRadius() * 1.3;

  let slotFill = null;
  let slotOutline = null;
  let ring = null;
  let keyMesh = null;
  let solvedAt = -Infinity;

  // Marks that get knocked back when their tile turns away. Seen from behind
  // a directional mark reads mirrored, which is a true view of it and not a
  // fault - but the player has to know that is what they are looking at.
  const depthCued = [];
  const cue = (object, tile, near, far) => {
    depthCued.push({ object, tile, near, far });
    return object;
  };
  const rotatedNormal = new Vector3();

  for (const t of level.all()) {
    const tile = surface.tile(t.tile);
    const facing = t.needle ?? t.direction ?? t.axis ?? 0;
    const direction = surface.sideDirection(t.tile, facing);

    if (t.type === 'wall') {
      const wall = new Mesh(quadGeometry(tile, 0.004), new MeshBasicMaterial({
        color: axisColor(tile.normal), transparent: true, opacity: 0.8,
        side: DoubleSide, depthWrite: false,
      }));
      wall.renderOrder = 300;
      group.add(wall);
    }

    if (t.type === 'gate') {
      // A chevron pointing the only way you may pass.
      const gate = new Mesh(arrowGeometry(scale * 0.8), new MeshBasicMaterial({
        color: PALETTE.player, transparent: true, opacity: 0.45,
        side: DoubleSide, depthTest: false, depthWrite: false,
      }));
      orientOnTile(gate, surface, t.tile, direction, 0.008);
      gate.renderOrder = 560;
      group.add(gate);
    }

    if (t.type === 'mirror') {
      // A bar lying along the axis it reflects across. Not an arrow: it has
      // no direction, only a line, which is exactly what a reflection is.
      const bar = new Mesh(quadGeometry(tile, 0.007, 0.9), new MeshBasicMaterial({
        color: PALETTE.needle, transparent: true, opacity: 0.16,
        side: DoubleSide, depthTest: false, depthWrite: false,
      }));
      bar.renderOrder = 570;

      const pts = [
        direction.clone().multiplyScalar(scale * 0.5),
        direction.clone().multiplyScalar(-scale * 0.5),
      ].map((v) => v.add(tile.centre).addScaledVector(tile.normal, 0.009));
      const axis = new Line(
        new BufferGeometry().setFromPoints(pts),
        new LineBasicMaterial({
          color: PALETTE.needle, transparent: true, opacity: 0.95,
          depthTest: false, depthWrite: false,
        })
      );
      axis.renderOrder = 575;
      group.add(bar, axis);
    }

    if (t.type === 'key') {
      // DoubleSide is what makes the key visible THROUGH the solid. It is a
      // flat arrow facing outwards, so from the far side you see its back,
      // and a single-sided material culls that away completely.
      keyMesh = new Mesh(arrowGeometry(scale), new MeshBasicMaterial({
        color: PALETTE.needle, transparent: true,
        side: DoubleSide, depthTest: false, depthWrite: false,
      }));
      orientOnTile(keyMesh, surface, t.tile, direction, 0.008);
      keyMesh.renderOrder = 600;
      cue(keyMesh, t.tile, 1, 0.5);

      // The outline holds the silhouette when the fill is knocked back.
      const keyEdge = new Line(arrowOutline(scale), new LineBasicMaterial({
        color: PALETTE.needle, transparent: true, opacity: 0.9,
        depthTest: false, depthWrite: false,
      }));
      orientOnTile(keyEdge, surface, t.tile, direction, 0.009);
      keyEdge.renderOrder = 603;
      keyEdge.userData.isKeyEdge = true;
      cue(keyEdge, t.tile, 0.9, 0.9);
      group.add(keyMesh, keyEdge);
    }

    if (t.type === 'slot') {
      // A keyway: the same arrow, hollow, waiting to be filled by one that
      // arrives pointing the same way.
      slotFill = new Mesh(arrowGeometry(scale), new MeshBasicMaterial({
        color: PALETTE.needle, transparent: true, opacity: 0,
        side: DoubleSide, depthTest: false, depthWrite: false,
      }));
      orientOnTile(slotFill, surface, t.tile, direction, 0.007);
      slotFill.renderOrder = 601;

      slotOutline = new Line(arrowOutline(scale), new LineBasicMaterial({
        color: PALETTE.needle, transparent: true, opacity: 0.6,
        depthTest: false, depthWrite: false,
      }));
      orientOnTile(slotOutline, surface, t.tile, direction, 0.009);
      slotOutline.renderOrder = 602;
      cue(slotOutline, t.tile, 1, 0.75);

      // Both the refusal and the win happen while the player is standing on
      // this tile. Anything drawn beneath them is invisible at exactly the
      // moment it matters, so the ring sits above the player and spreads
      // wider than the tile.
      ring = new Mesh(new RingGeometry(scale * 0.34, scale * 0.46, 48),
        new MeshBasicMaterial({
          color: PALETTE.needle, transparent: true, opacity: 0,
          side: DoubleSide, depthTest: false, depthWrite: false,
        }));
      orientOnTile(ring, surface, t.tile, direction, 0.02);
      ring.renderOrder = 1100;

      group.add(slotFill, slotOutline, ring);
    }
  }

  return {
    group,
    update(game, now, rejectedAt, orientation) {
      // Knock back anything round the back, without ever losing it.
      for (const { object, tile, near, far } of depthCued) {
        rotatedNormal.copy(surface.tile(tile).normal);
        if (orientation) rotatedNormal.applyQuaternion(orientation);
        object.userData.depthScale = isNearSide(rotatedNormal) ? near : far;
      }

      if (keyMesh) {
        const shown = !game.hasKey;
        keyMesh.visible = shown;
        keyMesh.material.opacity = keyMesh.userData.depthScale ?? 1;
        for (const child of group.children) {
          if (child.userData.isKeyEdge) {
            child.visible = shown;
            child.material.opacity = child.userData.depthScale ?? 0.9;
          }
        }
      }
      if (!slotFill || !slotOutline) return;

      const solved = game.status === 'solved';
      if (solved && solvedAt === -Infinity) solvedAt = now;
      if (!solved) solvedAt = -Infinity;

      const slotDepth = slotOutline.userData.depthScale ?? 1;
      slotFill.material.opacity = solved ? slotDepth : 0;
      slotOutline.material.opacity = (solved ? 1 : 0.6) * slotDepth;

      if (solved) {
        // Opens outward and stays open.
        const t = Math.min(1, (now - solvedAt) / 520);
        const eased = 1 - (1 - t) ** 3;
        ring.scale.setScalar(0.6 + 1.1 * eased);
        ring.material.opacity = 0.35 + 0.65 * eased;
      } else {
        // A refusal is a pulse and nothing else: no text, no penalty, and no
        // explanation of what was wrong with how you were holding it.
        const age = (now - rejectedAt) / 460;
        const pulse = age >= 0 && age <= 1 ? Math.sin(age * Math.PI) : 0;
        ring.scale.setScalar(0.55 + 0.85 * pulse);
        ring.material.opacity = 0.9 * pulse;
      }
    },
  };
}

/** A tile's own quad, optionally shrunk, lifted clear of the surface. */
function quadGeometry(tile, lift, shrink = 1) {
  const lifted = tile.points.map((p) => p.clone()
    .sub(tile.centre).multiplyScalar(shrink).add(tile.centre)
    .addScaledVector(tile.normal, lift));
  const [a, b, c, d] = lifted;
  const out = [];
  for (const v of [a, b, c, a, c, d]) out.push(v.x, v.y, v.z);
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(out, 3));
  return geom;
}
