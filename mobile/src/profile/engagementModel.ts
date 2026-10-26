/**
 * Shooting-time models from your drill-library runs (roadmap C4), next to the split-by-distance curve:
 * - transitions by how far the gun swings between targets (degrees, seen from where you stand), fitted as
 *   time = base + per-degree × swing from Blake, Wide transitions and El Presidente runs;
 * - splits on partly covered targets by distance (Hostage / partial drill);
 * - steel: time per plate by distance (Steel drill, clean runs).
 * Nothing here is a default: no runs, no model, and callers fall back to the profile's single values.
 */
export type CurvePoint = { yards: number; seconds: number; runs: number };
export type TransitionFit = {
  baseSeconds: number; secondsPerDegree: number; runs: number; minDegrees: number; maxDegrees: number;
  /** FIT: 2+ swings far enough apart. AVERAGE: one swing size, so the mean (no per-degree cost). */
  method: 'FIT' | 'AVERAGE';
};
export type EngagementModel = { transitions?: TransitionFit; partialSplits?: CurvePoint[]; steelPlates?: CurvePoint[] };

/** Degrees the gun swings between two targets `spread` apart at `distance` (both inches), straight on. */
export const swingDegrees = (spreadInches: number, distanceInches: number) => 2 * Math.atan(spreadInches / 2 / distanceInches) * 180 / Math.PI;
/** Angle between two targets seen from a point (ground plane), degrees 0–180. */
export function swingBetween(from: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const ha = Math.atan2(a.y - from.y, a.x - from.x), hb = Math.atan2(b.y - from.y, b.x - from.x);
  const d = Math.abs(ha - hb) * 180 / Math.PI;
  return d > 180 ? 360 - d : d;
}

/** Swings closer than this count as the same size for fitting. */
const SAME_SWING = 5;
export function fitTransitions(samples: readonly { degrees: number; seconds: number }[]): TransitionFit | undefined {
  const ok = samples.filter(s => Number.isFinite(s.degrees) && s.degrees > 0 && s.degrees < 180 && Number.isFinite(s.seconds) && s.seconds > 0 && s.seconds < 10);
  if (!ok.length) return undefined;
  const xs = ok.map(s => s.degrees), ys = ok.map(s => s.seconds), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const range = { runs: ok.length, minDegrees: Math.min(...xs), maxDegrees: Math.max(...xs) };
  if (range.maxDegrees - range.minDegrees >= SAME_SWING) {
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
    if (slope > 0 && my - slope * mx >= 0) return { baseSeconds: my - slope * mx, secondsPerDegree: slope, method: 'FIT', ...range };
  }
  return { baseSeconds: my, secondsPerDegree: 0, method: 'AVERAGE', ...range };
}

/** Mean seconds per distance (pooled within half a yard). */
export function buildCurve(samples: readonly { yards: number; seconds: number }[]): CurvePoint[] | undefined {
  const groups = new Map<number, number[]>();
  for (const s of samples) if (Number.isFinite(s.yards) && s.yards > 0 && Number.isFinite(s.seconds) && s.seconds > 0) {
    const key = Math.round(s.yards * 2) / 2; groups.set(key, [...(groups.get(key) ?? []), s.seconds]);
  }
  const points = [...groups].sort((a, b) => a[0] - b[0]).map(([yards, v]) => ({ yards, runs: v.length, seconds: v.reduce((a, b) => a + b, 0) / v.length }));
  return points.length ? points : undefined;
}

export type CurveAt = { seconds: number; runs: number; source: 'MEASURED' | 'BETWEEN'; fromYards: number[] };
/** Within your logged distances only (no extrapolation): measured, or blended between the two nearest. */
export function curveAt(points: readonly CurvePoint[] | undefined, yards: number): CurveAt | null {
  if (!points?.length || !Number.isFinite(yards)) return null;
  const exact = points.find(p => Math.abs(p.yards - yards) < 0.25);
  if (exact) return { seconds: exact.seconds, runs: exact.runs, source: 'MEASURED', fromYards: [exact.yards] };
  const above = points.findIndex(p => p.yards > yards);
  if (above <= 0) return null;
  const lo = points[above - 1], hi = points[above], t = (yards - lo.yards) / (hi.yards - lo.yards);
  return { seconds: lo.seconds + (hi.seconds - lo.seconds) * t, runs: lo.runs + hi.runs, source: 'BETWEEN', fromYards: [lo.yards, hi.yards] };
}

export type TransitionAt = { seconds: number; fit: TransitionFit; beyondData: boolean };
export function transitionAt(fit: TransitionFit | undefined, degrees: number): TransitionAt | null {
  if (!fit || !Number.isFinite(degrees) || degrees < 0) return null;
  return { seconds: fit.baseSeconds + fit.secondsPerDegree * degrees, fit, beyondData: fit.method === 'FIT' && degrees > fit.maxDegrees + SAME_SWING };
}

const validCurve = (c: unknown): c is CurvePoint[] => Array.isArray(c) && c.length > 0 && c.length <= 200
  && c.every(p => p && Number.isFinite(p.yards) && p.yards > 0 && Number.isFinite(p.seconds) && p.seconds > 0 && p.seconds < 60 && Number.isSafeInteger(p.runs) && p.runs > 0);
const validFit = (f: unknown): f is TransitionFit => {
  const x = f as TransitionFit;
  return !!x && typeof x === 'object' && Number.isFinite(x.baseSeconds) && x.baseSeconds >= 0 && x.baseSeconds < 10
    && Number.isFinite(x.secondsPerDegree) && x.secondsPerDegree >= 0 && x.secondsPerDegree < 1 && Number.isSafeInteger(x.runs) && x.runs > 0
    && Number.isFinite(x.minDegrees) && Number.isFinite(x.maxDegrees) && x.maxDegrees >= x.minDegrees && ['FIT', 'AVERAGE'].includes(x.method);
};
/** Keeps well-formed parts only (saved profiles are untrusted). */
export function validEngagementModel(input: unknown): EngagementModel | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const m = input as EngagementModel, out: EngagementModel = {};
  if (validFit(m.transitions)) out.transitions = { ...m.transitions };
  if (validCurve(m.partialSplits)) out.partialSplits = m.partialSplits.map(p => ({ ...p }));
  if (validCurve(m.steelPlates)) out.steelPlates = m.steelPlates.map(p => ({ ...p }));
  return Object.keys(out).length ? out : undefined;
}
