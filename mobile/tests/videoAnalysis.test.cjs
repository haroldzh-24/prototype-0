const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const V = require('../src/training/videoModel.ts');
const A = require('../src/training/videoAnalysis.ts');
const O = require('../src/training/observations.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { buildPersonalizedModel } = require('../src/profile/personalizedPerformance.ts');
const { Repository } = require('../src/storage/repository.ts');
const now = '2026-09-22T12:00:00.000Z';
function session(overrides = {}) {
  return { id: 'video-1', trainingSessionId: 'training-1', drillId: '2r2',
    asset: { uri: 'training-videos/video-1.mp4', name: '2R2.mp4', storage: 'DOCUMENTS', size: 1000 },
    durationMs: 10000, fps: null, createdAt: now, importedAt: now, context: 'LIVE_FIRE',
    analysisStatus: 'ANNOTATING', analysisVersion: 1, ...overrides };
}
function event(type, timestampMs, overrides = {}) {
  return { id: `${type}-${timestampMs}`, type, timestampMs, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, ...overrides };
}
const sequence = () => [event('STIMULUS', 100), event('FIRST_SHOT', 1100, { metadata: { targetId: 'A' } }),
  event('SHOT', 1300, { metadata: { targetId: 'A' } }), event('MAG_RELEASE', 1400), event('MAG_ACCESS', 1550),
  event('MAG_INSERT', 2600), event('RELOAD_COMPLETE', 2800), event('SHOT', 3100, { metadata: { targetId: 'A' } }),
  event('SHOT', 3350, { metadata: { targetId: 'A' } }), event('DRILL_END', 3400)];
function video(events = sequence(), settings = {}) { const s = session(settings); return { session: s, analysis: A.analyzeVideo(s, events) }; }
function record(v = video()) {
  return { id: v.session.trainingSessionId, userId: 'local', drillId: v.session.drillId, drillName: '2R2', occurredAt: now,
    startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: v.session.context, videos: [v] };
}
function open(file = ':memory:') {
  const db = new DatabaseSync(file);
  return { db, repo: new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID) };
}

test('video milliseconds convert explicitly to seconds and known nominal frames', () => {
  assert.equal(V.secondsToMs(1.243), 1243); assert.equal(V.msToSeconds(3087), 3.087);
  assert.equal(V.timeToFrame(1000, 60), 60); assert.equal(V.frameToTime(60, 60), 1000);
  assert.ok(Math.abs(V.frameToTime(30, 29.97) - 1001.001) < 0.001);
});
test('unknown, zero and malformed FPS never silently use a default', () => {
  for (const fps of [null, undefined, 0, -1, NaN, Infinity]) {
    assert.throws(() => V.timeToFrame(100, fps)); assert.throws(() => V.frameToTime(1, fps));
  }
  for (const frame of [-1, 1.5, Infinity]) assert.throws(() => V.frameToTime(frame, 30));
});
test('malformed and out-of-bounds timestamps reject without modifying input', () => {
  for (const time of [-1, NaN, Infinity, '100', null, undefined, 10001]) assert.throws(() => video([event('STIMULUS', time)]));
  assert.throws(() => V.secondsToMs(Number.MAX_VALUE));
  assert.doesNotThrow(() => video([event('STIMULUS', 0), event('DRILL_END', 10000)]));
});
test('event sorting is stable by timestamp and ID and does not mutate annotations', () => {
  const events = [event('SHOT', 200), event('STIMULUS', 100, { id: 'b' }), event('REACTION', 100, { id: 'a' })];
  const before = JSON.stringify(events);
  assert.deepEqual(V.sortEvents(events).map(e => e.id), ['a', 'b', 'SHOT-200']);
  assert.equal(JSON.stringify(events), before);
});
test('duplicate IDs, bad categories, sources and confidence are rejected', () => {
  assert.throws(() => video([event('SHOT', 1), event('SHOT', 1)]));
  for (const patch of [{ type: 'bad' }, { source: 'bad' }, { confidence: 'bad' }, { confirmed: 'yes' },
    { source: 'AUDIO_DETECTED', confidence: 'CONFIRMED', confirmed: false }]) assert.throws(() => video([event('SHOT', 1, patch)]));
});
test('editing and deletion recalculate intervals and leave source arrays unchanged', () => {
  const input = sequence(), before = JSON.stringify(input);
  const edited = V.editEvent(input, 'FIRST_SHOT-1100', { timestampMs: 1000 });
  assert.equal(video(edited).analysis.measurements.find(m => m.kind === 'DRAW').durationMs, 900);
  assert.ok(!video(V.deleteEvent(edited, 'FIRST_SHOT-1100')).analysis.measurements.some(m => m.kind === 'DRAW'));
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => V.editEvent(input, 'missing', { type: 'SHOT' }));
});
test('editing a machine annotation invalidates its previous user confirmation', () => {
  const input = [event('STIMULUS', 100), event('FIRST_SHOT', 1000, { source: 'AUDIO_DETECTED' })];
  assert.equal(A.videoObservations(video(input), 'competitionHolster').length, 1);
  const edited = V.editEvent(input, 'FIRST_SHOT-1000', { timestampMs: 1050 });
  assert.equal(edited[1].confirmed, false);
  assert.equal(A.videoObservations(video(edited), 'competitionHolster').length, 0);
});
test('stimulus to reaction, presentation and overall first-shot timing are distinct', () => {
  const result = video([event('STIMULUS', 100), event('REACTION', 350), event('FIRST_SHOT', 1200)]).analysis;
  assert.equal(result.measurements.find(m => m.kind === 'REACTION').durationMs, 250);
  assert.equal(result.measurements.find(m => m.kind === 'PRESENTATION').durationMs, 850);
  assert.equal(result.measurements.find(m => m.kind === 'DRAW').durationMs, 1100);
});
test('2R2 derives first shot, both splits, reload subintervals, post-reload shot and total', () => {
  const a = video().analysis;
  const durations = kind => a.measurements.filter(m => m.kind === kind).map(m => m.durationMs);
  assert.deepEqual(durations('DRAW'), [1000]); assert.deepEqual(durations('SPLIT'), [200, 250]);
  assert.deepEqual(durations('RELOAD_MANIPULATION'), [1200]); assert.deepEqual(durations('MAG_ACCESS'), [1050]);
  assert.deepEqual(durations('RELOAD'), [1400]); assert.deepEqual(durations('POST_RELOAD_SHOT'), [300]);
  assert.deepEqual(durations('TOTAL'), [3300]);
  assert.equal(a.shotStrings.length, 2); assert.equal(a.shotStrings[1].separatedBy, 'RELOAD');
  assert.equal(a.completeness.Reload, 'Confirmed'); assert.equal(a.completeness.Movement, 'Not measured');
});
test('same-target strings, target changes and movement separate split intervals', () => {
  const a = video([event('FIRST_SHOT', 100, { metadata: { targetId: 'A' } }), event('SHOT', 300, { metadata: { targetId: 'B' } }),
    event('TARGET_TRANSITION', 500), event('SHOT', 700), event('MOVEMENT_START', 800), event('MOVEMENT_STOP', 1500),
    event('SHOT', 1600), event('SHOT', 1800)]).analysis;
  assert.deepEqual(a.measurements.filter(m => m.kind === 'SPLIT').map(m => m.durationMs), [200]);
  assert.equal(a.shotStrings.length, 4); assert.equal(a.measurements.find(m => m.kind === 'TARGET_TRANSITION').durationMs, 200);
});
test('split calibration requires explicit same-target metadata', () => {
  const events = [event('FIRST_SHOT', 100), event('SHOT', 300)];
  assert.equal(video(events).analysis.measurements.filter(m => m.kind === 'SPLIT').length, 1);
  assert.equal(A.videoObservations(video(events), 'competitionHolster').length, 0);
  assert.equal(A.videoObservations(video(events.map(e => ({ ...e, metadata: { stringId: 'one target' } }))), 'competitionHolster').length, 1);
});
test('movement segments retain duration/type but do not invent distance or speed', () => {
  const events = [event('MOVEMENT_START', 100, { metadata: { movementType: 'lateral' } }), event('MOVEMENT_STOP', 2100)];
  const v = video(events);
  assert.equal(v.analysis.movementSegments[0].durationMs, 2000); assert.equal(v.analysis.movementSegments[0].movementType, 'lateral');
  assert.equal(A.videoObservations(v, 'competitionHolster').length, 0);
  events[0].metadata.distanceInches = 120;
  assert.equal(A.videoObservations(video(events), 'competitionHolster')[0].value, 60);
});
test('position exit/entry forms a movement segment without inventing physical speed', () => {
  const v = video([event('POSITION_EXIT', 500), event('POSITION_ENTRY', 1600)]);
  assert.equal(v.analysis.movementSegments[0].durationMs, 1100); assert.equal(A.videoObservations(v, 'competitionHolster').length, 0);
});
test('incomplete event sequences expose partial completeness and no fabricated intervals', () => {
  const a = video([event('MAG_RELEASE', 300), event('MOVEMENT_START', 500), event('TARGET_TRANSITION', 700)]).analysis;
  assert.equal(a.measurements.length, 0); assert.equal(a.completeness.Reload, 'Partial');
  assert.equal(a.completeness.Movement, 'Partial'); assert.equal(a.completeness.Transitions, 'Partial');
  assert.ok(a.warnings.length >= 3);
});
test('repeat starts and drill boundaries cannot bridge unrelated repetitions', () => {
  const a = video([event('STIMULUS', 0), event('MAG_RELEASE', 300), event('DRILL_END', 400),
    event('STIMULUS', 1000), event('MAG_INSERT', 1200), event('FIRST_SHOT', 1500)]).analysis;
  assert.ok(!a.measurements.some(m => m.kind === 'RELOAD_MANIPULATION'));
  assert.equal(a.measurements.find(m => m.kind === 'DRAW').durationMs, 500);
});
test('zero or reversed intervals do not produce measurements', () => {
  assert.equal(video([event('FIRST_SHOT', 100), event('STIMULUS', 100)]).analysis.measurements.length, 0);
  assert.equal(video([event('MOVEMENT_STOP', 100), event('MOVEMENT_START', 200)]).analysis.movementSegments.length, 0);
});
test('all requested event categories, including custom/unknown, are valid annotations', () => {
  assert.equal(video(V.eventTypes.map((type, i) => event(type, i * 100))).analysis.events.length, V.eventTypes.length);
});
test('machine suggestions cannot contribute until the user confirms every endpoint', () => {
  const input = [event('STIMULUS', 0), event('FIRST_SHOT', 1200, { source: 'AUDIO_DETECTED', confidence: 'HIGH', confirmed: false })];
  const v = video(input);
  assert.equal(v.analysis.completeness['First shot'], 'Partial');
  // Even a corrupted derived cache cannot bypass the integration boundary.
  v.analysis.measurements[0].eligible = true;
  assert.equal(A.videoObservations(v, 'competitionHolster').length, 0);
  const confirmed = video(V.confirmEvent(input, 'FIRST_SHOT-1200'));
  assert.equal(A.videoObservations(confirmed, 'competitionHolster').length, 1);
  assert.equal(confirmed.analysis.events[1].source, 'AUDIO_DETECTED');
});
test('manually created events are eligible without a separate machine-confirmation flag', () => {
  const v = video([event('STIMULUS', 100, { confirmed: false }), event('FIRST_SHOT', 1200, { confirmed: false })]);
  assert.equal(A.videoObservations(v, 'competitionHolster').length, 1);
});
test('unknown duration and low-ready starts do not calibrate holster draw', () => {
  assert.equal(A.videoObservations(video(sequence(), { durationMs: null }), 'competitionHolster').length, 0);
  assert.ok(!A.videoObservations(video(), 'lowReady').some(o => o.factor === 'drawTime'));
});
test('video observations calibrate the existing profile and personalized model with provenance', () => {
  const observations = A.videoObservations(video(), 'competitionHolster');
  assert.equal(observations.length, 4); assert.ok(observations.every(o => o.source === 'VIDEO_ANALYSIS' && o.analysisVersion === 1));
  const calibrated = O.calibrateObservations(createLocalProfile().performance, observations, 'LIVE_FIRE');
  assert.equal(calibrated.drawTime, 1); assert.equal(calibrated.reloadTime, 1.4); assert.equal(calibrated.averageSplitTime, 0.225);
  assert.equal(calibrated.timingEvidence.averageSplitTime.sampleCount, 2);
  assert.equal(buildPersonalizedModel(calibrated).factors.reloadTime.status, 'MEASURED');
  assert.equal(calibrated.magazineCapacity, createLocalProfile().performance.magazineCapacity);
});
test('calibration keeps contexts isolated and samples idempotent and order independent', () => {
  const base = createLocalProfile().performance, live = A.videoObservations(video(), 'competitionHolster');
  const dry = A.videoObservations(video([event('STIMULUS', 0), event('FIRST_SHOT', 700)], { id: 'dry', context: 'DRY_FIRE' }), 'competitionHolster');
  assert.equal(O.calibrateObservations(base, [...live, ...dry], 'LIVE_FIRE').drawTime, 1);
  assert.equal(O.calibrateObservations(base, [...live, ...dry], 'DRY_FIRE').drawTime, 0.7);
  assert.deepEqual(O.calibrateObservations(base, [...live].reverse(), 'LIVE_FIRE'), O.calibrateObservations(base, [...live, ...live], 'LIVE_FIRE'));
});
test('invalid values and unconfirmed observations fail structural guards', () => {
  const base = createLocalProfile().performance, o = A.videoObservations(video(), 'competitionHolster')[0];
  for (const patch of [{ value: NaN }, { value: -1 }, { confirmed: false }, { measuredAt: 'bad' }])
    assert.equal(O.calibrateObservations(base, [{ ...o, ...patch }], 'LIVE_FIRE').drawTime, base.drawTime);
});
test('analysis normalization preserves version and regenerates derived state', () => {
  const v = video(); v.analysis.measurements[0].durationMs = 999;
  assert.equal(A.normalizeVideo(v).analysis.analysisVersion, 1);
  assert.equal(A.normalizeVideo(v).analysis.measurements[0].durationMs, 1000);
  assert.throws(() => A.normalizeVideo({ ...v, analysis: { ...v.analysis, analysisVersion: 2 } }), /Unsupported/);
  assert.throws(() => A.normalizeVideo({ ...v, session: { ...v.session, analysisVersion: 2 } }), /Unsupported/);
});
test('missing or moved video files and failed media access are recoverable', async () => {
  assert.equal(await A.videoAssetAvailable(session(), () => false), false);
  assert.equal(await A.videoAssetAvailable(session(), () => { throw new Error('missing'); }), false);
  assert.equal(await A.videoAssetAvailable(session(), async () => true), true);
  assert.equal(video().analysis.events.length, 10);
});
test('remote, malformed and escaping media references are rejected', () => {
  for (const uri of ['https://example.com/video.mp4', '../private.mp4', 'file:///other.mp4', 'training-videos/../other.mp4'])
    assert.throws(() => video([], { asset: { ...session().asset, uri } }));
  assert.doesNotThrow(() => video([], { asset: { uri: 'blob:local-id', storage: 'BROWSER_SESSION', name: 'clip.mp4' } }));
});
test('analysis and profile contributions survive SQLite close/reopen with version and provenance', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-analysis-')), file = path.join(dir, 'training.db');
  let c = open(file);
  try {
    await c.repo.initialize(); await c.repo.contributeTrainingVideo(record(), 'video-1');
    c.db.close(); c = open(file); await c.repo.initialize();
    const loaded = (await c.repo.listTraining('local'))[0];
    assert.deepEqual(JSON.parse(JSON.stringify(loaded)), JSON.parse(JSON.stringify(record())));
    assert.equal(loaded.videos[0].analysis.analysisVersion, 1);
    const p = await c.repo.loadProfile(); assert.equal(p.performance.reloadTime, 1.4);
    assert.equal(p.performanceObservations.length, 4); assert.equal(p.performanceObservations[0].source, 'VIDEO_ANALYSIS');
  } finally { c.db.close(); fs.rmSync(dir, { recursive: true }); }
});
test('save-only never changes profile; repeated contribution replaces samples without duplication', async () => {
  const c = open(); try {
    await c.repo.initialize(); const before = await c.repo.loadProfile();
    await c.repo.saveTraining(record()); assert.deepEqual(await c.repo.loadProfile(), before);
    await c.repo.contributeTrainingVideo(record(), 'video-1'); await c.repo.contributeTrainingVideo(record(), 'video-1');
    assert.equal((await c.repo.loadProfile()).performanceObservations.length, 4);
  } finally { c.db.close(); }
});
test('editing/deleting contributed evidence withdraws stale samples and restores baseline factors', async () => {
  const c = open(); try {
    await c.repo.initialize(); await c.repo.contributeTrainingVideo(record(), 'video-1');
    const changed = video(V.deleteEvent(sequence(), 'MAG_RELEASE-1400'));
    await c.repo.saveTraining(record(changed));
    const p = await c.repo.loadProfile();
    assert.equal(p.performance.reloadTime, createLocalProfile().performance.reloadTime);
    assert.equal(p.performance.drawTime, 1); assert.equal(p.performanceObservations.length, 3);
    const empty = { ...record(), videos: [] }; await c.repo.saveTraining(empty);
    assert.equal((await c.repo.loadProfile()).performanceObservations.length, 0);
    assert.equal((await c.repo.loadProfile()).performance.drawTime, 1.5);
  } finally { c.db.close(); }
});
test('future versions and malformed annotations reject writes while preserving saved analyses', async () => {
  const c = open(); try {
    await c.repo.initialize(); await c.repo.saveTraining(record());
    const damaged = record(); damaged.videos[0].session.analysisVersion = 2;
    await assert.rejects(c.repo.saveTraining(damaged), /Unsupported/);
    const bad = record(); bad.videos[0].analysis.events[0].timestampMs = -1;
    await assert.rejects(c.repo.saveTraining(bad));
    assert.equal((await c.repo.listTraining('local'))[0].videos[0].analysis.events[0].timestampMs, 100);
  } finally { c.db.close(); }
});
test('profile contribution and annotation save roll back together on SQLite failure', async () => {
  const c = open(); try {
    await c.repo.initialize(); const before = await c.repo.loadProfile();
    c.db.exec("CREATE TRIGGER reject_training BEFORE INSERT ON training BEGIN SELECT RAISE(ABORT, 'simulated full disk'); END;");
    await assert.rejects(c.repo.contributeTrainingVideo(record(), 'video-1'), /simulated full disk/);
    assert.deepEqual(await c.repo.loadProfile(), before); assert.deepEqual(await c.repo.listTraining('local'), []);
    c.db.exec('DROP TRIGGER reject_training'); await c.repo.saveTraining(record());
    assert.equal((await c.repo.listTraining('local')).length, 1);
  } finally { c.db.close(); }
});
test('video ownership and context must match its existing training record', async () => {
  const c = open(); try {
    await c.repo.initialize();
    for (const field of ['trainingSessionId', 'drillId', 'context']) {
      const r = record(); r.videos[0].session[field] = field === 'context' ? 'DRY_FIRE' : 'other';
      await assert.rejects(c.repo.saveTraining(r));
    }
    await assert.rejects(c.repo.contributeTrainingVideo(record(), 'missing'));
  } finally { c.db.close(); }
});
