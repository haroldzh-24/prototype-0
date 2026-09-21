const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const P = require('../src/planning/planner.ts');
const { shootingDifficulty } = require('../src/planning/shootingDifficulty.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute } = require('../src/planning/route.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const point = (x, y, z = 0) => ({ space: 'stage', x, y, z });
function fixture() {
  const stage = createDefaultStage(), plan = createPlan(), profile = createLocalProfile().performance;
  const targets = stage.objects.filter(isEngageable);
  plan.loadout = { startingMagazineId: 'a', chamberLoaded: true, magazines: [
    { id: 'a', capacity: 10, startingRounds: 3 }, { id: 'b', capacity: 10, startingRounds: 6 },
  ] };
  plan.engagements = Object.fromEntries(targets.map(t => [t.id, 2]));
  const route = createRoute('route');
  route.positions = targets.map((t, i) => ({ id: String(i), label: String(i), position: point(i * 36, 48), visibleTargetIds: [t.id], engagedTargetIds: [t.id] }));
  route.reloads = [{ positionId: '1', magazineId: 'b' }];
  return { context: { stage, plan, profile }, candidate: { id: 'candidate', route } };
}
test('generation explicitly remains unimplemented for every style and leaves inputs intact', () => {
  const { context } = fixture(), before = JSON.stringify(context);
  for (const style of ['MINIMUM_MOVEMENT_HARDER_SHOOTING', 'BALANCED', 'MORE_MOVEMENT_EASIER_SHOOTING', 'PERSONALIZED']) {
    const result = P.generateCandidates(context, { ...P.createRoutePlannerConfig(), style });
    assert.equal(result.status, 'NOT_IMPLEMENTED');
    assert.deepEqual(result.candidates, []);
    assert.equal(result.warnings[0].code, 'GENERATION_NOT_IMPLEMENTED');
  }
  assert.equal(JSON.stringify(context), before);
});
test('distance difficulty uses physical inches, increases with range and ignores target bottom elevation', () => {
  assert.deepEqual(shootingDifficulty(point(0, 0), point(108, 144, 60)), { model: 'DISTANCE_ONLY', distanceInches: 180, score: 5 });
  assert.equal(shootingDifficulty(point(1, 2), point(1, 2)).score, 0);
  assert.ok(shootingDifficulty(point(0, 0), point(216, 288)).score > 5);
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => shootingDifficulty(point(value, 0), point(0, 0)), /finite/);
});
test('candidate evaluation exactly preserves authoritative ammo, reload, movement, timing and warnings', () => {
  const { context, candidate } = fixture(), before = JSON.stringify({ context, candidate });
  for (const profile of [context.profile, null]) {
    const result = P.evaluateCandidate({ ...context, profile }, candidate);
    assert.deepEqual(result.evaluation, evaluateRoute(context.stage, context.plan, candidate.route, profile));
    assert.deepEqual(result.warnings.map(w => w.message), result.evaluation.warnings);
    assert.ok(result.warnings.every(w => w.candidateId === candidate.id && w.code === 'ROUTE_EVALUATION'));
    assert.equal(result.shootingDifficulty.length, candidate.route.positions.length);
  }
  assert.equal(JSON.stringify({ context, candidate }), before);
});
test('difficulty excludes missing/non-scoring and duplicate engagements without hiding evaluator warnings', () => {
  const { context, candidate } = fixture();
  const first = candidate.route.positions[0];
  first.engagedTargetIds.push(first.engagedTargetIds[0], 'missing', context.stage.objects.find(o => o.type === 'start').id);
  const result = P.evaluateCandidate(context, candidate);
  assert.equal(result.shootingDifficulty.length, candidate.route.positions.length);
  assert.ok(result.warnings.some(w => w.message.includes('more than once')));
  assert.ok(result.warnings.some(w => w.message.includes('non-shootable')));
});
test('ranking uses an explicit policy, preserves ties/input and keeps excluded candidate warnings', () => {
  const { context, candidate } = fixture();
  const a = P.evaluateCandidate(context, candidate);
  const b = P.evaluateCandidate(context, { ...candidate, id: 'b' });
  const c = P.evaluateCandidate({ ...context, profile: null }, { ...candidate, id: 'c' });
  const input = [a, b, c], config = P.createRoutePlannerConfig();
  const result = P.rankCandidates(input, config, (value, received) => {
    assert.equal(received, config);
    return value === c ? null : value === b ? 1 : 2;
  });
  assert.deepEqual(result.candidates.map(r => r.candidate), [b, a]);
  assert.deepEqual(input, [a, b, c]);
  assert.ok(result.warnings.some(w => w.candidateId === 'c'));
  assert.deepEqual(P.rankCandidates([a, b], config, () => 1).candidates.map(r => r.candidate), [a, b]);
  assert.deepEqual(P.rankCandidates([], config, () => 0).candidates, []);
  for (const score of [NaN, Infinity]) assert.throws(() => P.rankCandidates([a], config, () => score), /finite/);
});
