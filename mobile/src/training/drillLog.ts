import type { TargetFamily } from '../stage/targetFamily';

/**
 * One shot on a drill target. Coordinates are inches on the target face as the shooter sees it:
 * origin at the face centre, +x to the right, +y UP. A miss has no coordinates.
 * `zone` is the scoring zone the user tagged (zone shapes are never inferred from coordinates; official zone
 * geometry is only published as drawings, see docs/target-preset-sources.md).
 */
export type DrillHit = { id: string; order: number; x: number | null; y: number | null; zone: string | null };

/** One run of a drill on one target. Times are seconds; null means not measured. */
export type DrillRun = {
  id: string; recordedAt: string;
  targetPresetId: string | null; family: TargetFamily | null;
  /** Face size used for the diagram (inches), so later preset changes never move recorded hits. */
  faceWidth: number; faceHeight: number;
  distanceYards: number | null;
  /** Where the shooter aimed, face inches (default centre). */
  aim: { x: number; y: number };
  hits: DrillHit[];
  totalTime: number | null;
  splits: number[];
  notes: string;
};

export const MAX_RUNS_PER_SESSION = 200;
export const MAX_HITS_PER_RUN = 300;

/** Zone choices per family. Only rulebook-confirmed values are used for scoring. */
export const zoneChoices: Record<TargetFamily, readonly string[]> = {
  USPSA: ['A', 'C', 'D', 'M'], // B is scored as C (USPSA Appendix B1)
  PCSL: ['T', 'A', 'C', 'D', 'M'],
  IDPA: ['-0', '-1', '-3', 'M'],
};

export type DrillScore = { method: string; points: number | null; pointsDown: number | null; misses: number; untagged: number; note: string };

/**
 * Score from user-tagged zones.
 * - USPSA: A 5, C 4/3, D 2/1 (Major/Minor) per Appendix B1; misses are counted, not converted to a penalty here.
 * - PCSL: T 10, A 5, C 3, D 1, miss -10 (PCSL 11.3.2).
 * - IDPA: points down -0/-1/-3, miss -5 (IDPA 2026 4.12.1.1); each point down adds 1 s.
 */
export function scoreRun(run: Pick<DrillRun, 'hits' | 'family'>, powerFactor: 'major' | 'minor' = 'minor'): DrillScore {
  const misses = run.hits.filter(h => h.zone === 'M').length, untagged = run.hits.filter(h => !h.zone).length;
  if (run.family === 'USPSA') {
    const table: Record<string, number> = powerFactor === 'major' ? { A: 5, B: 4, C: 4, D: 2 } : { A: 5, B: 3, C: 3, D: 1 };
    const points = run.hits.reduce((s, h) => s + (h.zone && h.zone in table ? table[h.zone] : 0), 0);
    return { method: `USPSA ${powerFactor}`, points, pointsDown: null, misses, untagged, note: 'Miss and no-shoot penalties are not applied here.' };
  }
  if (run.family === 'PCSL') {
    const table: Record<string, number> = { T: 10, K: 10, A: 5, C: 3, D: 1, M: -10 };
    const points = run.hits.reduce((s, h) => s + (h.zone && h.zone in table ? table[h.zone] : 0), 0);
    return { method: 'PCSL', points, pointsDown: null, misses, untagged, note: 'Includes -10 per miss.' };
  }
  if (run.family === 'IDPA') {
    const table: Record<string, number> = { '-0': 0, '-1': 1, '-3': 3, M: 5 };
    const pointsDown = run.hits.reduce((s, h) => s + (h.zone && h.zone in table ? table[h.zone] : 0), 0);
    return { method: 'IDPA points down', points: null, pointsDown, misses, untagged, note: 'Each point down adds 1 second.' };
  }
  return { method: 'Untagged', points: null, pointsDown: null, misses, untagged, note: 'Choose a target family to score zones.' };
}

export type GroupStats = {
  shots: number; misses: number;
  /** Mean point of impact, face inches (+y up). */
  center: { x: number; y: number } | null;
  /** Mean point of impact minus aim point (positive = right / high). */
  offset: { x: number; y: number } | null;
  extremeSpread: number | null; meanRadius: number | null; sdX: number | null; sdY: number | null;
  /** Mean radius as an angle, minutes of angle, when distance is known. */
  meanRadiusMoa: number | null;
};

/** Group size and point-of-impact offset, computed only from recorded coordinates. */
export function groupStats(run: Pick<DrillRun, 'hits' | 'aim' | 'distanceYards'>): GroupStats {
  const shots = run.hits.filter((h): h is DrillHit & { x: number; y: number } => h.x !== null && h.y !== null && h.zone !== 'M');
  const misses = run.hits.filter(h => h.zone === 'M').length;
  if (!shots.length) return { shots: 0, misses, center: null, offset: null, extremeSpread: null, meanRadius: null, sdX: null, sdY: null, meanRadiusMoa: null };
  const cx = shots.reduce((s, h) => s + h.x, 0) / shots.length, cy = shots.reduce((s, h) => s + h.y, 0) / shots.length;
  let spread = 0;
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) spread = Math.max(spread, Math.hypot(shots[i].x - shots[j].x, shots[i].y - shots[j].y));
  const meanRadius = shots.reduce((s, h) => s + Math.hypot(h.x - cx, h.y - cy), 0) / shots.length;
  const sd = (values: number[], mean: number) => values.length > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)) : null;
  // 1 MOA subtends 1.047 in at 100 yd.
  const moa = run.distanceYards && run.distanceYards > 0 ? meanRadius / (1.047 * run.distanceYards / 100) : null;
  return { shots: shots.length, misses, center: { x: cx, y: cy }, offset: { x: cx - run.aim.x, y: cy - run.aim.y },
    extremeSpread: shots.length > 1 ? spread : null, meanRadius, sdX: sd(shots.map(h => h.x), cx), sdY: sd(shots.map(h => h.y), cy), meanRadiusMoa: moa };
}

/** Plain-language offset, e.g. "1.2 in low, 0.5 in left". */
export function offsetText(offset: { x: number; y: number } | null): string {
  if (!offset) return 'No hits recorded';
  const part = (v: number, pos: string, neg: string) => Math.abs(v) < 0.05 ? null : `${Math.abs(v).toFixed(1)} in ${v > 0 ? pos : neg}`;
  return [part(offset.y, 'high', 'low'), part(offset.x, 'right', 'left')].filter(Boolean).join(', ') || 'Centred on the aim point';
}

/** Validation used before saving and when loading saved sessions. Returns a reason or null. */
export function drillRunProblem(run: DrillRun): string | null {
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!run || typeof run.id !== 'string' || !run.id || !Number.isFinite(Date.parse(run.recordedAt))) return 'Invalid drill run.';
  if (!finite(run.faceWidth) || !finite(run.faceHeight) || run.faceWidth <= 0 || run.faceHeight <= 0 || run.faceWidth > 120 || run.faceHeight > 120) return 'Invalid target face size.';
  if (run.distanceYards !== null && (!finite(run.distanceYards) || run.distanceYards <= 0 || run.distanceYards > 1000)) return 'Invalid distance.';
  if (!run.aim || !finite(run.aim.x) || !finite(run.aim.y)) return 'Invalid aim point.';
  if (run.totalTime !== null && (!finite(run.totalTime) || run.totalTime < 0 || run.totalTime > 3600)) return 'Invalid total time.';
  if (!Array.isArray(run.splits) || run.splits.length > MAX_HITS_PER_RUN || run.splits.some(s => !finite(s) || s < 0 || s > 600)) return 'Invalid splits.';
  if (typeof run.notes !== 'string' || run.notes.length > 2000) return 'Invalid notes.';
  if (!Array.isArray(run.hits) || run.hits.length > MAX_HITS_PER_RUN) return 'Too many hits.';
  const ids = new Set<string>(), limitX = run.faceWidth, limitY = run.faceHeight;
  for (const h of run.hits) {
    if (!h || typeof h.id !== 'string' || !h.id || ids.has(h.id) || !Number.isInteger(h.order) || h.order < 1) return 'Invalid hit.';
    ids.add(h.id);
    if ((h.x === null) !== (h.y === null)) return 'A hit needs both coordinates or neither.';
    if (h.x !== null && (!finite(h.x) || !finite(h.y) || Math.abs(h.x) > limitX || Math.abs(h.y as number) > limitY)) return 'Hit coordinates are outside the target area.';
    if (h.x === null && h.zone !== 'M') return 'Only misses may omit coordinates.';
    if (h.zone !== null && (typeof h.zone !== 'string' || h.zone.length > 4)) return 'Invalid zone.';
  }
  return null;
}

/** Trend rows for runs that share a drill (same drillId across sessions), oldest first. */
export function drillTrend(runs: readonly (DrillRun & { sessionName: string })[]) {
  return [...runs].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)).map(run => {
    const g = groupStats(run);
    return { id: run.id, recordedAt: run.recordedAt, session: run.sessionName, shots: g.shots, misses: g.misses, meanRadius: g.meanRadius, offset: g.offset, totalTime: run.totalTime };
  });
}
