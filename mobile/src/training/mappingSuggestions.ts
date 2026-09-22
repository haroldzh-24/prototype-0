import { isTrustedEvent } from './videoModel';
import type { TrainingVideo } from './videoModel';
import { isExecutionComparison, observedExecution, plannedElements, mapObservedEventsToPlan, mappingInterval, resolveMappings } from './executionComparison';
import type { ExecutionComparison, ExecutionMapping, MappingKind, ObservedInterval } from './executionComparison';

export const MAPPING_ALGORITHM_VERSION = 1;
export const MAPPING_CONFIG = {
  version: 1, maxPlannedUnits: 100, maxObservedUnits: 240, maxDPCells: 25000,
  maxAlignments: 60000, maxAlternatives: 3, beamWidth: 4, diversityThreshold: .2,
  maxExplanationItems: 8, maxMergedStrings: 8, maxMergedStableIntervals: 3, maxStableGapMs: 250,
  penalties: { skipPlanned: 1.4, extraObserved: 1, durationMismatch: .45, shotMismatch: .65,
    reloadMismatch: .8, incomplete: .3, merge: .08 },
  durationSupportTolerance: .25,
  confidence: { highScore: .82, mediumScore: .5, highCoverage: .85, mediumCoverage: .5,
    pairMediumCost: .3, minHighPairs: 5, minMediumPairs: 2, minCoverage: .2 },
} as const;
type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ObservedExecutionUnit = ObservedInterval & {
  type: 'STABLE_INTERVAL' | 'MOVEMENT_INTERVAL' | 'RELOAD_INTERVAL' | 'SHOT_STRING' | 'START_END';
  sourceReferences: string[]; stringIds: string[]; stringCount: number; reloadIds: string[]; complete: boolean;
};
export type PlannedExecutionUnit = {
  id: string; kind: MappingKind; planElementId: string; order: number; durationMs: number | null;
  distanceInches: number | null; targetIds: string[]; requiredShots: number | null;
  reloadExpected: boolean; reloadOverlapMs: number | null; snapshotRevision: string; snapshotVersion: number;
};
export type MappingPair = {
  id: string; kind: MappingKind; planElementId: string; observedIntervalIds: string[];
  operation: 'MATCH' | 'MULTIPLE_STRINGS_AT_POSITION' | 'MERGED_OBSERVED'; cost: number; confidence: Confidence;
  reasons: string[]; timingDeltaMs: number | null; startMs: number; endMs: number;
  decision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
};
export type MappingCandidate = { id: string; pairs: MappingPair[]; score: number; confidence: Confidence;
  coverage: number; reasons: string[]; unmatchedPlanned: string[]; extraObserved: string[] };
export type MappingSuggestionSet = {
  algorithmVersion: number; configVersion: number; comparisonVersion: number; videoAnalysisVersion: number;
  routeSnapshotVersion: number; routeRevision: string; generatedAt: string; fingerprint: string;
  status: 'READY' | 'NO_RELIABLE_SUGGESTION' | 'FULLY_MAPPED' | 'CONFLICT' | 'BOUNDS_REACHED';
  candidates: MappingCandidate[]; warnings: string[]; evaluated: number;
};
const key = (kind: MappingKind, id: string) => `${kind}:${id}`;
const normalizedDifference = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1);
export function isMappingSuggestionSet(value: unknown): value is MappingSuggestionSet {
  try {
    const s = value as MappingSuggestionSet;
    return !!s && typeof s.fingerprint === 'string' && Number.isFinite(Date.parse(s.generatedAt))
      && ['READY', 'NO_RELIABLE_SUGGESTION', 'FULLY_MAPPED', 'CONFLICT', 'BOUNDS_REACHED'].includes(s.status)
      && Array.isArray(s.warnings) && s.warnings.every(w => typeof w === 'string')
      && Array.isArray(s.candidates) && s.candidates.length <= MAPPING_CONFIG.maxAlternatives
      && s.candidates.every(c => typeof c.id === 'string' && Number.isFinite(c.coverage) && Number.isFinite(c.score)
        && ['LOW', 'MEDIUM', 'HIGH'].includes(c.confidence) && Array.isArray(c.reasons) && c.reasons.every(r => typeof r === 'string')
        && Array.isArray(c.unmatchedPlanned) && c.unmatchedPlanned.every(r => typeof r === 'string')
        && Array.isArray(c.extraObserved) && c.extraObserved.every(r => typeof r === 'string')
        && Array.isArray(c.pairs) && c.pairs.length <= MAPPING_CONFIG.maxPlannedUnits && c.pairs.every(p =>
          typeof p.id === 'string' && typeof p.planElementId === 'string' && ['POSITION', 'MOVEMENT', 'STRING', 'RELOAD'].includes(p.kind)
          && ['PENDING', 'ACCEPTED', 'REJECTED'].includes(p.decision) && ['LOW', 'MEDIUM', 'HIGH'].includes(p.confidence)
          && Number.isFinite(p.startMs) && Number.isFinite(p.endMs) && p.endMs >= p.startMs
          && (p.timingDeltaMs === null || Number.isFinite(p.timingDeltaMs)) && Array.isArray(p.reasons) && p.reasons.every(r => typeof r === 'string')
          && Array.isArray(p.observedIntervalIds) && p.observedIntervalIds.length > 0 && p.observedIntervalIds.length <= MAPPING_CONFIG.maxMergedStrings
          && p.observedIntervalIds.every(id => typeof id === 'string')));
  } catch { return false; }
}
/** Includes trusted grouping metadata and video bounds; detector proposals are intentionally excluded. */
export function mappingInputFingerprint(c: ExecutionComparison, v: TrainingVideo): string {
  return JSON.stringify([c.snapshot, v.session.id, v.session.durationMs, v.analysis.analysisVersion,
    v.analysis.events.filter(isTrustedEvent).slice().sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id))]);
}
export function suggestionsAreStale(c: ExecutionComparison, v: TrainingVideo): boolean {
  const s = c.mappingSuggestions;
  try { return !isMappingSuggestionSet(s) || s.algorithmVersion !== MAPPING_ALGORITHM_VERSION || s.configVersion !== MAPPING_CONFIG.version
    || s.comparisonVersion !== c.version || s.videoAnalysisVersion !== v.analysis.analysisVersion
    || s.routeSnapshotVersion !== c.snapshot.version || s.fingerprint !== mappingInputFingerprint(c, v); }
  catch { return true; }
}
export function buildObservedExecutionSequence(video: TrainingVideo): ObservedExecutionUnit[] {
  const { intervals, warnings } = observedExecution(video);
  const totals = intervals.filter(i => i.kind === 'TOTAL');
  // POSITION_TRANSITION and MOVEMENT can describe the same span; retain explicit movement when both exist.
  const compact = intervals.filter(i => i.kind !== 'MOVEMENT' || !i.id.startsWith('POSITION_TRANSITION:')
    || !intervals.some(j => j.kind === 'MOVEMENT' && j.id.startsWith('MOVEMENT:') && j.startMs === i.startMs && j.endMs === i.endMs));
  return compact.map(i => {
    const strings = intervals.filter(s => s.kind === 'STRING' && s.startMs >= i.startMs && s.endMs <= i.endMs);
    return { ...i, type: ({ POSITION: 'STABLE_INTERVAL', MOVEMENT: 'MOVEMENT_INTERVAL', RELOAD: 'RELOAD_INTERVAL',
      STRING: 'SHOT_STRING', TOTAL: 'START_END' } as const)[i.kind], sourceReferences: [...i.eventIds],
      stringIds: strings.map(s => s.id), stringCount: strings.length,
      reloadIds: intervals.filter(r => r.kind === 'RELOAD' && r.startMs < i.endMs && r.endMs > i.startMs).map(r => r.id),
      complete: warnings.length === 0 && totals.length === 1 && i.startMs >= totals[0].startMs && i.endMs <= totals[0].endMs };
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
}
export function buildPlannedExecutionSequence(c: ExecutionComparison): PlannedExecutionUnit[] {
  if (!isExecutionComparison(c)) return [];
  const s = c.snapshot;
  return (['MOVEMENT', 'POSITION', 'STRING', 'RELOAD'] as MappingKind[]).flatMap(kind => plannedElements(c, kind).map(p => {
    const position = s.plan.route.positions.find(x => x.id === p.id)!;
    const timing = s.evaluation.timing?.positionDetails.find(x => x.positionId === p.id);
    const move = s.evaluation.segments.find(x => x.toId === p.id);
    const reload = s.evaluation.timing?.reloadDetails.find(x => x.positionId === p.id);
    const seconds = kind === 'MOVEMENT' ? move?.seconds : kind === 'STRING' ? timing?.engagementSeconds
      : kind === 'RELOAD' ? reload?.rawDuration : null;
    return { id: key(kind, p.id), kind, planElementId: p.id, order: p.order, durationMs: seconds == null ? null : seconds * 1000,
      distanceInches: kind === 'MOVEMENT' ? move?.distance ?? null : null, targetIds: [...position.engagedTargetIds],
      requiredShots: kind === 'POSITION' || kind === 'STRING' ? timing?.plannedRounds ??
        position.engagedTargetIds.reduce((n, id) => n + (s.plan.engagements[id] ?? 0), 0) : null,
      reloadExpected: !!reload && (kind === 'MOVEMENT' ? reload.overlap > 0 : kind === 'POSITION' ? reload.mode === 'stationary' : kind === 'RELOAD'),
      reloadOverlapMs: reload ? reload.overlap * 1000 : null, snapshotRevision: s.revision, snapshotVersion: s.version };
  })).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
export function scoreMappingCandidate(p: PlannedExecutionUnit, rows: ObservedExecutionUnit[]): { cost: number; reasons: string[] } {
  const cfg = MAPPING_CONFIG.penalties, duration = rows[rows.length - 1].endMs - rows[0].startMs;
  let cost = cfg.merge * (rows.length - 1);
  const reasons = ['Execution order preserved', 'Confirmed interval type matches planned element'];
  if (p.durationMs !== null) {
    const mismatch = normalizedDifference(p.durationMs, duration); cost += mismatch * cfg.durationMismatch;
    reasons.push(mismatch < MAPPING_CONFIG.durationSupportTolerance ? 'Durations align' : 'Timing mismatch reduced confidence');
  }
  if (p.requiredShots !== null) {
    const shots = rows.reduce((n, r) => n + r.confirmedShotCount, 0);
    cost += normalizedDifference(p.requiredShots, shots) * cfg.shotMismatch;
    reasons.push(shots === p.requiredShots ? 'Confirmed shot count matches planned rounds; target identity is unknown' : 'Shot count differs from planned rounds');
  }
  if (p.kind === 'MOVEMENT' || p.kind === 'POSITION') {
    const reload = rows.some(r => r.reloadIds.length > 0);
    if (reload !== p.reloadExpected) { cost += cfg.reloadMismatch; reasons.push('Reload location differs'); }
    else if (reload) reasons.push('Confirmed reload occurs in expected segment');
  }
  if (rows.some(r => !r.complete)) { cost += cfg.incomplete; reasons.push('Incomplete confirmed timeline reduced confidence'); }
  if (rows.length > 1) reasons.push(p.kind === 'STRING' ? 'Multiple strings preserved at one planned position' : 'Adjacent stable intervals grouped without intervening confirmed movement');
  return { cost, reasons: reasons.slice(0, MAPPING_CONFIG.maxExplanationItems) };
}
type Path = { cost: number; pairs: MappingPair[] };
type Budget = { cells: number; evaluated: number; reached: boolean };
function asMapping(pair: MappingPair, at: string): ExecutionMapping {
  return { id: `suggested:${pair.id}`, kind: pair.kind, planElementId: pair.planElementId,
    observedIntervalId: pair.observedIntervalIds[0], ...(pair.observedIntervalIds.length > 1 ? { observedIntervalIds: pair.observedIntervalIds } : {}),
    source: 'AUTOMATIC_SUGGESTION', confidence: pair.confidence, confirmed: true, createdAt: at, updatedAt: at };
}
/** K-best monotone DP. Overlapping evidence kinds use separate lanes and shared fixed-anchor validation. */
export function alignExecutionSequences(planned: PlannedExecutionUnit[], observed: ObservedExecutionUnit[],
  allowed: (pair: MappingPair) => boolean, budget: Budget = { cells: 0, evaluated: 0, reached: false }): Path[] {
  const cfg = MAPPING_CONFIG, cells = (planned.length + 1) * (observed.length + 1);
  budget.cells += cells;
  if (budget.cells > cfg.maxDPCells) { budget.reached = true; return []; }
  const dp: Path[][][] = Array.from({ length: planned.length + 1 }, () => Array.from({ length: observed.length + 1 }, () => []));
  dp[0][0] = [{ cost: 0, pairs: [] }];
  const push = (i: number, j: number, path: Path) => {
    if (budget.evaluated >= cfg.maxAlignments) { budget.reached = true; return; }
    budget.evaluated++;
    const bucket = dp[i][j], signature = (p: Path) => p.pairs.map(x => x.id).join('|');
    if (bucket.some(x => signature(x) === signature(path))) return;
    bucket.push(path); bucket.sort((a, b) => a.cost - b.cost || signature(a).localeCompare(signature(b))); bucket.splice(cfg.beamWidth);
  };
  for (let i = 0; i <= planned.length; i++) for (let j = 0; j <= observed.length; j++) {
    if (budget.reached) return [];
    const p = planned[i];
    const matches: { size: number; pair: MappingPair }[] = [];
    if (p && observed[j]) for (let size = 1; size <= (p.kind === 'STRING' ? cfg.maxMergedStrings : p.kind === 'POSITION' ? cfg.maxMergedStableIntervals : 1) && j + size <= observed.length; size++) {
      if (budget.evaluated >= cfg.maxAlignments) { budget.reached = true; return []; }
      budget.evaluated++;
      const rows = observed.slice(j, j + size);
      if (rows.some((r, n) => r.kind !== p.kind || n > 0 && rows[n - 1].endMs > r.startMs)) continue;
      if (p.kind === 'POSITION' && rows.some((r, n) => n > 0 && r.startMs - rows[n - 1].endMs > cfg.maxStableGapMs)) continue;
      const scored = scoreMappingCandidate(p, rows), ids = rows.map(r => r.id);
      const pair: MappingPair = { id: `${p.id}=${ids.join('+')}`, kind: p.kind, planElementId: p.planElementId,
        observedIntervalIds: ids, operation: size > 1 ? p.kind === 'STRING' ? 'MULTIPLE_STRINGS_AT_POSITION' : 'MERGED_OBSERVED' : 'MATCH', ...scored,
        confidence: scored.cost < cfg.confidence.pairMediumCost && rows.every(r => r.complete) ? 'MEDIUM' : 'LOW',
        timingDeltaMs: p.durationMs === null ? null : rows[size - 1].endMs - rows[0].startMs - p.durationMs,
        startMs: rows[0].startMs, endMs: rows[size - 1].endMs, decision: 'PENDING' };
      if (allowed(pair)) matches.push({ size, pair });
    }
    for (const path of dp[i][j]) {
      if (p) push(i + 1, j, { ...path, cost: path.cost + cfg.penalties.skipPlanned });
      if (observed[j]) push(i, j + 1, { ...path, cost: path.cost + cfg.penalties.extraObserved });
      for (const { size, pair } of matches) push(i + 1, j + size, { cost: path.cost + pair.cost, pairs: [...path.pairs, pair] });
    }
  }
  return dp[planned.length][observed.length];
}
export function rankMappingCandidates(candidates: MappingCandidate[]): MappingCandidate[] {
  const selected: MappingCandidate[] = [];
  for (const candidate of candidates.slice().sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) {
    const ids = new Set(candidate.pairs.map(p => p.id));
    if (selected.some(s => { const other = new Set(s.pairs.map(p => p.id));
      const union = new Set([...ids, ...other]);
      return 1 - [...ids].filter(id => other.has(id)).length / Math.max(1, union.size) < MAPPING_CONFIG.diversityThreshold; })) continue;
    selected.push(candidate); if (selected.length === MAPPING_CONFIG.maxAlternatives) break;
  }
  return selected;
}
export const explainMappingSuggestion = (candidate: MappingCandidate) => candidate.reasons.slice(0, MAPPING_CONFIG.maxExplanationItems);

export function generateMappingCandidates(c: ExecutionComparison, video: TrainingVideo, at: string): MappingSuggestionSet {
  const result: MappingSuggestionSet = { algorithmVersion: MAPPING_ALGORITHM_VERSION, configVersion: MAPPING_CONFIG.version,
    comparisonVersion: c?.version, videoAnalysisVersion: video?.analysis?.analysisVersion, routeSnapshotVersion: c?.snapshot?.version,
    routeRevision: c?.snapshot?.revision, generatedAt: at, fingerprint: '', status: 'NO_RELIABLE_SUGGESTION', candidates: [], warnings: [], evaluated: 0 };
  try {
    if (!isExecutionComparison(c) || c.videoId !== video.session.id || !Number.isFinite(Date.parse(at))) throw new Error('Malformed comparison or generation timestamp');
    result.fingerprint = mappingInputFingerprint(c, video);
    const allPlanned = buildPlannedExecutionSequence(c), allObserved = buildObservedExecutionSequence(video).filter(o => o.kind !== 'TOTAL');
    const intervals = observedExecution(video).intervals;
    const append = (base: ExecutionComparison, mapping: ExecutionMapping) => {
      const next = { ...base, mappings: [...base.mappings, mapping] };
      if (resolveMappings(next, intervals).warnings.length) throw new Error('Conflicting mapping');
      return next;
    };
    if (!allPlanned.length || !allObserved.length) { result.warnings.push('No planned positions or confirmed observed sequence'); return result; }
    if (allPlanned.length > MAPPING_CONFIG.maxPlannedUnits || allObserved.length > MAPPING_CONFIG.maxObservedUnits) {
      result.status = 'BOUNDS_REACHED'; result.warnings.push('Sequence bounds reached'); return result;
    }
    // Missing endpoints remain visible in comparison warnings; only still-resolvable mappings can anchor.
    const anchors = c.mappings.filter(m => m.confirmed && mappingInterval(m, intervals));
    let anchored: ExecutionComparison = { ...c, mappings: [] };
    try { for (const anchor of anchors) anchored = append(anchored, anchor); }
    catch { result.status = 'CONFLICT'; result.warnings.push('Conflicting fixed mappings; review them before suggesting'); return result; }
    if (anchors.length !== c.mappings.length) result.warnings.push('Invalid or unconfirmed existing mappings require review before acceptance');
    const planned = allPlanned.filter(p => !anchors.some(m => m.kind === p.kind && m.planElementId === p.planElementId));
    const observed = allObserved.filter(o => !anchors.some(m => (m.observedIntervalIds ?? [m.observedIntervalId]).includes(o.id)));
    if (!planned.length) { result.status = 'FULLY_MAPPED'; return result; }
    const budget: Budget = { cells: 0, evaluated: 0, reached: false };
    let paths: Path[] = [{ cost: 0, pairs: [] }];
    for (const kind of ['POSITION', 'MOVEMENT', 'STRING', 'RELOAD'] as MappingKind[]) {
      const lane = alignExecutionSequences(planned.filter(p => p.kind === kind), observed.filter(o => o.kind === kind), pair => {
        // Multi-string merges cannot cross confirmed movement or a different stable stop.
        if (pair.observedIntervalIds.length > 1 && allObserved.some(o => (o.kind === 'MOVEMENT' || pair.kind === 'STRING' && o.kind === 'POSITION')
          && o.startMs > pair.startMs && o.endMs < pair.endMs)) return false;
        try { append(anchored, asMapping(pair, at)); return true; } catch { return false; }
      }, budget);
      const combined: Path[] = [];
      for (const a of paths) for (const b of lane) {
        let trial = anchored; const pairs: MappingPair[] = []; let cost = a.cost + b.cost;
        for (const pair of [...a.pairs, ...b.pairs]) {
          try { trial = append(trial, asMapping(pair, at)); pairs.push(pair); }
          catch { cost += MAPPING_CONFIG.penalties.skipPlanned + MAPPING_CONFIG.penalties.extraObserved; }
        }
        combined.push({ cost, pairs });
      }
      paths = combined.sort((a, b) => a.cost - b.cost).slice(0, MAPPING_CONFIG.beamWidth);
    }
    result.evaluated = budget.evaluated;
    if (budget.reached) { result.status = 'BOUNDS_REACHED'; result.warnings.push('Alignment bounds reached; no partial alignment applied'); return result; }
    const complete = allObserved.every(o => o.complete), cfg = MAPPING_CONFIG.confidence;
    result.candidates = rankMappingCandidates(paths.filter(p => p.pairs.length).map((path, index) => {
      const unmapped = planned.filter(p => !path.pairs.some(m => key(m.kind, m.planElementId) === p.id)).map(p => p.id);
      const extra = observed.filter(o => !path.pairs.some(p => p.observedIntervalIds.includes(o.id))).map(o => o.id);
      const coverage = (allPlanned.length - unmapped.length) / allPlanned.length;
      const score = Math.max(0, 1 - path.cost / Math.max(1, planned.length * MAPPING_CONFIG.penalties.skipPlanned + observed.length * MAPPING_CONFIG.penalties.extraObserved));
      const confidence: Confidence = complete && coverage >= cfg.highCoverage && score >= cfg.highScore && path.pairs.length >= cfg.minHighPairs
        && path.pairs.some(p => p.kind === 'MOVEMENT') && path.pairs.some(p => p.kind === 'STRING') && !extra.length ? 'HIGH'
        : complete && score >= cfg.mediumScore && coverage >= cfg.mediumCoverage && path.pairs.length >= cfg.minMediumPairs ? 'MEDIUM' : 'LOW';
      return { id: `candidate-${index + 1}`, pairs: path.pairs, score, confidence, coverage,
        unmatchedPlanned: unmapped, extraObserved: extra, reasons: ['Route order preserved', `${unmapped.length} planned elements unmapped`,
          `${extra.length} extra observed intervals`, ...(complete ? [] : ['Incomplete video or timeline reduced confidence']),
          ...(anchors.length ? [`${anchors.length} fixed mappings preserved`] : [])] };
    }).filter(p => p.coverage >= cfg.minCoverage));
    if (result.candidates.length) result.status = 'READY';
    else result.warnings.push('No reliable suggestion; insufficient compatible evidence');
    return result;
  } catch { result.warnings.push('Malformed execution data; no reliable suggestion'); return result; }
}
/** Decisions are persisted separately; only explicit acceptance creates authoritative mapping rows. */
export function reviewMappingSuggestion(c: ExecutionComparison, video: TrainingVideo, candidateId: string,
  pairId: string | 'ALL', decision: 'ACCEPTED' | 'REJECTED', at: string): ExecutionComparison {
  if (!Number.isFinite(Date.parse(at))) throw new Error('Invalid review timestamp');
  if (suggestionsAreStale(c, video)) throw new Error('Suggestions are stale. Suggest mapping again.');
  const set = c.mappingSuggestions!;
  if (!Array.isArray(set.candidates) || set.candidates.length > MAPPING_CONFIG.maxAlternatives) throw new Error('Invalid suggestions. Regenerate.');
  const candidate = set.candidates.find(x => x.id === candidateId);
  if (!candidate || !Array.isArray(candidate.pairs) || candidate.pairs.length > MAPPING_CONFIG.maxPlannedUnits) throw new Error('Invalid suggestion candidate');
  let next = c;
  const changed = new Set<string>();
  for (const pair of candidate.pairs.filter(p => p.decision === 'PENDING' && (pairId === 'ALL' || p.id === pairId))) {
    if (decision === 'ACCEPTED') {
      if (next.mappings.some(m => m.kind === pair.kind && m.planElementId === pair.planElementId)) throw new Error('Suggestion conflicts with an existing mapping. Review or manually replace it.');
      next = mapObservedEventsToPlan(next, video, asMapping(pair, at));
    }
    changed.add(pair.id);
  }
  return { ...next, updatedAt: at, mappingSuggestions: { ...set, candidates: set.candidates.map(x => ({ ...x,
    pairs: x.pairs.map(p => changed.has(p.id) ? { ...p, decision } : p) })) } };
}
