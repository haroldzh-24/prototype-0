import type { FaceCut, FacePreset, StageObject } from './model';

export const facePresets: readonly { preset: FacePreset; label: string }[] = [
  { preset: 'full', label: 'Full' }, { preset: 'upper', label: 'Upper Portion' },
  { preset: 'lower', label: 'Lower Portion' }, { preset: 'left', label: 'Left Portion' },
  { preset: 'right', label: 'Right Portion' },
];
export function validFaceCut(value: unknown): value is FaceCut {
  if (!value || typeof value !== 'object') return false;
  const cut = value as Record<string, unknown>;
  return cut.kind === 'preset' && facePresets.some(entry => entry.preset === cut.preset)
    && Object.keys(cut).every(key => key === 'kind' || key === 'preset');
}

/** Actual face rectangle in local X/Z, relative to the full-face center/bottom reference.
 * This is physical material, not visible material after occlusion. Each portion retains exactly half.
 * Future polygon variants can provide vertices through this geometry boundary.
 */
export function activeFaceExtent(object: Extract<StageObject, { type: 'cardboardTarget' | 'noShootTarget' }>) {
  const { faceWidth: w, faceHeight: h } = object.geometry;
  const preset = object.faceCut.preset;
  return { left: preset === 'right' ? 0 : -w / 2, right: preset === 'left' ? 0 : w / 2,
    bottom: preset === 'upper' ? h / 2 : 0, top: preset === 'lower' ? h / 2 : h };
}
