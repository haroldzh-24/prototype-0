import type { TimingFactor } from '../profile/model';
import type { StartingType } from './model';
import type { PerformanceObservation } from './observations';
import { trainingContexts } from './observations';
import { assertTimeMs, isTrustedEvent, msToSeconds, sortEvents, VIDEO_ANALYSIS_VERSION } from './videoModel';
import type { EventConfidence, EventType, MeasurementKind, ShotString, TimelineEvent, TrainingVideo, VideoAnalysisResult, VideoMeasurement, VideoSession } from './videoModel';

const shot = (e: TimelineEvent) => e.type === 'FIRST_SHOT' || e.type === 'SHOT';
const confidenceOf = (events: TimelineEvent[]): EventConfidence => events.length && events.every(isTrustedEvent) ? 'CONFIRMED'
  : events.some(e => e.confidence === 'LOW') || !events.length ? 'LOW' : events.some(e => e.confidence === 'MEDIUM') ? 'MEDIUM' : 'HIGH';

export function analyzeVideo(session: VideoSession, input: TimelineEvent[]): VideoAnalysisResult {
  validateSession(session);
  const events = sortEvents(input, session.durationMs), measurements: VideoMeasurement[] = [], warnings: string[] = [];
  const add = (kind: MeasurementKind, a: TimelineEvent, b: TimelineEvent) => {
    if (b.timestampMs <= a.timestampMs) { warnings.push(`${kind}: endpoints must have increasing times.`); return; }
    const support = [a, b];
    measurements.push({ id: `${kind}:${a.id}:${b.id}`, kind, startMs: a.timestampMs, endMs: b.timestampMs,
      durationMs: b.timestampMs - a.timestampMs, eventIds: support.map(e => e.id),
      eligible: support.every(isTrustedEvent), confidence: confidenceOf(support),
      ...(kind === 'MOVEMENT' && a.metadata?.distanceInches ? { distanceInches: a.metadata.distanceInches } : {}) });
  };
  // Consume each opener once per metric; never pair across a new stimulus or drill end.
  const pair = (start: EventType, end: EventType, kind: MeasurementKind) => {
    let pending: TimelineEvent | undefined;
    for (const e of events) {
      if (e.type === 'STIMULUS' || e.type === 'DRILL_END') {
        if (pending && e.type !== end) { warnings.push(`${kind}: missing ${end}.`); pending = undefined; }
      }
      if (e.type === start) {
        if (pending) warnings.push(`${kind}: repeated ${start}; earlier interval incomplete.`);
        pending = e;
      } else if (e.type === end) {
        if (pending) { add(kind, pending, e); pending = undefined; }
        else warnings.push(`${kind}: ${end} has no ${start}.`);
      }
    }
    if (pending) warnings.push(`${kind}: missing ${end}.`);
  };
  pair('STIMULUS', 'REACTION', 'REACTION');
  pair('REACTION', 'FIRST_SHOT', 'PRESENTATION');
  pair('STIMULUS', 'FIRST_SHOT', 'DRAW');
  pair('MAG_RELEASE', 'MAG_INSERT', 'RELOAD_MANIPULATION');
  pair('MAG_ACCESS', 'MAG_INSERT', 'MAG_ACCESS');
  pair('MAG_RELEASE', 'RELOAD_COMPLETE', 'RELOAD');
  pair('MOVEMENT_START', 'MOVEMENT_STOP', 'MOVEMENT');
  pair('POSITION_EXIT', 'POSITION_ENTRY', 'POSITION_TRANSITION');
  pair('STIMULUS', 'DRILL_END', 'TOTAL');
  const shotStrings: ShotString[] = [];
  let previous: TimelineEvent | undefined, group: ShotString | undefined;
  let boundary: ShotString['separatedBy'] = 'START', reload: TimelineEvent | undefined, transition: TimelineEvent | undefined;
  for (const e of events) {
    const separator: ShotString['separatedBy'] | undefined =
      ['MAG_RELEASE', 'MAG_ACCESS', 'MAG_INSERT', 'RELOAD_COMPLETE'].includes(e.type) ? 'RELOAD'
      : ['MOVEMENT_START', 'MOVEMENT_STOP', 'POSITION_EXIT', 'POSITION_ENTRY'].includes(e.type) ? 'MOVEMENT'
      : e.type === 'TARGET_TRANSITION' ? 'TARGET_TRANSITION'
      : e.type === 'STIMULUS' || e.type === 'DRILL_END' ? 'START' : undefined;
    if (separator) { group = undefined; boundary = separator; previous = undefined; }
    if (e.type === 'STIMULUS' || e.type === 'DRILL_END' || e.type === 'MAG_RELEASE') { reload = undefined; transition = undefined; }
    if (e.type === 'RELOAD_COMPLETE') reload = e;
    if (e.type === 'TARGET_TRANSITION') transition = e;
    if (!shot(e)) continue;
    if (reload) { add('POST_RELOAD_SHOT', reload, e); reload = undefined; }
    if (transition) { add('TARGET_TRANSITION', transition, e); transition = undefined; }
    const metadataChanged = group && (group.targetId !== e.metadata?.targetId || group.manualStringId !== e.metadata?.stringId);
    if (metadataChanged || e.type === 'FIRST_SHOT') { group = undefined; previous = undefined; boundary = 'MANUAL'; }
    if (!group) {
      group = { id: `string:${e.id}`, eventIds: [], targetId: e.metadata?.targetId,
        manualStringId: e.metadata?.stringId, separatedBy: boundary };
      shotStrings.push(group);
    }
    group.eventIds.push(e.id);
    if (previous) add('SPLIT', previous, e);
    previous = e;
  }
  const movementSegments = measurements.filter(m => m.kind === 'MOVEMENT' || m.kind === 'POSITION_TRANSITION').map(m => ({
    id: m.id, startMs: m.startMs, endMs: m.endMs, durationMs: m.durationMs, eventIds: m.eventIds,
    confidence: m.confidence, movementType: events.find(e => e.id === m.eventIds[0])?.metadata?.movementType,
  }));
  const completeness: VideoAnalysisResult['completeness'] = {};
  const eventStatus = (type: EventType) => {
    const found = events.filter(e => e.type === type);
    return !found.length ? 'Not measured' : found.every(isTrustedEvent) ? 'Confirmed' : 'Partial';
  };
  completeness.Stimulus = eventStatus('STIMULUS'); completeness['First shot'] = eventStatus('FIRST_SHOT');
  for (const [label, kinds, relevant] of [
    ['Reload', ['RELOAD'], ['MAG_RELEASE', 'MAG_ACCESS', 'MAG_INSERT', 'RELOAD_COMPLETE']],
    ['Movement', ['MOVEMENT', 'POSITION_TRANSITION'], ['MOVEMENT_START', 'MOVEMENT_STOP', 'POSITION_EXIT', 'POSITION_ENTRY']],
    ['Transitions', ['TARGET_TRANSITION'], ['TARGET_TRANSITION']],
    ['Total', ['TOTAL'], ['STIMULUS', 'DRILL_END']],
  ] as [string, MeasurementKind[], EventType[]][]) {
    const found = measurements.filter(m => kinds.includes(m.kind)), annotated = events.filter(e => relevant.includes(e.type));
    const covered = new Set(found.flatMap(m => m.eventIds));
    const unmatched = annotated.some(e => !covered.has(e.id) && !['MAG_ACCESS', 'MAG_INSERT'].includes(e.type));
    completeness[label] = !annotated.length ? 'Not measured' : found.length && found.every(m => m.eligible)
      && annotated.every(isTrustedEvent) && !unmatched ? 'Confirmed' : 'Partial';
  }
  if (completeness.Stimulus !== 'Confirmed') warnings.push('Stimulus missing or unconfirmed; response timing is incomplete.');
  if (completeness['First shot'] !== 'Confirmed') warnings.push('First shot missing or unconfirmed.');
  if (session.durationMs === null) warnings.push('Video duration unknown; timeline bounds cannot yet be checked.');
  if (shotStrings.some(g => !g.targetId && !g.manualStringId && g.eventIds.length > 1)) warnings.push('Assign a same-target string or target to calibrate splits.');
  return { analysisVersion: VIDEO_ANALYSIS_VERSION, videoId: session.id, trainingSessionId: session.trainingSessionId,
    events, movementSegments, shotStrings, measurements, warnings: [...new Set(warnings)], confidence: confidenceOf(events), completeness };
}

export function validateSession(session: VideoSession) {
  if (!session || session.analysisVersion !== VIDEO_ANALYSIS_VERSION) throw new Error('Unsupported video analysis version; saved data has not been changed.');
  if (!session.id || !session.trainingSessionId || (session.drillId !== null && typeof session.drillId !== 'string')
    || !trainingContexts.includes(session.context) || !['ANNOTATING', 'REVIEWED'].includes(session.analysisStatus)
    || !Number.isFinite(Date.parse(session.createdAt)) || !Number.isFinite(Date.parse(session.importedAt))
    || !session.asset || typeof session.asset.uri !== 'string' || !session.asset.uri || typeof session.asset.name !== 'string'
    || !['DOCUMENTS', 'BROWSER_SESSION'].includes(session.asset.storage)
    || /^(https?|data):/i.test(session.asset.uri)) throw new Error('Invalid local video session.');
  if (session.asset.storage === 'DOCUMENTS' && !/^training-videos\/[a-z0-9-]+\.[a-z0-9]{1,8}$/i.test(session.asset.uri)) throw new Error('Invalid app-owned video reference.');
  if (session.asset.storage === 'BROWSER_SESSION' && !session.asset.uri.startsWith('blob:')) throw new Error('Invalid browser video reference.');
  if (session.asset.size !== undefined && (!Number.isFinite(session.asset.size) || session.asset.size < 0)) throw new Error('Invalid video size.');
  if (session.durationMs !== null) assertTimeMs(session.durationMs);
  if (session.fps !== null && (typeof session.fps !== 'number' || !Number.isFinite(session.fps) || session.fps <= 0)) throw new Error('Invalid FPS metadata.');
}
export function normalizeVideo(video: TrainingVideo): TrainingVideo {
  validateSession(video.session);
  if (!video.analysis || video.analysis.analysisVersion !== VIDEO_ANALYSIS_VERSION || video.analysis.videoId !== video.session.id
    || video.analysis.trainingSessionId !== video.session.trainingSessionId || !Array.isArray(video.analysis.events)) throw new Error('Unsupported or damaged video analysis.');
  return { session: video.session, analysis: analyzeVideo(video.session, video.analysis.events) };
}

/** Re-derive instead of trusting persisted eligibility or measurement values. */
export function videoObservations(video: TrainingVideo, startingType: StartingType): PerformanceObservation[] {
  const { session, analysis } = normalizeVideo(video);
  if (session.durationMs === null) return [];
  const observations: PerformanceObservation[] = [];
  for (const measurement of analysis.measurements) {
    if (!measurement.eligible) continue;
    let factor: TimingFactor | undefined, value = msToSeconds(measurement.durationMs);
    if (measurement.kind === 'DRAW' && ['competitionHolster', 'retentionHolster', 'appendix'].includes(startingType)) factor = 'drawTime';
    if (measurement.kind === 'RELOAD') factor = 'reloadTime';
    if (measurement.kind === 'SPLIT' && analysis.shotStrings.some(g => (g.targetId || g.manualStringId)
      && measurement.eventIds.every(id => g.eventIds.includes(id)))) factor = 'averageSplitTime';
    if (measurement.kind === 'MOVEMENT' && measurement.distanceInches) { factor = 'movementSpeed'; value = measurement.distanceInches / value; }
    // Marker-to-shot transition is retained for review, not mislabeled as shot-to-shot profile timing.
    if (!factor || !Number.isFinite(value) || value <= 0) continue;
    const support = analysis.events.filter(e => measurement.eventIds.includes(e.id));
    observations.push({ id: `${session.id}:${measurement.id}`, factor, value, context: session.context,
      measuredAt: session.createdAt, source: 'VIDEO_ANALYSIS', trainingSessionId: session.trainingSessionId,
      videoId: session.id, analysisVersion: session.analysisVersion, eventIds: measurement.eventIds, confirmed: true,
      ...(measurement.distanceInches ? { distanceInches: measurement.distanceInches, durationSeconds: msToSeconds(measurement.durationMs) } : {}),
      evidenceKey: JSON.stringify([session.context, session.createdAt, startingType, factor, value, support]) });
  }
  return observations;
}
/** Missing files are a recoverable media state; annotations remain available. */
export async function videoAssetAvailable(session: VideoSession, exists: (uri: string) => boolean | Promise<boolean>) {
  try { return !!(await exists(session.asset.uri)); } catch { return false; }
}
