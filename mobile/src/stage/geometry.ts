import type { StagePosition, StageSize } from './coordinates';
import type { StageObject } from './model';

export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error('Rotation must be finite.');
  return ((degrees % 360) + 360) % 360;
}

/** Exact axis-aligned extents of the current rotated rectangular footprint. */
export function rotatedHalfExtents(object: StageObject): { x: number; y: number } {
  const radians = normalizeRotation(object.rotation) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { x: (object.geometry.width * cos + object.geometry.depth * sin) / 2,
    y: (object.geometry.width * sin + object.geometry.depth * cos) / 2 };
}

export function constrainPosition(object: StageObject, position: StagePosition, stage: StageSize): StagePosition {
  const half = rotatedHalfExtents(object);
  // If an object cannot fit, center it on that axis so it remains reachable.
  const clamp = (value: number, extent: number, size: number) => extent * 2 > size
    ? size / 2 : Math.max(extent, Math.min(size - extent, value));
  return { ...position, x: clamp(position.x, half.x, stage.width), y: clamp(position.y, half.y, stage.depth) };
}
