import { activeFaceExtent } from './targetFace';
import type { StagePosition, StageSize } from './coordinates';
import type { StageObject } from './model';

/** Provisional ground-marking width in inches, shared by bounds and rendering. */
export const FAULT_LINE_WIDTH = 2;

/** Inverse ground-plane rotation about an object's physical reference point. */
export function stageToObjectLocal(point: StagePosition, object: Pick<StageObject, 'position' | 'rotation'>) {
  const radians = normalizeRotation(object.rotation) * Math.PI / 180;
  const dx = point.x - object.position.x, dy = point.y - object.position.y;
  return { x: dx * Math.cos(radians) + dy * Math.sin(radians),
    y: -dx * Math.sin(radians) + dy * Math.cos(radians) };
}

/** Closed segment/rectangle intersection interval, including tangent contact. */
export function segmentRectangleInterval(a: { x: number; y: number }, b: { x: number; y: number },
  halfWidth: number, halfDepth: number): [number, number] | null {
  let enter = 0, leave = 1;
  for (const [origin, delta, half] of [[a.x, b.x - a.x, halfWidth], [a.y, b.y - a.y, halfDepth]]) {
    if (Math.abs(delta) < 1e-9) { if (Math.abs(origin) > half + 1e-9) return null; }
    else {
      const t1 = (-half - origin) / delta, t2 = (half - origin) / delta;
      enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave + 1e-9) return null;
    }
  }
  return [enter, leave];
}

export function footprint(object: StageObject): { width: number; depth: number } {
  switch (object.type) {
    case 'cardboardTarget':
    case 'noShootTarget': { const face = activeFaceExtent(object); return { width: face.right - face.left, depth: 0 }; }
    case 'steelPlate':
    case 'steelPopper':
      return { width: object.geometry.faceWidth, depth: 0 };
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
  const offset = footprintCenterOffset(object);
  // If an object cannot fit, center it on that axis so it remains reachable.
  const clamp = (value: number, extent: number, size: number) => extent * 2 > size
    ? size / 2 : Math.max(extent, Math.min(size - extent, value));
  return { ...position, x: clamp(position.x + offset.x, half.x, stage.width) - offset.x, y: clamp(position.y + offset.y, half.y, stage.depth) - offset.y };
}

/** Active footprint center relative to the preserved object reference, after rotation. */
export function footprintCenterOffset(object: StageObject): { x: number; y: number } {
  const face = object.type === 'cardboardTarget' || object.type === 'noShootTarget' ? activeFaceExtent(object) : null;
  const x = face ? (face.left + face.right) / 2 : 0;
  const r = object.rotation * Math.PI / 180;
  return { x: x * Math.cos(r), y: x * Math.sin(r) };
}
