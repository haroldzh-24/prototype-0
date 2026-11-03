// UI cohesion phase 3 (PLAN as one guided path), the editor wiring: the route is created on the first edit, the
// checklist header, the PLAN target sheet (BUILD builds only), one engagement model (the drag, a new position from the
// path), the alternatives under •••, sheets that return where they came from, undo instead of confirm, P1/P2 on the
// canvas, the drawing under the stage, and one family picker.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute, isStageRoute } = require('../src/planning/route.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');
const { routeSectionId } = require('../src/planning/manualEngagements.ts');
const { setConnection } = require('../src/planning/routeGeometry.ts');
const A = require('../src/planning/assignments.ts');
const { planWords } = require('../src/planning/planWords.ts');
const { buildWalk } = require('../src/stage3d/walk.ts');
const DM = require('../src/diagramImport/model.ts');
const { yardsToInches } = require('../src/stage/measurements.ts');

const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const point = (x, y) => ({ space: 'stage', x, y, z: 0 });
const position = (id, x, y, engaged = []) => ({ id, label: id, position: point(x, y), visibleTargetIds: [...engaged], engagedTargetIds: [...engaged] });
/** 400 × 400 in: start at the bottom left, paper t1 and t2, a plate t3, a no-shoot; positions w1–w3 across the middle. */
function fixture() {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start', 'start', 20, 300), createObject('cardboardTarget', 't1', 150, 70), createObject('cardboardTarget', 't2', 250, 70),
    createObject('steelPlate', 't3', 330, 60), createObject('noShootTarget', 'ns', 50, 70)];
  const route = { ...createRoute('r'), positions: [position('w1', 100, 300), position('w2', 200, 300), position('w3', 300, 300)] };
  return { stage, route };
}
const rulesFor = stage => ({ ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 0, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 0, y: 400 }] }] });
const editor = (stage, plan, overrides = {}) => harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage', matchId: 'm', document: stage, plan }, targetFamily: 'USPSA' }, overrides);
const tree = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(tree) : [n, ...tree(n.props?.children), ...tree(n.props?.action)];
const titlesIn = node => tree(node).filter(n => n.type === 'ToolButton' || n.type === 'Action').map(n => n.props.title);
const toolBar = h => titlesIn(h.find(n => n.type === 'ToolBar'));
const sheet = h => h.find(n => n.type === 'EditorSheet' && n.props.visible).props;
const openSheet = h => h.nodes().find(n => n.type === 'EditorSheet' && n.props.visible);
const shown = h => h.child('StageViewport').routePlanning.route;
const saved = h => h.nodes().some(n => n.props?.title === 'SAVED ✓');
const doneMode = h => { h.child('ModeChip').action.props.onPress(); h.render(); };

// 1. Route on first edit ------------------------------------------------------------------------------------------------

test('opening PLAN shows an empty draft route and leaves the stage saved; the first edit creates the route', () => {
  const { stage } = fixture();
  const h = editor(stage, createPlan());
  h.press('PLAN');
  assert.ok(saved(h), 'opening PLAN does not mark the stage unsaved');
  assert.deepEqual(shown(h).positions, [], 'PLAN shows an empty draft');
  h.press('WALK'); h.press('PLAN'); h.press('ANALYZE'); assert.ok(h.child('RouteAnalysis'), 'ANALYZE opens on the draft too'); sheet(h).close(); h.render();
  assert.ok(saved(h), 'walking or analysing an empty draft changes nothing');
  assert.ok(!h.nodes().some(n => n.props?.title === 'UNDO' || n.type === 'UndoBar'));
  assert.equal(h.find(n => n.props?.accessibilityLabel === 'Undo').props.disabled, true, 'nothing to undo');
  // The first edit (a shooting area) creates the route.
  h.press('AREAS'); h.press('WHOLE BAY');
  assert.ok(!saved(h)); assert.equal(shown(h).engagementRules.firingAreas.length, 1);
  h.press('Undo'); assert.ok(saved(h), 'undo takes the new route back');
  assert.match(src('editor/StageBuilder.tsx'), /routeForPlan\(plan, draftId\)/);
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /createRoute\(/, 'PLAN never creates a route just by opening');
});

// 2. Checklist header ---------------------------------------------------------------------------------------------------

test('the checklist header sits above the PLAN canvas; its lines open AREAS, ROUTE and ENGAGE, and mark the open one', () => {
  const { stage } = fixture();
  const h = editor(stage, createPlan());
  assert.equal(h.nodes().find(n => n.type === 'PlanChecklist'), undefined, 'not in BUILD');
  h.press('PLAN');
  const order = h.nodes().filter(n => ['StepBar', 'PlanChecklist', 'ToolBar'].includes(n.type)).map(n => n.type);
  assert.deepEqual(order, ['StepBar', 'PlanChecklist', 'ToolBar'], 'between the step bar and the canvas');
  const list = () => h.child('PlanChecklist');
  assert.deepEqual(list().checklist.lines.map(l => l.status), ['Draw at least one shooting area', 'Plan a route: AUTO-PLAN, or draw it by hand', '0/3 targets planned · no reloads · 3 to engage']);
  assert.equal(list().current, null);
  list().onPress('areas'); h.render();
  assert.equal(typeof h.child('StageViewport').onAreaPoint, 'function', 'line 1 opens AREAS'); assert.equal(list().current, 'areas');
  list().onPress('route'); h.render();
  assert.equal(sheet(h).title, 'Route', 'line 2 opens ROUTE'); assert.equal(h.child('StageViewport').onAreaPoint, undefined, 'and leaves AREAS');
  sheet(h).close(); h.render();
  list().onPress('targets'); h.render();
  assert.ok(h.child('StageViewport').assign, 'line 3 opens ENGAGE (drag from a position to a target)'); assert.equal(list().current, 'targets');
  assert.equal(h.child('ModeChip').title, 'DRAG FROM A POSITION TO A TARGET');
  doneMode(h);
  h.press('WALK'); assert.equal(h.nodes().find(n => n.type === 'PlanChecklist'), undefined, 'WALK has its own frame');
});

test('ANALYZE is the one orange next step once the three lines are done; the PLAN badge counts planned targets', () => {
  const { stage, route } = fixture();
  const full = { ...route, engagementRules: rulesFor(stage), positions: [position('w1', 100, 300, ['t1']), position('w2', 200, 300, ['t2']), position('w3', 300, 300, ['t3'])] };
  const orange = h => h.nodes().filter(n => n.type === 'ToolButton' && n.props.primary).map(n => n.props.title);
  const loadout = { chamberLoaded: false, startingMagazineId: 'm', magazines: [{ id: 'm', capacity: 15, startingRounds: 15 }] };
  let h = editor(stage, { ...createPlan(), loadout, route: full });
  h.press('PLAN');
  assert.ok(h.child('PlanChecklist').checklist.lines.every(l => l.done));
  assert.deepEqual(orange(h), ['ANALYZE'], 'with the stage saved, ANALYZE is the only orange button');
  assert.equal(h.find(n => n.props?.title === 'PLAN').props.badge, '3/3');
  // A target with 0 rounds of your own is not planned: the badge and line 3 say so, and ANALYZE is not orange.
  h = editor(stage, { ...createPlan(), loadout, route: full, engagements: { t3: 0 } });
  h.press('PLAN');
  assert.equal(h.find(n => n.props?.title === 'PLAN').props.badge, '2/3');
  assert.equal(h.find(n => n.props?.title === 'PLAN').props.accessibilityLabel, 'Plan the route. 2 of 3 targets planned');
  assert.ok(!orange(h).includes('ANALYZE'));
  // No route: ROUTE is the next step.
  h = editor(stage, createPlan()); h.press('PLAN');
  assert.deepEqual(orange(h), ['ROUTE']);
});

// 3. Target sheet in PLAN; BUILD builds only ----------------------------------------------------------------------------

test('tapping a target in PLAN (2D and 3D) opens its target sheet; BUILD\'s EDIT has no planning', () => {
  const { stage, route } = fixture();
  const h = editor(stage, { ...createPlan(), route: { ...route, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] } });
  h.press('PLAN');
  h.child('StageViewport').onTargetTap('t2'); h.render();
  let target = h.child('TargetPlanSheet');
  assert.equal(target.targetId, 't2'); assert.equal(target.visible, true);
  target.onRouteChange(A.assignTarget(target.route, stage, 'w3', 't2')); h.render();
  assert.deepEqual(shown(h).positions.map(p => p.engagedTargetIds), [['t1'], [], ['t2']], 'Engaged from changes the one engagement model');
  h.child('TargetPlanSheet').onPlanChange({ ...h.child('TargetPlanSheet').plan, engagements: { t2: 3 } }); h.render();
  assert.equal(h.child('TargetPlanSheet').plan.engagements.t2, 3, 'rounds are set here');
  h.child('TargetPlanSheet').close(); h.render();
  assert.equal(h.nodes().find(n => n.type === 'TargetPlanSheet'), undefined);
  // 3D in PLAN: the same sheet. A no-shoot or a wall opens nothing.
  h.press('3D view'); h.child('Stage3DView').onSelect('ns'); h.render();
  assert.equal(h.nodes().find(n => n.type === 'TargetPlanSheet'), undefined);
  h.child('Stage3DView').onSelect('t3'); h.render();
  assert.equal(h.child('TargetPlanSheet').targetId, 't3');
  h.child('TargetPlanSheet').close(); h.render();
  // Modes that use taps on the canvas do not open it.
  h.press('Plan view'); h.press('AREAS'); assert.equal(h.child('StageViewport').onTargetTap, undefined); doneMode(h);
  // BUILD: a selected target's EDIT is position, size and rotation only.
  h.press('BUILD'); h.child('StageViewport').onSelect('t1'); h.render(); h.press('EDIT');
  const edit = sheet(h);
  assert.ok(!tree(edit.children).some(n => ['RoundAssignment', 'ExpectedHits'].includes(n.type)), 'no rounds or expected hits in BUILD');
  assert.equal(h.child('ObjectInspector').advancedContent, undefined);
  assert.doesNotMatch(src('editor/ObjectInspector.tsx'), /PLANNING|advancedContent/);
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /RoundAssignment|ExpectedHits/);
  // TARGET ROUNDS and LOADOUT stay in PLAN's •••.
  sheet(h).close(); h.render(); h.press('PLAN'); h.press('Plan settings');
  h.press('TARGET ROUNDS'); assert.equal(h.child('PlanningPanel').section, 'targets');
  sheet(h).back.onPress(); h.render(); h.press('LOADOUT'); assert.equal(h.child('PlanningPanel').section, 'loadout');
});

// 4. One engagement model -----------------------------------------------------------------------------------------------

test('assignFromPath: a new position where the drag started on the path, engaging the target; the drawn path is split there', () => {
  const { stage, route } = fixture();
  const r0 = { ...route, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] };
  let r = A.assignFromPath(stage, r0, routeSectionId('w1', 'w2'), point(140, 300), 't1', 'new');
  assert.deepEqual(r.positions.map(p => p.id), ['w1', 'new', 'w2', 'w3'], 'between the two positions');
  assert.deepEqual(r.positions[1], { id: 'new', label: 'P1', position: point(140, 300), visibleTargetIds: ['t1'], engagedTargetIds: ['t1'] }, 'at the drag point, named like every new position');
  assert.deepEqual(r.positions[0].engagedTargetIds, [], 'the target leaves the position that engaged it: one engagement per target');
  assert.ok(isStageRoute(r));
  // The start leg works too; the label is the first one free.
  r = A.assignFromPath(stage, r, routeSectionId('start', 'w1'), point(50, 300), 't3', 'first');
  assert.deepEqual(r.positions.map(p => [p.id, p.label]), [['first', 'P2'], ['w1', 'w1'], ['new', 'P1'], ['w2', 'w2'], ['w3', 'w3']]);
  // A drawn path keeps its bends on their side of the new position.
  const bent = setConnection(route, { fromId: 'w1', toId: 'w2', style: 'STRAIGHT', bends: [{ id: 'b1', position: point(120, 340) }, { id: 'b2', position: point(180, 340) }] });
  const split = A.assignFromPath(stage, bent, routeSectionId('w1', 'w2'), point(150, 340), 't2', 'mid');
  assert.deepEqual(split.connections, [{ fromId: 'w1', toId: 'mid', style: 'STRAIGHT', bends: [{ id: 'b1', position: point(120, 340) }] }, { fromId: 'mid', toId: 'w2', style: 'STRAIGHT', bends: [{ id: 'b2', position: point(180, 340) }] }]);
  assert.ok(isStageRoute(split));
  // Unchanged when the stretch, the target or the id is not usable.
  for (const [section, target, id] of [[routeSectionId('w3', 'w1'), 't1', 'x'], [routeSectionId('w1', 'w2'), 'ns', 'x'], [routeSectionId('w1', 'w2'), 'gone', 'x'], [routeSectionId('w1', 'w2'), 't1', 'w2']]) {
    assert.equal(A.assignFromPath(stage, route, section, point(150, 300), target, id), route);
  }
  // The migration of old arrows on a stretch uses the same rule (insertOnStretch).
  assert.match(src('planning/assignments.ts'), /insertOnStretch\(stage, route, section\.toId/);
  assert.match(src('planning/assignments.ts'), /next = insertOnStretch\(stage, next, p\.id/);
});

test('ENGAGE in the editor: the drag assigns from a position or adds a position on the path; undo; Save carries engagedTargetIds', async () => {
  const { stage, route } = fixture();
  const h = editor(stage, { ...createPlan(), route });
  h.press('PLAN'); h.press('ROUTE');
  assert.deepEqual(titlesIn(sheet(h).children), ['AUTO-PLAN', 'DRAW BY HAND', 'ENGAGE'], 'AUTO-PLAN first, drawing by hand its alternative; REVIEW is gone');
  assert.match(tree(sheet(h).children).find(n => n.type === 'Copy').props.children, /^ROUTE\n\d+\.\d yd · 3 positions · 0\/3 targets planned/, 'the route note in yards to one decimal');
  h.press('ENGAGE');
  const v = h.child('StageViewport');
  assert.deepEqual(v.routePlanning.layers, { path: true, waypoints: true, nodes: false, windows: false, arrows: 'ALL', targetIds: false, grid: false }, 'every position\'s assignments are drawn');
  assert.equal(v.manualEngage, undefined); assert.equal(v.manualReview, undefined);
  v.assign.onAssign({ kind: 'waypoint', waypointId: 'w2' }, point(200, 300), 't1'); h.render();
  assert.deepEqual(shown(h).positions.map(p => p.engagedTargetIds), [[], ['t1'], []]);
  assert.equal(h.child('ModeChip').detail, 'ENGAGE · 1/3 TARGETS PLANNED');
  h.child('StageViewport').assign.onAssign({ kind: 'section', sectionId: routeSectionId('w2', 'w3'), fraction: 0.5 }, point(250, 300), 't2'); h.render();
  assert.deepEqual(shown(h).positions.map(p => [p.label, p.engagedTargetIds]), [['w1', []], ['w2', ['t1']], ['P1', ['t2']], ['w3', []]]);
  assert.deepEqual(shown(h).positions[2].position, point(250, 300));
  assert.equal(shown(h).manualEngagements, undefined, 'no arrows');
  h.press('Undo'); assert.equal(shown(h).positions.length, 3); h.press('Redo'); assert.equal(shown(h).positions.length, 4);
  h.press('Save'); await h.settle();
  assert.deepEqual(h.saved[0][3].route.positions.map(p => p.engagedTargetIds), [[], ['t1'], ['t2'], []]);
  for (const gone of ['editor/ManualEngagementOverlay.tsx', 'editor/ManualReviewOverlay.tsx', 'editor/ManualReviewPanel.tsx', 'planning/manualRouteReview.ts']) assert.equal(fs.existsSync(path.join(__dirname, '../src', gone)), false, gone + ' is removed');
  assert.doesNotMatch(src('editor/useDocumentHistory.ts'), /reconcileManualEngagements/);
});

test('the route overlay draws each position\'s assignments as lines to its targets, with route rules too when engagement marks are off', () => {
  const { stage, route } = fixture();
  const r = { ...route, engagementRules: rulesFor(stage), positions: [position('w1', 100, 300, ['t1', 't2']), route.positions[1], route.positions[2]] };
  const props = { stage, transform: { scale: 1, offsetX: 0, offsetY: 0 }, route: r, selectedId: null, onSelect() {}, onChange() {}, onDragging() {},
    layers: { path: true, waypoints: true, nodes: false, windows: false, arrows: 'ALL', targetIds: false, grid: false } };
  const rn = { View: 'View', Text: 'Text', Pressable: 'Pressable', PanResponder: { create: h => ({ panHandlers: h }) } };
  const h = harness('editor/RouteOverlay.tsx', props, { 'react-native': rn });
  const lines = () => h.nodes().filter(n => /^connection-/.test(n.key ?? '')).map(n => n.key);
  assert.deepEqual(lines(), ['connection-w1-t1', 'connection-w1-t2']);
  assert.deepEqual(h.nodes().filter(n => n.type === 'Text' && /^[12]$/.test(n.props.children)).map(n => n.props.children), ['1', '2'], 'numbered in order');
  props.layers = { ...props.layers, nodes: true, arrows: 'SELECTED' }; h.render();
  assert.deepEqual(lines(), [], 'with the engagement marks on, they draw the checked engagements instead');
});

// 5 and 6. Alternatives under •••, sheets that return where they came from -------------------------------------------------

test('Ask and the older optimizer are alternatives under •••, and closing either returns to •••', () => {
  const { stage } = fixture();
  const h = editor(stage, createPlan());
  h.press('PLAN'); h.press('Plan settings');
  const items = tree(sheet(h).children);
  assert.ok(items.some(n => n.props?.children === 'ALTERNATIVES TO AUTO-PLAN'), 'a heading says they are alternatives');
  assert.equal(items.find(n => n.props?.title === 'ASK').props.accessibilityLabel, planWords.ask);
  assert.equal(items.find(n => n.props?.title === 'OLDER OPTIMIZER').props.accessibilityLabel, planWords.olderOptimizer);
  h.press('OLDER OPTIMIZER'); assert.ok(h.child('AutoPlannerPanel'));
  h.child('AutoPlannerPanel').onClose(); h.render();
  assert.equal(sheet(h).title, 'Plan settings', 'closing the optimizer returns to •••');
  h.press('ASK'); assert.equal(h.child('RouteAISheet').visible, true); assert.equal(openSheet(h), undefined);
  h.child('RouteAISheet').close(); h.render();
  assert.equal(h.nodes().find(n => n.type === 'RouteAISheet'), undefined, 'Ask closed'); assert.equal(sheet(h).title, 'Plan settings', 'closing Ask returns to •••');
});

test('Route settings return where they came from; EDIT SHOOTING AREAS from AUTO-PLAN returns to AUTO-PLAN on DONE', () => {
  const { stage } = fixture();
  const h = editor(stage, createPlan());
  h.press('PLAN'); h.press('ROUTE'); h.press('AUTO-PLAN');
  assert.ok(h.child('RoutePlannerV2Panel'));
  h.child('RoutePlannerV2Panel').onConfigure('rules'); h.render();
  assert.equal(sheet(h).title, 'Route settings'); assert.equal(sheet(h).back.label, 'Back to plan route');
  h.child('EngagementSettings').onCancel(); h.render();
  assert.ok(h.child('RoutePlannerV2Panel'), 'cancel returns to AUTO-PLAN');
  h.child('RoutePlannerV2Panel').onConfigure('rules'); h.render();
  h.child('EngagementSettings').onApply({ ...defaultEngagementRules(stage), firingAreas: [] }); h.render();
  assert.ok(h.child('RoutePlannerV2Panel'), 'apply returns to AUTO-PLAN');
  // From •••: back to ••• (no "Back to plan route" button there).
  h.child('RoutePlannerV2Panel').onClose(); h.render();
  h.press('Plan settings'); h.press('Route settings');
  assert.equal(sheet(h).back.label, 'Back to plan settings');
  h.child('EngagementSettings').onCancel(); h.render(); assert.equal(sheet(h).title, 'Plan settings');
  h.press('Loadout'); assert.ok(!titlesIn(sheet(h).children).some(t => /^BACK TO/.test(t)), 'no BACK TO PLAN ROUTE / MOVEMENT OPTIMIZER');
  sheet(h).close(); h.render();
  // EDIT SHOOTING AREAS from AUTO-PLAN: DONE comes back to AUTO-PLAN; from the tool bar, DONE goes to the canvas.
  h.press('ROUTE'); h.press('AUTO-PLAN');
  h.child('RoutePlannerV2Panel').onConfigure('areas'); h.render();
  assert.equal(h.nodes().find(n => n.type === 'RoutePlannerV2Panel'), undefined);
  h.press('Cancel the new area'); h.press('WHOLE BAY'); doneMode(h);
  assert.ok(h.child('RoutePlannerV2Panel'), 'back to AUTO-PLAN');
  h.child('RoutePlannerV2Panel').onClose(); h.render();
  h.press('AREAS'); doneMode(h);
  assert.equal(h.nodes().find(n => n.type === 'RoutePlannerV2Panel'), undefined); assert.equal(openSheet(h), undefined);
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /plannerOrigin/);
});

// 7. Undo instead of confirm --------------------------------------------------------------------------------------------

test('Reset route and Delete position act at once and offer UNDO; reset keeps the shooting areas', () => {
  const { stage, route } = fixture();
  const rules = rulesFor(stage);
  const h = editor(stage, { ...createPlan(), route: { ...route, engagementRules: rules, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] } });
  h.press('PLAN');
  // Delete the second position from its sheet: no confirmation.
  h.child('StageViewport').routePlanning.onSelect('w2'); h.render();
  h.press('Position 2'); h.press('Delete position');
  assert.deepEqual(shown(h).positions.map(p => p.id), ['w1', 'w3']); assert.equal(openSheet(h), undefined, 'no confirmation sheet');
  assert.equal(h.child('UndoBar').text, 'Deleted P2');
  h.child('UndoBar').action.props.onPress(); h.render();
  assert.deepEqual(shown(h).positions.map(p => p.id), ['w1', 'w2', 'w3'], 'UNDO brings it back');
  // From DRAW BY HAND's tool bar too.
  h.press('ROUTE'); h.press('DRAW BY HAND'); h.child('StageViewport').routePlanning.onSelect('w3'); h.render(); h.press('Delete position');
  assert.equal(h.child('UndoBar').text, 'Deleted P3'); h.child('UndoBar').action.props.onPress(); h.render(); doneMode(h);
  // Reset route: positions go, shooting areas and route rules stay; UNDO restores the route.
  h.press('Plan settings'); h.press('Reset route');
  assert.equal(openSheet(h), undefined);
  assert.deepEqual(shown(h).positions, []); assert.deepEqual(shown(h).engagementRules, rules, 'shooting areas kept');
  assert.equal(h.child('UndoBar').text, 'Route reset'); assert.equal(h.child('UndoBar').text, planWords.routeReset);
  h.child('UndoBar').action.props.onPress(); h.render();
  assert.deepEqual(shown(h).positions.map(p => p.id), ['w1', 'w2', 'w3']);
  // Resetting a route that is already empty changes nothing, so it offers no UNDO (that would take back an older edit).
  const empty = editor(stage, createPlan()); empty.press('PLAN'); empty.press('Plan settings'); empty.press('Reset route');
  assert.equal(empty.nodes().find(n => n.type === 'UndoBar'), undefined); assert.ok(saved(empty));
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /'resetRoute'|'deleteWaypoint'|Clear the route, positions|Delete this position and its reload/);
});

// 8. Words on the canvas ------------------------------------------------------------------------------------------------

test('positions read P1, P2… on the canvas, in 3D and in WALK; the start is labelled once', () => {
  const { stage, route } = fixture();
  const r = { ...route, engagementRules: rulesFor(stage), positions: [position('w1', 100, 300, ['t1']), position('odd label', 200, 300, ['t2']), route.positions[2]] };
  const rn = { View: 'View', Text: 'Text', Pressable: 'Pressable', PanResponder: { create: h => ({ panHandlers: h }) } };
  const overlay = harness('editor/RouteOverlay.tsx', { stage, transform: { scale: 1, offsetX: 0, offsetY: 0 }, route: r, selectedId: null, onSelect() {}, onChange() {}, onDragging() {} }, { 'react-native': rn });
  const markers = overlay.nodes().filter(n => typeof n.type === 'function' && n.type.name === 'Marker');
  const marker = harness('editor/RouteOverlay.tsx', { ...markers[1].props }, { 'react-native': rn }, 'Marker');
  assert.equal(marker.find(n => n.type === 'Text').props.children, 'P2', 'by route order, not the stored label');
  assert.equal(marker.find(n => n.props.accessible).props.accessibilityLabel, 'Position P2');
  assert.ok(!overlay.nodes().some(n => n.type === 'Text' && n.props.children === 'START'), 'the start box says START; the route adds no second tag');
  // The engagement marks are named by the position (no E1, M1).
  const marks = harness('editor/EngagementOverlay.tsx', { stage, route: r, transform: { scale: 1, offsetX: 0, offsetY: 0 }, onSelect() {} }, { 'react-native': rn });
  const texts = marks.nodes().filter(n => n.type === 'Text').map(n => n.props.children);
  assert.ok(!texts.some(t => /^[EM]\d+$|ENGAGEMENT \d|MOVING \d/.test(String(t))), 'no E1 / M1: ' + texts.join(', '));
  assert.ok(marks.nodes().some(n => n.props.accessibilityLabel === 'Position 1 · standing: targets and order'));
  // 3D stops and WALK use the same names.
  const walk = buildWalk(stage, r);
  assert.deepEqual(walk.stops.map(s => s.label), ['START', 'P1', 'P2', 'P3']);
  assert.match(src('editor/StageBuilder.tsx'), /stops: walk\.stops\.slice\(1\)/, '3D draws the walk\'s stops (P1…), without a second START');
});

// 9. The drawing under the stage ----------------------------------------------------------------------------------------

test('the drawing\'s opacity and placement are kept with its import record; old records load at half opacity', () => {
  const asset = { path: 'diagram-imports/d.png', name: 'd.png', mime: 'image/png', size: 10 };
  const page = { asset, width: 256, height: 256, page: 1, pageCount: 1 };
  const old = { version: 1, id: 'd', source: asset, sourceKind: 'image', page, rectified: page, aligned: page, alignment: { corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, projection: 'top-down', origin: { x: 0, y: 0 }, calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, inches: 256, evidence: 'grid', approximate: true }, proposals: [] };
  DM.validateReconstruction(old);
  assert.equal(DM.backdropOf(old).opacity, 0.5, 'a record from before has no opacity: half');
  const placed = DM.placeDrawing(old, { left: -3.6, top: 7.2, opacity: 0.85 });
  assert.deepEqual([placed.origin, placed.opacity], [{ x: -3.6, y: 7.2 }, 0.85]);
  assert.deepEqual([DM.backdropOf(placed).left, DM.backdropOf(placed).top, DM.backdropOf(placed).opacity], [-3.6, 7.2, 0.85], 'a nudge moves the origin, so elements added later still line up');
  assert.throws(() => DM.validateReconstruction({ ...old, opacity: 2 }));
  assert.throws(() => DM.validateReconstruction({ ...old, origin: { x: Infinity, y: 0 } }));
  assert.equal(old.opacity, undefined, 'the old record is not changed');
});

test('DRAWING in BUILD\'s and PLAN\'s •••: opacity and nudges are saved with the drawing; REALIGN opens the import on it', async () => {
  const { stage } = fixture();
  const record = { id: 'd', origin: { x: 0, y: 0 } }, written = [];
  const h = editor(stage, createPlan(), { repo: { loadDiagramImports: async () => [record], saveDiagramImport: async (_, d) => written.push(d) }, '../diagramImport/model': { placeDrawing: (d, p) => ({ ...d, origin: { x: p.left, y: p.top }, opacity: p.opacity }) } });
  h.press('Build settings'); assert.ok(!titlesIn(sheet(h).children).includes('DRAWING'), 'no drawing yet'); sheet(h).close(); h.render();
  h.press('IMPORT'); h.child('DiagramImportScreen').onBackdrop({ id: 'd', uri: 'file:///d.png', left: 0, top: 0, width: 100, height: 100, opacity: 0.3 }); h.child('DiagramImportScreen').close(); h.render();
  assert.equal(h.child('StageViewport').backdrop.opacity, 0.3, 'the remembered opacity, not a default');
  h.press('PLAN'); h.press('Plan settings'); h.press('DRAWING');
  assert.equal(sheet(h).title, 'Drawing'); assert.equal(sheet(h).back.label, 'Back to plan settings');
  tree(sheet(h).children).find(n => n.type === 'Segmented').props.onChange('STRONG'); h.render();
  h.press('Nudge the drawing right'); h.press('Nudge the drawing up');
  const step = yardsToInches(0.1);
  assert.deepEqual([h.child('StageViewport').backdrop.left, h.child('StageViewport').backdrop.top, h.child('StageViewport').backdrop.opacity], [step, -step, 0.85]);
  await h.settle(); await h.settle();
  assert.deepEqual(written.map(d => [d.origin.x, d.origin.y, d.opacity]), [[0, 0, 0.85], [step, 0, 0.85], [step, -step, 0.85]], 'each change is written to the drawing\'s record, in order');
  assert.ok(tree(sheet(h).children).some(n => n.type === 'Copy' && /0\.1 yd per tap/.test(n.props.children)), 'yards, through measurements.ts');
  h.press('REALIGN');
  assert.equal(h.child('DiagramImportScreen').visible, true); assert.equal(h.child('DiagramImportScreen').reopenId, 'd');
  h.child('DiagramImportScreen').close(); h.render();
  h.press('BUILD'); h.press('IMPORT'); assert.equal(h.child('DiagramImportScreen').reopenId, null, 'IMPORT afterwards opens as usual');
  h.child('DiagramImportScreen').close(); h.render();
  h.press('Build settings'); assert.ok(titlesIn(sheet(h).children).includes('DRAWING'), 'the same sheet from BUILD');
});

// 10. One family picker -------------------------------------------------------------------------------------------------

test('one family picker: the match families by default, every family when asked (the ADD ring)', () => {
  const chosen = [];
  const match = harness('ui/TargetFamilyPicker.tsx', { value: 'USPSA', onChange: f => chosen.push(f) });
  const { matchFamilies } = require('../src/rules/rulesets.ts');
  assert.deepEqual(match.nodes().filter(n => n.props.accessibilityRole === 'radio').map(n => n.props.accessibilityLabel), [...matchFamilies]);
  const all = harness('ui/TargetFamilyPicker.tsx', { value: 'USPSA', onChange: f => chosen.push(f), families: ['USPSA', 'PCSL', 'IDPA'] });
  const radios = all.nodes().filter(n => n.props.accessibilityRole === 'radio');
  assert.deepEqual(radios.map(n => n.props.accessibilityLabel), ['USPSA', 'PCSL', 'IDPA']);
  radios[2].props.onPress(); assert.deepEqual(chosen, ['IDPA']);
  assert.match(src('editor/RadialAddMenu.tsx'), /<TargetFamilyPicker families=\{targetFamilies\}/);
  const pickers = ['editor', 'planning', 'diagramImport'].flatMap(dir => fs.readdirSync(path.join(__dirname, '../src', dir), { recursive: true }).filter(f => /\.tsx$/.test(f)).map(f => path.join(dir, f)))
    .filter(f => /options=\{targetFamilies\}|matchFamilies\.map\(family/.test(src(f)));
  assert.deepEqual(pickers, [], 'no other target family picker in the editor');
});
