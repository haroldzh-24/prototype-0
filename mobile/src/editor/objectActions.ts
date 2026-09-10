import { createDefaultStage } from '../stage/defaults';
import { createObjectId, createPortId } from '../stage/ids';
import type { StageDocument } from '../stage/model';
import { addObject, deleteObject, duplicateObject } from '../stage/operations';
import type { AddableType } from '../stage/operations';

export const objectPalette: readonly { type: AddableType; label: string }[] = [
  { type: 'cardboardTarget', label: 'Cardboard' }, { type: 'noShootTarget', label: 'No-Shoot' },
  { type: 'steelPlate', label: 'Steel Plate' }, { type: 'steelPopper', label: 'Popper' },
  { type: 'wall', label: 'Wall' }, { type: 'faultLine', label: 'Fault Line' },
];
export type ObjectAction = { kind: 'create'; type: AddableType } | { kind: 'duplicate' | 'delete' | 'reset' };
export const validSelection = (stage: StageDocument, id: string | null): string | null =>
  stage.objects.some(object => object.id === id) ? id : null;

/** Event-level adapter: selection stays outside StageDocument; UUID generation is not replayed in state updaters. */
export function applyObjectAction(stage: StageDocument, selectedId: string | null, action: ObjectAction, randomUUID: () => string):
  { stage: StageDocument; selectedId: string | null; error?: string } {
  if (action.kind === 'reset') return { stage: createDefaultStage(), selectedId: null };
  if (action.kind === 'create') {
    const id = createObjectId(action.type, randomUUID);
    return { stage: addObject(stage, action.type, id), selectedId: id };
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
