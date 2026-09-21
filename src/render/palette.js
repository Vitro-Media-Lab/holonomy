// Five colours. Three of them say which axis a face belongs to, so the
// player can name the face they are standing on without counting.
export const PALETTE = {
  background: 0x0e1117,
  axisX: 0xe8615a,
  axisY: 0xf0c05a,
  axisZ: 0x5aa9e8,
  player: 0xf4f1e8,
  // The needle gets its own colour because it is the one thing on screen
  // that is neither a face nor the player: it is what you are carrying.
  needle: 0x63e0ad,
};

export function axisColor(n) {
  if (Math.abs(n.x) > 0.5) return PALETTE.axisX;
  if (Math.abs(n.y) > 0.5) return PALETTE.axisY;
  return PALETTE.axisZ;
}
