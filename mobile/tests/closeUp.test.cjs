const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const D = require('../src/training/closeUp.ts');
const A = require('../src/training/videoAnalysis.ts');
const V = require('../src/training/videoModel.ts');
const P = require('../src/training/poseModel.ts');
const now = '2026-09-22T12:00:00Z';
const selection = { timestampMs: 0, region: { x: .3, y: .4, width: .1, height: .1 } };
const hand = (x, confidence = .95) => ({ joints: { wrist: { x, y: .45, confidence }, indexTip: { x, y: .46, confidence } } });
function fixture(fn = () => .35, count = 35) {
  return { durationMs: count * 100, warnings: [], frames: Array.from({ length: count }, (_, i) => {
    const x = fn(i); return { timestampMs: i * 100, width: 640, height: 360, hands: [hand(.2)], globalMotion: { x: 0, y: 0 },
      object: x === null ? { status: 'LOST', confidence: 0 } : { status: 'TRACKED', confidence: .95, center: { x, y: .45 }, region: { x: x - .05, y: .4, width: .1, height: .1 } } };
  }) };
}
const event = (timestampMs = 500, extra = {}) => ({ id: 'event', type: 'CUSTOM', timestampMs, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, ...extra });
const detect = (input = fixture(), events = [event()]) => D.detectCloseUp(input, selection, events, 500, 2000, now);
const moving = () => fixture(i => .35 + Math.max(0, Math.min(6, i - 5)) * .04);
const returning = () => fixture(i => i < 6 ? .35 : i < 10 ? .35 + (i - 5) * .04 : i < 14 ? .51 - (i - 9) * .04 : .35);
function session() { return { id: 'close-video', trainingSessionId: 'close-training', drillId: null,
  asset: { uri: 'training-videos/close-video.mp4', name: 'close.mp4', storage: 'DOCUMENTS' }, durationMs: 3500, fps: null,
  createdAt: now, importedAt: now, context: 'LIVE_FIRE', analysisStatus: 'ANNOTATING', analysisVersion: 1 }; }

test('hand validation keeps missing and low confidence joints missing', () => {
  const f = fixture(); f.frames[0].hands = [hand(.2, .1)];
  assert.deepEqual(detect(f).preview[0].hands[0].joints, {});
  f.frames[1].hands[0].joints.wrist.x = NaN; assert.throws(() => detect(f), /Malformed/);
});
test('two-hand continuity follows wrists despite observation order changes', () => {
  const f = fixture(); f.frames.forEach((frame, i) => frame.hands = i % 2 ? [hand(.8), hand(.2)] : [hand(.2), hand(.8)]);
  const r = detect(f); assert.equal(r.preview[0].hands[0].id, r.preview[1].hands[1].id);
  assert.notEqual(r.preview[0].hands[0].id, r.preview[0].hands[1].id);
});
test('ambiguous crossing and gaps do not claim continuous hand identity', () => {
  const f = fixture(); f.frames[0].hands = [hand(.4), hand(.6)]; f.frames[1].hands = [hand(.5), hand(.51)];
  const r = detect(f); assert.ok(r.preview[1].hands.every(h => h.id === undefined));
  f.frames[1].hands = []; assert.notEqual(detect(f).preview[0].hands[0].id, detect(f).preview[2].hands[0].id);
});
test('stationary path has zero displacement velocity and variance', () => {
  const m = detect().metrics; assert.equal(m.pathLength, 0); assert.equal(m.velocity, 0); assert.equal(m.directionRad, null);
  assert.ok(m.displacementVariance < 1e-20); assert.ok(m.coverage > .9);
});
test('object path derives normalized displacement and direction', () => {
  const m = detect(moving()).metrics; assert.ok(Math.abs(m.dx - .24) < 1e-8); assert.equal(m.dy, 0);
  assert.ok(Math.abs(m.pathLength - .24) < 1e-8); assert.equal(m.directionRad, 0); assert.ok(m.velocity > 0);
});
test('tracking loss breaks path and lowers coverage without bridging jumps', () => {
  const f = fixture(i => i < 10 ? .35 : i === 10 ? null : .7), r = detect(f);
  assert.equal(r.metrics.pathLength, 0); assert.ok(r.metrics.coverage < detect().metrics.coverage);
  assert.ok(r.warnings.some(w => /Tracking lost/.test(w))); assert.equal(r.events[0].settleTimeMs, null);
});
test('confidence collapse is explicit lost tracking', () => {
  const f = fixture(); f.frames[5].object.confidence = .1;
  assert.equal(detect(f).path[5].object.status, 'LOST');
});
test('pre-event stability uses only samples before event', () => {
  const r = detect(moving()); assert.equal(r.events[0].pre.pathLength, 0); assert.ok(r.events[0].pre.confidence > .7);
});
test('post-event displacement exposes peak return path residual and initial vector', () => {
  const p = detect(returning()).events[0].post; assert.ok(p.maxDisplacement > .15);
  assert.equal(p.timeToMaximumMs, 400); assert.ok(p.returnPath.length > 1); assert.ok(Math.abs(p.residual.x) < 1e-8);
});
test('quiet return after departure yields settle time', () => {
  const e = detect(returning()).events[0]; assert.equal(e.settleTimeMs, 800); assert.ok(e.confidence > .7);
});
test('transition to another resting location never forces settle', () => {
  const r = detect(moving()); assert.equal(r.events[0].settleTimeMs, null);
  assert.ok(r.candidates.some(c => c.kind === 'OBJECT_TRANSITION'));
});
test('brief jump and missing baseline do not imply sustained transition or settle', () => {
  const r = detect(fixture(i => i === 8 ? .6 : .35), [event(0)]);
  assert.equal(r.events[0].post, null); assert.equal(r.events[0].settleTimeMs, null);
  assert.ok(!r.candidates.some(c => c.kind === 'OBJECT_TRANSITION'));
});
test('hand approaching and remaining near region yields generic proximity', () => {
  const f = fixture(); f.frames.forEach((frame, i) => frame.hands = [hand(i < 3 ? .2 : .29)]);
  const r = detect(f); assert.equal(r.candidates.filter(c => c.kind === 'HAND_OBJECT_PROXIMITY').length, 1);
});
test('always-near hand or brief touch does not imply approach/contact', () => {
  for (const fn of [() => .29, i => i === 3 ? .29 : .2]) {
    const f = fixture(); f.frames.forEach((frame, i) => frame.hands = [hand(fn(i))]);
    assert.ok(!detect(f).candidates.some(c => c.kind === 'HAND_OBJECT_PROXIMITY'));
  }
});
test('camera motion reduces confidence and suppresses settle', () => {
  const f = returning(); f.frames.forEach(frame => frame.globalMotion = { x: .03, y: 0 });
  const r = detect(f); assert.ok(r.metrics.confidence < .3); assert.equal(r.events[0].settleTimeMs, null);
  assert.ok(r.warnings.some(w => /Camera/.test(w))); assert.ok(r.candidates.every(c => c.confidence === 'LOW'));
});
test('unknown global motion never gives high confidence', () => {
  const f = moving(); f.frames.forEach(frame => frame.globalMotion = null);
  assert.ok(detect(f).metrics.confidence < .5);
});
test('rerun preserves manual and confirmed audio pose and vision markers', () => {
  const events = ['MANUAL', 'AUDIO_DETECTED', 'POSE_DETECTED', 'VISION_DETECTED'].map((source, i) => event(200 + i * 100, { id: String(i), source }));
  const provisional = event(200, { id: 'old', source: 'VISION_DETECTED', confirmed: false, confidence: 'MEDIUM' });
  const result = D.mergeCloseDetections([...events, provisional], detect(moving()), 3500);
  events.forEach(e => assert.deepEqual(result.find(r => r.id === e.id), e)); assert.ok(!result.some(e => e.id === 'old'));
  assert.ok(result.filter(e => !events.includes(e)).every(e => !e.confirmed && e.source === 'VISION_DETECTED'));
});
test('unconfirmed and confirmed generic suggestions never create performance scoring', () => {
  const r = detect(moving()), events = D.mergeCloseDetections([], r, 3500), s = session();
  assert.ok(events.length); assert.ok(events.every(e => !e.confirmed));
  for (const es of [events, events.reduce((all, e) => V.confirmEvent(all, e.id), events)]) {
    const video = { session: s, analysis: A.analyzeVideo(s, es, undefined, undefined, r) };
    assert.equal(A.videoObservations(video, 'competitionHolster').length, 0);
  }
});
test('bounded persistence strips unknown payloads and rebuilds tampered metrics', () => {
  const r = detect(fixture(() => .35, 600)); assert.equal(r.path.length, 600); assert.equal(r.preview.length, 120);
  const clean = D.validateCloseRun({ ...r, frames: ['pixels'], metrics: { pathLength: 999 }, selection: { ...r.selection, pixels: [] } });
  assert.equal(clean.frames, undefined); assert.equal(clean.selection.pixels, undefined); assert.equal(clean.metrics.pathLength, 0);
  assert.ok(JSON.stringify(clean).length < 350000);
});
test('malformed extraction versions regions times and oversized arrays reject', () => {
  for (const change of [f => f.durationMs = Infinity, f => f.frames = Array(601).fill(f.frames[0]),
    f => f.frames[1].timestampMs = 0, f => f.frames[0].object.region.width = -1,
    f => f.frames[0].object.center.x = .9, f => f.frames[0].hands = [hand(.1), hand(.2), hand(.3)]]) {
    const f = fixture(); change(f); assert.throws(() => detect(f), /Malformed/);
  }
  const r = detect(); assert.throws(() => D.validateCloseRun({ ...r, configVersion: 2 }), /Malformed/);
  assert.throws(() => D.validateCloseRun({ ...r, preview: Array(121).fill(r.preview[0]) }), /Malformed/);
});
test('short clip and no hands are clean outcomes', () => {
  const f = fixture(() => null, 2); f.frames.forEach(f => f.hands = []);
  const r = detect(f, []); assert.equal(r.metrics, null); assert.ok(r.warnings.some(w => /Short/.test(w)));
  assert.ok(r.warnings.some(w => /No reliable hand/.test(w)));
});
test('orientation normalization uses displayed rotated and mirrored image space', () => {
  assert.deepEqual(P.normalizeVideoPoint(.25, .75, 640, 360, { a: 0, b: 1, c: -1, d: 0, tx: 360, ty: 0 }), { x: .25, y: .25 });
  assert.deepEqual(P.normalizeVideoPoint(.25, .75, 640, 360, { a: -1, b: 0, c: 0, d: 1, tx: 640, ty: 0 }), { x: .75, y: .75 });
});
test('event edits recompute windows and deletions remove stale metrics', () => {
  const s = session(), r = detect(returning());
  assert.equal(A.analyzeVideo(s, [event(800)], undefined, undefined, r).closeRun.events[0].timestampMs, 800);
  assert.equal(A.analyzeVideo(s, [], undefined, undefined, r).closeRun.events.length, 0);
});
test('close-up diagnostics and unconfirmed suggestions survive SQLite normalization', async () => {
  const { DatabaseSync } = require('node:sqlite'), { Repository } = require('../src/storage/repository.ts');
  const { randomUUID } = require('node:crypto'); const db = new DatabaseSync(':memory:');
  const repo = new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID);
  try {
    await repo.initialize(); const r = detect(moving()), s = session(), events = D.mergeCloseDetections([event()], r, 3500);
    const video = { session: s, analysis: A.analyzeVideo(s, events, undefined, undefined, r) };
    await repo.saveTraining({ id: s.trainingSessionId, userId: 'local', drillId: null, drillName: 'close-up', occurredAt: now,
      startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [video] });
    const loaded = (await repo.listTraining('local'))[0].videos[0]; assert.deepEqual(loaded.analysis.closeRun, video.analysis.closeRun);
    assert.ok(loaded.analysis.events.filter(e => e.source === 'VISION_DETECTED').every(e => !e.confirmed));
  } finally { db.close(); }
});
function adapter(native) {
  const Module = require('node:module'), original = Module._load, file = require.resolve('../src/training/extractCloseUp.ts'); delete require.cache[file];
  Module._load = function(request, ...args) {
    if (request === 'expo-modules-core') return { requireOptionalNativeModule: () => native };
    if (request === './videoAssets') return { playbackUri: () => 'file:///local/video.mp4' };
    return original.call(this, request, ...args);
  };
  try { return require(file).extractCloseUp; } finally { Module._load = original; }
}
test('unsupported native extraction and cancelled results fail recoverably', async () => {
  await assert.rejects(adapter(null)(session(), selection, 'missing', new AbortController().signal, () => {}), /rebuilt iOS/);
  let resolve, cancelled = false, released = false;
  const native = { prepare() {}, release() { released = true; }, cancel() { cancelled = true; }, progress() { return 0; }, extract() { return new Promise(done => resolve = done); } };
  const controller = new AbortController(), pending = adapter(native)(session(), selection, 'cancel', controller.signal, () => {});
  controller.abort(); resolve(fixture()); await assert.rejects(pending, /cancelled/); assert.ok(cancelled);
  assert.ok(released);
});
