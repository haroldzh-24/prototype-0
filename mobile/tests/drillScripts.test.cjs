// Video breakdowns for every drill from hand tracking (src/training/drillScripts.ts), on synthetic 60 fps tracks with
// known moments. Real range video will retune the thresholds; these pin the logic and the windows.
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file);
const ds = require('../src/training/drillScripts.ts'), { libraryDrill, libraryDrills } = require('../src/training/drillLibrary.ts');
const { validateHandTrack, trackingExport } = require('../src/training/handTracking.ts');
const { savedPhasesProblem } = require('../src/training/movementPhases.ts');

const W = 1000, H = 800, FPS = 60, L = 40; // hand length 40 px
// Piecewise-linear paths: [ms, x, y] keyframes, in pixels.
const path = keys => ms => { if (ms <= keys[0][0]) return keys[0].slice(1); for (let i = 1; i < keys.length; i++) if (ms <= keys[i][0]) { const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i], u = (ms - t0) / (t1 - t0); return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u]; } return keys[keys.length - 1].slice(1); };
function track(fromMs, toMs, strongPath, supportPath, bodyPath) {
  const frames = [];
  for (let ms = fromMs; ms <= toMs; ms += 1000 / FPS) {
    const hand = (p, chirality) => { const [x, y] = p(ms); return { chirality, confidence: 0.9, joints: { wrist: { x: x / W, y: y / H, confidence: 0.9 }, middleMCP: { x: x / W, y: (y - L) / H, confidence: 0.9 } } }; };
    const f = { timestampMs: ms, hands: [hand(strongPath, 'right'), ...(supportPath ? [hand(supportPath, 'left')] : [])] };
    if (bodyPath) { const [x, y] = bodyPath(ms); f.person = { x: (x - 100) / W, y: (y - 300) / H, width: 200 / W, height: 600 / H, confidence: 0.9 }; }
    frames.push(f);
  }
  return validateHandTrack({ frames, width: W, height: H, fps: FPS, fromMs, toMs, warnings: [], nativeRevision: 3 });
}
const near = (ms, want, frames = 2) => assert.ok(ms !== null && Math.abs(ms - want) <= frames * 1000 / FPS + 1, `${ms} vs ${want}`);
const mark = (seg, key) => seg.marks.find(m => m.key === key).ms;

// Draw: beep at 1000. Rest until 1200 (reaction), to the gun by 1450, still to 1530 (grip), out and up by 1700,
// hands meet at chest at 1850, pressed out and still from 2050, shot at 2250.
const BEEP = 1000;
const drawStrong = [[0, 600, 600], [1200, 600, 600], [1450, 640, 680], [1530, 641, 681], [1700, 640, 560], [1850, 560, 430], [2050, 560, 280], [2400, 560, 280]];
const drawSupport = [[0, 400, 600], [1200, 400, 600], [1850, 545, 440], [2050, 545, 290], [2400, 545, 290]];

test('every drill has a script and a camera position; splits need no piece', () => {
  for (const d of libraryDrills) { assert.ok(ds.CAMERA[d.id], d.id); assert.ok(ds.scriptFor(d).length >= 1, d.id); }
  assert.deepEqual(ds.scriptFor(libraryDrill('bill')).map(s => s.kind), ['draw']);
  assert.deepEqual(ds.scriptFor(libraryDrill('blake')).map(s => s.kind + s.shot), ['draw0', 'transition2', 'transition4']);
  assert.deepEqual(ds.scriptFor(libraryDrill('sprint')).map(s => s.kind + s.shot), ['draw0', 'move2']);
  assert.deepEqual(ds.scriptFor(libraryDrill('elPresidente')).map(s => s.kind), ['draw', 'transition', 'transition', 'reload', 'transition', 'transition']);
  assert.deepEqual(ds.scriptFor(libraryDrill('draw'), { start: 'lowReady' }).map(s => s.kind), ['presentation']);
});

test('draw from hand tracking alone: each moment within a few frames (60 fps), no shoulders or hips needed', () => {
  const t = track(700, 2400, path(drawStrong), path(drawSupport));
  const b = ds.breakDownRun(t, libraryDrill('draw'), { shotTimes: [1.25], choices: {} }, BEEP, 'right');
  const draw = b.segments[0];
  assert.deepEqual(draw.problems, []);
  near(mark(draw, 'move'), 1200, 3); near(mark(draw, 'grip'), 1450, 4); near(mark(draw, 'clear'), 1600, 4);
  near(mark(draw, 'meet'), 1800, 4); near(mark(draw, 'onTarget'), 2050, 4);
  assert.ok(Math.abs(b.handLength - L) < 1);
  // Kept in the older form too, so YOUR NUMBERS keeps averaging draws.
  assert.equal(savedPhasesProblem(ds.phasesFromRun(b, 'right', 'draw')), null);
  assert.equal(ds.savedRunBreakdownProblem(ds.savedRunBreakdown(b, 'right')), null);
});

test('chirality missing: the hand nearest where the shooting hand was stays the shooting hand', () => {
  const t = track(700, 2400, path(drawStrong), path(drawSupport));
  for (const f of t.frames) for (const h of f.hands) h.chirality = 'unknown';
  const draw = ds.breakDownRun(t, libraryDrill('draw'), { shotTimes: [1.25], choices: {} }, BEEP, 'right').segments[0];
  assert.ok(draw.marks.every(m => m.ms !== null), JSON.stringify(draw.problems));
});

test('reload between two shots: hand off, pouch, magazine in, on target', () => {
  // Shot at 1000; support hand leaves at 1150, at the pouch 1350–1420, back at the gun 1600, on target 1750, shot 1950.
  const strong = path([[0, 560, 280], [1100, 560, 280], [1300, 560, 380], [1600, 560, 380], [1750, 560, 280], [2100, 560, 280]]);
  const support = path([[0, 545, 290], [1060, 545, 290], [1350, 420, 640], [1420, 418, 642], [1600, 548, 392], [1750, 548, 292], [2100, 548, 292]]);
  const t = track(900, 2100, strong, support);
  // Shot times are from the beep: with the beep at 500, the shots are at 1000 and 1950.
  const b2 = ds.breakDownRun(t, libraryDrill('reload'), { shotTimes: [0.5, 1.45], choices: { mode: 'standing' } }, 500, 'right');
  const reload = b2.segments.find(s => s.kind === 'reload');
  assert.ok(reload, JSON.stringify(b2.segments.map(s => s.kind)));
  assert.ok(mark(reload, 'leave') > 1060 && mark(reload, 'leave') < 1250, String(mark(reload, 'leave')));
  near(mark(reload, 'pouch'), 1385, 6); near(mark(reload, 'magIn'), 1590, 5); near(mark(reload, 'onTarget'), 1750, 5);
});

test('transition: swing and settle between two shots; a tight array with no swing says so', () => {
  const strong = path([[0, 560, 280], [1100, 560, 280], [1250, 720, 285], [1300, 722, 285], [1600, 722, 285]]);
  const t = track(900, 1600, strong, null);
  const seg = ds.transitionPiece(ds.wrists(t, 'right'), L, FPS, 1000, 1450);
  near(mark(seg, 'swing'), 1100, 3); near(mark(seg, 'settle'), 1250, 3);
  const still = track(900, 1600, path([[0, 560, 280], [2000, 562, 281]]), null);
  const none = ds.transitionPiece(ds.wrists(still, 'right'), L, FPS, 1000, 1450);
  assert.equal(mark(none, 'swing'), null); assert.match(none.problems[0], /No swing/);
});

test('move: first step and stop from the body box, in body heights', () => {
  const body = path([[0, 200, 400], [1150, 200, 400], [1200, 205, 400], [2200, 800, 400], [2300, 802, 400], [3000, 802, 400]]);
  const t = track(900, 3000, path([[0, 300, 300], [3000, 300, 300]]), null, body);
  const seg = ds.movePiece(ds.wrists(t, 'right'), FPS, 1000, 2600);
  near(mark(seg, 'go'), 1200, 5); near(mark(seg, 'stop'), 2250, 6);
});

test('tracking is validated and exports as one file with the run', () => {
  assert.throws(() => validateHandTrack({ frames: [], width: 0 }), /usable/);
  const t = track(0, 100, path([[0, 1, 1]]), null);
  const json = JSON.parse(trackingExport(t, { drillId: 'draw', beepMs: 0, shotTimes: [1], side: 'right' }));
  assert.equal(json.kind, 'psp-hand-tracking'); assert.equal(json.track.frames.length, t.frames.length);
  assert.equal(ds.savedRunBreakdownProblem({ version: 1, side: 'right', segments: [{ kind: 'draw', shot: 0, marks: [] }] }), 'Invalid video breakdown.');
});
