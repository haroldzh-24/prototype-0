import type { CloseRun } from './closeUp';
import type { FusionResult } from './eventFusion';
import type { ExecutionComparison } from './executionComparison';
import type { TrainingContext } from './observations';
import type { AudioAnalysisRun } from './audioDetection';
import type { PoseAnalysisRun } from './poseModel';

export const VIDEO_ANALYSIS_VERSION = 1 as const;
export const MAX_TIMELINE_EVENTS = 2000;
export const eventTypes = ['STIMULUS', 'REACTION', 'HAND_ON_GUN', 'DRAW_COMPLETE', 'FIRST_SHOT', 'SHOT',
  'TARGET_TRANSITION', 'MAG_RELEASE', 'MAG_ACCESS', 'MAG_INSERT', 'RELOAD_COMPLETE', 'MOVEMENT_START',
  'MOVEMENT_STOP', 'POSITION_ENTRY', 'POSITION_EXIT', 'DRILL_END', 'CUSTOM', 'UNKNOWN'] as const;
export type EventType = typeof eventTypes[number];
export type EventSource = 'MANUAL' | 'AUDIO_DETECTED' | 'POSE_DETECTED' | 'VISION_DETECTED' | 'DERIVED';
export type EventConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'CONFIRMED';
export type TimelineEvent = {
  id: string; type: EventType; timestampMs: number; source: EventSource;
  confidence: EventConfidence; confirmed: boolean;
  metadata?: { targetId?: string; stringId?: string; movementType?: string; distanceInches?: number; note?: string;
    fusion?: { hypothesisId: string; evidenceIds: string[]; fusionVersion: string; configVersion: number };
    pose?: { detectorVersion: string; analyzedAt: string; segmentId?: string; stimulusId?: string };
    audio?: { detectorVersion: string; analyzedAt: string; durationMs: number; peak: number; rise: number; toneRatio: number; toneHz: number } };
};
export type VideoSession = {
  id: string; trainingSessionId: string; drillId: string | null;
  asset: { uri: string; name: string; storage: 'DOCUMENTS' | 'BROWSER_SESSION'; size?: number };
  durationMs: number | null; fps: number | null; createdAt: string; importedAt: string;
  context: TrainingContext; analysisStatus: 'ANNOTATING' | 'REVIEWED'; analysisVersion: 1;
};
export type MeasurementKind = 'REACTION' | 'PRESENTATION' | 'DRAW' | 'SPLIT' | 'RELOAD_MANIPULATION'
  | 'MAG_ACCESS' | 'RELOAD' | 'POST_RELOAD_SHOT' | 'MOVEMENT' | 'POSITION_TRANSITION' | 'TARGET_TRANSITION' | 'TOTAL' | 'STRING_TIME';
export type VideoMeasurement = {
  id: string; kind: MeasurementKind; startMs: number; endMs: number; durationMs: number;
  eventIds: string[]; eligible: boolean; confidence: EventConfidence;
  distanceInches?: number;
};
export const measurementLabels: Record<MeasurementKind, string> = {
  REACTION: 'Stimulus to reaction', PRESENTATION: 'Reaction to first shot', DRAW: 'Stimulus to first shot',
  SPLIT: 'Shot split', RELOAD_MANIPULATION: 'Magazine release to insert', MAG_ACCESS: 'Magazine access to insert',
  RELOAD: 'Reload: release to complete', POST_RELOAD_SHOT: 'Reload complete to next shot', MOVEMENT: 'Movement duration',
  POSITION_TRANSITION: 'Position exit to entry', TARGET_TRANSITION: 'Transition marker to next shot', TOTAL: 'Total drill time', STRING_TIME: 'Shooting string time',
};
export type MovementSegment = {
  id: string; startMs: number; endMs: number; durationMs: number; eventIds: string[];
  movementType?: string; confidence: EventConfidence;
};
export type ShotString = {
  id: string; eventIds: string[]; targetId?: string; manualStringId?: string;
  separatedBy: 'START' | 'RELOAD' | 'MOVEMENT' | 'TARGET_TRANSITION' | 'MANUAL';
};
export type VideoAnalysisResult = {
  fusion?: FusionResult;
  closeRun?: CloseRun;
  poseRun?: PoseAnalysisRun;
  audioRun?: AudioAnalysisRun;
  analysisVersion: 1; videoId: string; trainingSessionId: string;
  events: TimelineEvent[]; movementSegments: MovementSegment[]; shotStrings: ShotString[];
  measurements: VideoMeasurement[]; warnings: string[];
  confidence: EventConfidence; completeness: Record<string, 'Confirmed' | 'Partial' | 'Not measured'>;
};
export type TrainingVideo = { session: VideoSession; analysis: VideoAnalysisResult; executionComparison?: ExecutionComparison };

/** The only timeline coordinate is milliseconds from video start (fractional ms allowed). */
export function assertTimeMs(value: number, durationMs?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (durationMs != null && value > durationMs))
    throw new Error('Time must be finite, non-negative milliseconds within the video.');
}
export function secondsToMs(seconds: number) { assertTimeMs(seconds); const ms = seconds * 1000; assertTimeMs(ms); return ms; }
export function msToSeconds(ms: number) { assertTimeMs(ms); return ms / 1000; }
/** Native playback can briefly emit invalid/unavailable time during source changes. */
export function playbackTimeMs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(seconds * 1000)) return null;
  return secondsToMs(seconds);
}
function assertFps(fps: number | null): asserts fps is number {
  if (fps === null || !Number.isFinite(fps) || fps <= 0) throw new Error('Frame conversion requires known positive FPS metadata.');
}
/** Frame estimates for constant/nominal FPS, not exact VFR frame indexing. */
export function timeToFrame(ms: number, fps: number | null) { assertTimeMs(ms); assertFps(fps); return Math.floor(ms * fps / 1000); }
export function frameToTime(frame: number, fps: number | null) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error('Invalid frame index.');
  assertFps(fps); const ms = frame * 1000 / fps; assertTimeMs(ms); return ms;
}
export const isTrustedEvent = (event: TimelineEvent) => event.source === 'MANUAL' || event.confirmed === true;
export function sortEvents(events: TimelineEvent[], durationMs?: number | null): TimelineEvent[] {
  if (!Array.isArray(events) || events.length > MAX_TIMELINE_EVENTS) throw new Error('Timeline exceeds the supported event limit or is damaged.');
  const ids = new Set<string>();
  for (const event of events) {
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 10000 || ids.has(event.id) || !eventTypes.includes(event.type)
      || !['MANUAL', 'AUDIO_DETECTED', 'POSE_DETECTED', 'VISION_DETECTED', 'DERIVED'].includes(event.source)
      || !['LOW', 'MEDIUM', 'HIGH', 'CONFIRMED'].includes(event.confidence) || typeof event.confirmed !== 'boolean')
      throw new Error('Invalid or duplicate timeline event.');
    if (event.confidence === 'CONFIRMED' && !isTrustedEvent(event)) throw new Error('Machine confidence is not user confirmation.');
    assertTimeMs(event.timestampMs, durationMs);
    if (event.metadata !== undefined) {
      if (!event.metadata || typeof event.metadata !== 'object') throw new Error('Invalid event metadata.');
      for (const key of ['targetId', 'stringId', 'movementType', 'note'] as const)
        if (event.metadata[key] !== undefined && typeof event.metadata[key] !== 'string') throw new Error('Invalid event metadata.');
      if (event.metadata.distanceInches !== undefined && (!Number.isFinite(event.metadata.distanceInches) || event.metadata.distanceInches <= 0))
        throw new Error('Known distance must be positive inches.');
      const audio = event.metadata.audio;
      const pose = event.metadata.pose;
      if (pose !== undefined && (!pose || typeof pose.detectorVersion !== 'string' || !Number.isFinite(Date.parse(pose.analyzedAt))
        || pose.segmentId !== undefined && typeof pose.segmentId !== 'string' || pose.stimulusId !== undefined && typeof pose.stimulusId !== 'string'))
        throw new Error('Invalid pose detector metadata.');
      if (audio !== undefined && (!audio || typeof audio.detectorVersion !== 'string' || !Number.isFinite(Date.parse(audio.analyzedAt))
        || [audio.durationMs, audio.peak, audio.rise, audio.toneRatio, audio.toneHz].some(value => !Number.isFinite(value) || value < 0)))
        throw new Error('Invalid audio detector metadata.');
    }
    ids.add(event.id);
  }
  return [...events].sort((a, b) => a.timestampMs - b.timestampMs || a.id.localeCompare(b.id));
}
export function editEvent(events: TimelineEvent[], id: string, patch: Partial<Pick<TimelineEvent, 'type' | 'timestampMs' | 'metadata'>>, durationMs?: number | null) {
  if (!events.some(e => e.id === id)) throw new Error('Event no longer exists.');
  return sortEvents(events.map(e => e.id === id ? { ...e, ...patch, confirmed: !!e.metadata?.fusion && e.confirmed,
    confidence: e.source === 'MANUAL' || e.metadata?.fusion && e.confirmed ? 'CONFIRMED' as const : 'LOW' as const } : e), durationMs);
}
export function deleteEvent(events: TimelineEvent[], id: string) { return sortEvents(events.filter(e => e.id !== id)); }
export function confirmEvent(events: TimelineEvent[], id: string) {
  if (!events.some(e => e.id === id)) throw new Error('Event no longer exists.');
  return sortEvents(events.map(e => e.id === id ? { ...e, confirmed: true, confidence: 'CONFIRMED' as const } : e));
}
