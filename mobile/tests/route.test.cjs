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
test('explicit reload retains one chamber round, replaces remaining magazine, and adds only uncovered reload time', () => {
  const f = fixture(); f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const result = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.deepEqual(result.ammo.map(a => a.remaining), [2, 6]);
  assert.equal(result.magazineChanges, 1); assert.equal(result.timing.reloads, 1.7);
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
test('deleted targets reconcile rounds and route references; raw stale routes still warn', () => {
  const f = fixture(); f.plan.route = f.route;
  f.stage.objects = f.stage.objects.filter(o => o.id !== f.targets[0].id);
  const plan = reconcilePlan(f.plan, f.stage), result = evaluateRoute(f.stage, plan, plan.route, f.profile);
  assert.equal(result.ammo[0].required, 0);
  assert.ok(evaluateRoute(f.stage, plan, f.route, f.profile).warnings.some(w => w.includes('deleted or non-shootable')));
  assert.deepEqual(plan.route.positions[0].visibleTargetIds, []);
  assert.deepEqual(plan.route.positions[0].engagedTargetIds, []);
  assert.equal(plan.engagements[f.targets[0].id], undefined);
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

const { assignRoundsByType, assignRounds, targetLabel } = require('../src/planning/model.ts');
const { toggleRouteTarget } = require('../src/planning/route.ts');
test('mass rounds are atomic, scoring-only, and allow independent overrides', () => {
  const f = fixture(), original = JSON.stringify(f.stage);
  const batch = assignRoundsByType(f.plan, f.stage, 'cardboardTarget', 2).plan;
  const cards = f.stage.objects.filter(o => o.type === 'cardboardTarget');
  assert.ok(cards.length > 1);
  for (const t of cards) assert.equal(batch.engagements[t.id], 2);
  const override = assignRounds(batch, f.stage, cards[0].id, 3).plan;
  assert.equal(override.engagements[cards[0].id], 3);
  assert.equal(override.engagements[cards[1].id], 2);
  for (const invalid of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER]) assert.equal(assignRoundsByType(f.plan, f.stage, 'cardboardTarget', invalid).plan, f.plan);
  assert.equal(assignRoundsByType(f.plan, f.stage, 'noShootTarget', 2).plan, f.plan);
  assert.equal(JSON.stringify(f.stage), original);
  assert.equal(targetLabel(f.stage, cards[0].id), 'Cardboard 1');
  assert.equal(targetLabel(f.stage, cards[1].id), 'Cardboard 2');
});
test('canvas toggles preserve visibility, engagement ownership, and physical positions', () => {
  const f = fixture(), id = f.targets[0].id;
  const moved = toggleRouteTarget(f.route, f.stage, 'B', id, 'engaged');
  assert.equal(moved.positions[0].engagedTargetIds.includes(id), false);
  assert.equal(moved.positions[0].visibleTargetIds.includes(id), true);
  assert.equal(moved.positions[1].visibleTargetIds.includes(id), true);
  const cleared = toggleRouteTarget(moved, f.stage, 'B', id, 'engaged');
  assert.equal(cleared.positions[1].engagedTargetIds.includes(id), false);
  assert.equal(cleared.positions[1].visibleTargetIds.includes(id), true);
  const hidden = toggleRouteTarget(moved, f.stage, 'B', id, 'visible');
  assert.equal(hidden.positions[1].engagedTargetIds.includes(id), false);
  assert.equal(hidden.positions[1].visibleTargetIds.includes(id), false);
  assert.equal(toggleRouteTarget(hidden, f.stage, 'B', id, 'visible').positions[1].visibleTargetIds.includes(id), true);
  for (const targetId of ['missing', f.stage.objects.find(o => o.type === 'start').id]) assert.equal(toggleRouteTarget(f.route, f.stage, 'A', targetId, 'engaged'), f.route);
  assert.equal(toggleRouteTarget(f.route, f.stage, 'missing', id, 'visible'), f.route);
  assert.deepEqual(moved.positions.map(p => p.position), f.route.positions.map(p => p.position));
  assert.equal(evaluateRoute(f.stage, f.plan, moved, f.profile).distance, evaluateRoute(f.stage, f.plan, f.route, f.profile).distance);
});

test('moving reload fully hidden by its incoming movement without double counting', () => {
  const f = fixture(); f.profile.reloadTime = 1; f.profile.movementSpeed = 36 / 1.4;
  f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const before = JSON.stringify(f), result = evaluateRoute(f.stage, f.plan, f.route, f.profile), t = result.timing;
  assert.equal(t.reloads, 0); assert.equal(t.rawReloadDuration, 1); assert.equal(t.reloadOverlap, 1);
  assert.equal(t.reloadMovementAvailable, 1.4);
  assert.equal(t.total, t.movement + t.draw + t.splits + t.transitions);
  assert.deepEqual(evaluateRoute(f.stage, f.plan, f.route, f.profile), result);
  assert.equal(JSON.stringify(f), before);
});
test('partial overlap at final position uses only its incoming segment', () => {
  const f = fixture(); f.profile.reloadTime = 1; f.profile.movementSpeed = 60;
  f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const t = evaluateRoute(f.stage, f.plan, f.route, f.profile).timing;
  assert.deepEqual(t.reloadDetails, [{ positionId: 'B', magazineId: 'm2', mode: 'moving', rawDuration: 1, availableMovement: 0.6, overlap: 0.6, additionalPenalty: 0.4 }]);
  assert.equal(t.total, t.movement + t.draw + t.splits + t.transitions + 0.4);
});
test('stationary reload preserves full duration and identical ammunition', () => {
  const f = fixture(); f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const moving = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  f.route.reloads[0].mode = 'stationary';
  const stationary = evaluateRoute(f.stage, f.plan, f.route, f.profile);
  assert.deepEqual(stationary.ammo, moving.ammo);
  assert.equal(stationary.timing.reloads, 2); assert.equal(stationary.timing.reloadOverlap, 0);
  assert.equal(stationary.timing.reloadMovementAvailable, 0);
  assert.equal(isStageRoute(f.route), true);
  f.route.reloads[0].mode = 'invalid'; assert.equal(isStageRoute(f.route), false);
});
test('zero incoming movement and missing start provide no overlap', () => {
  const f = fixture(); f.route.positions[1].position = { ...f.route.positions[0].position };
  f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  assert.equal(evaluateRoute(f.stage, f.plan, f.route, f.profile).timing.reloads, 2);
  f.stage.objects = f.stage.objects.filter(o => o.type !== 'start');
  f.route.reloads[0].positionId = 'A';
  assert.equal(evaluateRoute(f.stage, f.plan, f.route, f.profile).timing.reloadMovementAvailable, 0);
});
test('invalid reloads never receive overlap credit or change ammunition', () => {
  const f = fixture();
  for (const reload of [{ positionId: 'B', magazineId: 'missing' }, { positionId: 'B', magazineId: 'm1' }, { positionId: 'deleted', magazineId: 'm2' }]) {
    f.route.reloads = [reload];
    const r = evaluateRoute(f.stage, f.plan, f.route, f.profile);
    assert.equal(r.magazineChanges, 0); assert.equal(r.ammo[1].sufficient, false);
    assert.equal(r.timing.reloads, 0); assert.equal(r.timing.reloadOverlap, 0);
    assert.deepEqual(r.timing.reloadDetails, []); assert.ok(r.warnings.length);
  }
});
test('missing or negative reload time disables timing but preserves ammo simulation', () => {
  const f = fixture(); f.route.reloads = [{ positionId: 'B', magazineId: 'm2' }];
  const expected = evaluateRoute(f.stage, f.plan, f.route, f.profile).ammo;
  for (const reloadTime of [undefined, -1, NaN]) {
    const r = evaluateRoute(f.stage, f.plan, f.route, { ...f.profile, reloadTime });
    assert.equal(r.timing, null); assert.deepEqual(r.ammo, expected);
    assert.ok(r.warnings.some(w => w.includes('Timing unavailable')));
  }
});
test('separate reload segments cannot share unused movement overlap', () => {
  const f = fixture(); f.profile.movementSpeed = 30; f.profile.reloadTime = 1.5;
  f.plan.loadout.magazines.push({ id: 'm3', capacity: 10, startingRounds: 8 });
  f.route.reloads = [{ positionId: 'A', magazineId: 'm2' }, { positionId: 'B', magazineId: 'm3' }];
  const r = evaluateRoute(f.stage, f.plan, f.route, f.profile), t = r.timing;
  assert.equal(r.magazineChanges, 2); assert.equal(t.rawReloadDuration, 3);
  assert.equal(t.reloadMovementAvailable, 3.2); assert.equal(t.reloadOverlap, 2.7);
  assert.ok(Math.abs(t.reloads - 0.3) < 1e-10);
  assert.equal(t.reloadDetails.length, 2);
});
