import type { StagePosition } from './coordinates';
import { constrainPosition, normalizeRotation, footprint } from './geometry';
import type { StageDocument, StageObject } from './model';

export type RotationIncrement = 15 | 5 | null;
export type SnapSettings = {
  enabled: boolean;
  gridIncrement: 12 | 6 | 3;
  objectAlignment: boolean;
  tolerance: number; // Inches, independent of zoom.
  rotationIncrement: RotationIncrement;
};
export const DEFAULT_SNAPPING: SnapSettings = {
  enabled: true, gridIncrement: 6, objectAlignment: true, tolerance: 3, rotationIncrement: 15,
};
export type SnapGuide = { axis: 'x' | 'y'; value: number; targetId: string };
export type SnapFeedback = { guides: SnapGuide[]; gridAxes: ('x' | 'y')[] };
export type SnapResult = SnapFeedback & { position: StagePosition };

export function snapToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment <= 0) {
    throw new Error('Snap values must be finite and increments positive.');
  }
  // Exact halves round toward positive infinity, including negative coordinates.
  // Tiny tolerance prevents inverse-transform roundoff from flipping an exact half-step.
  return Math.floor(value / increment + 0.5 + 1e-10) * increment || 0;
}
export function snapRotation(degrees: number, increment: RotationIncrement): number {
  return normalizeRotation(increment === null ? degrees : snapToIncrement(degrees, increment));
}

/** Centers and actual rotated edge midpoints; wall +/-width midpoints are endpoints. */
export function alignmentAnchors(object: StageObject): { x: number; y: number }[] {
  const r = object.rotation * Math.PI / 180;
  const { width, depth } = footprint(object);
  const w = width / 2, d = depth / 2;
  // Ground lines snap by center/endpoints, without wall-like side-edge anchors.
  const local = object.type === 'faultLine' ? [[0, 0], [-w, 0], [w, 0]]
    : [[0, 0], [-w, 0], [w, 0], [0, -d], [0, d]];
  return local.map(([x, y]) => ({
    x: object.position.x + x * Math.cos(r) - y * Math.sin(r),
    y: object.position.y + x * Math.sin(r) + y * Math.cos(r),
  }));
}

/** Grid first; nearest feasible object alignment overrides it per axis. Bounds win. */
export function resolveMovement(stage: StageDocument, id: string, raw: StagePosition, settings: SnapSettings): SnapResult {
  const object = stage.objects.find((entry) => entry.id === id);
  if (!object) return { position: raw, guides: [], gridAxes: [] };
  let position = { ...raw };
  const guides: SnapGuide[] = [];
  if (settings.enabled) {
    position.x = snapToIncrement(raw.x, settings.gridIncrement);
    position.y = snapToIncrement(raw.y, settings.gridIncrement);
    if (settings.objectAlignment) {
      const moving = alignmentAnchors({ ...object, position: raw });
      for (const axis of ['x', 'y'] as const) {
        let best: { distance: number; center: number; guide: SnapGuide } | undefined;
        for (const other of stage.objects) {
          if (other.id === id) continue;
          for (const anchor of alignmentAnchors(other)) for (const own of moving) {
            const delta = anchor[axis] - own[axis];
            const distance = Math.abs(delta);
            if (distance > settings.tolerance || (best && distance >= best.distance)) continue;
            const center = raw[axis] + delta;
            const bounded = constrainPosition(object, { ...raw, [axis]: center }, stage.stage);
            if (Math.abs(bounded[axis] - center) > 1e-8) continue;
            best = { distance, center, guide: { axis, value: anchor[axis], targetId: other.id } };
          }
        }
        if (best) { position[axis] = best.center; guides.push(best.guide); }
      }
    }
  }
  position = constrainPosition(object, position, stage.stage);
  const gridAxes = settings.enabled ? (['x', 'y'] as const).filter((axis) =>
    !guides.some((guide) => guide.axis === axis) &&
    Math.abs(position[axis] - snapToIncrement(position[axis], settings.gridIncrement)) < 1e-8,
  ) : [];
  return { position, guides, gridAxes };
}
