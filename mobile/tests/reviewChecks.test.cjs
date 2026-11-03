// Review of 1d1cd6c..05fa593: behaviour checked and found correct (these PASS). Companion to reviewFixes.test.cjs (copied from review-05fa593-checks.test.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute, isStageRoute } = require('../src/planning/route.ts');
const { routeSectionId } = require('../src/planning/manualEngagements.ts');
const A = require('../src/planning/assignments.ts');
const P = require('../src/stage/partialTargets.ts');
const L = require('../src/planning/routeLifecycle.ts');
const DM = require('../src/diagramImport/model.ts');

const point = (x, y) => ({ space: 'stage', x, y, z: 0 });
const position = (id, x, y, engaged = []) => ({ id, label: id, position: point(x, y), visibleTargetIds: [...engaged], engagedTargetIds: [...engaged] });
const objects = h => h.child('StageViewport').stage.objects;

test('PARTIAL · HOSTAGE places the target and its no-shoot as ONE undo step', () => {
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'S', matchId: 'm', document: createDefaultStage('USPSA'), plan: createPlan() }, targetFamily: 'USPSA' });
  const before = objects(h).length;
  h.press('ADD');
  const ring = h.child('RadialAddMenu');
  const preset = require('../src/stage/targetPresets.ts').presetsForFamily('USPSA').find(p => p.type === 'cardboardTarget');
  ring.onChoose({ kind: 'partial', presetId: preset.id, partial: { kind: 'hostage' } }); h.render();
  h.child('StageViewport').onPlace(point(300, 200)); h.render();
  assert.equal(objects(h).length, before + 2, 'target and its hostage no-shoot');
  h.press('Undo');
  assert.equal(objects(h).length, before, 'one header undo removes both');
});

test('ENGAGE-arrow migration: messy old data (rounded path, bends, stale references, no-start stretch) migrates once, stays valid, keeps the walk', () => {
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560), ...['t1', 't2', 't3', 't4'].map((id, i) => createObject('cardboardTarget', id, 100 + i * 100, 80))];
  let route = { ...createRoute('r'), positions: [position('a', 100, 400, ['t4']), { ...position('b', 400, 400), label: 'P1' }],
    connections: [{ fromId: 'a', toId: 'b', style: 'ROUNDED', bends: [{ id: 'k1', position: point(150, 300) }, { id: 'k2', position: point(350, 300) }] }] };
  route.manualEngagements = [
    { id: 'x1', targetId: 't1', anchor: { kind: 'section', sectionId: routeSectionId('a', 'b'), fraction: 0.1 }, direction: 0 },
    { id: 'x2', targetId: 't2', anchor: { kind: 'section', sectionId: routeSectionId('a', 'b'), fraction: 0.9 }, direction: 0 },
    { id: 'x3', targetId: 't3', anchor: { kind: 'waypoint', waypointId: 'b' }, direction: 0 },
    { id: 'gone-target', targetId: 'deleted', anchor: { kind: 'waypoint', waypointId: 'a' }, direction: 0 },
    { id: 'gone-pos', targetId: 't3', anchor: { kind: 'waypoint', waypointId: 'deleted' }, direction: 0 },
    { id: 'claimed', targetId: 't4', anchor: { kind: 'waypoint', waypointId: 'b' }, direction: 0 },
  ];
  assert.ok(isStageRoute(route));
  const length = r => evaluateRoute(stage, createPlan(), r, null).distance;
  const migrated = reconcilePlan({ ...createPlan(), route }, stage).route;
  assert.ok(isStageRoute(migrated));
  assert.equal(migrated.manualEngagements, undefined);
  assert.deepEqual(migrated.positions.map(p => [p.id, p.engagedTargetIds]), [['a', ['t4']], ['position-x1', ['t1', 't2']], ['b', ['t3']]]);
  // Middle of a -> k1 -> k2 -> b is on k1 -> k2 (lengths 111.8, 200, 111.8): (250, 300); bends split k1 | k2.
  assert.ok(Math.abs(migrated.positions[1].position.x - 250) < 1e-9 && Math.abs(migrated.positions[1].position.y - 300) < 1e-9);
  assert.deepEqual(migrated.connections.map(c => [c.fromId, c.toId, c.style, c.bends.map(b => b.id)]), [['a', 'position-x1', 'ROUNDED', ['k1']], ['position-x1', 'b', 'ROUNDED', ['k2']]]);
  assert.ok(Math.abs(length(migrated) - length({ ...route, manualEngagements: undefined })) < 1, 'same walk, rounded corners aside');
  assert.equal(reconcilePlan({ ...createPlan(), route: migrated }, stage).route, migrated, 'idempotent');
  // Without a start, an arrow on the first stretch has nothing to resolve against and is dropped, nothing else changes.
  const noStart = { ...stage, objects: stage.objects.filter(o => o.type !== 'start') };
  const r2 = { ...createRoute('r2'), positions: [position('a', 100, 400)], manualEngagements: [{ id: 'y', targetId: 't1', anchor: { kind: 'section', sectionId: routeSectionId('start', 'a'), fraction: 0.5 }, direction: 0 }] };
  assert.deepEqual(A.migrateManualEngagements(noStart, r2).positions.map(p => p.id), ['a']);
});

test('draft route: commitRoute ignores no-op edits of a draft, always replaces a saved route; Reset keeps a deep copy of the rules', () => {
  const plan = createPlan(), draft = L.routeForPlan(plan, 'd');
  assert.equal(L.commitRoute(plan, draft), plan);
  assert.equal(L.commitRoute(plan, { ...draft }), plan);
  const saved = { ...plan, route: { ...createRoute('r'), positions: [position('a', 1, 1)] } };
  const emptied = { ...saved.route, positions: [] };
  assert.equal(L.commitRoute(saved, emptied).route, emptied, 'deleting the last position is an edit');
  const rules = { firingAreas: [{ id: 'a', vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }] };
  const reset = L.resetRouteKeepingAreas({ ...createRoute('r'), engagementRules: rules, positions: [position('a', 1, 1)], reloads: [{ positionId: 'a', magazineId: 'm' }] }, 'n');
  assert.deepEqual([reset.positions, reset.reloads, reset.engagementRules], [[], [], rules]);
  assert.notEqual(reset.engagementRules, rules);
});

test('diagram import records: an older record (no opacity, no reviewed flag) loads at half opacity; a nudge left of the stage validates', () => {
  const asset = { path: 'diagram-imports/a.png', name: 'a.png', mime: 'image/png', size: 10 };
  const old = { version: 1, id: 'd', source: asset, sourceKind: 'image', aligned: { asset, width: 100, height: 100, page: 1, pageCount: 1 },
    alignment: { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
    projection: 'top-down', calibration: { a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 }, inches: 360, evidence: 'user', approximate: true }, origin: { x: 0, y: 0 },
    proposals: [{ id: 'p', type: 'wall', position: { x: 0.1, y: 0.1 }, end: { x: 0.2, y: 0.1 }, rotation: 0, accepted: false, approximate: true, notes: '', source: 'manual' }] };
  DM.validateReconstruction(old);
  assert.equal(DM.backdropOf(old).opacity, 0.5);
  const placed = DM.placeDrawing(old, { left: -3.6, top: 0, opacity: 0.3 });
  assert.deepEqual([placed.origin, placed.opacity, placed.proposals], [{ x: -3.6, y: 0 }, 0.3, old.proposals]);
});
