const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const O = require('../src/training/observations.ts');
const M = require('../src/profile/personalizedPerformance.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { Repository } = require('../src/storage/repository.ts');
const sample = (patch = {}) => ({ id: 'r1', factor: 'reloadTime', value: 3, context: 'LIVE_FIRE', measuredAt: '2026-09-22T12:00:00Z', source: 'STRUCTURED_TRAINING', ...patch });
const rebuild = (observations, options = {}) => O.rebuildPerformanceProfile({ baseline: createLocalProfile().performance, observations, context: 'LIVE_FIRE', ...options });
function open() {
  const db = new DatabaseSync(':memory:');
  return { db, repo: new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args), getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, () => 'id') };
}
test('structured and manual measurements need no video and aggregate support', () => {
  const result = rebuild([sample(), sample({ id: 'r2', value: 5, source: 'MANUAL_ENTRY' })]);
  assert.equal(result.performance.reloadTime, 4);
  assert.deepEqual(result.aggregates.LIVE_FIRE.reloadTime, { sampleCount: 2, mean: 4, standardDeviation: 1,
    measuredAt: '2026-09-22T12:00:00.000Z', sources: ['MANUAL_ENTRY', 'STRUCTURED_TRAINING'] });
  assert.equal(result.confidenceSupport.factors.reloadTime.confidence, 'MEDIUM');
});
test('manual override survives calibration while sample statistics accumulate', () => {
  let p = O.setManualOverride(createLocalProfile(), 'reloadTime', 1.8);
  p = O.withPerformanceObservations(p, [sample(), sample({ id: 'r2', value: 5 })]);
  assert.equal(p.performance.reloadTime, 1.8);
  assert.equal(rebuild(p.performanceObservations).performance.reloadTime, 4);
  assert.equal(p.performance.timingEvidence.reloadTime.source, 'MANUAL');
});
test('new manual scalar edit survives later rebuild and removing it reveals measured aggregate', () => {
  let p = O.withPerformanceObservations(createLocalProfile(), [sample()]);
  p.performance.reloadTime = 7;
  p = O.withPerformanceObservations(p, [sample(), sample({ id: 'r2', value: 5 })]);
  assert.equal(p.performance.reloadTime, 7);
  p = O.setManualOverride(p, 'reloadTime', null);
  assert.equal(p.performance.reloadTime, 4);
  assert.equal(O.withPerformanceObservations(p, p.performanceObservations).performance.reloadTime, 4);
});
test('legacy manual evidence migrates to removable override without freezing its baseline', () => {
  const p = createLocalProfile(); p.performance.reloadTime = 6; p.performance.timingEvidence = { reloadTime: { source: 'MANUAL' } };
  const calibrated = O.withPerformanceObservations(p, [sample()]);
  assert.equal(calibrated.performance.reloadTime, 6);
  assert.equal(O.setManualOverride(calibrated, 'reloadTime', null).performance.reloadTime, 3);
  assert.equal(O.changeObservation(O.setManualOverride(calibrated, 'reloadTime', null), { operation: 'remove', id: 'r1' }).performance.reloadTime, 2);
});
test('structural corruption is skipped without losing valid observations', () => {
  const invalid = [null, {}, sample({ value: NaN }), sample({ value: Infinity }), sample({ value: -1 }), sample({ value: 0 }),
    sample({ measuredAt: 'bad' }), sample({ eventIds: 3 }), sample({ factor: 'unknown' }), sample({ context: 'unknown' })];
  const result = rebuild([...invalid, sample()]);
  assert.equal(result.performance.reloadTime, 3); assert.equal(result.observations.length, 1); assert.ok(result.warnings.length);
  assert.doesNotThrow(() => rebuild({ broken: true }));
});
test('slow reload, split and movement remain measured through personalized consumption', () => {
  const movement = O.createMovementObservation(sample({ id: 'm', distanceInches: 1, durationSeconds: 500 }));
  const result = rebuild([sample({ value: 75 }), sample({ id: 's', factor: 'averageSplitTime', value: 12 }), movement]);
  const model = M.buildPersonalizedModel(result.performance);
  assert.equal(model.timingProfile.reloadTime, 75); assert.equal(model.timingProfile.averageSplitTime, 12);
  assert.equal(model.timingProfile.movementSpeed, .002); assert.equal(model.factors.movementSpeed.status, 'MEASURED');
});
test('high variability is evidence of variable performance rather than invalid data', () => {
  const result = rebuild(Array.from({ length: 10 }, (_, i) => sample({ id: String(i), value: i ? .01 : 100 })));
  assert.equal(M.buildPersonalizedModel(result.performance).factors.reloadTime.status, 'MEASURED');
  assert.equal(result.confidenceSupport.factors.reloadTime.confidence, 'MEDIUM');
});
test('same-ID identical samples deduplicate regardless of property ordering', () => {
  const a = sample(), b = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(rebuild([a, b]).aggregates.LIVE_FIRE.reloadTime.sampleCount, 1);
});
test('conflicting IDs reject all versions independent of order and retain recoverable history', () => {
  const samples = [sample(), sample({ value: 8 }), sample({ id: 'other', value: 4 })];
  const a = rebuild(samples), b = rebuild([...samples].reverse());
  assert.deepEqual(a, b); assert.equal(a.performance.reloadTime, 4); assert.equal(a.observations.length, 3);
  assert.match(a.warnings[0], /Conflicting/);
  const p = O.withPerformanceObservations(createLocalProfile(), samples);
  assert.equal(O.changeObservation(p, { operation: 'replace', observation: sample({ value: 6 }) }).performance.reloadTime, 5);
});
test('dry live and pressure contexts stay separate across explicit selection', () => {
  const samples = O.trainingContexts.map((context, i) => sample({ id: context, context, value: i + 4 }));
  for (const [i, context] of O.trainingContexts.entries()) {
    const r = rebuild(samples, { context }); assert.equal(r.performance.reloadTime, i + 4);
    for (const c of O.trainingContexts) assert.equal(r.aggregates[c].reloadTime.sampleCount, 1);
  }
});
test('movement requires physical distance and positive time and uses inches per second', () => {
  const movement = O.createMovementObservation(sample({ distanceInches: 120, durationSeconds: 3 }));
  assert.equal(rebuild([movement]).performance.movementSpeed, 40);
  for (const distanceInches of [0, -1, NaN]) assert.throws(() => O.createMovementObservation(sample({ distanceInches, durationSeconds: 3 })));
  assert.throws(() => O.createMovementObservation(sample({ distanceInches: 120, durationSeconds: 0 })));
  assert.throws(() => O.createTrainingObservation(sample({ factor: 'movementSpeed' })));
});
test('difficulty curves aggregate counts and variability and interpolate without extrapolation', () => {
  const observations = [sample({ id: 'a', factor: 'averageSplitTime', value: 2, difficulty: 2, difficultyModel: 'DISTANCE_ONLY' }),
    sample({ id: 'b', factor: 'averageSplitTime', value: 4, difficulty: 2, difficultyModel: 'DISTANCE_ONLY' }),
    sample({ id: 'c', factor: 'averageSplitTime', value: 7, difficulty: 6, difficultyModel: 'DISTANCE_ONLY' }),
    sample({ id: 'd', factor: 'averageSplitTime', value: 12 })];
  const result = rebuild(observations), model = M.buildPersonalizedModel(result.performance);
  assert.deepEqual(result, rebuild([...observations].reverse()));
  assert.equal(model.curve.length, 2); assert.equal(model.curve[0].sampleCount, 2); assert.equal(model.curve[0].standardDeviation, 1);
  assert.equal(M.estimateShootingCost(model, 4).secondsPerSplit, 5);
  assert.equal(M.estimateShootingCost(model, 7).status, 'FALLBACK');
});
test('manual split override controls planner costs but removing it restores measured curve', () => {
  let p = O.withPerformanceObservations(createLocalProfile(), [sample({ factor: 'averageSplitTime', difficultyModel: 'DISTANCE_ONLY', difficulty: 2 })]);
  p = O.setManualOverride(p, 'averageSplitTime', .4);
  assert.equal(M.estimateShootingCost(M.buildPersonalizedModel(p.performance), 2).secondsPerSplit, .4);
  p = O.setManualOverride(p, 'averageSplitTime', null);
  assert.equal(M.estimateShootingCost(M.buildPersonalizedModel(p.performance), 2).secondsPerSplit, 3);
});
test('draw transition response and acquisition remain distinct metrics', () => {
  const result = rebuild(['drawTime', 'transitionTime', 'stimulusResponseTime', 'firstShotAcquisitionTime'].map((factor, i) => sample({ id: factor, factor, value: i + 1 })));
  assert.equal(result.performance.drawTime, 1); assert.equal(result.performance.transitionTime, 2);
  assert.equal(result.aggregates.LIVE_FIRE.stimulusResponseTime.mean, 3);
  assert.equal(result.aggregates.LIVE_FIRE.firstShotAcquisitionTime.mean, 4);
  assert.equal(result.performance.firstShotAcquisitionTime, undefined);
});
test('observation lifecycle rebuilds purely from serialized history and preserved inputs', () => {
  let p = O.changeObservation(createLocalProfile(), { operation: 'add', observation: sample() });
  p = O.changeObservation(p, { operation: 'replace', observation: sample({ value: 8 }) });
  const stored = JSON.parse(JSON.stringify(p));
  assert.deepEqual(O.withPerformanceObservations(stored, stored.performanceObservations), p);
  assert.equal(p.performance.reloadTime, 8);
  p = O.changeObservation(p, { operation: 'remove', id: 'r1' }); assert.equal(p.performance.reloadTime, 2);
});
test('exclusions and automatic suggestions do not contribute without explicit confirmation', () => {
  for (const patch of [{ excluded: true }, { validity: 'INVALID' }, { source: 'AUTOMATIC_DETECTOR' }, { confirmed: false }]) {
    const r = rebuild([sample(patch)]); assert.equal(r.performance.reloadTime, 2); assert.equal(r.observations.length, 1);
  }
  assert.equal(rebuild([sample({ source: 'AUTOMATIC_DETECTOR', confirmed: true })]).performance.reloadTime, 3);
});
test('legacy 8A speed format migrates without losing measurements', () => {
  const o = sample({ source: 'VIDEO_ANALYSIS', factor: 'movementSpeed', value: 50, videoId: 'v', trainingSessionId: 't', analysisVersion: 1, confirmed: true, eventIds: ['a', 'b'], evidenceKey: 'old' });
  const p = createLocalProfile(); p.videoCalibrationBase = structuredClone(p.performance); p.performanceObservations = [o]; p.performance.movementSpeed = 50;
  p.performance.timingEvidence = { movementSpeed: { source: 'MEASURED', sampleCount: 1, origin: 'VIDEO_ANALYSIS' } };
  const result = O.withPerformanceObservations(p, [o]); assert.equal(result.performance.movementSpeed, 50);
  assert.equal(result.videoCalibrationBase, undefined); assert.deepEqual(result.calibrationInputs.manualOverrides, {});
  assert.equal(O.changeObservation(result, { operation: 'remove', id: 'r1' }).performance.movementSpeed, 120);
});
test('repository persists lifecycle, contexts and newer manual edits through shared write queue', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); await Promise.all([repo.addObservation(sample()), repo.addObservation(sample({ id: 'r2', value: 5 }))]);
    assert.equal((await repo.loadProfile()).performance.reloadTime, 4);
    const p = await repo.loadProfile(); p.performance.reloadTime = 9; await repo.saveProfile(p);
    await repo.replaceObservation(sample({ value: 7 })); assert.equal((await repo.loadProfile()).performance.reloadTime, 9);
    await repo.setManualOverride('reloadTime', null); assert.equal((await repo.loadProfile()).performance.reloadTime, 6);
    await repo.rebuildProfile('DRY_FIRE'); assert.equal((await repo.loadProfile()).performance.reloadTime, 2);
    await repo.rebuildProfile('LIVE_FIRE'); await repo.removeObservation('r2'); assert.equal((await repo.loadProfile()).performance.reloadTime, 7);
  } finally { db.close(); }
});
test('malformed stored observations do not crash profile loading or freeze stale derived values', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); await repo.addObservation(sample());
    const p = await repo.loadProfile(); p.performanceObservations = [null, sample({ value: 'bad' }), sample({ id: 'valid', value: 5 })];
    db.prepare('UPDATE profiles SET payload = ? WHERE id = ?').run(JSON.stringify(p), 'local');
    const loaded = await repo.loadProfile(); assert.equal(loaded.performance.reloadTime, 5); assert.equal(loaded.performanceObservations.length, 1); assert.ok(loaded.calibrationWarnings.length);
  } finally { db.close(); }
});
test('saving training does not withdraw structured measurements from the same session', async () => {
  const { db, repo } = open();
  try {
    await repo.initialize(); await repo.addObservation(sample({ trainingSessionId: 't' }));
    await repo.saveTraining({ id: 't', userId: 'local', drillId: null, drillName: '', occurredAt: sample().measuredAt, startingType: 'competitionHolster', totalTime: null, notes: '', segments: [] });
    assert.equal((await repo.loadProfile()).performance.reloadTime, 3);
  } finally { db.close(); }
});
test('rebuilt training measurements change personalized route estimates through existing interface', () => {
  const { createDefaultStage } = require('../src/stage/defaults.ts');
  const { createPlan, isEngageable } = require('../src/planning/model.ts');
  const { evaluateCandidate } = require('../src/planning/planner.ts');
  const stage = createDefaultStage(), target = stage.objects.find(isEngageable), plan = createPlan();
  plan.engagements = { [target.id]: 2 };
  plan.loadout = { startingMagazineId: 'm', chamberLoaded: false, magazines: [{ id: 'm', capacity: 20, startingRounds: 20 }] };
  const candidate = { id: 'r', route: { version: 1, id: 'r', name: 'r', reloads: [], positions: [{ id: 'p', label: 'P', position: { space: 'stage', x: 100, y: 100, z: 0 }, visibleTargetIds: [target.id], engagedTargetIds: [target.id] }] } };
  const before = evaluateCandidate({ stage, plan, profile: createLocalProfile().performance }, candidate);
  const p = rebuild([sample({ factor: 'averageSplitTime', value: 12 })]).performance;
  const after = evaluateCandidate({ stage, plan, profile: p }, candidate);
  assert.ok(after.personalized.evaluation.timing.total > before.personalized.evaluation.timing.total);
  assert.equal(after.personalized.timingProfile.averageSplitTime, 12);
});
