import { validFaceCut } from './targetFace';
import type { FaceCut } from './model';
import { validatePorts } from './ports';
import type { FiringPort } from './model';
import type { StagePosition } from './coordinates';
import { createObject } from './defaults';
import { constrainPosition, rotatedHalfExtents, footprint } from './geometry';
import { snapRotation } from './snapping';
import type { RotationIncrement } from './snapping';
import type { ObjectGeometry, WallGeometry, TargetGeometry, StageDocument, StageObject } from './model';

export type ObjectEdit = {
  faceCut?: FaceCut;
  ports?: readonly FiringPort[];
  position?: Partial<Pick<StagePosition, 'x' | 'y' | 'z'>>;
  geometry?: Partial<ObjectGeometry & WallGeometry & TargetGeometry>;
  rotation?: number;
};
export type EditResult = { stage: StageDocument; error?: string };

/** Atomic validated edits. Inspector, dragging, and rotation share this boundary rule. */
export function editObject(stage: StageDocument, id: string, edit: ObjectEdit, rotationIncrement: RotationIncrement = null): EditResult {
  const original = stage.objects.find((object) => object.id === id);
  if (!original) return { stage, error: 'Object no longer exists.' };
  if (edit.ports !== undefined && original.type !== 'wall') return { stage, error: 'Only walls can contain ports.' };
  if (edit.faceCut !== undefined && ((original.type !== 'cardboardTarget' && original.type !== 'noShootTarget') || !validFaceCut(edit.faceCut))) return { stage, error: 'Invalid physical target-face preset.' };
  const position = { ...original.position, ...edit.position };
  const allowed = original.type === 'wall' ? ['length', 'thickness', 'height']
    : original.type === 'faultLine' ? ['length']
    : original.type === 'cardboardTarget' || original.type === 'noShootTarget' || original.type === 'steelPlate' || original.type === 'steelPopper' ? ['faceWidth', 'faceHeight'] : ['width', 'depth', 'height'];
  if (Object.keys(edit.geometry ?? {}).some((key) => !allowed.includes(key))) {
    return { stage, error: 'This geometry field does not apply to this object type.' };
  }
  const rotation = edit.rotation ?? original.rotation;
  // Narrow each branch so geometry stays paired with its discriminator.
  let updated: StageObject;
  switch (original.type) {
    case 'wall': updated = { ...original, ports: edit.ports ?? original.ports, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'faultLine': updated = { ...original, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'noShootTarget': updated = { ...original, faceCut: edit.faceCut ?? original.faceCut, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'cardboardTarget': updated = { ...original, faceCut: edit.faceCut ?? original.faceCut, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'steelPlate': updated = { ...original, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'steelPopper': updated = { ...original, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
    case 'start': updated = { ...original, position, geometry: { ...original.geometry, ...edit.geometry } }; break;
  }
  const { width, depth } = footprint(updated);
  const target = updated.type === 'cardboardTarget' || updated.type === 'noShootTarget' || updated.type === 'steelPlate' || updated.type === 'steelPopper';
  const height = updated.type === 'cardboardTarget' || updated.type === 'noShootTarget' || updated.type === 'steelPlate' || updated.type === 'steelPopper' ? updated.geometry.faceHeight : updated.type === 'faultLine' ? 0 : updated.geometry.height;
  if (![position.x, position.y, position.z, width, depth, height, rotation].every(Number.isFinite)) {
    return { stage, error: 'All values must be finite numbers.' };
  }
  if (width <= 0 || (target ? depth !== 0 : depth <= 0) || height < 0 || position.z < 0 ||
    ((target || original.type === 'wall') && height === 0)) {
    return { stage, error: 'Dimensions must be positive; elevation cannot be negative.' };
  }
  if ((original.type === 'start' || original.type === 'faultLine') && (height !== 0 || position.z !== 0)) {
    return { stage, error: 'Ground objects must remain at zero height/elevation.' };
  }
  if (updated.type === 'wall') {
    const error = validatePorts(updated.geometry, updated.ports);
    if (error) return { stage, error };
    const otherIds = new Set(stage.objects.flatMap(object => object.type === 'wall' && object.id !== id ? object.ports.map(port => port.id) : []));
    if (updated.ports.some(port => otherIds.has(port.id))) return { stage, error: 'Port IDs must be unique across walls.' };
  }
  updated.rotation = edit.rotation === undefined ? original.rotation : snapRotation(rotation, rotationIncrement);
  const half = rotatedHalfExtents(updated);
  if ((edit.geometry || edit.rotation !== undefined || edit.faceCut !== undefined) &&
    (half.x * 2 > stage.stage.width + 1e-8 || half.y * 2 > stage.stage.depth + 1e-8)) {
    return { stage, error: 'The rotated object is too large for this workspace. Reduce its dimensions or rotation.' };
  }
  const bounded = constrainPosition(updated, position, stage.stage);
  if (edit.faceCut !== undefined && (Math.abs(bounded.x - position.x) > 1e-8 || Math.abs(bounded.y - position.y) > 1e-8)) return { stage, error: 'This preset does not fit at the current position. Move the target inward first.' };
  updated.position = edit.faceCut !== undefined ? position : bounded;
  return { stage: { ...stage, objects: stage.objects.map((object) => object.id === id ? updated : object) } };
}

export function moveObject(stage: StageDocument, id: string, position: StagePosition): StageDocument {
  return editObject(stage, id, { position }).stage;
}

export function rotateObject(stage: StageDocument, id: string, delta: number, increment: RotationIncrement = null): StageDocument {
  const object = stage.objects.find((entry) => entry.id === id);
  return object ? editObject(stage, id, { rotation: object.rotation + delta }, increment).stage : stage;
}

type AddableType = 'cardboardTarget' | 'noShootTarget' | 'steelPlate' | 'steelPopper' | 'wall' | 'faultLine';
/** Generate the ID once in the event handler, outside React's replayable state updater. */
export function addObject(stage: StageDocument, type: AddableType, id: string): StageDocument {
  if (stage.objects.some((object) => object.id === id)) throw new Error('Duplicate stage object ID: ' + id);
  const object = createObject(type, id, (type === 'cardboardTarget' || type === 'noShootTarget' || type === 'steelPlate' || type === 'steelPopper') ? 216 : 168, (type === 'cardboardTarget' || type === 'noShootTarget' || type === 'steelPlate' || type === 'steelPopper') ? 168 : type === 'faultLine' ? 240 : 144);
  object.position = constrainPosition(object, object.position, stage.stage);
  const order = { start: 0, cardboardTarget: 1, noShootTarget: 1, steelPlate: 1, steelPopper: 1, faultLine: 2, wall: 3 };
  const nextLayer = stage.objects.findIndex((entry) => order[entry.type] > order[type]);
  const index = nextLayer === -1 ? stage.objects.length : nextLayer;
  return { ...stage, objects: [...stage.objects.slice(0, index), object, ...stage.objects.slice(index)] };
}

export function removeLastObject(stage: StageDocument, type: AddableType): StageDocument {
  const last = stage.objects.filter((object) => object.type === type).at(-1);
  return last ? { ...stage, objects: stage.objects.filter((object) => object.id !== last.id) } : stage;
}
