const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const C = require('../src/training/executionComparison.ts');
const A = require('../src/training/videoAnalysis.ts');
const V = require('../src/training/videoModel.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { Repository } = require('../src/storage/repository.ts');
const now = '2026-09-22T12:00:00Z', later = '2026-09-22T12:01:00Z';
const event = (id, type, timestampMs, extra = {}) => ({ id, type, timestampMs, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, ...extra });
function fixture() {
  const document = createDefaultStage(), plan = createPlan(), route = createRoute('route-1');
  document.objects.find(o => o.type === 'start').position = { space: 'stage', x: 0, y: 0, z: 0 };
  route.positions = ['A', 'B'].map((id, i) => ({ id, label: id, position: { space: 'stage', x: 120 * (i + 1), y: 0, z: 0 },
    visibleTargetIds: ['target-' + (i + 1)], engagedTargetIds: ['target-' + (i + 1)] }));
  route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  plan.route = route; plan.engagements = { 'target-1': 3, 'target-2': 2 };
  plan.loadout = { startingMagazineId: 'm1', chamberLoaded: false, magazines: [
    { id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }] };
  const saved = { id: 'stage-1', name: 'Comparison stage', createdAt: now, updatedAt: now, document, plan };
  const session = { id: 'video-compare', trainingSessionId: 'training-compare', drillId: null,
    asset: { uri: 'training-videos/video-compare.mp4', name: 'compare.mp4', storage: 'DOCUMENTS' }, durationMs: 15000, fps: null,
    createdAt: now, importedAt: now, context: 'LIVE_FIRE', analysisStatus: 'ANNOTATING', analysisVersion: 1 };
  const events = [event('stim', 'STIMULUS', 0), event('ma', 'MOVEMENT_START', 1000), event('ma-end', 'MOVEMENT_STOP', 2100),
    event('pa', 'POSITION_ENTRY', 2100), event('a1', 'FIRST_SHOT', 2300, { metadata: { targetId: 'target-1' } }),
    event('a2', 'SHOT', 2600, { metadata: { targetId: 'target-1' } }), event('a3', 'SHOT', 2900, { metadata: { targetId: 'target-1' } }),
    event('pa-end', 'POSITION_EXIT', 3200), event('mb', 'MOVEMENT_START', 3200), event('reload', 'MAG_RELEASE', 3400),
    event('mb-end', 'MOVEMENT_STOP', 4500), event('insert', 'MAG_INSERT', 4800), event('reload-end', 'RELOAD_COMPLETE', 5000),
    event('pb', 'POSITION_ENTRY', 5000), event('b1', 'SHOT', 5200, { metadata: { targetId: 'target-2' } }),
    event('b2', 'SHOT', 5600, { metadata: { targetId: 'target-2' } }), event('pb-end', 'POSITION_EXIT', 6000), event('end', 'DRILL_END', 6500)];
  const video = { session, analysis: A.analyzeVideo(session, events) }, profile = createLocalProfile().performance;
  const comparison = C.createExecutionComparison('comparison-1', saved, video, profile, now);
  return { saved, video, profile, comparison };
}
function mapping(f, kind, planElementId, eventId, id = kind + '-' + planElementId) {
  const interval = C.observedExecution(f.video).intervals.find(i => i.kind === kind && i.eventIds.includes(eventId)
    && (kind !== 'MOVEMENT' || i.id.startsWith('MOVEMENT:')));
  assert.ok(interval, `${kind}: ${eventId}`);
  return { id, kind, planElementId, observedIntervalId: interval.id, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, createdAt: now, updatedAt: now };
}
function mapped(f = fixture()) {
  let c = f.comparison;
  for (const [kind, id, observed] of [['MOVEMENT', 'A', 'ma'], ['MOVEMENT', 'B', 'mb'], ['POSITION', 'A', 'pa'],
    ['POSITION', 'B', 'pb'], ['RELOAD', 'B', 'reload'], ['STRING', 'A', 'a1'], ['STRING', 'B', 'b1']])
    c = C.mapObservedEventsToPlan(c, f.video, mapping(f, kind, id, observed));
  return { ...f, comparison: c };
}
const result = f => C.createExecutionComparisonResult(f.comparison, f.video, f.saved);

test('training links optionally to a saved stage and selected route snapshot', () => {
  const f = fixture(); assert.equal(f.comparison.snapshot.stageId, f.saved.id); assert.equal(f.comparison.snapshot.routeId, 'route-1');
  assert.equal(f.comparison.videoId, f.video.session.id); assert.equal(f.video.executionComparison, undefined);
  assert.deepEqual(C.createExecutionComparisonResult(undefined, f.video).warnings, ['NO_STAGE_MAPPING']);
});
test('snapshot preserves historical geometry, route, timing inputs and estimates after live edits', () => {
  const f = fixture(), before = structuredClone(f.comparison.snapshot);
  f.saved.plan.route.positions[0].position.x += 120; f.profile.movementSpeed = 1;
  assert.deepEqual(f.comparison.snapshot, before); assert.ok(C.routeSnapshotChanged(before, f.saved));
  assert.equal(result(f).plannedTotalMs, 5250); assert.ok(result(f).warnings.includes('ROUTE_CHANGED_USING_ORIGINAL_SNAPSHOT'));
});
test('saved revision metadata alone does not claim a materially changed route', () => {
  const f = fixture(); f.saved.updatedAt = later; assert.equal(C.routeSnapshotChanged(f.comparison.snapshot, f.saved), false);
});
test('position mapping exposes confirmed dwell and honest unavailable planned dwell', () => {
  const f = mapped(), p = result(f).positionComparisons[0];
  assert.equal(p.observedMs, 1100); assert.equal(p.plannedMs, null); assert.equal(p.deltaMs, null);
  assert.equal(p.plannedEngagementMs, 500); assert.equal(p.plannedEngagementCount, 1);
  assert.equal(p.plannedRounds, 3); assert.equal(p.observedConfirmedShotCount, 3); assert.equal(p.observedStringCount, 1);
});
test('movement mapping compares authoritative duration with planned physical distance', () => {
  const r = result(mapped()).segmentComparisons[0];
  assert.equal(r.plannedMs, 1000); assert.equal(r.observedMs, 1100); assert.equal(r.deltaMs, 100);
  assert.equal(r.plannedDistanceInches, 120); assert.equal(r.mappingConfidence, 'CONFIRMED');
  assert.equal(r.observedDistanceInches, undefined);
});
test('evaluator exposes per-position engagement timing without changing its total formula', () => {
  const f = fixture(), e = evaluateRoute(f.saved.document, f.saved.plan, f.saved.plan.route, f.profile);
  assert.deepEqual(e.timing.positionDetails.map(p => p.engagementSeconds), [.5, .25]);
  assert.equal(e.timing.positionDetails.reduce((n, p) => n + p.engagementSeconds, 0), e.timing.splits + e.timing.transitions);
  assert.equal(e.timing.total, 5.25);
});
test('mapped strings compare evaluator engagements against confirmed first-to-last shots', () => {
  const rows = result(mapped()).stringComparisons;
  assert.deepEqual(rows.map(r => [r.plannedMs, r.observedMs, r.deltaMs]), [[500, 600, 100], [250, 400, 150]]);
});
test('reload comparison preserves raw, overlap and additional timing definitions', () => {
  const r = result(mapped()).reloadComparisons[0];
  assert.equal(r.plannedMs, 2000); assert.equal(r.plannedOverlapMs, 1000); assert.equal(r.plannedAdditionalMs, 1000);
  assert.equal(r.observedMs, 1600); assert.equal(r.observedOverlapMs, 1100); assert.equal(r.observedAdditionalMs, 500);
  assert.equal(r.deltaMs, -400); assert.equal(r.additionalDeltaMs, -500);
});
test('reload overlap stays unknown when confirmed movement has not been mapped', () => {
  const f = fixture(); f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'RELOAD', 'B', 'reload'));
  const r = result(f); assert.equal(r.reloadComparisons[0].observedOverlapMs, null);
  assert.equal(r.buckets.reloadDeltaMs, 0); assert.ok(r.warnings.includes('OBSERVED_RELOAD_OVERLAP_UNKNOWN'));
});
test('planned stationary reload uses evaluator zero overlap and full penalty', () => {
  const f = fixture(); f.saved.plan.route.reloads[0].mode = 'stationary';
  f.comparison = C.createExecutionComparison('stationary', f.saved, f.video, f.profile, now);
  const r = result(mapped(f)).reloadComparisons[0]; assert.equal(r.plannedOverlapMs, 0); assert.equal(r.plannedAdditionalMs, 2000);
});
test('total delta uses confirmed stimulus-to-end execution', () => {
  const r = result(mapped()); assert.equal(r.plannedTotalMs, 5250); assert.equal(r.observedTotalMs, 6500); assert.equal(r.totalDeltaMs, 1250);
});
test('residual reconciles all supported deltas without counting reload overlap twice', () => {
  const r = result(mapped()), b = r.buckets;
  assert.equal(b.movementDeltaMs, 400); assert.equal(b.engagementDeltaMs, 250); assert.equal(b.reloadDeltaMs, -500);
  assert.equal(b.residualDeltaMs, 1100); assert.equal(r.unmappedTimeMs, 2600); assert.equal(r.plannedUnattributedMs, 1500);
  assert.equal(b.movementDeltaMs + b.engagementDeltaMs + b.reloadDeltaMs + b.residualDeltaMs, r.totalDeltaMs);
  assert.equal(r.unmappedTimeMs - r.plannedUnattributedMs, b.residualDeltaMs);
});
test('position dwell remains descriptive and is not double-counted over shooting', () => {
  const f = mapped(), full = result(f);
  f.comparison.mappings = f.comparison.mappings.filter(m => m.kind !== 'POSITION');
  assert.deepEqual(result(f).buckets, full.buckets);
});
test('overlapping movement and shooting remain in residual rather than being counted twice', () => {
  const f = mapped(); f.video.analysis.events = V.editEvent(f.video.analysis.events, 'ma-end', { timestampMs: 3100 });
  const r = result(f), b = r.buckets;
  assert.ok(r.warnings.includes('OVERLAPPING_ATTRIBUTION'));
  assert.equal(b.movementDeltaMs, 300); assert.equal(b.engagementDeltaMs, 150);
  assert.equal(b.movementDeltaMs + b.engagementDeltaMs + b.reloadDeltaMs + b.residualDeltaMs, r.totalDeltaMs);
  assert.equal(r.unmappedTimeMs - r.plannedUnattributedMs, b.residualDeltaMs);
});
test('mapped intervals outside the selected total are excluded from attribution', () => {
  const f = mapped(); f.video.analysis.events.push(event('stim2', 'STIMULUS', 8000), event('end2', 'DRILL_END', 10000));
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'TOTAL', 'TOTAL', 'stim2'));
  const r = result(f); assert.ok(r.warnings.includes('MAPPING_OUTSIDE_TOTAL'));
  assert.equal(r.unmappedTimeMs, 2000); assert.equal(r.buckets.residualDeltaMs, r.totalDeltaMs);
});
test('incomplete mappings expose counts, unmatched elements and residual time', () => {
  const f = fixture(); f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'MOVEMENT', 'A', 'ma'));
  const r = result(f); assert.deepEqual(r.completeness.movements, { mapped: 1, total: 2 });
  assert.ok(r.completeness.percent < 100); assert.ok(r.warnings.includes('UNMATCHED_PLANNED_ELEMENT'));
  assert.ok(r.warnings.includes('UNMATCHED_OBSERVED_INTERVAL')); assert.equal(r.unmappedTimeMs, 5400);
});
test('fully mapped element coverage does not claim fully attributed time', () => {
  const r = result(mapped()); assert.equal(r.completeness.percent, 100); assert.ok(r.unmappedTimeMs > 0);
});
test('reordered execution mappings are rejected', () => {
  const f = fixture(); const first = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'MOVEMENT', 'A', 'mb'));
  assert.throws(() => C.mapObservedEventsToPlan(first, f.video, mapping(f, 'MOVEMENT', 'B', 'ma')), /INCONSISTENT_TIMELINE_ORDER/);
});
test('duplicate observed assignments and invalid planned references are rejected', () => {
  const f = fixture(), first = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'MOVEMENT', 'A', 'ma'));
  assert.throws(() => C.mapObservedEventsToPlan(first, f.video, mapping(f, 'MOVEMENT', 'B', 'ma')), /AMBIGUOUS_MAPPING/);
  assert.throws(() => C.mapObservedEventsToPlan(first, f.video, { ...mapping(f, 'MOVEMENT', 'B', 'mb'), planElementId: 'gone' }), /UNMATCHED_PLANNED_REFERENCE/);
});
test('contradictory position and string mappings are rejected', () => {
  const f = fixture(); const first = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'POSITION', 'A', 'pa'));
  assert.throws(() => C.mapObservedEventsToPlan(first, f.video, mapping(f, 'STRING', 'A', 'b1')), /INCONSISTENT_TIMELINE_ORDER/);
});
test('future unconfirmed automatic mappings cannot become authoritative comparisons', () => {
  const f = fixture(); f.comparison.mappings = [{ ...mapping(f, 'MOVEMENT', 'A', 'ma'), source: 'AUTOMATIC_SUGGESTION', confirmed: false }];
  assert.equal(result(f).mappedElements.length, 0); assert.ok(result(f).warnings.includes('UNCONFIRMED_MAPPING'));
});
test('unconfirmed detector endpoints and forged cached eligibility are ignored', () => {
  const f = mapped(); f.video.analysis.events = f.video.analysis.events.map(e => e.id === 'ma-end'
    ? { ...e, source: 'POSE_DETECTED', confirmed: false, confidence: 'HIGH' } : e);
  assert.ok(f.video.analysis.measurements.find(m => m.kind === 'MOVEMENT').eligible);
  const r = result(f); assert.equal(r.segmentComparisons.length, 1); assert.ok(r.warnings.includes('MISSING_CONFIRMED_EVENTS'));
});
test('missing total events stay unknown instead of using earliest and latest markers', () => {
  const f = mapped(); f.video.analysis.events = f.video.analysis.events.filter(e => e.type !== 'DRILL_END');
  const r = result(f); assert.equal(r.observedTotalMs, null); assert.equal(r.totalDeltaMs, null); assert.equal(r.buckets.residualDeltaMs, null);
  assert.ok(r.warnings.includes('MISSING_CONFIRMED_TOTAL'));
});
test('multiple confirmed totals require explicit total mapping', () => {
  const f = fixture(); f.video.analysis.events.push(event('stim2', 'STIMULUS', 8000), event('end2', 'DRILL_END', 10000));
  assert.equal(result(f).observedTotalMs, null); assert.ok(result(f).warnings.includes('AMBIGUOUS_OBSERVED_TOTAL'));
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'TOTAL', 'TOTAL', 'stim2'));
  assert.equal(result(f).observedTotalMs, 2000);
});
test('mapping edits recompute comparisons and removal returns timing to residual', () => {
  const f = fixture(), m = mapping(f, 'MOVEMENT', 'A', 'ma');
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, m);
  const before = result(f).segmentComparisons[0].observedMs;
  const replacement = { ...mapping(f, 'MOVEMENT', 'A', 'mb'), id: m.id, updatedAt: later };
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, replacement);
  assert.notEqual(result(f).segmentComparisons[0].observedMs, before); assert.equal(f.comparison.updatedAt, later);
  f.comparison = C.removeExecutionMapping(f.comparison, m.id, later);
  assert.equal(result(f).segmentComparisons.length, 0); assert.equal(result(f).unmappedTimeMs, 6500);
});
test('mapping and comparison operations do not mutate live route, timeline or profile', () => {
  const f = fixture(), before = structuredClone({ saved: f.saved, video: f.video, profile: f.profile, comparison: f.comparison });
  const mappedFixture = mapped(f); result(mappedFixture);
  assert.deepEqual(f, { ...before });
});
test('timeline edits recalculate mapped durations while retaining mapping references', () => {
  const f = mapped(); f.video.analysis.events = V.editEvent(f.video.analysis.events, 'ma', { timestampMs: 900 });
  assert.equal(result(f).segmentComparisons[0].observedMs, 1200);
});
test('missing stage keeps historical comparison usable', () => {
  const f = mapped(), r = C.createExecutionComparisonResult(f.comparison, f.video, null);
  assert.equal(r.plannedTotalMs, 5250); assert.ok(r.warnings.includes('LINKED_STAGE_UNAVAILABLE'));
});
test('no valid profile means no invented planned timing', () => {
  const f = fixture(); f.comparison = C.createExecutionComparison('no-profile', f.saved, f.video, null, now);
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, mapping(f, 'MOVEMENT', 'A', 'ma'));
  const r = result(f); assert.equal(r.plannedTotalMs, null); assert.equal(r.segmentComparisons[0].deltaMs, null);
});
test('malformed historical comparisons fail safely without breaking video normalization', () => {
  const f = fixture();
  for (const malformed of [null, {}, { ...f.comparison, version: 99 }, { ...f.comparison, mappings: null },
    { ...f.comparison, snapshot: { ...f.comparison.snapshot, document: {} } },
    { ...f.comparison, snapshot: { ...f.comparison.snapshot, evaluation: { timing: { total: -2 } } } }]) {
    assert.doesNotThrow(() => C.createExecutionComparisonResult(malformed, f.video));
    assert.equal(C.createExecutionComparisonResult(malformed, f.video).plannedTotalMs, null);
    assert.doesNotThrow(() => A.normalizeVideo({ ...f.video, executionComparison: malformed }));
  }
});
test('historical conflicting mappings are excluded with deterministic warnings', () => {
  const f = fixture(); f.comparison.mappings = [mapping(f, 'MOVEMENT', 'A', 'ma'), mapping(f, 'MOVEMENT', 'B', 'ma')];
  assert.equal(result(f).segmentComparisons.length, 0); assert.ok(result(f).warnings.includes('AMBIGUOUS_MAPPING'));
});
test('comparison and snapshot versions identify incompatible video references', () => {
  const f = fixture(); assert.equal(f.comparison.version, 1); assert.equal(f.comparison.snapshot.version, 1); assert.equal(f.comparison.videoAnalysisVersion, 1);
  assert.ok(C.createExecutionComparisonResult({ ...f.comparison, videoId: 'other' }, f.video).warnings.includes('INVALID_HISTORICAL_COMPARISON'));
});
test('snapshot requires a saved route and enforces bounded historical data', () => {
  const f = fixture(); const noRoute = structuredClone(f.saved); delete noRoute.plan.route;
  assert.throws(() => C.createExecutionComparison('missing', noRoute, f.video, f.profile, now), /Save or accept/);
  const oversized = { ...f.comparison, mappings: Array.from({ length: 501 }, () => mapping(f, 'MOVEMENT', 'A', 'ma')) };
  assert.equal(C.isExecutionComparison(oversized), false);
});
test('comparison snapshot and manual mappings survive SQLite reopen without profile changes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-comparison-')), file = path.join(dir, 'training.db');
  let db, repo;
  const open = () => { db = new DatabaseSync(file); repo = new Repository({ execAsync: async sql => db.exec(sql),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args), getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID); };
  open();
  try {
    await repo.initialize(); const before = await repo.loadProfile(), f = mapped();
    const video = { ...f.video, executionComparison: f.comparison };
    const record = { id: video.session.trainingSessionId, userId: 'local', drillId: null, drillName: 'Comparison', occurredAt: now,
      startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [video] };
    await repo.saveTraining(record); db.close(); open(); await repo.initialize();
    const loaded = (await repo.listTraining('local'))[0].videos[0];
    assert.deepEqual(loaded.executionComparison, f.comparison);
    assert.deepEqual(C.createExecutionComparisonResult(loaded.executionComparison, loaded), C.createExecutionComparisonResult(f.comparison, f.video));
    assert.deepEqual(await repo.loadProfile(), before);
    await repo.contributeTrainingVideo(record, video.session.id); const contributed = await repo.loadProfile();
    record.videos[0].executionComparison = C.removeExecutionMapping(f.comparison, 'MOVEMENT-A', later);
    await repo.saveTraining(record); assert.deepEqual(await repo.loadProfile(), contributed);
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});
