const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { generateCandidates, createRoutePlannerConfig, PLANNER_SEARCH_LIMITS } = require('../src/planning/planner.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable } = require('../src/planning/model.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { evaluateRoute, isStageRoute } = require('../src/planning/route.ts');
const point = (x, y = 0) => ({ space: 'stage', x, y, z: 0 });
function fixture(coverage = [['t1', 't2'], ['t2', 't3'], ['t3']]) {
  const stage = createDefaultStage();
  const template = stage.objects.find(isEngageable);
  stage.objects = [ { ...stage.objects.find(o => o.type === 'start'), position: point(0) },
    ...['t1', 't2', 't3'].map((id, i) => ({ ...template, id, position: point(120 + i * 36, 100) })) ];
  const plan = createPlan();
  plan.engagements = { t1: 2, t2: 2, t3: 2 };
  plan.loadout = { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 20, startingRounds: 20 }] };
  plan.route = { version: 1, id: 'manual', name: 'Manual', reloads: [], positions: coverage.map((visibleTargetIds, i) => ({ id: String(i), label: String(i), position: point(36 + i * 36), visibleTargetIds, engagedTargetIds: ['stale'] })) };
  return { stage, plan, profile: createLocalProfile().performance };
}
const run = (context, limits) => generateCandidates(context, createRoutePlannerConfig(), limits);
test('generated routes cover all scoring targets exactly once and preserve inputs', () => {
  const context = fixture(), before = JSON.stringify(context), result = run(context);
  assert.equal(result.status, 'GENERATED');
  for (const candidate of result.candidates) {
    assert.equal(isStageRoute(candidate.route), true);
    assert.deepEqual(candidate.route.positions.flatMap(p => p.engagedTargetIds).sort(), ['t1', 't2', 't3']);
    assert.ok(candidate.route.positions.every(p => p.engagedTargetIds.every(id => p.visibleTargetIds.includes(id))));
    assert.deepEqual(candidate.evaluation, evaluateRoute(context.stage, context.plan, candidate.route, context.profile));
  }
  assert.equal(JSON.stringify(context), before);
  assert.deepEqual(run(context), result);
});
test('subsets remove redundant positions while preserving useful alternatives', () => {
  const result = run(fixture([['t1', 't2'], ['t3'], ['t1'], ['t3']]));
  assert.ok(result.candidates.some(c => c.route.positions.length === 2 && c.route.positions.some(p => p.id === '0') && c.route.positions.some(p => p.id === '1')));
  assert.ok(result.candidates.every(c => c.route.positions.every(p => p.engagedTargetIds.length)));
});
test('multi-visible targets can be engaged from different positions with different difficulty', () => {
  const context = fixture([['t1', 't2', 't3'], ['t2']]);
  context.plan.route.positions[1].position = point(150, 100);
  const result = run(context);
  assert.ok(result.candidates.some(c => c.route.positions.length === 1));
  assert.ok(result.candidates.some(c => c.route.positions.some(p => p.id === '1' && p.engagedTargetIds.includes('t2'))));
  assert.ok(new Set(result.candidates.map(c => c.metrics.shootingDifficultyTotal)).size > 1);
});
test('invalid visibility is warned and cannot cover a required target', () => {
  const context = fixture([['t1', 't2', 'missing', 'start']]);
  const result = run(context);
  assert.equal(result.candidates.length, 0);
  for (const code of ['INVALID_VISIBILITY', 'UNCOVERED_TARGET', 'NO_COVERAGE', 'NO_VALID_ROUTE'])
    assert.ok(result.warnings.some(w => w.code === code));
});
test('impossible coverage and invalid requirements/start return useful warnings', () => {
  const context = fixture([[], ['t1']]);
  assert.equal(run(context).status, 'NO_VALID_ROUTE');
  context.plan.engagements.t1 = 0;
  assert.equal(run(context).status, 'INVALID_INPUT');
  const missingStart = fixture(); missingStart.stage.objects = missingStart.stage.objects.filter(o => o.type !== 'start');
  assert.equal(run(missingStart).status, 'INVALID_INPUT');
});
test('orders start at existing start, prefer nearby first, and avoid duplicate equivalents', () => {
  const context = fixture([['t1'], ['t2'], ['t3']]);
  const result = run(context);
  assert.equal(result.candidates.length, 6);
  assert.deepEqual(result.candidates[0].route.positions.map(p => p.id), ['0', '1', '2']);
  assert.equal(result.candidates[0].evaluation.segments[0].fromId, context.stage.objects[0].id);
  assert.equal(result.candidates[0].metrics.movementDistance, 108);
  assert.equal(new Set(result.candidates.map(c => JSON.stringify(c.route.positions.map(p => [p.id, p.engagedTargetIds])))).size, result.candidates.length);
});
test('reload search delegates to evaluator and rejects impossible ammunition and invalid loadouts', () => {
  const context = fixture([['t1'], ['t2'], ['t3']]);
  context.plan.loadout.magazines = [{ id: 'm1', capacity: 3, startingRounds: 2 }, { id: 'm2', capacity: 4, startingRounds: 4 }];
  const result = run(context);
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every(c => c.evaluation.ammo.every(a => a.sufficient) && c.metrics.reloadCount === 1));
  for (const c of result.candidates) assert.deepEqual(c.evaluation, evaluateRoute(context.stage, context.plan, c.route, context.profile));
  context.plan.loadout.magazines = [{ id: 'm1', capacity: 3, startingRounds: 2 }];
  assert.equal(run(context).status, 'NO_VALID_ROUTE');
  context.plan.loadout.magazines[0].startingRounds = 4;
  assert.ok(run(context).warnings.some(w => w.code === 'INVALID_LOADOUT'));
});
test('all search bounds stop cleanly, retain valid candidates and are deterministic', () => {
  const context = fixture([['t1', 't2', 't3'], ['t1', 't2', 't3'], ['t1', 't2', 't3']]);
  for (const limits of [{ maxEvaluations: 1 }, { maxSubsets: 1 }, { maxSubsetChecks: 1 }, { maxOrdersPerSubset: 1 }, { maxAssignmentsPerOrder: 1 }, { maxPositions: 1 }]) {
    const result = run(context, limits);
    assert.ok(result.search.truncated);
    assert.ok(result.warnings.some(w => w.code === 'SEARCH_LIMIT'));
    assert.ok(result.candidates.length > 0);
    assert.ok(result.search.evaluations <= (limits.maxEvaluations ?? PLANNER_SEARCH_LIMITS.maxEvaluations));
    assert.deepEqual(run(context, limits), result);
  }
  assert.equal(run(context, { maxPositions: Infinity }).status, 'INVALID_INPUT');
  assert.equal(run(context, { maxTargets: 2 }).status, 'NO_VALID_ROUTE');
  context.plan.loadout.magazines.push({ id: 'm2', capacity: 10, startingRounds: 10 });
  assert.ok(run(context, { maxMagazines: 1 }).search.truncated);
});
test('missing profile preserves ammo-valid candidates with unavailable timing warnings', () => {
  const context = fixture(); context.profile = null;
  const result = run(context);
  assert.ok(result.candidates.length);
  assert.ok(result.candidates.every(c => c.metrics.estimatedTime === null && c.warnings.some(w => w.code === 'ROUTE_EVALUATION')));
});
