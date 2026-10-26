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
  await h.settle();h.press('PLAN');h.press('Route tools');h.press('Ask Route AI');
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
  assert.ok(button.props.style.some(style => style?.minHeight >= 44), 'at least 44 pt (48 in the outdoor design)');
});

test('shared primary action retains disabled accessibility and touch size', () => {
  const h = harness('ui/kit.tsx', { title: 'Save', disabled: true, variant: 'primary', onPress() {} }, {}, 'Action');
  const button = h.find(n => n.type === 'Pressable');
  assert.equal(button.props.accessibilityState.disabled, true);
  assert.ok(button.props.style({ pressed: false }).some(style => style?.minHeight >= 44), 'at least 44 pt (56 for primary)');
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
  const r = route(); const h = initial(r); h.press('PLAN'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r);
  h.press('BUILD'); h.press('PLAN'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r); assert.equal(h.saved.length, 0);
});
test('BUILD has SELECT/ADD/DRAW and target placement repeats until Done', () => {
  const h = initial(); h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'target', presetId: 'uspsa-metric-chl-v1', noShoot: false }); h.render();
  assert.ok(!h.nodes().some(n => n.type === 'RadialAddMenu'), 'the menu closes after a choice');
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
test('the movement-only optimizer (Route tools) exposes prerequisites without leaving PLAN', () => {
  const h = initial(); h.press('PLAN'); h.press('Route tools'); h.press('Movement-only optimizer (older)');
  for (const section of ['loadout', 'targets', 'rules']) {
    h.child('AutoPlannerPanel').onConfigure(section); h.render();
    assert.equal(h.child('StageViewport').routeEditing, true);
    assert.equal(h.saved.length, 0);
    if (section === 'rules') assert.ok(h.child('EngagementSettings')); else { assert.equal(h.child('PlanningPanel').section, section); h.press('Back to MOVEMENT OPTIMIZER'); }
  }
});
test('PATH controls, waypoint sheet and reload share the existing route state', () => {
  const h = initial(); h.press('PLAN'); h.press('PATH'); h.press('ADD WAYPOINT');
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 0);
  h.child('StageViewport').onRoutePoint({ space: 'stage', x: 120, y: 180, z: 0 }); h.render();
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 1); h.press('WAYPOINT 1'); h.press('RELOAD'); assert.equal(h.child('RoutePanel').section, 'reload');
});
test('ANALYZE opens the read-only component and layer changes never save', () => {
  const h = initial(route()); h.press('PLAN'); h.press('ANALYZE'); assert.ok(h.child('RouteAnalysis'));
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
      './routeSolver/adoption': { solverInputFromPlan: () => ({ start: { x: 0, y: 0 }, requiredAreas: [] }), solverPreviewCard: () => card, adoptionLosses: () => ({ waypoints: 0, reloads: 0, bends: 0, engageArrows: 0 }) },
      './plannerUI': { copyPlannerRoute },
    });
    h.press('OPTIMIZE MOVEMENT'); await new Promise(resolve => setTimeout(resolve, 80)); h.render();
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
  h.press('OPTIMIZE MOVEMENT'); await new Promise(resolve => setTimeout(resolve, 80)); h.render();
  h.press('VIEW ON STAGE'); assert.equal(preview.routeStyle, 'GEOMETRY'); assert.equal(preview.movementDistance, 140.5);
  // The stop settles 0.5 in inside the firing area so a stationary shot there is legal.
  h.press('USE ROUTE'); assert.ok(isStageRoute(adopted.route)); assert.equal(adopted.route.positions[0].position.x, 180.5); assert.equal(h.saved.length, 0);
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
  const h = initial(route()); h.press('PLAN'); h.press('Route tools'); h.press('Movement-only optimizer (older)');
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

test('Profile renders stored zero, unavailable metrics, factual counts and local-storage limitation', async () => {
  const profile = { displayName: 'Local shooter', performance: { drawTime: 0, reloadTime: 1.12, averageSplitTime: undefined, movementSpeed: null, transitionTime: NaN }, calibrationContext: 'PRESSURE_MATCH', performanceObservations: [{ context: 'LIVE_FIRE' }] };
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => profile } });
  await h.settle(); const rows = h.nodes().filter(n => n.type === 'DataRow');
  assert.equal(rows.find(n => n.props.label === 'DRAW').props.value, '0 s');
  assert.equal(rows.find(n => n.props.label === 'SPLIT').props.value, '—');
  assert.equal(rows.find(n => n.props.label === 'MOVEMENT').props.value, '—');
  assert.equal(rows.find(n => n.props.label === 'Live Fire').props.value, '1 samples');
  assert.equal(rows.find(n => n.props.label === 'Active context').props.value, 'Pressure / Match');
  assert.ok(h.nodes().some(n => n.props.children === 'Data is stored on this device. Cloud sync is not included in this release.'));
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

test('PATH exposes connection editing and preserves stage objects through style edits',()=>{
 const r=route();r.positions=['a','b'].map((id,i)=>({id,label:id,position:{space:'stage',x:100+i*50,y:100,z:0},visibleTargetIds:[],engagedTargetIds:[]}));
 const h=initial(r);h.press('PLAN');h.press('PATH');
 const before=JSON.stringify(h.child('StageViewport').stage);
 assert.equal(h.child('StageViewport').routePlanning.editing,true);
 assert.ok(h.nodes().some(n=>n.props.title==='ENGAGE'&&!n.props.disabled));
 h.child('StageViewport').routePlanning.onSelect('b');h.render();h.press('CONNECTION');h.press('ROUNDED');
 const edited=h.child('StageViewport').routePlanning.route;assert.deepEqual(edited.positions,r.positions);assert.equal(edited.connections[0].style,'ROUNDED');assert.equal(JSON.stringify(h.child('StageViewport').stage),before);assert.equal(h.saved.length,0);
});

test('ENGAGE preserves PATH and supports contextual assignment, order, direction, delete, undo and Save', async()=>{
 const r=route();r.positions=['a','b'].map((id,i)=>({id,label:id,position:{space:'stage',x:100+i*100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}));
 r.connections=[{fromId:'a',toId:'b',style:'ROUNDED',bends:[{id:'bend',position:{space:'stage',x:150,y:150,z:0}}]}];
 const h=initial(r);await h.settle();h.press('PLAN');h.press('PATH');h.press('ENGAGE');
 let v=h.child('StageViewport');const before=JSON.stringify(v.stage),targets=v.stage.objects.filter(require('../src/planning/model.ts').isEngageable);
 assert.equal(v.routePlanning.editing,false);assert.ok(v.manualEngage);assert.equal(v.routePlanning.layers.nodes,false);
 v.manualEngage.onCreate({kind:'waypoint',waypointId:'a'},targets[0].id,0);h.render();
 const first=h.child('StageViewport').routePlanning.route.manualEngagements[0];assert.ok(first.id.startsWith('engagement-'));assert.ok(!h.nodes().some(n=>n.props.title==='Earlier engagement'));assert.ok(h.nodes().some(n=>n.props.title==='Edit engagement'));
 h.child('StageViewport').manualEngage.onCreate({kind:'waypoint',waypointId:'a'},targets[0].id,1);h.render();h.press('Edit engagement');h.press('Earlier engagement');
 assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements[0].direction,1);
 h.press('Turn right');assert.ok(h.child('StageViewport').routePlanning.route.manualEngagements[0].direction>1);
 h.press('Reassign target');h.press(require('../src/planning/model.ts').targetLabel(v.stage,targets[1].id));
 assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements[0].targetId,targets[1].id);
 h.press('Delete engagement');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,1);
 h.press('Undo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,2);h.press('Redo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,1);
 h.press('PATH');v=h.child('StageViewport');assert.equal(v.manualEngage,undefined);assert.equal(v.routePlanning.editing,true);assert.deepEqual(v.routePlanning.route.positions,r.positions);assert.deepEqual(v.routePlanning.route.connections,r.connections);assert.equal(JSON.stringify(v.stage),before);
 h.press('Save');await h.settle();assert.equal(h.saved.length,1);assert.equal(h.saved[0][3].route.manualEngagements.length,1);
});
test('ENGAGE canvas owns creation, cancels on pinch, cleans drafts and keeps geometry untouched',()=>{
 const {createDefaultStage,createObject}=require('../src/stage/defaults.ts');const document=createDefaultStage();document.stage={width:400,depth:400};document.objects=[createObject('start','start',20,300),createObject('cardboardTarget','target',200,70)];
 const r=route();r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:300,z:0},visibleTargetIds:[],engagedTargetIds:[]}];
 const created=[],directions=[],pans=[],dragging=[],selected=[];
 const props={stage:document,viewport:{zoom:1,pan:{x:0,y:0}},routeEditing:true,gridVisible:false,selectedId:null,snapping:{enabled:false},onSelect(){},setStage(){assert.fail('ENGAGE moved stage object');},onDragging:v=>dragging.push(v),onViewportChange:v=>pans.push(v),routePlanning:{route:r,selectedId:null,onSelect(){assert.fail('ENGAGE selected PATH marker');},onChange(){assert.fail('ENGAGE moved route');},onDragging(){},editing:false},manualEngage:{selectedId:null,onSelect:id=>selected.push(id),onCreate:(...args)=>created.push(args),onDirection:(...args)=>directions.push(args)}};
 const rn={View:'View',Text:'Text',Platform:{OS:'ios'},StyleSheet:{create:s=>s,absoluteFill:{}},PanResponder:{create:handlers=>({panHandlers:handlers})}};
 const h=harness('editor/StageViewport.tsx',props,{'react-native':rn});h.find(n=>n.props.testID==='stage-canvas').props.onLayout({nativeEvent:{layout:{width:400,height:400}}});h.render();
 const event=(points,changed=points[0])=>({nativeEvent:{touches:points.map(([x,y])=>({pageX:x,pageY:y})),changedTouches:changed?[{pageX:changed[0],pageY:changed[1]}]:[]}});
 const canvas=()=>h.find(n=>n.props.testID==='stage-canvas').props;
 canvas().onPanResponderGrant(event([[100,300]]));canvas().onPanResponderMove(event([[200,70]]),{dx:100,dy:-230});h.render();
 assert.equal(h.child('ManualEngagementOverlay').draft.targetId,'target');assert.equal(pans.length,0);canvas().onPanResponderRelease(event([],[200,70]));h.render();assert.equal(created.length,1);assert.equal(created[0][0].waypointId,'w');assert.equal(h.child('ManualEngagementOverlay').draft,null);
 canvas().onPanResponderGrant(event([[100,300]]));canvas().onPanResponderMove(event([[350,350]]),{dx:250,dy:50});canvas().onPanResponderRelease(event([],[350,350]));h.render();assert.equal(created.length,1);assert.equal(h.child('ManualEngagementOverlay').draft,null);
 canvas().onPanResponderGrant(event([[100,300]]));canvas().onPanResponderStart(event([[100,300],[160,300]]));canvas().onPanResponderMove(event([[90,300],[180,300]]),{dx:0,dy:0});h.render();assert.ok(pans.length);assert.equal(h.child('ManualEngagementOverlay').draft,null);canvas().onPanResponderEnd(event([[200,70]]));canvas().onPanResponderMove(event([[200,70]]),{dx:100,dy:-230});canvas().onPanResponderRelease(event([],[200,70]));h.render();assert.equal(created.length,1);
 canvas().onPanResponderGrant(event([[100,300]]));canvas().onPanResponderMove(event([[200,70]]),{dx:100,dy:-230});canvas().onPanResponderTerminate(event([[200,70]]));h.render();assert.equal(created.length,1);assert.equal(h.child('ManualEngagementOverlay').draft,null);assert.equal(dragging.at(-1),false);
 canvas().onPanResponderGrant(event([[380,380]]));canvas().onPanResponderMove(event([[370,370]]),{dx:-10,dy:-10});canvas().onPanResponderRelease(event([],[370,370]));assert.ok(pans.length>1);assert.equal(created.length,1);
});

test('manual overlay shows short arrows, selected target and temporary dotted guide only during active drag',()=>{
 const document=stage(),r=route(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);
 r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'e',targetId:target.id,anchor:{kind:'waypoint',waypointId:'w'},direction:0},{id:'travel',targetId:target.id,anchor:{kind:'section',sectionId:JSON.stringify([document.objects.find(o=>o.type==='start').id,'w']),fraction:.5},direction:1}];
 const props={stage:document,route:r,transform:{scale:1,offsetX:0,offsetY:0},selectedId:'e',draft:null};const h=harness('editor/ManualEngagementOverlay.tsx',props);
 assert.ok(h.nodes().some(n=>n.props.testID==='engagement-target-'+target.id));assert.ok(h.nodes().some(n=>n.type==='Text'&&n.props.children==='A'));assert.equal(h.nodes().filter(n=>n.type==='Text').length,1);
 assert.equal(h.nodes().filter(n=>n.props.testID==='engagement-dotted-guide').length,0);
 const arrows=h.nodes().filter(n=>typeof n.type==='function'&&n.type.name==='Arrow');assert.equal(arrows.length,2);assert.equal(arrows[0].props.selected,true);assert.equal(arrows[1].props.selected,false);
 props.draft={anchor:r.manualEngagements[0].anchor,point:r.positions[0].position,origin:{x:100,y:200},cursor:{x:200,y:100},direction:-Math.PI/4,targetId:target.id,moved:true,cancelled:false};h.render();assert.ok(h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
 props.draft={...props.draft,cancelled:true};h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
 props.draft=null;h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
});

test('REVIEW derives manual coverage, preserves canvas and annotations across modes, and highlights saved anchors',()=>{
 const r=route(),document=stage(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:150,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'e',targetId:target.id,anchor:{kind:'waypoint',waypointId:'w'},direction:0}];
 const h=harness('editor/StageBuilder.tsx',{initial:{id:'s',name:'Stage',matchId:'m',document,plan:plan(r)},targetFamily:'USPSA'});h.press('PLAN');h.press('PATH');const pan={zoom:2,pan:{x:31,y:-20}};h.child('StageViewport').onViewportChange(pan);h.render();h.press('ENGAGE');h.child('StageViewport').manualEngage.onSelect('e');h.render();h.press('REVIEW');
 let v=h.child('StageViewport');assert.equal(v.manualEngage,undefined);assert.equal(v.routePlanning.editing,false);assert.deepEqual(v.viewport,pan);assert.equal(v.manualReview.review.assignedTargets,1);assert.equal(v.manualReview.selectedEngagementId,'e');
 v.manualReview.onSelectTarget(target.id);h.render();let panel=h.child('ManualReviewPanel');assert.equal(panel.selectedTargetId,target.id);panel.onHighlight(panel.review.engagements[0]);h.render();assert.deepEqual(h.child('StageViewport').focusPosition,r.positions[0].position);
 h.child('ManualReviewPanel').onToggle();h.render();assert.equal(h.child('StageViewport').manualReview.onlyUnassigned,true);assert.equal(h.child('StageViewport').manualReview.selectedTargetId,null);
 h.press('PATH');v=h.child('StageViewport');assert.equal(v.manualReview,undefined);assert.equal(v.routePlanning.editing,true);assert.deepEqual(v.routePlanning.route,r);assert.deepEqual(v.viewport,pan);h.press('ENGAGE');assert.equal(h.child('StageViewport').manualEngage.selectedId,'e');assert.equal(h.saved.length,0);
});
test('REVIEW retains invalid loaded entries for explicit removal and restores them through document undo',()=>{
 const r=route();r.positions=[{id:'w',label:'w',position:{space:'stage',x:150,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'missing',targetId:'deleted',anchor:{kind:'waypoint',waypointId:'w'},direction:0},{id:'orphan',targetId:'deleted',anchor:{kind:'waypoint',waypointId:'gone'},direction:0}];
 const h=initial(r);h.press('PLAN');h.press('REVIEW');let panel=h.child('ManualReviewPanel');assert.equal(panel.review.invalid.length,2);assert.equal(panel.review.assignedTargets,0);panel.onRemove('missing');h.render();assert.equal(h.child('ManualReviewPanel').review.invalid.length,1);h.child('ManualReviewPanel').onUndo();h.render();assert.equal(h.child('ManualReviewPanel').review.invalid.length,2);h.child('ManualReviewPanel').onRedo();h.render();assert.equal(h.child('ManualReviewPanel').review.invalid.length,1);
});
test('REVIEW overlay distinguishes status with symbols and filters assigned highlights',()=>{
 const document=stage(),r=route(),targets=document.objects.filter(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'e',targetId:targets[0].id,anchor:{kind:'waypoint',waypointId:'w'},direction:0}];
 const review=require('../src/planning/manualRouteReview.ts').reviewManualRoute(document,r),props={review,transform:{scale:2,offsetX:25,offsetY:30},selectedId:targets[0].id,onlyUnassigned:false,onSelect(){}};const h=harness('editor/ManualReviewOverlay.tsx',props);assert.equal(h.nodes().filter(n=>n.props.testID?.startsWith('review-target-')).length,review.totalTargets);assert.ok(h.nodes().some(n=>n.type==='Text'&&n.props.children==='!'));assert.ok(h.nodes().some(n=>n.props.accessibilityState?.selected));
 props.onlyUnassigned=true;h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='review-target-'+targets[0].id));assert.equal(h.nodes().filter(n=>n.props.testID?.startsWith('review-target-')).length,review.unassignedTargets);
});
test('REVIEW panel exposes sources and requires confirmation before removing invalid saved data',()=>{
 const document=stage(),r=route(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'good',targetId:target.id,anchor:{kind:'waypoint',waypointId:'w'},direction:0},{id:'bad',targetId:'missing',anchor:{kind:'waypoint',waypointId:'gone'},direction:0}];const highlighted=[],removed=[];
 const props={review:require('../src/planning/manualRouteReview.ts').reviewManualRoute(document,r),stage:document,selectedTargetId:target.id,selectedEngagementId:null,onlyUnassigned:false,onToggle(){},onSelectTarget(){},onHighlight:e=>highlighted.push(e),onRemove:id=>removed.push(id),onUndo(){},onRedo(){},canUndo:true,canRedo:false,disabled:false};const h=harness('editor/ManualReviewPanel.tsx',props);h.press('Target assignments');h.press('Waypoint 1 / A');assert.equal(highlighted[0].engagement.id,'good');assert.ok(!h.nodes().some(n=>n.type==='EditorSheet'));
 h.press('Review summary');assert.ok(h.nodes().some(n=>n.props.label==='Manual route distance'));h.child('EditorSheet').close();h.render();h.press('Invalid references (1)');h.press('Remove invalid entry bad');assert.deepEqual(removed,[]);h.press('Cancel removal');assert.deepEqual(removed,[]);h.press('Remove invalid entry bad');h.press('Confirm removal');assert.deepEqual(removed,['bad']);
});
test('REVIEW canvas taps inspect targets while drags and pinch keep navigation and never edit PATH or ENGAGE',()=>{
 const {createDefaultStage,createObject}=require('../src/stage/defaults.ts');const document=createDefaultStage();document.stage={width:400,depth:400};document.objects=[createObject('start','start',20,300),createObject('cardboardTarget','target',200,70)];const r=route(),selected=[],pans=[];
 const props={stage:document,viewport:{zoom:1,pan:{x:0,y:0}},routeEditing:true,gridVisible:false,selectedId:null,snapping:{enabled:false},onSelect(){assert.fail('object selected');},setStage(){assert.fail('object moved');},onDragging(){},onViewportChange:v=>pans.push(v),routePlanning:{route:r,selectedId:null,onSelect(){assert.fail('waypoint selected');},onChange(){assert.fail('route changed');},onDragging(){},editing:false},manualReview:{review:require('../src/planning/manualRouteReview.ts').reviewManualRoute(document,r),selectedTargetId:null,selectedEngagementId:null,onlyUnassigned:false,onSelectTarget:id=>selected.push(id)}};
 const rn={View:'View',Text:'Text',Platform:{OS:'ios'},StyleSheet:{create:s=>s,absoluteFill:{}},PanResponder:{create:handlers=>({panHandlers:handlers})}};const h=harness('editor/StageViewport.tsx',props,{'react-native':rn});h.find(n=>n.props.testID==='stage-canvas').props.onLayout({nativeEvent:{layout:{width:400,height:400}}});h.render();const canvas=()=>h.find(n=>n.props.testID==='stage-canvas').props,event=(points,changed=points[0])=>({nativeEvent:{touches:points.map(([x,y])=>({pageX:x,pageY:y})),changedTouches:changed?[{pageX:changed[0],pageY:changed[1]}]:[]}});
 canvas().onPanResponderGrant(event([[200,70]]));canvas().onPanResponderRelease(event([],[200,70]));assert.deepEqual(selected,['target']);canvas().onPanResponderGrant(event([[200,70]]));canvas().onPanResponderMove(event([[240,80]]),{dx:40,dy:10});canvas().onPanResponderRelease(event([],[240,80]));assert.equal(selected.length,1);assert.ok(pans.length);
 canvas().onPanResponderGrant(event([[180,70],[220,70]]));canvas().onPanResponderMove(event([[160,70],[240,70]]),{dx:0,dy:0});canvas().onPanResponderRelease(event([],[200,70]));assert.equal(selected.length,1);assert.ok(pans.at(-1).zoom>1);
 props.readOnly=true;h.render();canvas().onPanResponderGrant(event([[200,70]]));canvas().onPanResponderRelease(event([],[200,70]));assert.equal(selected.length,1);
});

test('PATH marker ignores tap jitter, latches pinch interruption, and exposes bounded movement actions',()=>{
 const moved=[],dragging=[];const props={editing:true,bend:true,position:{id:'b',label:'Bend',position:{space:'stage',x:100,y:100,z:0}},index:0,transform:{scale:2,offsetX:0,offsetY:0},selected:false,select(){},move:p=>moved.push(p),onDragging:v=>dragging.push(v)};
 const rn={View:'View',Text:'Text',PanResponder:{create:handlers=>({panHandlers:handlers})}};
 const h=harness('editor/RouteOverlay.tsx',props,{'react-native':rn},'Marker'), marker=()=>h.find(n=>n.props.onPanResponderGrant).props, event=n=>({nativeEvent:{touches:Array(n).fill({})}});
 marker().onPanResponderGrant();marker().onPanResponderMove(event(1),{dx:3,dy:2});assert.equal(moved.length,0);assert.equal(dragging.length,0);
 marker().onPanResponderMove(event(1),{dx:12,dy:0});assert.equal(moved[0].x,106);assert.equal(dragging[0],true);
 marker().onPanResponderMove(event(2),{dx:20,dy:0});marker().onPanResponderMove(event(1),{dx:30,dy:0});assert.equal(moved.length,1);
 marker().onPanResponderTerminate();assert.equal(dragging.at(-1),false);
 marker().onAccessibilityAction({nativeEvent:{actionName:'left'}});assert.equal(moved.at(-1).x,99);
 props.editing=false;h.render();marker().onAccessibilityAction({nativeEvent:{actionName:'right'}});assert.equal(moved.length,2);
});

test('ENGAGE button creation on rounded sections survives dismissal, mode changes, undo, redo and Save',async()=>{
 const r=route();r.positions=['a','b'].map((id,i)=>({id,label:id,position:{space:'stage',x:100+i*100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}));r.connections=[{fromId:'a',toId:'b',style:'ROUNDED',bends:[{id:'bend',position:{space:'stage',x:150,y:150,z:0}}]}];
 const h=initial(r);await h.settle();h.press('PLAN');h.press('ENGAGE');h.press('ENGAGEMENTS');h.press('Create engagement without dragging');h.press('Anchor: Route section 1 midpoint');
 const create=h.nodes().find(n=>n.props.title?.startsWith('Create engagement to '));h.press(create.props.title);h.child('EditorSheet').close();h.render();
 const created=h.child('StageViewport').routePlanning.route;assert.equal(created.manualEngagements.length,1);assert.equal(created.manualEngagements[0].anchor.fraction,.5);assert.deepEqual(created.connections,r.connections);
 h.press('Undo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements?.length??0,0);h.press('Redo');h.press('REVIEW');h.press('PATH');assert.deepEqual(h.child('StageViewport').routePlanning.route,created);h.press('Save');await h.settle();assert.deepEqual(h.saved[0][3].route,created);
});

test('document import previews selected PDF pages, invalidates stale alignment/scale, and commits only accepted overlays',async()=>{
 const asset={path:'diagram-imports/source.pdf',name:'Printed briefing.pdf',mime:'application/pdf',size:100},image={asset:{...asset,path:'diagram-imports/page.png',mime:'image/png'},width:1000,height:500,page:1,pageCount:4},stored=[],applied=[],pages=[],alignments=[],opened=[];
 const props={visible:true,stageId:'s',stage:stage(),family:'USPSA',close(){},apply:d=>applied.push(d)};
 const h=harness('diagramImport/DiagramImportScreen.tsx',props,{repo:{loadDiagramImports:async()=>[],loadDiagramImportsReport:async()=>({drafts:[],damagedIds:[]}),saveDiagramImport:async(id,d)=>stored.push(JSON.parse(JSON.stringify(d)))},'./assets':{pickDocument:async()=>({asset,kind:'pdf'}),photographPaper:async()=>null,assetUri:async()=>'',openOriginal:async asset=>opened.push(asset)},'./preparation':{preparePage:async(source,page)=>{pages.push(page);return {page:{...image,page}};},alignPage:async(page,alignment)=>{alignments.push(alignment);return page;}}});
 await h.settle();h.press('Import PDF or image');await h.settle();assert.equal(stored[0].source.path,asset.path);assert.equal(stored[0].page,undefined);assert.equal(applied.length,0);h.press('Open or download original document');await h.settle();assert.deepEqual(opened,[asset]);
 h.find(n=>n.props.label?.startsWith('PDF page')).props.change(3);h.render();h.press('Render selected page');await h.settle();assert.deepEqual(pages,[1,3]);h.press('Align page');await h.settle();h.press('Use layout region');await h.settle();assert.equal(alignments.length,2);
 h.press('Top-down plan');h.press('Confirm approximate scale');h.press('Add missing element');h.find(n=>n.props.label==='Element X percent').props.change(NaN);h.render();assert.ok(!h.nodes().some(n=>n.type?.name==='ProposalOverlay'));h.find(n=>n.props.label==='Element X percent').props.change(50);h.render();assert.ok(h.nodes().some(n=>n.type?.name==='ProposalOverlay'));assert.ok(h.nodes().find(n=>n.props.title==='Add accepted elements to editor').props.disabled);h.press('Accept selected element');h.press('Add accepted elements to editor');await h.settle();assert.equal(applied.length,1);assert.equal(applied[0].objects.length,props.stage.objects.length+1);assert.deepEqual(applied[0].objects.slice(0,-1),props.stage.objects);
 h.find(n=>n.props.label==='Known real distance').props.change(240);h.render();assert.ok(h.nodes().find(n=>n.props.title==='Add accepted elements to editor').props.disabled);h.press('Confirm approximate scale');h.press('1. Page and corners');h.press('Rotate page clockwise / 0 degrees');assert.ok(h.nodes().find(n=>n.props.title==='3. Reconstruction preview').props.disabled);h.press('Close import');h.press('Close without saving preview changes');assert.ok(!h.nodes().some(n=>n.props.title==='Align page'));assert.equal(stored.at(-1).proposals.length,1);
});

test('stage diagram acceptance is undoable, additive and preserves manual route/engagement bytes until explicit Save',async()=>{
 const r=route();r.positions=[{id:'waypoint',label:'Keep',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'invalid-preserved',targetId:'missing-target',anchor:{kind:'waypoint',waypointId:'missing-waypoint'},direction:1}];const h=initial(r);await h.settle();h.press('Stage tools');h.press('Import stage diagram');
 const screen=h.child('DiagramImportScreen');assert.equal(screen.visible,true);const before=JSON.stringify(h.child('StageViewport').routePlanning.route),added=require('../src/stage/defaults.ts').createObject('steelPlate','import-test',200,200);
 screen.apply({...screen.stage,objects:[...screen.stage.objects,added]});h.render();assert.equal(JSON.stringify(h.child('StageViewport').routePlanning.route),before);assert.equal(h.saved.length,0);h.child('DiagramImportScreen').close();h.render();h.press('Stage tools');h.press('UNDO EDIT');assert.equal(h.child('StageViewport').stage.objects.some(o=>o.id===added.id),false);h.press('REDO EDIT');assert.equal(h.child('StageViewport').stage.objects.some(o=>o.id===added.id),true);h.press('Save');await h.settle();assert.equal(JSON.stringify(h.saved[0][3].route),before);
});

test('automatic geometry preview supports classification, overlay edits, reruns, batch acceptance and calibrated additive commit',async()=>{
 const {render}=require('./fixtures/diagram-recognition/render.cjs'),raster=render(require('./fixtures/diagram-recognition/clean-basic.json')),asset={path:'diagram-imports/clean.png',name:'Synthetic.png',mime:'image/png',size:100},page={asset,width:256,height:256,page:1,pageCount:1};
 const draft={version:1,id:'drawing',source:asset,sourceKind:'image',page,aligned:page,alignment:{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],rotation:0,crop:{x:0,y:0,width:1,height:1}},projection:'top-down',origin:{x:20,y:20},proposals:[]},saved=[],applied=[];
 const h=harness('diagramImport/DiagramImportScreen.tsx',{visible:true,stageId:'s',stage:stage(),family:'USPSA',close(){},apply:d=>applied.push(d)},{repo:{loadDiagramImports:async()=>[draft],loadDiagramImportsReport:async()=>({drafts:[draft],damagedIds:[]}),saveDiagramImport:async(id,d)=>saved.push(d)},'./assets':{},'./preparation':{},'./rasterReader':{readRaster:async()=>raster}});await h.settle();h.press('Reference: Synthetic.png');
 async function detect(){h.press('EXPERIMENTAL: Detect clean diagram geometry');for(let i=0;i<100&&h.nodes().some(n=>n.props.title==='Cancel recognition');i++){await new Promise(resolve=>setTimeout(resolve,10));h.render();}assert.ok(!h.nodes().some(n=>n.props.title==='Cancel recognition'));}
 await detect();assert.equal(h.nodes().filter(n=>n.props.title?.startsWith('Overlay ')).length,3);assert.ok(h.nodes().find(n=>n.props.title==='Add accepted elements to editor').props.disabled);
 h.press(h.nodes().find(n=>n.props.title?.startsWith('Overlay 2 /')).props.title);assert.ok(h.nodes().find(n=>n.props.title==='Accept selected element').props.disabled);h.press('Type: Steel plate');h.find(n=>n.props.label==='Overlay width percent (not physical target size)').props.change(20);h.render();h.find(n=>n.props.label==='Element rotation degrees').props.change(30);h.render();
 h.press('Add missing element');await detect();assert.equal(h.nodes().filter(n=>n.props.title?.startsWith('Overlay ')).length,4);assert.ok(h.nodes().some(n=>n.props.title?.startsWith('Overlay 2 / Steel plate')));
 h.press('Batch overlay 1 / Not selected');h.press('Batch overlay 2 / Not selected');h.press('Accept selected proposals');h.press('Confirm approximate scale');h.press('Add accepted elements to editor');await h.settle();assert.equal(applied.length,1);assert.equal(applied[0].objects.length,stage().objects.length+2);assert.equal(saved[0].proposals[1].recognition.scaleStatus,'uncalibrated');assert.equal(saved[0].proposals[1].extent.width,.2);assert.equal(applied[0].objects.at(-1).geometry.faceWidth,12);
});
test('recognition cancellation and perspective guards leave existing preview decisions untouched',async()=>{
 const asset={path:'diagram-imports/cancel.png',name:'Cancel.png',mime:'image/png',size:10},page={asset,width:256,height:256,page:1,pageCount:1},draft={version:1,id:'cancel',source:asset,sourceKind:'image',aligned:page,alignment:{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],rotation:0,crop:{x:0,y:0,width:1,height:1}},projection:'perspective',origin:{x:0,y:0},proposals:[]};let aborted=false;
 const h=harness('diagramImport/DiagramImportScreen.tsx',{visible:true,stageId:'s',stage:stage(),family:'USPSA',close(){},apply(){assert.fail('applied');}},{repo:{loadDiagramImports:async()=>[draft],loadDiagramImportsReport:async()=>({drafts:[draft],damagedIds:[]})},'./assets':{},'./preparation':{},'./rasterReader':{readRaster:async(page,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('Recognition cancelled.'));}))}});await h.settle();h.press('Reference: Cancel.png');assert.ok(h.nodes().find(n=>n.props.title==='EXPERIMENTAL: Detect clean diagram geometry').props.disabled);h.press('Top-down plan');h.press('Add missing element');const start=h.find(n=>n.props.title==='EXPERIMENTAL: Detect clean diagram geometry').props.onPress;start();start();h.render();h.press('Cancel recognition');await h.settle();assert.ok(aborted);assert.equal(h.nodes().filter(n=>n.props.title?.startsWith('Overlay ')).length,1);assert.ok(!h.nodes().some(n=>n.props.title==='Cancel recognition'));
});

for(const failure of ['Image exceeds decoder limits.', 'Unsupported PDF raster.', 'Recognition interrupted.'])test('experimental detection recovers without losing manual reconstruction: '+failure,async()=>{
 const asset={path:'diagram-imports/recover.png',name:'Recover.png',mime:'image/png',size:10},page={asset,width:256,height:256,page:1,pageCount:1};
 const draft={version:1,id:'recover',source:asset,sourceKind:'image',aligned:page,alignment:{corners:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],rotation:0,crop:{x:0,y:0,width:1,height:1}},projection:'top-down',origin:{x:0,y:0},proposals:[]};
 let writes=0;const before=JSON.stringify(draft),h=harness('diagramImport/DiagramImportScreen.tsx',{visible:true,stageId:'s',stage:stage(),family:'USPSA',close(){},apply(){assert.fail('Detection must not apply geometry');}},{repo:{loadDiagramImports:async()=>[draft],loadDiagramImportsReport:async()=>({drafts:[draft],damagedIds:[]}),saveDiagramImport:async()=>{writes++;}},'./assets':{},'./preparation':{},'./rasterReader':{readRaster:async()=>{throw Error(failure);}}});
 await h.settle();h.press('Reference: Recover.png');h.press('Add missing element');h.press('EXPERIMENTAL: Detect clean diagram geometry');await h.settle();
 assert.equal(writes,0);assert.ok(h.nodes().some(n=>n.type==='Notice'&&String(n.props.children).includes('Manual reconstruction remains available')));assert.equal(JSON.stringify(draft),before);assert.equal(h.nodes().filter(n=>n.props.title?.startsWith('Overlay ')).length,1);assert.ok(!h.find(n=>n.props.title==='Add missing element').props.disabled);h.press('Add missing element');assert.equal(h.nodes().filter(n=>n.props.title?.startsWith('Overlay ')).length,2);assert.ok(!h.nodes().some(n=>n.props.title==='Cancel recognition'));
});

test('PLAN ROUTE (V2) plans legal positions, previews them and adopts an editable route without saving', async () => {
  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { createPlan } = require('../src/planning/model.ts');
  const { createRoute, isStageRoute } = require('../src/planning/route.ts');
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const document = createDefaultStage(undefined, { size: { width: 600, depth: 480 } }), savedPlan = createPlan();
  document.objects = [createObject('start', 'start', 100, 440), createObject('cardboardTarget', 'T1', 300, 60)];
  savedPlan.route = createRoute('editable');
  savedPlan.route.engagementRules = { ...defaultEngagementRules(document), firingAreas: [{ id: 'A', vertices: [{ x: 200, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 420 }, { x: 200, y: 420 }] }] };
  let adopted, preview, configured;
  const h = harness('planning/v2/RoutePlannerV2Panel.tsx', { stage: document, plan: savedPlan, preview: null, onClose() {}, onUse: v => adopted = v, onPreview: v => preview = v, onConfigure: s => configured = s });
  h.press('ROUTE SETTINGS'); assert.equal(configured, 'rules');
  h.press('PLAN ROUTE'); await new Promise(resolve => setTimeout(resolve, 200)); h.render();
  assert.ok(h.nodes().some(n => n.props.children === 'ALL TARGETS PLANNED'));
  assert.ok(h.nodes().some(n => typeof n.props.children === 'string' && n.props.children.startsWith('Not checked:')), 'limits are always shown');
  h.press('VIEW ON STAGE'); assert.equal(preview.route.positions.length, 1); assert.equal(preview.routeStyle, 'GEOMETRY');
  h.press('USE ROUTE'); assert.ok(isStageRoute(adopted.route)); assert.deepEqual(adopted.route.positions[0].engagedTargetIds, ['T1']);
  assert.equal(h.saved.length, 0); assert.equal(savedPlan.route.positions.length, 0, 'the saved plan is not mutated');
});

test('PLAN ROUTE (V2) explains missing firing areas instead of planning', async () => {
  const { createDefaultStage } = require('../src/stage/defaults.ts');
  const { createPlan } = require('../src/planning/model.ts');
  const { createRoute } = require('../src/planning/route.ts');
  const plan = createPlan(); plan.route = createRoute('r');
  const h = harness('planning/v2/RoutePlannerV2Panel.tsx', { stage: createDefaultStage('USPSA'), plan, preview: null, onClose() {}, onUse() { assert.fail('nothing to use'); }, onPreview() {}, onConfigure() {} });
  assert.ok(h.nodes().some(n => typeof n.props.children === 'string' && /Draw firing areas first/.test(n.props.children)));
  h.press('PLAN ROUTE'); await new Promise(resolve => setTimeout(resolve, 120)); h.render();
  assert.ok(h.nodes().some(n => n.props.children === 'THE STAGE NEEDS SETUP FIRST'));
});

test('3D and eye-level views share the document: select, move, raise and rotate in 3D, then back to the plan', () => {
  const h = initial();
  h.press('3D view');
  let view = h.child('Stage3DView');
  assert.equal(view.editable, true);
  assert.ok(!h.nodes().some(n => n.type === 'StageViewport'), 'the 3D view replaces the plan canvas');
  const wall = view.stage.objects.find(o => o.type === 'wall'), target = view.stage.objects.find(o => o.type === 'cardboardTarget');
  view.onSelect(wall.id); h.render();
  h.press('Raise the wall'); h.press('Rotate right');
  view = h.child('Stage3DView');
  const raised = view.stage.objects.find(o => o.id === wall.id);
  assert.equal(raised.geometry.height, wall.geometry.height + 6);
  assert.equal(raised.rotation, (wall.rotation + 15) % 360);
  // Dragging on the ground moves it through the editor's snapping, as one undo step.
  const before = view.stage, to = { space: 'stage', x: wall.position.x + 37, y: wall.position.y + 5, z: wall.position.z };
  const { resolveMovement, DEFAULT_SNAPPING } = require('../src/stage/snapping.ts');
  const expected = resolveMovement(before, wall.id, to, DEFAULT_SNAPPING).position;
  view.onMoveStart(); view.onMove(wall.id, to); view.onMoveEnd(); h.render();
  const moved = h.child('Stage3DView').stage.objects.find(o => o.id === wall.id).position;
  assert.deepEqual([moved.x, moved.y], [expected.x, expected.y], 'the same snapping as a 2D drag');
  assert.notEqual(moved.x, raised.position.x);
  h.press('Stage tools'); h.press('UNDO EDIT');
  assert.deepEqual(h.child('Stage3DView').stage.objects.find(o => o.id === wall.id).position, raised.position, 'one undo step');
  h.child('Stage3DView').onSelect(target.id); h.render(); h.press('Raise the target');
  assert.equal(h.child('Stage3DView').stage.objects.find(o => o.id === target.id).position.z, target.position.z + 3);
  h.press('Eye-level view');
  assert.equal(h.child('EyeLevelView').ruleset, 'USPSA', 'visibility follows the match ruleset');
  assert.ok(!h.nodes().some(n => n.props?.title === 'SELECT'), 'the bottom bar steps aside for the walk-through');
  h.child('EyeLevelView').onExit(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
  // Route tools are plan-only, however they are opened (PATH, ENGAGE, REVIEW, AREAS).
  h.press('3D view'); h.press('PLAN'); h.press('PATH');
  assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
  h.press('DONE'); h.press('3D view'); assert.ok(h.nodes().some(n => n.type === 'Stage3DView'));
  for (const tool of ['ENGAGE', 'REVIEW', 'AREAS']) {
    h.press(tool); h.render();
    assert.ok(h.nodes().some(n => n.type === 'StageViewport'), tool + ' returns to the plan');
    h.press(tool); h.press('3D view'); assert.ok(h.nodes().some(n => n.type === 'Stage3DView'));
  }
  // WALK is the eye-level walk-through of the plan; PLAN comes back to the 2D plan.
  h.press('WALK'); assert.ok(h.child('EyeLevelView')); assert.ok(!h.nodes().some(n => n.props?.title === 'PATH'), 'route tools step aside while walking');
  h.press('PLAN'); assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
});

test('press and hold on the bay opens the radial menu there; a choice places it at that spot', () => {
  const h = initial();
  const before = h.child('StageViewport').stage.objects.length;
  h.child('StageViewport').onLongPress({ space: 'stage', x: 200, y: 160, z: 0 }, { x: 120, y: 90 }); h.render();
  const menu = h.child('RadialAddMenu');
  assert.deepEqual(menu.at, { x: 120, y: 90 }); assert.equal(menu.targetFamily, 'USPSA');
  menu.onChoose({ kind: 'target', presetId: 'uspsa-popper-42-ss-v1', noShoot: false }); h.render();
  const stage = h.child('StageViewport').stage, placed = stage.objects[stage.objects.length - 1 - stage.objects.filter(o => o.type === 'wall' || o.type === 'faultLine').length];
  assert.equal(stage.objects.length, before + 1);
  assert.equal(placed.type, 'steelPopper'); assert.equal(placed.position.x, 200); assert.equal(placed.position.y, 160);
  assert.equal(h.child('StageViewport').selectedId, placed.id, 'the new target is selected, ready to drag or rotate');
  assert.equal(h.child('StageViewport').tool, 'select');
  // A wall from a long press starts at the finger; a no-shoot keeps its role; the route has no add menu.
  h.child('StageViewport').onLongPress({ space: 'stage', x: 60, y: 60, z: 0 }, { x: 40, y: 40 }); h.render();
  h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'wall' }); h.render();
  assert.equal(h.child('StageViewport').tool, 'wall'); assert.ok(h.child('StageViewport').draft, 'segment started');
  h.press('PLAN');
  assert.equal(h.child('StageViewport').onLongPress, undefined);
});

test('AREAS: draw a firing area on the plan by tapping corners, adjust a corner, delete and undo, without saving', () => {
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage', matchId: 'm', document: stage(), plan: plan() }, targetFamily: 'PCSL' });
  h.press('PLAN'); h.press('AREAS');
  let v = h.child('StageViewport');
  assert.equal(typeof v.onAreaPoint, 'function'); assert.equal(v.firingAreas, undefined, 'nothing drawn yet');
  h.press('NEW AREA');
  for (const [x, y] of [[100.4, 200], [300, 200.2], [300, 320], [100, 320]]) { h.child('StageViewport').onAreaPoint({ space: 'stage', x, y, z: 0 }); h.render(); }
  v = h.child('StageViewport');
  assert.deepEqual(v.firingAreas.draft.map(p => [p.x, p.y]), [[100, 200], [300, 200], [300, 320], [100, 320]], 'corners land on whole inches');
  h.press('FINISH AREA');
  v = h.child('StageViewport');
  const rules = v.routePlanning.route.engagementRules;
  assert.equal(rules.firingAreas.length, 1); assert.equal(rules.ruleset, 'PCSL', 'new route rules follow the match ruleset');
  assert.equal(v.firingAreas.selectedId, rules.firingAreas[0].id); assert.equal(v.firingAreas.editing, true);
  // Drag a corner (one undo step); a move that would cross the edges is refused.
  v.firingAreas.onDragging(true); v.firingAreas.onMoveCorner(rules.firingAreas[0].id, 2, { x: 340.6, y: 360 }); v.firingAreas.onDragging(false); h.render();
  assert.deepEqual(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas[0].vertices[2], { x: 341, y: 360 });
  h.child('StageViewport').firingAreas.onMoveCorner(rules.firingAreas[0].id, 2, { x: 50, y: 260 }); h.render();
  assert.deepEqual(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas[0].vertices[2], { x: 341, y: 360 }, 'bow-tie refused');
  // Tapping outside every area clears the selection; tapping inside selects it.
  h.child('StageViewport').onAreaPoint({ space: 'stage', x: 20, y: 20, z: 0 }); h.render();
  assert.equal(h.child('StageViewport').firingAreas.selectedId, null);
  h.child('StageViewport').onAreaPoint({ space: 'stage', x: 200, y: 260, z: 0 }); h.render();
  assert.equal(h.child('StageViewport').firingAreas.selectedId, rules.firingAreas[0].id);
  h.press('DELETE AREA'); assert.equal(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas.length, 0);
  h.press('UNDO'); assert.equal(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas.length, 1, 'undo brings it back');
  // Too few corners cannot finish; the whole bay is one tap.
  h.press('NEW AREA'); h.child('StageViewport').onAreaPoint({ space: 'stage', x: 10, y: 10, z: 0 }); h.render();
  assert.ok(h.nodes().find(n => n.props?.title === 'FINISH AREA').props.disabled);
  h.press('Cancel the new area'); h.press('WHOLE BAY');
  assert.equal(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas.length, 2);
  h.press('DONE'); assert.equal(h.child('StageViewport').onAreaPoint, undefined);
  assert.equal(h.saved.length, 0, 'drawing areas never saves on its own');
});

test('the planner opens area drawing directly when there are no firing areas', () => {
  const h = initial(); h.press('PLAN'); h.press('AUTO-PLAN');
  h.child('RoutePlannerV2Panel').onConfigure('areas'); h.render();
  const v = h.child('StageViewport');
  assert.deepEqual(v.firingAreas.draft, [], 'a new area is ready for its first corner'); assert.equal(typeof v.onAreaPoint, 'function');
  assert.ok(!h.nodes().some(n => n.type === 'RoutePlannerV2Panel'));
});

test('LAYERS: a selected paper target opens the layers panel; a layer gets its own controls and follows undo', () => {
  const h = initial();
  const target = h.child('StageViewport').stage.objects.find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(target.id); h.render();
  h.press('LAYERS');
  const panel = h.child('LayerPanel'); assert.equal(panel.selectedId, target.id);
  const L = require('../src/stage/targetLayers.ts');
  panel.setStage(L.addLayer(panel.stage, target.id, 'noShoot', 'layer-1').stage); panel.onSelect('layer-1'); h.render();
  const layer = h.child('StageViewport').stage.objects.find(o => o.id === 'layer-1');
  assert.equal(layer.attachment.parentId, target.id); assert.equal(h.child('LayerPanel').selectedId, 'layer-1');
  h.find(n => n.type === 'EditorSheet' && n.props.title === 'Layers').props.close(); h.render();
  for (const title of ['EDIT', 'ROTATE', 'DUPLICATE']) assert.ok(!h.nodes().some(n => n.props?.title === title), title + ' is not offered for a layer');
  h.press('BASE TARGET'); assert.equal(h.child('StageViewport').selectedId, target.id);
  h.press('Stage tools'); h.press('UNDO EDIT');
  assert.ok(!h.child('StageViewport').stage.objects.some(o => o.id === 'layer-1'), 'one undo removes the layer');
  assert.equal(h.saved.length, 0);
});

test('layers panel: add a hostage and paint, slide and turn them, front/behind, remove', () => {
  const L = require('../src/stage/targetLayers.ts');
  const { placeTarget } = require('../src/stage/targetPlacement.ts');
  const base = { ...stage(), objects: [] };
  const props = { stage: placeTarget(base, 'uspsa-metric-chl-v1', 'T', { space: 'stage', x: 200, y: 100, z: 0 }).stage, selectedId: 'T', selections: [] };
  props.setStage = next => { props.stage = next; }; props.onSelect = id => { props.selections.push(id); props.selectedId = id; };
  const h = harness('editor/LayerPanel.tsx', props, { 'expo-image': { Image: 'Image' } });
  assert.ok(h.nodes().some(n => n.props?.label === 'Cardboard 1 open scoring area' && n.props.value === '100%'));
  h.press('HEAD ONLY'); h.render();
  assert.equal(props.stage.objects[0].hardCover[0].preset, 'headOnly');
  h.press('Move the paint edge down'); h.render();
  const edge = props.stage.objects[0].hardCover[0];
  assert.ok(edge.at.y < L.faceLandmarks(18.12, 29.93).neck, 'the edge moved down');
  h.press('Turn the paint edge right'); assert.equal(props.stage.objects[0].hardCover[0].angle, 5);
  h.press('REMOVE PAINT'); assert.equal(props.stage.objects[0].hardCover, undefined);
  h.press('NO-SHOOT (HOSTAGE)'); h.render();
  const id = props.selections.at(-1), layer = () => props.stage.objects.find(o => o.id === id);
  assert.equal(layer().type, 'noShootTarget'); assert.equal(props.selectedId, id);
  const before = layer().attachment.offset.y;
  h.press('Slide up'); h.render(); assert.ok(layer().attachment.offset.y > before);
  h.press('Rotate right'); assert.equal(layer().attachment.roll, 5);
  h.child('Segmented').onChange('BEHIND'); h.render(); assert.equal(layer().attachment.front, false);
  h.press('REMOVE LAYER'); assert.ok(!props.stage.objects.some(o => o.id === id)); assert.equal(props.selectedId, 'T');
});

test('AREAS: FROM FAULT LINES drafts the shooting area once the stage has a fault line', () => {
  const h = initial(); h.press('PLAN'); h.press('AREAS');
  assert.ok(h.nodes().find(n => n.props?.title === 'FROM FAULT LINES').props.disabled, 'no fault lines yet');
  const { createObject } = require('../src/stage/defaults.ts');
  const v = h.child('StageViewport'), w = v.stage.stage.width;
  v.setStage(s => ({ ...s, objects: [...s.objects, { ...createObject('faultLine', 'F1', w / 2, 200), endpoints: { start: { space: 'stage', x: 40, y: 200, z: 0 }, end: { space: 'stage', x: w - 40, y: 200, z: 0 } } }] })); h.render();
  h.press('FROM FAULT LINES');
  const areas = h.child('StageViewport').routePlanning.route.engagementRules.firingAreas;
  assert.equal(areas.length, 1); assert.equal(h.child('StageViewport').firingAreas.selectedId, areas[0].id);
  assert.ok(h.nodes().some(n => typeof n.props?.children === 'string' && /Drafted from the fault lines/.test(n.props.children)));
  assert.ok(areas[0].vertices.every(p => p.y >= 0), 'inside the bay');
});

test('review 3: dragging a layer in 3D moves its target by the drag, keeping the target\'s height', () => {
  const h = initial(), L = require('../src/stage/targetLayers.ts');
  const target = h.child('StageViewport').stage.objects.find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(target.id); h.render(); h.press('LAYERS');
  h.child('LayerPanel').setStage(L.addLayer(h.child('LayerPanel').stage, target.id, 'noShoot', 'layer-1').stage); h.render();
  h.find(n => n.type === 'EditorSheet' && n.props.title === 'Layers').props.close(); h.render();
  h.press('3D view');
  const before = h.child('Stage3DView').stage.objects, parent = before.find(o => o.id === target.id), layer = before.find(o => o.id === 'layer-1');
  h.child('Stage3DView').onMove('layer-1', { ...layer.position, x: layer.position.x + 12, y: layer.position.y - 6 }); h.render();
  const after = h.child('Stage3DView').stage.objects.find(o => o.id === target.id);
  // Grid snapping (6 in by default) may round the result; the old bug moved it ~9 in sideways and ~4.5 in down.
  assert.ok(Math.abs(after.position.x - (parent.position.x + 12)) <= 3 && Math.abs(after.position.y - (parent.position.y - 6)) <= 3, `moved by the drag: ${after.position.x - parent.position.x}, ${after.position.y - parent.position.y}`);
  assert.equal(after.position.z, parent.position.z, 'height unchanged');
});

test('Drill library editor: pick a drill and options, paste timer times, count hits, save with a par', async () => {
  let saved, savedPar;
  const props = { visible: true, context: 'LIVE_FIRE', powerFactor: 'major', pars: { 'sprint|direction=back|move=10': 3.5 }, onClose() {}, onSave: async (r, par) => { saved = r; savedPar = par; } };
  const h = harness('training/LibraryRunEditor.tsx', props);
  assert.equal(h.child('EditorSheet').title, 'DRILL LIBRARY');
  for (const name of ['Bill Drill', 'Distance ladder', 'Sprint', 'Shuffle', 'El Presidente']) assert.ok(h.nodes().some(n => n.props.title === name), name);
  h.press('Sprint');
  assert.equal(h.child('EditorSheet').title, 'Sprint');
  h.find(n => n.type === 'Segmented' && n.props.options.includes('SIDEWAYS')).props.onChange('BACK'); h.render();
  const par = () => h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'PAR TIME (SECONDS, BLANK = NONE)');
  assert.equal(par().props.value, '3.5', 'the saved par for this variant');
  h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'SHOT TIMES FROM THE TIMER (4)').props.onChangeText('1.42 1.68 3.40 3.62'); h.render();
  const rows = () => h.nodes().filter(n => n.type === 'DataRow');
  assert.equal(rows().find(n => n.props.label === 'Shot 3 · Move').props.value, '1.72 s');
  // Zone counters are a local component: drive them through their props.
  const counter = zone => h.find(n => n.type?.name === 'Counter' && n.props.label === zone);
  counter('A').props.onChange(3); h.render(); counter('C').props.onChange(1); h.render();
  assert.equal(counter('A').props.value, 3);
  assert.equal(rows().find(n => n.props.label === 'USPSA major points').props.value, '19 of 20 (95%)');
  assert.equal(rows().find(n => n.props.label === 'Against par').props.value, '0.12 s over');
  par().props.onChangeText('3.4'); h.render();
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saved.drillId, 'sprint'); assert.deepEqual(saved.choices, { move: '10', direction: 'back' });
  assert.deepEqual(saved.shotTimes, [1.42, 1.68, 3.4, 3.62]); assert.equal(saved.totalTime, 3.62);
  assert.deepEqual(saved.zones, { A: 3, C: 1 }); assert.equal(saved.powerFactor, 'major'); assert.equal(savedPar, 3.4);
  assert.equal(require('../src/training/drillLibrary.ts').libraryRunProblem(saved), null);
});

test('Drill library editor: wrong shot count is explained; dry fire counts no hits; total-only runs', async () => {
  let saved;
  const h = harness('training/LibraryRunEditor.tsx', { visible: true, context: 'DRY_FIRE', powerFactor: 'minor', pars: {}, onClose() {}, onSave: async r => { saved = r; } });
  h.press('Bill Drill');
  assert.ok(h.nodes().some(n => n.props.children === 'Dry fire: hits are not counted. Times count toward your dry-fire numbers only.'));
  assert.ok(!h.nodes().some(n => n.type?.name === 'Counter'));
  h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText('1.3 1.5 1.7'); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.children === 'Bill Drill has 6 shots; 3 entered.'));
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saved, undefined); assert.ok(h.nodes().some(n => n.type === 'Notice' && /6 shots; 3 times entered/.test(n.props.children)));
  h.find(n => n.type === 'Segmented' && n.props.options.includes('TOTAL ONLY')).props.onChange('TOTAL ONLY'); h.render();
  h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'TOTAL TIME (SECONDS)').props.onChangeText('2.9'); h.render();
  h.find(n => n.type === 'Segmented' && n.props.options.includes('LOG ONLY')).props.onChange('LOG ONLY'); h.render();
  h.press('SAVE RUN'); await h.settle();
  assert.deepEqual([saved.shotTimes, saved.totalTime, saved.zones, saved.counts], [[], 2.9, undefined, false]);
});

test('Training sessions list library runs, log new ones with the par, and remove one after a confirm', async () => {
  const L = require('../src/training/drillLibrary.ts');
  const libraryRun = { id: 'lr1', drillId: 'bill', recordedAt: '2026-10-05T12:00:00Z', choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55,
    family: 'USPSA', zones: { A: 6 }, notes: '' };
  const record = { id: 'r', userId: 'local', drillName: 'Library', context: 'LIVE_FIRE', startingType: 'competitionHolster', occurredAt: '2026-10-05T12:00:00Z', segments: [], notes: '', totalTime: null, videos: [], libraryRuns: [libraryRun] };
  const writes = [], pars = [];
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [record],
    loadProfile: async () => ({ performance: {}, powerFactor: 'minor', drillPars: {} }), saveTraining: async r => { writes.push(r); }, setDrillPar: async (k, v) => { pars.push([k, v]); } } });
  await h.settle();
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'Your numbers: what your drills have measured'));
  h.child('LibraryCard').more(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === '1. Bill Drill · 7 yd · 2.55 s · 100% points · HF 11.76'));
  h.press('LOG LIBRARY DRILL');
  const editor = h.find(n => n.type === 'LibraryRunEditor');
  assert.equal(editor.props.visible, true); assert.equal(editor.props.context, 'LIVE_FIRE');
  const second = { ...libraryRun, id: 'lr2' };
  await editor.props.onSave(second, 2.4); await h.settle();
  assert.deepEqual(writes[0].libraryRuns.map(r => r.id), ['lr1', 'lr2']);
  assert.deepEqual(pars, [[L.variantKey(second), 2.4]]);
  editor.props.onClose(); h.render();
  h.press('Remove library run 1'); h.press('Confirm removing library run 1'); await h.settle();
  assert.deepEqual(writes[1].libraryRuns.map(r => r.id), ['lr2']);
});

test('Your numbers shows measured values with run counts, the planner values, and a trend against par', async () => {
  const mk = (id, drillId, choices, shotTimes, extra = {}) => ({ id, drillId, recordedAt: `2026-10-0${id.slice(-1)}T12:00:00Z`, choices, shotTimes, totalTime: shotTimes[shotTimes.length - 1], family: 'USPSA', notes: '', ...extra });
  const runs = [mk('a1', 'bill', { distance: '7' }, [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], { zones: { A: 6 } }), mk('a2', 'bill', { distance: '7' }, [1.5, 1.75, 2.0, 2.25, 2.5, 2.75], { zones: { A: 5, C: 1 } }),
    mk('a3', 'sprint', { move: '10', direction: 'lateral' }, [1.4, 1.65, 3.15, 3.4])];
  const records = [{ id: 's', context: 'LIVE_FIRE', libraryRuns: runs }];
  const profile = { performance: { drawTime: 1.4, reloadTime: 2, averageSplitTime: 0.25, transitionTime: 0.4, movementSpeed: 240,
    timingEvidence: { drawTime: { source: 'MEASURED', sampleCount: 2 } } }, drillPars: { 'bill|distance=7': 2.6 } };
  const h = harness('training/YourNumbers.tsx', { visible: true, records, profile, onClose() {} });
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.equal(row('Draw'), '1.40 s · measured, 2 samples'); assert.equal(row('Reload'), '2.00 s · generic default'); assert.equal(row('Split'), '0.25 s · generic default');
  assert.equal(row('Average speed'), '6.7 yd/s · generic default');
  assert.equal(row('Competition Holster'), '1.40 s ± 0.14 · 2 runs · best 1.30 s');
  assert.equal(row('7 yd').startsWith('0.25 s'), true); assert.match(row('7 yd'), /3 runs/);
  assert.equal(row('Sideways 10 yd'), '1.50 s · 1 run');
  assert.match(h.nodes().find(n => n.type === 'DataRow' && n.props.label === 'Sideways').props.value, /average \(1 run; all at one distance/);
  h.press('Trend Bill Drill · 7 yd');
  assert.equal(row('Par'), '2.60 s');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /Green runs are at or under par/.test([].concat(n.props.children).join(''))));
  assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'Par mark'));
  h.child('Segmented').onChange('Dry Fire'); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /No drill-library runs in dry fire yet/.test([].concat(n.props.children).join(''))));
});

test('review: Your numbers survives a damaged saved move fit and opens on the planner context; par is left alone unless typed', async () => {
  const loaded = { calibrationContext: 'DRY_FIRE', performance: { drawTime: 1.5, reloadTime: 2, averageSplitTime: 0.25, transitionTime: 0.4, movementSpeed: 120, movementModel: { all: {} } } };
  // The profile arrives after the screen mounts.
  const props = { visible: true, records: [], profile: null, onClose() {} };
  const h = harness('training/YourNumbers.tsx', props);
  assert.equal(h.child('Segmented').value, 'Live Fire');
  props.profile = loaded; h.render();
  assert.equal(h.child('Segmented').value, 'Dry Fire', 'follows the planner context once the profile loads');
  assert.ok(!h.nodes().some(n => n.props?.label === 'Move time (used for legs)'), 'damaged fit not shown, no crash');
  h.child('Segmented').onChange('Live Fire'); h.render();
  props.visible = false; h.render(); props.visible = true; h.render();
  assert.equal(h.child('Segmented').value, 'Dry Fire', 'opens on the planner context again');
  assert.ok(h.nodes().some(n => n.type === 'DataRow' && n.props.label === 'Draw'), 'planner values shown for the planner context');

  let savedPar = 'not called';
  const e = harness('training/LibraryRunEditor.tsx', { visible: true, context: 'LIVE_FIRE', powerFactor: 'minor', pars: { 'bill|distance=7': 2.4 }, onClose() {}, onSave: async (_r, par) => { savedPar = par; } });
  e.press('Bill Drill');
  const parInput = () => e.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'PAR TIME (SECONDS, BLANK = NONE)');
  assert.equal(parInput().props.value, '2.4');
  e.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText('1.3 1.55 1.8 2.05 2.3 2.55'); e.render();
  e.press('SAVE RUN'); await e.settle();
  assert.equal(savedPar, undefined, 'untouched par is not cleared or rewritten');
  parInput().props.onChangeText(''); e.render();
  e.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText('1.3 1.55 1.8 2.05 2.3 2.55'); e.render();
  e.press('SAVE RUN'); await e.settle();
  assert.equal(savedPar, null, 'emptied on purpose: cleared');
});

test('review: a PCSL score from whole-run counts over several targets is marked as an estimate', () => {
  const e = harness('training/LibraryRunEditor.tsx', { visible: true, context: 'LIVE_FIRE', powerFactor: 'minor', pars: {}, onClose() {}, onSave() {} });
  e.press('Blake Drill');
  e.find(n => n.type === 'Segmented' && n.props.options.includes('PCSL')).props.onChange('PCSL'); e.render();
  e.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText('1.4 1.62 1.92 2.14 2.44 2.66'); e.render();
  const counter = zone => e.find(n => n.type?.name === 'Counter' && n.props.label === zone);
  counter('A').props.onChange(4); e.render(); counter('T').props.onChange(1); e.render();
  assert.equal(e.nodes().find(n => n.type === 'DataRow' && n.props.label === 'PCSL points').props.value, '≈ 30 of 30 (100%)');
  assert.ok(e.nodes().some(n => n.type === 'Copy' && /^Estimate: PCSL caps points per target/.test(n.props.children)));
});

test('review: a failed power factor save puts the old choice back and says so on the profile', async () => {
  const profile = { displayName: 'Local shooter', performance: { drawTime: 1.5, reloadTime: 2, averageSplitTime: 0.25, movementSpeed: 120, transitionTime: 0.4 }, powerFactor: 'minor' };
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => profile, setPowerFactor: async () => { throw new Error('disk full'); } } });
  await h.settle();
  const pf = () => h.find(n => n.type === 'Segmented' && n.props.options.includes('MAJOR'));
  pf().props.onChange('MAJOR'); h.render(); await h.settle();
  assert.equal(pf().props.value, 'MINOR');
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /Couldn’t save the power factor: Error: disk full/.test(n.props.children)));
  assert.ok(!h.nodes().some(n => n.type === 'ErrorState'), 'not shown as a failed profile load');
});
