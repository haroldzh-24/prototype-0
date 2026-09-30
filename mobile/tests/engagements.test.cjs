const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute, isStageRoute } = require('../src/planning/route.ts');
const { analyzeEngagements, suggestEngagements, reorderEngagement, defaultEngagementRules, engagementLabel } = require('../src/planning/engagements.ts');
const { generateCandidates, createRoutePlannerConfig, evaluateCandidate, rankCandidates } = require('../src/planning/planner.ts');
const { copyPlannerRoute } = require('../src/planning/plannerUI.ts');
const { stageToViewport } = require('../src/stage/coordinates.ts');
const p = (x, y) => ({ space: 'stage', x, y, z: 0 });
const area = (id, x0, y0, x1, y1) => ({ id, vertices: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
function fixture() {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start', 'start', 20, 300), createObject('cardboardTarget', 't1', 200, 100)];
  const route = createRoute('route'); route.engagementRules = { ...defaultEngagementRules(), firingAreas: [area('a', 0, 0, 400, 400)] };
  route.positions = [{ id: 'w1', label: 'End', position: p(380, 300), visibleTargetIds: [], engagedTargetIds: [] }];
  const plan = createPlan(); plan.route = route; plan.engagements = { t1: 2 };
  plan.loadout = { chamberLoaded: false, startingMagazineId: 'm', magazines: [{ id: 'm', capacity: 30, startingRounds: 30 }] };
  return { stage, route, plan };
}
function doorway(f, width = 20) {
  const wall = createObject('wall', 'wall', 200, 200); wall.geometry = { length: 400, thickness: 2, height: 96 };
  wall.ports = [{ id: 'door', offset: 0, width, height: 90, sill: 0 }]; f.stage.objects.push(wall); return wall;
}
function solved(f) { const route = suggestEngagements(f.stage, f.route); return { route, result: analyzeEngagements(f.stage, route) }; }
for (const [name, from, to] of [
  ['advances', p(200, 350), p(200, 200)], ['retreats', p(200, 200), p(200, 350)],
  ['moves laterally', p(20, 300), p(380, 300)], ['moves diagonally', p(20, 350), p(300, 200)],
]) test(`target continuously visible while competitor ${name}`, () => {
  const f = fixture(); f.stage.objects[0].position = from; f.route.positions[0].position = to;
  const { result } = solved(f); assert.equal(result.complete, true); assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].startDistanceAlongSegment, 0);
  assert.equal(result.windows[0].endDistanceAlongSegment, Math.hypot(to.x - from.x, to.y - from.y));
  assert.equal(result.nodes[0].kind, 'moving');
});
test('doorway reveals a window while endpoints are hidden, including sub-sample openings', () => {
  const f = fixture(); doorway(f, 0.5); f.route.engagementRules.sampleSpacingInches = 24;
  // Thin wall is necessary for a narrow projected opening at an oblique ray.
  f.stage.objects.at(-1).geometry.thickness = 0.01;
  const { result } = solved(f); assert.equal(result.complete, true); assert.equal(result.windows.length, 1);
  const w = result.windows[0]; assert.ok(w.startDistanceAlongSegment > 170 && w.endDistanceAlongSegment < 190);
  assert.ok(w.endDistanceAlongSegment - w.startDistanceAlongSegment < 2);
  assert.deepEqual(result.alternatives[0].stationaryWaypointIds, []);
});
test('sequential doorway targets engage by availability and earliest closing window', () => {
  const f = fixture(); doorway(f, 30);
  f.stage.objects.push(createObject('cardboardTarget', 't2', 160, 100), createObject('cardboardTarget', 't3', 240, 100));
  const { result } = solved(f); assert.equal(result.complete, true);
  assert.deepEqual(result.nodes.flatMap(n => n.targets.map(t => t.targetId)), ['t3', 't1', 't2']);
  assert.deepEqual(result.nodes.flatMap(n => n.targets.map(t => t.orderLabel)), ['A', 'B', 'C']);
  assert.match(result.nodes[0].targets[0].reason, /Earliest closing/);
});
test('overlapping windows form a continuous moving sequence without stops', () => {
  const f = fixture(); doorway(f, 100); f.stage.objects.push(createObject('cardboardTarget', 't2', 180, 100));
  const { result, route } = solved(f); assert.equal(result.complete, true);
  assert.ok(result.windows[1].startDistanceAlongSegment < result.windows[0].endDistanceAlongSegment);
  assert.equal(new Set(result.nodes.map(n => n.waypointId)).size, 1); assert.ok(result.nodes.every(n => n.kind === 'moving'));
  assert.equal(route.positions.length, 1);
});
test('visibility ends behind the wall and illegal reversed doorway order is rejected', () => {
  const f = fixture(); doorway(f, 20); f.stage.objects.push(createObject('cardboardTarget', 't2', 160, 100));
  const { route, result } = solved(f);
  assert.ok(result.windows.every(w => w.endDistanceAlongSegment < 360));
  const changed = reorderEngagement(f.stage, route, 'w1', 't1', 1);
  assert.ok(changed.error); assert.equal(changed.route, route);
});
test('visible target loses firing legality when crossing firing-area boundary', () => {
  const f = fixture(); f.route.engagementRules.firingAreas = [area('a', 0, 0, 150, 400)];
  const { result } = solved(f); assert.equal(result.complete, true);
  assert.ok(Math.abs(result.windows[0].endDistanceAlongSegment - 130) < 0.001);
  assert.equal(result.segments[0].traversable, true); assert.ok(result.segments[0].noFiringIntervals.length);
});
test('180 violation clips only the illegal portion of movement', () => {
  const f = fixture(); f.route.engagementRules.safeDirectionDegrees = 0;
  const { result } = solved(f); assert.equal(result.complete, true);
  assert.ok(result.windows[0].endDistanceAlongSegment < 180);
  assert.ok(result.windows[0].endDistanceAlongSegment > 179.99);
});
test('narrower safe angle clips both ends of engagement window', () => {
  const f = fixture(); f.route.engagementRules.safeHalfAngleDegrees = 30;
  const { result } = solved(f); const w = result.windows[0];
  assert.ok(w.startDistanceAlongSegment > 60); assert.ok(w.endDistanceAlongSegment < 300);
  assert.equal(result.complete, true);
});
test('leaving fault-line area stops firing and entering next area resumes without stopping travel', () => {
  const f = fixture(); f.route.engagementRules.firingAreas = [area('a', 0, 0, 150, 400), area('b', 250, 0, 400, 400)];
  const raw = analyzeEngagements(f.stage, f.route); assert.equal(raw.windows.length, 2);
  assert.ok(raw.windows[0].endDistanceAlongSegment < raw.windows[1].startDistanceAlongSegment);
  assert.ok(Math.abs(raw.segments[0].noFiringIntervals[0].start - 130) < 0.001);
  f.route.engagementRules.allowOutsideTravel = false;
  const blocked = solved(f).result; assert.equal(blocked.complete, false); assert.equal(blocked.windows.length, 0);
});
test('movement never crosses a solid wall or a projected firing port', () => {
  const f = fixture(); doorway(f, 100); f.route.positions[0].position = p(200, 100);
  const { result } = solved(f); assert.equal(result.complete, false); assert.equal(result.segments[0].traversable, false);
  assert.equal(result.nodes.length, 0);
});
test('stationary node is retained when movement engagement is forbidden', () => {
  const f = fixture(); f.route.engagementRules.targetProcedures.t1 = { stationaryOnly: true };
  const { result } = solved(f); assert.equal(result.complete, true); assert.equal(result.nodes[0].kind, 'stationary');
  assert.equal(result.windows.length, 0);
});
test('several targets share one stationary circle and ordered A/B/C/D arrows', () => {
  const f = fixture(); f.route.engagementRules.allowMoving = false;
  for (let i = 2; i <= 4; i++) f.stage.objects.push(createObject('cardboardTarget', `t${i}`, 160 + i * 20, 100));
  const { route, result } = solved(f); assert.equal(result.nodes.length, 1);
  assert.deepEqual(result.nodes[0].targets.map(t => t.orderLabel), ['A', 'B', 'C', 'D']);
  const edited = reorderEngagement(f.stage, route, 'w1', 't2', -1); assert.equal(edited.error, undefined);
  const next = analyzeEngagements(f.stage, edited.route);
  assert.equal(next.nodes[0].targets[0].targetId, 't2'); assert.equal(next.nodes[0].targets[0].orderLabel, 'A');
  assert.equal(engagementLabel(26), 'AA');
});
test('overlapping moving target order is editable and survives serialization', () => {
  const f = fixture(); f.stage.objects.push(createObject('cardboardTarget', 't2', 220, 100));
  const { route } = solved(f), first = route.positions[0].engagedTargetIds[0];
  const change = reorderEngagement(f.stage, route, 'w1', first, 1); assert.equal(change.error, undefined);
  const loaded = JSON.parse(JSON.stringify(change.route)); assert.equal(isStageRoute(loaded), true);
  const result = analyzeEngagements(f.stage, loaded);
  assert.equal(result.nodes[0].targets[0].targetId, loaded.positions[0].engagedTargetIds[0]);
  assert.equal(result.nodes[0].targets[0].orderLabel, 'A'); assert.equal(result.complete, true);
});
test('viewport zoom/pan never changes inch-based windows or persisted stage geometry', () => {
  const f = fixture(); doorway(f); const before = JSON.stringify(f.stage), route = solved(f).route;
  const a = analyzeEngagements(f.stage, route);
  for (const scale of [0.5, 1, 3]) stageToViewport(a.windows[0].startPosition, { scale, offsetX: 123, offsetY: -90 });
  assert.deepEqual(analyzeEngagements(f.stage, route), a); assert.equal(JSON.stringify(f.stage), before);
});
test('same stage always produces deterministic assignments/windows and exposes both alternatives', () => {
  const f = fixture(), a = solved(f); for (let i = 0; i < 5; i++) assert.deepEqual(solved(f), a);
  assert.deepEqual(a.result.alternatives[0].movingSegmentIds, ['w1']);
  assert.deepEqual(a.result.alternatives[0].stationaryWaypointIds, ['w1']);
});
test('target completed earlier is not scheduled again on later segments', () => {
  const f = fixture(); f.route.positions.push({ ...f.route.positions[0], id: 'w2', position: p(100, 250) });
  const { result } = solved(f); assert.equal(result.nodes.flatMap(n => n.targets).length, 1);
  assert.ok(result.windows.every(w => w.routeSegmentId === 'w1'));
});
test('IDPA requires explicit cover/exposure areas; procedures govern all engagement types', () => {
  const f = fixture(); f.route.engagementRules.ruleset = 'IDPA';
  assert.equal(solved(f).result.complete, false);
  f.route.engagementRules.targetProcedures.t1 = { areaIds: ['a'] }; assert.equal(solved(f).result.complete, true);
  f.route.engagementRules.targetProcedures.t1.stationaryOnly = true; assert.equal(solved(f).result.nodes[0].kind, 'stationary');
  f.route.engagementRules.ruleset = 'PCSL'; f.route.engagementRules.targetProcedures.t1.areaIds = ['missing'];
  assert.equal(solved(f).result.complete, false);
});
test('stage procedure target ordering is enforced and cannot be edited away', () => {
  const f = fixture(); f.stage.objects.push(createObject('cardboardTarget', 't2', 200, 100));
  f.route.engagementRules.targetProcedures.t1 = { afterTargetIds: ['t2'] };
  const { route, result } = solved(f); assert.equal(result.complete, true); assert.equal(route.positions[0].engagedTargetIds[0], 't2');
  assert.ok(reorderEngagement(f.stage, route, 'w1', 't2', 1).error);
});
test('moving assignment introduces no waypoint; deleting target reconciles assignment', () => {
  const f = fixture(), original = JSON.stringify(f.route), { route } = solved(f);
  assert.equal(JSON.stringify(f.route), original); assert.deepEqual(route.positions.map(p => p.position), f.route.positions.map(p => p.position));
  f.plan.route = route; f.stage.objects = f.stage.objects.filter(o => o.id !== 't1');
  const cleaned = reconcilePlan(f.plan, f.stage); assert.deepEqual(cleaned.route.positions[0].movingTargetIds, []); assert.equal(isStageRoute(cleaned.route), true);
});
test('geometry planner covers doorway targets without endpoint visibility or extra stops', () => {
  const f = fixture(); doorway(f); const config = createRoutePlannerConfig(), context = { ...f, profile: null };
  const generated = generateCandidates(context, config); assert.equal(generated.status, 'GENERATED');
  assert.equal(generated.candidates[0].route.positions.length, 1); assert.deepEqual(generated.candidates[0].route.positions[0].movingTargetIds, ['t1']);
  const ranked = rankCandidates(generated.candidates.map(c => evaluateCandidate(context, c)), config);
  assert.equal(ranked.candidates.length, 1); assert.equal(ranked.candidates[0].reasons[0].code, 'GEOMETRY_FIRST');
});
test('copied planner rules and moving order are independent of the preview', () => {
  const f = fixture(), { route } = solved(f), copied = copyPlannerRoute(createPlan(), route);
  copied.route.engagementRules.firingAreas[0].vertices[0].x = 1; copied.route.positions[0].movingTargetIds.length = 0;
  assert.equal(route.engagementRules.firingAreas[0].vertices[0].x, 0); assert.deepEqual(route.positions[0].movingTargetIds, ['t1']);
});
test('moving-fire timing does not invent shooter penalties; reload segment is stationary', () => {
  const f = fixture(), profile = { drawTime: 1, reloadTime: 2, averageSplitTime: 0.2, transitionTime: 0.4, movementSpeed: 100 };
  const { route } = solved(f), result = evaluateRoute(f.stage, f.plan, route, profile);
  assert.equal(result.ammo[0].required, 2); assert.equal(result.timing, null);
  f.route.reloads = [{ positionId: 'w1', magazineId: 'm2' }];
  assert.equal(solved(f).result.nodes[0].kind, 'stationary');
});
test('stale geometry invalidates saved assignments and search budgets fail closed', () => {
  const f = fixture(), { route } = solved(f); doorway(f).ports = [];
  assert.equal(analyzeEngagements(f.stage, route).complete, false);
  f.route.positions[0].position = p(1e7, 300); const huge = analyzeEngagements(f.stage, f.route);
  assert.equal(huge.truncated, true); assert.equal(huge.complete, false);
});
test('invalid saved settings and malformed moving assignments are rejected', () => {
  const f = fixture(), { route } = solved(f); route.engagementRules.sampleSpacingInches = 0;
  assert.equal(isStageRoute(route), false); route.engagementRules.sampleSpacingInches = 2;
  route.positions[0].movingTargetIds = ['missing']; assert.equal(isStageRoute(route), false);
});
test('stationary procedure dependencies are ordered before their dependents', () => {
  const f = fixture(); f.route.engagementRules.allowMoving = false;
  f.stage.objects.push(createObject('cardboardTarget', 't2', 220, 100));
  f.route.engagementRules.targetProcedures.t1 = { afterTargetIds: ['t2'] };
  const { route, result } = solved(f); assert.equal(result.complete, true);
  assert.deepEqual(route.positions[0].engagedTargetIds, ['t2', 't1']);
  assert.ok(reorderEngagement(f.stage, route, 'w1', 't2', 1).error);
});
test('stationary engagement defers to a later moving window to avoid an unnecessary stop', () => {
  const f = fixture(); f.stage.objects[0].position = p(20, 300);
  f.route.positions = [{ ...f.route.positions[0], position: p(20, 300) }, { ...f.route.positions[0], id: 'w2' }];
  const { result } = solved(f); assert.equal(result.complete, true);
  assert.ok(result.nodes.every(n => n.kind === 'moving' && n.waypointId === 'w2'));
});
