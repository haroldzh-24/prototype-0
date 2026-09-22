import { isTrustedEvent, sortEvents } from './videoModel';
import type { TimelineEvent } from './videoModel';
import { finite } from './poseModel';

export const CLOSE_CONFIG = Object.freeze({ version: 1, fps: 10, maxSamples: 600, maxPreview: 120,
  maxDurationMs: 60000, maxGapMs: 150, minConfidence: .45, settleRadius: .025, settleHoldMs: 400,
  transitionDistance: .12, transitionHoldMs: 400, proximity: .035, proximityHoldMs: 300, cameraSpeed: .08 });
export const CLOSE_VERSION = 'vision-close-up-1';
export const handJoints = ['wrist', 'thumbCMC', 'thumbMP', 'thumbIP', 'thumbTip',
  'indexMCP', 'indexPIP', 'indexDIP', 'indexTip', 'middleMCP', 'middlePIP', 'middleDIP', 'middleTip',
  'ringMCP', 'ringPIP', 'ringDIP', 'ringTip', 'littleMCP', 'littlePIP', 'littleDIP', 'littleTip'] as const;
export type Point = { x: number; y: number };
export type Region = Point & { width: number; height: number };
export type Hand = { id?: number; joints: Partial<Record<typeof handJoints[number], Point & { confidence: number }>> };
export type CloseFrame = { timestampMs: number; width: number; height: number; hands: Hand[];
  object: { region: Region; center: Point; confidence: number; status: 'TRACKED' } | { status: 'LOST'; confidence: number };
  globalMotion: Point | null };
export type CloseExtraction = { durationMs: number; frames: CloseFrame[]; warnings: string[] };
export type CloseSelection = { timestampMs: number; region: Region };
export type Motion = { dx: number; dy: number; displacement: number; pathLength: number; velocity: number;
  directionRad: number | null; displacementVariance: number; velocityVariance: number; coverage: number; confidence: number };
export type EventMotion = { eventId: string; timestampMs: number; preStartMs: number; postEndMs: number;
  pre: Motion | null; post: { initialVector: Point; maxDisplacement: number; timeToMaximumMs: number;
    returnPath: Point[]; residual: Point; confidence: number } | null;
  settleTimeMs: number | null; residualOffset: Point | null; confidence: number };
export type CloseRun = { analysisVersion: 1; detectorVersion: string; configVersion: 1; analyzedAt: string;
  selection: CloseSelection; preMs: number; postMs: number; durationMs: number; sampleCount: number;
  path: CloseFrame[]; preview: CloseFrame[]; metrics: Motion | null; events: EventMotion[];
  candidates: { timestampMs: number; kind: 'OBJECT_TRANSITION' | 'HAND_OBJECT_PROXIMITY'; confidence: 'LOW' | 'MEDIUM' }[]; warnings: string[] };
const unit = (x: unknown) => finite(x) && x >= 0 && x <= 1;
const point = (p: Point) => !!p && unit(p.x) && unit(p.y);
export function validRegion(r: Region) { return point(r) && finite(r.width) && finite(r.height) && r.width > 0 && r.height > 0 && r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001; }
/** Vision requires a strict unit rectangle; tolerate only floating-point noise at display edges. */
export function visionRegion(region: Region): Region {
  if (!validRegion(region)) throw new Error('Select a valid region within the video.');
  const result = { x: region.x, y: region.y, width: Math.min(region.width, 1 - region.x), height: Math.min(region.height, 1 - region.y) };
  if (result.width <= 0 || result.height <= 0) throw new Error('Selected region is outside the video.');
  return result;
}
const fail = (): never => { throw new Error('Malformed or unsupported close-up analysis.'); };
export function cleanFrames(frames: CloseFrame[], duration: number): CloseFrame[] {
  if (!Array.isArray(frames) || frames.length > CLOSE_CONFIG.maxSamples) return fail();
  let previous = -1;
  return frames.map(f => {
    if (!f || !finite(f.timestampMs) || f.timestampMs <= previous || f.timestampMs < 0 || f.timestampMs > duration
      || !finite(f.width) || f.width <= 0 || !finite(f.height) || f.height <= 0 || !Array.isArray(f.hands) || f.hands.length > 2
      || !f.object || !unit(f.object.confidence) || !['TRACKED', 'LOST'].includes(f.object.status)
      || f.globalMotion !== null && (!f.globalMotion || !finite(f.globalMotion.x) || !finite(f.globalMotion.y))) return fail();
    previous = f.timestampMs;
    const hands = f.hands.map(h => {
      if (!h || !h.joints || h.id !== undefined && (!Number.isSafeInteger(h.id) || h.id < 0)) return fail();
      const joints: Hand['joints'] = {};
      for (const name of handJoints) {
        const p = h.joints[name]; if (p == null) continue;
        if (!point(p) || !unit(p.confidence)) return fail();
        if (p.confidence >= CLOSE_CONFIG.minConfidence) joints[name] = { x: p.x, y: p.y, confidence: p.confidence };
      }
      return { joints, ...(h.id !== undefined ? { id: h.id } : {}) };
    });
    let object: CloseFrame['object'] = { status: 'LOST', confidence: f.object.confidence };
    if (f.object.status === 'TRACKED') {
      const r = f.object.region;
      if (!validRegion(r) || !point(f.object.center) || Math.abs(f.object.center.x - r.x - r.width / 2) > .00001
        || Math.abs(f.object.center.y - r.y - r.height / 2) > .00001) return fail();
      if (f.object.confidence >= CLOSE_CONFIG.minConfidence) object = { status: 'TRACKED', confidence: f.object.confidence,
        region: { x: r.x, y: r.y, width: r.width, height: r.height }, center: { x: f.object.center.x, y: f.object.center.y } };
    }
    return { timestampMs: f.timestampMs, width: f.width, height: f.height, hands, object,
      globalMotion: f.globalMotion ? { x: f.globalMotion.x, y: f.globalMotion.y } : null };
  });
}
const center = (f: CloseFrame): Point | null => f.object.status === 'TRACKED' ? f.object.center : null;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const variance = (xs: number[]) => { const m = mean(xs); return mean(xs.map(x => (x - m) ** 2)); };
const connected = (a: CloseFrame, b: CloseFrame) => !!center(a) && !!center(b) && b.timestampMs - a.timestampMs <= CLOSE_CONFIG.maxGapMs;
function cameraFactor(frames: CloseFrame[]) {
  if (frames.some((f, i) => i > 0 && f.globalMotion && Math.hypot(f.globalMotion.x, f.globalMotion.y) * 1000 / (f.timestampMs - frames[i - 1].timestampMs) > CLOSE_CONFIG.cameraSpeed)) return .25;
  return frames.slice(1).some(f => f.globalMotion === null) ? .5 : 1;
}
export function motion(frames: CloseFrame[], start: number, end: number): Motion | null {
  const usable = frames.filter(f => center(f)); if (usable.length < 2 || end <= start) return null;
  const speeds: number[] = []; let pathLength = 0, covered = 0;
  frames.forEach((f, i) => { if (i && connected(frames[i - 1], f)) {
    const dt = f.timestampMs - frames[i - 1].timestampMs, d = distance(center(f)!, center(frames[i - 1])!);
    pathLength += d; covered += dt; speeds.push(d * 1000 / dt);
  } });
  const a = center(usable[0])!, b = center(usable[usable.length - 1])!, dx = b.x - a.x, dy = b.y - a.y;
  const coverage = Math.min(1, covered / (end - start));
  return { dx, dy, displacement: Math.hypot(dx, dy), pathLength, velocity: covered ? pathLength * 1000 / covered : 0,
    directionRad: dx || dy ? Math.atan2(dy, dx) : null,
    displacementVariance: variance(usable.map(f => center(f)!.x)) + variance(usable.map(f => center(f)!.y)),
    velocityVariance: variance(speeds), coverage, confidence: mean(usable.map(f => f.object.confidence)) * coverage * cameraFactor(frames) };
}
export function identifyHands(frames: CloseFrame[]) {
  let nextId = 0;
  frames.forEach((f, i) => {
    const prev = i && f.timestampMs - frames[i - 1].timestampMs <= CLOSE_CONFIG.maxGapMs ? frames[i - 1].hands : [];
    const choices = f.hands.map(h => h.joints.wrist ? prev.filter(p => p.joints.wrist && distance(h.joints.wrist!, p.joints.wrist) < .12) : []);
    f.hands.forEach((h, j) => {
      delete h.id;
      const matches = choices[j];
      if (matches.length === 1 && choices.filter(c => c.includes(matches[0])).length === 1 && matches[0].id !== undefined) h.id = matches[0].id;
      else if (!matches.length && h.joints.wrist && !f.hands.some((other, k) => k !== j && other.joints.wrist && distance(h.joints.wrist!, other.joints.wrist) < .12)) h.id = nextId++;
    });
  });
}
export function detectCloseUp(input: CloseExtraction, selection: CloseSelection, events: TimelineEvent[], preMs = 500, postMs = 2000, analyzedAt = new Date().toISOString()): CloseRun {
  if (!input || !finite(input.durationMs) || input.durationMs <= 0 || input.durationMs > CLOSE_CONFIG.maxDurationMs
    || !selection || !validRegion(selection.region) || !finite(selection.timestampMs) || selection.timestampMs < 0 || selection.timestampMs >= input.durationMs
    || ![preMs, postMs].every(n => finite(n) && n >= 100 && n <= 10000) || !Number.isFinite(Date.parse(analyzedAt))
    || !Array.isArray(input.warnings) || input.warnings.length > 20 || input.warnings.some(w => typeof w !== 'string' || w.length > 500)) return fail();
  const frames = cleanFrames(input.frames, input.durationMs); identifyHands(frames);
  if (frames.some(f => f.timestampMs < selection.timestampMs - 100)) return fail();
  const warnings = [...input.warnings];
  if (!frames.some(f => f.hands.some(h => Object.keys(h.joints).length))) warnings.push('No reliable hand detected.');
  if (frames.some(f => !center(f)) || !frames.length) warnings.push('Tracking lost or confidence collapsed; gaps are not interpolated. Blur, low light, occlusion or leaving the frame can cause loss.');
  if (cameraFactor(frames) < 1) warnings.push('Camera/global image motion is substantial or unavailable. Image motion cannot be attributed to the object; confidence reduced.');
  if (frames.length < 5) warnings.push('Short sampled interval; sustained behavior may be unavailable.');
  const candidates: CloseRun['candidates'] = [];
  const confidence = cameraFactor(frames) < 1 || (motion(frames, selection.timestampMs, input.durationMs)?.confidence ?? 0) < .7 ? 'LOW' as const : 'MEDIUM' as const;
  // Sustained efficient displacement, with continuity; never infer intent or object semantics.
  let lastTransition = -Infinity;
  frames.forEach((f, i) => {
    const window = frames.slice(i).filter(s => s.timestampMs <= f.timestampMs + CLOSE_CONFIG.transitionHoldMs);
    if (window.length < 2 || window[window.length - 1].timestampMs - f.timestampMs < CLOSE_CONFIG.transitionHoldMs || !window.every((s, j) => !j || connected(window[j - 1], s))) return;
    const m = motion(window, f.timestampMs, window[window.length - 1].timestampMs);
    const activeSteps = window.slice(1).filter((s, j) => distance(center(s)!, center(window[j])!) > .005).length;
    if (m && activeSteps >= (window.length - 1) * .75 && m.displacement >= CLOSE_CONFIG.transitionDistance && m.displacement / m.pathLength > .8 && f.timestampMs - lastTransition > 800) {
      candidates.push({ timestampMs: f.timestampMs, kind: 'OBJECT_TRANSITION', confidence }); lastTransition = f.timestampMs;
    }
  });
  const near = new Map<number, { start: number; last: number; fired: boolean; approached: boolean; inside: boolean }>();
  frames.forEach(f => {
    for (const h of f.hands) {
      if (h.id === undefined || f.object.status !== 'TRACKED') continue;
      const r = f.object.region, points = Object.values(h.joints);
      const d = Math.min(...points.map(p => Math.hypot(Math.max(r.x - p!.x, 0, p!.x - r.x - r.width), Math.max(r.y - p!.y, 0, p!.y - r.y - r.height))));
      const old = near.get(h.id), contiguous = old && f.timestampMs - old.last <= CLOSE_CONFIG.maxGapMs;
      if (d > CLOSE_CONFIG.proximity) { near.set(h.id, { start: f.timestampMs, last: f.timestampMs, fired: false, approached: true, inside: false }); continue; }
      const state = contiguous ? old : { start: f.timestampMs, last: f.timestampMs, fired: false, approached: false, inside: true };
      if (state.approached && !state.inside) state.start = f.timestampMs;
      if (state.approached && !state.fired && f.timestampMs - state.start >= CLOSE_CONFIG.proximityHoldMs) {
        candidates.push({ timestampMs: state.start, kind: 'HAND_OBJECT_PROXIMITY', confidence }); state.fired = true;
      }
      state.inside = true; state.last = f.timestampMs; near.set(h.id, state);
    }
  });
  const eventMetrics = sortEvents(events, input.durationMs).slice(0, 160).map(e => {
    const preStartMs = Math.max(0, e.timestampMs - preMs), postEndMs = Math.min(input.durationMs, e.timestampMs + postMs);
    const before = frames.filter(f => f.timestampMs >= preStartMs && f.timestampMs < e.timestampMs);
    const after = frames.filter(f => f.timestampMs >= e.timestampMs && f.timestampMs <= postEndMs);
    const pre = motion(before, preStartMs, e.timestampMs);
    const reliable = before.filter(f => center(f));
    const reference = reliable.length && pre && pre.coverage >= .7 && e.timestampMs - reliable[reliable.length - 1].timestampMs <= CLOSE_CONFIG.maxGapMs
      ? { x: mean(reliable.map(f => center(f)!.x)), y: mean(reliable.map(f => center(f)!.y)) } : null;
    const result: EventMotion = { eventId: e.id, timestampMs: e.timestampMs, preStartMs, postEndMs, pre, post: null, settleTimeMs: null, residualOffset: null, confidence: 0 };
    if (!reference || !after.length || !center(after[0]) || after[0].timestampMs - e.timestampMs > CLOSE_CONFIG.maxGapMs) return result;
    const valid: CloseFrame[] = [];
    for (const f of after) { if (!center(f) || valid.length && !connected(valid[valid.length - 1], f)) break; valid.push(f); }
    if (valid.length < 2) return result;
    const offsets = valid.map(f => ({ x: center(f)!.x - reference.x, y: center(f)!.y - reference.y }));
    const distances = offsets.map(p => Math.hypot(p.x, p.y)), maximum = Math.max(...distances), peak = distances.indexOf(maximum);
    const postConfidence = motion(after, e.timestampMs, postEndMs)?.confidence ?? 0;
    result.post = { initialVector: offsets[0], maxDisplacement: maximum, timeToMaximumMs: valid[peak].timestampMs - e.timestampMs,
      returnPath: offsets.slice(peak).filter((_, i) => i % Math.max(1, Math.ceil((offsets.length - peak) / 40)) === 0), residual: offsets[offsets.length - 1], confidence: postConfidence };
    result.confidence = Math.min(pre!.confidence, postConfidence); result.residualOffset = result.post.residual;
    // A departure must be observed, followed by a sustained quiet return. A new resting location is not a return.
    if (maximum > CLOSE_CONFIG.settleRadius && cameraFactor(before) === 1 && cameraFactor(after) === 1
      && pre!.displacementVariance <= CLOSE_CONFIG.settleRadius ** 2 && pre!.velocity < .04) {
      for (let i = peak + 1; i < valid.length; i++) {
        const held = valid.slice(i).filter(f => f.timestampMs <= valid[i].timestampMs + CLOSE_CONFIG.settleHoldMs);
        if (held.length < 2 || held[held.length - 1].timestampMs - held[0].timestampMs < CLOSE_CONFIG.settleHoldMs) continue;
        if (held.every(f => distance(center(f)!, reference) <= CLOSE_CONFIG.settleRadius)
          && (motion(held, held[0].timestampMs, held[held.length - 1].timestampMs)?.velocity ?? 1) < .04) {
          result.settleTimeMs = valid[i].timestampMs - e.timestampMs; break;
        }
      }
    }
    return result;
  });
  const stride = Math.max(1, Math.ceil(frames.length / CLOSE_CONFIG.maxPreview));
  return { analysisVersion: 1, detectorVersion: CLOSE_VERSION, configVersion: 1, analyzedAt,
    selection: { timestampMs: selection.timestampMs, region: { x: selection.region.x, y: selection.region.y, width: selection.region.width, height: selection.region.height } }, preMs, postMs,
    durationMs: input.durationMs, sampleCount: frames.length, path: frames.map(f => ({ ...f, hands: [] })),
    preview: frames.filter((_, i) => i % stride === 0), metrics: motion(frames, selection.timestampMs, input.durationMs),
    events: eventMetrics, candidates: candidates.slice(0, 160), warnings: [...new Set(warnings)].slice(0, 20) };
}

export function mergeCloseDetections(existing: TimelineEvent[], run: CloseRun, duration: number | null) {
  const retained = existing.filter(e => e.source !== 'VISION_DETECTED' || isTrustedEvent(e));
  const suggestions: TimelineEvent[] = [];
  run.candidates.forEach((c, i) => {
    if (duration !== null && c.timestampMs > duration || retained.some(e => isTrustedEvent(e) && e.type === 'CUSTOM' && e.metadata?.note === c.kind && Math.abs(e.timestampMs - c.timestampMs) <= 100)) return;
    let id = `close:${run.analyzedAt}:${i}`; while (retained.some(e => e.id === id)) id += ':new';
    suggestions.push({ id, type: 'CUSTOM', timestampMs: c.timestampMs, source: 'VISION_DETECTED', confidence: c.confidence, confirmed: false, metadata: { note: c.kind } });
  });
  return sortEvents([...retained, ...suggestions], duration);
}

/** Recompute metrics from bounded validated paths; never trust cached numeric diagnostics. */
export function validateCloseRun(run?: CloseRun): CloseRun | undefined {
  if (run === undefined) return undefined;
  if (!run || run.analysisVersion !== 1 || run.detectorVersion !== CLOSE_VERSION || run.configVersion !== 1
    || !Array.isArray(run.preview) || run.preview.length > CLOSE_CONFIG.maxPreview || !Array.isArray(run.events) || run.events.length > 160
    || !Number.isInteger(run.sampleCount) || run.sampleCount !== run.path?.length || !Array.isArray(run.candidates) || run.candidates.length > 160) return fail();
  const path = cleanFrames(run.path, run.durationMs), preview = cleanFrames(run.preview, run.durationMs);
  if (preview.some(f => !path.some(p => p.timestampMs === f.timestampMs && p.width === f.width && p.height === f.height
    && JSON.stringify(p.object) === JSON.stringify(f.object)))) return fail();
  const eventIds = new Set<string>();
  const events: TimelineEvent[] = run.events.map(e => {
    if (!e || typeof e.eventId !== 'string' || e.eventId.length > 200 || eventIds.has(e.eventId)) return fail();
    eventIds.add(e.eventId);
    return { id: e.eventId, timestampMs: e.timestampMs, type: 'CUSTOM', source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true };
  });
  const clean = detectCloseUp({ frames: path, durationMs: run.durationMs, warnings: run.warnings }, run.selection, events, run.preMs, run.postMs, run.analyzedAt);
  const candidates = run.candidates.map(c => {
    if (!c || !finite(c.timestampMs) || c.timestampMs < run.selection.timestampMs || c.timestampMs > run.durationMs
      || !['OBJECT_TRANSITION', 'HAND_OBJECT_PROXIMITY'].includes(c.kind) || !['LOW', 'MEDIUM'].includes(c.confidence)) return fail();
    return { timestampMs: c.timestampMs, kind: c.kind, confidence: c.confidence };
  });
  return { ...clean, preview, candidates, warnings: run.warnings.slice() };
}
