import type { StageDocument, StageObject } from './model';
import type { StageSize } from './coordinates';
import type { TargetFamily } from './targetFamily';
import { constrainPosition, normalizeRotation, rotatedHalfExtents } from './geometry';
import { DEFAULT_DOWNRANGE_DEGREES, nearestCardinal, validDownrange } from './orientation';
import { defaultTargetPreset } from './targetPresets';
import { copyOutline } from './targetShape';

/** Editable physical defaults, not certified competition specifications. */
export function createObject(type: StageObject['type'], id: string, x: number, y: number, targetFamily?: TargetFamily): StageObject {
  const base = { id, position: { space: 'stage' as const, x, y, z: (type === 'cardboardTarget' || type === 'noShootTarget' || type === 'steelPlate') ? 48 : 0 }, rotation: 0,
    ...(targetFamily && ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper'].includes(type) ? { targetFamily } : {}) };
  switch (type) {
    case 'cardboardTarget': return { ...base, type, faceCut: { kind: 'preset', preset: 'full' }, geometry: { faceWidth: 18, faceHeight: 30 } };
    case 'noShootTarget': return { ...base, type, faceCut: { kind: 'preset', preset: 'full' }, geometry: { faceWidth: 18, faceHeight: 30 } };
    case 'steelPlate': return { ...base, type, geometry: { faceWidth: 12, faceHeight: 12 } };
    case 'steelPopper': return { ...base, type, geometry: { faceWidth: 12, faceHeight: 42 } };
    case 'wall': return { ...base, type, ports: [], geometry: { length: 96, thickness: 4, height: 72 } };
    case 'faultLine': return { ...base, type, geometry: { length: 96 } };
    case 'start': return { ...base, type, geometry: { width: 48, depth: 36, height: 0 } };
  }
}

export const DEFAULT_STAGE_SIZE: StageSize = Object.freeze({ width: 480, depth: 360 });

/**
 * Default layout in a downrange-relative frame: `across` runs left to right as seen by a shooter facing
 * downrange, `toward` runs from the uprange edge (0, where the start box is) to the backstop (1).
 * On the default 480 x 360 in stage with downrange up the screen this puts the start near the bottom-left
 * and the three targets near the top, with walls in between that force some movement.
 */
const LAYOUT: readonly { type: StageObject['type']; id: string; across: number; toward: number }[] = [
  { type: 'start', id: 'start-1', across: 0.2, toward: 0.1167 },
  { type: 'cardboardTarget', id: 'target-1', across: 0.25, toward: 0.8667 },
  { type: 'cardboardTarget', id: 'target-2', across: 0.55, toward: 0.8 },
  { type: 'cardboardTarget', id: 'target-3', across: 0.85, toward: 0.8667 },
  { type: 'wall', id: 'wall-1', across: 0.25, toward: 0.4333 },
  { type: 'wall', id: 'wall-2', across: 0.6, toward: 0.5667 },
  { type: 'wall', id: 'wall-3', across: 0.8, toward: 0.3333 },
];

/** Map the downrange-relative frame onto stage coordinates for one of the four screen directions. */
function placeInFrame(across: number, toward: number, size: StageSize, downrange: 0 | 90 | 180 | 270) {
  switch (downrange) {
    case 270: return { x: across * size.width, y: (1 - toward) * size.depth };
    case 90: return { x: (1 - across) * size.width, y: toward * size.depth };
    case 0: return { x: toward * size.width, y: across * size.depth };
    case 180: return { x: (1 - toward) * size.width, y: (1 - across) * size.depth };
  }
}

export type DefaultStageOptions = { size?: StageSize; downrangeDegrees?: number };

/**
 * Fresh workspace. Defaults to 480 x 360 in (13.33 x 10 yd, provisional, not a rulebook standard) with downrange
 * up the screen. Reset passes the current size, downrange and match family so they survive a reset.
 * When a family is given, targets use that family's default physical preset.
 */
export function createDefaultStage(targetFamily?: TargetFamily, options: DefaultStageOptions = {}): StageDocument {
  const size = options.size && [options.size.width, options.size.depth].every(n => Number.isFinite(n) && n > 0)
    ? { width: options.size.width, depth: options.size.depth } : { ...DEFAULT_STAGE_SIZE };
  const downrangeDegrees = validDownrange(options.downrangeDegrees) ? normalizeRotation(options.downrangeDegrees) : DEFAULT_DOWNRANGE_DEGREES;
  const frame = nearestCardinal(downrangeDegrees);
  // Targets face uprange and walls run across the stage, so everything turns with the downrange direction.
  const turn = normalizeRotation(frame - DEFAULT_DOWNRANGE_DEGREES);
  const preset = targetFamily ? defaultTargetPreset(targetFamily) : undefined;
  const objects: StageObject[] = [];
  for (const entry of LAYOUT) {
    const { x, y } = placeInFrame(entry.across, entry.toward, size, frame);
    let object = createObject(entry.type, entry.id, x, y, targetFamily);
    object = { ...object, rotation: turn } as StageObject;
    if (preset && object.type === 'cardboardTarget') {
      object = { ...object, geometry: { faceWidth: preset.width, faceHeight: preset.height }, presetId: preset.id, outline: copyOutline(preset.outline) };
    }
    const half = rotatedHalfExtents(object);
    // Skip optional scenery that cannot fit a very small stage; the start box is always kept.
    if (object.type !== 'start' && (half.x * 2 > size.width || half.y * 2 > size.depth)) continue;
    objects.push({ ...object, position: constrainPosition(object, object.position, size) } as StageObject);
  }
  return { schemaVersion: 7, coordinateSystem: 'inches', stage: size, downrangeDegrees, objects };
}
