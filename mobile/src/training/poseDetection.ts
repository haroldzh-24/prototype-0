import { isTrustedEvent, sortEvents } from './videoModel';
import type { TimelineEvent } from './videoModel';
import { cleanBody, finite, poseJoints, POSE_ANALYSIS_CONFIG as C, POSE_DETECTOR_VERSION, validatePoseExtraction } from './poseModel';
import type { PoseAnalysisRun, PoseBody, PoseCandidate, PoseExtraction, PoseMotionSegment, PosePoint, PoseSample } from './poseModel';

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (points: PosePoint[]): PosePoint => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length, confidence: Math.min(...points.map(p => p.confidence)) });
function torso(body: PoseBody): PosePoint | null {
  const points = [body.joints.leftHip, body.joints.rightHip, body.joints.leftShoulder, body.joints.rightShoulder];
  return points.every((p): p is PosePoint => !!p) && body.confidence >= C.minBodyConfidence ? mean(points) : null;
}

/** Conservative continuity, not person identification. Never reacquire after a long loss. */
export function selectPoseSubject(extraction: PoseExtraction) {
  const input = validatePoseExtraction(extraction), warnings = new Set(input.warnings);
  let last: { center: Point; timestampMs: number } | null = null, lost = false;
  const samples: PoseSample[] = input.frames.map(frame => {
    const viable = frame.people.map(body => ({ body, center: torso(body) })).filter(item => item.center !== null);
    let chosen: typeof viable[number] | undefined;
    if (last && frame.timestampMs - last.timestampMs > C.maxGapMs) {
      lost = true; warnings.add('Subject continuity lost. Later people were not silently reacquired; review framing or use manual markers.');
    }
    if (!lost && !frame.crowded) {
      if (!last && viable.length === 1) chosen = viable[0];
      else if (last) {
        const ranked = viable.map(item => ({ ...item, delta: distance(item.center!, last!.center) }))
          .sort((a, b) => a.delta - b.delta);
        if (ranked[0]?.delta <= C.subjectMaxJump && (!ranked[1] || ranked[1].delta - ranked[0].delta >= C.subjectMargin)) chosen = ranked[0];
      }
    }
    const ambiguous = frame.people.length > 1 || frame.crowded === true;
    if (ambiguous) warnings.add('Multiple people or ambiguous identity: only uniquely continuous evidence is used.');
    if (chosen) last = { center: chosen.center!, timestampMs: frame.timestampMs };
    return { timestampMs: frame.timestampMs, width: frame.width, height: frame.height, mirrored: frame.mirrored,
      body: chosen?.body ?? null, ambiguous };
  });
  return { samples, warnings: [...warnings] };
}

export type MotionFeature = {
  timestampMs: number; intervalStartMs: number; center: Point; startCenter: Point;
  speed: number; wristSpeed: number | null; articulation: number; acceleration: number;
  confidence: number; cameraAmbiguous: boolean; ambiguous: boolean;
};
/** Relative video widths/heights per SECOND; never physical distance or speed. */
export function analyzePoseMotion(samples: PoseSample[]): (MotionFeature | null)[] {
  let previous: PoseSample | null = null, smoothed: PoseBody | null = null, previousSpeed = 0;
  return samples.map(sample => {
    const raw = sample.body;
    if (!raw || !torso(raw)) { previous = null; smoothed = null; previousSpeed = 0; return null; }
    const dtMs = previous ? sample.timestampMs - previous.timestampMs : 0;
    if (!previous || !smoothed || dtMs <= 0 || dtMs > C.maxGapMs
      || previous.width !== sample.width || previous.height !== sample.height || previous.mirrored !== sample.mirrored) {
      previous = sample; smoothed = raw; previousSpeed = 0; return null;
    }
    const alpha = dtMs / (C.smoothingWindowMs + dtMs), dt = dtMs / 1000;
    const filtered: PoseBody = { confidence: raw.confidence, joints: {} };
    for (const name of poseJoints) {
      const p = raw.joints[name], old = smoothed.joints[name];
      if (p) filtered.joints[name] = old ? { ...p, x: old.x + alpha * (p.x - old.x), y: old.y + alpha * (p.y - old.y) } : p;
    }
    const center = torso(filtered)!, startCenter = torso(smoothed)!;
    const speed = distance(center, startCenter) / dt;
    let articulation = 0, wristSpeed: number | null = null;
    for (const name of ['leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'] as const) {
      const point = filtered.joints[name], old = smoothed.joints[name];
      if (!point || !old) continue;
      const relative = distance({ x: point.x - center.x, y: point.y - center.y },
        { x: old.x - startCenter.x, y: old.y - startCenter.y }) / dt;
      articulation = Math.max(articulation, relative);
      if (name.endsWith('Wrist')) wristSpeed = Math.max(wristSpeed ?? 0, relative);
    }
    const feature: MotionFeature = { timestampMs: sample.timestampMs, intervalStartMs: previous.timestampMs,
      center, startCenter, speed, wristSpeed, articulation, acceleration: (speed - previousSpeed) / dt,
      confidence: Math.min(center.confidence, startCenter.confidence, raw.confidence, smoothed.confidence),
      cameraAmbiguous: speed >= C.startSpeed && articulation < C.articulationSpeed,
      ambiguous: sample.ambiguous || previous.ambiguous };
    previous = sample; smoothed = filtered; previousSpeed = speed;
    return feature;
  });
}

export function detectPose(extraction: PoseExtraction, events: TimelineEvent[], analyzedAt = new Date().toISOString()): PoseAnalysisRun {
  const { samples, warnings } = selectPoseSubject(extraction), features = analyzePoseMotion(samples);
  const candidates: PoseCandidate[] = [], segments: PoseMotionSegment[] = [], armPhases: PoseAnalysisRun['armPhases'] = [];
  const missingCount = samples.filter(s => !s.body).length;
  const degraded = missingCount / Math.max(1, samples.length) > C.maxMissingFraction;
  const cameraAmbiguous = (support: MotionFeature[]) => {
    const moving = support.filter(f => f.speed >= C.startSpeed);
    return moving.length > 0 && moving.filter(f => f.cameraAmbiguous).length / moving.length >= C.cameraAmbiguousFraction;
  };
  const quality = (support: MotionFeature[]): PoseCandidate['confidence'] =>
    degraded || support.some(f => f.ambiguous) || cameraAmbiguous(support) ? 'LOW'
      : support.every(f => f.confidence >= C.highConfidence) ? 'HIGH' : 'MEDIUM';
  let start = -1, active = false, stopped = -1;
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!f) {
      if (active) warnings.push('Movement interrupted by missing pose data; no stop or position entry was invented.');
      start = stopped = -1; active = false; continue;
    }
    if (!active) {
      if (f.speed >= C.startSpeed) {
        if (start < 0) start = i;
        active = f.timestampMs - features[start]!.intervalStartMs >= C.startHoldMs + 1000 / C.fps;
      } else start = -1;
      continue;
    }
    if (f.speed <= C.stopSpeed) { if (stopped < 0) stopped = i; } else stopped = -1;
    if (stopped < 0 || f.timestampMs - features[stopped]!.intervalStartMs < C.stopHoldMs) continue;
    const first = features[start]!, end = features[stopped]!, support = features.slice(start, i + 1).filter((v): v is MotionFeature => v !== null);
    const displacement = distance(first.startCenter, end.center);
    if (displacement >= C.minDisplacement) {
      const confidence = quality(support), id = `motion:${first.intervalStartMs}:${end.intervalStartMs}`;
      const peak = support.reduce((a, b) => b.speed > a.speed ? b : a);
      const deceleration = support.find(s => s.timestampMs >= peak.timestampMs && s.acceleration < 0);
      const segment: PoseMotionSegment = { id, startMs: first.intervalStartMs, endMs: end.intervalStartMs,
        durationMs: end.intervalStartMs - first.intervalStartMs, displacement, peakRelativeVelocity: peak.speed,
        accelerationOnsetMs: first.intervalStartMs, decelerationOnsetMs: deceleration?.intervalStartMs ?? end.intervalStartMs,
        stabilizationMs: f.timestampMs, cameraAmbiguous: cameraAmbiguous(support), confidence };
      segments.push(segment);
      candidates.push({ type: 'MOVEMENT_START', timestampMs: segment.startMs, confidence, segmentId: id },
        { type: 'MOVEMENT_STOP', timestampMs: segment.endMs, confidence, segmentId: id });
      if (!segment.cameraAmbiguous && confidence !== 'LOW' && displacement >= C.positionDisplacement && segment.durationMs >= C.positionDurationMs) {
        candidates.push({ type: 'POSITION_EXIT', timestampMs: segment.startMs, confidence, segmentId: id },
          { type: 'POSITION_ENTRY', timestampMs: segment.endMs, confidence, segmentId: id });
      }
    }
    start = stopped = -1; active = false;
  }
  if (active) warnings.push('Movement continues at the analysis boundary; no stop or position entry was invented.');
  const stimuli = sortEvents(events).filter(e => e.type === 'STIMULUS');
  for (let si = 0; si < stimuli.length && armPhases.length < C.maxSuggestions; si++) {
    const stimulus = stimuli[si], until = Math.min(stimulus.timestampMs + C.reactionWindowMs, stimuli[si + 1]?.timestampMs ?? Infinity);
    const baseline = features.filter((f): f is MotionFeature => !!f && f.timestampMs <= stimulus.timestampMs
      && f.intervalStartMs >= stimulus.timestampMs - C.baselineMs);
    if (!baseline.length || baseline[baseline.length - 1].timestampMs - baseline[0].intervalStartMs < C.baselineMs
      || baseline.some(f => f.speed > C.stopSpeed || f.wristSpeed === null || f.wristSpeed > C.stopSpeed)) continue;
    let onset = -1;
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (!f) { onset = -1; continue; }
      if (f.intervalStartMs < stimulus.timestampMs || f.timestampMs >= until) continue;
      if (f.speed >= C.reactionSpeed || (f.wristSpeed ?? 0) >= C.reactionSpeed) {
        if (onset < 0) onset = i;
        const first = features[onset]!;
        if (f.timestampMs - first.intervalStartMs < C.reactionHoldMs + 1000 / C.fps) continue;
        // An onset at stimulus time is not evidence of a positive reaction interval.
        if (first.intervalStartMs <= stimulus.timestampMs) break;
        const confidence = isTrustedEvent(stimulus) ? quality(features.slice(onset, i + 1).filter((v): v is MotionFeature => !!v)) : 'LOW';
        candidates.push({ type: 'REACTION', timestampMs: first.intervalStartMs, confidence, stimulusId: stimulus.id });
        if ((first.wristSpeed ?? 0) >= C.reactionSpeed) {
          let stableStart: number | null = null, stabilizationMs: number | null = null;
          for (let j = i + 1; j < features.length; j++) {
            const next = features[j];
            if (!next || next.timestampMs >= until || next.wristSpeed === null) break;
            if (next.wristSpeed <= C.stopSpeed) {
              stableStart ??= next.intervalStartMs;
              if (next.timestampMs - stableStart >= C.stopHoldMs) { stabilizationMs = next.timestampMs; break; }
            } else stableStart = null;
          }
          armPhases.push({ stimulusId: stimulus.id, onsetMs: first.intervalStartMs, stabilizationMs });
        }
        break;
      } else onset = -1;
    }
  }
  if (!samples.some(s => s.body)) warnings.push('No usable person found. Check visibility, light and framing.');
  else if (missingCount) warnings.push('Missing or low-confidence joints break motion continuity; gaps are not interpolated.');
  if (segments.some(s => s.cameraAmbiguous)) warnings.push('Camera motion or rigid body translation is ambiguous. Movement confidence is reduced; no physical distance is inferred.');
  if (!candidates.length) warnings.push('No meaningful motion candidates found. Stationary footage is a valid result.');
  if (candidates.length > C.maxSuggestions) warnings.push('Movement suggestion limit reached.');
  const stride = Math.max(1, Math.ceil(samples.length / C.maxPreviewSamples));
  return { analysisVersion: 1, detectorVersion: POSE_DETECTOR_VERSION, analyzedAt, nativeRevision: extraction.nativeRevision,
    config: { ...C }, durationMs: extraction.durationMs, sampleCount: samples.length, missingCount,
    candidates: candidates.sort((a, b) => a.timestampMs - b.timestampMs || a.type.localeCompare(b.type)).slice(0, C.maxSuggestions),
    segments: segments.slice(0, C.maxSuggestions), armPhases: armPhases.slice(0, C.maxSuggestions),
    preview: samples.filter((_, i) => i % stride === 0), warnings: [...new Set(warnings)].slice(0, 20), matches: [] };
}

export function mergePoseDetections(existing: TimelineEvent[], run: PoseAnalysisRun, durationMs: number | null) {
  const retained = existing.filter(e => e.source !== 'POSE_DETECTED' || isTrustedEvent(e));
  const suggestions: TimelineEvent[] = [], matches: PoseAnalysisRun['matches'] = [];
  run.candidates.forEach((candidate, index) => {
    if (durationMs !== null && candidate.timestampMs > durationMs) return;
    const match = retained.find(e => isTrustedEvent(e) && e.type === candidate.type && Math.abs(e.timestampMs - candidate.timestampMs) <= C.duplicateMs);
    if (match) { matches.push({ candidateIndex: index, eventId: match.id }); return; }
    let id = `pose:${run.detectorVersion}:${candidate.type}:${candidate.timestampMs}`;
    while (retained.some(e => e.id === id) || suggestions.some(e => e.id === id)) id += ':new';
    suggestions.push({ id, type: candidate.type, timestampMs: candidate.timestampMs, source: 'POSE_DETECTED',
      confirmed: false, confidence: candidate.confidence,
      metadata: { pose: { detectorVersion: run.detectorVersion, analyzedAt: run.analyzedAt,
        segmentId: candidate.segmentId, stimulusId: candidate.stimulusId } } });
  });
  return { events: sortEvents([...retained, ...suggestions], durationMs), run: { ...run, matches } };
}

/** Validate optional bounded diagnostics without accepting cached measurement eligibility. */
export function validatePoseRun(run?: PoseAnalysisRun): PoseAnalysisRun | undefined {
  if (run === undefined) return undefined;
  const fail = () => { throw new Error('Unsupported or damaged pose analysis.'); };
  if (!run || run.analysisVersion !== 1 || run.detectorVersion !== POSE_DETECTOR_VERSION
    || !Number.isFinite(Date.parse(run.analyzedAt)) || JSON.stringify(run.config) !== JSON.stringify(C)
    || !Number.isInteger(run.nativeRevision) || run.nativeRevision < 1 || !finite(run.durationMs) || run.durationMs <= 0 || run.durationMs > C.maxDurationMs
    || !Number.isInteger(run.sampleCount) || run.sampleCount < 0 || run.sampleCount > C.maxSamples
    || !Number.isInteger(run.missingCount) || run.missingCount < 0 || run.missingCount > run.sampleCount
    || !Array.isArray(run.candidates) || run.candidates.length > C.maxSuggestions
    || !Array.isArray(run.segments) || run.segments.length > C.maxSuggestions
    || !Array.isArray(run.preview) || run.preview.length > C.maxPreviewSamples
    || !Array.isArray(run.armPhases) || run.armPhases.length > C.maxSuggestions
    || !Array.isArray(run.matches) || run.matches.length > run.candidates.length
    || !Array.isArray(run.warnings) || run.warnings.length > 20 || run.warnings.some(w => typeof w !== 'string' || w.length > 500)) return fail();
  const time = (n: unknown) => finite(n) && n >= 0 && n <= run.durationMs;
  const confidence = (c: unknown) => ['LOW', 'MEDIUM', 'HIGH'].includes(c as string);
  for (const c of run.candidates) if (!c || !['REACTION', 'MOVEMENT_START', 'MOVEMENT_STOP', 'POSITION_EXIT', 'POSITION_ENTRY'].includes(c.type)
    || !time(c.timestampMs) || !confidence(c.confidence) || c.segmentId !== undefined && typeof c.segmentId !== 'string'
    || c.stimulusId !== undefined && typeof c.stimulusId !== 'string') return fail();
  for (const s of run.segments) if (!s || typeof s.id !== 'string' || !time(s.startMs) || !time(s.endMs) || s.endMs <= s.startMs
    || s.durationMs !== s.endMs - s.startMs || !time(s.accelerationOnsetMs) || !time(s.decelerationOnsetMs) || !time(s.stabilizationMs)
    || !finite(s.displacement) || s.displacement < 0 || !finite(s.peakRelativeVelocity) || s.peakRelativeVelocity < 0
    || typeof s.cameraAmbiguous !== 'boolean' || !confidence(s.confidence)) return fail();
  let previous = -1;
  for (const s of run.preview) {
    if (!s || !time(s.timestampMs) || s.timestampMs <= previous || !finite(s.width) || s.width <= 0 || !finite(s.height) || s.height <= 0
      || typeof s.mirrored !== 'boolean' || typeof s.ambiguous !== 'boolean' || s.body !== null && !s.body) return fail();
    if (s.body) cleanBody(s.body);
    previous = s.timestampMs;
  }
  if (run.matches.some(m => !m || !Number.isInteger(m.candidateIndex) || m.candidateIndex < 0 || m.candidateIndex >= run.candidates.length
    || typeof m.eventId !== 'string')) return fail();
  if (run.armPhases.some(p => !p || typeof p.stimulusId !== 'string' || !time(p.onsetMs)
    || p.stabilizationMs !== null && (!time(p.stabilizationMs) || p.stabilizationMs < p.onsetMs))) return fail();
  // Explicit reconstruction drops accidental frame/PCM buffers and unknown payload fields.
  return { analysisVersion: 1, detectorVersion: run.detectorVersion, analyzedAt: run.analyzedAt, nativeRevision: run.nativeRevision,
    config: { ...C }, durationMs: run.durationMs, sampleCount: run.sampleCount, missingCount: run.missingCount,
    candidates: run.candidates.map(c => ({ type: c.type, timestampMs: c.timestampMs, confidence: c.confidence,
      ...(c.segmentId ? { segmentId: c.segmentId } : {}), ...(c.stimulusId ? { stimulusId: c.stimulusId } : {}) })),
    segments: run.segments.map(s => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, durationMs: s.durationMs,
      displacement: s.displacement, peakRelativeVelocity: s.peakRelativeVelocity, accelerationOnsetMs: s.accelerationOnsetMs,
      decelerationOnsetMs: s.decelerationOnsetMs, stabilizationMs: s.stabilizationMs, cameraAmbiguous: s.cameraAmbiguous, confidence: s.confidence })),
    preview: run.preview.map(s => ({ timestampMs: s.timestampMs, width: s.width, height: s.height, mirrored: s.mirrored,
      ambiguous: s.ambiguous, body: s.body ? cleanBody(s.body) : null })), warnings: [...run.warnings],
    matches: run.matches.map(m => ({ candidateIndex: m.candidateIndex, eventId: m.eventId })),
    armPhases: run.armPhases.map(p => ({ stimulusId: p.stimulusId, onsetMs: p.onsetMs, stabilizationMs: p.stabilizationMs })) };
}
