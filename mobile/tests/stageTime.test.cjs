// Stage time from your numbers (roadmap C4): transitions by swing, partial-target splits, steel per plate and
// makeups, splits by distance, on top of the route evaluator's moves, draw and reloads.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const G = require('../src/profile/engagementModel.ts');
const T = require('../src/planning/stageTime.ts');
const L = require('../src/training/drillLibrary.ts');
const O = require('../src/training/observations.ts');
const P = require('../src/planning/model.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const near = (a, b, e = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b}`);
const at = n => new Date(Date.UTC(2026, 9, 1 + n, 12)).toISOString();
let serial = 0;
const run = (drillId, shotTimes, patch = {}) => ({ id: 'r' + ++serial, drillId, recordedAt: at(serial), shotTimes, totalTime: shotTimes.at(-1) ?? null, family: 'USPSA', notes: '',
  ...patch, choices: L.choicesFor(L.libraryDrill(drillId), patch.choices) });

test('swing angles and the transition fit: time = base + per-degree × swing; one swing size gives the average', () => {
  near(G.swingDegrees(36, 252), 2 * Math.atan(18 / 252) * 180 / Math.PI);
  near(G.swingBetween({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }), 90);
  near(G.swingBetween({ x: 0, y: 0 }, { x: -100, y: 1 }, { x: -100, y: -1 }), 2 * Math.atan(1 / 100) * 180 / Math.PI, 1e-9, 'across the ±180° seam');
  const fit = G.fitTransitions([{ degrees: 8, seconds: 0.3 }, { degrees: 8, seconds: 0.32 }, { degrees: 40, seconds: 0.62 }]);
  assert.equal(fit.method, 'FIT'); near(fit.secondsPerDegree, (0.62 - 0.31) / 32, 1e-9); near(fit.baseSeconds + fit.secondsPerDegree * 8, 0.31, 1e-9);
  assert.equal(G.transitionAt(fit, 60).outside, 'WIDER'); assert.equal(G.transitionAt(fit, 20).outside, null); assert.equal(G.transitionAt(fit, 0).outside, 'NARROWER');
  const one = G.fitTransitions([{ degrees: 8, seconds: 0.3 }, { degrees: 9, seconds: 0.34 }]);
  assert.equal(one.method, 'AVERAGE'); assert.equal(one.reason, 'ONE_SIZE'); near(one.baseSeconds, 0.32); near(G.transitionAt(one, 50).seconds, 0.32);
  assert.equal(G.transitionAt(one, 50).outside, 'WIDER', 'an average from tight arrays is flagged on a wide swing');
  assert.equal(G.fitTransitions([{ degrees: 8, seconds: 0.5 }, { degrees: 40, seconds: 0.3 }]).reason, 'NO_TREND');
  assert.equal(G.fitTransitions([]), undefined);
  const curve = G.buildCurve([{ yards: 7, seconds: 0.3 }, { yards: 7.2, seconds: 0.34 }, { yards: 15, seconds: 0.5 }]);
  assert.deepEqual(curve.map(p => [p.yards, p.runs]), [[7, 2], [15, 1]]);
  near(G.curveAt(curve, 11).seconds, 0.32 + (0.5 - 0.32) * 0.5); assert.equal(G.curveAt(curve, 25), null, 'no extrapolation');
  assert.equal(G.validEngagementModel({ transitions: { ...fit, secondsPerDegree: -1 }, steelPlates: curve }).transitions, undefined);
});

test('the profile rebuild derives the transition fit, partial-target splits and steel per plate from library runs', () => {
  const rec = { id: 's', context: 'LIVE_FIRE' };
  const obs = [
    run('blake', [1.4, 1.62, 1.92, 2.14, 2.44, 2.66]), run('wide', [1.4, 1.62, 2.22, 2.44], { choices: { spread: '5', distance: '7' } }),
    run('partial', [1.6, 2.0], { choices: { face: 'head', distance: '7' } }), run('steel', [1.8, 2.3, 2.8, 3.4, 3.9], { choices: { distance: '15' } }),
    run('onTheMove', [1.5, 1.85, 2.4, 2.75], { choices: { mode: 'toward' } }),
  ].flatMap(r => L.libraryObservations(rec, r));
  const m = O.withPerformanceObservations(createLocalProfile(), obs, 'LIVE_FIRE').performance.engagementModel;
  assert.equal(m.transitions.method, 'FIT'); assert.equal(m.transitions.runs, 2, 'moving runs stay out');
  near(m.transitions.minDegrees, G.swingDegrees(36, 252)); near(m.transitions.maxDegrees, G.swingDegrees(180, 252));
  assert.deepEqual(m.partialSplits.map(p => [p.yards, p.runs]), [[7, 1]]); near(m.partialSplits[0].seconds, 0.4);
  assert.deepEqual(m.steelPlates.map(p => [p.yards, p.runs]), [[15, 1]]); near(m.steelPlates[0].seconds, (3.9 - 1.8) / 4);
  assert.equal(O.withPerformanceObservations(createLocalProfile(), [], 'LIVE_FIRE').performance.engagementModel, undefined);
  const overridden = O.setManualOverride(O.withPerformanceObservations(createLocalProfile(), obs, 'LIVE_FIRE'), 'transitionTime', 0.5);
  assert.equal(overridden.performance.engagementModel.transitions, undefined, 'a typed-in transition wins over the fit');
});

function scene() {
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1080, depth: 1080 } }), objects: [createObject('start', 'start', 540, 1000)] };
  // From P1 (540, 1000): T1 7 yd straight ahead, T2 7 yd at about 3 yd to the left; S1 steel 15 yd ahead.
  for (const [preset, id, x, y] of [['uspsa-metric-chl-v1', 'T1', 540, 748], ['uspsa-metric-chl-v1', 'T2', 432, 748], ['uspsa-round-12-v1', 'S1', 540, 460]]) {
    const r = placeTarget(stage, preset, id, { space: 'stage', x, y, z: 0 }); assert.ok(!r.error, r.error); stage = r.stage;
  }
  const route = { ...createRoute('r'), positions: [{ id: 'P1', label: 'P1', position: { space: 'stage', x: 540, y: 1000, z: 0 }, visibleTargetIds: ['T1', 'T2', 'S1'], engagedTargetIds: ['T1', 'T2', 'S1'] }] };
  const plan = { ...P.createPlan(), route, loadout: { chamberLoaded: false, startingMagazineId: 'm', magazines: [{ id: 'm', capacity: 20, startingRounds: 20 }] }, engagements: { T1: 2, T2: 2, S1: 1 } };
  return { stage, route, plan };
}

test('without any models the estimate equals the route evaluator; with them each part uses your numbers', () => {
  const { stage, route, plan } = scene();
  const plain = createLocalProfile().performance;
  const base = evaluateRoute(stage, plan, route, plain), est = T.estimateStageTime(stage, plan, route, plain);
  assert.ok(est.available); near(est.total, base.timing.total, 1e-9);
  assert.ok(est.positions[0].targets.every(t => t.splitSource === 'SINGLE'));
  assert.ok(est.sources.some(s => /3 targets use the generic split \(0\.25 s, not measured\) \(log distance-ladder runs/.test(s)), est.sources.join('\n'));
  assert.ok(est.sources.some(s => /average speed only/.test(s)));
  const tuned = { ...plain,
    shootingObservations: [{ difficultyModel: 'DISTANCE_ONLY', difficulty: 5, splitTime: 0.2, sampleCount: 3 }, { difficultyModel: 'DISTANCE_ONLY', difficulty: 15, splitTime: 0.4, sampleCount: 3 }],
    engagementModel: { transitions: { baseSeconds: 0.2, secondsPerDegree: 0.01, runs: 4, minDegrees: 8, maxDegrees: 40, method: 'FIT' }, steelPlates: [{ yards: 15, seconds: 0.45, runs: 2 }] },
    hitModel: { steel: [{ yards: 15, runs: 2, count: 11, a: 10 / 11, c: 0, d: 0, miss: 1 / 11 }] } };
  const e = T.estimateStageTime(stage, plan, route, tuned);
  const [t1, t2, s1] = e.positions[0].targets;
  near(t1.yards, 7, 0.05); assert.equal(t1.splitSource, 'CURVE'); near(t1.secondsPerSplit, 0.2 + 0.2 * (t1.yards - 5) / 10, 1e-9); assert.equal(t1.transition, null);
  assert.equal(t2.transition.source, 'SWING_FIT'); near(t2.transition.degrees, G.swingBetween({ x: 540, y: 1000 }, { x: 540, y: 748 }, { x: 432, y: 748 }), 1);
  near(t2.transition.seconds, 0.2 + 0.01 * t2.transition.degrees, 1e-9);
  assert.equal(s1.transition.source, 'STEEL_PER_PLATE'); near(s1.transition.seconds, 0.45); near(s1.makeups, 0.1, 1e-9); near(s1.makeupSeconds, 0.1 * s1.secondsPerSplit, 1e-9);
  near(e.total, e.movement + e.draw + e.splits + e.transitions + e.makeups + e.reloads, 1e-9);
  assert.ok(e.sources.some(s => /your split curve for 3 targets/.test(s)) && e.sources.some(s => /swing fit for 1/.test(s)) && e.sources.some(s => /time per plate/.test(s)));
  const planned = T.estimateStageTime(stage, P.setExpectation(plan, 'S1', { missRisk: 0 }), route, tuned);
  assert.equal(planned.positions[0].targets[2].makeups, 0, 'a planned 0% miss risk on the plate');
});

test('partial targets use your partial-target splits; moving engagements and missing profiles are not timed', () => {
  let { stage, route, plan } = scene();
  const TL = require('../src/stage/targetLayers.ts');
  stage = TL.setHardCover(stage, 'T1', () => [TL.hardCoverFromPreset('headOnly', 18.12, 29.93, 'c')]);
  const profile = { ...createLocalProfile().performance, engagementModel: { partialSplits: [{ yards: 7, seconds: 0.42, runs: 2 }] } };
  const t1 = T.estimateStageTime(stage, plan, route, profile).positions[0].targets[0];
  assert.equal(t1.kind, 'partial'); assert.equal(t1.splitSource, 'PARTIAL_CURVE'); near(t1.secondsPerSplit, 0.42);
  assert.equal(T.estimateStageTime(stage, plan, route, null).available, false);
  const moving = { ...route, engagementRules: require('../src/planning/engagements.ts').defaultEngagementRules(stage), positions: [{ ...route.positions[0], movingTargetIds: ['T1'] }] };
  const est = T.estimateStageTime(stage, { ...plan, route: moving }, moving, profile);
  assert.equal(est.available, false); assert.match(est.reason, /on the move/);
});

test('a target within half a yard of your closest logged distance uses that distance', () => {
  const { stage, route, plan } = scene();
  const profile = { ...createLocalProfile().performance, shootingObservations: [{ difficultyModel: 'DISTANCE_ONLY', difficulty: 7.3, splitTime: 0.22, sampleCount: 2 }, { difficultyModel: 'DISTANCE_ONLY', difficulty: 15, splitTime: 0.4, sampleCount: 2 }] };
  const [t1] = T.estimateStageTime(stage, plan, route, profile).positions[0].targets;
  assert.equal(t1.splitSource, 'CURVE'); near(t1.secondsPerSplit, 0.22);
  const far = { ...profile, shootingObservations: [{ difficultyModel: 'DISTANCE_ONLY', difficulty: 9, splitTime: 0.22, sampleCount: 2 }, { difficultyModel: 'DISTANCE_ONLY', difficulty: 15, splitTime: 0.4, sampleCount: 2 }] };
  const e = T.estimateStageTime(stage, plan, route, far);
  assert.equal(e.positions[0].targets[0].splitSource, 'SINGLE'); assert.ok(e.sources.some(s => /outside your logged split distances use the generic split/.test(s)), e.sources.join('\n'));
});

test('reloads are planned around magazine capacity, on the leg that hides the most reload time', () => {
  const { planReloads } = require('../src/planning/reloadPlan.ts');
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1440, depth: 1080 } }), objects: [createObject('start', 'start', 100, 1000)] };
  const ids = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  ids.forEach((id, i) => { const r = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x: 100 + i * 220, y: 700, z: 0 }); assert.ok(!r.error, r.error); stage = r.stage; });
  const pos = (id, x, targets) => ({ id, label: id, position: { space: 'stage', x, y: 1000, z: 0 }, visibleTargetIds: targets, engagedTargetIds: targets });
  // P1 close to the start, a long run to P2, a short step to P3.
  const route = { ...createRoute('r'), positions: [pos('P1', 160, ['A1', 'A2']), pos('P2', 900, ['B1', 'B2']), pos('P3', 1000, ['C1', 'C2'])] };
  const plan = { ...P.createPlan(), route, engagements: Object.fromEntries(ids.map(id => [id, 4])),
    loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }, { id: 'm3', capacity: 10, startingRounds: 8 }] } };
  const profile = createLocalProfile().performance;
  assert.ok(evaluateRoute(stage, plan, route, profile).ammo.some(a => !a.sufficient), '24 rounds, 10 in the gun');
  const planned = planReloads(stage, plan, route, profile);
  // P1 8 of 10; P2 needs 8 (2 left), P3 8 more: two reloads, into P2 and P3.
  assert.equal(planned.complete, true); assert.equal(planned.added, 2);
  assert.deepEqual(planned.route.reloads.map(r => [r.positionId, r.magazineId]), [['P2', 'm2'], ['P3', 'm3']]);
  assert.match(planned.note, /^2 reloads added; \d\.\d\d s of reload time is not hidden by a move\.$/);
  assert.ok(evaluateRoute(stage, plan, planned.route, profile).ammo.every(a => a.sufficient));
  const none = planReloads(stage, { ...plan, loadout: { ...plan.loadout, magazines: [plan.loadout.magazines[0]] } }, route, profile);
  assert.equal(none.complete, false); assert.match(none.note, /No spare loaded magazine/); assert.deepEqual(none.route, route, 'nothing applied');
  assert.match(planReloads(stage, { ...plan, loadout: { chamberLoaded: false, startingMagazineId: null, magazines: [] } }, route, profile).note, /Add magazines in Loadout/);
  const tooMany = planReloads(stage, { ...plan, engagements: { ...plan.engagements, B1: 12 } }, route, profile);
  assert.equal(tooMany.complete, false); assert.match(tooMany.note, /P2 needs 16 rounds; your fullest magazine holds 10 \(\+1 chambered\)/);
  const enough = planReloads(stage, { ...plan, engagements: Object.fromEntries(ids.map(id => [id, 1])) }, route, profile);
  assert.equal(enough.added, 0); assert.match(enough.note, /No reload needed/);
});

test('given a choice, the reload goes on the longest leg (most reload time hidden by the move)', () => {
  const { planReloads } = require('../src/planning/reloadPlan.ts');
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1440, depth: 1080 } }), objects: [createObject('start', 'start', 100, 1000)] };
  ['A', 'B', 'C'].forEach((id, i) => { stage = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x: 900 + i * 150, y: 700, z: 0 }).stage; });
  const pos = (id, x, t) => ({ id, label: id, position: { space: 'stage', x, y: 1000, z: 0 }, visibleTargetIds: [t], engagedTargetIds: [t] });
  const route = { ...createRoute('r'), positions: [pos('P1', 900, 'A'), pos('P2', 1000, 'B'), pos('P3', 1100, 'C')] };
  const plan = { ...P.createPlan(), route, engagements: { A: 2, B: 4, C: 8 },
    loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 20, startingRounds: 20 }] } };
  const planned = planReloads(stage, plan, route, createLocalProfile().performance);
  assert.deepEqual(planned.route.reloads.map(r => r.positionId), ['P1'], 'the long run from the start box');
});

// Regression tests for the independent review of batch 19.
function line(rounds, xs, mags, extra = {}) {
  let stage = { ...createDefaultStage('USPSA', { size: { width: 2000, depth: 1080 } }), objects: [createObject('start', 'start', 100, 1000)] };
  const ids = rounds.map((_, i) => 'T' + (i + 1));
  ids.forEach((id, i) => { stage = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x: xs[i], y: 700, z: 0 }).stage; });
  const route = { ...createRoute('r'), positions: ids.map((id, i) => ({ id: 'P' + (i + 1), label: 'P' + (i + 1), position: { space: 'stage', x: xs[i], y: 1000, z: 0 },
    visibleTargetIds: [id], engagedTargetIds: [id], ...(extra[i] ?? {}) })) };
  const plan = { ...P.createPlan(), route, engagements: Object.fromEntries(ids.map((id, i) => [id, rounds[i]])),
    loadout: { chamberLoaded: false, startingMagazineId: 'm0', magazines: mags.map((n, i) => ({ id: 'm' + i, capacity: n, startingRounds: n })) } };
  return { stage, route, plan };
}

test('review: reload planning searches the whole route, keeps your reloads and applies only complete plans', () => {
  const { planReloads } = require('../src/planning/reloadPlan.ts'), profile = createLocalProfile().performance;
  // A: a reload on the long run into P2 would leave P4 dry; one reload at P3 carries everything.
  let s = line([6, 4, 6, 4], [160, 1200, 1300, 1400], [10, 10]);
  let r = planReloads(s.stage, s.plan, s.route, profile);
  assert.equal(r.complete, true); assert.deepEqual(r.route.reloads.map(x => [x.positionId, x.magazineId]), [['P3', 'm1']]);
  assert.ok(evaluateRoute(s.stage, s.plan, r.route, profile).ammo.every(a => a.sufficient));
  // B: the small spare at P2 and the full one at P3 work; the fullest-first greedy choice did not.
  s = line([8, 5, 9], [160, 1200, 1300], [10, 10, 6]);
  r = planReloads(s.stage, s.plan, s.route, profile);
  assert.equal(r.complete, true); assert.ok(evaluateRoute(s.stage, s.plan, r.route, profile).ammo.every(a => a.sufficient));
  // Your reloads stay, with their mode, and only the missing one is added.
  s = line([6, 4, 6, 4], [160, 1200, 1300, 1400], [10, 4, 10]);
  const mine = { ...s.route, reloads: [{ positionId: 'P2', magazineId: 'm1', mode: 'stationary' }] };
  r = planReloads(s.stage, s.plan, mine, profile);
  assert.equal(r.complete, true); assert.deepEqual(r.route.reloads[0], { positionId: 'P2', magazineId: 'm1', mode: 'stationary' });
  assert.match(r.note, /added to your 1/);
  // A position shot on the move never gets a reload; the note says so when that is what blocks the plan.
  s = line([8, 4], [160, 1200], [10, 10], { 1: { movingTargetIds: ['T2'] } });
  r = planReloads(s.stage, s.plan, s.route, profile);
  assert.equal(r.complete, false); assert.match(r.note, /on the move were not given a reload/); assert.equal(r.route, s.route);
  // A long route with several spares stays quick.
  s = line(Array(16).fill(4), Array.from({ length: 16 }, (_, i) => 160 + i * 110), [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const t0 = Date.now(); r = planReloads(s.stage, s.plan, s.route, profile);
  assert.equal(r.complete, true); assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});

test('review: a target engaged at two positions is timed once; steel per plate snaps to a nearby logged distance; nearest steel miss rate is named', () => {
  const { stage, plan } = scene();
  const p = (id, x, ids) => ({ id, label: id, position: { space: 'stage', x, y: 1000, z: 0 }, visibleTargetIds: ids, engagedTargetIds: ids });
  const twice = { ...createRoute('r'), positions: [p('P1', 540, ['T1', 'T2']), p('P2', 560, ['T2', 'S1'])] };
  const plain = createLocalProfile().performance;
  near(T.estimateStageTime(stage, { ...plan, route: twice }, twice, plain).total, evaluateRoute(stage, { ...plan, route: twice }, twice, plain).timing.total, 1e-9);
  const { route } = scene();
  const profile = { ...plain, engagementModel: { steelPlates: [{ yards: 15.4, seconds: 0.5, runs: 2 }] }, hitModel: { steel: [{ yards: 10, runs: 2, count: 11, a: 10 / 11, c: 0, d: 0, miss: 1 / 11 }] } };
  const e = T.estimateStageTime(stage, plan, route, profile), s1 = e.positions[0].targets[2];
  assert.equal(s1.transition.source, 'STEEL_PER_PLATE'); near(s1.transition.seconds, 0.5);
  assert.ok(e.sources.some(s => /1 uses the miss rate from your nearest logged steel distance/.test(s)), e.sources.join('\n'));
});
