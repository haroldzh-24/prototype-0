import { createObject } from './defaults';
import { targetPreset } from './targetPresets';
import { copyOutline } from './targetShape';
import type { StageDocument, StageObject } from './model';
import type { StagePosition } from './coordinates';
import { normalizeRotation } from './geometry';

export type TargetObject = Extract<StageObject, { type: 'cardboardTarget' | 'noShootTarget' | 'steelPlate' | 'steelPopper' }>;
export function isTarget(object: StageObject): object is TargetObject { return ['cardboardTarget', 'noShootTarget', 'steelPlate', 'steelPopper'].includes(object.type); }
export const targetScreenSize = (item: TargetObject, scale: number) => ({ width: item.geometry.faceWidth * scale, height: item.geometry.faceHeight * scale });
export function placeTarget(stage: StageDocument, presetId: string, id: string, position: StagePosition, noShoot = false): { stage: StageDocument; error?: string } {
  const preset = targetPreset(presetId);
  if (!preset || !id.trim() || stage.objects.some(o => o.id === id)) return { stage, error: 'Choose a known preset and a fresh target ID.' };
  if (![position.x, position.y, position.z].every(Number.isFinite) || position.space !== 'stage' || position.z < 0 || position.x < 0 || position.y < 0 || position.x > stage.stage.width || position.y > stage.stage.depth)
    return { stage, error: 'Place the target inside the stage boundary.' };
  const object = createObject(noShoot && preset.type === 'cardboardTarget' ? 'noShootTarget' : preset.type, id, position.x, position.y, preset.family) as TargetObject;
  object.geometry = { faceWidth: preset.width, faceHeight: preset.height };
  object.presetId = preset.id; object.outline = copyOutline(preset.outline);
  // Preserve the exact deliberate tap. Do not silently shift it to fit an edge.
  const index = stage.objects.findIndex(o => o.type === 'wall' || o.type === 'faultLine');
  const at = index < 0 ? stage.objects.length : index;
  return { stage: { ...stage, objects: [...stage.objects.slice(0, at), object, ...stage.objects.slice(at)] } };
}
/** Rotation is about the saved anchor, even near/outside a resized boundary. */
export function rotateTarget(stage: StageDocument, id: string, angle: number) {
  if (!Number.isFinite(angle)) return { stage, error: 'Enter a finite angle.' };
  const object = stage.objects.find(o => o.id === id);
  if (!object || !isTarget(object)) return { stage, error: 'Select a target.' };
  return { stage: { ...stage, objects: stage.objects.map(o => o.id === id ? { ...o, rotation: normalizeRotation(angle) } : o) } };
}
/** Shortest signed change avoids discontinuities when a wheel crosses north. */
export const angularDelta = (from: number, to: number) => ((to - from + 540) % 360 + 360) % 360 - 180;
