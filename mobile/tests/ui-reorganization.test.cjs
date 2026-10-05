const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the real component callbacks with lightweight host components. These
// tests cover state/access paths; device layout and gestures need phone review.
function harness(entry, props = {}, overrides = {}, exportName) {
  const slots = [], cache = new Map(); let cursor = 0, changed = false, tree, guard;
  const effects = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; changed = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn, deps) { const i=cursor++, old=slots[i]; if(!old || deps.some((v,j)=>!Object.is(v,old.deps[j]))) slots[i]={deps,fn}; return slots[i].fn; },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const repo = { trainingReadWarnings: [], loadProfile: async () => ({ performance: null }), saveStage: async (...args) => saved.push(args), ...overrides.repo };
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
      if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Modal: 'Modal', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, StyleSheet: { create: s => s, hairlineWidth: 1 }, AppState: { addEventListener: () => ({ remove() {} }) }, BackHandler: { addEventListener: () => ({ remove() {} }) } };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'expo-router') return { router: { push: v => pushes.push(v), dismissTo: v => pushes.push(v) }, useNavigation: () => navigation, useFocusEffect: fn => react.useEffect(fn, [fn]), useLocalSearchParams: () => ({ id: 'match' }) };
      if (id === 'expo-router/react-navigation') return { usePreventRemove: (enabled, callback) => { guard = { enabled, callback }; } };
      if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => null, uuid: { v4: () => 'new-' + (++serial) } };
      if (id.endsWith('StorageProvider')) return { useRepository: () => repo };
      if (id.endsWith('ui/kit') || id === './kit') return { Input: load(path.resolve(__dirname, '../src/ui/kit.tsx')).Input, DeleteConfirmation: load(path.resolve(__dirname, '../src/ui/kit.tsx')).DeleteConfirmation, ErrorState: 'ErrorState', ScreenHeader: 'ScreenHeader', MenuRow: 'MenuRow', StatusBadge: 'StatusBadge', Action: 'Action', Copy: 'Copy', Panel: 'Panel', Screen: 'Screen', DataRow: 'DataRow', Stat: 'Stat', Segmented: 'Segmented', EmptyState: 'EmptyState', Loading: 'Loading', Notice: 'Notice', Section: 'Section', ui: {}, colors: {} };
      let target = id.startsWith('@/') ? path.resolve(__dirname, '../src', id.slice(2)) : path.resolve(path.dirname(file), id);
      if (fs.existsSync(target + '.tsx')) return defaultExport(path.basename(target));
      if (fs.existsSync(target + '.ts')) return load(target + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(requireLocal, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  }
  let serial = 0; const navigation = { dispatch() {} };
  const exports = load(path.resolve(__dirname, '../src', entry));
  const component = exportName ? exports[exportName] : exports.default ?? exports.VideoAnalysisEditor;
  function render() { for (let pass = 0; pass < 15; pass++) { cursor = 0; changed = false; tree = component(props); if (typeof tree.type === 'function' && tree.type.name === 'MatchStages') tree = tree.type(tree.props); effects.splice(0).forEach(fn => fn()); if (!changed) break; } return tree; }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => nodes(n));
    if (typeof node.type === 'function' && ['Input', 'DeleteConfirmation'].includes(node.type.name)) return nodes(node.type(node.props));
    if (node.props?.visible === false || node.props?.style?.some?.(s => s?.display === 'none')) return [];
    return [node, ...nodes(node.props?.header), ...nodes(node.props?.action), ...nodes(node.props?.children)];
  }
  const find = predicate => { const result = nodes(tree).find(predicate); assert.ok(result, 'Missing UI node'); return result; };
  render();
  return { render, nodes: () => nodes(tree), find, saved, pushes, repo, get guard() { return guard; },
    press(title) { const node = find(n => typeof n.props.onPress === 'function' && (n.props.title === title || n.props.accessibilityLabel === title || n.props.label === title)); assert.ok(!node.props.disabled, title + ' is disabled'); node.props.onPress(); render(); },
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

test('ASK integrates controlled Apply dirty state explicit Save and normal undo in StageBuilder', async () => {
  const document=stage();document.objects=document.objects.filter(o=>o.type==='start');
  const r=route();r.positions=[{id:'W1',label:'W1',position:{space:'stage',x:150,y:60,z:0},visibleTargetIds:[],engagedTargetIds:[]}];
  r.engagementRules={...require('../src/planning/engagements.ts').defaultEngagementRules(),firingAreas:[{id:'goal',vertices:[{x:50,y:50},{x:160,y:50},{x:160,y:70},{x:50,y:70}]}]};
  const mock=require('../src/planning/routeAI/testing/mockAdapter.ts').mockAdapter([{intent:'MOVE_WAYPOINT',waypointReference:'waypoint 1',distanceValue:2,distanceUnit:'yards',direction:'left'},{intent:'UNDO'}]);
  const h=harness('editor/StageBuilder.tsx',{initial:{id:'s',name:'Stage',matchId:'m',document,plan:plan(r)},targetFamily:'USPSA',routeAIAdapter:mock.adapter});
  await h.settle();h.press('ROUTE');h.press('ASK');
  let sheet=h.child('RouteAISheet');await sheet.controller.send('Move waypoint 1 two yards left');h.render();
  assert.equal(h.saved.length,0);assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,150);
  assert.equal(h.child('StageViewport').routeAI.preview.proposedRoute.positions[0].position.x,78);
  await h.child('RouteAISheet').apply();h.render();assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,78);assert.equal(h.saved.length,0);assert.equal(h.guard.enabled,true);
  await sheet.controller.send('Undo that');h.render();await h.child('RouteAISheet').apply();h.render();assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,150);
  await sheet.controller.send('Move waypoint 1 two yards left');h.render(); // default mock query: no extra mutation
  h.child('RouteAISheet').close();h.render();h.press('Save');await h.settle();assert.equal(h.saved.length,1);
});

test('library card body opens and separate overflow does not open the card', () => {
  let opens = 0, menus = 0;
  const h = harness('ui/LibraryCard.tsx', { name: 'Match', category: 'USPSA', detail: '2 stages', disabled: false, open: () => opens++, more: () => menus++ });
  h.press('Open Match'); assert.equal(opens, 1); h.press('Actions for Match'); assert.equal(menus, 1); assert.equal(opens, 1);
});

test('Training session selectors save the chosen context and start without starting a timer', async () => {
  let record;
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { listTraining: async () => [], saveTraining: async value => { record = value; } } });
  await h.settle();
  assert.ok(h.nodes().some(n => n.type === 'EmptyState'));
  h.press('+ SESSION');
  h.child('Segmented').onChange('Live Fire'); h.render();
  h.find(n => n.type === 'Segmented' && n.props.value === 'Competition Holster').props.onChange('Low Ready'); h.render(); h.press('CREATE SESSION'); await h.settle();
  assert.equal(record.context, 'LIVE_FIRE');
  assert.equal(record.startingType, 'lowReady');
  assert.deepEqual(record.segments, []);
});

function videoHarness(repo = {}, onClose = () => {}, patch = {}) {
  const session = { id: 'v', trainingSessionId: 't', drillId: null, asset: { name: 'video.mp4', uri: 'training-videos/v.mp4', storage: 'DOCUMENTS' }, durationMs: 10000, fps: null, context: 'LIVE_FIRE', analysisStatus: 'ANNOTATING', analysisVersion: 1 };
  session.createdAt = session.importedAt = '2026-10-04T12:00:00.000Z';
  const initialVideo = { session, analysis: require('../src/training/videoAnalysis.ts').analyzeVideo(session, []) };
  return harness('training/VideoAnalysisEditor.tsx', { record: { id: 't', startingType: 'competitionHolster', videos: [initialVideo] }, initialVideo, onSaved() {}, onClose, ...patch }, {
    'expo-video': {}, './videoAssets': { assetExists: async () => false, discardVideoAsset() {} },
    './extractPose': {}, './extractCloseUp': {}, './extractAnalysisAudio': {}, repo: { saveTraining: async () => {}, ...repo },
  });
}

test('Video task sections retain a visible header Save and one draft across tab changes', async () => {
  let saved;
  const h = videoHarness({ saveTraining: async value => { saved = value; } }); await h.settle();
  h.press('+ Add event'); h.press('Add marker at entered ms');
  h.child('Segmented').onChange('RESULTS'); h.render();
  h.press('Save analysis'); await h.settle();
  assert.equal(saved.videos[0].analysis.events.length, 1);
  h.child('Segmented').onChange('COMPARE'); h.render();
  assert.ok(h.nodes().some(n => n.props.title === 'Save analysis'));
});

test('Video dirty close preserves the draft on Keep editing and failed Save', async () => {
  let closed = 0;
  const h = videoHarness({ saveTraining: async () => { throw new Error('Write failed'); } }, () => closed++); await h.settle();
  h.press('+ Add event'); h.press('Add marker at entered ms'); h.press('Close analysis');
  h.press('Keep editing'); assert.equal(closed, 0);
  h.press('Close analysis'); h.press('Save changes'); await h.settle(); assert.equal(closed, 0);
  h.press('Discard changes and close'); assert.equal(closed, 1);
});

test('shared selection controls expose active state and allow explicit selection', () => {
  let selected;
  const h = harness('ui/kit.tsx', { options: ['DRY FIRE', 'LIVE FIRE'], value: 'DRY FIRE', onChange: value => { selected = value; } }, {}, 'Segmented');
  assert.equal(h.nodes().filter(n => n.props.accessibilityState?.selected).length, 1);
  const button = h.find(n => n.props.accessibilityState?.selected === false);
  button.props.onPress(); assert.equal(selected, 'LIVE FIRE');
  assert.ok(button.props.style.some(style => style.minHeight === 44));
});

test('shared primary action retains disabled accessibility and touch size', () => {
  const h = harness('ui/kit.tsx', { title: 'Save', disabled: true, variant: 'primary', onPress() {} }, {}, 'Action');
  const button = h.find(n => n.type === 'Pressable');
  assert.equal(button.props.accessibilityState.disabled, true);
  assert.ok(button.props.style({ pressed: false }).some(style => style?.minHeight === 44));
});

test('Profile displays baseline and context-separated sample counts without sign-in controls', async () => {
  const profile = require('../src/profile/model.ts').createLocalProfile();
  profile.performanceObservations = [{ context: 'DRY_FIRE' }, { context: 'LIVE_FIRE' }, { context: 'PRESSURE_MATCH' }];
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => profile } }); await h.settle();
  assert.equal(h.nodes().filter(n => n.type === 'DataRow' && ['DRAW', 'RELOAD', 'SPLIT', 'MOVEMENT', 'TRANSITION'].includes(n.props.label)).length, 5);
  assert.equal(h.nodes().filter(n => n.type === 'DataRow' && n.props.value === '1 samples').length, 3);
  assert.ok(!h.nodes().some(n => /sign.in/i.test(n.props.title ?? '')));
});

test('mapping suggestions hide pair details until review and display a user-facing element label', () => {
  let selection;
  const pair = { id: 'pair', kind: 'MOVEMENT', planElementId: 'internal-id', confidence: 'HIGH', decision: 'PENDING', startMs: 0, endMs: 1000, observedIntervalIds: ['interval'], timingDeltaMs: null, reasons: [] };
  const comparison = { mappings: [], mappingSuggestions: { status: 'READY', warnings: [], candidates: [{ id: 'candidate', confidence: 'HIGH', coverage: 1, pairs: [pair], reasons: [], unmatchedPlanned: [], extraObserved: [] }] } };
  const h = harness('training/MappingSuggestionReview.tsx', { comparison, video: {}, disabled: false, onChange() {}, guard: fn => fn(), onSelect: value => { selection = value; } }, {
    './mappingSuggestions': { suggestionsAreStale: () => false }, './executionComparison': { plannedElements: () => [{ id: 'internal-id', label: 'Movement to point 2' }] },
  }, 'MappingSuggestionReview');
  assert.ok(!h.nodes().some(n => n.props.title?.startsWith('Movement to point')));
  h.press('Review mapping details'); h.press('Movement to point 2 · HIGH · PENDING');
  assert.equal(selection, pair);
  assert.ok(!h.nodes().some(n => n.props.title?.includes('internal-id')));
});
test('match card and overflow retain open, edit, duplicate and delete paths', async () => {
  const match = { id: 'm', name: 'Match', targetFamily: 'USPSA', stageCount: 2 }; let duplicated;
  const h = harness('app/planner.tsx', {}, { repo: { listMatches: async () => [match], duplicateMatch: async id => { duplicated = id; } } }); await h.settle();
  h.child('LibraryCard').open(); assert.equal(h.pushes[0].params.id, 'm');
  h.child('LibraryCard').more(); h.render(); h.press('Edit match'); assert.ok(h.nodes().some(n => n.type === 'TextInput'));
  h.child('LibraryCard').more(); h.render(); h.press('Duplicate'); await h.settle(); assert.equal(duplicated, 'm');
  h.child('LibraryCard').more(); h.render(); h.press('Delete'); assert.ok(h.nodes().some(n => n.props.title === 'Delete' && n.props.variant === 'destructive'));
});
test('stage cards retain name-only creation and overflow actions', async () => {
  const st = { id: 's', name: 'Stage', updatedAt: Date.now() }; let duplicated;
  const h = harness('app/match.tsx', {}, { repo: { loadMatch: async () => ({ id: 'm', name: 'Match', targetFamily: 'USPSA' }), listStages: async () => [st], duplicateStage: async id => { duplicated = id; } } });
  await h.settle(); h.child('LibraryCard').open(); assert.equal(h.pushes[0].params.id, 's');
  h.child('LibraryCard').more(); h.render(); h.press('Duplicate'); await h.settle(); assert.equal(duplicated, 's');
  h.child('LibraryCard').more(); h.render(); h.press('Rename'); assert.ok(h.nodes().some(n => n.props.title === 'Apply name'));
  h.child('LibraryCard').more(); h.render(); h.press('Delete'); assert.ok(h.nodes().some(n => n.props.title === 'Delete' && n.props.variant === 'destructive'));
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
  assert.equal(h.child('StageViewport').stage.objects.length, count + 2); h.press('DONE'); assert.equal(h.child('StageViewport').tool, 'select');
});
test('DRAW chooser retains wall, fault line, local segment undo and document history', () => {
  const h = initial(); h.press('DRAW'); h.press('WALL'); assert.equal(h.child('StageViewport').tool, 'wall');
  h.child('StageViewport').onDraw('start', { space: 'stage', x: 100, y: 100, z: 0 }); h.render();
  h.child('StageViewport').onDraw('commit', { space: 'stage', x: 200, y: 100, z: 0 }); h.render(); h.press('UNDO SEGMENT'); h.press('DONE');
  h.press('DRAW'); h.press('FAULT LINE'); assert.equal(h.child('StageViewport').tool, 'faultLine');
});
test('selected object opens existing inspector and keeps contextual duplicate/delete', () => {
  const h = initial(), target = h.child('StageViewport').stage.objects.find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(target.id); h.render(); h.press('EDIT'); assert.equal(h.child('ObjectInspector').item.id, target.id);
  assert.ok(h.nodes().some(n => n.props.title === 'DUPLICATE')); assert.ok(h.nodes().some(n => n.props.title === 'DELETE'));
});
test('empty route PLAN exposes prerequisites without leaving ROUTE', () => {
  const h = initial(); h.press('ROUTE'); h.press('PLAN ROUTE');
  for (const section of ['loadout', 'targets', 'rules']) {
    h.child('AutoPlannerPanel').onConfigure(section); h.render();
    assert.equal(h.child('StageViewport').routeEditing, true);
    assert.equal(h.saved.length, 0);
    if (section === 'rules') assert.ok(h.child('EngagementSettings')); else { assert.equal(h.child('PlanningPanel').section, section); h.press('Back to PLAN ROUTE'); }
  }
});
test('EDIT controls, waypoint sheet and reload share the existing route state', () => {
  const h = initial(); h.press('ROUTE'); h.press('Edit manually'); h.press('ADD WAYPOINT');
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 0);
  h.child('StageViewport').onRoutePoint({ space: 'stage', x: 120, y: 180, z: 0 }); h.render();
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 1); h.press('WAYPOINT 1'); h.press('RELOAD'); assert.equal(h.child('RoutePanel').section, 'reload');
});
test('ANALYZE opens the read-only component and layer changes never save', () => {
  const h = initial(route()); h.press('ROUTE'); h.press('ANALYZE'); assert.ok(h.child('RouteAnalysis'));
  h.press('Route tools'); h.press('Overlay Layers'); h.press('Target Arrows SELECTED');
  assert.equal(h.child('StageViewport').routePlanning.layers.arrows, 'ALL'); h.press('Grid OFF'); assert.equal(h.child('StageViewport').gridVisible, true); assert.equal(h.saved.length, 0);
});
test('Save is explicit and dirty exit protection survives edits', async () => {
  const h = initial(); assert.equal(h.guard.enabled, false);
  h.find(n => n.props.accessibilityLabel === 'Edit stage name').props.onPress(); h.render();
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
      './routeSolver/solveRoute': { solveRoute: () => ({ status: 'success', bestRoute: { id: 'best' }, alternatives: [] }) },
      './routeSolver/adoption': { solverInputFromPlan: () => ({ start: { x: 0, y: 0 }, requiredAreas: [] }), solverPreviewCard: () => card },
      './plannerUI': { copyPlannerRoute },
    });
    h.press('GENERATE ROUTE'); await new Promise(resolve => setTimeout(resolve, 80)); h.render();
    assert.ok(h.nodes().some(n => n.props.children === 'ROUTE FOUND')); h.press('USE ROUTE');
    if (existing.positions.length) { assert.equal(adopted, undefined); h.press('Confirm replacement'); }
    assert.deepEqual(adopted.route, candidate); assert.notEqual(adopted.route, candidate); assert.equal(h.saved.length, 0);
  }
});

test('PLAN executes real offline solve, previews it and adopts an editable route without saving', async () => {
  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { createPlan } = require('../src/planning/model.ts');
  const { createRoute, isStageRoute } = require('../src/planning/route.ts');
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const document = createDefaultStage(), savedPlan = createPlan();
  document.objects = [createObject('start', 'start', 40, 100)];
  savedPlan.route = createRoute('editable');
  savedPlan.route.engagementRules = { ...defaultEngagementRules(), firingAreas: [{ id: 'required', vertices: [{ x: 180, y: 90 }, { x: 200, y: 90 }, { x: 200, y: 110 }, { x: 180, y: 110 }] }] };
  let adopted, preview;
  const h = harness('planning/AutoPlannerPanel.tsx', { stage: document, plan: savedPlan, profile: null, preview: null, discoveryPreview: false, discoverySession: null, onClose() {}, onUse: value => adopted = value, onPreview: value => preview = value, onConfigure() {}, onDiscovery() {} });
  h.press('GENERATE ROUTE'); await new Promise(resolve => setTimeout(resolve, 80)); h.render();
  h.press('VIEW ON STAGE'); assert.equal(preview.routeStyle, 'GEOMETRY'); assert.equal(preview.movementDistance, 140);
  h.press('USE ROUTE'); assert.ok(isStageRoute(adopted.route)); assert.equal(adopted.route.positions[0].position.x, 180); assert.equal(h.saved.length, 0);
  assert.equal(savedPlan.route.positions.length, 0);
});

test('inspector separates visible planned rounds and face cuts from advanced elevation', () => {
  const item = stage().objects.find(o => o.type === 'cardboardTarget');
  const h = harness('editor/ObjectInspector.tsx', { item, disabled: false, onApply: () => null, advancedContent: { type: 'RoundAssignment', props: {} } });
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'X'));
  assert.ok(h.nodes().some(n => n.type === 'RoundAssignment'));
  assert.ok(!h.nodes().some(n => n.props.accessibilityLabel === 'Bottom elevation'));
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
  h.press('Moving window targets and order'); assert.equal(selected, 'n1');
  const details = harness('planning/EngagementDetails.tsx', { stage: document, route: route(), nodeId: 'n1', onChange() {} }, { './engagements': { analyzeEngagements: () => analysis } });
  assert.equal(details.find(n => n.props.label === 'Window span').props.value, '2 yd'); details.press('EDIT ORDER'); assert.ok(details.nodes().some(n => n.props.title === 'Earlier'));
});


test('structured firing area fields retain yard parsing and reject incomplete coordinates', () => {
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const rules = defaultEngagementRules(); rules.firingAreas = [{ id: 'area-1', vertices: [{ x: 0, y: 0 }, { x: 360, y: 0 }, { x: 360, y: 360 }, { x: 0, y: 360 }] }];
  let applied;
  const h = harness('planning/EngagementSettings.tsx', { stage: stage(), initial: rules, onApply: value => applied = value, onCancel() {} });
  assert.equal(h.nodes().filter(n => n.type === 'TextInput').length, 0);
  h.press('FIRING AREAS / 1 areas >');
  assert.equal(h.nodes().filter(n=>n.type==='TextInput').length,0);
  h.press('Firing area 1 >');
  const x = () => h.find(n => n.props.accessibilityLabel === 'Firing area 1 point 2 X yards');
  x().props.onChangeText(''); h.render(); h.press('APPLY ROUTE SETTINGS'); assert.equal(applied, undefined);
  x().props.onChangeText('10.25'); h.render(); h.press('APPLY ROUTE SETTINGS'); assert.equal(applied.firingAreas[0].vertices[1].x, 369);
  assert.equal(rules.firingAreas[0].vertices[1].x, 360);
});

test('candidate preview omits editable-route Save and Back returns to results', () => {
  const h = initial(route()); h.press('ROUTE'); h.press('PLAN');
  h.child('AutoPlannerPanel').onPreview({ route: route(), number: 1, label: 'Candidate' }); h.render();
  assert.ok(!h.nodes().some(n => n.props.title === 'Save'));
  h.press('Back to results'); assert.equal(h.child('AutoPlannerPanel').preview, null); assert.equal(h.saved.length, 0);
});


test('Training loading and failed read suppress empty state and retry recovers', async () => {
  let fail = true;
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => { if (fail) throw Error('disk'); return []; } } });
  assert.ok(h.nodes().some(n => n.type === 'Loading'));
  assert.ok(!h.nodes().some(n => n.type === 'EmptyState'));
  await h.settle(); assert.ok(h.nodes().some(n => n.props.children === 'Couldn’t load training sessions.'));
  fail = false; h.press('RETRY'); await h.settle();
  assert.equal(h.child('EmptyState').title, 'NO TRAINING SESSIONS');
  assert.equal(h.child('EmptyState').detail, 'Create a session to begin recording practice history.');
});

test('Create Session validates blanks and preserves explicit pressure/start selection', async () => {
  let saved;
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [], saveTraining: async r => { saved = r; } } });
  await h.settle(); h.press('+ SESSION');
  assert.equal(h.child('EditorSheet').title, 'CREATE SESSION');
  h.find(n => n.type === 'TextInput').props.onChangeText('   '); h.render(); h.press('CREATE SESSION'); await h.settle();
  assert.equal(saved, undefined); assert.ok(h.nodes().some(n => n.props.children === 'Enter a session name.'));
  const name = 'Long session '.repeat(8);
  h.find(n => n.type === 'TextInput').props.onChangeText(name); h.render();
  h.child('Segmented').onChange('Pressure / Match'); h.render();
  h.find(n => n.type === 'Segmented' && n.props.value === 'Competition Holster').props.onChange('Level II / III Holster'); h.render();
  h.press('CREATE SESSION'); await h.settle();
  assert.equal(saved.drillName, name.trim()); assert.equal(saved.context, 'PRESSURE_MATCH'); assert.equal(saved.startingType, 'retentionHolster');
});

test('Training library cards open existing video and contextual video actions', async () => {
  const record = { id: 'r', drillName: 'Very long session '.repeat(12), context: 'LIVE_FIRE', startingType: 'competitionHolster', occurredAt: '2026-10-05T12:00:00Z', videos: [{ session: { id: 'v', analysisStatus: 'REVIEWED' } }] };
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [record] } });
  await h.settle(); const card = h.child('LibraryCard');
  assert.equal(card.category, 'LIVE FIRE'); assert.ok(card.detail.includes('Competition Holster')); assert.ok(card.detail.includes('1 video'));
  card.more(); h.render(); assert.ok(h.nodes().some(n => n.props.title === 'Video 1 · Analysis saved'));
  h.press('Video 1 · Analysis saved'); assert.ok(h.nodes().some(n => n.props.initialVideo === record.videos[0]));
  card.open(); h.render(); assert.ok(h.nodes().some(n => n.props.initialVideo === record.videos[0]));
});

test('Profile renders stored zero, unavailable metrics, factual counts and cloud placeholder', async () => {
  const profile = { displayName: 'Local shooter', performance: { drawTime: 0, reloadTime: 1.12, averageSplitTime: undefined, movementSpeed: null, transitionTime: NaN }, calibrationContext: 'PRESSURE_MATCH', performanceObservations: [{ context: 'LIVE_FIRE' }] };
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => profile } });
  await h.settle(); const rows = h.nodes().filter(n => n.type === 'DataRow');
  assert.equal(rows.find(n => n.props.label === 'DRAW').props.value, '0 s');
  assert.equal(rows.find(n => n.props.label === 'SPLIT').props.value, '—');
  assert.equal(rows.find(n => n.props.label === 'MOVEMENT').props.value, '—');
  assert.equal(rows.find(n => n.props.label === 'Live Fire').props.value, '1 samples');
  assert.equal(rows.find(n => n.props.label === 'Active context').props.value, 'Pressure / Match');
  assert.ok(h.nodes().some(n => n.props.children === 'Not available yet.'));
  assert.ok(!h.nodes().some(n => /sign.?in/i.test(n.props.title ?? '')));
});


test('Video analysis has four sections and keeps the event draft during switching', async () => {
 const h = videoHarness(); await h.settle(); h.press('+ Add event');
 const input = h.find(n => n.props.accessibilityLabel === 'Marker milliseconds'); input.props.onChangeText('2420'); h.render();
 for (const section of ['ANALYZE', 'COMPARE', 'RESULTS', 'TIMELINE']) { h.child('Segmented').onChange(section); h.render(); assert.ok(h.nodes().some(n => n.props.title === 'Save analysis')); }
 assert.equal(h.find(n => n.props.accessibilityLabel === 'Marker milliseconds').props.value, '2420');
});
test('Video timeline Edit opens its focused sheet immediately', async () => {
 const h=videoHarness(); await h.settle(); h.press('+ Add event'); h.press('Add marker at entered ms'); h.press('Edit');
 assert.equal(h.child('EditorSheet').visible,true); assert.equal(h.child('EditorSheet').title,'Edit Event');
});
test('Video modules begin NOT RUN and review is progressive', async () => {
 const h=videoHarness(); await h.settle(); h.child('Segmented').onChange('ANALYZE');h.render();
 assert.equal(h.nodes().filter(n=>n.type==='StatusBadge' && n.props.label==='NOT RUN').length,3);
 assert.ok(!h.nodes().some(n=>n.props.title==='+ Add event')); h.press('REVIEW SUGGESTIONS'); assert.ok(h.nodes().some(n=>n.props.title==='+ Add event'));
});
test('Video Results omits empty metric cards and disables empty contribution', async () => {
 const h=videoHarness();await h.settle(); h.child('Segmented').onChange('RESULTS');h.render();
 assert.equal(h.nodes().filter(n=>n.type==='Stat').length,0);
 assert.equal(h.find(n=>n.props.title==='Add 0 eligible measurements to profile').props.disabled,true);
});
test('Video missing file preserves manual annotation and offers relink', async () => {
 const h=videoHarness();await h.settle();assert.ok(h.nodes().some(n=>n.props.title==='Relink original video (keep markers)'));
 h.press('+ Add event');assert.equal(h.child('EditorSheet').visible,true);
});
test('Video profile contribution reads existing observations without implicitly saving', async () => {
 let saves=0;const h=videoHarness({loadProfile:async()=>({performanceObservations:[{source:'VIDEO_ANALYSIS',videoId:'v'}]}),saveTraining:async()=>saves++});await h.settle();h.child('Segmented').onChange('RESULTS');h.render();
 assert.ok(h.nodes().some(n=>n.props.title==='UPDATE PROFILE DATA'));assert.equal(saves,0);
});
test('Video manual event fields follow the chosen event type',async()=>{
 const h=videoHarness();await h.settle();h.press('+ Add event');assert.ok(!h.nodes().some(n=>n.props.accessibilityLabel==='Known movement distance in inches'));
 h.press('Event type: STIMULUS');h.press('MOVEMENT START');assert.ok(h.nodes().some(n=>n.props.accessibilityLabel==='Known movement distance in inches'));
});

test('invalid event timestamp keeps its error and draft inside the open event sheet', async () => {
  const h=videoHarness(); await h.settle(); h.press('+ Add event');
  h.find(n=>n.props.accessibilityLabel==='Marker milliseconds').props.onChangeText('invalid'); h.render();
  h.press('Add marker at entered ms');
  assert.equal(h.child('EditorSheet').visible,true);
  assert.ok(h.nodes().some(n=>n.type==='Notice' && n.props.tone==='error'));
  assert.equal(h.find(n=>n.props.accessibilityLabel==='Marker milliseconds').props.value,'invalid');
  assert.equal(h.saved.length,0);
});

test('Profile failed load exposes a retry that recovers without navigation', async () => {
  let fail=true, reads=0;
  const h=harness('app/account.tsx',{}, {repo:{loadProfile:async()=>{reads++; if(fail) throw Error('storage unavailable'); return {performance:{},performanceObservations:[]};}}});
  await h.settle(); assert.equal(h.child('ErrorState').title,'Couldn’t load profile.');
  fail=false; h.child('ErrorState').retry(); h.render(); await h.settle();
  assert.equal(reads,2); assert.ok(!h.nodes().some(n=>n.type==='ErrorState'));
  assert.ok(h.nodes().some(n=>n.props.children?.startsWith?.('No training calibration yet.')));
});

test('Matches failed load has no empty-state flicker and retries the existing repository', async () => {
  let fail=true;
  const h=harness('app/planner.tsx',{}, {repo:{listMatches:async()=>{if(fail) throw Error('read failed'); return [];}}});
  assert.ok(h.nodes().some(n=>n.type==='Loading')); assert.ok(!h.nodes().some(n=>n.type==='EmptyState'));
  await h.settle(); assert.ok(!h.nodes().some(n=>n.type==='EmptyState'));
  fail=false; h.child('ErrorState').retry(); h.render(); await h.settle();
  assert.ok(h.nodes().some(n=>n.type==='EmptyState')); assert.ok(!h.nodes().some(n=>n.type==='Loading'));
});
test('Fused review hides rejected suggestions and exposes Confirm Edit Reject for pending evidence',()=>{
 const hypothesis={id:'h',type:'FIRST_SHOT',timestampMs:2420,status:'SUGGESTED',confidence:'HIGH',families:['AUDIO'],evidenceIds:[],warnings:[]};
 const h=harness('training/FusionReview.tsx',{fusion:{warnings:[],hypotheses:[hypothesis,{...hypothesis,id:'rejected',status:'REJECTED'}]},busy:false,onReview(){},onPreview(){}},{},'FusionReview');
 const cards=h.nodes().filter(n=>typeof n.type==='function' && n.type.name==='EvidenceCard');assert.equal(cards.length,1);assert.equal(cards[0].props.h.id,'h');
});

function comparisonHarness(linked=false, mapped=false) {
 const comparison=linked?{snapshot:{stageId:'s',stageName:'Stage 3',capturedAt:'2026-10-05',plan:{route:{name:'Route 1'}}},mappings:mapped?[{id:'m',kind:'MOVEMENT'}]:[]}:undefined;
 const result={warnings:[],completeness:{percent:0},plannedTotalMs:1400,observedTotalMs:null,totalDeltaMs:null,buckets:{},segmentComparisons:[],positionComparisons:[],reloadComparisons:[],stringComparisons:[]};
 return harness('training/ExecutionComparisonReview.tsx',{video:{executionComparison:comparison},busy:false,onChange(){},onPreview(){}},{repo:{listStages:async()=>[],loadStage:async()=>null},'./executionComparison':{isExecutionComparison:()=>linked,createExecutionComparisonResult:()=>result,observedExecution:()=>({intervals:[]}),plannedElements:()=>[]}},'ExecutionComparisonReview');
}
test('Compare no-link state offers the existing stage selection',async()=>{const h=comparisonHarness();h.press('SELECT STAGE');await h.settle();assert.ok(h.nodes().some(n=>n.props.children==='SELECT STAGE'));});
test('Compare linked stage hides the snapshot and mapping editor until requested',async()=>{const h=comparisonHarness(true);h.press('LINKED PLAN');await h.settle();assert.ok(h.nodes().some(n=>n.type==='DataRow' && n.props.value==='Stage 3'));assert.ok(!h.nodes().some(n=>n.type==='StageViewport'));h.press('VIEW PLAN');assert.ok(h.nodes().some(n=>n.type==='StageViewport'));h.press('Edit mappings');assert.equal(h.child('EditorSheet').visible,true);});
test('Compare without mappings defers planned observed result rows',async()=>{const h=comparisonHarness(true);h.press('LINKED PLAN');await h.settle();assert.ok(!h.nodes().some(n=>n.type==='DataRow' && n.props.label==='Observed'));});

test('Compare mapped results display planned observed and delta without opening diagnostics',async()=>{const h=comparisonHarness(true,true);h.press('LINKED PLAN');await h.settle();for(const label of ['Planned','Observed','Delta','Movement delta','Residual delta'])assert.ok(h.nodes().some(n=>n.type==='DataRow' && n.props.label===label));});
test('Video Results show confirmed values and hold tentative values behind endpoint review',async()=>{
 const session={id:'v',trainingSessionId:'t',asset:{name:'v.mp4',uri:'training-videos/v.mp4',storage:'DOCUMENTS'},durationMs:10000,fps:null,context:'LIVE_FIRE',drillId:null,createdAt:'2026-10-05T12:00:00.000Z',importedAt:'2026-10-05T12:00:00.000Z',analysisStatus:'ANNOTATING',analysisVersion:1};
 const analysis={analysisVersion:1,videoId:'v',trainingSessionId:'t',confidence:'LOW',events:[],movementSegments:[],shotStrings:[],warnings:[],completeness:{},measurements:[{id:'r',kind:'REACTION',durationMs:240,eventIds:[],eligible:true,confidence:'CONFIRMED'},{id:'d',kind:'DRAW',durationMs:910,eventIds:[],eligible:false,confidence:'HIGH'}]};
 const h=videoHarness({},()=>{},{initialVideo:{session,analysis}});await h.settle();h.child('Segmented').onChange('RESULTS');h.render();const stats=h.nodes().filter(n=>n.type==='Stat');assert.equal(stats.length,2);assert.equal(stats[0].props.value,'0.24');assert.equal(stats[1].props.value,'\u2014');assert.ok(h.nodes().some(n=>n.props.children==='Endpoints need review'));
});
