import { Vector3 } from 'three';

// The only six directions anything in this game ever points.
export const DIR_NAMES = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];

const DIR_VECTORS = {
  '+X': new Vector3(1, 0, 0),
  '-X': new Vector3(-1, 0, 0),
  '+Y': new Vector3(0, 1, 0),
  '-Y': new Vector3(0, -1, 0),
  '+Z': new Vector3(0, 0, 1),
  '-Z': new Vector3(0, 0, -1),
};

export function dir(name) {
  const v = DIR_VECTORS[name];
  if (!v) throw new Error(`unknown direction: ${name}`);
  return v.clone();
}

export function dirName(v) {
  for (const name of DIR_NAMES) {
    if (DIR_VECTORS[name].distanceToSquared(v) < 1e-9) return name;
  }
  throw new Error(`not an axis direction: ${v.toArray().join(',')}`);
}

export function isAxisUnit(v) {
  return DIR_NAMES.some((n) => DIR_VECTORS[n].distanceToSquared(v) < 1e-9);
}

// Cross products of axis vectors are exact, but repeated float work can drift.
// Snapping keeps the six directions comparable by equality.
export function snapAxis(v) {
  return v.set(Math.round(v.x), Math.round(v.y), Math.round(v.z));
}
