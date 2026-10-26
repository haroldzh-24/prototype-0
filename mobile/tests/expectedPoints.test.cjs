// Expected hits and points per target (roadmap C3): hit counts from library runs, the hit model by distance,
// planned AA/AC/CC with a miss risk, and the stage points and hit factor estimate.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const L = require('../src/training/drillLibrary.ts');
const O = require('../src/training/observations.ts');
const H = require('../src/profile/hitModel.ts');
const E = require('../src/planning/expectedPoints.ts');
const P = require('../src/planning/model.ts');
const TL = require('../src/stage/targetLayers.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const { Repository } = require('../src/storage/repository.ts');
const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b}`);
const at = n => new Date(Date.UTC(2026, 9, 1 + n, 12)).toISOString();
let serial = 0;
function run(drillId, shotTimes, patch = {}) {
  return { id: 'r' + ++serial, drillId, recordedAt: at(serial), shotTimes, totalTime: shotTimes.length ? shotTimes[shotTimes.length - 1] : null, family: 'USPSA', notes: '',
    ...patch, choices: L.choicesFor(L.libraryDrill(drillId), patch.choices) };
}
const bill = [1.3, 1.55, 1.8, 2.05, 2.3, 2.55];

test('hit counts: best hits up to the required count, a PCSL T is two A hits, unmade hits are misses; steel counts makeups', () => {
  assert.deepEqual(L.hitCounts(run('bill', bill, { zones: { A: 5, C: 1 } })), { a: 5, c: 1, d: 0, miss: 0 });
  assert.deepEqual(L.hitCounts(run('bill', bill, { zones: { A: 3, D: 1, M: 2 } })), { a: 3, c: 0, d: 1, miss: 2 });
  assert.deepEqual(L.hitCounts(run('bill', bill, { family: 'PCSL', zones: { T: 2, A: 1, C: 1 } })), { a: 5, c: 1, d: 0, miss: 0 });
  assert.deepEqual(L.hitCounts(run('ladder', [1.6, 1.9, 2.3], { zones: { A: 2, C: 1 } })), { a: 2, c: 0, d: 0, miss: 0 }, 'an extra shot: best two count');
  assert.equal(L.hitCounts(run('bill', bill)), null, 'hits not counted');
  assert.deepEqual(L.hitCounts(run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.4])), { a: 5, c: 0, d: 0, miss: 1 });
  assert.equal(L.hitCounts(run('steel', [], { totalTime: 4 })), null, 'misses unknown');
});

test('library runs give hit measurements (not in dry fire) and the profile builds hit shares by distance and kind', () => {
  const live = { id: 's', context: 'LIVE_FIRE' };
  const obs = L.libraryObservations(live, run('ladder', [1.6, 1.9], { choices: { distance: '15' }, zones: { A: 1, C: 1 } }));
  const hits = obs.find(o => o.factor === 'hitZones');
  assert.deepEqual([hits.value, hits.hits, hits.distanceInches], [2, { a: 1, c: 1, d: 0, miss: 0 }, 540]);
  assert.ok(O.isPerformanceObservation(hits));
  assert.equal(O.isPerformanceObservation({ ...hits, value: 3 }), false, 'counts must add up');
  assert.equal(O.isPerformanceObservation({ ...hits, factor: 'drawTime' }), false, 'hits only on hit measurements');
  assert.equal(L.libraryObservations({ id: 's', context: 'DRY_FIRE' }, run('ladder', [1.6, 1.9], { zones: { A: 2 } })).some(o => o.factor === 'hitZones'), false);
  const all = [
    ...L.libraryObservations(live, run('bill', bill, { zones: { A: 5, C: 1 } })),
    ...L.libraryObservations(live, run('ladder', [1.6, 1.9], { choices: { distance: '15' }, zones: { A: 1, C: 1 } })),
    ...L.libraryObservations(live, run('ladder', [1.7, 2.0], { choices: { distance: '15' }, zones: { A: 1, M: 1 } })),
    ...L.libraryObservations(live, run('partial', [1.6, 2.0], { choices: { face: 'head', distance: '7' }, zones: { A: 1, C: 1 } })),
    ...L.libraryObservations(live, run('onTheMove', [1.5, 1.85, 2.4, 2.75], { choices: { mode: 'toward' }, zones: { C: 4 } })),
    ...L.libraryObservations(live, run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.4], { choices: { distance: '15' } })),
  ].map((o, i) => ({ ...o, id: o.id + ':' + i }));
  const model = O.withPerformanceObservations(createLocalProfile(), all, 'LIVE_FIRE').performance.hitModel;
  assert.deepEqual(model.paper.map(p => [p.yards, p.runs, p.count]), [[7, 1, 6], [15, 2, 4]], 'moving runs are left out');
  near(model.paper[1].a, 0.5); near(model.paper[1].c, 0.25); near(model.paper[1].miss, 0.25);
  assert.deepEqual(model.partial.map(p => [p.yards, p.a, p.c]), [[7, 0.5, 0.5]]);
  assert.deepEqual(model.steel.map(p => [p.yards, p.count]), [[15, 6]]); near(model.steel[0].miss, 1 / 6);
  assert.equal(O.withPerformanceObservations(createLocalProfile(), [], 'LIVE_FIRE').performance.hitModel, undefined);
});

test('hit shares at a distance: measured, blended between two distances, or the nearest one (flagged)', () => {
  const pts = [{ yards: 5, runs: 2, count: 4, a: 1, c: 0, d: 0, miss: 0 }, { yards: 15, runs: 3, count: 6, a: 0.5, c: 0.5, d: 0, miss: 0 }];
  assert.equal(H.hitRatesAt(pts, 5).source, 'MEASURED');
  const mid = H.hitRatesAt(pts, 10); assert.equal(mid.source, 'BETWEEN'); near(mid.rates.a, 0.75); assert.deepEqual(mid.fromYards, [5, 15]); assert.equal(mid.runs, 5);
  const far = H.hitRatesAt(pts, 30); assert.equal(far.source, 'NEAREST'); assert.deepEqual(far.fromYards, [15]);
  assert.equal(H.hitRatesAt([], 10), null); assert.equal(H.hitRatesAt(undefined, 10), null);
  assert.equal(H.validHitModel({ paper: [{ ...pts[0], a: 0.9 }] }), undefined, 'shares must add to 1');
});

test('points: USPSA minor and major, PCSL, misses cost 10; planned AA/AC/CC with a miss risk; pair odds', () => {
  const r = { a: 0.8, c: 0.2, d: 0, miss: 0 };
  near(E.expectedPaperPoints(r, 2, E.zoneValues('USPSA', 'minor')), 2 * (4 + 0.6));
  near(E.expectedPaperPoints(r, 2, E.zoneValues('USPSA', 'major')), 2 * (4 + 0.8));
  assert.deepEqual(E.zoneValues('PCSL', 'major'), { A: 5, C: 3, D: 1 }, 'PCSL has no power-factor scoring');
  near(E.expectedPaperPoints({ a: 0.9, c: 0, d: 0, miss: 0.1 }, 2, E.zoneValues('USPSA', 'minor')), 2 * (4.5 - 1));
  const odds = E.pairOdds(r); near(odds.AA, 0.64); near(odds.AC, 0.32); near(odds.CC, 0.04);
  assert.deepEqual(E.plannedRates('AA', undefined, null), { a: 1, c: 0, d: 0, miss: 0 });
  const ac = E.plannedRates('AC', 0.1, null); near(ac.a, 0.45); near(ac.c, 0.45); near(ac.miss, 0.1);
  near(E.expectedPaperPoints(E.plannedRates('AC', undefined, null), 2, E.zoneValues('USPSA', 'minor')), 8, 1e-9, 'AC minor = 8');
  near(E.expectedPaperPoints(E.plannedRates('CC', undefined, null), 2, E.zoneValues('USPSA', 'major')), 8, 1e-9, 'CC major = 8');
  const risk = E.plannedRates(undefined, 0.25, r); near(risk.a, 0.6); near(risk.c, 0.15); near(risk.miss, 0.25);
  assert.equal(E.plannedRates(undefined, 0.1, null), null, 'a miss risk alone is not an estimate');
});

function scene() {
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1080, depth: 1080 } }), objects: [createObject('start', 'start', 540, 1000)] };
  for (const [id, x, y] of [['T1', 540, 748], ['T2', 300, 460]]) { const r = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x, y, z: 0 }); assert.ok(!r.error, r.error); stage = r.stage; }
  const steel = placeTarget(stage, 'uspsa-round-12-v1', 'S1', { space: 'stage', x: 780, y: 280, z: 0 }); assert.ok(!steel.error, steel.error); stage = steel.stage;
  const p = (id, x, y, engaged) => ({ id, label: id, position: { space: 'stage', x, y, z: 0 }, visibleTargetIds: engaged, engagedTargetIds: engaged });
  const route = { ...createRoute('r'), positions: [p('P1', 540, 1000, ['T1', 'S1']), p('P2', 300, 1000, ['T2'])] };
  return { stage, route };
}
const hitModel = { paper: [{ yards: 7, runs: 4, count: 8, a: 1, c: 0, d: 0, miss: 0 }, { yards: 15, runs: 2, count: 4, a: 0.5, c: 0.5, d: 0, miss: 0 }],
  steel: [{ yards: 20, runs: 2, count: 11, a: 10 / 11, c: 0, d: 0, miss: 1 / 11 }] };

test('stage estimate: each target at the distance the route shoots it from, planned hits override, steel makeups, hit factor', () => {
  const { stage, route } = scene();
  let plan = { ...P.createPlan(), route, engagements: { T1: 2, T2: 2, S1: 1 } };
  let est = E.estimateStagePoints(stage, plan, route, { hitModel }, 'USPSA', 'minor');
  const [t1, t2, s1] = ['T1', 'T2', 'S1'].map(id => est.targets.find(t => t.targetId === id));
  near(t1.yards, 7, 0.05); assert.equal(t1.measured.source, 'MEASURED'); near(t1.expectedPoints, 10);
  near(t2.yards, 15, 0.05); near(t2.expectedPoints, 2 * (2.5 + 1.5), 1e-6); near(t2.odds.AC, 0.5, 1e-6);
  assert.equal(s1.kind, 'steel'); assert.equal(s1.expectedPoints, 5); near(s1.expectedMakeups, (1 / 11) / (10 / 11), 1e-9);
  near(s1.yards, Math.hypot(240, 720) / 36, 0.3); assert.equal(s1.measured.source, 'NEAREST');
  assert.ok(est.complete); near(est.expectedPoints, 10 + 8 + 5, 1e-6); assert.equal(est.maxPoints, 25);
  near(E.estimatedHitFactor(est, 5), 23 / 5, 1e-6); assert.equal(E.estimatedHitFactor(est, null), null);
  plan = P.setExpectation(plan, 'T2', { outcome: 'AA' });
  est = E.estimateStagePoints(stage, plan, route, { hitModel }, 'USPSA', 'minor');
  assert.equal(est.targets.find(t => t.targetId === 'T2').source, 'PLANNED'); near(est.expectedPoints, 25, 1e-9);
  plan = P.setExpectation(plan, 'T2', { outcome: null });
  assert.equal(plan.expectations, undefined, 'clearing the last setting removes the entry');
  // No data: no estimate, and the total says so instead of inventing one.
  est = E.estimateStagePoints(stage, plan, route, null, 'USPSA', 'minor');
  assert.equal(est.complete, false); assert.equal(est.estimatedTargets, 1, 'only steel (5 if it falls)'); assert.equal(E.estimatedHitFactor(est, 5), null);
  const unrouted = E.estimateStagePoints(stage, plan, { ...route, positions: [] }, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(unrouted.expectedPoints, null); assert.match(unrouted.notes.join(' '), /Not engaged in the route/);
  assert.ok(evaluateRoute(stage, plan, route, createLocalProfile().performance).timing, 'the route has a time to divide by');
});

test('a partly covered target uses partial-target numbers, or full-target ones with a warning', () => {
  const { route } = scene(); let { stage } = scene();
  stage = TL.setHardCover(stage, 'T1', () => [TL.hardCoverFromPreset('headOnly', 18.12, 29.93, 'c')]);
  const plan = { ...P.createPlan(), route, engagements: {} };
  let t1 = E.estimateStagePoints(stage, plan, route, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(t1.kind, 'partial'); assert.ok(t1.openFraction < 0.5);
  assert.match(t1.notes.join(' '), /full-target numbers used, likely optimistic/);
  t1 = E.estimateStagePoints(stage, plan, route, { hitModel: { ...hitModel, partial: [{ yards: 7, runs: 2, count: 4, a: 0.5, c: 0.25, d: 0, miss: 0.25 }] } }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  near(t1.expectedPoints, 2 * (2.5 + 0.75 - 2.5)); assert.equal(t1.notes.some(n => /optimistic/.test(n)), false);
});

test('planned hits are saved with the stage, cleaned on load and dropped with their target', async () => {
  assert.deepEqual(E.validExpectations({ T1: { outcome: 'AC', missRisk: 0.1 }, T2: { outcome: 'ZZ' }, T3: { missRisk: 2 }, T4: {} }), { T1: { outcome: 'AC', missRisk: 0.1 }, T4: {} });
  const { stage, route } = scene();
  const plan = P.setExpectation(P.setExpectation({ ...P.createPlan(), route }, 'T1', { outcome: 'AC', missRisk: 0.05 }), 'S1', { missRisk: 0.1 });
  const reconciled = P.reconcilePlan(plan, { ...stage, objects: stage.objects.filter(o => o.id !== 'S1') });
  assert.deepEqual(Object.keys(reconciled.expectations), ['T1']);
  const db = new DatabaseSync(':memory:');
  const repo = new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null }, randomUUID);
  await repo.initialize();
  const matchId = await repo.createMatch('M', 'USPSA');
  const id = await repo.createStage('S', stage, plan, matchId);
  assert.deepEqual((await repo.loadStage(id)).plan.expectations, { T1: { outcome: 'AC', missRisk: 0.05 }, S1: { missRisk: 0.1 } });
  await assert.rejects(repo.saveStage(id, 'S', stage, { ...plan, expectations: { T1: { outcome: 'XX' } } }), /planned hits/);
  db.prepare('UPDATE stages SET payload = ? WHERE id = ?').run(JSON.stringify({ version: 1, document: stage, plan: { ...plan, expectations: { T1: { outcome: 'XX' }, T2: { outcome: 'CC' } } } }), id);
  assert.deepEqual((await repo.loadStage(id)).plan.expectations, { T2: { outcome: 'CC' } });
});

test('a planned extra shot: the best two of three hits score, which raises the odds and the points', () => {
  const r = { a: 0.6, c: 0.3, d: 0.05, miss: 0.05 }, v = E.zoneValues('USPSA', 'minor');
  const two = E.bestHits(r, 2, v, 2), three = E.bestHits(r, 2, v, 3);
  near(two.points, E.expectedPaperPoints(r, 2, v), 1e-9, 'two shots: same as the simple sum');
  near(two.odds.AA, 0.36); near(two.odds.AC, 0.36); near(two.odds.CC, 0.09);
  near(three.odds.AA, 1 - (0.4 ** 3) - 3 * 0.6 * 0.4 ** 2, 1e-9, 'at least two A in three shots');
  assert.ok(three.points > two.points);
  const { stage, route } = scene();
  const plan = { ...P.createPlan(), route, engagements: { T2: 3 } };
  const t2 = E.estimateStagePoints(stage, plan, route, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T2');
  assert.ok(t2.expectedPoints > 8 && t2.odds.AA > 0.25); assert.match(t2.notes.join(' '), /3 shots planned: the best two hits score/);
});

test('a planned pair stays that pair: AC with a 5% miss risk is AC 90% of the time, never AA or CC', () => {
  const v = E.zoneValues('USPSA', 'minor'), pair = E.plannedPair('AC', 0.05, v);
  near(pair.odds.AC, 0.9025); assert.equal(pair.odds.AA, 0); assert.equal(pair.odds.CC, 0);
  near(pair.points, 0.95 * 8 - 20 * 0.05);
  const { stage, route } = scene();
  const plan = P.setExpectation({ ...P.createPlan(), route, engagements: { T2: 4 } }, 'T2', { outcome: 'AC', missRisk: 0.05 });
  const t2 = E.estimateStagePoints(stage, plan, route, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T2');
  near(t2.expectedPoints, 6.6); near(t2.odds.AC, 0.9025); assert.equal(t2.odds.AA, 0);
});

// Regression tests for the independent review of batch 18.
test('review: fewer planned rounds than required hits lose the missing hit; PCSL extra rounds earn nothing', () => {
  const { stage, route } = scene(), est = engagements => E.estimateStagePoints(stage, { ...P.createPlan(), route, engagements }, route, { hitModel }, 'USPSA', 'minor');
  const one = est({ T1: 1 }).targets.find(t => t.targetId === 'T1'), two = est({ T1: 2 }).targets.find(t => t.targetId === 'T1');
  near(one.expectedPoints, 5 - 10); near(two.expectedPoints, 10); assert.match(one.notes.join(' '), /1 round planned for 2 required hits/);
  const plannedOne = E.estimateStagePoints(stage, P.setExpectation({ ...P.createPlan(), route, engagements: { T1: 1 } }, 'T1', { outcome: 'AA' }), route, { hitModel }, 'USPSA', 'minor');
  near(plannedOne.targets.find(t => t.targetId === 'T1').expectedPoints, -5);
  near(E.plannedPair('AC', 0.1, E.zoneValues('USPSA', 'minor'), 1).points, 0.9 * 5 - 1 - 10);
  const pcsl = n => E.estimateStagePoints(stage, { ...P.createPlan(), route, engagements: { T2: n } }, route, { hitModel }, 'PCSL', 'minor').targets.find(t => t.targetId === 'T2');
  near(pcsl(4).expectedPoints, pcsl(2).expectedPoints); assert.match(pcsl(4).notes.join(' '), /PCSL rules don't say which extra hits count/);
});

test('review: a planned pair takes your measured miss rate unless you set one; an all-miss distance gives no estimate', () => {
  const { stage, route } = scene();
  const model = { paper: [{ yards: 7, runs: 2, count: 4, a: 0.5, c: 0.25, d: 0, miss: 0.25 }] };
  let plan = P.setExpectation({ ...P.createPlan(), route, engagements: { T1: 2 } }, 'T1', { outcome: 'CC' });
  let t1 = E.estimateStagePoints(stage, plan, route, { hitModel: model }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  near(t1.expectedPoints, 2 * (0.75 * 3) - 20 * 0.25); near(t1.odds.CC, 0.5625); assert.match(t1.notes.join(' '), /Miss risk from your numbers: 25%/);
  t1 = E.estimateStagePoints(stage, plan, route, null, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  near(t1.expectedPoints, 6); assert.match(t1.notes.join(' '), /Miss risk 0%: no runs at this distance/);
  plan = P.setExpectation({ ...P.createPlan(), route, engagements: { T1: 2 } }, 'T1', { missRisk: 0.05 });
  t1 = E.estimateStagePoints(stage, plan, route, { hitModel: { paper: [{ yards: 7, runs: 1, count: 2, a: 0, c: 0, d: 0, miss: 1 }] } }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(t1.expectedPoints, null); assert.match(t1.notes.join(' '), /landed no hits/);
});

test('review: total-only runs give hit measurements; PCSL T over several targets and no-shoots are handled', () => {
  const live = { id: 's', context: 'LIVE_FIRE' };
  const totalOnly = L.libraryObservations(live, run('ladder', [], { totalTime: 2.1, choices: { distance: '10' }, zones: { A: 2 } }));
  assert.deepEqual(totalOnly.map(o => o.factor), ['hitZones']);
  const steelTotal = L.libraryObservations(live, run('steel', [], { totalTime: 4.4, zones: { M: 1 } }));
  assert.deepEqual(steelTotal.map(o => [o.factor, o.hits.miss]), [['hitZones', 1]]);
  assert.equal(L.libraryObservations(live, run('wide', [1.4, 1.62, 2.22, 2.44], { family: 'PCSL', zones: { T: 1, A: 1, C: 2 } })).some(o => o.factor === 'hitZones'), false);
  const hostageRun = L.libraryObservations(live, run('partial', [1.6, 2.0], { choices: { face: 'head', distance: '7' }, zones: { A: 1, NS: 1 } }));
  assert.deepEqual(hostageRun.find(o => o.factor === 'hitZones').hits, { a: 1, c: 0, d: 0, miss: 1, noShoot: 1 });
  const model = O.withPerformanceObservations(createLocalProfile(), hostageRun, 'LIVE_FIRE').performance.hitModel;
  near(model.partial[0].noShoot, 0.5);
  let { stage } = scene(); const { route } = scene();
  const TL = require('../src/stage/targetLayers.ts');
  const r = TL.addLayer(stage, 'T1', 'noShoot', 'NS1'); assert.ok(!r.error, r.error); stage = r.stage;
  const t1 = E.estimateStagePoints(stage, { ...P.createPlan(), route, engagements: { T1: 2 } }, route, { hitModel: model }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(t1.kind, 'partial', 'the default hostage covers about a third of the face');
  near(t1.noShootPenalty, 10 * 0.5 * 2); near(t1.expectedPoints, 5 - 10 - 10);
  const paperOnly = E.estimateStagePoints(stage, { ...P.createPlan(), route, engagements: { T1: 2 } }, route, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(paperOnly.noShootPenalty, 0); assert.match(paperOnly.notes.join(' '), /No-shoot hits are not estimated/);
});

test('review: a cut face is reported as cut, not as 100% open', () => {
  let { stage } = scene(); const { route } = scene();
  stage = { ...stage, objects: stage.objects.map(o => o.id === 'T1' ? { ...o, faceCut: { ...o.faceCut, preset: 'upper' } } : o) };
  const t1 = E.estimateStagePoints(stage, { ...P.createPlan(), route, engagements: { T1: 2 } }, route, { hitModel }, 'USPSA', 'minor').targets.find(t => t.targetId === 'T1');
  assert.equal(t1.kind, 'partial'); assert.equal(t1.cutFace, true);
});

test('review: runs saved by an older version get their hit measurements when the app starts', async () => {
  const db = new DatabaseSync(':memory:');
  const adapter = { execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null };
  await new Repository(adapter, randomUUID).initialize();
  const record = { id: 'old', userId: 'local', drillId: null, drillName: 'Old', occurredAt: at(0), startingType: 'competitionHolster', totalTime: null, notes: '', segments: [],
    context: 'LIVE_FIRE', libraryRuns: [run('ladder', [1.6, 1.9], { choices: { distance: '15' }, zones: { A: 1, C: 1 } })] };
  db.prepare('INSERT INTO training (id, userId, occurredAt, payload) VALUES (?, ?, ?, ?)').run('old', 'local', at(0), JSON.stringify(record));
  db.prepare('INSERT INTO training (id, userId, occurredAt, payload) VALUES (?, ?, ?, ?)').run('broken', 'local', at(0), '{not json');
  const repo = new Repository(adapter, randomUUID); await repo.initialize();
  const profile = await repo.loadProfile();
  assert.deepEqual(profile.performance.hitModel.paper.map(p => [p.yards, p.a, p.c]), [[15, 0.5, 0.5]]);
  assert.ok(profile.performanceObservations.some(o => o.factor === 'averageSplitTime' && o.trainingSessionId === 'old'));
});
