const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const P = require('../src/planning/planner.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable } = require('../src/planning/model.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const point = (x, y = 0) => ({ space: 'stage', x, y, z: 0 });
function context() {
  const stage = createDefaultStage(), template = stage.objects.find(isEngageable);
  stage.objects = [{ ...stage.objects.find(o => o.type === 'start'), position: point(0) },
    ...['a', 'b', 'c'].map(id => ({ ...template, id, position: point(360) }))];
  const plan = createPlan();
  plan.engagements = { a: 2, b: 2, c: 2 };
  plan.loadout = { startingMagazineId: 'm1', chamberLoaded: false, magazines: [
    { id: 'm1', capacity: 20, startingRounds: 20 }, { id: 'm2', capacity: 20, startingRounds: 20 }] };
  return { stage, plan, profile: createLocalProfile().performance };
}
function candidate(ctx, id, positions, reloads = []) {
  return P.evaluateCandidate(ctx, { id, route: { version: 1, id, name: id, reloads,
    positions: positions.map(([x, ids], i) => ({ id: String(i), label: String(i), position: point(x), engagedTargetIds: ids, visibleTargetIds: ['a', 'b', 'c'] })) } });
}
const rank = (values, changes = {}, options = { diversity: false }) => P.rankCandidates(values,
  { ...P.createRoutePlannerConfig(), movement: { backwardMovement: 'ALLOWED' }, ...changes }, options);

test('minimum movement chooses shorter travel despite harder shooting', () => {
  const ctx = context(), short = candidate(ctx, 'short', [[0, ['a', 'b', 'c']]]), long = candidate(ctx, 'long', [[300, ['a', 'b', 'c']]]);
  const result = rank([long, short], { style: 'MINIMUM_MOVEMENT_HARDER_SHOOTING' });
  assert.equal(result.candidates[0].originalCandidate.id, 'short');
  assert.ok(short.metrics.totalShootingDifficulty > long.metrics.totalShootingDifficulty);
});
test('easier shooting accepts additional travel for lower difficulty', () => {
  const ctx = context(), short = candidate(ctx, 'short', [[0, ['a', 'b', 'c']]]), long = candidate(ctx, 'long', [[300, ['a', 'b', 'c']]]);
  assert.equal(rank([short, long], { style: 'MORE_MOVEMENT_EASIER_SHOOTING' }).candidates[0].originalCandidate.id, 'long');
});
test('balanced trades distance against difficulty and avoids a long detour', () => {
  const ctx = context(), short = candidate(ctx, 'short', [[0, ['a', 'b', 'c']]]), moderate = candidate(ctx, 'moderate', [[120, ['a', 'b', 'c']]]), detour = candidate(ctx, 'detour', [[720, ['a', 'b', 'c']]]);
  const result = rank([detour, moderate, short]);
  assert.equal(result.candidates[0].originalCandidate.id, 'short');
  assert.equal(result.candidates.at(-1).originalCandidate.id, 'detour');
  assert.ok(result.candidates.every(r => r.reasons.filter(x => ['TIME', 'MOVEMENT', 'DIFFICULTY'].includes(x.code)).every(x => x.contribution >= 0)));
});
test('personalized falls back honestly for absent, invalid and complete but uncalibrated profiles', () => {
  for (const profile of [null, { movementSpeed: 0 }, createLocalProfile().performance]) {
    const ctx = { ...context(), profile }, values = [candidate(ctx, 'a', [[0, ['a', 'b', 'c']]])];
    const personalized = rank(values, { style: 'PERSONALIZED' });
    assert.equal(personalized.candidates[0].score, rank(values).candidates[0].score);
    assert.equal(personalized.candidates[0].effectiveStyle, 'BALANCED');
    assert.ok(personalized.candidates[0].warnings.some(w => w.code === 'PROFILE_FALLBACK'));
  }
});
test('backward Avoid, Limited and Allowed have ordered penalties with sustained retreat surcharge', () => {
  const ctx = context(), c = candidate(ctx, 'retreat', [[120, ['a']], [60, ['b']], [0, ['c']]]);
  assert.equal(c.metrics.backwardDistance, 120);
  assert.equal(c.metrics.sustainedBackwardDistance, 84);
  const scores = ['AVOID', 'LIMITED', 'ALLOWED'].map(backwardMovement => rank([c], { movement: { backwardMovement } }).candidates[0].score);
  assert.ok(scores[0] > scores[1] && scores[1] > scores[2]);
  assert.equal(rank([c]).candidates[0].reasons.find(r => r.code === 'BACKWARD').contribution, 0);
});
test('movement classification is rotation invariant and ambiguous facing stays neutral', () => {
  const ctx = context(), c = candidate(ctx, 'retreat', [[120, ['a']], [0, ['b', 'c']]]);
  const rotated = structuredClone(ctx), route = structuredClone(c.candidate);
  const rotate = p => point(-p.y, p.x);
  rotated.stage.objects.forEach(o => { o.position = rotate(o.position); });
  route.route.positions.forEach(p => { p.position = rotate(p.position); });
  assert.equal(P.evaluateCandidate(rotated, route).metrics.backwardDistance, c.metrics.backwardDistance);
  ctx.stage.objects.find(o => o.id === 'b').position = point(-120);
  assert.equal(candidate(ctx, 'ambiguous', [[120, ['a', 'b']], [0, ['c']]]).metrics.backwardDistance, 0);
  assert.equal(candidate(ctx, 'start', [[-120, ['a', 'b', 'c']]]).metrics.backwardDistance, 0);
});
test('direction complexity records turns and reversals without counting zero moves', () => {
  const ctx = context(), c = candidate(ctx, 'reverse', [[120, ['a']], [120, ['b']], [0, ['c']]]);
  assert.equal(c.metrics.directionChangeCount, 1);
  assert.equal(c.metrics.sharpReversalCount, 1);
  assert.ok(c.metrics.movementComplexityScore > 0);
});
test('conservative favors earlier reserve, aggressive favors lower uncovered reload time', () => {
  const ctx = context(); ctx.plan.loadout.magazines[0].startingRounds = 6;
  const positions = [[0, ['a']], [60, ['b']], [120, ['c']]];
  const none = candidate(ctx, 'none', positions), early = candidate(ctx, 'early', positions, [{ positionId: '1', magazineId: 'm2' }]), late = candidate(ctx, 'late', positions, [{ positionId: '2', magazineId: 'm2' }]);
  assert.equal(rank([none, late, early], { reloadStrategy: 'CONSERVATIVE' }).candidates[0].originalCandidate.id, 'early');
  assert.equal(rank([early, none], { reloadStrategy: 'AGGRESSIVE' }).candidates[0].originalCandidate.id, 'none');
  assert.ok(rank([none], { reloadStrategy: 'BALANCED' }).candidates[0].score < rank([none], { reloadStrategy: 'CONSERVATIVE' }).candidates[0].score);
  assert.equal(early.metrics.reloadTime, 1.5);
  assert.ok(!rank([early]).warnings.some(w => /overlap.*not modeled/.test(w.message)));
});
test('diversity keeps the best duplicate and meaningful subset, order, assignment and reload alternatives', () => {
  const ctx = context(), a = candidate(ctx, 'a', [[0, ['a']], [120, ['b', 'c']]]);
  const duplicate = P.evaluateCandidate(ctx, { ...structuredClone(a.candidate), id: 'duplicate' });
  const subset = candidate(ctx, 'subset', [[0, ['a', 'b', 'c']]]);
  const assigned = candidate(ctx, 'assigned', [[0, ['a', 'b']], [120, ['c']]]);
  const reload = candidate(ctx, 'reload', [[0, ['a']], [120, ['b', 'c']]], [{ positionId: '1', magazineId: 'm2' }]);
  const orderRoute = structuredClone(a.candidate); orderRoute.id = 'order'; orderRoute.route.positions.reverse();
  const order = P.evaluateCandidate(ctx, orderRoute);
  const result = rank([a, duplicate, subset, assigned, reload, order], {}, { maxResults: 10 });
  assert.equal(result.candidates.length, 5);
  assert.ok(!result.candidates.some(c => c.originalCandidate.id === 'duplicate'));
  assert.deepEqual(result.candidates.map(c => c.rank), [1, 2, 3, 4, 5]);
});
test('metadata preserves original reference, score breakdown and inputs', () => {
  const ctx = context(), c = candidate(ctx, 'a', [[0, ['a', 'b', 'c']]]), before = JSON.stringify(c);
  const result = rank([c]).candidates[0];
  assert.equal(result.originalCandidate, c.candidate);
  assert.equal(result.score, result.reasons.reduce((n, r) => n + r.contribution, 0));
  assert.equal(result.metrics.averageShootingDifficulty, 10);
  assert.equal(result.metrics.maximumSingleTargetDifficulty, 10);
  assert.equal(result.metrics.roundsRemaining, 14);
  assert.equal(JSON.stringify(c), before);
});
test('missing timing omits time across the batch, infeasible ammunition is excluded', () => {
  const ctx = context(), a = candidate(ctx, 'a', [[0, ['a', 'b', 'c']]]), b = candidate({ ...ctx, profile: null }, 'b', [[120, ['a', 'b', 'c']]]);
  const result = rank([a, b]);
  assert.ok(result.warnings.some(w => w.code === 'TIMING_UNAVAILABLE'));
  assert.ok(result.candidates.every(c => c.reasons.find(r => r.code === 'TIME').contribution === 0));
  ctx.plan.loadout.magazines[0].startingRounds = 1;
  assert.equal(rank([candidate(ctx, 'bad', [[0, ['a', 'b', 'c']]])]).candidates.length, 0);
});

test('overlap improves ranking through evaluator timing and preserves reload-mode diversity', () => {
  const ctx = context(), positions = [[0, ['a']], [240, ['b', 'c']]];
  const stationary = candidate(ctx, 'stationary', positions, [{ positionId: '1', magazineId: 'm2', mode: 'stationary' }]);
  const moving = candidate(ctx, 'moving', positions, [{ positionId: '1', magazineId: 'm2' }]);
  assert.deepEqual(moving.evaluation.ammo, stationary.evaluation.ammo);
  assert.equal(moving.metrics.reloadTime, 0); assert.equal(moving.metrics.reloadOverlap, 2);
  assert.equal(moving.metrics.rawReloadDuration, 2);
  for (const reloadStrategy of ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE']) {
    const result = rank([stationary, moving], { reloadStrategy }, { maxResults: 5 });
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0].originalCandidate.id, 'moving');
    assert.equal(result.candidates[0].metrics.estimatedTotalTime, moving.evaluation.timing.total);
    assert.equal(result.candidates[0].reasons.find(r => r.code === 'RELOAD_TIME').contribution, 0);
  }
});
