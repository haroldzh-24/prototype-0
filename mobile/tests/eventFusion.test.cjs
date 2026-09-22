const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const F = require('../src/training/eventFusion.ts');
const V = require('../src/training/videoModel.ts');
const A = require('../src/training/videoAnalysis.ts');
const D = require('../src/training/audioDetection.ts');
const sources = { AUDIO: 'AUDIO_DETECTED', BODY_POSE: 'POSE_DETECTED', CLOSE_UP_VISION: 'VISION_DETECTED', MANUAL: 'MANUAL' };
const evidence = (id, family = 'AUDIO', timestampMs = 1000, extra = {}) => ({ id, family, timestampMs, type: 'REACTION',
  source: sources[family], confidence: 'MEDIUM', detectorVersion: 'synthetic-1', runId: family + '-run', warnings: [], ...extra });
const event = (id, source = 'MANUAL', timestampMs = 1000, extra = {}) => ({ id, source, timestampMs, type: 'REACTION',
  confidence: source === 'MANUAL' ? 'CONFIRMED' : 'MEDIUM', confirmed: source === 'MANUAL', ...extra });
const fusion = (...e) => F.fuseEvidence(e);
const now = '2026-09-22T12:00:00Z';
const session = () => ({ id: 'fusion-video', trainingSessionId: 'fusion-training', drillId: null,
  asset: { uri: 'training-videos/fusion-video.mp4', name: 'fusion.mp4', storage: 'DOCUMENTS' }, durationMs: 5000, fps: null,
  createdAt: now, importedAt: now, context: 'LIVE_FIRE', analysisStatus: 'ANNOTATING', analysisVersion: 1 });
const run = (analyzedAt = now, timestampMs = 1000) => ({ detectorVersion: D.AUDIO_DETECTOR_VERSION, analyzedAt,
  config: D.AUDIO_ANALYSIS_CONFIG, offsetMs: 0, durationMs: 5000, warnings: [], matches: [], candidates: [
    { type: 'SHOT', timestampMs, confidence: 'MEDIUM', metadata: { durationMs: 10, peak: .8, rise: 3, toneRatio: 0, toneHz: 0 } },
  ] });

for (const pair of [['AUDIO', 'BODY_POSE'], ['AUDIO', 'CLOSE_UP_VISION'], ['BODY_POSE', 'CLOSE_UP_VISION']]) {
  test(`fusion associates compatible ${pair.join(' + ')} evidence`, () => {
    const r = fusion(evidence('a', pair[0]), evidence('b', pair[1], 1010));
    assert.equal(r.hypotheses.length, 1); assert.equal(r.hypotheses[0].families.length, 2);
    assert.equal(r.hypotheses[0].status, 'SUGGESTED');
  });
}
test('three independent modalities strengthen confidence beyond a pair', () => {
  const a = evidence('a'), b = evidence('b', 'BODY_POSE'), c = evidence('c', 'CLOSE_UP_VISION');
  assert.ok(fusion(a, b, c).hypotheses[0].score > fusion(a, b).hypotheses[0].score);
  assert.equal(fusion(a, b, c).hypotheses[0].confidence, 'HIGH');
});
test('same-family duplicates and repeated runs cannot inflate confidence', () => {
  const a = evidence('a');
  assert.equal(fusion(a, evidence('b'), evidence('c', 'AUDIO', 1000, { runId: 'other' })).hypotheses[0].score, fusion(a).hypotheses[0].score);
  assert.equal(fusion(a, evidence('b')).hypotheses[0].confidence, 'MEDIUM');
});
test('far-apart evidence stays separate', () => assert.equal(fusion(evidence('a'), evidence('b', 'BODY_POSE', 2000)).hypotheses.length, 2));
test('incompatible close-up transition and movement stop stay separate', () => {
  assert.equal(fusion(evidence('a', 'CLOSE_UP_VISION', 1000, { type: 'CUSTOM', interpretation: 'OBJECT_TRANSITION' }),
    evidence('b', 'BODY_POSE', 1000, { type: 'MOVEMENT_STOP' })).hypotheses.length, 2);
});
test('CUSTOM meanings require explicit matching interpretation', () => {
  const a = evidence('a', 'CLOSE_UP_VISION', 1000, { type: 'CUSTOM', interpretation: 'OBJECT_TRANSITION' });
  assert.equal(fusion(a, { ...a, id: 'b', interpretation: 'HAND_OBJECT_PROXIMITY' }).hypotheses.length, 2);
  assert.equal(fusion(a, { ...a, id: 'b' }).hypotheses.length, 1);
  assert.equal(fusion({ ...a, interpretation: undefined }, { ...a, id: 'b', interpretation: undefined }).hypotheses.length, 2);
});
test('sharp events use a tighter tolerance than onset events', () => {
  const a = evidence('a'), b = evidence('b', 'BODY_POSE', 1100);
  assert.equal(fusion(a, b).hypotheses.length, 1);
  assert.equal(fusion({ ...a, type: 'SHOT' }, { ...b, type: 'SHOT' }).hypotheses.length, 2);
});
test('complete-link clusters do not bridge a chain of detections', () => {
  assert.equal(fusion(evidence('a'), evidence('b', 'BODY_POSE', 1150), evidence('c', 'CLOSE_UP_VISION', 1300)).hypotheses.length, 2);
});
test('weighted median resists a temporal outlier', () => {
  assert.equal(F.estimateFusedTimestamp([evidence('a'), evidence('b', 'BODY_POSE', 1010), evidence('c', 'CLOSE_UP_VISION', 8000, { confidence: 'LOW' })]), 1010);
});
for (const source of ['MANUAL', 'USER_CONFIRMED']) test(`${source} timestamp and type stay authoritative`, () => {
  const anchor = evidence('trusted', 'MANUAL', 1100, { source, type: 'MOVEMENT_START', timelineEventId: 'original', confidence: 'CONFIRMED' });
  const h = fusion(evidence('a'), anchor).hypotheses[0];
  assert.equal(h.timestampMs, 1100); assert.equal(h.type, 'MOVEMENT_START'); assert.equal(h.authoritativeEventId, 'original');
});
test('nearby trusted events never merge with each other', () => {
  const r = F.fuseTimeline([event('one'), event('two', 'MANUAL', 1010), event('raw', 'POSE_DETECTED', 1005)], {});
  assert.equal(r.hypotheses.filter(h => h.status === 'CONFIRMED').length, 2);
});
test('support attaches without mutating an existing authoritative event', () => {
  const events = [event('manual'), event('raw', 'POSE_DETECTED', 1010)], before = structuredClone(events);
  const r = F.fuseTimeline(events, {});
  assert.deepEqual(events, before); assert.equal(r.hypotheses[0].evidenceIds.length, 2);
  assert.deepEqual(F.applyFusionToTimeline(events, r), [events[0]]);
});
test('confirming a fused hypothesis creates only one event with all provenance', () => {
  const raw = [event('a', 'POSE_DETECTED'), event('b', 'VISION_DETECTED', 1010)];
  const f = F.fuseTimeline(raw, {}), reviewed = F.reviewFusedHypothesis(raw, f, f.hypotheses[0].id, 'CONFIRM');
  assert.equal(reviewed.events.filter(V.isTrustedEvent).length, 1); assert.equal(reviewed.events.length, 3);
  assert.equal(reviewed.events.find(V.isTrustedEvent).metadata.fusion.evidenceIds.length, 2);
  assert.throws(() => F.reviewFusedHypothesis(reviewed.events, reviewed.fusion, f.hypotheses[0].id, 'CONFIRM'));
  assert.equal(F.applyFusionToTimeline(reviewed.events, F.fuseTimeline(reviewed.events, {}, reviewed.fusion)).length, 1);
});
test('rejection preserves raw evidence and persists across recomputation', () => {
  const raw = [event('a', 'POSE_DETECTED'), event('b', 'VISION_DETECTED')], f = F.fuseTimeline(raw, {});
  const reviewed = F.reviewFusedHypothesis(raw, f, f.hypotheses[0].id, 'REJECT');
  assert.strictEqual(reviewed.events, raw); assert.deepEqual(reviewed.fusion.evidence, f.evidence);
  const reloaded = F.fuseTimeline(raw, {}, JSON.parse(JSON.stringify(reviewed.fusion)));
  assert.equal(reloaded.hypotheses[0].status, 'REJECTED'); assert.equal(F.applyFusionToTimeline(raw, reloaded).length, 0);
});
for (const warning of ['NOISY_AUDIO', 'CAMERA_MOTION', 'POSE_OCCLUSION', 'TRACKING_LOSS', 'LOW_VISIBILITY']) {
  test(`${warning} lowers fused confidence`, () => {
    const a = evidence('a'), b = evidence('b', 'BODY_POSE');
    const clean = fusion(a, b).hypotheses[0], noisy = fusion({ ...a, warnings: [warning] }, b).hypotheses[0];
    assert.ok(noisy.score < clean.score); assert.ok(noisy.warnings.includes(warning));
  });
}
test('every partial modality combination produces hypotheses', () => {
  const items = [evidence('a'), evidence('b', 'BODY_POSE'), evidence('c', 'CLOSE_UP_VISION')];
  for (let mask = 1; mask < 8; mask++) assert.equal(F.fuseEvidence(items.filter((_, i) => mask & 1 << i)).hypotheses.length, 1);
  assert.deepEqual(fusion().hypotheses, []);
});
test('compatible type disagreement is recorded instead of hidden', () => {
  const h = fusion(evidence('a'), evidence('b', 'BODY_POSE', 1150, { type: 'MOVEMENT_START' })).hypotheses[0];
  assert.ok(h.explanations.includes('TYPE_DISAGREEMENT')); assert.ok(h.disagreement.temporal);
  assert.equal(F.areEventTypesCompatible({ type: 'MOVEMENT_START' }, { type: 'POSITION_EXIT' }), false);
});
test('conflicting runs are explicit and preserve each run version', () => {
  const h = fusion(evidence('a'), evidence('b', 'AUDIO', 1000, { runId: 'rerun', detectorVersion: 'synthetic-2' })).hypotheses[0];
  assert.equal(h.disagreement.runConflict, true); assert.equal(h.detectorRuns.length, 2); assert.ok(h.warnings.includes('CONFLICTING_RUNS'));
});
test('malformed evidence is skipped deterministically without crashes', () => {
  const r = F.fuseEvidence([null, {}, evidence('', 'AUDIO'), evidence('nan', 'AUDIO', NaN), evidence('bad', 'AUDIO', -1),
    evidence('source', 'AUDIO', 0, { source: 'UNRECOGNIZED' }), evidence('type', 'AUDIO', 0, { type: 'BAD' }),
    evidence('confidence', 'AUDIO', 0, { confidence: 'CONFIRMED' }), evidence('valid')]);
  assert.equal(r.evidence.length, 1); assert.deepEqual(r.warnings, ['INVALID_EVIDENCE']);
  assert.deepEqual(F.fuseEvidence(null).hypotheses, []);
});
test('duplicate IDs with conflicting values are excluded independent of order', () => {
  const items = [evidence('duplicate'), evidence('duplicate', 'BODY_POSE', 1100), evidence('valid')];
  assert.deepEqual(F.fuseEvidence(items), F.fuseEvidence(items.reverse()));
  assert.ok(F.fuseEvidence(items).warnings.includes('DUPLICATE_EVIDENCE_ID'));
});
test('clustering and timestamp are deterministic under input permutation', () => {
  const items = [evidence('a'), evidence('b', 'BODY_POSE', 1010), evidence('c', 'CLOSE_UP_VISION', 1020)];
  assert.deepEqual(F.fuseEvidence(items), F.fuseEvidence(items.reverse()));
});
test('all evidence, cluster, support and hypothesis bounds are enforced', () => {
  const r = F.fuseEvidence(Array.from({ length: 1800 }, (_, i) => evidence(String(i), 'AUDIO', 1000)));
  assert.equal(r.evidence.length, F.FUSION_CONFIG.maxEvidence); assert.ok(r.warnings.includes('EVIDENCE_LIMIT'));
  assert.ok(r.hypotheses.every(h => h.evidenceIds.length <= F.FUSION_CONFIG.maxSupport)); assert.ok(r.warnings.includes('CLUSTER_LIMIT'));
  const spread = F.fuseEvidence(Array.from({ length: 1000 }, (_, i) => evidence(String(i), 'AUDIO', i * 1000)));
  assert.equal(spread.hypotheses.length, F.FUSION_CONFIG.maxHypotheses); assert.ok(spread.warnings.includes('HYPOTHESIS_LIMIT'));
});
test('audio rerun replaces unconfirmed evidence and keeps unrelated hypotheses stable', () => {
  const pose = event('pose', 'POSE_DETECTED', 3000), oldRun = run(), newRun = run('2026-09-22T12:01:00Z', 1100);
  const first = D.mergeAudioDetections([pose], oldRun, 5000), f = F.fuseTimeline(first.events, { audioRun: first.run });
  const next = D.mergeAudioDetections(first.events, newRun, 5000), g = F.fuseTimeline(next.events, { audioRun: next.run }, f);
  assert.ok(!g.evidence.some(e => e.runId === `AUDIO:${now}`));
  assert.deepEqual(g.hypotheses.find(h => h.type === 'REACTION'), f.hypotheses.find(h => h.type === 'REACTION'));
});
test('confirmed event and original evidence survive detector rerun', () => {
  const oldRun = run(), merged = D.mergeAudioDetections([], oldRun, 5000), f = F.fuseTimeline(merged.events, { audioRun: oldRun });
  const reviewed = F.reviewFusedHypothesis(merged.events, f, f.hypotheses[0].id, 'CONFIRM');
  const original = reviewed.events.find(V.isTrustedEvent), nextRun = run('2026-09-22T12:01:00Z', 1010);
  const next = D.mergeAudioDetections(reviewed.events, nextRun, 5000), g = F.fuseTimeline(next.events, { audioRun: nextRun }, reviewed.fusion);
  assert.deepEqual(next.events.find(V.isTrustedEvent), original);
  assert.ok(g.evidence.some(e => e.id === f.evidence[0].id));
  assert.ok(g.hypotheses.find(h => h.authoritativeEventId === original.id).evidenceIds.length >= 3);
});
test('manual support from a previous detector run stays inspectable', () => {
  const manual = event('manual', 'MANUAL', 1000, { type: 'SHOT' }), first = F.fuseTimeline([manual], { audioRun: run() });
  const next = F.fuseTimeline([manual], { audioRun: run('2026-09-22T12:01:00Z', 1005) }, first);
  assert.ok(next.evidence.some(e => e.runId === `AUDIO:${now}`)); assert.equal(next.hypotheses.length, 1);
});
test('editing a confirmed fused event retains trust and original timestamps', () => {
  const raw = [event('pose', 'POSE_DETECTED')], f = F.fuseTimeline(raw, {});
  const reviewed = F.reviewFusedHypothesis(raw, f, f.hypotheses[0].id, 'CONFIRM');
  const trusted = reviewed.events.find(V.isTrustedEvent), edited = V.editEvent(reviewed.events, trusted.id, { timestampMs: 2500, type: 'MOVEMENT_STOP' });
  const next = F.fuseTimeline(edited, {}, reviewed.fusion), h = next.hypotheses.find(h => h.authoritativeEventId === trusted.id);
  assert.equal(h.timestampMs, 2500); assert.equal(h.type, 'MOVEMENT_STOP');
  assert.equal(next.evidence.find(e => e.id === 'event:pose').timestampMs, 1000);
});
test('stale references and unknown fusion versions produce warnings', () => {
  const e = event('manual', 'MANUAL', 1000, { metadata: { fusion: { evidenceIds: ['gone'] } } });
  const r = F.fuseTimeline([e], {}, { fusionVersion: 'old', configVersion: 0, evidence: null, hypotheses: null });
  assert.ok(r.warnings.includes('STALE_EVIDENCE_REFERENCE')); assert.ok(r.warnings.includes('FUSION_RECOMPUTED'));
});
test('confirmation validates edited times before creating an event', () => {
  const f = fusion(evidence('a'));
  assert.throws(() => F.reviewFusedHypothesis([], f, f.hypotheses[0].id, 'CONFIRM', { type: 'REACTION', timestampMs: NaN }, 5000));
  assert.throws(() => F.reviewFusedHypothesis([], f, f.hypotheses[0].id, 'CONFIRM', { type: 'REACTION', timestampMs: 6000 }, 5000));
});
test('fusion does not create eligible measurements until explicit confirmation', () => {
  const s = session(), events = [event('stimulus', 'MANUAL', 100, { type: 'STIMULUS' }), event('p', 'POSE_DETECTED'), event('v', 'VISION_DETECTED', 1010)];
  const a = A.analyzeVideo(s, events); assert.equal(A.videoObservations({ session: s, analysis: a }, 'competitionHolster').length, 0);
  const h = a.fusion.hypotheses.find(h => h.status === 'SUGGESTED'), r = F.reviewFusedHypothesis(events, a.fusion, h.id, 'CONFIRM');
  const b = A.analyzeVideo(s, r.events, undefined, undefined, undefined, r.fusion);
  assert.equal(b.measurements.filter(m => m.kind === 'REACTION' && m.eligible).length, 1);
  assert.equal(A.videoObservations({ session: s, analysis: b }, 'competitionHolster').length, 1);
});
test('fusion versions, references and raw candidate metadata survive SQLite persistence', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const { Repository } = require('../src/storage/repository.ts');
  const { randomUUID } = require('node:crypto');
  const db = new DatabaseSync(':memory:');
  const adapter = { execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null, getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    withTransactionAsync: async fn => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const repo = new Repository(adapter, randomUUID);
  try {
    await repo.initialize(); const before = await repo.loadProfile(), s = session(), audio = run();
    const events = D.mergeAudioDetections([], audio, 5000).events, a = A.analyzeVideo(s, events, audio);
    const r = F.reviewFusedHypothesis(events, a.fusion, a.fusion.hypotheses[0].id, 'CONFIRM');
    const analysis = A.analyzeVideo(s, r.events, audio, undefined, undefined, r.fusion);
    await repo.saveTraining({ id: s.trainingSessionId, userId: 'local', drillId: null, drillName: 'fusion', occurredAt: now,
      startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [{ session: s, analysis }] });
    const loaded = (await repo.listTraining('local'))[0].videos[0].analysis;
    assert.deepEqual(JSON.parse(JSON.stringify(loaded.fusion)), JSON.parse(JSON.stringify(analysis.fusion)));
    assert.deepEqual(loaded.audioRun.candidates, audio.candidates); assert.deepEqual(await repo.loadProfile(), before);
  } finally { db.close(); }
});
