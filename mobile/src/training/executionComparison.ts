import { evaluateRoute, isStageRoute } from '../planning/route';
import type { RouteEvaluation, StageRoute } from '../planning/route';
import type { StagePlan } from '../planning/model';
import type { StageDocument } from '../stage/model';
import type { ShooterPerformanceProfile } from '../profile/model';
import type { SavedStage } from '../storage/repository';
import type { TrainingVideo } from './videoModel';
import { isTrustedEvent } from './videoModel';
import { analyzeVideo } from './videoAnalysis';
import type { MappingSuggestionSet } from './mappingSuggestions';

export const COMPARISON_VERSION = 1;
export const COMPARISON_LIMITS = { positions: 100, objects: 2000, mappings: 500, intervals: 2000 } as const;
export type MappingKind = 'MOVEMENT' | 'POSITION' | 'RELOAD' | 'STRING' | 'TOTAL';
export type RouteSnapshot = {
  version: 1; stageId: string; stageName: string; routeId: string; revision: string; capturedAt: string;
  document: StageDocument; plan: StagePlan & { route: StageRoute }; evaluation: RouteEvaluation;
  timingProfile: ShooterPerformanceProfile | null;
};
export type ExecutionMapping = { id: string; kind: MappingKind; planElementId: string; observedIntervalId: string;
  observedIntervalIds?: string[];
  source: 'MANUAL' | 'AUTOMATIC_SUGGESTION'; confidence: 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED'; confirmed: boolean;
  createdAt: string; updatedAt: string };
export type ExecutionComparison = { id: string; version: 1; videoId: string; videoAnalysisVersion: 1;
  createdAt: string; updatedAt: string; snapshot: RouteSnapshot; mappings: ExecutionMapping[]; mappingSuggestions?: MappingSuggestionSet };
export type ObservedInterval = { id: string; kind: MappingKind; startMs: number; endMs: number; durationMs: number;
  eventIds: string[]; confirmedShotCount: number; source: 'CONFIRMED_TIMELINE'; confidence: 'CONFIRMED' };
export type TimingComparison = { mappingId: string; planElementId: string; observedIntervalId: string;
  strings?: ObservedInterval[]; totalShots?: number; stringCount?: number; engagementDurationMs?: number;
  plannedMs: number | null; observedMs: number; deltaMs: number | null; startMs: number; endMs: number;
  mappingConfidence: ExecutionMapping['confidence']; mappingSource: ExecutionMapping['source'] };
export type SegmentComparison = TimingComparison & { plannedDistanceInches: number };
export type PositionComparison = TimingComparison & { plannedEngagementMs: number | null; plannedEngagementCount: number;
  plannedRounds: number | null; observedConfirmedShotCount: number; observedStringCount: number };
export type ReloadComparison = TimingComparison & { plannedOverlapMs: number | null; plannedAdditionalMs: number | null;
  observedOverlapMs: number | null; observedAdditionalMs: number | null; additionalDeltaMs: number | null };
export type ExecutionComparisonResult = {
  version: 1; comparisonId: string | null; snapshotReference: { stageId: string; routeId: string; revision: string; version: 1 } | null;
  videoAnalysisId: string; plannedTotalMs: number | null; observedTotalMs: number | null; totalDeltaMs: number | null;
  mappedElements: ExecutionMapping[]; segmentComparisons: SegmentComparison[]; positionComparisons: PositionComparison[];
  reloadComparisons: ReloadComparison[]; stringComparisons: TimingComparison[];
  buckets: { movementDeltaMs: number; engagementDeltaMs: number; reloadDeltaMs: number; residualDeltaMs: number | null };
  unmappedTimeMs: number | null; plannedUnattributedMs: number | null;
  completeness: { positions: { mapped: number; total: number }; movements: { mapped: number; total: number };
    reloads: { mapped: number; total: number }; strings: { mapped: number; total: number }; percent: number };
  warnings: string[];
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const kinds: MappingKind[] = ['MOVEMENT', 'POSITION', 'RELOAD', 'STRING', 'TOTAL'];
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
/** Validate before rendering historical geometry or invoking the evaluator. */
function validDocument(d: StageDocument) {
  return d?.schemaVersion === 7 && d.coordinateSystem === 'inches' && finite(d.stage?.width) && d.stage.width > 0
    && finite(d.stage?.depth) && d.stage.depth > 0 && Array.isArray(d.objects) && d.objects.length <= COMPARISON_LIMITS.objects
    && new Set(d.objects.map(o => o?.id)).size === d.objects.length && d.objects.every(o => {
      if (!o || !text(o.id) || o.position?.space !== 'stage' || ![o.position.x, o.position.y, o.position.z, o.rotation].every(Number.isFinite)) return false;
      const g = o.geometry;
      if (!g || !Object.values(g).every(finite)) return false;
      switch (o.type) {
        case 'start': return 'width' in g && 'depth' in g && 'height' in g;
        case 'wall': return 'length' in g && 'thickness' in g && 'height' in g && Array.isArray(o.ports) && o.ports.every(p => p && text(p.id) && [p.offset, p.width, p.height, p.sill].every(Number.isFinite));
        case 'faultLine': return 'length' in g;
        case 'cardboardTarget': case 'noShootTarget': return 'faceWidth' in g && 'faceHeight' in g && o.faceCut?.kind === 'preset' && ['full', 'upper', 'lower', 'left', 'right'].includes(o.faceCut.preset);
        case 'steelPlate': case 'steelPopper': return 'faceWidth' in g && 'faceHeight' in g;
        default: return false;
      }
    });
}
export function isExecutionComparison(value: unknown): value is ExecutionComparison {
  try {
    const c = value as ExecutionComparison, s = c?.snapshot, p = s?.plan;
    if (!c || c.version !== COMPARISON_VERSION || !text(c.id) || !text(c.videoId) || c.videoAnalysisVersion !== 1
      || !date(c.createdAt) || !date(c.updatedAt) || s?.version !== 1 || !text(s.stageId) || !text(s.stageName)
      || !text(s.routeId) || !date(s.revision) || !date(s.capturedAt) || !validDocument(s.document)
      || !isStageRoute(p?.route) || p.route.id !== s.routeId || p.route.positions.length > COMPARISON_LIMITS.positions
      || !Array.isArray(p.loadout?.magazines) || !p.engagements || !Object.values(p.engagements).every(finite)
      || !p.loadout.magazines.every(m => m && text(m.id) && finite(m.capacity) && finite(m.startingRounds))
      || !Array.isArray(c.mappings) || c.mappings.length > COMPARISON_LIMITS.mappings) return false;
    if (s.timingProfile !== null && (!s.timingProfile || !['drawTime', 'reloadTime', 'averageSplitTime', 'transitionTime', 'movementSpeed'].every(k => finite(s.timingProfile![k as keyof ShooterPerformanceProfile])))) return false;
    if (canonical(s.evaluation) !== canonical(evaluateRoute(s.document, p, p.route, s.timingProfile))) return false;
    return c.mappings.every(m => m && text(m.id) && kinds.includes(m.kind) && text(m.planElementId) && text(m.observedIntervalId)
      && ['MANUAL', 'AUTOMATIC_SUGGESTION'].includes(m.source) && ['LOW', 'MEDIUM', 'HIGH', 'CONFIRMED'].includes(m.confidence)
      && typeof m.confirmed === 'boolean' && date(m.createdAt) && date(m.updatedAt)
      && (m.observedIntervalIds === undefined || (m.kind === 'STRING' || m.kind === 'POSITION') && Array.isArray(m.observedIntervalIds)
        && m.observedIntervalIds.length > 0 && m.observedIntervalIds.length <= 32 && m.observedIntervalIds[0] === m.observedIntervalId
        && m.observedIntervalIds.every(text) && new Set(m.observedIntervalIds).size === m.observedIntervalIds.length));
  } catch { return false; }
}
export function createExecutionComparison(id: string, saved: SavedStage, video: TrainingVideo,
  profile: ShooterPerformanceProfile | null, at: string): ExecutionComparison {
  if (!isStageRoute(saved.plan.route)) throw new Error('Save or accept a route in Stage Planner first.');
  const snapshot: RouteSnapshot = clone({ version: 1, stageId: saved.id, stageName: saved.name, routeId: saved.plan.route.id,
    revision: saved.updatedAt, capturedAt: at, document: saved.document, plan: saved.plan as RouteSnapshot['plan'],
    evaluation: evaluateRoute(saved.document, saved.plan, saved.plan.route, profile), timingProfile: profile });
  const result: ExecutionComparison = { id, version: 1, videoId: video.session.id, videoAnalysisVersion: video.analysis.analysisVersion,
    createdAt: at, updatedAt: at, snapshot, mappings: [] };
  if (!isExecutionComparison(result)) throw new Error('Cannot snapshot unsupported stage, route or timing data.');
  return result;
}
export function routeSnapshotChanged(snapshot: RouteSnapshot, live: SavedStage) {
  return snapshot.stageId !== live.id || canonical({ document: snapshot.document, plan: snapshot.plan }) !== canonical({ document: live.document, plan: live.plan });
}
/** Cached measurement eligibility is never trusted. Only authoritative timeline endpoints are analyzed. */
export function observedExecution(video: TrainingVideo): { intervals: ObservedInterval[]; warnings: string[] } {
  try {
    const events = video.analysis.events.filter(isTrustedEvent), a = analyzeVideo(video.session, events);
    const intervals: ObservedInterval[] = [], warnings: string[] = [];
    const add = (id: string, kind: MappingKind, startMs: number, endMs: number, eventIds: string[]) => {
      if (endMs < startMs || endMs === startMs && kind !== 'STRING') return;
      intervals.push({ id, kind, startMs, endMs, durationMs: endMs - startMs, eventIds,
        confirmedShotCount: events.filter(e => (e.type === 'SHOT' || e.type === 'FIRST_SHOT') && e.timestampMs >= startMs && e.timestampMs <= endMs).length,
        source: 'CONFIRMED_TIMELINE', confidence: 'CONFIRMED' });
    };
    for (const m of a.measurements.filter(m => m.eligible)) {
      const kind: MappingKind | undefined = m.kind === 'MOVEMENT' || m.kind === 'POSITION_TRANSITION' ? 'MOVEMENT'
        : m.kind === 'RELOAD' ? 'RELOAD' : m.kind === 'STRING_TIME' ? 'STRING' : m.kind === 'TOTAL' ? 'TOTAL' : undefined;
      if (kind) add(m.id, kind, m.startMs, m.endMs, m.eventIds);
    }
    for (const group of a.shotStrings.filter(g => g.eventIds.length === 1)) {
      const shot = events.find(e => e.id === group.eventIds[0]);
      if (shot) add(`single:${group.id}`, 'STRING', shot.timestampMs, shot.timestampMs, group.eventIds);
    }
    for (const interval of intervals.filter(i => i.kind === 'STRING')) {
      const group = a.shotStrings.find(g => g.eventIds[0] === interval.eventIds[0]);
      if (group) interval.eventIds = [...group.eventIds];
    }
    let entry: typeof events[number] | undefined;
    for (const e of a.events) {
      if (e.type === 'STIMULUS' || e.type === 'DRILL_END') entry = undefined;
      if (e.type === 'POSITION_ENTRY') entry = e;
      if (e.type === 'POSITION_EXIT' && entry) { add(`dwell:${entry.id}:${e.id}`, 'POSITION', entry.timestampMs, e.timestampMs, [entry.id, e.id]); entry = undefined; }
    }
    if (!intervals.some(i => i.kind === 'TOTAL')) warnings.push('MISSING_CONFIRMED_TOTAL');
    if (entry || a.warnings.some(w => /MOVEMENT:|POSITION_TRANSITION:/.test(w))) warnings.push('INCOMPLETE_MOVEMENT_ANALYSIS');
    if (intervals.length > COMPARISON_LIMITS.intervals) warnings.push('OBSERVED_INTERVAL_LIMIT');
    return { intervals: intervals.slice(0, COMPARISON_LIMITS.intervals), warnings };
  } catch { return { intervals: [], warnings: ['INVALID_CONFIRMED_TIMELINE'] }; }
}
export function plannedElements(c: ExecutionComparison, kind: MappingKind): { id: string; label: string; order: number }[] {
  const route = c.snapshot.plan.route;
  if (kind === 'TOTAL') return [{ id: 'TOTAL', label: 'Entire execution', order: 0 }];
  if (kind === 'MOVEMENT') return c.snapshot.evaluation.segments.map(s => ({ id: s.toId, label: `${s.fromId} → ${s.toId}`, order: route.positions.findIndex(p => p.id === s.toId) }));
  return route.positions.flatMap((p, order) => kind === 'RELOAD' && !route.reloads.some(r => r.positionId === p.id)
    || kind === 'STRING' && !p.engagedTargetIds.length ? [] : [{ id: p.id, label: `${order + 1}. ${p.label}`, order }]);
}
export function mappingInterval(m: ExecutionMapping, intervals: ObservedInterval[]): ObservedInterval | undefined {
  const ids = m.observedIntervalIds ?? [m.observedIntervalId];
  const parts = ids.map(id => intervals.find(i => i.id === id && i.kind === m.kind));
  if (parts.some(p => !p)) return undefined;
  const rows = (parts as ObservedInterval[]).slice().sort((a, b) => a.startMs - b.startMs);
  if (rows.some((r, i) => i > 0 && rows[i - 1].endMs > r.startMs)) return undefined;
  return { ...rows[0], endMs: rows[rows.length - 1].endMs,
    durationMs: rows[rows.length - 1].endMs - rows[0].startMs,
    eventIds: [...new Set(rows.flatMap(r => r.eventIds))], confirmedShotCount: rows.reduce((n, r) => n + r.confirmedShotCount, 0) };
}
export function resolveMappings(c: ExecutionComparison, intervals: ObservedInterval[]) {
  const warnings: string[] = [], resolved: { mapping: ExecutionMapping; interval: ObservedInterval; order: number }[] = [];
  for (const m of c.mappings) {
    if (!m.confirmed) { warnings.push('UNCONFIRMED_MAPPING'); continue; }
    const p = plannedElements(c, m.kind).find(p => p.id === m.planElementId), i = mappingInterval(m, intervals);
    if (!p || !i) { warnings.push(!p ? 'UNMATCHED_PLANNED_REFERENCE' : 'MISSING_CONFIRMED_EVENTS'); continue; }
    resolved.push({ mapping: m, interval: i, order: p.order });
  }
  const invalid = new Set<string>();
  for (let a = 0; a < resolved.length; a++) for (let b = a + 1; b < resolved.length; b++) {
    const x = resolved[a], y = resolved[b];
    if (x.mapping.id === y.mapping.id || x.mapping.kind === y.mapping.kind && (x.order === y.order ||
      (x.mapping.observedIntervalIds ?? [x.interval.id]).some(id => (y.mapping.observedIntervalIds ?? [y.interval.id]).includes(id)))) {
      invalid.add(x.mapping.id); invalid.add(y.mapping.id); warnings.push('AMBIGUOUS_MAPPING');
    } else if (x.mapping.kind === y.mapping.kind && ((x.order - y.order) * (x.interval.startMs - y.interval.startMs) < 0
      || x.interval.startMs < y.interval.endMs && y.interval.startMs < x.interval.endMs)) {
      invalid.add(x.mapping.id); invalid.add(y.mapping.id); warnings.push('INCONSISTENT_TIMELINE_ORDER');
    }
    if (x.mapping.kind !== 'TOTAL' && y.mapping.kind !== 'TOTAL' && x.order !== y.order) {
      const earlier = x.order < y.order ? x : y, later = earlier === x ? y : x;
      if (earlier.interval.endMs > later.interval.startMs) {
        invalid.add(x.mapping.id); invalid.add(y.mapping.id); warnings.push('INCONSISTENT_TIMELINE_ORDER');
      }
    }
    if (x.order === y.order) {
      const position = x.mapping.kind === 'POSITION' ? x : y.mapping.kind === 'POSITION' ? y : undefined;
      const string = x.mapping.kind === 'STRING' ? x : y.mapping.kind === 'STRING' ? y : undefined;
      if (position && string && (string.interval.startMs < position.interval.startMs || string.interval.endMs > position.interval.endMs)) {
        invalid.add(x.mapping.id); invalid.add(y.mapping.id); warnings.push('INCONSISTENT_TIMELINE_ORDER');
      }
    }
  }
  return { resolved: resolved.filter(r => !invalid.has(r.mapping.id)), warnings: [...new Set(warnings)] };
}
export function mapObservedEventsToPlan(c: ExecutionComparison, video: TrainingVideo, mapping: ExecutionMapping): ExecutionComparison {
  const next = { ...c, updatedAt: mapping.updatedAt, mappings: [...c.mappings.filter(m => m.id !== mapping.id), clone(mapping)] };
  if (!isExecutionComparison(next) || c.videoId !== video.session.id) throw new Error('Invalid comparison or mapping.');
  const validation = resolveMappings(next, observedExecution(video).intervals);
  if (validation.warnings.length) throw new Error(validation.warnings.join(', '));
  return next;
}
export function removeExecutionMapping(c: ExecutionComparison, id: string, at: string): ExecutionComparison {
  if (!date(at)) throw new Error('Invalid mapping edit timestamp.');
  return { ...c, updatedAt: at, mappings: c.mappings.filter(m => m.id !== id) };
}
type Resolved = ReturnType<typeof resolveMappings>['resolved'][number];
const ms = (seconds: number | null | undefined) => seconds == null ? null : seconds * 1000;
function timing(r: Resolved, plannedMs: number | null): TimingComparison {
  return { mappingId: r.mapping.id, planElementId: r.mapping.planElementId, observedIntervalId: r.interval.id,
    plannedMs, observedMs: r.interval.durationMs, deltaMs: plannedMs === null ? null : r.interval.durationMs - plannedMs,
    startMs: r.interval.startMs, endMs: r.interval.endMs, mappingConfidence: r.mapping.confidence, mappingSource: r.mapping.source };
}
export function compareRouteSegments(c: ExecutionComparison, mappings: Resolved[]): SegmentComparison[] {
  return mappings.filter(r => r.mapping.kind === 'MOVEMENT').map(r => {
    const s = c.snapshot.evaluation.segments.find(s => s.toId === r.mapping.planElementId)!;
    return { ...timing(r, ms(s.seconds)), plannedDistanceInches: s.distance };
  });
}
export function comparePositionTiming(c: ExecutionComparison, mappings: Resolved[], intervals: ObservedInterval[]): PositionComparison[] {
  return mappings.filter(r => r.mapping.kind === 'POSITION').map(r => {
    const p = c.snapshot.plan.route.positions.find(p => p.id === r.mapping.planElementId)!;
    const t = c.snapshot.evaluation.timing?.positionDetails.find(t => t.positionId === p.id);
    return { ...timing(r, null), plannedEngagementMs: ms(t?.engagementSeconds), plannedEngagementCount: p.engagedTargetIds.length,
      plannedRounds: t?.plannedRounds ?? null, observedConfirmedShotCount: r.interval.confirmedShotCount,
      observedStringCount: intervals.filter(i => i.kind === 'STRING' && i.startMs >= r.interval.startMs && i.endMs <= r.interval.endMs).length };
  });
}
/** Union of actual timestamp intersections; this is observed coverage, not planner overlap estimation. */
function unionDuration(intervals: { startMs: number; endMs: number }[]) {
  const sorted = intervals.slice().sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  let end = -Infinity, duration = 0;
  for (const i of sorted) { duration += Math.max(0, i.endMs - Math.max(end, i.startMs)); end = Math.max(end, i.endMs); }
  return duration;
}
export function compareReloadTiming(c: ExecutionComparison, mappings: Resolved[]): ReloadComparison[] {
  return mappings.filter(r => r.mapping.kind === 'RELOAD').map(r => {
    const p = c.snapshot.evaluation.timing?.reloadDetails.find(p => p.positionId === r.mapping.planElementId);
    const movement = mappings.find(m => m.mapping.kind === 'MOVEMENT' && m.mapping.planElementId === r.mapping.planElementId);
    const overlap = movement ? Math.max(0, Math.min(r.interval.endMs, movement.interval.endMs) - Math.max(r.interval.startMs, movement.interval.startMs)) : null;
    const additional = overlap === null ? null : r.interval.durationMs - overlap;
    return { ...timing(r, ms(p?.rawDuration)), plannedOverlapMs: ms(p?.overlap), plannedAdditionalMs: ms(p?.additionalPenalty),
      observedOverlapMs: overlap, observedAdditionalMs: additional,
      additionalDeltaMs: additional === null || !p ? null : additional - p.additionalPenalty * 1000 };
  });
}
export function compareStringTiming(c: ExecutionComparison, mappings: Resolved[], intervals: ObservedInterval[] = []): TimingComparison[] {
  return mappings.filter(r => r.mapping.kind === 'STRING').map(r => {
    const strings = intervals.filter(i => (r.mapping.observedIntervalIds ?? [r.interval.id]).includes(i.id));
    return { ...timing(r, ms(c.snapshot.evaluation.timing?.positionDetails.find(p => p.positionId === r.mapping.planElementId)?.engagementSeconds)),
      strings, totalShots: r.interval.confirmedShotCount, stringCount: strings.length,
      engagementDurationMs: strings.reduce((n, i) => n + i.durationMs, 0) };
  });
}
export function createExecutionComparisonResult(input: unknown, video: TrainingVideo, live?: SavedStage | null): ExecutionComparisonResult {
  const empty = { mapped: 0, total: 0 };
  const result: ExecutionComparisonResult = { version: 1, comparisonId: null, snapshotReference: null, videoAnalysisId: video.session.id,
    plannedTotalMs: null, observedTotalMs: null, totalDeltaMs: null, mappedElements: [], segmentComparisons: [], positionComparisons: [], reloadComparisons: [], stringComparisons: [],
    buckets: { movementDeltaMs: 0, engagementDeltaMs: 0, reloadDeltaMs: 0, residualDeltaMs: null }, unmappedTimeMs: null, plannedUnattributedMs: null,
    completeness: { positions: { ...empty }, movements: { ...empty }, reloads: { ...empty }, strings: { ...empty }, percent: 0 }, warnings: [] };
  if (!isExecutionComparison(input) || input.videoId !== video.session.id || input.videoAnalysisVersion !== video.analysis.analysisVersion) {
    result.warnings = [input == null ? 'NO_STAGE_MAPPING' : 'INVALID_HISTORICAL_COMPARISON']; return result;
  }
  const c = input, s = c.snapshot, observed = observedExecution(video), resolved = resolveMappings(c, observed.intervals);
  result.comparisonId = c.id; result.snapshotReference = { stageId: s.stageId, routeId: s.routeId, revision: s.revision, version: s.version };
  result.warnings.push(...observed.warnings, ...resolved.warnings, ...s.evaluation.warnings);
  if (live === null) result.warnings.push('LINKED_STAGE_UNAVAILABLE');
  else if (live && routeSnapshotChanged(s, live)) result.warnings.push('ROUTE_CHANGED_USING_ORIGINAL_SNAPSHOT');
  if (!c.mappings.length) result.warnings.push('NO_STAGE_MAPPING');
  const mappings = resolved.resolved;
  result.mappedElements = mappings.map(r => r.mapping);
  result.segmentComparisons = compareRouteSegments(c, mappings);
  result.positionComparisons = comparePositionTiming(c, mappings, observed.intervals);
  result.reloadComparisons = compareReloadTiming(c, mappings);
  result.stringComparisons = compareStringTiming(c, mappings, observed.intervals);
  result.plannedTotalMs = ms(s.evaluation.timing?.total);
  const totals = observed.intervals.filter(i => i.kind === 'TOTAL');
  const total = mappings.find(m => m.mapping.kind === 'TOTAL')?.interval ?? (totals.length === 1 ? totals[0] : undefined);
  if (totals.length > 1 && !total) result.warnings.push('AMBIGUOUS_OBSERVED_TOTAL');
  result.observedTotalMs = total?.durationMs ?? null;
  result.totalDeltaMs = result.plannedTotalMs === null || !total ? null : total.durationMs - result.plannedTotalMs;
  for (const [key, kind] of [['positions', 'POSITION'], ['movements', 'MOVEMENT'], ['reloads', 'RELOAD'], ['strings', 'STRING']] as const) {
    result.completeness[key] = { mapped: mappings.filter(m => m.mapping.kind === kind).length, total: plannedElements(c, kind).length };
  }
  const counts = [result.completeness.positions, result.completeness.movements, result.completeness.reloads, result.completeness.strings];
  const count = counts.reduce((n, v) => n + v.total, 0);
  result.completeness.percent = count ? 100 * counts.reduce((n, v) => n + v.mapped, 0) / count : 0;
  if (counts.some(v => v.mapped < v.total)) result.warnings.push('UNMATCHED_PLANNED_ELEMENT');
  if (observed.intervals.some(i => i.kind !== 'TOTAL' && !mappings.some(m => (m.mapping.observedIntervalIds ?? [m.interval.id]).includes(i.id)))) result.warnings.push('UNMATCHED_OBSERVED_INTERVAL');
  if (result.positionComparisons.length) result.warnings.push('PLANNED_DWELL_UNAVAILABLE');
  if (result.reloadComparisons.some(r => r.observedOverlapMs === null)) result.warnings.push('OBSERVED_RELOAD_OVERLAP_UNKNOWN');
  for (const r of mappings.filter(r => r.mapping.kind === 'STRING')) {
    const planned = s.evaluation.timing?.positionDetails.find(p => p.positionId === r.mapping.planElementId);
    if (planned && planned.plannedRounds !== r.interval.confirmedShotCount) result.warnings.push('ENGAGEMENT_COUNT_DIFFERS');
  }
  // Attribute only comparable, non-overlapping intervals inside the selected total.
  // Movement + reload use observed overlap; dwell is descriptive and never added over shooting/reload.
  const candidates = [...result.segmentComparisons, ...result.stringComparisons, ...result.reloadComparisons].filter(r => r.plannedMs !== null);
  const invalid = new Set<string>();
  for (const row of candidates) if (total && (row.startMs < total.startMs || row.endMs > total.endMs)) { invalid.add(row.mappingId); result.warnings.push('MAPPING_OUTSIDE_TOTAL'); }
  for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
    const a = candidates[i], b = candidates[j];
    const isAllowedOverlap = result.reloadComparisons.some(r => r.mappingId === a.mappingId) && result.segmentComparisons.some(r => r.mappingId === b.mappingId && r.planElementId === a.planElementId)
      || result.reloadComparisons.some(r => r.mappingId === b.mappingId) && result.segmentComparisons.some(r => r.mappingId === a.mappingId && r.planElementId === b.planElementId);
    if (!isAllowedOverlap && a.startMs < b.endMs && b.startMs < a.endMs) {
      invalid.add(a.mappingId); invalid.add(b.mappingId); result.warnings.push('OVERLAPPING_ATTRIBUTION');
    }
  }
  const valid = (r: TimingComparison) => r.plannedMs !== null && !invalid.has(r.mappingId);
  const moves = result.segmentComparisons.filter(valid), strings = result.stringComparisons.filter(valid);
  const reloads = result.reloadComparisons.filter(r => valid(r) && r.additionalDeltaMs !== null
    && moves.some(m => m.planElementId === r.planElementId));
  result.buckets.movementDeltaMs = moves.reduce((n, r) => n + r.deltaMs!, 0);
  result.buckets.engagementDeltaMs = strings.reduce((n, r) => n + r.deltaMs!, 0);
  result.buckets.reloadDeltaMs = reloads.reduce((n, r) => n + r.additionalDeltaMs!, 0);
  if (total && result.plannedTotalMs !== null) {
    const covered = unionDuration([...moves, ...strings, ...reloads]);
    result.unmappedTimeMs = Math.max(0, total.durationMs - covered);
    result.plannedUnattributedMs = result.plannedTotalMs - moves.reduce((n, r) => n + r.plannedMs!, 0)
      - strings.reduce((n, r) => n + r.plannedMs!, 0) - reloads.reduce((n, r) => n + r.plannedAdditionalMs!, 0);
    result.buckets.residualDeltaMs = result.totalDeltaMs! - result.buckets.movementDeltaMs - result.buckets.engagementDeltaMs - result.buckets.reloadDeltaMs;
  }
  result.warnings = [...new Set(result.warnings)];
  return result;
}
export const summarizeComparison = (result: ExecutionComparisonResult) => ({ plannedMs: result.plannedTotalMs,
  observedMs: result.observedTotalMs, deltaMs: result.totalDeltaMs, ...result.buckets, unmappedTimeMs: result.unmappedTimeMs });
