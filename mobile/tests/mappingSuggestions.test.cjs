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

const S = require('../src/training/mappingSuggestions.ts');
function suggest(f = fixture()) {
  f.comparison.mappingSuggestions = S.generateMappingCandidates(f.comparison, f.video, now);
  return f;
}
const best = f => f.comparison.mappingSuggestions.candidates[0];
function decide(f, pair = 'ALL', decision = 'ACCEPTED') {
  f.comparison = S.reviewMappingSuggestion(f.comparison, f.video, best(f).id, pair, decision, later);
  return f;
}
function rebuild(f) { f.video.analysis = A.analyzeVideo(f.video.session, f.video.analysis.events); return f; }
function unit(id, kind, startMs, durationMs, shots = 0) {
  return { id, kind, startMs, endMs: startMs + durationMs, durationMs, confirmedShotCount: shots,
    eventIds: [id], sourceReferences: [id], stringIds: [], stringCount: kind === 'STRING' ? 1 : 0,
    reloadIds: [], complete: true, confidence: 'CONFIRMED', source: 'CONFIRMED_TIMELINE' };
}
function plan(id, kind = 'POSITION', durationMs = null, shots = null) {
  return { id: `${kind}:${id}`, kind, planElementId: id, order: Number(id) || 0, durationMs,
    requiredShots: shots, reloadExpected: false, targetIds: [], distanceInches: null, reloadOverlapMs: null };
}
test('three-position sequence preserves stable and movement route order', () => {
  const p = [plan('1'), plan('2'), plan('3')];
  const o = [unit('a', 'POSITION', 0, 1000), unit('b', 'POSITION', 2000, 1000), unit('c', 'POSITION', 4000, 1000)];
  const path = S.alignExecutionSequences(p, o, () => true)[0];
  assert.deepEqual(path.pairs.map(x => [x.planElementId, x.observedIntervalIds]), [['1', ['a']], ['2', ['b']], ['3', ['c']]]);
  const moves = S.alignExecutionSequences(p.slice(1).map(x => ({ ...x, kind: 'MOVEMENT' })),
    [unit('ab', 'MOVEMENT', 1000, 1000), unit('bc', 'MOVEMENT', 3000, 1000)], () => true)[0];
  assert.deepEqual(moves.pairs.map(x => x.planElementId), ['2', '3']);
});
test('duration support uses normalized mismatch with limited weight', () => {
  const p = plan('1', 'MOVEMENT', 920);
  assert.ok(S.scoreMappingCandidate(p, [unit('a', 'MOVEMENT', 0, 1080)]).cost < S.scoreMappingCandidate(p, [unit('b', 'MOVEMENT', 0, 5400)]).cost);
  assert.ok(S.scoreMappingCandidate(p, [unit('b', 'MOVEMENT', 0, 5400)]).cost < S.MAPPING_CONFIG.penalties.skipPlanned);
});
test('confirmed shot counts support alignment without claiming target identity', () => {
  const p = plan('1', 'STRING', null, 6), good = S.scoreMappingCandidate(p, [unit('a', 'STRING', 0, 1000, 6)]);
  assert.ok(good.cost < S.scoreMappingCandidate(p, [unit('b', 'STRING', 0, 1000, 2)]).cost);
  assert.ok(good.reasons.some(x => x.includes('target identity is unknown')));
});
test('reload location strongly supports expected movement', () => {
  const p = { ...plan('1', 'MOVEMENT', 1000), reloadExpected: true }, o = unit('m', 'MOVEMENT', 0, 1100);
  const absent = S.scoreMappingCandidate(p, [o]); o.reloadIds = ['reload'];
  assert.ok(S.scoreMappingCandidate(p, [o]).cost < absent.cost);
  const f = fixture(), planned = S.buildPlannedExecutionSequence(f.comparison).find(x => x.kind === 'MOVEMENT' && x.planElementId === 'B');
  assert.equal(planned.reloadOverlapMs, 1000);
});
test('multi-string DP preserves individual groups at one position', () => {
  const path = S.alignExecutionSequences([plan('1', 'STRING', 1200, 6)],
    [unit('a', 'STRING', 0, 200, 2), unit('b', 'STRING', 500, 200, 2), unit('c', 'STRING', 1000, 200, 2)], () => true)[0];
  assert.equal(path.pairs[0].operation, 'MULTIPLE_STRINGS_AT_POSITION');
  assert.deepEqual(path.pairs[0].observedIntervalIds, ['a', 'b', 'c']);
});
test('skipped planned position remains unmatched rather than reordered', () => {
  const path = S.alignExecutionSequences([plan('1'), plan('2'), plan('3')],
    [unit('a', 'POSITION', 0, 100), unit('c', 'POSITION', 1000, 100)], p => p.planElementId !== '2')[0];
  assert.deepEqual(path.pairs.map(x => x.planElementId), ['1', '3']);
});
test('extra stop remains explicit in generated candidates', () => {
  const f = fixture(); f.video.analysis.events.push(event('extra-in', 'POSITION_ENTRY', 7000), event('extra-out', 'POSITION_EXIT', 7500));
  suggest(rebuild(f)); assert.ok(best(f).extraObserved.some(id => id.includes('extra-in')));
});
test('incomplete video reduces confidence and supplies reasons', () => {
  const f = fixture(); f.video.analysis.events = f.video.analysis.events.filter(e => e.type !== 'DRILL_END');
  suggest(rebuild(f)); assert.equal(best(f).confidence, 'LOW'); assert.ok(best(f).reasons.some(x => x.includes('Incomplete')));
});
test('manual mapping anchors are preserved and unmapped regions receive suggestions', () => {
  const f = fixture(), interval = C.observedExecution(f.video).intervals.find(i => i.kind === 'POSITION');
  const anchor = { id: 'anchor', kind: 'POSITION', planElementId: 'A', observedIntervalId: interval.id,
    source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, createdAt: now, updatedAt: now };
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, anchor); suggest(f);
  assert.ok(!best(f).pairs.some(p => p.kind === 'POSITION' && p.planElementId === 'A'));
  assert.ok(best(f).pairs.some(p => p.kind === 'POSITION' && p.planElementId === 'B'));
  decide(f); assert.deepEqual(f.comparison.mappings.find(m => m.id === 'anchor'), anchor);
});
test('conflicting fixed mappings produce conflict without replacement', () => {
  const f = fixture(), intervals = C.observedExecution(f.video).intervals.filter(i => i.kind === 'POSITION');
  f.comparison.mappings = intervals.map((i, n) => ({ id: `anchor-${n}`, kind: 'POSITION', planElementId: n ? 'A' : 'B',
    observedIntervalId: i.id, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, createdAt: now, updatedAt: now }));
  const before = structuredClone(f.comparison.mappings); suggest(f);
  assert.equal(f.comparison.mappingSuggestions.status, 'CONFLICT'); assert.deepEqual(f.comparison.mappings, before);
});
test('ambiguous alignment produces bounded distinct alternatives', () => {
  const paths = S.alignExecutionSequences([plan('1')], [unit('a', 'POSITION', 0, 10), unit('b', 'POSITION', 20, 10)], p => p.observedIntervalIds.length === 1);
  assert.ok(paths.length > 1); assert.ok(paths.length <= S.MAPPING_CONFIG.beamWidth);
  assert.notDeepEqual(paths[0].pairs, paths[1].pairs);
});
test('near-duplicate candidates are suppressed deterministically', () => {
  const candidate = { id: 'a', score: .9, pairs: [{ id: 'one' }, { id: 'two' }] };
  const ranked = S.rankMappingCandidates([candidate, { ...candidate, id: 'b', score: .8 }, { ...candidate, id: 'c', pairs: [{ id: 'other' }] }]);
  assert.deepEqual(ranked.map(c => c.id), ['a', 'c']);
});
test('sparse evidence never reports high confidence', () => {
  const f = fixture(); f.video.analysis.events = f.video.analysis.events.filter(e => ['pa', 'pa-end'].includes(e.id));
  suggest(rebuild(f)); assert.ok(!f.comparison.mappingSuggestions.candidates.some(c => c.confidence === 'HIGH'));
});
test('accepted suggestions feed the existing comparison engine', () => {
  const f = decide(suggest()); const result = C.createExecutionComparisonResult(f.comparison, f.video);
  assert.ok(result.segmentComparisons.length); assert.ok(result.positionComparisons.length); assert.ok(result.stringComparisons.length);
  assert.ok(f.comparison.mappings.every(m => m.confirmed && m.source === 'AUTOMATIC_SUGGESTION'));
});
test('partial acceptance adds only the chosen pair', () => {
  const f = suggest(), pair = best(f).pairs[0]; decide(f, pair.id);
  assert.equal(f.comparison.mappings.length, 1); assert.equal(best(f).pairs.find(p => p.id === pair.id).decision, 'ACCEPTED');
});
test('rejected pairs remain unapplied during accept all', () => {
  const f = suggest(), pair = best(f).pairs[0]; decide(f, pair.id, 'REJECTED'); decide(f);
  assert.ok(!f.comparison.mappings.some(m => m.kind === pair.kind && m.planElementId === pair.planElementId));
});
test('timeline edits stale suggestions and block acceptance', () => {
  const f = suggest(); f.video.analysis.events.find(e => e.id === 'ma-end').timestampMs += 10;
  assert.equal(S.suggestionsAreStale(f.comparison, f.video), true); assert.throws(() => decide(f), /stale/);
});
test('shot grouping metadata changes stale suggestions; provisional detector changes do not', () => {
  const f = suggest(); f.video.analysis.events.push(event('proposal', 'SHOT', 10, { source: 'AUDIO_DETECTED', confirmed: false, confidence: 'LOW' }));
  assert.equal(S.suggestionsAreStale(f.comparison, f.video), false);
  f.video.analysis.events.find(e => e.id === 'a2').metadata.stringId = 'new-group';
  assert.equal(S.suggestionsAreStale(f.comparison, f.video), true);
});
test('historical snapshot and profile remain immutable', () => {
  const f = fixture(), before = structuredClone(f.comparison.snapshot), profile = structuredClone(f.profile);
  f.saved.plan.route.positions.reverse(); suggest(f); decide(f);
  assert.deepEqual(f.comparison.snapshot, before); assert.deepEqual(f.profile, profile);
  assert.ok(C.createExecutionComparisonResult(f.comparison, f.video, f.saved).warnings.includes('ROUTE_CHANGED_USING_ORIGINAL_SNAPSHOT'));
});
test('malformed route and missing observed data fail safely', () => {
  const f = fixture(); assert.equal(S.generateMappingCandidates(null, f.video, now).status, 'NO_RELIABLE_SUGGESTION');
  f.video.analysis.events = null; assert.doesNotThrow(() => S.generateMappingCandidates(f.comparison, f.video, now));
  assert.deepEqual(S.buildObservedExecutionSequence(f.video), []);
});
test('DP cells and evaluation bounds are enforced', () => {
  const budget = { cells: S.MAPPING_CONFIG.maxDPCells, evaluated: 0, reached: false };
  assert.deepEqual(S.alignExecutionSequences([plan('1')], [unit('a', 'POSITION', 0, 1)], () => true, budget), []);
  assert.equal(budget.reached, true);
  const count = { cells: 0, evaluated: S.MAPPING_CONFIG.maxAlignments, reached: false };
  S.alignExecutionSequences([plan('1')], [unit('a', 'POSITION', 0, 1)], () => true, count); assert.equal(count.reached, true);
});
test('multi-string acceptance aggregates comparison span and retains component durations', () => {
  const f = fixture(); f.video.analysis.events.push(event('transition', 'TARGET_TRANSITION', 2650), event('a4', 'SHOT', 3000, { metadata: { targetId: 'target-1' } }));
  rebuild(f); suggest(f);
  const pair = best(f).pairs.find(p => p.kind === 'STRING' && p.planElementId === 'A');
  assert.equal(pair.observedIntervalIds.length, 2); decide(f, pair.id);
  const row = C.createExecutionComparisonResult(f.comparison, f.video).stringComparisons[0];
  assert.equal(row.stringCount, 2); assert.equal(row.totalShots, 4); assert.equal(row.engagementDurationMs, 400);
  assert.equal(row.observedMs, 700); assert.equal(row.strings.length, 2);
});
test('manual replacement after generation cannot be overwritten by acceptance', () => {
  const f = suggest(), pair = best(f).pairs[0];
  f.comparison = C.mapObservedEventsToPlan(f.comparison, f.video, { id: 'manual', kind: pair.kind, planElementId: pair.planElementId,
    observedIntervalId: pair.observedIntervalIds[0], source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true, createdAt: now, updatedAt: now });
  assert.throws(() => decide(f, pair.id), /conflicts/); assert.equal(f.comparison.mappings[0].id, 'manual');
});
test('versions and decisions survive saved JSON with stale detection on reload', () => {
  const f = suggest(); decide(f, best(f).pairs[0].id); f.comparison = JSON.parse(JSON.stringify(f.comparison));
  assert.equal(S.suggestionsAreStale(f.comparison, f.video), false);
  for (const name of ['algorithmVersion', 'configVersion', 'comparisonVersion', 'videoAnalysisVersion', 'routeSnapshotVersion']) assert.equal(f.comparison.mappingSuggestions[name], 1);
  f.comparison.mappingSuggestions.algorithmVersion = 99; assert.equal(S.suggestionsAreStale(f.comparison, f.video), true);
});
test('adjacent stable observations may merge when justified', () => {
  const path = S.alignExecutionSequences([plan('1', 'POSITION', null, 4)], [unit('a', 'POSITION', 0, 10, 2), unit('b', 'POSITION', 20, 10, 2)], () => true)[0];
  assert.equal(path.pairs[0].operation, 'MERGED_OBSERVED');
});
test('fully mapped comparison returns a distinct no-work status', () => {
  const f = decide(suggest());
  assert.equal(S.generateMappingCandidates(f.comparison, f.video, later).status, 'FULLY_MAPPED');
});
test('oversized planned sequence returns bounds without evaluating alignments', () => {
  const f = fixture();
  f.saved.plan.route.positions = Array.from({ length: 40 }, (_, n) => ({ ...f.saved.plan.route.positions[0], id: `p-${n}` }));
  f.comparison = C.createExecutionComparison('large', f.saved, f.video, f.profile, now);
  const set = S.generateMappingCandidates(f.comparison, f.video, now);
  assert.equal(set.status, 'BOUNDS_REACHED'); assert.equal(set.evaluated, 0);
});
test('single confirmed shots retain string identity with zero observed duration', () => {
  const f = fixture(); f.video.analysis.events = [event('single', 'SHOT', 1000)]; rebuild(f);
  const sequence = S.buildObservedExecutionSequence(f.video);
  assert.equal(sequence[0].kind, 'STRING'); assert.equal(sequence[0].durationMs, 0); assert.equal(sequence[0].confirmedShotCount, 1);
});
test('malformed saved suggestion payload is stale and cannot crash review helpers', () => {
  const f = suggest(); f.comparison.mappingSuggestions.candidates = [{ id: 'broken' }];
  assert.equal(S.suggestionsAreStale(f.comparison, f.video), true);
  assert.throws(() => S.reviewMappingSuggestion(f.comparison, f.video, 'broken', 'ALL', 'ACCEPTED', now), /stale/);
});
test('suggestions and partial review decisions survive SQLite reopen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapping-suggestions-')), file = path.join(dir, 'training.db');
  let db, repo;
  const open = () => { db = new DatabaseSync(file); repo = new Repository({ execAsync: async sql => db.exec(sql),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args), getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null }, randomUUID); };
  open();
  try {
    await repo.initialize(); const profile = await repo.loadProfile(), f = suggest(); decide(f, best(f).pairs[0].id);
    const video = { ...f.video, executionComparison: f.comparison };
    await repo.saveTraining({ id: video.session.trainingSessionId, userId: 'local', drillId: null, drillName: 'Suggestions', occurredAt: now,
      startingType: 'competitionHolster', totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', videos: [video] });
    db.close(); open(); await repo.initialize(); const loaded = (await repo.listTraining('local'))[0].videos[0];
    assert.deepEqual(loaded.executionComparison, f.comparison); assert.deepEqual(await repo.loadProfile(), profile);
    assert.equal(S.suggestionsAreStale(loaded.executionComparison, loaded), false);
  } finally { db.close(); fs.rmSync(dir, { recursive: true }); }
});
