import { createDefaultStage } from '../stage/defaults';
import { createObjectId, createPortId } from '../stage/ids';
import type { StageDocument } from '../stage/model';
import { stageDownrange } from '../stage/orientation';
import { addObject, deleteObject, duplicateObject, editObject } from '../stage/operations';
import type { AddableType, EditResult, ObjectEdit } from '../stage/operations';
import { editSegmentMetrics, isSegment } from '../stage/segments';
import { snapRotation } from '../stage/snapping';
import type { RotationIncrement } from '../stage/snapping';
import { isTarget, rotateTarget } from '../stage/targetPlacement';
import type { TargetFamily } from '../stage/targetFamily';

export const objectPalette: readonly { type: AddableType; label: string }[] = [
  { type: 'cardboardTarget', label: 'Cardboard' }, { type: 'noShootTarget', label: 'No-Shoot' },
  { type: 'steelPlate', label: 'Steel Plate' }, { type: 'steelPopper', label: 'Popper' },
  { type: 'wall', label: 'Wall' }, { type: 'faultLine', label: 'Fault Line' },
];
export type ObjectAction = { kind: 'create'; type: AddableType; targetFamily?: TargetFamily }
  | { kind: 'reset'; targetFamily?: TargetFamily }
  | { kind: 'duplicate' | 'delete' };
export const validSelection = (stage: StageDocument, id: string | null): string | null =>
  stage.objects.some(object => object.id === id) ? id : null;

/**
 * Routes an inspector/rotation edit to the right validated operation.
 * - Rotation snaps to the active increment for every object type, not only through `editObject`.
 * - A wall or fault line's length and angle always pivot on its start endpoint, even when height or thickness
 *   change in the same edit; explicit X/Y edits move its centre instead.
 */
export function applyInspectorEdit(stage: StageDocument, id: string, edit: ObjectEdit, rotationIncrement: RotationIncrement): EditResult {
  const selected = stage.objects.find(object => object.id === id);
  if (!selected) return { stage, error: 'Select an object first.' };
  if (edit.rotation !== undefined && !Number.isFinite(edit.rotation)) return { stage, error: 'Enter a finite angle.' };
  const rotation = edit.rotation === undefined ? undefined : snapRotation(edit.rotation, rotationIncrement);
  if (isTarget(selected) && rotation !== undefined && !edit.position && !edit.geometry && !edit.ports && !edit.faceCut)
    return rotateTarget(stage, id, rotation);
  if (isSegment(selected) && !edit.position && !edit.ports && !edit.faceCut && (rotation !== undefined || edit.geometry?.length !== undefined)) {
    const metrics = editSegmentMetrics(stage, selected, edit.geometry?.length ?? selected.geometry.length, rotation ?? selected.rotation);
    if (metrics.error) return metrics;
    const { length: _length, ...rest } = edit.geometry ?? {};
    if (Object.keys(rest).length === 0) return metrics;
    const withRest = editObject(metrics.stage, id, { geometry: rest }, null);
    return withRest.error ? { stage, error: withRest.error } : withRest;
  }
  return editObject(stage, id, rotation === undefined ? edit : { ...edit, rotation }, rotationIncrement);
}

/** Event-level adapter: selection stays outside StageDocument; UUID generation is not replayed in state updaters. */
export function applyObjectAction(stage: StageDocument, selectedId: string | null, action: ObjectAction, randomUUID: () => string):
  { stage: StageDocument; selectedId: string | null; error?: string } {
  // Reset restores the default layout but keeps the stage's own settings: match family, size and downrange.
  if (action.kind === 'reset') return { stage: createDefaultStage(action.targetFamily, { size: stage.stage, downrangeDegrees: stageDownrange(stage) }), selectedId: null };
  if (action.kind === 'create') {
    const id = createObjectId(action.type, randomUUID);
    return { stage: addObject(stage, action.type, id, action.targetFamily), selectedId: id };
  }
  const selection = validSelection(stage, selectedId);
  const source = stage.objects.find(object => object.id === selection);
  if (!source || source.type === 'start') return { stage, selectedId: selection };
  if (action.kind === 'delete') return { stage: deleteObject(stage, source.id), selectedId: null };
  const id = createObjectId(source.type, randomUUID);
  const ports = source.type === 'wall' ? source.ports.map(() => createPortId(randomUUID)) : [];
  const result = duplicateObject(stage, source.id, id, ports);
  return { ...result, selectedId: result.error ? selection : id };
}
