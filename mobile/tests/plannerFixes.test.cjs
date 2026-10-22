// Regression tests for the RC2 current-planner fixes (audit 2026-10-22).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { solveRoute } = require('../src/planning/routeSolver/solveRoute.ts');
const { solverInputFromPlan, candidateToStageRoute, adoptionLosses, pruneRouteReferences } = require('../src/planning/routeSolver/adoption.ts');
const { strictlyInside, inside, nudgeInside } = require('../src/planning/routeSolver/traversability.ts');
const { analyzeEngagements, defaultEngagementRules, insideArea, safeDirectionMismatch, signedDegrees } = require('../src/planning/engagements.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { routeSectionId } = require('../src/planning/manualEngagements.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { routeTargetCoverage, coverageText } = require('../src/editor/routePresentation.ts');
const A = require('../src/planning/routeAssistant/index.ts');
const H = require('../src/editor/history.ts');
const p = (x, y) => ({ x, y }), physical = (x, y) => ({ space: 'stage', x, y, z: 0 });
const square = (x, y, w, h) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];

function stageWithTarget() {
  // Downrange up the screen; start near the bottom, one target near the top.
  const stage = createDefaultStage(undefined, { size: { width: 300, depth: 300 } });
  stage.objects = [createObject('start', 'start', 150, 270), createObject('cardboardTarget', 'T1', 150, 30)];
  return stage;
}

test('strictlyInside treats the boundary as outside; inside treats it as inside', () => {
  const poly = square(0, 0, 10, 10);
  assert.equal(strictlyInside(p(5, 5), poly), true);
  assert.equal(strictlyInside(p(0, 5), poly), false);
  assert.equal(inside(p(0, 5), poly), true);
  assert.equal(insideArea(p(10, 3), { id: 'a', vertices: poly }), false);
  const q = nudgeInside(p(0, 5), poly);
  assert.ok(q && strictlyInside(q, poly) && Math.abs(q.x - 0.5) < 1e-9);
  assert.equal(nudgeInside(p(5, 5), poly), null, 'interior points are not moved');
  assert.equal(nudgeInside(p(50, 50), poly), null, 'far points are not boundary points');
});

test('a solver stop at a firing area edge is moved inside, so a stationary shot there is legal', () => {
  const stage = stageWithTarget(), plan = createPlan();
  plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'box', vertices: square(130, 150, 40, 40) }] };
  const result = solveRoute(solverInputFromPlan(stage, plan));
  assert.equal(result.status, 'success');
  const stop = result.bestRoute.waypoints.at(-1);
  assert.ok(strictlyInside(stop, plan.route.engagementRules.firingAreas[0].vertices), JSON.stringify(stop));
  const adopted = candidateToStageRoute(result.bestRoute, plan);
  adopted.positions.at(-1).engagedTargetIds = ['T1'];
  const analysis = analyzeEngagements(stage, adopted);
  assert.deepEqual(analysis.coveredTargetIds, ['T1']);
});

test('Use Route keeps coincident waypoints whole: IDs, labels, reloads, bends and ENGAGE arrows', () => {
  const stage = stageWithTarget(), plan = createPlan();
  plan.loadout.magazines = [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }];
  const route = createRoute('manual');
  route.positions = [['far', 150, 40, 'Far wall'], ['near', 150, 240, 'Near'], ['mid', 150, 150, 'Middle']]
    .map(([id, x, y, label]) => ({ id, label, position: physical(x, y), visibleTargetIds: ['T1'], engagedTargetIds: id === 'far' ? ['T1'] : [] }));
  route.reloads = [{ positionId: 'mid', magazineId: 'm2' }];
  route.manualEngagements = [{ id: 'e1', targetId: 'T1', anchor: { kind: 'waypoint', waypointId: 'far' }, direction: -90 }];
  plan.route = route;
  const result = solveRoute(solverInputFromPlan(stage, plan));
  assert.equal(result.status, 'success');
  const adopted = candidateToStageRoute(result.bestRoute, plan);
  assert.deepEqual(adopted.positions.map(q => q.id), ['near', 'mid', 'far'], 'solver reorders to nearest-first');
  assert.deepEqual(adopted.positions.map(q => q.label), ['Near', 'Middle', 'Far wall']);
  assert.deepEqual(adopted.positions.find(q => q.id === 'far').engagedTargetIds, ['T1']);
  assert.deepEqual(adopted.reloads, [{ positionId: 'mid', magazineId: 'm2' }]);
  assert.deepEqual(adopted.manualEngagements.map(e => e.id), ['e1']);
  assert.ok(isStageRoute(adopted));
  assert.deepEqual(adoptionLosses(plan.route, adopted), { waypoints: 0, reloads: 0, bends: 0, engageArrows: 0 });
  assert.notEqual(adopted.positions[0], route.positions[1], 'adopted waypoints are copies');
});

test('bends survive only where their waypoint pair stays adjacent, and losses are reported', () => {
  const route = createRoute('r');
  route.positions = ['a', 'b', 'c'].map((id, i) => ({ id, label: id, position: physical(50 + i * 50, 50), visibleTargetIds: [], engagedTargetIds: [] }));
  route.connections = [
    { fromId: 'a', toId: 'b', style: 'ROUNDED', bends: [{ id: 'k1', position: physical(75, 60) }] },
    { fromId: 'b', toId: 'c', style: 'ROUNDED', bends: [{ id: 'k2', position: physical(125, 60) }] },
  ];
  route.manualEngagements = [{ id: 'e1', targetId: 'T', anchor: { kind: 'section', sectionId: routeSectionId('b', 'c'), fraction: 0.5 }, direction: 0 }];
  const reordered = pruneRouteReferences({ ...route, positions: [route.positions[0], route.positions[2], route.positions[1]] });
  assert.deepEqual(reordered.connections.map(c => c.toId), [], 'a→b and b→c are no longer adjacent');
  assert.deepEqual(reordered.manualEngagements, []);
  assert.deepEqual(adoptionLosses(route, reordered), { waypoints: 0, reloads: 0, bends: 2, engageArrows: 1 });
  const kept = pruneRouteReferences(route);
  assert.equal(kept.connections.length, 2); assert.equal(kept.manualEngagements.length, 1);
});

test('outside travel off with no firing areas explains the real problem', () => {
  const stage = stageWithTarget(), plan = createPlan();
  plan.route = createRoute('r');
  plan.route.positions = [{ id: 'w', label: 'w', position: physical(150, 100), visibleTargetIds: [], engagedTargetIds: [] }];
  plan.route.engagementRules = { ...defaultEngagementRules(stage), allowOutsideTravel: false, firingAreas: [] };
  const r = solveRoute(solverInputFromPlan(stage, plan));
  assert.equal(r.status, 'invalid-input');
  assert.match(r.diagnostics.warnings[0], /no firing areas/);
  plan.route.engagementRules.firingAreas = [{ id: 'box', vertices: square(130, 80, 40, 40) }];
  const r2 = solveRoute(solverInputFromPlan(stage, plan));
  assert.match(r2.diagnostics.warnings[0], /Start is outside every firing area/);
});

test('coverage counts ENGAGE arrows as planned but never as checked', () => {
  const route = createRoute('r');
  route.positions = [{ id: 'w', label: 'w', position: physical(1, 1), visibleTargetIds: [], engagedTargetIds: ['A'] }];
  route.manualEngagements = [{ id: 'e', targetId: 'B', anchor: { kind: 'waypoint', waypointId: 'w' }, direction: 0 }, { id: 'x', targetId: 'GONE', anchor: { kind: 'waypoint', waypointId: 'w' }, direction: 0 }];
  const unchecked = routeTargetCoverage(['A', 'B', 'C'], route, undefined);
  assert.deepEqual(unchecked, { total: 3, planned: 2, checked: null });
  assert.equal(coverageText(unchecked), '2/3 targets planned (not checked)');
  const checked = routeTargetCoverage(['A', 'B', 'C'], route, ['A']);
  assert.equal(coverageText(checked), '2/3 targets planned · 1 pass checks');
});

test('safe direction defaults to the stage downrange and mismatches are detectable', () => {
  assert.equal(defaultEngagementRules().safeDirectionDegrees, -90);
  assert.equal(defaultEngagementRules(createDefaultStage()).safeDirectionDegrees, -90);
  assert.equal(defaultEngagementRules(createDefaultStage(undefined, { downrangeDegrees: 0 })).safeDirectionDegrees, 0);
  assert.equal(defaultEngagementRules(createDefaultStage(undefined, { downrangeDegrees: 90 })).safeDirectionDegrees, 90);
  assert.equal(signedDegrees(270), -90); assert.equal(signedDegrees(180), 180); assert.equal(signedDegrees(-450), -90);
  const stage = createDefaultStage();
  assert.equal(safeDirectionMismatch(stage, { safeDirectionDegrees: -90 }), false);
  assert.equal(safeDirectionMismatch(stage, { safeDirectionDegrees: 270 }), false);
  assert.equal(safeDirectionMismatch(stage, { safeDirectionDegrees: 90 }), true);
});

test('every default-stage target is within the default safe angle from the start', () => {
  for (const downrangeDegrees of [0, 90, 180, 270]) {
    const stage = createDefaultStage('USPSA', { downrangeDegrees }), rules = defaultEngagementRules(stage);
    const start = stage.objects.find(o => o.type === 'start').position;
    for (const t of stage.objects.filter(o => o.type === 'cardboardTarget')) {
      const angle = Math.atan2(t.position.y - start.y, t.position.x - start.x) * 180 / Math.PI;
      const delta = Math.abs(((angle - rules.safeDirectionDegrees) % 360 + 540) % 360 - 180);
      assert.ok(delta < rules.safeHalfAngleDegrees, `downrange ${downrangeDegrees}: ${t.id} at ${delta.toFixed(1)}°`);
    }
  }
});

function assistantFixture() {
  const stage = { schemaVersion: 7, coordinateSystem: 'inches', stage: { width: 300, depth: 240 }, objects: [{ id: 'start', type: 'start', position: physical(20, 100), rotation: 0, geometry: { width: 12, depth: 12, height: 0 } }] };
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.positions = [['W1', 90, 100], ['W2', 150, 60], ['W3', 240, 100]].map(([id, x, y]) => ({ id, label: id, position: physical(x, y), visibleTargetIds: [], engagedTargetIds: [] }));
  plan.route.connections = [
    { fromId: 'W1', toId: 'W2', style: 'ROUNDED', bends: [{ id: 'b1', position: physical(120, 70) }] },
    { fromId: 'W2', toId: 'W3', style: 'STRAIGHT', bends: [{ id: 'b2', position: physical(200, 70) }] },
  ];
  plan.route.manualEngagements = [{ id: 'e2', targetId: 'T', anchor: { kind: 'waypoint', waypointId: 'W2' }, direction: 0 }];
  return { stage, plan, c: A.createRouteAssistantContext(stage, plan), h: { document: H.history({ stage, plan }), assistantChanges: [] } };
}
const run = (f, type, payload = {}) => A.executeRouteAssistantCommand(f.c, { type, sourceRevision: f.c.revision, ...payload }, f.h);

test('assistant reorder works on routes with bends and drops only bends that lost adjacency', () => {
  const f = assistantFixture();
  const r = run(f, 'REORDER_WAYPOINT', { waypointId: 'W3', beforeId: 'W2' });
  assert.equal(r.kind, 'preview', JSON.stringify(r));
  assert.deepEqual(r.preview.proposedRoute.positions.map(q => q.id), ['W1', 'W3', 'W2']);
  assert.deepEqual(r.preview.proposedRoute.connections, []);
  assert.ok(isStageRoute(r.preview.proposedRoute));
});

test('assistant delete removes the orphaned bend and ENGAGE arrow', () => {
  const f = assistantFixture();
  const r = run(f, 'DELETE_WAYPOINT', { waypointId: 'W2' });
  assert.equal(r.kind, 'preview', JSON.stringify(r));
  assert.deepEqual(r.preview.proposedRoute.positions.map(q => q.id), ['W1', 'W3']);
  assert.ok(!r.preview.proposedRoute.connections.some(c => c.fromId === 'W2' || c.toId === 'W2'));
  assert.deepEqual(r.preview.proposedRoute.manualEngagements, []);
  assert.ok(isStageRoute(r.preview.proposedRoute));
});
