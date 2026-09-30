export type TargetOutline = Readonly<{ kind: 'ellipse' | 'rectangle' }> | Readonly<{ kind: 'polygon'; points: readonly (readonly [number, number])[] }>;
export function validOutline(value: unknown): value is TargetOutline {
  if (!value || typeof value !== 'object') return false;
  const shape = value as TargetOutline;
  return shape.kind === 'ellipse' || shape.kind === 'rectangle' || shape.kind === 'polygon'
    && Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.length <= 64
    && shape.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1));
}
export const copyOutline = (shape: TargetOutline): TargetOutline => shape.kind === 'polygon'
  ? { kind: 'polygon', points: shape.points.map(p => [p[0], p[1]]) } : { ...shape };
