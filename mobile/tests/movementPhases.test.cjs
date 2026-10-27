// Draw and reload broken into movements (roadmap T3, src/training/movementPhases.ts), on synthetic tracked motion.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const P = require('../src/training/movementPhases.ts');

// Body units: origin between the hips, hips to shoulders = 1, y down; a right-handed shooter filmed from the side,
// facing +x. Each path is keyframes [seconds from the beep, x, y], straight lines between.
const at = (path, t) => {
  if (t <= path[0][0]) return { x: path[0][1], y: path[0][2] };
  for (let i = 1; i < path.length; i++) if (t <= path[i][0]) { const [t0, x0, y0] = path[i - 1], [t1, x1, y1] = path[i], k = (t - t0) / (t1 - t0); return { x: x0 + k * (x1 - x0), y: y0 + k * (y1 - y0) }; }
  const l = path[path.length - 1]; return { x: l[1], y: l[2] };
};
const BEEP = 2000;
function samples({ strong, support, fps = 60, fromMs = 1500, toMs = 3500, hideSupport = () => false, side = 'right' }) {
  const out = [], img = p => ({ x: 0.5 + p.x * 0.25, y: 0.55 + p.y * 0.25, confidence: 0.9 });
  for (let ms = fromMs; ms <= toMs; ms += 1000 / fps) {
    const t = (ms - BEEP) / 1000, s = at(strong, t), p = at(support, t);
    const joints = { leftHip: img({ x: -0.05, y: 0 }), rightHip: img({ x: 0.05, y: 0 }), leftShoulder: img({ x: -0.05, y: -1 }), rightShoulder: img({ x: 0.05, y: -1 }) };
    joints[side === 'right' ? 'rightWrist' : 'leftWrist'] = img(s);
    if (!hideSupport(t)) joints[side === 'right' ? 'leftWrist' : 'rightWrist'] = img(p);
    out.push({ timestampMs: ms, width: 1080, height: 1920, mirrored: false, ambiguous: false, body: { confidence: 0.9, joints } });
  }
  return out;
}
const DRAW = {
  strong: [[0, 0.05, 0.25], [0.2, 0.05, 0.25], [0.32, 0, 0.05], [0.38, 0, 0.05], [0.55, 0.15, -0.65], [0.8, 0.85, -0.85], [1.2, 0.85, -0.85]],
  support: [[0, -0.05, 0.25], [0.22, -0.05, 0.25], [0.55, 0.17, -0.62], [0.8, 0.85, -0.83], [1.2, 0.85, -0.83]],
};
const SHOT = BEEP + 1050;
// When a condition first holds on the scripted paths (sampled finely), to compare with what the breakdown finds.
const firstTime = (from, test) => { for (let t = from; t < 1.2; t += 0.001) if (test(t)) return t; return null; };
const near = (actualMs, expectedS, frames = 2, fps = 60) => assert.ok(actualMs !== null && Math.abs(actualMs - (BEEP + expectedS * 1000)) <= frames * 1000 / fps + 1, `${actualMs} vs ${BEEP + expectedS * 1000}`);

test('a hands-at-sides draw filmed from the side: every movement found within two frames, each interval timed', () => {
  const b = P.breakDownDraw(samples(DRAW), BEEP, SHOT, 'right');
  assert.deepEqual(b.problems, []); assert.equal(Math.round(b.fps), 60);
  const m = Object.fromEntries(b.marks.map(x => [x.key, x]));
  near(m.move.ms, 0.2); near(m.grip.ms, 0.35); 
  near(m.clear.ms, firstTime(0.38, t => 0.05 - at(DRAW.strong, t).y >= 0.25));
  // On the way up the hands pass close in a side view; together means close and both at the chest.
  near(m.meet.ms, firstTime(0.38, t => { const a = at(DRAW.strong, t), c = at(DRAW.support, t); return a.y <= -0.45 && c.y <= -0.45 && Math.hypot(a.x - c.x, a.y - c.y) <= 0.3; }));
  near(m.onTarget.ms, 0.8, 3);
  assert.ok(b.marks.every(x => x.ms !== null && x.sure), JSON.stringify(b.marks));
  assert.deepEqual(b.intervals.map(i => i.label), ['Reaction', 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot']);
  const total = b.intervals.reduce((s, i) => s + i.seconds, 0);
  assert.ok(Math.abs(total - 1.05) < 0.003, 'the intervals add up to beep → shot');
  // A left-handed shooter, same motion mirrored to the left hand.
  const left = P.breakDownDraw(samples({ ...DRAW, side: 'left' }), BEEP, SHOT, 'left');
  assert.deepEqual(left.marks.map(x => x.ms), b.marks.map(x => x.ms));
  // Asking with the wrong hand doesn't invent a draw: the support hand never comes up from the hip alone.
  assert.ok(P.breakDownDraw(samples({ strong: DRAW.support.map(([t]) => [t, -0.05, 0.25]), support: DRAW.strong }), BEEP, SHOT, 'right').marks.some(x => x.ms === null));
});

test('what it can’t see, it says: too few frames a second, a hidden support hand, no beep', () => {
  const slow = P.breakDownDraw(samples({ ...DRAW, fps: 10 }), BEEP, SHOT, 'right');
  assert.ok(slow.problems.some(p => /^Only 10 frames a second were tracked/.test(p)));
  const hidden = P.breakDownDraw(samples({ ...DRAW, hideSupport: t => t > 0.25 }), BEEP, SHOT, 'right');
  assert.equal(hidden.marks.find(x => x.key === 'meet').ms, null);
  assert.ok(hidden.problems.some(p => /support hand may be hidden/.test(p)));
  assert.ok(hidden.intervals.slice(3).every(i => i.seconds === null), 'nothing after an unseen mark is timed');
  assert.deepEqual(P.breakDownDraw([], BEEP, BEEP - 1, 'right').problems, ['The run needs its beep and first shot in the video.']);
  assert.equal(P.phaseFps(3000), 60); assert.equal(P.phaseFps(20000), 30); assert.equal(P.phaseFps(60000), 10);
});

test('a standing reload: hand off the gun, at the pouch, magazine in, on target', () => {
  // Shot 1 at the beep mark; the support hand goes to its hip (the pouch), back to the gun, and the gun returns out.
  const R = {
    strong: [[0, 0.85, -0.85], [0.08, 0.85, -0.85], [0.3, 0.35, -0.6], [0.75, 0.35, -0.6], [1.0, 0.85, -0.85], [1.4, 0.85, -0.85]],
    support: [[0, 0.85, -0.83], [0.08, 0.85, -0.83], [0.4, -0.02, 0.05], [0.47, -0.02, 0.05], [0.72, 0.33, -0.58], [1.0, 0.85, -0.83], [1.4, 0.85, -0.83]],
  };
  const b = P.breakDownReload(samples({ ...R, toMs: 3600 }), BEEP, BEEP + 1250, 'right');
  assert.deepEqual(b.problems, []);
  const m = Object.fromEntries(b.marks.map(x => [x.key, x]));
  near(m.leave.ms, firstTime(0, t => { const a = at(R.strong, t), c = at(R.support, t); return Math.hypot(a.x - c.x, a.y - c.y) > 0.4; }));
  near(m.pouch.ms, 0.435, 3);
  near(m.magIn.ms, firstTime(0.5, t => { const a = at(R.strong, t), c = at(R.support, t); return Math.hypot(a.x - c.x, a.y - c.y) <= 0.3; }));
  near(m.onTarget.ms, 1.0, 3);
  assert.deepEqual(b.intervals.map(i => i.label), ['Hand off the gun', 'To the pouch', 'Back to the gun', 'Press out', 'Sight to shot']);
});

test('a kept breakdown is saved as its marks and checked on load', () => {
  const b = P.breakDownDraw(samples(DRAW), BEEP, SHOT, 'right'), saved = P.savedPhases(b, 'right');
  assert.equal(P.savedPhasesProblem(saved), null);
  assert.deepEqual(P.phaseSeconds(saved).map(x => x.label), b.intervals.map(i => i.label));
  assert.deepEqual(P.phaseSeconds(saved).map(x => x.seconds), b.intervals.map(i => i.seconds));
  assert.equal(P.savedPhasesProblem({ ...saved, marks: saved.marks.slice(1) }), 'Invalid movement breakdown.');
  assert.equal(P.savedPhasesProblem({ ...saved, version: 9 }), 'Invalid movement breakdown.');
});

test('review: the support hand moving first doesn’t make the resting shooting hand look like the grip', () => {
  for (const leadMs of [50, 67, 100]) {
    const lead = leadMs / 1000;
    const support = [[0, -0.05, 0.25], [0.2 - lead, -0.05, 0.25], [0.55, 0.17, -0.62], [0.8, 0.85, -0.83], [1.2, 0.85, -0.83]];
    const b = P.breakDownDraw(samples({ strong: DRAW.strong, support }), BEEP, SHOT, 'right');
    const m = Object.fromEntries(b.marks.map(x => [x.key, x]));
    near(m.move.ms, 0.2 - lead); near(m.grip.ms, 0.35);
    near(m.clear.ms, firstTime(0.38, t => 0.05 - at(DRAW.strong, t).y >= 0.25));
  }
});

test('review: a tracking gap before the run does not lose you; frames only after the shot are too few', () => {
  const { selectPoseSubject } = require('../src/training/poseDetection.ts');
  const frames = samples({ ...DRAW, fromMs: 0 }).map(s => ({ timestampMs: s.timestampMs, width: 1080, height: 1920, mirrored: false, crowded: false,
    people: s.timestampMs >= 600 && s.timestampMs <= 900 ? [] : [s.body] }));
  const extraction = { frames, durationMs: 3500, warnings: [], nativeRevision: 2 };
  const lost = P.breakDownDraw(selectPoseSubject(extraction).samples, BEEP, SHOT, 'right');
  assert.ok(lost.problems.includes('Too few tracked frames between the beep and the shot.'), 'without the window, continuity is lost for good');
  const found = P.breakDownDraw(selectPoseSubject(P.runWindow(extraction, BEEP)).samples, BEEP, SHOT, 'right');
  assert.deepEqual(found.problems, []); assert.ok(found.marks.every(m => m.ms !== null));
  const late = P.breakDownDraw(samples({ ...DRAW, fromMs: SHOT + 20 }), BEEP, SHOT, 'right');
  assert.ok(late.problems.includes('Too few tracked frames between the beep and the shot.'));
  // A mirrored video is flagged.
  const mirrored = samples(DRAW).map(x => ({ ...x, mirrored: true }));
  assert.ok(P.breakDownDraw(mirrored, BEEP, SHOT, 'right').problems.some(p => /^This video is mirrored/.test(p)));
});
