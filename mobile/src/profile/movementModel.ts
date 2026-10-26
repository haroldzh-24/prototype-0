/**
 * Movement timing from your own sprint and shuffle runs (drill library, C1).
 *
 * A move between two shooting positions is timed from the last shot before it to the first shot after it, so it
 * includes getting going and settling into the next position. Fitting time = overhead + distance / speed separates
 * that fixed cost from top speed. Each direction relative to downrange (forward, sideways, back) gets its own fit
 * when it has runs at two or more distances; otherwise it shares the overhead fitted across all directions.
 *
 * Nothing here is a generic estimate: with no runs there is no model and callers keep the profile's average speed.
 */
export const moveDirections = ['forward', 'lateral', 'back'] as const;
export type MoveDirection = typeof moveDirections[number];
export const moveDirectionLabels: Record<MoveDirection, string> = { forward: 'Forward', lateral: 'Sideways', back: 'Back' };

export type MoveSample = { direction?: MoveDirection; distanceInches: number; durationSeconds: number };
export type MoveFit = {
  /** Fixed cost of a move: starting, stopping and settling, seconds. */
  overheadSeconds: number;
  /** Speed once moving, inches per second. */
  inchesPerSecond: number;
  sampleCount: number;
  /** Shortest and longest measured move, inches. */
  minInches: number; maxInches: number;
  /** FIT: own runs at 2+ distances. SHARED_OVERHEAD: overhead from all directions, speed from these runs.
   *  AVERAGE_SPEED: one distance only, overhead not separable (time = distance / average speed). */
  method: 'FIT' | 'SHARED_OVERHEAD' | 'AVERAGE_SPEED';
};
export type MovementModel = Partial<Record<MoveDirection | 'all', MoveFit>>;

// Corruption guards, not predictions: 600 in/s is about 34 mph.
const MAX_SPEED = 600, MAX_OVERHEAD = 10;
/** Distances closer than this count as the same distance for fitting. */
const SAME_DISTANCE = 6;

const usable = (s: MoveSample) => [s.distanceInches, s.durationSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
  && s.distanceInches / s.durationSeconds <= MAX_SPEED;

function regress(samples: readonly MoveSample[]): { a: number; b: number } | null {
  const d = samples.map(s => s.distanceInches), t = samples.map(s => s.durationSeconds);
  if (Math.max(...d) - Math.min(...d) < SAME_DISTANCE) return null;
  const n = d.length, md = d.reduce((x, v) => x + v, 0) / n, mt = t.reduce((x, v) => x + v, 0) / n;
  let sdd = 0, sdt = 0;
  for (let i = 0; i < n; i++) { sdd += (d[i] - md) ** 2; sdt += (d[i] - md) * (t[i] - mt); }
  let b = sdt / sdd, a = mt - b * md;
  if (!(b > 0)) return null;
  // Slower at short distances than a straight line through zero allows is the normal case; faster is noise.
  if (a < 0) { a = 0; b = d.reduce((x, v, i) => x + v * t[i], 0) / d.reduce((x, v) => x + v * v, 0); }
  if (1 / b > MAX_SPEED || a > MAX_OVERHEAD) return null;
  return { a, b };
}
const range = (samples: readonly MoveSample[]) => ({ sampleCount: samples.length,
  minInches: Math.min(...samples.map(s => s.distanceInches)), maxInches: Math.max(...samples.map(s => s.distanceInches)) });
function averageSpeed(samples: readonly MoveSample[]): MoveFit {
  const d = samples.reduce((x, s) => x + s.distanceInches, 0), t = samples.reduce((x, s) => x + s.durationSeconds, 0);
  return { overheadSeconds: 0, inchesPerSecond: d / t, method: 'AVERAGE_SPEED', ...range(samples) };
}

/** Per-direction fits plus `all` (every sample, including moves with no recorded direction). */
export function fitMovement(input: readonly MoveSample[]): MovementModel {
  const samples = input.filter(usable);
  if (!samples.length) return {};
  const pooled = regress(samples);
  const model: MovementModel = { all: pooled ? { overheadSeconds: pooled.a, inchesPerSecond: 1 / pooled.b, method: 'FIT', ...range(samples) } : averageSpeed(samples) };
  for (const direction of moveDirections) {
    const own = samples.filter(s => s.direction === direction);
    if (!own.length) continue;
    const fit = regress(own);
    if (fit) { model[direction] = { overheadSeconds: fit.a, inchesPerSecond: 1 / fit.b, method: 'FIT', ...range(own) }; continue; }
    const moving = own.reduce((x, s) => x + s.durationSeconds - (pooled?.a ?? 0), 0);
    if (pooled && pooled.a > 0 && own.every(s => s.durationSeconds > pooled.a) && moving > 0) {
      const speed = own.reduce((x, s) => x + s.distanceInches, 0) / moving;
      if (speed <= MAX_SPEED) { model[direction] = { overheadSeconds: pooled.a, inchesPerSecond: speed, method: 'SHARED_OVERHEAD', ...range(own) }; continue; }
    }
    model[direction] = averageSpeed(own);
  }
  return model;
}

/** Forward is toward downrange (within 45 degrees), back is away from it, anything else is sideways. */
export function moveDirection(from: { x: number; y: number }, to: { x: number; y: number }, downrangeDegrees: number): MoveDirection | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 1e-9 || !Number.isFinite(downrangeDegrees)) return null;
  const heading = Math.atan2(dy, dx) * 180 / Math.PI;
  const off = Math.abs(((heading - downrangeDegrees) % 360 + 540) % 360 - 180);
  return off <= 45 ? 'forward' : off >= 135 ? 'back' : 'lateral';
}

export type MovePrediction = { seconds: number; fit: MoveFit; direction: MoveDirection | 'all';
  /** Longer than any measured move of this kind: the fitted line is extended past your data. */
  beyondData: boolean };

/**
 * Time for one move. Below the shortest measured move the time scales down in a straight line to zero (a lean
 * or a half step costs less than a full shuffle); past the longest it follows the fitted line and says so.
 */
export function predictMove(model: MovementModel | undefined, direction: MoveDirection | null, distanceInches: number): MovePrediction | null {
  if (!model || !Number.isFinite(distanceInches) || distanceInches < 0) return null;
  const key = direction && model[direction] ? direction : 'all', fit = model[key];
  if (!fit || !validMoveFit(fit)) return null;
  if (distanceInches === 0) return { seconds: 0, fit, direction: key, beyondData: false };
  const line = (d: number) => fit.overheadSeconds + d / fit.inchesPerSecond;
  const seconds = distanceInches < fit.minInches ? line(fit.minInches) * distanceInches / fit.minInches : line(distanceInches);
  return { seconds, fit, direction: key, beyondData: distanceInches > fit.maxInches + SAME_DISTANCE };
}

export function validMoveFit(fit: unknown): fit is MoveFit {
  const f = fit as MoveFit;
  return !!f && typeof f === 'object' && Number.isFinite(f.overheadSeconds) && f.overheadSeconds >= 0 && f.overheadSeconds <= MAX_OVERHEAD
    && Number.isFinite(f.inchesPerSecond) && f.inchesPerSecond > 0 && f.inchesPerSecond <= MAX_SPEED
    && Number.isSafeInteger(f.sampleCount) && f.sampleCount > 0 && Number.isFinite(f.minInches) && f.minInches > 0
    && Number.isFinite(f.maxInches) && f.maxInches >= f.minInches && ['FIT', 'SHARED_OVERHEAD', 'AVERAGE_SPEED'].includes(f.method);
}
/** Keeps only well-formed entries (saved profiles are untrusted input). */
export function validMovementModel(input: unknown): MovementModel | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: MovementModel = {};
  for (const key of [...moveDirections, 'all'] as const) { const fit = (input as MovementModel)[key]; if (validMoveFit(fit)) out[key] = { ...fit }; }
  return Object.keys(out).length ? out : undefined;
}
