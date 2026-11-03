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
  const saved = [], pushes = [], prefs = new Map(Object.entries(overrides.prefs ?? {}));
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
      if (id === 'expo-router') return { router: { push: v => pushes.push(v), dismissTo: v => pushes.push(v) }, useNavigation: () => navigation, useFocusEffect: fn => react.useEffect(fn, [fn]), useLocalSearchParams: () => overrides.params ?? ({ id: 'match' }) };
      if (id === 'expo-router/react-navigation') return { usePreventRemove: (enabled, callback) => { guard = { enabled, callback }; } };
      if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => null, uuid: { v4: () => 'new-' + (++serial) } };
      if (id.endsWith('StorageProvider')) return { useRepository: () => repo };
      // Device prefs are a native store: an in-memory one unless the test gives its own.
      if (id.endsWith('ui/prefsStore')) return { readPref: k => prefs.has(k) ? prefs.get(k) : null, writePref: (k, v) => { prefs.set(k, v); } };
      if (id.endsWith('ui/kit') || id === './kit') return { Input: load(path.resolve(__dirname, '../src/ui/kit.tsx')).Input, DeleteConfirmation: load(path.resolve(__dirname, '../src/ui/kit.tsx')).DeleteConfirmation, ErrorState: 'ErrorState', ScreenHeader: 'ScreenHeader', MenuRow: 'MenuRow', StatusBadge: 'StatusBadge', Action: 'Action', ToolButton: 'ToolButton', Copy: 'Copy', Panel: 'Panel', Screen: 'Screen', DataRow: 'DataRow', Stat: 'Stat', Segmented: 'Segmented', EmptyState: 'EmptyState', Loading: 'Loading', Notice: 'Notice', Section: 'Section', ui: {}, colors: {} };
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
    return [node, ...nodes(node.props?.header), ...nodes(node.props?.action), ...nodes(node.props?.children), ...nodes(node.props?.footer)];
  }
  const find = predicate => { const result = nodes(tree).find(predicate); assert.ok(result, 'Missing UI node'); return result; };
  render();
  return { render, nodes: () => nodes(tree), find, saved, pushes, repo, prefs, get guard() { return guard; },
    press(title) { const node = find(n => typeof n.props.onPress === 'function' && (n.props.title === title || n.props.accessibilityLabel === title || n.props.label === title)); assert.ok(!node.props.disabled, title + ' is disabled'); node.props.onPress(); render(); },
    child(name) { return find(n => n.type === name).props; },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}
function initial(route) {
  const h = harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage', matchId: 'm', document: stage(), plan: plan(route) }, targetFamily: 'USPSA' }); return h;
}
/**
 * The editor frame (UI cohesion phase 2): a PLAN tool is AREAS on the tool bar, or AUTO-PLAN, PATH, ENGAGE and REVIEW in
 * ROUTE; a mode ends with DONE on its chip. Leave the current mode, then start the named tool.
 */
function routeTool(h, name) {
  const chip = h.nodes().find(n => n.type === 'ModeChip');
  if (chip) { chip.props.action.props.onPress(); h.render(); }
  if (name !== 'AREAS') h.press('ROUTE');
  h.press(name);
}
const doneMode = h => { h.child('ModeChip').action.props.onPress(); h.render(); };
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
  await h.settle();h.press('PLAN');h.press('Plan settings');h.press('Ask Route AI');
  let sheet=h.child('RouteAISheet');await sheet.controller.send('Move waypoint 1 two yards left');h.render();
  assert.equal(h.saved.length,0);assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,150);
  assert.equal(h.child('StageViewport').routeAI.preview.proposedRoute.positions[0].position.x,78);
  await h.child('RouteAISheet').apply();h.render();assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,78);assert.equal(h.saved.length,0);assert.equal(h.guard.enabled,true);
  await sheet.controller.send('Undo that');h.render();await h.child('RouteAISheet').apply();h.render();assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,150);
  await sheet.controller.send('Move waypoint 1 two yards left');h.render(); // default mock query: no extra mutation
  h.child('RouteAISheet').close();h.render();
  // Undo restored the saved stage: Save shows the quiet saved state; the header's redo brings the change back.
  const save=()=>h.find(n=>['Save','Saved','Saving…'].includes(n.props.accessibilityLabel)).props;assert.equal(save().accessibilityLabel,'Saved');assert.equal(save().disabled,true);assert.equal(save().primary,false);
  h.press('Redo');assert.equal(h.child('StageViewport').routePlanning.route.positions[0].position.x,78);assert.equal(save().accessibilityLabel,'Save');assert.equal(save().primary,true);
  h.press('Save');await h.settle();assert.equal(h.saved.length,1);assert.equal(save().accessibilityLabel,'Saved');
});

test('library card body opens and separate overflow does not open the card', () => {
  let opens = 0, menus = 0;
  const h = harness('ui/LibraryCard.tsx', { name: 'Match', category: 'USPSA', detail: '2 stages', disabled: false, open: () => opens++, more: () => menus++ });
  h.press('Open Match'); assert.equal(opens, 1); h.press('Actions for Match'); assert.equal(menus, 1); assert.equal(opens, 1);
});

test('Training opens on the drill library: every drill is a card, and a run is filed under today’s record for its practice type', async () => {
  const writes = [], prefs = [];
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, '@/ui/prefsStore': { readPref: () => null, writePref: (k, v) => prefs.push([k, v]) },
    repo: { listTraining: async () => [], saveTraining: async r => { writes.push(r); }, loadProfile: async () => ({ performance: {}, powerFactor: 'minor', drillPars: {} }) } });
  await h.settle();
  const L = require('../src/training/drillLibrary.ts'), Days = require('../src/training/drillDays.ts');
  const cards = () => h.nodes().filter(n => n.type === 'LibraryCard');
  assert.deepEqual(cards().map(c => c.props.name), L.drillGroups.flatMap(g => L.libraryDrills.filter(d => d.group === g).map(d => d.name)));
  assert.ok(!h.nodes().some(n => /SESSION|VIDEO/.test(n.props?.title ?? '')), 'no sessions to create, no free video upload');
  const bill = () => cards().find(c => c.props.name === 'Bill Drill').props;
  assert.match(bill().detail, /No runs yet$/);
  bill().open(); h.render();
  const sheet = () => h.child('DrillSheet');
  // Nothing picked on this phone yet: PRACTICE starts on Profile · Practice type for plans (live fire by default).
  assert.equal(sheet().drillId, 'bill'); assert.equal(sheet().context, 'LIVE_FIRE'); assert.equal(sheet().planPractice, 'LIVE_FIRE');
  sheet().onContextChange('DRY_FIRE'); h.render(); assert.deepEqual(prefs.at(-1), ['psp.trainingContext', 'DRY_FIRE']);
  const run = id => ({ id, drillId: 'bill', recordedAt: new Date().toISOString(), choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55, family: 'USPSA', notes: '' });
  await sheet().onSave(run('a'), undefined); await h.settle();
  await sheet().onSave(run('b'), undefined); await h.settle();
  assert.equal(writes.length, 2); assert.equal(writes[0].id, writes[1].id, 'same day, same practice type: one record');
  assert.equal(writes[1].kind, 'drillDay'); assert.equal(writes[1].context, 'DRY_FIRE'); assert.equal(writes[1].day, Days.localDay(new Date()));
  assert.deepEqual(writes[1].libraryRuns.map(r => r.id), ['a', 'b']);
  sheet().onContextChange('LIVE_FIRE'); h.render();
  assert.deepEqual(prefs.at(-1), ['psp.trainingContext', 'LIVE_FIRE']); assert.equal(sheet().context, 'LIVE_FIRE');
  await sheet().onSave(run('c'), undefined); await h.settle();
  assert.notEqual(writes[2].id, writes[0].id, 'live fire gets its own record'); assert.equal(writes[2].context, 'LIVE_FIRE');
  assert.match(bill().detail, /3 runs · last .*2\.55 s/);
  await sheet().onRemove('a'); await h.settle();
  assert.equal(writes[3].id, writes[0].id); assert.deepEqual(writes[3].libraryRuns.map(r => r.id), ['b']);
  sheet().onClose(); h.render(); assert.ok(!h.nodes().some(n => n.type === 'DrillSheet'));
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

test('Profile is settings: appearance, power factor, practice type for plans, shooting hand, eye height, and a link to YOUR NUMBERS', async () => {
  const profile = require('../src/profile/model.ts').createLocalProfile();
  profile.performanceObservations = [{ context: 'DRY_FIRE' }, { context: 'LIVE_FIRE' }, { context: 'PRESSURE_MATCH' }];
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => profile } }); await h.settle();
  const eyebrows = h.nodes().filter(n => n.type === 'Text' && typeof n.props.children === 'string' && /^[A-Z ]+$/.test(n.props.children)).map(n => n.props.children);
  for (const title of ['APPEARANCE', 'POWER FACTOR', 'PRACTICE TYPE FOR PLANS', 'SHOOTING HAND', 'EYE HEIGHT FOR WALK', 'YOUR NUMBERS', 'CLOUD SYNC']) assert.ok(eyebrows.includes(title), title);
  // The numbers live in YOUR NUMBERS only: no second PERFORMANCE list, no unused magazine fields, no calibration words.
  assert.ok(!h.nodes().some(n => n.type === 'DataRow' && ['DRAW', 'RELOAD', 'SPLIT', 'MOVEMENT', 'TRANSITION', 'Magazine capacity', 'Starting rounds', 'Chamber', 'Active context'].includes(n.props.label)));
  for (const gone of ['PERFORMANCE', 'TRAINING DATA', 'CALIBRATION']) assert.ok(!eyebrows.includes(gone), gone);
  assert.ok(!h.nodes().some(n => typeof n.props?.children === 'string' && /Video Results|calibration|context/i.test(n.props.children)), 'no retired words');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Measurements so far: dry fire 1 · live fire 1 · pressure / match 1'));
  assert.ok(!h.nodes().some(n => /sign.in/i.test(n.props.title ?? '')));
  h.press('Open your numbers in Training');
  assert.deepEqual(h.pushes.at(-1), { pathname: '/training', params: { show: 'numbers' } });
});

test('Profile: practice type for plans is saved as the profile’s practice type (default live fire); a failed save puts it back', async () => {
  let stored = { performance: {}, performanceObservations: [] }, fail = false;
  const sets = [];
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => stored,
    setPracticeType: async c => { if (fail) throw new Error('disk full'); sets.push(c); stored = { ...stored, calibrationContext: c }; } } });
  await h.settle();
  const practice = () => h.find(n => n.type === 'Segmented' && n.props.options.includes('PRESSURE / MATCH')).props;
  assert.deepEqual(practice().options, ['DRY FIRE', 'LIVE FIRE', 'PRESSURE / MATCH']);
  assert.equal(practice().value, 'LIVE FIRE', 'live fire until changed');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Your plans use your live-fire runs\./.test(n.props.children)));
  practice().onChange('DRY FIRE'); h.render(); await h.settle();
  assert.deepEqual(sets, ['DRY_FIRE']); assert.equal(practice().value, 'DRY FIRE');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Your plans use your dry-fire runs\./.test(n.props.children)));
  fail = true; practice().onChange('PRESSURE / MATCH'); h.render(); await h.settle();
  assert.equal(practice().value, 'DRY FIRE');
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^Couldn’t save the practice type: Error: disk full/.test(n.props.children)));
});

test('Profile: shooting hand and eye height for WALK are phone settings, read by Training and WALK', async () => {
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => ({ performance: {} }) }, prefs: { 'psp.eyeHeight': '83' } });
  await h.settle();
  const hand = () => h.find(n => n.type === 'Segmented' && n.props.options.includes('LEFT')).props;
  assert.equal(hand().value, 'RIGHT');
  hand().onChange('LEFT'); h.render();
  assert.equal(h.prefs.get('psp.shootingHand'), 'left'); assert.equal(hand().value, 'LEFT');
  assert.ok(h.nodes().some(n => n.type === 'Text' && n.props.children === '6 ft 11 in · 83 in'));
  h.press('Raise eye height'); assert.equal(h.prefs.get('psp.eyeHeight'), '84');
  assert.ok(h.find(n => n.props.accessibilityLabel === 'Raise eye height').props.disabled, 'stops at 84 in, WALK’s limit');
  for (let i = 0; i < 60; i++) { const lower = h.find(n => n.props.accessibilityLabel === 'Lower eye height'); if (lower.props.disabled) break; h.press('Lower eye height'); }
  assert.equal(h.prefs.get('psp.eyeHeight'), '36', 'and at 36 in');
  // Same key and limits as WALK (stage3d/EyeLevelView.tsx), which this screen only writes to.
  const walk = fs.readFileSync(path.resolve(__dirname, '../src/stage3d/EyeLevelView.tsx'), 'utf8');
  assert.match(walk, /EYE_KEY = 'psp\.eyeHeight', DEFAULT_EYE = 63, EYE_LIMITS = \[36, 84\]/);
  const prefsSource = fs.readFileSync(path.resolve(__dirname, '../src/profile/devicePrefs.ts'), 'utf8');
  assert.match(prefsSource, /EYE_HEIGHT_KEY = 'psp\.eyeHeight', EYE_HEIGHT_DEFAULT = 63, EYE_HEIGHT_LIMITS = \[36, 84\]/);
  assert.match(prefsSource, /SHOOTING_HAND_KEY = 'psp\.shootingHand'/);
  // Training reads the hand for the breakdown.
  const t = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [] }, prefs: { 'psp.shootingHand': 'left' } });
  await t.settle(); t.nodes().find(n => n.type === 'LibraryCard' && n.props.name === 'Bill Drill').props.open(); t.render();
  assert.equal(t.child('DrillSheet').hand, 'left');
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
  h.child('LibraryCard').more(); h.render(); h.press('EDIT MATCH'); assert.ok(h.nodes().some(n => n.type === 'TextInput'));
  assert.ok(h.nodes().some(n => n.props.title === 'DONE' && n.props.variant === 'primary'), 'match settings confirm with DONE');
  h.child('LibraryCard').more(); h.render(); h.press('DUPLICATE'); await h.settle(); assert.equal(duplicated, 'm');
  h.child('LibraryCard').more(); h.render(); h.press('DELETE'); assert.ok(h.nodes().some(n => n.props.title === 'Delete' && n.props.variant === 'destructive'));
});
test('stage cards retain name-only creation and overflow actions', async () => {
  const st = { id: 's', name: 'Stage', updatedAt: Date.now() }; let duplicated;
  const h = harness('app/match.tsx', {}, { repo: { loadMatch: async () => ({ id: 'm', name: 'Match', targetFamily: 'USPSA' }), listStages: async () => [st], duplicateStage: async id => { duplicated = id; } } });
  await h.settle(); h.child('LibraryCard').open(); assert.equal(h.pushes[0].params.id, 's');
  h.child('LibraryCard').more(); h.render(); h.press('DUPLICATE'); await h.settle(); assert.equal(duplicated, 's');
  h.child('LibraryCard').more(); h.render(); h.press('RENAME'); assert.ok(h.nodes().some(n => n.props.title === 'DONE'));
  h.child('LibraryCard').more(); h.render(); h.press('DELETE'); assert.ok(h.nodes().some(n => n.props.title === 'Delete' && n.props.variant === 'destructive'));
  h.press('+ STAGE'); const fields = h.nodes().filter(n => n.type === 'TextInput'); assert.equal(fields.length, 1); assert.equal(fields[0].props.accessibilityLabel, 'Stage name');
});
test('BUILD/ROUTE switches preserve route and explicit save boundary', () => {
  const r = route(); const h = initial(r); h.press('PLAN'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r);
  h.press('BUILD'); h.press('PLAN'); assert.deepEqual(h.child('StageViewport').routePlanning.route, r); assert.equal(h.saved.length, 0);
});
test('BUILD has ADD · IMPORT · CHECK · ••• and target placement repeats until Done', () => {
  const h = initial(); h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'target', presetId: 'uspsa-metric-chl-v1', noShoot: false }); h.render();
  assert.ok(!h.nodes().some(n => n.type === 'RadialAddMenu'), 'the menu closes after a choice');
  assert.equal(h.child('StageViewport').tool, 'target');
  const count = h.child('StageViewport').stage.objects.length;
  for (let i = 0; i < 2; i++) { h.child('StageViewport').onPlace({ space: 'stage', x: 100 + i * 50, y: 150, z: 0 }); h.render(); }
  assert.equal(h.child('StageViewport').stage.objects.length, count + 2); h.press('DONE'); assert.equal(h.child('StageViewport').tool, 'select');
});
test('ADD → WALL retains wall, fault line, local segment undo and document history', () => {
  const h = initial(); h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'wall' }); h.render(); assert.equal(h.child('StageViewport').tool, 'wall');
  h.child('StageViewport').onDraw('start', { space: 'stage', x: 100, y: 100, z: 0 }); h.render();
  const { endpoints } = require('../src/stage/segments.ts');
  const walls = () => h.child('StageViewport').stage.objects.filter(o => o.type === 'wall'), before = walls().length;
  h.child('StageViewport').onDraw('commit', { space: 'stage', x: 200, y: 100, z: 0 }); h.render();
  const drawn = walls().at(-1), ends = endpoints(drawn);
  assert.equal(walls().length, before + 1);
  assert.ok(!h.nodes().some(n => n.props.title === 'UNDO SEGMENT'), 'the header undo replaces UNDO SEGMENT');
  assert.deepEqual([h.child('StageViewport').draft.start.x, h.child('StageViewport').draft.start.y], [ends.end.x, ends.end.y], 'connected drawing continues from the end');
  h.press('Undo'); assert.equal(walls().length, before, 'one undo removes the last segment');
  assert.deepEqual([h.child('StageViewport').draft.start.x, h.child('StageViewport').draft.start.y], [ends.start.x, ends.start.y], 'and the next segment starts where it started');
  h.press('Redo'); assert.equal(walls().length, before + 1); h.press('DONE');
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'faultLine' }); h.render(); assert.equal(h.child('StageViewport').tool, 'faultLine');
});
test('selected object opens existing inspector and keeps contextual duplicate/delete', () => {
  const h = initial(), target = h.child('StageViewport').stage.objects.find(o => o.type === 'cardboardTarget');
  h.child('StageViewport').onSelect(target.id); h.render(); h.press('EDIT'); assert.equal(h.child('ObjectInspector').item.id, target.id);
  assert.ok(h.nodes().some(n => n.props.title === 'DUPLICATE')); assert.ok(h.nodes().some(n => n.props.title === 'DELETE'));
});
test('the movement-only optimizer (PLAN •••) exposes prerequisites without leaving PLAN', () => {
  const h = initial(); h.press('PLAN'); h.press('Plan settings'); h.press('Movement-only optimizer (older)');
  for (const section of ['loadout', 'targets', 'rules']) {
    h.child('AutoPlannerPanel').onConfigure(section); h.render();
    assert.equal(h.child('StageViewport').routeEditing, true);
    assert.equal(h.saved.length, 0);
    if (section === 'rules') assert.ok(h.child('EngagementSettings')); else { assert.equal(h.child('PlanningPanel').section, section); h.press('Back to movement optimizer'); }
  }
});
test('PATH controls, waypoint sheet and reload share the existing route state', () => {
  const h = initial(); h.press('PLAN'); routeTool(h, 'PATH'); h.press('ADD POSITION');
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 0);
  h.child('StageViewport').onRoutePoint({ space: 'stage', x: 120, y: 180, z: 0 }); h.render();
  assert.equal(h.child('StageViewport').routePlanning.route.positions.length, 1); h.press('Position 1'); assert.ok(h.nodes().some(n => n.type === 'EditorSheet' && n.props.title === 'Position' && n.props.visible)); h.press('RELOAD'); assert.equal(h.child('RoutePanel').section, 'reload');
});
test('ANALYZE opens the read-only component and layer changes never save', () => {
  const h = initial(route()); h.press('PLAN'); h.press('ANALYZE'); assert.ok(h.child('RouteAnalysis'));
  h.press('Plan settings'); h.press('Route layers'); h.press('Target arrows · SELECTED');
  assert.equal(h.child('StageViewport').routePlanning.layers.arrows, 'ALL'); h.press('Grid · OFF'); assert.equal(h.child('StageViewport').gridVisible, true); assert.equal(h.saved.length, 0);
});
test('Save is explicit and dirty exit protection survives edits', async () => {
  const h = initial(); assert.equal(h.guard.enabled, false);
  h.find(n => n.props.accessibilityLabel === 'Edit stage name').props.onPress(); h.render();
  const input = h.find(n => n.props.accessibilityLabel === 'Stage name'); input.props.onChangeText('Renamed'); h.render(); assert.equal(h.guard.enabled, true); assert.equal(h.saved.length, 0);
  h.guard.callback({ data: { action: { type: 'GO_BACK' } } }); h.render(); assert.ok(h.nodes().some(n => n.props.accessibilityLabel === 'Keep editing'));
  h.press('Keep editing'); h.press('Save'); await h.settle(); assert.equal(h.saved.length, 1); assert.equal(h.saved[0][1], 'Renamed'); assert.equal(h.guard.enabled, false);
});
test('selected arrow policy and empty-route adoption preserve meaningful manual data', () => {
  const { defaultRouteLayers, showTargetArrows, meaningfulRoute } = require('../src/editor/routePresentation.ts');
  assert.equal(showTargetArrows(defaultRouteLayers, 'a', 'a'), true); assert.equal(showTargetArrows(defaultRouteLayers, 'b', 'a'), false);
  assert.equal(showTargetArrows({ ...defaultRouteLayers, arrows: 'OFF' }, 'a', 'a'), false);
  assert.equal(showTargetArrows({ ...defaultRouteLayers, arrows: 'ALL' }, 'b', 'a'), true);
  assert.equal(meaningfulRoute(route()), false); assert.equal(meaningfulRoute({ ...route(), reloads: [{ positionId: 'p', magazineId: 'm' }] }), true);
});
test('Training has no hand-made sessions and no free video upload', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/training.tsx'), 'utf8');
  assert.doesNotMatch(source, /importVideo|ADD VIDEO|CREATE SESSION|\+ SESSION/);
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
    if (existing.positions.length) { assert.equal(adopted, undefined); h.press('CONFIRM REPLACEMENT'); }
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
  const nodes = ['n1', 'n2'].map(id => ({ id, waypointId: 'p', kind: 'moving', position: target.position, targets: [{ targetId: target.id, orderLabel: id === 'n1' ? '1' : '2', window: { startDistanceAlongSegment: 36, endDistanceAlongSegment: 108, startPosition: target.position, endPosition: target.position } }] }));
  const analysis = { nodes }; let selected;
  const { createViewportTransform } = require('../src/stage/coordinates.ts');
  const h = harness('editor/EngagementOverlay.tsx', { stage: document, route: route(), selectedId: 'p', selectedNodeId: 'n2', transform: createViewportTransform(document.stage, { width: 390, height: 500 }, { zoom: 1, pan: { x: 0, y: 0 } }), onSelect: (waypoint, node) => selected = node }, {
    '../planning/engagements': { analyzeEngagements: () => analysis },
  });
  assert.ok(!h.nodes().some(n => n.props.children === '1')); assert.ok(h.nodes().some(n => n.props.children === '2'));
  h.press('Moving window targets and order'); assert.equal(selected, 'n1');
  const details = harness('planning/EngagementDetails.tsx', { stage: document, route: route(), nodeId: 'n1', onChange() {} }, { './engagements': { analyzeEngagements: () => analysis } });
  assert.equal(details.find(n => n.props.label === 'Window span').props.value, '2 yd'); details.press('EDIT ORDER'); assert.ok(details.nodes().some(n => n.props.title === 'EARLIER'));
});


test('structured firing area fields retain yard parsing and reject incomplete coordinates', () => {
  const { defaultEngagementRules } = require('../src/planning/engagements.ts');
  const rules = defaultEngagementRules(); rules.firingAreas = [{ id: 'area-1', vertices: [{ x: 0, y: 0 }, { x: 360, y: 0 }, { x: 360, y: 360 }, { x: 0, y: 360 }] }];
  let applied;
  const h = harness('planning/EngagementSettings.tsx', { stage: stage(), initial: rules, onApply: value => applied = value, onCancel() {} });
  assert.equal(h.nodes().filter(n => n.type === 'TextInput').length, 0);
  h.press('SHOOTING AREAS · 1 >');
  assert.equal(h.nodes().filter(n=>n.type==='TextInput').length,0);
  h.press('SHOOTING AREA 1 >');
  const x = () => h.find(n => n.props.accessibilityLabel === 'Shooting area 1 point 2 X yards');
  x().props.onChangeText(''); h.render(); h.press('APPLY ROUTE SETTINGS'); assert.equal(applied, undefined);
  x().props.onChangeText('10.25'); h.render(); h.press('APPLY ROUTE SETTINGS'); assert.equal(applied.firingAreas[0].vertices[1].x, 369);
  assert.equal(rules.firingAreas[0].vertices[1].x, 360);
});

test('candidate preview omits editable-route Save and Back returns to results', () => {
  const h = initial(route()); h.press('PLAN'); h.press('Plan settings'); h.press('Movement-only optimizer (older)');
  h.child('AutoPlannerPanel').onPreview({ route: route(), number: 1, label: 'Candidate' }); h.render();
  assert.ok(!h.nodes().some(n => n.props.title === 'Save'));
  h.press('Back to results'); assert.equal(h.child('AutoPlannerPanel').preview, null); assert.equal(h.saved.length, 0);
});


test('Training loading and failed read show no drills to log into, and retry recovers', async () => {
  let fail = true;
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, '@/ui/prefsStore': { readPref: () => null, writePref() {} }, repo: { trainingReadWarnings: [], listTraining: async () => { if (fail) throw Error('disk'); return []; } } });
  assert.ok(h.nodes().some(n => n.type === 'Loading'));
  assert.ok(!h.nodes().some(n => n.type === 'LibraryCard'));
  await h.settle(); assert.ok(h.nodes().some(n => n.props.children === 'Couldn’t load your training.'));
  assert.ok(!h.nodes().some(n => n.type === 'LibraryCard'), 'no drill to log into while the saved runs are unknown');
  fail = false; h.press('RETRY'); await h.settle();
  assert.ok(h.nodes().some(n => n.type === 'LibraryCard' && n.props.name === 'Draw to first hit'));
});

test('History lists drill days; older sessions sit under OLDER SESSIONS and open read-only; a drill day can be deleted', async () => {
  const Days = require('../src/training/drillDays.ts');
  const libraryRun = { id: 'lr1', drillId: 'bill', recordedAt: '2026-10-05T12:00:00Z', choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55,
    family: 'USPSA', zones: { A: 6 }, notes: '' };
  const old = { id: 'r', userId: 'local', drillName: 'Old session', context: 'LIVE_FIRE', startingType: 'competitionHolster', occurredAt: '2026-10-05T12:00:00Z', segments: [], notes: '', totalTime: null,
    videos: [{ session: { id: 'v', analysisStatus: 'REVIEWED' } }], libraryRuns: [libraryRun] };
  const day = { ...Days.newDrillDay('d', '2026-10-20', 'DRY_FIRE', '2026-10-20T15:00:00Z'), libraryRuns: [{ ...libraryRun, id: 'lr2', recordedAt: '2026-10-20T15:00:00Z', zones: undefined }] };
  const writes = [], deleted = [];
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': { discardVideoAsset() {} },
    repo: { trainingReadWarnings: [], listTraining: async () => [day, old], saveTraining: async r => { writes.push(r); }, deleteTraining: async id => { deleted.push(id); },
      loadProfile: async () => ({ performance: {}, powerFactor: 'minor', drillPars: {} }) } });
  await h.settle();
  const card = name => h.nodes().find(n => n.type === 'LibraryCard' && n.props.name === name)?.props;
  assert.equal(card(Days.historyTitle(day)), undefined, 'history starts closed');
  assert.match(card('Bill Drill').detail, /2 runs · last Oct 20/, 'older sessions still count');
  assert.ok(h.nodes().some(n => n.props?.title === 'HISTORY · 1'), 'History counts drill days only');
  h.press('Show history');
  assert.equal(card(Days.historyTitle(day)).category, 'DRY FIRE');
  assert.equal(card('Old session'), undefined, 'older sessions are not mixed into the drill days');
  const nodes = h.nodes(), olderAt = nodes.findIndex(n => n.props?.title === 'OLDER SESSIONS · 1'), dayAt = nodes.findIndex(n => n.type === 'LibraryCard' && n.props.name === Days.historyTitle(day));
  assert.ok(olderAt > dayAt, 'one OLDER SESSIONS entry at the bottom of History');
  h.press('Show older sessions');
  assert.match(card('Old session').detail, /1 drill run: Bill Drill · 1 video$/);
  card('Old session').open(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.children === 'Read-only: recorded before the drill library.'));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === '1. Bill Drill · 7 yd · 2.55 s · 100% points · HF 11.76'));
  assert.ok(!h.nodes().some(n => /^(REMOVE|DELETE|ADD VIDEO|LOG)/.test(n.props?.title ?? '')), 'nothing is changed or added in an older session');
  h.press('Watch video 1, read-only');
  const editor = h.find(n => n.props?.initialVideo === old.videos[0]).props;
  assert.equal(editor.readOnly, true, 'its video opens read-only');
  // A drill day: remove a run, delete the day.
  card(Days.historyTitle(day)).open(); h.render();
  h.press('Remove library run 1'); h.press('Confirm removing library run 1'); await h.settle();
  assert.deepEqual(writes[0].libraryRuns, []); assert.equal(writes[0].id, 'd');
  card(Days.historyTitle(day)).open(); h.render();
  h.press('DELETE THIS DAY');
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^Delete this day’s drill runs and the measurements/.test(n.props.children)));
  h.press('DELETE'); await h.settle();
  assert.deepEqual(deleted, ['d'], 'only the day; the older session and its data are untouched');
});

test('Profile shows its settings without the profile (phone settings still work) and keeps the local-storage note', async () => {
  const h = harness('app/account.tsx', {}, { repo: { loadProfile: async () => { throw new Error('storage unavailable'); } } });
  await h.settle();
  assert.equal(h.child('ErrorState').title, 'Couldn’t load profile.');
  assert.ok(h.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('NIGHT')));
  assert.ok(h.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('LEFT')));
  assert.ok(h.nodes().some(n => n.props?.accessibilityLabel === 'Raise eye height'));
  assert.ok(!h.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('MAJOR')), 'profile settings wait for the profile');
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
  assert.ok(h.nodes().some(n=>n.type==='Segmented' && n.props.value==='LIVE FIRE'), 'practice type for plans shows once loaded');
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
 const h=initial(r);h.press('PLAN');routeTool(h,'PATH');
 const before=JSON.stringify(h.child('StageViewport').stage);
 assert.equal(h.child('StageViewport').routePlanning.editing,true);
 assert.equal(h.child('ModeChip').title,'TAP A POSITION TO SELECT IT','PATH shows its mode on the canvas');
 h.child('StageViewport').routePlanning.onSelect('b');h.render();h.press('CONNECTION');h.press('ROUNDED');
 const edited=h.child('StageViewport').routePlanning.route;assert.deepEqual(edited.positions,r.positions);assert.equal(edited.connections[0].style,'ROUNDED');assert.equal(JSON.stringify(h.child('StageViewport').stage),before);assert.equal(h.saved.length,0);
});

test('ENGAGE preserves PATH and supports contextual assignment, order, direction, delete, undo and Save', async()=>{
 const r=route();r.positions=['a','b'].map((id,i)=>({id,label:id,position:{space:'stage',x:100+i*100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}));
 r.connections=[{fromId:'a',toId:'b',style:'ROUNDED',bends:[{id:'bend',position:{space:'stage',x:150,y:150,z:0}}]}];
 const h=initial(r);await h.settle();h.press('PLAN');routeTool(h,'PATH');routeTool(h,'ENGAGE');
 let v=h.child('StageViewport');const before=JSON.stringify(v.stage),targets=v.stage.objects.filter(require('../src/planning/model.ts').isEngageable);
 assert.equal(v.routePlanning.editing,false);assert.ok(v.manualEngage);assert.equal(v.routePlanning.layers.nodes,false);
 v.manualEngage.onCreate({kind:'waypoint',waypointId:'a'},targets[0].id,0);h.render();
 const first=h.child('StageViewport').routePlanning.route.manualEngagements[0];assert.ok(first.id.startsWith('engagement-'));assert.ok(!h.nodes().some(n=>n.props.accessibilityLabel==='Earlier engagement'));assert.ok(h.nodes().some(n=>n.props.accessibilityLabel==='Edit engagement'));
 h.child('StageViewport').manualEngage.onCreate({kind:'waypoint',waypointId:'a'},targets[0].id,1);h.render();h.press('Edit engagement');h.press('Earlier engagement');
 assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements[0].direction,1);
 h.press('Turn right');assert.ok(h.child('StageViewport').routePlanning.route.manualEngagements[0].direction>1);
 h.press('Reassign target');h.press(require('../src/planning/model.ts').targetLabel(v.stage,targets[1].id));
 assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements[0].targetId,targets[1].id);
 h.press('Delete engagement');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,1);
 h.press('Undo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,2);h.press('Redo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements.length,1);
 routeTool(h,'PATH');v=h.child('StageViewport');assert.equal(v.manualEngage,undefined);assert.equal(v.routePlanning.editing,true);assert.deepEqual(v.routePlanning.route.positions,r.positions);assert.deepEqual(v.routePlanning.route.connections,r.connections);assert.equal(JSON.stringify(v.stage),before);
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
 assert.ok(h.nodes().some(n=>n.props.testID==='engagement-target-'+target.id));assert.ok(h.nodes().some(n=>n.type==='Text'&&n.props.children==='1'));assert.equal(h.nodes().filter(n=>n.type==='Text').length,1);
 assert.equal(h.nodes().filter(n=>n.props.testID==='engagement-dotted-guide').length,0);
 const arrows=h.nodes().filter(n=>typeof n.type==='function'&&n.type.name==='Arrow');assert.equal(arrows.length,2);assert.equal(arrows[0].props.selected,true);assert.equal(arrows[1].props.selected,false);
 props.draft={anchor:r.manualEngagements[0].anchor,point:r.positions[0].position,origin:{x:100,y:200},cursor:{x:200,y:100},direction:-Math.PI/4,targetId:target.id,moved:true,cancelled:false};h.render();assert.ok(h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
 props.draft={...props.draft,cancelled:true};h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
 props.draft=null;h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='engagement-dotted-guide'));
});

test('REVIEW derives manual coverage, preserves canvas and annotations across modes, and highlights saved anchors',()=>{
 // Loaded arrows are folded into positions on open (phase 3), so the arrow is drawn in this session with ENGAGE.
 const r=route(),document=stage(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:150,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];
 const h=harness('editor/StageBuilder.tsx',{initial:{id:'s',name:'Stage',matchId:'m',document,plan:plan(r)},targetFamily:'USPSA'});h.press('PLAN');routeTool(h,'PATH');const pan={zoom:2,pan:{x:31,y:-20}};h.child('StageViewport').onViewportChange(pan);h.render();routeTool(h,'ENGAGE');
 h.child('StageViewport').manualEngage.onCreate({kind:'waypoint',waypointId:'w'},target.id,0);h.render();const drawn=h.child('StageViewport').routePlanning.route,e=drawn.manualEngagements[0].id;h.child('StageViewport').manualEngage.onSelect(e);h.render();routeTool(h,'REVIEW');
 let v=h.child('StageViewport');assert.equal(v.manualEngage,undefined);assert.equal(v.routePlanning.editing,false);assert.deepEqual(v.viewport,pan);assert.equal(v.manualReview.review.assignedTargets,1);assert.equal(v.manualReview.selectedEngagementId,e);
 v.manualReview.onSelectTarget(target.id);h.render();let panel=h.child('ManualReviewPanel');assert.equal(panel.selectedTargetId,target.id);panel.onHighlight(panel.review.engagements[0]);h.render();assert.deepEqual(h.child('StageViewport').focusPosition,r.positions[0].position);
 h.child('ManualReviewPanel').onToggle();h.render();assert.equal(h.child('StageViewport').manualReview.onlyUnassigned,true);assert.equal(h.child('StageViewport').manualReview.selectedTargetId,null);
 routeTool(h,'PATH');v=h.child('StageViewport');assert.equal(v.manualReview,undefined);assert.equal(v.routePlanning.editing,true);assert.deepEqual(v.routePlanning.route,drawn);assert.deepEqual(v.viewport,pan);routeTool(h,'ENGAGE');assert.equal(h.child('StageViewport').manualEngage.selectedId,e);assert.equal(h.saved.length,0);
});
test('loaded ENGAGE arrows are folded into positions when the stage opens; invalid ones are dropped, and nothing is marked unsaved',()=>{
 const document=stage(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);
 const r=route();r.positions=[{id:'w',label:'w',position:{space:'stage',x:150,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'missing',targetId:'deleted',anchor:{kind:'waypoint',waypointId:'w'},direction:0},{id:'orphan',targetId:'deleted',anchor:{kind:'waypoint',waypointId:'gone'},direction:0},{id:'good',targetId:target.id,anchor:{kind:'waypoint',waypointId:'w'},direction:0}];
 const h=harness('editor/StageBuilder.tsx',{initial:{id:'s',name:'Stage',matchId:'m',document,plan:plan(r)},targetFamily:'USPSA'});h.press('PLAN');
 const shown=h.child('StageViewport').routePlanning.route;assert.equal(shown.manualEngagements,undefined);assert.deepEqual(shown.positions[0].engagedTargetIds,[target.id]);
 routeTool(h,'REVIEW');const panel=h.child('ManualReviewPanel');assert.equal(panel.review.invalid.length,0);assert.equal(panel.review.engagements.length,0);
 assert.ok(h.nodes().some(n=>n.props?.title==='SAVED ✓'),'the migration on open is not an unsaved edit');
});
test('REVIEW overlay distinguishes status with symbols and filters assigned highlights',()=>{
 const document=stage(),r=route(),targets=document.objects.filter(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'e',targetId:targets[0].id,anchor:{kind:'waypoint',waypointId:'w'},direction:0}];
 const review=require('../src/planning/manualRouteReview.ts').reviewManualRoute(document,r),props={review,transform:{scale:2,offsetX:25,offsetY:30},selectedId:targets[0].id,onlyUnassigned:false,onSelect(){}};const h=harness('editor/ManualReviewOverlay.tsx',props);assert.equal(h.nodes().filter(n=>n.props.testID?.startsWith('review-target-')).length,review.totalTargets);assert.ok(h.nodes().some(n=>n.type==='Text'&&n.props.children==='!'));assert.ok(h.nodes().some(n=>n.props.accessibilityState?.selected));
 props.onlyUnassigned=true;h.render();assert.ok(!h.nodes().some(n=>n.props.testID==='review-target-'+targets[0].id));assert.equal(h.nodes().filter(n=>n.props.testID?.startsWith('review-target-')).length,review.unassignedTargets);
});
test('REVIEW panel exposes sources and requires confirmation before removing invalid saved data',()=>{
 const document=stage(),r=route(),target=document.objects.find(require('../src/planning/model.ts').isEngageable);r.positions=[{id:'w',label:'w',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'good',targetId:target.id,anchor:{kind:'waypoint',waypointId:'w'},direction:0},{id:'bad',targetId:'missing',anchor:{kind:'waypoint',waypointId:'gone'},direction:0}];const highlighted=[],removed=[];
 const props={review:require('../src/planning/manualRouteReview.ts').reviewManualRoute(document,r),stage:document,selectedTargetId:target.id,selectedEngagementId:null,onlyUnassigned:false,onToggle(){},onSelectTarget(){},onHighlight:e=>highlighted.push(e),onRemove:id=>removed.push(id),disabled:false};const h=harness('editor/ManualReviewPanel.tsx',props);h.press('TARGET ASSIGNMENTS');h.press('Position 1 · engagement 1');assert.equal(highlighted[0].engagement.id,'good');assert.ok(!h.nodes().some(n=>n.type==='EditorSheet'));
 h.press('REVIEW SUMMARY');assert.ok(h.nodes().some(n=>n.props.label==='Manual route distance'));assert.ok(!h.nodes().some(n=>/undo|redo/i.test(n.props.title??'')),'undo is the editor header\'s, not the sheet\'s');h.child('EditorSheet').close();h.render();h.press('INVALID REFERENCES (1)');h.press('REMOVE INVALID ENTRY bad');assert.deepEqual(removed,[]);h.press('CANCEL REMOVAL');assert.deepEqual(removed,[]);h.press('REMOVE INVALID ENTRY bad');h.press('CONFIRM REMOVAL');assert.deepEqual(removed,['bad']);
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
 const h=initial(r);await h.settle();h.press('PLAN');routeTool(h,'ENGAGE');h.press('ENGAGEMENTS');h.press('Create engagement without dragging');h.press('Anchor: Route section 1 midpoint');
 const create=h.nodes().find(n=>n.props.accessibilityLabel?.startsWith('Create engagement to '));h.press(create.props.accessibilityLabel);h.child('EditorSheet').close();h.render();
 const created=h.child('StageViewport').routePlanning.route;assert.equal(created.manualEngagements.length,1);assert.equal(created.manualEngagements[0].anchor.fraction,.5);assert.deepEqual(created.connections,r.connections);
 h.press('Undo');assert.equal(h.child('StageViewport').routePlanning.route.manualEngagements?.length??0,0);h.press('Redo');routeTool(h,'REVIEW');routeTool(h,'PATH');assert.deepEqual(h.child('StageViewport').routePlanning.route,created);h.press('Save');await h.settle();assert.deepEqual(h.saved[0][3].route,created);
});

test('stage diagram acceptance is undoable, additive and preserves manual route/engagement bytes until explicit Save',async()=>{
 const r=route();r.positions=[{id:'waypoint',label:'Keep',position:{space:'stage',x:100,y:200,z:0},visibleTargetIds:[],engagedTargetIds:[]}];r.manualEngagements=[{id:'invalid-preserved',targetId:'missing-target',anchor:{kind:'waypoint',waypointId:'missing-waypoint'},direction:1}];const h=initial(r);await h.settle();h.press('IMPORT');
 const screen=h.child('DiagramImportScreen');assert.equal(screen.visible,true);const before=JSON.stringify(h.child('StageViewport').routePlanning.route),added=require('../src/stage/defaults.ts').createObject('steelPlate','import-test',200,200);
 screen.apply({...screen.stage,objects:[...screen.stage.objects,added]});h.render();assert.equal(JSON.stringify(h.child('StageViewport').routePlanning.route),before);assert.equal(h.saved.length,0);h.child('DiagramImportScreen').close();h.render();h.press('Undo');assert.equal(h.child('StageViewport').stage.objects.some(o=>o.id===added.id),false);h.press('Redo');assert.equal(h.child('StageViewport').stage.objects.some(o=>o.id===added.id),true);h.press('Save');await h.settle();assert.equal(JSON.stringify(h.saved[0][3].route),before);
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
  assert.ok(h.nodes().some(n => typeof n.props.children === 'string' && /Draw shooting areas first/.test(n.props.children)));
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
  // The same selection bar as the 2D plan; height −/+ is in EDIT, for both views.
  assert.equal(h.child('SelectionBar').title, 'WALL');
  h.press('EDIT'); h.press('Raise the wall'); h.find(n => n.type === 'EditorSheet' && n.props.visible).props.close(); h.render(); h.press('Rotate right');
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
  h.press('Undo');
  assert.deepEqual(h.child('Stage3DView').stage.objects.find(o => o.id === wall.id).position, raised.position, 'one undo step');
  h.child('Stage3DView').onSelect(target.id); h.render(); h.press('EDIT'); h.press('Raise the target'); h.find(n => n.type === 'EditorSheet' && n.props.visible).props.close(); h.render();
  assert.equal(h.child('Stage3DView').stage.objects.find(o => o.id === target.id).position.z, target.position.z + 3);
  // WALK is the one eye-level entry, from BUILD too; leaving it goes back to BUILD.
  h.press('WALK');
  assert.equal(h.child('EyeLevelView').ruleset, 'USPSA', 'visibility follows the match ruleset');
  assert.ok(!h.nodes().some(n => n.props?.title === 'ADD'), 'the bottom bar steps aside for the walk-through');
  h.child('EyeLevelView').onExit(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
  assert.ok(h.nodes().some(n => n.props?.title === 'ADD'), 'back in BUILD, where WALK was opened');
  // Route tools are plan-only, however they are opened (PATH, ENGAGE, REVIEW, AREAS).
  h.press('3D view'); h.press('PLAN'); routeTool(h, 'PATH');
  assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
  h.press('DONE'); h.press('3D view'); assert.ok(h.nodes().some(n => n.type === 'Stage3DView'));
  for (const tool of ['ENGAGE', 'REVIEW', 'AREAS']) {
    routeTool(h, tool); h.render();
    assert.ok(h.nodes().some(n => n.type === 'StageViewport'), tool + ' returns to the plan');
    doneMode(h); h.press('3D view'); assert.ok(h.nodes().some(n => n.type === 'Stage3DView'));
  }
  // WALK is the eye-level walk-through of the plan; PLAN comes back to the 2D plan.
  h.press('WALK'); assert.ok(h.child('EyeLevelView')); assert.ok(!h.nodes().some(n => n.props?.title === 'ROUTE'), 'route tools step aside while walking');
  h.press('PLAN'); assert.ok(h.nodes().some(n => n.type === 'StageViewport'));
  // WALK opened from PLAN comes back to PLAN.
  h.press('WALK'); h.child('EyeLevelView').onExit(); h.render();
  assert.ok(h.nodes().some(n => n.props?.title === 'ROUTE') && h.nodes().some(n => n.type === 'StageViewport'));
});

test('press and hold on the bay opens the radial menu there; a choice places it at that spot, then places more until DONE', () => {
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
  assert.equal(h.child('StageViewport').tool, 'target', 'like ADD: each tap places another until DONE');
  h.press('DONE');
  assert.equal(h.child('StageViewport').tool, 'select'); assert.equal(h.child('StageViewport').selectedId, placed.id, 'the last placed stays selected');
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
  assert.ok(!h.nodes().some(n => n.props?.title === 'UNDO'), 'AREAS has no undo of its own: the header covers it');
  h.press('Undo'); assert.equal(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas.length, 1, 'undo brings it back');
  // Too few corners cannot finish; the whole bay is one tap.
  h.press('NEW AREA'); h.child('StageViewport').onAreaPoint({ space: 'stage', x: 10, y: 10, z: 0 }); h.render();
  assert.ok(h.nodes().find(n => n.props?.title === 'FINISH AREA').props.disabled);
  h.press('Cancel the new area'); h.press('WHOLE BAY');
  assert.equal(h.child('StageViewport').routePlanning.route.engagementRules.firingAreas.length, 2);
  h.press('DONE'); assert.equal(h.child('StageViewport').onAreaPoint, undefined);
  assert.equal(h.saved.length, 0, 'drawing areas never saves on its own');
});

test('the planner opens area drawing directly when there are no firing areas', () => {
  const h = initial(); h.press('PLAN'); h.press('ROUTE'); h.press('AUTO-PLAN');
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
  h.press('Undo');
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
  assert.ok(h.nodes().some(n => n.props?.label === 'T1 open scoring area' && n.props.value === '100%'));
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

const discardedVideos = [];
const drillSheet = (drillId, patch = {}) => harness('training/DrillSheet.tsx', { visible: true, drillId, records: [], context: 'LIVE_FIRE', onContextChange() {}, planPractice: 'LIVE_FIRE', powerFactor: 'minor',
  pars: {}, onClose() {}, onSave() {}, onRemove() {}, onUpdate() {}, hand: 'right', ...patch }, { './videoAssets': { discardVideoAsset: a => discardedVideos.push(a.uri), playbackUri: a => 'file:///' + a.uri } });
/** Switch the drill sheet's tab (LOG, RUNS, HOW TO). */
const drillTab = (h, name) => { h.find(n => n.type === 'Segmented' && n.props.options.includes('HOW TO')).props.onChange(name); h.render(); };
test('Drill sheet: how to run it, options, paste timer times, count hits, save with a par', async () => {
  let saved, savedPar;
  const h = drillSheet('sprint', { powerFactor: 'major', pars: { 'sprint|direction=back|move=10': 3.5 }, onSave: async (r, par) => { saved = r; savedPar = par; } });
  assert.equal(h.child('EditorSheet').title, 'Sprint');
  assert.equal(h.find(n => n.type === 'Segmented' && n.props.options.includes('HOW TO')).props.value, 'LOG', 'opens on LOG');
  assert.ok(!h.nodes().some(n => n.type === 'Copy' && /^Two shooting spots/.test(n.props.children)), 'how to run it is its own tab');
  drillTab(h, 'HOW TO');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Two shooting spots 5, 10 or 15 yd apart/.test(n.props.children)), 'setup shown');
  for (const title of ['HOW TO RUN IT', 'WHAT IT MEASURES', 'WHAT THE PLANNER USES IT FOR']) assert.ok(h.nodes().some(n => n.props?.children === title), title);
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Long moves.'));
  // The options apply to LOG and RUNS, so they stay above the tabs.
  assert.ok(h.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('SIDEWAYS')), 'options stay visible on every tab');
  drillTab(h, 'LOG');
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
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^Saved: 3\.62 s/.test(n.props.children)));
  assert.equal(h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.value, '', 'ready for the next run');
});

test('Drill sheet: wrong shot count is explained; dry fire counts no hits; total-only runs', async () => {
  let saved;
  const h = drillSheet('bill', { context: 'DRY_FIRE', onSave: async r => { saved = r; } });
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

test('Drill sheet: hits marked on the target become the zone counts; every marked hit needs its zone', async () => {
  let saved;
  const h = drillSheet('bill', { onSave: async r => { saved = r; } });
  assert.ok(!h.nodes().some(n => n.type === 'HitMarker'), 'counting by zone is the default');
  h.find(n => n.type === 'Segmented' && n.props.options.includes('MARK ON TARGET')).props.onChange('MARK ON TARGET'); h.render();
  const marker = () => h.child('HitMarker');
  assert.equal(marker().target.presetId, 'uspsa-metric-chl-v1'); assert.equal(marker().distanceYards, 7);
  const hit = (n, zone, x = 0.5 * n, y = -n) => ({ id: 'h' + n, order: n, x, y, zone });
  marker().onChange({ ...marker().target, hits: [hit(1, 'A'), hit(2, 'A'), hit(3, 'A'), hit(4, 'C'), hit(5, 'A'), hit(6, null)] }); h.render();
  h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText('1.3 1.55 1.8 2.05 2.3 2.55'); h.render();
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saved, undefined); assert.ok(h.nodes().some(n => n.type === 'Notice' && /^Pick the zone of every marked hit/.test(n.props.children)));
  marker().onChange({ ...marker().target, hits: marker().target.hits.map(x => x.id === 'h6' ? { ...x, zone: 'A' } : x) }); h.render();
  assert.equal(h.nodes().find(n => n.type === 'DataRow' && n.props.label === 'USPSA minor points').props.value, '28 of 30 (93%)');
  h.press('SAVE RUN'); await h.settle();
  assert.deepEqual(saved.zones, { A: 5, C: 1 }); assert.equal(saved.target.hits.length, 6); assert.equal(saved.target.hits[3].zone, 'C');
  const L = require('../src/training/drillLibrary.ts');
  assert.equal(L.libraryRunProblem(saved), null);
  assert.equal(L.libraryRunProblem({ ...saved, zones: { A: 6 } }), 'Hit counts do not match the hits marked on the target.');
  assert.equal(marker().target.hits.length, 0, 'the target is cleared for the next run');
  const blake = drillSheet('blake');
  assert.ok(!blake.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('MARK ON TARGET')), 'three targets: counts only');
});

test('Drill sheet: your runs of these options, best time and par, and remove after a confirm', async () => {
  const Days = require('../src/training/drillDays.ts');
  const mk = (id, at, total, choices = { distance: '7' }) => ({ id, drillId: 'bill', recordedAt: at, choices, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, total], totalTime: total, family: 'USPSA', notes: '' });
  const records = [{ ...Days.newDrillDay('d1', '2026-10-20', 'LIVE_FIRE', '2026-10-20T15:00:00Z'), libraryRuns: [mk('a', '2026-10-20T15:00:00Z', 2.6), mk('b', '2026-10-20T15:05:00Z', 2.45), mk('c', '2026-10-20T15:09:00Z', 3.1, { distance: '10' })] }];
  const removed = [];
  const h = drillSheet('bill', { records, pars: { 'bill|distance=7': 2.5 }, onRemove: id => { removed.push(id); } });
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.equal(row('Runs'), undefined, 'your runs are their own tab');
  drillTab(h, 'RUNS');
  assert.equal(row('Runs'), '2'); assert.equal(row('Best time'), '2.45 s'); assert.equal(row('Par'), '2.50 s');
  const lines = h.nodes().filter(n => n.type === 'Copy' && /^Oct 20 · Live fire · /.test(n.props.children)).map(n => n.props.children);
  assert.deepEqual(lines, ['Oct 20 · Live fire · 2.45 s · under par', 'Oct 20 · Live fire · 2.60 s · over par'], 'newest first, this variant only');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Breakdown works on Bill Drill, Draw from hands at sides and standing Reload runs with a video whose beep was used.'),
    'says why no run here can be broken down');
  h.press('Remove run 1'); h.press('Confirm removing run 1');
  assert.deepEqual(removed, ['b']);
});

test('Drill sheet: a run’s video fills the times, is saved with the run, and is removed if the run is not saved', async () => {
  let saved, savedVideo, closes = 0;
  const h = drillSheet('bill', { onSave: async (r, _par, v) => { saved = r; savedVideo = v; }, onClose: () => { closes++; } });
  const video = { id: 'v1', asset: { uri: 'training-videos/v1.mov', name: 'IMG_1.MOV', storage: 'DOCUMENTS' }, durationMs: 9000, timing: { beepMs: 1000 } };
  h.child('DrillVideo').onChange(video); h.render();
  h.child('DrillVideo').onUseTimes([1.42, 1.68, 1.93, 2.17, 2.42, 2.66]); h.render();
  assert.equal(h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.value, '1.42 1.68 1.93 2.17 2.42 2.66');
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saved.videoId, 'v1'); assert.equal(savedVideo, video); assert.deepEqual(saved.shotTimes, [1.42, 1.68, 1.93, 2.17, 2.42, 2.66]);
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /, with its video\.$/.test(n.props.children)));
  assert.equal(h.child('DrillVideo').video, null, 'the next run starts without a video');
  const before = discardedVideos.length;
  h.child('DrillVideo').onChange({ ...video, id: 'v2', asset: { ...video.asset, uri: 'training-videos/v2.mov' } }); h.render();
  // Closing with a picked video asks first; KEEP EDITING keeps it, DISCARD removes its copy and closes.
  h.child('EditorSheet').close(); h.render();
  assert.equal(closes, 0); assert.deepEqual(discardedVideos.slice(before), [], 'nothing removed before you answer');
  h.press('KEEP EDITING'); assert.equal(h.child('DrillVideo').video.id, 'v2');
  h.child('EditorSheet').close(); h.render(); h.press('DISCARD');
  assert.deepEqual(discardedVideos.slice(before), ['training-videos/v2.mov'], 'an unsaved run’s video copy is removed'); assert.equal(closes, 1);
  // A saved run with a video can be watched from YOUR RUNS, with a mark at the beep and each shot.
  const Days = require('../src/training/drillDays.ts');
  const run = { ...saved, id: 'r9', recordedAt: '2026-10-20T15:00:00Z' };
  const record = Days.addRun(Days.newDrillDay('d', '2026-10-20', 'LIVE_FIRE', run.recordedAt), { ...run, videoId: undefined }, video);
  const w = drillSheet('bill', { records: [record] });
  drillTab(w, 'RUNS');
  assert.ok(w.nodes().some(n => n.type === 'Copy' && /^Oct 20 · Live fire · 2\.66 s · video$/.test(n.props.children)));
  w.press('Watch run 1');
  const player = w.find(n => Array.isArray(n.props?.marks) && n.props.uri).props;
  assert.equal(player.uri, 'file:///training-videos/v1.mov');
  assert.deepEqual(player.marks.map(m => [m.label, Math.round(m.ms)]), [['BEEP', 1000], ['SHOT 1', 2420], ['SHOT 2', 2680], ['SHOT 3', 2930], ['SHOT 4', 3170], ['SHOT 5', 3420], ['SHOT 6', 3660]]);
});

test('Drill video: pick a video, the beep and shots are found in its sound, and you use the times; failures say what to do', async () => {
  const events = { changes: [], used: [], discarded: [] };
  const a = { samples: new Float32Array(6000 * 16), sampleRate: 16000, durationMs: 6000, offsetMs: 0, warnings: [] };
  for (let i = 1000 * 16; i < 1200 * 16; i++) a.samples[i] = 0.4 * Math.sin(2 * Math.PI * 2300 * i / 16000);
  for (const ms of [2420, 2680, 2930, 3170, 3420, 3660]) a.samples[ms * 16] = 0.9;
  let extract = async () => a, picks = 0;
  const props = { drill: require('../src/training/drillLibrary.ts').libraryDrill('bill'), context: 'LIVE_FIRE', video: null, disabled: false,
    onChange: v => { events.changes.push(v); props.video = v; }, onUseTimes: t => events.used.push(t) };
  const h = harness('training/DrillVideo.tsx', props, {
    'expo-video': { useVideoPlayer: () => ({ addListener: () => ({ remove() {} }), duration: 6 }), VideoView: 'VideoView' },
    './videoAssets': { importVideoAsset: async (id, from) => { picks++; assert.equal(from, 'photos'); return { uri: `training-videos/${id}.mov`, name: 'IMG_2.MOV', storage: 'DOCUMENTS' }; },
      discardVideoAsset: x => events.discarded.push(x.uri), playbackUri: x => 'file:///' + x.uri },
    './extractAnalysisAudio': { extractAnalysisAudio: (...args) => extract(...args) } });
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Pick the video of this run/.test(n.props.children)));
  h.press('TIME IT FROM A VIDEO');
  const until = async ok => { for (let i = 0; i < 300 && !ok(); i++) { await new Promise(r => setTimeout(r, 10)); h.render(); } };
  await until(() => h.nodes().some(n => n.props?.title === 'USE THESE TIMES'));
  assert.equal(picks, 1); assert.equal(props.video.asset.name, 'IMG_2.MOV');
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.equal(row('Beep'), '1.00 s into the video'); assert.equal(row('Shot 1 · Start to first shot'), '1.42 s'); assert.equal(row('Shot 6 · Split'), '2.66 s');
  h.press('USE THESE TIMES');
  assert.deepEqual(events.used.at(-1).map(t => Math.round(t * 100) / 100), [1.42, 1.68, 1.93, 2.17, 2.42, 2.66]);
  assert.equal(props.video.timing.beepMs, 1000); h.render(); assert.ok(h.nodes().some(n => n.props?.title === 'TIMES IN USE'));
  // The sound can't be read (an older app build, the web): it says so and the times are typed.
  extract = async () => { throw new Error('Local audio extraction unavailable. Install a rebuilt iOS development/device app with TrainingAudio. Manual editing remains available.'); };
  h.press('REMOVE VIDEO'); assert.deepEqual(events.discarded, [events.changes[0].asset.uri]); assert.equal(props.video, null); h.render();
  h.press('TIME IT FROM A VIDEO');
  await until(() => h.nodes().some(n => n.props?.title === 'TIME IT AGAIN'));
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^This build of the app can’t read a video’s sound yet/.test(n.props.children)));
  assert.ok(h.nodes().some(n => n.props?.title === 'TIME IT AGAIN'));
});

test('review: saves and removals are written one at a time from the latest records, so a removed run never comes back', async () => {
  const writes = [], held = [];
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, '@/ui/prefsStore': { readPref: () => null, writePref() {} },
    repo: { listTraining: async () => [], saveTraining: r => new Promise(resolve => held.push(() => { writes.push(r); resolve(); })),
      loadProfile: async () => ({ performance: {}, powerFactor: 'minor', drillPars: {} }), setDrillPar: async () => { throw new Error('disk full'); } } });
  await h.settle();
  h.nodes().find(n => n.type === 'LibraryCard' && n.props.name === 'Bill Drill').props.open(); h.render();
  const sheet = () => h.child('DrillSheet');
  const run = id => ({ id, drillId: 'bill', recordedAt: new Date().toISOString(), choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55, family: 'USPSA', notes: '' });
  const release = async () => { for (let i = 0; i < 40; i++) { if (held.length) held.shift()(); await new Promise(r => setTimeout(r, 0)); } await h.settle(); };
  // Two saves in flight on a new day: one record, both runs.
  const a = sheet().onSave(run('a'), undefined), b = sheet().onSave(run('b'), undefined);
  await release(); await a; await b;
  assert.equal(writes[1].id, writes[0].id); assert.deepEqual(writes[1].libraryRuns.map(r => r.id), ['a', 'b']);
  // Remove a, then save c before the removal is written: a stays removed.
  const removal = sheet().onRemove('a'), c = sheet().onSave(run('c'), undefined);
  await release(); await removal; await c;
  assert.deepEqual(writes.at(-1).libraryRuns.map(r => r.id), ['b', 'c']);
  // A par that can't be saved doesn't undo the run, and says so instead of failing (so the run isn't saved twice).
  const d = sheet().onSave(run('d'), 2.4);
  await release();
  assert.equal(await d, 'The par couldn’t be saved (disk full).');
  assert.deepEqual(writes.at(-1).libraryRuns.map(r => r.id), ['b', 'c', 'd']);
});

test('review: a new drill starts counting again with shot times; LOG ONLY is for one run; your target family carries over', async () => {
  const saved = [];
  const props = { visible: true, drillId: 'bill', records: [], context: 'LIVE_FIRE', onContextChange() {}, powerFactor: 'minor', pars: {}, onClose() {},
    onSave: async r => { saved.push(r); return undefined; }, onRemove() {} };
  const h = harness('training/DrillSheet.tsx', props, { './videoAssets': { discardVideoAsset() {}, playbackUri: a => a.uri } });
  const seg = opt => h.find(n => n.type === 'Segmented' && n.props.options.includes(opt)).props;
  seg('LOG ONLY').onChange('LOG ONLY'); seg('PCSL').onChange('PCSL'); seg('TOTAL ONLY').onChange('TOTAL ONLY'); h.render();
  h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'TOTAL TIME (SECONDS)').props.onChangeText('3.1'); h.render();
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saved[0].counts, false);
  assert.equal(seg('LOG ONLY').value, 'COUNTS', 'the next rep counts');
  seg('LOG ONLY').onChange('LOG ONLY'); h.render();
  props.drillId = 'draw'; h.render();
  assert.equal(seg('LOG ONLY').value, 'COUNTS'); assert.equal(seg('TOTAL ONLY').value, 'SHOT TIMES'); assert.equal(seg('PCSL').value, 'PCSL');
});

test('Drill sheet LOG says whether the run counts toward your plans, following the practice type for plans', () => {
  const line = h => h.nodes().find(n => n.type === 'Copy' && /^(Counts toward your plans|Practice only|Kept in the log only)/.test(n.props.children))?.props.children;
  assert.equal(line(drillSheet('bill', { context: 'LIVE_FIRE', planPractice: 'LIVE_FIRE' })), 'Counts toward your plans');
  assert.equal(line(drillSheet('bill', { context: 'DRY_FIRE', planPractice: 'LIVE_FIRE' })), 'Practice only — your plans use live-fire runs');
  assert.equal(line(drillSheet('bill', { context: 'LIVE_FIRE', planPractice: 'PRESSURE_MATCH' })), 'Practice only — your plans use pressure / match runs');
  const h = drillSheet('bill', { context: 'LIVE_FIRE', planPractice: 'LIVE_FIRE' });
  h.find(n => n.type === 'Segmented' && n.props.options.includes('LOG ONLY')).props.onChange('LOG ONLY'); h.render();
  assert.equal(line(h), 'Kept in the log only');
  // Practice type buttons are ALL CAPS; the value given back is the stored context.
  const changes = [];
  const c = drillSheet('bill', { onContextChange: v => changes.push(v) });
  const practice = c.find(n => n.type === 'Segmented' && n.props.options.includes('PRESSURE / MATCH')).props;
  assert.deepEqual(practice.options, ['DRY FIRE', 'LIVE FIRE', 'PRESSURE / MATCH']); assert.equal(practice.value, 'LIVE FIRE');
  practice.onChange('PRESSURE / MATCH'); assert.deepEqual(changes, ['PRESSURE_MATCH']);
  const P = require('../src/training/presentation.ts');
  assert.equal(P.practiceLine('PRESSURE_MATCH', 'PRESSURE_MATCH', true), 'Counts toward your plans');
});

test('Drill sheet says why MARK ON TARGET isn’t offered: several targets, steel, dry fire', () => {
  const note = 'Marking hits works on single paper-target drills, live fire.';
  const has = h => h.nodes().some(n => n.type === 'Copy' && n.props.children === note);
  const marking = h => h.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('MARK ON TARGET'));
  const bill = drillSheet('bill'); assert.ok(marking(bill)); assert.ok(!has(bill), 'offered: nothing to explain');
  for (const [id, patch] of [['blake', {}], ['steel', {}], ['partial', {}], ['bill', { context: 'DRY_FIRE' }]]) {
    const h = drillSheet(id, patch); assert.ok(!marking(h), id); assert.ok(has(h), id + ' says why');
  }
});

test('Drill sheet: saving a video run whose beep wasn’t used asks first; USE THE BEEP keeps your typed times', async () => {
  const saves = [];
  const h = drillSheet('bill', { onSave: async (r, _p, v) => { saves.push([r, v]); } });
  const video = { id: 'v1', asset: { uri: 'training-videos/v1.mov', name: 'IMG_1.MOV', storage: 'DOCUMENTS' }, durationMs: 9000, timing: null };
  const found = { beepMs: 1250, beepDurationMs: 200, shotMs: [], ignoredMs: [], shotTimes: [1.42, 1.68, 1.93, 2.17, 2.42, 2.66], dryFire: false };
  const type = text => { h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel)).props.onChangeText(text); h.render(); };
  h.child('DrillVideo').onChange(video); h.child('DrillVideo').onFound(found); h.render();
  type('1.40 1.65 1.90 2.15 2.40 2.65');
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saves.length, 0, 'asks before saving');
  assert.ok(h.nodes().some(n => n.props?.children === 'Use the beep from the video?'));
  assert.ok(!h.nodes().some(n => n.props?.title === 'SAVE RUN'), 'the question replaces SAVE RUN');
  h.press('USE THE BEEP'); await h.settle();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0][0].shotTimes, [1.4, 1.65, 1.9, 2.15, 2.4, 2.65], 'typed times kept');
  assert.equal(saves[0][1].timing.beepMs, 1250, 'the video is saved with its beep');
  // A run whose video's beep wasn't used: saved without it, and it says what that means.
  h.child('DrillVideo').onChange({ ...video, id: 'v2' }); h.child('DrillVideo').onFound(found); h.render();
  type('1.40 1.65 1.90 2.15 2.40 2.65');
  h.press('SAVE RUN'); await h.settle(); h.press('SAVE WITHOUT IT'); await h.settle();
  assert.equal(saves.length, 2); assert.equal(saves[1][1].timing, null);
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /Its beep wasn’t used, so it can’t be broken down\.$/.test(n.props.children)));
  // Times already used from the video (or dry fire's USE THE BEEP): nothing to ask.
  h.child('DrillVideo').onChange({ ...video, id: 'v3', timing: found }); h.child('DrillVideo').onFound(found); h.render();
  type('1.42 1.68 1.93 2.17 2.42 2.66');
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saves.length, 3); assert.equal(saves[2][1].timing.beepMs, 1250);
  // No beep found in the sound: nothing to offer, it saves straight away.
  h.child('DrillVideo').onChange({ ...video, id: 'v4' }); h.child('DrillVideo').onFound(null); h.render();
  type('1.42 1.68 1.93 2.17 2.42 2.66');
  h.press('SAVE RUN'); await h.settle();
  assert.equal(saves.length, 4);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../src/training/DrillVideo.tsx'), 'utf8'), /timing\.dryFire\s*\?\s*<Action title=\{video\.timing === timing \? 'BEEP IN USE' : 'USE THE BEEP'\}/, 'dry fire keeps its USE THE BEEP');
});

test('Drill sheet: closing with typed times or counted hits asks first; nothing typed closes at once; SAVE RUN keeps it open', async () => {
  let closes = 0;
  const h = drillSheet('bill', { onClose: () => { closes++; }, onSave: async () => {} });
  h.child('EditorSheet').close(); assert.equal(closes, 1, 'nothing typed: closes');
  const times = () => h.find(n => n.type === 'TextInput' && /SHOT TIMES/.test(n.props.accessibilityLabel));
  times().props.onChangeText('1.3 1.55'); h.render();
  h.child('EditorSheet').close(); h.render(); assert.equal(closes, 1);
  assert.ok(h.nodes().some(n => n.props?.children === 'This run isn’t saved'));
  h.press('KEEP EDITING'); assert.equal(times().props.value, '1.3 1.55', 'still there');
  // The backdrop and Done close the same way (both call close).
  h.child('EditorSheet').close(); h.render(); h.press('DISCARD'); assert.equal(closes, 2);
  assert.equal(times().props.value, '', 'discarded');
  const counter = zone => h.find(n => n.type?.name === 'Counter' && n.props.label === zone);
  counter('A').props.onChange(2); h.render();
  h.child('EditorSheet').close(); h.render(); assert.equal(closes, 2, 'counted hits ask too');
  h.press('DISCARD');
  // After SAVE RUN the sheet stays open and nothing is left to lose.
  times().props.onChangeText('1.3 1.55 1.8 2.05 2.3 2.55'); h.render();
  h.press('SAVE RUN'); await h.settle();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^Saved:/.test(n.props.children))); assert.equal(closes, 3);
  h.child('EditorSheet').close(); assert.equal(closes, 4);
});

test('Training intro follows the practice type for plans; /training?show=numbers opens YOUR NUMBERS (Profile’s link)', async () => {
  const intro = h => h.nodes().find(n => n.type === 'Copy' && /^Pick a drill/.test(n.props.children))?.props.children;
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [], loadProfile: async () => ({ performance: {}, calibrationContext: 'DRY_FIRE' }) } });
  await h.settle();
  assert.equal(intro(h), 'Pick a drill, run it on your timer, log it. Dry-fire runs that count update YOUR NUMBERS, which your plans use.');
  assert.ok(!/Every run/.test(intro(h)));
  assert.ok(!h.nodes().some(n => n.type === 'YourNumbers'), 'YOUR NUMBERS starts closed');
  h.nodes().find(n => n.type === 'LibraryCard' && n.props.name === 'Bill Drill').props.open(); h.render();
  assert.equal(h.child('DrillSheet').context, 'DRY_FIRE', 'PRACTICE starts on the plans’ practice type');
  const live = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [], loadProfile: async () => ({ performance: {} }) } });
  await live.settle();
  assert.equal(intro(live), 'Pick a drill, run it on your timer, log it. Live-fire runs that count update YOUR NUMBERS, which your plans use.');
  // A practice type picked on this phone wins over the setting.
  const picked = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [], loadProfile: async () => ({ performance: {} }) }, prefs: { 'psp.trainingContext': 'PRESSURE_MATCH' } });
  await picked.settle(); picked.nodes().find(n => n.type === 'LibraryCard' && n.props.name === 'Bill Drill').props.open(); picked.render();
  assert.equal(picked.child('DrillSheet').context, 'PRESSURE_MATCH');
  const numbers = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, repo: { trainingReadWarnings: [], listTraining: async () => [] }, params: { show: 'numbers' } });
  await numbers.settle();
  assert.equal(numbers.child('YourNumbers').visible, true);
});

test('Older sessions’ videos open read-only: watch and read, no edit, analyse, compare, save or profile contribution', async () => {
  const h = videoHarness({}, () => {}, { readOnly: true }); await h.settle();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.children === 'Read-only: recorded before the drill library.'));
  assert.deepEqual(h.find(n => n.type === 'Segmented').props.options, ['TIMELINE', 'RESULTS']);
  for (const title of ['Save analysis', '+ Add event', 'ANALYZE AUDIO', 'SELECT STAGE', 'Relink original video (keep markers)']) assert.ok(!h.nodes().some(n => n.props?.title === title), title + ' hidden');
  h.child('Segmented').onChange('RESULTS'); h.render();
  assert.ok(!h.nodes().some(n => /eligible measurements to profile|UPDATE PROFILE DATA/.test(n.props?.title ?? '')), 'no profile contribution');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Not added to your profile\. Editing, comparing with a plan and adding to your profile are off/.test(n.props.children)));
  // A video that still exists can be watched, and its markers played.
  const session = { id: 'v', trainingSessionId: 't', drillId: null, asset: { name: 'video.mp4', uri: 'training-videos/v.mp4', storage: 'DOCUMENTS' }, durationMs: 10000, fps: null, context: 'LIVE_FIRE',
    analysisStatus: 'REVIEWED', analysisVersion: 1, createdAt: '2026-10-04T12:00:00.000Z', importedAt: '2026-10-04T12:00:00.000Z' };
  const initialVideo = { session, analysis: require('../src/training/videoAnalysis.ts').analyzeVideo(session, [{ id: 'e', type: 'STIMULUS', timestampMs: 100, source: 'MANUAL', confidence: 'CONFIRMED', confirmed: true }]) };
  const w = harness('training/VideoAnalysisEditor.tsx', { record: { id: 't', startingType: 'competitionHolster', videos: [initialVideo] }, initialVideo, onSaved() {}, onClose() {}, readOnly: true },
    { 'expo-video': {}, './videoAssets': { assetExists: async () => true, discardVideoAsset() {} }, './extractPose': {}, './extractCloseUp': {}, './extractAnalysisAudio': {}, repo: {} });
  await w.settle();
  assert.equal(w.find(n => n.type?.name === 'Player').props.readOnly, true);
  assert.ok(w.nodes().some(n => n.props?.title === 'Preview at 100.00 ms'), 'its markers can be played');
  assert.ok(!w.nodes().some(n => ['Edit', 'Delete event', 'Confirm event'].includes(n.props?.title)));
});

test('Home LAST DRILL shows % POINTS', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/index.tsx'), 'utf8');
  assert.match(source, /\['% POINTS', score/); assert.doesNotMatch(source, /\['POINTS',/);
});

test('review: the home screen shows the newest drill-library run', () => {
  const Days = require('../src/training/drillDays.ts');
  const mk = (id, at, drillId = 'bill', shotTimes = [1.3, 1.55, 1.8, 2.05, 2.3, 2.55]) => ({ id, drillId, recordedAt: at, choices: { distance: '7' }, shotTimes, totalTime: shotTimes.at(-1), family: 'USPSA', notes: '', zones: { A: 6 } });
  const last = Days.lastLibraryRun([{ libraryRuns: [mk('a', '2026-10-20T12:00:00Z')] }, { libraryRuns: [mk('b', '2026-10-26T09:00:00Z')] }, { runs: [] }]);
  assert.equal(last.run.id, 'b'); assert.equal(last.label, 'Bill Drill · 7 yd');
  assert.equal(Days.lastLibraryRun([{ runs: [{}] }]), null);
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/index.tsx'), 'utf8');
  assert.match(source, /lastLibraryRun\(sessions\)/); assert.doesNotMatch(source, /s\.runs/);
});

test('History: a drill run’s video is watched from the drill, not opened in the old editor (it would count the run twice)', async () => {
  const Days = require('../src/training/drillDays.ts');
  const run = { id: 'r1', drillId: 'bill', recordedAt: '2026-10-20T15:00:00Z', choices: { distance: '7' }, shotTimes: [1.3, 1.55, 1.8, 2.05, 2.3, 2.55], totalTime: 2.55, family: 'USPSA', notes: '' };
  const day = Days.addRun(Days.newDrillDay('d', '2026-10-20', 'LIVE_FIRE', run.recordedAt), run,
    { id: 'v1', asset: { uri: 'training-videos/v1.mov', name: 'IMG.MOV', storage: 'DOCUMENTS' }, durationMs: null, timing: { beepMs: 900 } });
  const h = harness('app/training.tsx', {}, { '@/training/videoAssets': {}, '@/ui/prefsStore': { readPref: () => null, writePref() {} },
    repo: { trainingReadWarnings: [], listTraining: async () => [day] } });
  await h.settle(); h.press('Show history');
  h.nodes().find(n => n.type === 'LibraryCard' && n.props.name === Days.historyTitle(day)).props.open(); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Video 1 · Bill Drill run, watch it from the drill'));
  assert.ok(!h.nodes().some(n => /^Video 1 ·/.test(n.props?.title ?? '')), 'no editor button for it');
});

// A scripted hands-at-sides draw (as in movementPhases.test.cjs), as the native tracker returns it: 60 frames a second.
function drawExtraction(beep = 1000, fps = 60, endMs = 2400) {
  const path = { strong: [[0, 0.05, 0.25], [0.2, 0.05, 0.25], [0.32, 0, 0.05], [0.38, 0, 0.05], [0.55, 0.15, -0.65], [0.8, 0.85, -0.85], [1.4, 0.85, -0.85]],
    support: [[0, -0.05, 0.25], [0.22, -0.05, 0.25], [0.55, 0.17, -0.62], [0.8, 0.85, -0.83], [1.4, 0.85, -0.83]] };
  const at = (p, t) => { if (t <= p[0][0]) return { x: p[0][1], y: p[0][2] }; for (let i = 1; i < p.length; i++) if (t <= p[i][0]) { const [t0, x0, y0] = p[i - 1], [t1, x1, y1] = p[i], k = (t - t0) / (t1 - t0); return { x: x0 + k * (x1 - x0), y: y0 + k * (y1 - y0) }; } const l = p.at(-1); return { x: l[1], y: l[2] }; };
  const img = q => ({ x: 0.5 + q.x * 0.25, y: 0.55 + q.y * 0.25, confidence: 0.9 }), frames = [];
  for (let ms = 0; ms <= endMs; ms += 1000 / fps) {
    const t = (ms - beep) / 1000;
    frames.push({ timestampMs: ms, width: 1080, height: 1920, mirrored: false, crowded: false, people: [{ confidence: 0.9, joints: {
      leftHip: img({ x: -0.05, y: 0 }), rightHip: img({ x: 0.05, y: 0 }), leftShoulder: img({ x: -0.05, y: -1 }), rightShoulder: img({ x: 0.05, y: -1 }),
      rightWrist: img(at(path.strong, t)), leftWrist: img(at(path.support, t)) } }] });
  }
  return { frames, durationMs: endMs, warnings: [], nativeRevision: 2 };
}

test('Movement breakdown: tracks the run’s video, times each movement, adds play buttons, and keeps it on the run', async () => {
  let extract = async (_s, endMs) => { assert.equal(endMs, 1000 + 1050 + 300, 'tracked up to just after the first shot'); return drawExtraction(); };
  const kept = [], marks = [];
  const props = { kind: 'draw', session: { asset: { uri: 'training-videos/v.mov' } }, beepMs: 1000, shotTimes: [1.05, 1.3], side: 'right',
    saved: undefined, onMarks: m => marks.push(m), onKeep: p => { kept.push(p); }, disabled: false };
  const h = harness('training/PhaseBreakdown.tsx', props, { './extractPose': { extractPoseUntil: (...args) => extract(...args) } });
  h.press('BREAK DOWN THE DRAW');
  for (let i = 0; i < 50 && !h.nodes().some(n => n.props?.title === 'KEEP ON THIS RUN'); i++) await h.settle();
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  for (const label of ['Reaction', 'To the grip', 'Out of the holster', 'Hands together', 'Press out', 'Sight to shot']) assert.match(row(label), /^\d\.\d\d s$/, label);
  assert.match(row('Reaction'), /^0\.(18|2[0-2]) s$/);
  assert.deepEqual(marks.at(-1).map(m => m.label), ['FIRST MOVE', 'GRIP', 'OUT OF THE HOLSTER', 'HANDS TOGETHER', 'ON TARGET']);
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^First version: the marks come from reasoned rules/.test(n.props.children)));
  h.press('KEEP ON THIS RUN'); await h.settle();
  assert.equal(kept.length, 1); assert.equal(kept[0].kind, 'draw'); assert.equal(kept[0].side, 'right');
  assert.equal(require('../src/training/movementPhases.ts').savedPhasesProblem(kept[0]), null);
  // The shooting hand is set in Profile and shown here; a hand changed after tracking clears the result (it can't be kept for the other hand).
  assert.equal(h.find(n => n.type === 'DataRow' && n.props.label === 'Shooting hand').props.value, 'Right');
  assert.ok(!h.nodes().some(n => n.type === 'Segmented' && n.props.options?.includes('LEFT')), 'no second hand switch here');
  h.press('BREAK DOWN THE DRAW');
  for (let i = 0; i < 50 && !h.nodes().some(n => n.props?.title === 'KEEP ON THIS RUN'); i++) await h.settle();
  props.side = 'left'; h.render();
  assert.ok(!h.nodes().some(n => n.props?.title === 'KEEP ON THIS RUN')); assert.deepEqual(marks.at(-1), []);
  // The installed build can't track at 60 frames a second yet: it says so plainly.
  extract = async () => { throw new Error('Unsupported local pose request.'); };
  h.press('BREAK DOWN THE DRAW');
  for (let i = 0; i < 10 && !h.nodes().some(n => n.type === 'Notice'); i++) await h.settle();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.children === 'Breaking down movements needs the next iPhone build of the app.'));
});

test('Drill sheet: a watched draw run offers the breakdown; kept breakdowns are saved on the run and averaged', async () => {
  const Days = require('../src/training/drillDays.ts'), P = require('../src/training/movementPhases.ts');
  const run = { id: 'r1', drillId: 'draw', recordedAt: '2026-10-20T15:00:00Z', choices: { start: 'competitionHolster', distance: '7' }, shotTimes: [1.05], totalTime: 1.05, family: 'USPSA', notes: '' };
  const phases = { kind: 'draw', version: 1, side: 'right', marks: [['beep', 1000], ['move', 1200], ['grip', 1350], ['clear', 1440], ['meet', 1530], ['onTarget', 1800], ['shot', 2050]].map(([key, ms]) => ({ key, ms, sure: true })) };
  const record = Days.addRun(Days.newDrillDay('d', '2026-10-20', 'LIVE_FIRE', run.recordedAt), run,
    { id: 'v1', asset: { uri: 'training-videos/v1.mov', name: 'IMG.MOV', storage: 'DOCUMENTS' }, durationMs: null, timing: { beepMs: 1000 } });
  const updates = [];
  const h = drillSheet('draw', { records: [record], hand: 'right', onUpdate: r => { updates.push(r); } });
  drillTab(h, 'RUNS');
  h.press('Watch run 1');
  const panel = h.child('PhaseBreakdown');
  assert.deepEqual([panel.kind, panel.beepMs, panel.shotTimes, panel.side], ['draw', 1000, [1.05], 'right']);
  await panel.onKeep(phases); await h.settle();
  assert.equal(updates[0].id, 'r1'); assert.deepEqual(updates[0].phases, phases);
  assert.equal(require('../src/training/drillLibrary.ts').libraryRunProblem(updates[0]), null);
  // With the breakdown saved, the drill shows your averages.
  const saved = { ...record, libraryRuns: [{ ...record.libraryRuns[0], phases }] };
  const w = drillSheet('draw', { records: [saved], hand: 'right', onUpdate() {} });
  drillTab(w, 'RUNS');
  const row = label => w.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.ok(w.nodes().some(n => n.props?.children === 'YOUR DRAW, BROKEN DOWN · 1 RUN'));
  assert.equal(row('Reaction'), '0.20 s'); assert.equal(row('To the grip'), '0.15 s'); assert.equal(row('Sight to shot'), '0.25 s');
  assert.ok(w.nodes().some(n => n.type === 'Copy' && / · draw broken down$/.test(n.props.children)));
  // A Bill Drill can have a draw breakdown; a sprint can't have any.
  const L = require('../src/training/drillLibrary.ts');
  assert.equal(L.phaseKindOf({ drillId: 'bill', choices: {} }), 'draw'); assert.equal(L.phaseKindOf({ drillId: 'draw', choices: { start: 'surrender' } }), null);
  assert.equal(L.phaseKindOf({ drillId: 'reload', choices: { mode: 'standing' } }), 'reload'); assert.equal(L.phaseKindOf({ drillId: 'sprint', choices: {} }), null);
  assert.equal(L.libraryRunProblem({ ...run, drillId: 'sprint', choices: { move: '10', direction: 'lateral' }, shotTimes: [1, 1.2, 2.5, 2.7], totalTime: 2.7, phases }), 'This drill has no such movement breakdown.');
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
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Your plans use these live-fire numbers. Change it in Profile · Practice type for plans.'));
  h.child('Segmented').onChange('DRY FIRE'); h.render();
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /No drill-library runs in dry fire yet/.test([].concat(n.props.children).join(''))));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Your plans use your live-fire numbers \(Profile · Practice type for plans\)\. These dry-fire numbers are for comparison\.$/.test(n.props.children)));
});

test('review: Your numbers survives a damaged saved move fit and opens on the planner context; par is left alone unless typed', async () => {
  const loaded = { calibrationContext: 'DRY_FIRE', performance: { drawTime: 1.5, reloadTime: 2, averageSplitTime: 0.25, transitionTime: 0.4, movementSpeed: 120, movementModel: { all: {} } } };
  // The profile arrives after the screen mounts.
  const props = { visible: true, records: [], profile: null, onClose() {} };
  const h = harness('training/YourNumbers.tsx', props);
  assert.equal(h.child('Segmented').value, 'LIVE FIRE');
  props.profile = loaded; h.render();
  assert.equal(h.child('Segmented').value, 'DRY FIRE', 'follows the practice type for plans once the profile loads');
  assert.ok(!h.nodes().some(n => n.props?.label === 'Move time (used for legs)'), 'damaged fit not shown, no crash');
  h.child('Segmented').onChange('LIVE FIRE'); h.render();
  props.visible = false; h.render(); props.visible = true; h.render();
  assert.equal(h.child('Segmented').value, 'DRY FIRE', 'opens on the practice type for plans again');
  assert.ok(h.nodes().some(n => n.type === 'DataRow' && n.props.label === 'Draw'), 'planner values shown for the planner context');

  let savedPar = 'not called';
  const e = drillSheet('bill', { pars: { 'bill|distance=7': 2.4 }, onSave: async (_r, par) => { savedPar = par; } });
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
  const e = drillSheet('blake');
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

test('ANALYZE shows points per target, where they come from, and the hit factor; EXPECTED HITS sets planned hits', () => {
  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { placeTarget } = require('../src/stage/targetPlacement.ts');
  const { createRoute } = require('../src/planning/route.ts');
  const { createLocalProfile } = require('../src/profile/model.ts');
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1080, depth: 1080 } }), objects: [createObject('start', 'start', 540, 1000)] };
  stage = placeTarget(stage, 'uspsa-metric-chl-v1', 'T1', { space: 'stage', x: 540, y: 748, z: 0 }).stage;
  const route = { ...createRoute('r'), positions: [{ id: 'P1', label: 'P1', position: { space: 'stage', x: 540, y: 1000, z: 0 }, visibleTargetIds: ['T1'], engagedTargetIds: ['T1'] }] };
  const plan = { route, loadout: { chamberLoaded: true, startingMagazineId: null, magazines: [] }, engagements: { T1: 2 } };
  const profile = { ...createLocalProfile().performance, hitModel: { paper: [{ yards: 7, runs: 3, count: 6, a: 5 / 6, c: 1 / 6, d: 0, miss: 0 }] } };
  const h = harness('planning/RouteAnalysis.tsx', { stage, plan, route, profile, ruleset: 'USPSA', powerFactor: 'major', edit() {} });
  h.press('Show points and hit factor');
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.equal(row('Scoring'), 'USPSA major (A 5, C 4, D 2)');
  assert.match(row('T1 · Paper'), /^7\.0 yd · AA 69% · AC 28% · CC 3% · 9\.7 of 10 pts$/);
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /your numbers, 3 runs at 7 yd/.test([].concat(n.props.children).join(''))));
  assert.match(row('Expected points'), /^9\.7 of 10 \(97%\)$/);
  assert.match(row('Estimated hit factor'), /^\d+\.\d\d( \(provisional\))?$/);
  // Rounds you have not set use the rule default (phase 3); rounds you set to zero still block the hit factor.
  const unplanned = harness('planning/RouteAnalysis.tsx', { stage, plan: { ...plan, engagements: { T1: 0 } }, route, profile, edit() {} });
  unplanned.press('Show points and hit factor');
  assert.equal(unplanned.nodes().find(n => n.type === 'DataRow' && n.props.label === 'Estimated hit factor').props.value, 'Set planned rounds for 1 target');
  const noData = harness('planning/RouteAnalysis.tsx', { stage, plan, route, profile: createLocalProfile().performance, edit() {} });
  noData.press('Show points and hit factor');
  assert.equal(noData.nodes().find(n => n.type === 'DataRow' && n.props.label === 'Estimated hit factor').props.value, 'Needs every target estimated');

  let change;
  const e = harness('planning/ExpectedHits.tsx', { steel: false, value: { outcome: 'AC' }, onChange: c => { change = c; } });
  const seg = opt => e.find(n => n.type === 'Segmented' && n.props.options.includes(opt)).props;
  assert.equal(seg('AA').value, 'AC'); assert.equal(seg('25%').value, 'MY NUMBERS');
  seg('AA').onChange('MY NUMBERS'); assert.deepEqual(change, { outcome: null });
  seg('25%').onChange('10%'); assert.deepEqual(change, { missRisk: 0.1 });
  const steel = harness('planning/ExpectedHits.tsx', { steel: true, value: undefined, onChange() {} });
  assert.ok(!steel.nodes().some(n => n.type === 'Segmented' && n.props.options.includes('AA')), 'steel: miss risk only');
});

test('review: ANALYZE names the real reason a hit factor is missing, marks it provisional with reasons, and labels cut faces', () => {
  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { placeTarget } = require('../src/stage/targetPlacement.ts');
  const { createRoute } = require('../src/planning/route.ts');
  const { createLocalProfile } = require('../src/profile/model.ts');
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1080, depth: 1080 } }), objects: [createObject('start', 'start', 540, 1000)] };
  stage = placeTarget(stage, 'uspsa-metric-chl-v1', 'T1', { space: 'stage', x: 540, y: 748, z: 0 }).stage;
  stage = placeTarget(stage, 'uspsa-metric-chl-v1', 'T2', { space: 'stage', x: 300, y: 748, z: 0 }).stage;
  const P1 = { id: 'P1', label: 'P1', position: { space: 'stage', x: 540, y: 1000, z: 0 }, visibleTargetIds: ['T1'], engagedTargetIds: ['T1'] };
  const profile = { ...createLocalProfile().performance, hitModel: { paper: [{ yards: 7, runs: 3, count: 6, a: 1, c: 0, d: 0, miss: 0 }] } };
  const row = (h, label) => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  const partRoute = { ...createRoute('r'), positions: [P1] };
  const a = harness('planning/RouteAnalysis.tsx', { stage, plan: { route: partRoute, loadout: { chamberLoaded: true, startingMagazineId: null, magazines: [] }, engagements: { T1: 2, T2: 2 } }, route: partRoute, profile, edit() {} });
  a.press('Show points and hit factor');
  assert.equal(row(a, 'Estimated hit factor'), '1 target is not in the route');
  const full = { ...partRoute, positions: [{ ...P1, visibleTargetIds: ['T1', 'T2'], engagedTargetIds: ['T1', 'T2'] }] };
  const cut = { ...stage, objects: stage.objects.map(o => o.id === 'T2' ? { ...o, faceCut: { ...o.faceCut, preset: 'upper' } } : o) };
  const b = harness('planning/RouteAnalysis.tsx', { stage: cut, plan: { route: full, loadout: { chamberLoaded: true, startingMagazineId: null, magazines: [] }, engagements: { T1: 1, T2: 2 } }, route: full, profile, edit() {} });
  b.press('Show points and hit factor');
  assert.match(row(b, 'Estimated hit factor'), /^\d+\.\d\d \(provisional\)$/);
  assert.ok(b.nodes().some(n => n.type === 'Copy' && /^Provisional: .*1 paper target with fewer than 2 rounds.*generic/.test([].concat(n.props.children).join(''))));
  assert.ok(b.nodes().some(n => n.type === 'DataRow' && n.props.label === 'T2 · Paper (cut face)'));
  assert.ok(b.nodes().some(n => n.type === 'Copy' && /^Not modelled yet:/.test([].concat(n.props.children).join(''))));
});

test('ANALYZE times the stage from your numbers, shows where each part came from, and plans reloads', () => {
  const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
  const { placeTarget } = require('../src/stage/targetPlacement.ts');
  const { createRoute } = require('../src/planning/route.ts');
  const { createLocalProfile } = require('../src/profile/model.ts');
  let stage = { ...createDefaultStage('USPSA', { size: { width: 1440, depth: 1080 } }), objects: [createObject('start', 'start', 100, 1000)] };
  for (const [id, x] of [['A', 160], ['B', 300], ['C', 1000]]) stage = placeTarget(stage, 'uspsa-metric-chl-v1', id, { space: 'stage', x, y: 748, z: 0 }).stage;
  const pos = (id, x, t) => ({ id, label: id, position: { space: 'stage', x, y: 1000, z: 0 }, visibleTargetIds: t, engagedTargetIds: t });
  const route = { ...createRoute('r'), positions: [pos('P1', 200, ['A', 'B']), pos('P2', 1000, ['C'])] };
  const plan = { route, engagements: { A: 4, B: 4, C: 4 }, loadout: { chamberLoaded: false, startingMagazineId: 'm1', magazines: [{ id: 'm1', capacity: 10, startingRounds: 10 }, { id: 'm2', capacity: 10, startingRounds: 10 }] } };
  const profile = { ...createLocalProfile().performance, shootingObservations: [{ difficultyModel: 'DISTANCE_ONLY', difficulty: 5, splitTime: 0.2, sampleCount: 2 }, { difficultyModel: 'DISTANCE_ONLY', difficulty: 15, splitTime: 0.4, sampleCount: 2 }] };
  let changed;
  const props = { stage, plan, route, profile, edit() {}, onRouteChange: r => { changed = r; } };
  const h = harness('planning/RouteAnalysis.tsx', props);
  h.press('Show time'); h.press('Show ammunition');
  const row = label => h.nodes().find(n => n.type === 'DataRow' && n.props.label === label)?.props.value;
  assert.match(row('Provisional total'), /^\d+\.\d\d s$/);
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /^Splits: your split curve for 3 targets\.$/.test([].concat(n.props.children).join(''))));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && /1 transition uses the generic transition \(0\.40 s, not measured\)/.test([].concat(n.props.children).join(''))));
  h.press('TIME BY POSITION');
  assert.ok(h.nodes().some(n => n.type === 'DataRow' && n.props.label === '1. P1'));
  h.press('Plan reloads around magazine capacity');
  assert.deepEqual(changed.reloads.map(r => [r.positionId, r.magazineId]), [['P2', 'm2']]);
  props.route = changed; props.plan = { ...plan, route: changed }; h.render();
  assert.ok(h.nodes().some(n => n.type === 'Notice' && /^1 reload added/.test(n.props.children)), 'the note shows with the route it planned');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Reload on the move into 2. P2'));
  props.route = { ...changed, reloads: [] }; h.render();
  assert.ok(!h.nodes().some(n => n.type === 'Notice' && /^1 reload added/.test(n.props.children)), 'a later change hides the old note');
});
