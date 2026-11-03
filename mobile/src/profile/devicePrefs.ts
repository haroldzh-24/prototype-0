import { readPref, writePref } from '../ui/prefsStore';
import type { Side } from '../training/movementPhases';

/**
 * Settings kept on this phone (not in the profile database), set in Profile. Training reads the shooting hand for the
 * movement breakdown; WALK in the stage editor reads the eye height (stage3d/EyeLevelView.tsx, same key and limits).
 */
export const SHOOTING_HAND_KEY = 'psp.shootingHand';
export const EYE_HEIGHT_KEY = 'psp.eyeHeight', EYE_HEIGHT_DEFAULT = 63, EYE_HEIGHT_LIMITS = [36, 84] as const;

export const readShootingHand = (): Side => readPref(SHOOTING_HAND_KEY) === 'left' ? 'left' : 'right';
export const writeShootingHand = (hand: Side) => writePref(SHOOTING_HAND_KEY, hand);

/** Inches; anything missing or outside 36–84 reads as the default (as WALK does). */
export function readEyeHeight(): number {
  const raw = readPref(EYE_HEIGHT_KEY), v = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return v >= EYE_HEIGHT_LIMITS[0] && v <= EYE_HEIGHT_LIMITS[1] ? v : EYE_HEIGHT_DEFAULT;
}
export function writeEyeHeight(inches: number): number {
  const v = Math.min(EYE_HEIGHT_LIMITS[1], Math.max(EYE_HEIGHT_LIMITS[0], Math.round(inches)));
  writePref(EYE_HEIGHT_KEY, String(v));
  return v;
}
export const feetAndInches = (inches: number) => `${Math.floor(inches / 12)} ft ${Math.round(inches % 12)} in`;
