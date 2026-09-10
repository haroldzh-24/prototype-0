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

export type AddableType = Exclude<StageObject['type'], 'start'>;
/** Generate the ID once in the event handler, outside React's replayable state updater. */
export function addObject(stage: StageDocument, type: AddableType, id: string): StageDocument {
  if (stage.objects.some((object) => object.id === id)) throw new Error('Duplicate stage object ID: ' + id);
  const object = createObject(type, id, stage.stage.width / 2, stage.stage.depth / 2);
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

/** Required start objects cannot be deleted. Missing IDs are a harmless no-op. */
export function deleteObject(stage: StageDocument, id: string): StageDocument {
  const object = stage.objects.find(entry => entry.id === id);
  return !object || object.type === 'start' ? stage
    : { ...stage, objects: stage.objects.filter(entry => entry.id !== id) };
}

/** IDs are allocated by the editor event before invoking this pure operation. */
export function duplicateObject(stage: StageDocument, sourceId: string, id: string, portIds: readonly string[] = []): EditResult {
  const source = stage.objects.find(entry => entry.id === sourceId);
  if (!source || source.type === 'start') return { stage, error: 'Select a standalone object other than Start Position.' };
  const usedIds = new Set(stage.objects.flatMap(entry => [entry.id, ...(entry.type === 'wall' ? entry.ports.map(port => port.id) : [])]));
  const newIds = [id, ...portIds];
  if (newIds.some(value => !value.trim() || usedIds.has(value)) || new Set(newIds).size !== newIds.length) return { stage, error: 'Duplicate IDs must be fresh and unique.' };
  if (portIds.length !== (source.type === 'wall' ? source.ports.length : 0)) return { stage, error: 'Each duplicated port needs a fresh ID.' };
  const clone = <T extends StageObject>(object: T): T => ({ ...object, id, position: { ...object.position }, geometry: { ...object.geometry } });
  let copy: StageObject = clone(source);
  if (copy.type === 'wall') copy = { ...copy, ports: copy.ports.map((port, index) => ({ ...port, id: portIds[index] })) };
  if (copy.type === 'cardboardTarget' || copy.type === 'noShootTarget') copy = { ...copy, faceCut: { ...copy.faceCut } };
  // Prefer a one-foot offset; reverse direction near edges to avoid coincident copies.
  const candidates = [[12, 12], [-12, -12], [12, -12], [-12, 12]].map(([x, y]) =>
    constrainPosition(copy, { ...copy.position, x: copy.position.x + x, y: copy.position.y + y }, stage.stage));
  copy.position = candidates.find(p => Math.hypot(p.x - source.position.x, p.y - source.position.y) > 1e-8) ?? candidates[0];
  const index = stage.objects.findIndex(entry => entry.id === sourceId) + 1;
  return { stage: { ...stage, objects: [...stage.objects.slice(0, index), copy, ...stage.objects.slice(index)] } };
}
