import type { TargetFamily } from '../stage/targetFamily';

/**
 * One shot on a drill target. Coordinates are inches on the target face as the shooter sees it:
 * origin at the face centre, +x to the right, +y UP. A miss, a no-shoot hit ('NS') and a non-threat hit ('NT') may
 * have no coordinates (they are not on this face).
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
  /** Scoring hits the drill requires (e.g. 2 per paper target). Missing or null: one per logged shot. */
  requiredHits?: number | null;
  /** Procedural penalties assessed for the run. Missing: 0. */
  procedurals?: number;
  /** USPSA power factor used for C and D values. Missing: minor. */
  powerFactor?: 'major' | 'minor';
};

export const MAX_RUNS_PER_SESSION = 200;
export const MAX_HITS_PER_RUN = 300;

/** Zone choices per family. Only rulebook-confirmed values are used for scoring. */
export const zoneChoices: Record<TargetFamily, readonly string[]> = {
  USPSA: ['A', 'C', 'D', 'M', 'NS'], // B is scored as C (USPSA Appendix B1); NS = no-shoot hit
  PCSL: ['T', 'A', 'C', 'D', 'M', 'NS'],
  IDPA: ['-0', '-1', '-3', 'M', 'NT'], // NT = hit on a non-threat
};
/** Tags that are not hits on this face: they never need coordinates and never count toward the group. */
export const PENALTY_TAGS: readonly string[] = ['M', 'NS', 'NT'];

export type DrillScore = {
  method: string;
  /** Hit-factor families: stage points after penalties, never below 0. */
  points: number | null;
  /** IDPA: points down, misses included. */
  pointsDown: number | null;
  /** Missing required hits (a miss is a required hit not made, not a tagged shot). */
  misses: number;
  untagged: number;
  noShootHits: number;
  procedurals: number;
  /** Penalty points (hit factor) subtracted from the hits. */
  penalties: number;
  requiredHits: number;
  /** Points ÷ time when the time is known (USPSA, PCSL). */
  hitFactor: number | null;
  /** IDPA final time: raw time + points down + penalties, seconds, when the time is known. */
  finalTime: number | null;
  note: string;
};

/**
 * Score from user-tagged zones, with each ruleset's penalties. Rules cited are in docs/rules/.
 * - USPSA: best `requiredHits` hits score A 5, C 4/3, D 2/1 (Major/Minor; B as C) (App. B1, 9.5.1). Each missing required
 *   hit, no-shoot hit and procedural is -10 (9.4); points never go below 0 (9.5.6). Hit factor = points ÷ time.
 * - PCSL: T 10 (counts as two A hits), A 5, C 3, D 1; at most 5 points per required hit (11.3.1, 11.3.2, 11.3.4).
 *   Each missing required hit and procedural -10; no-shoot hits -10, at most 2 on one paper no-shoot (11.3.5).
 *   Points never below 0 (11.2.3).
 * - IDPA: best `requiredHits` hits count -0/-1/-3 points down; each missing hit is -5 (4.12.1.1). Final time = raw time
 *   + points down × 1 s + 5 s per non-threat hit (4.11.2) + 3 s per procedural error (5.1.1).
 */
export function scoreRun(run: Pick<DrillRun, 'hits' | 'family'> & Partial<Pick<DrillRun, 'requiredHits' | 'procedurals' | 'powerFactor' | 'totalTime'>>,
  powerFactor?: 'major' | 'minor'): DrillScore {
  const pf = powerFactor ?? run.powerFactor ?? 'minor';
  const shots = run.hits.filter(h => h.zone !== 'NS' && h.zone !== 'NT');
  const onFace = shots.filter(h => h.zone !== 'M');
  const untagged = onFace.filter(h => !h.zone).length;
  const noShootHits = run.hits.filter(h => h.zone === 'NS' || h.zone === 'NT').length;
  const procedurals = Math.max(0, Math.floor(run.procedurals ?? 0));
  const requiredHits = run.requiredHits ?? shots.length;
  const time = run.totalTime !== undefined && run.totalTime !== null && run.totalTime > 0 ? run.totalTime : null;
  const base = { untagged, noShootHits, procedurals, requiredHits, hitFactor: null as number | null, finalTime: null as number | null };
  if (run.family === 'USPSA') {
    const table: Record<string, number> = pf === 'major' ? { A: 5, B: 4, C: 4, D: 2 } : { A: 5, B: 3, C: 3, D: 1 };
    const best = onFace.map(h => (h.zone && h.zone in table ? table[h.zone] : 0)).sort((a, b) => b - a).slice(0, requiredHits);
    const misses = Math.max(0, requiredHits - best.length);
    const penalties = 10 * (misses + noShootHits + procedurals);
    const points = Math.max(0, best.reduce((s, v) => s + v, 0) - penalties);
    return { ...base, method: `USPSA ${pf}`, points, pointsDown: null, misses, penalties, hitFactor: time ? points / time : null,
      note: 'Best hits up to the required count; -10 per missing hit, no-shoot hit and procedural.' };
  }
  if (run.family === 'PCSL') {
    const table: Record<string, number> = { T: 10, K: 10, A: 5, C: 3, D: 1 };
    let credits = 0, gross = 0;
    for (const h of [...onFace].sort((a, b) => (table[b.zone ?? ''] ?? 0) - (table[a.zone ?? ''] ?? 0))) {
      if (credits >= requiredHits) break;
      const zone = h.zone ?? '', twoHits = zone === 'T' || zone === 'K';
      if (twoHits && credits + 2 <= requiredHits) { credits += 2; gross += 10; }
      else { credits += 1; gross += twoHits ? 5 : (table[zone] ?? 0); }
    }
    const misses = Math.max(0, requiredHits - credits);
    const penalties = 10 * (misses + Math.min(noShootHits, 2) + procedurals);
    const points = Math.max(0, Math.min(gross, 5 * requiredHits) - penalties);
    return { ...base, method: 'PCSL', points, pointsDown: null, misses, penalties, hitFactor: time ? points / time : null,
      note: 'T counts as two A hits; -10 per missing hit and procedural; at most 2 no-shoot penalties on one paper no-shoot.' };
  }
  if (run.family === 'IDPA') {
    const table: Record<string, number> = { '-0': 0, '-1': 1, '-3': 3 };
    const best = onFace.map(h => table[h.zone ?? ''] ?? 0).sort((a, b) => a - b).slice(0, requiredHits);
    const misses = Math.max(0, requiredHits - best.length);
    const pointsDown = best.reduce((s, v) => s + v, 0) + 5 * misses;
    const added = 5 * noShootHits + 3 * procedurals;
    return { ...base, method: 'IDPA', points: null, pointsDown, misses, penalties: added, finalTime: time ? time + pointsDown + added : null,
      note: 'Final time = raw time + 1 s per point down + 5 s per non-threat hit + 3 s per procedural error.' };
  }
  return { ...base, method: 'Untagged', points: null, pointsDown: null, misses: Math.max(0, requiredHits - onFace.length), penalties: 0, note: 'Choose a target family to score zones.' };
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
  const shots = run.hits.filter((h): h is DrillHit & { x: number; y: number } => h.x !== null && h.y !== null && !PENALTY_TAGS.includes(h.zone ?? ''));
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
  if (run.requiredHits !== undefined && run.requiredHits !== null && !(Number.isInteger(run.requiredHits) && run.requiredHits >= 0 && run.requiredHits <= MAX_HITS_PER_RUN)) return 'Invalid required hits.';
  if (run.procedurals !== undefined && !(Number.isInteger(run.procedurals) && run.procedurals >= 0 && run.procedurals <= 100)) return 'Invalid procedurals.';
  if (run.powerFactor !== undefined && run.powerFactor !== 'major' && run.powerFactor !== 'minor') return 'Invalid power factor.';
  if (!Array.isArray(run.hits) || run.hits.length > MAX_HITS_PER_RUN) return 'Too many hits.';
  const ids = new Set<string>(), limitX = run.faceWidth, limitY = run.faceHeight;
  for (const h of run.hits) {
    if (!h || typeof h.id !== 'string' || !h.id || ids.has(h.id) || !Number.isInteger(h.order) || h.order < 1) return 'Invalid hit.';
    ids.add(h.id);
    if ((h.x === null) !== (h.y === null)) return 'A hit needs both coordinates or neither.';
    if (h.x !== null && (!finite(h.x) || !finite(h.y) || Math.abs(h.x) > limitX || Math.abs(h.y as number) > limitY)) return 'Hit coordinates are outside the target area.';
    if (h.x === null && !PENALTY_TAGS.includes(h.zone ?? '')) return 'Only misses and no-shoot or non-threat hits may omit coordinates.';
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
