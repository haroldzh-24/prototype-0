// Review of 1d1cd6c..05fa593 (UI cohesion pass): repro tests for defects found in review. Each test FAILS while the
// defect is present (it asserts the intended behaviour). Run: node --test tests/reviewFixes.test.cjs
// Copied from the reviewer's review-05fa593.test.cjs. Adjusted where the owner's decisions differ from what the review
// assumed (each adjusted test says so): the loadout note is reworded as a default instead of adding a Profile setting;
// a position's name is its route order everywhere and its stored label stays as data (shown only as a note); the RELOAD
// sheet and the Loadout sheet read the default loadout from the profile they are given. The tests after the reviewer's
// cover the remaining fixes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan, ammunitionSummary } = require('../src/planning/model.ts');
const { createRoute, evaluateRoute, reorderPosition } = require('../src/planning/route.ts');
const { planReloads } = require('../src/planning/reloadPlan.ts');
const D = require('../src/planning/planDefaults.ts');
const S = require('../src/planning/planStatus.ts');
const A = require('../src/planning/assignments.ts');
const { routeSectionId } = require('../src/planning/manualEngagements.ts');
const { createLocalProfile } = require('../src/profile/model.ts');
const { positionName, positionNameWithNote } = require('../src/ui/words.ts');

const plan = route => ({ ...createPlan(), ...(route ? { route } : {}) });
const editor = (route, document = createDefaultStage('USPSA'), family = 'USPSA') =>
  harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage 3', matchId: 'm', document, plan: plan(route) }, targetFamily: family });
const objects = h => (h.nodes().find(n => n.type === 'StageViewport') ?? h.find(n => n.type === 'Stage3DView')).props.stage.objects;
const point = (x, y) => ({ space: 'stage', x, y, z: 0 });
const position = (id, x, y, engaged = []) => ({ id, label: id, position: point(x, y), visibleTargetIds: [...engaged], engagedTargetIds: [...engaged] });

// ---------------------------------------------------------------------------------------------------------------------
// 1. Undo bar: an edit that changed nothing still gets "UNDO", and UNDO takes back an OLDER edit.
//    StageBuilder.tsx resetStage/deleteSelected call noteUndo() unconditionally after act(); act() wraps the edit in
//    documentHistory.begin()/end(), which bump the revision counter even when nothing changed, so the bar is shown.
test('RESET STAGE on a stage already at the default layout must not offer an UNDO that reverts an older edit', () => {
  const h = editor(), defaults = new Set(createDefaultStage('USPSA').objects.map(o => o.id)), count = objects(h).length;
  const paper = objects(h).find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(paper.id); h.render();
  h.press('DUPLICATE');                                   // edit 1: a copy of T1 (selected)
  const copy = objects(h).find(o => !defaults.has(o.id));
  assert.ok(copy, 'the copy exists');
  h.press('DELETE');                                      // edit 2: the copy is deleted -> stage equals the default again
  assert.equal(objects(h).length, count);
  h.press('Build settings'); h.press('Reset stage');      // changes nothing (default layout, empty plan)
  const bar = h.nodes().find(n => n.type === 'UndoBar');
  // Either no bar (nothing to undo), or UNDO must leave the stage as the reset left it.
  if (bar) { bar.props.action.props.onPress(); h.render(); }
  assert.equal(objects(h).some(o => o.id === copy.id), false,
    'UNDO on "Stage reset" brought back the copy deleted in an earlier, unrelated edit (it undid the DELETE, not the reset)');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. Loadout default: the spare count assumes rounds left in a dropped magazine are not lost, so the note says
//    "enough" when no reload plan exists (planDefaults.ts profileLoadout).
function threePositions() {
  const stage = createDefaultStage(); stage.stage = { width: 1200, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560)];
  const route = { ...createRoute('r'), positions: [] };
  for (let p = 0; p < 3; p++) {
    const ids = [];
    for (let t = 0; t < 5; t++) { const id = `t${p}${t}`; ids.push(id); stage.objects.push(createObject('cardboardTarget', id, 100 + p * 400 + t * 60, 80)); }
    route.positions.push(position('w' + p, 200 + p * 400, 400, ids));   // 5 paper x 2 rounds = 10 rounds per position
  }
  return { stage, route };
}
// Adjusted: the note no longer claims "enough for the N planned rounds"; it names the default (owner's decision, rule 7).
// The spare count is what PLAN RELOADS needs: rounds left in a dropped magazine are lost, so 3 × 10 rounds from
// 15-round magazines need two spares, not one.
test('the default loadout has the spares PLAN RELOADS needs to carry the stage', () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;   // 15-round mags loaded with 15
  const d = D.withPlanDefaults(stage, plan(route), profile);
  assert.equal(d.loadoutNote, 'Default loadout: 15-round magazines, 15 to start, chamber empty, 2 spares. Add your magazines in PLAN ••• → LOADOUT.');
  const effective = { ...d.plan, route };
  const planned = planReloads(stage, effective, route, profile, evaluateRoute(stage, effective, route, profile));
  assert.equal(planned.complete, true, `the note promised enough spares, but planning reloads fails: "${planned.note}"`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. The Loadout sheet (PlanningPanel) counts the rule-default rounds but not the profile loadout ANALYZE uses, so with
//    no magazines of your own it reports a shortfall that ANALYZE does not have.
// Adjusted: reads what the Loadout sheet (PlanningPanel, given the profile as the editor gives it) shows, rather than
// recomputing it, since the fix is in the sheet.
test('Loadout sheet and ANALYZE agree on available ammunition when the loadout is the default', () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  const d = D.withPlanDefaults(stage, plan(route), profile);
  assert.ok(d.loadoutNote, 'ANALYZE uses the default loadout');
  const sheet = harness('planning/PlanningPanel.tsx', { plan: plan(route), stage, profile, onChange() {}, section: 'loadout' });
  const texts = sheet.nodes().filter(n => n.type === 'FieldText' || n.type === 'Text').map(n => [].concat(n.props.children).join(''));
  const available = sheet.nodes().find(n => n.type === 'Stat' && /available/i.test(n.props.label));
  assert.equal(available.props.value, ammunitionSummary(d.plan, stage).totalAvailable, 'the sheet counts the magazines ANALYZE plans with');
  assert.equal(available.props.value, 45);
  assert.ok(!texts.some(t => /exceed available ammunition/.test(t)), texts.join(' | '));
  // Marked as the default until you add your own.
  assert.ok(texts.includes('DEFAULT LOADOUT') && texts.includes(d.loadoutNote));
  assert.ok(texts.includes('Magazine 1 · starting in firearm · 15 of 15 rounds · default') && texts.includes('Magazine 3 · carried spare · 15 of 15 rounds · default'));
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. Same position, two names: the P-number shown on the canvas, the target sheet, the checklist and ANALYZE's answer
//    is the route index (positionName), but stored labels are also "P<n>" (ADD POSITION, assignFromPath, the migration)
//    and evaluateRoute's warnings, ANALYZE's route list and ORDER still print the stored label.
test('a position has one name: ANALYZE answer and ANALYZE warnings name the same position the same way', () => {
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560)];
  for (let t = 0; t < 8; t++) stage.objects.push(createObject('cardboardTarget', 't' + t, 40 + t * 60, 80));
  // Two positions made with ADD POSITION (labels P1, P2), then P2 moved EARLIER in ORDER.
  let route = { ...createRoute('r'), positions: [{ ...position('a', 100, 400, ['t0']), label: 'P1' }, { ...position('b', 300, 400, ['t1', 't2', 't3', 't4', 't5', 't6', 't7']), label: 'P2' }] };
  route = reorderPosition(route, 'b', -1);
  const profile = createLocalProfile().performance;
  const own = { ...plan(route), loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }] } };
  const d = D.withPlanDefaults(stage, own, profile), effective = { ...d.plan, route };
  const evaluation = evaluateRoute(stage, effective, route, profile);
  const missing = S.whatsMissing({ stage, plan: effective, route, evaluation, review: S.reviewTargets(stage, route) });
  const answer = missing.find(l => /needs 14 rounds/.test(l)), warning = evaluation.warnings.find(w => /requires 14 rounds/.test(w));
  assert.ok(answer && warning, 'both name the short position');
  const nameIn = text => text.match(/\bP\d\b/)[0];
  assert.equal(nameIn(warning), nameIn(answer), `answer says "${answer}" but the warning says "${warning}" about the same position (canvas shows ${positionName(0)})`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. The older optimizer (PLAN ••• alternative) still requires your own round count for every target, though PLAN now
//    shows the rule default (2 / 1) as the planned rounds everywhere.
test('the older optimizer accepts the rule-default rounds PLAN shows', () => {
  const { generateCandidates } = require('../src/planning/candidateGeneration.ts');
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  const own = { ...plan(route), loadout: { chamberLoaded: true, startingMagazineId: 'm1', magazines: [1, 2, 3].map(i => ({ id: 'm' + i, capacity: 20, startingRounds: 20 })) } };
  // What the target rounds sheet shows for every target: "2 rounds · rule default".
  assert.ok(stage.objects.filter(o => o.type === 'cardboardTarget').every(t => D.plannedRounds(own, t).rounds === 2));
  const result = generateCandidates({ stage, plan: own, profile }, {});
  const invalid = (result.warnings ?? []).find(w => /positive whole planned round count/.test(w.message ?? w));
  assert.equal(invalid, undefined, 'older optimizer: "Every scoring target requires a positive whole planned round count."');
});

// ---------------------------------------------------------------------------------------------------------------------
// 6. Migration of saved ENGAGE arrows: positions created on a stretch get a stored label "P<n>" that collides with the
//    route-order names; e.g. an arrow on START → P1 creates a position labelled "P3" that every view calls P1.
// Adjusted: the owner decided stored labels stay as data (not rewritten) and are never shown as the P-name; so this
// checks what is shown (ORDER, warnings) instead of the stored label.
test('a migrated mid-stretch position is shown with its route-order name, never its stored P-label', () => {
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560), createObject('cardboardTarget', 't1', 150, 80)];
  const route = { ...createRoute('r'), positions: [{ ...position('a', 100, 400), label: 'P1' }, { ...position('b', 300, 400), label: 'P2' }],
    manualEngagements: [{ id: 'e', targetId: 't1', anchor: { kind: 'section', sectionId: routeSectionId('start', 'a'), fraction: 0.5 }, direction: 0 }] };
  const migrated = A.migrateManualEngagements(stage, route);
  assert.deepEqual(migrated.positions.map(p => p.id), ['position-e', 'a', 'b']);
  assert.deepEqual(migrated.positions.map((p, i) => positionNameWithNote(i, p.label)), ['P1', 'P2', 'P3'], 'stored ' + JSON.stringify(migrated.positions.map(p => p.label)));
  const warnings = evaluateRoute(stage, plan(migrated), migrated, null).warnings.filter(w => /^P\d/.test(w));
  assert.ok(warnings.length && warnings.every(w => w.startsWith('P1: ')), warnings.join(' | '));
  // The editor's ORDER sheet (DRAW BY HAND → ORDER) shows the same names.
  const h = editor(route, stage);
  h.press('PLAN'); h.press('ROUTE'); h.press('DRAW BY HAND'); h.press('ORDER');
  assert.deepEqual(h.nodes().filter(n => n.type === 'Action' && /^P\d/.test(n.props.title)).map(n => n.props.title), ['P1', 'P2', 'P3']);
});

// ---------------------------------------------------------------------------------------------------------------------
// 7. With the profile loadout (no magazines of your own), the checklist and ANALYZE say "no reload planned for P2", but
//    the position's RELOAD sheet (RoutePanel, given the raw plan) offers no magazine to reload with, and its hint
//    points to "Route tools → Loadout", a menu that no longer exists (PLAN's ••• is "Plan settings").
// Adjusted: the RELOAD sheet reads the default loadout from the profile the editor passes it (as ANALYZE does), so the
// harness passes the profile too.
test('a reload the checklist asks for can be planned from the position\'s RELOAD sheet with the profile loadout', () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  const raw = plan(route);
  const checklist = S.planChecklist(stage, raw, profile);
  assert.match(checklist.lines[2].status, /no reload planned for P2/);
  const sheet = harness('planning/RoutePanel.tsx', { section: 'reload', stage, plan: raw, route, selectedId: 'w1', onChange: () => {}, profile });
  const reloadChoices = sheet.nodes().filter(n => typeof n.props?.title === 'string' && n.props.title.startsWith('RELOAD:'));
  const hint = sheet.nodes().filter(n => n.type === 'Copy').map(n => [].concat(n.props.children).join('')).find(t => /No magazines/.test(t));
  assert.ok(reloadChoices.length > 0, `RELOAD sheet offers no magazine; it says "${hint}"`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 4b. Consequence of 4: Ask (route AI) resolves "P2" by the stored label first, so after a reorder (or a position added
//     on the path / by the migration) "delete P2" picks a different position than the one the canvas labels P2.
test('Ask resolves "P2" to the position the canvas shows as P2', () => {
  const { waypointCandidates } = require('../src/planning/routeAI/resolve.ts');
  let route = { ...createRoute('r'), positions: [{ ...position('a', 100, 400), label: 'P1' }, { ...position('b', 300, 400), label: 'P2' }] };
  route = reorderPosition(route, 'b', -1);              // ORDER: P2 EARLIER. The canvas now shows b as P1 and a as P2.
  const shownAsP2 = route.positions[1].id;
  assert.deepEqual(waypointCandidates({ route, selectedWaypointId: undefined, stage: createDefaultStage() }, 'P2'), [shownAsP2]);
});

// ---------------------------------------------------------------------------------------------------------------------
// 9. Drill sheet: closing asks only for times, hits and a video (DrillSheet.tsx `unsaved`); typed procedurals and notes
//    of a run being logged are discarded without asking.
test('closing the drill sheet with typed procedurals or notes asks first', () => {
  let closed = 0;
  const sheet = harness('training/DrillSheet.tsx', { visible: true, drillId: 'bill', records: [], context: 'LIVE_FIRE', onContextChange() {}, planPractice: 'LIVE_FIRE',
    powerFactor: 'minor', pars: {}, onClose: () => { closed++; }, onSave() {}, onRemove() {}, onUpdate() {}, hand: 'right' },
    { './videoAssets': { discardVideoAsset() {}, playbackUri: a => 'file:///' + a.uri } });
  for (const [label, text] of [['PROCEDURALS', '1'], ['NOTES', 'Gun snagged on the draw']]) {
    sheet.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === label).props.onChangeText(text); sheet.render();
  }
  sheet.child('EditorSheet').close(); sheet.render();
  assert.equal(closed, 0, 'the sheet closed and dropped the typed procedural and notes without asking');
});

// ---------------------------------------------------------------------------------------------------------------------
// 2b. "Loadout from your profile: 15-round magazines loaded with 15, chamber empty" cites numbers the user can neither
//     see nor set: this change removed the magazine rows from Profile (account.tsx), and nothing in the app writes
//     performance.magazineCapacity / startingRounds / chamberedRound (they are always createLocalProfile's 15 / 15 / no).
// Adjusted: the owner decided not to add a Profile setting. The note no longer says the numbers come "from your
// profile": it calls them the default loadout and says where to add your own (rule 7). The numbers are still read from
// the profile's fields, so a later setting changes them.
test('the loadout note says the magazine numbers are a default, not something set in Profile', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const { stage, route } = threePositions();
  const note = D.withPlanDefaults(stage, plan(route), createLocalProfile().performance).loadoutNote;
  assert.match(note, /^Default loadout: 15-round magazines, 15 to start, chamber empty, \d+ spares?\. Add your magazines in PLAN ••• → LOADOUT\.$/);
  assert.doesNotMatch(note, /profile/i);
  const other = D.withPlanDefaults(stage, plan(route), { ...createLocalProfile().performance, magazineCapacity: 10, startingRounds: 8, chamberedRound: true }).loadoutNote;
  assert.match(other, /^Default loadout: 10-round magazines, 8 to start, chamber loaded, /, 'read from the profile fields');
  for (const f of ['planning/planDefaults.ts', 'planning/PlanningPanel.tsx', 'planning/RouteAnalysis.tsx', 'planning/RoutePanel.tsx'])
    assert.doesNotMatch(read(f), /from your profile|stored in your profile/, f);
});

// ---------------------------------------------------------------------------------------------------------------------
// 1b. RESET ROUTE on a route with nothing to reset (shooting areas only) still changes the document: the route gets a
//     new id (resetRouteKeepingAreas(route, 'route-' + uuid)), so the stage turns unsaved and "Route reset · UNDO" shows.
test('RESET ROUTE on a route that holds only shooting areas leaves the stage saved', () => {
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const stage = createDefaultStage('USPSA');
  const rules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'a', vertices: [{ x: 0, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 0, y: 400 }] }] };
  const h = editor({ ...createRoute('r'), engagementRules: rules }, stage);
  h.press('PLAN');
  assert.ok(h.nodes().some(n => n.props?.title === 'SAVED ✓'));
  h.press('Plan settings'); h.press('Reset route');
  assert.ok(h.nodes().some(n => n.props?.title === 'SAVED ✓'), 'nothing was reset, but the stage is now unsaved (new route id)');
});

// ---------------------------------------------------------------------------------------------------------------------
// 8. Stale copy the words test does not catch: menus that were renamed in this change.
test('user-facing copy names menus that exist (no "Route tools", no "Stage Settings")', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  const stale = [['planning/RoutePanel.tsx', /Route tools/], ['diagramImport/model.ts', /in Stage Settings/]]
    .filter(([file, pattern]) => pattern.test(read(file))).map(([file, pattern]) => `${file}: ${pattern}`);
  assert.deepEqual(stale, []);
});

// =====================================================================================================================
// Tests for the fixes (beyond the reviewer's repros above).
// =====================================================================================================================
const text = n => [].concat(n.props.children).join('');
const undoBar = h => h.nodes().find(n => n.type === 'UndoBar');

// 1. Undo bar ---------------------------------------------------------------------------------------------------------
test('undo bar: a real delete offers UNDO for it; a touch that moves nothing keeps the bar; a real move takes it down', () => {
  const h = editor(), paper = objects(h).find(o => o.type === 'cardboardTarget'), count = objects(h).length;
  h.child('StageViewport').onSelect(paper.id); h.render();
  h.press('DELETE');
  assert.equal(undoBar(h).props.text, 'Deleted T1');
  // Touch and release without moving anything (begin/end of a drag): the document is unchanged, the bar stays.
  h.child('StageViewport').onDragging(true); h.render(); h.child('StageViewport').onDragging(false); h.render();
  assert.equal(undoBar(h)?.props.text, 'Deleted T1', 'a drag start alone does not hide the bar');
  undoBar(h).props.action.props.onPress(); h.render();
  assert.equal(objects(h).length, count, 'UNDO brings the deleted target back');
  // Delete again, then really move something: the bar goes (its UNDO would no longer be about the delete).
  h.child('StageViewport').onSelect(paper.id); h.render(); h.press('DELETE');
  const wall = objects(h).find(o => o.type === 'wall');
  h.child('StageViewport').onDragging(true);
  h.child('StageViewport').setStage(s => ({ ...s, objects: s.objects.map(o => o.id === wall.id ? { ...o, position: { ...o.position, x: o.position.x + 12 } } : o) }));
  h.child('StageViewport').onDragging(false); h.render();
  assert.equal(undoBar(h), undefined);
});

test('undo bar: RESET STAGE that changes nothing takes down an older bar instead of offering its UNDO', () => {
  const h = editor(), paper = objects(h).find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(paper.id); h.render(); h.press('DUPLICATE'); h.press('DELETE');
  assert.equal(undoBar(h).props.text, 'Deleted T2');
  h.press('Build settings'); h.press('Reset stage');
  assert.equal(undoBar(h), undefined, 'no "Deleted T2 · UNDO" left on screen after RESET STAGE');
  assert.ok(h.nodes().some(n => n.props?.title === 'SAVED ✓'), 'nothing changed');
  // A reset that does change the stage offers its own UNDO, which undoes the reset only.
  h.child('StageViewport').onSelect(paper.id); h.render(); h.press('DUPLICATE');
  const before = objects(h).map(o => o.id);
  h.press('Build settings'); h.press('Reset stage');
  assert.equal(undoBar(h).props.text, 'Stage reset');
  undoBar(h).props.action.props.onPress(); h.render();
  assert.deepEqual(objects(h).map(o => o.id), before);
});

// 2. Loadout defaults ---------------------------------------------------------------------------------------------------
test('default spares: the same ammunition rules as PLAN RELOADS (dropped rounds lost, chamber kept, no reload on the move)', () => {
  const free = rounds => ({ rounds, reload: 'free' });
  assert.equal(D.sparesNeeded([free(10), free(10), free(10)], 15, false), 2, '15, then 5 left: a fresh magazine for each later position');
  // Reloading early keeps a round chambered that a later position needs: 10 then 11 from 10-round magazines.
  assert.equal(D.sparesNeeded([free(10), free(11)], 10, false), 2);
  // The evaluator keeps a round chambered from a dropped magazine that still had rounds: 16 works (reload at once), 17 can't.
  assert.equal(D.sparesNeeded([free(16)], 15, false), 1);
  assert.equal(D.sparesNeeded([free(17)], 15, false), null, 'more than one magazine and the chamber hold');
  assert.equal(D.sparesNeeded([free(15), { rounds: 10, reload: 'moving' }], 15, false), null, 'no reload on a leg shot on the move');
  assert.equal(D.sparesNeeded([free(5), { rounds: 5, reload: 'planned' }], 15, false), 1, 'a reload already planned uses a spare');
  assert.equal(D.sparesNeeded([free(8), free(7)], 15, false), 0);
  // A position no number of spares can carry: one spare per position, and PLAN RELOADS names it.
  assert.equal(D.profileLoadout({ magazineCapacity: 15, startingRounds: 15, chamberedRound: false }, 20, false, [free(20)]).loadout.magazines.length, 2);
  assert.equal(D.profileLoadout({ magazineCapacity: 15, startingRounds: 15, chamberedRound: false }, 20, false, [free(10), free(10)]).loadout.magazines.length, 2);
  // Every case planReloads agrees with: with that many spares it carries the route.
  const stage = createDefaultStage(); stage.stage = { width: 1200, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560), ...['a', 'b', 'c', 'd'].map((id, i) => createObject('steelPlate', id, 200 + i * 200, 80))];
  const route = { ...createRoute('r'), positions: [position('w0', 200, 400, ['a', 'b']), position('w1', 600, 400, ['c', 'd'])] };
  const profile = { ...createLocalProfile().performance, magazineCapacity: 10, startingRounds: 10 };
  const own = { ...plan(route), engagements: { a: 5, b: 5, c: 5, d: 6 } };
  const d = D.withPlanDefaults(stage, own, profile), effective = { ...d.plan, route };
  assert.equal(d.plan.loadout.magazines.length, 3, '10 then 11 rounds from 10-round magazines: two spares');
  assert.equal(planReloads(stage, effective, route, profile, evaluateRoute(stage, effective, route, profile)).complete, true);
});

test('PLAN RELOADS in ANALYZE succeeds on the default loadout and saves it with the reloads', () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  let changed = null;
  const h = harness('planning/RouteAnalysis.tsx', { stage, plan: plan(route), route, profile, edit() {}, onPlanChange: p => { changed = p; } });
  h.press('Show ammunition'); h.press('Plan reloads around magazine capacity');
  assert.ok(changed, h.nodes().filter(n => n.type === 'Notice').map(text).join(' | '));
  assert.deepEqual(changed.loadout.magazines.map(m => m.id), ['magazine-profile-1', 'magazine-profile-2', 'magazine-profile-3']);
  assert.equal(changed.route.reloads.length, 2);
  assert.ok(evaluateRoute(stage, changed, changed.route, profile).ammo.every(a => a.sufficient));
});

test('the position RELOAD sheet lists the default magazines, saves the default loadout with a reload, and points at PLAN ••• → LOADOUT', () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  let planOut = null, routeOut = null;
  const sheet = harness('planning/RoutePanel.tsx', { section: 'reload', stage, plan: plan(route), route, selectedId: 'w1', profile, onChange: r => { routeOut = r; }, onPlanChange: p => { planOut = p; } });
  assert.deepEqual(sheet.nodes().filter(n => /^RELOAD: /.test(n.props?.title ?? '')).map(n => n.props.title), ['RELOAD: MAGAZINE 1 (15 ROUNDS)', 'RELOAD: MAGAZINE 2 (15 ROUNDS)', 'RELOAD: MAGAZINE 3 (15 ROUNDS)']);
  assert.ok(sheet.nodes().some(n => n.type === 'Copy' && /^Default loadout: .* Picking a reload here keeps this loadout with the stage\.$/.test(text(n))));
  sheet.press('RELOAD: MAGAZINE 2 (15 ROUNDS)');
  assert.equal(routeOut, null, 'a reload alone would point at a magazine the plan does not have');
  assert.equal(planOut.loadout.magazines.length, 3);
  assert.deepEqual(planOut.route.reloads, [{ positionId: 'w1', magazineId: 'magazine-profile-2' }]);
  // Your own magazines: the reload is a route change, nothing else.
  const mine = { ...plan(route), loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }] } };
  planOut = null;
  const own = harness('planning/RoutePanel.tsx', { section: 'reload', stage, plan: mine, route, selectedId: 'w1', profile, onChange: r => { routeOut = r; }, onPlanChange: p => { planOut = p; } });
  own.press('RELOAD: MAGAZINE 2 (10 ROUNDS)');
  assert.equal(planOut, null); assert.deepEqual(routeOut.reloads, [{ positionId: 'w1', magazineId: 'm2' }]);
  // No profile and no magazines: the hint names the menu that exists.
  const none = harness('planning/RoutePanel.tsx', { section: 'reload', stage, plan: plan(route), route, selectedId: 'w1', onChange() {} });
  assert.ok(none.nodes().some(n => n.type === 'Copy' && text(n) === 'No magazines yet. Add your magazines in PLAN ••• → LOADOUT.'));
});

test('the editor gives the RELOAD and LOADOUT sheets the profile, so they show the loadout ANALYZE uses', async () => {
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'S', matchId: 'm', document: stage, plan: plan(route) }, targetFamily: 'USPSA' },
    { repo: { loadProfile: async () => ({ performance: profile, powerFactor: 'minor' }) } });
  await h.settle();
  h.press('PLAN');
  h.child('StageViewport').routePlanning.onSelect('w1'); h.render();
  h.press('Position 2'); h.press('RELOAD');
  const panel = h.child('RoutePanel');
  assert.equal(panel.profile, profile); assert.equal(typeof panel.onPlanChange, 'function');
  panel.onPlanChange({ ...plan(route), loadout: D.withPlanDefaults(stage, plan(route), profile).plan.loadout, route: { ...route, reloads: [{ positionId: 'w1', magazineId: 'magazine-profile-2' }] } }); h.render();
  assert.ok(h.nodes().some(n => n.props?.title === 'SAVE'), 'the reload and its loadout are an edit');
  h.press('Plan settings'); h.press('Loadout');
  assert.equal(h.child('PlanningPanel').profile, profile);
});

// 3. One name per position ---------------------------------------------------------------------------------------------
test('a stored label is a note beside the route-order name; automatic P-labels are never shown', () => {
  const W = require('../src/ui/words.ts');
  assert.deepEqual(['P3', 'p 2', 'Position 4', 'Waypoint 1', '', '  Barricade left '].map(W.positionNote), ['', '', '', '', '', 'Barricade left']);
  assert.equal(W.positionNameWithNote(1, 'Barricade left'), 'P2 · Barricade left');
  assert.equal(W.positionNameWithNote(0, 'P2'), 'P1');
  assert.equal(W.positionTitleWithNote(2, 'Port'), 'Position 3 · Port');
  // ANALYZE's route list, the ORDER sheet and the position sheet.
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560), createObject('cardboardTarget', 't1', 150, 80)];
  const route = { ...createRoute('r'), positions: [{ ...position('a', 100, 400, ['t1']), label: 'P2' }, { ...position('b', 300, 400), label: 'Barricade left' }] };
  const analysis = harness('planning/RouteAnalysis.tsx', { stage, plan: plan(route), route, profile: null, edit() {} });
  analysis.press('Show route');
  const lines = analysis.nodes().filter(n => n.type === 'Copy').map(text);
  assert.ok(lines.includes('Position 1') && lines.includes('Position 2 · Barricade left'), lines.join(' | '));
  assert.ok(!lines.some(l => /Position 1 · P2/.test(l)));
  const h = editor(route, stage);
  h.press('PLAN'); h.press('ROUTE'); h.press('DRAW BY HAND'); h.press('ORDER');
  assert.deepEqual(h.nodes().filter(n => n.type === 'Action' && /^P\d/.test(n.props.title)).map(n => n.props.title), ['P1', 'P2 · BARRICADE LEFT']);
  h.press('Position 1');
  assert.ok(h.nodes().some(n => n.type === 'FieldText' && text(n) === 'Position 1'), 'sheet title: the route-order name only');
  const field = () => h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Position note');
  assert.equal(field().props.value, '', 'the automatic "P2" is not shown as a note');
  // While typing, the field keeps what you type (even "P1", which alone is not shown as a note).
  field().props.onChangeText('P1'); h.render();
  assert.equal(field().props.value, 'P1');
  assert.ok(h.nodes().some(n => n.type === 'FieldText' && text(n) === 'Position 1'));
  field().props.onChangeText('Port'); h.render();
  assert.ok(h.nodes().some(n => n.type === 'FieldText' && text(n) === 'Position 1 · Port'));
  assert.equal(h.child('StageViewport').routePlanning.route.positions[0].label, 'Port', 'kept in the stored label field');
});

test('warnings, PLAN RELOADS, the time list, Ask and training name a position by its route order', () => {
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 20, 560), ...['t1', 't2'].map((id, i) => createObject('cardboardTarget', id, 100 + i * 200, 80))];
  // Stored labels from before a reorder: the first position is labelled P2.
  const route = { ...createRoute('r'), positions: [{ ...position('b', 100, 400, ['t1']), label: 'P2' }, { ...position('a', 700, 400, ['t2']), label: 'P1' }] };
  const own = { ...plan(route), engagements: { t1: 20, t2: 2 }, loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }] } };
  const profile = createLocalProfile().performance, evaluation = evaluateRoute(stage, own, route, profile);
  assert.ok(evaluation.warnings.includes('P2: position is outside the stage.'), evaluation.warnings.join(' | '));
  assert.ok(evaluation.warnings.some(w => w.startsWith('P1: requires 20 rounds')));
  assert.match(planReloads(stage, own, route, profile, evaluation).note, /^P1 needs 20 rounds; your fullest magazine holds 10/);
  assert.ok(evaluateRoute(createDefaultStage(), createPlan(), createRoute('x'), null).warnings.includes('Timing unavailable: load a valid shooter performance profile.'));
  const noStart = { ...stage, objects: stage.objects.filter(o => o.type !== 'start') };
  assert.ok(evaluateRoute(noStart, own, route, profile).warnings.includes('Start position is missing.'));
  const { estimateStageTime } = require('../src/planning/stageTime.ts');
  const inside = { ...route, positions: [route.positions[0], { ...route.positions[1], position: point(300, 400) }] };
  const small = { ...own, engagements: { t1: 2, t2: 2 } };
  assert.deepEqual(estimateStageTime(stage, small, inside, profile, evaluateRoute(stage, small, inside, profile)).positions.map(p => p.label), ['P1', 'P2']);
  // Ask: P-names and "position n" by route order; your note as a fallback; automatic labels never.
  const { waypointCandidates, resolveDecision } = require('../src/planning/routeAI/resolve.ts');
  const { compactContext } = require('../src/planning/routeAI/types.ts');
  const noted = { ...route, positions: [route.positions[0], { ...route.positions[1], label: 'Barricade left' }] };
  const c = { route: noted, stage: createDefaultStage() };
  assert.deepEqual(['P1', 'p2', 'position 2', 'barricade left', 'P3'].map(r => waypointCandidates(c, r)), [['b'], ['a'], ['a'], ['a'], []]);
  assert.deepEqual(waypointCandidates({ route, stage: createDefaultStage() }, 'P2'), ['a'], 'not the position whose stored label is P2');
  assert.deepEqual(compactContext('s', { ...c, revision: 'r' }).waypoints.map(w => w.label), ['P1', 'P2 · Barricade left']);
  const ask = resolveDecision(c, { intent: 'DELETE_WAYPOINT', waypointReference: 'the post' }, 'n');
  assert.deepEqual(ask.command.options.map(o => o.label), ['Position 1', 'Position 2 · Barricade left']);
  // Training's execution comparison names planned positions the same way.
  const { plannedElements } = require('../src/training/executionComparison.ts');
  assert.deepEqual(plannedElements({ snapshot: { plan: { route: noted }, evaluation: { segments: [] } } }, 'STRING').map(e => e.label), ['P1', 'P2 · Barricade left']);
});

test('engagement analysis warnings name the position by its route order', () => {
  const stage = createDefaultStage(); stage.stage = { width: 600, depth: 600 };
  stage.objects = [createObject('start', 'start', 300, 560), createObject('cardboardTarget', 't1', 300, 80)];
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const area = { id: 'a', vertices: [{ x: 200, y: 450 }, { x: 400, y: 450 }, { x: 400, y: 590 }, { x: 200, y: 590 }] };
  const route = { ...createRoute('r'), engagementRules: { ...defaultEngagementRules(stage), firingAreas: [area], allowOutsideTravel: false },
    positions: [{ ...position('far', 300, 200, ['t1']), label: 'P7' }] };
  const { analyzeEngagements } = require('../src/planning/engagements.ts');
  const warnings = analyzeEngagements(stage, route).warnings.filter(w => /^P\d/.test(w));
  assert.ok(warnings.length && warnings.every(w => w.startsWith('P1: ')), warnings.join(' | '));
});

// 4. Older optimizer ---------------------------------------------------------------------------------------------------
test('the older optimizer and its cards read rounds as PLAN shows them; a 0 you set yourself is still refused', () => {
  const { generateCandidates } = require('../src/planning/candidateGeneration.ts');
  const { generatePlannerCards } = require('../src/planning/plannerUI.ts');
  const { createRoutePlannerConfig } = require('../src/planning/planner.ts');
  const { stage, route } = threePositions(), profile = createLocalProfile().performance;
  const own = { ...plan(route), loadout: { chamberLoaded: true, startingMagazineId: 'm1', magazines: [1, 2, 3].map(i => ({ id: 'm' + i, capacity: 20, startingRounds: 20 })) } };
  const cards = generatePlannerCards({ stage, plan: own, profile }, createRoutePlannerConfig());
  assert.ok(cards.cards.length, cards.message);
  assert.ok(!cards.cards[0].reasons.some(r => /planned rounds/.test(r)));
  const zero = generateCandidates({ stage, plan: { ...own, engagements: { t00: 0 } }, profile }, {});
  assert.ok(zero.warnings.some(w => /positive whole planned round count/.test(w.message)));
});

// 7. Words and units ---------------------------------------------------------------------------------------------------
test('words and units: feet and inches through measurements.ts; one separator; sentence case; stale menu names retired', () => {
  const M = require('../src/stage/measurements.ts');
  assert.deepEqual([63, 71.6, 36, 84, 12].map(M.formatFeetAndInches), ['5 ft 3 in', '6 ft 0 in', '3 ft 0 in', '7 ft 0 in', '1 ft 0 in']);
  const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  assert.doesNotMatch(read('profile/devicePrefs.ts'), /\/ 12|% 12|ft \$\{/, 'no unit conversion outside measurements.ts');
  assert.match(read('app/account.tsx'), /formatFeetAndInches\(eye\)/);
  const P = require('../src/training/presentation.ts');
  assert.equal(P.practiceLine('DRY_FIRE', 'LIVE_FIRE', true), 'Practice only · your plans use live-fire runs');
  const { RETIRED_WORDS } = require('../src/ui/words.ts');
  for (const old of ['No magazines. Add a magazine in Route tools → Loadout.', 'resize the stage explicitly in Stage Settings.', 'Start Position is missing.', 'Practice only — your plans use live-fire runs'])
    assert.ok(RETIRED_WORDS.some(w => w.pattern.test(old)), old);
  assert.match(read('diagramImport/model.ts'), /resize the stage with STAGE SIZE in BUILD\\'s •••\./);
});

// 8. VoiceOver in PLAN -------------------------------------------------------------------------------------------------
test('VoiceOver: in PLAN a target opens its target sheet, as a tap does; in BUILD it selects the object', () => {
  const rn = { View: 'View', Text: 'Text', Platform: { OS: 'ios' }, StyleSheet: { create: s => s, absoluteFill: {} }, PanResponder: { create: handlers => ({ panHandlers: handlers }) } };
  const stage = createDefaultStage(); stage.stage = { width: 400, depth: 400 };
  stage.objects = [createObject('start', 'start', 20, 300), createObject('cardboardTarget', 'target', 200, 70), createObject('wall', 'wall', 200, 200)];
  const tapped = [], selected = [];
  const props = { stage, viewport: { zoom: 1, pan: { x: 0, y: 0 } }, routeEditing: true, gridVisible: false, selectedId: null, snapping: { enabled: false },
    onSelect: id => selected.push(id), setStage() {}, onDragging() {}, onViewportChange() {}, onTargetTap: id => tapped.push(id) };
  const h = harness('editor/StageViewport.tsx', props, { 'react-native': rn });
  h.find(n => n.props.testID === 'stage-canvas').props.onLayout({ nativeEvent: { layout: { width: 400, height: 400 } } }); h.render();
  const object = id => h.find(n => n.type === 'DraggableObject' && n.props.item.id === id).props;
  object('target').onAccessibilityTap();
  assert.deepEqual(tapped, ['target']); assert.deepEqual(selected, [], 'not a BUILD selection');
  assert.equal(object('wall').onAccessibilityTap, null, 'a wall does nothing in PLAN');
  props.onTargetTap = undefined; h.render();
  assert.equal(object('target').onAccessibilityTap, null, 'while a PLAN tool owns taps, no sheet');
  props.routeEditing = false; h.render();
  assert.equal(object('target').onAccessibilityTap, undefined, 'BUILD: the default, select');
  // DraggableObject itself: the accessibility tap runs the given action, does nothing for null, selects by default.
  const run = (extra) => { const picked = [], calls = [];
    const D2 = harness('editor/DraggableObject.tsx', { stage, item: stage.objects[1], transform: { scale: 1, offsetX: 0, offsetY: 0 }, selected: false, snapping: { enabled: false },
      onFeedback() {}, onSelect: id => picked.push(id), setStage() {}, onDragging() {}, ...extra(calls) }, { 'react-native': rn });
    D2.find(n => n.props?.testID === 'stage-object-target').props.onAccessibilityTap(); return { picked, calls }; };
  assert.deepEqual(run(calls => ({ onAccessibilityTap: () => calls.push('sheet') })), { picked: [], calls: ['sheet'] });
  assert.deepEqual(run(() => ({ onAccessibilityTap: null })), { picked: [], calls: [] });
  assert.deepEqual(run(() => ({})), { picked: ['target'], calls: [] });
});

// 9. History ------------------------------------------------------------------------------------------------------------
test('History: an older session can be deleted (with a confirm), which withdraws it through deleteTraining; nothing else is editable', async () => {
  const libraryRun = { id: 'lr1', drillId: 'bill', recordedAt: '2026-10-05T12:00:00Z', choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55, family: 'USPSA', zones: { A: 6 }, notes: '' };
  const old = { id: 'r', userId: 'local', drillName: 'Old session', context: 'LIVE_FIRE', startingType: 'competitionHolster', occurredAt: '2026-10-05T12:00:00Z', segments: [], notes: '', totalTime: null,
    videos: [{ session: { id: 'v', analysisStatus: 'REVIEWED', asset: { uri: 'v.mov' } } }], libraryRuns: [libraryRun] };
  const deleted = [], discarded = [], writes = [];
  let rows = [old];
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': { discardVideoAsset: a => discarded.push(a) }, ...Object.fromEntries(['@/ui/prefsStore', '../ui/prefsStore', './prefsStore'].map(id => [id, { readPref: () => null, writePref() {} }])),
    repo: { trainingReadWarnings: [], listTraining: async () => rows, saveTraining: async r => { writes.push(r); }, deleteTraining: async id => { deleted.push(id); rows = rows.filter(r => r.id !== id); },
      loadProfile: async () => ({ performance: {}, powerFactor: 'minor', drillPars: {} }) } });
  await h.settle();
  h.press('Show history'); h.press('Show older sessions');
  h.find(n => n.type === 'LibraryCard' && n.props.name === 'Old session').props.open(); h.render();
  const titles = () => h.nodes().map(n => n.props?.title).filter(t => typeof t === 'string');
  assert.ok(titles().includes('DELETE SESSION'));
  assert.ok(!titles().some(t => /^(REMOVE|ADD VIDEO|LOG|DELETE THIS DAY)/.test(t)), 'only deleting is offered: ' + titles().join(' | '));
  h.press('DELETE SESSION');
  assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.children === 'Delete this session, its 1 imported video copies and the measurements they added to your numbers? This cannot be undone. Videos in Photos or Files are not touched.'));
  assert.deepEqual(deleted, [], 'asks first');
  h.press('DELETE'); await h.settle();
  assert.deepEqual(deleted, ['r']); assert.deepEqual(discarded, [{ uri: 'v.mov' }]); assert.deepEqual(writes, [], 'nothing was edited');
});

test('closing the drill sheet asks first and says the typed procedurals and notes would go', () => {
  let closed = 0;
  const sheet = harness('training/DrillSheet.tsx', { visible: true, drillId: 'bill', records: [], context: 'LIVE_FIRE', onContextChange() {}, planPractice: 'LIVE_FIRE',
    powerFactor: 'minor', pars: {}, onClose: () => { closed++; }, onSave() {}, onRemove() {}, onUpdate() {}, hand: 'right' },
    { './videoAssets': { discardVideoAsset() {}, playbackUri: a => 'file:///' + a.uri } });
  sheet.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'NOTES').props.onChangeText('Snagged'); sheet.render();
  sheet.child('EditorSheet').close(); sheet.render();
  assert.equal(closed, 0);
  const prompt = () => sheet.nodes().flatMap(n => n.type === 'EditorSheet' ? [n.props.footer] : []).filter(Boolean)[0];
  const said = []; const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n.type === 'Copy') said.push(text(n)); walk(n.props?.children); };
  walk(prompt());
  assert.ok(said.includes('Discard what you entered for it (times, hits, procedurals, notes)?'), said.join(' | '));
});
