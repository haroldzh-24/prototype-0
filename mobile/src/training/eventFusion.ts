import { eventTypes, isTrustedEvent, sortEvents } from './videoModel';
import type { EventConfidence, EventType, TimelineEvent, VideoAnalysisResult } from './videoModel';

export const FUSION_VERSION = 'event-fusion-1';
export const FUSION_CONFIG = Object.freeze({ version: 1, sharpMs: 35, onsetMs: 180, defaultMs: 90,
  maxEvidence: 1600, maxCluster: 32, maxSearchMs: 180, maxHypotheses: 800, maxSupport: 32 });
export type DetectorFamily = 'AUDIO' | 'BODY_POSE' | 'CLOSE_UP_VISION' | 'MANUAL';
export type FusionEvidence = {
  id: string; timestampMs: number; type: EventType;
  source: 'AUDIO_DETECTED' | 'POSE_DETECTED' | 'VISION_DETECTED' | 'MANUAL' | 'USER_CONFIRMED';
  confidence: EventConfidence; family: DetectorFamily; detectorVersion: string; runId: string;
  durationMs?: number; warnings: string[]; sourceMetadata?: Record<string, unknown>;
  interpretation?: string; timelineEventId?: string;
};
export type FusedHypothesis = {
  id: string; type: EventType; timestampMs: number; confidence: EventConfidence; score: number;
  evidenceIds: string[]; families: DetectorFamily[]; temporalSpreadMs: number; warnings: string[];
  disagreement: { types: EventType[]; runConflict: boolean; temporal: boolean };
  explanations: string[]; status: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED'; authoritativeEventId?: string;
  fusionVersion: string; configVersion: number; detectorRuns: { family: DetectorFamily; runId: string; detectorVersion: string }[];
};
export type FusionResult = { fusionVersion: string; configVersion: number; evidence: FusionEvidence[];
  hypotheses: FusedHypothesis[]; warnings: string[]; rejectedEvidenceIds: string[] };
const families: Record<string, DetectorFamily> = { AUDIO_DETECTED: 'AUDIO', POSE_DETECTED: 'BODY_POSE', VISION_DETECTED: 'CLOSE_UP_VISION', MANUAL: 'MANUAL', USER_CONFIRMED: 'MANUAL' };
const unique = <T,>(items: T[]) => [...new Set(items)];
const trusted = (e: FusionEvidence) => e.source === 'MANUAL' || e.source === 'USER_CONFIRMED';
const weight = (e: FusionEvidence) => ({ LOW: .35, MEDIUM: .6, HIGH: .82, CONFIRMED: 1 })[e.confidence];
const order = (a: FusionEvidence, b: FusionEvidence) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id);
export const toleranceFor = (type: EventType) => ['SHOT', 'FIRST_SHOT', 'STIMULUS'].includes(type) ? FUSION_CONFIG.sharpMs
  : ['REACTION', 'MOVEMENT_START', 'POSITION_EXIT'].includes(type) ? FUSION_CONFIG.onsetMs : FUSION_CONFIG.defaultMs;

/** Only these cross-type pairs are equivalent enough to associate. CUSTOM requires the same explicit interpretation. */
export const EVENT_COMPATIBILITY: Partial<Record<EventType, readonly EventType[]>> = {
  SHOT: ['FIRST_SHOT'], FIRST_SHOT: ['SHOT'], REACTION: ['MOVEMENT_START'], MOVEMENT_START: ['REACTION'],
};
export function areEventTypesCompatible(a: Pick<FusionEvidence, 'type' | 'interpretation'>, b: Pick<FusionEvidence, 'type' | 'interpretation'>) {
  if (a.type === 'UNKNOWN' || b.type === 'UNKNOWN') return false;
  if (a.type === 'CUSTOM' || b.type === 'CUSTOM') return a.type === b.type && !!a.interpretation && a.interpretation === b.interpretation;
  return a.type === b.type || !!EVENT_COMPATIBILITY[a.type]?.includes(b.type);
}

/** Invalid records are skipped; duplicate IDs are dropped altogether rather than picking a conflicting winner. */
export function normalizeEvidence(input: unknown): { evidence: FusionEvidence[]; warnings: string[] } {
  const warnings: string[] = [], valid: FusionEvidence[] = [], counts = new Map<string, number>();
  if (!Array.isArray(input)) return { evidence: [], warnings: ['INVALID_EVIDENCE'] };
  if (input.length > FUSION_CONFIG.maxEvidence) warnings.push('EVIDENCE_LIMIT');
  for (const item of input.slice(0, FUSION_CONFIG.maxEvidence)) {
    if (!item || typeof item !== 'object') { warnings.push('INVALID_EVIDENCE'); continue; }
    const e = item as FusionEvidence;
    if (typeof e.id !== 'string' || !e.id || !Number.isFinite(e.timestampMs) || e.timestampMs < 0
      || !eventTypes.includes(e.type) || !Object.hasOwn(families, e.source)
      || !Object.values(families).includes(e.family) || (e.source !== 'USER_CONFIRMED' && families[e.source] !== e.family)
      || !['LOW', 'MEDIUM', 'HIGH', 'CONFIRMED'].includes(e.confidence) || e.confidence === 'CONFIRMED' && !trusted(e)
      || typeof e.runId !== 'string' || !e.runId || typeof e.detectorVersion !== 'string'
      || e.durationMs !== undefined && (!Number.isFinite(e.durationMs) || e.durationMs < 0)) { warnings.push('INVALID_EVIDENCE'); continue; }
    counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
    valid.push({ ...e, warnings: Array.isArray(e.warnings) ? unique(e.warnings.filter(w => typeof w === 'string')).slice(0, 24) : [] });
  }
  if ([...counts.values()].some(n => n > 1)) warnings.push('DUPLICATE_EVIDENCE_ID');
  return { evidence: valid.filter(e => counts.get(e.id) === 1).sort(order), warnings: unique(warnings) };
}

export function clusterEventEvidence(evidence: FusionEvidence[]) {
  const clusters: FusionEvidence[][] = [];
  // Seed trusted anchors first, so a nearby suggestion cannot bridge two authoritative events.
  for (const e of evidence.filter(trusted).sort(order)) clusters.push([e]);
  for (const e of evidence.filter(e => !trusted(e)).sort(order)) {
    const candidates = clusters.filter(c => c.length < FUSION_CONFIG.maxCluster && c.length < FUSION_CONFIG.maxSupport
      && Math.abs(c[0].timestampMs - e.timestampMs) <= FUSION_CONFIG.maxSearchMs
      && c.every(p => areEventTypesCompatible(p, e) && Math.abs(p.timestampMs - e.timestampMs) <= Math.min(toleranceFor(p.type), toleranceFor(e.type))));
    candidates.sort((a, b) => Number(trusted(b[0])) - Number(trusted(a[0]))
      || Math.abs(a[0].timestampMs - e.timestampMs) - Math.abs(b[0].timestampMs - e.timestampMs) || a[0].id.localeCompare(b[0].id));
    if (candidates[0]) candidates[0].push(e); else clusters.push([e]);
  }
  return clusters;
}

function representatives(evidence: FusionEvidence[]) {
  return unique(evidence.map(e => e.family)).map(f => evidence.filter(e => e.family === f)
    .sort((a, b) => weight(b) - weight(a) || order(a, b))[0]);
}
export function estimateFusedTimestamp(evidence: FusionEvidence[]) {
  const anchor = evidence.filter(trusted).sort(order)[0];
  if (anchor) return anchor.timestampMs;
  const sorted = representatives(evidence).sort(order), total = sorted.reduce((sum, e) => sum + weight(e), 0);
  let sum = 0;
  for (const e of sorted) { sum += weight(e); if (sum >= total / 2) return e.timestampMs; }
  return 0;
}
function warningPenalty(warnings: string[]) {
  const text = warnings.join(' ').toUpperCase();
  return Math.min(.4, (/CAMERA[ _-]?MOTION|CAMERA.*MOV/.test(text) ? .18 : 0)
    + (/OCCLUS|LOW[ _-]?VISIBILITY|UNUSABLE|MISSING/.test(text) ? .12 : 0)
    + (/NOISY|LOUD BACKGROUND|CLIPP/.test(text) ? .14 : 0) + (/TRACKING[ _-]?(LOSS|LOST)|TRACKING LOST/.test(text) ? .15 : 0));
}
export function combineConfidence(evidence: FusionEvidence[]) {
  if (evidence.some(trusted)) return { score: 1, confidence: 'CONFIRMED' as EventConfidence };
  const reps = representatives(evidence), max = Math.max(0, ...reps.map(weight));
  const spread = Math.max(...evidence.map(e => e.timestampMs)) - Math.min(...evidence.map(e => e.timestampMs));
  const agreement = Math.max(0, 1 - spread / Math.min(...evidence.map(e => toleranceFor(e.type))));
  const boost = (1 - max) * (1 - Math.pow(.45, Math.max(0, reps.length - 1))) * agreement;
  const score = Math.max(0, Math.min(.98, max + boost - .1 * (1 - agreement)
    - (unique(evidence.map(e => e.type)).length > 1 ? .06 : 0) - warningPenalty(evidence.flatMap(e => e.warnings))));
  return { score, confidence: (score >= .8 ? 'HIGH' : score >= .5 ? 'MEDIUM' : 'LOW') as EventConfidence };
}
export function buildFusedHypothesis(evidence: FusionEvidence[]): FusedHypothesis {
  const anchor = evidence.find(trusted), ids = evidence.map(e => e.id).sort();
  const types = unique(evidence.map(e => e.type)).sort(), fs = unique(evidence.map(e => e.family)).sort();
  const spread = Math.max(...evidence.map(e => e.timestampMs)) - Math.min(...evidence.map(e => e.timestampMs));
  const runConflict = fs.some(f => unique(evidence.filter(e => e.family === f).map(e => e.runId)).length > 1);
  const temporal = spread > Math.min(...evidence.map(e => toleranceFor(e.type))) / 2;
  const warnings = unique([...evidence.flatMap(e => e.warnings), ...(runConflict ? ['CONFLICTING_RUNS'] : [])]);
  return { id: `fusion:${JSON.stringify(ids)}`, type: anchor?.type ?? evidence.slice().sort((a, b) => weight(b) - weight(a) || order(a, b))[0].type,
    timestampMs: estimateFusedTimestamp(evidence), ...combineConfidence(evidence), evidenceIds: ids, families: fs,
    temporalSpreadMs: spread, warnings, disagreement: { types, runConflict, temporal },
    explanations: [anchor ? 'TRUSTED_EVENT_RETAINED' : fs.length > 1 ? 'INDEPENDENT_MODALITIES' : 'SINGLE_MODALITY',
      temporal ? 'TEMPORAL_DISAGREEMENT' : 'CLOSE_TEMPORAL_AGREEMENT',
      ...(types.length > 1 ? ['TYPE_DISAGREEMENT'] : []), ...(runConflict ? ['CONFLICTING_RUNS'] : []),
      ...(!anchor && fs.length < 3 ? ['PARTIAL_MODALITIES'] : []),
      ...(warningPenalty(warnings) ? [anchor ? 'SUPPORT_WARNINGS' : 'WARNINGS_REDUCED_CONFIDENCE'] : [])],
    status: anchor ? 'CONFIRMED' : 'SUGGESTED', authoritativeEventId: anchor?.timelineEventId,
    fusionVersion: FUSION_VERSION, configVersion: FUSION_CONFIG.version,
    detectorRuns: evidence.filter((e, i) => evidence.findIndex(p => p.family === e.family && p.runId === e.runId && p.detectorVersion === e.detectorVersion) === i)
      .map(e => ({ family: e.family, runId: e.runId, detectorVersion: e.detectorVersion })) };
}

type Runs = Pick<VideoAnalysisResult, 'audioRun' | 'poseRun' | 'closeRun'>;
/** Compact adapter: raw runs retain every detector-specific payload; evidence stores only candidate metadata. */
export function collectEvidence(events: TimelineEvent[], runs: Runs): FusionEvidence[] {
  const evidence: FusionEvidence[] = [];
  const linked = new Set<string>();
  for (const [family, source, run] of [
    ['AUDIO', 'AUDIO_DETECTED', runs.audioRun], ['BODY_POSE', 'POSE_DETECTED', runs.poseRun],
    ['CLOSE_UP_VISION', 'VISION_DETECTED', runs.closeRun],
  ] as const) {
    if (!run) continue;
    run.candidates.forEach((candidate, index) => {
      const type = 'type' in candidate ? candidate.type : 'CUSTOM';
      const interpretation = 'kind' in candidate ? candidate.kind : undefined;
      const match = events.find(e => e.source === source && e.type === type && e.timestampMs === candidate.timestampMs
        && (!interpretation || e.metadata?.note === interpretation));
      if (match) linked.add(match.id);
      evidence.push({ id: `${family}:${run.detectorVersion}:${run.analyzedAt}:${index}`, type, timestampMs: candidate.timestampMs,
        source, family, confidence: candidate.confidence, detectorVersion: run.detectorVersion,
        runId: `${family}:${run.analyzedAt}`, warnings: run.warnings, interpretation, timelineEventId: match?.id,
        ...('metadata' in candidate ? { sourceMetadata: candidate.metadata, durationMs: candidate.metadata.durationMs } : { sourceMetadata: { ...candidate } }) });
    });
  }
  for (const event of events) {
    if (!isTrustedEvent(event) && linked.has(event.id)) continue;
    if (!isTrustedEvent(event) && !families[event.source]) continue;
    const meta = event.metadata?.audio ?? event.metadata?.pose;
    evidence.push({ id: `event:${event.id}`, timestampMs: event.timestampMs, type: event.type,
      source: isTrustedEvent(event) ? event.source === 'MANUAL' ? 'MANUAL' : 'USER_CONFIRMED' : event.source as FusionEvidence['source'],
      family: families[event.source] ?? 'MANUAL', confidence: event.confidence, detectorVersion: meta?.detectorVersion ?? 'timeline-1',
      runId: meta?.analyzedAt ?? `event:${event.id}`, warnings: [], sourceMetadata: event.metadata,
      interpretation: event.metadata?.note, timelineEventId: event.id });
  }
  return evidence;
}

export function fuseEvidence(input: unknown, previous?: FusionResult): FusionResult {
  const normalized = normalizeEvidence(input), rejected = new Set(Array.isArray(previous?.rejectedEvidenceIds)
    ? previous.rejectedEvidenceIds.filter(id => typeof id === 'string').slice(0, FUSION_CONFIG.maxEvidence) : []);
  const clusters = clusterEventEvidence(normalized.evidence.filter(e => !rejected.has(e.id)));
  if (clusters.length > FUSION_CONFIG.maxHypotheses) normalized.warnings.push('HYPOTHESIS_LIMIT');
  if (clusters.some(c => c.length === FUSION_CONFIG.maxCluster)) normalized.warnings.push('CLUSTER_LIMIT');
  const hypotheses = clusters.slice(0, FUSION_CONFIG.maxHypotheses).map(buildFusedHypothesis);
  const rejectedItems = normalized.evidence.filter(e => rejected.has(e.id));
  for (const c of clusterEventEvidence(rejectedItems)) {
    if (hypotheses.length >= FUSION_CONFIG.maxHypotheses) break;
    hypotheses.push({ ...buildFusedHypothesis(c), status: 'REJECTED' });
  }
  return { fusionVersion: FUSION_VERSION, configVersion: FUSION_CONFIG.version, evidence: normalized.evidence,
    hypotheses, warnings: unique(normalized.warnings), rejectedEvidenceIds: [...rejected].filter(id => normalized.evidence.some(e => e.id === id)).sort() };
}

export function attachToTrustedEvent(h: FusedHypothesis, event: TimelineEvent): FusedHypothesis {
  return { ...h, type: event.type, timestampMs: event.timestampMs, confidence: 'CONFIRMED', score: 1,
    status: 'CONFIRMED', authoritativeEventId: event.id, explanations: unique([...h.explanations, 'TRUSTED_EVENT_RETAINED']) };
}
export function fuseTimeline(events: TimelineEvent[], runs: Runs, previous?: FusionResult): FusionResult {
  const input = collectEvidence(events, runs), warnings: string[] = [];
  const archived = normalizeEvidence(previous?.evidence ?? []).evidence;
  const references = (e: TimelineEvent) => unique([
    ...(Array.isArray(e.metadata?.fusion?.evidenceIds) ? e.metadata.fusion.evidenceIds.filter(id => typeof id === 'string') : []),
    ...(Array.isArray(previous?.hypotheses) ? previous.hypotheses.flatMap(h => h?.authoritativeEventId === e.id && Array.isArray(h.evidenceIds)
      ? h.evidenceIds.filter(id => typeof id === 'string') : []) : []),
  ]).slice(0, FUSION_CONFIG.maxSupport);
  for (const e of events.filter(isTrustedEvent)) {
    for (const id of references(e)) {
      if (input.some(p => p.id === id)) continue;
      const old = archived.find(p => p.id === id);
      if (old) input.push(old); else warnings.push('STALE_EVIDENCE_REFERENCE');
    }
  }
  const result = fuseEvidence(input, previous);
  if (previous && (previous.fusionVersion !== FUSION_VERSION || previous.configVersion !== FUSION_CONFIG.version)) warnings.push('FUSION_RECOMPUTED');
  // Explicit confirmation remains linked even if the user edits its time or type later.
  for (const e of events.filter(isTrustedEvent)) {
    const refs = new Set(references(e));
    const support = result.evidence.filter(p => refs.has(p.id) || p.id === `event:${e.id}`);
    if (!refs.size || !support.length) continue;
    const existing = result.hypotheses.find(h => h.authoritativeEventId === e.id);
    const ids = new Set([...support.map(p => p.id), ...(existing?.evidenceIds ?? [])]);
    result.hypotheses = result.hypotheses.flatMap(h => {
      if (h.authoritativeEventId === e.id) return [];
      if (h.authoritativeEventId) return [h];
      const remaining = result.evidence.filter(p => h.evidenceIds.includes(p.id) && !ids.has(p.id));
      return remaining.length ? [{ ...buildFusedHypothesis(remaining), status: h.status }] : [];
    });
    const selected = result.evidence.filter(p => ids.has(p.id)).sort((a, b) => Number(trusted(b)) - Number(trusted(a)) || order(a, b)).slice(0, FUSION_CONFIG.maxSupport);
    result.hypotheses.push(attachToTrustedEvent(buildFusedHypothesis(selected), e));
  }
  if (result.hypotheses.length > FUSION_CONFIG.maxHypotheses) {
    result.hypotheses = result.hypotheses.slice(0, FUSION_CONFIG.maxHypotheses); warnings.push('HYPOTHESIS_LIMIT');
  }
  result.warnings = unique([...result.warnings, ...warnings]);
  result.hypotheses.sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
  return result;
}

/** Presentation only. Raw events and runs remain stored unchanged. */
export function applyFusionToTimeline(events: TimelineEvent[], fusion?: FusionResult) {
  if (!fusion) return events;
  const hidden = new Set(fusion.hypotheses.filter(h => h.status !== 'SUGGESTED' || h.evidenceIds.length > 1)
    .flatMap(h => h.evidenceIds).concat(fusion.rejectedEvidenceIds));
  const hiddenEvents = new Set(fusion.evidence.filter(e => hidden.has(e.id)).map(e => e.timelineEventId));
  return events.filter(e => isTrustedEvent(e) || !hiddenEvents.has(e.id));
}
export function reviewFusedHypothesis(events: TimelineEvent[], fusion: FusionResult, id: string,
  action: 'CONFIRM' | 'REJECT', patch?: { type: EventType; timestampMs: number }, durationMs?: number | null) {
  const h = fusion.hypotheses.find(p => p.id === id);
  if (!h || h.status !== 'SUGGESTED') throw new Error('Hypothesis is no longer awaiting review.');
  if (action === 'REJECT') return { events, fusion: { ...fusion,
    hypotheses: fusion.hypotheses.map(p => p.id === id ? { ...p, status: 'REJECTED' as const } : p),
    rejectedEvidenceIds: unique([...fusion.rejectedEvidenceIds, ...h.evidenceIds]) } };
  const event: TimelineEvent = { id: `confirmed:${h.id}`, type: patch?.type ?? h.type, timestampMs: patch?.timestampMs ?? h.timestampMs,
    source: 'DERIVED', confidence: 'CONFIRMED', confirmed: true,
    metadata: { fusion: { hypothesisId: h.id, evidenceIds: h.evidenceIds, fusionVersion: FUSION_VERSION, configVersion: FUSION_CONFIG.version } } };
  return { events: sortEvents([...events, event], durationMs), fusion: { ...fusion,
    hypotheses: fusion.hypotheses.map(p => p.id === id ? attachToTrustedEvent(p, event) : p) } };
}
