import type { StagePosition } from '../stage/coordinates';

export type ShootingDifficulty = Readonly<{
  model: 'DISTANCE_ONLY';
  distanceInches: number;
  /** Dimensionless proxy: one point per yard. Higher is harder; not a time or probability. */
  score: number;
}>;

/** Ground-plane distance to the target reference position. Z is intentionally ignored:
 * target Z is its bottom reference and the route has no muzzle/eye elevation model.
 * Independent of timing/ranking so target type, partial geometry, transition angle,
 * visibility difficulty and shooter performance can be added in a later model.
 */
export function shootingDifficulty(position: StagePosition, target: StagePosition): ShootingDifficulty {
  const distanceInches = Math.hypot(target.x - position.x, target.y - position.y);
  if (![position.x, position.y, target.x, target.y, distanceInches].every(Number.isFinite))
    throw new Error('Shooting difficulty requires finite ground-plane coordinates and distance.');
  return { model: 'DISTANCE_ONLY', distanceInches, score: distanceInches / 36 };
}
