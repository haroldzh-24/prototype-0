import type { FacePreset, StageDocument } from './model';
import type { StagePosition } from './coordinates';
import { createDefaultStage } from './defaults';
import { editObject } from './operations';
import { facePresets } from './targetFace';
import { addLayer, hardCoverFromPreset, hardCoverPresets, isPaper, setHardCover } from './targetLayers';
import type { HardCoverPreset } from './targetLayers';
import { placeTarget } from './targetPlacement';
import type { TargetPreset } from './targetPresets';

/**
 * Partial targets: paper targets placed with their cover already set (the ADD menu's PARTIAL ring). Nothing new is
 * stored: each one is an ordinary paper target built from what LAYERS already makes, so after placing it its cover
 * changes in LAYERS like any other target's.
 * - Hard cover: one of the five painted presets (`hardCoverPresets`, targetLayers.ts).
 * - Half target: a face cut (`facePresets`, targetFace.ts) that keeps the upper, lower, left or right half.
 * - HOSTAGE: a no-shoot layered on top (`addLayer` 'noShoot', its default place over the lower left).
 * - DOUBLES: a second scoring target layered behind (`addLayer` 'target', its default place to the right).
 */
export type HalfPreset = Exclude<FacePreset, 'full'>;
export type PartialKind =
  | { kind: 'cover'; preset: HardCoverPreset }
  | { kind: 'half'; preset: HalfPreset }
  | { kind: 'hostage' }
  | { kind: 'doubles' };
export type PartialChoice = { key: string; label: string; detail: string; partial: PartialKind };

/**
 * The painted presets are drawn on a USPSA/IPSC torso's landmarks (neck, shoulders, head width), so they are offered
 * only on the USPSA family's torso target (the USPSA Target and the half-size USPSA Target).
 */
export const coverFits = (preset: Pick<TargetPreset, 'type' | 'family' | 'cardboardType'>) =>
  preset.type === 'cardboardTarget' && preset.family === 'USPSA' && preset.cardboardType === 'USPSA';

const halfDetail: Record<HalfPreset, string> = {
  upper: 'Only the upper half of the face; the lower half is cut away.',
  lower: 'Only the lower half of the face; the upper half is cut away.',
  left: 'Only the left half of the face; the right half is cut away.',
  right: 'Only the right half of the face; the left half is cut away.',
};

/** The PARTIAL ring for one paper target: hard cover (where it fits), half targets, HOSTAGE and DOUBLES. */
export function partialChoices(preset: TargetPreset): PartialChoice[] {
  if (preset.type !== 'cardboardTarget') return [];
  const covers = coverFits(preset) ? hardCoverPresets.map(p => ({ key: 'cover-' + p.preset, label: p.label, detail: p.detail, partial: { kind: 'cover' as const, preset: p.preset } })) : [];
  const halves = facePresets.filter((p): p is { preset: HalfPreset; label: string } => p.preset !== 'full')
    .map(p => ({ key: 'half-' + p.preset, label: p.label.toUpperCase(), detail: halfDetail[p.preset], partial: { kind: 'half' as const, preset: p.preset } }));
  return [...covers, ...halves,
    { key: 'hostage', label: 'HOSTAGE', detail: 'A no-shoot of the same size on top, over the lower left. Slide or turn it in LAYERS.', partial: { kind: 'hostage' } },
    { key: 'doubles', label: 'DOUBLES', detail: 'A second scoring target of the same size behind it, to the right. Slide or turn it in LAYERS.', partial: { kind: 'doubles' } }];
}

/** The ring label of a partial target ("HEAD ONLY", "UPPER PORTION", "HOSTAGE"). */
export function partialLabel(partial: PartialKind): string {
  if (partial.kind === 'cover') return hardCoverPresets.find(p => p.preset === partial.preset)?.label ?? 'HARD COVER';
  if (partial.kind === 'half') return (facePresets.find(p => p.preset === partial.preset)?.label ?? 'Half').toUpperCase();
  return partial.kind === 'hostage' ? 'HOSTAGE' : 'DOUBLES';
}

/**
 * Place a paper target with its cover set, as one change: the target (`ids.target`), then its paint (`ids.cover`), face
 * cut, or layered no-shoot or second target (`ids.layer`). Returns the stage unchanged with an error if any part fails.
 */
export function placePartial(stage: StageDocument, presetId: string, partial: PartialKind, point: StagePosition,
  ids: { target: string; layer: string; cover: string }): { stage: StageDocument; error?: string } {
  const placed = placeTarget(stage, presetId, ids.target, point);
  if (placed.error) return placed;
  const target = placed.stage.objects.find(o => o.id === ids.target);
  if (!isPaper(target)) return { stage, error: 'Partial targets are paper targets.' };
  if (partial.kind === 'cover') {
    const cover = hardCoverFromPreset(partial.preset, target.geometry.faceWidth, target.geometry.faceHeight, ids.cover);
    return { stage: setHardCover(placed.stage, ids.target, () => [cover]) };
  }
  const result = partial.kind === 'half' ? editObject(placed.stage, ids.target, { faceCut: { kind: 'preset', preset: partial.preset } })
    : addLayer(placed.stage, ids.target, partial.kind === 'hostage' ? 'noShoot' : 'target', ids.layer);
  return result.error ? { stage, error: result.error } : { stage: result.stage };
}

/** A one-target stage showing a partial target, for its picture in the ring and on its card (stackArtSvg). */
export function partialPreview(preset: TargetPreset, partial: PartialKind): { stage: StageDocument; id: string } {
  const empty = { ...createDefaultStage(preset.family), objects: [] };
  const at: StagePosition = { space: 'stage', x: empty.stage.width / 2, y: empty.stage.depth / 2, z: 0 };
  return { stage: placePartial(empty, preset.id, partial, at, { target: 'preview', layer: 'preview-layer', cover: 'preview-cover' }).stage, id: 'preview' };
}
