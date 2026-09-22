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


const M = require('../src/profile/personalizedPerformance.ts');
const { evaluateRoute } = require('../src/planning/route.ts');
const { mapPlannerResults } = require('../src/planning/plannerUI.ts');
const observation = (difficulty, splitTime, sampleCount = 8) => ({ difficultyModel: 'DISTANCE_ONLY', difficulty, splitTime, sampleCount, standardDeviation: splitTime / 10, measuredAt: '2026-09-21T12:00:00Z' });
const curve = (hard = 2) => [observation(0, 0.2), observation(10, hard)];
const personalized = values => rank(values, { style: 'PERSONALIZED' });
function fullProfile() {
  const p = createLocalProfile().performance;
  p.timingEvidence = Object.fromEntries(M.timingFactors.map(k => [k, { source: 'MEASURED', sampleCount: 8, standardDeviation: p[k] / 10 }]));
  p.shootingObservations = curve();
  return p;
}
function options(profile) {
  const ctx = { ...context(), profile };
  return [candidate(ctx, 'short', [[0, ['a', 'b', 'c']]]), candidate(ctx, 'close', [[300, ['a', 'b', 'c']]])];
}
test('empty, absent and seeded profiles keep Balanced fallback with honest low confidence', () => {
  for (const p of [null, {}, createLocalProfile().performance]) {
    const model = M.buildPersonalizedModel(p), values = options(p);
    assert.equal(model.usable, false); assert.equal(model.confidence, 'LOW');
    const result = personalized(values);
    assert.equal(result.candidates[0].effectiveStyle, 'BALANCED');
    assert.equal(result.candidates[0].score, rank(values).candidates[0].score);
    assert.ok(result.warnings.some(w => w.code === 'PROFILE_FALLBACK'));
  }
});
test('movement-only data personalizes travel and explicitly falls back for shooting', () => {
  const values = options({ movementSpeed: 60 }), estimate = values[1].personalized;
  assert.equal(estimate.evaluation.timing.movement, 5);
  assert.equal(estimate.model.factors.movementSpeed.status, 'PROFILE_ESTIMATE');
  assert.equal(estimate.confidence, 'LOW'); assert.equal(estimate.fallbackSplits, 3);
  const result = personalized(values);
  assert.equal(result.candidates[0].effectiveStyle, 'PERSONALIZED');
  assert.ok(!result.warnings.some(w => w.code === 'PROFILE_FALLBACK' || /Timing unavailable/.test(w.message)));
  assert.ok(estimate.explanations.some(m => m.includes('unverified profile estimate')));
});
test('shooting-only observations work with generic movement and medium confidence', () => {
  const values = options({ shootingObservations: curve() });
  assert.equal(personalized(values).candidates[0].effectiveStyle, 'PERSONALIZED');
  assert.equal(values[1].personalized.model.factors.movementSpeed.status, 'GENERIC');
  assert.equal(values[1].personalized.confidence, 'MEDIUM');
  assert.equal(values[0].personalized.evaluation.timing.splits, 6);
});
test('complete measured profile uses each existing timing field with high confidence', () => {
  const profile = fullProfile(), values = options(profile), model = M.buildPersonalizedModel(profile);
  assert.equal(model.confidence, 'HIGH'); assert.deepEqual(model.fallback, []);
  assert.equal(values[0].personalized.confidence, 'HIGH');
  assert.equal(M.estimateMovementCost(model, 240).seconds, 2);
  assert.equal(M.estimateTransitionCost(model).seconds, profile.transitionTime);
  assert.equal(M.estimateReloadCost(model).seconds, profile.reloadTime);
  assert.equal(personalized(values).candidates[0].effectiveStyle, 'PERSONALIZED');
});
test('strong difficult-shot performance and slow movement favor less travel', () => {
  const result = personalized(options({ movementSpeed: 60, shootingObservations: curve(0.25) }));
  assert.equal(result.candidates[0].originalCandidate.id, 'short');
});
test('fast movement and high difficult-shot costs favor closer engagements unlike Balanced', () => {
  const values = options({ ...createLocalProfile().performance, movementSpeed: 240, shootingObservations: curve(2) });
  assert.equal(personalized(values).candidates[0].originalCandidate.id, 'close');
  assert.equal(rank(values).candidates[0].originalCandidate.id, 'short');
  assert.ok(personalized(values).candidates.every(c => !c.reasons.some(r => r.code === 'DIFFICULTY' || r.code === 'MOVEMENT')));
});
test('reload estimates preserve evaluator overlap, ammunition and score reload time only once', () => {
  const ctx = context(); ctx.profile = fullProfile(); ctx.profile.reloadTime = 3;
  const moving = candidate(ctx, 'moving', [[0, ['a']], [240, ['b', 'c']]], [{ positionId: '1', magazineId: 'm2' }]);
  const stationary = candidate(ctx, 'stationary', [[0, ['a']], [240, ['b', 'c']]], [{ positionId: '1', magazineId: 'm2', mode: 'stationary' }]);
  const p = moving.personalized;
  assert.deepEqual(p.evaluation, evaluateRoute(ctx.stage, ctx.plan, moving.candidate.route, p.timingProfile));
  assert.deepEqual(p.evaluation.ammo, moving.evaluation.ammo);
  assert.equal(p.evaluation.timing.rawReloadDuration, 3); assert.equal(p.evaluation.timing.reloadOverlap, 2); assert.equal(p.evaluation.timing.reloads, 1);
  const result = personalized([stationary, moving]);
  assert.equal(result.candidates[0].originalCandidate.id, 'moving');
  assert.equal(result.candidates[0].metrics.reloadOverlap, 2);
  assert.equal(result.candidates[0].reasons.find(r => r.code === 'RELOAD_TIME').contribution, 0);
  assert.ok(p.explanations.some(m => m.includes('measured reload duration hidden')));
  const slower = structuredClone(ctx); slower.profile.reloadTime = 4;
  assert.equal(P.evaluateCandidate(slower, moving.candidate).personalized.evaluation.timing.reloads, 2);
});
test('confidence distinguishes manual, sparse, variable and well-supported measurements', () => {
  assert.equal(M.buildPersonalizedModel({ movementSpeed: 80 }).confidence, 'LOW');
  assert.equal(M.buildPersonalizedModel({ movementSpeed: 80, timingEvidence: { movementSpeed: { source: 'MEASURED', sampleCount: 2 } } }).confidence, 'MEDIUM');
  const p = fullProfile(); assert.equal(M.buildPersonalizedModel(p).confidence, 'HIGH');
  p.timingEvidence.reloadTime.standardDeviation = p.reloadTime;
  assert.equal(M.buildPersonalizedModel(p).confidence, 'MEDIUM');
  p.shootingObservations = [observation(10, 0.5, 1)]; p.timingEvidence = {};
  assert.equal(M.buildPersonalizedModel(p).confidence, 'LOW');
});
test('curve interpolates only within recorded support and handles a single point', () => {
  const model = M.buildPersonalizedModel({ shootingObservations: [observation(2, 0.2), observation(10, 1)] });
  assert.ok(Math.abs(M.estimateShootingCost(model, 6).secondsPerSplit - 0.6) < 1e-10);
  assert.equal(M.estimateShootingCost(model, 6).status, 'INTERPOLATED');
  assert.equal(M.estimateShootingCost(model, 10).status, 'MEASURED');
  for (const d of [-1, 1, 11, NaN]) assert.equal(M.estimateShootingCost(model, d).status, 'FALLBACK');
  const single = M.buildPersonalizedModel({ shootingObservations: [observation(5, 0.4)] });
  assert.equal(M.estimateShootingCost(single, 5).secondsPerSplit, 0.4);
  assert.equal(M.estimateShootingCost(single, 6).status, 'FALLBACK');
});
test('malformed values, zero samples and extreme outliers reject independently without crashes', () => {
  for (const value of [null, 'bad', [], -1, Infinity, NaN]) assert.doesNotThrow(() => M.buildPersonalizedModel(value));
  const p = { drawTime: -1, reloadTime: Infinity, movementSpeed: 1e20, averageSplitTime: 0, transitionTime: '0.5', shootingObservations: [null, {}, observation(3, -1), observation(3, 1, 0), { ...observation(3, 1), measuredAt: 'bad' }, { ...observation(3, 1), standardDeviation: -1 }] };
  const model = M.buildPersonalizedModel(p);
  assert.equal(model.usable, false); assert.equal(model.curve.length, 0); assert.ok(model.warnings.length);
  assert.doesNotThrow(() => personalized(options(p)));
  assert.equal(M.buildPersonalizedModel({ movementSpeed: 80, timingEvidence: { movementSpeed: { source: 'MEASURED', sampleCount: 0 } } }).factors.movementSpeed.status, 'GENERIC');
  assert.equal(M.buildPersonalizedModel({ shootingObservations: 'bad' }).curve.length, 0);
});
test('explanations and cards report actual factor sources, route confidence and corrected timing', () => {
  const values = options({ movementSpeed: 80, shootingObservations: curve() }), result = personalized(values), card = mapPlannerResults(result)[0];
  assert.equal(card.personalizedFallback, false); assert.ok(card.personalization);
  assert.ok(card.personalization.using.includes('Movement'));
  assert.ok(card.personalization.fallback.includes('Draw'));
  assert.ok(!card.personalization.fallback.includes('Reload'));
  assert.equal(card.estimatedTime, result.candidates[0].candidate.personalized.evaluation.timing.total);
  assert.ok(card.reasons.some(m => m.includes('generic estimate')));
  assert.ok(!card.reasons.some(m => /measured movement|measured reload/.test(m)));
});
test('out-of-range route lowers confidence and explicitly reports baseline shooting fallback', () => {
  const ctx = context(); ctx.profile = fullProfile(); ctx.profile.shootingObservations = [observation(0, 0.2), observation(2, 0.4)];
  const c = candidate(ctx, 'far', [[0, ['a', 'b', 'c']]]);
  assert.equal(c.personalized.confidence, 'MEDIUM'); assert.equal(c.personalized.curveSplits, 0);
  assert.equal(c.personalized.fallbackSplits, 3);
  assert.ok(c.personalized.explanations.some(m => m.includes('no extrapolation')));
});
test('duplicate aggregates never invent sample counts and observations remain deterministic', () => {
  const observations = [observation(2, 0.4, 2), observation(2, 0.3, 8), observation(10, 1, 8)];
  const p = { shootingObservations: observations }, before = JSON.stringify(p);
  const model = M.buildPersonalizedModel(p), reversed = M.buildPersonalizedModel({ shootingObservations: [...observations].reverse() });
  assert.deepEqual(model, reversed); assert.equal(model.curve[0].sampleCount, 8);
  assert.equal(JSON.stringify(p), before);
});
test('per-target split weighting matches evaluator intervals without changing transitions or draw', () => {
  const ctx = context(); ctx.profile = fullProfile(); ctx.plan.engagements = { a: 1, b: 3, c: 5 };
  const c = candidate(ctx, 'weighted', [[0, ['a', 'b']], [300, ['c']]]), e = c.personalized;
  const expected = 2 * M.estimateShootingCost(e.model, 10).secondsPerSplit + 4 * M.estimateShootingCost(e.model, 60 / 36).secondsPerSplit;
  assert.ok(Math.abs(e.evaluation.timing.splits - expected) < 1e-10);
  assert.equal(e.evaluation.timing.transitions, ctx.profile.transitionTime);
  assert.equal(e.evaluation.timing.draw, ctx.profile.drawTime);
});
test('one-shot engagements do not invent difficulty-based acquisition time', () => {
  const ctx = context(); ctx.profile = { shootingObservations: curve() }; ctx.plan.engagements = { a: 1, b: 1, c: 1 };
  const c = candidate(ctx, 'one', [[0, ['a', 'b', 'c']]]);
  assert.equal(c.personalized.curveSplits, 0); assert.equal(c.personalized.usable, false);
  assert.equal(personalized([c]).candidates[0].effectiveStyle, 'BALANCED');
});
test('supported and unsupported shooting routes share one explicit partial-personalization comparison', () => {
  const ctx = context(); ctx.profile = { shootingObservations: [observation(0, 0.2), observation(2, 0.4)] };
  const far = candidate(ctx, 'far', [[0, ['a', 'b', 'c']]]), near = candidate(ctx, 'near', [[300, ['a', 'b', 'c']]]);
  assert.ok(personalized([far, near]).candidates.every(c => c.effectiveStyle === 'PERSONALIZED'));
  assert.equal(far.personalized.confidence, 'LOW');
});
