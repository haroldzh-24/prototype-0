// UI cohesion phase 2 (the editor frame): five fixed slots, the BUILD badge and CHECK, ADD · IMPORT · CHECK · •••, one
// way to ADD, the PARTIAL ring, mode chips, one selection bar for 2D and 3D, ••• with only the step's settings and
// Back, the kit's buttons, and undo instead of confirm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { harness } = require('./harness.cjs');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const W = require('../src/ui/words.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { createPlan } = require('../src/planning/model.ts');
const { createRoute } = require('../src/planning/route.ts');
const P = require('../src/stage/partialTargets.ts');
const L = require('../src/stage/targetLayers.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');

const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
const plan = route => ({ ...createPlan(), ...(route ? { route } : {}) });
const editor = (route, overrides = {}, document = createDefaultStage('USPSA'), family = 'USPSA') =>
  harness('editor/StageBuilder.tsx', { initial: { id: 's', name: 'Stage 3', matchId: 'm', document, plan: plan(route) }, targetFamily: family }, overrides);
const tree = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(tree) : [n, ...tree(n.props?.children), ...tree(n.props?.action)];
/** The document's objects, from whichever view is showing (the 2D plan or 3D). */
const objects = h => (h.nodes().find(n => n.type === 'StageViewport') ?? h.find(n => n.type === 'Stage3DView')).props.stage.objects;
const titlesIn = node => tree(node).filter(n => n.type === 'ToolButton' || n.type === 'Action').map(n => n.props.title);
const toolBar = h => titlesIn(h.find(n => n.type === 'ToolBar'));
const sheet = h => h.find(n => n.type === 'EditorSheet' && n.props.visible);
const sheetTitles = h => titlesIn(sheet(h).props.children);
const closeSheet = h => { sheet(h).props.close(); h.render(); };
const at = (x, y) => ({ space: 'stage', x, y, z: 0 });
const select = (h, id) => { h.child('StageViewport').onSelect(id); h.render(); };
const firstPaper = h => objects(h).find(o => o.type === 'cardboardTarget');

test('five fixed slots: header, step bar with badges, canvas, selection bar, tool bar; no STAGE CHECK or view-switch row', () => {
  const route = { ...createRoute('r'), positions: [] };
  const document = createDefaultStage('USPSA');
  const targets = document.objects.filter(o => o.type === 'cardboardTarget');
  route.positions = [{ id: 'p', label: 'P1', position: at(100, 300), visibleTargetIds: [], engagedTargetIds: [targets[0].id] }];
  const h = editor(route, {}, document);
  const slots = h.nodes().filter(n => ['EditorHeader', 'StepBar', 'ToolBar'].includes(n.type)).map(n => n.type);
  assert.deepEqual(slots, ['EditorHeader', 'StepBar', 'ToolBar'], 'header, step bar and tool bar, in that order');
  assert.deepEqual(titlesIn(h.find(n => n.type === 'StepBar')), ['BUILD', 'PLAN', 'WALK']);
  const planStep = h.find(n => n.props?.title === 'PLAN').props;
  assert.equal(planStep.badge, '1/3', 'PLAN counts the targets planned (routeTargetCoverage)');
  assert.equal(planStep.accessibilityLabel, 'Plan the route. 1 of 3 targets planned');
  assert.ok(!h.nodes().some(n => /STAGE CHECK/.test(n.props?.title ?? '')), 'STAGE CHECK row is gone');
  // The view switch sits on the canvas (absolute, top left), not in a row of its own.
  const view = h.find(n => n.props?.accessibilityLabel === 'View');
  assert.equal(view.props.style.position, 'absolute');
  select(h, targets[0].id);
  assert.ok(h.child('SelectionBar'), 'the selected object gets the selection bar');
  // The plan's own status rows (PATH · ENGAGE · REVIEW · AREAS, NO ROUTE YET) are gone from PLAN too.
  h.press('PLAN');
  assert.deepEqual(toolBar(h), ['AREAS', 'ROUTE', 'ANALYZE', '•••']);
  assert.ok(!h.nodes().some(n => typeof n.props?.children === 'string' && /^(NO ROUTE YET|ROUTE\n)/.test(n.props.children)), 'route status moved into ROUTE');
  h.press('ROUTE');
  assert.match(tree(sheet(h).props.children).find(n => n.type === 'Copy').props.children, /^ROUTE\n.* · 1 position · 1\/3 targets planned/);
});

test('BUILD: ADD · IMPORT · CHECK · •••; the stage check opens from CHECK; SELECT and DRAW are gone', () => {
  const findings = [{ severity: 'safety', code: 'S', rule: '2.1.3', objectIds: [], message: 'Steel too close' }, { severity: 'rule', code: 'R', rule: '', objectIds: [], message: 'Rule' }];
  const h = editor(undefined, { '@/rules/stageCheck': { checkStage: () => findings } });
  assert.deepEqual(toolBar(h), ['ADD', 'IMPORT', 'CHECK', '•••']);
  for (const gone of ['SELECT', 'DRAW', 'START']) assert.ok(!h.nodes().some(n => n.props?.title === gone), gone + ' is gone');
  assert.deepEqual([h.find(n => n.props?.title === 'BUILD').props.badge, h.find(n => n.props?.title === 'BUILD').props.badgeTone], ['2', 'danger']);
  h.press('CHECK');
  assert.equal(sheet(h).props.title, 'Stage check');
  assert.ok(tree(sheet(h).props.children).some(n => n.props?.children === 'Steel too close'), 'the same findings');
  closeSheet(h);
  h.press('IMPORT'); assert.equal(h.child('DiagramImportScreen').visible, true, 'IMPORT opens the stage diagram import');
});

test('ADD is the same from the button and from press and hold: pick, place until DONE, the last one stays selected', () => {
  const choice = { kind: 'target', presetId: 'uspsa-metric-chl-v1', noShoot: false };
  // From ADD: pick, then every tap places one; each new one is selected; DONE keeps the last.
  let h = editor(); const before = objects(h).length;
  h.press('ADD'); assert.equal(h.child('RadialAddMenu').at.x, 0, 'opens at the canvas centre'); h.child('RadialAddMenu').onChoose(choice); h.render();
  assert.equal(h.child('StageViewport').tool, 'target'); assert.equal(objects(h).length, before, 'nothing placed until a tap');
  h.child('StageViewport').onPlace(at(100, 150)); h.render(); const first = h.child('StageViewport').selectedId;
  h.child('StageViewport').onPlace(at(160, 150)); h.render(); const second = h.child('StageViewport').selectedId;
  assert.equal(objects(h).length, before + 2); assert.notEqual(first, second);
  assert.deepEqual(toolBar(h), ['ADD'], 'ADD stays on while placing (tap it to pick something else)');
  h.press('DONE');
  assert.equal(h.child('StageViewport').tool, 'select'); assert.equal(h.child('StageViewport').selectedId, second);
  assert.ok(h.child('SelectionBar'), 'the last placed is selected, with its actions');
  // From press and hold: the same, plus the first one goes where the finger was.
  h = editor();
  h.child('StageViewport').onLongPress(at(200, 160), { x: 120, y: 90 }); h.render();
  h.child('RadialAddMenu').onChoose(choice); h.render();
  assert.equal(h.child('StageViewport').tool, 'target', 'press and hold keeps placing too');
  const held = objects(h).find(o => o.id === h.child('StageViewport').selectedId);
  assert.deepEqual([held.position.x, held.position.y], [200, 160]);
  h.child('StageViewport').onPlace(at(260, 160)); h.render(); const last = h.child('StageViewport').selectedId;
  h.press('DONE'); assert.equal(h.child('StageViewport').selectedId, last);
  // A wall: DONE selects the last segment drawn.
  h = editor();
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'wall' }); h.render();
  h.child('StageViewport').onDraw('start', at(100, 100)); h.render(); h.child('StageViewport').onDraw('commit', at(200, 100)); h.render();
  const wall = objects(h).filter(o => o.type === 'wall').at(-1);
  h.press('DONE'); assert.equal(h.child('StageViewport').selectedId, wall.id);
});

test('partial targets: hard cover, half targets, a hostage and doubles, placed from the stage model with their cover set', () => {
  const presets = require('../src/stage/targetPresets.ts');
  const uspsa = presets.targetPreset('uspsa-metric-chl-v1'), pcsl = presets.presetsForFamily('PCSL').find(p => p.type === 'cardboardTarget');
  assert.deepEqual(P.partialChoices(uspsa).map(c => c.label), ['HEAD ONLY', 'TOP OPEN', 'OPEN TOP LEFT', 'OPEN TOP RIGHT', 'CENTRE STRIP',
    'UPPER PORTION', 'LOWER PORTION', 'LEFT PORTION', 'RIGHT PORTION', 'HOSTAGE', 'DOUBLES']);
  assert.deepEqual(P.partialChoices(pcsl).map(c => c.label), ['UPPER PORTION', 'LOWER PORTION', 'LEFT PORTION', 'RIGHT PORTION', 'HOSTAGE', 'DOUBLES'],
    'hard cover only on the USPSA torso target; half targets, HOSTAGE and DOUBLES on any paper target');
  assert.ok(!P.coverFits(presets.targetPreset('uspsa-classic-chl-v1')), 'the IPSC (classic) outline has no torso landmarks');
  assert.deepEqual(P.partialChoices(presets.targetPreset('uspsa-popper-42-ss-v1')), [], 'steel has no partial versions');
  // The cover presets are the existing ones; nothing new is invented.
  assert.deepEqual(P.partialChoices(uspsa).filter(c => c.partial.kind === 'cover').map(c => c.partial.preset), L.hardCoverPresets.map(p => p.preset));
  const empty = { ...createDefaultStage('USPSA'), objects: [] }, ids = { target: 'T', layer: 'L', cover: 'C' };
  const place = partial => P.placePartial(empty, uspsa.id, partial, at(200, 100), ids);
  let r = place({ kind: 'cover', preset: 'headOnly' });
  const base = r.stage.objects.find(o => o.id === 'T');
  assert.deepEqual(base.hardCover, [L.hardCoverFromPreset('headOnly', uspsa.width, uspsa.height, 'C')]);
  assert.ok(L.exposure(r.stage, base).fraction < 0.2, 'only the head is open');
  r = place({ kind: 'half', preset: 'upper' });
  assert.deepEqual(r.stage.objects.find(o => o.id === 'T').faceCut, { kind: 'preset', preset: 'upper' });
  r = place({ kind: 'hostage' });
  const hostage = r.stage.objects.find(o => o.id === 'L');
  assert.equal(hostage.type, 'noShootTarget'); assert.equal(hostage.attachment.parentId, 'T'); assert.equal(hostage.attachment.front, true);
  r = place({ kind: 'doubles' });
  const double = r.stage.objects.find(o => o.id === 'L');
  assert.equal(double.type, 'cardboardTarget'); assert.equal(double.attachment.parentId, 'T'); assert.equal(double.attachment.front, false);
  assert.ok(P.placePartial(empty, uspsa.id, { kind: 'hostage' }, at(-5, 100), ids).error, 'outside the bay is refused, as for any target');
  assert.equal(P.placePartial(empty, uspsa.id, { kind: 'hostage' }, at(-5, 100), ids).stage, empty, 'and nothing changes');
  assert.equal(P.partialLabel({ kind: 'half', preset: 'left' }), 'LEFT PORTION'); assert.equal(P.partialLabel({ kind: 'cover', preset: 'centreStrip' }), 'CENTRE STRIP');
});

test('the ADD ring: PARTIAL with its own pictures and cards, START gone; placing one sets its cover and selects it', () => {
  const props = { at: { x: 180, y: 300 }, bounds: { width: 390, height: 640 }, targetFamily: 'USPSA', chosen: [] };
  props.onChoose = c => props.chosen.push(c); props.onClose = () => {};
  const ring = harness('editor/RadialAddMenu.tsx', props, { 'expo-image': { Image: 'Image' } });
  const labels = () => ring.nodes().filter(n => n.type === 'Text').map(n => n.props.children);
  for (const label of ['PAPER', 'PARTIAL', 'NO-SHOOT', 'POPPERS', 'PLATES', 'WALL', 'FAULT LINE']) assert.ok(labels().includes(label), label);
  assert.ok(!labels().includes('START'), 'START left the ring (tap the start on the stage)');
  ring.press('partial targets: hard cover, half targets, hostage, doubles');
  const items = ring.nodes().filter(n => n.props?.accessibilityHint === 'Long-press for size and source');
  assert.equal(items.length, 11);
  const arts = items.map(i => tree(i.props.children).find(n => n.type === 'Image').props.source.uri);
  assert.equal(new Set(arts).size, 11, 'each choice has its own picture');
  const svg = uri => Buffer.from(uri.split(',')[1], 'base64').toString();
  assert.match(svg(arts[0]), /fill="#141414"/, 'HEAD ONLY is drawn with its paint');
  items[0].props.onLongPress(); ring.render();
  const card = ring.find(n => n.type === 'TargetInfoCard' || (typeof n.type === 'function' && n.type.name === 'TargetInfoCard')).props;
  assert.equal(card.partial.label, 'HEAD ONLY'); assert.equal(card.preset.id, 'uspsa-metric-chl-v1', 'the card names the paper target, its size and source');
  card.onPlace(); assert.deepEqual(props.chosen.at(-1), { kind: 'partial', presetId: 'uspsa-metric-chl-v1', partial: { kind: 'cover', preset: 'headOnly' } });
  items[9].props.onPress(); assert.deepEqual(props.chosen.at(-1).partial, { kind: 'hostage' });
  // PCSL: no hard cover in its ring.
  const pcsl = harness('editor/RadialAddMenu.tsx', { ...props, targetFamily: 'PCSL' }, { 'expo-image': { Image: 'Image' } });
  pcsl.press('partial targets: hard cover, half targets, hostage, doubles');
  assert.equal(pcsl.nodes().filter(n => n.props?.accessibilityHint === 'Long-press for size and source').length, 6);
  // In the editor: placing a partial target sets its cover; afterwards it is an ordinary target (LAYERS).
  const h = editor();
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'partial', presetId: 'uspsa-metric-chl-v1', partial: { kind: 'cover', preset: 'topOpen' } }); h.render();
  assert.deepEqual([h.child('ModeChip').title, h.child('ModeChip').detail], ['TAP TO PLACE', 'TOP OPEN · USPSA TARGET (CHL)']);
  h.child('StageViewport').onPlace(at(150, 120)); h.render();
  const placed = objects(h).find(o => o.id === h.child('StageViewport').selectedId);
  assert.equal(placed.hardCover[0].preset, 'topOpen');
  h.press('DONE'); h.press('LAYERS'); assert.equal(h.child('LayerPanel').selectedId, placed.id);
  closeSheet(h);
  h.press('Undo'); assert.ok(!objects(h).some(o => o.id === placed.id), 'one undo takes the whole covered target back');
  // A hostage from press and hold: the target and its no-shoot, the target selected.
  h.child('StageViewport').onLongPress(at(220, 120), { x: 100, y: 100 }); h.render();
  h.child('RadialAddMenu').onChoose({ kind: 'partial', presetId: 'uspsa-metric-chl-v1', partial: { kind: 'hostage' } }); h.render();
  const hostageBase = objects(h).find(o => o.id === h.child('StageViewport').selectedId);
  assert.equal(L.layersOf(h.child('StageViewport').stage, hostageBase.id)[0].type, 'noShootTarget');
});

test('face cuts live in LAYERS; EDIT keeps position, size and rotation', () => {
  assert.doesNotMatch(src('editor/ObjectInspector.tsx'), /facePresets|Face cuts/, 'EDIT has no face cuts');
  const base = { ...createDefaultStage('USPSA'), objects: [] };
  const props = { stage: placeTarget(base, 'uspsa-metric-chl-v1', 'T', at(200, 100)).stage, selectedId: 'T', removed: [] };
  props.setStage = next => { props.stage = next; }; props.onSelect = id => { props.selectedId = id; }; props.onRemoved = t => props.removed.push(t);
  const h = harness('editor/LayerPanel.tsx', props, { 'expo-image': { Image: 'Image' } });
  assert.ok(h.nodes().some(n => n.props?.title === '✓ FULL'));
  h.press('Face cut: upper portion'); h.render();
  assert.deepEqual(props.stage.objects[0].faceCut, { kind: 'preset', preset: 'upper' });
  assert.ok(h.nodes().some(n => n.props?.title === '✓ UPPER PORTION'));
  // Removing paint or a layer happens at once and offers UNDO.
  h.press('HEAD ONLY'); h.press('REMOVE PAINT'); assert.deepEqual(props.removed, ['Removed paint']);
  h.press('NO-SHOOT (HOSTAGE)'); h.render(); h.press('REMOVE LAYER'); assert.deepEqual(props.removed, ['Removed paint', 'Removed no-shoot layer']);
});

test('mode chip: every mode that changes what a tap does says so on the canvas, with DONE', () => {
  const h = editor();
  assert.equal(h.nodes().find(n => n.type === 'ModeChip'), undefined, 'no chip while a tap selects');
  const chip = () => h.child('ModeChip');
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'target', presetId: 'uspsa-metric-chl-v1', noShoot: true }); h.render();
  assert.deepEqual([chip().title, chip().detail], ['TAP TO PLACE', 'NO-SHOOT · USPSA TARGET (CHL)']);
  assert.ok(!h.nodes().some(n => n.props?.accessibilityLabel === 'View'), 'the chip takes the view switch\'s place');
  h.press('DONE');
  h.press('ADD'); h.child('RadialAddMenu').onChoose({ kind: 'tool', tool: 'faultLine' }); h.render();
  assert.deepEqual([chip().title, chip().detail], ['TAP WHERE IT STARTS', 'FAULT LINE']);
  h.child('StageViewport').onDraw('start', at(100, 100)); h.render(); h.child('StageViewport').onDraw('preview', at(136, 100)); h.render();
  assert.equal(chip().title, 'TAP OR DRAG TO THE END'); assert.match(chip().detail, /^FAULT LINE · [\d.]+ yd · 0\.0°$/, 'length and angle while drawing');
  assert.deepEqual(toolBar(h), ['ADD', 'SNAP ON', 'CANCEL DRAFT']);
  h.press('DONE');
  h.press('PLAN');
  h.press('AREAS'); assert.equal(chip().title, 'TAP AN AREA TO SELECT IT');
  h.press('NEW AREA'); assert.equal(chip().title, 'TAP THE NEXT CORNER'); assert.equal(chip().action.props.disabled, true, 'finish or cancel the new area first');
  h.press('Cancel the new area'); chip().action.props.onPress(); h.render();
  assert.equal(h.child('StageViewport').onAreaPoint, undefined, 'DONE left AREAS');
  for (const [tool, title] of [['PATH', 'TAP A POSITION TO SELECT IT'], ['ENGAGE', 'DRAG FROM A POSITION TO A TARGET'], ['REVIEW', 'TAP A TARGET TO REVIEW IT']]) {
    h.press('ROUTE'); h.press(tool); assert.equal(chip().title, title, tool);
    if (tool === 'PATH') { h.press('ADD POSITION'); assert.equal(chip().title, 'TAP TO ADD A POSITION'); chip().action.props.onPress(); h.render(); assert.equal(chip().title, 'TAP A POSITION TO SELECT IT', 'DONE leaves adding, then PATH'); }
    chip().action.props.onPress(); h.render();
    assert.equal(h.nodes().find(n => n.type === 'ModeChip'), undefined, tool + ' ended');
  }
  // Choosing a position's targets by tapping them is a mode too.
  const route = { ...createRoute('r'), positions: [{ id: 'p', label: 'P1', position: at(100, 300), visibleTargetIds: [], engagedTargetIds: [] }] };
  const g = editor(route); g.press('PLAN'); g.child('StageViewport').routePlanning.onSelect('p'); g.render();
  g.press('Position 1'); g.press('TARGETS'); g.child('RoutePanel').onAssign('engaged'); g.render();
  assert.deepEqual([g.child('ModeChip').title, g.child('ModeChip').detail], ['TAP TARGETS TO TOGGLE THEM', 'P1 · ENGAGED TARGETS']);
  assert.deepEqual(toolBar(g), ['VISIBLE TARGETS', 'ENGAGED TARGETS']);
  g.child('ModeChip').action.props.onPress(); g.render(); assert.equal(g.child('StageViewport').routePlanning.assignmentMode, null);
});

test('one selection bar for 2D and 3D: EDIT, ROTATE ↺ ↻, LAYERS, DUPLICATE, DELETE; height −/+ inside EDIT', () => {
  const h = editor(), paper = firstPaper(h), wall = objects(h).find(o => o.type === 'wall');
  const bar = () => { const b = h.child('SelectionBar'); return { title: b.title, tools: [...titlesIn(b.action), ...titlesIn(b.children)] }; };
  select(h, paper.id);
  const flat = bar();
  assert.deepEqual(flat.tools, ['↺', '↻', '✕', 'EDIT', 'LAYERS', 'DUPLICATE', 'DELETE']);
  h.press('3D view'); h.child('Stage3DView').onSelect(paper.id); h.render();
  assert.deepEqual(bar(), flat, 'identical in 3D');
  for (const gone of ['ENDPOINTS', 'SELECT', 'LAYER', 'DRAG TO MOVE']) assert.ok(!h.nodes().some(n => n.props?.title === gone), gone + ' is gone');
  h.press('Rotate right'); assert.equal(objects(h).find(o => o.id === paper.id).rotation, (paper.rotation + 15) % 360);
  // Height is in EDIT for both views: a wall in 6 in steps, a target's bottom edge in 3 in steps.
  h.press('Plan view'); select(h, wall.id);
  assert.deepEqual(bar().tools, ['↺', '↻', '✕', 'EDIT', 'DUPLICATE', 'DELETE'], 'no LAYERS on a wall');
  h.press('EDIT'); h.press('Raise the wall');
  assert.equal(objects(h).find(o => o.id === wall.id).geometry.height, wall.geometry.height + 6);
  assert.ok(tree(sheet(h).props.children).some(n => n.props?.accessibilityLabel === 'Wall height' && n.props.children === require('../src/stage/measurements.ts').formatYards(wall.geometry.height + 6)), 'yards on the stage');
  closeSheet(h);
  h.press('3D view'); h.child('Stage3DView').onSelect(paper.id); h.render();
  h.press('EDIT'); h.press('Lower the target');
  assert.equal(objects(h).find(o => o.id === paper.id).position.z, Math.max(0, paper.position.z - 3));
  // A layer (hostage, double): LAYERS, BASE TARGET, DELETE, the same in both views.
  closeSheet(h); h.press('Plan view');
  const layered = L.addLayer(h.child('StageViewport').stage, paper.id, 'noShoot', 'layer-1').stage;
  h.child('StageViewport').setStage(layered); h.render(); select(h, 'layer-1');
  assert.deepEqual(bar().tools, ['✕', 'LAYERS', 'BASE TARGET', 'DELETE']);
  h.press('3D view'); h.child('Stage3DView').onSelect('layer-1'); h.render();
  assert.deepEqual(bar().tools, ['✕', 'LAYERS', 'BASE TARGET', 'DELETE']);
});

test('••• holds only the step\'s settings; an item opens with ‹ BACK to •••; undo, zoom and views are in no •••', () => {
  const h = editor();
  h.press('Build settings');
  assert.equal(sheet(h).props.title, 'Build settings');
  assert.deepEqual(sheetTitles(h), ['STAGE SIZE', 'GRID AND SNAP', 'RESET STAGE'], 'stage size and downrange, grid and snap, reset (drawing opacity once a drawing is imported)');
  h.press('Grid and snap');
  assert.equal(sheet(h).props.title, 'Grid and snap'); assert.equal(sheet(h).props.back.label, 'Back to build settings');
  sheet(h).props.back.onPress(); h.render();
  assert.equal(sheet(h).props.title, 'Build settings', 'Back returns to •••');
  h.press('Stage size'); assert.ok(sheet(h).props.back); closeSheet(h);
  // A drawing under the plan adds DRAWING OPACITY.
  h.press('IMPORT'); h.child('DiagramImportScreen').onBackdrop({ uri: 'data:', left: 0, top: 0, width: 100, height: 100 }); h.child('DiagramImportScreen').close(); h.render();
  h.press('Build settings'); assert.deepEqual(sheetTitles(h), ['STAGE SIZE', 'GRID AND SNAP', 'DRAWING OPACITY', 'RESET STAGE']);
  h.press('Drawing opacity'); const seg = tree(sheet(h).props.children).find(n => n.type === 'Segmented');
  seg.props.onChange('STRONG'); h.render(); assert.equal(h.child('StageViewport').backdrop.opacity, 0.85);
  closeSheet(h);
  // PLAN keeps today's items (Phase 3 reorganises them), minus BUILD's and minus zoom.
  h.press('PLAN'); h.press('Plan settings');
  assert.deepEqual(sheetTitles(h), ['ASK ROUTE AI', 'ROUTE SETTINGS', 'LOADOUT', 'TARGET ROUNDS', 'ROUTE LAYERS', 'MOVEMENT-ONLY OPTIMIZER (OLDER)', 'RESET ROUTE']);
  h.press('Loadout'); assert.equal(sheet(h).props.back.label, 'Back to plan settings');
  assert.ok(!sheetTitles(h).includes('BACK TO PLAN ROUTE'), 'no "Back to plan route" when opened from •••');
  sheet(h).props.back.onPress(); h.render(); h.press('Route settings');
  h.child('EngagementSettings').onCancel(); h.render(); assert.equal(sheet(h).props.title, 'Plan settings', 'Route settings returns to •••');
  closeSheet(h);
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /Zoom (in|out)|stage-zoom|View settings/, 'zoom and view settings left •••');
  // WALK's ••• is the legend for the status words (EyeLevelView, in its tool bar).
  const eye = fs.readFileSync(path.join(__dirname, '../src/stage3d/EyeLevelView.tsx'), 'utf8');
  assert.match(eye, /words\.settings\.walk, legend \? '×' : words\.tools\.more/); assert.equal(W.words.settings.walk, 'What the status words mean'); assert.equal(W.words.tools.more, '•••');
});

test('the kit\'s buttons replace the editor\'s private Button; one family picker in the ring', () => {
  const builder = src('editor/StageBuilder.tsx');
  assert.doesNotMatch(builder, /function Button\(/, 'no private Button');
  assert.doesNotMatch(builder, /borders\.regular|fontSize: 16/, 'none of its private styles');
  assert.match(builder, /import \{ Action, Copy, ErrorState, Panel, Segmented, ToolButton, ui \} from '@\/ui\/kit'/);
  for (const file of ['editor/StepBar.tsx', 'editor/ToolBar.tsx', 'editor/SelectionBar.tsx', 'editor/ModeChip.tsx', 'editor/UndoBar.tsx', 'editor/EditorHeader.tsx']) {
    assert.doesNotMatch(src(file), /StyleSheet\.create|['"]#[0-9A-Fa-f]{3,8}['"]/, file + ' takes its colours from the theme');
  }
  const h = editor();
  const bars = ['EditorHeader', 'StepBar', 'ToolBar'].flatMap(t => tree(h.find(n => n.type === t)));
  assert.ok(bars.filter(n => n.props?.onPress).every(n => n.type === 'ToolButton' || n.type === 'Pressable'), 'bars use ToolButton (the name is a Pressable)');
  // The ring picks a family with the kit's one picker (Segmented over every family, so IDPA targets stay available).
  assert.match(src('editor/RadialAddMenu.tsx'), /<Segmented options=\{targetFamilies\}/);
  assert.doesNotMatch(src('editor/RadialAddMenu.tsx'), /accessibilityRole="radio"/);
  // The kit's ToolButton keeps its plain look for existing callers (diagram import) unless a bar asks for more.
  const kit = harness('ui/kit.tsx', { title: 'HALF-SIZE USPSA TARGET (CHL)', onPress() {} }, {}, 'ToolButton').render();
  const style = kit.props.style({ pressed: false });
  assert.equal(style[1], false, 'no bar layout'); assert.equal(kit.props.children[0].props.numberOfLines, undefined, 'long names still wrap');
});

test('undo instead of confirm: DELETE and RESET STAGE act at once and offer "Deleted T1 · UNDO"', () => {
  const h = editor(), paper = firstPaper(h), count = objects(h).length;
  select(h, paper.id); h.press('DELETE');
  assert.equal(objects(h).length, count - 1, 'deleted at once, no confirmation');
  assert.ok(!h.nodes().some(n => n.type === 'EditorSheet' && n.props.visible), 'no confirmation sheet');
  const note = h.child('UndoBar');
  assert.equal(note.text, 'Deleted T1'); assert.equal(note.text, W.deletedText('T1'));
  assert.equal(note.action.props.title, 'UNDO');
  note.action.props.onPress(); h.render();
  assert.equal(objects(h).length, count); assert.ok(objects(h).some(o => o.id === paper.id), 'UNDO brings it back');
  assert.equal(h.nodes().find(n => n.type === 'UndoBar'), undefined, 'and the bar goes');
  // A wall is named by its type; the bar goes as soon as anything else changes.
  const wall = objects(h).find(o => o.type === 'wall');
  select(h, wall.id); h.press('DELETE'); assert.equal(h.child('UndoBar').text, 'Deleted wall');
  select(h, paper.id); h.press('DUPLICATE');
  assert.equal(h.nodes().find(n => n.type === 'UndoBar'), undefined, 'a later edit retires the note');
  // RESET STAGE: no confirmation; the route goes too, and one UNDO restores both.
  const route = { ...createRoute('r'), positions: [{ id: 'p', label: 'P1', position: at(100, 300), visibleTargetIds: [], engagedTargetIds: [] }] };
  const g = editor(route), before = objects(g).length;
  g.child('StageViewport').setStage(s => ({ ...s, objects: [...s.objects, createObject('steelPlate', 'extra', 50, 50)] })); g.render();
  g.press('Build settings'); g.press('Reset stage');
  assert.equal(objects(g).length, before, 'the default layout'); assert.equal(g.child('StageViewport').routePlanning, undefined, 'the route is cleared');
  assert.ok(!g.nodes().some(n => n.type === 'EditorSheet' && n.props.visible));
  assert.equal(g.child('UndoBar').text, 'Stage reset');
  g.child('UndoBar').action.props.onPress(); g.render();
  assert.ok(objects(g).some(o => o.id === 'extra')); assert.equal(g.child('StageViewport').routePlanning.route.positions[0].id, 'p');
  assert.doesNotMatch(src('editor/StageBuilder.tsx'), /Delete this object and its planning references|Restore the default layout\?/, 'the old confirmations are gone');
});

test('undo instead of confirm inside sheets: removed layers, paint and ports show the bar in the sheet', () => {
  const h = editor(), paper = firstPaper(h);
  select(h, paper.id); h.press('LAYERS');
  const panel = h.child('LayerPanel');
  panel.setStage(L.setHardCover(panel.stage, paper.id, () => [L.hardCoverFromPreset('topOpen', 18, 30, 'c')])); h.render();
  h.child('LayerPanel').setStage(L.setHardCover(h.child('LayerPanel').stage, paper.id, () => [])); h.child('LayerPanel').onRemoved('Removed paint'); h.render();
  const footer = sheet(h).props.footer;
  assert.equal(footer.type, 'UndoBar'); assert.equal(footer.props.text, 'Removed paint'); assert.equal(footer.props.docked, false);
  footer.props.action.props.onPress(); h.render();
  assert.equal(objects(h).find(o => o.id === paper.id).hardCover[0].preset, 'topOpen', 'UNDO puts the paint back');
  // Ports: REMOVE PORT has no confirmation and reports the removal.
  const wall = { ...createObject('wall', 'w', 100, 100), ports: [] };
  const { createPort } = require('../src/stage/ports.ts');
  wall.ports = [createPort(wall.geometry, 'port-1')];
  const removed = [], edits = [];
  const ports = harness('editor/WallPortsInspector.tsx', { wall, disabled: false, onApply: e => { edits.push(e); return null; }, onRemoved: t => removed.push(t) });
  ports.find(n => n.type === 'Pressable' && n.props.accessibilityState && 'selected' in n.props.accessibilityState).props.onPress(); ports.render();
  ports.press('REMOVE PORT');
  assert.deepEqual(edits.at(-1), { ports: [] }); assert.deepEqual(removed, ['Removed port 1']);
  // EDIT passes the editor's note on to the ports.
  const onRemoved = () => {};
  const inspector = harness('editor/ObjectInspector.tsx', { item: wall, disabled: false, onApply: () => null, onRemoved });
  inspector.find(n => n.props?.accessibilityState?.expanded === false && /PORTS/.test(JSON.stringify(n.props.children))).props.onPress(); inspector.render();
  assert.equal(inspector.child('WallPortsInspector').onRemoved, onRemoved);
});
