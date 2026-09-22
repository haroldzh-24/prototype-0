export const POSE_ANALYSIS_CONFIG = Object.freeze({
  version: 1, fps: 10, maxDurationMs: 60000, maxSamples: 600, maxPeople: 4, maxImageSize: 640,
  minJointConfidence: 0.45, minBodyConfidence: 0.4, smoothingWindowMs: 100,
  maxGapMs: 250, subjectMaxJump: 0.18, subjectMargin: 0.06,
  startSpeed: 0.12, stopSpeed: 0.045, startHoldMs: 100, stopHoldMs: 300,
  minDisplacement: 0.035, positionDisplacement: 0.08, positionDurationMs: 400,
  reactionSpeed: 0.16, reactionHoldMs: 100, reactionWindowMs: 2000, baselineMs: 200,
  articulationSpeed: 0.06, highConfidence: 0.8, maxMissingFraction: 0.2,
  cameraAmbiguousFraction: 0.6,
  duplicateMs: 100, maxSuggestions: 160, maxPreviewSamples: 120, overlayToleranceMs: 100,
});
export const POSE_DETECTOR_VERSION = 'vision-body-motion-1';
export const poseJoints = ['nose', 'neck', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
  'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'] as const;
export type PoseJointName = typeof poseJoints[number];
export type PosePoint = { x: number; y: number; confidence: number };
export type PoseBody = { confidence: number; joints: Partial<Record<PoseJointName, PosePoint>> };
/** Coordinates are top-left normalized DISPLAYED video pixels, never stage geometry. */
export type PoseFrame = {
  timestampMs: number; width: number; height: number; mirrored: boolean;
  people: PoseBody[]; crowded?: boolean;
};
export type PoseExtraction = { frames: PoseFrame[]; durationMs: number; warnings: string[]; nativeRevision: number };
export type PoseSample = Omit<PoseFrame, 'people'> & { body: PoseBody | null; ambiguous: boolean };
export type PoseEventType = 'REACTION' | 'MOVEMENT_START' | 'MOVEMENT_STOP' | 'POSITION_EXIT' | 'POSITION_ENTRY';
export type PoseCandidate = {
  type: PoseEventType; timestampMs: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  segmentId?: string; stimulusId?: string;
};
export type PoseMotionSegment = {
  id: string; startMs: number; endMs: number; durationMs: number;
  displacement: number; peakRelativeVelocity: number; accelerationOnsetMs: number;
  decelerationOnsetMs: number; stabilizationMs: number; cameraAmbiguous: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
};
export type PoseAnalysisRun = {
  analysisVersion: 1; detectorVersion: string; analyzedAt: string; nativeRevision: number;
  config: typeof POSE_ANALYSIS_CONFIG; durationMs: number; sampleCount: number; missingCount: number;
  candidates: PoseCandidate[]; segments: PoseMotionSegment[]; preview: PoseSample[]; warnings: string[];
  matches: { candidateIndex: number; eventId: string }[];
  armPhases: { stimulusId: string; onsetMs: number; stabilizationMs: number | null }[];
};
export const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const unit = (x: unknown) => finite(x) && x >= 0 && x <= 1;
export function cleanBody(body: PoseBody): PoseBody {
  if (!body || !unit(body.confidence) || !body.joints || typeof body.joints !== 'object') throw new Error('Malformed pose body.');
  const joints: PoseBody['joints'] = {};
  for (const name of poseJoints) {
    const p = body.joints[name];
    if (p === undefined || p === null) continue;
    if (!unit(p.x) || !unit(p.y) || !unit(p.confidence)) throw new Error('Malformed pose joint.');
    if (p.confidence >= POSE_ANALYSIS_CONFIG.minJointConfidence) joints[name] = { x: p.x, y: p.y, confidence: p.confidence };
  }
  return { confidence: body.confidence, joints };
}
export function validatePoseExtraction(input: PoseExtraction): PoseExtraction {
  if (!input || !finite(input.durationMs) || input.durationMs <= 0 || input.durationMs > POSE_ANALYSIS_CONFIG.maxDurationMs
    || !Number.isInteger(input.nativeRevision) || input.nativeRevision < 1 || !Array.isArray(input.frames)
    || input.frames.length > POSE_ANALYSIS_CONFIG.maxSamples || !Array.isArray(input.warnings)
    || input.warnings.length > 20 || input.warnings.some(w => typeof w !== 'string' || w.length > 500)) throw new Error('Malformed pose extraction.');
  let previous = -1;
  const frames = input.frames.map(f => {
    if (!f || !finite(f.timestampMs) || f.timestampMs <= previous || f.timestampMs < 0 || f.timestampMs > input.durationMs
      || !finite(f.width) || f.width <= 0 || !finite(f.height) || f.height <= 0 || typeof f.mirrored !== 'boolean'
      || !Array.isArray(f.people) || f.people.length > POSE_ANALYSIS_CONFIG.maxPeople) throw new Error('Malformed pose frame.');
    previous = f.timestampMs;
    return { timestampMs: f.timestampMs, width: f.width, height: f.height, mirrored: f.mirrored,
      people: f.people.map(cleanBody), crowded: f.crowded === true };
  });
  return { frames, durationMs: input.durationMs, nativeRevision: input.nativeRevision, warnings: [...input.warnings] };
}

/** Reference mapping for a raw top-left image point through a video preferredTransform.
 * Native extraction applies this transform to pixels BEFORE Vision, so do not apply twice. */
export function normalizeVideoPoint(x: number, y: number, width: number, height: number,
  t: { a: number; b: number; c: number; d: number; tx: number; ty: number }) {
  if (![x, y, width, height, ...Object.values(t)].every(finite) || width <= 0 || height <= 0) throw new Error('Invalid video geometry.');
  const transform = (px: number, py: number) => ({ x: t.a * px + t.c * py + t.tx, y: t.b * px + t.d * py + t.ty });
  const corners = [transform(0, 0), transform(width, 0), transform(0, height), transform(width, height)];
  const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
  const w = Math.max(...corners.map(p => p.x)) - left, h = Math.max(...corners.map(p => p.y)) - top;
  if (!w || !h) throw new Error('Degenerate video transform.');
  const point = transform(x * width, y * height);
  return { x: (point.x - left) / w, y: (point.y - top) / h };
}
export function containedVideoRect(width: number, height: number, videoWidth: number, videoHeight: number) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const w = videoWidth * scale, h = videoHeight * scale;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}
