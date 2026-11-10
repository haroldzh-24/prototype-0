/**
 * Video breakdowns for every drill, from hand tracking (handTracking.ts) and the run's shot times (from the sound).
 *
 * Each drill gets a script built from its structure (`intervals` in drillLibrary.ts): the buzzer to the first shot is
 * a Draw (from the holster) or a Presentation (from ready), a 'transition' is a swing between targets, a 'reload' a
 * reload, a 'move' a run between spots; splits need no video. Five pieces cover the 13 drills: Draw, Reload,
 * Transition, Move, and the Turn inside El Presidente's draw. Every moment is searched for only in its own window
 * (between the shots around it), so a stray movement elsewhere can't be picked.
 *
 * Distances are in hand lengths (wrist to the middle knuckle), so a close camera works and the shoulders and hips
 * don't need to be in the picture. Movement drills use the box around the person in body heights.
 * FIRST VERSION: thresholds are reasoned from typical draw and reload speeds, not yet tuned on real range video.
 * EXPORT TRACKING saves a run's tracking so they can be tuned (tests then pin the marks against hand-checked frames).
 */
import type { HandFrame, HandPoint, HandTrack } from './handTracking';
import type { LibraryDrill, LibraryRun } from './drillLibrary';
import type { PhaseInterval, PhaseMark, SavedPhases, Side } from './movementPhases';
import { PHASES_VERSION } from './movementPhases';

export const SCRIPT_VERSION = 1;
/** Hand lengths per second, hand lengths, body heights per second, milliseconds. Reasoned; to be tuned. */
export const SCRIPT_CONFIG = Object.freeze({
  moveSpeed: 4, stopSpeed: 2.5, swingSpeed: 3, clearReach: 1.2, gripReach: 1, meetDistance: 1.4, apartDistance: 2.2, pressOut: 1.5,
  settleMs: 60, recoilMs: 100, bodyGo: 0.5, bodyStill: 0.25, maxGapMs: 120, minFps: 25,
});
const C = SCRIPT_CONFIG;

export type PieceKind = 'draw' | 'presentation' | 'reload' | 'transition' | 'move';
export type Segment = { kind: PieceKind; /** Index of the shot the piece ends at (0 = first shot). */ shot: number; title: string };
export type SegmentBreakdown = Segment & { marks: PhaseMark[]; intervals: PhaseInterval[]; problems: string[] };
export type RunBreakdown = { segments: SegmentBreakdown[]; problems: string[]; fps: number; handLength: number | null };

/** Where to put the phone for each drill, shown on its HOW TO tab and before a breakdown. */
export const CAMERA: Readonly<Record<string, string>> = Object.freeze({
  draw: 'Strong side, about 45° in front of you, 3 m away, waist up in the picture.',
  bill: 'Strong side, about 45° in front of you, 3 m away, waist up in the picture.',
  partial: 'Strong side, about 45° in front of you, 3 m away, waist up in the picture.',
  ladder: 'Anywhere the beep and shots are loud and clear. Film from the strong side to break down the draw too.',
  blake: 'Behind you on your strong side, both arms in the picture.',
  wide: 'Behind you on your strong side, both arms in the picture.',
  steel: 'Behind you on your strong side, both arms in the picture.',
  port: 'Behind you on your strong side, both arms in the picture.',
  reload: 'Support side, about 45° in front of you, so your support hand and magazine pouch are in the picture.',
  sprint: 'From the side, far enough back that the whole run is in the picture.',
  shuffle: 'From the side, far enough back that the whole step is in the picture.',
  onTheMove: 'From the side, far enough back that your whole walk is in the picture.',
  elPresidente: 'Strong side, about 45° in front of you, wide enough to see the turn.',
});
export const RECORDING_TIP = 'Record at 60 frames a second (Settings → Camera → Record Video), or in slow motion for draws, in good light.';

/** The drill's script: which piece explains each shot. Splits need no video and get no piece. */
export function scriptFor(drill: LibraryDrill, choices: Record<string, string> = {}): Segment[] {
  const out: Segment[] = [];
  drill.intervals.forEach((kind, i) => {
    if (i === 0) {
      const fromHolster = drill.id !== 'draw' || !choices.start || choices.start === 'competitionHolster' || choices.start === 'surrender';
      out.push({ kind: fromHolster ? 'draw' : 'presentation', shot: 0, title: drill.id === 'elPresidente' ? 'Turn and draw' : fromHolster ? 'Draw' : 'From ready' });
    } else if (kind === 'transition') out.push({ kind: 'transition', shot: i, title: `Transition to shot ${i + 1}` });
    else if (kind === 'reload') out.push({ kind: 'reload', shot: i, title: 'Reload' });
    else if (kind === 'move') out.push({ kind: 'move', shot: i, title: 'Move' });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Hands frame by frame

type V = { x: number; y: number };
type Frame = { ms: number; strong: V | null; support: V | null; body: { x: number; y: number; h: number } | null };
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y);
const toPx = (p: HandPoint | undefined, w: number, h: number): V | null => p ? { x: p.x * w, y: p.y * h } : null;

/** Hand length in pixels: the median wrist-to-middle-knuckle distance over the run. */
export function handLength(track: HandTrack): number | null {
  const ds: number[] = [];
  for (const f of track.frames) for (const hand of f.hands) {
    const w = toPx(hand.joints.wrist, track.width, track.height), m = toPx(hand.joints.middleMCP ?? hand.joints.indexMCP, track.width, track.height);
    if (w && m) ds.push(dist(w, m));
  }
  if (ds.length < 5) return null;
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)];
}
/**
 * The strong and support wrist in each frame. Vision says which hand is which (chirality); when it can't, or says
 * the same for both, the hand nearest to where the strong hand just was is the strong hand.
 */
export function wrists(track: HandTrack, side: Side): Frame[] {
  const out: Frame[] = [];
  let lastStrong: V | null = null, lastSupport: V | null = null;
  for (const f of track.frames) {
    const hands = f.hands.map(h => ({ c: h.chirality, p: toPx(h.joints.wrist, track.width, track.height) })).filter((h): h is { c: 'left' | 'right' | 'unknown'; p: V } => !!h.p);
    let strong: V | null = null, support: V | null = null;
    const named = hands.filter(h => h.c === side), other = hands.filter(h => h.c !== side && h.c !== 'unknown');
    if (named.length === 1 && other.length <= 1) { strong = named[0].p; support = other[0]?.p ?? hands.find(h => h !== named[0])?.p ?? null; }
    else if (hands.length === 2) {
      const [a, b] = hands;
      const keep: boolean = !lastStrong || dist(a.p, lastStrong) + (lastSupport ? dist(b.p, lastSupport) : 0) <= dist(b.p, lastStrong) + (lastSupport ? dist(a.p, lastSupport) : 0);
      [strong, support] = keep ? [a.p, b.p] : [b.p, a.p];
    } else if (hands.length === 1) {
      const p = hands[0].p;
      if (!lastSupport || !lastStrong || dist(p, lastStrong) <= dist(p, lastSupport)) strong = p; else support = p;
    }
    if (strong) lastStrong = strong;
    if (support) lastSupport = support;
    const b = f.person;
    out.push({ ms: f.timestampMs, strong, support, body: b ? { x: (b.x + b.width / 2) * track.width, y: (b.y + b.height / 2) * track.height, h: b.height * track.height } : null });
  }
  return out;
}
/** Speed of a point (units per second), from its neighbours; null across gaps longer than maxGapMs. */
function speedsOf(frames: Frame[], pick: (f: Frame) => V | null, unit: number): (number | null)[] {
  return frames.map((f, i) => {
    const p = pick(f);
    if (!p) return null;
    const a = frames[i - 1], b = frames[i + 1];
    const pa = a && f.ms - a.ms <= C.maxGapMs ? pick(a) : null, pb = b && b.ms - f.ms <= C.maxGapMs ? pick(b) : null;
    if (pa && pb) return dist(pa, pb) / unit / ((b.ms - a.ms) / 1000);
    if (pa) return dist(pa, p) / unit / ((f.ms - a.ms) / 1000);
    if (pb) return dist(pb, p) / unit / ((b.ms - f.ms) / 1000);
    return null;
  });
}
/** First index from `from` to `to` where `test` holds for this frame and the next (`hold` frames in all). */
function held(frames: Frame[], from: number, to: number, test: (i: number) => boolean, hold = 2): number {
  for (let i = Math.max(0, from); i <= Math.min(to, frames.length - hold); i++) {
    let ok = true;
    for (let k = 0; k < hold && ok; k++) ok = test(i + k);
    if (ok) return i;
  }
  return -1;
}
const indexAt = (frames: Frame[], ms: number) => { const i = frames.findIndex(f => f.ms >= ms); return i < 0 ? frames.length - 1 : i; };
const holdFrames = (fps: number) => Math.max(2, Math.round(C.settleMs * fps / 1000));
function intervalsOf(marks: PhaseMark[], labels: string[]): PhaseInterval[] {
  return labels.map((label, i) => {
    const a = marks[i], b = marks[i + 1];
    return { label, from: a.key, to: b.key, seconds: a.ms !== null && b.ms !== null && b.ms >= a.ms ? Math.round(b.ms - a.ms) / 1000 : null };
  });
}
function piece(kind: PieceKind, keys: string[], labels: string[], fixed: Record<string, number>): { marks: PhaseMark[]; set: (key: string, ms: number | null, sure: boolean) => void } {
  const marks = keys.map((key, i) => ({ key, label: labels[i], ms: key in fixed ? fixed[key] : null, sure: key in fixed }));
  return { marks, set: (key, ms, sure) => { const m = marks.find(x => x.key === key)!; m.ms = ms; m.sure = sure; } };
}

// ---------------------------------------------------------------------------------------------------------------
// The five pieces

/** Draw from the holster: first move, grip, out of the holster, hands together, on target, shot. */
export function drawPiece(frames: Frame[], L: number, fps: number, beepMs: number, shotMs: number, turn = false): { marks: PhaseMark[]; intervals: PhaseInterval[]; problems: string[] } {
  const { marks, set } = piece('draw', ['beep', 'move', 'grip', 'clear', 'meet', 'onTarget', 'shot'],
    ['Beep', turn ? 'Turn starts' : 'First move', 'Grip', 'Out of the holster', 'Hands together', 'On target', 'Shot'], { beep: beepMs, shot: shotMs });
  const labels = [turn ? 'Reaction' : 'Reaction', turn ? 'Turn and reach' : 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot'];
  const problems: string[] = [];
  const done = () => ({ marks, intervals: intervalsOf(marks, labels), problems });
  const strong = speedsOf(frames, f => f.strong, L), support = speedsOf(frames, f => f.support, L);
  const after = indexAt(frames, beepMs), end = indexAt(frames, shotMs) - 1;
  if (end - after < 4) { problems.push('Too few tracked frames between the beep and the shot.'); return done(); }
  const move = held(frames, after, end, i => (strong[i] ?? 0) > C.moveSpeed || (support[i] ?? 0) > C.moveSpeed);
  if (move < 0) { problems.push('No hand movement found after the beep.'); return done(); }
  set('move', frames[move].ms, true);
  const strongMove = held(frames, move, end, i => (strong[i] ?? 0) > C.moveSpeed);
  if (strongMove < 0) { problems.push('Your shooting hand wasn’t seen moving.'); return done(); }
  const rest = frames.slice(Math.max(0, after - 10), after + 1).map(f => f.strong).filter((p): p is V => !!p);
  const start = rest.length ? rest[rest.length - 1] : frames[strongMove].strong!;
  // Grip: the shooting hand's first real pause once it has travelled (it stops on the gun before drawing it).
  let grip = -1;
  for (let i = strongMove + 1; i < end; i++) {
    const v = strong[i], p = frames[i].strong;
    if (v === null || !p) continue;
    if (dist(p, start) >= C.gripReach * 0.5 * L && v < C.stopSpeed && (strong[i - 1] ?? Infinity) >= v && (strong[i + 1] ?? Infinity) >= v) { grip = i; break; }
  }
  let gripSure = grip >= 0;
  if (grip < 0) {
    // No clear stop: the slowest moment in the first 0.7 s of the hand's movement.
    let best = Infinity;
    for (let i = strongMove + 1; i < end && frames[i].ms - frames[strongMove].ms < 700; i++) if (strong[i] !== null && strong[i]! < best) { best = strong[i]!; grip = i; }
    gripSure = false;
  }
  if (grip < 0) { problems.push('The hand on the gun wasn’t seen.'); return done(); }
  set('grip', frames[grip].ms, gripSure);
  const gripAt = frames[grip].strong!;
  const clear = held(frames, grip + 1, end, i => !!frames[i].strong && dist(frames[i].strong!, gripAt) >= C.clearReach * L);
  if (clear < 0) { problems.push('The gun coming out of the holster wasn’t seen.'); return done(); }
  set('clear', frames[clear].ms, true);
  const together = (i: number) => !!frames[i].strong && !!frames[i].support && dist(frames[i].strong!, frames[i].support!) <= C.meetDistance * L;
  const meet = held(frames, clear, end, together);
  if (meet < 0) problems.push('Your hands coming together wasn’t seen (the support hand may be hidden).');
  else set('meet', frames[meet].ms, true);
  const from = meet >= 0 ? meet : clear, hold = holdFrames(fps);
  const onTarget = held(frames, from + 1, end, i => strong[i] !== null && strong[i]! < C.stopSpeed && !!frames[i].strong && dist(frames[i].strong!, gripAt) >= C.pressOut * L, hold);
  if (onTarget < 0) problems.push('The gun settling on target before the shot wasn’t seen.');
  else set('onTarget', frames[onTarget].ms, meet >= 0);
  return done();
}
/** From low or high ready: first move, on target, shot. */
export function presentationPiece(frames: Frame[], L: number, fps: number, beepMs: number, shotMs: number) {
  const { marks, set } = piece('presentation', ['beep', 'move', 'onTarget', 'shot'], ['Beep', 'First move', 'On target', 'Shot'], { beep: beepMs, shot: shotMs });
  const problems: string[] = [];
  const strong = speedsOf(frames, f => f.strong, L), after = indexAt(frames, beepMs), end = indexAt(frames, shotMs) - 1;
  const move = held(frames, after, end, i => (strong[i] ?? 0) > C.moveSpeed);
  if (move < 0) problems.push('No hand movement found after the beep.');
  else {
    set('move', frames[move].ms, true);
    const settle = held(frames, move + 1, end, i => strong[i] !== null && strong[i]! < C.stopSpeed, holdFrames(fps));
    if (settle < 0) problems.push('The gun settling on target before the shot wasn’t seen.'); else set('onTarget', frames[settle].ms, true);
  }
  return { marks, intervals: intervalsOf(marks, ['Reaction', 'Presentation', 'Sight to shot']), problems };
}
/** Reload between two shots: hand off the gun, at the pouch, magazine in, on target, next shot. */
export function reloadPiece(frames: Frame[], L: number, fps: number, shotMs: number, nextMs: number) {
  const { marks, set } = piece('reload', ['shot', 'leave', 'pouch', 'magIn', 'onTarget', 'nextShot'], ['Shot', 'Hand off the gun', 'At the pouch', 'Magazine in', 'On target', 'Next shot'], { shot: shotMs, nextShot: nextMs });
  const problems: string[] = [];
  const done = () => ({ marks, intervals: intervalsOf(marks, ['Hand off the gun', 'To the pouch', 'Back to the gun', 'Press out', 'Sight to shot']), problems });
  const strong = speedsOf(frames, f => f.strong, L), support = speedsOf(frames, f => f.support, L);
  const after = indexAt(frames, shotMs + 40), end = indexAt(frames, nextMs) - 1;
  if (end - after < 4) { problems.push('Too few tracked frames between the two shots.'); return done(); }
  const apart = (i: number) => frames[i].strong && frames[i].support ? dist(frames[i].strong!, frames[i].support!) / L : null;
  const leave = held(frames, after, end, i => (apart(i) ?? 0) > C.apartDistance);
  if (leave < 0) { problems.push('The support hand leaving the gun wasn’t seen.'); return done(); }
  set('leave', frames[leave].ms, true);
  const back = held(frames, leave + 1, end, i => apart(i) !== null && apart(i)! <= C.meetDistance);
  // At the pouch: the support hand's slowest moment while it is far from the gun (within 80 % of its farthest).
  let far = 0;
  for (let i = leave; i < (back < 0 ? end : back); i++) far = Math.max(far, apart(i) ?? 0);
  let pouch = -1, slowest = Infinity;
  for (let i = leave; i < (back < 0 ? end : back); i++) if ((apart(i) ?? 0) >= far * 0.8 && support[i] !== null && support[i]! < slowest) { slowest = support[i]!; pouch = i; }
  if (pouch < 0) problems.push('The hand at the magazine pouch wasn’t seen.'); else set('pouch', frames[pouch].ms, slowest < C.stopSpeed);
  if (back < 0) { problems.push('The support hand back at the gun wasn’t seen.'); return done(); }
  set('magIn', frames[back].ms, true);
  const onTarget = held(frames, back + 1, end, i => strong[i] !== null && strong[i]! < C.stopSpeed, holdFrames(fps));
  if (onTarget < 0) problems.push('The gun settling on target before the shot wasn’t seen.'); else set('onTarget', frames[onTarget].ms, true);
  return done();
}
/** Transition between two shots: the hold after the shot, the swing, and settling on the next target. */
export function transitionPiece(frames: Frame[], L: number, fps: number, shotMs: number, nextMs: number) {
  const { marks, set } = piece('transition', ['shot', 'swing', 'settle', 'nextShot'], ['Shot', 'Swing starts', 'Settled', 'Next shot'], { shot: shotMs, nextShot: nextMs });
  const problems: string[] = [];
  const strong = speedsOf(frames, f => f.strong, L), after = indexAt(frames, shotMs + C.recoilMs), end = indexAt(frames, nextMs) - 1;
  if (end - after < 2) problems.push('Too few tracked frames between the two shots (film at 60 frames a second).');
  else {
    const swing = held(frames, after, end, i => (strong[i] ?? 0) > C.swingSpeed);
    if (swing < 0) problems.push('No swing was seen: the targets may be too close together to tell, or your hands are out of the picture.');
    else {
      set('swing', frames[swing].ms, true);
      // Settled: the start of the last still stretch before the shot.
      let settle = -1;
      for (let i = end; i > swing; i--) { if (strong[i] !== null && strong[i]! < C.stopSpeed) settle = i; else if (settle >= 0) break; }
      if (settle < 0) problems.push('The gun settling on the next target wasn’t seen.'); else set('settle', frames[settle].ms, end - settle + 1 >= 2);
    }
  }
  return { marks, intervals: intervalsOf(marks, ['Hold after the shot', 'Swing', 'Settle to the shot']), problems };
}
/** Move between two shooting spots: last shot to the first step, the move, stopped to the next shot (body box). */
export function movePiece(frames: Frame[], fps: number, shotMs: number, nextMs: number) {
  const { marks, set } = piece('move', ['shot', 'go', 'stop', 'nextShot'], ['Shot', 'First step', 'Stopped', 'Next shot'], { shot: shotMs, nextShot: nextMs });
  const problems: string[] = [];
  const heights = frames.map(f => f.body?.h).filter((h): h is number => !!h).sort((a, b) => a - b);
  const H = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  if (!H) problems.push('You weren’t seen in the picture (film from the side, far enough back to see the whole move).');
  else {
    const body = speedsOf(frames, f => f.body ? { x: f.body.x, y: f.body.y } : null, H);
    const after = indexAt(frames, shotMs + 40), end = indexAt(frames, nextMs) - 1, hold = Math.max(3, holdFrames(fps));
    const go = held(frames, after, end, i => (body[i] ?? 0) > C.bodyGo, hold);
    if (go < 0) problems.push('The start of the move wasn’t seen.');
    else {
      set('go', frames[go].ms, true);
      let stop = -1;
      for (let i = end; i > go; i--) { if (body[i] !== null && body[i]! < C.bodyStill) stop = i; else if (stop >= 0) break; }
      if (stop < 0) problems.push('Stopping before the next shot wasn’t seen (shooting on the move?).'); else set('stop', frames[stop].ms, true);
    }
  }
  return { marks, intervals: intervalsOf(marks, ['Shot to first step', 'Move', 'Stop to the shot']), problems };
}

/**
 * The whole run broken down by its drill's script. `beepMs` is where the beep is in the video; `shotTimes` are
 * seconds from the beep, as the timer lists them.
 */
export function breakDownRun(track: HandTrack, drill: LibraryDrill, run: Pick<LibraryRun, 'shotTimes' | 'choices'>, beepMs: number, side: Side): RunBreakdown {
  const problems: string[] = [...track.warnings];
  const L = handLength(track), frames = wrists(track, side), fps = track.fps;
  if (fps < C.minFps) problems.push(`The video has about ${Math.round(fps)} frames a second; marks are only as fine as the frames (record at 60).`);
  const shots = run.shotTimes.map(t => beepMs + t * 1000);
  const segments: SegmentBreakdown[] = [];
  for (const s of scriptFor(drill, run.choices)) {
    const to = shots[s.shot], from = s.shot === 0 ? beepMs : shots[s.shot - 1];
    if (to === undefined || from === undefined) { segments.push({ ...s, marks: [], intervals: [], problems: ['This shot isn’t in the run’s times.'] }); continue; }
    if (s.kind === 'move') { segments.push({ ...s, ...movePiece(frames, fps, from, to) }); continue; }
    if (!L) { segments.push({ ...s, marks: [], intervals: [], problems: ['Your hands weren’t seen clearly enough to measure.'] }); continue; }
    const result = s.kind === 'draw' ? drawPiece(frames, L, fps, from, to, drill.id === 'elPresidente')
      : s.kind === 'presentation' ? presentationPiece(frames, L, fps, from, to)
      : s.kind === 'reload' ? reloadPiece(frames, L, fps, from, to) : transitionPiece(frames, L, fps, from, to);
    segments.push({ ...s, ...result });
  }
  return { segments, problems, fps, handLength: L };
}

// ---------------------------------------------------------------------------------------------------------------
// Keeping it on the run

export type SavedRunBreakdown = { version: number; side: Side; segments: { kind: PieceKind; shot: number; marks: { key: string; ms: number | null; sure: boolean }[] }[] };
const KEYS: Record<PieceKind, string[]> = {
  draw: ['beep', 'move', 'grip', 'clear', 'meet', 'onTarget', 'shot'], presentation: ['beep', 'move', 'onTarget', 'shot'],
  reload: ['shot', 'leave', 'pouch', 'magIn', 'onTarget', 'nextShot'], transition: ['shot', 'swing', 'settle', 'nextShot'], move: ['shot', 'go', 'stop', 'nextShot'],
};
export const savedRunBreakdown = (b: RunBreakdown, side: Side): SavedRunBreakdown => ({ version: SCRIPT_VERSION, side,
  segments: b.segments.filter(s => s.marks.length).map(s => ({ kind: s.kind, shot: s.shot, marks: s.marks.map(m => ({ key: m.key, ms: m.ms, sure: m.sure })) })) });
export function savedRunBreakdownProblem(x: unknown): string | null {
  const b = x as SavedRunBreakdown;
  if (!b || typeof b !== 'object' || b.version !== SCRIPT_VERSION || !['left', 'right'].includes(b.side) || !Array.isArray(b.segments) || b.segments.length > 40) return 'Invalid video breakdown.';
  for (const s of b.segments) {
    const keys = s && KEYS[s.kind];
    if (!keys || !Number.isInteger(s.shot) || s.shot < 0 || s.shot > 60 || !Array.isArray(s.marks) || s.marks.length !== keys.length
      || s.marks.some((m, i) => !m || m.key !== keys[i] || typeof m.sure !== 'boolean' || !(m.ms === null || Number.isFinite(m.ms) && m.ms >= 0 && m.ms <= 3_600_000))) return 'Invalid video breakdown.';
  }
  return null;
}
/** The draw or reload of a hand breakdown in the older saved form, so YOUR NUMBERS keeps averaging it. */
export function phasesFromRun(b: RunBreakdown, side: Side, kind: 'draw' | 'reload' | null): SavedPhases | undefined {
  const s = kind && b.segments.find(x => x.kind === kind);
  return s && s.marks.length && s.marks.every(m => m.ms !== null) ? { kind: kind!, version: PHASES_VERSION, side, marks: s.marks.map(m => ({ key: m.key, ms: m.ms, sure: m.sure })) } : undefined;
}

const LABELS: Record<PieceKind, string[]> = {
  draw: ['Reaction', 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot'], presentation: ['Reaction', 'Presentation', 'Sight to shot'],
  reload: ['Hand off the gun', 'To the pouch', 'Back to the gun', 'Press out', 'Sight to shot'], transition: ['Hold after the shot', 'Swing', 'Settle to the shot'],
  move: ['Shot to first step', 'Move', 'Stop to the shot'],
};
const TITLES: Record<PieceKind, string> = { draw: 'Draw', presentation: 'From ready', reload: 'Reload', transition: 'Transition', move: 'Move' };
/** A kept breakdown's seconds, segment by segment. */
export function savedRunSeconds(b: SavedRunBreakdown): { title: string; rows: { label: string; seconds: number | null }[] }[] {
  return b.segments.map(s => ({
    title: s.kind === 'transition' ? `Transition to shot ${s.shot + 1}` : TITLES[s.kind],
    rows: LABELS[s.kind].map((label, i) => { const a = s.marks[i]?.ms, z = s.marks[i + 1]?.ms; return { label, seconds: a != null && z != null && z >= a ? Math.round(z - a) / 1000 : null }; }),
  }));
}
