const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the real component callbacks with lightweight host components. These
// tests cover state/access paths; device layout and gestures need phone review.
function harness(entry, props = {}, overrides = {}) {
  const slots = [], cache = new Map(); let cursor = 0, changed = false, tree, guard;
  const effects = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; changed = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn) { cursor++; return fn; },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const repo = { loadProfile: async () => ({ performance: null }), saveStage: async (...args) => saved.push(args), ...overrides.repo };
  const saved = [], pushes = [];
  const defaultExport = value => ({ __esModule: true, default: value });
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const requireLocal = id => {
      if (id in overrides) return overrides[id];
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Modal: 'Modal', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, StyleSheet: { create: s => s, hairlineWidth: 1 }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'expo-router') return { router: { push: v => pushes.push(v), dismissTo: v => pushes.push(v) }, useNavigation: () => navigation, useFocusEffect: fn => react.useEffect(fn, []), useLocalSearchParams: () => ({ id: 'match' }) };
      if (id === 'expo-router/react-navigation') return { usePreventRemove: (enabled, callback) => { guard = { enabled, callback }; } };
      if (id === 'expo-modules-core') return { uuid: { v4: () => 'new-' + (++serial) } };
      if (id.endsWith('StorageProvider')) return { useRepository: () => repo };
      if (id.endsWith('ui/kit') || id === './kit') return { Action: 'Action', Copy: 'Copy', Panel: 'Panel', Screen: 'Screen', DataRow: 'DataRow', Stat: 'Stat', ui: {}, colors: {} };
      let target = id.startsWith('@/') ? path.resolve(__dirname, '../src', id.slice(2)) : path.resolve(path.dirname(file), id);
      if (fs.existsSync(target + '.tsx')) return defaultExport(path.basename(target));
      if (fs.existsSync(target + '.ts')) return load(target + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(requireLocal, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  }
  let serial = 0; const navigation = { dispatch() {} };
  const component = load(path.resolve(__dirname, '../src', entry)).default;
  function render() { for (let pass = 0; pass < 15; pass++) { cursor = 0; changed = false; tree = component(props); if (typeof tree.type === 'function' && tree.type.name === 'MatchStages') tree = tree.type(tree.props); effects.splice(0).forEach(fn => fn()); if (!changed) break; } return tree; }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => nodes(n));
    if (node.props?.visible === false || node.props?.style?.some?.(s => s?.display === 'none')) return [];
    return [node, ...nodes(node.props?.children)];
  }
  const find = predicate => { const result = nodes(tree).find(predicate); assert.ok(result, 'Missing UI node'); return result; };
  render();
  return { render, nodes: () => nodes(tree), find, saved, pushes, repo, get guard() { return guard; },
    press(title) { const node = find(n => n.props.title === title || n.props.accessibilityLabel === title || n.props.label === title); assert.ok(!node.props.disabled, title + ' is disabled'); node.props.onPress(); render(); },
    child(name) { return find(n => n.type === name).props; },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}
function initial(route) {
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage', matchId: 'm', document: stage(), plan: plan(route) }, targetFamily: 'USPSA' }); return h;
}
// Load pure model fixtures through the same TS compilation convention as the suite.
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const stage = () => require('../src/stage/defaults.ts').createDefaultStage();
const plan = route => ({ ...require('../src/planning/model.ts').createPlan(), ...(route ? { route } : {}) });
const route = () => require('../src/planning/route.ts').createRoute('r');

test('library card body opens and separate overflow does not open the card', () => {
  let opens = 0, menus = 0;
  const h = harness('ui/LibraryCard.tsx', { name: 'Match', category: 'USPSA', detail: '2 stages', disabled: false, open: () => opens++, more: () => menus++ });
  h.press('Open Match'); assert.equal(opens, 1); h.press('Actions for Match'); assert.equal(menus, 1); assert.equal(opens, 1);
});
test('match card and overflow retain open, edit, duplicate and delete paths', async () => {
  const match = { id: 'm', name: 'Match', targetFamily: 'USPSA', stageCount: 2 }; let duplicated;
  const h = harness('app/planner.tsx', {}, { repo: { listMatches: async () => [match], duplicateMatch: async id => { duplicated = id; } } }); await h.settle();
  h.child('LibraryCard').open(); assert.equal(h.pushes[0].params.id, 'm');
  h.child('LibraryCard').more(); h.render(); h.press('Edit match'); assert.ok(h.nodes().some(n => n.type === 'TextInput'));
  h.child('LibraryCard').more(); h.render(); h.press('Duplicate'); await h.settle(); assert.equal(duplicated, 'm');
  h.child('LibraryCard').more(); h.render(); h.press('Delete'); assert.ok(h.nodes().some(n => n.props.title === 'Confirm delete match'));
});
test('stage cards retain name-only creation and overflow actions', async () => {
  const st = { id: 's', name: 'Stage', updatedAt: Date.now() }; let duplicated;
  const h = harness('app/match.tsx', {}, { repo: { loadMatch: async () => ({ id: 'm', name: 'Match', targetFamily: 'USPSA' }), listStages: async () => [st], duplicateStage: async id => { duplicated = id; } } });
  await h.settle(); h.child('LibraryCard').open(); assert.equal(h.pushes[0].params.id, 's');
  h.child('LibraryCard').more(); h.render(); h.press('Duplicate'); await h.settle(); assert.equal(duplicated, 's');
  h.child('LibraryCard').more(); h.render(); h.press('Rename'); assert.ok(h.nodes().some(n => n.props.title === 'Apply name'));
  h.child('LibraryCard').more(); h.render(); h.press('Delete'); assert.ok(h.nodes().some(n => n.props.title === 'Confirm delete stage'));
  h.press('+ STAGE'); const fields = h.nodes().filter(n => n.type === 'TextInput'); assert.equal(fields.length, 1); assert.equal(fields[0].props.accessibilityLabel, 'Stage name');
});
test('BUILD/ROUTE switches preserve route and explicit save boundary', () => {
  const r = route(); const h = initial(r); h.press('ROUTE'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r);
  h.press('BUILD'); h.press('ROUTE'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r); assert.equal(h.saved.length, 0);
});
test('BUILD has SELECT/ADD/DRAW and target placement repeats until Done', () => {
  const h = initial(); h.press('ADD'); const add = h.child('AddMenu'); add.choose('uspsa-metric-chl-v1', false); add.close(); h.render();
  assert.equal(h.child('StageViewport').tool, 'target');
  const count = h.child('StageViewport').stage.objects.length;
  for (let i = 0; i < 2; i++) { h.child('StageViewport').onPlace({ space: 'stage', x: 100 + i * 50, y: 150, z: 0 }); h.render(); }
  assert.equal(h.child('StageViewport').stage.objects.length, count + 2); h.press('Done'); assert.equal(h.child('StageViewport').tool, 'select');
});
test('DRAW chooser retains wall, fault line, local segment undo and document history', () => {
  const h = initial(); h.press('DRAW'); h.press('WALL'); assert.equal(h.child('StageViewport').tool, 'wall');
  h.child('StageViewport').onDraw('start', { space: 'stage', x: 100, y: 100, z: 0 }); h.render();
  h.child('StageViewport').onDraw('commit', { space: 'stage', x: 200, y: 100, z: 0 }); h.render(); h.press('UNDO SEGMENT'); h.press('Done');
  h.press('DRAW'); h.press('FAULT LINE'); assert.equal(h.child('StageViewport').tool, 'faultLine');
});
test('selected object opens existing inspector and keeps contextual duplicate/delete', () => {
  const h = initial(), target = h.child('StageViewport').stage.objects.find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(target.id); h.render(); h.press('Edit'); assert.equal(h.child('ObjectInspector').item.id, target.id);
  assert.ok(h.nodes().some(n => n.props.title === 'Duplicate')); assert.ok(h.nodes().some(n => n.props.title === 'Delete'));
});
test('empty route PLAN exposes prerequisites without leaving ROUTE', () => {
  const h = initial(); h.press('ROUTE'); h.press('GENERATE ROUTE');
  for (const section of ['loadout', 'targets', 'rules']) {
    h.child('AutoPlannerPanel').onConfigure(section); h.render();
    assert.equal(h.child('StageViewport').routeEditing, true);
    assert.equal(h.saved.length, 0);
    if (section === 'rules') assert.ok(h.child('EngagementSettings')); else { assert.equal(h.child('PlanningPanel').section, section); h.press('Back to PLAN ROUTE'); }
  }
});
test('EDIT controls, waypoint sheet and reload share the existing route state', () => {
  const h = initial(); h.press('ROUTE'); h.press('Edit Manually'); h.press('ADD POINT');
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 1); h.press('WAYPOINT 1'); h.press('RELOAD'); assert.equal(h.child('RoutePanel').section, 'reload');
});
test('ANALYZE opens the read-only component and layer changes never save', () => {
  const h = initial(route()); h.press('ROUTE'); h.press('ANALYZE'); assert.ok(h.child('RouteAnalysis'));
  h.press('Route tools'); h.press('Overlay Layers'); h.press('Target Arrows SELECTED');
  assert.equal(h.child('StageViewport').routePlanning.layers.arrows, 'ALL'); h.press('Grid OFF'); assert.equal(h.child('StageViewport').gridVisible, true); assert.equal(h.saved.length, 0);
});
test('Save is explicit and dirty exit protection survives edits', async () => {
  const h = initial(); assert.equal(h.guard.enabled, false);
  const input = h.find(n => n.props.accessibilityLabel === 'Stage name'); input.props.onChangeText('Renamed'); h.render(); assert.equal(h.guard.enabled, true); assert.equal(h.saved.length, 0);
  h.guard.callback({ data: { action: { type: 'GO_BACK' } } }); h.render(); assert.ok(h.nodes().some(n => n.props.title === 'Keep editing'));
  h.press('Keep editing'); h.press('Save'); await h.settle(); assert.equal(h.saved.length, 1); assert.equal(h.saved[0][1], 'Renamed'); assert.equal(h.guard.enabled, false);
});
test('selected arrow policy and empty-route adoption preserve meaningful manual data', () => {
  const { defaultRouteLayers, showTargetArrows, meaningfulRoute } = require('../src/editor/routePresentation.ts');
  assert.equal(showTargetArrows(defaultRouteLayers, 'a', 'a'), true); assert.equal(showTargetArrows(defaultRouteLayers, 'b', 'a'), false);
  assert.equal(showTargetArrows({ ...defaultRouteLayers, arrows: 'OFF' }, 'a', 'a'), false);
  assert.equal(showTargetArrows({ ...defaultRouteLayers, arrows: 'ALL' }, 'b', 'a'), true);
  assert.equal(meaningfulRoute(route()), false); assert.equal(meaningfulRoute({ ...route(), reloads: [{ positionId: 'p', magazineId: 'm' }] }), true);
});
test('Training changes only the session action wording', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/training.tsx'), 'utf8'); assert.match(source, /title="CREATE SESSION" disabled={busy} onPress={create}/);
});

test('planner results adopt empty routes directly and confirm meaningful replacement', async () => {
  const { copyPlannerRoute } = require('../src/planning/plannerUI.ts');
  const candidate = { ...route(), positions: [{ id: 'p', label: 'P1', position: { space: 'stage', x: 100, y: 100, z: 0 }, visibleTargetIds: [], engagedTargetIds: [] }] };
  const card = { id: 'card', route: candidate, routeStyle: 'BALANCED', movementDistance: 360, positions: 1, movingSegments: null };
  for (const existing of [route(), candidate]) {
    let adopted;
    const document = stage(), savedPlan = plan(existing);
    const h = harness('planning/AutoPlannerPanel.tsx', { stage: document, plan: savedPlan, profile: null, preview: null, discoveryPreview: false, discoverySession: null, onClose() {}, onUse: value => adopted = value, onConfigure() {}, onDiscovery() {} }, {
      './positionSources': { preparePositionSource: () => ({ context: { stage: document, plan: savedPlan, profile: null }, metadata: {}, discovery: {}, searchCount: 1, warnings: [] }) },
      './plannerUI': { copyPlannerRoute, generatePlannerCards: () => ({ cards: [card] }) },
    });
    h.press('GENERATE ROUTE'); await new Promise(resolve => setTimeout(resolve, 80)); h.render();
    assert.ok(h.nodes().some(n => n.props.children === 'ROUTE FOUND')); h.press('USE ROUTE');
    if (existing.positions.length) { assert.equal(adopted, undefined); h.press('Confirm replacement'); }
    assert.deepEqual(adopted.route, candidate); assert.notEqual(adopted.route, candidate); assert.equal(h.saved.length, 0);
  }
});

test('inspector Advanced retains face cuts and planned rounds while basic fields stay visible', () => {
  const item = stage().objects.find(o => o.type === 'cardboardTarget');
  const h = harness('editor/ObjectInspector.tsx', { item, disabled: false, onApply: () => null, advancedContent: { type: 'RoundAssignment', props: {} } });
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'X'));
  assert.ok(!h.nodes().some(n => n.type === 'RoundAssignment'));
  h.find(n => n.props.accessibilityState?.expanded === false).props.onPress(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'RoundAssignment'));
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'Bottom elevation'));
});

test('engagement selection shows only that node arrows and moving-window details', () => {
  const document = stage(), target = document.objects.find(o => o.type === 'cardboardTarget');
  const nodes = ['n1', 'n2'].map(id => ({ id, waypointId: 'p', kind: 'moving', position: target.position, targets: [{ targetId: target.id, orderLabel: id === 'n1' ? 'A' : 'B', window: { startDistanceAlongSegment: 36, endDistanceAlongSegment: 108, startPosition: target.position, endPosition: target.position } }] }));
  const analysis = { nodes }; let selected;
  const { createViewportTransform } = require('../src/stage/coordinates.ts');
  const h = harness('editor/EngagementOverlay.tsx', { stage: document, route: route(), selectedId: 'p', selectedNodeId: 'n2', transform: createViewportTransform(document.stage, { width: 390, height: 500 }, { zoom: 1, pan: { x: 0, y: 0 } }), onSelect: (waypoint, node) => selected = node }, {
    '../planning/engagements': { analyzeEngagements: () => analysis },
  });
  assert.ok(!h.nodes().some(n => n.props.children === 'A')); assert.ok(h.nodes().some(n => n.props.children === 'B'));
  h.press('Moving section targets and order'); assert.equal(selected, 'n1');
  const details = harness('planning/EngagementDetails.tsx', { stage: document, route: route(), nodeId: 'n1', onChange() {} }, { './engagements': { analyzeEngagements: () => analysis } });
  assert.equal(details.find(n => n.props.label === 'Window span').props.value, '2 yd'); details.press('EDIT ORDER'); assert.ok(details.nodes().some(n => n.props.title === 'Earlier'));
});
