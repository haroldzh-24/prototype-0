const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const M = require('../src/training/poseModel.ts');
const D = require('../src/training/poseDetection.ts');
const V = require('../src/training/videoModel.ts');
const A = require('../src/training/videoAnalysis.ts');
const { Repository } = require('../src/storage/repository.ts');
const now = '2026-09-22T12:00:00.000Z';
function body(x = 0, wrist = 0) {
  const joints = {};
  for (const [name, px, py] of [['nose', .4, .15], ['neck', .4, .23], ['leftShoulder', .33, .3], ['rightShoulder', .47, .3],
    ['leftElbow', .3, .4], ['rightElbow', .5, .4], ['leftWrist', .3 + wrist, .48], ['rightWrist', .5 + wrist, .48],
    ['leftHip', .35, .55], ['rightHip', .45, .55], ['leftKnee', .35, .7], ['rightKnee', .45, .7],
    ['leftAnkle', .35, .9], ['rightAnkle', .45, .9]]) joints[name] = { x: px + x, y: py, confidence: .95 };
  return { confidence: .95, joints };
}
function extraction(make = () => body(), count = 35) {
  return { durationMs: count * 100, nativeRevision: 1, warnings: [], frames: Array.from({ length: count }, (_, i) => ({
    timestampMs: i * 100, width: 360, height: 640, mirrored: false, people: make(i) ? [make(i)] : [],
  })) };
}
function moving(articulated = true) {
  return extraction(i => body(Math.max(0, Math.min(10, i - 5)) * .025,
    articulated && i > 5 && i <= 15 ? (i % 2) * .04 : articulated && i > 15 ? .04 : 0));
}
function stimulus(ms = 500, overrides = {}) {
  return { id: `stimulus:${ms}`, type: 'STIMULUS', timestampMs: ms, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, ...overrides };
}
function reaction() { return extraction(i => body(0, Math.max(0, Math.min(4, i - 7)) * .04)); }
const detect = (input = moving(), events = []) => D.detectPose(input, events, now);
function session() {
  return { id: 'pose-video', trainingSessionId: 'pose-training', drillId: null,
    asset: { uri: 'training-videos/pose-video.mp4', name: 'pose.mp4', storage: 'DOCUMENTS' },
    durationMs: 3500, fps: null, createdAt: now, importedAt: now, context: 'LIVE_FIRE', analysisStatus: 'ANNOTATING', analysisVersion: 1 };
}
const confirmed = events => events.reduce((all, e) => V.confirmEvent(all, e.id), events);
const merged = (r = detect(), events = []) => D.mergePoseDetections(events, r, 3500);
function video(events, run) { const s = session(); return { session: s, analysis: A.analyzeVideo(s, events, undefined, run) }; }
function open(file = ':memory:') {
  const db = new DatabaseSync(file);
  return { db, repo: new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID) };
}

test('stationary pose produces no movement or reaction', () => {
  const r = detect(extraction(), [stimulus()]); assert.equal(r.candidates.length, 0); assert.equal(r.segments.length, 0);
});
test('reaction follows stimulus after a quiet baseline and sustained arm motion', () => {
  const r = detect(reaction(), [stimulus()]), event = r.candidates.find(c => c.type === 'REACTION');
  assert.ok(event.timestampMs > 500 && event.timestampMs <= 900); assert.equal(event.confidence, 'HIGH');
  assert.equal(r.armPhases.length, 1); assert.ok(r.armPhases[0].stabilizationMs > event.timestampMs);
  assert.ok(!r.candidates.some(c => ['HAND_ON_GUN', 'DRAW_COMPLETE'].includes(c.type)));
});
test('candidate stimulus yields low-confidence reaction and absent baseline yields none', () => {
  const r = detect(reaction(), [stimulus(500, { source: 'AUDIO_DETECTED', confidence: 'HIGH', confirmed: false })]);
  assert.equal(r.candidates.find(c => c.type === 'REACTION').confidence, 'LOW');
  assert.ok(!detect(reaction(), [stimulus(0)]).candidates.some(c => c.type === 'REACTION'));
});
test('sustained gross movement yields start stop and relative diagnostics', () => {
  const r = detect(); assert.equal(r.segments.length, 1);
  const s = r.segments[0]; assert.ok(s.startMs >= 500 && s.startMs <= 800); assert.ok(s.endMs > 1500 && s.endMs <= 2000);
  assert.ok(s.peakRelativeVelocity > .12); assert.ok(s.decelerationOnsetMs >= s.accelerationOnsetMs);
  assert.ok(s.stabilizationMs > s.endMs); assert.equal(s.durationMs, s.endMs - s.startMs);
  assert.equal(r.candidates.filter(c => c.type === 'MOVEMENT_START').length, 1);
  assert.equal(r.candidates.filter(c => c.type === 'MOVEMENT_STOP').length, 1);
});
test('sustained articulated departure and stabilization support temporal position events', () => {
  const r = detect(); assert.equal(r.candidates.filter(c => c.type === 'POSITION_EXIT').length, 1);
  assert.equal(r.candidates.filter(c => c.type === 'POSITION_ENTRY').length, 1);
  assert.ok(r.candidates.every(c => !('stagePositionId' in c)));
});
test('threshold hysteresis ignores a brief slower patch within one movement', () => {
  const input = moving();
  input.frames[10].people = [body(.112, .03)];
  assert.equal(detect(input).segments.length, 1);
});
test('small jitter and a one-frame posture spike do not create segments', () => {
  assert.equal(detect(extraction(i => body((i % 2) * .002))).segments.length, 0);
  assert.equal(detect(extraction(i => body(i === 10 ? .012 : 0))).segments.length, 0);
});
test('brief fast real motion survives conservative smoothing', () => {
  const r = detect(extraction(i => body(Math.max(0, Math.min(3, i - 5)) * .04)));
  assert.equal(r.segments.length, 1); assert.ok(r.segments[0].startMs <= 700);
});
test('missing and low-confidence joints remain missing and cannot invent body motion', () => {
  const input = extraction();
  for (const f of input.frames) { delete f.people[0].joints.leftHip; f.people[0].joints.rightWrist.confidence = .1; }
  const clean = M.validatePoseExtraction(input);
  assert.equal(clean.frames[0].people[0].joints.rightWrist, undefined);
  assert.equal(detect(input).candidates.length, 0);
});
test('temporary occlusion breaks motion intervals without interpolating joints', () => {
  const input = moving(); input.frames[10].people = [];
  const selected = D.selectPoseSubject(input); assert.equal(selected.samples[10].body, null);
  const features = D.analyzePoseMotion(selected.samples); assert.equal(features[10], null); assert.equal(features[11], null);
  assert.ok(detect(input).segments.every(s => !(s.startMs < 1000 && s.endMs > 1000)));
});
test('large missing gap loses identity and never bridges or silently reacquires', () => {
  const input = moving(); input.frames.splice(8, 5);
  const selected = D.selectPoseSubject(input);
  assert.ok(selected.samples.filter(s => s.timestampMs >= 1300).every(s => s.body === null));
  assert.ok(selected.warnings.some(w => w.includes('continuity lost')));
  assert.ok(detect(input).segments.every(s => s.endMs < 800));
});
test('multiple initial people are ambiguous; continuity chooses only a unique nearby subject', () => {
  const input = extraction(); input.frames[0].people.push(body(.25));
  assert.equal(D.selectPoseSubject(input).samples[0].body, null);
  input.frames[3].people.push(body(.25));
  const selected = D.selectPoseSubject(input); assert.ok(selected.samples[3].body); assert.equal(selected.samples[3].ambiguous, true);
  input.frames[4].people.push(body(.01)); assert.equal(D.selectPoseSubject(input).samples[4].body, null);
});
test('camera-like uniform translation is low confidence and does not assert position identity', () => {
  const r = detect(moving(false)); assert.equal(r.segments[0].confidence, 'LOW');
  assert.ok(r.warnings.some(w => w.includes('Camera motion'))); assert.ok(!r.candidates.some(c => c.type === 'POSITION_ENTRY'));
});
test('portrait rotation landscape identity and mirroring map to displayed video coordinates', () => {
  assert.deepEqual(M.normalizeVideoPoint(.2, .3, 640, 360, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }), { x: .2, y: .3 });
  const p = M.normalizeVideoPoint(.2, .3, 640, 360, { a: 0, b: 1, c: -1, d: 0, tx: 360, ty: 0 });
  assert.ok(Math.abs(p.x - .7) < 1e-10); assert.ok(Math.abs(p.y - .2) < 1e-10);
  assert.deepEqual(M.normalizeVideoPoint(.2, .3, 640, 360, { a: -1, b: 0, c: 0, d: 1, tx: 640, ty: 0 }), { x: .8, y: .3 });
  const rect = M.containedVideoRect(400, 220, 100, 200);
  assert.ok(Math.abs(rect.left - 145) < 1e-9 && Math.abs(rect.width - 110) < 1e-9 && Math.abs(rect.height - 220) < 1e-9);
});
test('motion velocity uses elapsed seconds rather than frame count', () => {
  const a = extraction(i => body(i * .002));
  const b = structuredClone(a); b.frames.forEach(f => f.timestampMs *= 2); b.durationMs *= 2;
  const f1 = D.analyzePoseMotion(D.selectPoseSubject(a).samples).at(-1);
  const f2 = D.analyzePoseMotion(D.selectPoseSubject(b).samples).at(-1);
  assert.ok(Math.abs(f1.speed / f2.speed - 2) < .01);
});
test('manual event suppresses duplicate suggestion with a recorded match', () => {
  const r = detect(), c = r.candidates.find(c => c.type === 'MOVEMENT_START');
  const manual = { id: 'manual', type: c.type, timestampMs: c.timestampMs + 10, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true };
  const m = merged(r, [manual]); assert.equal(m.run.matches.length, 1); assert.equal(m.events.find(e => e.id === 'manual'), manual);
  assert.equal(m.events.filter(e => e.type === 'MOVEMENT_START').length, 1);
});
test('pose rerun preserves confirmed manual and audio evidence and replaces only unconfirmed pose', () => {
  const first = merged(), e = first.events[0], reviewed = V.confirmEvent(first.events, e.id);
  const audio = stimulus(100, { source: 'AUDIO_DETECTED', confidence: 'HIGH', confirmed: false });
  const next = merged(detect(extraction()), [...reviewed, audio]);
  assert.deepEqual(next.events.map(e => e.id).sort(), [e.id, audio.id].sort());
  assert.equal(next.events.find(v => v.id === e.id).confirmed, true);
});
test('confirmed pose derives movement duration through existing engine without physical speed', () => {
  const m = merged(), v = video(confirmed(m.events), m.run);
  assert.ok(v.analysis.measurements.some(m => m.kind === 'MOVEMENT' && m.eligible));
  assert.ok(v.analysis.measurements.some(m => m.kind === 'POSITION_TRANSITION' && m.eligible));
  assert.equal(A.videoObservations(v, 'competitionHolster').length, 0);
});
test('known physical distance enables confirmed pose movement calibration; suggestions never do', () => {
  const m = merged(), withDistance = m.events.map(e => e.type === 'MOVEMENT_START' ? { ...e, metadata: { ...e.metadata, distanceInches: 120 } } : e);
  assert.equal(A.videoObservations(video(withDistance, m.run), 'competitionHolster').length, 0);
  const v = video(confirmed(withDistance), m.run), observations = A.videoObservations(v, 'competitionHolster');
  assert.equal(observations.length, 1); assert.equal(observations[0].factor, 'movementSpeed');
  const duration = v.analysis.measurements.find(m => m.kind === 'MOVEMENT').durationMs;
  assert.equal(observations[0].value, 120 / (duration / 1000));
});
test('confirmed pose reaction feeds shared stimulus-response observation while candidate stimulus cannot', () => {
  const stimulusEvent = stimulus(), m = merged(detect(reaction(), [stimulusEvent]), [stimulusEvent]);
  const observations = A.videoObservations(video(confirmed(m.events), m.run), 'competitionHolster');
  assert.equal(observations.length, 1); assert.equal(observations[0].factor, 'stimulusResponseTime');
  const untrusted = m.events.map(e => e.type === 'STIMULUS' ? { ...e, source: 'AUDIO_DETECTED', confirmed: false, confidence: 'HIGH' } : { ...e, confirmed: true, confidence: 'CONFIRMED' });
  assert.equal(A.videoObservations(video(untrusted, m.run), 'competitionHolster').length, 0);
});
test('unconfirmed pose boundaries cannot split already trusted shooting evidence', () => {
  const shots = [700, 1200].map((timestampMs, i) => ({ id: `shot:${i}`, type: 'SHOT', timestampMs,
    source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, metadata: { targetId: 'A' } }));
  const m = merged(detect(), shots); assert.equal(video(m.events, m.run).analysis.measurements.filter(m => m.kind === 'SPLIT').length, 1);
});
test('malformed pose data fails safely and input fixtures remain unchanged', () => {
  const input = moving(), before = JSON.stringify(input); detect(input); assert.equal(JSON.stringify(input), before);
  for (const patch of [{ durationMs: 0 }, { durationMs: Infinity }, { frames: null }, { frames: Array(601).fill(input.frames[0]) }])
    assert.throws(() => detect({ ...input, ...patch }), /Malformed/);
  for (const change of [f => f.timestampMs = -1, f => f.people[0].joints.leftHip.x = NaN, f => f.width = 0,
    f => f.people[0].confidence = 2, f => f.people[0].joints.rightHip.y = 5]) {
    const bad = structuredClone(input); change(bad.frames[0]); assert.throws(() => detect(bad), /Malformed/);
  }
});
test('no person no movement and incomplete movement are valid bounded results', () => {
  const noPerson = detect(extraction(() => null)); assert.equal(noPerson.candidates.length, 0); assert.ok(noPerson.warnings.some(w => w.includes('No usable')));
  const input = moving(); input.frames = input.frames.slice(0, 12); input.durationMs = 1200;
  const incomplete = detect(input); assert.equal(incomplete.segments.length, 0); assert.ok(incomplete.warnings.some(w => w.includes('boundary')));
  const long = detect(extraction(() => body(), 600)); assert.equal(long.preview.length, 120); assert.equal(long.sampleCount, 600);
});
test('pose metadata normalization preserves bounded diagnostics and rejects unknown versions', () => {
  const m = merged(); assert.deepEqual(JSON.parse(JSON.stringify(A.normalizeVideo(video(m.events, m.run)).analysis.poseRun)), JSON.parse(JSON.stringify(m.run)));
  assert.throws(() => D.validatePoseRun({ ...m.run, detectorVersion: 'future' }), /damaged/);
  assert.throws(() => D.validatePoseRun({ ...m.run, preview: Array(121).fill(m.run.preview[0]) }), /damaged/);
  const stripped = D.validatePoseRun({ ...m.run, frames: [new Uint8Array(1000)] }); assert.equal(stripped.frames, undefined);
});
test('pose run and reviewed movement survive SQLite reopen with explicit profile contribution', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-review-')), file = path.join(dir, 'training.db'); let c = open(file);
  const m = merged(), events = confirmed(m.events.map(e => e.type === 'MOVEMENT_START' ? { ...e, metadata: { ...e.metadata, distanceInches: 120 } } : e));
  const v = video(events, m.run), record = { id: v.session.trainingSessionId, userId: 'local', drillId: null, drillName: 'movement', occurredAt: now,
    startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [v] };
  try {
    await c.repo.initialize(); const baseline = await c.repo.loadProfile(); await c.repo.saveTraining(record);
    assert.deepEqual(await c.repo.loadProfile(), baseline); c.db.close(); c = open(file); await c.repo.initialize();
    const loaded = (await c.repo.listTraining('local'))[0]; assert.deepEqual(loaded.videos[0].analysis.poseRun, JSON.parse(JSON.stringify(m.run)));
    await c.repo.contributeTrainingVideo(loaded, v.session.id); assert.equal((await c.repo.loadProfile()).performanceObservations.length, 1);
    const changed = V.editEvent(events, events.find(e => e.type === 'MOVEMENT_START').id, { timestampMs: 650 }, 3500);
    assert.equal(A.videoObservations(video(changed, m.run), 'competitionHolster').length, 0);
  } finally { c.db.close(); fs.rmSync(dir, { recursive: true }); }
});

function adapter(native) {
  const Module = require('node:module'), original = Module._load;
  const file = require.resolve('../src/training/extractPose.ts'); delete require.cache[file];
  Module._load = function(request, ...args) {
    if (request === 'expo-modules-core') return { requireOptionalNativeModule: () => native };
    if (request === './videoAssets') return { playbackUri: () => 'file:///local/video.mp4' };
    return original.call(this, request, ...args);
  };
  try { return require(file).extractPose; } finally { Module._load = original; }
}
test('unavailable native pose and decode failure leave recoverable errors', async () => {
  await assert.rejects(adapter(null)(session(), 'missing', new AbortController().signal, () => {}), /unavailable/);
  const native = { prepare() {}, cancel() {}, progress() { return 0; }, async extract() { throw new Error('Unsupported video'); } };
  await assert.rejects(adapter(native)(session(), 'failed', new AbortController().signal, () => {}), /Unsupported video/);
});
test('pose adapter uses bounded local settings and discards cancelled native output', async () => {
  let resolve, wasCancelled = false, args;
  const native = { prepare() {}, cancel() { wasCancelled = true; }, progress() { return .5; },
    extract(...parameters) { args = parameters; return new Promise(done => resolve = done); } };
  const controller = new AbortController(), pending = adapter(native)(session(), 'cancelled', controller.signal, () => {});
  controller.abort(); resolve(extraction());
  await assert.rejects(pending, /cancelled/); assert.equal(wasCancelled, true);
  assert.deepEqual(args.slice(2), [10, 60000, 600, 640, .45]); assert.ok(args[0].startsWith('file:'));
});
