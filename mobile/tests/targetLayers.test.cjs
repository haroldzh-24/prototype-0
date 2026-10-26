// Target layers: painted hard cover, hostage no-shoots and doubles stacked on a paper target (src/stage/targetLayers.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const L = require('../src/stage/targetLayers.ts');
const { createDefaultStage, createObject } = require('../src/stage/defaults.ts');
const { placeTarget } = require('../src/stage/targetPlacement.ts');
const { checkStage } = require('../src/rules/stageCheck.ts');
const { defaultEngagementRules } = require('../src/planning/engagements.ts');
const { planRoute } = require('../src/planning/v2/index.ts');
const { targetFace } = require('../src/planning/v2/normalizeStage.ts');
const { applyObjectAction } = require('../src/editor/objectActions.ts');
const near = (a, b, e = 1e-6, m = '') => assert.ok(Math.abs(a - b) <= e, `${m} ${a} != ${b}`);
const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
const W = 18.12, H = 29.93;

function stageWith(...presets) {
  let stage = { ...createDefaultStage('USPSA', { size: { width: 720, depth: 720 } }), objects: [createObject('start', 'start', 360, 700)] };
  presets.forEach(([preset, id, x], i) => { const r = placeTarget(stage, preset, id, { space: 'stage', x, y: 100, z: 0 }); assert.ok(!r.error, r.error); stage = r.stage; });
  return stage;
}
const get = (stage, id) => stage.objects.find(o => o.id === id);

test('the five painted versions: which part of a USPSA Target is black', () => {
  const m = L.faceLandmarks(W, H), cover = p => L.hardCoverFromPreset(p, W, H, 'c');
  const head = cover('headOnly');
  assert.ok(!L.painted(head, { x: 0, y: m.neck + 1 }) && L.painted(head, { x: 0, y: 0 }), 'head open, body painted');
  const top = cover('topOpen');
  assert.ok(!L.painted(top, { x: 0, y: 3 }) && L.painted(top, { x: 0, y: -3 }));
  const tl = cover('diagonalTopLeft'), tr = cover('diagonalTopRight');
  assert.ok(!L.painted(tl, { x: -7, y: 8 }) && L.painted(tl, { x: 7, y: -12 }), 'open top-left, painted bottom-right');
  assert.ok(!L.painted(tr, { x: 7, y: 8 }) && L.painted(tr, { x: -7, y: -12 }), 'mirror image');
  assert.ok(L.painted(tl, { x: 8.9, y: m.shoulders - 0.5 }) && !L.painted(tl, { x: -8.9, y: m.bottom + 0.5 }), 'the line runs from the right shoulder to the bottom-left corner');
  const strip = cover('centreStrip');
  assert.ok(!L.painted(strip, { x: 0, y: -12 }) && !L.painted(strip, { x: 2.5, y: 5 }) && L.painted(strip, { x: 8, y: 0 }) && L.painted(strip, { x: -8, y: 0 }));
  near(strip.width, 2 * 0.17 * W, 1e-9, 'a head-wide strip');
});

test('painted areas, open area and the planner extent', () => {
  let stage = stageWith(['uspsa-metric-chl-v1', 'T', 300]);
  const target = get(stage, 'T'), outline = L.faceOutline(target), full = area(outline);
  for (const preset of ['headOnly', 'topOpen', 'diagonalTopLeft', 'diagonalTopRight', 'centreStrip']) {
    const c = L.hardCoverFromPreset(preset, W, H, 'c'), paintedArea = L.coverPolygons(c, outline).reduce((s, p) => s + area(p), 0);
    const open = L.exposure(L.setHardCover(stage, 'T', () => [c]), get(L.setHardCover(stage, 'T', () => [c]), 'T')).fraction;
    near(open, 1 - paintedArea / full, 0.03, preset + ': sampled open share matches the painted polygons');
  }
  stage = L.setHardCover(stage, 'T', () => [L.hardCoverFromPreset('headOnly', W, H, 'c')]);
  const e = L.exposure(stage, get(stage, 'T'));
  assert.ok(e.fraction > 0.08 && e.fraction < 0.2, 'the head is a small share: ' + e.fraction);
  near(e.extent.left, -0.17 * W, 0.6); near(e.extent.right, 0.17 * W, 0.6); near(e.extent.bottom, 0.8 * H, 0.6); near(e.extent.top, H, 1e-6);
  const face = targetFace(get(stage, 'T'), stage);
  near(face.bottom - get(stage, 'T').position.z, 0.8 * H, 0.6, 'the planner aims at the open head'); near(Math.hypot(face.right.x - face.left.x, face.right.y - face.left.y), 0.34 * W, 1.2);
  assert.equal(L.setHardCover(stage, 'T', () => []).objects.find(o => o.id === 'T').hardCover, undefined, 'removing the last paint clears the field');
});

test('a hostage no-shoot stays on its target: offset, uprange side, follows moves and turns, removed with it', () => {
  let stage = stageWith(['uspsa-metric-chl-v1', 'T', 300]);
  const added = L.addLayer(stage, 'T', 'noShoot', 'N'); assert.ok(!added.error); stage = added.stage;
  const t = get(stage, 'T'), n = get(stage, 'N');
  assert.equal(n.type, 'noShootTarget'); assert.equal(n.presetId, 'uspsa-metric-chl-v1'); assert.equal(n.attachment.front, true);
  near(n.position.x, t.position.x - 0.55 * W, 1e-9); near(n.position.y, t.position.y + L.LAYER_GAP, 1e-9, 'half an inch uprange (downrange is up the screen)');
  near(n.position.z + H / 2, t.position.z + H / 2 - 0.15 * H, 1e-9, 'centre 15% of the height lower');
  assert.ok(stage.objects.findIndex(o => o.id === 'N') === stage.objects.findIndex(o => o.id === 'T') + 1, 'drawn over its target');
  // Moving and turning the target carries the layer.
  stage = L.syncLayers({ ...stage, objects: stage.objects.map(o => o.id === 'T' ? { ...o, position: { ...o.position, x: 400 }, rotation: 90 } : o) });
  const n2 = get(stage, 'N');
  near(Math.abs(n2.position.x - 400), L.LAYER_GAP, 1e-9, 'edge-on to downrange: either side'); near(n2.position.y, 100 - 0.55 * W, 1e-9); assert.equal(n2.rotation, 90);
  assert.equal(L.syncLayers(stage), stage, 'nothing to change: same document');
  // Behind: drawn under its target; removed when the target goes.
  stage = L.updateAttachment(stage, 'N', a => ({ ...a, front: false }));
  assert.ok(stage.objects.findIndex(o => o.id === 'N') < stage.objects.findIndex(o => o.id === 'T'));
  assert.ok(!L.syncLayers({ ...stage, objects: stage.objects.filter(o => o.id !== 'T') }).objects.some(o => o.id === 'N'));
  assert.match(L.addLayer(stage, 'N', 'target', 'X').error, /target underneath/, 'one level of layers');
});

test('sliding snaps edges to the head, shoulders and centre; rolling in 5 degree steps', () => {
  let stage = stageWith(['uspsa-metric-chl-v1', 'T', 300]);
  stage = L.addLayer(stage, 'T', 'noShoot', 'N').stage;
  const m = L.faceLandmarks(W, H), t = get(stage, 'T');
  // Put the no-shoot's top edge 0.5 in below the target's shoulder line, then slide up 1 in: it lands on the shoulder line, not 0.5 in above it.
  let a = { ...get(stage, 'N').attachment, offset: { x: 0, y: m.shoulders - H / 2 - 0.5 } };
  a = L.slideLayer(t, get(stage, 'N'), a, 0, 1);
  near(a.offset.y + H / 2, m.shoulders, 1e-9, 'the top edge lands on the shoulder line');
  a = L.slideLayer(t, get(stage, 'N'), { ...a, offset: { x: -0.4, y: 0 } }, 0.3, 0); near(a.offset.x, 0, 1e-9, 'centred');
  assert.equal(L.rollLayer({ roll: 0 }, -5).roll, -5); assert.equal(L.rollLayer({ roll: 178 }, 5).roll, -175);
  const c = L.hardCoverFromPreset('topOpen', W, H, 'c');
  near(L.slideCoverSnapped({ ...c, at: { x: 0, y: m.shoulders - 1.2 } }, 1, W, H).at.y, m.shoulders, 1e-9, 'paint edge snaps to the shoulders');
  assert.equal(L.rollCover(c, 5).angle, 5);
});

test('the planner aims past a hostage on its own target but still respects separate no-shoots and full cover', () => {
  const rules = stage => ({ stage, ruleset: 'USPSA', firingAreas: [{ id: 'A', vertices: [{ x: 250, y: 500 }, { x: 350, y: 500 }, { x: 350, y: 560 }, { x: 250, y: 560 }] }], targetProcedures: {} });
  const plan = stage => planRoute(rules(stage), { candidateSpacingInches: 12 });
  let stage = stageWith(['uspsa-metric-chl-v1', 'T', 300]);
  // A hostage covering the middle of the target: the target is still engaged (the open area is beside it).
  stage = L.addLayer(stage, 'T', 'noShoot', 'N').stage;
  stage = L.updateAttachment(stage, 'N', a => ({ ...a, offset: { x: -6, y: 0 } }));
  assert.equal(plan(stage).status, 'complete');
  const face = targetFace(get(stage, 'T'), stage);
  assert.equal(face.stack, 'T'); assert.ok(face.openFraction > 0.2 && face.openFraction < 0.9);
  // Painted head-only and a no-shoot over the head as well: nothing left to shoot.
  stage = L.setHardCover(stage, 'T', () => [L.hardCoverFromPreset('headOnly', W, H, 'c')]);
  stage = L.updateAttachment(stage, 'N', a => ({ ...a, offset: { x: 0, y: 8 } }));
  assert.equal(L.exposure(stage, get(stage, 'T')).fraction, 0);
  assert.equal(plan(stage).status, 'infeasible');
  assert.ok(checkStage(stage, undefined, 'USPSA').some(f => f.code === 'TARGET_COVERED'));
});

test('stage check: partly covered targets, half-size on a full-size no-shoot, PCSL target mixing', () => {
  let stage = stageWith(['uspsa-half-chl-v1', 'H', 300], ['uspsa-metric-chl-v1', 'F', 400]);
  // A full-size no-shoot stacked with a half-size target.
  stage = L.addLayer(stage, 'F', 'noShoot', 'NS').stage;
  stage = { ...stage, objects: stage.objects.map(o => o.id === 'NS' ? { ...o, attachment: { ...o.attachment, parentId: 'H', offset: { x: 12, y: 0 } } } : o) };
  stage = L.syncLayers(stage);
  const codes = checkStage(stage, undefined, 'USPSA').map(f => f.code);
  assert.ok(codes.includes('USPSA_HALF_ON_FULL_NO_SHOOT') && codes.includes('USPSA_HALF_A_ZONE') && codes.includes('TARGET_PARTLY_COVERED'));
  let pcsl = { ...createDefaultStage('PCSL', { size: { width: 720, depth: 720 } }), objects: [createObject('start', 'start', 360, 700)] };
  for (const [preset, id, x] of [['pcsl-practical-2025-v1', 'P', 200], ['pcsl-competition-2025-v1', 'C', 400], ['pcsl-mini-practical-2025-v1', 'M', 500]])
    pcsl = placeTarget(pcsl, preset, id, { space: 'stage', x, y: 100, z: 0 }).stage;
  const mix = checkStage(pcsl, undefined, 'PCSL');
  assert.ok(mix.some(f => f.code === 'PCSL_PRACTICAL_COMPETITION' && f.rule === 'PCSL 9.2.2.1'));
  pcsl = placeTarget({ ...pcsl, objects: pcsl.objects.filter(o => o.id !== 'C') }, 'pcsl-k-zone-legacy-v1', 'K', { space: 'stage', x: 600, y: 100, z: 0 }).stage;
  assert.ok(checkStage(pcsl, undefined, 'PCSL').some(f => f.code === 'PCSL_KZONE_PRACTICAL'));
  assert.ok(!checkStage(pcsl, undefined, 'USPSA').some(f => f.code.startsWith('PCSL_')), 'PCSL rules only for PCSL');
});

test('duplicating a target copies its layers onto the copy', () => {
  let stage = stageWith(['uspsa-metric-chl-v1', 'T', 300]);
  stage = L.addLayer(stage, 'T', 'noShoot', 'N').stage;
  stage = L.setHardCover(stage, 'T', () => [L.hardCoverFromPreset('topOpen', W, H, 'c')]);
  let n = 0;
  const result = applyObjectAction(stage, 'T', { kind: 'duplicate' }, () => `uuid-${++n}`);
  const copy = result.stage.objects.find(o => o.id === result.selectedId);
  assert.equal(copy.hardCover.length, 1);
  const copyLayers = L.layersOf(result.stage, copy.id);
  assert.equal(copyLayers.length, 1); assert.notEqual(copyLayers[0].id, 'N');
  near(copyLayers[0].position.x, copy.position.x - 0.55 * W, 1e-9);
  assert.equal(L.layersOf(result.stage, 'T').length, 1, 'the original keeps its own');
});
