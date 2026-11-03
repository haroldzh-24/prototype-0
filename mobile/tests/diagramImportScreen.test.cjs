// Stage diagram import screen: three steps (PHOTO · CORNERS · SCALE), words, night-mode colours and closing.
// Runs the real component callbacks with lightweight host components; layout and gestures need a phone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);

function harness(entry, props = {}, overrides = {}) {
  const slots = [], cache = new Map(); let cursor = 0, changed = false, tree;
  const effects = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; changed = true; } }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useMemo(fn) { cursor++; return fn(); },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const kit = ['Action', 'Copy', 'Loading', 'Notice', 'Panel', 'ScreenHeader', 'Section', 'Segmented', 'ToolButton'];
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const requireLocal = id => {
      if (id in overrides) return overrides[id];
      if (id === 'react') return react;
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', TextInput: 'TextInput', Modal: 'Modal', ScrollView: 'ScrollView', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Linking: { openSettings() {} } };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'expo-modules-core') return { requireOptionalNativeModule: () => null, uuid: { v4: () => 'new-' + (++serial) } };
      if (id.endsWith('StorageProvider')) return { useRepository: () => overrides.repo };
      if (id.endsWith('ui/kit')) return { ...Object.fromEntries(kit.map(name => [name, name])), ui: {}, colors: {} };
      const target = path.resolve(path.dirname(file), id);
      if (fs.existsSync(target + '.ts')) return load(target + '.ts');
      return require(id);
    };
    new Function('require', 'module', 'exports', source)(requireLocal, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  }
  let serial = 0;
  const component = load(path.resolve(__dirname, '../src', entry)).default;
  function render() { for (let pass = 0; pass < 15; pass++) { cursor = 0; changed = false; tree = component(props); effects.splice(0).forEach(fn => fn()); if (!changed) break; } return tree; }
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => nodes(n));
    if (node.props?.visible === false) return [];
    return [node, ...nodes(node.props?.header), ...nodes(node.props?.action), ...nodes(node.props?.children)];
  }
  const find = predicate => { const result = nodes(tree).find(predicate); assert.ok(result, 'Missing UI node'); return result; };
  render();
  return { render, nodes: () => nodes(tree), find,
    press(title) { const node = find(n => typeof n.props.onPress === 'function' && (n.props.title === title || n.props.accessibilityLabel === title)); assert.ok(!node.props.disabled, title + ' is disabled'); node.props.onPress(); render(); },
    async settle() { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); render(); },
  };
}

const stage = () => { const s = require('../src/stage/defaults.ts').createDefaultStage(); s.stage = { width: 2000, depth: 2000 }; return s; };
const quad = () => [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const picture = name => ({ asset: { path: `diagram-imports/${name}.png`, name: name + '.png', mime: 'image/png', size: 10 }, width: 256, height: 256, page: 1, pageCount: 1 });
/** An aligned, calibrated, top-down drawing: it can go under the stage. */
const drawing = (name = 'drawing', changes = {}) => { const p = picture(name); return { version: 1, id: name, source: p.asset, sourceKind: 'image', page: p, rectified: p, aligned: p, alignment: { corners: quad(), rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } }, projection: 'top-down', origin: { x: 0, y: 0 }, calibration: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, inches: 256, evidence: 'grid', approximate: true }, proposals: [], ...changes }; };
const prefs = () => { const store = new Map(); return { store, readPref: k => store.get(k) ?? null, writePref: (k, v) => store.set(k, v) }; };
const screen = (props, overrides) => harness('diagramImport/DiagramImportScreen.tsx', props, { './assets': {}, './preparation': {}, './rasterReader': {}, '../ui/prefsStore': prefs(), ...overrides });

const titles = h => h.nodes().map(n => n.props.title).filter(Boolean);
const primaries = h => h.nodes().filter(n => n.props.variant === 'primary').map(n => n.props.title);
const rows = h => titles(h).filter(t => /^(✓ )?\d+ · /.test(t));
const field = (h, label) => h.find(n => n.props.label === label).props;
const choose = (h, option) => { h.find(n => n.type === 'Segmented' && n.props.options.includes(option)).props.onChange(option); h.render(); };
const segmentValue = (h, option) => h.find(n => n.type === 'Segmented' && n.props.options.includes(option)).props.value;
const has = (h, title) => h.nodes().some(n => n.props.title === title || n.props.accessibilityLabel === title);
const notices = h => h.nodes().filter(n => n.type === 'Notice').map(n => [n.props.children].flat().join(''));
const flat = node => !node ? '' : typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(flat).join('') : typeof node === 'object' ? flat(node.props?.children) : '';
const steps = h => flat(h.find(n => n.props.accessibilityRole === 'progressbar').props.children.filter(c => c?.type === 'Text'));
const currentStep = h => h.nodes().filter(n => n.type === 'Text' && n.props.style && typeof n.props.children === 'string' && /^( · )?\d (PHOTO|CORNERS|SCALE)/.test(n.props.children)).map(n => n.props.children.replace(' · ', ''));
const texts = h => h.nodes().flatMap(n => [n.props.title, n.props.label, n.props.accessibilityLabel, ...(n.props.options ?? []), ...[n.props.children].flat().filter(c => typeof c === 'string')]).filter(Boolean);
const image = h => h.find(n => n.type?.name === 'DocumentImage').props;

test('three steps PHOTO · CORNERS · SCALE with one orange action each, Top-down plan by default, and the crop folded into CORNERS', async () => {
  const asset = { path: 'diagram-imports/source.pdf', name: 'Printed briefing.pdf', mime: 'application/pdf', size: 100 }, page = { asset: { ...asset, path: 'diagram-imports/page.png', mime: 'image/png' }, width: 1000, height: 500, page: 1, pageCount: 4 };
  const stored = [], applied = [], pages = [], alignments = [], opened = []; let closed = 0;
  const props = { visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() { closed++; props.visible = false; }, apply: d => applied.push(d) };
  const h = screen(props, { repo: { loadDiagramImports: async () => [], loadDiagramImportsReport: async () => ({ drafts: [], damagedIds: [] }), saveDiagramImport: async (id, d) => stored.push(JSON.parse(JSON.stringify(d))) },
    './assets': { pickDocument: async () => ({ asset, kind: 'pdf' }), assetUri: async () => '', openOriginal: async a => opened.push(a) },
    './preparation': { preparePage: async (source, n) => { pages.push(n); return { page: { ...page, page: n } }; }, alignPage: async (p, alignment) => { alignments.push(alignment); return { ...p, asset: { ...p.asset, path: 'diagram-imports/aligned-' + alignments.length + '.png' } }; } } });
  await h.settle();
  assert.equal(h.find(n => n.type === 'ScreenHeader').props.title, 'Import stage diagram');
  assert.equal(steps(h), '1 PHOTO · 2 CORNERS · 3 SCALE'); assert.deepEqual(currentStep(h), ['1 PHOTO']);
  assert.deepEqual(primaries(h), ['NEXT']); assert.ok(h.find(n => n.props.title === 'NEXT').props.disabled); assert.ok(!has(h, 'BACK'));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'Choose a drawing to start.'), 'the prerequisite shows before NEXT');
  assert.ok(['CHOOSE FROM PHOTOS', 'IMPORT PDF OR IMAGE', 'PHOTOGRAPH PAPER'].every(t => has(h, t)));

  h.press('IMPORT PDF OR IMAGE'); await h.settle();
  assert.equal(stored[0].projection, 'top-down', 'Top-down plan is picked by default'); assert.equal(stored[0].page, undefined); assert.equal(applied.length, 0);
  assert.equal(steps(h), '1 PHOTO ✓ · 2 CORNERS · 3 SCALE'); assert.ok(!h.find(n => n.props.title === 'NEXT').props.disabled);
  h.press('OPEN ORIGINAL FILE'); await h.settle(); assert.deepEqual(opened, [asset]);
  field(h, 'PDF page (1–4)').change(3); h.render(); h.press('SHOW PAGE'); await h.settle(); assert.deepEqual(pages, [1, 3]);

  h.press('NEXT');
  assert.deepEqual(currentStep(h), ['2 CORNERS']); assert.deepEqual(primaries(h), ['NEXT']); assert.ok(has(h, 'BACK'));
  assert.ok(!has(h, 'CORNERS'), 'no separate layout step: CROP (OPTIONAL) is part of CORNERS');
  assert.equal(h.find(n => n.type === 'Section' && n.props.title === 'Crop (optional)').type, 'Section');
  choose(h, '2 TOP RIGHT'); image(h).tap({ x: .9, y: .05 }); h.render();
  assert.equal(h.nodes().find(n => n.type === 'Text' && /^TAP PLACES CORNER 2/.test(n.props.children)).props.children, 'TAP PLACES CORNER 2 · TOP RIGHT', 'the tap mode is on screen');
  h.press('CROP'); await h.settle(); assert.equal(alignments.length, 1); assert.deepEqual(alignments[0].corners[1], { x: .9, y: .05 }); assert.deepEqual(alignments[0].crop, { x: 0, y: 0, width: 1, height: 1 });
  image(h).tap({ x: .1, y: .2 }); h.render(); h.press('Done cropping');
  h.press('NEXT'); await h.settle();
  assert.equal(alignments.length, 2, 'NEXT aligns the page with its crop'); assert.deepEqual(alignments[1].crop, { x: .1, y: .2, width: .9, height: .8 }); assert.deepEqual(alignments[1].corners, quad());

  assert.deepEqual(currentStep(h), ['3 SCALE']); assert.equal(steps(h), '1 PHOTO ✓ · 2 CORNERS ✓ · 3 SCALE');
  assert.deepEqual(primaries(h), ['ADD ACCEPTED ELEMENTS TO STAGE']); assert.ok(has(h, 'Back to corners'));
  assert.equal(segmentValue(h, 'TOP-DOWN PLAN'), 'TOP-DOWN PLAN'); assert.ok(h.find(n => n.type === 'Segmented' && n.props.options.includes('TOP-DOWN PLAN')).props.options.includes('PERSPECTIVE OR ISOMETRIC · REFERENCE ONLY'));
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === 'To add elements: confirm the scale · accept at least one element.'));
  h.press('CONFIRM SCALE'); h.press('ADD MISSING ELEMENT'); h.press('ENTER NUMBERS');
  field(h, 'Element X (%)').change(NaN); h.render(); assert.ok(!h.nodes().some(n => n.type?.name === 'ProposalOverlay'));
  field(h, 'Element X (%)').change(50); h.render(); assert.ok(h.nodes().some(n => n.type?.name === 'ProposalOverlay'));
  assert.deepEqual(rows(h), ['1 · Cardboard target · Not reviewed']); assert.ok(h.find(n => n.props.title === 'ADD ACCEPTED ELEMENTS TO STAGE').props.disabled);
  h.press('Accept this element'); assert.deepEqual(rows(h), ['1 · Cardboard target · Accepted']);
  h.press('ADD ACCEPTED ELEMENTS TO STAGE'); await h.settle();
  assert.equal(applied.length, 1); assert.equal(applied[0].objects.length, props.stage.objects.length + 1); assert.deepEqual(applied[0].objects.slice(0, -1), props.stage.objects);
  assert.ok(notices(h).some(n => n.startsWith('Added 1 element to the stage.')));

  field(h, 'Known distance').change(240); h.render(); assert.ok(h.find(n => n.props.title === 'ADD ACCEPTED ELEMENTS TO STAGE').props.disabled, 'changing the distance needs the scale confirmed again');
  h.press('CONFIRM SCALE'); h.press('Back to corners');
  assert.ok(notices(h).some(n => n.includes('clears the scale and the elements')), 'the consequence shows before the edit');
  h.press('Rotate the page clockwise, now 0 degrees'); assert.equal(steps(h), '1 PHOTO ✓ · 2 CORNERS · 3 SCALE');
  h.press('Close import'); assert.equal(closed, 0, 'unsaved changes that cannot become a drawing ask first');
  h.press('CLOSE WITHOUT SAVING'); assert.equal(closed, 1); assert.equal(stored.at(-1).proposals.length, 1);
});

test('closing: unchanged closes, a confirmed top-down scale saves the drawing (said once), other changes ask', async () => {
  const p = prefs(), saved = [], backdrops = []; let closed = 0, fail = false;
  const rough = drawing('rough', { calibration: undefined });
  const props = { visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() { closed++; props.visible = false; }, apply() {}, onBackdrop: b => backdrops.push(b) };
  const h = screen(props, { '../ui/prefsStore': p, './assets': { assetUri: async () => 'file:///drawing.png' },
    repo: { loadDiagramImports: async () => saved.length ? [saved.at(-1)] : [], loadDiagramImportsReport: async () => ({ drafts: [drawing(), rough], damagedIds: [] }), diagramAssetPathsInUse: async () => new Set(),
      saveDiagramImport: async (id, d) => { if (fail) throw new Error('This stage already has 20 document references. Delete one to save another.'); saved.push(JSON.parse(JSON.stringify(d))); } } });
  const reopen = async () => { props.visible = true; h.render(); await h.settle(); };
  await h.settle();
  h.press('Close import'); assert.equal(closed, 1, 'nothing open: closes at once'); await reopen();
  h.press('Open reference drawing.png'); h.press('Close import'); assert.equal(closed, 2); assert.equal(saved.length, 0, 'unchanged: nothing to save'); await reopen();

  h.press('Open reference drawing.png'); field(h, 'Origin X (yd)').change(1); h.render();
  h.press('Close import'); await h.settle();
  await h.settle(); assert.equal(closed, 3); assert.equal(saved.length, 1); assert.equal(saved[0].origin.x, 36, 'origin is entered in yards, stored in inches'); assert.ok(!has(h, 'KEEP EDITING'));
  assert.ok(has(h, 'Saved. The drawing appears under the stage. Dismiss.'), 'told once, over the editor'); assert.equal(p.store.get('psp.importAutoSaveHint'), '1');
  assert.equal(backdrops.at(-1).left, 36, 'the saved drawing is handed to the editor'); assert.equal(backdrops.at(-1).uri, 'file:///drawing.png');
  h.press('Saved. The drawing appears under the stage. Dismiss.'); assert.ok(!has(h, 'Saved. The drawing appears under the stage. Dismiss.'));
  await reopen(); h.press('Open reference drawing.png'); field(h, 'Origin X (yd)').change(2); h.render(); h.press('Close import'); await h.settle();
  assert.equal(closed, 4); assert.equal(saved.length, 2); assert.ok(!has(h, 'Saved. The drawing appears under the stage. Dismiss.'), 'only the first time');

  await reopen(); h.press('Open reference rough.png'); field(h, 'Origin X (yd)').change(1); h.render(); h.press('Close import');
  assert.equal(closed, 4); assert.ok(notices(h).some(n => n.includes('once it has: a confirmed scale')));
  assert.ok(['KEEP EDITING', 'SAVE AND CLOSE', 'CLOSE WITHOUT SAVING'].every(t => has(h, t)));
  h.press('KEEP EDITING'); assert.ok(!has(h, 'KEEP EDITING')); assert.equal(closed, 4);
  h.press('Close import'); h.press('SAVE AND CLOSE'); await h.settle(); assert.equal(closed, 5); assert.equal(saved.length, 3); assert.equal(saved[2].id, 'rough');

  await reopen(); h.press('Open reference drawing.png'); choose(h, 'PERSPECTIVE OR ISOMETRIC · REFERENCE ONLY'); h.press('Close import');
  assert.equal(closed, 5, 'a reference-only drawing cannot go under the stage, so closing asks'); assert.ok(notices(h).some(n => n.includes('Top-down plan picked')));
  h.press('CLOSE WITHOUT SAVING'); assert.equal(closed, 6); assert.equal(saved.length, 3);

  fail = true; await reopen(); h.press('Open reference drawing.png'); field(h, 'Origin Y (yd)').change(1); h.render(); h.press('Close import'); await h.settle();
  assert.equal(closed, 6, 'a failed automatic save keeps the import open'); assert.ok(notices(h).some(n => n.includes('20 document references'))); assert.ok(has(h, 'CLOSE WITHOUT SAVING'));
  h.press('CLOSE WITHOUT SAVING'); assert.equal(closed, 7);
});

test('elements: detection, words for review states and scale evidence, batch accept/reject and calibrated additive commit', async () => {
  const { render } = require('./fixtures/diagram-recognition/render.cjs'), raster = render(require('./fixtures/diagram-recognition/clean-basic.json'));
  const draft = drawing('Synthetic', { calibration: undefined, rectified: undefined, origin: { x: 20, y: 20 } }), saved = [], applied = [];
  const h = screen({ visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() {}, apply: d => applied.push(d) }, { repo: { loadDiagramImports: async () => [draft], loadDiagramImportsReport: async () => ({ drafts: [draft], damagedIds: [] }), saveDiagramImport: async (id, d) => saved.push(d) }, './rasterReader': { readRaster: async () => raster } });
  await h.settle(); h.press('Open reference Synthetic.png'); assert.deepEqual(currentStep(h), ['3 SCALE']);
  async function detect() { h.press('DETECT SHAPES (EXPERIMENTAL)'); for (let i = 0; i < 100 && has(h, 'CANCEL DETECTION'); i++) { await new Promise(resolve => setTimeout(resolve, 10)); h.render(); } assert.ok(!has(h, 'CANCEL DETECTION')); }
  await detect();
  assert.equal(rows(h).length, 3); assert.ok(rows(h).every(t => t.endsWith(' · Not reviewed')), 'unreviewed detections are not shown as Rejected');
  assert.ok(h.nodes().some(n => n.type === 'Copy' && n.props.children === '3 elements · 0 accepted · 0 rejected · 3 not reviewed'));
  assert.ok(h.find(n => n.props.title === 'ADD ACCEPTED ELEMENTS TO STAGE').props.disabled);
  h.press(rows(h).find(t => t.startsWith('2 · '))); assert.ok(h.find(n => n.props.accessibilityLabel === 'Accept this element').props.disabled, 'an unclassified shape cannot be accepted');
  assert.ok(texts(h).some(t => /^Detected \w+ · heuristic confidence \d+% · scale at detection not set · page 1/.test(t)));
  choose(h, 'PLATE'); h.press('ENTER NUMBERS'); field(h, 'Outline width on the drawing (%)').change(20); h.render(); field(h, 'Rotation (°)').change(30); h.render();
  h.press('ADD MISSING ELEMENT'); await detect(); assert.equal(rows(h).length, 4); assert.ok(rows(h).includes('2 · Steel plate · Not reviewed'));
  h.press('SELECT SEVERAL'); h.press(rows(h)[0]); h.press(rows(h)[1]); assert.ok(rows(h)[0].startsWith('✓ 1 · '));
  h.press('ACCEPT SELECTED'); h.press('CLEAR SELECTION'); h.press(rows(h)[2]); h.press('REJECT SELECTED'); h.press('Done selecting several');
  assert.deepEqual(rows(h).map(t => t.split(' · ').at(-1)), ['Accepted', 'Accepted', 'Rejected', 'Not reviewed']);
  assert.deepEqual(h.find(n => n.type === 'Segmented' && n.props.options.includes('GRID')).props.options, ['GRID', 'LABELLED DIMENSION', 'YOUR MEASUREMENT']);
  assert.equal(segmentValue(h, 'GRID'), 'YOUR MEASUREMENT'); choose(h, 'LABELLED DIMENSION');
  h.press('CONFIRM SCALE'); assert.ok(texts(h).some(t => /^Scale confirmed · A to B is [\d.]+ yd · approximate · Labelled dimension$/.test(t)));
  for (const raw of ['labeled-dimension', 'uncalibrated', 'calibrated-approximate', '/ Selected', 'cardboardTarget', 'Error:']) assert.ok(!texts(h).some(t => t.includes(raw)), 'no raw value on screen: ' + raw);
  h.press('ADD ACCEPTED ELEMENTS TO STAGE'); await h.settle();
  assert.equal(applied.length, 1); assert.equal(applied[0].objects.length, stage().objects.length + 2);
  assert.equal(saved[0].proposals[1].recognition.scaleStatus, 'uncalibrated'); assert.equal(saved[0].proposals[1].extent.width, .2); assert.equal(applied[0].objects.at(-1).geometry.faceWidth, 12);
  assert.equal(saved[0].calibration.evidence, 'labeled-dimension'); assert.equal(saved[0].proposals[2].reviewed, true); assert.equal(saved[0].proposals[2].accepted, false); assert.ok(!saved[0].proposals[3].reviewed, 'a manual element starts not reviewed');
});

test('recognition cancellation and the reference-only guard leave existing review decisions untouched', async () => {
  const draft = drawing('Cancel', { projection: 'perspective', calibration: undefined }); let aborted = false;
  const h = screen({ visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() {}, apply() { assert.fail('applied'); } }, { repo: { loadDiagramImports: async () => [draft], loadDiagramImportsReport: async () => ({ drafts: [draft], damagedIds: [] }) },
    './rasterReader': { readRaster: async (page, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(Error('Recognition cancelled.')); })) } });
  await h.settle(); h.press('Open reference Cancel.png');
  assert.ok(h.find(n => n.props.title === 'DETECT SHAPES (EXPERIMENTAL)').props.disabled); assert.ok(notices(h).some(n => n.startsWith('Reference only')));
  choose(h, 'TOP-DOWN PLAN'); h.press('ADD MISSING ELEMENT');
  const start = h.find(n => n.props.title === 'DETECT SHAPES (EXPERIMENTAL)').props.onPress; start(); start(); h.render();
  h.press('CANCEL DETECTION'); await h.settle(); assert.ok(aborted); assert.equal(rows(h).length, 1); assert.ok(!has(h, 'CANCEL DETECTION'));
});

for (const failure of ['Image exceeds decoder limits.', 'Unsupported PDF raster.', 'Recognition interrupted.']) test('experimental detection recovers without losing manual elements: ' + failure, async () => {
  const draft = drawing('Recover', { calibration: undefined }); let writes = 0; const before = JSON.stringify(draft);
  const h = screen({ visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() {}, apply() { assert.fail('Detection must not apply geometry'); } }, { repo: { loadDiagramImports: async () => [draft], loadDiagramImportsReport: async () => ({ drafts: [draft], damagedIds: [] }), saveDiagramImport: async () => { writes++; } }, './rasterReader': { readRaster: async () => { throw Error(failure); } } });
  await h.settle(); h.press('Open reference Recover.png'); h.press('ADD MISSING ELEMENT'); h.press('DETECT SHAPES (EXPERIMENTAL)'); await h.settle();
  assert.equal(writes, 0); assert.ok(h.nodes().some(n => n.type === 'Notice' && n.props.tone === 'error' && n.props.children === failure + ' You can still add elements by hand; nothing on the stage changed.'));
  assert.equal(JSON.stringify(draft), before); assert.equal(rows(h).length, 1); h.press('ADD MISSING ELEMENT'); assert.equal(rows(h).length, 2); assert.ok(!has(h, 'CANCEL DETECTION'));
});

test('references: open, delete with a confirmation, and remove unreadable ones from the PHOTO step', async () => {
  const kept = drawing('kept'), gone = drawing('gone', { calibration: undefined }), deleted = [], removedFiles = [];
  let drafts = [kept, gone], damaged = ['broken'];
  const h = screen({ visible: true, stageId: 's', stage: stage(), family: 'USPSA', close() {}, apply() {} }, { './assets': { deleteDocumentFiles: async paths => removedFiles.push(...paths) },
    repo: { loadDiagramImportsReport: async () => ({ drafts, damagedIds: damaged }), deleteDiagramImport: async (s, id) => { deleted.push(id); drafts = drafts.filter(d => d.id !== id); damaged = damaged.filter(d => d !== id); }, diagramAssetPathsInUse: async () => new Set(['diagram-imports/kept.png']) } });
  await h.settle();
  assert.equal(h.find(n => n.type === 'Section' && n.props.title.startsWith('Saved references')).props.title, 'Saved references · 2 of 20');
  assert.ok(texts(h).includes('Image · Scale confirmed'));
  h.press('Delete reference gone.png'); assert.ok(notices(h).some(n => n.startsWith('Delete this reference')));
  h.press('Confirm deleting reference gone.png'); await h.settle(); assert.deepEqual(deleted, ['gone']); assert.ok(removedFiles.includes('diagram-imports/gone.png'));
  assert.ok(notices(h).some(n => n.includes('1 saved reference can’t be read')));
  h.press('REMOVE UNREADABLE REFERENCES'); await h.settle(); assert.deepEqual(deleted, ['gone', 'broken']); assert.ok(notices(h).includes('1 unreadable reference removed.'));
  h.press('Open reference kept.png'); assert.deepEqual(currentStep(h), ['3 SCALE ✓']); h.press('SHOW ORIGINAL PAGE'); assert.ok(has(h, 'SHOW STRAIGHTENED DRAWING'));
});

test('the import screen follows night mode: palette colours, kit parts, Segmented choices and one primary per step', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/diagramImport/DiagramImportScreen.tsx'), 'utf8');
  assert.doesNotMatch(code, /['"`]#[0-9A-Fa-f]{3,8}['"`]/, 'no fixed colours');
  assert.match(code, /useThemeMode\(\)/); assert.doesNotMatch(code, /StyleSheet\.create\(/); assert.match(code, /themed\(c =>/);
  assert.doesNotMatch(code, / \/ Selected| \/ Not selected/, 'Segmented instead of text suffixes');
  for (const part of ['Action', 'Segmented', 'Notice', 'Section', 'Panel', 'ScreenHeader']) assert.match(code, new RegExp('<' + part + '\\b'), part);
  assert.equal(code.match(/variant="primary"/g).length, 2, 'NEXT on steps 1–2, ADD ACCEPTED ELEMENTS TO STAGE on step 3');
  assert.doesNotMatch(code, /Stage builder|Stage Designer|title="Close import"|'Reference: '/);
});

test('diagram import speaks to people, not developers', () => {
  const dir = path.join(__dirname, '../src/diagramImport');
  for (const file of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /rebuilt|development client|dev client/i, file);
  assert.match(fs.readFileSync(path.join(dir, 'preparation.ts'), 'utf8'), /'This needs the next version of the app on your iPhone/);
});

test('import flow rules: close decision, review states, step marks and prerequisites', async () => {
  const F = require('../src/diagramImport/importFlow.ts'), { acceptSelection } = require('../src/diagramImport/proposalEdits.ts'), { validateReconstruction } = require('../src/diagramImport/model.ts');
  const d = drawing();
  assert.equal(F.closeDecision(null, null), 'close'); assert.equal(F.closeDecision(d, JSON.stringify(d)), 'close');
  assert.equal(F.closeDecision({ ...d, origin: { x: 1, y: 0 } }, JSON.stringify(d)), 'save');
  assert.equal(F.closeDecision({ ...d, calibration: undefined }, JSON.stringify(d)), 'ask');
  assert.equal(F.closeDecision({ ...d, projection: 'perspective' }, JSON.stringify(d)), 'ask');
  assert.equal(F.closeDecision({ ...d, aligned: undefined }, null), 'ask');
  assert.equal(F.closeDecision(d, null), 'save', 'a never-saved drawing with a confirmed scale is saved too');
  assert.equal(F.reviewStatus({ accepted: false }), 'Not reviewed'); assert.equal(F.reviewStatus({ accepted: false, reviewed: true }), 'Rejected'); assert.equal(F.reviewStatus({ accepted: true }), 'Accepted');
  assert.deepEqual(F.stepParts([true, false, false]), ['1 PHOTO ✓', '2 CORNERS', '3 SCALE']);
  assert.deepEqual(F.stepsDone({ ...d, calibration: undefined }), [true, true, false]);
  assert.deepEqual(F.addNeeds({ ...d, projection: 'unknown', calibration: undefined }), ['pick Top-down plan', 'confirm the scale', 'accept at least one element']);
  assert.deepEqual(F.drawingNeeds({ ...d, aligned: undefined, calibration: undefined }), ['aligned corners', 'a confirmed scale']);
  assert.equal(F.referenceSummary({ ...d, proposals: [{ accepted: true }, { accepted: false }] }), 'Scale confirmed · 1 of 2 elements accepted');
  assert.equal(F.referenceSummary({ ...d, projection: 'perspective' }), 'Reference only');
  assert.equal(F.proposalTypeLabel('unknown'), 'Unclassified shape'); assert.equal(F.proposalTypeLabel('start'), 'Start position'); assert.equal(F.errorText(new Error('Nope.')), 'Nope.');
  const p = { id: 'p', type: 'wall', position: { x: .1, y: .1 }, end: { x: .2, y: .1 }, rotation: 0, accepted: false, approximate: true, notes: '', source: 'manual' };
  assert.deepEqual(acceptSelection([p], ['p'], false).map(x => [x.accepted, x.reviewed]), [[false, true]], 'a batch rejection is a review');
  assert.doesNotThrow(() => validateReconstruction({ ...d, proposals: [{ ...p, reviewed: true }] })); assert.doesNotThrow(() => validateReconstruction({ ...d, proposals: [p] }), 'drafts saved before the field still load');
  assert.throws(() => validateReconstruction({ ...d, proposals: [{ ...p, reviewed: 'yes' }] }));
});
