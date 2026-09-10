import type { StagePosition, StageSize } from './coordinates';
import type { StageObject } from './model';

/** Provisional ground-marking width in inches, shared by bounds and rendering. */
export const FAULT_LINE_WIDTH = 2;

export function footprint(object: StageObject): { width: number; depth: number } {
  switch (object.type) {
    case 'cardboardTarget':
    case 'steelPlate':
    case 'steelPopper':
    case 'noShootTarget': return { width: object.geometry.faceWidth, depth: 0 };
    case 'wall': return { width: object.geometry.length, depth: object.geometry.thickness };
    case 'faultLine': return { width: object.geometry.length, depth: FAULT_LINE_WIDTH };
    default: return { width: object.geometry.width, depth: object.geometry.depth };
  }
}

export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) throw new Error('Rotation must be finite.');
  return ((degrees % 360) + 360) % 360;
}

/** Exact axis-aligned extents of the current rotated rectangular footprint. */
export function rotatedHalfExtents(object: StageObject): { x: number; y: number } {
  const { width, depth } = footprint(object);
  const radians = normalizeRotation(object.rotation) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { x: (width * cos + depth * sin) / 2,
    y: (width * sin + depth * cos) / 2 };
}

export function constrainPosition(object: StageObject, position: StagePosition, stage: StageSize): StagePosition {
  const half = rotatedHalfExtents(object);
  // If an object cannot fit, center it on that axis so it remains reachable.
  const clamp = (value: number, extent: number, size: number) => extent * 2 > size
    ? size / 2 : Math.max(extent, Math.min(size - extent, value));
  return { ...position, x: clamp(position.x, half.x, stage.width), y: clamp(position.y, half.y, stage.depth) };
}
