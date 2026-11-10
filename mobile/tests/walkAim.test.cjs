// WALK auto-aim in the eye-level view: one planned target at a time, ‹ › through a stop's targets, free look.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, f);
const { harness } = require('./harness.cjs');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute } = require('../src/planning/route.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');

const at = (x, y) => ({ space: 'stage', x, y, z: 0 });
const overrides = () => ({
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, PanResponder: { create: handlers => ({ panHandlers: handlers }) } },
  './GLStage': { __esModule: true, default: 'GLStage', glUnavailable: () => false },
  '../ui/prefsStore': { readPref: () => null, writePref() {} },
});
function walkScreen() {
  const stage = createDefaultStage(undefined, { size: { width: 600, depth: 480 } });
  stage.objects = [createObject('start', 'start', 300, 440), createObject('cardboardTarget', 'T', 200, 60), createObject('cardboardTarget', 'U', 400, 60), createObject('cardboardTarget', 'V', 520, 60)];
  const plan = createPlan(); plan.route = createRoute('r');
  plan.route.engagementRules = { ...defaultEngagementRules(stage), firingAreas: [{ id: 'A', vertices: [{ x: 20, y: 300 }, { x: 580, y: 300 }, { x: 580, y: 460 }, { x: 20, y: 460 }] }] };
  plan.route.positions = [
    { id: 'P1', label: 'P1', position: at(300, 400), visibleTargetIds: ['T', 'U'], engagedTargetIds: ['T', 'U'] },
    { id: 'P2', label: 'P2', position: at(520, 400), visibleTargetIds: ['V'], engagedTargetIds: ['V'] }];
  return harness('stage3d/EyeLevelView.tsx', { stage, plan, ruleset: 'USPSA', onExit() {} }, overrides());
}
const aimText = h => h.find(n => n.props?.testID === 'walk-aim').props.children;
const hasLabel = (h, label) => h.nodes().some(n => n.props?.accessibilityLabel === label);
const drag = h => { const view = h.find(n => n.props?.accessibilityLabel === 'Walk-through at eye level. Drag to look around.');
  view.props.onPanResponderGrant({}, { dx: 0, dy: 0 }); view.props.onPanResponderMove({}, { dx: 60, dy: 0 }); h.render(); };

test('WALK aims at the next planned target from the start, then one target at a time at a stop', () => {
  const h = walkScreen();
  assert.match(aimText(h), /^NEXT T\d$/);
  assert.ok(!hasLabel(h, 'Aim at the next target to engage here'), 'nothing to step through at the start');
  h.press('View from P1');
  const first = aimText(h);
  assert.match(first, /^AIM T\d · 1 OF 2$/);
  h.press('Aim at the next target to engage here');
  const second = aimText(h);
  assert.match(second, /^AIM T\d · 2 OF 2$/); assert.notEqual(first.slice(0, 6), second.slice(0, 6), 'a different target');
  h.press('Aim at the next target to engage here');
  assert.equal(aimText(h), first, 'wraps round');
  h.press('Aim at the previous target to engage here');
  assert.equal(aimText(h), second);
});

test('WALK: dragging switches to free look until AIM or the next stop', () => {
  const h = walkScreen();
  h.press('View from P1');
  const aimed = aimText(h);
  drag(h);
  assert.equal(aimText(h), 'FREE LOOK');
  assert.ok(!hasLabel(h, 'Aim at the next target to engage here'), '‹ › step aside in free look');
  h.press('Aim at the planned target again');
  assert.equal(aimText(h), aimed);
  drag(h); assert.equal(aimText(h), 'FREE LOOK');
  h.press('View from P2');
  assert.match(aimText(h), /^AIM T\d$/, 'a new stop aims again');
});
