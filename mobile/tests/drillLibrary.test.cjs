// Drill library (C1, C2): shot-time entry, what each interval measured, scoring, profile measurements,
// the movement model and "Your numbers".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const L = require('../src/training/drillLibrary.ts');
const S = require('../src/training/libraryStats.ts');
const M = require('../src/profile/movementModel.ts');
const O = require('../src/training/observations.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { Repository } = require('../src/storage/repository.ts');
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

const at = n => new Date(Date.UTC(2026, 9, 1 + n, 12)).toISOString();
let serial = 0;
function run(drillId, shotTimes, patch = {}) {
  const drill = L.libraryDrill(drillId);
  return { id: 'run' + ++serial, drillId, recordedAt: at(serial), shotTimes, totalTime: shotTimes.length ? shotTimes[shotTimes.length - 1] : null,
    family: 'USPSA', notes: '', ...patch, choices: drill ? L.choicesFor(drill, patch.choices) : patch.choices ?? {} };
}
const record = (libraryRuns, patch = {}) => ({ id: 'session-1', userId: 'local', drillId: null, drillName: 'Library', occurredAt: at(0), startingType: 'competitionHolster',
  totalTime: null, notes: '', segments: [], context: 'LIVE_FIRE', libraryRuns, ...patch });
function open() {
  const db = new DatabaseSync(':memory:');
  return new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => db.prepare(sql).run(...a),
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null }, randomUUID);
}

test('the library has the 13 planned drills, each with valid defaults and one interval per shot', () => {
  assert.equal(L.libraryDrills.length, 13);
  assert.equal(new Set(L.libraryDrills.map(d => d.id)).size, 13);
  for (const d of L.libraryDrills) {
    assert.ok(L.drillGroups.includes(d.group), d.id);
    assert.equal(d.intervals[0], 'start');
    assert.ok(d.setup && d.gives && d.planner, d.id);
    const choices = L.choicesFor(d);
    for (const c of d.choices) assert.ok(c.options.some(o => o.value === choices[c.key]), `${d.id} ${c.key} default`);
    const times = d.intervals.map((_, i) => 1.5 + i * 0.3);
    assert.equal(L.libraryRunProblem(run(d.id, times, { choices })), null, d.id);
  }
  assert.deepEqual(L.libraryDrill('elPresidente').intervals,
    ['start', 'split', 'transition', 'split', 'transition', 'split', 'reload', 'split', 'transition', 'split', 'transition', 'split']);
  assert.equal(L.variantKey(run('wide', [])), 'wide|distance=7|spread=3');
  assert.equal(L.variantLabel(L.libraryDrill('sprint'), { move: '15', direction: 'back' }), 'Sprint · 15 yd · back');
});

test('timer entry: shot times or splits, increasing, the right count for the drill', () => {
  assert.deepEqual(L.parseShotTimes('1.42 1.68, 3.40;3.62', 'times'), { times: [1.42, 1.68, 3.4, 3.62] });
  assert.deepEqual(L.parseShotTimes('1.42 0.26 1.72 0.22', 'splits'), { times: [1.42, 1.68, 3.4, 3.62] });
  assert.match(L.parseShotTimes('1.4 1.2', 'times').problem, /increase/);
  assert.match(L.parseShotTimes('1.4 abc', 'times').problem, /numbers/);
  assert.deepEqual(L.parseShotTimes('  ', 'times'), { times: [] });
  assert.match(L.libraryRunProblem(run('bill', [1.3, 1.55, 1.8])), /6 shots; 3 times/);
  assert.match(L.libraryRunProblem(run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55, 2.8])), /6 shots; 7 times/);
  assert.equal(L.libraryRunProblem(run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.3])), null, 'a makeup shot on steel');
  assert.equal(L.libraryRunProblem(run('bill', [], { totalTime: 3.1 })), null, 'total only');
  assert.match(L.libraryRunProblem(run('bill', [1, 2, 3, 4, 5, 6], { totalTime: 7 })), /last shot/);
  assert.match(L.libraryRunProblem(run('sprint', [1, 2, 3, 4], { choices: { move: '12' } })), /choose run/i);
  assert.match(L.libraryRunProblem({ ...run('bill', []), choices: {} }), /Choose target distance/);
  assert.match(L.libraryRunProblem({ ...run('bill', []), choices: { distance: '7', extra: 'x' } }), /options/);
  assert.match(L.libraryRunProblem(run('nope', [])), /Unknown drill/);
  assert.match(L.libraryRunProblem(run('bill', [], { zones: { A: 5, Q: 1 } })), /hit counts/);
  assert.match(L.libraryRunProblem(run('steel', [1, 2, 3, 4, 5], { zones: { M: 1 } })), /More misses/);
});

test('each interval is labelled from the drill: sprint gives draw, split, move, split', () => {
  const a = L.analyzeLibraryRun(run('sprint', [1.42, 1.68, 3.4, 3.62], { choices: { move: '10', direction: 'forward' } }));
  assert.deepEqual(a.intervals.map(i => i.kind), ['start', 'split', 'move', 'split']);
  near(a.moves[0], 1.72); assert.deepEqual(a.splits, [0.26, 0.22]); near(a.shooting, 2.2);
  const steel = L.analyzeLibraryRun(run('steel', [1.8, 2.3, 2.8, 3.4, 3.9]));
  near(steel.perPlate, (3.9 - 1.8) / 4); assert.equal(steel.steelMisses, 0);
  const makeup = L.analyzeLibraryRun(run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.3]));
  assert.equal(makeup.perPlate, null, 'makeups hide which shot was which'); assert.equal(makeup.steelMisses, 1);
  assert.deepEqual(makeup.intervals.slice(1).map(i => i.kind), ['shot', 'shot', 'shot', 'shot', 'shot']);
});

test('hits by zone are scored like the drill logger: USPSA minor and major, misses, procedurals, hit factor', () => {
  const bill = run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 4, C: 1, M: 1 } });
  let s = L.scoreLibraryRun(bill);
  assert.equal(s.points, 4 * 5 + 3 - 10, 'one required hit missing costs 10'); assert.equal(s.maxPoints, 30); near(s.hitFactor, 13 / 2.55);
  s = L.scoreLibraryRun({ ...bill, zones: { A: 5, C: 1 } }, 'major'); assert.equal(s.points, 29); near(s.percent, 29 / 30);
  s = L.scoreLibraryRun({ ...bill, zones: { A: 6 }, procedurals: 1, powerFactor: 'minor' }, 'major'); assert.equal(s.points, 20);
  assert.equal(L.scoreLibraryRun({ ...bill, zones: undefined }), null, 'dry fire: no hits');
  assert.equal(L.scoreLibraryRun(run('steel', [1, 2, 3, 4, 5], { zones: { M: 0 } })), null);
  const pcsl = L.scoreLibraryRun(run('ladder', [1.6, 1.95], { family: 'PCSL', zones: { T: 1 } }));
  assert.equal(pcsl.points, 10, 'PCSL: a T counts as two A hits');
});

test('a run becomes profile measurements: one per factor, with its conditions', () => {
  const rec = { id: 's', context: 'LIVE_FIRE' };
  const bill = L.libraryObservations(rec, run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55]));
  assert.deepEqual(bill.map(o => o.factor), ['drawTime', 'averageSplitTime']);
  near(bill[0].value, 1.3); assert.equal(bill[0].startingType, 'competitionHolster');
  near(bill[1].value, 0.25); assert.equal(bill[1].difficulty, 7); assert.equal(bill[1].distanceInches, 252);
  assert.ok(bill.every(o => O.isPerformanceObservation(o) && o.source === 'STRUCTURED_TRAINING' && o.trainingSessionId === 's' && o.id.startsWith('lib:s:')));
  const sprint = L.libraryObservations(rec, run('sprint', [1.42, 1.68, 3.4, 3.62], { choices: { move: '10', direction: 'back' } }));
  const move = sprint.find(o => o.factor === 'movementSpeed');
  assert.equal(move.movement, 'back'); assert.equal(move.distanceInches, 360); near(move.durationSeconds, 1.72); near(move.value, 360 / 1.72);
  assert.ok(!sprint.some(o => o.factor === 'drawTime'), 'only the draw drill and Bill Drill measure the draw');
  const wide = L.libraryObservations(rec, run('wide', [1.5, 1.75, 2.35, 2.6], { choices: { spread: '5', distance: '10' } }));
  const t = wide.find(o => o.factor === 'transitionTime'); near(t.value, 0.6); assert.equal(t.spreadInches, 180); assert.equal(t.distanceInches, 360);
  const stepping = L.libraryObservations(rec, run('reload', [1.4, 3.1], { choices: { mode: 'stepping' } }));
  assert.equal(stepping.find(o => o.factor === 'reloadTime').moving, true);
  const moving = L.libraryObservations(rec, run('onTheMove', [1.5, 1.85, 2.4, 2.75], { choices: { mode: 'across' } }));
  assert.ok(moving.every(o => o.moving === true));
  assert.ok(L.libraryObservations(rec, run('partial', [1.6, 2.0], { choices: { face: 'head' } })).every(o => o.targetKind === 'partial'));
  assert.ok(L.libraryObservations(rec, run('port', [1.6, 2.0, 2.7, 3.0], { choices: { position: 'lean' } })).every(o => o.position === 'lean'));
  const steel = L.libraryObservations(rec, run('steel', [1.8, 2.3, 2.8, 3.4, 3.9]));
  assert.deepEqual(steel.map(o => [o.factor, o.targetKind]), [['hitZones', 'steel'], ['transitionTime', 'steel']]);
  assert.deepEqual(L.libraryObservations(rec, run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.3])).map(o => [o.factor, o.hits]), [['hitZones', { a: 5, c: 0, d: 0, miss: 1 }]],
    'a run with makeups gives no per-plate time, only its hits and misses');
  assert.deepEqual(L.libraryObservations(rec, run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { counts: false })), []);
  assert.deepEqual(L.libraryObservations(rec, run('bill', [], { totalTime: 3 })), [], 'a total alone measures nothing');
  const surrender = L.libraryObservations(rec, run('draw', [1.9], { choices: { start: 'surrender' } }));
  assert.equal(surrender[0].startingType, 'surrender');
});

test('special conditions stay out of the general profile numbers', () => {
  const base = createLocalProfile();
  const obs = (id, factor, value, extra = {}) => ({ id, factor, value, context: 'LIVE_FIRE', measuredAt: at(1), source: 'STRUCTURED_TRAINING', ...extra });
  const profile = O.withPerformanceObservations(base, [
    obs('a', 'reloadTime', 1.6), obs('b', 'reloadTime', 3.0, { moving: true }),
    obs('c', 'drawTime', 1.2, { startingType: 'competitionHolster' }), obs('d', 'drawTime', 1.9, { startingType: 'surrender' }),
    obs('e', 'averageSplitTime', 0.22, { difficultyModel: 'DISTANCE_ONLY', difficulty: 7 }),
    obs('f', 'averageSplitTime', 0.5, { difficultyModel: 'DISTANCE_ONLY', difficulty: 7, targetKind: 'partial' }),
    obs('g', 'averageSplitTime', 0.4, { difficultyModel: 'DISTANCE_ONLY', difficulty: 7, moving: true }),
    obs('h', 'transitionTime', 0.3), obs('i', 'transitionTime', 0.6, { targetKind: 'steel' }), obs('j', 'transitionTime', 0.8, { position: 'port' }),
  ], 'LIVE_FIRE');
  assert.equal(profile.performance.reloadTime, 1.6); assert.equal(profile.performance.drawTime, 1.2);
  assert.equal(profile.performance.averageSplitTime, 0.22); assert.equal(profile.performance.transitionTime, 0.3);
  assert.deepEqual(profile.performance.shootingObservations.map(p => [p.difficulty, p.splitTime, p.sampleCount]), [[7, 0.22, 1]]);
  assert.equal(profile.performanceObservations.length, 10, 'all kept in history');
  assert.equal(O.isPerformanceObservation(obs('x', 'reloadTime', 1, { movement: 'back' })), false, 'direction is only for moves');
  assert.equal(O.isPerformanceObservation(obs('x', 'drawTime', 1, { startingType: 'cartwheel' })), false);
});

test('movement model: time = overhead + distance / speed, per direction, recovered from your runs', () => {
  const sample = (direction, yards, overhead, speed) => ({ direction, distanceInches: yards * 36, durationSeconds: overhead + yards * 36 / speed });
  const model = M.fitMovement([sample('lateral', 5, 0.6, 240), sample('lateral', 10, 0.6, 240), sample('lateral', 15, 0.6, 240), sample('back', 5, 0.9, 150)]);
  near(model.lateral.overheadSeconds, 0.6); near(model.lateral.inchesPerSecond, 240); assert.equal(model.lateral.method, 'FIT');
  assert.equal(model.lateral.sampleCount, 3); assert.equal(model.lateral.minInches, 180); assert.equal(model.lateral.maxInches, 540);
  // One distance backward: the pooled overhead is shared, the speed comes from the backward run.
  assert.equal(model.back.method, 'SHARED_OVERHEAD'); near(model.back.overheadSeconds, model.all.overheadSeconds);
  assert.ok(model.all.method === 'FIT' && !model.forward);
  const one = M.fitMovement([sample('forward', 10, 0.5, 200)]);
  assert.equal(one.forward.method, 'AVERAGE_SPEED'); assert.equal(one.forward.overheadSeconds, 0);
  // Faster than a line through zero at short range is noise: the overhead is clamped at zero.
  const noisy = M.fitMovement([{ direction: 'forward', distanceInches: 36, durationSeconds: 0.1 }, { direction: 'forward', distanceInches: 360, durationSeconds: 2 }]);
  assert.equal(noisy.forward.overheadSeconds, 0);
  assert.deepEqual(M.fitMovement([{ distanceInches: 100, durationSeconds: 0.01 }]), {}, 'impossible speeds are dropped');
  // Prediction: below the shortest run it scales to zero; beyond the longest it is flagged.
  near(M.predictMove(model, 'lateral', 360).seconds, 0.6 + 360 / 240);
  near(M.predictMove(model, 'lateral', 90).seconds, (0.6 + 180 / 240) / 2);
  assert.equal(M.predictMove(model, 'lateral', 0).seconds, 0);
  assert.equal(M.predictMove(model, 'lateral', 900).beyondData, true);
  assert.equal(M.predictMove(model, 'forward', 360).direction, 'all', 'no forward runs: the pooled fit');
  assert.equal(M.predictMove({}, 'forward', 360), null);
  // Directions relative to downrange (270 = up the screen).
  assert.equal(M.moveDirection({ x: 0, y: 100 }, { x: 0, y: 0 }, 270), 'forward');
  assert.equal(M.moveDirection({ x: 0, y: 0 }, { x: 0, y: 100 }, 270), 'back');
  assert.equal(M.moveDirection({ x: 0, y: 0 }, { x: 100, y: -20 }, 270), 'lateral');
  assert.equal(M.moveDirection({ x: 0, y: 0 }, { x: 100, y: 0 }, 0), 'forward');
  assert.equal(M.moveDirection({ x: 0, y: 0 }, { x: 0, y: 0 }, 0), null);
  assert.equal(M.validMovementModel({ lateral: { ...model.lateral, inchesPerSecond: -1 }, all: model.all }).lateral, undefined);
});

test('the profile carries the fitted model and route timing uses it leg by leg', () => {
  const obs = (id, direction, yards, seconds) => ({ id, factor: 'movementSpeed', value: yards * 36 / seconds, distanceInches: yards * 36, durationSeconds: seconds,
    movement: direction, context: 'LIVE_FIRE', measuredAt: at(1), source: 'STRUCTURED_TRAINING' });
  const profile = O.withPerformanceObservations(createLocalProfile(), [obs('a', 'lateral', 5, 0.6 + 180 / 240), obs('b', 'lateral', 10, 0.6 + 360 / 240)], 'LIVE_FIRE');
  near(profile.performance.movementModel.lateral.overheadSeconds, 0.6);
  const cleared = O.withPerformanceObservations(profile, [], 'LIVE_FIRE');
  assert.equal('movementModel' in cleared.performance, false, 'no runs, no stale model');
  const manual = O.setManualOverride(profile, 'movementSpeed', 150);
  assert.equal(manual.performance.movementModel, undefined, 'a typed-in speed wins over the fit');

  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
  const stage = createDefaultStage(undefined, { size: { width: 1200, depth: 600 } });
  const start = stage.objects.find(o => o.type === 'start');
  const p = (id, x, y) => ({ id, label: id, position: { space: 'stage', x, y, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] });
  const route = { ...createRoute('r'), positions: [p('P1', start.position.x + 360, start.position.y)] };
  const plan = { engagements: {}, loadout: { magazines: [], startingMagazineId: null, chamberLoaded: false } };
  const withModel = evaluateRoute(stage, plan, route, profile.performance);
  near(withModel.segments[0].seconds, 0.6 + 360 / 240); near(withModel.timing.movement, 0.6 + 360 / 240);
  const plain = evaluateRoute(stage, plan, route, { ...profile.performance, movementModel: undefined });
  near(plain.segments[0].seconds, 360 / profile.performance.movementSpeed);
  void createObject;
});

test('saving a session derives its measurements; editing, excluding and deleting runs update the profile', async () => {
  const repo = open(); await repo.initialize();
  const bill = run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 6 } });
  const reload = run('reload', [1.4, 3.0]);
  await repo.saveTraining(record([bill, reload]));
  let profile = await repo.loadProfile();
  assert.deepEqual(profile.performanceObservations.map(o => o.factor).sort(), ['averageSplitTime', 'drawTime', 'hitZones', 'reloadTime']);
  near(profile.performance.reloadTime, 1.6); near(profile.performance.drawTime, 1.3);
  assert.equal(profile.performance.timingEvidence.reloadTime.sampleCount, 1);
  await repo.saveTraining(record([bill, { ...reload, counts: false }]));
  profile = await repo.loadProfile();
  assert.equal(profile.performanceObservations.filter(o => o.factor === 'reloadTime').length, 0, 'excluded run withdrawn');
  assert.equal(profile.performance.reloadTime, 2, 'back to the generic value');
  await repo.saveTraining(record([{ ...bill, shotTimes: [1.2, 1.4, 1.6, 1.8, 2.0, 2.2], totalTime: 2.2 }]));
  profile = await repo.loadProfile();
  near(profile.performance.drawTime, 1.2, 1e-9); near(profile.performance.averageSplitTime, 0.2, 1e-9);
  // Other sessions' measurements are untouched; deleting the session withdraws its own.
  await repo.saveTraining(record([run('reload', [1.5, 3.2])], { id: 'session-2' }));
  await repo.deleteTraining('session-1');
  profile = await repo.loadProfile();
  assert.deepEqual(profile.performanceObservations.map(o => [o.trainingSessionId, o.factor]), [['session-2', 'reloadTime']]);
  // Damaged runs are refused before anything is written.
  await assert.rejects(repo.saveTraining(record([run('bill', [1, 2])])), /6 shots/);
  await assert.rejects(repo.saveTraining(record([bill, bill])), /Duplicate/);
  const [saved] = (await repo.listTraining('local')).filter(r => r.id === 'session-2');
  assert.equal(saved.libraryRuns.length, 1);
});

test('power factor and par times live in the profile; malformed values read as unset', async () => {
  const repo = open(); await repo.initialize();
  await repo.setPowerFactor('major'); await repo.setDrillPar('bill|distance=7', 2.4); await repo.setDrillPar('blake', 3.1);
  let profile = await repo.loadProfile();
  assert.equal(profile.powerFactor, 'major'); assert.deepEqual(profile.drillPars, { 'bill|distance=7': 2.4, blake: 3.1 });
  await repo.setDrillPar('blake', null);
  assert.deepEqual((await repo.loadProfile()).drillPars, { 'bill|distance=7': 2.4 });
  await assert.rejects(repo.setDrillPar('bill', -1), /par/); await assert.rejects(repo.setPowerFactor('super'), /power factor/);
  await repo.saveProfile({ ...profile, powerFactor: 'super', drillPars: { ok: 3, bad: -2, worse: 'x' } });
  profile = await repo.loadProfile();
  assert.equal(profile.powerFactor, undefined); assert.deepEqual(profile.drillPars, { ok: 3 });
});

test('Your numbers: values with run counts, by distance, spread, direction and condition, one context at a time', () => {
  const runs = [
    run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 5, C: 1 } }),
    run('bill', [1.5, 1.75, 2.0, 2.25, 2.5, 2.75], { zones: { A: 6 } }),
    run('ladder', [1.8, 2.2], { choices: { distance: '15' }, zones: { A: 1, C: 1 } }),
    run('draw', [1.9], { choices: { start: 'surrender' } }),
    run('blake', [1.4, 1.62, 1.92, 2.14, 2.44, 2.66]),
    run('wide', [1.4, 1.62, 2.22, 2.44], { choices: { spread: '5', distance: '7' } }),
    run('reload', [1.4, 3.0]), run('reload', [1.4, 3.4], { choices: { mode: 'stepping' } }),
    run('sprint', [1.4, 1.65, 3.15, 3.4], { choices: { move: '10', direction: 'lateral' } }),
    run('sprint', [1.4, 1.65, 3.85, 4.1], { choices: { move: '15', direction: 'lateral' } }),
    run('steel', [1.8, 2.3, 2.8, 3.4, 3.9]), run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.5]),
    run('port', [1.5, 1.75, 2.3, 2.55], { choices: { position: 'square', distance: '10' } }),
    run('port', [1.5, 1.85, 2.6, 2.95], { choices: { position: 'port', distance: '10' } }),
    run('partial', [1.6, 2.1], { choices: { face: 'head', distance: '7' }, zones: { A: 1, C: 1 } }),
    run('onTheMove', [1.5, 1.85, 2.4, 2.75], { choices: { mode: 'toward' } }),
  ];
  const numbers = S.libraryNumbers([record(runs), record([run('bill', [9, 10, 11, 12, 13, 14])], { id: 'dry', context: 'DRY_FIRE' })], 'LIVE_FIRE');
  assert.equal(numbers.runs, runs.length);
  const holster = numbers.draw.find(d => d.start === 'competitionHolster').stat; near(holster.mean, 1.4); assert.equal(holster.n, 2); near(holster.best, 1.3);
  assert.equal(numbers.draw.find(d => d.start === 'surrender').stat.n, 1);
  const seven = numbers.splits.find(s => s.yards === 7);
  assert.equal(seven.stat.n, 6, 'Bill x2, Blake, wide, sprint x2 (standing square on paper; not partial, port or moving)');
  near(numbers.splits.find(s => s.yards === 10).stat.mean, 0.25, 1e-9, 'port drill standing square counts');
  assert.deepEqual(numbers.transitions.map(t => [t.spreadYards, t.stat.n]), [[1, 1], [5, 1]]);
  near(numbers.transitionFit.perYard, (0.6 - 0.3) / 4, 1e-9);
  assert.deepEqual(numbers.reloads.map(r => [r.mode, r.stat.n]), [['standing', 1], ['stepping', 1]]);
  near(numbers.movement.model.lateral.inchesPerSecond, 180 / (2.2 - 1.5), 1e-6); near(numbers.movement.model.lateral.overheadSeconds, 1.5 - 360 * (0.7 / 180), 1e-6);
  assert.deepEqual(numbers.movement.moves.map(m => [m.direction, m.yards]), [['lateral', 10], ['lateral', 15]]);
  assert.deepEqual(numbers.steel.map(s => [s.yards, s.runs, s.shots, s.misses, s.perPlate.n]), [[10, 2, 11, 1, 1]]);
  const port = numbers.positions.find(p => p.position === 'port'); near(port.extra, 1.45 - 1.05, 1e-9);
  const seven_acc = numbers.accuracy.find(a => a.yards === 7);
  assert.equal(seven_acc.required, 12); near(seven_acc.a, 11 / 12); near(seven_acc.c, 1 / 12);
  assert.equal(numbers.partial[0].points.n, 1); near(numbers.partial[0].points.mean, 8 / 10);
  assert.deepEqual(numbers.onTheMove.map(m => m.mode), ['toward']);
  assert.equal(S.libraryNumbers([record(runs)], 'DRY_FIRE').runs, 0);
  const trend = S.libraryTrend([record(runs)], 'bill|distance=7');
  assert.deepEqual(trend.map(t => t.total), [2.55, 2.75]); near(trend[1].hitFactor, 30 / 2.75);
});

// Regression tests for the independent review of batch 17.
test('review: without a move fit, route movement time is computed exactly as before (stored comparisons still match)', () => {
  const { createDefaultStage } = require('../src/stage/defaults.ts');
  const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
  const stage = createDefaultStage(undefined, { size: { width: 1200, depth: 600 } });
  const p = (id, x, y) => ({ id, label: id, position: { space: 'stage', x, y, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] });
  const plan = { engagements: {}, loadout: { magazines: [], startingMagazineId: null, chamberLoaded: false } };
  const profile = createLocalProfile().performance;
  let rng = 7; const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 50; i++) {
    const route = { ...createRoute('r'), positions: [p('A', rand() * 1200, rand() * 600), p('B', rand() * 1200, rand() * 600), p('C', rand() * 1200, rand() * 600)] };
    const e = evaluateRoute(stage, plan, route, { ...profile, movementSpeed: 97.3 });
    assert.equal(e.timing.movement, e.distance / 97.3);
  }
});

test('review: removing the last ladder run removes the split curve it made', async () => {
  const ladder = { id: 'l', factor: 'averageSplitTime', value: 0.8, difficultyModel: 'DISTANCE_ONLY', difficulty: 25, context: 'LIVE_FIRE', measuredAt: at(1), source: 'STRUCTURED_TRAINING' };
  const withCurve = O.withPerformanceObservations(createLocalProfile(), [ladder], 'LIVE_FIRE');
  assert.equal(withCurve.performance.shootingObservations.length, 1);
  const cleared = O.withPerformanceObservations(withCurve, [], 'LIVE_FIRE');
  assert.equal('shootingObservations' in cleared.performance, false);
  const repo = open(); await repo.initialize();
  await repo.saveTraining(record([run('ladder', [1.8, 2.6], { choices: { distance: '25' } })]));
  assert.deepEqual((await repo.loadProfile()).performance.shootingObservations.map(c => [c.difficulty, c.sampleCount]), [[25, 1]]);
  await repo.saveTraining(record([]));
  assert.equal((await repo.loadProfile()).performance.shootingObservations, undefined);
});

test('review: Your numbers leaves out LOG ONLY runs; El Presidente is not compared with itself; PCSL T counts twice; dry steel has no miss rate', () => {
  const numbers = S.libraryNumbers([record([run('reload', [1.4, 3.0]), run('reload', [1.4, 9.0], { counts: false })])], 'LIVE_FIRE');
  assert.equal(numbers.reloads[0].stat.n, 1); near(numbers.reloads[0].stat.mean, 1.6);
  assert.equal(numbers.runs, 1);
  const el = run('elPresidente', [2.0, 2.25, 2.55, 2.8, 3.1, 3.35, 5.0, 5.25, 5.55, 5.8, 6.1, 6.35], { zones: { A: 12 } });
  assert.equal(S.libraryNumbers([record([el])], 'LIVE_FIRE').elPresidente.predicted, null, 'nothing else measured');
  const parts = [el, run('ladder', [1.6, 1.9], { choices: { distance: '10' } }), run('blake', [1.4, 1.62, 1.92, 2.14, 2.44, 2.66]), run('reload', [1.4, 3.0])];
  near(S.libraryNumbers([record(parts)], 'LIVE_FIRE').elPresidente.predicted, 6 * 0.3 + 4 * 0.3 + 1.6);
  const pcsl = S.libraryNumbers([record([run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { family: 'PCSL', zones: { T: 3 } })])], 'LIVE_FIRE');
  assert.deepEqual([pcsl.accuracy[0].a, pcsl.accuracy[0].miss], [1, 0]);
  const dry = S.libraryNumbers([record([run('steel', [], { totalTime: 4.1 })], { context: 'DRY_FIRE' })], 'DRY_FIRE');
  assert.deepEqual([dry.steel[0].missRuns, dry.steel[0].shots, dry.steel[0].misses], [0, 0, 0]);
  const live = S.libraryNumbers([record([run('steel', [1.8, 2.3, 2.8, 3.4, 3.9, 4.4]), run('steel', [1.8, 2.3, 2.8])].filter(r => !L.libraryRunProblem(r)))], 'LIVE_FIRE');
  assert.deepEqual([live.steel[0].missRuns, live.steel[0].shots, live.steel[0].misses], [1, 6, 1]);
});

test('review: hit counts cannot exceed the shots; PCSL counts over several targets are an estimate; typing steel shows no negative makeups', () => {
  assert.match(L.libraryRunProblem(run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 9 } })), /9 hits and misses counted for 6 shots/);
  assert.equal(L.libraryRunProblem(run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 6, NS: 1 } })), null, 'a no-shoot hit is extra');
  const blake = run('blake', [1.4, 1.62, 1.92, 2.14, 2.44, 2.66], { family: 'PCSL', zones: { A: 4, T: 1, M: 1 } });
  assert.equal(L.scoreLibraryRun(blake).approximate, true);
  assert.equal(L.scoreLibraryRun({ ...blake, zones: { A: 5, M: 1 } }).approximate, false, 'no T: pooled equals per target');
  assert.equal(L.scoreLibraryRun(run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { family: 'PCSL', zones: { T: 3 } })).approximate, false, 'one target');
  assert.equal(L.analyzeLibraryRun({ ...run('steel', []), shotTimes: [1.8, 2.3, 2.8] }).steelMisses, null);
});

test('review: decimal commas are read as decimals, comma-separated times as separate shots', () => {
  assert.deepEqual(L.parseShotTimes('1,42 1,68', 'times'), { times: [1.42, 1.68] });
  assert.deepEqual(L.parseShotTimes('1.42,1.68', 'times'), { times: [1.42, 1.68] });
  assert.deepEqual(L.parseShotTimes('1.42, 1.68, 2.1', 'times'), { times: [1.42, 1.68, 2.1] });
  assert.deepEqual(L.parseShotTimes('1,8', 'times'), { times: [1.8] });
});

test('review: route timing warns when a leg is longer than any measured move or uses another direction\'s fit', () => {
  const { createDefaultStage } = require('../src/stage/defaults.ts');
  const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
  const stage = createDefaultStage(undefined, { size: { width: 1200, depth: 900 } });
  const start = stage.objects.find(o => o.type === 'start').position;
  const model = M.fitMovement([{ direction: 'lateral', distanceInches: 36, durationSeconds: 0.9 }, { direction: 'lateral', distanceInches: 108, durationSeconds: 1.3 }]);
  const profile = { ...createLocalProfile().performance, movementModel: model };
  const p = (id, x, y) => ({ id, label: id, position: { space: 'stage', x, y, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] });
  const plan = { engagements: {}, loadout: { magazines: [], startingMagazineId: null, chamberLoaded: false } };
  const far = evaluateRoute(stage, plan, { ...createRoute('r'), positions: [p('P1', start.x + 540, start.y)] }, profile);
  assert.ok(far.warnings.some(w => /P1: the 15\.0 yd move is longer than your longest measured sideways move \(3\.0 yd\)/.test(w)), far.warnings.join('\n'));
  const back = evaluateRoute(stage, plan, { ...createRoute('r'), positions: [p('P1', start.x, start.y + 72)] }, profile);
  assert.ok(back.warnings.some(w => /No back moves measured yet/.test(w)));
  const short = evaluateRoute(stage, plan, { ...createRoute('r'), positions: [p('P1', start.x + 72, start.y)] }, profile);
  assert.ok(!short.warnings.some(w => /measured/.test(w)));
});

test('review: saving an unchanged session does not rewrite the profile; a damaged saved fit is dropped on load', async () => {
  const db = new DatabaseSync(':memory:'); let profileWrites = 0;
  const repo = new Repository({ execAsync: async sql => db.exec(sql), runAsync: async (sql, ...a) => { if (/UPDATE profiles/.test(sql)) profileWrites++; return db.prepare(sql).run(...a); },
    getAllAsync: async (sql, ...a) => db.prepare(sql).all(...a), getFirstAsync: async (sql, ...a) => db.prepare(sql).get(...a) ?? null }, randomUUID);
  await repo.initialize();
  const runs = [run('reload', [1.4, 3.0], { id: 'zz-run' }), run('reload', [1.5, 3.1], { id: 'aa-run' })];
  await repo.saveTraining(record(runs)); const after = profileWrites;
  await repo.saveTraining({ ...record(runs), notes: 'changed notes' });
  assert.equal(profileWrites, after);
  const fresh = open(); await fresh.initialize();
  const profile = await fresh.loadProfile();
  await fresh.saveProfile({ ...profile, performance: { ...profile.performance, movementModel: { all: {} } } });
  assert.equal((await fresh.loadProfile()).performance.movementModel, undefined);
});

test('drill days: one record per local day and practice type, made by the app; saved runs found by drill and by id', async () => {
  const D = require('../src/training/drillDays.ts');
  assert.equal(D.localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(D.validDay('2026-10-26'), true); assert.equal(D.validDay('2026-13-01'), false); assert.equal(D.validDay('26-10-2026'), false); assert.equal(D.validDay('2026-02-31'), false);
  const day = D.newDrillDay('d1', '2026-10-26', 'DRY_FIRE', at(1));
  assert.equal(D.isDrillDay(day), true); assert.deepEqual([day.kind, day.day, day.context, day.libraryRuns], ['drillDay', '2026-10-26', 'DRY_FIRE', []]);
  const older = record([run('bill', [1.3, 1.55, 1.8, 2.05, 2.3, 2.55])]);
  const today = { ...day, libraryRuns: [run('bill', [1.2, 1.45, 1.7, 1.95, 2.2, 2.45]), run('draw', [1.1])] };
  assert.equal(D.drillDayFor([older, today], '2026-10-26', 'DRY_FIRE'), today);
  assert.equal(D.drillDayFor([older, today], '2026-10-26', 'LIVE_FIRE'), undefined, 'live fire is a separate record');
  assert.equal(D.drillDayFor([older, today], '2026-10-25', 'DRY_FIRE'), undefined);
  assert.equal(D.drillDayFor([older], '2026-10-26', 'LIVE_FIRE'), undefined, 'a hand-made session is never reused');
  const bills = D.runsOfDrill([older, today], 'bill');
  assert.deepEqual(bills.map(e => [e.recordId, e.context]), [['d1', 'DRY_FIRE'], ['session-1', 'LIVE_FIRE']], 'newest first, across records');
  assert.equal(D.recordOfRun([older, today], today.libraryRuns[1].id), today);
  assert.match(D.drillCardText([older, today], L.libraryDrill('bill')), /^Close-target split.*\n2 runs · last .*2\.45 s$/);
  assert.match(D.drillCardText([], L.libraryDrill('steel')), /\nNo runs yet$/);
  assert.equal(D.historyDetail(today), '2 drill runs: Bill Drill, Draw to first hit');

  // The repository keeps drill days and refuses damaged ones; their runs feed the profile like any other.
  const repo = open(); await repo.initialize();
  await repo.saveTraining(today);
  const [loaded] = await repo.listTraining('local');
  assert.equal(loaded.kind, 'drillDay'); assert.equal(loaded.day, '2026-10-26');
  await assert.rejects(repo.saveTraining({ ...today, day: '26 Oct' }), /Invalid drill day/);
  await assert.rejects(repo.saveTraining({ ...today, kind: 'other' }), /Invalid drill day/);
  await assert.rejects(repo.saveTraining({ ...older, day: '2026-10-26' }), /Invalid drill day/);
  const profile = await repo.loadProfile();
  assert.ok((profile.performanceObservations ?? []).some(o => o.trainingSessionId === 'd1' && o.factor === 'drawTime' && o.context === 'DRY_FIRE'));
});

test('hits marked on the target: single plain paper targets only, inside the face, and they must match the zone counts', () => {
  const hit = (n, zone, x = 1, y = -2) => ({ id: 'h' + n, order: n, x, y, zone });
  const target = hits => ({ presetId: 'uspsa-metric-chl-v1', faceWidth: 18.12, faceHeight: 29.93, aim: { x: 0, y: 0 }, hits });
  const times = [1.3, 1.55, 1.8, 2.05, 2.3, 2.55];
  const hits = [hit(1, 'A'), hit(2, 'A'), hit(3, 'C', 4, 6), hit(4, 'A'), hit(5, 'A'), { id: 'h6', order: 6, x: null, y: null, zone: 'M' }];
  assert.deepEqual(L.zonesFromHits(hits), { A: 4, C: 1, M: 1 });
  assert.equal(L.zonesFromHits([hit(1, null)]), undefined);
  const ok = run('bill', times, { zones: { A: 4, C: 1, M: 1 }, target: target(hits) });
  assert.equal(L.libraryRunProblem(ok), null);
  assert.deepEqual(L.hitCounts(ok), { a: 4, c: 1, d: 0, miss: 1 }, 'scored from the counts as before');
  assert.equal(L.libraryRunProblem({ ...ok, zones: { A: 5, C: 1 } }), 'Hit counts do not match the hits marked on the target.');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), hit(6, 'A', 30, 0)]), zones: { A: 5, C: 1 } }), 'Hit coordinates are outside the target area.');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), { id: 'h6', order: 6, x: null, y: null, zone: 'A' }]), zones: { A: 5, C: 1 } }), 'Only misses and no-shoot hits may omit coordinates.');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), hit(6, 'T')]), zones: { A: 4, C: 1, T: 1 } }), 'Invalid hit counts.', 'T is a PCSL zone');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([hit(1, 'A'), hit(1, 'A')]), zones: { A: 2 } }), 'Invalid hit.', 'duplicate ids');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), hit(6, null)]), zones: { A: 4, C: 1 } }), 'A marked hit has no zone.');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), hit(6, 'A', 9.2, 0)]), zones: { A: 5, C: 1 } }), 'Hit coordinates are outside the target area.', 'past the face edge (half the width)');
  assert.equal(L.libraryRunProblem({ ...ok, target: target([...hits.slice(0, 5), hit(6, 'A', 9.06, -14.96)]), zones: { A: 5, C: 1 } }), null, 'on the edge');
  const blake = run('blake', times, { zones: { A: 6 }, target: target([1, 2, 3, 4, 5, 6].map(n => hit(n, 'A'))) });
  assert.equal(L.libraryRunProblem(blake), 'Hits can\'t be marked on the target for Blake Drill.');
  assert.deepEqual(L.libraryDrills.filter(L.canMarkHits).map(d => d.id), ['draw', 'bill', 'ladder', 'reload']);
  // Marked hits travel with the run into the profile exactly as counted hits do.
  const { target: _marks, ...counted } = ok;
  assert.ok(L.libraryObservations(record([ok]), ok).some(o => o.factor === 'hitZones'));
  assert.deepEqual(L.libraryObservations(record([ok]), ok), L.libraryObservations(record([counted]), counted));
});
