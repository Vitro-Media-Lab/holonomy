import { Matrix4, Vector3 } from 'three';

/**
 * Lays a flat object on a tile, pointing along a world direction that lies in
 * that tile's plane. Local +Y becomes the direction, local +Z the outward
 * normal, so every mark, arrow and needle in the game is oriented the same way
 * on any solid.
 */
export function orientOnTile(object, surface, tileId, direction, lift = 0) {
  const tile = surface.tile(tileId);
  const side = new Vector3().crossVectors(direction, tile.normal);
  object.quaternion.setFromRotationMatrix(
    new Matrix4().makeBasis(side, direction, tile.normal)
  );
  object.position.copy(tile.centre).addScaledVector(tile.normal, lift);
}
