// UI cohesion phase 3a (PLAN as one guided path, planning side): one engagement model and the ENGAGE-arrow migration,
// REVIEW's marks in ANALYZE, ANALYZE answer first, AUTO-PLAN standing by default, planning defaults, the PLAN target
// sheet, the checklist state and header, the route lifecycle helpers, and the alternative labels.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');
const { createPlan, reconcilePlan } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute, isStageRoute } = require('../src/planning/route.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');
const { routeSectionId } = require('../src/planning/manualEngagements.ts');
const { setConnection } = require('../src/planning/routeGeometry.ts');
const A = require('../src/planning/assignments.ts');
const D = require('../src/planning/planDefaults.ts');
const S = require('../src/planning/planStatus.ts');
const L = require('../src/planning/routeLifecycle.ts');
const { planWords } = require('../src/planning/planWords.ts');
const { createLocalProfile } = require('../src/profile/model.ts');

const point = (x, y) => ({ space: 'stage', x, y, z: 0 });
const position = (id, x, y, engaged = [], extra = {}) => ({ id, label: id, position: point(x, y), visibleTargetIds: [...engaged], engagedTargetIds: [...engaged], ...extra });
/** 400 × 400 in stage: start at the bottom, paper t1 and t2, a plate t3, a no-shoot; positions w1–w3 across the middle. */
function fixture() {
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start', 'start', 20, 300), createObject('cardboardTarget', 't1', 150, 70), createObject('cardboardTarget', 't2', 250, 70),
    createObject('steelPlate', 't3', 330, 60), createObject('noShootTarget', 'ns', 50, 70)];
  const route = { ...createRoute('r'), positions: [position('w1', 100, 300), position('w2', 200, 300), position('w3', 300, 300)] };
  return { stage, route };
}
const arrow = (id, targetId, anchor) => ({ id, targetId, anchor, direction: 0 });
const at = waypointId => ({ kind: 'waypoint', waypointId });
const along = (from, to, fraction = 0.5) => ({ kind: 'section', sectionId: routeSectionId(from, to), fraction });
const text = n => [].concat(n.props.children).join('');

// 1. One engagement model -------------------------------------------------------------------------------------------

test('assignTarget gives a target exactly one engaging position, standing, last in order, marked visible; unassign clears it', () => {
  const { stage, route } = fixture();
  let r = A.assignTarget(route, stage, 'w1', 't1');
  r = A.assignTarget(r, stage, 'w1', 't2');
  assert.deepEqual(r.positions[0].engagedTargetIds, ['t1', 't2']);
  assert.deepEqual(r.positions[0].visibleTargetIds, ['t1', 't2']);
  assert.equal(A.assignTarget(r, stage, 'w1', 't1'), r, 'already engaged there: unchanged, order kept');
  // Dragging t1 to w2 moves it: one engagement per target.
  r = A.assignTarget(r, stage, 'w2', 't1');
  assert.deepEqual(r.positions.map(p => p.engagedTargetIds), [['t2'], ['t1'], []]);
  assert.deepEqual(A.targetAssignment(r, 't1'), { positionId: 'w2', index: 1, moving: false });
  // No-shoots, props, missing targets and positions are refused.
  for (const [p, t] of [['w1', 'ns'], ['w1', 'start'], ['w1', 'gone'], ['nowhere', 't3']]) assert.equal(A.assignTarget(r, stage, p, t), r);
  // A target engaged on the way in becomes a standing engagement when assigned again.
  const moving = { ...r, engagementRules: defaultEngagementRules(stage), positions: r.positions.map(p => p.id === 'w3' ? { ...p, engagedTargetIds: ['t3'], visibleTargetIds: ['t3'], movingTargetIds: ['t3'] } : p) };
  assert.equal(A.targetAssignment(moving, 't3').moving, true);
  const standing = A.assignTarget(moving, stage, 'w3', 't3');
  assert.deepEqual([standing.positions[2].engagedTargetIds, standing.positions[2].movingTargetIds], [['t3'], []]);
  assert.ok(isStageRoute(standing));
  const cleared = A.unassignTarget(standing, 't1');
  assert.equal(A.targetAssignment(cleared, 't1'), null);
  assert.deepEqual(cleared.positions[1].visibleTargetIds, ['t1'], 'it stays visible');
  assert.equal(A.unassignTarget(cleared, 't1'), cleared, 'nothing to clear: unchanged');
  assert.equal(A.unassignTarget(standing, 't1', 'w1'), standing, 'only from the named position');
});

test('saved ENGAGE arrows from positions become engagements there, after the ones already there, in saved order, without duplicates', () => {
  const { stage, route } = fixture();
  route.positions[0] = position('w1', 100, 300, ['t2']);
  route.manualEngagements = [arrow('a', 't3', at('w1')), arrow('b', 't1', at('w1')), arrow('dup', 't1', at('w1')), arrow('again', 't2', at('w1')),
    arrow('elsewhere', 't2', at('w3')), arrow('gone', 'missing', at('w2')), arrow('ns', 'ns', at('w2')), arrow('orphan', 't1', at('deleted-position'))];
  assert.ok(isStageRoute(route), 'old saved data still validates');
  const migrated = A.migrateManualEngagements(stage, route);
  assert.equal('manualEngagements' in migrated, false, 'no arrows after the migration');
  assert.deepEqual(migrated.positions.map(p => p.engagedTargetIds), [['t2', 't3', 't1'], [], []], 'appended in arrow order; t2 keeps w1, where ANALYZE already checked it');
  assert.deepEqual(migrated.positions[0].visibleTargetIds, ['t2', 't3', 't1']);
  assert.ok(isStageRoute(migrated));
  assert.equal(A.migrateManualEngagements(stage, migrated), migrated, 'idempotent: a route without arrows is returned as is');
  const { manualEngagements: _arrows, ...plain } = route;
  assert.deepEqual(A.migrateManualEngagements(stage, { ...route, manualEngagements: [] }), plain, 'an empty arrow list is simply dropped');
});

test('arrows from the path between two positions become one new position at the middle of that stretch, bends split', () => {
  const { stage, route } = fixture();
  // A drawn path w1 → w2 with one bend in its first half.
  let r = setConnection(route, { fromId: 'w1', toId: 'w2', style: 'STRAIGHT', bends: [{ id: 'bend', position: point(120, 340) }] });
  r = { ...r, manualEngagements: [arrow('first', 't2', along('w1', 'w2', 0.3)), arrow('second', 't1', along('w1', 'w2', 0.8)), arrow('start-leg', 't3', along('start', 'w1'))] };
  const migrated = A.migrateManualEngagements(stage, r);
  assert.deepEqual(migrated.positions.map(p => p.label), ['P1', 'w1', 'P2', 'w2', 'w3'], 'inserted before the end of each stretch, named like every new position');
  const mid = migrated.positions[2];
  assert.deepEqual(mid.engagedTargetIds, ['t2', 't1'], 'both arrows on one stretch: one position, saved order');
  assert.equal(mid.id, 'position-first');
  // Walk w1 → bend → w2 is 44.7 + 116.6 in; its middle is on the second piece, 35.9 in past the bend.
  const total = Math.hypot(20, 40) + Math.hypot(80, 40), rest = total / 2 - Math.hypot(20, 40);
  assert.ok(Math.abs(mid.position.x - (120 + 80 * rest / Math.hypot(80, 40))) < 1e-9 && Math.abs(mid.position.y - (340 - 40 * rest / Math.hypot(80, 40))) < 1e-9);
  assert.deepEqual(migrated.connections, [{ fromId: 'w1', toId: 'position-first', style: 'STRAIGHT', bends: [{ id: 'bend', position: point(120, 340) }] }], 'the bend stays on its half');
  assert.deepEqual(migrated.positions[0].position, point(60, 300), 'start → w1 has its middle half way');
  assert.deepEqual(migrated.positions[0].engagedTargetIds, ['t3']);
  assert.ok(isStageRoute(migrated));
  // Same total ground: the path is only split at its middle.
  const length = rt => evaluateRoute(stage, createPlan(), rt, null).distance;
  assert.ok(Math.abs(length(migrated) - length({ ...r, manualEngagements: undefined })) < 1e-9);
  assert.equal(A.migrateManualEngagements(stage, migrated), migrated);
  // A stretch that no longer exists (the positions were reordered) loses its arrows.
  assert.deepEqual(A.migrateManualEngagements(stage, { ...route, manualEngagements: [arrow('x', 't1', along('w3', 'w1'))] }).positions.map(p => p.id), ['w1', 'w2', 'w3']);
});

test('plans are normalised on load: reconcilePlan migrates arrows; the editor opens old data migrated and not marked unsaved', () => {
  const { stage, route } = fixture();
  route.manualEngagements = [arrow('e', 't1', at('w2')), arrow('m', 't2', along('w2', 'w3'))];
  const plan = { ...createPlan(), route };
  const loaded = reconcilePlan(plan, stage);
  assert.equal(loaded.route.manualEngagements, undefined);
  assert.deepEqual(loaded.route.positions.map(p => [p.id, p.engagedTargetIds]), [['w1', []], ['w2', ['t1']], ['position-m', ['t2']], ['w3', []]]);
  assert.equal(reconcilePlan(loaded, stage), loaded, 'normalising again changes nothing');
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage', matchId: 'm', document: stage, plan }, targetFamily: 'USPSA' });
  h.press('PLAN');
  const shown = h.child('StageViewport').routePlanning.route;
  assert.equal(shown.manualEngagements, undefined);
  assert.deepEqual(shown.positions[1].engagedTargetIds, ['t1']);
  assert.ok(h.nodes().some(n => n.props?.title === 'SAVED ✓'), 'opening migrated data does not mark the stage unsaved');
});

// 2 and 3. ANALYZE: REVIEW's marks, the answer first -------------------------------------------------------------------

test('REVIEW marks come from position engagements: ✓ engaged (checked or not), ! not engaged or failing the check', () => {
  const { stage, route } = fixture();
  const r = { ...route, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] };
  const unchecked = S.reviewTargets(stage, r);
  assert.equal(unchecked.checked, false);
  assert.deepEqual(unchecked.targets.map(t => [t.name, t.mark, t.note]), [['T1 · Paper', '✓', 'P1 · standing · not checked'], ['T2 · Paper', '!', 'Not engaged'], ['T3 · Plate', '!', 'Not engaged']]);
  assert.deepEqual([unchecked.engaged, unchecked.total], [1, 3]);
  // With route rules: the analysis decides. An area around w1 only: t1 passes there; t2 assigned to w3 (outside) fails.
  const rules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 60, y: 260 }, { x: 140, y: 260 }, { x: 140, y: 340 }, { x: 60, y: 340 }] }] };
  const checkedRoute = { ...r, engagementRules: rules, positions: [r.positions[0], r.positions[1], position('w3', 300, 300, ['t2'])] };
  const analysis = evaluateRoute(stage, createPlan(), checkedRoute, null).engagementAnalysis;
  const checked = S.reviewTargets(stage, checkedRoute, analysis);
  assert.equal(checked.checked, true);
  assert.deepEqual(checked.targets.map(t => [t.mark, t.note]), [['✓', 'P1 · standing · passes the checks'], ['!', 'P3 · standing · fails the checks there · legal standing from P1'], ['!', 'Not engaged']]);
});

const profile = (extra = {}) => ({ ...createLocalProfile().performance, ...extra });
function scoredStage() {
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1440, depth: 1080 } }), objects: [createObject('start', 'start', 100, 1000)] };
  for (const [id, x] of [['A', 160], ['B', 300], ['C', 1000]]) stage = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x, y: 748, z: 0 }).stage;
  return stage;
}
const pos = (id, x, t) => position(id, x, 1000, t);

test('ANALYZE opens on the answer: time, hit factor, targets, what is missing and where the numbers come from; details folded', () => {
  const stage = scoredStage();
  const route = { ...createRoute('r'), positions: [pos('P1', 200, ['A', 'B']), pos('P2', 1000, [])] };
  // No rounds or loadout set: the rule default (2 per paper) and the profile loadout (15 + 15) make ANALYZE work.
  const plan = { ...createPlan(), route, expectations: { A: { outcome: 'AA' }, B: { outcome: 'AC' }, C: { outcome: 'AA' } } };
  const h = harness('planning/RouteAnalysis.tsx', { stage, plan, route, profile: profile(), edit() {} });
  const stat = label => h.nodes().find(n => n.type === 'Stat' && n.props.label.startsWith(label))?.props.value;
  assert.match(stat('Time'), /^\d+\.\d\d s$/, 'time with two decimals');
  assert.equal(stat('Hit factor'), '—', 'C is not engaged: no hit factor');
  assert.equal(stat('Targets'), '2/3');
  const notices = h.nodes().filter(n => n.type === 'Notice').map(text);
  assert.ok(notices.includes('T3 not engaged'), notices.join(' | '));
  assert.ok(notices.some(n => /^Engagements not checked/.test(n)));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && text(n) === 'Default times: none of your numbers yet (log drills in Training).'));
  // Details are folded: nothing below the answer until a section is opened.
  for (const label of ['Estimated hit factor', 'Movement', 'Starting']) assert.ok(!h.nodes().some(n => n.type === 'DataRow' && n.props.label === label), label + ' is folded');
  const sections = h.nodes().filter(n => n.type === 'Action' && /^▸ /.test(n.props.title)).map(n => n.props.title);
  assert.deepEqual(sections.map(t => t.split(' · ')[0]), ['▸ TARGETS', '▸ ROUTE', '▸ AMMUNITION', '▸ TIME', '▸ POINTS AND HIT FACTOR', '▸ WARNINGS']);
  // Movement in yards to one decimal (through measurements.ts), not "25.218 yd".
  assert.match(sections[1], /^▸ ROUTE · 2 POSITIONS · \d+\.\d YD$/);
  h.press('Show route');
  assert.match(h.nodes().find(n => n.type === 'DataRow' && n.props.label === 'Movement').props.value, /^\d+\.\d yd$/);
  h.press('Show targets');
  assert.deepEqual(h.nodes().filter(n => n.type === 'DataRow' && /^[✓!] /.test(n.props.label)).map(n => [n.props.label, n.props.value]),
    [['✓ T1 · Paper', 'P1 · standing · not checked'], ['✓ T2 · Paper', 'P1 · standing · not checked'], ['! T3 · Paper', 'Not engaged']]);
  h.press('Show ammunition');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Loadout from your profile: 15-round magazines loaded with 15, chamber empty; no spares needed\./.test(text(n))));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Rounds for 3 targets: the rule default \(2 per paper target, 1 per steel; USPSA 9\.5\.1, PCSL 11\.3\.1\)/.test(text(n))));

  // Everything engaged, measured live-fire numbers: a hit factor, nothing missing except the unchecked engagements.
  const full = { ...route, positions: [pos('P1', 200, ['A', 'B']), pos('P2', 1000, ['C'])] };
  const live = profile({ averageSplitTime: 0.2, transitionTime: 0.3, timingEvidence: { averageSplitTime: { source: 'MEASURED', sampleCount: 3, context: 'LIVE_FIRE' }, transitionTime: { source: 'MEASURED', sampleCount: 3, context: 'LIVE_FIRE' } } });
  const done = harness('planning/RouteAnalysis.tsx', { stage, plan: { ...plan, route: full }, route: full, profile: live, edit() {} });
  assert.match(done.nodes().find(n => n.type === 'Stat' && n.props.label.startsWith('Hit factor')).props.value, /^\d+\.\d\d$/);
  assert.ok(done.nodes().some(n => n.type === 'Copy' && text(n) === 'Times from your live-fire numbers (split and transition); default movement, draw and reload times (not measured).'));
  assert.ok(done.nodes().some(n => n.type === 'Copy' && text(n) === 'Points from your planned hits (3 targets).'));
});

test('what is missing names the real gaps: reloads by position, zero rounds, no hit estimate, untimed moving shots', () => {
  const stage = scoredStage();
  const route = { ...createRoute('r'), positions: [pos('P1', 200, ['A', 'B']), pos('P2', 1000, ['C'])] };
  const evaluate = (plan, r = route) => { const evaluation = evaluateRoute(stage, plan, r, profile()); return S.whatsMissing({ stage, plan, route: r, evaluation, review: S.reviewTargets(stage, r, evaluation.engagementAnalysis) }); };
  const loadout = { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }] };
  assert.ok(evaluate({ ...createPlan(), route, loadout, engagements: { A: 4, B: 4, C: 4 } }).includes('No reload planned for P2 (needs 4 rounds, 2 left)'));
  assert.ok(evaluate({ ...createPlan(), route, loadout, engagements: { A: 0, B: 2, C: 2 } }).includes('No rounds planned for T1'));
  assert.ok(evaluate({ ...createPlan(), route, engagements: { A: 2, B: 2, C: 2 } }).includes('No loadout: add magazines in Loadout'));
  assert.deepEqual(evaluate({ ...createPlan(), route }, { ...route, positions: [] }), ['No route yet: plan one in ROUTE']);
});

test('PLAN RELOADS with the profile loadout saves that loadout with the reloads, so they point at real magazines', () => {
  const stage = scoredStage();
  const route = { ...createRoute('r'), positions: [pos('P1', 200, ['A', 'B']), pos('P2', 1000, ['C'])] };
  const plan = { ...createPlan(), route, engagements: { A: 4, B: 4, C: 6 } };
  let changed = null;
  const props = { stage, plan, route, profile: profile({ magazineCapacity: 10, startingRounds: 10 }), edit() {}, onRouteChange() { assert.fail('reloads alone would point at magazines the plan does not have'); }, onPlanChange: p => { changed = p; } };
  const h = harness('planning/RouteAnalysis.tsx', props);
  assert.ok(h.nodes().some(n => n.type === 'Notice' && text(n) === 'No reload planned for P2 (needs 6 rounds, 2 left)'));
  h.press('Show ammunition');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /1 spare, enough for the 14 planned rounds/.test(text(n))));
  h.press('Plan reloads around magazine capacity');
  assert.deepEqual(changed.loadout.magazines.map(m => m.id), ['magazine-profile-1', 'magazine-profile-2']);
  assert.deepEqual(changed.route.reloads.map(r => [r.positionId, r.magazineId]), [['P2', 'magazine-profile-2']]);
  assert.deepEqual(changed.engagements, plan.engagements);
  // Without onPlanChange and with only the profile loadout, PLAN RELOADS is not offered.
  const legacy = harness('planning/RouteAnalysis.tsx', { ...props, onPlanChange: undefined });
  legacy.press('Show ammunition');
  assert.ok(!legacy.nodes().some(n => n.props?.title === 'PLAN RELOADS'));
});

// 4. AUTO-PLAN ------------------------------------------------------------------------------------------------------

test('AUTO-PLAN starts on STANDING ONLY while ANALYZE cannot time moving shots, and says what ON THE MOVE costs', () => {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 100, 440), createObject('cardboardTarget', 'T1', 300, 60)];
  const plan = createPlan(); plan.route = { ...createRoute('r'), engagementRules: { ...defaultEngagementRules(stage), allowMoving: true } };
  const h = harness('planning/v2/RoutePlannerV2Panel.tsx', { stage, plan, preview: null, onClose() {}, onUse() {}, onPreview() {}, onConfigure() {} });
  const choice = () => h.find(n => n.type === 'Segmented' && n.props.options.includes('ON THE MOVE')).props;
  assert.equal(choice().value, 'STANDING ONLY');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && text(n) === D.ON_THE_MOVE_COST));
  choice().onChange('ON THE MOVE'); h.render();
  assert.equal(choice().value, 'ON THE MOVE');
  assert.ok(h.nodes().some(n => n.type === 'Notice' && text(n) === D.ON_THE_MOVE_COST));
  // The cost is what the code does: a route with a moving engagement has no timing.
  const moving = { ...createRoute('m'), engagementRules: defaultEngagementRules(stage), positions: [position('P1', 300, 300, ['T1'], { movingTargetIds: ['T1'] })] };
  assert.equal(evaluateRoute(stage, { ...createPlan(), engagements: { T1: 2 } }, moving, profile()).timing, null,
    'if moving routes become timed, revisit MOVING_SHOTS_TIMED and ON_THE_MOVE_COST in planDefaults.ts');
  assert.equal(D.MOVING_SHOTS_TIMED, false);
});

// 5. Defaults --------------------------------------------------------------------------------------------------------

test('rounds default by target type from the rules (paper 2, steel 1, no-shoots none); your numbers win, zero included', () => {
  const { stage } = fixture();
  assert.deepEqual(['cardboardTarget', 'steelPlate', 'steelPopper', 'noShootTarget', 'wall'].map(D.defaultRounds), [2, 1, 1, 0, 0]);
  const plan = { ...createPlan(), engagements: { t1: 0, t3: 4 } };
  const { plan: effective, defaultRoundIds } = D.withPlanDefaults(stage, plan, null);
  assert.deepEqual(effective.engagements, { t1: 0, t3: 4, t2: 2 });
  assert.deepEqual(defaultRoundIds, ['t2']);
  assert.equal(D.withRoundDefaults({ ...plan, engagements: { t1: 1, t2: 1, t3: 1 } }, stage).engagements.t2, 1);
  assert.equal(D.roundsSourceText(plan, stage.objects[2]), '2 rounds · rule default (2 hits per paper target, USPSA 9.5.1, PCSL 11.3.1)');
  assert.equal(D.roundsSourceText(plan, stage.objects[3]), '4 rounds · your number');
  assert.equal(D.roundsSourceText({ engagements: {} }, stage.objects[3]), '1 round · rule default (1 hit per steel target, USPSA 9.5.1, PCSL 11.3.1)');
  // The Target rounds sheet shows the same numbers.
  const panel = harness('planning/PlanningPanel.tsx', { plan, stage, onChange() {}, section: 'targets' });
  assert.deepEqual(panel.nodes().filter(n => n.type?.name === 'RoundAssignment').map(n => [n.props.label, n.props.value]), [['T1 · Paper', 0], ['T2 · Paper · rule default', 2], ['T3 · Plate', 4]]);
});

test('the loadout defaults from the profile magazine fields, with spares for the planned rounds; your magazines win', () => {
  const { stage } = fixture();
  const p = profile({ magazineCapacity: 10, startingRounds: 8, chamberedRound: true });
  const { plan, loadoutNote } = D.withPlanDefaults(stage, createPlan(), p);
  // 5 rule-default rounds: 8 + 1 chambered cover them.
  assert.deepEqual(plan.loadout, { chamberLoaded: true, startingMagazineId: 'magazine-profile-1', magazines: [{ id: 'magazine-profile-1', capacity: 10, startingRounds: 8 }] });
  assert.match(loadoutNote, /^Loadout from your profile: 10-round magazines loaded with 8, chamber loaded; no spares needed\. Set your own in Loadout\.$/);
  assert.equal(D.profileLoadout(p, 26).loadout.magazines.length, 4, '8 + 1 in the gun, then 17 more rounds need 3 spares of 8');
  assert.equal(D.profileLoadout({ magazineCapacity: 10, startingRounds: 12, chamberedRound: false }, 5), null, 'impossible numbers give no default');
  assert.equal(D.profileLoadout(null, 5), null);
  const mine = { ...createPlan(), loadout: { chamberLoaded: false, startingMagazineId: 'm', magazines: [{ id: 'm', capacity: 5, startingRounds: 5 }] } };
  const kept = D.withPlanDefaults(stage, mine, p);
  assert.equal(kept.plan.loadout, mine.loadout);
  assert.equal(kept.loadoutNote, null);
  assert.equal(D.withPlanDefaults(stage, createPlan(), null).loadoutNote, null, 'no profile: no loadout default');
});

// 6. Target sheet ----------------------------------------------------------------------------------------------------

test('the PLAN target sheet: T1 with its type, rounds with their source, expected hits, and Engaged from through assignTarget', () => {
  const { stage, route } = fixture();
  const r = { ...route, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] };
  let plan = { ...createPlan(), route: r }, routeOut = null;
  const props = { visible: true, close() {}, stage, plan, route: r, targetId: 't1', onPlanChange: p => { plan = p; }, onRouteChange: x => { routeOut = x; } };
  const h = harness('planning/TargetPlanSheet.tsx', props);
  assert.equal(h.child('EditorSheet').title, 'T1 · Paper');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && text(n) === '2 rounds · rule default (2 hits per paper target, USPSA 9.5.1, PCSL 11.3.1)'));
  h.press('More rounds');
  assert.equal(plan.engagements.t1, 3);
  props.plan = plan; h.render();
  assert.ok(h.nodes().some(n => n.type === 'Copy' && text(n) === '3 rounds · your number'));
  h.press('USE RULE DEFAULT (2)');
  assert.equal('t1' in plan.engagements, false);
  h.child('ExpectedHits').onChange({ outcome: 'AA' });
  assert.deepEqual(plan.expectations, { t1: { outcome: 'AA' } });
  const engaged = () => h.find(n => n.type === 'Segmented' && n.props.options.includes('NOT ENGAGED')).props;
  assert.deepEqual(engaged().options, ['P1', 'P2', 'P3', 'NOT ENGAGED']);
  assert.equal(engaged().value, 'P1');
  assert.equal(h.nodes().find(n => n.type === 'DataRow' && n.props.label === planWords.engagedFrom).props.value, 'P1 · standing');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Not checked:/.test(text(n))));
  engaged().onChange('P3');
  assert.deepEqual(routeOut.positions.map(p => p.engagedTargetIds), [[], [], ['t1']]);
  engaged().onChange('NOT ENGAGED');
  assert.equal(A.targetAssignment(routeOut, 't1'), null);
  // No positions yet: says how to get one. A no-shoot or deleted target has no plan.
  const empty = harness('planning/TargetPlanSheet.tsx', { ...props, route: createRoute('draft') });
  assert.ok(empty.nodes().some(n => n.type === 'Copy' && /^No positions yet/.test(text(n))));
  const gone = harness('planning/TargetPlanSheet.tsx', { ...props, targetId: 'ns' });
  assert.equal(gone.child('EditorSheet').title, 'Missing target');
});

test('the target sheet says where a target is legal standing when route rules exist', () => {
  const { stage, route } = fixture();
  const rules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 60, y: 260 }, { x: 140, y: 260 }, { x: 140, y: 340 }, { x: 60, y: 340 }] }] };
  const r = { ...route, engagementRules: rules };
  const h = harness('planning/TargetPlanSheet.tsx', { visible: true, close() {}, stage, plan: { ...createPlan(), route: r }, route: r, targetId: 't1', onPlanChange() {}, onRouteChange() {} });
  assert.ok(h.nodes().some(n => n.type === 'Copy' && text(n) === 'Legal standing from P1 (shooting area, safe angle, line of sight).'));
});

// 7. Checklist -------------------------------------------------------------------------------------------------------

test('PLAN checklist: each line shows ✓, a count or what is missing, and whether ANALYZE has something to analyze', () => {
  const { stage, route } = fixture();
  const lines = c => c.lines.map(l => [l.step, l.title, l.done, l.status]);
  const empty = S.planChecklist(stage, createPlan(), profile());
  assert.deepEqual(lines(empty), [[1, 'Shooting areas', false, 'Draw at least one shooting area'], [2, 'Route', false, 'Plan a route: AUTO-PLAN, or draw it by hand'],
    [3, 'Targets and reloads', false, '0/3 targets planned · no reloads · 3 to engage']]);
  assert.deepEqual(empty.analyze, { ready: false, note: 'Plan a route first' });
  const rules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 0, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 0, y: 400 }] }] };
  const partial = { ...route, engagementRules: rules, positions: [position('w1', 100, 300, ['t1']), route.positions[1], route.positions[2]] };
  const some = S.planChecklist(stage, { ...createPlan(), route: partial }, profile());
  assert.deepEqual(lines(some), [[1, 'Shooting areas', true, '✓ · 1 area'], [2, 'Route', true, '✓ · 3 positions'], [3, 'Targets and reloads', false, '1/3 targets planned · no reloads · 2 to engage']]);
  assert.deepEqual(some.targets, { planned: 1, total: 3 });
  assert.deepEqual(some.analyze, { ready: true, note: 'Ready; some steps are open' });
  // Every target engaged, but the rounds outrun the starting magazine: the missing reload is named.
  const full = { ...partial, positions: [position('w1', 100, 300, ['t1']), position('w2', 200, 300, ['t2']), position('w3', 300, 300, ['t3'])] };
  const plan = { ...createPlan(), route: full, engagements: { t1: 10, t2: 10, t3: 1 }, loadout: { chamberLoaded: false, startingMagazineId: 'm', magazines: [{ id: 'm', capacity: 15, startingRounds: 15 }, { id: 's', capacity: 15, startingRounds: 15 }] } };
  assert.equal(S.planChecklist(stage, plan, profile()).lines[2].status, '3/3 targets planned · no reloads · no reload planned for P2');
  const reloaded = { ...plan, route: { ...full, reloads: [{ positionId: 'w2', magazineId: 's' }] } };
  const ready = S.planChecklist(stage, reloaded, profile());
  assert.deepEqual(ready.lines[2], { key: 'targets', step: 3, title: 'Targets and reloads', done: true, status: '✓ · 3/3 targets planned · 1 reload' });
  assert.deepEqual(ready.analyze, { ready: true, note: 'Ready' });
  // Saved ENGAGE arrows count, as ANALYZE counts them.
  const arrows = S.planChecklist(stage, { ...createPlan(), route: { ...route, manualEngagements: [arrow('e', 't2', at('w2'))] } }, null);
  assert.deepEqual(arrows.targets, { planned: 1, total: 3 });
});

test('the checklist header shows the three lines and opens the tool for the line tapped', () => {
  const { stage } = fixture();
  const opened = [];
  const h = harness('planning/PlanChecklist.tsx', { checklist: S.planChecklist(stage, createPlan(), null), onPress: key => opened.push(key), current: 'route' });
  const rows = h.nodes().filter(n => n.type === 'Pressable');
  assert.deepEqual(rows.map(r => r.props.accessibilityLabel), ['1 Shooting areas: Draw at least one shooting area', '2 Route: Plan a route: AUTO-PLAN, or draw it by hand', '3 Targets and reloads: 0/3 targets planned · no reloads · 3 to engage']);
  assert.deepEqual(rows.map(r => r.props.accessibilityState.selected), [false, true, false]);
  rows.forEach(r => r.props.onPress());
  assert.deepEqual(opened, ['areas', 'route', 'targets']);
});

// 8. Route lifecycle -------------------------------------------------------------------------------------------------

test('PLAN shows an empty draft route and creates it on the first edit; Reset route keeps the shooting areas and rules', () => {
  const { stage } = fixture();
  const plan = createPlan();
  const draft = L.routeForPlan(plan, 'route-draft');
  assert.equal(draft.id, 'route-draft');
  assert.equal(L.commitRoute(plan, draft), plan, 'showing the draft changes nothing (the stage stays saved)');
  const edited = A.assignTarget({ ...draft, positions: [position('p', 10, 10)] }, stage, 'p', 't1');
  const created = L.commitRoute(plan, edited);
  assert.equal(created.route, edited, 'the first edit creates the route');
  assert.equal(L.routeForPlan(created, 'other'), edited);
  const emptied = { ...edited, positions: [] };
  assert.equal(L.commitRoute(created, emptied).route, emptied, 'a saved route is always replaced, even by an empty one');
  const rules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }] };
  assert.notEqual(L.commitRoute(plan, { ...draft, engagementRules: rules }), plan, 'drawing a shooting area is an edit');
  const full = { ...edited, engagementRules: rules, reloads: [{ positionId: 'p', magazineId: 'm' }], connections: [{ fromId: 'start', toId: 'p', style: 'STRAIGHT', bends: [] }] };
  const reset = L.resetRouteKeepingAreas(full, 'route-2');
  assert.deepEqual(reset, { version: 1, id: 'route-2', name: 'Manual route', positions: [], reloads: [], engagementRules: rules });
  assert.notEqual(reset.engagementRules, rules, 'a copy, so undo keeps the old route intact');
  assert.deepEqual(L.resetRouteKeepingAreas(undefined, 'route-3'), createRoute('route-3'));
});

// 9. Alternatives ----------------------------------------------------------------------------------------------------

test('the older optimizer and Ask say they are alternatives to AUTO-PLAN', () => {
  const { stage } = fixture();
  const opt = harness('planning/AutoPlannerPanel.tsx', { stage, plan: createPlan(), profile: null, preview: null, discoveryPreview: false, discoverySession: null, onClose() {}, onUse() {}, onPreview() {}, onConfigure() {}, onDiscovery() {} });
  assert.ok(opt.nodes().some(n => n.type === 'Copy' && text(n) === 'Older optimizer · an alternative to AUTO-PLAN'));
  assert.ok(!opt.nodes().some(n => n.type === 'Notice' && /REVIEW/.test(text(n))), 'REVIEW moved into ANALYZE');
  const ask = harness('planning/routeAI/RouteAISheet.tsx', { visible: true, close() {}, state: { availability: 'UNKNOWN', messages: [], lifecycle: 'IDLE', phase: '' }, controller: { initialize() {} }, revision: 'r', apply() {}, inspect() {} },
    { './controller': { quickPrompts: [], isBusy: () => false } });
  assert.ok(ask.nodes().some(n => n.type === 'Copy' && text(n) === planWords.ask));
  assert.match(planWords.ask, /^Ask · an alternative to AUTO-PLAN/);
});
