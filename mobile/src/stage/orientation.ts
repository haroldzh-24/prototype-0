import { normalizeRotation } from './geometry';
import type { StageDocument } from './model';

/**
 * Downrange is a stage-plane heading in degrees, using the same convention as object rotation:
 * 0 = +X (right on screen), 90 = +Y (down on screen), 180 = left, 270 = up on screen.
 * It is the direction of the backstop, i.e. the centre of the safe 180-degree half-plane.
 */
export const DEFAULT_DOWNRANGE_DEGREES = 270;

export const DOWNRANGE_CHOICES: readonly { label: string; degrees: number }[] = Object.freeze([
  { label: 'Up', degrees: 270 },
  { label: 'Right', degrees: 0 },
  { label: 'Down', degrees: 90 },
  { label: 'Left', degrees: 180 },
]);

export const validDownrange = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Documents saved before downrange existed read as the default (up the screen). */
export function stageDownrange(document: Pick<StageDocument, 'downrangeDegrees'>): number {
  return validDownrange(document.downrangeDegrees) ? normalizeRotation(document.downrangeDegrees) : DEFAULT_DOWNRANGE_DEGREES;
}

export function setStageDownrange(document: StageDocument, degrees: number): { stage: StageDocument; error?: string } {
  if (!validDownrange(degrees)) return { stage: document, error: 'Downrange must be a finite angle.' };
  return { stage: { ...document, downrangeDegrees: normalizeRotation(degrees) } };
}

export function downrangeLabel(degrees: number): string {
  const normalized = normalizeRotation(degrees);
  const choice = DOWNRANGE_CHOICES.find(c => Math.abs(c.degrees - normalized) < 1e-9);
  return choice ? choice.label : `${Number(normalized.toFixed(1))}°`;
}

/** Nearest cardinal heading, used only where a layout needs one of the four screen directions. */
export function nearestCardinal(degrees: number): 0 | 90 | 180 | 270 {
  return ((Math.round(normalizeRotation(degrees) / 90) * 90) % 360) as 0 | 90 | 180 | 270;
}
