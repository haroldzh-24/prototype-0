const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { generatePlannerCards, mapPlannerResults, copyPlannerRoute } = require('../src/planning/plannerUI.ts');
const { plannerPreviewRoute, plannerDetails, plannerSearchWarning, rulesets, rulesetMetadata } = require('../src/planning/plannerUI.ts');
const P = require('../src/planning/planner.ts');
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable } = require('../src/planning/model.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
function fixture() {
  const stage = createDefaultStage(), plan = createPlan();
  const ids = stage.objects.filter(isEngageable).map(t => t.id);
  plan.engagements = Object.fromEntries(ids.map(id => [id, 2]));
  plan.loadout = { chamberLoaded: false, startingMagazineId: 'a', magazines: [
    { id: 'a', capacity: 20, startingRounds: 1 }, { id: 'b', capacity: 20, startingRounds: 20 },
  ] };
  plan.route = createRoute('manual');
  plan.route.positions = [{ id: 'p', label: 'P1', position: { space: 'stage', x: 100, y: 100, z: 0 }, visibleTargetIds: ids, engagedTargetIds: [] }];
  return { stage, plan, profile: createLocalProfile().performance };
}

const { preparePositionSource, discoveryGeometryKey, currentDiscovery } = require('../src/planning/positionSources.ts');
const { discoverCandidatePositions, computeTargetVisibility } = require('../src/planning/positionDiscovery.ts');
function session(context, candidates) {
  return { geometryKey: discoveryGeometryKey(context.stage), result: { candidates, warnings: [], search: { truncated: false } } };
}
function auto(context, id = 'auto', x = 200, ids) {
  const position = { space: 'stage', x, y: 100, z: 0 };
  const visibility = computeTargetVisibility(position, context.stage.objects.filter(isEngageable), []);
  return { ...visibility, id, position, source: 'AUTO_DISCOVERED', reachability: 'NOT_EVALUATED', distanceFromStart: 0, ...(ids ? { visibleTargetIds: ids } : {}) };
}
const prepare = (c, mode, candidates) => preparePositionSource(c, mode, session(c, candidates));
test('MANUAL preserves original context, visibility and planner behavior', () => {
  const c = fixture(), p = prepare(c, 'MANUAL', [auto(c)]);
  assert.equal(p.context, c);
  assert.deepEqual(generatePlannerCards(p.context, P.createRoutePlannerConfig()), generatePlannerCards(c, P.createRoutePlannerConfig()));
});
test('AUTO uses discovered positions and inferred visibility without manual candidates', () => {
  const c = fixture(), a = auto(c), p = prepare(c, 'AUTO', [a]);
  assert.deepEqual(p.context.plan.route.positions.map(p => p.id), [a.id]);
  assert.deepEqual(p.context.plan.route.positions[0].visibleTargetIds, a.visibleTargetIds);
  assert.notEqual(p.context.plan.route.positions[0].visibleTargetIds, a.visibleTargetIds);
  assert.equal(p.metadata[a.id].discovery, a);
});
test('COMBINED preserves manual visibility and adds auto visibility without mutation', () => {
  const c = fixture(); c.plan.route.positions[0].visibleTargetIds = [];
  const before = JSON.stringify(c), a = auto(c), p = prepare(c, 'COMBINED', [a]);
  assert.equal(p.context.plan.route.positions.length, 2);
  assert.deepEqual(p.context.plan.route.positions[0].visibleTargetIds, []);
  assert.deepEqual(p.context.plan.route.positions[1].visibleTargetIds, a.visibleTargetIds);
  assert.equal(JSON.stringify(c), before);
});
test('manual wins near-duplicate only when visibility is equivalent', () => {
  const c = fixture(), a = auto(c, 'a', 102);
  assert.equal(prepare(c, 'COMBINED', [a]).context.plan.route.positions.length, 1);
  a.visibleTargetIds = a.visibleTargetIds.slice(0, 1);
  assert.equal(prepare(c, 'COMBINED', [a]).context.plan.route.positions.length, 2);
});
test('incomplete auto coverage is reported before generation', () => {
  const c = fixture(), a = auto(c); a.visibleTargetIds = a.visibleTargetIds.slice(0, 1);
  const p = prepare(c, 'AUTO', [a]);
  assert.equal(p.covered, 1); assert.ok(p.warnings.some(w => w.includes('Incomplete coverage')));
});
test('COMBINED falls back to manual for empty or invalid discovery', () => {
  const c = fixture(), a = auto(c); a.position.x = NaN;
  for (const candidates of [[], [a]]) {
    const p = prepare(c, 'COMBINED', candidates);
    assert.deepEqual(p.context.plan.route.positions, c.plan.route.positions);
    assert.ok(generatePlannerCards(p.context, P.createRoutePlannerConfig()).cards.length);
  }
});
test('geometry changes invalidate cached discovery and exclude stale auto positions', () => {
  const c = fixture(), cached = session(c, [auto(c)]);
  assert.equal(currentDiscovery(c.stage, cached), cached.result);
  for (const change of [s => s.stage.width++, s => s.objects.find(isEngageable).position.x++, s => s.objects.push({ id: 'wall-new', type: 'wall' }), s => { s.objects[0].ports = [{ width: 10 }]; }]) {
    const changed = structuredClone(c); change(changed.stage);
    assert.equal(currentDiscovery(changed.stage, cached), null);
    assert.equal(preparePositionSource(changed, 'AUTO', cached).searchCount, 0);
    assert.ok(preparePositionSource(changed, 'COMBINED', cached).warnings.some(w => w.includes('stale')));
  }
  c.plan.engagements = {}; assert.equal(currentDiscovery(c.stage, cached), cached.result);
});
test('accepted auto route is normal independently editable data with informational source counts', () => {
  const c = fixture(), p = prepare(c, 'AUTO', [auto(c)]);
  const card = generatePlannerCards(p.context, P.createRoutePlannerConfig(), p.metadata).cards[0];
  assert.ok(card); assert.deepEqual(card.sourceCounts, { auto: 1, manual: 0 });
  const next = copyPlannerRoute(c.plan, card.route, true);
  assert.ok(isStageRoute(next.route));
  assert.equal(next.route.positions[0].source, undefined);
  next.route.positions[0].position.x++;
  assert.notEqual(next.route.positions[0].position.x, card.route.positions[0].position.x);
});
test('discovery preview and generated route preview leave manual route untouched', () => {
  const c = fixture(), before = JSON.stringify(c), cached = session(c, [auto(c)]);
  const preview = currentDiscovery(c.stage, cached).candidates;
  const p = preparePositionSource(c, 'AUTO', cached);
  const card = generatePlannerCards(p.context, P.createRoutePlannerConfig(), p.metadata).cards[0];
  assert.ok(preview.length); assert.equal(plannerPreviewRoute(c.plan, card), card.route);
  assert.equal(plannerPreviewRoute(c.plan, null), c.plan.route);
  assert.equal(JSON.stringify(c), before);
});
test('pool reduction reserves manual positions and retains rare target coverage', () => {
  const c = fixture(), ids = c.plan.route.positions[0].visibleTargetIds;
  c.plan.route.positions[0].visibleTargetIds = ids.slice(0, -1);
  const candidates = Array.from({ length: 20 }, (_, i) => auto(c, 'a' + i, 200 + i, ids.slice(0, -1)));
  candidates.push(auto(c, 'rare', 240, ids.slice(-1)));
  const p = prepare(c, 'COMBINED', candidates);
  assert.equal(p.searchCount, 12); assert.equal(p.covered, ids.length);
  assert.equal(p.context.plan.route.positions[0], c.plan.route.positions[0]);
  assert.ok(p.context.plan.route.positions.some(p => p.id === 'rare'));
  assert.ok(p.warnings.some(w => w.includes('Limited search pool')));
});
test('auto IDs cannot collide with manual IDs or one another', () => {
  const c = fixture(), p = prepare(c, 'COMBINED', [auto(c, 'p'), auto(c, 'p', 240)]);
  const ids = p.context.plan.route.positions.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length); assert.equal(ids[0], 'p');
});
test('discovery failures and search warnings survive integration without crashing', () => {
  for (const change of [s => { s.objects = []; }, s => { s.stage.width = 0; }, s => { s.objects.find(isEngageable).position.x = NaN; }]) {
    const c = fixture(); change(c.stage);
    const cached = { geometryKey: discoveryGeometryKey(c.stage), result: discoverCandidatePositions(c.stage) };
    const p = preparePositionSource(c, 'AUTO', cached);
    assert.ok(p.warnings.length); assert.doesNotThrow(() => generatePlannerCards(p.context, P.createRoutePlannerConfig()));
  }
  const c = fixture(), cached = session(c, []); cached.result.warnings.push({ code: 'SEARCH_LIMIT', message: 'Search limit reached' });
  assert.ok(preparePositionSource(c, 'AUTO', cached).warnings.includes('Search limit reached'));
});

test('real discovery integrates through generation and ranking without changing the stage or manual plan', () => {
  const c = fixture(); c.stage.objects = c.stage.objects.filter(o => o.type !== 'wall');
  const before = JSON.stringify(c), result = discoverCandidatePositions(c.stage);
  assert.ok(result.candidates.length);
  const p = preparePositionSource(c, 'AUTO', { geometryKey: discoveryGeometryKey(c.stage), result });
  const cards = generatePlannerCards(p.context, P.createRoutePlannerConfig(), p.metadata).cards;
  assert.ok(cards.length); assert.ok(cards.every(card => card.sourceCounts.auto === card.positions && card.sourceCounts.manual === 0));
  assert.equal(JSON.stringify(c), before);
});
