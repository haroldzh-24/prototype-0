const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const D = require('../src/training/audioDetection.ts');
const V = require('../src/training/videoModel.ts');
const A = require('../src/training/videoAnalysis.ts');
const { Repository } = require('../src/storage/repository.ts');
const now = '2026-09-22T12:00:00.000Z';
function audio(durationMs = 1000, offsetMs = 0) {
  return { samples: new Float32Array(durationMs * 16), sampleRate: 16000, durationMs, offsetMs, warnings: [] };
}
function beep(a, ms, duration = 150, hz = 2300) {
  for (let i = ms * 16; i < (ms + duration) * 16; i++) a.samples[i] = 0.4 * Math.sin(2 * Math.PI * hz * i / 16000);
  return a;
}
function impulse(a, ms, amplitude = 0.9) { a.samples[Math.round(ms * 16)] = amplitude; return a; }
const detect = a => D.detectAudio(a, undefined, now);
const shotTimes = run => run.candidates.filter(c => c.type === 'SHOT').map(c => c.timestampMs);
function session(context = 'LIVE_FIRE') {
  return { id: 'audio-video', trainingSessionId: 'audio-training', drillId: null,
    asset: { uri: 'training-videos/audio-video.mp4', name: 'test.mp4', storage: 'DOCUMENTS' },
    durationMs: 2000, fps: null, createdAt: now, importedAt: now, context, analysisStatus: 'ANNOTATING', analysisVersion: 1 };
}
function candidate(type, timestampMs) {
  return { type, timestampMs, confidence: 'HIGH', metadata: { durationMs: 100, peak: 0.8, rise: 10, toneRatio: 0.1, toneHz: 2000 } };
}
function run(candidates = [candidate('STIMULUS', 100), candidate('SHOT', 700), candidate('SHOT', 850)]) {
  return { detectorVersion: D.AUDIO_DETECTOR_VERSION, analyzedAt: now, config: { ...D.AUDIO_ANALYSIS_CONFIG },
    offsetMs: 0, durationMs: 2000, candidates, warnings: [], matches: [] };
}
function suggested(r = run()) { return D.mergeAudioDetections([], r, 2000).events; }
const confirmed = events => events.reduce((current, e) => V.confirmEvent(current, e.id), events);
function video(events, r) { const s = session(); return { session: s, analysis: A.analyzeVideo(s, events, r) }; }
function open(file) {
  const db = new DatabaseSync(file);
  return { db, repo: new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID) };
}

test('single sustained timer beep produces a stimulus suggestion, not a shot', async () => {
  const r = await detect(beep(audio(), 200));
  assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].type, 'STIMULUS');
  assert.ok(Math.abs(r.candidates[0].timestampMs - 200) <= 10);
});
test('timer frequency variation and multiple possible stimuli are retained', async () => {
  const r = await detect(beep(beep(audio(), 100, 120, 1550), 600, 150, 3850));
  assert.equal(r.candidates.filter(c => c.type === 'STIMULUS').length, 2);
  assert.ok(r.warnings.some(w => w.includes('Multiple possible')));
});
test('very short tone and sustained non-timer tone are not beeps', async () => {
  assert.equal((await detect(beep(audio(), 200, 20))).candidates.filter(c => c.type === 'STIMULUS').length, 0);
  assert.equal((await detect(beep(audio(2000), 100, 1500))).candidates.filter(c => c.type === 'STIMULUS').length, 0);
});
test('single impulsive shot has sample-accurate millisecond timing', async () => {
  assert.deepEqual(shotTimes(await detect(impulse(audio(), 231.4375))), [231.4375]);
});
test('rapid shot string retains each separate onset', async () => {
  assert.deepEqual(shotTimes(await detect(impulse(impulse(impulse(audio(), 200), 350), 500))), [200, 350, 500]);
});
test('nearby echo and duplicate overlapping windows merge into one shot', async () => {
  assert.deepEqual(shotTimes(await detect(impulse(impulse(audio(), 200), 240, 0.5))), [200]);
});
test('two legitimate shots 80ms apart survive the refractory window', async () => {
  assert.deepEqual(shotTimes(await detect(impulse(impulse(audio(), 200), 280))), [200, 280]);
});
test('constant broadband noise does not trivially produce many shots', async () => {
  const a = audio(); let seed = 17;
  for (let i = 0; i < a.samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; a.samples[i] = ((seed / 4294967296) * 2 - 1) * 0.15; }
  assert.ok(shotTimes(await detect(a)).length <= 1);
});
test('amplitude without a brief impulsive envelope is insufficient', async () => {
  const a = audio(); a.samples.fill(0.8, 200 * 16, 600 * 16);
  assert.equal(shotTimes(await detect(a)).length, 0);
});
test('dry fire can return only stimulus without failure', async () => {
  const r = await detect(beep(audio(), 200));
  assert.equal(shotTimes(r).length, 0); assert.ok(r.warnings.some(w => w.includes('normal for dry fire')));
});
test('silence and no audio track are valid empty results', async () => {
  assert.equal((await detect(audio())).candidates.length, 0);
  const r = await detect({ ...audio(), samples: [], noAudio: true });
  assert.equal(r.candidates.length, 0); assert.ok(r.warnings.some(w => w.includes('no audio track')));
});
test('malformed PCM, wrong rate, empty decode and zero duration fail cleanly', async () => {
  for (const patch of [{ sampleRate: 0 }, { sampleRate: 48000 }, { durationMs: 0 }, { offsetMs: NaN },
    { samples: [NaN] }, { samples: [Infinity] }, { samples: [2] }, { samples: [] }, { durationMs: 60001 }])
    await assert.rejects(detect({ ...audio(), ...patch }), /Malformed|empty/);
});
test('decode offset maps into the same video timeline including fractional milliseconds', async () => {
  assert.deepEqual(shotTimes(await detect(impulse(audio(1000, 37.25), 231.4375))), [268.6875]);
});
test('cancellation rejects before analysis and between feature batches', async () => {
  const before = new AbortController(); before.abort();
  await assert.rejects(D.detectAudio(audio(), before.signal), /cancelled/);
  const during = new AbortController(); const pending = D.detectAudio(audio(2000), during.signal);
  setTimeout(() => during.abort(), 0); await assert.rejects(pending, /cancelled/);
});
test('confirmed FIRST_SHOT suppresses a nearby SHOT suggestion and records the match', () => {
  const manual = { id: 'manual', type: 'FIRST_SHOT', timestampMs: 710, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true };
  const merged = D.mergeAudioDetections([manual], run(), 2000);
  assert.equal(merged.events.length, 3); assert.deepEqual(merged.run.matches, [{ candidateIndex: 1, eventId: 'manual' }]);
  assert.equal(merged.events.find(e => e.id === 'manual'), manual);
});
test('rerun replaces old suggestions and preserves confirmed/manual events deterministically', () => {
  const input = V.confirmEvent(suggested(), suggested()[1].id), before = JSON.stringify(input);
  const next = run([candidate('STIMULUS', 120), candidate('SHOT', 710), candidate('SHOT', 950)]);
  const merged = D.mergeAudioDetections(input, next, 2000);
  assert.ok(merged.events.some(e => e.confirmed && e.timestampMs === 700));
  assert.ok(!merged.events.some(e => e.timestampMs === 850));
  assert.deepEqual(merged, D.mergeAudioDetections(input, next, 2000)); assert.equal(JSON.stringify(input), before);
});
test('unconfirmed audio contributes nothing; confirmed SHOT gains a first-shot role without relabeling', () => {
  assert.equal(A.videoObservations(video(suggested()), 'competitionHolster').length, 0);
  const events = confirmed(suggested()), v = video(events);
  assert.equal(v.analysis.events[1].type, 'SHOT');
  assert.equal(v.analysis.measurements.find(m => m.kind === 'DRAW').durationMs, 600);
  assert.equal(v.analysis.measurements.find(m => m.kind === 'SPLIT').durationMs, 150);
  assert.equal(v.analysis.measurements.find(m => m.kind === 'STRING_TIME').durationMs, 150);
  assert.equal(A.videoObservations(v, 'competitionHolster')[0].value, 0.6);
});
test('unconfirmed intervening beep and shot do not disrupt confirmed timing', () => {
  const events = confirmed(suggested());
  const extra = suggested(run([candidate('STIMULUS', 400), candidate('SHOT', 800)]));
  const v = video([...events, ...extra]);
  assert.equal(v.analysis.measurements.find(m => m.kind === 'DRAW').durationMs, 600);
  assert.equal(v.analysis.measurements.find(m => m.kind === 'SPLIT').durationMs, 150);
});
test('timestamp/type edits revoke audio confirmation while retaining detector provenance', () => {
  const events = confirmed(suggested());
  const changed = V.editEvent(events, events[1].id, { timestampMs: 705, type: 'FIRST_SHOT' }, 2000);
  assert.equal(changed[1].confirmed, false); assert.equal(changed[1].metadata.audio.detectorVersion, D.AUDIO_DETECTOR_VERSION);
  assert.equal(A.videoObservations(video(changed), 'competitionHolster').length, 0);
});
test('audio metadata survives normalization and rejects damaged versions and candidates', () => {
  const r = run(); assert.deepEqual(A.normalizeVideo(video(suggested(r), r)).analysis.audioRun, r);
  for (const patch of [{ detectorVersion: 'future' }, { durationMs: NaN }, { candidates: [{ ...candidate('SHOT', 100), timestampMs: -1 }] },
    { candidates: [{ ...candidate('SHOT', 100), metadata: {} }] }, { config: { ...r.config, shotRefractoryMs: -1 } }])
    assert.throws(() => A.normalizeVideo(video([], { ...r, ...patch })));
});
test('candidate count is bounded and warns at the internal limit', async () => {
  const a = audio(18000);
  for (let ms = 100; ms < 17900; ms += 80) impulse(a, ms);
  const r = await detect(a); assert.equal(r.candidates.length, D.AUDIO_ANALYSIS_CONFIG.maxSuggestions);
  assert.ok(r.warnings.some(w => w.includes('Suggestion limit')));
});
test('clipping/noisy audio and extraction truncation warnings reach review metadata', async () => {
  const a = impulse(audio(), 200, 1); a.warnings.push('Duration limit reached');
  const r = await detect(a); assert.ok(r.warnings.some(w => w.includes('clipped'))); assert.ok(r.warnings.includes('Duration limit reached'));
});
test('saved suggestions and run metadata survive SQLite reopen without calibrating until explicit contribution', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-review-')), file = path.join(dir, 'test.db');
  let c = open(file);
  const r = run(), v = video(suggested(r), r);
  const record = { id: v.session.trainingSessionId, userId: 'local', drillId: null, drillName: 'audio', occurredAt: now,
    startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [v] };
  try {
    await c.repo.initialize(); const baseline = await c.repo.loadProfile();
    await c.repo.saveTraining(record); assert.deepEqual(await c.repo.loadProfile(), baseline);
    c.db.close(); c = open(file); await c.repo.initialize();
    const saved = (await c.repo.listTraining('local'))[0];
    assert.deepEqual(saved.videos[0].analysis.audioRun, r); assert.equal(saved.videos[0].analysis.events[0].confirmed, false);
    saved.videos[0] = video(confirmed(saved.videos[0].analysis.events), r);
    await c.repo.contributeTrainingVideo(saved, v.session.id);
    const profile = await c.repo.loadProfile(); assert.equal(profile.performance.drawTime, 0.6);
    assert.equal(profile.performanceObservations.length, 1);
  } finally { c.db.close(); fs.rmSync(dir, { recursive: true }); }
});
