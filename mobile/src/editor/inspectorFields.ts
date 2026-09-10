import type { StageObject } from '../stage/model';
import type { ObjectEdit } from '../stage/operations';
import { parseLength } from '../stage/measurements';

type Field = 'x' | 'y' | 'rotation' | 'width' | 'depth' | 'height' | 'z' | 'length' | 'thickness' | 'faceWidth' | 'faceHeight';
export const inspectorValues = (item: StageObject): Record<Field, string> => ({
  x: String(item.position.x), y: String(item.position.y), z: String(item.position.z),
  rotation: String(item.rotation), width: '', depth: '', height: '', length: '', thickness: '', faceWidth: '', faceHeight: '',
  ...Object.fromEntries(Object.entries(item.geometry).map(([key, value]) => [key, String(value)])),
});
export const inspectorFields = (item: StageObject): { key: Field; label: string }[] => [
    { key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'rotation', label: 'Rotation (degrees)' },
    ...(item.type === 'wall' ? [{ key: 'length' as const, label: 'Length' }, { key: 'thickness' as const, label: 'Thickness' }]
      : item.type === 'faultLine' ? [{ key: 'length' as const, label: 'Length' }]
      : item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? [{ key: 'faceWidth' as const, label: 'Face width' }, { key: 'faceHeight' as const, label: 'Face height' }]
      : [{ key: 'width' as const, label: 'Width' }, { key: 'depth' as const, label: 'Depth' }]),
    ...(item.type === 'start' || item.type === 'faultLine' ? [] : [...(item.type === 'cardboardTarget' || item.type === 'noShootTarget' ? [] : [{ key: 'height' as const, label: 'Height' }]), { key: 'z' as const, label: 'Bottom elevation' }]),
  ];

export function parseInspectorEdit(item: StageObject, draft: Record<Field, string>): { edit: ObjectEdit; error?: never } | { error: string; edit?: never } {
    const edit: ObjectEdit = {};
    const original = inspectorValues(item);
    for (const { key, label } of inspectorFields(item)) {
      const text = draft[key].trim();
      const value = key === 'rotation' ? (text === '' ? null : Number(text)) : parseLength(text);
      if (value === null || !Number.isFinite(value)) { return { error: 'Enter a valid measurement for ' + label + '.' }; }
      if (draft[key] === original[key]) continue;
      if (key === 'rotation') edit.rotation = value;
      else if (key === 'x' || key === 'y' || key === 'z') edit.position = { ...edit.position, [key]: value };
      else edit.geometry = { ...edit.geometry, [key]: value };
    }
    return { edit };
}
