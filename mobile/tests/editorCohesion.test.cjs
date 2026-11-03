// UI cohesion phase 1 (words and placement) in the stage editor: one undo in the header, Save state, the pencil, one
// entry per view, T1 names and 1, 2, 3 order, the WALK legend, the press-and-hold hint, the family filter, STAGE CHECK.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const W = require('../src/ui/words.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan, targetLabel } = require('../src/planning/model.ts');
const { createRoute } = require('../src/planning/route.ts');
const { engagementLabel } = require('../src/planning/engagements.ts');
const { shortTargetLabel } = require('../src/stage3d/scene.ts');
const { checkStage } = require('../src/rules/stageCheck.ts');

const plan = route => ({ ...createPlan(), ...(route ? { route } : {}) });
const editor = (route, overrides = {}, document = createDefaultStage()) =>
  harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage 3', matchId: 'm', document, plan: plan(route) }, targetFamily: 'USPSA' }, overrides);
const titles = h => h.nodes().map(n => n.props?.title).filter(t => typeof t === 'string');
const tree = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(tree) : [n, ...tree(n.props?.children)];
/** Titles inside the open sheet only (the canvas stays in the tree under a modal). */
const sheetTitles = h => tree(h.find(n => n.type === 'EditorSheet' && n.props.visible).props.children).map(n => n.props?.title).filter(t => typeof t === 'string');
const button = (h, title) => h.find(n => n.props?.title === title);
/** The kit's ToolButton and Action: what the user reads (title) and what VoiceOver reads (accessibilityLabel). */
const byLabel = (h, label) => h.find(n => n.props?.accessibilityLabel === label);
const rendered = el => ({ label: el.props.accessibilityLabel ?? el.props.title, text: el.props.title });
const saveButton = h => h.find(n => ['Save', 'Saved', 'Saving…'].includes(n.props?.accessibilityLabel)).props;
const closeSheet = h => { h.find(n => n.type === 'EditorSheet' && n.props.visible).props.close(); h.render(); };
const objects = h => h.child('StageViewport').stage.objects;
const selectFirstTarget = h => { const t = objects(h).find(o => o.type === 'cardboardTarget'); h.child('StageViewport').onSelect(t.id); h.render(); return t; };

test('words: one name per target in every view (T1… across paper and steel, NS for no-shoots), 1-2-3 order, positions', () => {
  const stage = { ...createDefaultStage(), objects: [createObject('start', 'start', 10, 10), createObject('cardboardTarget', 'A', 50, 50), createObject('steelPopper', 'B', 80, 50),
    createObject('noShootTarget', 'C', 90, 50), createObject('steelPlate', 'D', 100, 50), createObject('cardboardTarget', 'E', 120, 50)] };
  const names = Object.fromEntries(stage.objects.filter(o => o.type !== 'start').map(o => [o.id, W.targetName(stage, o)]));
  assert.deepEqual(names, { A: 'T1', B: 'T2', C: 'NS1', D: 'T3', E: 'T4' });
  for (const id of ['A', 'B', 'D', 'E']) {
    const o = stage.objects.find(x => x.id === id);
    assert.equal(targetLabel(stage, id), names[id], 'planning and ANALYZE use the same name');
    assert.equal(shortTargetLabel(stage, o), names[id], '3D and WALK use the same name');
  }
  assert.equal(W.targetNameWithType(stage, 'B'), 'T2 · Popper'); assert.equal(W.targetNameWithType(stage, 'D'), 'T3 · Plate'); assert.equal(W.targetNameWithType(stage, 'A'), 'T1 · Paper');
  assert.deepEqual([0, 1, 2].map(engagementLabel), ['1', '2', '3'], 'engagement order is 1, 2, 3, not A, B, C');
  assert.equal(W.positionTitle(2), 'Position 3'); assert.equal(W.positionName(0), 'P1'); assert.equal(W.shootingAreaTitle(0), 'Shooting area 1');
  assert.equal(W.joinLabel('Grid', '', null, false, 'ON'), 'Grid · ON'); assert.equal(W.SEP, ' · ');
  assert.equal(W.words.editor, 'Stage editor'); assert.equal(W.words.views.plan, 'Plan view'); assert.equal(W.words.practiceType, 'Practice type');
});

test('header: ↶ and ↷ beside the name undo and redo the document history; the ••• menus no longer carry them', () => {
  const h = editor();
  const undo = rendered(byLabel(h, 'Undo')), redo = rendered(byLabel(h, 'Redo'));
  assert.deepEqual([undo.text, undo.label, redo.text, redo.label], ['↶', 'Undo', '↷', 'Redo']);
  assert.equal(byLabel(h, 'Undo').type, 'ToolButton', 'the kit ToolButton, not a private button');
  assert.equal(byLabel(h, 'Undo').props.disabled, true, 'nothing to undo yet'); assert.equal(byLabel(h, 'Redo').props.disabled, true);
  selectFirstTarget(h); const count = objects(h).length;
  h.press('DUPLICATE'); assert.equal(objects(h).length, count + 1);
  assert.equal(byLabel(h, 'Undo').props.disabled, false);
  h.press('Undo'); assert.equal(objects(h).length, count); assert.equal(byLabel(h, 'Redo').props.disabled, false);
  h.press('Redo'); assert.equal(objects(h).length, count + 1);
  h.press('Build settings');
  for (const gone of ['UNDO EDIT', 'REDO EDIT', '3D VIEW', 'EYE-LEVEL VIEW', 'ZOOM IN', 'ZOOM OUT']) assert.ok(!sheetTitles(h).includes(gone), gone + ' left Build settings');
  closeSheet(h);
  h.press('PLAN'); h.press('Plan settings');
  assert.ok(!sheetTitles(h).some(t => /UNDO|REDO|ZOOM/i.test(t)), 'Plan settings has no undo or zoom either');
  closeSheet(h);
  // ENGAGE and AREAS used the same history: only the header's undo remains.
  const undos = () => h.nodes().filter(n => /^undo$/i.test(n.props?.accessibilityLabel ?? n.props?.title ?? '')).length;
  h.press('ROUTE'); h.press('ENGAGE'); assert.equal(undos(), 1);
  h.child('ModeChip').action.props.onPress(); h.render();
  h.press('AREAS'); assert.equal(undos(), 1);
  h.child('ModeChip').action.props.onPress(); h.render();
  assert.ok(!h.nodes().some(n => n.props?.title === 'REVIEW'), 'REVIEW is gone (its marks are in ANALYZE)');
});

test('Save is orange only with unsaved changes; saved reads SAVED ✓, quiet and disabled; the SAVED/UNSAVED word is gone', async () => {
  const h = editor();
  let save = saveButton(h);
  assert.deepEqual([save.accessibilityLabel, save.title, save.primary, save.disabled], ['Saved', 'SAVED ✓', false, true]);
  assert.ok(!h.nodes().some(n => n.props?.children === 'SAVED' || n.props?.children === 'UNSAVED'));
  selectFirstTarget(h); h.press('DUPLICATE');
  save = saveButton(h);
  assert.deepEqual([save.accessibilityLabel, save.title, save.primary, save.disabled], ['Save', 'SAVE', true, false]);
  h.press('Save'); await h.settle();
  assert.equal(h.saved.length, 1); assert.equal(saveButton(h).accessibilityLabel, 'Saved'); assert.equal(saveButton(h).primary, false);
  h.press('Undo'); assert.equal(saveButton(h).accessibilityLabel, 'Save', 'undoing a saved change has something to save again');
});

test('the stage name shows a pencil, so renaming is visible', () => {
  const h = editor();
  const name = h.find(n => n.props?.accessibilityLabel === 'Edit stage name');
  const texts = [].concat(name.props.children).filter(Boolean).map(c => c.props?.children);
  assert.deepEqual(texts, ['Stage 3', '✎']);
  name.props.onPress(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'EditorSheet' && n.props.title === 'Stage name' && n.props.visible));
  assert.ok(h.nodes().some(n => typeof n.props?.children === 'string' && /kept when you save/.test(n.props.children)), 'no "Stage Designer" in the name sheet');
});

test('one entry per view: 2D · 3D on the canvas, WALK for eye level; no view buttons in •••', () => {
  const h = editor();
  const views = h.find(n => n.props?.accessibilityLabel === 'View');
  const options = [].concat(views.props.children).flat().filter(Boolean).map(b => [b.props.title, b.props.accessibilityLabel]);
  assert.deepEqual(options, [['2D', 'Plan view'], ['3D', '3D view']], 'EYE is not a view here');
  h.press('Build settings');
  for (const gone of ['TOP DOWN', '3D', 'EYE LEVEL', '2.5D', 'VIEW SETTINGS']) assert.ok(!sheetTitles(h).includes(gone), gone + ' is not in •••');
  h.press('Grid and snap'); assert.ok(sheetTitles(h).includes('GRID · ON'), 'the grid switch lives with snap');
  closeSheet(h);
  h.press('WALK'); assert.ok(h.child('EyeLevelView'));
  assert.ok(!h.nodes().some(n => n.props?.accessibilityLabel === 'View'), 'no view switch while walking');
  h.child('EyeLevelView').onExit(); h.render(); assert.ok(titles(h).includes('ADD'), 'back to BUILD');
});

test('the stage check is BUILD\'s badge (safety and rule findings) and points to PLAN → AREAS for shooting areas', () => {
  const findings = list => ({ '@/rules/stageCheck': { checkStage: () => list } });
  const f = severity => ({ severity, code: severity, rule: '', objectIds: [], message: severity });
  let h = editor(undefined, findings([f('safety'), f('rule'), f('rule'), f('info')]));
  let build = button(h, 'BUILD').props;
  assert.deepEqual([build.badge, build.badgeTone, build.accessibilityLabel], ['3', 'danger', 'Build the stage. Stage check: 1 safety, 2 rule']);
  h = editor(undefined, findings([f('rule'), f('rule'), f('rule')]));
  build = button(h, 'BUILD').props;
  assert.deepEqual([build.badge, build.badgeTone], ['3', 'neutral'], 'no danger without a safety finding');
  h = editor(undefined, findings([f('info')]));
  assert.equal(button(h, 'BUILD').props.badge, undefined, 'information alone is not counted');
  const noAreas = checkStage(createDefaultStage(), undefined, 'USPSA').find(x => x.code === 'NO_AREAS');
  assert.match(noAreas.message, /shooting areas in PLAN → AREAS/); assert.doesNotMatch(noAreas.message, /Route settings|firing/);
});

test('targets are named T1… with their type where there is room, and engagement order is 1, 2, 3', () => {
  const h = editor();
  selectFirstTarget(h);
  assert.equal(h.child('SelectionBar').title, 'T1 · PAPER TARGET', 'the selection bar names the target, then what it is');
  const document = createDefaultStage(), targets = document.objects.filter(o => o.type === 'cardboardTarget');
  const route = { ...createRoute('r'), positions: [{ id: 'p', label: 'P1', position: { space: 'stage', x: 100, y: 300, z: 0 }, visibleTargetIds: targets.map(t => t.id), engagedTargetIds: [targets[1].id, targets[0].id] }] };
  const panel = harness('planning/RoutePanel.tsx', { section: 'assign', stage: document, plan: plan(route), route, selectedId: 'p', onChange() {} });
  const copy = panel.nodes().filter(n => n.type === 'Copy').map(n => n.props.children);
  assert.ok(copy.includes('POSITION 1'));
  assert.ok(copy.includes('1. T2 · Paper') && copy.includes('2. T1 · Paper'), copy.join(' | '));
  assert.ok(titles(panel).includes('EARLIER') && titles(panel).includes('LATER'));
  const analysis = harness('planning/RouteAnalysis.tsx', { stage: document, plan: plan(route), route, profile: null, edit() {} });
  analysis.press('Show route');
  const lines = analysis.nodes().filter(n => n.type === 'Copy').map(n => [].concat(n.props.children).join(''));
  // The position is named by its route order; its automatic stored label ("P1") is not shown again beside it.
  assert.ok(lines.includes('Position 1') && !lines.includes('Position 1 · P1') && lines.includes('1. T2 · Paper'), lines.join(' | '));
  assert.ok(!lines.some(l => /Cardboard \d|Waypoint/.test(l)));
});

const eyeOverrides = store => ({
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, PanResponder: { create: handlers => ({ panHandlers: handlers }) } },
  './GLStage': { __esModule: true, default: 'GLStage', glUnavailable: () => false },
  '../ui/prefsStore': { readPref: k => store?.[k] ?? null, writePref: (k, v) => { if (store) store[k] = v; } },
});
test('WALK: ••• (in its tool bar) shows the legend for the status words, VISIBLE and HIDDEN look different, and each row shows the target type', () => {
  const document = createDefaultStage();
  const h = harness('stage3d/EyeLevelView.tsx', { stage: document, plan: plan(), ruleset: 'USPSA', onExit() {} }, eyeOverrides());
  assert.ok(!h.nodes().some(n => n.props?.testID === 'walk-legend'));
  h.press('What the status words mean');
  const legend = h.find(n => n.props?.testID === 'walk-legend');
  const states = h.nodes().filter(n => typeof n.type === 'function' && n.type.name === 'StatusChip').map(n => n.props.state);
  assert.deepEqual(states.slice(0, 6), ['moving', 'here', 'legal', 'visible', 'hidden', 'done'], 'the legend lists every status word');
  assert.ok(legend);
  assert.ok(h.nodes().some(n => typeof n.props?.children === 'string' && /Walls, other targets or no-shoots block it/.test(n.props.children)));
  h.press('Hide what the status words mean'); assert.ok(!h.nodes().some(n => n.props?.testID === 'walk-legend'));
  assert.ok(h.nodes().some(n => n.props?.children === 'PAPER'), 'the target type sits under its name');
  const chip = state => harness('stage3d/EyeLevelView.tsx', { state }, eyeOverrides(), 'StatusChip').render().props.style;
  const visible = chip('visible'), hidden = chip('hidden');
  assert.notEqual(visible.borderStyle, hidden.borderStyle, 'outline differs (solid · dashed)');
  assert.notEqual(visible.borderColor, hidden.borderColor, 'tone differs');
});

test('press-and-hold hint: shown once on the BUILD canvas, gone for good when dismissed or once the gesture is used', () => {
  const h = editor();
  let hint = h.child('HoldHint');
  assert.deepEqual([hint.show, hint.learned], [true, false]);
  selectFirstTarget(h); assert.equal(h.child('HoldHint').show, false, 'not over a selection');
  h.child('StageViewport').onSelect(null); h.render();
  h.press('PLAN'); assert.equal(h.child('HoldHint').show, false, 'BUILD only');
  h.press('BUILD'); h.child('StageViewport').onLongPress({ space: 'stage', x: 100, y: 100, z: 0 }, { x: 50, y: 50 }); h.render();
  assert.equal(h.child('HoldHint').learned, true, 'using the gesture retires the hint');

  const store = {};
  const prefs = { '@/ui/prefsStore': { readPref: k => store[k] ?? null, writePref: (k, v) => { store[k] = v; } } };
  const card = harness('editor/HoldHint.tsx', { show: true, learned: false }, prefs);
  assert.ok(card.find(n => n.props?.testID === 'hold-hint'));
  assert.ok(card.nodes().some(n => typeof n.props?.children === 'string' && /press and hold the stage/.test(n.props.children)));
  card.press('Dismiss the tip'); assert.equal(store['psp.hint.holdToAdd'], '1'); assert.equal(card.render(), null);
  assert.equal(harness('editor/HoldHint.tsx', { show: true, learned: false }, prefs).render(), null, 'remembered on this device');
  delete store['psp.hint.holdToAdd'];
  const learned = harness('editor/HoldHint.tsx', { show: true, learned: true }, prefs);
  assert.equal(learned.render(), null); assert.equal(store['psp.hint.holdToAdd'], '1');
});

test('radial ADD shows only the match family until OTHER FAMILIES is tapped (IDPA stays available there)', () => {
  const props = { at: { x: 180, y: 300 }, bounds: { width: 390, height: 600 }, targetFamily: 'USPSA', onChoose() {}, onClose() {} };
  const h = harness('editor/RadialAddMenu.tsx', props, { 'expo-image': { Image: 'Image' } });
  // The one family picker (ui/TargetFamilyPicker), offered every family here.
  const picker = () => h.nodes().find(n => n.type === 'TargetFamilyPicker');
  assert.equal(picker(), undefined, 'no family switcher by default');
  const labels = () => h.nodes().filter(n => n.type === 'Text').map(n => n.props.children);
  h.press('paper targets'); assert.ok(labels().includes('USPSA') && !labels().includes('Standard'), 'USPSA paper only');
  h.press('Other families');
  assert.deepEqual([...picker().props.families], ['USPSA', 'PCSL', 'IDPA']); assert.equal(picker().props.value, 'USPSA');
  picker().props.onChange('IDPA'); h.render();
  assert.ok(labels().includes('Standard'), 'IDPA targets are a tap away');
  h.press('Only USPSA targets');
  assert.equal(picker(), undefined); assert.ok(labels().includes('USPSA') && !labels().includes('Standard'), 'back to the match family');
});

test('casing and separators: editor buttons read ALL CAPS, labels are sentence case, one separator (·)', () => {
  const route = { ...createRoute('r'), positions: [{ id: 'p', label: 'P1', position: { space: 'stage', x: 100, y: 300, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }] };
  const h = editor(route);
  const check = where => {
    const buttons = h.nodes().filter(n => n.type === 'ToolButton' || n.type === 'Action');
    assert.ok(buttons.length > 0, where + ': kit buttons');
    assert.ok(!h.nodes().some(n => typeof n.type === 'function' && n.type.name === 'Button'), where + ': no private Button');
    for (const el of buttons) {
      const { text } = rendered(el);
      assert.equal(text, text.toUpperCase(), `${where}: button "${text}" is ALL CAPS`);
      assert.doesNotMatch(el.props.title, /\b(Stage Dimensions|Cancel Draft|Grid & Snapping|Reset Stage|Reset Route|Route Settings|Target Rounds|Overlay Layers)\b/, 'no Title Case');
    }
    for (const n of h.nodes()) for (const value of [n.props?.title, n.props?.children, n.props?.label]) if (typeof value === 'string' && value !== '•••') {
      assert.doesNotMatch(value, / \/ |•/, `${where}: "${value}" uses the one separator`);
      for (const w of W.RETIRED_WORDS) assert.doesNotMatch(value, w.pattern, `${where}: "${value}" (use ${w.use})`);
    }
  };
  check('BUILD');
  h.press('Build settings'); check('Build settings'); h.press(W.words.stageSize); check('Stage size');
  closeSheet(h);
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'wall' }); h.render(); check('drawing'); assert.ok(titles(h).includes('SNAP ON')); h.press('DONE');
  h.press('PLAN'); check('PLAN'); h.press('ROUTE'); check('ROUTE'); h.press('DRAW BY HAND'); check('DRAW BY HAND');
  assert.ok(titles(h).includes('ADD POSITION'));
  h.child('StageViewport').routePlanning.onSelect('p'); h.render(); check('position selected');
  assert.ok(titles(h).includes('POSITION 1')); h.press('Position 1'); check('Position sheet');
  assert.ok(h.nodes().some(n => n.type === 'EditorSheet' && n.props.title === 'Position' && n.props.visible));
});

test('screens say Stage editor: OPEN STAGE EDITOR on a new stage, the loading title and the navigator title', async () => {
  const h = harness('app/match.tsx', {}, { repo: { loadMatch: async () => ({ id: 'm', name: 'Match', targetFamily: 'USPSA' }), listStages: async () => [] } });
  await h.settle(); h.press('+ STAGE');
  assert.ok(h.nodes().some(n => n.props?.title === 'OPEN STAGE EDITOR' && n.props.variant === 'primary'));
  assert.ok(h.nodes().some(n => n.type === 'EditorSheet' && n.props.title === 'Add stage'));
  assert.match(fs.readFileSync(require.resolve('../src/app/builder.tsx'), 'utf8'), /<Screen safeTop title=\{words\.editor\}>/, 'the loading screen is titled with the word list');
  assert.match(fs.readFileSync(require.resolve('../src/app/_layout.tsx'), 'utf8'), /name="builder" options=\{\{ title: 'Stage editor'/);
});
