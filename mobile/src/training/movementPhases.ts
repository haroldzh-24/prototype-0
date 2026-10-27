/**
 * Draw and reload broken into movements (roadmap T3), from body tracking on a drill run's video.
 *
 * The beep and the shots come from the run (its saved times, placed from the beep the sound found). Between them the
 * tracked wrists, shoulders and hips say when each movement happened. Everything is measured relative to your own
 * body (distances in torso lengths, hips to shoulders), so the camera's distance doesn't matter; the camera's angle
 * does (see `problems`). FIRST VERSION: the thresholds below are reasoned, not yet tuned on real range video. Every
 * mark says whether it was clearly seen, and the screen plays the video at each one so you can check it.
 */
import { finite } from './poseModel';
import type { PoseBody, PosePoint, PoseSample } from './poseModel';

export const PHASES_VERSION = 1;
export type Side = 'right' | 'left';
export type PhaseKind = 'draw' | 'reload';
export type PhaseMark = { key: string; label: string; ms: number | null; sure: boolean };
export type PhaseInterval = { label: string; from: string; to: string; seconds: number | null };
export type Breakdown = { kind: PhaseKind; marks: PhaseMark[]; intervals: PhaseInterval[]; problems: string[]; fps: number | null };

/** Torso lengths per second / torso lengths. Reasoned starting values; to be tuned on real video. */
export const PHASE_CONFIG = Object.freeze({
  moveSpeed: 0.8, stopSpeed: 0.6, holsterReach: 0.5, clearRise: 0.25, meetDistance: 0.3, apartDistance: 0.4,
  pouchReach: 0.6, extendedShare: 0.7, chestRise: 0.45, minTorso: 0.02, maxGapMs: 120, minFps: 30, baselineMs: 300,
});
const C = PHASE_CONFIG;

type V = { x: number; y: number };
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: V, b: V): V => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** One frame in body units: origin between the hips, one unit = hips to shoulders, y down. */
type Frame = { ms: number; strong: V | null; support: V | null; strongHip: V; supportHip: V; shoulders: V };
function bodyFrame(ms: number, body: PoseBody | null, side: Side): Frame | null {
  const j = body?.joints;
  if (!j) return null;
  const [lh, rh, ls, rs] = [j.leftHip, j.rightHip, j.leftShoulder, j.rightShoulder];
  if (!lh || !rh || !ls || !rs) return null;
  const hips = mid(lh, rh), shoulders = mid(ls, rs), unit = dist(hips, shoulders);
  if (!(unit >= C.minTorso)) return null;
  const rel = (p: PosePoint | undefined): V | null => p ? { x: (p.x - hips.x) / unit, y: (p.y - hips.y) / unit } : null;
  const [sw, pw, sh, ph] = side === 'right' ? [j.rightWrist, j.leftWrist, rh, lh] : [j.leftWrist, j.rightWrist, lh, rh];
  return { ms, strong: rel(sw), support: rel(pw), strongHip: rel(sh)!, supportHip: rel(ph)!, shoulders: { x: (shoulders.x - hips.x) / unit, y: (shoulders.y - hips.y) / unit } };
}
/** Speed of a wrist (body units per second) at each frame, from its neighbours; null across gaps or missing points. */
function speeds(frames: Frame[], pick: (f: Frame) => V | null): (number | null)[] {
  return frames.map((f, i) => {
    const a = frames[i - 1], b = frames[i + 1];
    const pa = a && f.ms - a.ms <= C.maxGapMs ? pick(a) : null, pb = b && b.ms - f.ms <= C.maxGapMs ? pick(b) : null, p = pick(f);
    if (!p) return null;
    if (pa && pb) return dist(pa, pb) / ((b.ms - a.ms) / 1000);
    if (pa) return dist(pa, p) / ((f.ms - a.ms) / 1000);
    if (pb) return dist(p, pb) / ((b.ms - f.ms) / 1000);
    return null;
  });
}
function frameRate(frames: Frame[]): number | null {
  const steps = frames.slice(1).map((f, i) => f.ms - frames[i].ms).filter(d => d > 0).sort((a, b) => a - b);
  return steps.length ? 1000 / steps[Math.floor(steps.length / 2)] : null;
}
const intervalsOf = (marks: PhaseMark[], labels: string[]): PhaseInterval[] => labels.map((label, i) => {
  const a = marks[i], b = marks[i + 1];
  return { label, from: a.key, to: b.key, seconds: a.ms !== null && b.ms !== null && b.ms >= a.ms ? Math.round(b.ms - a.ms) / 1000 : null };
});
/** First index from `start` where `test` holds for this and the next frame. */
function firstHeld(frames: Frame[], start: number, end: number, test: (i: number) => boolean): number {
  for (let i = Math.max(0, start); i <= end; i++) if (test(i) && (i + 1 > end || test(i + 1))) return i;
  return -1;
}

function prepare(samples: readonly PoseSample[], fromMs: number, toMs: number, side: Side) {
  const problems: string[] = [];
  const frames = samples.filter(s => s.timestampMs >= fromMs && s.timestampMs <= toMs).map(s => bodyFrame(s.timestampMs, s.body, side)).filter((f): f is Frame => !!f);
  const inWindow = samples.filter(s => s.timestampMs >= fromMs && s.timestampMs <= toMs).length;
  if (inWindow && frames.length < inWindow * 0.8) problems.push('Your hips and shoulders weren’t seen in every frame: film your whole body, from the side if you can.');
  const missingWrists = frames.filter(f => !f.strong || !f.support).length;
  if (frames.length && missingWrists > frames.length * 0.25) problems.push('Your hands were hidden in many frames (filmed from the front or behind?): a side view shows the draw best.');
  if (samples.some(s => s.ambiguous)) problems.push('More than one person was in the video; only you should be in frame.');
  const fps = frameRate(frames);
  if (fps !== null && fps < C.minFps) problems.push(`Only ${Math.round(fps)} frames a second were tracked: start the recording just before the beep so the run is near the start of the video.`);
  return { frames, fps, problems };
}

/**
 * Hands-at-sides draw, beep to first shot: reaction (first move), the grip (the hand stops at the holster), out of the
 * holster (the hand has risen a quarter torso above the grip), hands together at the chest, on target (the hands stop,
 * arms out), then the shot.
 */
export function breakDownDraw(samples: readonly PoseSample[], beepMs: number, shotMs: number, side: Side): Breakdown {
  const labels = ['Beep', 'First move', 'Grip', 'Out of the holster', 'Hands together', 'On target', 'Shot'];
  const keys = ['beep', 'move', 'grip', 'clear', 'meet', 'onTarget', 'shot'];
  const marks: PhaseMark[] = keys.map((key, i) => ({ key, label: labels[i], ms: key === 'beep' ? beepMs : key === 'shot' ? shotMs : null, sure: key === 'beep' || key === 'shot' }));
  const done = (problems: string[], fps: number | null): Breakdown => ({ kind: 'draw', marks, problems, fps,
    intervals: intervalsOf(marks, ['Reaction', 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot']) });
  if (!finite(beepMs) || !finite(shotMs) || shotMs <= beepMs) return done(['The run needs its beep and first shot in the video.'], null);
  const { frames, fps, problems } = prepare(samples, beepMs - C.baselineMs, shotMs + 100, side);
  const last = frames.findIndex(f => f.ms > shotMs) - 1, end = last < 0 ? frames.length - 1 : last;
  const after = frames.findIndex(f => f.ms >= beepMs);
  if (after < 0 || end - after < 4) return done([...problems, 'Too few tracked frames between the beep and the shot.'], fps);
  const strong = speeds(frames, f => f.strong), support = speeds(frames, f => f.support);
  const set = (key: string, i: number, sure: boolean) => { const m = marks.find(x => x.key === key)!; m.ms = frames[i].ms; m.sure = sure; };
  // First move: either hand faster than a deliberate start, two frames running.
  const move = firstHeld(frames, after, end, i => (strong[i] ?? 0) > C.moveSpeed || (support[i] ?? 0) > C.moveSpeed);
  if (move < 0) return done([...problems, 'No movement found after the beep.'], fps);
  set('move', move, true);
  // The grip: the strong hand's slowest moment near the holster after it starts, before it rises.
  let grip = -1;
  for (let i = move + 1; i < end; i++) {
    const f = frames[i], v = strong[i];
    if (!f.strong || v === null) continue;
    const near = dist(f.strong, f.strongHip) <= C.holsterReach;
    if (near && v < C.stopSpeed && (strong[i - 1] ?? Infinity) >= v && (strong[i + 1] ?? Infinity) >= v) { grip = i; break; }
    if (f.strong.y < f.strongHip.y - C.clearRise * 2) break;
  }
  let gripSure = grip >= 0;
  if (grip < 0) {
    // No clear stop: the slowest strong-hand moment near the holster before it rises.
    let best = Infinity;
    for (let i = move + 1; i < end; i++) {
      const f = frames[i], v = strong[i];
      if (!f.strong || v === null) continue;
      if (f.strong.y < f.strongHip.y - C.clearRise * 2) break;
      if (dist(f.strong, f.strongHip) <= C.holsterReach && v < best) { best = v; grip = i; }
    }
  }
  if (grip < 0) return done([...problems, 'The hand at the holster wasn’t seen.'], fps);
  set('grip', grip, gripSure);
  const gripY = frames[grip].strong!.y;
  const clear = firstHeld(frames, grip + 1, end, i => !!frames[i].strong && gripY - frames[i].strong!.y >= C.clearRise);
  if (clear < 0) return done([...problems, 'The gun coming out of the holster wasn’t seen.'], fps);
  set('clear', clear, true);
  // Hands together at the chest: close to each other and both well above the hips (on the way up they can pass close
  // in a side view without meeting).
  const chest = (p: V | null, hip: V) => !!p && hip.y - p.y >= C.chestRise;
  const meet = firstHeld(frames, clear, end, i => chest(frames[i].strong, frames[i].strongHip) && chest(frames[i].support, frames[i].supportHip)
    && dist(frames[i].strong!, frames[i].support!) <= C.meetDistance);
  if (meet < 0) return done([...problems, 'Your hands coming together wasn’t seen (the support hand may be hidden).'], fps);
  set('meet', meet, true);
  const reach = (i: number) => frames[i].strong ? dist(frames[i].strong!, frames[i].shoulders) : 0;
  let maxReach = 0;
  for (let i = meet; i <= end; i++) maxReach = Math.max(maxReach, reach(i));
  const onTarget = firstHeld(frames, meet + 1, end, i => strong[i] !== null && strong[i]! < C.stopSpeed && reach(i) >= C.extendedShare * maxReach);
  if (onTarget < 0) return done([...problems, 'The gun settling on target before the shot wasn’t seen.'], fps);
  set('onTarget', onTarget, true);
  return done(problems, fps);
}

/** Standing reload, shot to shot: hand off the gun, at the magazine pouch, back at the gun, on target, shot. */
export function breakDownReload(samples: readonly PoseSample[], shotMs: number, nextShotMs: number, side: Side): Breakdown {
  const labels = ['Shot', 'Hand off the gun', 'At the pouch', 'Magazine in', 'On target', 'Next shot'];
  const keys = ['shot', 'leave', 'pouch', 'magIn', 'onTarget', 'nextShot'];
  const marks: PhaseMark[] = keys.map((key, i) => ({ key, label: labels[i], ms: key === 'shot' ? shotMs : key === 'nextShot' ? nextShotMs : null, sure: key === 'shot' || key === 'nextShot' }));
  const done = (problems: string[], fps: number | null): Breakdown => ({ kind: 'reload', marks, problems, fps,
    intervals: intervalsOf(marks, ['Hand off the gun', 'To the pouch', 'Back to the gun', 'Press out', 'Sight to shot']) });
  if (!finite(shotMs) || !finite(nextShotMs) || nextShotMs <= shotMs) return done(['The run needs both shots of the reload in the video.'], null);
  const { frames, fps, problems } = prepare(samples, shotMs - 100, nextShotMs + 100, side);
  const last = frames.findIndex(f => f.ms > nextShotMs) - 1, end = last < 0 ? frames.length - 1 : last;
  const after = frames.findIndex(f => f.ms >= shotMs);
  if (after < 0 || end - after < 4) return done([...problems, 'Too few tracked frames between the two shots.'], fps);
  const strong = speeds(frames, f => f.strong), support = speeds(frames, f => f.support);
  const set = (key: string, i: number, sure: boolean) => { const m = marks.find(x => x.key === key)!; m.ms = frames[i].ms; m.sure = sure; };
  const apart = (i: number) => frames[i].strong && frames[i].support ? dist(frames[i].strong!, frames[i].support!) : null;
  const leave = firstHeld(frames, after, end, i => (apart(i) ?? 0) > C.apartDistance);
  if (leave < 0) return done([...problems, 'The support hand leaving the gun wasn’t seen.'], fps);
  set('leave', leave, true);
  // At the pouch: the support hand's slowest moment near its hip.
  let pouch = -1, best = Infinity;
  for (let i = leave; i <= end; i++) {
    const f = frames[i], v = support[i];
    if (!f.support || v === null) continue;
    if ((apart(i) ?? Infinity) <= C.meetDistance) break;
    if (dist(f.support, f.supportHip) <= C.pouchReach && v < best) { best = v; pouch = i; }
  }
  if (pouch < 0) return done([...problems, 'The hand at the magazine pouch wasn’t seen.'], fps);
  set('pouch', pouch, best < C.stopSpeed);
  const magIn = firstHeld(frames, pouch + 1, end, i => (apart(i) ?? Infinity) <= C.meetDistance);
  if (magIn < 0) return done([...problems, 'The support hand back at the gun wasn’t seen.'], fps);
  set('magIn', magIn, true);
  const reach = (i: number) => frames[i].strong ? dist(frames[i].strong!, frames[i].shoulders) : 0;
  let maxReach = 0;
  for (let i = magIn; i <= end; i++) maxReach = Math.max(maxReach, reach(i));
  const onTarget = firstHeld(frames, magIn + 1, end, i => strong[i] !== null && strong[i]! < C.stopSpeed && reach(i) >= C.extendedShare * maxReach);
  if (onTarget < 0) return done([...problems, 'The gun settling on target before the shot wasn’t seen.'], fps);
  set('onTarget', onTarget, true);
  return done(problems, fps);
}

/** Frames a second to ask for: as many as the 600-frame cap allows up to the end of the run, at most 60. */
export function phaseFps(endMs: number): number { return Math.max(1, Math.min(60, Math.floor(600 * 1000 / Math.max(1, endMs)))); }

/** A kept breakdown on the run: the marks only (the intervals are recomputed). */
export type SavedPhases = { kind: PhaseKind; version: number; side: Side; marks: { key: string; ms: number | null; sure: boolean }[] };
export const savedPhases = (b: Breakdown, side: Side): SavedPhases => ({ kind: b.kind, version: PHASES_VERSION, side, marks: b.marks.map(m => ({ key: m.key, ms: m.ms, sure: m.sure })) });
const DRAW_KEYS = ['beep', 'move', 'grip', 'clear', 'meet', 'onTarget', 'shot'], RELOAD_KEYS = ['shot', 'leave', 'pouch', 'magIn', 'onTarget', 'nextShot'];
export function savedPhasesProblem(p: unknown): string | null {
  const x = p as SavedPhases;
  if (!x || typeof x !== 'object' || !['draw', 'reload'].includes(x.kind) || x.version !== PHASES_VERSION || !['right', 'left'].includes(x.side) || !Array.isArray(x.marks)) return 'Invalid movement breakdown.';
  const keys = x.kind === 'draw' ? DRAW_KEYS : RELOAD_KEYS;
  if (x.marks.length !== keys.length || x.marks.some((m, i) => !m || m.key !== keys[i] || typeof m.sure !== 'boolean' || !(m.ms === null || finite(m.ms) && m.ms >= 0 && m.ms <= 3_600_000))) return 'Invalid movement breakdown.';
  return null;
}
/** Interval seconds of a kept breakdown, by label. */
export function phaseSeconds(p: SavedPhases): { label: string; seconds: number | null }[] {
  const labels = p.kind === 'draw' ? ['Reaction', 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot']
    : ['Hand off the gun', 'To the pouch', 'Back to the gun', 'Press out', 'Sight to shot'];
  return labels.map((label, i) => { const a = p.marks[i].ms, b = p.marks[i + 1].ms; return { label, seconds: a !== null && b !== null && b >= a ? Math.round(b - a) / 1000 : null }; });
}
