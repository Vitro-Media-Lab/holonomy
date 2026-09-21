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

const HUES = [PALETTE.axisX, PALETTE.axisY, PALETTE.axisZ];
const cache = new WeakMap();

/**
 * A colour per face of the original solid, chosen so neighbours differ.
 *
 * Tinting by the dominant axis of the normal works on a cube and nowhere
 * else: a tetrahedron's and an octahedron's normals are all (1,1,1)-ish, so
 * every component ties, every face resolves to the same axis, and the whole
 * solid comes out one flat colour. On a cube this greedy colouring lands back
 * on the axis pairing anyway, because opposite faces never touch.
 *
 * Three hues cannot always win - a tetrahedron's faces all touch each other,
 * so it needs four - and where they cannot, the repeat is pushed onto the
 * neighbour sharing the least border.
 */
export function faceColours(surface) {
  if (cache.has(surface)) return cache.get(surface);

  const neighbours = new Map();
  const link = (a, b) => {
    if (a === b) return;
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a).add(b);
  };
  for (const tile of surface.tiles) {
    for (const side of tile.neighbours) {
      link(tile.face, surface.tile(side.tile).face);
    }
  }

  const chosen = new Map();
  // Most-constrained first, so the unavoidable clashes land on simple faces.
  const order = [...neighbours.keys()]
    .sort((a, b) => (neighbours.get(b).size - neighbours.get(a).size) || a - b);

  for (const face of order) {
    const taken = new Set();
    for (const other of neighbours.get(face)) {
      if (chosen.has(other)) taken.add(chosen.get(other));
    }
    const free = HUES.filter((h) => !taken.has(h));
    chosen.set(face, free.length ? free[0] : HUES[face % HUES.length]);
  }

  cache.set(surface, chosen);
  return chosen;
}
