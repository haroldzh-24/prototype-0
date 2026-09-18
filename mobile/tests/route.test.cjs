const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage } = require('../src/stage/defaults.ts');
const { createPlan, isEngageable, reconcilePlan } = require('../src/planning/model.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { createRoute, movePosition, reorderPosition, engageAt, evaluateRoute, isStageRoute } = require('../src/planning/route.ts');
function fixture() {
  const stage = createDefaultStage(), plan = createPlan(), profile = createLocalProfile().performance;
  const targets = stage.objects.filter(isEngageable);
  const start = stage.objects.find(o => o.type === 'start'); start.position = { space: 'stage', x: 0, y: 0, z: 0 };
  const route = createRoute('r');
  route.positions = ['A', 'B'].map((label, index) => ({ id: label, label, position: { space: 'stage', x: 36 + index * 36, y: 48, z: 0 }, visibleTargetIds: [targets[index].id], engagedTargetIds: [targets[index].id] }));
  plan.loadout = { startingMagazineId: 'm1', chamberLoaded: true, magazines: [{ id: 'm1', capacity: 10, startingRounds: 5 }, { id: 'm2', capacity: 10, startingRounds: 8 }] };
  plan.engagements = { [targets[0].id]: 4, [targets[1].id]: 3 };
  return { stage, plan, profile, route, targets };
}
test('route uses physical start and 3-4-5 distances, order, and fresh profile timing', () => {
  const f = fixture(), result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.deepEqual(result.segments.map(s => s.distance), [60, 36]);
  assert.equal(result.distance, 96); assert.equal(result.timing.movement, 0.8);
  assert.equal(result.timing.draw, 1.5); assert.equal(result.timing.splits, 1.25);
  assert.equal(evaluateRoute(f.stage, f.plan, f.route, { ...f.profile, movementSpeed: 60 }).timing.movement, 1.6);
  assert.equal(reorderPosition(f.route, 'B', -1).positions[0].id, 'B');
  assert.equal(f.route.positions[0].id, 'A');
  assert.equal(reorderPosition(f.route, 'A', -1), f.route);
});
test('ammunition reports position shortage despite enough carried reserve', () => {
  const f = fixture(), result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.equal(result.startingRounds, 6);
  assert.deepEqual(result.ammo.map(a => [a.available, a.required, a.remaining, a.sufficient]), [[6, 4, 2, true], [2, 3, 0, false]]);
  assert.ok(result.warnings.some(w => w.includes('cannot complete')));
  assert.equal(f.plan.loadout.magazines[0].startingRounds, 5);
});
test('explicit reload retains one chamber round, replaces remaining magazine, and adds reload time', () => {
  const f = fixture(); f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.deepEqual(result.ammo.map(a => a.remaining), [2, 6]);
  assert.equal(result.magazineChanges, 1); assert.equal(result.timing.reloads, 2);
  assert.ok(result.ammo.every(a => a.sufficient));
});
test('empty chamber reload and initially uninserted magazines do not invent rounds', () => {
  const f = fixture(); f.plan.loadout.chamberLoaded = false;
  f.plan.engagements[f.targets[0].id] = 5; f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  assert.equal(evaluateRoute(f.stage, f.plan, f.route, f.profile).ammo[1].available, 8);
  f.plan.loadout.startingMagazineId = null;
  assert.equal(evaluateRoute(f.stage, f.plan, f.route, f.profile).startingRounds, 0);
});
test('missing and reused reload magazines warn and cannot supply ammunition', () => {
  const f = fixture();
  for (const magazineId of ['missing', 'm1']) {
    f.route.reloads = [{ positionId: 'B', magazineId }];
    const result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
    assert.equal(result.magazineChanges, 0); assert.equal(result.ammo[1].available, 2);
    assert.ok(result.warnings.some(w => w.includes('missing or already used')));
  }
});
test('visibility may overlap while intended engagement moves atomically', () => {
  const f = fixture(), route = engageAt(f.route, 'B', f.targets[0].id);
  assert.ok(route.positions.every(p => p.visibleTargetIds.includes(f.targets[0].id)));
  assert.deepEqual(route.positions[0].engagedTargetIds, []);
  assert.ok(route.positions[1].engagedTargetIds.includes(f.targets[0].id));
  assert.equal(f.route.positions[0].engagedTargetIds.length, 1);
});
test('deleted target warnings survive existing plan reconciliation and consume no rounds', () => {
  const f = fixture(); f.plan.route = f.route;
  f.stage.objects = f.stage.objects.filter(o => o.id !== f.targets[0].id);
  const plan = reconcilePlan(f.plan, f.stage), result = evaluateRoute(f.stage, plan, plan.route, f.profile);
  assert.equal(result.ammo[0].required, 0);
  assert.ok(result.warnings.some(w => w.includes('deleted or non-shootable')));
  assert.equal(plan.route, f.route);
});
test('missing round counts and unengaged targets warn instead of assuming defaults', () => {
  const f = fixture(); delete f.plan.engagements[f.targets[0].id];
  const result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.ok(result.warnings.some(w => w.includes('set planned rounds')));
  assert.ok(result.warnings.some(w => w.includes('no route engagement')));
  assert.equal(result.ammo[0].required, 0);
});
test('route movement clamps physical coordinates and rejects non-finite edits', () => {
  const f = fixture(), route = movePosition(f.route, 'A', { space: 'stage', x: -50, y: 9999, z: 10 }, f.stage.stage);
  assert.deepEqual(route.positions[0].position, { space: 'stage', x: 0, y: f.stage.stage.depth, z: 0 });
  assert.equal(movePosition(f.route, 'A', { x: NaN, y: 1 }, f.stage.stage), f.route);
});
test('route shape guards invalid versions, duplicate IDs, and malformed saved coordinates', () => {
  const f = fixture(); assert.equal(isStageRoute(f.route), true);
  for (const route of [null, {}, { ...f.route, version: 9 }, { ...f.route, positions: [...f.route.positions, f.route.positions[0]] }, { ...f.route, positions: [{ ...f.route.positions[0], position: null }] }]) assert.equal(isStageRoute(route), false);
});
test('invalid profile disables timing without hiding ammunition and geometry', () => {
  const f = fixture();
  for (const profile of [null, { ...f.profile, movementSpeed: 0 }]) {
    const result = evaluateRoute(f.stage, f.plan, f.route, profile);
    assert.equal(result.timing, null); assert.equal(result.distance, 96); assert.equal(result.ammo.length, 2);
  }
});
